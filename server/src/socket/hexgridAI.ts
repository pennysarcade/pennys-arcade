// HEXGRID AI Opponent Logic

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
  updateInterval: number // How often AI changes direction (ms)
  aggressiveness: number // 0-1, likelihood to chase players
  territoryFocus: number // 0-1, likelihood to expand territory
  powerUpFocus: number // 0-1, likelihood to go for powerups
  returnThreshold: number // Trail length before returning to territory
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

// Get a random AI profile
export function getRandomProfile(): AIBehavior {
  const profiles = ['easy', 'medium', 'hard']
  const weights = [0.4, 0.4, 0.2] // 40% easy, 40% medium, 20% hard
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

// Store AI state (decision timing, current profile)
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

    // Must be in bounds
    if (!isInBounds(next, gridSize)) continue

    // Can't hit own trail
    if (trailKeys.has(hexToKey(next))) continue

    // Check for other players' trails (would cause elimination)
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

// Find direction toward a target hex
function getDirectionToward(from: HexCoord, to: HexCoord): HexDirection | null {
  const dq = to.q - from.q
  const dr = to.r - from.r

  // Find the direction that gets us closest
  let bestDir: HexDirection | null = null
  let bestDist = Infinity

  for (const dir of Object.keys(HEX_DIRECTIONS) as HexDirection[]) {
    const next = getNeighbor(from, dir)
    const dist = hexDistance(next, to)
    if (dist < bestDist) {
      bestDist = dist
      bestDir = dir
    }
  }

  return bestDir
}

// Find nearest hex in player's territory
function findNearestTerritory(position: HexCoord, territory: Set<string>): HexCoord | null {
  if (territory.size === 0) return null

  let nearest: HexCoord | null = null
  let nearestDist = Infinity

  for (const key of territory) {
    const [q, r] = key.split(',').map(Number)
    const hex = { q, r }
    const dist = hexDistance(position, hex)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = hex
    }
  }

  return nearest
}

// Find nearest power-up
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

// Find nearest enemy player
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

// Check if there's danger nearby (other player's trail close)
function isDangerNearby(
  position: HexCoord,
  playerId: string,
  players: Map<string, HexPlayer>,
  dangerRadius: number = 2
): boolean {
  for (const [pid, player] of players) {
    if (pid === playerId || !player.isAlive) continue

    // Check if enemy player is close
    if (hexDistance(position, player.position) <= dangerRadius) {
      return true
    }

    // Check if enemy trail is close
    for (const trailHex of player.trail) {
      if (hexDistance(position, trailHex) <= dangerRadius - 1) {
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

  // Only make new decisions at the update interval
  if (now - state.lastDecision < profile.updateInterval) {
    // Continue in current direction if valid
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

  // Get valid directions
  const validDirs = getValidDirections(
    ai.position,
    gameState.gridSize,
    ai.trail,
    gameState.players,
    ai.id
  )

  if (validDirs.length === 0) {
    // No valid moves - this shouldn't happen often
    return ai.direction
  }

  // Decide on a goal based on current situation and profile

  // Check if we're in territory
  const inTerritory = ai.territory.has(hexToKey(ai.position))
  const trailLength = ai.trail.length

  // Priority 1: If trail is long, return to territory
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

  // Priority 2: Flee if danger is nearby and we have a trail
  if (trailLength > 0 && isDangerNearby(ai.position, ai.id, gameState.players)) {
    state.currentGoal = 'flee'
    // Try to return to territory
    const nearestTerritory = findNearestTerritory(ai.position, ai.territory)
    if (nearestTerritory) {
      const dir = getDirectionToward(ai.position, nearestTerritory)
      if (dir && validDirs.includes(dir)) {
        return dir
      }
    }
    // Otherwise pick a random safe direction
    return validDirs[Math.floor(Math.random() * validDirs.length)]
  }

  // Priority 3: Go for powerups if one is nearby and we want it
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

  // Priority 4: Chase players if aggressive
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

  // Priority 5: Expand territory
  if (Math.random() < profile.territoryFocus || inTerritory) {
    state.currentGoal = 'expand'
    // Move toward unclaimed territory
    // Pick a direction that leads away from our territory center
    if (ai.territory.size > 0) {
      // Calculate territory center
      let sumQ = 0,
        sumR = 0
      for (const key of ai.territory) {
        const [q, r] = key.split(',').map(Number)
        sumQ += q
        sumR += r
      }
      const centerQ = sumQ / ai.territory.size
      const centerR = sumR / ai.territory.size

      // Pick direction that moves away from center (to expand)
      let bestDir: HexDirection | null = null
      let bestDist = 0

      for (const dir of validDirs) {
        const next = getNeighbor(ai.position, dir)
        const distFromCenter = Math.sqrt(
          Math.pow(next.q - centerQ, 2) + Math.pow(next.r - centerR, 2)
        )
        if (distFromCenter > bestDist) {
          bestDist = distFromCenter
          bestDir = dir
        }
      }

      if (bestDir) {
        return bestDir
      }
    }
  }

  // Default: pick a random valid direction
  return validDirs[Math.floor(Math.random() * validDirs.length)]
}

// Clean up all AI states (called when game ends)
export function clearAllAIStates(): void {
  aiState.clear()
}
