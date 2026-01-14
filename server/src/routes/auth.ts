import { Router } from 'express'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { query, queryOne, execute, User, AuditLog, WordFilter, Message, GameSession, AvatarChange } from '../db/schema.js'
import { authenticateToken, generateToken } from '../middleware/auth.js'
import { broadcastChatStatus, broadcastAvatarChange, broadcastUsernameChange, broadcastChatClear, broadcastAnnouncement, broadcastMaintenanceMode, broadcastRegistrationStatus, getMessageRateLimit, setMessageRateLimit, getGuestChatEnabled, setGuestChatEnabled, reloadWordFilter, broadcastMessageDelete, broadcastAvatarImageChange, getConnectedUsersDetailed } from '../socket/chat.js'
import { generateVerificationCode, sendVerificationEmail } from '../utils/email.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Ensure avatars directory exists (use AVATARS_DIR env var for Railway volume, fallback for local dev)
const avatarsDir = process.env.AVATARS_DIR || path.join(__dirname, '../../avatars')
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true })
}

// Configure multer for avatar uploads
const avatarStorage = multer.memoryStorage()
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'))
    }
  }
})

// Helper to log admin actions
async function logAdminAction(
  adminId: number,
  adminUsername: string,
  action: string,
  targetType?: string,
  targetId?: number,
  targetName?: string,
  details?: string
) {
  await execute(
    `INSERT INTO audit_log (admin_id, admin_username, action, target_type, target_id, target_name, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [adminId, adminUsername, action, targetType || null, targetId || null, targetName || null, details || null]
  )
}

const router = Router()

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body

    if (!username || !email || !password) {
      res.status(400).json({ message: 'All fields are required' })
      return
    }

    // Check if registrations are paused
    const regPaused = await queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = $1',
      ['registrations_paused']
    )
    if (regPaused?.value === 'true') {
      res.status(403).json({ message: 'New registrations are currently paused' })
      return
    }

    // Check if email is banned
    const bannedUser = await queryOne<User>(
      'SELECT id FROM users WHERE email = $1 AND is_banned = 1',
      [email.toLowerCase()]
    )
    if (bannedUser) {
      res.status(403).json({ message: 'This email address has been banned' })
      return
    }

    if (username.length < 3 || username.length > 20) {
      res.status(400).json({ message: 'Username must be 3-20 characters' })
      return
    }

    if (password.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters' })
      return
    }

    const existingUser = await queryOne<User>(
      'SELECT id, email_verified FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username]
    )

    if (existingUser) {
      res.status(400).json({ message: 'Username or email already exists' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const avatarColor = '#00ffff'

    // Generate verification code (expires in 10 minutes)
    const verificationCode = generateVerificationCode()
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    // Check if this email should be granted admin status
    // Only grant admin if: 1) email matches ADMIN_EMAIL env var, AND 2) no admin exists yet
    let shouldBeAdmin = false
    const adminEmail = process.env.ADMIN_EMAIL
    if (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) {
      const existingAdmin = await queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM users WHERE is_admin = 1'
      )
      if (!existingAdmin || parseInt(existingAdmin.count) === 0) {
        shouldBeAdmin = true
        console.log('[REGISTER] Granting admin status to founding admin account')
      }
    }

    const result = await queryOne<{ id: number }>(
      `INSERT INTO users (username, email, password_hash, avatar_color, email_verified, verification_code, verification_code_expires, is_admin)
       VALUES ($1, $2, $3, $4, 0, $5, $6, $7) RETURNING id`,
      [username, email.toLowerCase(), passwordHash, avatarColor, verificationCode, codeExpires, shouldBeAdmin ? 1 : 0]
    )

    // Send verification email
    const emailResult = await sendVerificationEmail(email.toLowerCase(), username, verificationCode)

    if (!emailResult.success) {
      console.error('[REGISTER] Failed to send verification email:', emailResult.error)
      // Still create the account, they can request a new code
    }

    res.status(201).json({
      requiresVerification: true,
      userId: result!.id,
      email: email.toLowerCase(),
      message: 'Please check your email for a verification code'
    })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required' })
      return
    }

    const user = await queryOne<User>(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    )

    if (!user || !user.password_hash) {
      res.status(401).json({ message: 'Invalid email or password' })
      return
    }

    const validPassword = await bcrypt.compare(password, user.password_hash)

    if (!validPassword) {
      res.status(401).json({ message: 'Invalid email or password' })
      return
    }

    // Check if user is banned
    if (user.is_banned === 1) {
      res.status(403).json({ message: user.ban_reason || 'Your account has been banned' })
      return
    }

    // Check if email is verified
    if (user.email_verified !== 1) {
      res.status(403).json({
        requiresVerification: true,
        userId: user.id,
        email: user.email,
        message: 'Please verify your email before logging in'
      })
      return
    }

    const token = generateToken({ userId: user.id, username: user.username })

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarColor: user.avatar_color,
        avatarImage: user.avatar_image,
        isAdmin: user.is_admin === 1,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Verify email with code
router.post('/verify', async (req, res) => {
  try {
    const { userId, code } = req.body

    if (!userId || !code) {
      res.status(400).json({ message: 'User ID and verification code are required' })
      return
    }

    const user = await queryOne<User>(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    )

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    if (user.email_verified === 1) {
      res.status(400).json({ message: 'Email is already verified' })
      return
    }

    // Check if code has expired
    if (user.verification_code_expires && new Date(user.verification_code_expires) < new Date()) {
      res.status(400).json({ message: 'Verification code has expired. Please request a new one.' })
      return
    }

    // Check attempt limit (max 5 attempts)
    if (user.verification_code_attempts >= 5) {
      res.status(429).json({ message: 'Too many failed attempts. Please request a new code.' })
      return
    }

    // Check if code matches
    if (user.verification_code !== code) {
      // Increment failed attempts
      await execute(
        'UPDATE users SET verification_code_attempts = verification_code_attempts + 1 WHERE id = $1',
        [userId]
      )
      res.status(400).json({ message: 'Invalid verification code' })
      return
    }

    // Success - mark email as verified and clear code
    await execute(
      `UPDATE users SET email_verified = 1, verification_code = NULL, verification_code_expires = NULL, verification_code_attempts = 0 WHERE id = $1`,
      [userId]
    )

    // Generate token and return logged-in state
    const token = generateToken({ userId: user.id, username: user.username })

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarColor: user.avatar_color,
        avatarImage: user.avatar_image,
        isAdmin: user.is_admin === 1,
      },
      message: 'Email verified successfully'
    })
  } catch (error) {
    console.error('Verify error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Resend verification code
router.post('/resend-verification', async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId) {
      res.status(400).json({ message: 'User ID is required' })
      return
    }

    const user = await queryOne<User>(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    )

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    if (user.email_verified === 1) {
      res.status(400).json({ message: 'Email is already verified' })
      return
    }

    // Generate new code (expires in 10 minutes)
    const verificationCode = generateVerificationCode()
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    await execute(
      `UPDATE users SET verification_code = $1, verification_code_expires = $2, verification_code_attempts = 0 WHERE id = $3`,
      [verificationCode, codeExpires, userId]
    )

    // Send verification email
    const emailResult = await sendVerificationEmail(user.email, user.username, verificationCode)

    if (!emailResult.success) {
      console.error('[RESEND] Failed to send verification email:', emailResult.error)
      res.status(500).json({ message: 'Failed to send verification email. Please try again.' })
      return
    }

    res.json({ message: 'Verification code sent. Please check your email.' })
  } catch (error) {
    console.error('Resend verification error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.userId

    const user = await queryOne<User>(
      'SELECT id, username, email, avatar_color, avatar_image, is_admin FROM users WHERE id = $1',
      [userId]
    )

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarColor: user.avatar_color,
        avatarImage: user.avatar_image,
        isAdmin: user.is_admin === 1,
      },
    })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Get all users (with search/filter/pagination)
router.get('/admin/users', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.userId
    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [userId])

    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const { search, sort = 'created_at', order = 'desc' } = req.query
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500)
    const offset = parseInt(req.query.offset as string) || 0
    const validSorts = ['id', 'username', 'email', 'created_at', 'last_active']
    const sortCol = validSorts.includes(sort as string) ? sort : 'created_at'
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC'

    let sql = `
      SELECT id, username, email, avatar_color, is_admin, is_banned, is_muted, ban_reason, ban_expires_at, discord_username, created_at, last_active
      FROM users
    `
    let countSql = 'SELECT COUNT(*) as count FROM users'
    const params: unknown[] = []
    const countParams: unknown[] = []

    if (search) {
      sql += ` WHERE username ILIKE $1 OR email ILIKE $1`
      countSql += ` WHERE username ILIKE $1 OR email ILIKE $1`
      params.push(`%${search}%`)
      countParams.push(`%${search}%`)
    }

    sql += ` ORDER BY ${sortCol} ${sortOrder} NULLS LAST`
    sql += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)

    const [users, total] = await Promise.all([
      query<User>(sql, params),
      queryOne<{ count: string }>(countSql, countParams)
    ])

    res.json({ users, total: parseInt(total?.count || '0'), limit, offset })
  } catch (error) {
    console.error('Admin users error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Delete a user
router.delete('/admin/users/:id', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const targetId = parseInt(req.params.id)

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    // Prevent deleting yourself
    if (adminId === targetId) {
      res.status(400).json({ message: 'Cannot delete yourself' })
      return
    }

    // Delete user's messages first
    await execute('DELETE FROM messages WHERE user_id = $1', [targetId])
    // Delete user's high scores
    await execute('DELETE FROM high_scores WHERE user_id = $1', [targetId])
    // Delete the user
    const result = await execute('DELETE FROM users WHERE id = $1', [targetId])

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    res.json({ message: 'User deleted' })
  } catch (error) {
    console.error('Admin delete user error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Delete a message
router.delete('/admin/messages/:id', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const messageId = parseInt(req.params.id)

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const result = await execute('DELETE FROM messages WHERE id = $1', [messageId])

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Message not found' })
      return
    }

    // Broadcast deletion to all connected clients
    broadcastMessageDelete(messageId)

    res.json({ message: 'Message deleted' })
  } catch (error) {
    console.error('Admin delete message error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Delete all messages from a user
router.delete('/admin/messages/user/:userId', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const targetUserId = parseInt(req.params.userId)

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const result = await execute('DELETE FROM messages WHERE user_id = $1', [targetUserId])

    res.json({ message: `Deleted ${result.rowCount} messages` })
  } catch (error) {
    console.error('Admin delete user messages error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { username, avatarColor } = req.body
    const userId = req.user!.userId

    if (!username || username.length < 3 || username.length > 20) {
      res.status(400).json({ message: 'Username must be 3-20 characters' })
      return
    }

    // Case-sensitive uniqueness check using binary collation
    const existingUser = await queryOne<User>(
      'SELECT id FROM users WHERE username = $1 COLLATE "C" AND id != $2',
      [username, userId]
    )

    if (existingUser) {
      res.status(400).json({ message: 'Username already taken' })
      return
    }

    // Get current user to check what's changing
    const currentUser = await queryOne<User>(
      'SELECT avatar_color, last_avatar_change, last_username_change, username FROM users WHERE id = $1',
      [userId]
    )

    if (!currentUser) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    const isAvatarChanging = avatarColor && currentUser.avatar_color !== avatarColor
    const isUsernameChanging = currentUser.username !== username
    const oldUsername = currentUser.username

    // Rate limit username changes (24 hours)
    if (isUsernameChanging && currentUser.last_username_change) {
      const lastChange = new Date(currentUser.last_username_change).getTime()
      const now = Date.now()
      const cooldown = 24 * 60 * 60 * 1000 // 24 hours
      if (now - lastChange < cooldown) {
        const remainingMs = cooldown - (now - lastChange)
        const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000))
        res.status(429).json({ message: `You can change your username again in ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}` })
        return
      }
    }

    // Rate limit avatar changes (1 minute)
    if (isAvatarChanging && currentUser.last_avatar_change) {
      const lastChange = new Date(currentUser.last_avatar_change).getTime()
      const now = Date.now()
      const cooldown = 60 * 1000 // 1 minute
      if (now - lastChange < cooldown) {
        const remaining = Math.ceil((cooldown - (now - lastChange)) / 1000)
        res.status(429).json({ message: `Wait ${remaining} seconds before changing avatar again` })
        return
      }
    }

    // Build the update query based on what's changing
    const updates: string[] = ['username = $1', 'avatar_color = $2']
    const values: unknown[] = [username, avatarColor || currentUser.avatar_color]
    let paramIndex = 3

    if (isUsernameChanging) {
      updates.push(`last_username_change = CURRENT_TIMESTAMP`)
    }
    if (isAvatarChanging) {
      updates.push(`last_avatar_change = CURRENT_TIMESTAMP`)
    }

    values.push(userId)
    await execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    )

    // Update messages if username or avatar changed
    if (isUsernameChanging || isAvatarChanging) {
      const msgResult = await execute(
        'UPDATE messages SET username = $1, avatar_color = $2 WHERE user_id = $3',
        [username, avatarColor || currentUser.avatar_color, userId]
      )
      const hsResult = await execute(
        'UPDATE high_scores SET username = $1, avatar_color = $2 WHERE user_id = $3',
        [username, avatarColor || currentUser.avatar_color, userId]
      )
      console.log(`[PROFILE] Updated ${msgResult.rowCount} messages and ${hsResult.rowCount} high scores for user ${userId} (${oldUsername} -> ${username})`)

      // Verify the update worked by checking one message
      if (isUsernameChanging && msgResult.rowCount > 0) {
        const verification = await queryOne<{ username: string }>(
          'SELECT username FROM messages WHERE user_id = $1 LIMIT 1',
          [userId]
        )
        console.log(`[PROFILE] Verification - message now shows username: ${verification?.username}`)
      }
    }

    // Log username change to history
    if (isUsernameChanging) {
      await execute(
        'INSERT INTO username_history (user_id, old_username, new_username) VALUES ($1, $2, $3)',
        [userId, oldUsername, username]
      )
      console.log(`[PROFILE] Logged username change: ${oldUsername} -> ${username}`)
    }

    // Broadcast changes to all chat clients
    if (isUsernameChanging) {
      broadcastUsernameChange(oldUsername, username)
    }
    if (isAvatarChanging) {
      broadcastAvatarChange(username, avatarColor)
    }

    const user = await queryOne<User>(
      'SELECT id, username, email, avatar_color, avatar_image, is_admin FROM users WHERE id = $1',
      [userId]
    )

    // Generate a new token with the updated username
    const newToken = isUsernameChanging ? generateToken({ userId: user!.id, username: user!.username }) : undefined

    res.json({
      user: {
        id: user!.id,
        username: user!.username,
        email: user!.email,
        avatarColor: user!.avatar_color,
        avatarImage: user!.avatar_image,
        isAdmin: user!.is_admin === 1,
      },
      ...(newToken && { token: newToken }),
    })
  } catch (error) {
    console.error('Profile update error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Get chat status (public)
router.get('/chat-status', async (_req, res) => {
  try {
    const result = await queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = $1',
      ['chat_enabled']
    )
    const offlineMessage = await queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = $1',
      ['chat_offline_message']
    )

    res.json({
      enabled: result?.value === 'true',
      offlineMessage: offlineMessage?.value || null
    })
  } catch (error) {
    console.error('Get chat status error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Set chat status
router.post('/admin/chat-status', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const { enabled, offlineMessage } = req.body

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    // Update chat_enabled setting
    await execute(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('chat_enabled', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [enabled ? 'true' : 'false']
    )

    // Update offline message if disabling
    if (!enabled && offlineMessage) {
      await execute(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('chat_offline_message', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [offlineMessage]
      )
    }

    // Broadcast status change to all connected clients
    broadcastChatStatus(enabled, enabled ? undefined : offlineMessage)

    res.json({
      enabled,
      offlineMessage: enabled ? null : offlineMessage,
      message: enabled ? 'Chat enabled' : 'Chat disabled'
    })
  } catch (error) {
    console.error('Set chat status error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Ban a user (with optional duration)
router.post('/admin/users/:id/ban', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const targetId = parseInt(req.params.id)
    const { reason, duration } = req.body // duration in hours, null for permanent

    const admin = await queryOne<User>('SELECT is_admin, username FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    if (adminId === targetId) {
      res.status(400).json({ message: 'Cannot ban yourself' })
      return
    }

    const targetUser = await queryOne<User>('SELECT username FROM users WHERE id = $1', [targetId])
    if (!targetUser) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    let expiresAt = null
    if (duration && typeof duration === 'number' && duration > 0) {
      expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000).toISOString()
    }

    await execute(
      'UPDATE users SET is_banned = 1, ban_reason = $1, ban_expires_at = $2 WHERE id = $3',
      [reason || 'Banned by administrator', expiresAt, targetId]
    )

    const durationText = duration ? `${duration}h` : 'permanent'
    await logAdminAction(adminId, admin.username, 'ban', 'user', targetId, targetUser.username, `Reason: ${reason || 'No reason'}. Duration: ${durationText}`)

    res.json({ message: 'User banned', expiresAt })
  } catch (error) {
    console.error('Admin ban user error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Unban a user
router.post('/admin/users/:id/unban', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const targetId = parseInt(req.params.id)

    const admin = await queryOne<User>('SELECT is_admin, username FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const targetUser = await queryOne<User>('SELECT username FROM users WHERE id = $1', [targetId])

    await execute(
      'UPDATE users SET is_banned = 0, ban_reason = NULL, ban_expires_at = NULL WHERE id = $1',
      [targetId]
    )

    if (targetUser) {
      await logAdminAction(adminId, admin.username, 'unban', 'user', targetId, targetUser.username)
    }

    res.json({ message: 'User unbanned' })
  } catch (error) {
    console.error('Admin unban user error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Mute a user
router.post('/admin/users/:id/mute', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const targetId = parseInt(req.params.id)

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    await execute('UPDATE users SET is_muted = 1 WHERE id = $1', [targetId])

    res.json({ message: 'User muted' })
  } catch (error) {
    console.error('Admin mute user error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Unmute a user
router.post('/admin/users/:id/unmute', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const targetId = parseInt(req.params.id)

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    await execute('UPDATE users SET is_muted = 0 WHERE id = $1', [targetId])

    res.json({ message: 'User unmuted' })
  } catch (error) {
    console.error('Admin unmute user error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Get banned users
router.get('/admin/users/banned', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const users = await query<User>(`
      SELECT id, username, email, avatar_color, ban_reason, created_at
      FROM users
      WHERE is_banned = 1
      ORDER BY created_at DESC
    `)

    res.json({ users })
  } catch (error) {
    console.error('Admin get banned users error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Pause/unpause registrations
router.post('/admin/registrations', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const { paused } = req.body

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    await execute(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('registrations_paused', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [paused ? 'true' : 'false']
    )

    // Broadcast to all connected clients
    broadcastRegistrationStatus(paused)

    res.json({ paused, message: paused ? 'Registrations paused' : 'Registrations enabled' })
  } catch (error) {
    console.error('Admin registrations error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Get registrations status
router.get('/admin/registrations', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const result = await queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = $1',
      ['registrations_paused']
    )

    res.json({ paused: result?.value === 'true' })
  } catch (error) {
    console.error('Admin get registrations error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Clear all chat messages
router.delete('/admin/messages', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const result = await execute('DELETE FROM messages')

    // Broadcast to clear chat for all connected clients
    broadcastChatClear()

    res.json({ message: `Cleared ${result.rowCount} messages` })
  } catch (error) {
    console.error('Admin clear chat error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Send system announcement
router.post('/admin/announcement', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const { message } = req.body

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    if (!message || message.trim().length === 0) {
      res.status(400).json({ message: 'Announcement message is required' })
      return
    }

    // Broadcast announcement to all connected clients
    broadcastAnnouncement(message.trim())

    res.json({ message: 'Announcement sent' })
  } catch (error) {
    console.error('Admin announcement error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Set maintenance mode
router.post('/admin/maintenance', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const { enabled, message } = req.body

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    await execute(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('maintenance_mode', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [enabled ? 'true' : 'false']
    )

    if (message) {
      await execute(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('maintenance_message', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [message]
      )
    }

    // Broadcast maintenance status to all clients
    broadcastMaintenanceMode(enabled, message)

    res.json({ enabled, message: enabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled' })
  } catch (error) {
    console.error('Admin maintenance error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Get maintenance mode status
router.get('/admin/maintenance', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const enabled = await queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = $1',
      ['maintenance_mode']
    )
    const message = await queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = $1',
      ['maintenance_message']
    )

    res.json({
      enabled: enabled?.value === 'true',
      message: message?.value || 'Site is under maintenance. Please check back soon.'
    })
  } catch (error) {
    console.error('Admin get maintenance error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Public: Get maintenance mode status (for showing maintenance page)
router.get('/maintenance', async (_req, res) => {
  try {
    const enabled = await queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = $1',
      ['maintenance_mode']
    )
    const message = await queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = $1',
      ['maintenance_message']
    )

    res.json({
      enabled: enabled?.value === 'true',
      message: message?.value || 'Site is under maintenance. Please check back soon.'
    })
  } catch (error) {
    console.error('Get maintenance error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Public: Get site status (registration, maintenance)
router.get('/site-status', async (_req, res) => {
  try {
    const regPaused = await queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = $1',
      ['registrations_paused']
    )
    const maintenance = await queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = $1',
      ['maintenance_mode']
    )
    const maintenanceMessage = await queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = $1',
      ['maintenance_message']
    )

    res.json({
      registrationsPaused: regPaused?.value === 'true',
      maintenance: {
        enabled: maintenance?.value === 'true',
        message: maintenanceMessage?.value || 'Site is under maintenance. Please check back soon.'
      }
    })
  } catch (error) {
    console.error('Get site status error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Public: Get chat rate limit (for UI display)
router.get('/chat-rate-limit', async (_req, res) => {
  res.json({ rateLimitMs: getMessageRateLimit() })
})

// Admin: Get chat rate limit
router.get('/admin/chat-rate-limit', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    res.json({ rateLimitMs: getMessageRateLimit() })
  } catch (error) {
    console.error('Admin get chat rate limit error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Set chat rate limit
router.post('/admin/chat-rate-limit', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const { rateLimitMs } = req.body

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    if (typeof rateLimitMs !== 'number' || rateLimitMs < 0) {
      res.status(400).json({ message: 'Invalid rate limit value' })
      return
    }

    await setMessageRateLimit(rateLimitMs)

    res.json({ rateLimitMs: getMessageRateLimit(), message: 'Chat rate limit updated' })
  } catch (error) {
    console.error('Admin set chat rate limit error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Get guest chat status
router.get('/admin/guest-chat', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    res.json({ enabled: getGuestChatEnabled() })
  } catch (error) {
    console.error('Admin get guest chat error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Set guest chat status
router.post('/admin/guest-chat', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const { enabled } = req.body

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    if (typeof enabled !== 'boolean') {
      res.status(400).json({ message: 'Invalid value' })
      return
    }

    await setGuestChatEnabled(enabled)

    res.json({ enabled: getGuestChatEnabled(), message: enabled ? 'Guest chat enabled' : 'Guest chat disabled' })
  } catch (error) {
    console.error('Admin set guest chat error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Reset user's username change cooldown
router.post('/admin/users/:userId/reset-username-cooldown', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const targetUserId = parseInt(req.params.userId)

    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const targetUser = await queryOne<User>('SELECT username FROM users WHERE id = $1', [targetUserId])
    if (!targetUser) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    await execute(
      'UPDATE users SET last_username_change = NULL WHERE id = $1',
      [targetUserId]
    )

    res.json({ message: `Username change cooldown reset for ${targetUser.username}` })
  } catch (error) {
    console.error('Admin reset username cooldown error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Get dashboard stats
router.get('/admin/stats', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [
      totalUsers,
      newUsersWeek,
      activeUsers24h,
      activeUsers7d,
      totalMessages,
      messagesWeek,
      activeSessions,
      gamesPlayedToday
    ] = await Promise.all([
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM users'),
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM users WHERE created_at >= $1', [oneWeekAgo]),
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM users WHERE last_active >= $1', [oneDayAgo]),
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM users WHERE last_active >= $1', [oneWeekAgo]),
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM messages'),
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM messages WHERE created_at >= $1', [oneWeekAgo]),
      queryOne<{ count: string }>("SELECT COUNT(*) as count FROM game_sessions WHERE status = 'playing'"),
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM game_sessions WHERE started_at >= $1', [oneDayAgo])
    ])

    res.json({
      users: {
        total: parseInt(totalUsers?.count || '0'),
        newThisWeek: parseInt(newUsersWeek?.count || '0'),
        active24h: parseInt(activeUsers24h?.count || '0'),
        active7d: parseInt(activeUsers7d?.count || '0')
      },
      messages: {
        total: parseInt(totalMessages?.count || '0'),
        thisWeek: parseInt(messagesWeek?.count || '0')
      },
      games: {
        activeSessions: parseInt(activeSessions?.count || '0'),
        playedToday: parseInt(gamesPlayedToday?.count || '0')
      }
    })
  } catch (error) {
    console.error('Admin stats error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Get connected users (real-time socket connections)
router.get('/admin/connected-users', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const connectedUsers = getConnectedUsersDetailed()

    // Fetch active game sessions for connected users (for registered users)
    const userIds = connectedUsers
      .filter(u => u.userId)
      .map(u => u.userId)

    let activeSessions: Map<number, GameSession> = new Map()
    if (userIds.length > 0) {
      const sessions = await query<GameSession>(
        `SELECT * FROM game_sessions
         WHERE user_id = ANY($1) AND status = 'playing'
         ORDER BY started_at DESC`,
        [userIds]
      )
      // Map by user_id (most recent session per user)
      for (const session of sessions) {
        if (!activeSessions.has(session.user_id)) {
          activeSessions.set(session.user_id, session)
        }
      }
    }

    // Attach active session data to connected users
    const usersWithSessions = connectedUsers.map(u => ({
      ...u,
      activeSession: u.userId ? activeSessions.get(u.userId) || null : null
    }))

    res.json({ users: usersWithSessions })
  } catch (error) {
    console.error('Admin connected users error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Get recent messages (with pagination)
router.get('/admin/recent-messages', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500)
    const offset = parseInt(req.query.offset as string) || 0
    const search = req.query.search as string

    let sql = `
      SELECT m.*, u.email
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
    `
    let countSql = 'SELECT COUNT(*) as count FROM messages m'
    const params: unknown[] = []
    const countParams: unknown[] = []

    if (search) {
      sql += ` WHERE m.content ILIKE $1 OR m.username ILIKE $1`
      countSql += ` WHERE m.content ILIKE $1 OR m.username ILIKE $1`
      params.push(`%${search}%`)
      countParams.push(`%${search}%`)
    }

    sql += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)

    const [messages, total] = await Promise.all([
      query<Message & { email?: string }>(sql, params),
      queryOne<{ count: string }>(countSql, countParams)
    ])

    res.json({ messages, total: parseInt(total?.count || '0'), limit, offset })
  } catch (error) {
    console.error('Admin recent messages error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Get game sessions
router.get('/admin/sessions', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const status = req.query.status as string || 'playing'
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)

    const sessions = await query<GameSession & { username: string }>(
      `SELECT gs.*, u.username
       FROM game_sessions gs
       LEFT JOIN users u ON gs.user_id = u.id
       WHERE gs.status = $1
       ORDER BY gs.started_at DESC
       LIMIT $2`,
      [status, limit]
    )

    res.json({ sessions })
  } catch (error) {
    console.error('Admin sessions error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Force end a game session
router.post('/admin/sessions/:id/end', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const sessionId = parseInt(req.params.id)

    const admin = await queryOne<User>('SELECT is_admin, username FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const session = await queryOne<GameSession & { username: string }>(
      `SELECT gs.*, u.username FROM game_sessions gs LEFT JOIN users u ON gs.user_id = u.id WHERE gs.id = $1`,
      [sessionId]
    )

    if (!session) {
      res.status(404).json({ message: 'Session not found' })
      return
    }

    await execute(
      "UPDATE game_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE id = $1",
      [sessionId]
    )

    await logAdminAction(adminId, admin.username, 'force_end_session', 'session', sessionId, session.username, `Game: ${session.game_id}`)

    res.json({ message: 'Session ended' })
  } catch (error) {
    console.error('Admin end session error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Force end all active game sessions
router.post('/admin/sessions/end-all', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId

    const admin = await queryOne<User>('SELECT is_admin, username FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const result = await execute(
      "UPDATE game_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE status = 'playing'"
    )

    await logAdminAction(adminId, admin.username, 'force_end_all_sessions', undefined, undefined, undefined, `Ended ${result.rowCount} sessions`)

    res.json({ message: `Ended ${result.rowCount} sessions` })
  } catch (error) {
    console.error('Admin end all sessions error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Get word filter list
router.get('/admin/word-filter', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const words = await query<WordFilter>(
      'SELECT * FROM word_filter ORDER BY created_at DESC'
    )

    res.json({ words })
  } catch (error) {
    console.error('Admin word filter error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Add word to filter
router.post('/admin/word-filter', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const { word, isRegex, action } = req.body

    const admin = await queryOne<User>('SELECT is_admin, username FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    if (!word || word.trim().length === 0) {
      res.status(400).json({ message: 'Word is required' })
      return
    }

    const result = await queryOne<WordFilter>(
      `INSERT INTO word_filter (word, is_regex, action, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (word) DO NOTHING
       RETURNING *`,
      [word.trim().toLowerCase(), isRegex ? 1 : 0, action || 'block', adminId]
    )

    if (!result) {
      res.status(400).json({ message: 'Word already exists in filter' })
      return
    }

    await logAdminAction(adminId, admin.username, 'add_word_filter', 'word_filter', result.id, word.trim())

    // Reload word filter cache
    await reloadWordFilter()

    res.json({ word: result })
  } catch (error) {
    console.error('Admin add word filter error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Remove word from filter
router.delete('/admin/word-filter/:id', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const wordId = parseInt(req.params.id)

    const admin = await queryOne<User>('SELECT is_admin, username FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const word = await queryOne<WordFilter>('SELECT word FROM word_filter WHERE id = $1', [wordId])

    const result = await execute('DELETE FROM word_filter WHERE id = $1', [wordId])

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Word not found' })
      return
    }

    await logAdminAction(adminId, admin.username, 'remove_word_filter', 'word_filter', wordId, word?.word)

    // Reload word filter cache
    await reloadWordFilter()

    res.json({ message: 'Word removed from filter' })
  } catch (error) {
    console.error('Admin remove word filter error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Get audit log
router.get('/admin/audit-log', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500)
    const offset = parseInt(req.query.offset as string) || 0

    const logs = await query<AuditLog>(
      `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    )

    const total = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM audit_log')

    res.json({ logs, total: parseInt(total?.count || '0') })
  } catch (error) {
    console.error('Admin audit log error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Reset all (nuclear option - wipe everything)
router.post('/admin/reset-all', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const { password, deleteUsers } = req.body

    if (!password) {
      res.status(400).json({ message: 'Password required for this operation' })
      return
    }

    const admin = await queryOne<User>(
      'SELECT is_admin, username, password_hash FROM users WHERE id = $1',
      [adminId]
    )

    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    // Verify password
    if (!admin.password_hash) {
      res.status(400).json({ message: 'Cannot verify password for this account' })
      return
    }

    const validPassword = await bcrypt.compare(password, admin.password_hash)
    if (!validPassword) {
      res.status(401).json({ message: 'Invalid password' })
      return
    }

    // Count everything before deletion
    const [msgCount, scoreCount, sessionCount, userCount] = await Promise.all([
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM messages'),
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM high_scores'),
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM game_sessions'),
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM users WHERE id != $1', [adminId])
    ])

    // Delete everything
    await execute('DELETE FROM messages')
    await execute('DELETE FROM high_scores')
    await execute('DELETE FROM game_sessions')

    let usersDeleted = 0
    if (deleteUsers) {
      // Delete all users except the admin performing the action
      // First delete dependent data
      await execute('DELETE FROM username_history WHERE user_id != $1', [adminId])
      await execute('DELETE FROM avatar_changes WHERE user_id != $1', [adminId])
      await execute('DELETE FROM verification_codes WHERE user_id != $1', [adminId])
      // Then delete users
      const result = await execute('DELETE FROM users WHERE id != $1', [adminId])
      usersDeleted = result.rowCount
    }

    // Log the action
    await logAdminAction(
      adminId,
      admin.username,
      deleteUsers ? 'reset_all_with_users' : 'reset_all',
      undefined,
      undefined,
      undefined,
      `Deleted ${msgCount?.count || 0} messages, ${scoreCount?.count || 0} scores, ${sessionCount?.count || 0} sessions${deleteUsers ? `, ${usersDeleted} users` : ''}`
    )

    console.log(`[ADMIN] FULL RESET by ${admin.username}: ${msgCount?.count || 0} messages, ${scoreCount?.count || 0} scores, ${sessionCount?.count || 0} sessions${deleteUsers ? `, ${usersDeleted} users` : ''}`)

    // Broadcast chat clear
    broadcastChatClear()

    res.json({
      message: `Reset complete. Deleted ${msgCount?.count || 0} messages, ${scoreCount?.count || 0} scores, ${sessionCount?.count || 0} sessions${deleteUsers ? `, ${usersDeleted} users` : ''}.`
    })
  } catch (error) {
    console.error('Admin reset all error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Get username change history
router.get('/admin/username-history', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500)
    const offset = parseInt(req.query.offset as string) || 0
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined

    let history
    let total
    if (userId) {
      history = await query<{ id: number; user_id: number; old_username: string; new_username: string; changed_at: string; current_username: string }>(
        `SELECT h.*, u.username as current_username
         FROM username_history h
         LEFT JOIN users u ON h.user_id = u.id
         WHERE h.user_id = $1
         ORDER BY h.changed_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      )
      total = await queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM username_history WHERE user_id = $1',
        [userId]
      )
    } else {
      history = await query<{ id: number; user_id: number; old_username: string; new_username: string; changed_at: string; current_username: string }>(
        `SELECT h.*, u.username as current_username
         FROM username_history h
         LEFT JOIN users u ON h.user_id = u.id
         ORDER BY h.changed_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      )
      total = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM username_history')
    }

    res.json({ history, total: parseInt(total?.count || '0') })
  } catch (error) {
    console.error('Admin username history error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: Get username history for a specific user by current username
router.get('/admin/username-history/user/:username', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user!.userId
    const admin = await queryOne<User>('SELECT is_admin FROM users WHERE id = $1', [adminId])
    if (!admin || admin.is_admin !== 1) {
      res.status(403).json({ message: 'Admin access required' })
      return
    }

    const { username } = req.params

    // Find user by current username
    const user = await queryOne<User>('SELECT id, username FROM users WHERE username = $1', [username])
    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    const history = await query<{ id: number; old_username: string; new_username: string; changed_at: string }>(
      `SELECT id, old_username, new_username, changed_at
       FROM username_history
       WHERE user_id = $1
       ORDER BY changed_at DESC`,
      [user.id]
    )

    res.json({ userId: user.id, currentUsername: user.username, history })
  } catch (error) {
    console.error('Admin username history lookup error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Avatar image upload with pixel art conversion
router.post('/avatar', authenticateToken, avatarUpload.single('avatar'), async (req, res) => {
  try {
    const userId = req.user!.userId
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' })
      return
    }

    if (!req.file) {
      res.status(400).json({ message: 'No image file provided' })
      return
    }

    // Parse crop data from form data (JSON with x, y, size in pixels)
    let cropData: { x: number; y: number; size: number } | null = null
    const cropPosition = req.body.cropPosition as string
    if (cropPosition) {
      try {
        cropData = JSON.parse(cropPosition)
      } catch {
        // If not valid JSON, ignore (will use default center crop)
      }
    }

    // Check rate limit: 12 avatar changes per 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const recentChanges = await query<AvatarChange>(
      `SELECT id FROM avatar_changes WHERE user_id = $1 AND changed_at > $2`,
      [userId, twentyFourHoursAgo]
    )

    if (recentChanges.length >= 12) {
      res.status(429).json({
        message: 'Avatar change limit reached. You can only change your avatar 12 times per 24 hours.',
        changesRemaining: 0,
        resetTime: twentyFourHoursAgo
      })
      return
    }

    // Get current user
    const user = await queryOne<User>('SELECT username, avatar_image FROM users WHERE id = $1', [userId])
    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // Delete old avatar file if exists
    if (user.avatar_image) {
      const oldAvatarPath = path.join(avatarsDir, user.avatar_image)
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlinkSync(oldAvatarPath)
      }
    }

    // Process image to pixel art: extract crop region, resize to 64x64, then scale up to 640x640
    const pixelSize = 64
    const outputSize = 640

    let smallImage: Buffer
    if (cropData && cropData.x >= 0 && cropData.y >= 0 && cropData.size > 0) {
      // Use exact crop coordinates from client
      smallImage = await sharp(req.file.buffer)
        .extract({
          left: cropData.x,
          top: cropData.y,
          width: cropData.size,
          height: cropData.size
        })
        .resize(pixelSize, pixelSize)
        .toBuffer()
    } else {
      // Default: center crop to square
      smallImage = await sharp(req.file.buffer)
        .resize(pixelSize, pixelSize, { fit: 'cover', position: 'centre' })
        .toBuffer()
    }

    // Then scale up to 640x640 with nearest-neighbor (no interpolation) for crisp pixels
    const filename = `${userId}_${Date.now()}.png`
    const outputPath = path.join(avatarsDir, filename)

    await sharp(smallImage)
      .resize(outputSize, outputSize, {
        kernel: sharp.kernel.nearest // Nearest-neighbor for crisp pixel art
      })
      .png()
      .toFile(outputPath)

    // Update database
    await execute(
      'UPDATE users SET avatar_image = $1 WHERE id = $2',
      [filename, userId]
    )

    // Log the avatar change for rate limiting
    await execute(
      'INSERT INTO avatar_changes (user_id) VALUES ($1)',
      [userId]
    )

    // Clean up old rate limit records (older than 24 hours)
    await execute(
      `DELETE FROM avatar_changes WHERE changed_at < $1`,
      [twentyFourHoursAgo]
    )

    // Broadcast avatar image change to all connected clients
    broadcastAvatarImageChange(user.username, filename)

    res.json({
      message: 'Avatar updated successfully',
      avatarImage: filename,
      changesRemaining: 11 - recentChanges.length
    })
  } catch (error) {
    console.error('Avatar upload error:', error)
    res.status(500).json({ message: 'Failed to upload avatar' })
  }
})

// Delete avatar image (revert to color-only)
router.delete('/avatar', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.userId
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' })
      return
    }

    const user = await queryOne<User>('SELECT username, avatar_image FROM users WHERE id = $1', [userId])
    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // Delete avatar file if exists
    if (user.avatar_image) {
      const avatarPath = path.join(avatarsDir, user.avatar_image)
      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath)
      }
    }

    // Clear avatar_image in database
    await execute('UPDATE users SET avatar_image = NULL WHERE id = $1', [userId])

    // Broadcast avatar image removal
    broadcastAvatarImageChange(user.username, null)

    res.json({ message: 'Avatar image removed' })
  } catch (error) {
    console.error('Avatar delete error:', error)
    res.status(500).json({ message: 'Failed to delete avatar' })
  }
})

// Get avatar change rate limit status
router.get('/avatar-limit', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.userId
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' })
      return
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const recentChanges = await query<AvatarChange>(
      `SELECT changed_at FROM avatar_changes WHERE user_id = $1 AND changed_at > $2 ORDER BY changed_at ASC`,
      [userId, twentyFourHoursAgo]
    )

    const changesRemaining = Math.max(0, 12 - recentChanges.length)
    let nextResetTime = null

    if (recentChanges.length >= 12) {
      // Next reset is when the oldest change expires (24h after it was made)
      nextResetTime = new Date(new Date(recentChanges[0].changed_at).getTime() + 24 * 60 * 60 * 1000).toISOString()
    }

    res.json({ changesRemaining, totalLimit: 12, nextResetTime })
  } catch (error) {
    console.error('Avatar limit check error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
