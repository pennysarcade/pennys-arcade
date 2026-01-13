import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query, queryOne, execute, HighScore, User, GameSession } from '../db/schema.js'
import { authenticateToken } from '../middleware/auth.js'
import { broadcastHighScore } from '../socket/chat.js'

const router = Router()

// Rate limit for high score announcements (10 minutes per game)
const lastHighScoreAnnouncement = new Map<string, number>()
const HIGH_SCORE_ANNOUNCEMENT_COOLDOWN = 10 * 60 * 1000 // 10 minutes

// Game display names
const GAME_NAMES: Record<string, string> = {
  'onzac': 'ONZAC',
  'tessles': 'Tessles',
}

// Games excluded from leaderboard (offline/deprecated)
const EXCLUDED_GAMES = ['hexgrid']

function canAnnounceHighScore(gameId: string): boolean {
  const lastTime = lastHighScoreAnnouncement.get(gameId) || 0
  return Date.now() - lastTime >= HIGH_SCORE_ANNOUNCEMENT_COOLDOWN
}

function markHighScoreAnnounced(gameId: string): void {
  lastHighScoreAnnouncement.set(gameId, Date.now())
}

// ============================================
// SPECIFIC ROUTES (must come before /:gameId)
// ============================================

// Get all high scores across all games (public)
router.get('/', async (_req, res) => {
  try {
    // Get top score for each game, using current username from users table
    // Excludes offline/deprecated games
    const scores = await query<HighScore>(`
      SELECT h1.id, COALESCE(u.username, h1.username) as username,
             COALESCE(u.avatar_color, h1.avatar_color) as avatar_color,
             u.avatar_image,
             h1.game_id, h1.score, h1.stats, h1.platform, h1.created_at
      FROM high_scores h1
      LEFT JOIN users u ON h1.user_id = u.id
      INNER JOIN (
        SELECT game_id, MAX(score) as max_score
        FROM high_scores
        WHERE game_id NOT IN (${EXCLUDED_GAMES.map((_, i) => `$${i + 1}`).join(', ')})
        GROUP BY game_id
      ) h2 ON h1.game_id = h2.game_id AND h1.score = h2.max_score
      ORDER BY h1.score DESC
    `, EXCLUDED_GAMES)

    res.json({ scores })
  } catch (error) {
    console.error('Get all scores error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Get user's personal best scores (authenticated)
router.get('/user/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.userId

    const scores = await query<{ game_id: string; score: number; plays: string }>(`
      SELECT game_id, MAX(score) as score, COUNT(*) as plays
      FROM high_scores
      WHERE user_id = $1
      GROUP BY game_id
      ORDER BY score DESC
    `, [userId])

    res.json({ scores })
  } catch (error) {
    console.error('Get user scores error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Get user's recent game sessions (authenticated)
router.get('/sessions/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.userId
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)

    const sessions = await query<GameSession>(`
      SELECT id, game_id, score, status, stats, started_at, ended_at
      FROM game_sessions
      WHERE user_id = $1
      ORDER BY started_at DESC
      LIMIT $2
    `, [userId, limit])

    res.json({ sessions })
  } catch (error) {
    console.error('Get user sessions error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Start a game session (authenticated users only)
router.post('/session/start/:gameId', authenticateToken, async (req, res) => {
  try {
    const { gameId } = req.params
    const { platform } = req.body  // 'desktop' or 'mobile'
    const userId = req.user!.userId

    console.log(`[SESSION] Starting game: ${gameId} for user ${userId} on ${platform || 'desktop'}`)

    const result = await queryOne<{ id: number }>(`
      INSERT INTO game_sessions (user_id, game_id, status, platform)
      VALUES ($1, $2, 'playing', $3)
      RETURNING id
    `, [userId, gameId, platform || 'desktop'])

    console.log(`[SESSION] Created session ${result!.id}`)

    res.status(201).json({
      sessionId: result!.id,
      gameId,
      status: 'playing'
    })
  } catch (error) {
    console.error('[SESSION] Start error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Update session score without ending (for periodic saves)
router.post('/session/update/:sessionId', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId)
    const { score, stats } = req.body
    const userId = req.user!.userId

    // Verify the session belongs to this user and is still playing
    const session = await queryOne<GameSession>(
      'SELECT * FROM game_sessions WHERE id = $1 AND user_id = $2 AND status = $3',
      [sessionId, userId, 'playing']
    )

    if (!session) {
      res.status(404).json({ message: 'Active session not found' })
      return
    }

    // Update the session score (keep status as 'playing')
    await execute(
      `UPDATE game_sessions SET score = $1, stats = $2 WHERE id = $3`,
      [score || 0, stats ? JSON.stringify(stats) : null, sessionId]
    )

    res.json({ success: true })
  } catch (error) {
    console.error('[SESSION] Update error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// End a game session with score (authenticated users only)
router.post('/session/end/:sessionId', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId)
    const { score, stats } = req.body
    const userId = req.user!.userId

    console.log(`[SESSION] Ending session ${sessionId} with score ${score}`)

    // Verify the session belongs to this user and is still playing
    const session = await queryOne<GameSession>(
      'SELECT * FROM game_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    )

    if (!session) {
      console.log(`[SESSION] Session ${sessionId} not found for user ${userId}`)
      res.status(404).json({ message: 'Session not found' })
      return
    }

    if (session.status !== 'playing') {
      console.log(`[SESSION] Session ${sessionId} already ended with status ${session.status}`)
      res.status(400).json({ message: 'Session already ended' })
      return
    }

    // Update the session
    await execute(
      `UPDATE game_sessions
       SET score = $1, status = 'completed', stats = $2, ended_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [score || 0, stats ? JSON.stringify(stats) : null, sessionId]
    )

    console.log(`[SESSION] Session ${sessionId} ended with score ${score}`)

    // Now also save to high_scores for leaderboard
    if (typeof score === 'number' && score > 0) {
      const user = await queryOne<User>(
        'SELECT username, avatar_color FROM users WHERE id = $1',
        [userId]
      )

      if (user) {
        // Use platform from the session
        const hsResult = await queryOne<{ id: number }>(`
          INSERT INTO high_scores (user_id, username, avatar_color, game_id, score, stats, platform)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [userId, user.username, user.avatar_color, session.game_id, score, stats ? JSON.stringify(stats) : null, session.platform || 'desktop'])

        console.log(`[SESSION] High score ${hsResult!.id} saved for session ${sessionId}`)

        // Get rank and personal best info
        const rank = await queryOne<{ rank: string }>(
          'SELECT COUNT(*) + 1 as rank FROM high_scores WHERE game_id = $1 AND score > $2',
          [session.game_id, score]
        )

        const personalBest = await queryOne<{ best: number | null }>(
          'SELECT MAX(score) as best FROM high_scores WHERE game_id = $1 AND user_id = $2 AND id != $3',
          [session.game_id, userId, hsResult!.id]
        )

        // Get high score for the game
        const highScore = await queryOne<{ score: number, username: string }>(
          'SELECT h.score, COALESCE(u.username, h.username) as username FROM high_scores h LEFT JOIN users u ON h.user_id = u.id WHERE h.game_id = $1 ORDER BY h.score DESC LIMIT 1',
          [session.game_id]
        )

        // Get total plays today
        const playsToday = await queryOne<{ count: string }>(
          "SELECT COUNT(*) as count FROM game_sessions WHERE game_id = $1 AND started_at >= CURRENT_DATE",
          [session.game_id]
        )

        // Get total unique players for this game
        const totalPlayers = await queryOne<{ count: string }>(
          'SELECT COUNT(DISTINCT user_id) as count FROM high_scores WHERE game_id = $1',
          [session.game_id]
        )

        const isPersonalBest = !personalBest?.best || score > personalBest.best
        const rankNum = parseInt(rank?.rank || '1')
        const isNewHighScore = rankNum === 1

        // Broadcast to chat if this is a new #1 high score
        if (isNewHighScore && canAnnounceHighScore(session.game_id)) {
          const gameName = GAME_NAMES[session.game_id] || session.game_id
          broadcastHighScore(user.username, gameName, score)
          markHighScoreAnnounced(session.game_id)
          console.log(`[SCORE] New #1 high score announced: ${user.username} - ${gameName} - ${score}`)
        }

        res.json({
          sessionId,
          highScoreId: hsResult!.id,
          score,
          rank: rankNum,
          isPersonalBest,
          isNewHighScore,
          highScore: highScore?.score || score,
          highScoreHolder: highScore?.username || user.username,
          playsToday: parseInt(playsToday?.count || '1'),
          totalPlayers: parseInt(totalPlayers?.count || '1'),
          pointsFromHighScore: (highScore?.score || score) - score,
          status: 'completed'
        })
        return
      }
    }

    res.json({
      sessionId,
      score: score || 0,
      status: 'completed'
    })
  } catch (error) {
    console.error('[SESSION] End error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// ============================================
// ADMIN ROUTES
// ============================================

// Admin: Get all scores with user info (for management)
router.get('/admin/all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.userId
    const user = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [userId])

    if (!user || user.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const gameId = req.query.gameId as string | undefined
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500)

    let scores
    if (gameId) {
      scores = await query<HighScore & { user_id: number }>(`
        SELECT h.id, h.user_id, COALESCE(u.username, h.username) as username,
               COALESCE(u.avatar_color, h.avatar_color) as avatar_color,
               h.game_id, h.score, h.stats, h.created_at
        FROM high_scores h
        LEFT JOIN users u ON h.user_id = u.id
        WHERE h.game_id = $1
        ORDER BY h.score DESC
        LIMIT $2
      `, [gameId, limit])
    } else {
      scores = await query<HighScore & { user_id: number }>(`
        SELECT h.id, h.user_id, COALESCE(u.username, h.username) as username,
               COALESCE(u.avatar_color, h.avatar_color) as avatar_color,
               h.game_id, h.score, h.stats, h.created_at
        FROM high_scores h
        LEFT JOIN users u ON h.user_id = u.id
        ORDER BY h.created_at DESC
        LIMIT $1
      `, [limit])
    }

    res.json({ scores })
  } catch (error) {
    console.error('Admin get all scores error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Delete individual score record
router.delete('/admin/score/:scoreId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.userId
    const scoreId = parseInt(req.params.scoreId)

    const user = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [userId])

    if (!user || user.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    // Get score info before deleting
    const score = await queryOne<HighScore>(
      'SELECT * FROM high_scores WHERE id = $1',
      [scoreId]
    )

    if (!score) {
      res.status(404).json({ message: 'Score not found' })
      return
    }

    await execute('DELETE FROM high_scores WHERE id = $1', [scoreId])

    console.log(`[ADMIN] Score ${scoreId} deleted by user ${userId} (${score.username} - ${score.game_id} - ${score.score})`)

    res.json({ message: 'Score deleted', deletedScore: score })
  } catch (error) {
    console.error('Admin delete score error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Wipe all scores for a specific game (requires password)
router.delete('/admin/game/:gameId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.userId
    const { gameId } = req.params
    const { password } = req.body

    if (!password) {
      res.status(400).json({ message: 'Password required for this operation' })
      return
    }

    const user = await queryOne<User>(
      'SELECT is_admin, password_hash FROM users WHERE id = $1',
      [userId]
    )

    if (!user || user.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    // Verify password
    if (!user.password_hash) {
      res.status(400).json({ message: 'Cannot verify password for this account' })
      return
    }

    const validPassword = await bcrypt.compare(password, user.password_hash)
    if (!validPassword) {
      res.status(401).json({ message: 'Invalid password' })
      return
    }

    // Count scores before deletion
    const countResult = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM high_scores WHERE game_id = $1',
      [gameId]
    )
    const scoreCount = parseInt(countResult?.count || '0')

    // Delete all scores for this game
    await execute('DELETE FROM high_scores WHERE game_id = $1', [gameId])

    // Also delete game sessions for this game
    await execute('DELETE FROM game_sessions WHERE game_id = $1', [gameId])

    console.log(`[ADMIN] All scores for game ${gameId} wiped by user ${userId} (${scoreCount} scores deleted)`)

    res.json({ message: `All scores for ${gameId} deleted`, deletedCount: scoreCount })
  } catch (error) {
    console.error('Admin wipe game scores error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Wipe ALL scores across ALL games (nuclear option, requires password)
router.delete('/admin/all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.userId
    const { password } = req.body

    if (!password) {
      res.status(400).json({ message: 'Password required for this operation' })
      return
    }

    const user = await queryOne<User>(
      'SELECT is_admin, password_hash FROM users WHERE id = $1',
      [userId]
    )

    if (!user || user.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    // Verify password
    if (!user.password_hash) {
      res.status(400).json({ message: 'Cannot verify password for this account' })
      return
    }

    const validPassword = await bcrypt.compare(password, user.password_hash)
    if (!validPassword) {
      res.status(401).json({ message: 'Invalid password' })
      return
    }

    // Count scores before deletion
    const countResult = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM high_scores'
    )
    const scoreCount = parseInt(countResult?.count || '0')

    // Delete ALL high scores
    await execute('DELETE FROM high_scores')

    // Delete ALL game sessions
    await execute('DELETE FROM game_sessions')

    console.log(`[ADMIN] ALL SCORES WIPED by user ${userId} (${scoreCount} scores deleted)`)

    res.json({ message: 'All scores across all games deleted', deletedCount: scoreCount })
  } catch (error) {
    console.error('Admin wipe all scores error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// ============================================
// PARAMETERIZED ROUTES (must come last)
// ============================================

// Get high scores for a specific game (public)
router.get('/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100)

    // Use current username from users table, fall back to stored for deleted users
    const scores = await query<HighScore>(`
      SELECT h.id, COALESCE(u.username, h.username) as username,
             COALESCE(u.avatar_color, h.avatar_color) as avatar_color,
             u.avatar_image,
             h.game_id, h.score, h.stats, h.platform, h.created_at
      FROM high_scores h
      LEFT JOIN users u ON h.user_id = u.id
      WHERE h.game_id = $1
      ORDER BY h.score DESC
      LIMIT $2
    `, [gameId, limit])

    res.json({ scores })
  } catch (error) {
    console.error('Get scores error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Submit a new score directly (fallback, authenticated users only)
router.post('/:gameId', authenticateToken, async (req, res) => {
  try {
    const { gameId } = req.params
    const { score, stats, sessionId, platform } = req.body  // platform: 'desktop' or 'mobile'
    const userId = req.user!.userId

    console.log(`[SCORE] Direct submission: game=${gameId}, userId=${userId}, score=${score}, sessionId=${sessionId || 'none'}, platform=${platform || 'desktop'}`)

    if (typeof score !== 'number' || score < 0) {
      res.status(400).json({ message: 'Invalid score' })
      return
    }

    // If we have a sessionId, update that session
    if (sessionId) {
      const session = await queryOne<GameSession>(
        'SELECT * FROM game_sessions WHERE id = $1 AND user_id = $2',
        [sessionId, userId]
      )

      if (session && session.status === 'playing') {
        await execute(
          `UPDATE game_sessions
           SET score = $1, status = 'completed', stats = $2, ended_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [score, stats ? JSON.stringify(stats) : null, sessionId]
        )
        console.log(`[SCORE] Updated session ${sessionId}`)
      }
    } else {
      // Create a completed session record for tracking
      await execute(`
        INSERT INTO game_sessions (user_id, game_id, score, status, stats, platform, ended_at)
        VALUES ($1, $2, $3, 'completed', $4, $5, CURRENT_TIMESTAMP)
      `, [userId, gameId, score, stats ? JSON.stringify(stats) : null, platform || 'desktop'])
      console.log(`[SCORE] Created completed session record`)
    }

    // Get user info
    const user = await queryOne<User>(
      'SELECT username, avatar_color FROM users WHERE id = $1',
      [userId]
    )

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // Insert the high score
    const result = await queryOne<{ id: number }>(`
      INSERT INTO high_scores (user_id, username, avatar_color, game_id, score, stats, platform)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [userId, user.username, user.avatar_color, gameId, score, stats ? JSON.stringify(stats) : null, platform || 'desktop'])

    // Get the rank of this score
    const rank = await queryOne<{ rank: string }>(
      'SELECT COUNT(*) + 1 as rank FROM high_scores WHERE game_id = $1 AND score > $2',
      [gameId, score]
    )

    // Check if it's a personal best
    const personalBest = await queryOne<{ best: number | null }>(
      'SELECT MAX(score) as best FROM high_scores WHERE game_id = $1 AND user_id = $2 AND id != $3',
      [gameId, userId, result!.id]
    )

    // Get high score for the game
    const highScoreData = await queryOne<{ score: number, username: string }>(
      'SELECT h.score, COALESCE(u.username, h.username) as username FROM high_scores h LEFT JOIN users u ON h.user_id = u.id WHERE h.game_id = $1 ORDER BY h.score DESC LIMIT 1',
      [gameId]
    )

    // Get total plays today
    const playsToday = await queryOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM game_sessions WHERE game_id = $1 AND started_at >= CURRENT_DATE",
      [gameId]
    )

    // Get total unique players for this game
    const totalPlayers = await queryOne<{ count: string }>(
      'SELECT COUNT(DISTINCT user_id) as count FROM high_scores WHERE game_id = $1',
      [gameId]
    )

    const isPersonalBest = !personalBest?.best || score > personalBest.best
    const rankNum = parseInt(rank?.rank || '1')
    const isNewHighScore = rankNum === 1

    // Broadcast to chat if this is a new #1 high score
    if (isNewHighScore && canAnnounceHighScore(gameId)) {
      const gameName = GAME_NAMES[gameId] || gameId
      broadcastHighScore(user.username, gameName, score)
      markHighScoreAnnounced(gameId)
      console.log(`[SCORE] New #1 high score announced: ${user.username} - ${gameName} - ${score}`)
    }

    console.log(`[SCORE] Saved: id=${result!.id}, rank=${rankNum}, isPersonalBest=${isPersonalBest}, isNewHighScore=${isNewHighScore}`)

    res.status(201).json({
      id: result!.id,
      rank: rankNum,
      isPersonalBest,
      isNewHighScore,
      score,
      highScore: highScoreData?.score || score,
      highScoreHolder: highScoreData?.username || user.username,
      playsToday: parseInt(playsToday?.count || '1'),
      totalPlayers: parseInt(totalPlayers?.count || '1'),
      pointsFromHighScore: (highScoreData?.score || score) - score,
    })
  } catch (error) {
    console.error('[SCORE] Submit error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
