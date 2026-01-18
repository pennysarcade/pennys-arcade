import { Server, Socket } from 'socket.io'
import { verifyToken, JWTPayload } from '../middleware/auth.js'
import { queryOne, execute } from '../db/schema.js'
import { broadcastHighScore } from './chat.js'
import {
  GameState,
  Player,
  Ball,
  Powerup,
  PlayerInput,
  StateUpdate,
  RoundEndData,
  createInitialGameState,
  createPlayer,
  createSpectator,
  generateId,
  getGuestAvatarColor,
  MAX_PLAYERS,
  TICK_RATE,
  TICK_INTERVAL,
  INACTIVITY_TIMEOUT,
  MAX_ROUND_TIME,
  PLAYER_PHASE_IN_DURATION,
  PADDLE_ARC_BASE,
  PADDLE_THICKNESS,
  PADDLE_SPEED,
  PADDLE_ACCELERATION,
  BALL_RADIUS,
  BALL_SPEED,
  SPAWN_INTERVAL,
  SPECIAL_BALL_RADIUS,
  SPECIAL_BALL_SPAWN_INTERVAL,
  SPECIAL_BALL_ACTIVE_DURATION,
  POWERUP_SPAWN_CHANCE,
  POWERUP_TYPES,
  WAVE_INTERVAL,
  WAVE_DURATION,
  WAVE_TYPES,
  WaveType,
  RING_SWITCH_DURATION
} from './orbitState.js'

// Global game state
let gameState: GameState = createInitialGameState()
let tickCounter = 0
let gameLoopInterval: NodeJS.Timeout | null = null
let ioInstance: Server | null = null

// === UTILITY FUNCTIONS ===

function normalizeAngle(angle: number): number {
  while (angle < -Math.PI) angle += Math.PI * 2
  while (angle > Math.PI) angle -= Math.PI * 2
  return angle
}

function angleDifference(a: number, b: number): number {
  return normalizeAngle(a - b)
}

function getRingRadius(ring: number): number {
  return ring === 0 ? gameState.arenaRadius : gameState.innerRadius
}

function getPlayerPaddleRadius(player: Player): number {
  if (player.ringSwitchProgress <= 0) {
    return getRingRadius(player.ring)
  }
  const fromRadius = getRingRadius(player.ringSwitchFrom)
  const toRadius = getRingRadius(player.ringSwitchTo)
  return fromRadius + (toRadius - fromRadius) * player.ringSwitchProgress
}

// Calculate spawn angle for a new player (find largest gap between existing players)
function calculateSpawnAngle(): number {
  const players = Array.from(gameState.players.values())
  if (players.length === 0) {
    return -Math.PI / 2 // Start at top
  }

  // Get all player angles sorted
  const angles = players.map(p => p.angle).sort((a, b) => a - b)

  // Find the largest gap
  let maxGap = 0
  let gapStart = angles[0]

  for (let i = 0; i < angles.length; i++) {
    const nextIndex = (i + 1) % angles.length
    let gap: number

    if (nextIndex === 0) {
      // Gap wrapping around from last to first
      gap = (Math.PI * 2) - angles[i] + angles[0] + Math.PI * 2
      if (gap > Math.PI * 2) gap -= Math.PI * 2
    } else {
      gap = angles[nextIndex] - angles[i]
    }

    if (gap > maxGap) {
      maxGap = gap
      gapStart = angles[i]
    }
  }

  // Return the middle of the largest gap
  return normalizeAngle(gapStart + maxGap / 2)
}

// === COLLISION DETECTION ===

function checkPaddleCollision(
  player: Player,
  ballX: number,
  ballY: number,
  ballRadius: number
): { hit: boolean; edgeHit: boolean; deflectAngle: number } {
  // Skip during phase transition
  if (player.ringSwitchProgress > 0 && player.ringSwitchProgress < 1) {
    return { hit: false, edgeHit: false, deflectAngle: 0 }
  }

  const dx = ballX - gameState.centerX
  const dy = ballY - gameState.centerY
  const dist = Math.sqrt(dx * dx + dy * dy)
  const ballAngle = Math.atan2(dy, dx)

  const paddleRadius = getPlayerPaddleRadius(player)
  const halfThickness = PADDLE_THICKNESS / 2
  const paddleArc = player.paddleArc

  // Check main arc collision
  const angleToPaddle = angleDifference(ballAngle, player.angle)
  const withinArc = Math.abs(angleToPaddle) <= paddleArc / 2
  const withinRadius = dist >= paddleRadius - halfThickness - ballRadius &&
                       dist <= paddleRadius + halfThickness + ballRadius

  if (withinArc && withinRadius) {
    const edgeFactor = Math.abs(angleToPaddle) / (paddleArc / 2)
    const deflectAngle = ballAngle + Math.PI + (angleToPaddle * edgeFactor * 0.5)
    return { hit: true, edgeHit: false, deflectAngle }
  }

  // Check end caps
  const paddleStart = player.angle - paddleArc / 2
  const paddleEnd = player.angle + paddleArc / 2

  const startCapX = gameState.centerX + Math.cos(paddleStart) * paddleRadius
  const startCapY = gameState.centerY + Math.sin(paddleStart) * paddleRadius
  const distStart = Math.sqrt((ballX - startCapX) ** 2 + (ballY - startCapY) ** 2)

  if (distStart <= halfThickness + ballRadius) {
    return {
      hit: true,
      edgeHit: true,
      deflectAngle: Math.atan2(ballY - startCapY, ballX - startCapX)
    }
  }

  const endCapX = gameState.centerX + Math.cos(paddleEnd) * paddleRadius
  const endCapY = gameState.centerY + Math.sin(paddleEnd) * paddleRadius
  const distEnd = Math.sqrt((ballX - endCapX) ** 2 + (ballY - endCapY) ** 2)

  if (distEnd <= halfThickness + ballRadius) {
    return {
      hit: true,
      edgeHit: true,
      deflectAngle: Math.atan2(ballY - endCapY, ballX - endCapX)
    }
  }

  return { hit: false, edgeHit: false, deflectAngle: 0 }
}

function checkAnyPaddleCollision(
  ballX: number,
  ballY: number,
  ballRadius: number
): { hit: boolean; player: Player | null; edgeHit: boolean; deflectAngle: number } {
  for (const player of gameState.players.values()) {
    if (player.isSpectator || player.phaseInProgress < 1) continue

    const result = checkPaddleCollision(player, ballX, ballY, ballRadius)
    if (result.hit) {
      return { ...result, player }
    }
  }
  return { hit: false, player: null, edgeHit: false, deflectAngle: 0 }
}

function checkPaddleArcsOverlap(angle1: number, angle2: number, arcWidth: number): boolean {
  const diff = Math.abs(angleDifference(angle1, angle2))
  return diff < arcWidth
}

// === BALL MANAGEMENT ===

function spawnBall(): void {
  const angle = Math.random() * Math.PI * 2
  const waveSpeed = getWaveBallSpeed()

  const ball: Ball = {
    id: generateId(),
    x: gameState.centerX,
    y: gameState.centerY,
    vx: Math.cos(angle) * BALL_SPEED * waveSpeed,
    vy: Math.sin(angle) * BALL_SPEED * waveSpeed,
    baseRadius: BALL_RADIUS,
    spawnProgress: 0,
    age: 0,
    speedMult: 1,
    hitCooldown: 0,
    escaped: false,
    spin: 0,
    isSpecial: false
  }

  gameState.balls.push(ball)
}

function spawnSpecialBall(): void {
  const angle = Math.random() * Math.PI * 2
  const speed = BALL_SPEED * 0.8

  gameState.specialBall = {
    id: generateId(),
    x: gameState.centerX,
    y: gameState.centerY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    baseRadius: SPECIAL_BALL_RADIUS,
    spawnProgress: 0,
    shrinkProgress: 0,
    age: 0,
    speedMult: 1,
    hitCooldown: 0,
    escaped: false,
    spin: 0,
    isSpecial: true,
    returnTime: 0
  }

  gameState.specialBallActiveTime = 0
  gameState.specialBallReadyToReturn = false
  gameState.specialBallReturning = false

  // Broadcast special ball spawn
  ioInstance?.to('orbit').emit('orbit:special_ball_spawn')
}

function spawnPowerup(): void {
  const types = Object.keys(POWERUP_TYPES)
  const type = types[Math.floor(Math.random() * types.length)]
  const angle = Math.random() * Math.PI * 2

  const powerup: Powerup = {
    id: generateId(),
    x: gameState.centerX,
    y: gameState.centerY,
    vx: Math.cos(angle) * BALL_SPEED * 0.7,
    vy: Math.sin(angle) * BALL_SPEED * 0.7,
    type,
    spawnProgress: 0
  }

  gameState.powerups.push(powerup)
}

// === WAVE SYSTEM ===

function startWave(): void {
  gameState.currentWave++
  gameState.waveActive = true
  gameState.waveTimer = 0

  if (gameState.currentWave % 4 === 0) {
    gameState.waveType = 'BOSS'
  } else {
    const idx = Math.floor(Math.random() * 3)
    gameState.waveType = WAVE_TYPES[idx]
  }

  // Broadcast wave start
  ioInstance?.to('orbit').emit('orbit:wave_start', {
    wave: gameState.currentWave,
    type: gameState.waveType
  })
}

function getWaveSpawnRate(): number {
  if (!gameState.waveActive) return 1

  switch (gameState.waveType) {
    case 'SWARM': return 3
    case 'RAPID': return 2.5
    case 'CHAOS': return 2
    case 'BOSS': return 0.5
    default: return 1
  }
}

function getWaveBallSpeed(): number {
  if (!gameState.waveActive) return 1

  switch (gameState.waveType) {
    case 'RAPID': return 1.5
    case 'CHAOS': return 1.3
    default: return 1
  }
}

// === SCORING ===

function calculateHitScore(player: Player, ball: Ball, edgeHit: boolean): number {
  let baseScore = 10

  // Age bonus (older balls worth more)
  const ageBonus = Math.min(40, Math.floor((ball.age / 12) * 40))
  baseScore += ageBonus

  // Edge hit bonus
  if (edgeHit) baseScore += 15

  // Speed bonus
  const speedBonus = Math.min(25, Math.floor(Math.abs(player.velocity) / PADDLE_SPEED * 25))
  baseScore += speedBonus

  // Combo multiplier
  const comboMult = 1 + player.combo * 0.1

  // Powerup multiplier
  let pointsMult = 1
  for (const pu of player.activePowerups) {
    if (pu.type === 'POINTS') {
      pointsMult *= POWERUP_TYPES.POINTS.pointsMult || 2
    }
  }

  return Math.floor(baseScore * comboMult * pointsMult)
}

// === ROUND MANAGEMENT ===

async function endRound(reason: 'special_ball_escaped' | 'timeout'): Promise<void> {
  // Collect scores
  const scores: RoundEndData['scores'] = []
  for (const player of gameState.players.values()) {
    scores.push({
      playerId: player.id,
      username: player.username,
      avatarColor: player.avatarColor,
      score: player.score,
      isGuest: player.isGuest
    })
  }

  // Sort by score
  scores.sort((a, b) => b.score - a.score)

  const roundData: RoundEndData = {
    roundNumber: gameState.roundNumber,
    duration: (Date.now() - gameState.roundStartTime) / 1000,
    scores,
    reason
  }

  // Broadcast round end
  ioInstance?.to('orbit').emit('orbit:round_end', roundData)

  // Save scores for registered users
  for (const playerScore of scores) {
    if (!playerScore.isGuest && playerScore.score > 0) {
      const player = gameState.players.get(playerScore.playerId)
      if (player?.userId) {
        await saveScore(player.userId, player.username, player.avatarColor, playerScore.score, {
          ballsHit: player.ballsHit,
          maxCombo: player.combo
        })
      }
    }
  }

  // Reset game state for new round
  setTimeout(() => {
    startNewRound()
  }, 3000) // 3 second delay before new round
}

function startNewRound(): void {
  gameState.roundNumber++
  gameState.roundStartTime = Date.now()
  gameState.gameTime = 0
  gameState.balls = []
  gameState.powerups = []
  gameState.specialBall = null
  gameState.specialBallTimer = 0
  gameState.currentWave = 0
  gameState.waveTimer = 0
  gameState.waveActive = false
  gameState.waveType = 'NORMAL'
  gameState.spawnTimer = 0

  // Reset player scores but keep positions
  for (const player of gameState.players.values()) {
    player.score = 0
    player.combo = 0
    player.lastHitTime = 0
    player.ballsHit = 0
    player.powerupsCollected = 0
    player.activePowerups = []
    player.paddleArc = PADDLE_ARC_BASE

    // Remove inactive players, promote spectators
    if (player.isInactive) {
      promoteSpectator(player.id)
    }
  }

  // Broadcast new round start
  ioInstance?.to('orbit').emit('orbit:round_start', {
    roundNumber: gameState.roundNumber
  })
}

async function saveScore(
  userId: number,
  username: string,
  avatarColor: string,
  score: number,
  stats: { ballsHit: number; maxCombo: number }
): Promise<void> {
  try {
    // Check current high score
    const currentHigh = await queryOne<{ score: number; username: string }>(
      `SELECT score, username FROM high_scores
       WHERE game_id = 'orbit'
       ORDER BY score DESC LIMIT 1`
    )

    // Check personal best
    const personalBest = await queryOne<{ score: number }>(
      `SELECT score FROM high_scores
       WHERE game_id = 'orbit' AND user_id = $1
       ORDER BY score DESC LIMIT 1`,
      [userId]
    )

    // Only save if it's a personal best
    if (!personalBest || score > personalBest.score) {
      await execute(
        `INSERT INTO high_scores (user_id, username, avatar_color, game_id, score, stats)
         VALUES ($1, $2, $3, 'orbit', $4, $5)`,
        [userId, username, avatarColor, score, JSON.stringify(stats)]
      )

      // Check if new global high score
      if (!currentHigh || score > currentHigh.score) {
        broadcastHighScore(username, 'Orbit', score)
      }
    }
  } catch (error) {
    console.error('[ORBIT] Failed to save score:', error)
  }
}

// === PLAYER MANAGEMENT ===

function promoteSpectator(removePlayerId?: string): void {
  if (removePlayerId) {
    gameState.players.delete(removePlayerId)
  }

  // Find earliest spectator
  let earliestSpectator = null
  let earliestTime = Infinity

  for (const spectator of gameState.spectators.values()) {
    if (spectator.joinedQueueAt < earliestTime) {
      earliestTime = spectator.joinedQueueAt
      earliestSpectator = spectator
    }
  }

  if (earliestSpectator && gameState.players.size < MAX_PLAYERS) {
    // Remove from spectators
    gameState.spectators.delete(earliestSpectator.id)

    // Create player
    const spawnAngle = calculateSpawnAngle()
    const player = createPlayer(
      earliestSpectator.id,
      earliestSpectator.socketId,
      earliestSpectator.username,
      earliestSpectator.avatarColor,
      earliestSpectator.isGuest,
      earliestSpectator.userId,
      spawnAngle
    )

    gameState.players.set(player.id, player)

    // Notify promoted player
    ioInstance?.to(earliestSpectator.socketId).emit('orbit:promoted', {
      playerId: player.id,
      angle: player.angle
    })
  }
}

// === GAME LOOP ===

function gameLoop(): void {
  const dt = 1 / TICK_RATE
  tickCounter++

  gameState.gameTime += dt

  // Update players
  updatePlayers(dt)

  // Update ball spawning
  gameState.spawnTimer += dt * 1000
  const spawnRate = getWaveSpawnRate()
  const adjustedInterval = SPAWN_INTERVAL / spawnRate

  if (gameState.spawnTimer >= adjustedInterval) {
    gameState.spawnTimer = 0

    // Spawn powerup or ball
    if (Math.random() < POWERUP_SPAWN_CHANCE) {
      spawnPowerup()
    } else {
      spawnBall()
    }
  }

  // Update special ball timer
  if (!gameState.specialBall) {
    gameState.specialBallTimer += dt
    if (gameState.specialBallTimer >= SPECIAL_BALL_SPAWN_INTERVAL) {
      gameState.specialBallTimer = 0
      spawnSpecialBall()
    }
  }

  // Update wave system
  if (!gameState.waveActive) {
    gameState.waveTimer += dt
    if (gameState.waveTimer >= WAVE_INTERVAL && gameState.gameTime > 20) {
      startWave()
    }
  } else {
    gameState.waveTimer += dt
    if (gameState.waveTimer >= WAVE_DURATION) {
      gameState.waveActive = false
      gameState.waveTimer = 0
    }
  }

  // Update balls
  updateBalls(dt)

  // Update powerups
  updatePowerups(dt)

  // Update special ball
  updateSpecialBall(dt)

  // Check inactivity
  checkInactivity()

  // Check round timeout
  if (Date.now() - gameState.roundStartTime >= MAX_ROUND_TIME) {
    endRound('timeout')
    return
  }

  // Send state update to all clients
  broadcastStateUpdate()
}

function updatePlayers(dt: number): void {
  for (const player of gameState.players.values()) {
    if (player.isSpectator) continue

    // Update phase-in animation
    if (player.phaseInProgress < 1) {
      player.phaseInProgress = Math.min(1, player.phaseInProgress + dt / (PLAYER_PHASE_IN_DURATION / 1000))
    }

    // Update ring switch
    if (player.ringSwitchProgress > 0) {
      player.ringSwitchProgress += dt / RING_SWITCH_DURATION
      if (player.ringSwitchProgress >= 1) {
        player.ringSwitchProgress = 0
        player.ring = player.ringSwitchTo
      }
    }

    // Update paddle arc based on powerups
    let targetArc = PADDLE_ARC_BASE
    const now = Date.now()
    player.activePowerups = player.activePowerups.filter(pu => pu.endTime > now)

    for (const pu of player.activePowerups) {
      const type = POWERUP_TYPES[pu.type]
      if (type?.arcBonus) {
        targetArc += type.arcBonus
      }
    }
    targetArc = Math.max(0.08, targetArc)

    // Smooth arc transition
    const arcDiff = targetArc - player.paddleArc
    player.paddleArc += arcDiff * Math.min(1, 4 * dt)

    // Update combo timeout
    if (player.combo > 0 && gameState.gameTime - player.lastHitTime > 3) {
      player.combo = Math.max(0, player.combo - 1)
    }
  }
}

function updateBalls(dt: number): void {
  const ballSpeedMult = 1 // Could be modified by global powerups

  for (let i = gameState.balls.length - 1; i >= 0; i--) {
    const ball = gameState.balls[i]

    // Update spawn animation
    if (ball.spawnProgress < 1) {
      ball.spawnProgress = Math.min(1, ball.spawnProgress + dt / 0.4)
    }

    // Update age
    ball.age += dt

    // Update hit cooldown
    if (ball.hitCooldown > 0) {
      ball.hitCooldown -= dt
    }

    // Apply spin (curved trajectory)
    if (ball.spin !== 0) {
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy)
      const angle = Math.atan2(ball.vy, ball.vx) + ball.spin * dt
      ball.vx = Math.cos(angle) * speed
      ball.vy = Math.sin(angle) * speed
      ball.spin *= Math.pow(0.75, dt) // Decay spin
    }

    // Update position
    const effectiveSpeed = ball.speedMult * ballSpeedMult
    ball.x += ball.vx * effectiveSpeed * dt
    ball.y += ball.vy * effectiveSpeed * dt

    // Decay momentum
    if (ball.speedMult > 1) {
      ball.speedMult = Math.max(1, ball.speedMult - 0.3 * dt)
    }

    // Check collision with paddles
    if (ball.hitCooldown <= 0) {
      const currentRadius = ball.baseRadius * ball.spawnProgress
      const collision = checkAnyPaddleCollision(ball.x, ball.y, currentRadius)

      if (collision.hit && collision.player) {
        const player = collision.player

        // Deflect ball
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy)
        ball.vx = Math.cos(collision.deflectAngle) * speed
        ball.vy = Math.sin(collision.deflectAngle) * speed

        // Add momentum from paddle
        const momentumBoost = 1 + Math.abs(player.velocity) / PADDLE_SPEED * 0.8
        ball.speedMult = Math.min(1.8, ball.speedMult * momentumBoost)

        // Score
        const points = calculateHitScore(player, ball, collision.edgeHit)
        player.score += points
        player.combo++
        player.lastHitTime = gameState.gameTime
        player.ballsHit++

        // Cooldown
        ball.hitCooldown = 0.1

        // Broadcast hit event
        ioInstance?.to('orbit').emit('orbit:ball_hit', {
          playerId: player.id,
          ballId: ball.id,
          points,
          combo: player.combo,
          x: ball.x,
          y: ball.y
        })
      }
    }

    // Check if ball escaped
    const dx = ball.x - gameState.centerX
    const dy = ball.y - gameState.centerY
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > gameState.arenaRadius + ball.baseRadius * 2) {
      ball.escaped = true
      gameState.balls.splice(i, 1)
    }
  }
}

function updatePowerups(dt: number): void {
  for (let i = gameState.powerups.length - 1; i >= 0; i--) {
    const powerup = gameState.powerups[i]

    // Update spawn animation
    if (powerup.spawnProgress < 1) {
      powerup.spawnProgress = Math.min(1, powerup.spawnProgress + dt / 0.4)
    }

    // Update position
    powerup.x += powerup.vx * dt
    powerup.y += powerup.vy * dt

    // Check collision with paddles
    const collision = checkAnyPaddleCollision(powerup.x, powerup.y, 10)
    if (collision.hit && collision.player) {
      const player = collision.player
      const type = POWERUP_TYPES[powerup.type]

      // Activate powerup
      player.activePowerups.push({
        type: powerup.type,
        endTime: Date.now() + type.duration * 1000,
        playerId: player.id
      })
      player.powerupsCollected++

      // Broadcast powerup collected
      ioInstance?.to('orbit').emit('orbit:powerup_collected', {
        playerId: player.id,
        powerupId: powerup.id,
        type: powerup.type,
        isNegative: type.negative
      })

      gameState.powerups.splice(i, 1)
      continue
    }

    // Check if escaped
    const dx = powerup.x - gameState.centerX
    const dy = powerup.y - gameState.centerY
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > gameState.arenaRadius + 20) {
      gameState.powerups.splice(i, 1)
    }
  }
}

function updateSpecialBall(dt: number): void {
  if (!gameState.specialBall) return

  const ball = gameState.specialBall

  // Update spawn animation
  if (ball.spawnProgress < 1) {
    ball.spawnProgress = Math.min(1, ball.spawnProgress + dt / 0.4)
  }

  gameState.specialBallActiveTime += dt

  // Check if should start returning
  if (gameState.specialBallActiveTime >= SPECIAL_BALL_ACTIVE_DURATION && !gameState.specialBallReturning) {
    gameState.specialBallReadyToReturn = true
  }

  // Update hit cooldown
  if (ball.hitCooldown > 0) {
    ball.hitCooldown -= dt
  }

  // Apply spin
  if (ball.spin !== 0) {
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy)
    const angle = Math.atan2(ball.vy, ball.vx) + ball.spin * dt
    ball.vx = Math.cos(angle) * speed
    ball.vy = Math.sin(angle) * speed
    ball.spin *= Math.pow(0.75, dt)
  }

  // Update position
  ball.x += ball.vx * ball.speedMult * dt
  ball.y += ball.vy * ball.speedMult * dt

  // Apply gravity when returning
  if (gameState.specialBallReturning) {
    const dx = gameState.centerX - ball.x
    const dy = gameState.centerY - ball.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > 0) {
      const gravityStrength = 120
      ball.vx += (dx / dist) * gravityStrength * dt
      ball.vy += (dy / dist) * gravityStrength * dt
    }

    // Check capture
    if (dist < 15) {
      // Ball captured successfully
      ioInstance?.to('orbit').emit('orbit:special_ball_captured')
      gameState.specialBall = null
      return
    }
  }

  // Check collision with paddles
  if (ball.hitCooldown <= 0) {
    const currentRadius = ball.baseRadius * ball.spawnProgress
    const collision = checkAnyPaddleCollision(ball.x, ball.y, currentRadius)

    if (collision.hit && collision.player) {
      const player = collision.player

      // Deflect ball
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy)
      ball.vx = Math.cos(collision.deflectAngle) * speed
      ball.vy = Math.sin(collision.deflectAngle) * speed

      // Add momentum
      const momentumBoost = 1 + Math.abs(player.velocity) / PADDLE_SPEED * 0.8
      ball.speedMult = Math.min(1.8, ball.speedMult * momentumBoost)

      // Bonus points for special ball
      const points = 50 + Math.floor(gameState.specialBallActiveTime * 5)
      player.score += points
      player.combo++
      player.lastHitTime = gameState.gameTime
      player.ballsHit++

      ball.hitCooldown = 0.1

      // If ready to return, start returning
      if (gameState.specialBallReadyToReturn && !gameState.specialBallReturning) {
        gameState.specialBallReturning = true
        ioInstance?.to('orbit').emit('orbit:special_ball_returning')
      }

      // Broadcast hit
      ioInstance?.to('orbit').emit('orbit:special_ball_hit', {
        playerId: player.id,
        points,
        combo: player.combo
      })
    }
  }

  // Check if escaped (game over condition)
  const dx = ball.x - gameState.centerX
  const dy = ball.y - gameState.centerY
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist > gameState.arenaRadius + ball.baseRadius * 2) {
    // Special ball escaped - round over
    ioInstance?.to('orbit').emit('orbit:special_ball_escaped')
    gameState.specialBall = null
    endRound('special_ball_escaped')
  }
}

function checkInactivity(): void {
  const now = Date.now()

  for (const player of gameState.players.values()) {
    if (player.isSpectator) continue

    const inactiveTime = now - player.lastInputTime
    if (inactiveTime >= INACTIVITY_TIMEOUT && !player.isInactive) {
      player.isInactive = true

      // Notify player they're marked inactive
      ioInstance?.to(player.socketId).emit('orbit:inactive_warning')
    }
  }
}

function broadcastStateUpdate(): void {
  const players: StateUpdate['players'] = {}

  for (const [id, player] of gameState.players) {
    if (player.isSpectator) continue
    players[id] = {
      angle: player.angle,
      velocity: player.velocity,
      ring: player.ring,
      ringSwitchProgress: player.ringSwitchProgress,
      score: player.score,
      combo: player.combo,
      isInactive: player.isInactive,
      username: player.username,
      avatarColor: player.avatarColor,
      paddleArc: player.paddleArc,
      phaseInProgress: player.phaseInProgress
    }
  }

  const balls: StateUpdate['balls'] = gameState.balls.map(ball => ({
    id: ball.id,
    x: ball.x,
    y: ball.y,
    vx: ball.vx,
    vy: ball.vy,
    radius: ball.baseRadius * ball.spawnProgress,
    isSpecial: false,
    age: ball.age,
    spawnProgress: ball.spawnProgress
  }))

  // Add special ball if exists
  if (gameState.specialBall) {
    balls.push({
      id: gameState.specialBall.id,
      x: gameState.specialBall.x,
      y: gameState.specialBall.y,
      vx: gameState.specialBall.vx,
      vy: gameState.specialBall.vy,
      radius: gameState.specialBall.baseRadius * gameState.specialBall.spawnProgress,
      isSpecial: true,
      age: gameState.specialBall.age,
      spawnProgress: gameState.specialBall.spawnProgress
    })
  }

  const powerups: StateUpdate['powerups'] = gameState.powerups.map(p => ({
    id: p.id,
    x: p.x,
    y: p.y,
    type: p.type,
    spawnProgress: p.spawnProgress
  }))

  const update: StateUpdate = {
    tick: tickCounter,
    gameTime: gameState.gameTime,
    roundNumber: gameState.roundNumber,
    players,
    balls,
    powerups,
    waveActive: gameState.waveActive,
    waveType: gameState.waveType,
    specialBallReturning: gameState.specialBallReturning
  }

  ioInstance?.to('orbit').emit('orbit:state', update)
}

// === SOCKET HANDLERS ===

export async function setupOrbitSocket(io: Server): Promise<void> {
  ioInstance = io
  console.log('[ORBIT] Setting up Orbit multiplayer socket handlers')

  // Start game loop
  if (!gameLoopInterval) {
    gameLoopInterval = setInterval(gameLoop, TICK_INTERVAL)
    console.log(`[ORBIT] Game loop started at ${TICK_RATE}Hz`)
  }

  io.on('connection', async (socket: Socket) => {
    // Only handle orbit namespace messages
    socket.on('orbit:join', async (data: { token?: string }) => {
      await handleJoin(socket, data.token)
    })

    socket.on('orbit:input', (data: PlayerInput) => {
      handleInput(socket, data)
    })

    socket.on('orbit:leave', () => {
      handleLeave(socket)
    })

    socket.on('disconnect', () => {
      handleLeave(socket)
    })
  })
}

async function handleJoin(socket: Socket, token?: string): Promise<void> {
  const playerId = generateId()
  let username = `n00b_${Math.floor(Math.random() * 10000)}`
  let avatarColor = getGuestAvatarColor(playerId) // Use consistent color based on ID
  let isGuest = true
  let userId: number | null = null

  // Authenticate if token provided
  if (token) {
    const payload = verifyToken(token) as JWTPayload | null
    if (payload) {
      const user = await queryOne<{ username: string; avatar_color: string }>(
        'SELECT username, avatar_color FROM users WHERE id = $1',
        [payload.userId]
      )
      if (user) {
        username = user.username
        avatarColor = user.avatar_color || '#00ffff'
        isGuest = false
        userId = payload.userId
      }
    }
  }

  // Join the orbit room
  socket.join('orbit')

  // Check if can be player or spectator
  if (gameState.players.size < MAX_PLAYERS) {
    const spawnAngle = calculateSpawnAngle()
    const player = createPlayer(
      playerId,
      socket.id,
      username,
      avatarColor,
      isGuest,
      userId,
      spawnAngle
    )

    gameState.players.set(playerId, player)

    socket.emit('orbit:joined', {
      playerId,
      isSpectator: false,
      angle: spawnAngle,
      roundNumber: gameState.roundNumber,
      gameTime: gameState.gameTime
    })

    console.log(`[ORBIT] Player joined: ${username} (${playerId})`)
  } else {
    // Add as spectator
    const spectator = createSpectator(
      playerId,
      socket.id,
      username,
      avatarColor,
      isGuest,
      userId
    )

    gameState.spectators.set(playerId, spectator)

    socket.emit('orbit:joined', {
      playerId,
      isSpectator: true,
      queuePosition: gameState.spectators.size,
      roundNumber: gameState.roundNumber,
      gameTime: gameState.gameTime
    })

    console.log(`[ORBIT] Spectator joined: ${username} (${playerId})`)
  }
}

function handleInput(socket: Socket, data: PlayerInput): void {
  // Find player by socket id
  let player: Player | undefined

  for (const p of gameState.players.values()) {
    if (p.socketId === socket.id) {
      player = p
      break
    }
  }

  if (!player || player.isSpectator) return

  // Update last input time
  player.lastInputTime = Date.now()
  player.isInactive = false

  // Validate sequence
  if (data.seq <= player.lastInputSeq) return
  player.lastInputSeq = data.seq

  // Update target angle from drag input
  if (data.angle !== undefined) {
    player.targetAngle = data.angle
  }

  // Apply velocity-based movement (WASD-style)
  if (data.velocity !== undefined) {
    const desiredDir = Math.sign(data.velocity)
    const maxSpeed = PADDLE_SPEED

    if (desiredDir !== 0) {
      const currentDir = Math.sign(player.velocity)
      const accel = PADDLE_ACCELERATION * (1 / TICK_RATE)

      if (currentDir === desiredDir || currentDir === 0) {
        player.velocity += desiredDir * accel
      } else {
        // Reversing - use higher deceleration
        player.velocity += desiredDir * accel * 2.5
      }

      player.velocity = Math.max(-maxSpeed, Math.min(maxSpeed, player.velocity))
    }
  } else if (data.angle !== undefined) {
    // Drag-based movement - smoothly move toward target
    const angleDiff = angleDifference(player.targetAngle, player.angle)
    const maxSpeed = PADDLE_SPEED

    if (Math.abs(angleDiff) > 0.05) {
      const desiredDir = Math.sign(angleDiff)
      const currentDir = Math.sign(player.velocity)
      const accel = PADDLE_ACCELERATION * (1 / TICK_RATE)

      if (currentDir === desiredDir || currentDir === 0) {
        player.velocity += desiredDir * accel
      } else {
        player.velocity += desiredDir * accel * 2.5
      }

      player.velocity = Math.max(-maxSpeed, Math.min(maxSpeed, player.velocity))
    } else {
      player.velocity *= 0.9
    }
  }

  // Apply velocity to position
  player.angle += player.velocity * (1 / TICK_RATE)
  player.angle = normalizeAngle(player.angle)

  // Handle ring switch request
  if (data.ringSwitch && player.ringSwitchProgress <= 0) {
    const targetRing = player.ring === 0 ? 1 : 0

    // Check if blocked by another player
    let blocked = false
    for (const other of gameState.players.values()) {
      if (other.id === player.id || other.isSpectator) continue

      const otherRing = other.ringSwitchProgress > 0.5 ? other.ringSwitchTo : other.ring
      if (otherRing === targetRing) {
        if (checkPaddleArcsOverlap(player.angle, other.angle, player.paddleArc)) {
          blocked = true
          break
        }
      }
    }

    if (!blocked) {
      player.ringSwitchFrom = player.ring
      player.ringSwitchTo = targetRing
      player.ringSwitchProgress = 0.001
    } else {
      socket.emit('orbit:ring_switch_blocked')
    }
  }
}

function handleLeave(socket: Socket): void {
  // Find and remove player
  for (const [id, player] of gameState.players) {
    if (player.socketId === socket.id) {
      console.log(`[ORBIT] Player left: ${player.username} (${id})`)
      gameState.players.delete(id)
      promoteSpectator()
      return
    }
  }

  // Check spectators
  for (const [id, spectator] of gameState.spectators) {
    if (spectator.socketId === socket.id) {
      console.log(`[ORBIT] Spectator left: ${spectator.username} (${id})`)
      gameState.spectators.delete(id)
      return
    }
  }
}
