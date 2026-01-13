const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let gameStarted = false;

// Mobile mode detection - check if loaded from mobile site via query parameter
const isMobileMode = new URLSearchParams(window.location.search).get('mobile') === 'true';

// Cached DOM elements for performance (avoid getElementById in game loop)
const domElements = {
    timer: document.getElementById('timer'),
    scoreDisplay: document.getElementById('scoreDisplay'),
    comboDisplay: document.getElementById('comboDisplay'),
    focusBar: document.getElementById('focusBar'),
    powerUpIndicator: document.getElementById('powerUpIndicator')
};

// Update copyright year dynamically
document.getElementById('copyright').innerHTML = `\u00A9 ${new Date().getFullYear()} Penny's Arcade`;

// ============================================
// AUDIO SYSTEM - Web Audio API Synth Sounds
// ============================================
const AudioSystem = {
    ctx: null,
    masterGain: null,
    musicGain: null,
    sfxGain: null,
    musicOscillators: [],
    isPlaying: false,

    init() {
        if (this.ctx) {
            // Resume if suspended (required for mobile browsers)
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            return;
        }
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Resume immediately for mobile browsers
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3;
        this.masterGain.connect(this.ctx.destination);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.15;
        this.musicGain.connect(this.masterGain);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.5;
        this.sfxGain.connect(this.masterGain);
    },

    startMusic() {
        if (this.isPlaying) return;
        this.isPlaying = true;

        const baseNotes = [130.81, 164.81, 196.00, 261.63];
        const tempo = 0.15;
        let noteIndex = 0;

        const playNote = () => {
            if (!this.isPlaying) return;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'square';
            osc.frequency.value = baseNotes[noteIndex % baseNotes.length];
            osc.detune.value = Math.random() * 10 - 5;

            gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
            gain.gain.setTargetAtTime(0.01, this.ctx.currentTime, 0.1);

            osc.connect(gain);
            gain.connect(this.musicGain);

            osc.start();
            osc.stop(this.ctx.currentTime + tempo * 0.9);

            noteIndex++;

            if (noteIndex % 16 === 0) {
                const progressions = [
                    [130.81, 164.81, 196.00, 261.63],
                    [146.83, 174.61, 220.00, 293.66],
                    [164.81, 196.00, 246.94, 329.63],
                    [130.81, 155.56, 196.00, 261.63]
                ];
                const progIndex = Math.floor(noteIndex / 16) % progressions.length;
                baseNotes.splice(0, 4, ...progressions[progIndex]);
            }

            setTimeout(playNote, tempo * 1000);
        };

        playNote();

        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'sine';
        bassOsc.frequency.value = 65.41;
        bassGain.gain.value = 0.08;
        bassOsc.connect(bassGain);
        bassGain.connect(this.musicGain);
        bassOsc.start();
        this.musicOscillators.push({ osc: bassOsc, gain: bassGain });
    },

    stopMusic() {
        this.isPlaying = false;
        this.musicOscillators.forEach(({ osc, gain }) => {
            gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
            osc.stop(this.ctx.currentTime + 0.2);
        });
        this.musicOscillators = [];
    },

    playNearMiss(intensity) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200 + intensity * 300, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.15);

        filter.type = 'lowpass';
        filter.frequency.value = 1000 + intensity * 2000;

        gain.gain.setValueAtTime(0.2 * intensity, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    },

    playSpawn() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    },

    playGameOver() {
        if (!this.ctx) return;

        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const filter = this.ctx.createBiquadFilter();

                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150 - i * 20, this.ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.5);

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(2000, this.ctx.currentTime);
                filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.5);

                gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.sfxGain);

                osc.start();
                osc.stop(this.ctx.currentTime + 0.6);
            }, i * 50);
        }

        const bufferSize = this.ctx.sampleRate * 0.3;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }

        const noise = this.ctx.createBufferSource();
        const noiseGain = this.ctx.createGain();
        noise.buffer = buffer;
        noiseGain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        noise.connect(noiseGain);
        noiseGain.connect(this.sfxGain);
        noise.start();
    },

    playCombo(level) {
        if (!this.ctx) return;
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.slice(0, Math.min(level, 4)).forEach((freq, i) => {
            setTimeout(() => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = 'square';
                osc.frequency.value = freq;

                gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

                osc.connect(gain);
                gain.connect(this.sfxGain);

                osc.start();
                osc.stop(this.ctx.currentTime + 0.15);
            }, i * 80);
        });
    },

    playStart() {
        if (!this.ctx) return;
        const notes = [261.63, 329.63, 392.00, 523.25];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = 'square';
                osc.frequency.value = freq;

                gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

                osc.connect(gain);
                gain.connect(this.sfxGain);

                osc.start();
                osc.stop(this.ctx.currentTime + 0.2);
            }, i * 100);
        });
    },

    playPowerup() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.2);

        gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.35);
    },

    playDash() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    },

    playBomb() {
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.4);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3000, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.4);

        gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);
    },

    playFreeze() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.3);

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);
    },

    playFury() {
        if (!this.ctx) return;
        // Aggressive rising tone
        const osc = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.3);

        osc2.type = 'square';
        osc2.frequency.setValueAtTime(200, this.ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.3);

        gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(this.sfxGain);

        osc.start();
        osc2.start();
        osc.stop(this.ctx.currentTime + 0.5);
        osc2.stop(this.ctx.currentTime + 0.5);
    },

    playFuryKill() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    },

    playShieldHit() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.2);

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    },

    playWaveWarning() {
        if (!this.ctx) return;
        [0, 150, 300].forEach(delay => {
            setTimeout(() => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = 'square';
                osc.frequency.value = 440;

                gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

                osc.connect(gain);
                gain.connect(this.sfxGain);

                osc.start();
                osc.stop(this.ctx.currentTime + 0.1);
            }, delay);
        });
    },

    playBossSpawn() {
        if (!this.ctx) return;
        const notes = [130.81, 164.81, 130.81, 98];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = 'sawtooth';
                osc.frequency.value = freq;

                gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);

                osc.connect(gain);
                gain.connect(this.sfxGain);

                osc.start();
                osc.stop(this.ctx.currentTime + 0.25);
            }, i * 150);
        });
    },

    playEnemyDestroy() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.15);

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    },

    playDangerZone() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.value = 220;

        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }
};

// ============================================
// PARTICLE SYSTEM
// ============================================
class Particle {
    constructor(x, y, color, vx, vy, life, size) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
        this.size = size;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.98;
        this.vy *= 0.98;
        this.life--;
        return this.life <= 0;
    }

    draw() {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

let particles = [];

function spawnParticles(x, y, color, count, speed, life, size) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const velocity = speed * (0.5 + Math.random() * 0.5);
        particles.push(new Particle(
            x, y, color,
            Math.cos(angle) * velocity,
            Math.sin(angle) * velocity,
            life + Math.random() * 20,
            size
        ));
    }
}

function spawnExplosion(x, y) {
    const colors = ['#ff0066', '#00ffff', '#ffff00', '#ff00ff', '#00ff00'];
    colors.forEach(color => {
        spawnParticles(x, y, color, 12, 8, 40, 6);
    });
}

// ============================================
// SCREEN SHAKE
// ============================================
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

// ============================================
// PLAYER TRAIL
// ============================================
let playerTrail = [];
const MAX_TRAIL_LENGTH = 15;

function updatePlayerTrail(x, y) {
    playerTrail.unshift({ x, y, alpha: 1 });
    if (playerTrail.length > MAX_TRAIL_LENGTH) {
        playerTrail.pop();
    }
}

function drawPlayerTrail() {
    playerTrail.forEach((point, i) => {
        const alpha = (1 - i / MAX_TRAIL_LENGTH) * 0.3;
        const size = player.radius * (1 - i / MAX_TRAIL_LENGTH) * 0.8;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = player.isDashing ? '#ff00ff' : `hsl(${180 + i * 10}, 100%, 70%)`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

// ============================================
// DANGER ZONES (Spawn Zone Scoring)
// ============================================
const DANGER_ZONE_RADIUS = 80;
const DANGER_ZONE_POINTS_PER_FRAME = 0.5;
const DANGER_ZONE_FOCUS_BONUS = 0.3;

function getDangerZones() {
    return [
        { x: 0, y: 0 },
        { x: canvas.width, y: 0 },
        { x: canvas.width, y: canvas.height },
        { x: 0, y: canvas.height },
        { x: canvas.width / 2, y: 0 },
        { x: canvas.width, y: canvas.height / 2 },
        { x: canvas.width / 2, y: canvas.height },
        { x: 0, y: canvas.height / 2 }
    ];
}

function drawDangerZones() {
    const zones = getDangerZones();
    const time = Date.now() / 1000;

    zones.forEach(zone => {
        const pulse = 1 + Math.sin(time * 3) * 0.1;
        const playerDist = Math.sqrt(
            Math.pow(player.x - zone.x, 2) + Math.pow(player.y - zone.y, 2)
        );
        const isPlayerInZone = playerDist < DANGER_ZONE_RADIUS;

        ctx.save();

        const gradient = ctx.createRadialGradient(
            zone.x, zone.y, 0,
            zone.x, zone.y, DANGER_ZONE_RADIUS * pulse
        );

        if (isPlayerInZone) {
            gradient.addColorStop(0, 'rgba(255, 215, 0, 0.3)');
            gradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.15)');
            gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
        } else {
            gradient.addColorStop(0, 'rgba(255, 100, 100, 0.15)');
            gradient.addColorStop(0.5, 'rgba(255, 100, 100, 0.08)');
            gradient.addColorStop(1, 'rgba(255, 100, 100, 0)');
        }

        ctx.beginPath();
        ctx.arc(zone.x, zone.y, DANGER_ZONE_RADIUS * pulse, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(zone.x, zone.y, DANGER_ZONE_RADIUS * 0.9, 0, Math.PI * 2);
        ctx.strokeStyle = isPlayerInZone ? 'rgba(255, 215, 0, 0.5)' : 'rgba(255, 100, 100, 0.2)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.restore();
    });
}

function checkDangerZones() {
    const zones = getDangerZones();
    let inDangerZone = false;

    zones.forEach(zone => {
        const dist = Math.sqrt(
            Math.pow(player.x - zone.x, 2) + Math.pow(player.y - zone.y, 2)
        );

        if (dist < DANGER_ZONE_RADIUS) {
            inDangerZone = true;
            dangerZoneAccumulator += DANGER_ZONE_POINTS_PER_FRAME;
            if (dangerZoneAccumulator >= 1) {
                const wholePoints = Math.floor(dangerZoneAccumulator);
                score += wholePoints;
                dangerZoneAccumulator -= wholePoints;
            }
            focusMeter = Math.min(MAX_FOCUS, focusMeter + DANGER_ZONE_FOCUS_BONUS);
        }
    });

    return inDangerZone;
}

// ============================================
// SCORING SYSTEM
// ============================================
let score = 0;
let dangerZoneAccumulator = 0;
let combo = 0;
let maxCombo = 0;
let lastNearMissTime = 0;
let nearMissStreak = 0;
let highScore = 0;
let highScoreHolder = '';

// Listen for high score data from parent window
window.addEventListener('message', (event) => {
    if (event.data?.type === 'HIGH_SCORE_DATA') {
        highScore = event.data.score || 0;
        highScoreHolder = event.data.username || '';
        updateHighScoreDisplay();
    }
});

function updateHighScoreDisplay() {
    const el = document.getElementById('highScoreText');
    if (el) {
        if (highScore > 0 && highScoreHolder) {
            el.textContent = `HIGH SCORE: ${highScore} (${highScoreHolder})`;
        } else {
            el.textContent = `HIGH SCORE: ${highScore}`;
        }
    }
}

function checkNearMiss(playerObj, circle) {
    const dx = playerObj.x - circle.x;
    const dy = playerObj.y - circle.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const effectivePlayerRadius = playerObj.radius * (playerObj.isShrunk ? 0.5 : 1);
    const nearMissThreshold = effectivePlayerRadius + circle.radius + 25;
    const collisionDist = effectivePlayerRadius + circle.radius;

    if (distance < nearMissThreshold && distance > collisionDist && circle.radius > 5) {
        const intensity = 1 - (distance - collisionDist) / 25;
        return intensity;
    }
    return 0;
}

function addScore(points, x, y) {
    score += points;
    const popup = new ScorePopup(x, y, `+${points}`);
    scorePopups.push(popup);
}

class ScorePopup {
    constructor(x, y, text, color = '#00ffff') {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.life = 60;
        this.vy = -2;
    }

    update() {
        this.y += this.vy;
        this.vy *= 0.95;
        this.life--;
        return this.life <= 0;
    }

    draw() {
        const alpha = this.life / 60;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 16px "Press Start 2P"';
        ctx.fillStyle = this.color;
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ff00ff';
        ctx.shadowBlur = 10;
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

let scorePopups = [];

// ============================================
// POWER-UP SYSTEM
// ============================================
const PowerUpTypes = {
    SHIELD: { color: '#00ff00', symbol: 'S', duration: 0 },
    SLOWMO: { color: '#00ffff', symbol: 'T', duration: 5000 },
    SHRINK: { color: '#ff00ff', symbol: 'X', duration: 5000 },
    BOMB: { color: '#ff4400', symbol: 'B', duration: 0 },
    FREEZE: { color: '#88ffff', symbol: 'F', duration: 3000 },
    MINE: { color: '#ffaa00', symbol: 'M', duration: 5000 },
    FURY: { color: '#ff0000', symbol: 'R', duration: 18000 }
};

class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.config = PowerUpTypes[type];
        this.radius = 18;
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.life = 600;
        this.vy = 0;
        this.floatOffset = Math.random() * Math.PI * 2;
    }

    update() {
        this.pulsePhase += 0.1;
        this.floatOffset += 0.05;
        this.y += Math.sin(this.floatOffset) * 0.3;
        this.life--;
        return this.life <= 0;
    }

    draw() {
        const pulse = 1 + Math.sin(this.pulsePhase) * 0.2;
        const alpha = this.life < 120 ? (this.life / 120) : 1;

        ctx.save();
        ctx.globalAlpha = alpha;

        const gradient = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.radius * 2 * pulse
        );
        gradient.addColorStop(0, this.config.color + 'aa');
        gradient.addColorStop(0.5, this.config.color + '44');
        gradient.addColorStop(1, this.config.color + '00');

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 2 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * pulse, 0, Math.PI * 2);
        ctx.fillStyle = this.config.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 14px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.config.symbol, this.x, this.y + 2);

        ctx.restore();
    }

    checkCollection(playerObj) {
        const dx = this.x - playerObj.x;
        const dy = this.y - playerObj.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < this.radius + playerObj.radius;
    }
}

let powerUps = [];
let mines = [];
let lastMineSpawnTime = 0;
const MINE_SPAWN_INTERVAL = 500; // 0.5 seconds

// Mine class for the MINE powerup
const MINE_SEEK_RANGE = 150; // Distance at which mines start drifting toward enemies
const MINE_SEEK_SPEED = 0.5; // How fast mines drift toward enemies

class Mine {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = 12;
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.life = 720; // 12 seconds lifetime
        this.armed = false;
        this.armTime = 30; // Arm after 0.5 seconds (30 frames)
    }

    update(enemies, freezeActive) {
        this.pulsePhase += 0.15;

        // Don't count down during freeze
        if (!freezeActive) {
            this.life--;

            if (this.armTime > 0) {
                this.armTime--;
                if (this.armTime <= 0) {
                    this.armed = true;
                }
            }
        }

        // Drift toward nearest enemy if armed and not frozen
        if (this.armed && !freezeActive && enemies.length > 0) {
            let nearestEnemy = null;
            let nearestDist = MINE_SEEK_RANGE;

            for (const enemy of enemies) {
                const dx = enemy.x - this.x;
                const dy = enemy.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestEnemy = enemy;
                }
            }

            if (nearestEnemy) {
                const dx = nearestEnemy.x - this.x;
                const dy = nearestEnemy.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0) {
                    // Gentle drift toward enemy
                    this.vx += (dx / dist) * MINE_SEEK_SPEED * 0.1;
                    this.vy += (dy / dist) * MINE_SEEK_SPEED * 0.1;
                }
            }
        }

        // Apply velocity with friction
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95;
        this.vy *= 0.95;

        return this.life <= 0;
    }

    draw() {
        const pulse = 1 + Math.sin(this.pulsePhase) * 0.15;
        const alpha = this.life < 60 ? (this.life / 60) : 1;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Outer glow
        const gradient = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.radius * 2 * pulse
        );
        gradient.addColorStop(0, this.armed ? 'rgba(255, 170, 0, 0.6)' : 'rgba(128, 128, 128, 0.4)');
        gradient.addColorStop(0.5, this.armed ? 'rgba(255, 170, 0, 0.3)' : 'rgba(128, 128, 128, 0.2)');
        gradient.addColorStop(1, 'rgba(255, 170, 0, 0)');

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 2 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Main mine body
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * pulse, 0, Math.PI * 2);
        ctx.fillStyle = this.armed ? '#ffaa00' : '#666666';
        ctx.fill();
        ctx.strokeStyle = this.armed ? '#ffffff' : '#888888';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Spikes
        const spikeCount = 8;
        for (let i = 0; i < spikeCount; i++) {
            const angle = (Math.PI * 2 / spikeCount) * i + this.pulsePhase * 0.5;
            const innerR = this.radius * pulse;
            const outerR = this.radius * pulse * 1.4;

            ctx.beginPath();
            ctx.moveTo(
                this.x + Math.cos(angle) * innerR,
                this.y + Math.sin(angle) * innerR
            );
            ctx.lineTo(
                this.x + Math.cos(angle) * outerR,
                this.y + Math.sin(angle) * outerR
            );
            ctx.strokeStyle = this.armed ? '#ffaa00' : '#666666';
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        // Center indicator
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = this.armed ? '#ff0000' : '#444444';
        ctx.fill();

        ctx.restore();
    }

    checkCollision(enemy) {
        if (!this.armed) return false;
        const dx = this.x - enemy.x;
        const dy = this.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < this.radius + enemy.radius;
    }

    explode() {
        AudioSystem.playEnemyDestroy();
        spawnParticles(this.x, this.y, '#ffaa00', 15, 6, 30, 5);
        spawnParticles(this.x, this.y, '#ff4400', 10, 5, 25, 4);
        triggerScreenShake(6);
    }
}
let activePowerUps = {
    shield: 0, // Now a count 0-3 instead of boolean
    slowmo: false,
    shrink: false,
    freeze: false,
    mine: false,
    fury: false,
    furyEndTime: 0
};
const MAX_SHIELDS = 3;
let powerUpTimers = {};

function spawnPowerUp(forceShield = false) {
    let type;
    if (forceShield) {
        type = 'SHIELD';
    } else {
        let types = Object.keys(PowerUpTypes);

        // Reduce shield spawn rate to 20% when player already has shields
        if (activePowerUps.shield > 0) {
            // Filter out SHIELD 80% of the time when shielded
            if (Math.random() > 0.2) {
                types = types.filter(t => t !== 'SHIELD');
            }
        }

        // FURY is 25% rarer - only spawn 75% of the time
        if (Math.random() > 0.75) {
            types = types.filter(t => t !== 'FURY');
        }

        type = types[Math.floor(Math.random() * types.length)];
    }
    const padding = 100;
    const x = padding + Math.random() * (canvas.width - padding * 2);
    const y = padding + Math.random() * (canvas.height - padding * 2);
    powerUps.push(new PowerUp(x, y, type));
}

function activatePowerUp(type) {
    AudioSystem.playPowerup();

    const popup = new ScorePopup(player.x, player.y - 40, type, PowerUpTypes[type].color);
    scorePopups.push(popup);

    switch(type) {
        case 'SHIELD':
            activePowerUps.shield = Math.min(MAX_SHIELDS, activePowerUps.shield + 1);
            break;
        case 'SLOWMO':
            activePowerUps.slowmo = true;
            clearTimeout(powerUpTimers.slowmo);
            powerUpTimers.slowmo = setTimeout(() => {
                activePowerUps.slowmo = false;
            }, PowerUpTypes.SLOWMO.duration);
            break;
        case 'SHRINK':
            activePowerUps.shrink = true;
            player.isShrunk = true;
            clearTimeout(powerUpTimers.shrink);
            powerUpTimers.shrink = setTimeout(() => {
                activePowerUps.shrink = false;
                player.isShrunk = false;
            }, PowerUpTypes.SHRINK.duration);
            break;
        case 'FREEZE':
            activePowerUps.freeze = true;
            AudioSystem.playFreeze();
            triggerScreenShake(5);
            clearTimeout(powerUpTimers.freeze);
            powerUpTimers.freeze = setTimeout(() => {
                activePowerUps.freeze = false;
            }, PowerUpTypes.FREEZE.duration);
            break;
        case 'BOMB':
            AudioSystem.playBomb();
            triggerScreenShake(15);
            const bombRadius = 400;
            for (let i = circles.length - 1; i >= 0; i--) {
                const c = circles[i];
                const dx = c.x - player.x;
                const dy = c.y - player.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < bombRadius) {
                    spawnParticles(c.x, c.y, `hsl(${c.hue}, 100%, 50%)`, 8, 4, 30, 4);
                    addScore(50, c.x, c.y);
                    circles.splice(i, 1);
                }
            }
            spawnParticles(player.x, player.y, '#ff4400', 20, 10, 40, 8);
            spawnParticles(player.x, player.y, '#ffff00', 15, 8, 35, 6);
            break;

        case 'MINE':
            activePowerUps.mine = true;
            lastMineSpawnTime = Date.now();
            // Spawn first mine immediately
            mines.push(new Mine(player.x, player.y));
            clearTimeout(powerUpTimers.mine);
            powerUpTimers.mine = setTimeout(() => {
                activePowerUps.mine = false;
            }, PowerUpTypes.MINE.duration);
            break;

        case 'FURY':
            activePowerUps.fury = true;
            activePowerUps.furyEndTime = Date.now() + PowerUpTypes.FURY.duration;
            AudioSystem.playFury();
            triggerScreenShake(10);
            spawnParticles(player.x, player.y, '#ff0000', 20, 8, 40, 6);
            clearTimeout(powerUpTimers.fury);
            powerUpTimers.fury = setTimeout(() => {
                activePowerUps.fury = false;
                activePowerUps.furyEndTime = 0;
            }, PowerUpTypes.FURY.duration);
            break;
    }
}

// ============================================
// ENEMY TYPES
// ============================================
const EnemyTypes = {
    NORMAL: 'normal',
    HOMING: 'homing',
    SPLITTER: 'splitter',
    PULSER: 'pulser',
    GHOST: 'ghost',
    SPEEDDEMON: 'speeddemon',
    BOSS: 'boss'
};

const HOMING_TRACK_DURATION = 5;

class GameCircle {
    constructor(x, y, radius, maxRadius, color, vx, vy, lifeSpan, type = EnemyTypes.NORMAL) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.maxRadius = maxRadius;
        this.baseMaxRadius = maxRadius;
        this.color = color;
        this.vx = vx;
        this.vy = vy;
        this.baseVx = vx;
        this.baseVy = vy;
        this.lifeSpan = lifeSpan;
        this.alpha = 1;
        this.hue = parseFloat(color.match(/\d+/)[0]);
        this.nearMissed = false;
        this.type = type;

        this.pulsePhase = Math.random() * Math.PI * 2;
        this.ghostPhase = Math.random() * Math.PI * 2;
        this.isVisible = true;

        this.trackingTime = HOMING_TRACK_DURATION * 60;
        this.isTracking = true;

        this.applyTypeModifiers();
    }

    applyTypeModifiers() {
        switch(this.type) {
            case EnemyTypes.HOMING:
                this.hue = 0;
                this.maxRadius *= 0.8;
                break;
            case EnemyTypes.SPLITTER:
                this.hue = 120;
                this.maxRadius *= 1.3;
                break;
            case EnemyTypes.PULSER:
                this.hue = 280;
                break;
            case EnemyTypes.GHOST:
                this.hue = 200;
                this.alpha = 0.6;
                break;
            case EnemyTypes.SPEEDDEMON:
                this.hue = 30;
                this.maxRadius *= 0.5;
                this.vx *= 2.5;
                this.vy *= 2.5;
                break;
            case EnemyTypes.BOSS:
                this.hue = 330;
                this.maxRadius = 80;
                this.vx *= 0.3;
                this.vy *= 0.3;
                this.lifeSpan = 30;
                break;
        }
    }

    draw() {
        if (this.type === EnemyTypes.GHOST) {
            this.ghostPhase += 0.05;
            this.isVisible = Math.sin(this.ghostPhase) > -0.3;
            if (!this.isVisible) {
                ctx.save();
                ctx.globalAlpha = 0.15;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.strokeStyle = `hsla(${this.hue}, 100%, 70%, 0.3)`;
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.restore();
                return;
            }
        }

        ctx.save();

        let glowAlpha = 1;
        if (this.type === EnemyTypes.HOMING && !this.isTracking) {
            glowAlpha = 0.5;
        }

        ctx.globalAlpha = this.alpha * (this.type === EnemyTypes.GHOST ? 0.7 : 1);

        const glowSize = this.type === EnemyTypes.BOSS ? 2 : 1.5;
        const gradient = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.radius * glowSize
        );

        if (this.type === EnemyTypes.HOMING && this.isTracking) {
            gradient.addColorStop(0, `hsla(${this.hue}, 100%, 70%, 0.9)`);
            gradient.addColorStop(0.5, `hsla(${this.hue}, 100%, 60%, 0.5)`);
            gradient.addColorStop(1, `hsla(${this.hue}, 100%, 50%, 0)`);
        } else {
            gradient.addColorStop(0, `hsla(${this.hue}, 100%, 60%, ${0.8 * glowAlpha})`);
            gradient.addColorStop(0.5, `hsla(${this.hue}, 100%, 50%, ${0.4 * glowAlpha})`);
            gradient.addColorStop(1, `hsla(${this.hue}, 100%, 50%, 0)`);
        }

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * glowSize, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${this.hue}, 100%, 50%, 0.6)`;
        ctx.fill();
        ctx.strokeStyle = `hsla(${this.hue}, 100%, 70%, 0.8)`;
        ctx.lineWidth = this.type === EnemyTypes.BOSS ? 4 : 2;
        ctx.stroke();

        if (this.type !== EnemyTypes.NORMAL && this.radius > 10) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.min(this.radius * 0.8, 16)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const symbols = {
                [EnemyTypes.HOMING]: this.isTracking ? '◎' : '○',
                [EnemyTypes.SPLITTER]: '✦',
                [EnemyTypes.PULSER]: '◈',
                [EnemyTypes.GHOST]: '◌',
                [EnemyTypes.SPEEDDEMON]: '»',
                [EnemyTypes.BOSS]: '★'
            };
            if (symbols[this.type]) {
                ctx.fillText(symbols[this.type], this.x, this.y);
            }
        }

        ctx.closePath();
        ctx.restore();
    }

    update(playerObj, slowmoActive, freezeActive) {
        const speedMultiplier = freezeActive ? 0 : (slowmoActive ? 0.3 : 1);

        if (this.lifeSpan > 0) {
            switch(this.type) {
                case EnemyTypes.HOMING:
                    if (this.isTracking) {
                        this.trackingTime -= speedMultiplier;
                        if (this.trackingTime <= 0) {
                            this.isTracking = false;
                        }
                    }

                    if (this.isTracking) {
                        const dx = playerObj.x - this.x;
                        const dy = playerObj.y - this.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist > 0) {
                            this.vx += (dx / dist) * 0.01 * speedMultiplier;
                            this.vy += (dy / dist) * 0.01 * speedMultiplier;
                            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                            if (speed > 1.5) {
                                this.vx = (this.vx / speed) * 1.5;
                                this.vy = (this.vy / speed) * 1.5;
                            }
                        }
                    }
                    break;

                case EnemyTypes.PULSER:
                    this.pulsePhase += 0.08;
                    const pulseFactor = 0.7 + Math.sin(this.pulsePhase) * 0.5;
                    this.maxRadius = this.baseMaxRadius * pulseFactor;
                    if (this.radius > this.maxRadius) {
                        this.radius = this.maxRadius;
                    }
                    break;

                case EnemyTypes.SPEEDDEMON:
                    if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
                    if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
                    break;
            }

            this.x += this.vx * speedMultiplier;
            this.y += this.vy * speedMultiplier;

            this.radius = Math.min(this.maxRadius, this.radius + 0.08);
            this.lifeSpan -= (1 / 60) * speedMultiplier;
        } else {
            this.alpha -= 0.04;
            if (this.alpha <= 0) {
                this.alpha = 0;
                spawnParticles(this.x, this.y, `hsl(${this.hue}, 100%, 50%)`, 5, 2, 20, 3);

                if (this.type === EnemyTypes.SPLITTER && this.baseMaxRadius > 15) {
                    for (let i = 0; i < 3; i++) {
                        const angle = (Math.PI * 2 / 3) * i;
                        const childVx = Math.cos(angle) * 2;
                        const childVy = Math.sin(angle) * 2;
                        const child = new GameCircle(
                            this.x, this.y, 0, this.baseMaxRadius * 0.4,
                            `hsla(120, 100%, 50%, 0.4)`,
                            childVx, childVy, 15, EnemyTypes.NORMAL
                        );
                        child.hue = 120;
                        circles.push(child);
                    }
                }
                return true;
            }
        }
        return false;
    }

    canCollide() {
        if (this.type === EnemyTypes.GHOST && !this.isVisible) {
            return false;
        }
        return true;
    }

    canBeDestroyedByDash() {
        return this.type === EnemyTypes.HOMING;
    }
}

// ============================================
// WAVE EVENTS
// ============================================
const WaveTypes = {
    SWARM: 'swarm',
    VORTEX: 'vortex',
    CROSSFIRE: 'crossfire',
    BOSS: 'boss'
};

let currentWave = null;
let waveTimer = 0;
let lastWaveTime = 0;
let waveNumber = 0;
let waveAnnouncement = null;

function triggerWave(type) {
    currentWave = type;
    waveTimer = 180;
    waveNumber++;

    const announcements = {
        [WaveTypes.SWARM]: 'SWARM INCOMING!',
        [WaveTypes.VORTEX]: 'VORTEX!',
        [WaveTypes.CROSSFIRE]: 'CROSSFIRE!',
        [WaveTypes.BOSS]: 'BOSS WAVE!'
    };

    waveAnnouncement = {
        text: announcements[type],
        life: 120,
        color: type === WaveTypes.BOSS ? '#ff00ff' : '#00ffff'
    };

    AudioSystem.playWaveWarning();
    if (type === WaveTypes.BOSS) {
        AudioSystem.playBossSpawn();
    }
}

function updateWave() {
    if (!currentWave) return;

    waveTimer--;

    switch(currentWave) {
        case WaveTypes.SWARM:
            if (waveTimer % 8 === 0) {
                const edge = Math.floor(Math.random() * 4);
                let x, y;
                switch(edge) {
                    case 0: x = Math.random() * canvas.width; y = 0; break;
                    case 1: x = canvas.width; y = Math.random() * canvas.height; break;
                    case 2: x = Math.random() * canvas.width; y = canvas.height; break;
                    case 3: x = 0; y = Math.random() * canvas.height; break;
                }
                const type = Math.random() < 0.2 ? EnemyTypes.SPEEDDEMON : EnemyTypes.NORMAL;
                const circle = createCircleAt(x, y, type);
                circles.push(circle);
            }
            break;

        case WaveTypes.VORTEX:
            if (waveTimer % 15 === 0) {
                const angle = (waveTimer / 15) * 0.5;
                const x = canvas.width / 2 + Math.cos(angle) * canvas.width * 0.6;
                const y = canvas.height / 2 + Math.sin(angle) * canvas.height * 0.6;
                const circle = createCircleAt(x, y, EnemyTypes.HOMING);
                circles.push(circle);
            }
            break;

        case WaveTypes.CROSSFIRE:
            if (waveTimer % 20 === 0) {
                const horizontal = Math.random() < 0.5;
                if (horizontal) {
                    for (let i = 0; i < 4; i++) {
                        const x = Math.random() < 0.5 ? 0 : canvas.width;
                        const y = (canvas.height / 5) * (i + 1);
                        const circle = createCircleAt(x, y, EnemyTypes.NORMAL);
                        circle.vx = x === 0 ? 2.5 : -2.5;
                        circle.vy = 0;
                        circles.push(circle);
                    }
                } else {
                    for (let i = 0; i < 4; i++) {
                        const x = (canvas.width / 5) * (i + 1);
                        const y = Math.random() < 0.5 ? 0 : canvas.height;
                        const circle = createCircleAt(x, y, EnemyTypes.NORMAL);
                        circle.vx = 0;
                        circle.vy = y === 0 ? 2.5 : -2.5;
                        circles.push(circle);
                    }
                }
            }
            break;

        case WaveTypes.BOSS:
            if (waveTimer === 170) {
                const x = Math.random() < 0.5 ? 0 : canvas.width;
                const y = canvas.height / 2;
                const boss = createCircleAt(x, y, EnemyTypes.BOSS);
                boss.vx = x === 0 ? 0.5 : -0.5;
                circles.push(boss);
            }
            break;
    }

    if (waveTimer <= 0) {
        currentWave = null;
    }
}

function createCircleAt(x, y, type = EnemyTypes.NORMAL) {
    const radius = 0;
    const maxRadius = (Math.random() * 20 + 10) * 2.5;
    const color = `hsla(${Math.random() * 360}, 100%, 50%, 0.4)`;
    const speedFactor = 1.5;
    const vx = (Math.random() * 4 - 2) / speedFactor;
    const vy = (Math.random() * 4 - 2) / speedFactor;
    const lifeSpan = Math.random() * 40 + 5;

    return new GameCircle(x, y, radius, maxRadius, color, vx, vy, lifeSpan, type);
}

function drawWaveAnnouncement() {
    if (!waveAnnouncement) return;

    waveAnnouncement.life--;
    if (waveAnnouncement.life <= 0) {
        waveAnnouncement = null;
        return;
    }

    const alpha = waveAnnouncement.life / 120;
    const scale = 1 + (1 - alpha) * 0.3;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${32 * scale}px "Press Start 2P"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = waveAnnouncement.color;
    ctx.shadowColor = waveAnnouncement.color;
    ctx.shadowBlur = 20;
    ctx.fillText(waveAnnouncement.text, canvas.width / 2, canvas.height / 3);
    ctx.restore();
}

// ============================================
// DASH ABILITY
// ============================================
let focusMeter = 0;
const MAX_FOCUS = 100;
const DASH_COST = 30;
const DASH_SPEED = 25;
const DASH_DURATION = 8;
let dashCooldown = 0;
let dashDirection = { x: 0, y: 0 };

// ============================================
// CANVAS SETUP
// ============================================
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ============================================
// PLAYER
// ============================================
let circles = [];
const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: 15,
    speed: 5,
    fillColor: "white",
    isDashing: false,
    dashFrames: 0,
    isShrunk: false,
    draw: function () {
        const now = Date.now();
        const pulseInterval = 1500;
        const pulseDuration = 300;
        const pulseStartTime = Math.floor(now / pulseInterval) * pulseInterval;
        const pulseProgress = (now - pulseStartTime) / pulseDuration;
        const pulseAlpha = Math.sin(pulseProgress * Math.PI) * 0.5 + 0.5;
        const isPulsing = pulseProgress < 1;

        const effectiveRadius = this.radius * (this.isShrunk ? 0.5 : 1);

        // Draw multiple shield circles based on shield count
        if (activePowerUps.shield > 0) {
            ctx.save();
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#00ff00';
            ctx.shadowBlur = 15;

            for (let i = 0; i < activePowerUps.shield; i++) {
                ctx.beginPath();
                ctx.arc(this.x, this.y, effectiveRadius + 8 + (i * 6), 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Check fury mode and blinking
        const isFury = activePowerUps.fury;
        const furyTimeLeft = activePowerUps.furyEndTime - Date.now();
        const furyBlinking = isFury && furyTimeLeft <= 2000;
        const furyVisible = !furyBlinking || Math.floor(Date.now() / 100) % 2 === 0;

        const glowGradient = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, effectiveRadius * 3
        );

        if (this.isDashing) {
            glowGradient.addColorStop(0, 'rgba(255, 0, 255, 0.5)');
            glowGradient.addColorStop(0.5, 'rgba(255, 0, 255, 0.2)');
            glowGradient.addColorStop(1, 'rgba(255, 0, 255, 0)');
        } else if (isFury) {
            glowGradient.addColorStop(0, 'rgba(255, 0, 0, 0.6)');
            glowGradient.addColorStop(0.5, 'rgba(255, 0, 0, 0.3)');
            glowGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
        } else {
            glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
            glowGradient.addColorStop(0.5, 'rgba(0, 255, 255, 0.1)');
            glowGradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
        }

        ctx.beginPath();
        ctx.arc(this.x, this.y, effectiveRadius * 3, 0, Math.PI * 2);
        ctx.fillStyle = glowGradient;
        ctx.fill();

        ctx.beginPath();
        let playerFillColor = 'white';
        if (this.isDashing) playerFillColor = '#ff00ff';
        else if (isFury && furyVisible) playerFillColor = '#ff0000';
        ctx.fillStyle = playerFillColor;
        ctx.imageSmoothingEnabled = true;

        if (isPulsing && !this.isDashing && !isFury) {
            ctx.globalAlpha = 1 - pulseAlpha * 0.3;
        } else if (isFury && !furyVisible) {
            ctx.globalAlpha = 0.3;
        } else {
            ctx.globalAlpha = 1;
        }

        ctx.arc(this.x, this.y, effectiveRadius, 0, Math.PI * 2);

        let strokeColor = combo > 5 ? "#ff00ff" : "#00ffff";
        if (this.isDashing) strokeColor = '#ffffff';
        else if (isFury) strokeColor = '#ff0000';
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 3;
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 15;
        ctx.stroke();

        ctx.fill();
        ctx.closePath();

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.imageSmoothingEnabled = false;
    },
};

let gameOver = false;
let gameOverTime = 0;
const RESTART_COOLDOWN = 2000; // 2 seconds
let startTime = Date.now();
let spawnTimer = 0;
let powerUpSpawnTimer = 0;
let dangerZoneSoundCooldown = 0;
let canvasClearedTime = 0; // Track when all enemies were cleared
let paused = false;
let pauseStartTime = 0;
let totalPausedTime = 0;

function init() {
    gameOver = false;
    startTime = Date.now();
    spawnTimer = 0;
    powerUpSpawnTimer = 300;
    canvasClearedTime = 0;
    paused = false;
    pauseStartTime = 0;
    totalPausedTime = 0;
    circles = [];
    particles = [];
    playerTrail = [];
    scorePopups = [];
    powerUps = [];
    mines = [];
    lastMineSpawnTime = 0;
    score = 0;
    dangerZoneAccumulator = 0;
    combo = 0;
    maxCombo = 0;
    nearMissStreak = 0;
    focusMeter = 50;
    dashCooldown = 0;
    currentWave = null;
    waveTimer = 0;
    lastWaveTime = 0;
    waveNumber = 0;
    waveAnnouncement = null;
    dangerZoneSoundCooldown = 0;
    player.x = canvas.width / 2;
    player.y = canvas.height / 2;
    player.isDashing = false;
    player.dashFrames = 0;
    player.isShrunk = false;
    screenShake = { x: 0, y: 0, intensity: 0 };

    activePowerUps = { shield: 0, slowmo: false, shrink: false, freeze: false, mine: false, fury: false, furyEndTime: 0 };
    Object.keys(powerUpTimers).forEach(key => clearTimeout(powerUpTimers[key]));
    powerUpTimers = {};

    document.getElementById("endGame").style.display = "none";
    document.getElementById("gameOverText").style.display = "none";
    document.getElementById("survivedText").style.display = "none";
    document.getElementById("restartButton").style.display = "none";

    document.getElementById("timer").style.display = "block";
    document.getElementById("scoreDisplay").style.display = "block";
    document.getElementById("comboDisplay").style.display = "none";
    // Hide focus bar on mobile since it doesn't function on touch devices
    document.getElementById("focusMeter").style.display = isMobileMode ? "none" : "block";
    document.getElementById("powerUpIndicator").style.display = "block";
    document.getElementById("copyright").style.display = "none";

    AudioSystem.init();
    AudioSystem.playStart();
    setTimeout(() => AudioSystem.startMusic(), 500);

    gameStarted = true;
    gameLoop();
}

function randomColor() {
    return `hsla(${Math.random() * 360}, 100%, 50%, 0.4)`;
}

function randomSize() {
    const baseSize = Math.random() * 20 + 10;
    return baseSize;
}

function spawnCircle(spawnCycle, elapsedSeconds) {
    const spawnPoints1 = [
        { x: 0, y: 0 },
        { x: canvas.width, y: 0 },
        { x: canvas.width, y: canvas.height },
        { x: 0, y: canvas.height },
    ];

    const spawnPoints2 = [
        { x: canvas.width / 2, y: 0 },
        { x: canvas.width, y: canvas.height / 2 },
        { x: canvas.width / 2, y: canvas.height },
        { x: 0, y: canvas.height / 2 },
    ];

    const spawnPoints = spawnCycle % 2 === 0 ? spawnPoints1 : spawnPoints2;
    const spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    const radius = 0;
    const maxRadius = randomSize() * 2.5;
    const color = randomColor();
    const speedFactor = 1.5;
    const vx = (Math.random() * 4 - 2) / speedFactor;
    const vy = (Math.random() * 4 - 2) / speedFactor;
    const lifeSpan = Math.random() * 40 + 5;

    let type = EnemyTypes.NORMAL;
    if (elapsedSeconds >= 60) {
        const roll = Math.random();
        if (roll < 0.08) type = EnemyTypes.HOMING;
        else if (roll < 0.14) type = EnemyTypes.SPLITTER;
        else if (roll < 0.20) type = EnemyTypes.PULSER;
        else if (roll < 0.25) type = EnemyTypes.GHOST;
        else if (roll < 0.30) type = EnemyTypes.SPEEDDEMON;
    } else if (elapsedSeconds >= 45) {
        const roll = Math.random();
        if (roll < 0.05) type = EnemyTypes.HOMING;
        else if (roll < 0.09) type = EnemyTypes.SPLITTER;
        else if (roll < 0.13) type = EnemyTypes.PULSER;
    }

    if (Math.random() < 0.05) {
        AudioSystem.playSpawn();
    }

    return new GameCircle(spawnPoint.x, spawnPoint.y, radius, maxRadius, color, vx, vy, lifeSpan, type);
}

function collision(obj1, obj2) {
    const dx = obj1.x - obj2.x;
    const dy = obj1.y - obj2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const r1 = obj1.radius * (obj1.isShrunk ? 0.5 : 1);
    const r2 = obj2.radius;
    return distance < r1 + r2;
}

function performDash() {
    if (focusMeter >= DASH_COST && dashCooldown <= 0 && !player.isDashing) {
        focusMeter -= DASH_COST;
        player.isDashing = true;
        player.dashFrames = DASH_DURATION;
        dashCooldown = 30;

        let dx = 0, dy = 0;
        if (keys.ArrowUp || keys.w) dy -= 1;
        if (keys.ArrowDown || keys.s) dy += 1;
        if (keys.ArrowLeft || keys.a) dx -= 1;
        if (keys.ArrowRight || keys.d) dx += 1;

        if (dx === 0 && dy === 0) {
            if (dragging) {
                dx = targetX - player.x;
                dy = targetY - player.y;
            } else {
                dx = 1;
            }
        }

        const mag = Math.sqrt(dx * dx + dy * dy);
        dashDirection = { x: dx / mag, y: dy / mag };

        AudioSystem.playDash();
        triggerScreenShake(5);
    }
}

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
}

function togglePause() {
    if (gameOver || !gameStarted) return;

    paused = !paused;
    if (paused) {
        pauseStartTime = Date.now();
        AudioSystem.stopMusic();
    } else {
        totalPausedTime += Date.now() - pauseStartTime;
        AudioSystem.startMusic();
    }
}

function gameLoop() {
    if (paused) {
        drawPauseOverlay();
        requestAnimationFrame(gameLoop);
        return;
    }

    updateScreenShake();
    ctx.save();
    ctx.translate(screenShake.x, screenShake.y);

    ctx.clearRect(-10, -10, canvas.width + 20, canvas.height + 20);

    drawDangerZones();

    const elapsedMillis = Date.now() - startTime - totalPausedTime;
    const elapsedSeconds = Math.floor(elapsedMillis / 1000);

    if (elapsedSeconds >= 30 && elapsedSeconds - lastWaveTime >= 30 && !currentWave) {
        lastWaveTime = elapsedSeconds;
        const waveTypes = [WaveTypes.SWARM, WaveTypes.VORTEX, WaveTypes.CROSSFIRE];
        if (waveNumber > 0 && waveNumber % 3 === 2) {
            triggerWave(WaveTypes.BOSS);
        } else {
            triggerWave(waveTypes[Math.floor(Math.random() * waveTypes.length)]);
        }
    }

    // Quick wave trigger when canvas is cleared (after initial 30s grace period)
    if (elapsedSeconds >= 30 && circles.length === 0 && !currentWave) {
        if (canvasClearedTime === 0) {
            canvasClearedTime = Date.now();
        } else if (Date.now() - canvasClearedTime >= 1000) {
            // Trigger wave 1 second after canvas was cleared
            lastWaveTime = elapsedSeconds;
            const waveTypes = [WaveTypes.SWARM, WaveTypes.VORTEX, WaveTypes.CROSSFIRE];
            triggerWave(waveTypes[Math.floor(Math.random() * waveTypes.length)]);
            canvasClearedTime = 0;
        }
    } else if (circles.length > 0) {
        canvasClearedTime = 0;
    }

    updateWave();

    // Reduce max circles and spawn rate by 25% on mobile
    const mobileMultiplier = isMobileMode ? 0.75 : 1;
    const maxCircles = Math.floor((elapsedSeconds >= 30 ? 150 : 100) * mobileMultiplier);
    if (circles.length < maxCircles) {
        if (spawnTimer <= 0) {
            const spawnCycle = Math.floor(elapsedSeconds / 20);
            const baseSpawn = elapsedSeconds === 0 ? 100 : 30;
            const numberOfCirclesToSpawn = Math.floor(baseSpawn * mobileMultiplier);

            for (let i = 0; i < numberOfCirclesToSpawn; i++) {
                circles.push(spawnCircle(spawnCycle, elapsedSeconds));
            }
            spawnTimer = 15 * 60;
        }

        // Continuous spawn - reduce frequency on mobile (every 5 frames instead of 4)
        const spawnFrequency = isMobileMode ? 5 : 4;
        if (elapsedSeconds >= 30 && spawnTimer % spawnFrequency == 0) {
            circles.push(spawnCircle(Math.floor(elapsedSeconds / 20), elapsedSeconds));
        }
    }

    spawnTimer--;

    powerUpSpawnTimer--;
    if (powerUpSpawnTimer <= 0) {
        const forceShield = elapsedSeconds < 30 && Math.random() < 0.5;
        spawnPowerUp(forceShield);
        powerUpSpawnTimer = 500 + Math.random() * 200;
    }

    if (player.isDashing && player.dashFrames > 0) {
        player.x += dashDirection.x * DASH_SPEED;
        player.y += dashDirection.y * DASH_SPEED;
        player.dashFrames--;

        spawnParticles(player.x, player.y, '#ff00ff', 2, 3, 15, 4);

        for (let i = circles.length - 1; i >= 0; i--) {
            const circle = circles[i];
            if (circle.canBeDestroyedByDash() && collision(player, circle)) {
                AudioSystem.playEnemyDestroy();
                spawnParticles(circle.x, circle.y, '#ff0000', 10, 5, 25, 5);
                addScore(200, circle.x, circle.y);
                circles.splice(i, 1);
                triggerScreenShake(8);
            }
        }

        if (player.dashFrames <= 0) {
            player.isDashing = false;
        }
    }

    dashCooldown = Math.max(0, dashCooldown - 1);

    if (!player.isDashing) {
        if (dragging) {
            const deltaX = targetX - player.x;
            const deltaY = targetY - player.y;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            if (distance > player.speed) {
                const ratio = player.speed / distance;
                player.x += deltaX * ratio;
                player.y += deltaY * ratio;
            } else {
                player.x = targetX;
                player.y = targetY;
            }
        }

        if (!dragging) {
            if (keys.ArrowUp || keys.w) player.y -= player.speed;
            if (keys.ArrowDown || keys.s) player.y += player.speed;
            if (keys.ArrowLeft || keys.a) player.x -= player.speed;
            if (keys.ArrowRight || keys.d) player.x += player.speed;
        }
    }

    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

    const inDangerZone = checkDangerZones();
    if (inDangerZone) {
        dangerZoneSoundCooldown--;
        if (dangerZoneSoundCooldown <= 0) {
            dangerZoneSoundCooldown = 30;
        }
    }

    updatePlayerTrail(player.x, player.y);
    drawPlayerTrail();
    player.draw();

    let frameNearMiss = 0;

    for (let i = 0; i < circles.length; i++) {
        const gameCircle = circles[i];
        const shouldRemove = gameCircle.update(player, activePowerUps.slowmo, activePowerUps.freeze);
        gameCircle.draw();

        if (!gameCircle.canCollide()) continue;

        const nearMissIntensity = checkNearMiss(player, gameCircle);
        if (nearMissIntensity > 0 && !gameCircle.nearMissed) {
            frameNearMiss = Math.max(frameNearMiss, nearMissIntensity);
            gameCircle.nearMissed = true;

            const points = Math.floor(nearMissIntensity * 100 * (1 + combo * 0.1));
            addScore(points, player.x, player.y - 30);

            focusMeter = Math.min(MAX_FOCUS, focusMeter + nearMissIntensity * 15);

            combo++;
            maxCombo = Math.max(maxCombo, combo);
            nearMissStreak++;
            lastNearMissTime = Date.now();

            if (combo === 5 || combo === 10 || combo === 25 || combo === 50 || combo === 100) {
                AudioSystem.playCombo(Math.floor(combo / 5));
                triggerScreenShake(5);
            }
        }

        if (!player.isDashing && collision(player, gameCircle)) {
            // Fury mode: player destroys enemies on contact
            if (activePowerUps.fury) {
                AudioSystem.playFuryKill();
                spawnParticles(gameCircle.x, gameCircle.y, '#ff0000', 12, 5, 35, 5);
                spawnParticles(gameCircle.x, gameCircle.y, `hsl(${gameCircle.hue}, 100%, 50%)`, 8, 4, 25, 4);
                addScore(100, gameCircle.x, gameCircle.y);
                triggerScreenShake(5);
                circles.splice(i, 1);
                i--;
                continue;
            }

            if (activePowerUps.shield > 0) {
                activePowerUps.shield--;
                AudioSystem.playShieldHit();
                triggerScreenShake(10);
                spawnParticles(player.x, player.y, '#00ff00', 15, 6, 30, 5);
                circles.splice(i, 1);
                i--;
                continue;
            }

            gameOver = true;
            gameOverTime = Date.now();
            AudioSystem.stopMusic();
            AudioSystem.playGameOver();
            spawnExplosion(player.x, player.y);
            triggerScreenShake(20);
            break;
        }

        if (shouldRemove) {
            circles.splice(i, 1);
            i--;
        }
    }

    for (let i = powerUps.length - 1; i >= 0; i--) {
        const pu = powerUps[i];
        if (pu.update()) {
            powerUps.splice(i, 1);
        } else {
            pu.draw();
            if (pu.checkCollection(player)) {
                activatePowerUp(pu.type);
                powerUps.splice(i, 1);
            }
        }
    }

    // Mine powerup: spawn mines every 0.5s while active
    if (activePowerUps.mine) {
        const now = Date.now();
        if (now - lastMineSpawnTime >= MINE_SPAWN_INTERVAL) {
            mines.push(new Mine(player.x, player.y));
            lastMineSpawnTime = now;
        }
    }

    // Update and draw mines, check collisions with enemies
    for (let i = mines.length - 1; i >= 0; i--) {
        const mine = mines[i];
        if (mine.update(circles, activePowerUps.freeze)) {
            mines.splice(i, 1);
        } else {
            mine.draw();

            // Check collision with enemies
            for (let j = circles.length - 1; j >= 0; j--) {
                const enemy = circles[j];
                if (mine.checkCollision(enemy)) {
                    mine.explode();
                    spawnParticles(enemy.x, enemy.y, `hsl(${enemy.hue}, 100%, 50%)`, 8, 4, 30, 4);
                    addScore(75, enemy.x, enemy.y);
                    circles.splice(j, 1);
                    mines.splice(i, 1);
                    break;
                }
            }
        }
    }

    if (frameNearMiss > 0) {
        AudioSystem.playNearMiss(frameNearMiss);
        triggerScreenShake(frameNearMiss * 3);
    }

    if (Date.now() - lastNearMissTime > 2000 && combo > 0) {
        combo = Math.max(0, combo - 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].update()) {
            particles.splice(i, 1);
        } else {
            particles[i].draw();
        }
    }

    for (let i = scorePopups.length - 1; i >= 0; i--) {
        if (scorePopups[i].update()) {
            scorePopups.splice(i, 1);
        } else {
            scorePopups[i].draw();
        }
    }

    drawWaveAnnouncement();

    ctx.restore();

    if (!gameOver) {
        const elapsedMillis = Date.now() - startTime;
        const elapsedSeconds = Math.floor(elapsedMillis / 1000);
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        const remainingSeconds = elapsedSeconds % 60;
        const timeDisplay = elapsedMinutes > 0
            ? `${elapsedMinutes}m ${remainingSeconds}s`
            : `${elapsedSeconds}s`;

        domElements.timer.innerText = timeDisplay;
        domElements.scoreDisplay.innerText = `SCORE: ${Math.floor(score)}`;

        if (combo > 0) {
            domElements.comboDisplay.style.display = 'block';
            domElements.comboDisplay.innerText = `${combo}x COMBO!`;
            domElements.comboDisplay.style.color = combo > 10 ? '#ff00ff' : '#00ffff';
        } else {
            domElements.comboDisplay.style.display = 'none';
        }

        domElements.focusBar.style.width = `${(focusMeter / MAX_FOCUS) * 100}%`;
        domElements.focusBar.style.backgroundColor = focusMeter >= DASH_COST ? '#00ffff' : '#666';

        updatePowerUpIndicators();

        requestAnimationFrame(gameLoop);
    } else {
        const survivedMillis = Date.now() - startTime;
        const survivedSeconds = Math.floor(survivedMillis / 1000);
        const survivedMinutes = Math.floor(survivedSeconds / 60);
        const remainingSeconds = survivedSeconds % 60;
        const timeDisplay = survivedMinutes > 0
            ? `${survivedMinutes}m ${remainingSeconds}s`
            : `${survivedSeconds}s`;

        if (score > highScore) {
            highScore = Math.floor(score);
        }

        // Send score to Penny's Arcade
        if (window.parent !== window && Math.floor(score) > 0) {
            window.parent.postMessage({
                type: 'GAME_OVER',
                game: 'tessles',
                score: Math.floor(score),
                stats: {
                    time: timeDisplay,
                    maxCombo: maxCombo,
                    waves: waveNumber
                }
            }, '*');
        }

        document.getElementById('survivedText').innerHTML =
            `SURVIVED: ${timeDisplay}<br>SCORE: ${Math.floor(score)}<br>MAX COMBO: ${maxCombo}x<br>WAVES: ${waveNumber}<br>HIGH SCORE: ${Math.floor(highScore)}`;

        document.getElementById("endGame").style.display = "flex";
        document.getElementById("gameOverText").style.display = "block";
        document.getElementById("survivedText").style.display = "block";
        document.getElementById("restartButton").style.display = "block";
        document.getElementById("scoreDisplay").style.display = "none";
        document.getElementById("comboDisplay").style.display = "none";
        document.getElementById("focusMeter").style.display = "none";
        document.getElementById("powerUpIndicator").style.display = "none";
        document.getElementById("timer").style.display = "none";
        document.getElementById("copyright").style.display = "block";

        // Handle restart button cooldown
        const restartBtn = document.getElementById("restartButton");
        restartBtn.disabled = true;
        restartBtn.style.opacity = '0.5';
        restartBtn.style.cursor = 'not-allowed';
        restartBtn.textContent = 'WAIT 2s';

        // Update button text during cooldown
        const cooldownInterval = setInterval(() => {
            const timeSinceGameOver = Date.now() - gameOverTime;
            const cooldownRemaining = Math.max(0, Math.ceil((RESTART_COOLDOWN - timeSinceGameOver) / 1000));
            if (cooldownRemaining > 0) {
                restartBtn.textContent = `WAIT ${cooldownRemaining}s`;
            } else {
                restartBtn.disabled = false;
                restartBtn.style.opacity = '1';
                restartBtn.style.cursor = 'pointer';
                restartBtn.textContent = 'RESTART';
                clearInterval(cooldownInterval);
            }
        }, 100);

        const renderExplosion = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            circles.forEach(c => {
                c.alpha *= 0.95;
                c.draw();
            });

            for (let i = particles.length - 1; i >= 0; i--) {
                if (particles[i].update()) {
                    particles.splice(i, 1);
                } else {
                    particles[i].draw();
                }
            }

            if (particles.length > 0) {
                requestAnimationFrame(renderExplosion);
            }
        };
        renderExplosion();
    }
}

function updatePowerUpIndicators() {
    let html = '';

    // Show shield count (1-3 shields stacked)
    for (let i = 0; i < activePowerUps.shield; i++) {
        html += '<span class="pu-icon pu-shield">S</span>';
    }
    if (activePowerUps.slowmo) html += '<span class="pu-icon pu-slowmo">T</span>';
    if (activePowerUps.shrink) html += '<span class="pu-icon pu-shrink">X</span>';
    if (activePowerUps.freeze) html += '<span class="pu-icon pu-freeze">F</span>';
    if (activePowerUps.mine) html += '<span class="pu-icon pu-mine">M</span>';

    domElements.powerUpIndicator.innerHTML = html;
}

// ============================================
// INPUT HANDLING
// ============================================
let targetX = player.x;
let targetY = player.y;
let dragging = false;

const buffer = 500;

canvas.addEventListener('mousedown', (e) => {
    const dx = e.clientX - canvas.offsetLeft - player.x;
    const dy = e.clientY - canvas.offsetTop - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    dragging = distance <= player.radius + buffer;
});

canvas.addEventListener('mouseup', () => {
    dragging = false;
});

canvas.addEventListener('mousemove', (e) => {
    if (dragging) {
        targetX = e.clientX - canvas.offsetLeft;
        targetY = e.clientY - canvas.offsetTop;
    }
});

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    AudioSystem.init();

    const touch = e.touches[0];
    const dx = touch.clientX - canvas.offsetLeft - player.x;
    const dy = touch.clientY - canvas.offsetTop - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    dragging = distance <= player.radius + buffer;
});

canvas.addEventListener('touchend', () => {
    dragging = false;
});

canvas.addEventListener('touchcancel', () => {
    dragging = false;
});

canvas.addEventListener('touchmove', (e) => {
    if (dragging) {
        e.preventDefault();
        targetX = e.touches[0].clientX - canvas.offsetLeft;
        targetY = e.touches[0].clientY - canvas.offsetTop;
    }
});

const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    w: false,
    a: false,
    s: false,
    d: false,
};

document.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = true;
    }

    if (e.code === 'Space' && gameStarted && !gameOver && !paused) {
        e.preventDefault();
        performDash();
    }

    if ((e.key === 'p' || e.key === 'P') && gameStarted && !gameOver) {
        e.preventDefault();
        togglePause();
    }
});

document.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = false;
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        // Prevent space from scrolling the page
        if (e.key === ' ') e.preventDefault();

        AudioSystem.init();

        if (!gameStarted) {
            hideWelcomeScreen();
            init();
        } else if (gameOver) {
            // Check cooldown before allowing restart
            const timeSinceGameOver = Date.now() - gameOverTime;
            if (timeSinceGameOver >= RESTART_COOLDOWN) {
                init();
            }
        }
    }
});

document.getElementById('restartButton').addEventListener('click', () => {
    // Check cooldown before allowing restart
    const timeSinceGameOver = Date.now() - gameOverTime;
    if (timeSinceGameOver >= RESTART_COOLDOWN) {
        init();
    }
});

document.getElementById('restartButton').addEventListener('touchend', (e) => {
    e.preventDefault();
    // Check cooldown before allowing restart
    const timeSinceGameOver = Date.now() - gameOverTime;
    if (timeSinceGameOver >= RESTART_COOLDOWN) {
        init();
    }
});

function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints;
}

function showWelcomeScreen() {
    document.getElementById('welcomeScreen').style.display = 'flex';
    updateHighScoreDisplay();
    document.getElementById("timer").style.display = "none";
    document.getElementById("scoreDisplay").style.display = "none";
    document.getElementById("comboDisplay").style.display = "none";
    document.getElementById("focusMeter").style.display = "none";
    document.getElementById("powerUpIndicator").style.display = "none";
}

function hideWelcomeScreen() {
    document.getElementById('welcomeScreen').style.display = 'none';
}

document.getElementById('startButton').addEventListener('click', () => {
    AudioSystem.init();
    hideWelcomeScreen();
    init();
});

let lastTapTime = 0;
canvas.addEventListener('touchstart', (e) => {
    const now = Date.now();
    if (now - lastTapTime < 300 && gameStarted && !gameOver) {
        performDash();
    }
    lastTapTime = now;
});

showWelcomeScreen();

function startGame() {
    gameLoop();
}
