// === DETERMINISTIC SIMULATION CORE ===
// Shared physics and game logic for rollback netcode
// All operations use Math.fround() for cross-platform float consistency

import { SeededRNG } from './rng.js';
import { GameSnapshot, PlayerSnapshot, BallSnapshot, PowerupSnapshot, FrameInput } from './types.js';

// Physics constants (must match client/server)
export const TICK_RATE = 60; // 60Hz simulation
export const TICK_INTERVAL = 1000 / TICK_RATE; // ~16.67ms
export const DT = 1 / TICK_RATE; // Delta time per tick

export const ARENA_RADIUS_RATIO = 0.35;
export const INNER_RING_RATIO = 0.82;
export const PADDLE_ARC_BASE = 0.20;
export const PADDLE_THICKNESS = 18;
export const PADDLE_SPEED = 4;
export const PADDLE_ACCELERATION = 5;
export const PADDLE_DECELERATION = 12;
export const RING_SWITCH_DURATION = 0.25;

export const BALL_RADIUS = 8;
export const BALL_SPEED = 150;
export const SPAWN_INTERVAL = 2000;

export const SPECIAL_BALL_RADIUS = 12;
export const SPECIAL_BALL_SPAWN_INTERVAL = 30;
export const SPECIAL_BALL_ACTIVE_DURATION = 15;
export const SPECIAL_BALL_GRAVITY_STRENGTH = 120;

export const POWERUP_SPAWN_CHANCE = 0.15;
export const POWERUP_RADIUS = 10;

export const WAVE_INTERVAL = 25;
export const WAVE_DURATION = 8;
export const WAVE_TYPES = ['SWARM', 'RAPID', 'CHAOS', 'BOSS'] as const;

export const POWERUP_TYPES: Record<string, {
  color: string;
  duration: number;
  arcBonus?: number;
  speedBonus?: number;
  ballSpeedMult?: number;
  pointsMult?: number;
  negative: boolean;
}> = {
  GROW: { color: '#00ff00', duration: 10, arcBonus: 0.10, negative: false },
  SPEED: { color: '#00ffff', duration: 8, speedBonus: 2, negative: false },
  SLOW: { color: '#0088ff', duration: 6, ballSpeedMult: 0.5, negative: false },
  POINTS: { color: '#ff00ff', duration: 10, pointsMult: 2, negative: false },
  SHRINK: { color: '#ff8800', duration: 8, arcBonus: -0.06, negative: true },
  FAST: { color: '#ffff00', duration: 6, ballSpeedMult: 1.5, negative: true }
};

// Deterministic angle normalization
export function normalizeAngle(angle: number): number {
  let a = angle;
  while (a < -Math.PI) a = Math.fround(a + Math.PI * 2);
  while (a > Math.PI) a = Math.fround(a - Math.PI * 2);
  return Math.fround(a);
}

// Deterministic angle difference
export function angleDifference(a: number, b: number): number {
  return normalizeAngle(Math.fround(a - b));
}

// Deterministic distance calculation
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = Math.fround(x1 - x2);
  const dy = Math.fround(y1 - y2);
  return Math.fround(Math.sqrt(Math.fround(dx * dx) + Math.fround(dy * dy)));
}

// Get ring radius based on ring index
export function getRingRadius(ring: number, arenaRadius: number, innerRadius: number): number {
  return ring === 0 ? arenaRadius : innerRadius;
}

// Calculate paddle radius accounting for ring switch animation
export function getPlayerPaddleRadius(
  player: PlayerSnapshot,
  arenaRadius: number,
  innerRadius: number
): number {
  if (player.ringSwitchProgress <= 0) {
    return getRingRadius(player.ring, arenaRadius, innerRadius);
  }
  const fromRadius = getRingRadius(player.ringSwitchFrom, arenaRadius, innerRadius);
  const toRadius = getRingRadius(player.ringSwitchTo, arenaRadius, innerRadius);
  return Math.fround(fromRadius + Math.fround((toRadius - fromRadius) * player.ringSwitchProgress));
}

// Check paddle collision with a ball
export interface CollisionResult {
  hit: boolean;
  edgeHit: boolean;
  deflectAngle: number;
  playerId?: string;
}

export function checkPaddleCollision(
  player: PlayerSnapshot,
  ballX: number,
  ballY: number,
  ballRadius: number,
  centerX: number,
  centerY: number,
  arenaRadius: number,
  innerRadius: number
): CollisionResult {
  // Skip during phase transition (mid-switch)
  if (player.ringSwitchProgress > 0 && player.ringSwitchProgress < 1) {
    return { hit: false, edgeHit: false, deflectAngle: 0 };
  }

  const dx = Math.fround(ballX - centerX);
  const dy = Math.fround(ballY - centerY);
  const dist = Math.fround(Math.sqrt(Math.fround(dx * dx) + Math.fround(dy * dy)));
  const ballAngle = Math.atan2(dy, dx);

  const paddleRadius = getPlayerPaddleRadius(player, arenaRadius, innerRadius);
  const halfThickness = PADDLE_THICKNESS / 2;
  const paddleArc = player.paddleArc;

  // Check main arc collision
  const angleToPaddle = angleDifference(ballAngle, player.angle);
  const withinArc = Math.abs(angleToPaddle) <= paddleArc / 2;
  const withinRadius = dist >= paddleRadius - halfThickness - ballRadius &&
                       dist <= paddleRadius + halfThickness + ballRadius;

  if (withinArc && withinRadius) {
    const edgeFactor = Math.fround(Math.abs(angleToPaddle) / (paddleArc / 2));
    const deflectAngle = Math.fround(ballAngle + Math.PI + Math.fround(angleToPaddle * edgeFactor * 0.5));
    return { hit: true, edgeHit: false, deflectAngle, playerId: player.id };
  }

  // Check end caps
  const paddleStart = Math.fround(player.angle - paddleArc / 2);
  const paddleEnd = Math.fround(player.angle + paddleArc / 2);

  const startCapX = Math.fround(centerX + Math.cos(paddleStart) * paddleRadius);
  const startCapY = Math.fround(centerY + Math.sin(paddleStart) * paddleRadius);
  const distStart = distance(ballX, ballY, startCapX, startCapY);

  if (distStart <= halfThickness + ballRadius) {
    return {
      hit: true,
      edgeHit: true,
      deflectAngle: Math.atan2(Math.fround(ballY - startCapY), Math.fround(ballX - startCapX)),
      playerId: player.id
    };
  }

  const endCapX = Math.fround(centerX + Math.cos(paddleEnd) * paddleRadius);
  const endCapY = Math.fround(centerY + Math.sin(paddleEnd) * paddleRadius);
  const distEnd = distance(ballX, ballY, endCapX, endCapY);

  if (distEnd <= halfThickness + ballRadius) {
    return {
      hit: true,
      edgeHit: true,
      deflectAngle: Math.atan2(Math.fround(ballY - endCapY), Math.fround(ballX - endCapX)),
      playerId: player.id
    };
  }

  return { hit: false, edgeHit: false, deflectAngle: 0 };
}

// Calculate checksum for state verification
// Uses a simple hash combining critical game state values
export function calculateChecksum(snapshot: GameSnapshot): number {
  let hash = 0;
  const prime = 31;

  // Hash frame and game time
  hash = Math.imul(hash, prime) + (snapshot.frame | 0);
  hash = Math.imul(hash, prime) + Math.floor(snapshot.gameTime * 1000);
  hash = Math.imul(hash, prime) + (snapshot.rngState | 0);

  // Hash player states
  for (const [id, player] of snapshot.players) {
    hash = Math.imul(hash, prime) + hashString(id);
    hash = Math.imul(hash, prime) + Math.floor(player.angle * 10000);
    hash = Math.imul(hash, prime) + Math.floor(player.velocity * 10000);
    hash = Math.imul(hash, prime) + player.ring;
    hash = Math.imul(hash, prime) + player.score;
    hash = Math.imul(hash, prime) + player.combo;
  }

  // Hash ball states (sorted by ID for consistency)
  const sortedBalls = [...snapshot.balls].sort((a, b) => a.id.localeCompare(b.id));
  for (const ball of sortedBalls) {
    hash = Math.imul(hash, prime) + hashString(ball.id);
    hash = Math.imul(hash, prime) + Math.floor(ball.x * 100);
    hash = Math.imul(hash, prime) + Math.floor(ball.y * 100);
    hash = Math.imul(hash, prime) + Math.floor(ball.vx * 100);
    hash = Math.imul(hash, prime) + Math.floor(ball.vy * 100);
  }

  // Hash powerup states
  const sortedPowerups = [...snapshot.powerups].sort((a, b) => a.id.localeCompare(b.id));
  for (const powerup of sortedPowerups) {
    hash = Math.imul(hash, prime) + hashString(powerup.id);
    hash = Math.imul(hash, prime) + Math.floor(powerup.x * 100);
    hash = Math.imul(hash, prime) + Math.floor(powerup.y * 100);
  }

  // Hash special ball
  if (snapshot.specialBall) {
    hash = Math.imul(hash, prime) + hashString(snapshot.specialBall.id);
    hash = Math.imul(hash, prime) + Math.floor(snapshot.specialBall.x * 100);
    hash = Math.imul(hash, prime) + Math.floor(snapshot.specialBall.y * 100);
  }

  // Hash wave state
  hash = Math.imul(hash, prime) + snapshot.currentWave;
  hash = Math.imul(hash, prime) + (snapshot.waveActive ? 1 : 0);

  return hash >>> 0; // Ensure unsigned 32-bit
}

// Simple string hash helper
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash | 0;
  }
  return hash;
}

// Deep clone a game snapshot (fast implementation)
export function cloneSnapshot(snapshot: GameSnapshot): GameSnapshot {
  return {
    frame: snapshot.frame,
    gameTime: snapshot.gameTime,
    rngState: snapshot.rngState,
    checksum: snapshot.checksum,

    players: new Map(
      Array.from(snapshot.players.entries()).map(([id, player]) => [
        id,
        {
          ...player,
          activePowerups: player.activePowerups.map(p => ({ ...p }))
        }
      ])
    ),

    balls: snapshot.balls.map(ball => ({ ...ball })),
    powerups: snapshot.powerups.map(powerup => ({ ...powerup })),
    specialBall: snapshot.specialBall ? { ...snapshot.specialBall } : null,

    specialBallTimer: snapshot.specialBallTimer,
    specialBallActiveTime: snapshot.specialBallActiveTime,
    specialBallReadyToReturn: snapshot.specialBallReadyToReturn,
    specialBallReturning: snapshot.specialBallReturning,

    currentWave: snapshot.currentWave,
    waveTimer: snapshot.waveTimer,
    waveActive: snapshot.waveActive,
    waveType: snapshot.waveType,

    spawnTimer: snapshot.spawnTimer
  };
}

// Generate unique ID deterministically from frame and RNG
export function generateId(rng: SeededRNG, frame: number): string {
  return `${frame}-${rng.randomInt(0, 999999)}`;
}

// Calculate wave spawn rate multiplier
export function getWaveSpawnRate(waveType: string, waveActive: boolean): number {
  if (!waveActive) return 1;
  switch (waveType) {
    case 'SWARM': return 3;
    case 'RAPID': return 2.5;
    case 'CHAOS': return 2;
    case 'BOSS': return 0.5;
    default: return 1;
  }
}

// Calculate wave ball speed multiplier
export function getWaveBallSpeed(waveType: string, waveActive: boolean): number {
  if (!waveActive) return 1;
  switch (waveType) {
    case 'RAPID': return 1.5;
    case 'CHAOS': return 1.3;
    default: return 1;
  }
}

// Calculate hit score
export function calculateHitScore(
  playerVelocity: number,
  playerCombo: number,
  ballAge: number,
  edgeHit: boolean,
  activePowerups: Array<{ type: string }>
): number {
  let baseScore = 10;

  // Age bonus
  const ageBonus = Math.min(40, Math.floor((ballAge / 12) * 40));
  baseScore += ageBonus;

  // Edge hit bonus
  if (edgeHit) baseScore += 15;

  // Speed bonus
  const speedBonus = Math.min(25, Math.floor(Math.abs(playerVelocity) / PADDLE_SPEED * 25));
  baseScore += speedBonus;

  // Combo multiplier
  const comboMult = 1 + playerCombo * 0.1;

  // Powerup multiplier
  let pointsMult = 1;
  for (const pu of activePowerups) {
    if (pu.type === 'POINTS') {
      pointsMult *= POWERUP_TYPES.POINTS.pointsMult || 2;
    }
  }

  return Math.floor(baseScore * comboMult * pointsMult);
}
