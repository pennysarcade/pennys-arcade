// === ORBIT SOLO - Single Player with AI Opponents ===
// A circular pong game with one human-controlled paddle and three AI opponents

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Check for mobile
const urlParams = new URLSearchParams(window.location.search);
const isMobile = urlParams.get('mobile') === 'true' || /Mobi|Android/i.test(navigator.userAgent);

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
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const leaderboardEntries = document.getElementById('leaderboard-entries');

// Player stats
let playerSaves = 0;

// Game constants
const ARENA_RADIUS_RATIO = 0.35;
const INNER_RING_RATIO = 0.82;
const PADDLE_ARC_BASE = 0.18;
const PADDLE_THICKNESS = 16;
const PADDLE_SPEED = 4;
const PADDLE_ACCELERATION = 5;
const PADDLE_DECELERATION = 12;
const RING_SWITCH_DURATION = 0.25;
const BALL_RADIUS = 8;
const BALL_SPEED = 150;
const SPAWN_INTERVAL = 2500;

// Game state
let arenaRadius;
let innerRadius;
let centerX, centerY;
let paddleAngle = -Math.PI / 2;
let targetAngle = paddleAngle;
let paddleArc = PADDLE_ARC_BASE;
let targetPaddleArc = PADDLE_ARC_BASE;
let paddleVelocity = 0;

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
let highScoreHolder = '';
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
const SPECIAL_BALL_SPAWN_INTERVAL = 35;
const SPECIAL_BALL_ACTIVE_DURATION = 15;
const SPECIAL_BALL_RADIUS = 12;
const SPECIAL_BALL_RETURN_DISTANCE = 50;

// Ball spawn and aging
const BALL_SPAWN_DURATION = 0.4;
const BALL_MATURITY_TIME = 12;
const BALL_AGE_BONUS_MAX = 40;

// Power-ups
const POWERUP_SPAWN_CHANCE = 0.12;
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

// === AI PLAYERS ===
const AI_PLAYERS = [
  {
    name: 'Steady',
    color: '#00ff88',
    baseAngle: Math.PI / 2,     // Bottom
    personality: 'defensive',   // Consistent, reliable
    reactionTime: 0.15,         // Delay before reacting
    accuracy: 0.92,             // How accurately they track
    riskTolerance: 0.2,         // Chance to make risky plays
    speed: 3.5,
  },
  {
    name: 'Hotshot',
    color: '#ff4488',
    baseAngle: Math.PI,          // Left
    personality: 'aggressive',   // Fast reactions, takes risks
    reactionTime: 0.08,
    accuracy: 0.85,
    riskTolerance: 0.6,
    speed: 5,
  },
  {
    name: 'Chaos',
    color: '#ffaa00',
    baseAngle: 0,                // Right
    personality: 'unpredictable', // Random behavior
    reactionTime: 0.2,
    accuracy: 0.75,
    riskTolerance: 0.8,
    speed: 4,
  }
];

let aiPaddles = [];

class AIPaddle {
  constructor(config, index) {
    this.name = config.name;
    this.color = config.color;
    this.baseAngle = config.baseAngle;
    this.angle = config.baseAngle;
    this.targetAngle = config.baseAngle;
    this.personality = config.personality;
    this.reactionTime = config.reactionTime;
    this.accuracy = config.accuracy;
    this.riskTolerance = config.riskTolerance;
    this.maxSpeed = config.speed;
    this.velocity = 0;
    this.arc = PADDLE_ARC_BASE;
    this.ring = 0;
    this.ringSwitchProgress = 0;
    this.ringSwitchFrom = 0;
    this.ringSwitchTo = 0;
    this.index = index;
    this.lastDecisionTime = 0;
    this.currentTarget = null;
    this.saves = 0;
    this.misses = 0;
    this.streakSaves = 0;
    this.bestStreak = 0;
    this.randomOffset = 0;
    this.lastRandomUpdate = 0;
  }

  update(dt) {
    // Update ring switch animation
    if (this.ringSwitchProgress > 0) {
      this.ringSwitchProgress += dt / RING_SWITCH_DURATION;
      if (this.ringSwitchProgress >= 1) {
        this.ringSwitchProgress = 0;
        this.ring = this.ringSwitchTo;
      }
    }

    // AI decision making
    this.makeDecision(dt);

    // Movement physics
    const angleDiff = angleDifference(this.targetAngle, this.angle);
    let desiredDirection = 0;

    if (Math.abs(angleDiff) > 0.02) {
      desiredDirection = angleDiff > 0 ? 1 : -1;
    }

    if (desiredDirection !== 0) {
      this.velocity += desiredDirection * PADDLE_ACCELERATION * dt;
      this.velocity = Math.max(-this.maxSpeed, Math.min(this.maxSpeed, this.velocity));
    } else {
      if (Math.abs(this.velocity) < 0.1) {
        this.velocity = 0;
      } else if (this.velocity > 0) {
        this.velocity = Math.max(0, this.velocity - PADDLE_DECELERATION * dt);
      } else {
        this.velocity = Math.min(0, this.velocity + PADDLE_DECELERATION * dt);
      }
    }

    this.angle += this.velocity * dt;
    this.angle = normalizeAngle(this.angle);
  }

  makeDecision(dt) {
    // Only make decisions at intervals based on reaction time
    if (gameTime - this.lastDecisionTime < this.reactionTime) return;
    this.lastDecisionTime = gameTime;

    // Update random offset for unpredictable AI
    if (this.personality === 'unpredictable' && gameTime - this.lastRandomUpdate > 0.5) {
      this.randomOffset = (Math.random() - 0.5) * 0.3;
      this.lastRandomUpdate = gameTime;
    }

    // Find the most threatening ball for this AI's sector
    let bestTarget = null;
    let bestThreat = 0;

    const myRadius = this.getCurrentRadius();
    const sectorStart = this.baseAngle - Math.PI / 3;
    const sectorEnd = this.baseAngle + Math.PI / 3;

    // Check regular balls
    for (const ball of balls) {
      if (ball.escaped) continue;

      const dx = ball.x - centerX;
      const dy = ball.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ballAngle = Math.atan2(dy, dx);

      // Check if ball is in our sector
      const inSector = this.isAngleInSector(ballAngle, sectorStart, sectorEnd);
      if (!inSector) continue;

      // Calculate threat level based on distance and velocity toward edge
      const velTowardEdge = (ball.vx * dx + ball.vy * dy) / dist;
      const timeToEdge = velTowardEdge > 0 ? (arenaRadius - dist) / velTowardEdge : Infinity;
      const threat = velTowardEdge > 0 ? (1 / (timeToEdge + 0.5)) * (dist / arenaRadius) : 0;

      if (threat > bestThreat) {
        bestThreat = threat;
        bestTarget = { ball, angle: ballAngle, dist, type: 'regular' };
      }
    }

    // Check special ball
    if (specialBall && !specialBallReturning) {
      const dx = specialBall.x - centerX;
      const dy = specialBall.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ballAngle = Math.atan2(dy, dx);

      const inSector = this.isAngleInSector(ballAngle, sectorStart, sectorEnd);
      if (inSector) {
        const velTowardEdge = (specialBall.vx * dx + specialBall.vy * dy) / dist;
        const threat = velTowardEdge > 0 ? (2 / ((arenaRadius - dist) / velTowardEdge + 0.5)) : 0;

        if (threat > bestThreat) {
          bestThreat = threat;
          bestTarget = { ball: specialBall, angle: ballAngle, dist, type: 'special' };
        }
      }
    }

    this.currentTarget = bestTarget;

    if (bestTarget) {
      // Add accuracy variation
      const accuracyError = (1 - this.accuracy) * (Math.random() - 0.5) * 0.4;

      // Personality-specific behavior
      let targetOffset = 0;
      switch (this.personality) {
        case 'aggressive':
          // Try to hit with edge for bonus points
          if (Math.random() < this.riskTolerance) {
            targetOffset = (Math.random() > 0.5 ? 1 : -1) * this.arc * 0.4;
          }
          break;
        case 'unpredictable':
          targetOffset = this.randomOffset;
          break;
        case 'defensive':
          // Stay centered on ball
          targetOffset = 0;
          break;
      }

      this.targetAngle = bestTarget.angle + accuracyError + targetOffset;

      // Ring switching logic for aggressive AI
      if (this.personality === 'aggressive' && bestTarget.dist < arenaRadius * 0.6) {
        if (Math.random() < this.riskTolerance * 0.3 && this.ringSwitchProgress <= 0) {
          this.switchRing();
        }
      }
    } else {
      // No immediate threat - return to base position
      this.targetAngle = this.baseAngle + Math.sin(gameTime * 0.5) * 0.1;
    }
  }

  isAngleInSector(angle, start, end) {
    const normalizedAngle = normalizeAngle(angle);
    const normalizedStart = normalizeAngle(start);
    const normalizedEnd = normalizeAngle(end);

    if (normalizedStart < normalizedEnd) {
      return normalizedAngle >= normalizedStart && normalizedAngle <= normalizedEnd;
    } else {
      return normalizedAngle >= normalizedStart || normalizedAngle <= normalizedEnd;
    }
  }

  switchRing() {
    if (this.ringSwitchProgress > 0) return;
    const targetRing = this.ring === 0 ? 1 : 0;
    this.ringSwitchFrom = this.ring;
    this.ringSwitchTo = targetRing;
    this.ringSwitchProgress = 0.001;
  }

  getCurrentRadius() {
    if (this.ringSwitchProgress <= 0) {
      return this.ring === 0 ? arenaRadius : innerRadius;
    }
    const fromRadius = this.ringSwitchFrom === 0 ? arenaRadius : innerRadius;
    const toRadius = this.ringSwitchTo === 0 ? arenaRadius : innerRadius;
    return fromRadius + (toRadius - fromRadius) * this.ringSwitchProgress;
  }

  checkCollision(ballX, ballY, ballRadius) {
    const dx = ballX - centerX;
    const dy = ballY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ballAngle = Math.atan2(dy, dx);

    const paddleRadius = this.getCurrentRadius();
    const halfThickness = PADDLE_THICKNESS / 2;

    const angleToPaddle = angleDifference(ballAngle, this.angle);
    const withinArc = Math.abs(angleToPaddle) <= this.arc / 2;
    const withinRadius = dist >= paddleRadius - halfThickness - ballRadius &&
                         dist <= paddleRadius + halfThickness + ballRadius;

    if (withinArc && withinRadius) {
      const edgeFactor = Math.abs(angleToPaddle) / (this.arc / 2);
      const deflectAngle = ballAngle + Math.PI + (angleToPaddle * edgeFactor * 0.5);
      return { hit: true, edgeHit: false, deflectAngle, aiIndex: this.index };
    }

    // Check paddle end caps
    const paddleStart = this.angle - this.arc / 2;
    const paddleEnd = this.angle + this.arc / 2;

    const startCapX = centerX + Math.cos(paddleStart) * paddleRadius;
    const startCapY = centerY + Math.sin(paddleStart) * paddleRadius;
    const dxStart = ballX - startCapX;
    const dyStart = ballY - startCapY;
    const distStart = Math.sqrt(dxStart * dxStart + dyStart * dyStart);

    if (distStart <= halfThickness + ballRadius) {
      const deflectAngle = Math.atan2(dyStart, dxStart);
      return { hit: true, edgeHit: true, deflectAngle, aiIndex: this.index };
    }

    const endCapX = centerX + Math.cos(paddleEnd) * paddleRadius;
    const endCapY = centerY + Math.sin(paddleEnd) * paddleRadius;
    const dxEnd = ballX - endCapX;
    const dyEnd = ballY - endCapY;
    const distEnd = Math.sqrt(dxEnd * dxEnd + dyEnd * dyEnd);

    if (distEnd <= halfThickness + ballRadius) {
      const deflectAngle = Math.atan2(dyEnd, dxEnd);
      return { hit: true, edgeHit: true, deflectAngle, aiIndex: this.index };
    }

    return { hit: false, edgeHit: false, deflectAngle: 0, aiIndex: this.index };
  }

  draw() {
    const paddleRadius = this.getCurrentRadius();

    // Glow effect
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;

    ctx.strokeStyle = this.color;
    ctx.lineWidth = PADDLE_THICKNESS;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(centerX, centerY, paddleRadius, this.angle - this.arc / 2, this.angle + this.arc / 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw name label near paddle
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.color;
    const labelX = centerX + Math.cos(this.angle) * (paddleRadius + 30);
    const labelY = centerY + Math.sin(this.angle) * (paddleRadius + 30);
    ctx.fillText(this.name, labelX, labelY);
  }

  recordSave() {
    this.saves++;
    this.streakSaves++;
    if (this.streakSaves > this.bestStreak) {
      this.bestStreak = this.streakSaves;
    }
  }

  recordMiss() {
    this.misses++;
    this.streakSaves = 0;
  }
}

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

  playAIHit(aiColor) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    // Different tones for different AI
    const freqMap = { '#00ff88': 330, '#ff4488': 440, '#ffaa00': 380 };
    const freq = freqMap[aiColor] || 400;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.7, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
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
    sendTickerMessage(`TEAM COMBO x${combo}!`, 'celebration');
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

function checkMilestones() {
  const scoreMilestones = [1000, 2500, 5000, 10000, 25000, 50000, 100000];
  for (const milestone of scoreMilestones) {
    const key = `score_${milestone}`;
    if (score >= milestone && !sentMessages.has(key)) {
      sentMessages.add(key);
      AudioSystem.playMilestone();
      spawnRingBurst(centerX, centerY, arenaRadius * 0.4, '#ffff00', 50);
      triggerScreenShake(10);
      sendTickerMessage(`${milestone} points! Keep it up!`, 'celebration');
    }
  }
}

// Input state
let isDragging = false;
let keysDown = { clockwise: false, counterClockwise: false };

function updateHighScoreDisplay() {
  if (highScore > 0) {
    const holderText = highScoreHolder ? ` (${highScoreHolder})` : '';
    highScoreDisplay.textContent = `HIGH SCORE: ${highScore}${holderText}`;
  }
}

// === PARENT WINDOW MESSAGING ===
// Listen for high score data from parent window
window.addEventListener('message', (event) => {
  if (event.data?.type === 'HIGH_SCORE_DATA') {
    highScore = event.data.score || 0;
    highScoreHolder = event.data.username || '';
    updateHighScoreDisplay();
  }
});

function sendGameStart() {
  if (window.parent !== window) {
    window.parent.postMessage({
      type: 'GAME_START',
      game: 'orbit-solo'
    }, '*');
  }
}

function sendGameOver() {
  if (window.parent !== window && score > 0) {
    window.parent.postMessage({
      type: 'GAME_OVER',
      game: 'orbit-solo',
      score: score,
      stats: {
        time: Math.floor(gameTime),
        maxCombo: maxCombo,
        aiStats: aiPaddles.map(ai => ({
          name: ai.name,
          saves: ai.saves,
          misses: ai.misses,
          bestStreak: ai.bestStreak
        }))
      }
    }, '*');
  }
}

function sendScoreUpdate() {
  if (window.parent !== window && Date.now() - lastScoreUpdateTime >= 30000) {
    lastScoreUpdateTime = Date.now();
    window.parent.postMessage({
      type: 'SCORE_UPDATE',
      game: 'orbit-solo',
      score: score,
      stats: {
        time: Math.floor(gameTime),
        combo: combo,
        balls: balls.length
      }
    }, '*');
  }
}

// Ticker message rate limiting
const tickerCooldowns = {};
const TICKER_COOLDOWN = 10000; // 10 seconds between similar messages

function sendTickerMessage(message, level = 'info') {
  if (window.parent === window) return;

  // Rate limit similar messages
  const key = message.substring(0, 20);
  const now = Date.now();
  if (tickerCooldowns[key] && now - tickerCooldowns[key] < TICKER_COOLDOWN) return;
  tickerCooldowns[key] = now;

  window.parent.postMessage({
    type: 'TICKER_MESSAGE',
    game: 'orbit-solo',
    message: message,
    level: level,
    priority: 'low'
  }, '*');
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

function switchRing() {
  if (ringSwitchProgress > 0) return;
  const targetRing = paddleRing === 0 ? 1 : 0;
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
  balls.push({
    x: centerX,
    y: centerY,
    vx: Math.cos(angle) * BALL_SPEED,
    vy: Math.sin(angle) * BALL_SPEED,
    baseRadius: BALL_RADIUS,
    spawnProgress: 0,
    age: 0,
    speedMult: 1,
    hitCooldown: 0,
    escaped: false,
    spin: 0,
    nearMissTriggered: false,
    lastHitBy: null // Track who hit it last
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
    spin: 0,
    lastHitBy: null
  };
  specialBallActiveTime = 0;
  specialBallReadyToReturn = false;
  specialBallReturning = false;
  specialBallClaimTime = 0;
  specialBallForceCapture = false;
  AudioSystem.playSpecialSpawn();
  spawnExplosion(centerX, centerY, '#ff0000', 1.5);
  triggerScreenShake(8);
  sendTickerMessage('RED BALL spawned! Keep it in!', 'warning');
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
    return { hit: false, edgeHit: false, deflectAngle: 0, isPlayer: false };
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
    return { hit: true, edgeHit: false, deflectAngle: deflectAngle, isPlayer: true };
  }
  const startCapX = centerX + Math.cos(paddleStart) * paddleRadius;
  const startCapY = centerY + Math.sin(paddleStart) * paddleRadius;
  const dxStart = ballX - startCapX;
  const dyStart = ballY - startCapY;
  const distStart = Math.sqrt(dxStart * dxStart + dyStart * dyStart);
  if (distStart <= halfThickness + ballRadius) {
    const deflectAngle = Math.atan2(dyStart, dxStart);
    return { hit: true, edgeHit: true, deflectAngle: deflectAngle, isPlayer: true };
  }
  const endCapX = centerX + Math.cos(paddleEnd) * paddleRadius;
  const endCapY = centerY + Math.sin(paddleEnd) * paddleRadius;
  const dxEnd = ballX - endCapX;
  const dyEnd = ballY - endCapY;
  const distEnd = Math.sqrt(dxEnd * dxEnd + dyEnd * dyEnd);
  if (distEnd <= halfThickness + ballRadius) {
    const deflectAngle = Math.atan2(dyEnd, dxEnd);
    return { hit: true, edgeHit: true, deflectAngle: deflectAngle, isPlayer: true };
  }
  return { hit: false, edgeHit: false, deflectAngle: 0, isPlayer: false };
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
  checkMilestones();
  sendScoreUpdate();

  const intensity = Math.min(1, (balls.length / 10) + (specialBall ? 0.2 : 0));
  AudioSystem.setMusicIntensity(intensity);

  activePowerups = activePowerups.filter(pu => pu.endTime > gameTime);

  targetPaddleArc = getCurrentPaddleArc();
  const arcDiff = targetPaddleArc - paddleArc;
  paddleArc += arcDiff * Math.min(1, PADDLE_ARC_LERP_SPEED * dt);

  const currentPaddleSpeed = getCurrentPaddleSpeed();
  const ballSpeedMult = getBallSpeedMultiplier();

  // Update AI paddles
  for (const ai of aiPaddles) {
    ai.update(dt);
  }

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

  if (specialBall === null) {
    specialBallTimer += dt;
    if (specialBallTimer >= SPECIAL_BALL_SPAWN_INTERVAL) {
      spawnSpecialBall();
      specialBallTimer = 0;
    }
  }

  spawnTimer += dt * 1000;
  if (spawnTimer >= SPAWN_INTERVAL) {
    if (Math.random() < POWERUP_SPAWN_CHANCE) {
      spawnPowerup();
    } else {
      spawnBall();
    }
    spawnTimer = 0;
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
          score += returnBonus;
          scoreDisplay.textContent = score;
          spawnScorePopup(centerX, centerY - 30, returnBonus, '#00ff00');
        }
        AudioSystem.playBallCaptured();
        AudioSystem.playMilestone();
        spawnExplosion(centerX, centerY, '#00ff00', 2);
        spawnRingBurst(centerX, centerY, arenaRadius * 0.3, '#00ff00', 50);
        triggerScreenShake(15);
        sendTickerMessage(`RED BALL captured! +${returnBonus} bonus!`, 'celebration');
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
      // Check player paddle collision
      let collision = checkPaddleCollision(specialBall.x, specialBall.y, ballRadius);

      // Check AI paddle collisions if player didn't hit
      if (!collision.hit) {
        for (const ai of aiPaddles) {
          const aiCollision = ai.checkCollision(specialBall.x, specialBall.y, ballRadius);
          if (aiCollision.hit) {
            collision = aiCollision;
            collision.isPlayer = false;
            collision.aiPaddle = ai;
            break;
          }
        }
      }

      if (collision.hit) {
        if (specialBallReadyToReturn && !specialBallReturning) {
          specialBallReturning = true;
          AudioSystem.playReturnActivated();
          spawnRingBurst(centerX, centerY, arenaRadius * 0.4, '#ff0000', 40);
          triggerScreenShake(10);
        }

        const momentumBoost = collision.isPlayer ?
          1 + Math.min(Math.abs(paddleVelocity) * 0.15, BALL_MOMENTUM_BOOST - 1) :
          1 + Math.min(Math.abs(collision.aiPaddle?.velocity || 0) * 0.15, BALL_MOMENTUM_BOOST - 1);
        const transferBoost = (collision.isPlayer && ringSwitchProgress > 0) ? TRANSFER_SPEED_BOOST : 1;
        const speed = BALL_SPEED * 0.8 * momentumBoost * transferBoost;

        specialBall.vx = Math.cos(collision.deflectAngle) * speed;
        specialBall.vy = Math.sin(collision.deflectAngle) * speed;
        specialBall.speedMult = momentumBoost * transferBoost;
        specialBall.hitCooldown = 0.1;
        specialBall.shrinkProgress = 0;
        specialBall.lastHitBy = collision.isPlayer ? 'player' : collision.aiPaddle?.name;

        if (collision.isPlayer) {
          playerSaves++;
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
          score += totalPoints;
          scoreDisplay.textContent = score;
          spawnScorePopup(specialBall.x, specialBall.y, totalPoints, '#ff4444');

          spawnExplosion(specialBall.x, specialBall.y, '#ff0000', 1 + momentumBoost * 0.5);
          triggerScreenShake(5 + momentumBoost * 3);
          AudioSystem.playBassHit(1 + momentumBoost * 0.5);
          AudioSystem.playSpecialHit(collision.edgeHit, momentumBoost);
        } else {
          // AI hit
          const ai = collision.aiPaddle;
          ai.recordSave();
          incrementCombo();

          // AI hits give reduced points
          const basePoints = 25;
          const totalPoints = Math.floor(basePoints * getPointsMultiplier() * getComboMultiplier());
          score += totalPoints;
          scoreDisplay.textContent = score;
          spawnScorePopup(specialBall.x, specialBall.y, totalPoints, ai.color);

          spawnExplosion(specialBall.x, specialBall.y, ai.color, 0.8);
          triggerScreenShake(4);
          AudioSystem.playAIHit(ai.color);

          if (ai.streakSaves === 5) {
            sendTickerMessage(`${ai.name} is on fire! 5 saves in a row!`, 'info');
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
      // Check player collision
      let collision = checkPaddleCollision(pu.x, pu.y, puRadius);

      // Check AI collisions if player didn't hit
      if (!collision.hit) {
        for (const ai of aiPaddles) {
          const aiCollision = ai.checkCollision(pu.x, pu.y, puRadius);
          if (aiCollision.hit) {
            collision = aiCollision;
            collision.isPlayer = false;
            break;
          }
        }
      }

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
          if (collision.isPlayer) {
            const bonus = 25;
            score += bonus;
            scoreDisplay.textContent = score;
            spawnScorePopup(pu.x, pu.y, bonus, config.color);
          }
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
      // Check player paddle collision
      let collision = checkPaddleCollision(ball.x, ball.y, ballRadius);

      // Check AI paddle collisions if player didn't hit
      if (!collision.hit) {
        for (const ai of aiPaddles) {
          const aiCollision = ai.checkCollision(ball.x, ball.y, ballRadius);
          if (aiCollision.hit) {
            collision = aiCollision;
            collision.isPlayer = false;
            collision.aiPaddle = ai;
            break;
          }
        }
      }

      if (collision.hit) {
        const momentumBoost = collision.isPlayer ?
          1 + Math.min(Math.abs(paddleVelocity) * 0.15, BALL_MOMENTUM_BOOST - 1) :
          1 + Math.min(Math.abs(collision.aiPaddle?.velocity || 0) * 0.15, BALL_MOMENTUM_BOOST - 1);
        const transferBoost = (collision.isPlayer && ringSwitchProgress > 0) ? TRANSFER_SPEED_BOOST : 1;
        const speed = BALL_SPEED * momentumBoost * transferBoost;

        ball.vx = Math.cos(collision.deflectAngle) * speed;
        ball.vy = Math.sin(collision.deflectAngle) * speed;
        ball.speedMult = momentumBoost * transferBoost;
        ball.hitCooldown = 0.1;
        ball.lastHitBy = collision.isPlayer ? 'player' : collision.aiPaddle?.name;

        if (collision.isPlayer) {
          playerSaves++;
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
          score += totalPoints;
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
        } else {
          // AI hit - reduced points
          const ai = collision.aiPaddle;
          ai.recordSave();
          incrementCombo();

          const basePoints = 5;
          const totalPoints = Math.floor(basePoints * getPointsMultiplier() * getComboMultiplier());
          score += totalPoints;
          scoreDisplay.textContent = score;
          spawnScorePopup(ball.x, ball.y, totalPoints, ai.color);

          spawnExplosion(ball.x, ball.y, ai.color, 0.4);
          triggerScreenShake(2);
          AudioSystem.playAIHit(ai.color);
        }
      }
    }

    if (!ball.escaped && !ball.nearMissTriggered && collision?.isPlayer !== false) {
      const nearMissIntensity = checkNearMiss(ball.x, ball.y, ballRadius);
      if (nearMissIntensity > 0.3) {
        ball.nearMissTriggered = true;
        AudioSystem.playNearMiss(nearMissIntensity);
        const nearMissPoints = Math.floor(nearMissIntensity * 5);
        if (nearMissPoints > 0) {
          score += nearMissPoints;
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

  // Draw AI paddles
  for (const ai of aiPaddles) {
    ai.draw();
  }

  // Draw player paddle
  const paddleRadius = getCurrentPaddleRadius();
  const paddleScale = getPaddleTransitionScale();
  const currentThickness = PADDLE_THICKNESS * paddleScale;
  const currentArc = paddleArc * paddleScale;

  if (currentThickness > 0.5 && currentArc > 0.01) {
    const velocityGlow = Math.min(Math.abs(paddleVelocity) / PADDLE_SPEED, 1);
    ctx.shadowBlur = 10 + velocityGlow * 15;
    ctx.shadowColor = combo >= 5 ? getComboColor() : `rgba(0, 255, 255, ${0.5 + velocityGlow * 0.5})`;

    if (combo >= 25) {
      ctx.strokeStyle = getComboColor();
    } else if (ringSwitchProgress > 0) {
      ctx.strokeStyle = '#00ffff';
    } else {
      ctx.strokeStyle = '#fff';
    }

    ctx.lineWidth = currentThickness;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(centerX, centerY, paddleRadius, paddleAngle - currentArc / 2, paddleAngle + currentArc / 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw "YOU" label
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#00ffff';
    const labelX = centerX + Math.cos(paddleAngle) * (paddleRadius + 30);
    const labelY = centerY + Math.sin(paddleAngle) * (paddleRadius + 30);
    ctx.fillText('YOU', labelX, labelY);
  }

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
  playerSaves = 0;
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

  particles.length = 0;
  scorePopups.length = 0;
  paddleTrail.length = 0;
  combo = 0;
  maxCombo = 0;
  lastHitTime = 0;
  screenShake = { x: 0, y: 0, intensity: 0 };
  sentMessages.clear();

  // Initialize AI paddles
  aiPaddles = AI_PLAYERS.map((config, index) => new AIPaddle(config, index));

  scoreDisplay.textContent = '0';
  gameOverScreen.classList.add('hidden');
  if (startScreen) startScreen.classList.add('hidden');

  AudioSystem.startMusic();
  sendGameStart();

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

  finalScoreDisplay.textContent = score;

  // Build leaderboard data
  const leaderboardData = [
    { name: 'YOU', saves: playerSaves, color: '#0ff', isPlayer: true },
    ...aiPaddles.map(ai => ({ name: ai.name, saves: ai.saves, color: ai.color, isPlayer: false }))
  ];

  // Sort by saves descending
  leaderboardData.sort((a, b) => b.saves - a.saves);

  // Populate leaderboard
  if (leaderboardEntries) {
    leaderboardEntries.innerHTML = leaderboardData.map((entry, index) => `
      <div class="leaderboard-entry ${entry.isPlayer ? 'player' : ''}" style="color: ${entry.color}">
        <span class="rank">#${index + 1}</span>
        <span class="name">${entry.name}</span>
        <span class="saves">${entry.saves} saves</span>
      </div>
    `).join('');
  }

  gameOverScreen.classList.remove('hidden');

  // Calculate local high score
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('orbit_solo_highscore', highScore);
    updateHighScoreDisplay();
  }

  sendGameOver();
  updateRingSwitchButton();
}

// === EVENT LISTENERS ===

restartBtn.addEventListener('click', startGame);

if (startBtn) {
  startBtn.addEventListener('click', startGame);
}

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
const savedHighScore = localStorage.getItem('orbit_solo_highscore');
if (savedHighScore) {
  highScore = parseInt(savedHighScore, 10);
  updateHighScoreDisplay();
}

// Start the game loop (renders start screen)
lastTime = performance.now();
requestAnimationFrame(gameLoop);
