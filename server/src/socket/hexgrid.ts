// HEXGRID Main Game Logic and Socket Handlers

import { Server, Socket } from 'socket.io'
import { verifyToken } from '../middleware/auth.js'
import {
  HexCoord,
  HexDirection,
  HexPlayer,
  HexGameState,
  HexLobby,
  PowerUp,
  PowerUpType,
  LobbyUpdateData,
  GameStateUpdateData,
  PlayerEliminatedData,
  TerritoryClaimedData,
  GameOverData,
  HEX_DIRECTIONS,
  HEX_GRID_SIZE,
  MAX_PLAYERS,
  ROUND_DURATION,
  COUNTDOWN_DURATION,
  TICK_RATE,
  MOVE_INTERVAL,
  SPEED_BOOST_MOVE_INTERVAL,
  POINTS_PER_TILE,
  SURVIVAL_BONUS_PER_SEC,
  ELIMINATION_BOUNTY,
  WINNER_BONUS,
  POWERUP_SPAWN_INTERVAL_MIN,
  POWERUP_SPAWN_INTERVAL_MAX,
  MAX_POWERUPS_ON_GRID,
  SPEED_BOOST_DURATION,
  MULTIPLIER_DURATION,
  FREEZE_DURATION,
  GEM_MIN_VALUE,
  GEM_MAX_VALUE,
  CROWN_VALUE,
  CROWN_SPAWN_CHANCE,
  AI_COLORS,
  AI_NAMES,
  getStartingPositions,
  hexToKey,
  keyToHex,
  getNeighbor,
  isInBounds,
  hexDistance,
  hexEquals,
  playerToState,
  createInitialGameState,
} from './hexgridState.js'
import { getAIMove, initAIState, removeAIState, clearAllAIStates } from './hexgridAI.js'
import { execute, query } from '../db/schema.js'

// Store the Socket.io instance
let ioInstance: Server | null = null

// Main lobby (single lobby for now)
const mainLobby: HexLobby = {
  id: 'main',
  gameState: createInitialGameState(),
  realPlayerCount: 0,
  spectators: new Set(),
}

// Map socket IDs to their player IDs in the game
const socketToPlayer: Map<string, string> = new Map()

// Track last move time for each player
const lastMoveTime: Map<string, number> = new Map()

// Track pending direction changes (applied on next move tick)
const pendingDirections: Map<string, HexDirection> = new Map()

// Generate unique ID for AI players
let aiIdCounter = 0
function generateAIId(): string {
  return `ai_${++aiIdCounter}_${Date.now()}`
}

// Get available starting position
function getAvailableStartPosition(gameState: HexGameState): HexCoord | null {
  const startPositions = getStartingPositions(gameState.gridSize)
  const usedPositions = new Set<string>()

  for (const player of gameState.players.values()) {
    usedPositions.add(hexToKey(player.startPosition))
  }

  for (const pos of startPositions) {
    if (!usedPositions.has(hexToKey(pos))) {
      return pos
    }
  }

  return null
}

// Create a new player
function createPlayer(
  id: string,
  odanId: number | null,
  username: string,
  avatarColor: string,
  avatarImage: string | null,
  isAI: boolean,
  startPosition: HexCoord
): HexPlayer {
  return {
    id,
    odanId,
    username,
    avatarColor,
    avatarImage,
    isAI,
    position: { ...startPosition },
    trail: [],
    territory: new Set([hexToKey(startPosition)]), // Start with one tile
    isAlive: true,
    direction: null,
    score: 0,
    eliminationCount: 0,
    speedBoostUntil: 0,
    multiplierUntil: 0,
    frozenUntil: 0,
    startPosition: { ...startPosition },
  }
}

// Add AI players to fill slots
function fillWithAI(lobby: HexLobby): void {
  const gameState = lobby.gameState
  const currentCount = gameState.players.size

  for (let i = currentCount; i < MAX_PLAYERS; i++) {
    const startPos = getAvailableStartPosition(gameState)
    if (!startPos) break

    const aiId = generateAIId()
    const aiIndex = i % AI_NAMES.length
    const aiPlayer = createPlayer(
      aiId,
      null,
      AI_NAMES[aiIndex],
      AI_COLORS[aiIndex],
      null,
      true,
      startPos
    )

    gameState.players.set(aiId, aiPlayer)
    initAIState(aiId)
  }
}

// Remove one AI player (when real player joins)
function removeOneAI(lobby: HexLobby): string | null {
  const gameState = lobby.gameState

  for (const [id, player] of gameState.players) {
    if (player.isAI) {
      gameState.players.delete(id)
      removeAIState(id)
      return id
    }
  }

  return null
}

// Broadcast lobby update to all connected clients
function broadcastLobbyUpdate(lobby: HexLobby): void {
  if (!ioInstance) return

  const data: LobbyUpdateData = {
    players: Array.from(lobby.gameState.players.values()).map(playerToState),
    status: lobby.gameState.status,
    countdown:
      lobby.gameState.countdownStartTime !== null
        ? Math.max(
            0,
            COUNTDOWN_DURATION - (Date.now() - lobby.gameState.countdownStartTime)
          )
        : undefined,
    realPlayerCount: lobby.realPlayerCount,
    spectatorCount: lobby.spectators.size,
  }

  ioInstance.to(`hexgrid:${lobby.id}`).emit('hexgrid:lobby_update', data)

  // Also broadcast to global for lobby status display
  ioInstance.emit('hexgrid:lobby_status', {
    lobbyId: lobby.id,
    playerCount: lobby.realPlayerCount,
    maxPlayers: MAX_PLAYERS,
    status: lobby.gameState.status,
  })
}

// Broadcast game state update
function broadcastGameState(lobby: HexLobby): void {
  if (!ioInstance) return

  const gameState = lobby.gameState
  const now = Date.now()
  const timeRemaining = gameState.roundEndTime
    ? Math.max(0, gameState.roundEndTime - now)
    : ROUND_DURATION

  const data: GameStateUpdateData = {
    players: Array.from(gameState.players.values()).map(playerToState),
    powerUps: gameState.powerUps,
    timeRemaining,
    status: gameState.status,
  }

  ioInstance.to(`hexgrid:${lobby.id}`).emit('hexgrid:state_update', data)
}

// Spawn a power-up
function spawnPowerUp(gameState: HexGameState): void {
  if (gameState.powerUps.length >= MAX_POWERUPS_ON_GRID) return

  // Find a random empty hex
  const occupiedHexes = new Set<string>()

  for (const player of gameState.players.values()) {
    occupiedHexes.add(hexToKey(player.position))
    player.trail.forEach((h) => occupiedHexes.add(hexToKey(h)))
    player.territory.forEach((k) => occupiedHexes.add(k))
  }

  gameState.powerUps.forEach((pu) => occupiedHexes.add(hexToKey(pu.position)))

  // Get all valid hexes
  const validHexes: HexCoord[] = []
  for (let q = -gameState.gridSize; q <= gameState.gridSize; q++) {
    for (let r = -gameState.gridSize; r <= gameState.gridSize; r++) {
      const s = -q - r
      if (Math.abs(s) <= gameState.gridSize) {
        const hex = { q, r }
        if (!occupiedHexes.has(hexToKey(hex))) {
          validHexes.push(hex)
        }
      }
    }
  }

  if (validHexes.length === 0) return

  const position = validHexes[Math.floor(Math.random() * validHexes.length)]

  // Decide type
  let type: PowerUpType
  const rand = Math.random()

  if (rand < CROWN_SPAWN_CHANCE) {
    type = 'crown'
  } else if (rand < 0.3) {
    type = 'multiplier'
  } else if (rand < 0.5) {
    type = 'speed'
  } else if (rand < 0.65) {
    type = 'freeze'
  } else {
    type = 'gem'
  }

  const powerUp: PowerUp = {
    id: `pu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    position,
    value: type === 'gem' ? Math.floor(Math.random() * (GEM_MAX_VALUE - GEM_MIN_VALUE + 1)) + GEM_MIN_VALUE : undefined,
    spawnedAt: Date.now(),
  }

  gameState.powerUps.push(powerUp)
}

// Check if player collects a power-up
function checkPowerUpCollection(player: HexPlayer, gameState: HexGameState): void {
  const playerKey = hexToKey(player.position)
  const now = Date.now()

  for (let i = gameState.powerUps.length - 1; i >= 0; i--) {
    const pu = gameState.powerUps[i]
    if (hexToKey(pu.position) === playerKey) {
      // Collect it
      gameState.powerUps.splice(i, 1)

      const multiplier = player.multiplierUntil > now ? 2 : 1

      switch (pu.type) {
        case 'gem':
          player.score += (pu.value || GEM_MIN_VALUE) * multiplier
          break
        case 'crown':
          player.score += CROWN_VALUE * multiplier
          break
        case 'multiplier':
          player.multiplierUntil = now + MULTIPLIER_DURATION
          break
        case 'speed':
          player.speedBoostUntil = now + SPEED_BOOST_DURATION
          break
        case 'freeze':
          // Freeze all other players
          for (const [id, other] of gameState.players) {
            if (id !== player.id && other.isAlive) {
              other.frozenUntil = now + FREEZE_DURATION
            }
          }
          break
      }
    }
  }
}

// Flood fill to claim territory
function floodFillTerritory(
  player: HexPlayer,
  gameState: HexGameState
): Set<string> {
  // The trail creates a boundary. We need to fill the inside.
  // The "inside" is the smaller region.

  const boundary = new Set<string>()
  player.trail.forEach((h) => boundary.add(hexToKey(h)))
  player.territory.forEach((k) => boundary.add(k))

  // Find all connected regions outside the boundary
  const allHexes = new Set<string>()
  for (let q = -gameState.gridSize; q <= gameState.gridSize; q++) {
    for (let r = -gameState.gridSize; r <= gameState.gridSize; r++) {
      const s = -q - r
      if (Math.abs(s) <= gameState.gridSize) {
        allHexes.add(hexToKey({ q, r }))
      }
    }
  }

  // Remove boundary from all hexes
  boundary.forEach((k) => allHexes.delete(k))

  // Find regions using flood fill
  const regions: Set<string>[] = []
  const visited = new Set<string>()

  for (const startKey of allHexes) {
    if (visited.has(startKey)) continue

    const region = new Set<string>()
    const queue = [startKey]

    while (queue.length > 0) {
      const key = queue.shift()!
      if (visited.has(key) || boundary.has(key)) continue

      visited.add(key)
      region.add(key)

      const hex = keyToHex(key)
      for (const dir of Object.values(HEX_DIRECTIONS)) {
        const neighbor = { q: hex.q + dir.q, r: hex.r + dir.r }
        if (isInBounds(neighbor, gameState.gridSize)) {
          const neighborKey = hexToKey(neighbor)
          if (!visited.has(neighborKey) && !boundary.has(neighborKey)) {
            queue.push(neighborKey)
          }
        }
      }
    }

    if (region.size > 0) {
      regions.push(region)
    }
  }

  // The regions that touch the edge are "outside"
  // The regions that don't touch the edge are "inside" and should be claimed
  const edgeHexes = new Set<string>()
  for (let q = -gameState.gridSize; q <= gameState.gridSize; q++) {
    for (let r = -gameState.gridSize; r <= gameState.gridSize; r++) {
      const s = -q - r
      if (
        Math.abs(q) === gameState.gridSize ||
        Math.abs(r) === gameState.gridSize ||
        Math.abs(s) === gameState.gridSize
      ) {
        edgeHexes.add(hexToKey({ q, r }))
      }
    }
  }

  const claimedHexes = new Set<string>()

  for (const region of regions) {
    let touchesEdge = false
    for (const key of region) {
      if (edgeHexes.has(key)) {
        touchesEdge = true
        break
      }
    }

    if (!touchesEdge) {
      // This region is enclosed - claim it
      region.forEach((k) => claimedHexes.add(k))
    }
  }

  return claimedHexes
}

// Check collisions and handle eliminations
function checkCollisions(gameState: HexGameState): PlayerEliminatedData[] {
  const eliminations: PlayerEliminatedData[] = []

  for (const [playerId, player] of gameState.players) {
    if (!player.isAlive) continue

    // Check boundary collision
    if (!isInBounds(player.position, gameState.gridSize)) {
      player.isAlive = false
      eliminations.push({
        playerId,
        eliminatedBy: null,
        playerUsername: player.username,
        eliminatorUsername: null,
      })
      continue
    }

    // Check collision with other players' trails
    for (const [otherId, other] of gameState.players) {
      if (otherId === playerId || !other.isAlive) continue

      // Check if we hit their trail
      for (const trailHex of other.trail) {
        if (hexEquals(player.position, trailHex)) {
          player.isAlive = false
          other.score += ELIMINATION_BOUNTY * (other.multiplierUntil > Date.now() ? 2 : 1)
          other.eliminationCount++
          eliminations.push({
            playerId,
            eliminatedBy: otherId,
            playerUsername: player.username,
            eliminatorUsername: other.username,
          })
          break
        }
      }
      if (!player.isAlive) break
    }

    // Check collision with own trail (only if not at start of trail)
    if (player.isAlive && player.trail.length > 1) {
      for (let i = 0; i < player.trail.length - 1; i++) {
        if (hexEquals(player.position, player.trail[i])) {
          player.isAlive = false
          eliminations.push({
            playerId,
            eliminatedBy: playerId, // Self-elimination
            playerUsername: player.username,
            eliminatorUsername: player.username,
          })
          break
        }
      }
    }
  }

  return eliminations
}

// Process territory claiming when player returns to their territory
function processTerritoryClaim(
  player: HexPlayer,
  gameState: HexGameState
): TerritoryClaimedData | null {
  const posKey = hexToKey(player.position)

  // Check if player returned to their territory
  if (player.territory.has(posKey) && player.trail.length > 0) {
    // Claim the trail
    const newTiles: string[] = []
    const multiplier = player.multiplierUntil > Date.now() ? 2 : 1

    for (const hex of player.trail) {
      const key = hexToKey(hex)
      if (!player.territory.has(key)) {
        player.territory.add(key)
        newTiles.push(key)
      }
    }

    // Flood fill to claim enclosed area
    const filledTiles = floodFillTerritory(player, gameState)
    for (const key of filledTiles) {
      if (!player.territory.has(key)) {
        player.territory.add(key)
        newTiles.push(key)
      }
    }

    // Clear trail
    player.trail = []

    if (newTiles.length > 0) {
      const points = newTiles.length * POINTS_PER_TILE * multiplier
      player.score += points

      return {
        playerId: player.id,
        tiles: newTiles,
        points,
      }
    }
  }

  return null
}

// Main game tick
function gameTick(lobby: HexLobby): void {
  const gameState = lobby.gameState
  const now = Date.now()

  if (gameState.status !== 'playing') return

  // Check if round ended
  if (gameState.roundEndTime && now >= gameState.roundEndTime) {
    endRound(lobby)
    return
  }

  // Check if only one player alive
  const alivePlayers = Array.from(gameState.players.values()).filter((p) => p.isAlive)
  if (alivePlayers.length <= 1) {
    endRound(lobby)
    return
  }

  // Spawn power-ups
  const timeSinceLastSpawn = now - gameState.lastPowerUpSpawn
  const spawnInterval =
    Math.random() * (POWERUP_SPAWN_INTERVAL_MAX - POWERUP_SPAWN_INTERVAL_MIN) +
    POWERUP_SPAWN_INTERVAL_MIN
  if (timeSinceLastSpawn >= spawnInterval) {
    spawnPowerUp(gameState)
    gameState.lastPowerUpSpawn = now
  }

  // Process AI moves
  for (const [id, player] of gameState.players) {
    if (player.isAI && player.isAlive && player.frozenUntil <= now) {
      const aiDirection = getAIMove(player, gameState)
      if (aiDirection) {
        pendingDirections.set(id, aiDirection)
      }
    }
  }

  // Apply pending direction changes
  for (const [playerId, direction] of pendingDirections) {
    const player = gameState.players.get(playerId)
    if (player && player.isAlive) {
      player.direction = direction
    }
  }
  pendingDirections.clear()

  // Move players
  for (const [playerId, player] of gameState.players) {
    if (!player.isAlive || !player.direction) continue
    if (player.frozenUntil > now) continue

    const lastMove = lastMoveTime.get(playerId) || 0
    const moveInterval = player.speedBoostUntil > now ? SPEED_BOOST_MOVE_INTERVAL : MOVE_INTERVAL

    if (now - lastMove >= moveInterval) {
      lastMoveTime.set(playerId, now)

      const newPos = getNeighbor(player.position, player.direction)

      // Add current position to trail if not in own territory
      if (!player.territory.has(hexToKey(player.position))) {
        if (player.trail.length === 0 || !hexEquals(player.trail[player.trail.length - 1], player.position)) {
          player.trail.push({ ...player.position })
        }
      }

      player.position = newPos

      // Check power-up collection
      checkPowerUpCollection(player, gameState)

      // Check territory claim
      const claim = processTerritoryClaim(player, gameState)
      if (claim && ioInstance) {
        ioInstance.to(`hexgrid:${lobby.id}`).emit('hexgrid:territory_claimed', claim)
      }
    }
  }

  // Check collisions
  const eliminations = checkCollisions(gameState)
  for (const elim of eliminations) {
    if (ioInstance) {
      ioInstance.to(`hexgrid:${lobby.id}`).emit('hexgrid:player_eliminated', elim)
    }
  }

  // Add survival bonus
  for (const player of gameState.players.values()) {
    if (player.isAlive) {
      const multiplier = player.multiplierUntil > now ? 2 : 1
      player.score += (SURVIVAL_BONUS_PER_SEC / TICK_RATE) * multiplier
    }
  }

  // Broadcast state
  broadcastGameState(lobby)
}

// Start the game round
async function startRound(lobby: HexLobby): Promise<void> {
  const gameState = lobby.gameState

  // Reset game state for new round
  gameState.players.clear()
  gameState.powerUps = []
  clearAllAIStates()
  lastMoveTime.clear()
  pendingDirections.clear()
  socketToPlayer.clear()

  // Find all authenticated sockets in the lobby room
  const realPlayerSockets = new Set<string>()

  // Get all sockets in the room
  const socketsInRoom = await ioInstance?.in(`hexgrid:${lobby.id}`).fetchSockets()
  for (const socket of socketsInRoom || []) {
    // Only add authenticated users (not guests)
    if ((socket as any).userId) {
      realPlayerSockets.add(socket.id)
    }
  }

  // Also add spectators (they should already be in the room, but just in case)
  for (const socketId of lobby.spectators) {
    realPlayerSockets.add(socketId)
  }
  lobby.spectators.clear()

  // Create players for each real socket
  for (const socketId of realPlayerSockets) {
    const socket = ioInstance?.sockets.sockets.get(socketId)
    if (!socket) continue

    const startPos = getAvailableStartPosition(gameState)
    if (!startPos) break

    const userData = (socket as any).userData || {
      odanId: null,
      username: 'Player',
      avatarColor: '#00ffff',
      avatarImage: null,
    }

    const player = createPlayer(
      socketId,
      userData.odanId,
      userData.username,
      userData.avatarColor,
      userData.avatarImage,
      false,
      startPos
    )

    gameState.players.set(socketId, player)
    socketToPlayer.set(socketId, socketId)
  }

  lobby.realPlayerCount = gameState.players.size

  // Fill remaining slots with AI
  fillWithAI(lobby)

  // Start countdown
  gameState.status = 'countdown'
  gameState.countdownStartTime = Date.now()

  broadcastLobbyUpdate(lobby)

  // After countdown, start playing
  setTimeout(() => {
    if (gameState.status === 'countdown') {
      gameState.status = 'playing'
      gameState.roundStartTime = Date.now()
      gameState.roundEndTime = Date.now() + ROUND_DURATION
      gameState.lastPowerUpSpawn = Date.now()

      // Start game loop
      gameState.tickInterval = setInterval(() => {
        gameTick(lobby)
      }, 1000 / TICK_RATE)

      broadcastGameState(lobby)
    }
  }, COUNTDOWN_DURATION)
}

// End the round
async function endRound(lobby: HexLobby): Promise<void> {
  const gameState = lobby.gameState

  if (gameState.tickInterval) {
    clearInterval(gameState.tickInterval)
    gameState.tickInterval = null
  }

  gameState.status = 'ending'

  // Calculate final scores and determine winner
  const rankings: GameOverData['rankings'] = []

  for (const player of gameState.players.values()) {
    // Winner bonus for last alive or most territory
    const isWinner =
      Array.from(gameState.players.values()).filter((p) => p.isAlive).length === 1 &&
      player.isAlive

    if (isWinner) {
      player.score += WINNER_BONUS
    }

    rankings.push({
      odanId: player.odanId,
      odanUsername: player.username,
      odanAvatarColor: player.avatarColor,
      playerId: player.id,
      username: player.username,
      score: Math.floor(player.score),
      rank: 0,
      territoryClaimed: player.territory.size,
      eliminations: player.eliminationCount,
      isAI: player.isAI,
    })
  }

  // Sort by score descending
  rankings.sort((a, b) => b.score - a.score)

  // Assign ranks
  rankings.forEach((r, i) => {
    r.rank = i + 1
  })

  const roundDuration = gameState.roundEndTime
    ? gameState.roundEndTime - (gameState.roundStartTime || 0)
    : ROUND_DURATION

  // Save scores for real players
  for (const ranking of rankings) {
    if (!ranking.isAI && ranking.odanId) {
      try {
        // Insert into high_scores
        await execute(
          `INSERT INTO high_scores (user_id, username, avatar_color, game_id, score, stats, platform)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            ranking.odanId,
            ranking.odanUsername,
            ranking.odanAvatarColor,
            'hexgrid',
            ranking.score,
            JSON.stringify({
              rank: ranking.rank,
              territoryClaimed: ranking.territoryClaimed,
              eliminations: ranking.eliminations,
              roundDuration: Math.floor(roundDuration / 1000),
            }),
            'desktop', // Could be improved to track actual platform
          ]
        )
      } catch (err) {
        console.error('Error saving hexgrid score:', err)
      }
    }
  }

  // Broadcast game over
  if (ioInstance) {
    const gameOverData: GameOverData = {
      rankings,
      roundDuration,
    }
    ioInstance.to(`hexgrid:${lobby.id}`).emit('hexgrid:game_over', gameOverData)
  }

  // Wait a bit, then start new round
  setTimeout(() => {
    gameState.status = 'waiting'
    broadcastLobbyUpdate(lobby)

    // Auto-start next round if there are players
    if (lobby.realPlayerCount > 0) {
      setTimeout(async () => {
        await startRound(lobby)
      }, 2000)
    }
  }, 5000)
}

// Handle player joining
function handleJoin(socket: Socket, lobbyId: string): void {
  const lobby = mainLobby // For now, only one lobby

  // Join the socket room
  socket.join(`hexgrid:${lobby.id}`)

  // Store user data on socket
  const userData = {
    odanId: (socket as any).userId || null,
    username: (socket as any).username || 'Player',
    avatarColor: (socket as any).avatarColor || '#00ffff',
    avatarImage: (socket as any).avatarImage || null,
  }
  ;(socket as any).userData = userData

  if (lobby.gameState.status === 'playing' || lobby.gameState.status === 'countdown') {
    // Game in progress - add as spectator for next round
    lobby.spectators.add(socket.id)

    // If there's an AI, remove it to make room for next round
    if (lobby.realPlayerCount < MAX_PLAYERS) {
      lobby.realPlayerCount++
      removeOneAI(lobby)
    }
  } else {
    // Game waiting or ending - add directly
    if (lobby.realPlayerCount < MAX_PLAYERS) {
      lobby.realPlayerCount++

      // If game is waiting and we just got first player, fill with AI and start
      if (lobby.gameState.status === 'waiting' && lobby.realPlayerCount === 1) {
        setTimeout(async () => {
          if (lobby.gameState.status === 'waiting') {
            await startRound(lobby)
          }
        }, 1000)
      }
    }
  }

  broadcastLobbyUpdate(lobby)
}

// Handle player leaving
function handleLeave(socket: Socket): void {
  const lobby = mainLobby

  socket.leave(`hexgrid:${lobby.id}`)
  lobby.spectators.delete(socket.id)

  // Check if player was in game
  const player = lobby.gameState.players.get(socket.id)
  if (player && !player.isAI) {
    // Mark as eliminated (they left)
    player.isAlive = false
    lobby.realPlayerCount = Math.max(0, lobby.realPlayerCount - 1)

    // Add AI to replace them
    const startPos = getAvailableStartPosition(lobby.gameState)
    if (startPos && lobby.gameState.players.size < MAX_PLAYERS) {
      const aiId = generateAIId()
      const aiIndex = lobby.gameState.players.size % AI_NAMES.length
      const aiPlayer = createPlayer(
        aiId,
        null,
        AI_NAMES[aiIndex],
        AI_COLORS[aiIndex],
        null,
        true,
        startPos
      )
      lobby.gameState.players.set(aiId, aiPlayer)
      initAIState(aiId)
    }
  } else {
    // Wasn't in current game, just decrement count
    lobby.realPlayerCount = Math.max(0, lobby.realPlayerCount - 1)
  }

  socketToPlayer.delete(socket.id)
  broadcastLobbyUpdate(lobby)
}

// Handle move input
function handleMove(socket: Socket, direction: HexDirection): void {
  const playerId = socket.id
  const player = mainLobby.gameState.players.get(playerId)

  if (!player || !player.isAlive || player.isAI) return
  if (mainLobby.gameState.status !== 'playing') return

  // Validate direction
  if (!HEX_DIRECTIONS[direction]) return

  // Queue direction change
  pendingDirections.set(playerId, direction)
}

// Setup socket handlers
export async function setupHexgridSocket(io: Server): Promise<void> {
  ioInstance = io

  // Use middleware to authenticate sockets BEFORE connection event fires
  // This ensures userId is set by the time event handlers run
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token
    if (token) {
      try {
        const decoded = verifyToken(token)
        if (decoded && typeof decoded === 'object' && 'userId' in decoded) {
          const userId = (decoded as any).userId
          const users = await query<{ id: number; username: string; avatar_color: string; avatar_image: string | null }>(
            'SELECT id, username, avatar_color, avatar_image FROM users WHERE id = $1',
            [userId]
          )
          if (users.length > 0) {
            const user = users[0]
            ;(socket as any).userId = user.id
            ;(socket as any).username = user.username
            ;(socket as any).avatarColor = user.avatar_color
            ;(socket as any).avatarImage = user.avatar_image
            console.log('[HEXGRID] Middleware: User authenticated:', user.username)
          }
        }
      } catch (err) {
        console.error('[HEXGRID] Middleware: Token verification failed:', err)
      }
    }
    next() // Always allow connection, just won't have userId for guests
  })

  io.on('connection', (socket: Socket) => {
    console.log('[HEXGRID] Socket connected:', socket.id, '- userId:', (socket as any).userId)

    // Hexgrid event handlers
    socket.on('hexgrid:join', (data: { lobbyId: string }) => {
      console.log('[HEXGRID] Join request from', socket.id, '- userId:', (socket as any).userId)

      // Only allow authenticated users
      if (!(socket as any).userId) {
        console.log('[HEXGRID] Join rejected: not authenticated')
        socket.emit('hexgrid:error', { message: 'Authentication required' })
        return
      }

      if (mainLobby.realPlayerCount >= MAX_PLAYERS && !mainLobby.spectators.has(socket.id)) {
        console.log('[HEXGRID] Join rejected: lobby full')
        socket.emit('hexgrid:error', { message: 'Lobby is full' })
        return
      }

      console.log('[HEXGRID] Join accepted, handling join...')
      handleJoin(socket, data.lobbyId || 'main')
    })

    socket.on('hexgrid:move', (data: { direction: HexDirection }) => {
      handleMove(socket, data.direction)
    })

    socket.on('hexgrid:leave', () => {
      handleLeave(socket)
    })

    socket.on('disconnect', () => {
      handleLeave(socket)
    })
  })

  console.log('HEXGRID socket handlers initialized')
}

// Export lobby status for external queries
export function getHexgridLobbyStatus(): {
  lobbyId: string
  playerCount: number
  maxPlayers: number
  status: string
} {
  return {
    lobbyId: mainLobby.id,
    playerCount: mainLobby.realPlayerCount,
    maxPlayers: MAX_PLAYERS,
    status: mainLobby.gameState.status,
  }
}
