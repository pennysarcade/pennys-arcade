import { Server, Socket } from 'socket.io'
import { query, queryOne, execute, Message, User, WordFilter } from '../db/schema.js'
import { verifyToken, JWTPayload } from '../middleware/auth.js'
import { UAParser } from 'ua-parser-js'

interface DeviceInfo {
  type: string          // 'desktop', 'mobile', 'tablet', 'bot', 'unknown'
  os: string            // 'Windows 11', 'iOS 17.4', 'Android 14'
  browser: string       // 'Chrome 120', 'Safari 17.4'
  device: string | null // 'iPhone 15 Pro', 'Samsung Galaxy S24', null for desktop
}

interface LocationInfo {
  country: string
  region: string
  city: string
  isp: string
  ip: string
}

// Word filter cache (loaded from DB)
let wordFilterCache: WordFilter[] = []

// Load word filter from database
async function loadWordFilter(): Promise<void> {
  wordFilterCache = await query<WordFilter>('SELECT * FROM word_filter')
  console.log(`[CHAT] Loaded ${wordFilterCache.length} words in filter`)
}

// Check message against word filter
function checkWordFilter(text: string): { blocked: boolean; word?: string } {
  const lowerText = text.toLowerCase()
  for (const filter of wordFilterCache) {
    if (filter.is_regex === 1) {
      try {
        const regex = new RegExp(filter.word, 'i')
        if (regex.test(text)) {
          return { blocked: true, word: filter.word }
        }
      } catch {
        // Invalid regex, skip
      }
    } else {
      if (lowerText.includes(filter.word.toLowerCase())) {
        return { blocked: true, word: filter.word }
      }
    }
  }
  return { blocked: false }
}

// Check and auto-unban users with expired bans
async function checkExpiredBans(): Promise<void> {
  const result = await execute(
    `UPDATE users SET is_banned = 0, ban_reason = NULL, ban_expires_at = NULL
     WHERE is_banned = 1 AND ban_expires_at IS NOT NULL AND ban_expires_at < CURRENT_TIMESTAMP`
  )
  if (result.rowCount > 0) {
    console.log(`[CHAT] Auto-unbanned ${result.rowCount} users with expired bans`)
  }
}

// Mark stale sessions as ended (no activity for 12 hours)
async function cleanupStaleSessions(): Promise<void> {
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
  const result = await execute(
    `UPDATE game_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP
     WHERE status = 'playing' AND started_at < $1`,
    [twelveHoursAgo]
  )
  if (result.rowCount > 0) {
    console.log(`[CHAT] Ended ${result.rowCount} stale sessions (no activity for 12+ hours)`)
  }
}

// Update user's last_active timestamp
async function updateLastActive(userId: number): Promise<void> {
  await execute('UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = $1', [userId])
}

// Reload word filter (call after admin changes)
export async function reloadWordFilter(): Promise<void> {
  await loadWordFilter()
}

// Store io instance for broadcasting from outside
let ioInstance: Server | null = null

// Broadcast chat status change to all clients
export function broadcastChatStatus(enabled: boolean, offlineMessage?: string) {
  if (ioInstance) {
    ioInstance.emit('chat:status', { enabled, offlineMessage })
  }
}

// Broadcast avatar color change to all clients and update server cache
export function broadcastAvatarChange(username: string, newColor: string) {
  if (ioInstance) {
    // Update all connected sockets for this user with the new color
    connectedUsers.forEach((user, socketId) => {
      if (user.username === username) {
        connectedUsers.set(socketId, { ...user, avatarColor: newColor })
      }
    })
    // Also update any recent messages in cache from this user
    recentMessages.forEach((msg, index) => {
      if (msg.username === username) {
        recentMessages[index] = { ...msg, avatarColor: newColor }
      }
    })
    ioInstance.emit('chat:avatarUpdate', { username, avatarColor: newColor })
  }
}

// Broadcast username change to all clients and update server cache
export function broadcastUsernameChange(oldUsername: string, newUsername: string) {
  if (ioInstance) {
    // Update all connected sockets for this user with the new username
    connectedUsers.forEach((user, socketId) => {
      if (user.username === oldUsername) {
        connectedUsers.set(socketId, { ...user, username: newUsername })
      }
    })
    // Update any recent messages in cache from this user
    recentMessages.forEach((msg, index) => {
      if (msg.username === oldUsername) {
        recentMessages[index] = { ...msg, username: newUsername }
      }
    })
    ioInstance.emit('chat:usernameUpdate', { oldUsername, newUsername })
  }
}

// Broadcast avatar image change to all clients and update server cache
export function broadcastAvatarImageChange(username: string, newImage: string | null) {
  if (ioInstance) {
    // Update all connected sockets for this user with the new avatar image
    connectedUsers.forEach((user, socketId) => {
      if (user.username === username) {
        connectedUsers.set(socketId, { ...user, avatarImage: newImage })
      }
    })
    // Update any recent messages in cache from this user
    recentMessages.forEach((msg, index) => {
      if (msg.username === username) {
        recentMessages[index] = { ...msg, avatarImage: newImage }
      }
    })
    ioInstance.emit('chat:avatarImageUpdate', { username, avatarImage: newImage })
  }
}

// Broadcast chat clear to all clients
export function broadcastChatClear() {
  if (ioInstance) {
    // Clear the in-memory cache
    recentMessages.length = 0
    ioInstance.emit('chat:cleared')
  }
}

// Broadcast system announcement to all clients
export function broadcastAnnouncement(message: string) {
  if (ioInstance) {
    ioInstance.emit('chat:announcement', { message, timestamp: Date.now() })
  }
}

// Broadcast maintenance mode status to all clients
export function broadcastMaintenanceMode(enabled: boolean, message?: string) {
  if (ioInstance) {
    ioInstance.emit('site:maintenance', { enabled, message })
  }
}

// Broadcast registration status change to all clients
export function broadcastRegistrationStatus(paused: boolean) {
  if (ioInstance) {
    ioInstance.emit('site:registrations', { paused })
  }
}

// Broadcast new high score to chat
export function broadcastHighScore(username: string, gameName: string, score: number) {
  if (ioInstance) {
    ioInstance.emit('chat:highscore', { username, gameName, score, timestamp: Date.now() })
  }
}

// Broadcast message deletion (hard delete from admin panel)
export function broadcastMessageDelete(messageId: number) {
  if (ioInstance) {
    // Remove from cache
    const index = recentMessages.findIndex(m => m.id === String(messageId))
    if (index !== -1) {
      recentMessages.splice(index, 1)
    }

    // Update any cached messages that were replies to this one
    recentMessages.forEach(msg => {
      if (msg.replyTo && msg.replyTo.id === String(messageId)) {
        msg.replyTo.text = '[Message removed.]'
      }
    })

    // Broadcast to all clients
    ioInstance.emit('chat:deleted', { messageId, hardDelete: true })
  }
}

// Get current chat status from database
async function getChatStatus(): Promise<{ enabled: boolean; offlineMessage: string | null }> {
  const result = await queryOne<{ value: string }>(
    'SELECT value FROM settings WHERE key = $1',
    ['chat_enabled']
  )
  const offlineMsg = await queryOne<{ value: string }>(
    'SELECT value FROM settings WHERE key = $1',
    ['chat_offline_message']
  )
  return {
    enabled: result?.value === 'true',
    offlineMessage: offlineMsg?.value || null
  }
}

interface ReplyInfo {
  id: string
  username: string
  text: string
}

interface ChatMessage {
  id: string
  username: string
  text: string
  avatarColor: string
  avatarImage: string | null
  isGuest: boolean
  isAdmin: boolean
  isDeleted: boolean
  isEdited: boolean
  userId: number | null
  timestamp: number
  replyTo: ReplyInfo | null
}

interface CurrentGameInfo {
  gameId: string
  score: number
  stats: string | null
  startedAt: number
  rounds: number
}

interface ConnectedUser {
  socketId: string
  username: string
  avatarColor: string
  avatarImage: string | null
  isGuest: boolean
  userId?: number
  connectedAt: number
  currentPage: string
  device: DeviceInfo
  location: LocationInfo | null
  currentGame: CurrentGameInfo | null
}

const connectedUsers = new Map<string, ConnectedUser>()
const recentMessages: ChatMessage[] = []
const lastMessageTime = new Map<string, number>()
const MAX_RECENT_MESSAGES = 2048
let messageRateLimitMs = 1000 // Default: 1 message per second (loaded from DB on startup)
let guestChatEnabled = false // Default: guests cannot chat (loaded from DB on startup)

// Generate unique guest username using an incrementing counter (never reused)
async function generateGuestUsername(): Promise<string> {
  const result = await queryOne<{ value: string }>(
    `UPDATE settings SET value = (CAST(value AS INTEGER) + 1)::TEXT, updated_at = CURRENT_TIMESTAMP
     WHERE key = 'guest_counter' RETURNING value`
  )
  const num = result?.value || '1'
  return `n00b_${num}`
}

// Parse User-Agent to extract device information
function parseDeviceInfo(userAgent: string): DeviceInfo {
  const parser = new UAParser(userAgent)
  const result = parser.getResult()

  // Determine device type
  let type = 'desktop'
  if (result.device.type === 'mobile') type = 'mobile'
  else if (result.device.type === 'tablet') type = 'tablet'
  else if (result.ua?.toLowerCase().includes('bot')) type = 'bot'
  else if (!result.browser.name) type = 'unknown'

  // Format OS with version
  let os = result.os.name || 'Unknown'
  if (result.os.version) os += ` ${result.os.version}`

  // Format browser with version
  let browser = result.browser.name || 'Unknown'
  if (result.browser.version) {
    // Only show major version
    const majorVersion = result.browser.version.split('.')[0]
    browser += ` ${majorVersion}`
  }

  // Device model (mainly for mobile)
  let device: string | null = null
  if (result.device.vendor && result.device.model) {
    device = `${result.device.vendor} ${result.device.model}`
  } else if (result.device.model) {
    device = result.device.model
  }

  return { type, os, browser, device }
}

// Fetch geolocation from IP address (async, non-blocking)
async function fetchLocation(ip: string): Promise<LocationInfo | null> {
  // Skip local/private IPs
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return { country: 'Local', region: '', city: 'Localhost', isp: 'Local Network', ip }
  }

  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,isp,query`)
    if (!response.ok) return null

    const data = await response.json()
    if (data.status !== 'success') return null

    return {
      country: data.country || 'Unknown',
      region: data.regionName || '',
      city: data.city || 'Unknown',
      isp: data.isp || 'Unknown',
      ip: data.query || ip,
    }
  } catch {
    return null
  }
}

// Get current rate limit (can be updated by admin)
export function getMessageRateLimit(): number {
  return messageRateLimitMs
}

// Set rate limit (called by admin endpoint) - also persists to database
export async function setMessageRateLimit(ms: number): Promise<void> {
  messageRateLimitMs = Math.max(0, Math.min(ms, 60000)) // Clamp between 0 and 60 seconds

  // Persist to database
  await execute(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ('chat_rate_limit_ms', $1, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
    [String(messageRateLimitMs)]
  )

  // Broadcast to all connected clients
  if (ioInstance) {
    ioInstance.emit('chat:rateLimit', { rateLimitMs: messageRateLimitMs })
  }
}

// Load rate limit from database (called on startup)
export async function loadMessageRateLimit(): Promise<void> {
  const result = await queryOne<{ value: string }>(
    'SELECT value FROM settings WHERE key = $1',
    ['chat_rate_limit_ms']
  )
  if (result?.value) {
    const loaded = parseInt(result.value, 10)
    if (!isNaN(loaded) && loaded >= 0) {
      messageRateLimitMs = loaded
      console.log(`[CHAT] Loaded rate limit from database: ${messageRateLimitMs}ms`)
    }
  }
}

// Get guest chat status
export function getGuestChatEnabled(): boolean {
  return guestChatEnabled
}

// Set guest chat status (called by admin endpoint) - also persists to database
export async function setGuestChatEnabled(enabled: boolean): Promise<void> {
  guestChatEnabled = enabled

  // Persist to database
  await execute(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ('guest_chat_enabled', $1, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
    [String(enabled)]
  )

  // Broadcast to all connected clients
  if (ioInstance) {
    ioInstance.emit('chat:guestChatStatus', { enabled: guestChatEnabled })
  }
}

// Load guest chat status from database (called on startup)
export async function loadGuestChatEnabled(): Promise<void> {
  const result = await queryOne<{ value: string }>(
    'SELECT value FROM settings WHERE key = $1',
    ['guest_chat_enabled']
  )
  if (result?.value) {
    guestChatEnabled = result.value === 'true'
    console.log(`[CHAT] Loaded guest chat enabled from database: ${guestChatEnabled}`)
  }
}

// Get list of online users for broadcasting
function getOnlineUsersList() {
  const users: Array<{ username: string; avatarColor: string; avatarImage: string | null; isGuest: boolean }> = []
  connectedUsers.forEach((user) => {
    // Only add unique usernames (in case same user has multiple connections)
    if (!users.some(u => u.username === user.username)) {
      users.push({
        username: user.username,
        avatarColor: user.avatarColor,
        avatarImage: user.avatarImage,
        isGuest: user.isGuest,
      })
    }
  })
  // Sort: registered users first, then alphabetically
  return users.sort((a, b) => {
    if (a.isGuest !== b.isGuest) return a.isGuest ? 1 : -1
    return a.username.localeCompare(b.username)
  })
}

interface MessageWithReply extends Message {
  reply_username?: string
  reply_content?: string
  current_username?: string
  reply_current_username?: string
  current_avatar_color?: string
  current_avatar_image?: string | null
  current_is_admin?: number
  reply_current_avatar_color?: string
}

function formatMessage(msg: MessageWithReply): ChatMessage {
  // Use current username from users table if available (for registered users)
  // Fall back to stored username (for guests or if user was deleted)
  const displayUsername = msg.current_username || msg.username
  const displayAvatarColor = msg.current_avatar_color || msg.avatar_color
  const displayAvatarImage = msg.current_avatar_image || null

  return {
    id: String(msg.id),
    username: displayUsername,
    text: msg.is_deleted === 1 ? '[Message deleted.]' : msg.content,
    avatarColor: displayAvatarColor,
    avatarImage: displayAvatarImage,
    isGuest: msg.is_guest === 1,
    isAdmin: msg.current_is_admin === 1,
    isDeleted: msg.is_deleted === 1,
    isEdited: msg.is_edited === 1,
    userId: msg.user_id,
    timestamp: new Date(msg.created_at).getTime(),
    replyTo: msg.reply_to_id ? {
      id: String(msg.reply_to_id),
      username: msg.reply_current_username || msg.reply_username || 'Unknown',
      text: msg.reply_content || '[Message unavailable]'
    } : null,
  }
}

export async function setupChatSocket(io: Server) {
  // Store io instance for broadcasting
  ioInstance = io

  // Load settings from database
  await loadMessageRateLimit()
  await loadGuestChatEnabled()
  await loadWordFilter()

  // Check for expired bans on startup and every minute
  await checkExpiredBans()
  setInterval(checkExpiredBans, 60000)

  // Clean up stale sessions on startup and every hour
  await cleanupStaleSessions()
  setInterval(cleanupStaleSessions, 60 * 60 * 1000)


  // Load recent messages from database on startup (with reply info and current usernames)
  const savedMessages = await query<MessageWithReply>(`
    SELECT m.*,
           u.username as current_username,
           u.avatar_color as current_avatar_color,
           u.avatar_image as current_avatar_image,
           u.is_admin as current_is_admin,
           r.username as reply_username,
           r.content as reply_content,
           ru.username as reply_current_username
    FROM messages m
    LEFT JOIN users u ON m.user_id = u.id
    LEFT JOIN messages r ON m.reply_to_id = r.id
    LEFT JOIN users ru ON r.user_id = ru.id
    ORDER BY m.created_at DESC
    LIMIT $1
  `, [MAX_RECENT_MESSAGES])

  console.log(`[CHAT] Loaded ${savedMessages.length} messages from database`)
  recentMessages.push(...savedMessages.reverse().map(formatMessage))

  io.on('connection', async (socket: Socket) => {
    const auth = socket.handshake.auth
    let user: ConnectedUser

    // Parse device info from User-Agent
    const userAgent = socket.handshake.headers['user-agent'] || ''
    const device = parseDeviceInfo(userAgent)

    // Get client IP address (handle proxies)
    const forwarded = socket.handshake.headers['x-forwarded-for']
    const clientIp = forwarded
      ? (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : forwarded[0])
      : socket.handshake.address

    // Authenticate user
    if (auth.token) {
      const payload = verifyToken(auth.token) as JWTPayload | null
      if (payload) {
        // ALWAYS fetch current user info from database - token username may be stale
        const dbUser = await queryOne<User>(
          'SELECT username, avatar_color, avatar_image FROM users WHERE id = $1',
          [payload.userId]
        )
        if (dbUser) {
          user = {
            socketId: socket.id,
            username: dbUser.username, // Use DB username, NOT token username
            avatarColor: dbUser.avatar_color || '#00ffff',
            avatarImage: dbUser.avatar_image || null,
            isGuest: false,
            userId: payload.userId,
            connectedAt: Date.now(),
            currentPage: auth.currentPage || '/',
            device,
            location: null,
            currentGame: null,
          }
        } else {
          // User not found in DB (deleted?), treat as guest
          user = {
            socketId: socket.id,
            username: await generateGuestUsername(),
            avatarColor: '#606060',
            avatarImage: null,
            isGuest: true,
            connectedAt: Date.now(),
            currentPage: auth.currentPage || '/',
            device,
            location: null,
            currentGame: null,
          }
        }
      } else {
        // Invalid token, treat as guest
        user = {
          socketId: socket.id,
          username: await generateGuestUsername(),
          avatarColor: '#606060',
          avatarImage: null,
          isGuest: true,
          connectedAt: Date.now(),
          currentPage: auth.currentPage || '/',
          device,
          location: null,
          currentGame: null,
        }
      }
    } else {
      // Guest user
      user = {
        socketId: socket.id,
        username: await generateGuestUsername(),
        avatarColor: '#606060',
        avatarImage: null,
        isGuest: true,
        connectedAt: Date.now(),
        currentPage: auth.currentPage || '/',
        device,
        location: null,
        currentGame: null,
      }
    }

    connectedUsers.set(socket.id, user)

    // Fetch location asynchronously (don't block connection)
    fetchLocation(clientIp).then(location => {
      const existing = connectedUsers.get(socket.id)
      if (existing) {
        connectedUsers.set(socket.id, { ...existing, location })
      }
    })

    // Update last_active for registered users
    if (user.userId) {
      updateLastActive(user.userId).catch(() => {})
    }

    // Send chat history to new user
    socket.emit('chat:history', recentMessages)

    // Send current chat status
    const chatStatus = await getChatStatus()
    socket.emit('chat:status', chatStatus)

    // Send guest chat status
    socket.emit('chat:guestChatStatus', { enabled: guestChatEnabled })

    // Broadcast updated user list to all clients
    io.emit('chat:users', getOnlineUsersList())

    console.log(`User connected: ${user.username} (${user.isGuest ? 'guest' : 'registered'})`)

    // Handle incoming messages
    socket.on('chat:send', async (data: { text: string; replyToId?: string }) => {
      const sender = connectedUsers.get(socket.id)

      if (!sender) {
        return
      }

      // Check if guests are allowed to chat
      if (sender.isGuest && !guestChatEnabled) {
        socket.emit('chat:error', { message: 'Only registered users can send messages' })
        return
      }

      // Check if chat is enabled
      const status = await getChatStatus()
      if (!status.enabled) {
        socket.emit('chat:error', { message: 'Chat is currently disabled' })
        return
      }

      // Check if user is muted and get current avatar info
      let currentAvatarColor = sender.avatarColor
      let currentAvatarImage = sender.avatarImage
      let isAdmin = false
      if (sender.userId) {
        const user = await queryOne<User>(
          'SELECT is_muted, is_admin, avatar_color, avatar_image FROM users WHERE id = $1',
          [sender.userId]
        )
        if (user?.is_muted === 1) {
          socket.emit('chat:error', { message: 'You have been muted and cannot send messages' })
          return
        }
        isAdmin = user?.is_admin === 1
        // Always use the database avatar info (most up-to-date)
        if (user?.avatar_color) {
          currentAvatarColor = user.avatar_color
        }
        currentAvatarImage = user?.avatar_image || null
        // Update the cache if it differs
        if (sender.avatarColor !== currentAvatarColor || sender.avatarImage !== currentAvatarImage) {
          connectedUsers.set(socket.id, { ...sender, avatarColor: currentAvatarColor, avatarImage: currentAvatarImage })
        }
      }

      // Rate limiting (skip if rate limit is 0)
      const now = Date.now()
      const lastTime = lastMessageTime.get(socket.id) || 0
      if (messageRateLimitMs > 0 && now - lastTime < messageRateLimitMs) {
        socket.emit('chat:error', { message: 'Slow down! Wait a moment before sending another message.' })
        return
      }
      lastMessageTime.set(socket.id, now)

      if (!data.text || data.text.trim().length === 0) {
        return
      }

      const text = data.text.trim().slice(0, 500) // Limit message length

      // Check word filter
      const filterResult = checkWordFilter(text)
      if (filterResult.blocked) {
        socket.emit('chat:error', { message: 'Your message contains blocked content and cannot be sent.' })
        return
      }

      // Update last_active
      if (sender.userId) {
        updateLastActive(sender.userId).catch(() => {})
      }

      try {
        // Get reply info if replying to a message
        let replyTo: ReplyInfo | null = null
        const replyToId = data.replyToId ? parseInt(data.replyToId) : null

        if (replyToId) {
          // First check cache for reply info
          const cachedReply = recentMessages.find(m => m.id === data.replyToId)
          if (cachedReply) {
            replyTo = {
              id: cachedReply.id,
              username: cachedReply.username,
              text: cachedReply.isDeleted ? '[Message deleted.]' : cachedReply.text
            }
          } else {
            // Fall back to database lookup
            const replyMsg = await queryOne<Message>(
              'SELECT id, username, content, is_deleted FROM messages WHERE id = $1',
              [replyToId]
            )
            if (replyMsg) {
              replyTo = {
                id: String(replyMsg.id),
                username: replyMsg.username,
                text: replyMsg.is_deleted === 1 ? '[Message deleted.]' : replyMsg.content
              }
            }
          }
        }

        // Save to database with current avatar color from DB
        const result = await queryOne<{ id: number }>(
          'INSERT INTO messages (user_id, username, content, avatar_color, is_guest, reply_to_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
          [sender.userId || null, sender.username, text, currentAvatarColor, sender.isGuest ? 1 : 0, replyToId]
        )

        if (!sender.userId) {
          console.log(`[CHAT] Warning: Message saved without user_id for ${sender.username} (isGuest: ${sender.isGuest})`)
        }

        const message: ChatMessage = {
          id: String(result!.id),
          username: sender.username,
          text,
          avatarColor: currentAvatarColor,
          avatarImage: currentAvatarImage,
          isGuest: false,
          isAdmin,
          isDeleted: false,
          isEdited: false,
          userId: sender.userId || null,
          timestamp: Date.now(),
          replyTo,
        }

        // Add to recent messages
        recentMessages.push(message)
        if (recentMessages.length > MAX_RECENT_MESSAGES) {
          recentMessages.shift()
        }

        // Broadcast message to all users
        io.emit('chat:message', message)
      } catch (error) {
        console.error('Failed to save message:', error)
        socket.emit('chat:error', { message: 'Failed to send message' })
      }
    })

    // Handle message deletion (own messages or admin)
    socket.on('chat:delete', async (data: { messageId: number }) => {
      const sender = connectedUsers.get(socket.id)

      if (!sender || sender.isGuest || !sender.userId) {
        return
      }

      try {
        // Get the message to check ownership
        const message = await queryOne<Message>(
          'SELECT user_id, is_deleted FROM messages WHERE id = $1',
          [data.messageId]
        )

        if (!message) {
          socket.emit('chat:error', { message: 'Message not found' })
          return
        }

        // Check if user is admin or owns the message
        const user = await queryOne<User>(
          'SELECT is_admin FROM users WHERE id = $1',
          [sender.userId]
        )

        const isAdmin = user?.is_admin === 1
        const isOwner = message.user_id === sender.userId

        // If already soft-deleted, only admin can hard delete
        if (message.is_deleted === 1) {
          if (!isAdmin) {
            return // Already deleted, non-admin can't do anything more
          }

          // Hard delete - remove from database entirely
          await execute('DELETE FROM messages WHERE id = $1', [data.messageId])

          // Remove from cache
          const index = recentMessages.findIndex(m => m.id === String(data.messageId))
          if (index !== -1) {
            recentMessages.splice(index, 1)
          }

          // Update any cached messages that were replies to this one
          recentMessages.forEach(msg => {
            if (msg.replyTo && msg.replyTo.id === String(data.messageId)) {
              msg.replyTo.text = '[Message removed.]'
            }
          })

          // Broadcast hard deletion to all clients
          io.emit('chat:deleted', { messageId: data.messageId, hardDelete: true })
          return
        }

        if (!isAdmin && !isOwner) {
          socket.emit('chat:error', { message: 'You can only delete your own messages' })
          return
        }

        // Soft delete - update content to [Message deleted.]
        await execute(
          'UPDATE messages SET content = $1, is_deleted = 1 WHERE id = $2',
          ['[Message deleted.]', data.messageId]
        )

        // Update cache
        const index = recentMessages.findIndex(m => m.id === String(data.messageId))
        if (index !== -1) {
          recentMessages[index] = {
            ...recentMessages[index],
            text: '[Message deleted.]',
            isDeleted: true
          }
        }

        // Update any cached messages that were replies to this one
        recentMessages.forEach(msg => {
          if (msg.replyTo && msg.replyTo.id === String(data.messageId)) {
            msg.replyTo.text = '[Message deleted.]'
          }
        })

        // Broadcast soft deletion to all clients (includes reply content updates)
        io.emit('chat:deleted', { messageId: data.messageId, softDelete: true })
      } catch (error) {
        console.error('Failed to delete message:', error)
      }
    })

    // Handle message editing (own messages only)
    socket.on('chat:edit', async (data: { messageId: number; newText: string }) => {
      const sender = connectedUsers.get(socket.id)

      if (!sender || sender.isGuest || !sender.userId) {
        socket.emit('chat:error', { message: 'You must be logged in to edit messages' })
        return
      }

      try {
        // Get the message to check ownership
        const message = await queryOne<Message>(
          'SELECT user_id, is_deleted FROM messages WHERE id = $1',
          [data.messageId]
        )

        if (!message) {
          socket.emit('chat:error', { message: 'Message not found' })
          return
        }

        if (message.is_deleted === 1) {
          socket.emit('chat:error', { message: 'Cannot edit a deleted message' })
          return
        }

        // Only the owner can edit their message
        if (message.user_id !== sender.userId) {
          socket.emit('chat:error', { message: 'You can only edit your own messages' })
          return
        }

        const newText = data.newText.trim().slice(0, 500)
        if (!newText) {
          socket.emit('chat:error', { message: 'Message cannot be empty' })
          return
        }

        // Update in database
        await execute(
          'UPDATE messages SET content = $1, is_edited = 1 WHERE id = $2',
          [newText, data.messageId]
        )

        // Update cache
        const index = recentMessages.findIndex(m => m.id === String(data.messageId))
        if (index !== -1) {
          recentMessages[index] = {
            ...recentMessages[index],
            text: newText,
            isEdited: true
          }
        }

        // Broadcast edit to all clients
        io.emit('chat:edited', { messageId: data.messageId, newText, isEdited: true })
      } catch (error) {
        console.error('Failed to edit message:', error)
        socket.emit('chat:error', { message: 'Failed to edit message' })
      }
    })

    // Handle page navigation updates
    socket.on('page:update', (data: { page: string }) => {
      const user = connectedUsers.get(socket.id)
      if (user && data.page) {
        // Clear currentGame if navigating away from a game page
        const isGamePage = data.page.startsWith('/game/') || data.page.match(/^\/[a-z0-9]+$/i)
        const wasOnGame = user.currentGame !== null
        connectedUsers.set(socket.id, {
          ...user,
          currentPage: data.page,
          currentGame: (isGamePage && wasOnGame) ? user.currentGame : (isGamePage ? user.currentGame : null)
        })
      }
    })

    // Handle game start (for tracking rounds/restarts)
    socket.on('game:start', (data: { gameId: string }) => {
      const user = connectedUsers.get(socket.id)
      if (user && data.gameId) {
        const now = Date.now()
        const isSameGame = user.currentGame?.gameId === data.gameId
        connectedUsers.set(socket.id, {
          ...user,
          currentGame: {
            gameId: data.gameId,
            score: 0,
            stats: null,
            startedAt: isSameGame ? user.currentGame!.startedAt : now,
            rounds: isSameGame ? user.currentGame!.rounds + 1 : 1
          }
        })
      }
    })

    // Handle game score updates (for real-time score display in admin)
    socket.on('game:scoreUpdate', (data: { gameId: string; score: number; stats?: string }) => {
      const user = connectedUsers.get(socket.id)
      if (user && data.gameId) {
        const now = Date.now()
        const isSameGame = user.currentGame?.gameId === data.gameId
        connectedUsers.set(socket.id, {
          ...user,
          currentGame: {
            gameId: data.gameId,
            score: data.score || 0,
            stats: data.stats || null,
            startedAt: isSameGame ? user.currentGame!.startedAt : now,
            rounds: isSameGame ? user.currentGame!.rounds : 1
          }
        })
      }
    })

    // Handle game end (clear currentGame)
    socket.on('game:end', () => {
      const user = connectedUsers.get(socket.id)
      if (user) {
        connectedUsers.set(socket.id, { ...user, currentGame: null })
      }
    })

    // Handle disconnect
    socket.on('disconnect', () => {
      const disconnectedUser = connectedUsers.get(socket.id)
      connectedUsers.delete(socket.id)
      lastMessageTime.delete(socket.id)
      io.emit('chat:users', getOnlineUsersList())

      if (disconnectedUser) {
        console.log(`User disconnected: ${disconnectedUser.username}`)
      }
    })
  })
}

// Get all connected users with detailed info (for admin panel)
export function getConnectedUsersDetailed() {
  const users: Array<{
    socketId: string
    username: string
    avatarColor: string
    avatarImage: string | null
    isGuest: boolean
    userId?: number
    connectedAt: number
    currentPage: string
    device: DeviceInfo
    location: LocationInfo | null
    currentGame: CurrentGameInfo | null
  }> = []

  connectedUsers.forEach((user) => {
    users.push({
      socketId: user.socketId,
      username: user.username,
      avatarColor: user.avatarColor,
      avatarImage: user.avatarImage,
      isGuest: user.isGuest,
      userId: user.userId,
      connectedAt: user.connectedAt,
      currentPage: user.currentPage,
      device: user.device,
      location: user.location,
      currentGame: user.currentGame,
    })
  })

  // Sort by connection time (oldest first)
  return users.sort((a, b) => a.connectedAt - b.connectedAt)
}
