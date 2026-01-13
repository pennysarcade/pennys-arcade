// ============================================
// ONZAC - Arcade Zombie Survival
// ============================================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Mobile mode detection - check if loaded from mobile site via query parameter
const isMobileMode = new URLSearchParams(window.location.search).get('mobile') === 'true';

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  safeZoneSize: 200,
  uninfectedAmount: 12,
  baseSpawnRate: 1200,
  minSpawnRate: 400,
  baseZombieSpeed: { min: 0.1, max: 0.25 },
  maxZombieSpeed: { min: 0.35, max: 0.6 },
  difficultyRampTime: 150000,
  particleCount: 12,
  powerUpChance: 0.06,
  comboWindow: 2000,

  // Turret settings
  turretEnergy: 100,
  turretEnergyRegen: 1.5, // Reduced from 6 for more challenge
  turretKillBonus: 8,

  // Flamethrower settings (primary weapon)
  flameFireRate: 50, // ms between shots
  flameCost: 2, // energy per shot
  flameSpeed: 8,
  flameLife: 0.4,
  flameSpread: 0.3,

  // Ball cannon settings (secondary weapon)
  ballChargeTime: 1500,
  ballMinCost: 10,
  ballMaxCost: 40,

  // Chain lightning settings (third weapon)
  lightningFireRate: 400, // ms between shots
  lightningCost: 45,
  lightningRange: 300, // max range to first target
  lightningChainRange: 120, // range between chain targets
  lightningMaxChains: 4, // max enemies to chain to

  // Black hole settings
  blackHolePointsRequired: 5000,
  blackHoleDuration: 40000, // 40 seconds
  blackHolePullRange: 350, // Large gravitational reach
  blackHolePullStrength: 4, // Strong pull force
  blackHoleKillRange: 50, // Bigger kill zone
};

// ============================================
// GAME STATE
// ============================================
let gameState = {
  score: 0,
  highScore: 0,
  highScoreHolder: '',
  combo: 0,
  maxCombo: 0,
  lastKillTime: 0,
  zombiesKilled: 0,
  gameStartTime: Date.now(),
  lastSpawnTime: 0,
  gameOver: false,
  timerText: "0s",
  difficulty: 0,
  screenShake: 0,
  screenShakeX: 0,
  screenShakeY: 0,

  // Weapon state
  currentWeapon: 'ball', // 'ball', 'flame', or 'lightning'

  // Black hole powerup
  blackHolesAvailable: 0,
  lastBlackHoleScoreThreshold: 0,

  // Restart cooldown
  gameOverTime: 0,
  restartCooldown: 2000, // 2 seconds
};

// Listen for high score data from parent window
window.addEventListener('message', (event) => {
  if (event.data?.type === 'HIGH_SCORE_DATA') {
    gameState.highScore = event.data.score || 0;
    gameState.highScoreHolder = event.data.username || '';
    updateHighScoreDisplay();
  }
});

function updateHighScoreDisplay() {
  const el = document.getElementById('onzac-highscore');
  if (el) {
    if (gameState.highScore > 0 && gameState.highScoreHolder) {
      el.textContent = `HIGH SCORE: ${gameState.highScore} (${gameState.highScoreHolder})`;
    } else {
      el.textContent = `HIGH SCORE: ${gameState.highScore}`;
    }
  }
}

// ============================================
// ENTITY ARRAYS
// ============================================
const uninfectedTriangles = [];
const zombies = [];
const projectiles = [];
const particles = [];
const powerUps = [];
const floatingTexts = [];
const blackHoles = [];
const lightningBolts = []; // Visual effect for chain lightning

// ============================================
// INPUT STATE
// ============================================
const input = {
  mouseX: 0,
  mouseY: 0,
  mouseDown: false,
  keys: {},
};

// ============================================
// AUDIO SYSTEM
// ============================================
const AudioSystem = {
  ctx: null,
  enabled: true,
  masterGain: null,
  musicGain: null,
  sfxGain: null,
  isPlaying: false,

  init() {
    if (this.ctx) {
      // Resume if suspended (required for mobile browsers)
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Resume immediately for mobile browsers
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      // Set up gain nodes
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.12;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.5;
      this.sfxGain.connect(this.masterGain);
    } catch (e) {
      this.enabled = false;
    }
  },

  startMusic() {
    if (this.isPlaying || !this.enabled || !this.ctx) return;
    this.isPlaying = true;

    // Dark, ominous zombie music
    // Deep bass drone with unsettling minor progression
    const baseNotes = [55, 65.41, 73.42, 82.41]; // A1, C2, D2, E2 - dark minor feel
    const tempo = 0.3; // Slower, more ominous
    let noteIndex = 0;

    const playNote = () => {
      if (!this.isPlaying || !this.ctx) return;

      // Deep bass drone
      const bassOsc = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      bassOsc.type = 'sawtooth';
      bassOsc.frequency.value = baseNotes[noteIndex % baseNotes.length];
      bassOsc.detune.value = Math.random() * 20 - 10;
      bassGain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      bassGain.gain.setTargetAtTime(0.02, this.ctx.currentTime, tempo * 0.8);
      bassOsc.connect(bassGain);
      bassGain.connect(this.musicGain);
      bassOsc.start();
      bassOsc.stop(this.ctx.currentTime + tempo * 0.9);

      // Eerie high pad (every other note)
      if (noteIndex % 2 === 0) {
        const padOsc = this.ctx.createOscillator();
        const padGain = this.ctx.createGain();
        padOsc.type = 'sine';
        padOsc.frequency.value = baseNotes[noteIndex % baseNotes.length] * 4 + Math.random() * 10;
        padGain.gain.setValueAtTime(0.03, this.ctx.currentTime);
        padGain.gain.setTargetAtTime(0.01, this.ctx.currentTime, tempo * 0.5);
        padOsc.connect(padGain);
        padGain.connect(this.musicGain);
        padOsc.start();
        padOsc.stop(this.ctx.currentTime + tempo * 0.6);
      }

      // Random dissonant accent (occasional)
      if (Math.random() < 0.15) {
        const accentOsc = this.ctx.createOscillator();
        const accentGain = this.ctx.createGain();
        accentOsc.type = 'square';
        accentOsc.frequency.value = 110 + Math.random() * 50;
        accentGain.gain.setValueAtTime(0.04, this.ctx.currentTime);
        accentGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
        accentOsc.connect(accentGain);
        accentGain.connect(this.musicGain);
        accentOsc.start();
        accentOsc.stop(this.ctx.currentTime + 0.15);
      }

      noteIndex++;

      // Change progression every 8 notes
      if (noteIndex % 8 === 0) {
        const progressions = [
          [55, 65.41, 73.42, 82.41],   // Am feel
          [51.91, 61.74, 69.30, 77.78], // G#m feel
          [58.27, 69.30, 77.78, 87.31], // Bbm feel
          [49, 58.27, 65.41, 73.42],   // Gm feel
        ];
        const progIndex = Math.floor(noteIndex / 8) % progressions.length;
        baseNotes.splice(0, 4, ...progressions[progIndex]);
      }

      setTimeout(playNote, tempo * 1000);
    };

    playNote();
  },

  stopMusic() {
    this.isPlaying = false;
  },

  play(type) {
    if (!this.enabled || !this.ctx) return;

    const oscillator = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    const now = this.ctx.currentTime;

    switch(type) {
      case 'flame':
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(100 + Math.random() * 50, now);
        oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.08);
        gainNode.gain.setValueAtTime(0.06, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        oscillator.start(now);
        oscillator.stop(now + 0.08);
        break;
      case 'ballShoot':
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(300, now);
        oscillator.frequency.exponentialRampToValueAtTime(150, now + 0.15);
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        oscillator.start(now);
        oscillator.stop(now + 0.15);
        break;
      case 'ballCharged':
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(200, now);
        oscillator.frequency.exponentialRampToValueAtTime(400, now + 0.1);
        oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.25);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        oscillator.start(now);
        oscillator.stop(now + 0.25);
        break;
      case 'charging':
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(200, now);
        oscillator.frequency.linearRampToValueAtTime(600, now + 0.1);
        gainNode.gain.setValueAtTime(0.05, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        oscillator.start(now);
        oscillator.stop(now + 0.1);
        break;
      case 'weaponSwitch':
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(400, now);
        oscillator.frequency.setValueAtTime(600, now + 0.05);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        oscillator.start(now);
        oscillator.stop(now + 0.1);
        break;
      case 'survivorShoot':
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(800, now);
        oscillator.frequency.exponentialRampToValueAtTime(400, now + 0.05);
        gainNode.gain.setValueAtTime(0.08, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        oscillator.start(now);
        oscillator.stop(now + 0.05);
        break;
      case 'survivorHit':
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(300, now);
        oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.2);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        oscillator.start(now);
        oscillator.stop(now + 0.2);
        break;
      case 'survivorZombified':
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(400, now);
        oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.6);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        oscillator.start(now);
        oscillator.stop(now + 0.6);
        break;
      case 'survivorDestroyed':
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(150, now);
        oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.4);
        gainNode.gain.setValueAtTime(0.25, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        oscillator.start(now);
        oscillator.stop(now + 0.4);
        break;
      case 'reload':
        oscillator.frequency.setValueAtTime(200, now);
        oscillator.frequency.setValueAtTime(400, now + 0.1);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        oscillator.start(now);
        oscillator.stop(now + 0.2);
        break;
      case 'swap':
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(200, now);
        oscillator.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        oscillator.frequency.exponentialRampToValueAtTime(200, now + 0.2);
        oscillator.frequency.exponentialRampToValueAtTime(800, now + 0.3);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        oscillator.start(now);
        oscillator.stop(now + 0.3);
        break;
      case 'swapWarning':
        oscillator.frequency.setValueAtTime(440, now);
        oscillator.frequency.setValueAtTime(880, now + 0.1);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        oscillator.start(now);
        oscillator.stop(now + 0.15);
        break;
      case 'kill':
        oscillator.frequency.setValueAtTime(400, now);
        oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        oscillator.start(now);
        oscillator.stop(now + 0.1);
        break;
      case 'combo':
        oscillator.frequency.setValueAtTime(600, now);
        oscillator.frequency.exponentialRampToValueAtTime(1000, now + 0.15);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        oscillator.start(now);
        oscillator.stop(now + 0.15);
        break;
      case 'infect':
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(200, now);
        oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.3);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        oscillator.start(now);
        oscillator.stop(now + 0.3);
        break;
      case 'powerup':
        oscillator.frequency.setValueAtTime(400, now);
        oscillator.frequency.setValueAtTime(600, now + 0.1);
        oscillator.frequency.setValueAtTime(800, now + 0.2);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        oscillator.start(now);
        oscillator.stop(now + 0.3);
        break;
      case 'gameover':
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(300, now);
        oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.8);
        gainNode.gain.setValueAtTime(0.25, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        oscillator.start(now);
        oscillator.stop(now + 0.8);
        break;
      case 'empty':
        oscillator.frequency.setValueAtTime(100, now);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        oscillator.start(now);
        oscillator.stop(now + 0.05);
        break;
      case 'lightning':
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(800, now);
        oscillator.frequency.exponentialRampToValueAtTime(200, now + 0.1);
        oscillator.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
        oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.25);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        oscillator.start(now);
        oscillator.stop(now + 0.25);
        break;
      case 'blackhole':
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(80, now);
        oscillator.frequency.exponentialRampToValueAtTime(40, now + 0.5);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        oscillator.start(now);
        oscillator.stop(now + 0.5);
        break;
      case 'blackholeReady':
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(300, now);
        oscillator.frequency.setValueAtTime(400, now + 0.1);
        oscillator.frequency.setValueAtTime(500, now + 0.2);
        oscillator.frequency.setValueAtTime(600, now + 0.3);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        oscillator.start(now);
        oscillator.stop(now + 0.4);
        break;
    }
  }
};

// Initialize audio on first user interaction (click or touch)
const initAudioOnInteraction = () => {
  AudioSystem.init();
};
document.addEventListener('click', initAudioOnInteraction, { once: true });
document.addEventListener('touchstart', initAudioOnInteraction, { once: true });

// ============================================
// CANVAS SETUP
// ============================================
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// ============================================
// WELCOME SCREEN SETUP
// ============================================
let gameStarted = false;
let paused = false;
let pauseStartTime = 0;
let totalPausedTime = 0;

const welcomeScreen = document.createElement('div');
welcomeScreen.id = 'onzac-welcome';
// Different instructions for mobile vs desktop
const instructionsText = isMobileMode
  ? 'Protect the survivors. Tap weapon button to switch.'
  : 'Protect the survivors. Space to switch weapons.<br>Every 20k points: Black Hole [B]';
welcomeScreen.innerHTML = `
  <h1>ONZAC</h1>
  <div class="instructions">${instructionsText}</div>
  <div id="onzac-highscore" class="highscore">HIGH SCORE: 0</div>
  <button id="onzac-start">Start</button>
`;
document.body.appendChild(welcomeScreen);

function hideWelcomeScreen() {
  welcomeScreen.style.display = 'none';
}

function showWelcomeScreen() {
  welcomeScreen.style.display = 'flex';
  updateHighScoreDisplay();
}

// ============================================
// MOBILE WEAPON SWITCH BUTTON
// ============================================
let mobileWeaponBtn = null;
if (isMobileMode) {
  mobileWeaponBtn = document.createElement('button');
  mobileWeaponBtn.id = 'mobile-weapon-btn';
  mobileWeaponBtn.innerHTML = 'BALL';
  mobileWeaponBtn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 70px;
    height: 70px;
    border-radius: 50%;
    background: rgba(0, 255, 255, 0.3);
    border: 3px solid #00ffff;
    color: #00ffff;
    font-family: monospace;
    font-size: 12px;
    font-weight: bold;
    z-index: 1000;
    touch-action: manipulation;
    display: none;
  `;
  document.body.appendChild(mobileWeaponBtn);

  mobileWeaponBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!gameState.gameOver && gameStarted) {
      switchWeapon();
      // Update button text and color based on current weapon
      const weaponNames = { ball: 'BALL', flame: 'FLAME', lightning: 'BOLT' };
      const weaponColors = { ball: '#00ffff', flame: '#ff4400', lightning: '#ffff00' };
      mobileWeaponBtn.innerHTML = weaponNames[gameState.currentWeapon];
      mobileWeaponBtn.style.borderColor = weaponColors[gameState.currentWeapon];
      mobileWeaponBtn.style.color = weaponColors[gameState.currentWeapon];
      mobileWeaponBtn.style.background = weaponColors[gameState.currentWeapon] + '33';
    }
  });
}

function showMobileWeaponBtn() {
  if (mobileWeaponBtn) mobileWeaponBtn.style.display = 'block';
}

function hideMobileWeaponBtn() {
  if (mobileWeaponBtn) mobileWeaponBtn.style.display = 'none';
}

// ============================================
// TURRET CLASS (centered, dual weapon)
// ============================================
class Turret {
  constructor() {
    this.x = canvas.width / 2;
    this.y = canvas.height / 2;
    this.angle = -Math.PI / 2;
    this.size = 35;
    this.energy = CONFIG.turretEnergy;
    this.maxEnergy = CONFIG.turretEnergy;
    this.lastShotTime = 0;
    this.barrelLength = 30;
    this.recoil = 0;

    // Ball cannon charge system
    this.chargeStartTime = 0;
    this.isCharging = false;
    this.chargeLevel = 0;
    this.lastChargeSoundTime = 0;

    // Lightning last shot time
    this.lastLightningTime = 0;
  }

  update() {
    // Regenerate energy (slower now)
    this.energy = Math.min(this.maxEnergy, this.energy + CONFIG.turretEnergyRegen / 60);

    // Update position to stay centered
    this.x = canvas.width / 2;
    this.y = canvas.height / 2;

    // Reduce recoil
    this.recoil *= 0.85;

    // Aim at mouse
    this.angle = Math.atan2(input.mouseY - this.y, input.mouseX - this.x);

    if (gameState.currentWeapon === 'flame') {
      this.updateFlamethrower();
    } else if (gameState.currentWeapon === 'lightning') {
      this.updateLightning();
    } else {
      this.updateBallCannon();
    }
  }

  updateFlamethrower() {
    this.isCharging = false;
    this.chargeLevel = 0;

    if (input.mouseDown) {
      this.shootFlame();
    }
  }

  updateBallCannon() {
    if (input.mouseDown) {
      if (!this.isCharging) {
        this.isCharging = true;
        this.chargeStartTime = Date.now();
      }

      const chargeTime = Date.now() - this.chargeStartTime;
      this.chargeLevel = Math.min(1, chargeTime / CONFIG.ballChargeTime);

      if (this.chargeLevel < 1 && Date.now() - this.lastChargeSoundTime > 200) {
        if (this.chargeLevel > 0.3) {
          AudioSystem.play('charging');
          this.lastChargeSoundTime = Date.now();
        }
      }
    } else if (this.isCharging) {
      this.shootBall();
      this.isCharging = false;
      this.chargeLevel = 0;
    }
  }

  updateLightning() {
    this.isCharging = false;
    this.chargeLevel = 0;

    if (input.mouseDown) {
      this.shootLightning();
    }
  }

  shootLightning() {
    const now = Date.now();
    if (now - this.lastLightningTime < CONFIG.lightningFireRate) return;

    if (this.energy >= CONFIG.lightningCost) {
      // Find nearest zombie in range and direction
      const barrelX = this.x + Math.cos(this.angle) * this.barrelLength;
      const barrelY = this.y + Math.sin(this.angle) * this.barrelLength;

      // Find zombies in a cone in front of the turret
      let targets = [];
      let firstTarget = null;
      let firstDist = CONFIG.lightningRange;

      for (const zombie of zombies) {
        const dx = zombie.x - barrelX;
        const dy = zombie.y - barrelY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONFIG.lightningRange) {
          // Check if zombie is roughly in firing direction
          const angleToZombie = Math.atan2(dy, dx);
          let angleDiff = Math.abs(angleToZombie - this.angle);
          if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

          if (angleDiff < Math.PI / 3) { // 60 degree cone
            if (dist < firstDist) {
              firstDist = dist;
              firstTarget = zombie;
            }
          }
        }
      }

      if (firstTarget) {
        this.energy -= CONFIG.lightningCost;
        this.lastLightningTime = now;
        this.recoil = 4;

        // Build chain of targets
        targets.push(firstTarget);
        let lastTarget = firstTarget;
        const hitSet = new Set([firstTarget]);

        for (let i = 0; i < CONFIG.lightningMaxChains - 1; i++) {
          let nextTarget = null;
          let nextDist = CONFIG.lightningChainRange;

          for (const zombie of zombies) {
            if (hitSet.has(zombie)) continue;

            const dx = zombie.x - lastTarget.x;
            const dy = zombie.y - lastTarget.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < nextDist) {
              nextDist = dist;
              nextTarget = zombie;
            }
          }

          if (nextTarget) {
            targets.push(nextTarget);
            hitSet.add(nextTarget);
            lastTarget = nextTarget;
          } else {
            break;
          }
        }

        // Create lightning bolt visual
        const points = [{ x: barrelX, y: barrelY }];
        for (const target of targets) {
          points.push({ x: target.x, y: target.y });
        }
        lightningBolts.push(new LightningBolt(points));

        // Damage all targets
        for (let i = targets.length - 1; i >= 0; i--) {
          const target = targets[i];
          const zombieIndex = zombies.indexOf(target);
          if (zombieIndex !== -1) {
            killZombie(target, zombieIndex);
          }
        }

        AudioSystem.play('lightning');
        triggerScreenShake(4);
      } else {
        // No target - fire into empty space
        AudioSystem.play('empty');
      }
    } else {
      AudioSystem.play('empty');
    }
  }

  shootFlame() {
    const now = Date.now();
    if (now - this.lastShotTime < CONFIG.flameFireRate) return;

    if (this.energy >= CONFIG.flameCost) {
      this.energy -= CONFIG.flameCost;
      this.lastShotTime = now;
      this.recoil = 2;

      const barrelX = this.x + Math.cos(this.angle) * this.barrelLength;
      const barrelY = this.y + Math.sin(this.angle) * this.barrelLength;

      // Spawn multiple flame particles with spread
      for (let i = 0; i < 3; i++) {
        const spreadAngle = this.angle + (Math.random() - 0.5) * CONFIG.flameSpread;
        projectiles.push(new FlameProjectile(barrelX, barrelY, spreadAngle));
      }

      AudioSystem.play('flame');
    } else {
      AudioSystem.play('empty');
    }
  }

  shootBall() {
    const shotCost = CONFIG.ballMinCost + (CONFIG.ballMaxCost - CONFIG.ballMinCost) * this.chargeLevel;

    if (this.energy >= shotCost) {
      this.energy -= shotCost;
      this.recoil = 5 + this.chargeLevel * 10;

      const barrelX = this.x + Math.cos(this.angle) * this.barrelLength;
      const barrelY = this.y + Math.sin(this.angle) * this.barrelLength;

      projectiles.push(new BallProjectile(barrelX, barrelY, this.angle, this.chargeLevel));

      if (this.chargeLevel > 0.7) {
        AudioSystem.play('ballCharged');
      } else {
        AudioSystem.play('ballShoot');
      }

      const particleCount = 3 + Math.floor(this.chargeLevel * 8);
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle(barrelX, barrelY, getRandomColor(), 2 + this.chargeLevel * 3, 2 + this.chargeLevel * 2));
      }
    } else {
      AudioSystem.play('empty');
    }
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const isFlame = gameState.currentWeapon === 'flame';
    const isLightning = gameState.currentWeapon === 'lightning';
    const glowColor = isFlame ? '#FF6600' : (isLightning ? '#8888FF' : '#00FFFF');

    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 20;

    // Base (larger, centered)
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(0, 0, this.size * 0.9, 0, Math.PI * 2);
    ctx.fill();

    // Inner ring
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, this.size * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // Barrel with recoil
    ctx.fillStyle = isFlame ? '#FF4400' : (isLightning ? '#6666CC' : '#4ECDC4');
    ctx.fillRect(-5, -10, this.barrelLength - this.recoil, 20);

    // Barrel tip - different for each weapon
    if (isFlame) {
      // Flamethrower nozzle (wider)
      ctx.fillStyle = '#FF6600';
      ctx.beginPath();
      ctx.moveTo(this.barrelLength - 10 - this.recoil, -12);
      ctx.lineTo(this.barrelLength + 5 - this.recoil, -18);
      ctx.lineTo(this.barrelLength + 5 - this.recoil, 18);
      ctx.lineTo(this.barrelLength - 10 - this.recoil, 12);
      ctx.closePath();
      ctx.fill();
    } else if (isLightning) {
      // Lightning coil tip
      ctx.fillStyle = '#8888FF';
      ctx.fillRect(this.barrelLength - 12 - this.recoil, -10, 8, 20);

      // Tesla coil rings
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(this.barrelLength - 4 - this.recoil + i * 6, 0, 8 - i * 2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(136, 136, 255, ${0.8 - i * 0.2})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Spark effect at tip
      if (Math.random() < 0.3) {
        ctx.beginPath();
        const sparkX = this.barrelLength + 8 - this.recoil;
        const sparkY = (Math.random() - 0.5) * 10;
        ctx.moveTo(sparkX, sparkY);
        ctx.lineTo(sparkX + 10 + Math.random() * 5, sparkY + (Math.random() - 0.5) * 15);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    } else {
      // Ball cannon tip
      ctx.fillStyle = '#00FFFF';
      ctx.fillRect(this.barrelLength - 12 - this.recoil, -12, 12, 24);

      // Charge indicator
      if (this.isCharging && this.chargeLevel > 0.1) {
        const chargeSize = 5 + this.chargeLevel * 18;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + this.chargeLevel * 0.5})`;
        ctx.shadowColor = '#FFFFFF';
        ctx.shadowBlur = 20 + this.chargeLevel * 30;
        ctx.beginPath();
        ctx.arc(this.barrelLength + 8, 0, chargeSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.shadowBlur = 0;

    // Energy ring
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, this.size + 5, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * this.energy / this.maxEnergy));
    ctx.stroke();

    // Background energy ring
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, this.size + 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    // Draw weapon indicator below turret
    ctx.save();
    ctx.font = "bold 10px 'Press Start 2P'";
    ctx.textAlign = 'center';
    ctx.fillStyle = glowColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 10;
    const weaponName = isFlame ? 'FLAME' : (isLightning ? 'LIGHTNING' : 'BALL');
    ctx.fillText(weaponName, this.x, this.y + this.size + 25);
    ctx.restore();
  }

  addEnergy(amount) {
    this.energy = Math.min(this.maxEnergy, this.energy + amount);
  }
}

// ============================================
// FLAME PROJECTILE CLASS (paint/flamethrower style)
// ============================================
class FlameProjectile {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;

    // Paint-like colors (oranges, yellows, reds)
    const flameColors = ['#FF4400', '#FF6600', '#FF8800', '#FFAA00', '#FFCC00', '#FF2200'];
    this.baseColor = flameColors[Math.floor(Math.random() * flameColors.length)];
    this.color = this.baseColor;

    // Variable size for paint splatter effect
    this.radius = 8 + Math.random() * 12;
    this.initialRadius = this.radius;

    // Speed with some variation
    this.speed = CONFIG.flameSpeed + (Math.random() - 0.5) * 2;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;

    // Short life for flame effect
    this.life = CONFIG.flameLife + Math.random() * 0.2;
    this.maxLife = this.life;
    this.decay = 0.02 + Math.random() * 0.01;

    this.trail = [];
    this.wobble = Math.random() * Math.PI * 2;
    this.type = 'flame';
  }

  update() {
    // Trail for paint streak effect
    if (this.trail.length > 8) this.trail.shift();
    this.trail.push({ x: this.x, y: this.y, r: this.radius * this.life, a: this.life });

    this.x += this.vx;
    this.y += this.vy;

    // Slight wobble for organic flame feel
    this.wobble += 0.3;
    this.vx += Math.sin(this.wobble) * 0.1;
    this.vy += Math.cos(this.wobble) * 0.1;

    // Slow down slightly
    this.vx *= 0.98;
    this.vy *= 0.98;

    // Grow then shrink
    const lifeRatio = this.life / this.maxLife;
    if (lifeRatio > 0.7) {
      this.radius = this.initialRadius * (1 + (1 - lifeRatio) * 2);
    } else {
      this.radius = this.initialRadius * lifeRatio * 1.5;
    }

    this.life -= this.decay;

    // Die at screen edges
    if (this.x < -this.radius || this.x > canvas.width + this.radius ||
        this.y < -this.radius || this.y > canvas.height + this.radius) {
      this.life = 0;
    }
  }

  draw() {
    ctx.save();

    // Draw trail (paint streak)
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      const alpha = (i / this.trail.length) * 0.4 * t.a;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = `${this.baseColor}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`;
      ctx.fill();
    }

    ctx.globalAlpha = this.life;

    // Outer glow
    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius * 1.5);
    gradient.addColorStop(0, `${this.baseColor}80`);
    gradient.addColorStop(0.5, `${this.baseColor}40`);
    gradient.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Main blob
    ctx.shadowColor = this.baseColor;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();

    // Hot center
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.globalAlpha = this.life * 0.6;
    ctx.fill();

    ctx.restore();
  }

  isDead() {
    return this.life <= 0;
  }

  collidesWith(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < this.radius + (other.size || other.radius || 10) / 2;
  }
}

// ============================================
// BALL PROJECTILE CLASS (charged shots)
// ============================================
class BallProjectile {
  constructor(x, y, angle, chargeLevel) {
    this.x = x;
    this.y = y;
    this.chargeLevel = chargeLevel;
    this.baseColor = getRandomColor();
    this.color = `${this.baseColor}CC`;

    // Size scales with charge
    this.radius = 12 + chargeLevel * 25;

    // Speed slightly slower for bigger shots
    this.speed = 5 - chargeLevel * 1.5;
    this.vx = Math.cos(angle) * this.speed + (Math.random() - 0.5) * 0.3;
    this.vy = Math.sin(angle) * this.speed + (Math.random() - 0.5) * 0.3;

    // Life scales with charge
    this.life = 1;
    this.decay = 0.003 / (0.5 + chargeLevel * 0.5);

    // Only charged shots bounce
    this.canBounce = chargeLevel > 0.3;
    this.bouncesLeft = chargeLevel > 0.7 ? 3 : chargeLevel > 0.3 ? 1 : 0;

    this.trail = [];
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.type = 'ball';
  }

  update() {
    // Trail
    if (this.trail.length > 6 + Math.floor(this.chargeLevel * 4)) this.trail.shift();
    this.trail.push({ x: this.x, y: this.y, r: this.radius });

    this.x += this.vx;
    this.y += this.vy;

    // Slow drift
    const drift = 0.998 - this.chargeLevel * 0.003;
    this.vx *= drift;
    this.vy *= drift;

    this.pulsePhase += 0.15;
    this.life -= this.decay;

    // Bounce off walls
    if (this.canBounce && this.bouncesLeft > 0) {
      if (this.x - this.radius < 0 || this.x + this.radius > canvas.width) {
        this.vx *= -0.9;
        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        this.bouncesLeft--;
      }
      if (this.y - this.radius < 0 || this.y + this.radius > canvas.height) {
        this.vy *= -0.9;
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));
        this.bouncesLeft--;
      }
    } else {
      if (this.x < -this.radius || this.x > canvas.width + this.radius ||
          this.y < -this.radius || this.y > canvas.height + this.radius) {
        this.life = 0;
      }
    }
  }

  draw() {
    ctx.save();
    ctx.globalAlpha = this.life;

    // Trail
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      const alpha = (i / this.trail.length) * 0.25;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = `${this.baseColor}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`;
      ctx.fill();
    }

    // Glow
    const glowMult = 1.3 + this.chargeLevel * 0.4;
    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius * glowMult);
    gradient.addColorStop(0, `${this.baseColor}50`);
    gradient.addColorStop(0.5, `${this.baseColor}20`);
    gradient.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * glowMult, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Main circle
    const pulse = Math.sin(this.pulsePhase) * (2 + this.chargeLevel * 2);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + pulse, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();

    // Highlight
    ctx.beginPath();
    ctx.arc(this.x - this.radius * 0.3, this.y - this.radius * 0.3, this.radius * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();

    ctx.restore();
  }

  isDead() {
    return this.life <= 0;
  }

  collidesWith(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < this.radius + (other.size || other.radius || 10) / 2;
  }
}

// ============================================
// LIGHTNING BOLT CLASS (visual effect)
// ============================================
class LightningBolt {
  constructor(points) {
    this.points = points; // Array of {x, y} points
    this.life = 1;
    this.decay = 0.08;
  }

  update() {
    this.life -= this.decay;
  }

  draw() {
    if (this.points.length < 2) return;

    ctx.save();
    ctx.globalAlpha = this.life;

    // Draw multiple jagged lines for thickness
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      ctx.moveTo(this.points[0].x, this.points[0].y);

      for (let i = 1; i < this.points.length; i++) {
        const prev = this.points[i - 1];
        const curr = this.points[i];

        // Add jagged intermediate points
        const segments = 3;
        for (let s = 1; s <= segments; s++) {
          const t = s / segments;
          const midX = prev.x + (curr.x - prev.x) * t;
          const midY = prev.y + (curr.y - prev.y) * t;
          const jitter = (layer === 0) ? 0 : (10 - layer * 3) * (Math.random() - 0.5);
          ctx.lineTo(midX + jitter, midY + jitter);
        }
      }

      ctx.strokeStyle = layer === 0 ? '#FFFFFF' : (layer === 1 ? '#88FFFF' : '#4488FF');
      ctx.lineWidth = layer === 0 ? 3 : (layer === 1 ? 6 : 10);
      ctx.shadowColor = '#00FFFF';
      ctx.shadowBlur = 20;
      ctx.stroke();
    }

    // Draw impact points
    for (let i = 1; i < this.points.length; i++) {
      const p = this.points[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${this.life * 0.8})`;
      ctx.fill();
    }

    ctx.restore();
  }

  isDead() {
    return this.life <= 0;
  }
}

// ============================================
// BLACK HOLE CLASS
// ============================================
class BlackHole {
  constructor(x, y, targetX, targetY) {
    this.x = x;
    this.y = y;
    this.targetX = targetX;
    this.targetY = targetY;
    this.radius = 25;
    this.life = CONFIG.blackHoleDuration;
    this.maxLife = CONFIG.blackHoleDuration;
    this.phase = Math.random() * Math.PI * 2;
    this.driftSpeed = 1.5;

    // Calculate direction to center
    const dx = targetX - x;
    const dy = targetY - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    this.vx = (dx / dist) * this.driftSpeed;
    this.vy = (dy / dist) * this.driftSpeed;

    this.zombiesConsumed = 0;
  }

  update() {
    this.life -= 16.67; // ~60fps
    this.phase += 0.1;

    // Drift toward target
    this.x += this.vx;
    this.y += this.vy;

    // Slow down as it gets closer to target
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 100) {
      this.vx *= 0.98;
      this.vy *= 0.98;
    }

    // Prevent entering safe zone - push away if too close
    const safeZone = getSafeZoneCoordinates();
    const safeBuffer = CONFIG.safeZoneSize / 2 + this.radius + CONFIG.blackHolePullRange;
    const centerX = safeZone.x + CONFIG.safeZoneSize / 2;
    const centerY = safeZone.y + CONFIG.safeZoneSize / 2;
    const toCenterX = this.x - centerX;
    const toCenterY = this.y - centerY;
    const distToCenter = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);

    if (distToCenter < safeBuffer) {
      // Push away from center
      const pushStrength = (safeBuffer - distToCenter) * 0.1;
      this.x += (toCenterX / distToCenter) * pushStrength;
      this.y += (toCenterY / distToCenter) * pushStrength;
      // Stop drifting toward center
      this.vx *= 0.5;
      this.vy *= 0.5;
    }

    // Pull and consume zombies
    // Reuse centerX/centerY from above, add safeZoneRadius for mobile check
    const safeZoneRadius = CONFIG.safeZoneSize / 2 + 20; // Buffer around safe zone

    for (let i = zombies.length - 1; i >= 0; i--) {
      const zombie = zombies[i];
      const zdx = this.x - zombie.x;
      const zdy = this.y - zombie.y;
      const zdist = Math.sqrt(zdx * zdx + zdy * zdy);

      if (zdist < CONFIG.blackHoleKillRange) {
        // Consume zombie
        spawnParticles(zombie.x, zombie.y, zombie.color, 8);
        gameState.score += 2;
        gameState.zombiesKilled++;
        this.zombiesConsumed++;
        zombies.splice(i, 1);
        triggerScreenShake(2);
      } else if (zdist < CONFIG.blackHolePullRange) {
        // Calculate potential new position
        const pullStrength = CONFIG.blackHolePullStrength * (1 - zdist / CONFIG.blackHolePullRange);
        const newX = zombie.x + (zdx / zdist) * pullStrength;
        const newY = zombie.y + (zdy / zdist) * pullStrength;

        // On mobile, don't pull zombies if it would drag them through the safe zone
        if (isMobileMode) {
          const distToSafeZone = Math.sqrt(
            Math.pow(newX - centerX, 2) + Math.pow(newY - centerY, 2)
          );
          // Only pull if zombie won't enter safe zone area
          if (distToSafeZone > safeZoneRadius) {
            zombie.x = newX;
            zombie.y = newY;
          }
        } else {
          // Desktop: normal pull behavior
          zombie.x = newX;
          zombie.y = newY;
        }
      }
    }
  }

  draw() {
    ctx.save();

    const lifeRatio = this.life / this.maxLife;
    const fadeAlpha = lifeRatio < 0.2 ? lifeRatio / 0.2 : 1;

    // Outer pull effect
    const pullGradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, CONFIG.blackHolePullRange);
    pullGradient.addColorStop(0, `rgba(128, 0, 255, ${0.3 * fadeAlpha})`);
    pullGradient.addColorStop(0.5, `rgba(64, 0, 128, ${0.15 * fadeAlpha})`);
    pullGradient.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(this.x, this.y, CONFIG.blackHolePullRange, 0, Math.PI * 2);
    ctx.fillStyle = pullGradient;
    ctx.fill();

    // Swirling rings
    for (let i = 0; i < 3; i++) {
      const ringRadius = this.radius * (1.5 + i * 0.5) + Math.sin(this.phase + i) * 5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, ringRadius, this.phase + i * 2, this.phase + i * 2 + Math.PI * 1.5);
      ctx.strokeStyle = `rgba(180, 100, 255, ${(0.5 - i * 0.15) * fadeAlpha})`;
      ctx.lineWidth = 3 - i;
      ctx.stroke();
    }

    // Core
    const coreGradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
    coreGradient.addColorStop(0, `rgba(0, 0, 0, ${fadeAlpha})`);
    coreGradient.addColorStop(0.7, `rgba(40, 0, 80, ${fadeAlpha})`);
    coreGradient.addColorStop(1, `rgba(128, 0, 255, ${0.5 * fadeAlpha})`);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = coreGradient;
    ctx.shadowColor = '#8800FF';
    ctx.shadowBlur = 30;
    ctx.fill();

    // Inner bright ring
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.8, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 200, 255, ${0.6 * fadeAlpha})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  isDead() {
    return this.life <= 0;
  }
}

// ============================================
// PARTICLE CLASS
// ============================================
class Particle {
  constructor(x, y, color, size = 3, speed = 3) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.size = size * (Math.random() * 0.5 + 0.5);
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (Math.random() * 0.5 + 0.5);
    this.vx = Math.cos(angle) * velocity;
    this.vy = Math.sin(angle) * velocity;
    this.life = 1;
    this.decay = 0.02 + Math.random() * 0.02;
    this.gravity = 0.05;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.vx *= 0.98;
    this.life -= this.decay;
  }

  draw() {
    ctx.save();
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  isDead() {
    return this.life <= 0;
  }
}

// ============================================
// FLOATING TEXT CLASS
// ============================================
class FloatingText {
  constructor(x, y, text, color = '#FFD700', size = 16) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.size = size;
    this.life = 1;
    this.vy = -2;
  }

  update() {
    this.y += this.vy;
    this.vy *= 0.95;
    this.life -= 0.025;
  }

  draw() {
    ctx.save();
    ctx.globalAlpha = this.life;
    ctx.font = `bold ${this.size}px 'Press Start 2P'`;
    ctx.fillStyle = this.color;
    ctx.textAlign = 'center';
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }

  isDead() {
    return this.life <= 0;
  }
}

// ============================================
// POWER-UP CLASS
// ============================================
class PowerUp {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.size = 20;
    this.rotation = 0;
    this.pulse = 0;
    this.life = 8000;
    this.creationTime = Date.now();
    this.colors = {
      'nuke': '#FF0000',
      'energy': '#00FFFF',
      'heal': '#00FF00',
      'slowmo': '#FFFF00'
    };
  }

  update() {
    this.rotation += 0.03;
    this.pulse += 0.1;
  }

  draw() {
    const elapsed = Date.now() - this.creationTime;
    const remaining = 1 - (elapsed / this.life);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.globalAlpha = 0.4 + remaining * 0.6;

    const glowSize = this.size + Math.sin(this.pulse) * 5;
    ctx.shadowColor = this.colors[this.type];
    ctx.shadowBlur = 20 + Math.sin(this.pulse) * 10;
    ctx.fillStyle = this.colors[this.type];

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * glowSize;
      const y = Math.sin(angle) * glowSize;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.font = `${this.size * 0.7}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icons = { 'nuke': '💥', 'energy': '⚡', 'heal': '💚', 'slowmo': '⏱️' };
    ctx.fillText(icons[this.type], 0, 2);

    ctx.restore();
  }

  isExpired() {
    return Date.now() - this.creationTime > this.life;
  }

  collidesWith(obj) {
    const dx = this.x - obj.x;
    const dy = this.y - obj.y;
    return Math.sqrt(dx * dx + dy * dy) < this.size + (obj.radius || obj.size || 15);
  }
}

// ============================================
// UNINFECTED TRIANGLE CLASS
// ============================================
class UninfectedTriangle {
  constructor(x, y, size, speed, rotationSpeed) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.speed = speed;
    this.rotation = 0;
    this.rotationSpeed = rotationSpeed;
    this.vx = speed * (Math.random() * 2 - 1);
    this.vy = speed * (Math.random() * 2 - 1);
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.fear = 0;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotationSpeed;
    this.pulsePhase += 0.1;

    // Calculate fear from zombies
    this.fear = 0;
    for (const zombie of zombies) {
      const dx = this.x - zombie.x;
      const dy = this.y - zombie.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 150) {
        this.fear = Math.max(this.fear, 1 - dist / 150);
      }
    }

    const safeZone = getSafeZoneCoordinates();
    if (this.x + this.size / 2 > safeZone.x + CONFIG.safeZoneSize || this.x - this.size / 2 < safeZone.x) {
      this.vx = -this.vx;
    }
    if (this.y + this.size / 2 > safeZone.y + CONFIG.safeZoneSize || this.y - this.size / 2 < safeZone.y) {
      this.vy = -this.vy;
    }
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(-this.rotation);

    const pulse = Math.sin(this.pulsePhase) * 2;
    const drawSize = this.size + pulse;

    ctx.shadowColor = this.fear > 0.5 ? '#FFAAAA' : 'white';
    ctx.shadowBlur = 10 + this.fear * 15;

    ctx.beginPath();
    ctx.moveTo(0, -drawSize / 2);
    ctx.lineTo(drawSize / 2, drawSize / 2);
    ctx.lineTo(-drawSize / 2, drawSize / 2);
    ctx.closePath();

    const fearColor = Math.floor(255 - this.fear * 55);
    ctx.fillStyle = `rgb(255, ${fearColor}, ${fearColor})`;
    ctx.fill();

    ctx.restore();
  }

  collidesWith(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy) < (this.size + other.size) / 2;
  }
}

// ============================================
// ZOMBIE CLASS
// ============================================
class Zombie {
  constructor(x, y, size, speed, rotationSpeed, type = 'normal') {
    this.x = x;
    this.y = y;
    this.size = size;
    this.speed = speed;
    this.rotation = 0;
    this.rotationSpeed = rotationSpeed;
    this.vx = speed;
    this.vy = speed;
    this.enteredCanvas = false;
    this.type = type;
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.dying = false;
    this.deathProgress = 0;

    switch(type) {
      case 'fast':
        this.speed *= 1.8;
        this.vx *= 1.8;
        this.vy *= 1.8;
        this.size *= 0.7;
        this.color = '#FF6600';
        this.health = 1;
        break;
      case 'tank':
        this.speed *= 0.6;
        this.vx *= 0.6;
        this.vy *= 0.6;
        this.size *= 1.4;
        this.color = '#990000';
        this.health = 3;
        break;
      default:
        this.color = '#FF0000';
        this.health = 1;
    }
  }

  update() {
    if (this.dying) {
      this.deathProgress += 0.1;
      return;
    }

    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotationSpeed;
    this.pulsePhase += 0.1;

    if (
      this.x - this.size / 2 > 0 && this.x + this.size / 2 < canvas.width &&
      this.y - this.size / 2 > 0 && this.y + this.size / 2 < canvas.height
    ) {
      this.enteredCanvas = true;
    }

    if (this.enteredCanvas) {
      if (this.x + this.size / 2 > canvas.width || this.x - this.size / 2 < 0) this.vx = -this.vx;
      if (this.y + this.size / 2 > canvas.height || this.y - this.size / 2 < 0) this.vy = -this.vy;
    }
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    if (this.dying) {
      ctx.globalAlpha = 1 - this.deathProgress;
      ctx.scale(1 + this.deathProgress * 0.5, 1 + this.deathProgress * 0.5);
    }

    const pulse = Math.sin(this.pulsePhase) * 2;
    const drawSize = this.size + pulse;

    ctx.shadowColor = this.color;
    ctx.shadowBlur = 15;

    ctx.beginPath();
    ctx.moveTo(0, -drawSize / 2);
    ctx.lineTo(drawSize / 2, drawSize / 2);
    ctx.lineTo(-drawSize / 2, drawSize / 2);
    ctx.closePath();
    ctx.fillStyle = this.color;
    ctx.fill();

    if (this.type === 'tank') {
      ctx.fillStyle = '#FFFF00';
      ctx.beginPath();
      ctx.arc(-4, -2, 2, 0, Math.PI * 2);
      ctx.arc(4, -2, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  takeDamage() {
    this.health--;
    if (this.health <= 0) {
      this.dying = true;
      return true;
    }
    this.color = '#FFFFFF';
    setTimeout(() => {
      this.color = this.type === 'tank' ? '#990000' : this.type === 'fast' ? '#FF6600' : '#FF0000';
    }, 80);
    return false;
  }

  isDead() {
    return this.dying && this.deathProgress >= 1;
  }
}

// ============================================
// GAME OBJECTS
// ============================================
let turret = new Turret();

// ============================================
// UTILITY FUNCTIONS
// ============================================
function getSafeZoneCoordinates() {
  return {
    x: (canvas.width - CONFIG.safeZoneSize) / 2,
    y: (canvas.height - CONFIG.safeZoneSize) / 2
  };
}

function getRandomDirection() {
  return Math.random() > 0.5 ? 1 : -1;
}

function getRandomColor() {
  const colors = ["#2525B1", "#5438DC", "#357DED", "#56EEF4", "#489D92", "#7B68EE", "#00CED1", "#4169E1"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function getDifficulty() {
  return Math.min(1, (Date.now() - gameState.gameStartTime) / CONFIG.difficultyRampTime);
}

function getCurrentSpawnRate() {
  const diff = getDifficulty();
  return CONFIG.baseSpawnRate - (CONFIG.baseSpawnRate - CONFIG.minSpawnRate) * diff;
}

function getCurrentZombieSpeed() {
  const diff = getDifficulty();
  return {
    min: CONFIG.baseZombieSpeed.min + (CONFIG.maxZombieSpeed.min - CONFIG.baseZombieSpeed.min) * diff,
    max: CONFIG.baseZombieSpeed.max + (CONFIG.maxZombieSpeed.max - CONFIG.baseZombieSpeed.max) * diff
  };
}

function triggerScreenShake(intensity = 5) {
  gameState.screenShake = Math.max(gameState.screenShake, intensity);
}

function spawnParticles(x, y, color, count = CONFIG.particleCount) {
  for (let i = 0; i < count; i++) {
    particles.push(new Particle(x, y, color, 4, 4));
  }
}

function addFloatingText(x, y, text, color = '#FFD700', size = 16) {
  floatingTexts.push(new FloatingText(x, y, text, color, size));
}

// ============================================
// SPAWNING FUNCTIONS
// ============================================
function spawnUninfected(count) {
  const size = 14;
  const speed = 0.5;
  const safeZone = getSafeZoneCoordinates();

  for (let i = 0; i < count; i++) {
    const rotationSpeed = Math.random() * 0.015 + 0.0005;
    const x = safeZone.x + Math.random() * (CONFIG.safeZoneSize - size);
    const y = safeZone.y + Math.random() * (CONFIG.safeZoneSize - size);
    uninfectedTriangles.push(new UninfectedTriangle(x, y, size, speed, rotationSpeed));
  }
}

function spawnZombie() {
  const size = 14;
  const speeds = getCurrentZombieSpeed();
  const spawnDistance = 20;
  const difficulty = getDifficulty();

  const spawnPoints = [
    { x: -size - spawnDistance, y: -size - spawnDistance },
    { x: canvas.width + spawnDistance, y: -size - spawnDistance },
    { x: canvas.width + spawnDistance, y: canvas.height + spawnDistance },
    { x: -size - spawnDistance, y: canvas.height + spawnDistance },
    { x: canvas.width / 2, y: -size - spawnDistance },
    { x: canvas.width + spawnDistance, y: canvas.height / 2 },
    { x: canvas.width / 2, y: canvas.height + spawnDistance },
    { x: -size - spawnDistance, y: canvas.height / 2 },
  ];

  // Reduce zombie count by 25% on mobile
  const baseZombieCount = 3 + Math.floor(difficulty * 3);
  const zombieCount = isMobileMode ? Math.max(1, Math.floor(baseZombieCount * 0.75)) : baseZombieCount;

  for (let i = 0; i < zombieCount; i++) {
    const speed = Math.random() * (speeds.max - speeds.min) + speeds.min;
    const rotationSpeed = Math.random() * 0.01 + 0.0005;
    const spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];

    let type = 'normal';
    if (difficulty > 0.25 && Math.random() < 0.2) type = 'fast';
    if (difficulty > 0.45 && Math.random() < 0.12) type = 'tank';

    const zombie = new Zombie(spawnPoint.x, spawnPoint.y, size, speed, rotationSpeed, type);
    zombie.vx *= getRandomDirection();
    zombie.vy *= getRandomDirection();
    zombies.push(zombie);
  }
}

function spawnPowerUp(x, y) {
  const types = ['nuke', 'energy', 'heal', 'slowmo'];
  const type = types[Math.floor(Math.random() * types.length)];
  powerUps.push(new PowerUp(x, y, type));
}

// ============================================
// BLACK HOLE SYSTEM
// ============================================
function checkBlackHoleReward() {
  // Black holes disabled on mobile
  if (isMobileMode) return;

  const threshold = Math.floor(gameState.score / CONFIG.blackHolePointsRequired);
  if (threshold > gameState.lastBlackHoleScoreThreshold) {
    gameState.lastBlackHoleScoreThreshold = threshold;

    // Desktop: require manual deployment with [B] key
    gameState.blackHolesAvailable++;
    AudioSystem.play('blackholeReady');
    addFloatingText(canvas.width / 2, canvas.height / 2, 'BLACK HOLE READY! [B]', '#8800FF', 18);

    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'TICKER_MESSAGE',
        game: 'onzac',
        message: `BLACK HOLE READY! Press [B] to deploy!`,
        level: 'celebration'
      }, '*');
    }
  }
}

function deployBlackHole() {
  if (gameState.blackHolesAvailable <= 0) return;

  gameState.blackHolesAvailable--;
  spawnBlackHole();
}

function spawnBlackHole() {
  let spawnPoint, target;

  if (isMobileMode) {
    // Mobile: spawn from top and position at center top, just above safe zone
    // This keeps it visible and prevents pulling zombies through the safe zone
    const safeZone = getSafeZoneCoordinates();
    const safeZoneTop = safeZone.y;

    spawnPoint = { x: canvas.width / 2, y: -50 };
    // Position just above the safe zone (with buffer for pull range)
    target = {
      x: canvas.width / 2,
      y: Math.max(80, safeZoneTop - CONFIG.blackHolePullRange - 30)
    };
  } else {
    // Desktop: spawn from random edge
    const spawnPoints = [
      { x: -50, y: -50 },
      { x: canvas.width + 50, y: -50 },
      { x: canvas.width + 50, y: canvas.height + 50 },
      { x: -50, y: canvas.height + 50 },
      { x: canvas.width / 2, y: -50 },
      { x: canvas.width + 50, y: canvas.height / 2 },
      { x: canvas.width / 2, y: canvas.height + 50 },
      { x: -50, y: canvas.height / 2 },
    ];

    spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];

    // Target halfway between center and edge (avoids safe zone in center)
    // These positions keep the black hole in the outer ring of the play area
    const midpointTargets = [
      { x: canvas.width / 4, y: canvas.height / 4 },           // Top-left quadrant
      { x: canvas.width * 3/4, y: canvas.height / 4 },         // Top-right quadrant
      { x: canvas.width / 4, y: canvas.height * 3/4 },         // Bottom-left quadrant
      { x: canvas.width * 3/4, y: canvas.height * 3/4 },       // Bottom-right quadrant
      { x: canvas.width / 4, y: canvas.height / 2 },           // Left side
      { x: canvas.width * 3/4, y: canvas.height / 2 },         // Right side
      { x: canvas.width / 2, y: canvas.height / 4 },           // Top side
      { x: canvas.width / 2, y: canvas.height * 3/4 },         // Bottom side
    ];
    target = midpointTargets[Math.floor(Math.random() * midpointTargets.length)];
  }

  blackHoles.push(new BlackHole(spawnPoint.x, spawnPoint.y, target.x, target.y));
  AudioSystem.play('blackhole');
  addFloatingText(target.x, target.y - 50, 'BLACK HOLE DEPLOYED!', '#8800FF', 16);
  triggerScreenShake(8);
}

// ============================================
// WEAPON SWITCHING
// ============================================
function switchWeapon() {
  // Cycle through: ball -> flame -> lightning -> ball
  if (gameState.currentWeapon === 'ball') {
    gameState.currentWeapon = 'flame';
  } else if (gameState.currentWeapon === 'flame') {
    gameState.currentWeapon = 'lightning';
  } else {
    gameState.currentWeapon = 'ball';
  }

  // Reset charge state when switching
  turret.isCharging = false;
  turret.chargeLevel = 0;

  AudioSystem.play('weaponSwitch');

  const weaponNames = {
    'ball': 'BALL CANNON',
    'flame': 'FLAMETHROWER',
    'lightning': 'CHAIN LIGHTNING'
  };
  const weaponColors = {
    'ball': '#00FFFF',
    'flame': '#FF6600',
    'lightning': '#8888FF'
  };
  addFloatingText(canvas.width / 2, canvas.height / 2 - 80, weaponNames[gameState.currentWeapon], weaponColors[gameState.currentWeapon], 16);
}

// ============================================
// DRAWING FUNCTIONS
// ============================================
function drawSafeZone() {
  const safeZone = getSafeZoneCoordinates();
  const pulse = Math.sin(Date.now() / 500) * 0.1 + 0.2;

  ctx.strokeStyle = `rgba(255, 255, 255, ${pulse})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.strokeRect(safeZone.x, safeZone.y, CONFIG.safeZoneSize, CONFIG.safeZoneSize);
  ctx.setLineDash([]);

  const cornerSize = 20;
  ctx.strokeStyle = `rgba(255, 255, 255, ${pulse + 0.2})`;
  ctx.lineWidth = 3;

  [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([cx, cy]) => {
    const x = safeZone.x + cx * CONFIG.safeZoneSize;
    const y = safeZone.y + cy * CONFIG.safeZoneSize;
    const dx = cx === 0 ? 1 : -1;
    const dy = cy === 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x, y + cornerSize * dy);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerSize * dx, y);
    ctx.stroke();
  });
}


function drawHUD() {
  // Score
  ctx.font = "bold 16px 'Press Start 2P'";
  ctx.fillStyle = '#FFD700';
  ctx.textAlign = 'right';
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 10;
  ctx.fillText(`SCORE: ${gameState.score}`, canvas.width - 20, 35);

  ctx.font = "10px 'Press Start 2P'";
  ctx.fillStyle = '#888';
  ctx.shadowBlur = 0;
  ctx.fillText(`HI: ${gameState.highScore}`, canvas.width - 20, 55);

  // Combo
  if (gameState.combo > 1) {
    ctx.font = "bold 18px 'Press Start 2P'";
    ctx.fillStyle = '#FF6B6B';
    ctx.shadowColor = '#FF6B6B';
    ctx.shadowBlur = 15;
    ctx.fillText(`${gameState.combo}x COMBO!`, canvas.width - 20, 80);
    ctx.shadowBlur = 0;
  }

  // Survivors
  ctx.font = "12px 'Press Start 2P'";
  ctx.fillStyle = '#4ECDC4';
  ctx.fillText(`SURVIVORS: ${uninfectedTriangles.length}/${CONFIG.uninfectedAmount}`, canvas.width - 20, 105);

  // Energy display
  const energyColors = { 'flame': '#FF6600', 'ball': '#00FFFF', 'lightning': '#8888FF' };
  const energyColor = energyColors[gameState.currentWeapon] || '#00FFFF';

  if (isMobileMode) {
    // Mobile: draw energy bar in bottom left corner
    const barWidth = 120;
    const barHeight = 16;
    const barX = 20;
    const barY = canvas.height - 50;
    const energyPercent = turret.energy / turret.maxEnergy;

    // Bar background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);

    // Bar border
    ctx.strokeStyle = energyColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = energyColor;
    ctx.shadowBlur = 5;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    // Energy fill
    ctx.fillStyle = energyColor;
    ctx.shadowBlur = 10;
    ctx.fillRect(barX + 2, barY + 2, (barWidth - 4) * energyPercent, barHeight - 4);
    ctx.shadowBlur = 0;

    // Energy text on bar
    ctx.font = "bold 8px 'Press Start 2P'";
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.floor(turret.energy)}`, barX + barWidth / 2, barY + barHeight - 4);
  } else {
    // Desktop: text display
    ctx.textAlign = 'left';
    ctx.font = "bold 12px 'Press Start 2P'";
    ctx.fillStyle = energyColor;
    ctx.shadowColor = energyColor;
    ctx.shadowBlur = 10;
    ctx.fillText(`ENERGY: ${Math.floor(turret.energy)}/${turret.maxEnergy}`, 20, 35);
    ctx.shadowBlur = 0;
  }

  // Black hole indicator
  if (gameState.blackHolesAvailable > 0) {
    ctx.font = "bold 12px 'Press Start 2P'";
    ctx.fillStyle = '#8800FF';
    ctx.shadowColor = '#8800FF';
    ctx.shadowBlur = 15;
    ctx.fillText(`BLACK HOLES: ${gameState.blackHolesAvailable} [B]`, 20, 60);
    ctx.shadowBlur = 0;
  }

  // Timer
  ctx.font = "16px 'Press Start 2P'";
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.fillText(gameState.timerText, canvas.width / 2, canvas.height - 30);
}

let restartVisible = true;
setInterval(() => { restartVisible = !restartVisible; }, 500);

// Restart button bounds (set when drawing game over screen)
const restartButton = { x: 0, y: 0, width: 200, height: 40 };

function drawGameOver() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = "bold 36px 'Orbitron'";
  ctx.fillStyle = '#8C0000';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#FF0000';
  ctx.shadowBlur = 30;
  ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 80);
  ctx.shadowBlur = 0;

  ctx.font = "14px 'Press Start 2P'";
  ctx.fillStyle = 'white';
  ctx.fillText(`SURVIVED: ${gameState.timerText}`, canvas.width / 2, canvas.height / 2 - 30);

  ctx.fillStyle = '#FFD700';
  ctx.fillText(`SCORE: ${gameState.score}`, canvas.width / 2, canvas.height / 2);

  ctx.fillStyle = '#FF6B6B';
  ctx.fillText(`MAX COMBO: ${gameState.maxCombo}x`, canvas.width / 2, canvas.height / 2 + 30);

  ctx.fillStyle = '#4ECDC4';
  ctx.fillText(`ZOMBIES KILLED: ${gameState.zombiesKilled}`, canvas.width / 2, canvas.height / 2 + 60);

  if (gameState.score >= gameState.highScore && gameState.score > 0) {
    ctx.font = "12px 'Press Start 2P'";
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 20;
    ctx.fillText("NEW HIGH SCORE!", canvas.width / 2, canvas.height / 2 + 95);
    ctx.shadowBlur = 0;
  }

  // Draw restart button
  const btnWidth = 200;
  const btnHeight = 40;
  const btnX = canvas.width / 2 - btnWidth / 2;
  const btnY = canvas.height / 2 + 110;

  // Update button bounds for click detection
  restartButton.x = btnX;
  restartButton.y = btnY;
  restartButton.width = btnWidth;
  restartButton.height = btnHeight;

  // Check if restart is on cooldown
  const timeSinceGameOver = Date.now() - gameState.gameOverTime;
  const canRestart = timeSinceGameOver >= gameState.restartCooldown;
  const cooldownRemaining = Math.max(0, Math.ceil((gameState.restartCooldown - timeSinceGameOver) / 1000));

  // Button background (greyed out during cooldown)
  if (canRestart) {
    ctx.fillStyle = restartVisible ? '#8C0000' : '#660000';
  } else {
    ctx.fillStyle = '#333333';
  }
  ctx.fillRect(btnX, btnY, btnWidth, btnHeight);

  // Button border
  ctx.strokeStyle = canRestart ? '#FF0000' : '#555555';
  ctx.lineWidth = 2;
  ctx.strokeRect(btnX, btnY, btnWidth, btnHeight);

  // Button text
  ctx.font = "10px 'Press Start 2P'";
  ctx.fillStyle = canRestart ? 'white' : '#666666';
  if (canRestart) {
    ctx.fillText("RESTART", canvas.width / 2, btnY + 26);
  } else {
    ctx.fillText(`WAIT ${cooldownRemaining}s`, canvas.width / 2, btnY + 26);
  }

  // Hint text
  ctx.font = "8px 'Press Start 2P'";
  ctx.fillStyle = '#888';
  if (canRestart) {
    ctx.fillText("OR PRESS ENTER / SPACE", canvas.width / 2, btnY + btnHeight + 20);
  }

  ctx.fillStyle = '#666';
  ctx.fillText(`ONZAC - PENNY'S ARCADE ${new Date().getFullYear()}`, canvas.width / 2, canvas.height - 30);
}

// ============================================
// INPUT HANDLING
// ============================================
canvas.addEventListener('mousedown', (e) => {
  input.mouseDown = true;
  input.mouseX = e.clientX;
  input.mouseY = e.clientY;

  if (gameState.gameOver) {
    // Check cooldown before allowing restart
    const timeSinceGameOver = Date.now() - gameState.gameOverTime;
    const canRestart = timeSinceGameOver >= gameState.restartCooldown;

    // Only restart if clicking within the restart button bounds and cooldown has passed
    if (canRestart &&
        e.clientX >= restartButton.x && e.clientX <= restartButton.x + restartButton.width &&
        e.clientY >= restartButton.y && e.clientY <= restartButton.y + restartButton.height) {
      resetGame();
    }
  }
});

canvas.addEventListener('mouseup', () => {
  input.mouseDown = false;
});

canvas.addEventListener('mousemove', (e) => {
  input.mouseX = e.clientX;
  input.mouseY = e.clientY;
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  input.mouseDown = true;
  const touchX = e.touches[0].clientX;
  const touchY = e.touches[0].clientY;
  input.mouseX = touchX;
  input.mouseY = touchY;

  if (gameState.gameOver) {
    // Check cooldown before allowing restart
    const timeSinceGameOver = Date.now() - gameState.gameOverTime;
    const canRestart = timeSinceGameOver >= gameState.restartCooldown;

    // Only restart if touching within the restart button bounds and cooldown has passed
    if (canRestart &&
        touchX >= restartButton.x && touchX <= restartButton.x + restartButton.width &&
        touchY >= restartButton.y && touchY <= restartButton.y + restartButton.height) {
      resetGame();
    }
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  input.mouseDown = false;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  input.mouseX = e.touches[0].clientX;
  input.mouseY = e.touches[0].clientY;
}, { passive: false });

document.addEventListener('keydown', (e) => {
  input.keys[e.code] = true;
  if ((e.key === 'Enter' || e.code === 'Space') && gameState.gameOver) {
    e.preventDefault();
    // Check cooldown before allowing restart
    const timeSinceGameOver = Date.now() - gameState.gameOverTime;
    const canRestart = timeSinceGameOver >= gameState.restartCooldown;
    if (canRestart) {
      resetGame();
    }
    return;
  }
  // Spacebar to switch weapons (only when not game over and not paused)
  if (e.code === 'Space' && !gameState.gameOver && !paused) {
    e.preventDefault();
    switchWeapon();
  }

  // B key to deploy black hole
  if ((e.code === 'KeyB') && !gameState.gameOver && gameState.blackHolesAvailable > 0) {
    e.preventDefault();
    deployBlackHole();
  }

  // P key to pause/unpause
  if ((e.key === 'p' || e.key === 'P') && gameStarted && !gameState.gameOver) {
    e.preventDefault();
    togglePause();
  }
});

document.addEventListener('keyup', (e) => {
  input.keys[e.code] = false;
});

// ============================================
// GAME LOGIC
// ============================================
function updateTimer() {
  const elapsed = Date.now() - gameState.gameStartTime;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  gameState.timerText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function updateCombo() {
  if (Date.now() - gameState.lastKillTime > CONFIG.comboWindow) {
    gameState.combo = 0;
  }
}

function addScore(points, x, y) {
  const multiplier = Math.max(1, gameState.combo);
  const total = points * multiplier;
  gameState.score += total;
  addFloatingText(x, y - 20, `+${total}`, multiplier > 1 ? '#FFD700' : '#FFFFFF', multiplier > 1 ? 14 : 12);
}

function killZombie(zombie, index) {
  const now = Date.now();

  if (now - gameState.lastKillTime < CONFIG.comboWindow) {
    gameState.combo++;
    if (gameState.combo > gameState.maxCombo) gameState.maxCombo = gameState.combo;
    if (gameState.combo >= 3) AudioSystem.play('combo');
  } else {
    gameState.combo = 1;
  }
  gameState.lastKillTime = now;
  gameState.zombiesKilled++;

  let points = 1;
  if (zombie.type === 'fast') points = 3;
  if (zombie.type === 'tank') points = 6;

  addScore(points, zombie.x, zombie.y);
  spawnParticles(zombie.x, zombie.y, zombie.color, 12);
  triggerScreenShake(3);
  AudioSystem.play('kill');

  turret.addEnergy(CONFIG.turretKillBonus);

  if (Math.random() < CONFIG.powerUpChance) {
    spawnPowerUp(zombie.x, zombie.y);
  }

  zombies.splice(index, 1);
}

function infectTriangle(triangle, index) {
  AudioSystem.play('infect');
  triggerScreenShake(10);

  spawnParticles(triangle.x, triangle.y, '#FFFFFF', 10);
  spawnParticles(triangle.x, triangle.y, '#FF0000', 10);

  const newZombie = new Zombie(triangle.x, triangle.y, triangle.size, triangle.speed, triangle.rotationSpeed);
  newZombie.vx = triangle.vx;
  newZombie.vy = triangle.vy;
  newZombie.enteredCanvas = true;
  zombies.push(newZombie);

  uninfectedTriangles.splice(index, 1);
  addFloatingText(triangle.x, triangle.y, 'INFECTED!', '#FF0000', 14);
}

function activatePowerUp(powerUp) {
  AudioSystem.play('powerup');

  switch(powerUp.type) {
    case 'nuke':
      for (let i = zombies.length - 1; i >= 0; i--) {
        spawnParticles(zombies[i].x, zombies[i].y, zombies[i].color, 8);
        gameState.score += 1;
        gameState.zombiesKilled++;
      }
      zombies.length = 0;
      triggerScreenShake(15);
      addFloatingText(canvas.width / 2, canvas.height / 2, 'NUKE!', '#FF0000', 28);
      break;

    case 'energy':
      turret.energy = turret.maxEnergy;
      turret.maxEnergy = Math.min(150, turret.maxEnergy + 10);
      addFloatingText(powerUp.x, powerUp.y, 'MAX ENERGY!', '#00FFFF', 18);
      break;

    case 'heal':
      // Bonus energy instead of heal
      turret.addEnergy(50);
      addFloatingText(powerUp.x, powerUp.y, '+50 ENERGY!', '#00FF00', 18);
      break;

    case 'slowmo':
      for (const zombie of zombies) {
        zombie.vx *= 0.3;
        zombie.vy *= 0.3;
      }
      addFloatingText(powerUp.x, powerUp.y, 'SLOW-MO!', '#FFFF00', 18);
      setTimeout(() => {
        for (const zombie of zombies) {
          zombie.vx /= 0.3;
          zombie.vy /= 0.3;
        }
      }, 5000);
      break;
  }
}

function sendGameOver() {
  // Send score to parent window (Penny's Arcade)
  if (window.parent !== window && gameState.score > 0) {
    window.parent.postMessage({
      type: 'GAME_OVER',
      game: 'onzac',
      score: gameState.score,
      stats: {
        time: gameState.timerText,
        maxCombo: gameState.maxCombo,
        zombiesKilled: gameState.zombiesKilled
      }
    }, '*');
  }

  if (gameState.score > gameState.highScore) {
    gameState.highScore = gameState.score;
    document.getElementById('onzac-highscore').textContent = `HIGH SCORE: ${gameState.highScore}`;
  }
}

function sendGameStart() {
  // Notify parent window that a new game is starting
  if (window.parent !== window) {
    window.parent.postMessage({
      type: 'GAME_START',
      game: 'onzac'
    }, '*');
  }
}

function resetGame() {
  // Reset pause state
  paused = false;
  pauseStartTime = 0;
  totalPausedTime = 0;

  // Start music for new game
  AudioSystem.startMusic();

  gameState.score = 0;
  gameState.combo = 0;
  gameState.maxCombo = 0;
  gameState.lastKillTime = 0;
  gameState.zombiesKilled = 0;
  gameState.gameStartTime = Date.now();
  gameState.lastSpawnTime = 0;
  gameState.gameOver = false;
  gameState.timerText = "0s";
  gameState.screenShake = 0;
  gameState.currentWeapon = 'ball';
  gameState.blackHolesAvailable = 0;
  gameState.lastBlackHoleScoreThreshold = 0;

  uninfectedTriangles.length = 0;
  zombies.length = 0;
  projectiles.length = 0;
  particles.length = 0;
  powerUps.length = 0;
  floatingTexts.length = 0;
  blackHoles.length = 0;
  lightningBolts.length = 0;

  turret = new Turret();

  // Reset and show mobile weapon button
  showMobileWeaponBtn();
  if (mobileWeaponBtn) {
    mobileWeaponBtn.innerHTML = 'BALL';
    mobileWeaponBtn.style.borderColor = '#00ffff';
    mobileWeaponBtn.style.color = '#00ffff';
    mobileWeaponBtn.style.background = 'rgba(0, 255, 255, 0.3)';
  }

  spawnUninfected(CONFIG.uninfectedAmount);

  // Notify parent that a new game is starting
  sendGameStart();
}

// ============================================
// UPDATE LOOP
// ============================================
function update() {
  if (!gameStarted || gameState.gameOver) return;

  if (uninfectedTriangles.length === 0) {
    gameState.gameOver = true;
    gameState.gameOverTime = Date.now();
    AudioSystem.stopMusic();
    AudioSystem.play('gameover');
    hideMobileWeaponBtn();
    // Send score immediately when game ends
    sendGameOver();
    return;
  }

  updateTimer();
  updateCombo();

  // Screen shake
  if (gameState.screenShake > 0) {
    gameState.screenShakeX = (Math.random() - 0.5) * gameState.screenShake;
    gameState.screenShakeY = (Math.random() - 0.5) * gameState.screenShake;
    gameState.screenShake *= 0.9;
    if (gameState.screenShake < 0.5) gameState.screenShake = 0;
  } else {
    gameState.screenShakeX = 0;
    gameState.screenShakeY = 0;
  }

  // Spawn zombies
  if (Date.now() - gameState.lastSpawnTime > getCurrentSpawnRate()) {
    spawnZombie();
    gameState.lastSpawnTime = Date.now();
  }

  // Update turret
  turret.update();

  // Update projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    projectiles[i].update();
    if (projectiles[i].isDead()) {
      projectiles.splice(i, 1);
    }
  }

  // Update uninfected
  for (const tri of uninfectedTriangles) {
    tri.update();
  }

  // Update zombies and check collisions
  for (let i = zombies.length - 1; i >= 0; i--) {
    const zombie = zombies[i];
    zombie.update();

    if (zombie.isDead()) {
      zombies.splice(i, 1);
      continue;
    }

    if (zombie.dying) continue;

    // Check projectile collisions
    for (let j = projectiles.length - 1; j >= 0; j--) {
      const proj = projectiles[j];

      if (proj.collidesWith(zombie)) {
        if (zombie.takeDamage()) {
          killZombie(zombie, i);
        }
        // Flame projectiles die on hit, ball projectiles can pass through
        if (proj.type === 'flame') {
          projectiles.splice(j, 1);
        }
        break;
      }
    }
  }

  // Check zombie-uninfected collisions
  for (let i = uninfectedTriangles.length - 1; i >= 0; i--) {
    if (!uninfectedTriangles[i]) continue;
    for (const zombie of zombies) {
      if (!zombie.dying && uninfectedTriangles[i].collidesWith(zombie)) {
        infectTriangle(uninfectedTriangles[i], i);
        break;
      }
    }
  }

  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    if (particles[i].isDead()) particles.splice(i, 1);
  }

  // Update floating texts
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    floatingTexts[i].update();
    if (floatingTexts[i].isDead()) floatingTexts.splice(i, 1);
  }

  // Update and check power-ups
  for (let i = powerUps.length - 1; i >= 0; i--) {
    powerUps[i].update();
    if (powerUps[i].isExpired()) {
      powerUps.splice(i, 1);
      continue;
    }

    // Check collision with projectiles
    for (const proj of projectiles) {
      if (powerUps[i] && powerUps[i].collidesWith(proj)) {
        activatePowerUp(powerUps[i]);
        powerUps.splice(i, 1);
        break;
      }
    }
  }

  // Update lightning bolts (visual effects)
  for (let i = lightningBolts.length - 1; i >= 0; i--) {
    lightningBolts[i].update();
    if (lightningBolts[i].isDead()) lightningBolts.splice(i, 1);
  }

  // Update black holes
  for (let i = blackHoles.length - 1; i >= 0; i--) {
    blackHoles[i].update();
    if (blackHoles[i].isDead()) blackHoles.splice(i, 1);
  }

  // Check for black hole reward
  checkBlackHoleReward();
}

// ============================================
// DRAW LOOP
// ============================================
function draw() {
  ctx.save();
  ctx.translate(gameState.screenShakeX, gameState.screenShakeY);
  ctx.clearRect(-10, -10, canvas.width + 20, canvas.height + 20);

  if (!gameStarted) {
    ctx.restore();
    return;
  }

  if (gameState.gameOver) {
    drawGameOver();
    ctx.restore();
    return;
  }

  drawSafeZone();

  // Particles
  for (const p of particles) p.draw();

  // Power-ups
  for (const pu of powerUps) pu.draw();

  // Zombies
  for (const z of zombies) z.draw();

  // Uninfected
  for (const t of uninfectedTriangles) t.draw();

  // Projectiles
  for (const p of projectiles) p.draw();

  // Black holes (draw before turret so turret appears on top)
  for (const bh of blackHoles) bh.draw();

  // Lightning bolts (draw on top of everything)
  for (const lb of lightningBolts) lb.draw();

  // Turret
  turret.draw();

  // Floating texts
  for (const t of floatingTexts) t.draw();

  drawHUD();
  ctx.restore();
}

// ============================================
// PAUSE FUNCTIONALITY
// ============================================
function drawPauseOverlay() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#00ffff';
  ctx.font = 'bold 48px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 20);
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px "Press Start 2P", monospace';
  ctx.fillText('Press P to resume', canvas.width / 2, canvas.height / 2 + 30);
  ctx.textAlign = 'left';
}

function togglePause() {
  if (gameState.gameOver || !gameStarted) return;
  paused = !paused;
  if (paused) {
    pauseStartTime = Date.now();
    AudioSystem.stopMusic();
  } else {
    totalPausedTime += Date.now() - pauseStartTime;
    AudioSystem.startMusic();
  }
}

// ============================================
// GAME LOOP
// ============================================
function gameLoop() {
  if (paused) {
    draw();
    drawPauseOverlay();
  } else {
    update();
    draw();
  }
  requestAnimationFrame(gameLoop);
}

// ============================================
// INITIALIZATION
// ============================================
function initGame() {
  gameStarted = true;
  hideWelcomeScreen();
  showMobileWeaponBtn();
  // Reset mobile weapon button to initial state
  if (mobileWeaponBtn) {
    mobileWeaponBtn.innerHTML = 'BALL';
    mobileWeaponBtn.style.borderColor = '#00ffff';
    mobileWeaponBtn.style.color = '#00ffff';
    mobileWeaponBtn.style.background = 'rgba(0, 255, 255, 0.3)';
  }
  spawnUninfected(CONFIG.uninfectedAmount);
  AudioSystem.startMusic();
  sendGameStart();
}

document.getElementById('onzac-start').addEventListener('click', () => {
  if (!gameStarted) {
    AudioSystem.init();
    initGame();
  }
});

WebFont.load({
  google: { families: ['Orbitron:500', 'Press Start 2P'] },
  active: () => {
    showWelcomeScreen();
    gameLoop();
  },
  inactive: () => {
    showWelcomeScreen();
    gameLoop();
  }
});
