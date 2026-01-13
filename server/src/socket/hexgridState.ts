// HEXGRID Game State Types and Constants
// Now uses square grid with (x, y) coordinates

// Grid coordinate
export interface GridCoord {
  x: number
  y: number
}

// Four directions on a square grid
export type GridDirection = 'N' | 'E' | 'S' | 'W'

export const GRID_DIRECTIONS: Record<GridDirection, GridCoord> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
}

// Player state
export interface GridPlayer {
  id: string
  odanId: number | null
  username: string
  avatarColor: string
  avatarImage: string | null
  isAI: boolean
  position: GridCoord
  trail: GridCoord[]
  territory: Set<string>
  isAlive: boolean
  direction: GridDirection | null
  score: number
  eliminationCount: number
  speedBoostUntil: number
  multiplierUntil: number
  frozenUntil: number
  startPosition: GridCoord
}

// Serializable player state for sending to clients
export interface GridPlayerState {
  id: string
  odanId: number | null
  username: string
  avatarColor: string
  avatarImage: string | null
  isAI: boolean
  position: GridCoord
  trail: GridCoord[]
  territory: string[]
  isAlive: boolean
  direction: GridDirection | null
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
  position: GridCoord
  value?: number
  spawnedAt: number
}

// Game status
export type GameStatus = 'waiting' | 'countdown' | 'playing' | 'ending'

// Game state
export interface GridGameState {
  status: GameStatus
  players: Map<string, GridPlayer>
  powerUps: PowerUp[]
  gridSize: number
  roundStartTime: number | null
  roundEndTime: number | null
  roundDuration: number
  countdownStartTime: number | null
  tickInterval: NodeJS.Timeout | null
  lastPowerUpSpawn: number
}

// Lobby state
export interface GridLobby {
  id: string
  gameState: GridGameState
  realPlayerCount: number
  spectators: Set<string>
}

// Data sent to clients
export interface LobbyUpdateData {
  players: GridPlayerState[]
  status: GameStatus
  countdown?: number
  realPlayerCount: number
  spectatorCount: number
}

export interface GameStateUpdateData {
  players: GridPlayerState[]
  powerUps: PowerUp[]
  timeRemaining: number
  status: GameStatus
}

export interface PlayerEliminatedData {
  playerId: string
  eliminatedBy: string | null
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
export const GRID_SIZE = 21 // 21x21 grid
export const MAX_PLAYERS = 4
export const ROUND_DURATION = 75000
export const COUNTDOWN_DURATION = 3000
export const TICK_RATE = 30
export const MOVE_INTERVAL = 400 // Players move every 400ms
export const SPEED_BOOST_MOVE_INTERVAL = 267

// Scoring
export const POINTS_PER_TILE = 5
export const SURVIVAL_BONUS_PER_SEC = 2
export const ELIMINATION_BOUNTY = 100
export const WINNER_BONUS = 250

// Power-up config
export const POWERUP_SPAWN_INTERVAL_MIN = 5000
export const POWERUP_SPAWN_INTERVAL_MAX = 10000
export const MAX_POWERUPS_ON_GRID = 3
export const SPEED_BOOST_DURATION = 5000
export const MULTIPLIER_DURATION = 8000
export const FREEZE_DURATION = 3000
export const GEM_MIN_VALUE = 50
export const GEM_MAX_VALUE = 200
export const CROWN_VALUE = 500
export const CROWN_SPAWN_CHANCE = 0.1

// Starting positions (4 corners, offset slightly inward)
export function getStartingPositions(gridSize: number): GridCoord[] {
  const offset = 2
  return [
    { x: offset, y: offset }, // Top-left
    { x: gridSize - 1 - offset, y: offset }, // Top-right
    { x: offset, y: gridSize - 1 - offset }, // Bottom-left
    { x: gridSize - 1 - offset, y: gridSize - 1 - offset }, // Bottom-right
  ]
}

// AI player colors
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
export function coordToKey(coord: GridCoord): string {
  return `${coord.x},${coord.y}`
}

export function keyToCoord(key: string): GridCoord {
  const [x, y] = key.split(',').map(Number)
  return { x, y }
}

export function getNeighbor(coord: GridCoord, direction: GridDirection): GridCoord {
  const d = GRID_DIRECTIONS[direction]
  return { x: coord.x + d.x, y: coord.y + d.y }
}

export function isInBounds(coord: GridCoord, gridSize: number): boolean {
  return coord.x >= 0 && coord.x < gridSize && coord.y >= 0 && coord.y < gridSize
}

export function gridDistance(a: GridCoord, b: GridCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

export function coordEquals(a: GridCoord, b: GridCoord): boolean {
  return a.x === b.x && a.y === b.y
}

// Convert player to serializable state
export function playerToState(player: GridPlayer): GridPlayerState {
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
export function createInitialGameState(): GridGameState {
  return {
    status: 'waiting',
    players: new Map(),
    powerUps: [],
    gridSize: GRID_SIZE,
    roundStartTime: null,
    roundEndTime: null,
    roundDuration: ROUND_DURATION,
    countdownStartTime: null,
    tickInterval: null,
    lastPowerUpSpawn: 0,
  }
}

// Legacy exports for compatibility (hex names pointing to grid equivalents)
export type HexCoord = GridCoord
export type HexDirection = GridDirection
export type HexPlayer = GridPlayer
export type HexPlayerState = GridPlayerState
export type HexGameState = GridGameState
export type HexLobby = GridLobby
export const HEX_DIRECTIONS = GRID_DIRECTIONS
export const HEX_GRID_SIZE = GRID_SIZE
export const hexToKey = coordToKey
export const keyToHex = keyToCoord
export const hexDistance = gridDistance
export const hexEquals = coordEquals
