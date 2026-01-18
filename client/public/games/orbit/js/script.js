// === ORBIT - A circular pong game ===

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// === MULTIPLAYER MODE DETECTION ===
const urlParams = new URLSearchParams(window.location.search);
const MULTIPLAYER_MODE = urlParams.get('mode') === 'multiplayer';
const AI_DISABLED_IN_MP = MULTIPLAYER_MODE; // Disable AI in multiplayer

// Multiplayer state
let mpPlayerId = null;
let mpIsSpectator = false;
let mpServerState = null;
let mpOtherPlayers = {}; // { id: { angle, velocity, ring, score, combo, username, avatarColor, paddleArc, phaseInProgress } }
let mpRoundNumber = 1;
let mpConnected = false;

// DOM elements
const scoreDisplay = document.getElementById('score');
const highScoreDisplay = document.getElementById('high-score');
const welcomeScreen = document.getElementById('welcome-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreDisplay = document.getElementById('final-score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const ringSwitchBtn = document.getElementById('ring-switch-btn');

// Game constants
const GAME_ID = 'orbit';
const ARENA_RADIUS_RATIO = 0.35; // Ratio of screen size
const INNER_RING_RATIO = 0.82; // Inner ring is 82% of outer ring radius
const PADDLE_ARC_BASE = 0.20; // Radians - base width of paddle
const PADDLE_THICKNESS = 18;
const PADDLE_SPEED = 4; // Radians per second (max speed)
const PADDLE_ACCELERATION = 5; // Acceleration in radians per second squared
const PADDLE_DECELERATION = 12; // Deceleration when reversing or stopping (higher = snappier reversal)
const RING_SWITCH_DURATION = 0.25; // Seconds for ring transition animation
const BALL_RADIUS = 8;
const BALL_SPEED = 150; // Pixels per second
const SPAWN_INTERVAL = 2000; // ms between ball spawns

// Game state
let arenaRadius;
let innerRadius;
let centerX, centerY;
let paddleAngle = -Math.PI / 2; // Start at top
let targetAngle = paddleAngle;
let paddleArc = PADDLE_ARC_BASE; // Current paddle arc (animated)
let targetPaddleArc = PADDLE_ARC_BASE; // Target paddle arc from powerups
let paddleVelocity = 0; // Current paddle angular velocity (radians per second)

// Dual ring system
let paddleRing = 0; // 0 = outer, 1 = inner
let ringSwitchProgress = 0; // 0 = not switching, 0-1 = mid-transition
let ringSwitchFrom = 0; // Ring we're switching from
let ringSwitchTo = 0; // Ring we're switching to
let ringSwitchStyle = 2; // 2 = Radial slide (default), 4 = Phase (kept for future use)
let balls = [];
let powerups = [];
let score = 0;
let highScore = 0;
let highScoreHolder = '';
let gameRunning = false;
let lastTime = 0;
let spawnTimer = 0;
let gameTime = 0; // Time elapsed in seconds

// Special ball state
let specialBall = null;
let specialBallTimer = 0; // Time until next special ball spawn
let specialBallActiveTime = 0; // How long current special ball has been active
let specialBallReadyToReturn = false; // Has reached return time, waiting for next hit
let specialBallReturning = false; // Is gravity trying to pull it back?
let specialBallClaimTime = 0; // Time spent in the inner claim zone
let specialBallForceCapture = false; // Once true, ball is being forcibly captured

// Active power-up effects
let activePowerups = []; // { type, endTime }

// ============================================================================
// AI PLAYERS SYSTEM - Remove this section to disable AI players
// ============================================================================
const AI_ENABLED = !AI_DISABLED_IN_MP; // Disabled in multiplayer mode

// AI Player configurations
const AI_PLAYERS = [
  {
    id: 'zen',
    name: 'Zen',
    color: '#00ff88',        // Green
    glowColor: 'rgba(0, 255, 136, 0.6)',
    personality: 'sedate',
    // Sedate personality: slower reactions, prefers safe positions, doesn't chase aggressively
    reactionSpeed: 0.6,      // How fast they react (0-1)
    aggression: 0.3,         // How aggressively they chase balls (0-1)
    riskTolerance: 0.2,      // How willing to take risky shots (0-1)
    preferredZone: 0.25,     // Prefers upper quarter of the arena (0-1 = angle fraction)
    wanderSpeed: 0.5,        // How fast they wander when idle
  },
  {
    id: 'blaze',
    name: 'Blaze',
    color: '#ff6600',        // Orange
    glowColor: 'rgba(255, 102, 0, 0.6)',
    personality: 'aggressive',
    // Aggressive personality: fast reactions, chases everything, high risk plays
    reactionSpeed: 0.95,     // Very fast reactions
    aggression: 0.9,         // Chases almost everything
    riskTolerance: 0.8,      // Takes risky shots often
    preferredZone: 0.5,      // Prefers middle of the arena
    wanderSpeed: 1.5,        // Moves quickly even when idle
  },
  {
    id: 'ghost',
    name: 'Ghost',
    color: '#aa66ff',        // Purple
    glowColor: 'rgba(170, 102, 255, 0.6)',
    personality: 'strategic',
    // Strategic personality: moderate speed, prefers inner ring, intercepts
    reactionSpeed: 0.75,     // Moderate reactions
    aggression: 0.6,         // Moderately aggressive
    riskTolerance: 0.5,      // Balanced risk
    preferredZone: 0.75,     // Prefers lower quarter of the arena
    wanderSpeed: 0.8,        // Moderate wander
    prefersInnerRing: true,  // Special: prefers inner ring
  }
];

// AI paddle state (initialized in startGame)
let aiPaddles = [];

// Create AI paddle object
function createAIPaddle(config, startAngle) {
  return {
    id: config.id,
    name: config.name,
    color: config.color,
    glowColor: config.glowColor,
    personality: config.personality,
    config: config,

    // Movement state
    angle: startAngle,
    velocity: 0,
    targetAngle: startAngle,
    ring: 0,                 // 0 = outer, 1 = inner
    ringSwitchProgress: 0,
    ringSwitchFrom: 0,
    ringSwitchTo: 0,

    // AI state
    currentTarget: null,     // Ball we're tracking
    lastDecisionTime: 0,     // When we last made a decision
    idleWanderTarget: startAngle,
    score: 0,                // Individual score tracking

    // Stats
    ballsHit: 0,
    powerupsCollected: 0,
  };
}

// Initialize AI paddles
function initAIPaddles() {
  aiPaddles = [];
  if (!AI_ENABLED) return;

  // Distribute AI paddles evenly around the arena, offset from player
  const playerAngle = -Math.PI / 2; // Player starts at top
  const aiCount = AI_PLAYERS.length;

  AI_PLAYERS.forEach((config, index) => {
    // Space AI paddles evenly, avoiding player position
    const angleOffset = ((index + 1) / (aiCount + 1)) * Math.PI * 2;
    const startAngle = normalizeAngle(playerAngle + angleOffset);
    aiPaddles.push(createAIPaddle(config, startAngle));
  });
}

// Get radius for an AI paddle (accounting for ring transitions)
function getAIPaddleRadius(ai) {
  if (ai.ringSwitchProgress <= 0) {
    return getRingRadius(ai.ring);
  }
  const fromRadius = getRingRadius(ai.ringSwitchFrom);
  const toRadius = getRingRadius(ai.ringSwitchTo);
  return fromRadius + (toRadius - fromRadius) * ai.ringSwitchProgress;
}

// === PADDLE COLLISION SYSTEM ===

// Check if two paddle arcs overlap at the same ring
function paddleArcsOverlap(angle1, angle2, arcWidth) {
  const diff = Math.abs(angleDifference(angle1, angle2));
  return diff < arcWidth; // They overlap if angular distance < arc width
}

// Get all paddles (player + AI) as a unified list for collision checks
function getAllPaddles() {
  const paddles = [];

  // Player paddle
  paddles.push({
    id: 'player',
    angle: paddleAngle,
    ring: paddleRing,
    ringSwitchProgress: ringSwitchProgress,
    ringSwitchTo: ringSwitchTo,
    velocity: paddleVelocity,
    isPlayer: true
  });

  // AI paddles
  if (AI_ENABLED) {
    for (const ai of aiPaddles) {
      paddles.push({
        id: ai.id,
        angle: ai.angle,
        ring: ai.ring,
        ringSwitchProgress: ai.ringSwitchProgress,
        ringSwitchTo: ai.ringSwitchTo,
        velocity: ai.velocity,
        isPlayer: false,
        ai: ai
      });
    }
  }

  return paddles;
}

// Check if a paddle position would collide with another paddle
// Returns the blocking paddle if blocked, null if clear
function checkPaddleBlocked(checkAngle, checkRing, excludeId) {
  const paddles = getAllPaddles();

  for (const paddle of paddles) {
    if (paddle.id === excludeId) continue;

    // Check if on same ring (or transitioning to same ring)
    const paddleCurrentRing = paddle.ringSwitchProgress > 0.5 ? paddle.ringSwitchTo : paddle.ring;
    if (paddleCurrentRing !== checkRing) continue;

    // Check arc overlap
    if (paddleArcsOverlap(checkAngle, paddle.angle, paddleArc)) {
      return paddle;
    }
  }

  return null;
}

// Check if ring switch destination is blocked
function isRingSwitchBlocked(switcherAngle, targetRing, excludeId) {
  return checkPaddleBlocked(switcherAngle, targetRing, excludeId) !== null;
}

// Apply paddle-to-paddle collision - pushes paddles apart if overlapping
function resolvePaddleCollisions() {
  const paddles = getAllPaddles();

  for (let i = 0; i < paddles.length; i++) {
    for (let j = i + 1; j < paddles.length; j++) {
      const p1 = paddles[i];
      const p2 = paddles[j];

      // Only check if on same ring
      const p1Ring = p1.ringSwitchProgress > 0.5 ? p1.ringSwitchTo : p1.ring;
      const p2Ring = p2.ringSwitchProgress > 0.5 ? p2.ringSwitchTo : p2.ring;
      if (p1Ring !== p2Ring) continue;

      // Check for overlap
      const angleDiff = angleDifference(p1.angle, p2.angle);
      const minSeparation = paddleArc * 1.05; // Slight buffer

      if (Math.abs(angleDiff) < minSeparation) {
        const overlap = minSeparation - Math.abs(angleDiff);
        const collisionDir = angleDiff > 0 ? 1 : -1; // p1 is clockwise from p2

        // Get velocities (positive = clockwise)
        const v1 = p1.velocity;
        const v2 = p2.velocity;

        // Calculate "push force" - velocity component pushing INTO the collision
        // p1 pushes into collision if moving counter-clockwise (toward p2)
        // p2 pushes into collision if moving clockwise (toward p1)
        const p1PushForce = Math.max(0, -v1 * collisionDir); // p1 pushing toward p2
        const p2PushForce = Math.max(0, v2 * collisionDir);  // p2 pushing toward p1

        // Total force determines who wins
        const totalForce = p1PushForce + p2PushForce + 0.1; // Small base to avoid division by zero
        const p1Ratio = p2PushForce / totalForce; // p1 gets pushed by p2's force
        const p2Ratio = p1PushForce / totalForce; // p2 gets pushed by p1's force

        // Calculate push amounts based on momentum
        const p1Push = overlap * p1Ratio;
        const p2Push = overlap * p2Ratio;

        // Apply position correction
        if (p1.isPlayer) {
          paddleAngle = normalizeAngle(paddleAngle + p1Push * collisionDir);
        } else if (p1.ai) {
          p1.ai.angle = normalizeAngle(p1.ai.angle + p1Push * collisionDir);
        }

        if (p2.isPlayer) {
          paddleAngle = normalizeAngle(paddleAngle - p2Push * collisionDir);
        } else if (p2.ai) {
          p2.ai.angle = normalizeAngle(p2.ai.angle - p2Push * collisionDir);
        }

        // Velocity exchange - bounce effect with some energy loss
        const bounceFactor = 0.6;
        const newV1 = v1 * 0.3 + v2 * bounceFactor * (p2PushForce > p1PushForce ? 1 : 0.3);
        const newV2 = v2 * 0.3 + v1 * bounceFactor * (p1PushForce > p2PushForce ? 1 : 0.3);

        if (p1.isPlayer) {
          paddleVelocity = newV1;
        } else if (p1.ai) {
          p1.ai.velocity = newV1;
        }

        if (p2.isPlayer) {
          paddleVelocity = newV2;
        } else if (p2.ai) {
          p2.ai.velocity = newV2;
        }

        // Spawn collision particles - more for harder hits
        const collisionIntensity = Math.min(1, (p1PushForce + p2PushForce) / PADDLE_SPEED);
        const collisionAngle = (p1.angle + p2.angle) / 2;
        const collisionRadius = getRingRadius(p1Ring);
        const cx = centerX + Math.cos(collisionAngle) * collisionRadius;
        const cy = centerY + Math.sin(collisionAngle) * collisionRadius;

        const particleCount = 5 + Math.floor(collisionIntensity * 15);
        const particleColor = collisionIntensity > 0.5 ? '#ffff00' : '#ffffff';
        spawnParticles(cx, cy, particleCount, particleColor, 60 + collisionIntensity * 100, 3, 0.3);

        // Screen shake for hard collisions
        if (collisionIntensity > 0.3) {
          triggerScreenShake(collisionIntensity * 5);
        }

        // Sound feedback for hard collisions
        if (collisionIntensity > 0.4) {
          AudioSystem.playBassHit(collisionIntensity * 0.5);
        }
      }
    }
  }
}

// AI decision making - find best target
function aiSelectTarget(ai) {
  const config = ai.config;
  let bestTarget = null;
  let bestScore = -Infinity;

  // Combine regular balls, special ball, and powerups as potential targets
  const allTargets = [
    ...balls.filter(b => !b.escaped).map(b => ({ ...b, type: 'ball', priority: 1 })),
    ...powerups.filter(p => !p.escaped).map(p => ({
      ...p,
      type: 'powerup',
      priority: POWERUP_TYPES[p.type].negative ? 0.3 : 2 // Avoid negative powerups
    })),
  ];

  if (specialBall) {
    allTargets.push({
      ...specialBall,
      type: 'special',
      priority: specialBallReturning ? 3 : 2 // High priority when returning
    });
  }

  const aiRadius = getAIPaddleRadius(ai);

  for (const target of allTargets) {
    const dx = target.x - centerX;
    const dy = target.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const targetAngle = Math.atan2(dy, dx);

    // How far is this target from the arena edge? (0 = center, 1 = edge)
    const urgency = dist / arenaRadius;

    // How close is this to our current position?
    const angleDist = Math.abs(angleDifference(targetAngle, ai.angle));
    const reachability = 1 - (angleDist / Math.PI); // 1 = right here, 0 = opposite side

    // Is this in our preferred zone?
    const normalizedAngle = (targetAngle + Math.PI) / (Math.PI * 2); // 0-1
    const zoneMatch = 1 - Math.abs(normalizedAngle - config.preferredZone);

    // Calculate score for this target
    let targetScore = 0;
    targetScore += urgency * 2 * config.aggression;           // Urgent targets (aggressive)
    targetScore += reachability * 3;                           // Prefer reachable targets
    targetScore += zoneMatch * (1 - config.aggression);        // Zone preference (sedate)
    targetScore += target.priority * config.aggression;        // Target type priority

    // Randomness based on personality
    targetScore += (Math.random() - 0.5) * (1 - config.reactionSpeed);

    if (targetScore > bestScore) {
      bestScore = targetScore;
      bestTarget = target;
    }
  }

  return bestTarget;
}

// AI movement update
function updateAIPaddle(ai, dt) {
  const config = ai.config;

  // Decision making - how often to reconsider targets
  const decisionInterval = 0.1 + (1 - config.reactionSpeed) * 0.4;
  if (gameTime - ai.lastDecisionTime > decisionInterval) {
    ai.lastDecisionTime = gameTime;
    ai.currentTarget = aiSelectTarget(ai);
  }

  // Determine target angle
  if (ai.currentTarget) {
    const dx = ai.currentTarget.x - centerX;
    const dy = ai.currentTarget.y - centerY;
    ai.targetAngle = Math.atan2(dy, dx);
  } else {
    // Idle wandering behavior
    if (Math.random() < 0.01) {
      ai.idleWanderTarget = normalizeAngle(ai.idleWanderTarget + (Math.random() - 0.5) * 0.5);
    }
    ai.targetAngle = ai.idleWanderTarget;
  }

  // Movement physics
  const maxSpeed = PADDLE_SPEED * (0.7 + config.reactionSpeed * 0.5);
  const acceleration = PADDLE_ACCELERATION * config.reactionSpeed;

  const angleDiff = angleDifference(ai.targetAngle, ai.angle);
  let desiredDirection = Math.sign(angleDiff);

  // Check if moving in desired direction would cause collision
  const predictedAngle = normalizeAngle(ai.angle + desiredDirection * paddleArc * 0.5);
  const wouldCollide = checkPaddleBlocked(predictedAngle, ai.ring, ai.id);

  if (wouldCollide) {
    // Try the other direction or stop
    const altDirection = -desiredDirection;
    const altPredictedAngle = normalizeAngle(ai.angle + altDirection * paddleArc * 0.5);
    const altWouldCollide = checkPaddleBlocked(altPredictedAngle, ai.ring, ai.id);

    if (!altWouldCollide && Math.abs(angleDiff) > paddleArc) {
      // Go the long way around
      desiredDirection = altDirection;
    } else {
      // Blocked both ways - stop and wait
      desiredDirection = 0;
      ai.velocity *= 0.8;
    }
  }

  // Only move if far enough from target and have a direction
  if (Math.abs(angleDiff) > 0.05 && desiredDirection !== 0) {
    ai.velocity += desiredDirection * acceleration * dt;
    ai.velocity = Math.max(-maxSpeed, Math.min(maxSpeed, ai.velocity));
  } else {
    // Decelerate when close to target or blocked
    ai.velocity *= 0.9;
  }

  // Apply velocity
  ai.angle += ai.velocity * dt;
  ai.angle = normalizeAngle(ai.angle);

  // Ring switch logic
  if (ai.ringSwitchProgress <= 0) {
    let wantsToSwitch = false;
    let targetRing = ai.ring === 0 ? 1 : 0;

    // Strategic AI (Ghost) prefers inner ring
    if (config.prefersInnerRing) {
      if (ai.ring === 0 && Math.random() < 0.02) {
        // On outer ring, wants to go inner
        wantsToSwitch = true;
        targetRing = 1;
      } else if (ai.ring === 1 && Math.random() < 0.005) {
        // On inner ring, occasionally goes outer
        wantsToSwitch = true;
        targetRing = 0;
      }
    } else {
      // Normal AI - switch based on risk tolerance
      wantsToSwitch = Math.random() < config.riskTolerance * 0.005;
    }

    // Try to switch if wanted and not blocked
    if (wantsToSwitch && !isRingSwitchBlocked(ai.angle, targetRing, ai.id)) {
      ai.ringSwitchFrom = ai.ring;
      ai.ringSwitchTo = targetRing;
      ai.ringSwitchProgress = 0.001;
    }
  }

  // Update ring switch animation
  if (ai.ringSwitchProgress > 0) {
    ai.ringSwitchProgress += dt / RING_SWITCH_DURATION;
    if (ai.ringSwitchProgress >= 1) {
      ai.ringSwitchProgress = 0;
      ai.ring = ai.ringSwitchTo;
    }
  }
}

// Check collision between a ball and an AI paddle
function checkAIPaddleCollision(ai, ballX, ballY, ballRadius) {
  if (ai.ringSwitchProgress > 0 && ringSwitchStyle === 4) {
    return { hit: false, edgeHit: false, deflectAngle: 0 };
  }

  const dx = ballX - centerX;
  const dy = ballY - centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ballAngle = Math.atan2(dy, dx);

  const paddleRadius = getAIPaddleRadius(ai);
  const halfThickness = PADDLE_THICKNESS / 2;

  // Check main arc collision
  const angleToPaddle = angleDifference(ballAngle, ai.angle);
  const withinArc = Math.abs(angleToPaddle) <= paddleArc / 2;
  const withinRadius = dist >= paddleRadius - halfThickness - ballRadius &&
                       dist <= paddleRadius + halfThickness + ballRadius;

  if (withinArc && withinRadius) {
    const edgeFactor = Math.abs(angleToPaddle) / (paddleArc / 2);
    const deflectAngle = ballAngle + Math.PI + (angleToPaddle * edgeFactor * 0.5);
    return { hit: true, edgeHit: false, deflectAngle: deflectAngle, ai: ai };
  }

  // Check end caps
  const paddleStart = ai.angle - paddleArc / 2;
  const paddleEnd = ai.angle + paddleArc / 2;

  const startCapX = centerX + Math.cos(paddleStart) * paddleRadius;
  const startCapY = centerY + Math.sin(paddleStart) * paddleRadius;
  const distStart = Math.sqrt((ballX - startCapX) ** 2 + (ballY - startCapY) ** 2);

  if (distStart <= halfThickness + ballRadius) {
    return { hit: true, edgeHit: true, deflectAngle: Math.atan2(ballY - startCapY, ballX - startCapX), ai: ai };
  }

  const endCapX = centerX + Math.cos(paddleEnd) * paddleRadius;
  const endCapY = centerY + Math.sin(paddleEnd) * paddleRadius;
  const distEnd = Math.sqrt((ballX - endCapX) ** 2 + (ballY - endCapY) ** 2);

  if (distEnd <= halfThickness + ballRadius) {
    return { hit: true, edgeHit: true, deflectAngle: Math.atan2(ballY - endCapY, ballX - endCapX), ai: ai };
  }

  return { hit: false, edgeHit: false, deflectAngle: 0 };
}

// Check collision with any paddle (player or AI) - returns first hit
function checkAnyPaddleCollision(ballX, ballY, ballRadius) {
  // Check player paddle first
  const playerHit = checkPaddleCollision(ballX, ballY, ballRadius);
  if (playerHit.hit) {
    return { ...playerHit, isPlayer: true };
  }

  // Check AI paddles
  if (AI_ENABLED) {
    for (const ai of aiPaddles) {
      const aiHit = checkAIPaddleCollision(ai, ballX, ballY, ballRadius);
      if (aiHit.hit) {
        return { ...aiHit, isPlayer: false };
      }
    }
  }

  return { hit: false, edgeHit: false, deflectAngle: 0 };
}

// Draw an AI paddle
function drawAIPaddle(ai) {
  const paddleRadius = getAIPaddleRadius(ai);
  const scale = ai.ringSwitchProgress > 0 && ringSwitchStyle === 4
    ? (ai.ringSwitchProgress < 0.5 ? 1 - ai.ringSwitchProgress * 2 : (ai.ringSwitchProgress - 0.5) * 2)
    : 1;

  const currentThickness = PADDLE_THICKNESS * scale;
  const currentArc = paddleArc * scale;

  if (currentThickness < 0.5 || currentArc < 0.01) return;

  // Glow effect
  const velocityGlow = Math.min(Math.abs(ai.velocity) / PADDLE_SPEED, 1);
  ctx.shadowBlur = 10 + velocityGlow * 15;
  ctx.shadowColor = ai.glowColor;

  ctx.strokeStyle = ai.color;
  ctx.lineWidth = currentThickness;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(
    centerX,
    centerY,
    paddleRadius,
    ai.angle - currentArc / 2,
    ai.angle + currentArc / 2
  );
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Draw name label near paddle (small, subtle)
  const labelRadius = paddleRadius + 25;
  const labelX = centerX + Math.cos(ai.angle) * labelRadius;
  const labelY = centerY + Math.sin(ai.angle) * labelRadius;
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillStyle = ai.color;
  ctx.textAlign = 'center';
  ctx.globalAlpha = 0.6;
  ctx.fillText(ai.name, labelX, labelY);
  ctx.globalAlpha = 1;
}

// Update all AI paddles
function updateAllAIPaddles(dt) {
  if (!AI_ENABLED) return;
  for (const ai of aiPaddles) {
    updateAIPaddle(ai, dt);
  }
}

// Draw all AI paddles
function drawAllAIPaddles() {
  if (!AI_ENABLED) return;
  for (const ai of aiPaddles) {
    drawAIPaddle(ai);
  }
}
// ============================================================================
// END AI PLAYERS SYSTEM
// ============================================================================

// Constants for special ball (the red game-ending ball)
const SPECIAL_BALL_SPAWN_INTERVAL = 30; // Seconds between special ball appearances
const SPECIAL_BALL_ACTIVE_DURATION = 15; // Seconds the special ball stays in play
const SPECIAL_BALL_RADIUS = 12;
const SPECIAL_BALL_RETURN_DISTANCE = 50; // Distance from center to trigger return

// Ball spawn and aging
const BALL_SPAWN_DURATION = 0.4; // Seconds to grow from nothing
const BALL_MATURITY_TIME = 12; // Seconds to reach full maturity (black inside)
const BALL_AGE_BONUS_MAX = 40; // Max bonus points from age (at full maturity)

// Power-ups
const POWERUP_SPAWN_CHANCE = 0.15; // Chance to spawn power-up instead of regular ball
const POWERUP_RADIUS = 10;
const POWERUP_TYPES = {
  // Positive powerups
  GROW: { color: '#00ff00', duration: 10, arcBonus: 0.10, negative: false },    // Green - bigger paddle
  SPEED: { color: '#00ffff', duration: 8, speedBonus: 2, negative: false },     // Cyan - faster paddle
  SLOW: { color: '#0088ff', duration: 6, ballSpeedMult: 0.5, negative: false }, // Blue - slow balls
  POINTS: { color: '#ff00ff', duration: 10, pointsMult: 2, negative: false },   // Magenta - double points
  // Negative powerups
  SHRINK: { color: '#ff8800', duration: 8, arcBonus: -0.06, negative: true },   // Orange - smaller paddle
  FAST: { color: '#ffff00', duration: 6, ballSpeedMult: 1.5, negative: true }   // Yellow - faster balls
};

// Paddle animation
const PADDLE_ARC_LERP_SPEED = 4; // How fast paddle size changes

// Special ball gravity and return mechanics
const SPECIAL_BALL_GRAVITY_RANGE = 0.7; // Fraction of arena radius where gravity applies
const SPECIAL_BALL_GRAVITY_STRENGTH = 120; // Gravity acceleration toward center
const SPECIAL_BALL_CLAIM_ZONE = 0.4; // Inner zone where claim timer ticks
const SPECIAL_BALL_CLAIM_TIME = 4; // Seconds in claim zone before forced capture
const SPECIAL_BALL_CAPTURE_SPEED = 300; // Speed of forced capture animation
const SPECIAL_BALL_SHRINK_START = 80; // Distance from center where shrinking begins
const SPECIAL_BALL_CAPTURE_RADIUS = 15; // Distance at which ball is fully captured

// Ball momentum from paddle hits
const BALL_MOMENTUM_BOOST = 1.8; // Max speed multiplier from paddle momentum
const BALL_MOMENTUM_DECAY = 0.3; // How fast momentum decays back to 1 (per second)

// Risky shot bonuses
const EDGE_HIT_BONUS = 15; // Bonus points for hitting with paddle edge
const SPEED_HIT_BONUS = 25; // Bonus points for fast paddle hits
const TRANSFER_HIT_BONUS = 20; // Bonus points for hitting during ring transfer
const TRANSFER_SPIN = 2.5; // Spin applied to balls hit during transfer (radians/sec)
const TRANSFER_SPEED_BOOST = 1.6; // Speed multiplier for balls hit during transfer
const SPIN_DECAY_RATE = 0.25; // How quickly spin decays (lower = longer curve)

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

  // Classic pong-style paddle hit
  playPaddleHit(isEdgeHit = false, momentum = 1) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Higher pitch for edge hits, varies with momentum
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

  // Red ball hit - deeper, more dramatic
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

  // Ball spawning from center
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

  // Special ball spawn - ominous
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

  // Powerup collected - positive
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

  // Powerup collected - negative
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

  // Return phase activated
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

  // Ball captured by center
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

  // Game over
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

  // Combo sound - musical notes scaling with combo level
  playCombo(comboLevel) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Musical scale: C, E, G, C, E (pentatonic feel)
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

  // Bass hit for impactful moments
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

  // Near miss swoosh
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

  // Wave incoming warning
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

  // Ring switch whoosh
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

  // Milestone achievement fanfare
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

  // Background music system
  musicGain: null,
  musicPlaying: false,
  bassOsc: null,

  startMusic() {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.08;
    this.musicGain.connect(this.masterGain);

    // Low drone bass
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

  // Intensify music based on game state
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
    // Slow down
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
    particles.push(new Particle(
      x, y,
      Math.cos(angle) * vel,
      Math.sin(angle) * vel,
      color, size, life, type
    ));
  }
}

function spawnExplosion(x, y, color = '#fff', intensity = 1) {
  const count = Math.floor(20 * intensity);
  const types = ['circle', 'square', 'star'];
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const vel = (150 + Math.random() * 200) * intensity;
    particles.push(new Particle(
      x, y,
      Math.cos(angle) * vel,
      Math.sin(angle) * vel,
      color,
      3 + Math.random() * 5,
      0.4 + Math.random() * 0.4,
      types[Math.floor(Math.random() * types.length)]
    ));
  }
}

function spawnRingBurst(x, y, radius, color, count = 30) {
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = (i / count) * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    particles.push(new Particle(
      px, py,
      Math.cos(angle) * 100,
      Math.sin(angle) * 100,
      color, 4, 0.6, 'circle'
    ));
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
const COMBO_TIMEOUT = 3; // Seconds without hit before combo resets
const COMBO_MILESTONES = [5, 10, 25, 50, 100];

function incrementCombo() {
  combo++;
  lastHitTime = gameTime;
  if (combo > maxCombo) maxCombo = combo;

  // Check milestones
  if (COMBO_MILESTONES.includes(combo)) {
    AudioSystem.playCombo(COMBO_MILESTONES.indexOf(combo));
    triggerScreenShake(5 + combo * 0.2);
    spawnRingBurst(centerX, centerY, arenaRadius * 0.3, getComboColor(), combo);
    sendTickerMessage(`${combo}x COMBO!`);
  }
}

function updateCombo(dt) {
  if (combo > 0 && gameTime - lastHitTime > COMBO_TIMEOUT) {
    combo = Math.max(0, combo - 1);
  }
}

function getComboMultiplier() {
  return 1 + combo * 0.1; // 10% bonus per combo
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
    ctx.arc(
      centerX,
      centerY,
      paddleRadius,
      point.angle - paddleArc * arcScale / 2,
      point.angle + paddleArc * arcScale / 2
    );
    ctx.stroke();
  }
}

// === WAVE SYSTEM ===
let currentWave = 0;
let waveTimer = 0;
let waveActive = false;
let waveType = 'NORMAL';
const WAVE_INTERVAL = 25; // Seconds between waves
const WAVE_DURATION = 8; // How long a wave lasts
const WAVE_TYPES = ['SWARM', 'RAPID', 'CHAOS', 'BOSS'];

function startWave() {
  currentWave++;
  waveActive = true;
  waveTimer = 0;

  // Every 4th wave is a BOSS wave
  if (currentWave % 4 === 0) {
    waveType = 'BOSS';
  } else {
    waveType = WAVE_TYPES[Math.floor(Math.random() * 3)];
  }

  AudioSystem.playWaveWarning();
  triggerScreenShake(8);
  sendTickerMessage(`WAVE ${currentWave}: ${waveType}!`);
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
    case 'SWARM': return 3; // 3x spawn rate
    case 'RAPID': return 2.5;
    case 'CHAOS': return 2;
    case 'BOSS': return 0.5; // Fewer but spawn special ball
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
const NEAR_MISS_THRESHOLD = 30; // Pixels from paddle edge for near miss

function checkNearMiss(ballX, ballY, ballRadius) {
  const paddleRadius = getCurrentPaddleRadius();
  const dx = ballX - centerX;
  const dy = ballY - centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ballAngle = Math.atan2(dy, dx);

  // Check if ball just passed the paddle zone
  const nearPaddleRadius = dist >= paddleRadius - PADDLE_THICKNESS / 2 - ballRadius - NEAR_MISS_THRESHOLD &&
                           dist <= paddleRadius + PADDLE_THICKNESS / 2 + ballRadius + NEAR_MISS_THRESHOLD;

  if (!nearPaddleRadius) return 0;

  // Check angle - how close to paddle arc edge?
  const angleToPaddle = Math.abs(angleDifference(ballAngle, paddleAngle));
  const halfArc = paddleArc / 2;

  // Near miss if just outside paddle arc
  if (angleToPaddle > halfArc && angleToPaddle < halfArc + 0.3) {
    const intensity = 1 - (angleToPaddle - halfArc) / 0.3;
    return intensity;
  }

  return 0;
}

// === ACHIEVEMENT/TICKER MESSAGES ===
const sentMessages = new Set();
const MESSAGE_COOLDOWN = 60; // Seconds before same message can be sent again

function sendTickerMessage(message) {
  if (window.parent !== window) {
    window.parent.postMessage({
      type: 'TICKER_MESSAGE',
      message: message
    }, '*');
  }
}

function checkMilestones() {
  // Score milestones
  const scoreMilestones = [1000, 2500, 5000, 10000, 25000, 50000, 100000];
  for (const milestone of scoreMilestones) {
    const key = `score_${milestone}`;
    if (score >= milestone && !sentMessages.has(key)) {
      sentMessages.add(key);
      sendTickerMessage(`${milestone >= 1000 ? Math.floor(milestone/1000) + 'K' : milestone} POINTS!`);
      AudioSystem.playMilestone();
      spawnRingBurst(centerX, centerY, arenaRadius * 0.4, '#ffff00', 50);
      triggerScreenShake(10);
    }
  }

  // Time milestones
  const timeMilestones = [60, 120, 180, 300, 600];
  for (const milestone of timeMilestones) {
    const key = `time_${milestone}`;
    if (gameTime >= milestone && !sentMessages.has(key)) {
      sentMessages.add(key);
      const mins = Math.floor(milestone / 60);
      sendTickerMessage(mins === 1 ? '1 MIN SURVIVED!' : `${mins} MINS!`);
    }
  }

  // Wave milestones
  if (currentWave === 5 && !sentMessages.has('wave_5')) {
    sentMessages.add('wave_5');
    sendTickerMessage('WAVE MASTER!');
  }
  if (currentWave === 10 && !sentMessages.has('wave_10')) {
    sentMessages.add('wave_10');
    sendTickerMessage('WAVE LEGEND!');
  }
}

// Input state
let isDragging = false;
let isMobile = new URLSearchParams(window.location.search).get('mobile') === 'true';
let keysDown = { clockwise: false, counterClockwise: false };

// === PENNY'S ARCADE INTEGRATION ===

window.addEventListener('message', (event) => {
  if (event.data?.type === 'HIGH_SCORE_DATA') {
    highScore = event.data.score || 0;
    highScoreHolder = event.data.username || '';
    updateHighScoreDisplay();
  }
});

function notifyGameStart() {
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'GAME_START', game: GAME_ID }, '*');
  }
}

function notifyGameOver(finalScore, stats) {
  if (window.parent !== window && finalScore > 0) {
    window.parent.postMessage({
      type: 'GAME_OVER',
      game: GAME_ID,
      score: Math.floor(finalScore),
      stats: stats
    }, '*');
  }
}

function updateHighScoreDisplay() {
  if (highScore > 0) {
    if (highScoreHolder) {
      highScoreDisplay.textContent = `HIGH SCORE: ${highScore} (${highScoreHolder})`;
    } else {
      highScoreDisplay.textContent = `HIGH SCORE: ${highScore}`;
    }
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

// Get the radius of a specific ring (0 = outer, 1 = inner)
function getRingRadius(ring) {
  return ring === 0 ? arenaRadius : innerRadius;
}

// Get current paddle radius accounting for transitions
function getCurrentPaddleRadius() {
  if (ringSwitchProgress <= 0) {
    return getRingRadius(paddleRing);
  }

  const fromRadius = getRingRadius(ringSwitchFrom);
  const toRadius = getRingRadius(ringSwitchTo);
  const t = ringSwitchProgress;

  switch (ringSwitchStyle) {
    case 2: // Radial slide - linear interpolation (default)
      return fromRadius + (toRadius - fromRadius) * t;

    case 4: // Phase - shrink to nothing, then grow (kept for future use)
      // This is handled differently - returns current ring radius
      // The paddle thickness is animated instead
      return t < 0.5 ? fromRadius : toRadius;

    default:
      return fromRadius + (toRadius - fromRadius) * t;
  }
}

// Get paddle scale for phase transition (style 4)
function getPaddleTransitionScale() {
  if (ringSwitchProgress <= 0 || ringSwitchStyle !== 4) {
    return 1;
  }
  const t = ringSwitchProgress;
  // Shrink to 0 at t=0.5, then grow back to 1
  return t < 0.5 ? 1 - (t * 2) : (t - 0.5) * 2;
}

// Initiate ring switch
function switchRing() {
  if (ringSwitchProgress > 0) return; // Already switching

  const targetRing = paddleRing === 0 ? 1 : 0;

  // Check if destination ring is blocked by another paddle
  if (isRingSwitchBlocked(paddleAngle, targetRing, 'player')) {
    // Can't switch - play blocked sound and show feedback
    AudioSystem.playPowerupBad();
    triggerScreenShake(2);
    // Spawn red particles to indicate blocked
    const paddleRadius = getCurrentPaddleRadius();
    spawnParticles(
      centerX + Math.cos(paddleAngle) * paddleRadius,
      centerY + Math.sin(paddleAngle) * paddleRadius,
      8, '#ff0000', 50, 3, 0.3
    );
    return;
  }

  ringSwitchFrom = paddleRing;
  ringSwitchTo = targetRing;
  ringSwitchProgress = 0.001; // Start transition

  AudioSystem.playRingSwitch();
  triggerScreenShake(3);

  // Spawn particles along paddle arc
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

// Mouse events
canvas.addEventListener('mousedown', (e) => handlePointerDown(e.clientX, e.clientY));
canvas.addEventListener('mousemove', (e) => handlePointerMove(e.clientX, e.clientY));
canvas.addEventListener('mouseup', handlePointerUp);
canvas.addEventListener('mouseleave', handlePointerUp);

// Touch events - double-tap to switch rings
let lastTapTime = 0;
const DOUBLE_TAP_THRESHOLD = 300; // ms

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.touches[0];

  // Check for double-tap to switch rings
  const now = Date.now();
  if (now - lastTapTime < DOUBLE_TAP_THRESHOLD) {
    // Double-tap detected - switch rings
    if (gameRunning) {
      switchRing();
    }
    lastTapTime = 0; // Reset to prevent triple-tap triggering
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

// Keyboard events - W/D clockwise, A/S counter-clockwise, Space to switch rings
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'w' || key === 'd') {
    keysDown.clockwise = true;
  } else if (key === 'a' || key === 's') {
    keysDown.counterClockwise = true;
  } else if (key === ' ' || key === 'shift') {
    // Space or Shift to switch rings
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
  // Random direction outward from center
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
    speedMult: 1, // Momentum multiplier, decays to 1
    hitCooldown: 0, // Prevents double-hit detection
    escaped: false,
    spin: 0, // Angular velocity for curved trajectory (radians/sec)
    nearMissTriggered: false // Track if near-miss already triggered
  });
  AudioSystem.playBallSpawn();

  // Spawn particles at center
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
    returnTime: 0, // Time spent in returning phase (for bonus points)
    spin: 0 // Angular velocity for curved trajectory (radians/sec)
  };
  specialBallActiveTime = 0;
  specialBallReadyToReturn = false;
  specialBallReturning = false;
  specialBallClaimTime = 0;
  specialBallForceCapture = false;
  AudioSystem.playSpecialSpawn();

  // Dramatic particle explosion
  spawnExplosion(centerX, centerY, '#ff0000', 1.5);
  triggerScreenShake(8);
  sendTickerMessage('RED BALL INCOMING!');
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

// Calculate age bonus - linear up to maturity, then capped
function getAgeBonus(age) {
  const maturity = Math.min(1, age / BALL_MATURITY_TIME);
  return Math.floor(maturity * BALL_AGE_BONUS_MAX);
}

// Calculate ball maturity (0-1) for visual darkening
function getBallMaturity(age) {
  return Math.min(1, age / BALL_MATURITY_TIME);
}

// Get current paddle arc (base + powerup bonuses)
function getCurrentPaddleArc() {
  let arc = PADDLE_ARC_BASE;
  for (const pu of activePowerups) {
    if (POWERUP_TYPES[pu.type].arcBonus) {
      arc += POWERUP_TYPES[pu.type].arcBonus;
    }
  }
  // Ensure minimum paddle size
  return Math.max(0.08, arc);
}

// Get current paddle speed (base + powerup bonuses)
function getCurrentPaddleSpeed() {
  let speed = PADDLE_SPEED;
  for (const pu of activePowerups) {
    if (pu.type === 'SPEED') {
      speed += POWERUP_TYPES.SPEED.speedBonus;
    }
  }
  return speed;
}

// Get current ball speed multiplier from powerups
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

// Get current points multiplier from powerups
function getPointsMultiplier() {
  let mult = 1;
  for (const pu of activePowerups) {
    if (pu.type === 'POINTS') {
      mult *= POWERUP_TYPES.POINTS.pointsMult;
    }
  }
  return mult;
}

// Activate a powerup
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

// Check collision with paddle including rounded ends
// Returns { hit, edgeHit, deflectAngle }
function checkPaddleCollision(ballX, ballY, ballRadius) {
  // Don't check collision during ring transition with phase style
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

  // Check main arc collision
  const angleToPaddle = angleDifference(ballAngle, paddleAngle);
  const withinArc = Math.abs(angleToPaddle) <= paddleArc / 2;
  const withinRadius = dist >= paddleRadius - halfThickness - ballRadius &&
                       dist <= paddleRadius + halfThickness + ballRadius;

  if (withinArc && withinRadius) {
    // Deflect toward center with slight angle based on hit position
    const edgeFactor = Math.abs(angleToPaddle) / (paddleArc / 2);
    const deflectAngle = ballAngle + Math.PI + (angleToPaddle * edgeFactor * 0.5);
    return { hit: true, edgeHit: false, deflectAngle: deflectAngle };
  }

  // Check end caps
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

// === GAME LOGIC ===

function update(dt) {
  if (!gameRunning) return;

  // Track game time
  gameTime += dt;

  // Update all juice systems
  updateParticles(dt);
  updateScreenShake();
  updateCombo(dt);
  updateScorePopups(dt);
  updatePaddleTrail();
  updateWave(dt);
  updateAllAIPaddles(dt);
  resolvePaddleCollisions(); // Prevent paddles from phasing through each other
  checkMilestones();

  // Update music intensity based on game state
  const intensity = Math.min(1, (balls.length / 10) + (waveActive ? 0.3 : 0) + (specialBall ? 0.2 : 0));
  AudioSystem.setMusicIntensity(intensity);

  // Update active powerups (remove expired ones)
  activePowerups = activePowerups.filter(pu => pu.endTime > gameTime);

  // Get target paddle arc and animate toward it
  targetPaddleArc = getCurrentPaddleArc();
  const arcDiff = targetPaddleArc - paddleArc;
  paddleArc += arcDiff * Math.min(1, PADDLE_ARC_LERP_SPEED * dt);

  const currentPaddleSpeed = getCurrentPaddleSpeed();
  const ballSpeedMult = getBallSpeedMultiplier();

  // Move paddle with physics-based velocity
  // Determine desired direction from input (-1 = counter-clockwise, 0 = none, 1 = clockwise)
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
    // Check if we're trying to reverse direction
    const isReversing = (desiredDirection > 0 && paddleVelocity < -0.1) ||
                        (desiredDirection < 0 && paddleVelocity > 0.1);

    if (isReversing) {
      // Decelerate first (must slow down before reversing)
      if (paddleVelocity > 0) {
        paddleVelocity = Math.max(0, paddleVelocity - PADDLE_DECELERATION * dt);
      } else {
        paddleVelocity = Math.min(0, paddleVelocity + PADDLE_DECELERATION * dt);
      }
    } else {
      // Accelerate in desired direction
      paddleVelocity += desiredDirection * PADDLE_ACCELERATION * dt;
      // Clamp to max speed
      paddleVelocity = Math.max(-maxSpeed, Math.min(maxSpeed, paddleVelocity));
    }
  } else {
    // No input - decelerate to stop
    if (Math.abs(paddleVelocity) < 0.1) {
      paddleVelocity = 0;
    } else if (paddleVelocity > 0) {
      paddleVelocity = Math.max(0, paddleVelocity - PADDLE_DECELERATION * dt);
    } else {
      paddleVelocity = Math.min(0, paddleVelocity + PADDLE_DECELERATION * dt);
    }
  }

  // Apply velocity to position
  paddleAngle += paddleVelocity * dt;
  paddleAngle = normalizeAngle(paddleAngle);

  // Update ring switch animation
  if (ringSwitchProgress > 0) {
    ringSwitchProgress += dt / RING_SWITCH_DURATION;
    if (ringSwitchProgress >= 1) {
      ringSwitchProgress = 0;
      paddleRing = ringSwitchTo;
    }
  }

  // Special ball spawning/cycling
  if (specialBall === null) {
    specialBallTimer += dt;
    if (specialBallTimer >= SPECIAL_BALL_SPAWN_INTERVAL) {
      spawnSpecialBall();
      specialBallTimer = 0;
    }
  }

  // Spawn regular balls (or powerups) - wave system affects spawn rate
  const waveSpawnMult = getWaveSpawnRate();
  spawnTimer += dt * 1000 * waveSpawnMult;
  if (spawnTimer >= SPAWN_INTERVAL) {
    // Spawn powerup or ball
    if (Math.random() < POWERUP_SPAWN_CHANCE) {
      spawnPowerup();
    } else {
      spawnBall();
    }
    spawnTimer = 0;

    // During BOSS wave, also spawn extra special balls
    if (waveActive && waveType === 'BOSS' && specialBall === null && Math.random() < 0.3) {
      spawnSpecialBall();
    }
  }

  // Update special ball
  if (specialBall) {
    // Update spawn animation
    if (specialBall.spawnProgress < 1) {
      specialBall.spawnProgress = Math.min(1, specialBall.spawnProgress + dt / BALL_SPAWN_DURATION);
    }

    specialBall.age += dt;
    specialBallActiveTime += dt;

    // Mark as ready to return when time is up (but wait for next hit to activate)
    if (specialBallActiveTime >= SPECIAL_BALL_ACTIVE_DURATION && !specialBallReturning) {
      specialBallReadyToReturn = true;
    }

    const dx = specialBall.x - centerX;
    const dy = specialBall.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ballAngle = Math.atan2(dy, dx);

    // Handle return/gravity mechanics
    if (specialBallReturning) {
      // Track time in return phase for bonus points
      specialBall.returnTime += dt;

      const gravityRange = arenaRadius * SPECIAL_BALL_GRAVITY_RANGE;
      const claimZone = arenaRadius * SPECIAL_BALL_CLAIM_ZONE;

      // Direction toward center
      const towardCenterX = -dx / dist;
      const towardCenterY = -dy / dist;

      if (specialBallForceCapture) {
        // Ball is being forcibly captured - override velocity toward center
        const captureSpeed = SPECIAL_BALL_CAPTURE_SPEED;
        specialBall.vx = towardCenterX * captureSpeed;
        specialBall.vy = towardCenterY * captureSpeed;
      } else {
        // Normal gravity - can be escaped with enough speed/angle
        if (dist < gravityRange) {
          specialBall.vx += towardCenterX * SPECIAL_BALL_GRAVITY_STRENGTH * dt;
          specialBall.vy += towardCenterY * SPECIAL_BALL_GRAVITY_STRENGTH * dt;
        }

        // Track time in claim zone
        if (dist < claimZone) {
          specialBallClaimTime += dt;

          // Once claim time exceeded, force capture
          if (specialBallClaimTime >= SPECIAL_BALL_CLAIM_TIME) {
            specialBallForceCapture = true;
          }
        } else {
          // Outside claim zone - reset claim timer (escaped!)
          specialBallClaimTime = 0;
        }
      }

      // Shrink as it approaches center
      if (dist < SPECIAL_BALL_SHRINK_START) {
        specialBall.shrinkProgress = 1 - (dist / SPECIAL_BALL_SHRINK_START);
      } else {
        specialBall.shrinkProgress = 0;
      }

      // Check if captured (reached center)
      if (dist <= SPECIAL_BALL_CAPTURE_RADIUS) {
        // Award bonus points for time spent keeping it in play during return phase
        const returnBonus = Math.floor(specialBall.returnTime * 20 * getPointsMultiplier() * getComboMultiplier());
        if (returnBonus > 0) {
          score += returnBonus;
          scoreDisplay.textContent = score;
          spawnScorePopup(centerX, centerY - 30, returnBonus, '#00ff00');
        }

        // Celebration effects!
        AudioSystem.playBallCaptured();
        AudioSystem.playMilestone();
        spawnExplosion(centerX, centerY, '#00ff00', 2);
        spawnRingBurst(centerX, centerY, arenaRadius * 0.3, '#00ff00', 50);
        triggerScreenShake(15);
        sendTickerMessage('RED BALL CAPTURED!');

        specialBall = null;
        specialBallTimer = 0;
        specialBallClaimTime = 0;
        specialBallForceCapture = false;
        return;
      }
    }

    // Decay speed multiplier back to 1
    if (specialBall.speedMult > 1) {
      specialBall.speedMult = Math.max(1, specialBall.speedMult - BALL_MOMENTUM_DECAY * dt);
    }

    // Apply spin to curve trajectory (rotate velocity vector)
    if (specialBall.spin !== 0) {
      const spinAmount = specialBall.spin * dt;
      const cos = Math.cos(spinAmount);
      const sin = Math.sin(spinAmount);
      const newVx = specialBall.vx * cos - specialBall.vy * sin;
      const newVy = specialBall.vx * sin + specialBall.vy * cos;
      specialBall.vx = newVx;
      specialBall.vy = newVy;
      // Decay spin over time
      specialBall.spin *= Math.pow(SPIN_DECAY_RATE, dt);
      if (Math.abs(specialBall.spin) < 0.05) specialBall.spin = 0;
    }

    // Calculate display radius (spawn animation and shrink)
    const easeOut = 1 - Math.pow(1 - specialBall.spawnProgress, 3);
    const shrinkMult = specialBall.shrinkProgress ? (1 - specialBall.shrinkProgress) : 1;
    const ballRadius = specialBall.baseRadius * easeOut * shrinkMult;

    // Move special ball
    const moveScale = specialBall.spawnProgress < 1 ? specialBall.spawnProgress * 0.5 + 0.5 : 1;
    specialBall.x += specialBall.vx * dt * moveScale * ballSpeedMult * specialBall.speedMult;
    specialBall.y += specialBall.vy * dt * moveScale * ballSpeedMult * specialBall.speedMult;

    // Re-calculate distance after movement
    const dx2 = specialBall.x - centerX;
    const dy2 = specialBall.y - centerY;
    const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    const ballAngle2 = Math.atan2(dy2, dx2);

    // Decay hit cooldown
    if (specialBall.hitCooldown > 0) {
      specialBall.hitCooldown -= dt;
    }

    // Check paddle collision (only if not shrinking too small and not in cooldown) - checks ALL paddles
    if (ballRadius > 2 && specialBall.hitCooldown <= 0) {
      const collision = checkAnyPaddleCollision(specialBall.x, specialBall.y, ballRadius);

      if (collision.hit) {
        // Activate return phase on hit if ready
        if (specialBallReadyToReturn && !specialBallReturning) {
          specialBallReturning = true;
          AudioSystem.playReturnActivated();
          sendTickerMessage('RETURN PHASE ACTIVATED!');
          spawnRingBurst(centerX, centerY, arenaRadius * 0.4, '#ff0000', 40);
          triggerScreenShake(10);
        }

        // Determine which paddle hit it
        const isPlayer = collision.isPlayer;
        const hitPaddleVelocity = isPlayer ? paddleVelocity : (collision.ai ? collision.ai.velocity : 0);
        const hitTransferProgress = isPlayer ? ringSwitchProgress : (collision.ai ? collision.ai.ringSwitchProgress : 0);

        // Calculate momentum boost from paddle movement
        const momentumBoost = 1 + Math.min(Math.abs(hitPaddleVelocity) * 0.15, BALL_MOMENTUM_BOOST - 1);
        const transferBoost = hitTransferProgress > 0 ? TRANSFER_SPEED_BOOST : 1;
        const speed = BALL_SPEED * 0.8 * momentumBoost * transferBoost;

        // Set new velocity (no position jump)
        specialBall.vx = Math.cos(collision.deflectAngle) * speed;
        specialBall.vy = Math.sin(collision.deflectAngle) * speed;
        specialBall.speedMult = momentumBoost * transferBoost;
        specialBall.hitCooldown = 0.1; // Brief cooldown to prevent double-hit

        // Reset shrink progress when bounced back out
        specialBall.shrinkProgress = 0;

        // Score for special ball with combo multiplier
        const basePoints = 50;
        const ageBonus = getAgeBonus(specialBall.age);

        // Risky shot bonuses (doubled for red ball - high risk, high reward)
        const edgeBonus = collision.edgeHit ? EDGE_HIT_BONUS * 2 : 0;
        const speedBonus = momentumBoost > 1.3 ? Math.floor((momentumBoost - 1) * SPEED_HIT_BONUS * 2) : 0;

        // Transfer hit bonus - hitting while switching rings
        let transferBonus = 0;
        if (hitTransferProgress > 0) {
          transferBonus = TRANSFER_HIT_BONUS * 2; // Doubled for red ball
          // Apply spin based on transfer direction (inner to outer = clockwise, outer to inner = counter)
          const hitSwitchTo = isPlayer ? ringSwitchTo : (collision.ai ? collision.ai.ringSwitchTo : 0);
          const spinDirection = hitSwitchTo === 0 ? 1 : -1;
          specialBall.spin = TRANSFER_SPIN * spinDirection;
        }

        const totalPoints = Math.floor((basePoints + ageBonus + edgeBonus + speedBonus + transferBonus) * getPointsMultiplier() * getComboMultiplier());

        if (isPlayer) {
          // Player scores and combo
          incrementCombo();
          score += totalPoints;
          scoreDisplay.textContent = score;
          spawnScorePopup(specialBall.x, specialBall.y, totalPoints, '#ff4444');
        } else if (collision.ai) {
          // AI scores
          collision.ai.score += totalPoints;
          collision.ai.ballsHit++;
          spawnScorePopup(specialBall.x, specialBall.y, totalPoints, collision.ai.color);
        }

        // Dramatic particle explosion
        spawnExplosion(specialBall.x, specialBall.y, '#ff0000', 1 + momentumBoost * 0.5);

        // Strong screen shake
        triggerScreenShake(5 + momentumBoost * 3);

        // Bass hit
        AudioSystem.playBassHit(1 + momentumBoost * 0.5);

        AudioSystem.playSpecialHit(collision.edgeHit, momentumBoost);
      }
    }

    // Game over as soon as ball passes the paddle zone (point of no return)
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
    const puAngle = Math.atan2(dy, dx);

    const easeOut = 1 - Math.pow(1 - pu.spawnProgress, 3);
    const puRadius = POWERUP_RADIUS * easeOut;

    // Check paddle collision (only if not escaped) - checks ALL paddles
    if (!pu.escaped) {
      const collision = checkAnyPaddleCollision(pu.x, pu.y, puRadius);

      if (collision.hit) {
        // Collected powerup!
        const config = POWERUP_TYPES[pu.type];
        const isNegative = config.negative;
        const isPlayer = collision.isPlayer;

        if (isNegative) {
          AudioSystem.playPowerupBad();
          triggerScreenShake(4);
          spawnExplosion(pu.x, pu.y, config.color, 0.5);
        } else {
          AudioSystem.playPowerupGood();
          triggerScreenShake(3);
          spawnExplosion(pu.x, pu.y, config.color, 0.8);
          // Bonus points for collecting powerup
          const bonus = 25;
          if (isPlayer) {
            score += bonus;
            scoreDisplay.textContent = score;
            spawnScorePopup(pu.x, pu.y, bonus, config.color);
          } else if (collision.ai) {
            collision.ai.score += bonus;
            collision.ai.powerupsCollected++;
            spawnScorePopup(pu.x, pu.y, bonus, collision.ai.color);
          }
        }
        // Only player gets powerup effects (for now - simplifies testing)
        if (isPlayer) {
          activatePowerup(pu.type);
        }
        powerups.splice(i, 1);
        continue;
      } else if (dist >= arenaRadius + puRadius) {
        // Powerup escaped - mark it
        pu.escaped = true;
      }
    }

    // Remove only when fully off canvas
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

    // Decay speed multiplier back to 1
    if (ball.speedMult > 1) {
      ball.speedMult = Math.max(1, ball.speedMult - BALL_MOMENTUM_DECAY * dt);
    }

    // Apply spin to curve trajectory (rotate velocity vector)
    if (ball.spin !== 0) {
      const spinAmount = ball.spin * dt;
      const cos = Math.cos(spinAmount);
      const sin = Math.sin(spinAmount);
      const newVx = ball.vx * cos - ball.vy * sin;
      const newVy = ball.vx * sin + ball.vy * cos;
      ball.vx = newVx;
      ball.vy = newVy;
      // Decay spin over time
      ball.spin *= Math.pow(SPIN_DECAY_RATE, dt);
      if (Math.abs(ball.spin) < 0.05) ball.spin = 0;
    }

    ball.age += dt;

    const easeOut = 1 - Math.pow(1 - ball.spawnProgress, 3);
    const ballRadius = ball.baseRadius * easeOut;

    const moveScale = ball.spawnProgress < 1 ? ball.spawnProgress * 0.5 + 0.5 : 1;
    ball.x += ball.vx * dt * moveScale * ballSpeedMult * ball.speedMult;
    ball.y += ball.vy * dt * moveScale * ballSpeedMult * ball.speedMult;

    // Decay hit cooldown
    if (ball.hitCooldown > 0) {
      ball.hitCooldown -= dt;
    }

    const dx = ball.x - centerX;
    const dy = ball.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Check paddle collision (only if not in cooldown and not escaped) - checks player AND AI paddles
    if (ball.hitCooldown <= 0 && !ball.escaped) {
      const collision = checkAnyPaddleCollision(ball.x, ball.y, ballRadius);

      if (collision.hit) {
        // Determine which paddle hit it and get appropriate velocity
        const isPlayer = collision.isPlayer;
        const hitPaddleVelocity = isPlayer ? paddleVelocity : (collision.ai ? collision.ai.velocity : 0);
        const hitPaddleColor = isPlayer ? '#00ffff' : (collision.ai ? collision.ai.color : '#fff');

        // Calculate momentum boost from paddle movement
        const momentumBoost = 1 + Math.min(Math.abs(hitPaddleVelocity) * 0.15, BALL_MOMENTUM_BOOST - 1);
        const hitTransferProgress = isPlayer ? ringSwitchProgress : (collision.ai ? collision.ai.ringSwitchProgress : 0);
        const transferBoost = hitTransferProgress > 0 ? TRANSFER_SPEED_BOOST : 1;
        const waveSpeed = getWaveBallSpeed();
        const speed = BALL_SPEED * momentumBoost * transferBoost * waveSpeed;

        // Hit paddle - reflect using calculated deflect angle (no position jump)
        ball.vx = Math.cos(collision.deflectAngle) * speed;
        ball.vy = Math.sin(collision.deflectAngle) * speed;
        ball.speedMult = momentumBoost * transferBoost;
        ball.hitCooldown = 0.1; // Brief cooldown to prevent double-hit

        // Score calculation
        const basePoints = 10;
        const ageBonus = getAgeBonus(ball.age);
        const edgeBonus = collision.edgeHit ? EDGE_HIT_BONUS : 0;
        const speedBonus = momentumBoost > 1.3 ? Math.floor((momentumBoost - 1) * SPEED_HIT_BONUS) : 0;

        // Transfer hit bonus - hitting while switching rings
        let transferBonus = 0;
        if (hitTransferProgress > 0) {
          transferBonus = TRANSFER_HIT_BONUS;
          // Apply spin based on transfer direction
          const hitSwitchTo = isPlayer ? ringSwitchTo : (collision.ai ? collision.ai.ringSwitchTo : 0);
          const spinDirection = hitSwitchTo === 0 ? 1 : -1;
          ball.spin = TRANSFER_SPIN * spinDirection;
        }

        const totalPoints = Math.floor((basePoints + ageBonus + edgeBonus + speedBonus + transferBonus) * getPointsMultiplier() * getComboMultiplier());

        if (isPlayer) {
          // Player scores
          incrementCombo();
          score += totalPoints;
          scoreDisplay.textContent = score;

          // Spawn score popup
          const popupColor = combo >= 5 ? getComboColor() : '#fff';
          spawnScorePopup(ball.x, ball.y, totalPoints, popupColor);
        } else if (collision.ai) {
          // AI scores (track separately)
          collision.ai.score += totalPoints;
          collision.ai.ballsHit++;

          // Spawn score popup in AI color
          spawnScorePopup(ball.x, ball.y, totalPoints, collision.ai.color);
        }

        // Spawn particles on hit - use hitter's color
        const particleColor = collision.edgeHit ? '#ffff00' : hitPaddleColor;
        spawnExplosion(ball.x, ball.y, particleColor, 0.5 + momentumBoost * 0.3);

        // Screen shake based on momentum
        triggerScreenShake(2 + momentumBoost * 2);

        // Bass hit for powerful shots
        if (momentumBoost > 1.3) {
          AudioSystem.playBassHit(momentumBoost - 1);
        }

        AudioSystem.playPaddleHit(collision.edgeHit, momentumBoost);
      }
    }

    // Check for near-miss (ball just escaped near the paddle)
    if (!ball.escaped && !ball.nearMissTriggered) {
      const nearMissIntensity = checkNearMiss(ball.x, ball.y, ballRadius);
      if (nearMissIntensity > 0.3) {
        ball.nearMissTriggered = true;
        AudioSystem.playNearMiss(nearMissIntensity);
        // Small bonus for near-miss
        const nearMissPoints = Math.floor(nearMissIntensity * 5);
        if (nearMissPoints > 0) {
          score += nearMissPoints;
          spawnScorePopup(ball.x, ball.y, nearMissPoints, '#ff8800');
          spawnParticles(ball.x, ball.y, 5, '#ff8800', 50, 2, 0.2);
        }
      }
    }

    // Mark as escaped when past arena (but don't remove yet)
    if (dist >= arenaRadius + ballRadius && ball.hitCooldown <= 0) {
      ball.escaped = true;
    }

    // Remove only when fully off canvas
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
  // Clear canvas - pure black
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Apply screen shake
  ctx.save();
  ctx.translate(screenShake.x, screenShake.y);

  // Draw subtle radial gradient background during waves
  if (waveActive) {
    const waveProgress = waveTimer / WAVE_DURATION;
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, arenaRadius * 1.5);
    const alpha = 0.15 * (1 - waveProgress);
    gradient.addColorStop(0, `rgba(255, 0, 0, ${alpha})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Check for danger - balls close to escaping
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

  // Draw outer arena circle with glow effect - pulses red when danger is high
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

  // Draw inner ring with subtle glow
  ctx.shadowBlur = 8;
  ctx.shadowColor = 'rgba(100, 100, 255, 0.3)';
  ctx.strokeStyle = '#666';
  ctx.beginPath();
  ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  // Draw center point with pulsing glow
  const centerPulse = 1 + Math.sin(gameTime * 4) * 0.3;
  ctx.shadowBlur = 10 * centerPulse;
  ctx.shadowColor = '#fff';
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 4 * centerPulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Draw paddle trail (behind paddle)
  drawPaddleTrail();

  // Draw paddle with rounded ends and glow
  const paddleRadius = getCurrentPaddleRadius();
  const paddleScale = getPaddleTransitionScale();
  const currentThickness = PADDLE_THICKNESS * paddleScale;
  const currentArc = paddleArc * paddleScale;

  if (currentThickness > 0.5 && currentArc > 0.01) {
    // Glow effect based on velocity
    const velocityGlow = Math.min(Math.abs(paddleVelocity) / PADDLE_SPEED, 1);
    ctx.shadowBlur = 10 + velocityGlow * 15;
    ctx.shadowColor = combo >= 5 ? getComboColor() : `rgba(0, 255, 255, ${0.5 + velocityGlow * 0.5})`;

    // Color shifts with combo
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
    ctx.arc(
      centerX,
      centerY,
      paddleRadius,
      paddleAngle - currentArc / 2,
      paddleAngle + currentArc / 2
    );
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Draw AI paddles
  drawAllAIPaddles();

  // Draw regular balls
  for (const ball of balls) {
    const easeOut = 1 - Math.pow(1 - ball.spawnProgress, 3);
    const radius = ball.baseRadius * easeOut;

    if (radius < 0.5) continue;

    // Calculate maturity for fill color (0 = white, 1 = black)
    const maturity = getBallMaturity(ball.age);
    const grayValue = Math.floor(255 * (1 - maturity));
    const fillColor = `rgb(${grayValue}, ${grayValue}, ${grayValue})`;

    // Glow effect that intensifies with speed
    const speedGlow = Math.min((ball.speedMult - 1) * 2, 1);
    if (speedGlow > 0.1) {
      ctx.shadowBlur = 10 + speedGlow * 10;
      ctx.shadowColor = `rgba(0, 255, 255, ${speedGlow})`;
    }

    // Regular ball - fill darkens with age, white border
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

  // Draw powerups with pulsing glow
  for (const pu of powerups) {
    const easeOut = 1 - Math.pow(1 - pu.spawnProgress, 3);
    const pulse = 1 + Math.sin(gameTime * 8) * 0.15;
    const radius = POWERUP_RADIUS * easeOut * pulse;

    if (radius < 0.5) continue;

    const config = POWERUP_TYPES[pu.type];

    // Glow effect
    ctx.shadowBlur = 15;
    ctx.shadowColor = config.color;

    // Powerup - colored fill with white border (same shape for all)
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

    // Draw symbol inside
    ctx.fillStyle = '#000';
    ctx.font = `${Math.floor(radius)}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const symbol = pu.type.charAt(0);
    ctx.fillText(symbol, pu.x, pu.y + 1);
  }

  // Draw claim zone indicator when returning (draw behind ball)
  if (specialBall && specialBallReturning && !specialBallForceCapture) {
    const claimZoneRadius = arenaRadius * SPECIAL_BALL_CLAIM_ZONE;
    const claimProgress = specialBallClaimTime / SPECIAL_BALL_CLAIM_TIME;

    // Dashed circle showing claim zone
    ctx.strokeStyle = `rgba(255, 0, 0, ${0.2 + claimProgress * 0.4})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, claimZoneRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Countdown arc showing time remaining
    if (specialBallClaimTime > 0) {
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(centerX, centerY, claimZoneRadius + 8, -Math.PI / 2, -Math.PI / 2 + (claimProgress * Math.PI * 2));
      ctx.stroke();
    }
  }

  // Draw special ball (red, game-ending) - THE STAR OF THE SHOW
  if (specialBall) {
    const easeOut = 1 - Math.pow(1 - specialBall.spawnProgress, 3);
    const shrinkMult = specialBall.shrinkProgress ? (1 - specialBall.shrinkProgress) : 1;
    const radius = specialBall.baseRadius * easeOut * shrinkMult;

    if (radius >= 0.5) {
      // Maturity affects inner darkness (red to dark red)
      const maturity = getBallMaturity(specialBall.age);
      const redValue = Math.floor(255 * (1 - maturity * 0.7));

      // Pulsing effect - gentle when ready to return, faster when being claimed
      let pulseScale = 1;
      let glowIntensity = 0.5;
      if (specialBallReturning) {
        const urgency = specialBallClaimTime / SPECIAL_BALL_CLAIM_TIME;
        const pulseSpeed = 8 + urgency * 25;
        pulseScale = 1 + Math.sin(gameTime * pulseSpeed) * (0.05 + urgency * 0.15);
        glowIntensity = 0.8 + urgency * 0.5;
      } else if (specialBallReadyToReturn) {
        // Gentle pulse to indicate it's ready - next hit activates return
        pulseScale = 1 + Math.sin(gameTime * 4) * 0.08;
        glowIntensity = 0.6 + Math.sin(gameTime * 4) * 0.2;
      }

      // Outer glow aura
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

      // Inner glow
      ctx.shadowBlur = 20 + glowIntensity * 20;
      ctx.shadowColor = specialBallReturning ? '#ff4400' : '#ff0000';

      ctx.fillStyle = `rgb(${redValue}, 0, 0)`;
      ctx.beginPath();
      ctx.arc(specialBall.x, specialBall.y, radius * pulseScale, 0, Math.PI * 2);
      ctx.fill();

      // Red border - flashes white when force capturing
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

      // Show return time bonus when in return phase
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

      // Spawn trailing particles when moving fast
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

  // Draw particles (on top of everything)
  drawParticles();

  // Draw score popups
  drawScorePopups();

  // Draw combo indicator
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

  // Draw wave indicator
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

  // Draw AI scoreboard (top right) - helps visualize multiplayer dynamics
  if (AI_ENABLED && aiPaddles.length > 0) {
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'right';
    let scoreY = 30;

    // Player score
    ctx.fillStyle = '#fff';
    ctx.fillText(`YOU: ${score}`, canvas.width - 20, scoreY);
    scoreY += 18;

    // AI scores
    for (const ai of aiPaddles) {
      ctx.fillStyle = ai.color;
      ctx.fillText(`${ai.name.toUpperCase()}: ${ai.score}`, canvas.width - 20, scoreY);
      scoreY += 18;
    }
  }

  // Close screen shake transform
  ctx.restore();
}

// === GAME LOOP ===

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1); // Cap delta time
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

// === GAME STATE ===

function startGame() {
  AudioSystem.init();

  score = 0;
  balls = [];
  powerups = [];
  activePowerups = [];
  paddleAngle = -Math.PI / 2;
  targetAngle = paddleAngle;
  paddleVelocity = 0;
  paddleArc = PADDLE_ARC_BASE;
  targetPaddleArc = PADDLE_ARC_BASE;
  paddleRing = 0; // Start on outer ring
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

  // Reset juice systems
  particles.length = 0;
  scorePopups.length = 0;
  paddleTrail.length = 0;
  combo = 0;
  maxCombo = 0;
  lastHitTime = 0;
  currentWave = 0;
  waveTimer = 0;
  waveActive = false;
  screenShake = { x: 0, y: 0, intensity: 0 };
  sentMessages.clear();

  // Initialize AI players
  initAIPaddles();

  scoreDisplay.textContent = '0';
  welcomeScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');

  notifyGameStart();

  // Start background music
  AudioSystem.startMusic();

  // Spawn first ball after a short delay
  setTimeout(() => {
    if (gameRunning) spawnBall();
  }, 500);
}

function endGame() {
  gameRunning = false;

  // Stop music
  AudioSystem.stopMusic();
  AudioSystem.playGameOver();

  // Dramatic explosion at last ball position
  if (specialBall) {
    spawnExplosion(specialBall.x, specialBall.y, '#ff0000', 3);
  }
  spawnRingBurst(centerX, centerY, arenaRadius, '#ff0000', 60);
  triggerScreenShake(20);

  finalScoreDisplay.textContent = score;
  gameOverScreen.classList.remove('hidden');

  // Update local high score
  if (score > highScore) {
    highScore = score;
    updateHighScoreDisplay();
  }

  const minutes = Math.floor(gameTime / 60);
  const seconds = Math.floor(gameTime % 60);
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Send game over message with stats
  if (maxCombo >= 10) {
    sendTickerMessage(`GAME OVER! Max combo: ${maxCombo}x`);
  }

  notifyGameOver(score, {
    time: timeString,
    ballsReturned: Math.floor(score / 10),
    maxCombo: maxCombo,
    wavesCompleted: currentWave
  });
}

// === EVENT LISTENERS ===

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// Mobile ring switch button
if (ringSwitchBtn) {
  ringSwitchBtn.addEventListener('click', () => {
    if (gameRunning) {
      switchRing();
    }
  });

  // Show/hide based on game state and mobile detection
  function updateRingSwitchButton() {
    if (isMobile && gameRunning) {
      ringSwitchBtn.classList.remove('hidden');
    } else {
      ringSwitchBtn.classList.add('hidden');
    }
  }

  // Update button visibility when game starts/ends
  const originalStartGame = startGame;
  startGame = function() {
    originalStartGame();
    updateRingSwitchButton();
  };

  const originalEndGame = endGame;
  endGame = function() {
    originalEndGame();
    updateRingSwitchButton();
  };
}

// === MULTIPLAYER INTEGRATION ===

// Initialize multiplayer if in multiplayer mode
if (MULTIPLAYER_MODE) {
  initMultiplayer();
}

async function initMultiplayer() {
  console.log('[ORBIT] Initializing multiplayer mode...');

  // Load multiplayer.js if not already loaded
  if (typeof OrbitMultiplayer === 'undefined') {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'js/multiplayer.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Update UI for multiplayer mode
  welcomeScreen.querySelector('h1').textContent = 'ORBIT MULTIPLAYER';
  welcomeScreen.querySelector('p').textContent = 'Keep the red ball inside - together!';
  welcomeScreen.querySelector('.controls').textContent = 'WASD or drag to move | Space to switch rings';

  // Connect to server
  OrbitMultiplayer.connect({
    onJoined: handleMPJoined,
    onStateUpdate: handleMPStateUpdate,
    onRoundStart: handleMPRoundStart,
    onRoundEnd: handleMPRoundEnd,
    onBallHit: handleMPBallHit,
    onSpecialBallSpawn: handleMPSpecialBallSpawn,
    onWaveStart: handleMPWaveStart,
    onPowerupCollected: handleMPPowerupCollected,
    onPromoted: handleMPPromoted,
    onInactiveWarning: handleMPInactiveWarning,
    onDisconnected: handleMPDisconnected
  });
}

function handleMPJoined(data) {
  console.log('[ORBIT] Joined multiplayer:', data);
  mpPlayerId = data.playerId;
  mpIsSpectator = data.isSpectator;
  mpRoundNumber = data.roundNumber;
  mpConnected = true;

  if (data.isSpectator) {
    sendTickerMessage(`Spectating - queue position: ${data.queuePosition}`);
  } else {
    // Set initial paddle angle
    paddleAngle = data.angle || -Math.PI / 2;
    targetAngle = paddleAngle;
  }

  // Hide welcome screen and start game
  welcomeScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  gameRunning = true;

  // Initialize audio
  AudioSystem.init();
  AudioSystem.startMusic();
}

function handleMPStateUpdate(state) {
  if (!mpConnected) return;

  mpServerState = state;

  // Update other players
  mpOtherPlayers = {};
  for (const id in state.players) {
    if (id !== mpPlayerId) {
      mpOtherPlayers[id] = state.players[id];
    }
  }

  // Update own score from server state
  if (state.players[mpPlayerId]) {
    score = state.players[mpPlayerId].score;
    scoreDisplay.textContent = score;
    combo = state.players[mpPlayerId].combo;
  }

  // Update balls from server (for rendering)
  balls = state.balls.filter(b => !b.isSpecial).map(b => ({
    x: b.x,
    y: b.y,
    vx: b.vx,
    vy: b.vy,
    baseRadius: b.radius,
    spawnProgress: b.spawnProgress,
    age: b.age,
    speedMult: 1,
    hitCooldown: 0,
    escaped: false,
    spin: 0
  }));

  // Update special ball
  const serverSpecialBall = state.balls.find(b => b.isSpecial);
  if (serverSpecialBall) {
    specialBall = {
      x: serverSpecialBall.x,
      y: serverSpecialBall.y,
      vx: serverSpecialBall.vx,
      vy: serverSpecialBall.vy,
      baseRadius: serverSpecialBall.radius,
      spawnProgress: serverSpecialBall.spawnProgress,
      shrinkProgress: 0,
      age: serverSpecialBall.age,
      speedMult: 1,
      hitCooldown: 0,
      spin: 0,
      returnTime: 0
    };
    specialBallReturning = state.specialBallReturning;
    specialBallReadyToReturn = state.specialBallReturning;
  } else {
    specialBall = null;
    specialBallReturning = false;
    specialBallReadyToReturn = false;
  }

  // Update powerups
  powerups = state.powerups.map(p => ({
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    type: p.type,
    spawnProgress: p.spawnProgress
  }));

  // Update wave state
  waveActive = state.waveActive;
  waveType = state.waveType;

  // Update game time
  gameTime = state.gameTime;
}

function handleMPRoundStart(data) {
  console.log('[ORBIT] Round started:', data);
  mpRoundNumber = data.roundNumber;
  sendTickerMessage(`Round ${data.roundNumber} starting!`);

  // Reset local state
  score = 0;
  combo = 0;
  scoreDisplay.textContent = '0';
  particles.length = 0;
  scorePopups.length = 0;

  // Show game again if hidden
  gameOverScreen.classList.add('hidden');
  gameRunning = true;
}

function handleMPRoundEnd(data) {
  console.log('[ORBIT] Round ended:', data);

  // Show round results
  gameRunning = false;

  // Build results message
  const results = data.scores.slice(0, 3).map((s, i) =>
    `${i + 1}. ${s.username}: ${s.score}`
  ).join(' | ');

  sendTickerMessage(`Round ${data.roundNumber} over! ${results}`);

  // Show brief results screen
  finalScoreDisplay.textContent = score;
  gameOverScreen.querySelector('h1').textContent = 'ROUND OVER';
  gameOverScreen.querySelector('button').textContent = 'WAITING...';
  gameOverScreen.querySelector('button').style.display = 'none';
  gameOverScreen.classList.remove('hidden');

  // Celebration effects
  AudioSystem.playGameOver();
  spawnRingBurst(centerX, centerY, arenaRadius, '#ff0000', 60);
  triggerScreenShake(15);
}

function handleMPBallHit(data) {
  // Spawn visual effects at hit location
  if (data.x && data.y) {
    const color = data.isSpecial ? '#ff0000' : '#fff';
    spawnParticles(data.x, data.y, 10, color, 150, 4, 0.3);
    spawnScorePopup(data.x, data.y, data.points, color);
  }

  if (data.playerId === mpPlayerId) {
    // Our hit - play sound
    AudioSystem.playPaddleHit(false, 1);
    if (data.combo >= 3) {
      AudioSystem.playCombo(Math.min(4, Math.floor(data.combo / 5)));
    }
  }
}

function handleMPSpecialBallSpawn() {
  AudioSystem.playSpecialSpawn();
  spawnExplosion(centerX, centerY, '#ff0000', 1.5);
  triggerScreenShake(8);
  sendTickerMessage('RED BALL INCOMING!');
}

function handleMPWaveStart(data) {
  currentWave = data.wave;
  waveType = data.type;
  AudioSystem.playWaveWarning();
  triggerScreenShake(8);
  sendTickerMessage(`WAVE ${data.wave}: ${data.type}!`);
  spawnRingBurst(centerX, centerY, arenaRadius * 0.5, '#ff0000', 40);
}

function handleMPPowerupCollected(data) {
  if (data.playerId === mpPlayerId) {
    if (data.isNegative) {
      AudioSystem.playPowerupBad();
    } else {
      AudioSystem.playPowerupGood();
    }
  }
}

function handleMPPromoted(data) {
  mpIsSpectator = false;
  paddleAngle = data.angle;
  targetAngle = data.angle;
  sendTickerMessage('You are now playing!');
}

function handleMPInactiveWarning() {
  sendTickerMessage('Move to stay active!');
  triggerScreenShake(3);
}

function handleMPDisconnected(reason) {
  mpConnected = false;
  gameRunning = false;
  sendTickerMessage('Disconnected from server');

  // Show reconnect option
  gameOverScreen.querySelector('h1').textContent = 'DISCONNECTED';
  gameOverScreen.querySelector('button').textContent = 'RECONNECT';
  gameOverScreen.querySelector('button').style.display = 'block';
  gameOverScreen.querySelector('button').onclick = () => {
    location.reload();
  };
  gameOverScreen.classList.remove('hidden');
}

// Override update function for multiplayer - send input to server
const originalUpdate = update;
function updateMultiplayer(dt) {
  if (!MULTIPLAYER_MODE || !mpConnected || mpIsSpectator) {
    originalUpdate(dt);
    return;
  }

  // Handle local paddle movement (for immediate feedback)
  const currentPaddleSpeed = getCurrentPaddleSpeed();
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

  // Send input to server
  OrbitMultiplayer.sendInput(
    isDragging ? targetAngle : undefined,
    desiredDirection !== 0 ? desiredDirection * maxSpeed : undefined,
    false // ringSwitch handled separately
  );

  // Update visual systems
  updateParticles(dt);
  updateScreenShake();
  updateCombo(dt);
  updateScorePopups(dt);
  updatePaddleTrail();
}

// Override ring switch for multiplayer
const originalSwitchRing = switchRing;
function switchRingMultiplayer() {
  if (!MULTIPLAYER_MODE || !mpConnected || mpIsSpectator) {
    originalSwitchRing();
    return;
  }

  // Send ring switch to server
  OrbitMultiplayer.sendInput(undefined, undefined, true);

  // Play local feedback
  AudioSystem.playRingSwitch();
  triggerScreenShake(3);
}

// Apply multiplayer overrides
if (MULTIPLAYER_MODE) {
  update = updateMultiplayer;
  switchRing = switchRingMultiplayer;
}

// Override draw function to render other players in multiplayer
const originalDraw = draw;
function drawMultiplayer() {
  if (!MULTIPLAYER_MODE) {
    originalDraw();
    return;
  }

  // Clear canvas
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Apply screen shake
  ctx.save();
  ctx.translate(screenShake.x, screenShake.y);

  // Draw arena rings
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 2;

  // Outer ring
  ctx.beginPath();
  ctx.arc(centerX, centerY, arenaRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner ring
  ctx.beginPath();
  ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Center indicator
  ctx.beginPath();
  ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
  ctx.stroke();

  // Draw paddle trail (local player only)
  drawPaddleTrail();

  // Draw other players' paddles
  for (const id in mpOtherPlayers) {
    const other = mpOtherPlayers[id];
    drawRemotePlayerPaddle(other);
  }

  // Draw local player paddle
  if (!mpIsSpectator) {
    drawLocalPlayerPaddle();
  }

  // Draw balls (from server state)
  for (const ball of balls) {
    drawBall(ball);
  }

  // Draw powerups
  for (const pu of powerups) {
    drawPowerup(pu);
  }

  // Draw special ball
  if (specialBall) {
    drawSpecialBall();
  }

  // Draw particles
  drawParticles();

  // Draw score popups
  drawScorePopups();

  // Draw combo indicator
  if (combo >= 3) {
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = getComboColor();
    ctx.shadowBlur = 10;
    ctx.shadowColor = getComboColor();
    ctx.fillText(`${combo}x COMBO`, centerX, centerY - arenaRadius - 30);
    ctx.shadowBlur = 0;
  }

  // Draw wave indicator
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

  // Draw multiplayer leaderboard
  drawMPLeaderboard();

  // Draw spectator indicator
  if (mpIsSpectator) {
    ctx.font = '20px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#666';
    ctx.fillText('SPECTATING', centerX, 50);
  }

  // Draw round number
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#444';
  ctx.fillText(`ROUND ${mpRoundNumber}`, 20, canvas.height - 20);

  ctx.restore();
}

function drawRemotePlayerPaddle(player) {
  const paddleRadius = player.ring === 0 ? arenaRadius : innerRadius;
  const alpha = player.phaseInProgress || 1;
  const color = player.avatarColor || '#00ff88';

  // Glow effect
  const velocityGlow = Math.min(Math.abs(player.velocity || 0) / PADDLE_SPEED, 1);
  ctx.shadowBlur = 10 + velocityGlow * 15;
  ctx.shadowColor = color;

  ctx.globalAlpha = alpha * (player.isInactive ? 0.3 : 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = PADDLE_THICKNESS;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(
    centerX,
    centerY,
    paddleRadius,
    player.angle - (player.paddleArc || PADDLE_ARC_BASE) / 2,
    player.angle + (player.paddleArc || PADDLE_ARC_BASE) / 2
  );
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  // Draw username label
  const labelRadius = paddleRadius + 30;
  const labelX = centerX + Math.cos(player.angle) * labelRadius;
  const labelY = centerY + Math.sin(player.angle) * labelRadius;
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.globalAlpha = 0.8;
  ctx.fillText(player.username || 'Player', labelX, labelY);
  ctx.globalAlpha = 1;
}

function drawLocalPlayerPaddle() {
  const paddleRadius = getCurrentPaddleRadius();
  const scale = getPaddleTransitionScale();
  const currentThickness = PADDLE_THICKNESS * scale;
  const currentArc = paddleArc * scale;

  if (currentThickness < 0.5 || currentArc < 0.01) return;

  // Velocity-based glow
  const velocityGlow = Math.min(Math.abs(paddleVelocity) / PADDLE_SPEED, 1);
  ctx.shadowBlur = 15 + velocityGlow * 20;
  ctx.shadowColor = 'rgba(0, 255, 255, 0.8)';

  ctx.strokeStyle = '#00ffff';
  ctx.lineWidth = currentThickness;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(
    centerX,
    centerY,
    paddleRadius,
    paddleAngle - currentArc / 2,
    paddleAngle + currentArc / 2
  );
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Draw username label
  const labelRadius = paddleRadius + 30;
  const labelX = centerX + Math.cos(paddleAngle) * labelRadius;
  const labelY = centerY + Math.sin(paddleAngle) * labelRadius;
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillStyle = '#00ffff';
  ctx.textAlign = 'center';
  ctx.globalAlpha = 0.8;
  ctx.fillText('YOU', labelX, labelY);
  ctx.globalAlpha = 1;
}

function drawBall(ball) {
  const radius = ball.baseRadius * ball.spawnProgress;
  if (radius < 0.5) return;

  const maturity = getBallMaturity(ball.age);
  const innerDarkness = maturity * 0.6;

  ctx.shadowBlur = 10;
  ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';

  ctx.fillStyle = `rgb(${Math.floor(255 * (1 - innerDarkness))}, ${Math.floor(255 * (1 - innerDarkness))}, ${Math.floor(255 * (1 - innerDarkness))})`;
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

function drawPowerup(pu) {
  const config = POWERUP_TYPES[pu.type];
  if (!config) return;

  const easeOut = 1 - Math.pow(1 - pu.spawnProgress, 3);
  const radius = POWERUP_RADIUS * easeOut;

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
  ctx.fillText(pu.type.charAt(0), pu.x, pu.y + 1);
}

function drawSpecialBall() {
  if (!specialBall) return;

  const easeOut = 1 - Math.pow(1 - specialBall.spawnProgress, 3);
  const shrinkMult = specialBall.shrinkProgress ? (1 - specialBall.shrinkProgress) : 1;
  const radius = specialBall.baseRadius * easeOut * shrinkMult;

  if (radius < 0.5) return;

  const maturity = getBallMaturity(specialBall.age);
  const redValue = Math.floor(255 * (1 - maturity * 0.7));

  let pulseScale = 1;
  let glowIntensity = 0.5;
  if (specialBallReturning) {
    pulseScale = 1 + Math.sin(gameTime * 12) * 0.1;
    glowIntensity = 0.8;
  } else if (specialBallReadyToReturn) {
    pulseScale = 1 + Math.sin(gameTime * 4) * 0.08;
    glowIntensity = 0.6;
  }

  // Outer glow
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

  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 3 * shrinkMult;
  ctx.beginPath();
  ctx.arc(specialBall.x, specialBall.y, radius * pulseScale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawMPLeaderboard() {
  // Collect all scores
  const scores = [];

  // Add local player
  if (!mpIsSpectator && mpPlayerId) {
    scores.push({
      username: 'YOU',
      score: score,
      color: '#00ffff',
      isLocal: true
    });
  }

  // Add other players
  for (const id in mpOtherPlayers) {
    const player = mpOtherPlayers[id];
    scores.push({
      username: player.username || 'Player',
      score: player.score || 0,
      color: player.avatarColor || '#00ff88',
      isLocal: false
    });
  }

  // Sort by score
  scores.sort((a, b) => b.score - a.score);

  // Draw leaderboard
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.textAlign = 'right';
  let y = 30;

  for (const entry of scores) {
    ctx.fillStyle = entry.color;
    const prefix = entry.isLocal ? '> ' : '  ';
    ctx.fillText(`${prefix}${entry.username}: ${entry.score}`, canvas.width - 20, y);
    y += 18;
  }
}

// Apply multiplayer draw override
if (MULTIPLAYER_MODE) {
  draw = drawMultiplayer;
}

// Start game loop
requestAnimationFrame(gameLoop);
