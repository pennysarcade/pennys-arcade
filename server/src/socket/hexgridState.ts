// HEXGRID Game State Types and Constants

// Hex coordinate system (axial coordinates)
export interface HexCoord {
  q: number // column
  r: number // row
}

// Six directions on a hex grid
export type HexDirection = 'NE' | 'E' | 'SE' | 'SW' | 'W' | 'NW'

export const HEX_DIRECTIONS: Record<HexDirection, HexCoord> = {
  NE: { q: 1, r: -1 },
  E: { q: 1, r: 0 },
  SE: { q: 0, r: 1 },
  SW: { q: -1, r: 1 },
  W: { q: -1, r: 0 },
  NW: { q: 0, r: -1 },
}

// Player state
export interface HexPlayer {
  id: string // socket.id or AI id
  odanId: number | null // actual user id for real players
  username: string
  avatarColor: string
  avatarImage: string | null
  isAI: boolean
  position: HexCoord
  trail: HexCoord[] // Current path being traced (not yet claimed)
  territory: Set<string> // Claimed hexes (serialized as "q,r")
  isAlive: boolean
  direction: HexDirection | null
  score: number
  eliminationCount: number
  speedBoostUntil: number // timestamp when speed boost ends
  multiplierUntil: number // timestamp when 2x multiplier ends
  frozenUntil: number // timestamp when freeze ends
  startPosition: HexCoord // where player started (for respawn reference)
}

// Serializable player state for sending to clients
export interface HexPlayerState {
  id: string
  odanId: number | null
  username: string
  avatarColor: string
  avatarImage: string | null
  isAI: boolean
  position: HexCoord
  trail: HexCoord[]
  territory: string[] // Array instead of Set for JSON
  isAlive: boolean
  direction: HexDirection | null
  score: number
  eliminationCount: number
  hasSpeedBoost: boolean
  hasMultiplier: boolean
  isFrozen: boolean
}

// Power-up types
export type PowerUpType = 'gem' | 'crown' | 'multiplier' | 'speed' | 'freeze'

export interface PowerUp {
  id: string
  type: PowerUpType
  position: HexCoord
  value?: number // for gems, the point value
  spawnedAt: number
}

// Game status
export type GameStatus = 'waiting' | 'countdown' | 'playing' | 'ending'

// Game state
export interface HexGameState {
  status: GameStatus
  players: Map<string, HexPlayer>
  powerUps: PowerUp[]
  gridSize: number
  roundStartTime: number | null
  roundEndTime: number | null
  roundDuration: number // milliseconds
  countdownStartTime: number | null
  tickInterval: NodeJS.Timeout | null
  lastPowerUpSpawn: number
}

// Lobby state
export interface HexLobby {
  id: string
  gameState: HexGameState
  realPlayerCount: number
  spectators: Set<string> // socket ids of players waiting for next round
}

// Data sent to clients
export interface LobbyUpdateData {
  players: HexPlayerState[]
  status: GameStatus
  countdown?: number
  realPlayerCount: number
  spectatorCount: number
}

export interface GameStateUpdateData {
  players: HexPlayerState[]
  powerUps: PowerUp[]
  timeRemaining: number
  status: GameStatus
}

export interface PlayerEliminatedData {
  playerId: string
  eliminatedBy: string | null // null if hit boundary
  playerUsername: string
  eliminatorUsername: string | null
}

export interface TerritoryClaimedData {
  playerId: string
  tiles: string[]
  points: number
}

export interface GameOverData {
  rankings: {
    odanId: number | null
    odanUsername: string
    odanAvatarColor: string
    playerId: string
    username: string
    score: number
    rank: number
    territoryClaimed: number
    eliminations: number
    isAI: boolean
  }[]
  roundDuration: number
}

// Constants
export const HEX_GRID_SIZE = 7 // Grid radius (creates ~127 hexes)
export const MAX_PLAYERS = 4
export const ROUND_DURATION = 75000 // 75 seconds
export const COUNTDOWN_DURATION = 3000 // 3 seconds
export const TICK_RATE = 30 // 30 updates per second (~33ms) for smoother rendering
export const MOVE_INTERVAL = 450 // Players move every 450ms (~2.2 moves/sec)
export const SPEED_BOOST_MOVE_INTERVAL = 300 // ~3.3 moves/sec with speed boost

// Scoring
export const POINTS_PER_TILE = 5
export const SURVIVAL_BONUS_PER_SEC = 2
export const ELIMINATION_BOUNTY = 100
export const WINNER_BONUS = 250

// Power-up config
export const POWERUP_SPAWN_INTERVAL_MIN = 5000 // 5 seconds
export const POWERUP_SPAWN_INTERVAL_MAX = 10000 // 10 seconds
export const MAX_POWERUPS_ON_GRID = 3
export const SPEED_BOOST_DURATION = 5000 // 5 seconds
export const MULTIPLIER_DURATION = 8000 // 8 seconds
export const FREEZE_DURATION = 3000 // 3 seconds
export const GEM_MIN_VALUE = 50
export const GEM_MAX_VALUE = 200
export const CROWN_VALUE = 500
export const CROWN_SPAWN_CHANCE = 0.1 // 10% chance when spawning powerup

// Starting positions (4 positions around the edge of the hex grid)
export function getStartingPositions(gridSize: number): HexCoord[] {
  return [
    { q: -gridSize, r: 0 }, // West
    { q: gridSize, r: 0 }, // East
    { q: 0, r: -gridSize }, // North
    { q: 0, r: gridSize }, // South
  ]
}

// AI player colors (distinct from typical user colors)
export const AI_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#FFE66D', // Yellow
  '#95E1D3', // Mint
]

export const AI_NAMES = [
  'Bot Alpha',
  'Bot Beta',
  'Bot Gamma',
  'Bot Delta',
]

// Utility functions
export function hexToKey(hex: HexCoord): string {
  return `${hex.q},${hex.r}`
}

export function keyToHex(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number)
  return { q, r }
}

export function getNeighbor(hex: HexCoord, direction: HexDirection): HexCoord {
  const d = HEX_DIRECTIONS[direction]
  return { q: hex.q + d.q, r: hex.r + d.r }
}

export function isInBounds(hex: HexCoord, gridSize: number): boolean {
  const s = -hex.q - hex.r
  return Math.abs(hex.q) <= gridSize && Math.abs(hex.r) <= gridSize && Math.abs(s) <= gridSize
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2
}

export function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r
}

// Convert player to serializable state
export function playerToState(player: HexPlayer): HexPlayerState {
  const now = Date.now()
  return {
    id: player.id,
    odanId: player.odanId,
    username: player.username,
    avatarColor: player.avatarColor,
    avatarImage: player.avatarImage,
    isAI: player.isAI,
    position: player.position,
    trail: [...player.trail],
    territory: Array.from(player.territory),
    isAlive: player.isAlive,
    direction: player.direction,
    score: player.score,
    eliminationCount: player.eliminationCount,
    hasSpeedBoost: player.speedBoostUntil > now,
    hasMultiplier: player.multiplierUntil > now,
    isFrozen: player.frozenUntil > now,
  }
}

// Create initial game state
export function createInitialGameState(): HexGameState {
  return {
    status: 'waiting',
    players: new Map(),
    powerUps: [],
    gridSize: HEX_GRID_SIZE,
    roundStartTime: null,
    roundEndTime: null,
    roundDuration: ROUND_DURATION,
    countdownStartTime: null,
    tickInterval: null,
    lastPowerUpSpawn: 0,
  }
}
