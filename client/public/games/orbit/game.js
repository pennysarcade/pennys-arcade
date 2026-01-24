// === ORBIT - Single Player Version ===
// A circular pong game with one human-controlled paddle

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Check for mobile - multiple detection methods for reliability
const urlParams = new URLSearchParams(window.location.search);
const isMobile = urlParams.get('mobile') === 'true' ||
  /Mobi|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
  ('ontouchstart' in window) ||
  (navigator.maxTouchPoints > 0);

// DOM elements
const scoreDisplay = document.getElementById('score');
const highScoreDisplay = document.getElementById('high-score');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreDisplay = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');
const ringSwitchBtn = document.getElementById('ring-switch-btn');
const infoBtn = document.getElementById('info-btn');
const infoPanel = document.getElementById('info-panel');
const infoCloseBtn = document.getElementById('info-close-btn');

// Game constants - adjusted for mobile
const ARENA_RADIUS_RATIO = isMobile ? 0.40 : 0.35; // Larger arena on mobile
const INNER_RING_RATIO = 0.82;
const PADDLE_ARC_BASE = isMobile ? 0.28 : 0.20; // Longer paddles on mobile
const PADDLE_THICKNESS = isMobile ? 20 : 18;
const PADDLE_SPEED = 4;
const PADDLE_ACCELERATION = 5;
const PADDLE_DECELERATION = 12;
const RING_SWITCH_DURATION = 0.25;
const BALL_RADIUS = 8;
const BALL_SPEED = 150;
const SPAWN_INTERVAL = 2000;

// Game state
let arenaRadius;
let innerRadius;
let centerX, centerY;
let paddleAngle = -Math.PI / 2;
let targetAngle = paddleAngle;
let paddleArc = PADDLE_ARC_BASE;
let targetPaddleArc = PADDLE_ARC_BASE;
let paddleVelocity = 0;

// Player scores
let playerScore = 0;

// AI Opponents
const AI_PADDLES = [
  {
    name: 'LENNIE',
    color: '#88ff88',
    angle: Math.PI / 6,  // 30 degrees
    velocity: 0,
    ring: 0,
    ringSwitchProgress: 0,
    ringSwitchFrom: 0,
    ringSwitchTo: 0,
    score: 0,
    // Lennie AI: slower reactions, doesn't chase everything
    reactionSpeed: 1.5,
    maxSpeed: 2.5,
    chaseThreshold: 0.6,  // Only chases balls within 60% of arena radius
    laziness: 0.3  // 30% chance to not react
  },
  {
    name: 'GEORGE',
    color: '#ff8888',
    angle: Math.PI - Math.PI / 6,  // 150 degrees
    velocity: 0,
    ring: 0,
    ringSwitchProgress: 0,
    ringSwitchFrom: 0,
    ringSwitchTo: 0,
    score: 0,
    // George AI: fast reactions, chases everything
    reactionSpeed: 4,
    maxSpeed: 5,
    chaseThreshold: 1.0,  // Chases all balls
    laziness: 0  // Never lazy
  }
];

// Dual ring system
let paddleRing = 0;
let ringSwitchProgress = 0;
let ringSwitchFrom = 0;
let ringSwitchTo = 0;
let ringSwitchStyle = 2;
let balls = [];
let powerups = [];
let score = 0;
let highScore = 0;
let gameRunning = false;
let lastTime = 0;
let spawnTimer = 0;
let gameTime = 0;
let lastScoreUpdateTime = 0;

// Special ball state
let specialBall = null;
let specialBallTimer = 0;
let specialBallActiveTime = 0;
let specialBallReadyToReturn = false;
let specialBallReturning = false;
let specialBallClaimTime = 0;
let specialBallForceCapture = false;

// Active power-up effects
let activePowerups = [];

// Constants for special ball
const SPECIAL_BALL_SPAWN_INTERVAL = 30;
const SPECIAL_BALL_ACTIVE_DURATION = 15;
const SPECIAL_BALL_RADIUS = 12;
const SPECIAL_BALL_RETURN_DISTANCE = 50;

// Ball spawn and aging
const BALL_SPAWN_DURATION = 0.4;
const BALL_MATURITY_TIME = 12;
const BALL_AGE_BONUS_MAX = 40;

// Power-ups
const POWERUP_SPAWN_CHANCE = 0.15;
const POWERUP_RADIUS = 10;
const POWERUP_TYPES = {
  GROW: { color: '#00ff00', duration: 10, arcBonus: 0.10, negative: false },
  SPEED: { color: '#00ffff', duration: 8, speedBonus: 2, negative: false },
  SLOW: { color: '#0088ff', duration: 6, ballSpeedMult: 0.5, negative: false },
  POINTS: { color: '#ff00ff', duration: 10, pointsMult: 2, negative: false },
  SHRINK: { color: '#ff8800', duration: 8, arcBonus: -0.06, negative: true },
  FAST: { color: '#ffff00', duration: 6, ballSpeedMult: 1.5, negative: true }
};

// Paddle animation
const PADDLE_ARC_LERP_SPEED = 4;

// Special ball mechanics
const SPECIAL_BALL_GRAVITY_RANGE = 0.7;
const SPECIAL_BALL_GRAVITY_STRENGTH = 120;
const SPECIAL_BALL_CLAIM_ZONE = 0.4;
const SPECIAL_BALL_CLAIM_TIME = 4;
const SPECIAL_BALL_CAPTURE_SPEED = 300;
const SPECIAL_BALL_SHRINK_START = 80;
const SPECIAL_BALL_CAPTURE_RADIUS = 15;

// Ball momentum
const BALL_MOMENTUM_BOOST = 1.8;
const BALL_MOMENTUM_DECAY = 0.3;

// Risky shot bonuses
const EDGE_HIT_BONUS = 15;
const SPEED_HIT_BONUS = 25;
const TRANSFER_HIT_BONUS = 20;
const TRANSFER_SPIN = 2.5;
const TRANSFER_SPEED_BOOST = 1.6;
const SPIN_DECAY_RATE = 0.25;

// === AUDIO SYSTEM ===
const AudioSystem = {
  ctx: null,
  masterGain: null,
  sfxGain: null,

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.4;
    this.masterGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.masterGain);
  },

  playPaddleHit(isEdgeHit = false, momentum = 1) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const baseFreq = isEdgeHit ? 600 : 440;
    const freq = baseFreq * (0.8 + momentum * 0.4);
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  },

  playSpecialHit(isEdgeHit = false, momentum = 1) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const baseFreq = isEdgeHit ? 300 : 220;
    const freq = baseFreq * (0.8 + momentum * 0.4);
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.3, this.ctx.currentTime + 0.2);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, this.ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(freq, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc2.start();
    osc.stop(this.ctx.currentTime + 0.25);
    osc2.stop(this.ctx.currentTime + 0.2);
  },

  playBallSpawn() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  },

  playSpecialSpawn() {
    if (!this.ctx) return;
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110 + i * 55, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.35);
      }, i * 100);
    }
  },

  playPowerupGood() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523, this.ctx.currentTime);
    osc.frequency.setValueAtTime(659, this.ctx.currentTime + 0.08);
    osc.frequency.setValueAtTime(784, this.ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.35);
  },

  playPowerupBad() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  },

  playReturnActivated() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.5);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.55);
  },

  playBallCaptured() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.35);
  },

  playGameOver() {
    if (!this.ctx) return;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(200 - i * 30, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.45);
      }, i * 120);
    }
  },

  playCombo(comboLevel) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const notes = [523, 659, 784, 1047, 1319];
    const freq = notes[Math.min(comboLevel, notes.length - 1)];
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 1.5, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc2.start();
    osc.stop(this.ctx.currentTime + 0.35);
    osc2.stop(this.ctx.currentTime + 0.35);
  },

  playBassHit(intensity = 1) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60 * intensity, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.4 * intensity, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  },

  playNearMiss(intensity) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    const freq = 200 + intensity * 400;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.3, this.ctx.currentTime + 0.15);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, this.ctx.currentTime);
    filter.Q.value = 2;
    gain.gain.setValueAtTime(0.15 * intensity, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  },

  playWaveWarning() {
    if (!this.ctx) return;
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, this.ctx.currentTime);
        osc.frequency.setValueAtTime(660, this.ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.12);
      }, i * 100);
    }
  },

  playRingSwitch() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.15);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(500, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  },

  playMilestone() {
    if (!this.ctx) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.25);
      }, i * 80);
    });
  },

  // Background music
  musicGain: null,
  musicPlaying: false,
  bassOsc: null,

  startMusic() {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.08;
    this.musicGain.connect(this.masterGain);
    this.bassOsc = this.ctx.createOscillator();
    const bassGain = this.ctx.createGain();
    const bassFilter = this.ctx.createBiquadFilter();
    this.bassOsc.type = 'sine';
    this.bassOsc.frequency.value = 55;
    bassFilter.type = 'lowpass';
    bassFilter.frequency.value = 200;
    bassGain.gain.value = 0.3;
    this.bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(this.musicGain);
    this.bassOsc.start();
  },

  stopMusic() {
    if (!this.musicPlaying) return;
    this.musicPlaying = false;
    if (this.bassOsc) {
      this.bassOsc.stop();
      this.bassOsc = null;
    }
    if (this.musicGain) {
      this.musicGain.disconnect();
      this.musicGain = null;
    }
  },

  setMusicIntensity(intensity) {
    if (!this.musicGain) return;
    this.musicGain.gain.setTargetAtTime(0.08 + intensity * 0.12, this.ctx.currentTime, 0.5);
  },

  // Clash audio - initial contact
  playClashStart() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  },

  // Clash audio - ongoing tension (grinding sound)
  clashTensionOsc: null,
  clashTensionGain: null,
  clashTensionFilter: null,

  playClashTension(intensity) {
    if (!this.ctx) return;

    // Create or update the tension oscillator
    if (!this.clashTensionOsc) {
      this.clashTensionOsc = this.ctx.createOscillator();
      this.clashTensionGain = this.ctx.createGain();
      this.clashTensionFilter = this.ctx.createBiquadFilter();

      this.clashTensionOsc.type = 'sawtooth';
      this.clashTensionOsc.frequency.value = 60;

      this.clashTensionFilter.type = 'lowpass';
      this.clashTensionFilter.frequency.value = 300;
      this.clashTensionFilter.Q.value = 5;

      this.clashTensionGain.gain.value = 0;

      this.clashTensionOsc.connect(this.clashTensionFilter);
      this.clashTensionFilter.connect(this.clashTensionGain);
      this.clashTensionGain.connect(this.sfxGain);
      this.clashTensionOsc.start();
    }

    // Modulate based on intensity
    const targetGain = intensity * 0.15;
    const targetFreq = 40 + intensity * 80;
    const targetFilterFreq = 200 + intensity * 600;

    this.clashTensionGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
    this.clashTensionOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.05);
    this.clashTensionFilter.frequency.setTargetAtTime(targetFilterFreq, this.ctx.currentTime, 0.05);
  },

  stopClashTension() {
    if (this.clashTensionGain) {
      this.clashTensionGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
  },

  // Clash audio - resolution (one paddle wins)
  playClashResolve(intensity) {
    if (!this.ctx) return;

    // Stop the tension sound
    this.stopClashTension();

    // Impact sound
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'square';
    osc.frequency.setValueAtTime(100 + intensity * 50, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.3);

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(200 + intensity * 100, this.ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.2);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.3 + intensity * 0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc2.start();
    osc.stop(this.ctx.currentTime + 0.35);
    osc2.stop(this.ctx.currentTime + 0.25);
  }
};

// === PARTICLE SYSTEM ===
const particles = [];
const MAX_PARTICLES = 200;

class Particle {
  constructor(x, y, vx, vy, color, size, life, type = 'circle') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.maxLife = life;
    this.life = life;
    this.type = type;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 10;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    this.rotation += this.rotationSpeed * dt;
    this.vx *= 0.98;
    this.vy *= 0.98;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    const size = this.size * (0.5 + alpha * 0.5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    if (this.type === 'square') {
      ctx.fillRect(-size / 2, -size / 2, size, size);
    } else if (this.type === 'star') {
      drawStar(ctx, 0, 0, 5, size, size / 2);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
  let rot = Math.PI / 2 * 3;
  let step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.fill();
}

function spawnParticles(x, y, count, color, speed = 200, size = 4, life = 0.5, type = 'circle') {
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const vel = speed * (0.5 + Math.random() * 0.5);
    particles.push(new Particle(x, y, Math.cos(angle) * vel, Math.sin(angle) * vel, color, size, life, type));
  }
}

function spawnExplosion(x, y, color = '#fff', intensity = 1) {
  const count = Math.floor(20 * intensity);
  const types = ['circle', 'square', 'star'];
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const vel = (150 + Math.random() * 200) * intensity;
    particles.push(new Particle(x, y, Math.cos(angle) * vel, Math.sin(angle) * vel, color, 3 + Math.random() * 5, 0.4 + Math.random() * 0.4, types[Math.floor(Math.random() * types.length)]));
  }
}

function spawnRingBurst(x, y, radius, color, count = 30) {
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = (i / count) * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    particles.push(new Particle(px, py, Math.cos(angle) * 100, Math.sin(angle) * 100, color, 4, 0.6, 'circle'));
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update(dt);
    if (particles[i].life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    p.draw(ctx);
  }
}

// === SCREEN SHAKE SYSTEM ===
let screenShake = { x: 0, y: 0, intensity: 0 };

function triggerScreenShake(intensity) {
  screenShake.intensity = Math.max(screenShake.intensity, intensity);
}

function updateScreenShake() {
  if (screenShake.intensity > 0) {
    screenShake.x = (Math.random() - 0.5) * screenShake.intensity * 2;
    screenShake.y = (Math.random() - 0.5) * screenShake.intensity * 2;
    screenShake.intensity *= 0.9;
    if (screenShake.intensity < 0.5) {
      screenShake.intensity = 0;
      screenShake.x = 0;
      screenShake.y = 0;
    }
  }
}

// === COMBO SYSTEM ===
let combo = 0;
let maxCombo = 0;
let lastHitTime = 0;
const COMBO_TIMEOUT = 3;
const COMBO_MILESTONES = [5, 10, 25, 50, 100];

function incrementCombo() {
  combo++;
  lastHitTime = gameTime;
  if (combo > maxCombo) maxCombo = combo;
  if (COMBO_MILESTONES.includes(combo)) {
    AudioSystem.playCombo(COMBO_MILESTONES.indexOf(combo));
    triggerScreenShake(5 + combo * 0.2);
    spawnRingBurst(centerX, centerY, arenaRadius * 0.3, getComboColor(), combo);
  }
}

function updateCombo(dt) {
  if (combo > 0 && gameTime - lastHitTime > COMBO_TIMEOUT) {
    combo = Math.max(0, combo - 1);
  }
}

function getComboMultiplier() {
  return 1 + combo * 0.1;
}

function getComboColor() {
  if (combo >= 50) return '#ff00ff';
  if (combo >= 25) return '#ff0088';
  if (combo >= 10) return '#ff8800';
  if (combo >= 5) return '#ffff00';
  return '#00ffff';
}

// === SCORE POPUP SYSTEM ===
const scorePopups = [];

class ScorePopup {
  constructor(x, y, text, color = '#fff') {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.life = 1;
    this.maxLife = 1;
    this.vy = -80;
  }

  update(dt) {
    this.y += this.vy * dt;
    this.vy *= 0.95;
    this.life -= dt;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    const scale = 0.8 + (1 - alpha) * 0.4;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${Math.floor(14 * scale)}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText(this.text, this.x + 2, this.y + 2);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

function spawnScorePopup(x, y, points, color = '#fff') {
  const text = points > 0 ? `+${points}` : `${points}`;
  scorePopups.push(new ScorePopup(x, y, text, color));
}

function updateScorePopups(dt) {
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    scorePopups[i].update(dt);
    if (scorePopups[i].life <= 0) {
      scorePopups.splice(i, 1);
    }
  }
}

function drawScorePopups() {
  for (const popup of scorePopups) {
    popup.draw(ctx);
  }
}

// === PADDLE TRAIL SYSTEM ===
const paddleTrail = [];
const MAX_TRAIL_LENGTH = 12;

function updatePaddleTrail() {
  const paddleRadius = getCurrentPaddleRadius();
  const px = centerX + Math.cos(paddleAngle) * paddleRadius;
  const py = centerY + Math.sin(paddleAngle) * paddleRadius;
  paddleTrail.unshift({ x: px, y: py, angle: paddleAngle, alpha: 1 });
  if (paddleTrail.length > MAX_TRAIL_LENGTH) {
    paddleTrail.pop();
  }
}

function drawPaddleTrail() {
  const paddleRadius = getCurrentPaddleRadius();
  for (let i = 1; i < paddleTrail.length; i++) {
    const point = paddleTrail[i];
    const alpha = (1 - i / MAX_TRAIL_LENGTH) * 0.3;
    const arcScale = 1 - i / MAX_TRAIL_LENGTH;
    ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
    ctx.lineWidth = PADDLE_THICKNESS * arcScale * 0.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(centerX, centerY, paddleRadius, point.angle - paddleArc * arcScale / 2, point.angle + paddleArc * arcScale / 2);
    ctx.stroke();
  }
}

// === WAVE SYSTEM ===
let currentWave = 0;
let waveTimer = 0;
let waveActive = false;
let waveType = 'NORMAL';
const WAVE_INTERVAL = 25;
const WAVE_DURATION = 8;
const WAVE_TYPES = ['SWARM', 'RAPID', 'CHAOS', 'BOSS'];

function startWave() {
  currentWave++;
  waveActive = true;
  waveTimer = 0;
  if (currentWave % 4 === 0) {
    waveType = 'BOSS';
  } else {
    waveType = WAVE_TYPES[Math.floor(Math.random() * 3)];
  }
  AudioSystem.playWaveWarning();
  triggerScreenShake(8);
  spawnRingBurst(centerX, centerY, arenaRadius * 0.5, '#ff0000', 40);
}

function updateWave(dt) {
  if (!waveActive) {
    waveTimer += dt;
    if (waveTimer >= WAVE_INTERVAL && gameTime > 20) {
      startWave();
    }
  } else {
    waveTimer += dt;
    if (waveTimer >= WAVE_DURATION) {
      waveActive = false;
      waveTimer = 0;
    }
  }
}

function getWaveSpawnRate() {
  if (!waveActive) return 1;
  switch (waveType) {
    case 'SWARM': return 3;
    case 'RAPID': return 2.5;
    case 'CHAOS': return 2;
    case 'BOSS': return 0.5;
    default: return 1;
  }
}

function getWaveBallSpeed() {
  if (!waveActive) return 1;
  switch (waveType) {
    case 'RAPID': return 1.5;
    case 'CHAOS': return 1.3;
    default: return 1;
  }
}

// === NEAR MISS SYSTEM ===
const NEAR_MISS_THRESHOLD = 30;

function checkNearMiss(ballX, ballY, ballRadius) {
  const paddleRadius = getCurrentPaddleRadius();
  const dx = ballX - centerX;
  const dy = ballY - centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ballAngle = Math.atan2(dy, dx);
  const nearPaddleRadius = dist >= paddleRadius - PADDLE_THICKNESS / 2 - ballRadius - NEAR_MISS_THRESHOLD &&
                           dist <= paddleRadius + PADDLE_THICKNESS / 2 + ballRadius + NEAR_MISS_THRESHOLD;
  if (!nearPaddleRadius) return 0;
  const angleToPaddle = Math.abs(angleDifference(ballAngle, paddleAngle));
  const halfArc = paddleArc / 2;
  if (angleToPaddle > halfArc && angleToPaddle < halfArc + 0.3) {
    const intensity = 1 - (angleToPaddle - halfArc) / 0.3;
    return intensity;
  }
  return 0;
}

// === MILESTONE TRACKING ===
const sentMessages = new Set();

// Send ticker message to parent window
function sendTickerMessage(message, level = 'info', priority = 'low') {
  if (window.parent !== window) {
    window.parent.postMessage({
      type: 'TICKER_MESSAGE',
      game: 'orbit',
      message: message,
      level: level,
      priority: priority
    }, '*');
  }
}

function checkMilestones() {
  const scoreMilestones = [
    { score: 1000, message: 'Warming up! 1,000 points!' },
    { score: 2500, message: 'Getting serious! 2,500 points!' },
    { score: 5000, message: 'On fire! 5,000 points!' },
    { score: 10000, message: 'Unstoppable! 10,000 points!' },
    { score: 25000, message: 'Legendary! 25,000 points!' },
    { score: 50000, message: 'GODLIKE! 50,000 points!' },
    { score: 100000, message: 'IMPOSSIBLE! 100,000 points!' }
  ];
  for (const milestone of scoreMilestones) {
    const key = `score_${milestone.score}`;
    if (score >= milestone.score && !sentMessages.has(key)) {
      sentMessages.add(key);
      AudioSystem.playMilestone();
      spawnRingBurst(centerX, centerY, arenaRadius * 0.4, '#ffff00', 50);
      triggerScreenShake(10);
      sendTickerMessage(milestone.message, 'celebration', 'low');
    }
  }

  // Combo milestones
  const comboMilestones = [
    { combo: 10, message: '10x Combo!' },
    { combo: 25, message: '25x MEGA Combo!' },
    { combo: 50, message: '50x ULTRA Combo!' },
    { combo: 100, message: '100x INSANE Combo!' }
  ];
  for (const milestone of comboMilestones) {
    const key = `combo_${milestone.combo}`;
    if (combo >= milestone.combo && !sentMessages.has(key)) {
      sentMessages.add(key);
      sendTickerMessage(milestone.message, 'success', 'low');
    }
  }
}

// === PADDLE COLLISION SYSTEM ===

// Contact tracking - who's touching who
let paddleContacts = []; // { paddle1, paddle2, intensity }

// Forcefield parameters - magnetic repulsion before contact
const FORCEFIELD_RADIUS = 0.18; // Radians - soft repulsion zone
const FORCEFIELD_STRENGTH = 8.0; // Base repulsion force multiplier
const CONTACT_STIFFNESS = 25.0; // Hard separation force on overlap
const MOMENTUM_ELASTICITY = 0.65; // How much momentum transfers (0-1)
const FRICTION_COEFFICIENT = 0.92; // Velocity retention during clash

let paddleProximities = []; // Track pairs approaching each other
let clashIntensities = {}; // Track sustained clash intensity per pair

// Calculate signed angular distance (positive = clockwise)
function getAngularDistance(angle1, angle2, arc1, arc2) {
  const diff = angleDifference(angle2, angle1); // Signed difference
  const touchDistance = (arc1 + arc2) / 2;
  const separation = Math.abs(diff) - touchDistance;
  return { diff, separation, touchDistance };
}

// Check if two paddles are close enough to interact (same ring zone)
function arePaddlesInSameZone(radius1, radius2) {
  // Use half the ring gap as the threshold - paddles must be truly on the same ring
  const ringGap = arenaRadius - innerRadius;
  const threshold = ringGap * 0.4; // 40% of gap allows some overlap during transitions
  return Math.abs(radius1 - radius2) < threshold;
}

// Calculate repulsion force based on distance (inverse square-ish with soft cap)
function calculateRepulsionForce(separation, velocity1, velocity2) {
  if (separation >= FORCEFIELD_RADIUS) return 0;
  if (separation <= 0) {
    // Overlapping - strong separation force
    return CONTACT_STIFFNESS * Math.max(0.01, -separation + 0.02);
  }
  // Forcefield zone - smooth exponential falloff
  const normalizedDist = separation / FORCEFIELD_RADIUS;
  const baseForce = FORCEFIELD_STRENGTH * Math.pow(1 - normalizedDist, 2.5);

  // Approaching paddles feel more resistance
  const approachVel = velocity1 - velocity2; // Relative velocity
  const approachBonus = Math.max(0, -approachVel * 0.3);

  return baseForce + approachBonus;
}

function updatePaddleProximities() {
  paddleProximities = [];
  const playerRadius = getCurrentPaddleRadius();

  // Check player vs each AI
  for (let aiIndex = 0; aiIndex < AI_PADDLES.length; aiIndex++) {
    const ai = AI_PADDLES[aiIndex];
    const aiRadius = getAIPaddleRadius(ai);

    if (!arePaddlesInSameZone(playerRadius, aiRadius)) continue;

    const { separation } = getAngularDistance(paddleAngle, ai.angle, paddleArc, PADDLE_ARC_BASE);

    if (separation < FORCEFIELD_RADIUS && separation > 0) {
      const intensity = 1 - (separation / FORCEFIELD_RADIUS);
      paddleProximities.push({
        paddle1: 'player',
        paddle2: `ai${aiIndex}`,
        intensity: Math.pow(intensity, 1.5), // Ease-in curve for tension buildup
        angle: (paddleAngle + ai.angle) / 2,
        separation
      });
    }
  }

  // Check AI vs AI
  for (let i = 0; i < AI_PADDLES.length; i++) {
    for (let j = i + 1; j < AI_PADDLES.length; j++) {
      const ai1 = AI_PADDLES[i];
      const ai2 = AI_PADDLES[j];
      const radius1 = getAIPaddleRadius(ai1);
      const radius2 = getAIPaddleRadius(ai2);

      if (!arePaddlesInSameZone(radius1, radius2)) continue;

      const { separation } = getAngularDistance(ai1.angle, ai2.angle, PADDLE_ARC_BASE, PADDLE_ARC_BASE);

      if (separation < FORCEFIELD_RADIUS && separation > 0) {
        const intensity = 1 - (separation / FORCEFIELD_RADIUS);
        paddleProximities.push({
          paddle1: `ai${i}`,
          paddle2: `ai${j}`,
          intensity: Math.pow(intensity, 1.5),
          angle: (ai1.angle + ai2.angle) / 2,
          separation
        });
      }
    }
  }
}

function checkPaddleOverlap(angle1, angle2, arc1, arc2) {
  const diff = Math.abs(angleDifference(angle1, angle2));
  return diff < (arc1 + arc2) / 2;
}

// Momentum-based collision with magnetic repulsion
function resolvePaddleCollisions(dt) {
  paddleContacts = [];
  const playerRadius = getCurrentPaddleRadius();

  // === PLAYER VS AI ===
  for (let aiIndex = 0; aiIndex < AI_PADDLES.length; aiIndex++) {
    const ai = AI_PADDLES[aiIndex];
    const aiRadius = getAIPaddleRadius(ai);

    if (!arePaddlesInSameZone(playerRadius, aiRadius)) continue;

    const { diff, separation, touchDistance } = getAngularDistance(
      paddleAngle, ai.angle, paddleArc, PADDLE_ARC_BASE
    );
    const pushDir = Math.sign(diff); // Direction to push AI away from player

    // Calculate momenta (consider direction relative to opponent)
    const playerTowardAI = paddleVelocity * pushDir; // Positive = moving toward AI
    const aiTowardPlayer = -ai.velocity * pushDir; // Positive = AI moving toward player
    const playerMomentum = Math.abs(paddleVelocity);
    const aiMomentum = Math.abs(ai.velocity);

    // Forcefield zone - apply soft repulsion
    if (separation < FORCEFIELD_RADIUS && separation > 0) {
      const repulsion = calculateRepulsionForce(separation, playerTowardAI, aiTowardPlayer);
      const force = repulsion * dt;

      // Momentum determines who gets pushed more
      const totalMass = playerMomentum + aiMomentum + 0.5;
      const playerResist = 0.3 + 0.7 * (playerMomentum / totalMass);
      const aiResist = 0.3 + 0.7 * (aiMomentum / totalMass);

      // Apply repulsion (weaker paddle feels more force)
      paddleAngle -= pushDir * force * (1 - playerResist) * 0.5;
      ai.angle += pushDir * force * (1 - aiResist) * 0.5;

      // Velocity damping in forcefield (creates tension)
      if (playerTowardAI > 0) paddleVelocity *= (1 - 0.08 * dt * (1 - separation / FORCEFIELD_RADIUS));
      if (aiTowardPlayer > 0) ai.velocity *= (1 - 0.08 * dt * (1 - separation / FORCEFIELD_RADIUS));
    }

    // Contact/overlap - hard collision resolution
    if (separation <= 0) {
      paddleContacts.push({
        paddle1: 'player',
        paddle2: `ai${aiIndex}`,
        intensity: Math.min(1, -separation * 10 + 0.5)
      });

      const overlap = -separation;
      const totalMomentum = playerMomentum + aiMomentum + 0.2;

      // Momentum ratio determines who dominates (smooth gradient, not threshold)
      const playerDominance = playerMomentum / totalMomentum;
      const aiDominance = aiMomentum / totalMomentum;

      // Separation force - stronger paddle pushes weaker one away
      const separationForce = (overlap + 0.01) * CONTACT_STIFFNESS * dt;
      paddleAngle -= pushDir * separationForce * aiDominance;
      ai.angle += pushDir * separationForce * playerDominance;

      // Momentum transfer - elastic collision with dominance
      const dominanceRatio = (playerMomentum - aiMomentum) / totalMomentum;

      if (dominanceRatio > 0.15) {
        // Player dominant - transfer momentum to AI
        const transferAmount = playerMomentum * MOMENTUM_ELASTICITY * dominanceRatio;
        ai.velocity += Math.sign(paddleVelocity) * transferAmount;
        paddleVelocity *= FRICTION_COEFFICIENT - (dominanceRatio * 0.15);
      } else if (dominanceRatio < -0.15) {
        // AI dominant - transfer momentum to player
        const transferAmount = aiMomentum * MOMENTUM_ELASTICITY * (-dominanceRatio);
        paddleVelocity += Math.sign(ai.velocity) * transferAmount;
        ai.velocity *= FRICTION_COEFFICIENT - ((-dominanceRatio) * 0.15);
      } else {
        // Evenly matched - grinding clash, both lose momentum
        const clashFriction = 0.94 - (0.06 * (1 - Math.abs(dominanceRatio) / 0.15));
        paddleVelocity *= clashFriction;
        ai.velocity *= clashFriction;

        // Slight mutual repulsion in stalemate
        paddleAngle -= pushDir * 0.002;
        ai.angle += pushDir * 0.002;
      }
    }
  }

  // === AI VS AI ===
  for (let i = 0; i < AI_PADDLES.length; i++) {
    for (let j = i + 1; j < AI_PADDLES.length; j++) {
      const ai1 = AI_PADDLES[i];
      const ai2 = AI_PADDLES[j];
      const radius1 = getAIPaddleRadius(ai1);
      const radius2 = getAIPaddleRadius(ai2);

      if (!arePaddlesInSameZone(radius1, radius2)) continue;

      const { diff, separation, touchDistance } = getAngularDistance(
        ai1.angle, ai2.angle, PADDLE_ARC_BASE, PADDLE_ARC_BASE
      );
      const pushDir = Math.sign(diff);

      const ai1TowardAi2 = ai1.velocity * pushDir;
      const ai2TowardAi1 = -ai2.velocity * pushDir;
      const ai1Momentum = Math.abs(ai1.velocity);
      const ai2Momentum = Math.abs(ai2.velocity);

      // Forcefield zone
      if (separation < FORCEFIELD_RADIUS && separation > 0) {
        const repulsion = calculateRepulsionForce(separation, ai1TowardAi2, ai2TowardAi1);
        const force = repulsion * dt;

        const totalMass = ai1Momentum + ai2Momentum + 0.5;
        const ai1Resist = 0.3 + 0.7 * (ai1Momentum / totalMass);
        const ai2Resist = 0.3 + 0.7 * (ai2Momentum / totalMass);

        ai1.angle -= pushDir * force * (1 - ai1Resist) * 0.5;
        ai2.angle += pushDir * force * (1 - ai2Resist) * 0.5;

        if (ai1TowardAi2 > 0) ai1.velocity *= (1 - 0.08 * dt * (1 - separation / FORCEFIELD_RADIUS));
        if (ai2TowardAi1 > 0) ai2.velocity *= (1 - 0.08 * dt * (1 - separation / FORCEFIELD_RADIUS));
      }

      // Contact/overlap
      if (separation <= 0) {
        paddleContacts.push({
          paddle1: `ai${i}`,
          paddle2: `ai${j}`,
          intensity: Math.min(1, -separation * 10 + 0.5)
        });

        const overlap = -separation;
        const totalMomentum = ai1Momentum + ai2Momentum + 0.2;

        const ai1Dominance = ai1Momentum / totalMomentum;
        const ai2Dominance = ai2Momentum / totalMomentum;

        const separationForce = (overlap + 0.01) * CONTACT_STIFFNESS * dt;
        ai1.angle -= pushDir * separationForce * ai2Dominance;
        ai2.angle += pushDir * separationForce * ai1Dominance;

        const dominanceRatio = (ai1Momentum - ai2Momentum) / totalMomentum;

        if (dominanceRatio > 0.15) {
          const transferAmount = ai1Momentum * MOMENTUM_ELASTICITY * dominanceRatio;
          ai2.velocity += Math.sign(ai1.velocity) * transferAmount;
          ai1.velocity *= FRICTION_COEFFICIENT - (dominanceRatio * 0.15);
        } else if (dominanceRatio < -0.15) {
          const transferAmount = ai2Momentum * MOMENTUM_ELASTICITY * (-dominanceRatio);
          ai1.velocity += Math.sign(ai2.velocity) * transferAmount;
          ai2.velocity *= FRICTION_COEFFICIENT - ((-dominanceRatio) * 0.15);
        } else {
          const clashFriction = 0.94 - (0.06 * (1 - Math.abs(dominanceRatio) / 0.15));
          ai1.velocity *= clashFriction;
          ai2.velocity *= clashFriction;

          ai1.angle -= pushDir * 0.002;
          ai2.angle += pushDir * 0.002;
        }
      }
    }
  }
}

// Helper to check if player is in contact with another paddle
function isPlayerInContact() {
  for (const contact of paddleContacts) {
    if (contact.paddle1 === 'player' || contact.paddle2 === 'player') {
      return true;
    }
  }
  return false;
}

// Helper to check if an AI is in contact with another paddle
function isAIInContact(aiIndex) {
  const aiId = `ai${aiIndex}`;
  for (const contact of paddleContacts) {
    if (contact.paddle1 === aiId || contact.paddle2 === aiId) {
      return true;
    }
  }
  return false;
}

// Helper to check if player is in proximity zone with another paddle
function getPlayerProximityIntensity() {
  for (const prox of paddleProximities) {
    if (prox.paddle1 === 'player' || prox.paddle2 === 'player') {
      return prox.intensity;
    }
  }
  return 0;
}

// Helper to check if an AI is in proximity zone
function getAIProximityIntensity(aiIndex) {
  const aiId = `ai${aiIndex}`;
  for (const prox of paddleProximities) {
    if (prox.paddle1 === aiId || prox.paddle2 === aiId) {
      return prox.intensity;
    }
  }
  return 0;
}

// Track audio state for smooth transitions
let lastClashState = false;
let lastProximityIntensity = 0;

// Update audio feedback based on proximity and contacts
function updateCollisionAudio() {
  // Check for player involvement in contacts or proximities
  let playerInContact = false;
  let maxProximityIntensity = 0;

  for (const contact of paddleContacts) {
    if (contact.paddle1 === 'player' || contact.paddle2 === 'player') {
      playerInContact = true;
      break;
    }
  }

  for (const prox of paddleProximities) {
    if (prox.paddle1 === 'player' || prox.paddle2 === 'player') {
      maxProximityIntensity = Math.max(maxProximityIntensity, prox.intensity);
    }
  }

  // Trigger clash start sound on contact
  if (playerInContact && !lastClashState) {
    AudioSystem.playClashStart();
  }

  // Play tension audio during proximity (intensity-based)
  if (maxProximityIntensity > 0.3) {
    AudioSystem.playClashTension(maxProximityIntensity);
  }

  // Play resolve sound when clash ends
  if (lastClashState && !playerInContact && lastProximityIntensity > 0.5) {
    AudioSystem.playClashResolve(lastProximityIntensity);
  }

  lastClashState = playerInContact;
  lastProximityIntensity = maxProximityIntensity;
}

// Draw energy arc between clashing paddles
function drawClashEffects() {
  for (const contact of paddleContacts) {
    // Get paddle positions
    let angle1, angle2, radius1, radius2, color1, color2;

    if (contact.paddle1 === 'player') {
      angle1 = paddleAngle;
      radius1 = getCurrentPaddleRadius();
      color1 = '#00ffff';
    } else {
      const idx = parseInt(contact.paddle1.replace('ai', ''));
      const ai = AI_PADDLES[idx];
      angle1 = ai.angle;
      radius1 = getAIPaddleRadius(ai);
      color1 = ai.color;
    }

    if (contact.paddle2.startsWith('ai')) {
      const idx = parseInt(contact.paddle2.replace('ai', ''));
      const ai = AI_PADDLES[idx];
      angle2 = ai.angle;
      radius2 = getAIPaddleRadius(ai);
      color2 = ai.color;
    } else {
      angle2 = paddleAngle;
      radius2 = getCurrentPaddleRadius();
      color2 = '#00ffff';
    }

    // Draw clash sparks at contact point
    const midAngle = (angle1 + angle2) / 2;
    const midRadius = (radius1 + radius2) / 2;
    const intensity = contact.intensity || 0.5;

    // Pulsing energy effect
    const pulse = 0.7 + Math.sin(gameTime * 20) * 0.3;
    const sparkX = centerX + Math.cos(midAngle) * midRadius;
    const sparkY = centerY + Math.sin(midAngle) * midRadius;

    // Energy glow at clash point
    const gradient = ctx.createRadialGradient(sparkX, sparkY, 0, sparkX, sparkY, 20 * intensity);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${0.8 * pulse * intensity})`);
    gradient.addColorStop(0.3, `rgba(255, 200, 100, ${0.5 * pulse * intensity})`);
    gradient.addColorStop(1, 'rgba(255, 100, 50, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(sparkX, sparkY, 20 * intensity, 0, Math.PI * 2);
    ctx.fill();

    // Lightning-like energy lines
    if (intensity > 0.3) {
      ctx.strokeStyle = `rgba(255, 255, 200, ${0.6 * intensity * pulse})`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const offsetAngle = midAngle + (Math.random() - 0.5) * 0.1;
        const len = 15 + Math.random() * 10;
        ctx.beginPath();
        ctx.moveTo(sparkX, sparkY);
        ctx.lineTo(
          sparkX + Math.cos(offsetAngle + Math.random()) * len,
          sparkY + Math.sin(offsetAngle + Math.random()) * len
        );
        ctx.stroke();
      }
    }

    // Subtle screen vibration during sustained clash
    if (intensity > 0.6 && contact.paddle1 === 'player') {
      triggerScreenShake(intensity * 1.5);
    }
  }
}

// Draw forcefield tension arcs between approaching paddles
function drawProximityEffects() {
  for (const prox of paddleProximities) {
    let angle1, angle2, radius1, radius2, color1, color2;

    if (prox.paddle1 === 'player') {
      angle1 = paddleAngle;
      radius1 = getCurrentPaddleRadius();
      color1 = '0, 255, 255';
    } else {
      const idx = parseInt(prox.paddle1.replace('ai', ''));
      const ai = AI_PADDLES[idx];
      angle1 = ai.angle;
      radius1 = getAIPaddleRadius(ai);
      color1 = ai.color === '#88ff88' ? '136, 255, 136' : '255, 136, 136';
    }

    if (prox.paddle2.startsWith('ai')) {
      const idx = parseInt(prox.paddle2.replace('ai', ''));
      const ai = AI_PADDLES[idx];
      angle2 = ai.angle;
      radius2 = getAIPaddleRadius(ai);
      color2 = ai.color === '#88ff88' ? '136, 255, 136' : '255, 136, 136';
    }

    const intensity = prox.intensity;
    const midAngle = (angle1 + angle2) / 2;
    const midRadius = (radius1 + radius2) / 2;

    // Draw repulsion field arc between paddles
    const fieldX = centerX + Math.cos(midAngle) * midRadius;
    const fieldY = centerY + Math.sin(midAngle) * midRadius;

    // Pulsing warning glow
    const pulse = 0.6 + Math.sin(gameTime * 12 * (1 + intensity)) * 0.4;
    const glowSize = 12 + intensity * 15;

    const gradient = ctx.createRadialGradient(fieldX, fieldY, 0, fieldX, fieldY, glowSize);
    gradient.addColorStop(0, `rgba(255, 200, 100, ${0.4 * intensity * pulse})`);
    gradient.addColorStop(0.5, `rgba(255, 150, 50, ${0.2 * intensity * pulse})`);
    gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(fieldX, fieldY, glowSize, 0, Math.PI * 2);
    ctx.fill();

    // Draw connecting arc showing magnetic field lines (high intensity only)
    if (intensity > 0.5) {
      const arcIntensity = (intensity - 0.5) * 2;
      ctx.strokeStyle = `rgba(255, 200, 100, ${0.3 * arcIntensity * pulse})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);

      // Draw arc segment between the two paddle edges
      const arcStart = Math.min(angle1, angle2) + PADDLE_ARC_BASE / 2;
      const arcEnd = Math.max(angle1, angle2) - PADDLE_ARC_BASE / 2;

      ctx.beginPath();
      ctx.arc(centerX, centerY, midRadius, arcStart, arcEnd);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Spawn occasional warning particles at high intensity
    if (intensity > 0.7 && Math.random() < intensity * 0.15) {
      spawnParticles(fieldX, fieldY, 1, '#ffaa44', 40, 2, 0.2);
    }
  }
}

// === AI BEHAVIOR ===

function updateAIPaddles(dt) {
  for (const ai of AI_PADDLES) {
    // Find the best ball to chase
    let bestBall = null;
    let bestScore = -Infinity;

    // Check all regular balls
    for (const ball of balls) {
      if (ball.escaped) continue;

      const dx = ball.x - centerX;
      const dy = ball.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const normalizedDist = dist / arenaRadius;

      // Skip balls outside chase threshold
      if (normalizedDist < ai.chaseThreshold * 0.3) continue;

      const ballAngle = Math.atan2(dy, dx);
      const angleDiff = Math.abs(angleDifference(ballAngle, ai.angle));

      // Score based on: proximity to edge (higher = more urgent) and angle closeness
      const urgency = normalizedDist;
      const angleScore = 1 - (angleDiff / Math.PI);
      const ballScore = urgency * 2 + angleScore;

      if (ballScore > bestScore) {
        bestScore = ballScore;
        bestBall = ball;
      }
    }

    // Special ball is high priority for GEORGE
    if (specialBall && !specialBallReturning) {
      const dx = specialBall.x - centerX;
      const dy = specialBall.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const normalizedDist = dist / arenaRadius;

      if (normalizedDist >= ai.chaseThreshold * 0.3) {
        const ballAngle = Math.atan2(dy, dx);
        const angleDiff = Math.abs(angleDifference(ballAngle, ai.angle));

        // Special ball is worth more points, so prioritize it (especially for GEORGE)
        const urgency = normalizedDist;
        const angleScore = 1 - (angleDiff / Math.PI);
        const specialBonus = ai.name === 'GEORGE' ? 2 : 0.5;
        const ballScore = (urgency * 2 + angleScore) * specialBonus;

        if (ballScore > bestScore) {
          bestScore = ballScore;
          bestBall = specialBall;
        }
      }
    }

    // Apply laziness - sometimes Lennie just doesn't react
    if (Math.random() < ai.laziness * dt * 2) {
      bestBall = null;
    }

    // Move toward best ball
    if (bestBall) {
      const dx = bestBall.x - centerX;
      const dy = bestBall.y - centerY;
      const targetAngle = Math.atan2(dy, dx);
      const diff = angleDifference(targetAngle, ai.angle);

      // Check if path is blocked by another paddle on same ring
      let pathBlocked = false;
      const moveDirection = Math.sign(diff);

      // Check player paddle
      if (paddleRing === ai.ring) {
        const playerDiff = angleDifference(paddleAngle, ai.angle);
        const targetDiff = angleDifference(targetAngle, ai.angle);
        // If player is between AI and target
        if (Math.sign(playerDiff) === moveDirection &&
            Math.abs(playerDiff) < Math.abs(targetDiff) &&
            Math.abs(playerDiff) < PADDLE_ARC_BASE * 2) {
          pathBlocked = true;
        }
      }

      // Check other AI paddles
      for (const otherAI of AI_PADDLES) {
        if (otherAI === ai || otherAI.ring !== ai.ring) continue;
        const otherDiff = angleDifference(otherAI.angle, ai.angle);
        const targetDiff = angleDifference(targetAngle, ai.angle);
        if (Math.sign(otherDiff) === moveDirection &&
            Math.abs(otherDiff) < Math.abs(targetDiff) &&
            Math.abs(otherDiff) < PADDLE_ARC_BASE * 2) {
          pathBlocked = true;
        }
      }

      // Consider switching rings if blocked (more likely for aggressive AI)
      if (pathBlocked && Math.random() < (ai.name === 'GEORGE' ? 0.02 : 0.005)) {
        const targetRing = ai.ring === 0 ? 1 : 0;
        // Check if the target ring is clear at this position
        let canSwitch = true;

        // Check player
        if (paddleRing === targetRing && checkPaddleOverlap(ai.angle, paddleAngle, PADDLE_ARC_BASE, paddleArc)) {
          canSwitch = false;
        }

        // Check other AIs
        for (const otherAI of AI_PADDLES) {
          if (otherAI === ai) continue;
          if (otherAI.ring === targetRing && checkPaddleOverlap(ai.angle, otherAI.angle, PADDLE_ARC_BASE, PADDLE_ARC_BASE)) {
            canSwitch = false;
            break;
          }
        }

        if (canSwitch) {
          startAIRingSwitch(ai, targetRing);
        }
      }

      // Accelerate toward target
      const desiredVelocity = Math.sign(diff) * Math.min(Math.abs(diff) * ai.reactionSpeed, ai.maxSpeed);
      ai.velocity += (desiredVelocity - ai.velocity) * ai.reactionSpeed * dt;
      ai.velocity = Math.max(-ai.maxSpeed, Math.min(ai.maxSpeed, ai.velocity));
    } else {
      // Decelerate when no target
      ai.velocity *= Math.pow(0.1, dt);
      if (Math.abs(ai.velocity) < 0.01) ai.velocity = 0;

      // Occasionally return to outer ring when idle
      if (ai.ring === 1 && Math.random() < 0.01) {
        // Check if outer ring is clear at this position
        let canSwitch = true;
        if (paddleRing === 0 && checkPaddleOverlap(ai.angle, paddleAngle, PADDLE_ARC_BASE, paddleArc)) {
          canSwitch = false;
        }
        for (const otherAI of AI_PADDLES) {
          if (otherAI === ai) continue;
          if (otherAI.ring === 0 && checkPaddleOverlap(ai.angle, otherAI.angle, PADDLE_ARC_BASE, PADDLE_ARC_BASE)) {
            canSwitch = false;
            break;
          }
        }
        if (canSwitch) {
          startAIRingSwitch(ai, 0);
        }
      }
    }

    // Update position
    ai.angle += ai.velocity * dt;
    ai.angle = normalizeAngle(ai.angle);
  }
}

// Input state
let isDragging = false;
let keysDown = { clockwise: false, counterClockwise: false };

function updateHighScoreDisplay() {
  if (highScore > 0) {
    highScoreDisplay.textContent = `HIGH SCORE: ${highScore}`;
  }
}

// === CANVAS SETUP ===

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  centerX = canvas.width / 2;
  centerY = canvas.height / 2;
  arenaRadius = Math.min(canvas.width, canvas.height) * ARENA_RADIUS_RATIO;
  innerRadius = arenaRadius * INNER_RING_RATIO;
}

function getRingRadius(ring) {
  return ring === 0 ? arenaRadius : innerRadius;
}

function getCurrentPaddleRadius() {
  if (ringSwitchProgress <= 0) {
    return getRingRadius(paddleRing);
  }
  const fromRadius = getRingRadius(ringSwitchFrom);
  const toRadius = getRingRadius(ringSwitchTo);
  const t = ringSwitchProgress;
  switch (ringSwitchStyle) {
    case 2:
      return fromRadius + (toRadius - fromRadius) * t;
    case 4:
      return t < 0.5 ? fromRadius : toRadius;
    default:
      return fromRadius + (toRadius - fromRadius) * t;
  }
}

function getPaddleTransitionScale() {
  if (ringSwitchProgress <= 0 || ringSwitchStyle !== 4) {
    return 1;
  }
  const t = ringSwitchProgress;
  return t < 0.5 ? 1 - (t * 2) : (t - 0.5) * 2;
}

// Get AI paddle radius with ring switch animation
function getAIPaddleRadius(ai) {
  if (ai.ringSwitchProgress <= 0) {
    return ai.ring === 0 ? arenaRadius : innerRadius;
  }
  const fromRadius = ai.ringSwitchFrom === 0 ? arenaRadius : innerRadius;
  const toRadius = ai.ringSwitchTo === 0 ? arenaRadius : innerRadius;
  const t = ai.ringSwitchProgress;
  return fromRadius + (toRadius - fromRadius) * t;
}

// Start an AI ring switch with animation
function startAIRingSwitch(ai, targetRing) {
  if (ai.ringSwitchProgress > 0) return false; // Already switching
  if (ai.ring === targetRing) return false; // Already on target ring

  ai.ringSwitchFrom = ai.ring;
  ai.ringSwitchTo = targetRing;
  ai.ringSwitchProgress = 0.001;
  return true;
}

// Update AI ring switch animations
function updateAIRingSwitches(dt) {
  for (const ai of AI_PADDLES) {
    if (ai.ringSwitchProgress > 0) {
      ai.ringSwitchProgress += dt / RING_SWITCH_DURATION;
      if (ai.ringSwitchProgress >= 1) {
        ai.ringSwitchProgress = 0;
        ai.ring = ai.ringSwitchTo;
      }
    }
  }
}

// Buffer for ring switch blocking - allows slight overlap for cleaner hops
const RING_SWITCH_CLEARANCE = 0.03; // Radians of clearance needed

function isRingSwitchBlocked(playerAngle, targetRing) {
  for (const ai of AI_PADDLES) {
    // Check AI paddles on target ring
    if (ai.ring === targetRing && ai.ringSwitchProgress <= 0) {
      const { separation } = getAngularDistance(playerAngle, ai.angle, paddleArc, PADDLE_ARC_BASE);
      // Block only if there's significant overlap (not just touching)
      if (separation < -RING_SWITCH_CLEARANCE) {
        return { blocked: true, ai, separation };
      }
    }
    // Check AI paddles transitioning TO the target ring
    if (ai.ringSwitchProgress > 0 && ai.ringSwitchTo === targetRing) {
      const { separation } = getAngularDistance(playerAngle, ai.angle, paddleArc, PADDLE_ARC_BASE);
      // More lenient for transitioning paddles (they might move)
      if (separation < -RING_SWITCH_CLEARANCE * 2) {
        return { blocked: true, ai, separation };
      }
    }
  }
  return { blocked: false };
}

function switchRing() {
  if (ringSwitchProgress > 0) return;
  const targetRing = paddleRing === 0 ? 1 : 0;

  // Check if an opponent is blocking the target ring at our position
  const blockCheck = isRingSwitchBlocked(paddleAngle, targetRing);

  if (blockCheck.blocked) {
    // Blocked! Play a rejection sound and show visual feedback
    AudioSystem.playClashStart();
    triggerScreenShake(2);
    // Spawn blocked particles at the blocking location
    const blockRadius = targetRing === 0 ? arenaRadius : innerRadius;
    const blockX = centerX + Math.cos(paddleAngle) * blockRadius;
    const blockY = centerY + Math.sin(paddleAngle) * blockRadius;
    spawnParticles(blockX, blockY, 10, '#ff4444', 80, 3, 0.3);

    // Apply a small push away from the blocker for feedback
    const pushDir = Math.sign(angleDifference(blockCheck.ai.angle, paddleAngle));
    paddleVelocity -= pushDir * 0.3;
    return; // Can't switch
  }

  ringSwitchFrom = paddleRing;
  ringSwitchTo = targetRing;
  ringSwitchProgress = 0.001;
  AudioSystem.playRingSwitch();
  triggerScreenShake(3);
  const paddleRadius = getCurrentPaddleRadius();
  for (let i = 0; i < 8; i++) {
    const a = paddleAngle - paddleArc / 2 + (i / 7) * paddleArc;
    const px = centerX + Math.cos(a) * paddleRadius;
    const py = centerY + Math.sin(a) * paddleRadius;
    spawnParticles(px, py, 3, '#00ffff', 100, 3, 0.3);
  }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// === INPUT HANDLING ===

function getAngleFromPosition(x, y) {
  return Math.atan2(y - centerY, x - centerX);
}

function handlePointerDown(x, y) {
  isDragging = true;
  targetAngle = getAngleFromPosition(x, y);
}

function handlePointerMove(x, y) {
  if (isDragging) {
    targetAngle = getAngleFromPosition(x, y);
  }
}

function handlePointerUp() {
  isDragging = false;
}

canvas.addEventListener('mousedown', (e) => handlePointerDown(e.clientX, e.clientY));
canvas.addEventListener('mousemove', (e) => handlePointerMove(e.clientX, e.clientY));
canvas.addEventListener('mouseup', handlePointerUp);
canvas.addEventListener('mouseleave', handlePointerUp);

let lastTapTime = 0;
const DOUBLE_TAP_THRESHOLD = 300;

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const now = Date.now();
  if (now - lastTapTime < DOUBLE_TAP_THRESHOLD) {
    if (gameRunning) {
      switchRing();
    }
    lastTapTime = 0;
  } else {
    lastTapTime = now;
    handlePointerDown(touch.clientX, touch.clientY);
  }
});
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  handlePointerMove(touch.clientX, touch.clientY);
});
canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  handlePointerUp();
});

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'w' || key === 'd') {
    keysDown.clockwise = true;
  } else if (key === 'a' || key === 's') {
    keysDown.counterClockwise = true;
  } else if (key === ' ' || key === 'shift') {
    if (gameRunning) {
      switchRing();
    }
  }
});
window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'w' || key === 'd') {
    keysDown.clockwise = false;
  } else if (key === 'a' || key === 's') {
    keysDown.counterClockwise = false;
  }
});

// === BALL MANAGEMENT ===

function spawnBall() {
  const angle = Math.random() * Math.PI * 2;
  const waveSpeed = getWaveBallSpeed();
  balls.push({
    x: centerX,
    y: centerY,
    vx: Math.cos(angle) * BALL_SPEED * waveSpeed,
    vy: Math.sin(angle) * BALL_SPEED * waveSpeed,
    baseRadius: BALL_RADIUS,
    spawnProgress: 0,
    age: 0,
    speedMult: 1,
    hitCooldown: 0,
    escaped: false,
    spin: 0,
    nearMissTriggered: false
  });
  AudioSystem.playBallSpawn();
  spawnParticles(centerX, centerY, 8, '#fff', 80, 3, 0.3);
}

function spawnSpecialBall() {
  const angle = Math.random() * Math.PI * 2;
  const speed = BALL_SPEED * 0.8;
  specialBall = {
    x: centerX,
    y: centerY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    baseRadius: SPECIAL_BALL_RADIUS,
    spawnProgress: 0,
    shrinkProgress: 0,
    age: 0,
    speedMult: 1,
    hitCooldown: 0,
    returnTime: 0,
    spin: 0
  };
  specialBallActiveTime = 0;
  specialBallReadyToReturn = false;
  specialBallReturning = false;
  specialBallClaimTime = 0;
  specialBallForceCapture = false;
  AudioSystem.playSpecialSpawn();
  spawnExplosion(centerX, centerY, '#ff0000', 1.5);
  triggerScreenShake(8);
}

function spawnPowerup() {
  const types = Object.keys(POWERUP_TYPES);
  const type = types[Math.floor(Math.random() * types.length)];
  const angle = Math.random() * Math.PI * 2;
  powerups.push({
    x: centerX,
    y: centerY,
    vx: Math.cos(angle) * BALL_SPEED * 0.7,
    vy: Math.sin(angle) * BALL_SPEED * 0.7,
    type: type,
    spawnProgress: 0
  });
}

function getAgeBonus(age) {
  const maturity = Math.min(1, age / BALL_MATURITY_TIME);
  return Math.floor(maturity * BALL_AGE_BONUS_MAX);
}

function getBallMaturity(age) {
  return Math.min(1, age / BALL_MATURITY_TIME);
}

function getCurrentPaddleArc() {
  let arc = PADDLE_ARC_BASE;
  for (const pu of activePowerups) {
    if (POWERUP_TYPES[pu.type].arcBonus) {
      arc += POWERUP_TYPES[pu.type].arcBonus;
    }
  }
  return Math.max(0.08, arc);
}

function getCurrentPaddleSpeed() {
  let speed = PADDLE_SPEED;
  for (const pu of activePowerups) {
    if (pu.type === 'SPEED') {
      speed += POWERUP_TYPES.SPEED.speedBonus;
    }
  }
  return speed;
}

function getBallSpeedMultiplier() {
  let mult = 1;
  for (const pu of activePowerups) {
    if (pu.type === 'SLOW') {
      mult *= POWERUP_TYPES.SLOW.ballSpeedMult;
    } else if (pu.type === 'FAST') {
      mult *= POWERUP_TYPES.FAST.ballSpeedMult;
    }
  }
  return mult;
}

function getPointsMultiplier() {
  let mult = 1;
  for (const pu of activePowerups) {
    if (pu.type === 'POINTS') {
      mult *= POWERUP_TYPES.POINTS.pointsMult;
    }
  }
  return mult;
}

function activatePowerup(type) {
  const config = POWERUP_TYPES[type];
  activePowerups.push({
    type: type,
    endTime: gameTime + config.duration
  });
}

function normalizeAngle(angle) {
  while (angle < -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function angleDifference(a, b) {
  return normalizeAngle(a - b);
}

function checkPaddleCollision(ballX, ballY, ballRadius) {
  if (ringSwitchProgress > 0 && ringSwitchStyle === 4) {
    return { hit: false, edgeHit: false, deflectAngle: 0 };
  }
  const dx = ballX - centerX;
  const dy = ballY - centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ballAngle = Math.atan2(dy, dx);
  const paddleRadius = getCurrentPaddleRadius();
  const paddleStart = paddleAngle - paddleArc / 2;
  const paddleEnd = paddleAngle + paddleArc / 2;
  const halfThickness = PADDLE_THICKNESS / 2;
  const angleToPaddle = angleDifference(ballAngle, paddleAngle);
  const withinArc = Math.abs(angleToPaddle) <= paddleArc / 2;
  const withinRadius = dist >= paddleRadius - halfThickness - ballRadius &&
                       dist <= paddleRadius + halfThickness + ballRadius;
  if (withinArc && withinRadius) {
    const edgeFactor = Math.abs(angleToPaddle) / (paddleArc / 2);
    const deflectAngle = ballAngle + Math.PI + (angleToPaddle * edgeFactor * 0.5);
    return { hit: true, edgeHit: false, deflectAngle: deflectAngle };
  }
  const startCapX = centerX + Math.cos(paddleStart) * paddleRadius;
  const startCapY = centerY + Math.sin(paddleStart) * paddleRadius;
  const dxStart = ballX - startCapX;
  const dyStart = ballY - startCapY;
  const distStart = Math.sqrt(dxStart * dxStart + dyStart * dyStart);
  if (distStart <= halfThickness + ballRadius) {
    const deflectAngle = Math.atan2(dyStart, dxStart);
    return { hit: true, edgeHit: true, deflectAngle: deflectAngle };
  }
  const endCapX = centerX + Math.cos(paddleEnd) * paddleRadius;
  const endCapY = centerY + Math.sin(paddleEnd) * paddleRadius;
  const dxEnd = ballX - endCapX;
  const dyEnd = ballY - endCapY;
  const distEnd = Math.sqrt(dxEnd * dxEnd + dyEnd * dyEnd);
  if (distEnd <= halfThickness + ballRadius) {
    const deflectAngle = Math.atan2(dyEnd, dxEnd);
    return { hit: true, edgeHit: true, deflectAngle: deflectAngle };
  }
  return { hit: false, edgeHit: false, deflectAngle: 0 };
}

// Generalized paddle collision for AI paddles
function checkAIPaddleCollision(ballX, ballY, ballRadius, aiPaddle) {
  const dx = ballX - centerX;
  const dy = ballY - centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ballAngle = Math.atan2(dy, dx);
  // AI paddles use animated radius during ring switch
  const aiPaddleRadius = getAIPaddleRadius(aiPaddle);
  const aiPaddleArc = PADDLE_ARC_BASE;
  const paddleStart = aiPaddle.angle - aiPaddleArc / 2;
  const paddleEnd = aiPaddle.angle + aiPaddleArc / 2;
  const halfThickness = PADDLE_THICKNESS / 2;
  const angleToPaddle = angleDifference(ballAngle, aiPaddle.angle);
  const withinArc = Math.abs(angleToPaddle) <= aiPaddleArc / 2;
  const withinRadius = dist >= aiPaddleRadius - halfThickness - ballRadius &&
                       dist <= aiPaddleRadius + halfThickness + ballRadius;
  if (withinArc && withinRadius) {
    const edgeFactor = Math.abs(angleToPaddle) / (aiPaddleArc / 2);
    const deflectAngle = ballAngle + Math.PI + (angleToPaddle * edgeFactor * 0.5);
    return { hit: true, edgeHit: false, deflectAngle: deflectAngle };
  }
  const startCapX = centerX + Math.cos(paddleStart) * aiPaddleRadius;
  const startCapY = centerY + Math.sin(paddleStart) * aiPaddleRadius;
  const dxStart = ballX - startCapX;
  const dyStart = ballY - startCapY;
  const distStart = Math.sqrt(dxStart * dxStart + dyStart * dyStart);
  if (distStart <= halfThickness + ballRadius) {
    const deflectAngle = Math.atan2(dyStart, dxStart);
    return { hit: true, edgeHit: true, deflectAngle: deflectAngle };
  }
  const endCapX = centerX + Math.cos(paddleEnd) * aiPaddleRadius;
  const endCapY = centerY + Math.sin(paddleEnd) * aiPaddleRadius;
  const dxEnd = ballX - endCapX;
  const dyEnd = ballY - endCapY;
  const distEnd = Math.sqrt(dxEnd * dxEnd + dyEnd * dyEnd);
  if (distEnd <= halfThickness + ballRadius) {
    const deflectAngle = Math.atan2(dyEnd, dxEnd);
    return { hit: true, edgeHit: true, deflectAngle: deflectAngle };
  }
  return { hit: false, edgeHit: false, deflectAngle: 0 };
}

// === GAME LOGIC ===

function update(dt) {
  if (!gameRunning) return;

  gameTime += dt;
  updateParticles(dt);
  updateScreenShake();
  updateCombo(dt);
  updateScorePopups(dt);
  updatePaddleTrail();
  updateWave(dt);
  checkMilestones();
  updateAIPaddles(dt);
  updateAIRingSwitches(dt);

  // Send periodic score updates to parent (every 30 seconds)
  if (window.parent !== window && Date.now() - lastScoreUpdateTime >= 30000) {
    lastScoreUpdateTime = Date.now();
    window.parent.postMessage({
      type: 'SCORE_UPDATE',
      game: 'orbit',
      score: playerScore,
      stats: {
        time: Math.floor(gameTime),
        maxCombo: maxCombo,
        georgeScore: AI_PADDLES[1].score,
        lennieScore: AI_PADDLES[0].score
      }
    }, '*');
  }

  const intensity = Math.min(1, (balls.length / 10) + (waveActive ? 0.3 : 0) + (specialBall ? 0.2 : 0));
  AudioSystem.setMusicIntensity(intensity);

  activePowerups = activePowerups.filter(pu => pu.endTime > gameTime);

  targetPaddleArc = getCurrentPaddleArc();
  const arcDiff = targetPaddleArc - paddleArc;
  paddleArc += arcDiff * Math.min(1, PADDLE_ARC_LERP_SPEED * dt);

  const currentPaddleSpeed = getCurrentPaddleSpeed();
  const ballSpeedMult = getBallSpeedMultiplier();

  let desiredDirection = 0;
  if (keysDown.clockwise && !keysDown.counterClockwise) {
    desiredDirection = 1;
  } else if (keysDown.counterClockwise && !keysDown.clockwise) {
    desiredDirection = -1;
  } else if (isDragging) {
    const diff = angleDifference(targetAngle, paddleAngle);
    if (Math.abs(diff) > 0.01) {
      desiredDirection = diff > 0 ? 1 : -1;
    }
  }

  const maxSpeed = currentPaddleSpeed;
  if (desiredDirection !== 0) {
    const isReversing = (desiredDirection > 0 && paddleVelocity < -0.1) ||
                        (desiredDirection < 0 && paddleVelocity > 0.1);
    if (isReversing) {
      if (paddleVelocity > 0) {
        paddleVelocity = Math.max(0, paddleVelocity - PADDLE_DECELERATION * dt);
      } else {
        paddleVelocity = Math.min(0, paddleVelocity + PADDLE_DECELERATION * dt);
      }
    } else {
      paddleVelocity += desiredDirection * PADDLE_ACCELERATION * dt;
      paddleVelocity = Math.max(-maxSpeed, Math.min(maxSpeed, paddleVelocity));
    }
  } else {
    if (Math.abs(paddleVelocity) < 0.1) {
      paddleVelocity = 0;
    } else if (paddleVelocity > 0) {
      paddleVelocity = Math.max(0, paddleVelocity - PADDLE_DECELERATION * dt);
    } else {
      paddleVelocity = Math.min(0, paddleVelocity + PADDLE_DECELERATION * dt);
    }
  }

  paddleAngle += paddleVelocity * dt;
  paddleAngle = normalizeAngle(paddleAngle);

  if (ringSwitchProgress > 0) {
    ringSwitchProgress += dt / RING_SWITCH_DURATION;
    if (ringSwitchProgress >= 1) {
      ringSwitchProgress = 0;
      paddleRing = ringSwitchTo;
    }
  }

  // Resolve paddle collisions after all paddle positions are updated
  resolvePaddleCollisions(dt);

  // Update paddle proximity detection (for pre-contact force field effect)
  updatePaddleProximities();

  // Audio feedback for proximity tension and clashes
  updateCollisionAudio();

  if (specialBall === null) {
    specialBallTimer += dt;
    if (specialBallTimer >= SPECIAL_BALL_SPAWN_INTERVAL) {
      spawnSpecialBall();
      specialBallTimer = 0;
    }
  }

  const waveSpawnMult = getWaveSpawnRate();
  spawnTimer += dt * 1000 * waveSpawnMult;
  if (spawnTimer >= SPAWN_INTERVAL) {
    if (Math.random() < POWERUP_SPAWN_CHANCE) {
      spawnPowerup();
    } else {
      spawnBall();
    }
    spawnTimer = 0;
    if (waveActive && waveType === 'BOSS' && specialBall === null && Math.random() < 0.3) {
      spawnSpecialBall();
    }
  }

  // Update special ball
  if (specialBall) {
    if (specialBall.spawnProgress < 1) {
      specialBall.spawnProgress = Math.min(1, specialBall.spawnProgress + dt / BALL_SPAWN_DURATION);
    }
    specialBall.age += dt;
    specialBallActiveTime += dt;

    if (specialBallActiveTime >= SPECIAL_BALL_ACTIVE_DURATION && !specialBallReturning) {
      specialBallReadyToReturn = true;
    }

    const dx = specialBall.x - centerX;
    const dy = specialBall.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (specialBallReturning) {
      specialBall.returnTime += dt;
      const gravityRange = arenaRadius * SPECIAL_BALL_GRAVITY_RANGE;
      const claimZone = arenaRadius * SPECIAL_BALL_CLAIM_ZONE;
      const towardCenterX = -dx / dist;
      const towardCenterY = -dy / dist;

      if (specialBallForceCapture) {
        const captureSpeed = SPECIAL_BALL_CAPTURE_SPEED;
        specialBall.vx = towardCenterX * captureSpeed;
        specialBall.vy = towardCenterY * captureSpeed;
      } else {
        if (dist < gravityRange) {
          specialBall.vx += towardCenterX * SPECIAL_BALL_GRAVITY_STRENGTH * dt;
          specialBall.vy += towardCenterY * SPECIAL_BALL_GRAVITY_STRENGTH * dt;
        }
        if (dist < claimZone) {
          specialBallClaimTime += dt;
          if (specialBallClaimTime >= SPECIAL_BALL_CLAIM_TIME) {
            specialBallForceCapture = true;
          }
        } else {
          specialBallClaimTime = 0;
        }
      }

      if (dist < SPECIAL_BALL_SHRINK_START) {
        specialBall.shrinkProgress = 1 - (dist / SPECIAL_BALL_SHRINK_START);
      } else {
        specialBall.shrinkProgress = 0;
      }

      if (dist <= SPECIAL_BALL_CAPTURE_RADIUS) {
        const returnBonus = Math.floor(specialBall.returnTime * 20 * getPointsMultiplier() * getComboMultiplier());
        if (returnBonus > 0) {
          playerScore += returnBonus;
          score = playerScore;
          scoreDisplay.textContent = score;
          spawnScorePopup(centerX, centerY - 30, returnBonus, '#00ff00');
        }
        AudioSystem.playBallCaptured();
        AudioSystem.playMilestone();
        spawnExplosion(centerX, centerY, '#00ff00', 2);
        spawnRingBurst(centerX, centerY, arenaRadius * 0.3, '#00ff00', 50);
        triggerScreenShake(15);
        specialBall = null;
        specialBallTimer = 0;
        specialBallClaimTime = 0;
        specialBallForceCapture = false;
        return;
      }
    }

    if (specialBall.speedMult > 1) {
      specialBall.speedMult = Math.max(1, specialBall.speedMult - BALL_MOMENTUM_DECAY * dt);
    }

    if (specialBall.spin !== 0) {
      const spinAmount = specialBall.spin * dt;
      const cos = Math.cos(spinAmount);
      const sin = Math.sin(spinAmount);
      const newVx = specialBall.vx * cos - specialBall.vy * sin;
      const newVy = specialBall.vx * sin + specialBall.vy * cos;
      specialBall.vx = newVx;
      specialBall.vy = newVy;
      specialBall.spin *= Math.pow(SPIN_DECAY_RATE, dt);
      if (Math.abs(specialBall.spin) < 0.05) specialBall.spin = 0;
    }

    const easeOut = 1 - Math.pow(1 - specialBall.spawnProgress, 3);
    const shrinkMult = specialBall.shrinkProgress ? (1 - specialBall.shrinkProgress) : 1;
    const ballRadius = specialBall.baseRadius * easeOut * shrinkMult;

    const moveScale = specialBall.spawnProgress < 1 ? specialBall.spawnProgress * 0.5 + 0.5 : 1;
    specialBall.x += specialBall.vx * dt * moveScale * ballSpeedMult * specialBall.speedMult;
    specialBall.y += specialBall.vy * dt * moveScale * ballSpeedMult * specialBall.speedMult;

    const dx2 = specialBall.x - centerX;
    const dy2 = specialBall.y - centerY;
    const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    if (specialBall.hitCooldown > 0) {
      specialBall.hitCooldown -= dt;
    }

    if (ballRadius > 2 && specialBall.hitCooldown <= 0) {
      let specialHit = false;

      // Check player paddle collision
      const collision = checkPaddleCollision(specialBall.x, specialBall.y, ballRadius);

      if (collision.hit) {
        specialHit = true;
        if (specialBallReadyToReturn && !specialBallReturning) {
          specialBallReturning = true;
          AudioSystem.playReturnActivated();
          spawnRingBurst(centerX, centerY, arenaRadius * 0.4, '#ff0000', 40);
          triggerScreenShake(10);
        }

        const momentumBoost = 1 + Math.min(Math.abs(paddleVelocity) * 0.15, BALL_MOMENTUM_BOOST - 1);
        const transferBoost = ringSwitchProgress > 0 ? TRANSFER_SPEED_BOOST : 1;
        const speed = BALL_SPEED * 0.8 * momentumBoost * transferBoost;

        specialBall.vx = Math.cos(collision.deflectAngle) * speed;
        specialBall.vy = Math.sin(collision.deflectAngle) * speed;
        specialBall.speedMult = momentumBoost * transferBoost;
        specialBall.hitCooldown = 0.1;
        specialBall.shrinkProgress = 0;

        const basePoints = 50;
        const ageBonus = getAgeBonus(specialBall.age);
        const edgeBonus = collision.edgeHit ? EDGE_HIT_BONUS * 2 : 0;
        const speedBonus = momentumBoost > 1.3 ? Math.floor((momentumBoost - 1) * SPEED_HIT_BONUS * 2) : 0;

        let transferBonus = 0;
        if (ringSwitchProgress > 0) {
          transferBonus = TRANSFER_HIT_BONUS * 2;
          const spinDirection = ringSwitchTo === 0 ? 1 : -1;
          specialBall.spin = TRANSFER_SPIN * spinDirection;
        }

        const totalPoints = Math.floor((basePoints + ageBonus + edgeBonus + speedBonus + transferBonus) * getPointsMultiplier() * getComboMultiplier());
        incrementCombo();
        playerScore += totalPoints;
        score = playerScore;
        scoreDisplay.textContent = score;
        spawnScorePopup(specialBall.x, specialBall.y, totalPoints, '#ff4444');

        spawnExplosion(specialBall.x, specialBall.y, '#ff0000', 1 + momentumBoost * 0.5);
        triggerScreenShake(5 + momentumBoost * 3);
        AudioSystem.playBassHit(1 + momentumBoost * 0.5);
        AudioSystem.playSpecialHit(collision.edgeHit, momentumBoost);
      }

      // Check AI paddle collisions for special ball
      if (!specialHit) {
        for (const ai of AI_PADDLES) {
          const aiCollision = checkAIPaddleCollision(specialBall.x, specialBall.y, ballRadius, ai);
          if (aiCollision.hit) {
            specialHit = true;
            if (specialBallReadyToReturn && !specialBallReturning) {
              specialBallReturning = true;
              AudioSystem.playReturnActivated();
              spawnRingBurst(centerX, centerY, arenaRadius * 0.4, ai.color, 40);
              triggerScreenShake(10);
            }

            const momentumBoost = 1 + Math.min(Math.abs(ai.velocity) * 0.15, BALL_MOMENTUM_BOOST - 1);
            const speed = BALL_SPEED * 0.8 * momentumBoost;

            specialBall.vx = Math.cos(aiCollision.deflectAngle) * speed;
            specialBall.vy = Math.sin(aiCollision.deflectAngle) * speed;
            specialBall.speedMult = momentumBoost;
            specialBall.hitCooldown = 0.1;
            specialBall.shrinkProgress = 0;

            const basePoints = 50;
            const ageBonus = getAgeBonus(specialBall.age);
            const edgeBonus = aiCollision.edgeHit ? EDGE_HIT_BONUS * 2 : 0;
            const totalPoints = Math.floor((basePoints + ageBonus + edgeBonus) * 1);

            ai.score += totalPoints;

            spawnScorePopup(specialBall.x, specialBall.y, totalPoints, ai.color);
            spawnExplosion(specialBall.x, specialBall.y, ai.color, 0.8 + momentumBoost * 0.3);
            AudioSystem.playSpecialHit(aiCollision.edgeHit, momentumBoost * 0.6);
            break;
          }
        }
      }
    }

    if (dist2 >= arenaRadius + ballRadius && specialBall.hitCooldown <= 0) {
      endGame();
      return;
    }
  }

  // Update powerups
  for (let i = powerups.length - 1; i >= 0; i--) {
    const pu = powerups[i];
    if (pu.spawnProgress < 1) {
      pu.spawnProgress = Math.min(1, pu.spawnProgress + dt / BALL_SPAWN_DURATION);
    }
    const moveScale = pu.spawnProgress < 1 ? pu.spawnProgress * 0.5 + 0.5 : 1;
    pu.x += pu.vx * dt * moveScale * ballSpeedMult;
    pu.y += pu.vy * dt * moveScale * ballSpeedMult;

    const dx = pu.x - centerX;
    const dy = pu.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const easeOut = 1 - Math.pow(1 - pu.spawnProgress, 3);
    const puRadius = POWERUP_RADIUS * easeOut;

    if (!pu.escaped) {
      const collision = checkPaddleCollision(pu.x, pu.y, puRadius);
      if (collision.hit) {
        const config = POWERUP_TYPES[pu.type];
        const isNegative = config.negative;
        if (isNegative) {
          AudioSystem.playPowerupBad();
          triggerScreenShake(4);
          spawnExplosion(pu.x, pu.y, config.color, 0.5);
        } else {
          AudioSystem.playPowerupGood();
          triggerScreenShake(3);
          spawnExplosion(pu.x, pu.y, config.color, 0.8);
          const bonus = 25;
          playerScore += bonus;
          score = playerScore;
          scoreDisplay.textContent = score;
          spawnScorePopup(pu.x, pu.y, bonus, config.color);
        }
        activatePowerup(pu.type);
        powerups.splice(i, 1);
        continue;
      } else if (dist >= arenaRadius + puRadius) {
        pu.escaped = true;
      }
    }

    if (pu.escaped) {
      const margin = 50;
      if (pu.x < -margin || pu.x > canvas.width + margin ||
          pu.y < -margin || pu.y > canvas.height + margin) {
        powerups.splice(i, 1);
      }
    }
  }

  // Update regular balls
  for (let i = balls.length - 1; i >= 0; i--) {
    const ball = balls[i];
    if (ball.spawnProgress < 1) {
      ball.spawnProgress = Math.min(1, ball.spawnProgress + dt / BALL_SPAWN_DURATION);
    }
    if (ball.speedMult > 1) {
      ball.speedMult = Math.max(1, ball.speedMult - BALL_MOMENTUM_DECAY * dt);
    }
    if (ball.spin !== 0) {
      const spinAmount = ball.spin * dt;
      const cos = Math.cos(spinAmount);
      const sin = Math.sin(spinAmount);
      const newVx = ball.vx * cos - ball.vy * sin;
      const newVy = ball.vx * sin + ball.vy * cos;
      ball.vx = newVx;
      ball.vy = newVy;
      ball.spin *= Math.pow(SPIN_DECAY_RATE, dt);
      if (Math.abs(ball.spin) < 0.05) ball.spin = 0;
    }
    ball.age += dt;

    const easeOut = 1 - Math.pow(1 - ball.spawnProgress, 3);
    const ballRadius = ball.baseRadius * easeOut;
    const moveScale = ball.spawnProgress < 1 ? ball.spawnProgress * 0.5 + 0.5 : 1;
    ball.x += ball.vx * dt * moveScale * ballSpeedMult * ball.speedMult;
    ball.y += ball.vy * dt * moveScale * ballSpeedMult * ball.speedMult;

    if (ball.hitCooldown > 0) {
      ball.hitCooldown -= dt;
    }

    const dx = ball.x - centerX;
    const dy = ball.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (ball.hitCooldown <= 0 && !ball.escaped) {
      let ballHit = false;

      // Check player paddle collision
      const collision = checkPaddleCollision(ball.x, ball.y, ballRadius);
      if (collision.hit) {
        ballHit = true;
        const momentumBoost = 1 + Math.min(Math.abs(paddleVelocity) * 0.15, BALL_MOMENTUM_BOOST - 1);
        const transferBoost = ringSwitchProgress > 0 ? TRANSFER_SPEED_BOOST : 1;
        const waveSpeed = getWaveBallSpeed();
        const speed = BALL_SPEED * momentumBoost * transferBoost * waveSpeed;

        ball.vx = Math.cos(collision.deflectAngle) * speed;
        ball.vy = Math.sin(collision.deflectAngle) * speed;
        ball.speedMult = momentumBoost * transferBoost;
        ball.hitCooldown = 0.1;

        const basePoints = 10;
        const ageBonus = getAgeBonus(ball.age);
        const edgeBonus = collision.edgeHit ? EDGE_HIT_BONUS : 0;
        const speedBonus = momentumBoost > 1.3 ? Math.floor((momentumBoost - 1) * SPEED_HIT_BONUS) : 0;

        let transferBonus = 0;
        if (ringSwitchProgress > 0) {
          transferBonus = TRANSFER_HIT_BONUS;
          const spinDirection = ringSwitchTo === 0 ? 1 : -1;
          ball.spin = TRANSFER_SPIN * spinDirection;
        }

        const totalPoints = Math.floor((basePoints + ageBonus + edgeBonus + speedBonus + transferBonus) * getPointsMultiplier() * getComboMultiplier());
        incrementCombo();
        playerScore += totalPoints;
        score = playerScore;
        scoreDisplay.textContent = score;

        const popupColor = combo >= 5 ? getComboColor() : '#fff';
        spawnScorePopup(ball.x, ball.y, totalPoints, popupColor);
        const particleColor = collision.edgeHit ? '#ffff00' : '#00ffff';
        spawnExplosion(ball.x, ball.y, particleColor, 0.5 + momentumBoost * 0.3);
        triggerScreenShake(2 + momentumBoost * 2);
        if (momentumBoost > 1.3) {
          AudioSystem.playBassHit(momentumBoost - 1);
        }
        AudioSystem.playPaddleHit(collision.edgeHit, momentumBoost);
      }

      // Check AI paddle collisions
      if (!ballHit) {
        for (const ai of AI_PADDLES) {
          const aiCollision = checkAIPaddleCollision(ball.x, ball.y, ballRadius, ai);
          if (aiCollision.hit) {
            ballHit = true;
            const momentumBoost = 1 + Math.min(Math.abs(ai.velocity) * 0.15, BALL_MOMENTUM_BOOST - 1);
            const waveSpeed = getWaveBallSpeed();
            const speed = BALL_SPEED * momentumBoost * waveSpeed;

            ball.vx = Math.cos(aiCollision.deflectAngle) * speed;
            ball.vy = Math.sin(aiCollision.deflectAngle) * speed;
            ball.speedMult = momentumBoost;
            ball.hitCooldown = 0.1;

            const basePoints = 10;
            const ageBonus = getAgeBonus(ball.age);
            const edgeBonus = aiCollision.edgeHit ? EDGE_HIT_BONUS : 0;
            const totalPoints = Math.floor((basePoints + ageBonus + edgeBonus) * 1);

            ai.score += totalPoints;

            spawnScorePopup(ball.x, ball.y, totalPoints, ai.color);
            spawnExplosion(ball.x, ball.y, ai.color, 0.4 + momentumBoost * 0.2);
            AudioSystem.playPaddleHit(aiCollision.edgeHit, momentumBoost * 0.6);
            break;
          }
        }
      }
    }

    if (!ball.escaped && !ball.nearMissTriggered) {
      const nearMissIntensity = checkNearMiss(ball.x, ball.y, ballRadius);
      if (nearMissIntensity > 0.3) {
        ball.nearMissTriggered = true;
        AudioSystem.playNearMiss(nearMissIntensity);
        const nearMissPoints = Math.floor(nearMissIntensity * 5);
        if (nearMissPoints > 0) {
          playerScore += nearMissPoints;
          score = playerScore;
          spawnScorePopup(ball.x, ball.y, nearMissPoints, '#ff8800');
          spawnParticles(ball.x, ball.y, 5, '#ff8800', 50, 2, 0.2);
        }
      }
    }

    if (dist >= arenaRadius + ballRadius && ball.hitCooldown <= 0) {
      ball.escaped = true;
    }

    if (ball.escaped) {
      const margin = 50;
      if (ball.x < -margin || ball.x > canvas.width + margin ||
          ball.y < -margin || ball.y > canvas.height + margin) {
        balls.splice(i, 1);
      }
    }
  }
}

// === RENDERING ===

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(screenShake.x, screenShake.y);

  if (waveActive) {
    const waveProgress = waveTimer / WAVE_DURATION;
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, arenaRadius * 1.5);
    const alpha = 0.15 * (1 - waveProgress);
    gradient.addColorStop(0, `rgba(255, 0, 0, ${alpha})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  let maxDanger = 0;
  for (const ball of balls) {
    if (ball.escaped) continue;
    const dx = ball.x - centerX;
    const dy = ball.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const danger = dist / arenaRadius;
    if (danger > maxDanger) maxDanger = danger;
  }
  if (specialBall && !specialBallReturning) {
    const dx = specialBall.x - centerX;
    const dy = specialBall.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const danger = dist / arenaRadius;
    if (danger > maxDanger) maxDanger = danger;
  }

  const dangerPulse = maxDanger > 0.7 ? (maxDanger - 0.7) / 0.3 : 0;
  const arenaGlow = 0.3 + Math.sin(gameTime * 2) * 0.1;
  ctx.shadowBlur = 15 + dangerPulse * 20;
  if (dangerPulse > 0) {
    const dangerFlash = Math.sin(gameTime * 12) * 0.5 + 0.5;
    ctx.shadowColor = `rgba(255, ${Math.floor(255 * (1 - dangerPulse))}, 0, ${arenaGlow + dangerPulse * dangerFlash})`;
    ctx.strokeStyle = `rgb(255, ${Math.floor(255 * (1 - dangerPulse * dangerFlash))}, ${Math.floor(255 * (1 - dangerPulse))})`;
  } else {
    ctx.shadowColor = `rgba(0, 255, 255, ${arenaGlow})`;
    ctx.strokeStyle = '#fff';
  }
  ctx.lineWidth = 2 + dangerPulse * 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.arc(centerX, centerY, arenaRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.shadowBlur = 8;
  ctx.shadowColor = 'rgba(100, 100, 255, 0.3)';
  ctx.strokeStyle = '#666';
  ctx.beginPath();
  ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  const centerPulse = 1 + Math.sin(gameTime * 4) * 0.3;
  ctx.shadowBlur = 10 * centerPulse;
  ctx.shadowColor = '#fff';
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 4 * centerPulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  drawPaddleTrail();

  const paddleRadius = getCurrentPaddleRadius();
  const paddleScale = getPaddleTransitionScale();
  const currentThickness = PADDLE_THICKNESS * paddleScale;
  const currentArc = paddleArc * paddleScale;

  if (currentThickness > 0.5 && currentArc > 0.01) {
    const velocityGlow = Math.min(Math.abs(paddleVelocity) / PADDLE_SPEED, 1);
    const inContact = isPlayerInContact();
    const proximityIntensity = getPlayerProximityIntensity();

    // Enhanced glow based on velocity, contact, and proximity
    const contactGlow = inContact ? 15 : 0;
    const proximityGlow = proximityIntensity * 12;
    ctx.shadowBlur = 10 + velocityGlow * 15 + contactGlow + proximityGlow;

    // Color changes based on state
    let paddleColor = '#fff';
    let glowColor = `rgba(0, 255, 255, ${0.5 + velocityGlow * 0.5})`;

    if (inContact) {
      // Subtle warm tint when in contact - not too dramatic
      paddleColor = '#fffaf0';
      glowColor = `rgba(255, 200, 150, 0.8)`;
    } else if (proximityIntensity > 0) {
      // Subtle repulsion glow when approaching
      const glow = proximityIntensity * 0.3;
      paddleColor = `rgb(${255}, ${Math.floor(255 - glow * 30)}, ${Math.floor(255 - glow * 50)})`;
      glowColor = `rgba(255, 220, 180, ${0.4 + proximityIntensity * 0.4})`;
    } else if (combo >= 25) {
      paddleColor = getComboColor();
      glowColor = getComboColor();
    } else if (ringSwitchProgress > 0) {
      paddleColor = '#00ffff';
    }

    ctx.shadowColor = glowColor;
    ctx.strokeStyle = paddleColor;
    ctx.lineWidth = currentThickness;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(centerX, centerY, paddleRadius, paddleAngle - currentArc / 2, paddleAngle + currentArc / 2);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Draw curved player label
    const playerLabelRadius = paddleRadius + 22;
    const labelText = 'YOU';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = '#00ffff';
    ctx.shadowBlur = 3;
    ctx.shadowColor = ctx.fillStyle;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw each character along the arc
    const charSpacing = 0.06;
    const totalWidth = (labelText.length - 1) * charSpacing;
    const startAngle = paddleAngle - totalWidth / 2;

    for (let i = 0; i < labelText.length; i++) {
      const charAngle = startAngle + i * charSpacing;
      const charX = centerX + Math.cos(charAngle) * playerLabelRadius;
      const charY = centerY + Math.sin(charAngle) * playerLabelRadius;

      ctx.save();
      ctx.translate(charX, charY);
      ctx.rotate(charAngle + Math.PI / 2); // Rotate to follow arc
      ctx.fillText(labelText[i], 0, 0);
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }

  // Draw AI paddles
  for (let aiIndex = 0; aiIndex < AI_PADDLES.length; aiIndex++) {
    const ai = AI_PADDLES[aiIndex];
    const aiPaddleRadius = getAIPaddleRadius(ai);
    const aiPaddleArc = PADDLE_ARC_BASE;
    const inContact = isAIInContact(aiIndex);
    const proximityIntensity = getAIProximityIntensity(aiIndex);

    const aiVelocityGlow = Math.min(Math.abs(ai.velocity) / ai.maxSpeed, 1);
    const contactGlow = inContact ? 12 : 0;
    const proximityGlow = proximityIntensity * 10;
    ctx.shadowBlur = 8 + aiVelocityGlow * 10 + contactGlow + proximityGlow;

    // Subtle color changes during contact or proximity
    let aiPaddleColor = ai.color;
    if (inContact) {
      // Slight brightening when in contact
      const baseColor = ai.color === '#88ff88' ? [150, 255, 150] : [255, 150, 150];
      aiPaddleColor = `rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`;
    } else if (proximityIntensity > 0) {
      // Subtle warming when approaching
      const baseColor = ai.color === '#88ff88' ? [136, 255, 136] : [255, 136, 136];
      const r = Math.floor(baseColor[0] + proximityIntensity * 20);
      const g = Math.floor(baseColor[1] + proximityIntensity * 10);
      const b = Math.floor(baseColor[2]);
      aiPaddleColor = `rgb(${Math.min(255, r)}, ${Math.min(255, g)}, ${b})`;
    }

    ctx.shadowColor = aiPaddleColor;
    ctx.strokeStyle = aiPaddleColor;
    ctx.lineWidth = PADDLE_THICKNESS * 0.85;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(centerX, centerY, aiPaddleRadius, ai.angle - aiPaddleArc / 2, ai.angle + aiPaddleArc / 2);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Draw curved AI label
    const aiLabelRadius = aiPaddleRadius + 22;
    const labelText = ai.name;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = ai.color;
    ctx.shadowBlur = 3;
    ctx.shadowColor = ctx.fillStyle;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw each character along the arc
    const charSpacing = 0.055;
    const totalWidth = (labelText.length - 1) * charSpacing;
    const startAngle = ai.angle - totalWidth / 2;

    for (let i = 0; i < labelText.length; i++) {
      const charAngle = startAngle + i * charSpacing;
      const charX = centerX + Math.cos(charAngle) * aiLabelRadius;
      const charY = centerY + Math.sin(charAngle) * aiLabelRadius;

      ctx.save();
      ctx.translate(charX, charY);
      ctx.rotate(charAngle + Math.PI / 2);
      ctx.fillText(labelText[i], 0, 0);
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }

  // Draw proximity force field effects (paddles approaching)
  drawProximityEffects();

  // Draw clash effects (tension glow, sparks)
  drawClashEffects();

  // Draw regular balls
  for (const ball of balls) {
    const easeOut = 1 - Math.pow(1 - ball.spawnProgress, 3);
    const radius = ball.baseRadius * easeOut;
    if (radius < 0.5) continue;

    const maturity = getBallMaturity(ball.age);
    const grayValue = Math.floor(255 * (1 - maturity));
    const fillColor = `rgb(${grayValue}, ${grayValue}, ${grayValue})`;

    const speedGlow = Math.min((ball.speedMult - 1) * 2, 1);
    if (speedGlow > 0.1) {
      ctx.shadowBlur = 10 + speedGlow * 10;
      ctx.shadowColor = `rgba(0, 255, 255, ${speedGlow})`;
    }

    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Draw powerups
  for (const pu of powerups) {
    const easeOut = 1 - Math.pow(1 - pu.spawnProgress, 3);
    const pulse = 1 + Math.sin(gameTime * 8) * 0.15;
    const radius = POWERUP_RADIUS * easeOut * pulse;
    if (radius < 0.5) continue;

    const config = POWERUP_TYPES[pu.type];
    ctx.shadowBlur = 15;
    ctx.shadowColor = config.color;

    ctx.fillStyle = config.color;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#000';
    ctx.font = `${Math.floor(radius)}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const symbol = pu.type.charAt(0);
    ctx.fillText(symbol, pu.x, pu.y + 1);
  }

  // Draw claim zone indicator when returning
  if (specialBall && specialBallReturning && !specialBallForceCapture) {
    const claimZoneRadius = arenaRadius * SPECIAL_BALL_CLAIM_ZONE;
    const claimProgress = specialBallClaimTime / SPECIAL_BALL_CLAIM_TIME;

    ctx.strokeStyle = `rgba(255, 0, 0, ${0.2 + claimProgress * 0.4})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, claimZoneRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (specialBallClaimTime > 0) {
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(centerX, centerY, claimZoneRadius + 8, -Math.PI / 2, -Math.PI / 2 + (claimProgress * Math.PI * 2));
      ctx.stroke();
    }
  }

  // Draw special ball
  if (specialBall) {
    const easeOut = 1 - Math.pow(1 - specialBall.spawnProgress, 3);
    const shrinkMult = specialBall.shrinkProgress ? (1 - specialBall.shrinkProgress) : 1;
    const radius = specialBall.baseRadius * easeOut * shrinkMult;

    if (radius >= 0.5) {
      const maturity = getBallMaturity(specialBall.age);
      const redValue = Math.floor(255 * (1 - maturity * 0.7));

      let pulseScale = 1;
      let glowIntensity = 0.5;
      if (specialBallReturning) {
        const urgency = specialBallClaimTime / SPECIAL_BALL_CLAIM_TIME;
        const pulseSpeed = 8 + urgency * 25;
        pulseScale = 1 + Math.sin(gameTime * pulseSpeed) * (0.05 + urgency * 0.15);
        glowIntensity = 0.8 + urgency * 0.5;
      } else if (specialBallReadyToReturn) {
        pulseScale = 1 + Math.sin(gameTime * 4) * 0.08;
        glowIntensity = 0.6 + Math.sin(gameTime * 4) * 0.2;
      }

      const glowRadius = radius * pulseScale * 2;
      const gradient = ctx.createRadialGradient(
        specialBall.x, specialBall.y, radius * pulseScale * 0.5,
        specialBall.x, specialBall.y, glowRadius
      );
      gradient.addColorStop(0, `rgba(255, 0, 0, ${glowIntensity * 0.4})`);
      gradient.addColorStop(0.5, `rgba(255, 50, 0, ${glowIntensity * 0.2})`);
      gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(specialBall.x, specialBall.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 20 + glowIntensity * 20;
      ctx.shadowColor = specialBallReturning ? '#ff4400' : '#ff0000';

      ctx.fillStyle = `rgb(${redValue}, 0, 0)`;
      ctx.beginPath();
      ctx.arc(specialBall.x, specialBall.y, radius * pulseScale, 0, Math.PI * 2);
      ctx.fill();

      if (specialBallForceCapture) {
        ctx.strokeStyle = Math.sin(gameTime * 30) > 0 ? '#fff' : '#ff0000';
        ctx.shadowColor = '#fff';
      } else {
        ctx.strokeStyle = '#ff0000';
      }
      ctx.lineWidth = 3 * shrinkMult;
      ctx.beginPath();
      ctx.arc(specialBall.x, specialBall.y, radius * pulseScale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (specialBallReturning && specialBall.returnTime > 0) {
        const bonus = Math.floor(specialBall.returnTime * 20);
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillStyle = '#ff6666';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#ff0000';
        ctx.fillText(`+${bonus}`, specialBall.x, specialBall.y - radius - 15);
        ctx.shadowBlur = 0;
      }

      if (specialBall.speedMult > 1.2 && Math.random() < 0.3) {
        spawnParticles(specialBall.x, specialBall.y, 1, '#ff4400', 30, 3, 0.3);
      }
    }
  }

  // Draw active powerup indicators
  if (activePowerups.length > 0) {
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    let y = 60;
    for (const pu of activePowerups) {
      const remaining = Math.ceil(pu.endTime - gameTime);
      const config = POWERUP_TYPES[pu.type];
      const prefix = config.negative ? '! ' : '+ ';
      ctx.fillStyle = config.color;
      ctx.fillText(`${prefix}${pu.type} ${remaining}s`, 20, y);
      y += 18;
    }
  }

  drawParticles();
  drawScorePopups();

  if (combo >= 3) {
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = getComboColor();
    ctx.shadowBlur = 10;
    ctx.shadowColor = getComboColor();
    const comboText = `${combo}x COMBO`;
    ctx.fillText(comboText, centerX, centerY - arenaRadius - 30);
    ctx.shadowBlur = 0;
  }

  if (waveActive) {
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    const waveAlpha = 0.5 + Math.sin(gameTime * 6) * 0.5;
    ctx.fillStyle = `rgba(255, 0, 0, ${waveAlpha})`;
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ff0000';
    ctx.fillText(`WAVE ${currentWave}: ${waveType}`, centerX, centerY + arenaRadius + 40);
    ctx.shadowBlur = 0;
  }

  // Draw mini scoreboard in top right corner
  ctx.save();
  ctx.translate(-screenShake.x, -screenShake.y); // Undo shake for UI

  const scoreboardPadding = 15;
  const scoreboardX = canvas.width - scoreboardPadding;
  const scoreboardY = scoreboardPadding + 12; // +12 for font baseline
  const lineHeight = 20;

  ctx.font = '11px "Press Start 2P", monospace';
  ctx.textAlign = 'right';

  // Player score (white/cyan)
  ctx.fillStyle = '#00ffff';
  ctx.shadowBlur = 5;
  ctx.shadowColor = '#00ffff';
  ctx.fillText(`YOU: ${playerScore}`, scoreboardX, scoreboardY);

  // AI scores
  let yOffset = lineHeight;
  for (const ai of AI_PADDLES) {
    ctx.fillStyle = ai.color;
    ctx.shadowColor = ai.color;
    ctx.fillText(`${ai.name}: ${ai.score}`, scoreboardX, scoreboardY + yOffset);
    yOffset += lineHeight;
  }

  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.restore();
}

// === GAME LOOP ===

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

// === GAME STATE ===

function startGame() {
  AudioSystem.init();

  score = 0;
  playerScore = 0;
  balls = [];
  powerups = [];
  activePowerups = [];
  paddleAngle = -Math.PI / 2;
  targetAngle = paddleAngle;
  paddleVelocity = 0;
  paddleArc = PADDLE_ARC_BASE;
  targetPaddleArc = PADDLE_ARC_BASE;
  paddleRing = 0;
  ringSwitchProgress = 0;
  spawnTimer = 0;
  gameTime = 0;
  specialBall = null;
  specialBallTimer = 0;
  specialBallActiveTime = 0;
  specialBallReadyToReturn = false;
  specialBallReturning = false;
  specialBallClaimTime = 0;
  specialBallForceCapture = false;
  gameRunning = true;
  lastScoreUpdateTime = Date.now();

  // Notify parent window that a new game is starting
  if (window.parent !== window) {
    window.parent.postMessage({
      type: 'GAME_START',
      game: 'orbit'
    }, '*');
  }

  // Reset AI paddles
  AI_PADDLES[0].angle = Math.PI / 6;
  AI_PADDLES[0].velocity = 0;
  AI_PADDLES[0].score = 0;
  AI_PADDLES[0].ring = 0;
  AI_PADDLES[1].angle = Math.PI - Math.PI / 6;
  AI_PADDLES[1].velocity = 0;
  AI_PADDLES[1].score = 0;
  AI_PADDLES[1].ring = 0;

  particles.length = 0;
  scorePopups.length = 0;
  paddleTrail.length = 0;
  paddleContacts = [];
  combo = 0;
  maxCombo = 0;
  lastHitTime = 0;
  currentWave = 0;
  waveTimer = 0;
  waveActive = false;
  screenShake = { x: 0, y: 0, intensity: 0 };
  sentMessages.clear();

  scoreDisplay.textContent = '0';
  gameOverScreen.classList.add('hidden');

  AudioSystem.startMusic();

  setTimeout(() => {
    if (gameRunning) spawnBall();
  }, 500);

  updateRingSwitchButton();
}

function endGame() {
  gameRunning = false;

  AudioSystem.stopMusic();
  AudioSystem.playGameOver();

  if (specialBall) {
    spawnExplosion(specialBall.x, specialBall.y, '#ff0000', 3);
  }
  spawnRingBurst(centerX, centerY, arenaRadius, '#ff0000', 60);
  triggerScreenShake(20);

  finalScoreDisplay.textContent = playerScore;
  gameOverScreen.classList.remove('hidden');

  if (playerScore > highScore) {
    highScore = playerScore;
    localStorage.setItem('orbit_highscore', highScore);
    updateHighScoreDisplay();
  }

  // Send score to Penny's Arcade
  if (window.parent !== window && playerScore > 0) {
    window.parent.postMessage({
      type: 'GAME_OVER',
      game: 'orbit',
      score: playerScore,
      stats: {
        time: Math.floor(gameTime),
        maxCombo: maxCombo,
        georgeScore: AI_PADDLES[1].score,
        lennieScore: AI_PADDLES[0].score
      }
    }, '*');
  }

  updateRingSwitchButton();
}

// === EVENT LISTENERS ===

restartBtn.addEventListener('click', startGame);

if (infoBtn && infoPanel && infoCloseBtn) {
  infoBtn.addEventListener('click', () => {
    infoPanel.classList.remove('hidden');
  });
  infoCloseBtn.addEventListener('click', () => {
    infoPanel.classList.add('hidden');
  });
  infoPanel.addEventListener('click', (e) => {
    if (e.target === infoPanel) {
      infoPanel.classList.add('hidden');
    }
  });
}

if (ringSwitchBtn) {
  // Use touchstart for faster response on mobile (no 300ms delay)
  ringSwitchBtn.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevent ghost click
    if (gameRunning) {
      switchRing();
    }
  }, { passive: false });

  // Fallback click handler for non-touch devices
  ringSwitchBtn.addEventListener('click', () => {
    if (gameRunning) {
      switchRing();
    }
  });
}

function updateRingSwitchButton() {
  if (ringSwitchBtn) {
    if (isMobile && gameRunning) {
      ringSwitchBtn.classList.remove('hidden');
    } else {
      ringSwitchBtn.classList.add('hidden');
    }
  }
}

// === INITIALIZATION ===

// Load high score from local storage
const savedHighScore = localStorage.getItem('orbit_highscore');
if (savedHighScore) {
  highScore = parseInt(savedHighScore, 10);
  updateHighScoreDisplay();
}

// Start the game loop
lastTime = performance.now();
requestAnimationFrame(gameLoop);

// Auto-start the game
startGame();
