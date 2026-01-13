// HEXGRID AI Opponent Logic (Square Grid Version)

import {
  HexCoord,
  HexDirection,
  HexPlayer,
  HexGameState,
  HEX_DIRECTIONS,
  getNeighbor,
  isInBounds,
  hexToKey,
  hexDistance,
  hexEquals,
  PowerUp,
} from './hexgridState.js'

// AI behavior profile
export interface AIBehavior {
  updateInterval: number
  aggressiveness: number
  territoryFocus: number
  powerUpFocus: number
  returnThreshold: number
}

// AI difficulty profiles
export const AI_PROFILES: Record<string, AIBehavior> = {
  easy: {
    updateInterval: 600,
    aggressiveness: 0.15,
    territoryFocus: 0.4,
    powerUpFocus: 0.3,
    returnThreshold: 8,
  },
  medium: {
    updateInterval: 400,
    aggressiveness: 0.3,
    territoryFocus: 0.5,
    powerUpFocus: 0.5,
    returnThreshold: 6,
  },
  hard: {
    updateInterval: 250,
    aggressiveness: 0.5,
    territoryFocus: 0.6,
    powerUpFocus: 0.7,
    returnThreshold: 5,
  },
}

export function getRandomProfile(): AIBehavior {
  const profiles = ['easy', 'medium', 'hard']
  const weights = [0.4, 0.4, 0.2]
  const rand = Math.random()
  let cumulative = 0
  for (let i = 0; i < profiles.length; i++) {
    cumulative += weights[i]
    if (rand < cumulative) {
      return AI_PROFILES[profiles[i]]
    }
  }
  return AI_PROFILES.medium
}

const aiState: Map<
  string,
  {
    profile: AIBehavior
    lastDecision: number
    currentGoal: 'expand' | 'return' | 'chase' | 'powerup' | 'flee'
    targetPosition: HexCoord | null
  }
> = new Map()

export function initAIState(aiId: string): void {
  aiState.set(aiId, {
    profile: getRandomProfile(),
    lastDecision: 0,
    currentGoal: 'expand',
    targetPosition: null,
  })
}

export function removeAIState(aiId: string): void {
  aiState.delete(aiId)
}

// Get all valid directions from current position
function getValidDirections(
  position: HexCoord,
  gridSize: number,
  trail: HexCoord[],
  allPlayers: Map<string, HexPlayer>,
  playerId: string
): HexDirection[] {
  const validDirs: HexDirection[] = []
  const trailKeys = new Set(trail.map(hexToKey))

  for (const dir of Object.keys(HEX_DIRECTIONS) as HexDirection[]) {
    const next = getNeighbor(position, dir)

    if (!isInBounds(next, gridSize)) continue
    if (trailKeys.has(hexToKey(next))) continue

    let hitsOtherTrail = false
    for (const [pid, player] of allPlayers) {
      if (pid === playerId || !player.isAlive) continue
      if (player.trail.some((t) => hexEquals(t, next))) {
        hitsOtherTrail = true
        break
      }
    }
    if (hitsOtherTrail) continue

    validDirs.push(dir)
  }

  return validDirs
}

// Score a direction based on how many options it leaves open (look-ahead)
function scoreDirection(
  position: HexCoord,
  direction: HexDirection,
  gridSize: number,
  trail: HexCoord[],
  allPlayers: Map<string, HexPlayer>,
  playerId: string,
  depth: number = 2
): number {
  const next = getNeighbor(position, direction)
  if (!isInBounds(next, gridSize)) return -100

  // Create a hypothetical trail including current position
  const hypotheticalTrail = [...trail, position]

  // Count valid moves from next position
  const nextValidDirs = getValidDirections(next, gridSize, hypotheticalTrail, allPlayers, playerId)

  if (nextValidDirs.length === 0) return -50 // Dead end

  let score = nextValidDirs.length * 10

  // Penalize being too close to edges
  const edgeDist = Math.min(next.x, next.y, gridSize - 1 - next.x, gridSize - 1 - next.y)
  if (edgeDist <= 1) score -= 15
  if (edgeDist === 0) score -= 25

  // Look ahead one more step if depth allows
  if (depth > 1) {
    let bestFutureScore = -100
    for (const futureDir of nextValidDirs) {
      const futureScore = scoreDirection(next, futureDir, gridSize, hypotheticalTrail, allPlayers, playerId, depth - 1)
      bestFutureScore = Math.max(bestFutureScore, futureScore)
    }
    score += bestFutureScore * 0.5
  }

  return score
}

// Get the best direction considering future options
function getBestScoredDirection(
  position: HexCoord,
  validDirs: HexDirection[],
  gridSize: number,
  trail: HexCoord[],
  allPlayers: Map<string, HexPlayer>,
  playerId: string
): HexDirection | null {
  if (validDirs.length === 0) return null
  if (validDirs.length === 1) return validDirs[0]

  let bestDir: HexDirection | null = null
  let bestScore = -Infinity

  for (const dir of validDirs) {
    const score = scoreDirection(position, dir, gridSize, trail, allPlayers, playerId)
    if (score > bestScore) {
      bestScore = score
      bestDir = dir
    }
  }

  return bestDir || validDirs[0]
}

// Find direction toward a target (square grid)
function getDirectionToward(from: HexCoord, to: HexCoord): HexDirection | null {
  const dx = to.x - from.x
  const dy = to.y - from.y

  // Pick the axis with the larger difference
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'E' : 'W'
  } else if (dy !== 0) {
    return dy > 0 ? 'S' : 'N'
  } else if (dx !== 0) {
    return dx > 0 ? 'E' : 'W'
  }

  return null
}

// Find nearest cell in player's territory
function findNearestTerritory(position: HexCoord, territory: Set<string>): HexCoord | null {
  if (territory.size === 0) return null

  let nearest: HexCoord | null = null
  let nearestDist = Infinity

  for (const key of territory) {
    const [x, y] = key.split(',').map(Number)
    const cell = { x, y }
    const dist = hexDistance(position, cell)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = cell
    }
  }

  return nearest
}

function findNearestPowerUp(position: HexCoord, powerUps: PowerUp[]): PowerUp | null {
  if (powerUps.length === 0) return null

  let nearest: PowerUp | null = null
  let nearestDist = Infinity

  for (const pu of powerUps) {
    const dist = hexDistance(position, pu.position)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = pu
    }
  }

  return nearest
}

function findNearestEnemy(
  position: HexCoord,
  playerId: string,
  players: Map<string, HexPlayer>
): HexPlayer | null {
  let nearest: HexPlayer | null = null
  let nearestDist = Infinity

  for (const [pid, player] of players) {
    if (pid === playerId || !player.isAlive || player.isAI) continue
    const dist = hexDistance(position, player.position)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = player
    }
  }

  return nearest
}

function isDangerNearby(
  position: HexCoord,
  playerId: string,
  players: Map<string, HexPlayer>,
  dangerRadius: number = 2
): boolean {
  for (const [pid, player] of players) {
    if (pid === playerId || !player.isAlive) continue

    if (hexDistance(position, player.position) <= dangerRadius) {
      return true
    }

    for (const trailCell of player.trail) {
      if (hexDistance(position, trailCell) <= dangerRadius - 1) {
        return true
      }
    }
  }
  return false
}

// Main AI decision function
export function getAIMove(ai: HexPlayer, gameState: HexGameState): HexDirection | null {
  const state = aiState.get(ai.id)
  if (!state) {
    initAIState(ai.id)
    return getAIMove(ai, gameState)
  }

  const now = Date.now()
  const profile = state.profile

  if (now - state.lastDecision < profile.updateInterval) {
    if (ai.direction) {
      const validDirs = getValidDirections(
        ai.position,
        gameState.gridSize,
        ai.trail,
        gameState.players,
        ai.id
      )
      if (validDirs.includes(ai.direction)) {
        return ai.direction
      }
    }
  }

  state.lastDecision = now

  const validDirs = getValidDirections(
    ai.position,
    gameState.gridSize,
    ai.trail,
    gameState.players,
    ai.id
  )

  if (validDirs.length === 0) {
    return ai.direction
  }

  const inTerritory = ai.territory.has(hexToKey(ai.position))
  const trailLength = ai.trail.length

  // Priority 1: Return to territory if trail is long
  if (!inTerritory && trailLength >= profile.returnThreshold) {
    state.currentGoal = 'return'
    const nearestTerritory = findNearestTerritory(ai.position, ai.territory)
    if (nearestTerritory) {
      state.targetPosition = nearestTerritory
      const dir = getDirectionToward(ai.position, nearestTerritory)
      if (dir && validDirs.includes(dir)) {
        return dir
      }
    }
  }

  // Priority 2: Flee if danger nearby
  if (trailLength > 0 && isDangerNearby(ai.position, ai.id, gameState.players)) {
    state.currentGoal = 'flee'
    const nearestTerritory = findNearestTerritory(ai.position, ai.territory)
    if (nearestTerritory) {
      const dir = getDirectionToward(ai.position, nearestTerritory)
      if (dir && validDirs.includes(dir)) {
        return dir
      }
    }
    return validDirs[Math.floor(Math.random() * validDirs.length)]
  }

  // Priority 3: Go for powerups
  if (Math.random() < profile.powerUpFocus) {
    const nearestPowerUp = findNearestPowerUp(ai.position, gameState.powerUps)
    if (nearestPowerUp && hexDistance(ai.position, nearestPowerUp.position) <= 5) {
      state.currentGoal = 'powerup'
      state.targetPosition = nearestPowerUp.position
      const dir = getDirectionToward(ai.position, nearestPowerUp.position)
      if (dir && validDirs.includes(dir)) {
        return dir
      }
    }
  }

  // Priority 4: Chase players
  if (Math.random() < profile.aggressiveness && inTerritory) {
    const nearestEnemy = findNearestEnemy(ai.position, ai.id, gameState.players)
    if (nearestEnemy && hexDistance(ai.position, nearestEnemy.position) <= 6) {
      state.currentGoal = 'chase'
      state.targetPosition = nearestEnemy.position
      const dir = getDirectionToward(ai.position, nearestEnemy.position)
      if (dir && validDirs.includes(dir)) {
        return dir
      }
    }
  }

  // Priority 5: Expand territory smartly
  if (Math.random() < profile.territoryFocus || inTerritory) {
    state.currentGoal = 'expand'

    // Use scoring to find the best direction that avoids dead ends
    const bestDir = getBestScoredDirection(
      ai.position,
      validDirs,
      gameState.gridSize,
      ai.trail,
      gameState.players,
      ai.id
    )

    if (bestDir) {
      return bestDir
    }
  }

  // Fallback: use scoring even for random movement to avoid dead ends
  const safestDir = getBestScoredDirection(
    ai.position,
    validDirs,
    gameState.gridSize,
    ai.trail,
    gameState.players,
    ai.id
  )

  return safestDir || validDirs[Math.floor(Math.random() * validDirs.length)]
}

export function clearAllAIStates(): void {
  aiState.clear()
}
