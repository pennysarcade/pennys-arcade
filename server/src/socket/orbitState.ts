// === ORBIT MULTIPLAYER STATE TYPES AND CONSTANTS ===

// Avatar colors (same as client AvatarPicker.tsx)
export const AVATAR_COLORS = [
  '#ff0000', '#ff4400', '#ff8800', '#ffcc00', '#ffff00', '#ccff00',
  '#88ff00', '#00ff00', '#00ff88', '#00ffcc', '#00ffff', '#00ccff',
  '#0088ff', '#0044ff', '#0000ff', '#4400ff', '#8800ff', '#cc00ff',
  '#ff00ff', '#ff00cc', '#ff0088', '#ff0044', '#ffffff', '#888888',
]

// Get a consistent color for a guest based on their ID
export function getGuestAvatarColor(guestId: string): string {
  // Hash the guest ID to get a consistent index
  let hash = 0
  for (let i = 0; i < guestId.length; i++) {
    const char = guestId.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length
  return AVATAR_COLORS[index]
}

// Game constants
export const MAX_PLAYERS = 8
export const TICK_RATE = 30 // Server tick rate in Hz
export const TICK_INTERVAL = 1000 / TICK_RATE
export const INACTIVITY_TIMEOUT = 30000 // 30 seconds
export const MAX_ROUND_TIME = 30 * 60 * 1000 // 30 minutes safety limit
export const PLAYER_PHASE_IN_DURATION = 1000 // 1 second fade-in for new players

// Physics constants (matching client)
export const ARENA_RADIUS_RATIO = 0.35
export const INNER_RING_RATIO = 0.82
export const PADDLE_ARC_BASE = 0.20
export const PADDLE_THICKNESS = 18
export const PADDLE_SPEED = 4
export const PADDLE_ACCELERATION = 5
export const PADDLE_DECELERATION = 12
export const RING_SWITCH_DURATION = 0.25

export const BALL_RADIUS = 8
export const BALL_SPEED = 150
export const SPAWN_INTERVAL = 2000 // ms between ball spawns

export const SPECIAL_BALL_RADIUS = 12
export const SPECIAL_BALL_SPAWN_INTERVAL = 30 // seconds
export const SPECIAL_BALL_ACTIVE_DURATION = 15 // seconds

// Powerup constants
export const POWERUP_SPAWN_CHANCE = 0.15
export const POWERUP_RADIUS = 10

export interface PowerupType {
  color: string
  duration: number
  arcBonus?: number
  speedBonus?: number
  ballSpeedMult?: number
  pointsMult?: number
  negative: boolean
}

export const POWERUP_TYPES: Record<string, PowerupType> = {
  GROW: { color: '#00ff00', duration: 10, arcBonus: 0.10, negative: false },
  SPEED: { color: '#00ffff', duration: 8, speedBonus: 2, negative: false },
  SLOW: { color: '#0088ff', duration: 6, ballSpeedMult: 0.5, negative: false },
  POINTS: { color: '#ff00ff', duration: 10, pointsMult: 2, negative: false },
  SHRINK: { color: '#ff8800', duration: 8, arcBonus: -0.06, negative: true },
  FAST: { color: '#ffff00', duration: 6, ballSpeedMult: 1.5, negative: true }
}

// Wave system
export const WAVE_INTERVAL = 25
export const WAVE_DURATION = 8
export const WAVE_TYPES = ['SWARM', 'RAPID', 'CHAOS', 'BOSS'] as const
export type WaveType = typeof WAVE_TYPES[number] | 'NORMAL'

// Ball types
export interface Ball {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  baseRadius: number
  spawnProgress: number
  age: number
  speedMult: number
  hitCooldown: number
  escaped: boolean
  spin: number
  isSpecial: boolean
  // For special ball
  shrinkProgress?: number
  returnTime?: number
}

export interface Powerup {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  type: string
  spawnProgress: number
  escaped?: boolean
}

export interface ActivePowerup {
  type: string
  endTime: number
  playerId: string
}

// Player state
export interface Player {
  id: string
  socketId: string
  username: string
  avatarColor: string
  isGuest: boolean
  userId: number | null

  // Position state
  angle: number
  velocity: number
  targetAngle: number
  ring: number // 0 = outer, 1 = inner
  ringSwitchProgress: number
  ringSwitchFrom: number
  ringSwitchTo: number

  // Game state
  score: number
  combo: number
  lastHitTime: number
  ballsHit: number
  powerupsCollected: number

  // Multiplayer state
  lastInputTime: number
  lastInputSeq: number
  isInactive: boolean
  isSpectator: boolean
  phaseInProgress: number // 0-1, for fade-in animation
  invulnerableUntil: number // timestamp for spawn protection

  // Powerups
  activePowerups: ActivePowerup[]
  paddleArc: number // Current arc with powerups applied
}

export interface Spectator {
  id: string
  socketId: string
  username: string
  avatarColor: string
  isGuest: boolean
  userId: number | null
  joinedQueueAt: number
}

// Input from client
export interface PlayerInput {
  angle?: number
  velocity?: number
  ringSwitch?: boolean
  seq: number
}

// Game state
export interface GameState {
  // Round info
  roundNumber: number
  roundStartTime: number
  gameTime: number // Time in seconds since round start

  // Entities
  players: Map<string, Player>
  spectators: Map<string, Spectator>
  balls: Ball[]
  powerups: Powerup[]

  // Special ball state
  specialBall: Ball | null
  specialBallTimer: number
  specialBallActiveTime: number
  specialBallReadyToReturn: boolean
  specialBallReturning: boolean

  // Wave system
  currentWave: number
  waveTimer: number
  waveActive: boolean
  waveType: WaveType

  // Spawn timers
  spawnTimer: number

  // Arena dimensions (calculated from standard canvas size)
  centerX: number
  centerY: number
  arenaRadius: number
  innerRadius: number
}

// State update sent to clients
export interface StateUpdate {
  tick: number
  gameTime: number
  roundNumber: number
  players: Record<string, {
    angle: number
    velocity: number
    ring: number
    ringSwitchProgress: number
    score: number
    combo: number
    isInactive: boolean
    username: string
    avatarColor: string
    paddleArc: number
    phaseInProgress: number
    isAI: boolean
  }>
  balls: Array<{
    id: string
    x: number
    y: number
    vx: number
    vy: number
    radius: number
    isSpecial: boolean
    age: number
    spawnProgress: number
  }>
  powerups: Array<{
    id: string
    x: number
    y: number
    type: string
    spawnProgress: number
  }>
  waveActive: boolean
  waveType: WaveType
  specialBallReturning: boolean
}

// Round end data
export interface RoundEndData {
  roundNumber: number
  duration: number
  scores: Array<{
    playerId: string
    username: string
    avatarColor: string
    score: number
    isGuest: boolean
  }>
  reason: 'special_ball_escaped' | 'timeout'
}

// Helper to create initial game state
export function createInitialGameState(): GameState {
  // Use a standard canvas size for calculations
  const canvasWidth = 800
  const canvasHeight = 600
  const centerX = canvasWidth / 2
  const centerY = canvasHeight / 2
  const arenaRadius = Math.min(canvasWidth, canvasHeight) * ARENA_RADIUS_RATIO
  const innerRadius = arenaRadius * INNER_RING_RATIO

  return {
    roundNumber: 1,
    roundStartTime: Date.now(),
    gameTime: 0,

    players: new Map(),
    spectators: new Map(),
    balls: [],
    powerups: [],

    specialBall: null,
    specialBallTimer: 0,
    specialBallActiveTime: 0,
    specialBallReadyToReturn: false,
    specialBallReturning: false,

    currentWave: 0,
    waveTimer: 0,
    waveActive: false,
    waveType: 'NORMAL',

    spawnTimer: 0,

    centerX,
    centerY,
    arenaRadius,
    innerRadius
  }
}

// Create a new player
export function createPlayer(
  id: string,
  socketId: string,
  username: string,
  avatarColor: string,
  isGuest: boolean,
  userId: number | null,
  spawnAngle: number
): Player {
  return {
    id,
    socketId,
    username,
    avatarColor,
    isGuest,
    userId,

    angle: spawnAngle,
    velocity: 0,
    targetAngle: spawnAngle,
    ring: 0,
    ringSwitchProgress: 0,
    ringSwitchFrom: 0,
    ringSwitchTo: 0,

    score: 0,
    combo: 0,
    lastHitTime: 0,
    ballsHit: 0,
    powerupsCollected: 0,

    lastInputTime: Date.now(),
    lastInputSeq: 0,
    isInactive: false,
    isSpectator: false,
    phaseInProgress: 0,
    invulnerableUntil: Date.now() + PLAYER_PHASE_IN_DURATION,

    activePowerups: [],
    paddleArc: PADDLE_ARC_BASE
  }
}

// Create a spectator
export function createSpectator(
  id: string,
  socketId: string,
  username: string,
  avatarColor: string,
  isGuest: boolean,
  userId: number | null
): Spectator {
  return {
    id,
    socketId,
    username,
    avatarColor,
    isGuest,
    userId,
    joinedQueueAt: Date.now()
  }
}

// Generate unique ID
let idCounter = 0
export function generateId(): string {
  return `${Date.now()}-${++idCounter}`
}
