import { Router } from 'express'
import { query, queryOne, execute, User } from '../db/schema.js'
import { generateToken } from '../middleware/auth.js'

const router = Router()

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || ''
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || ''
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3001/api/discord/callback'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

// Redirect to Discord authorization
router.get('/auth', (req, res) => {
  if (!DISCORD_CLIENT_ID) {
    res.status(500).json({ message: 'Discord OAuth not configured' })
    return
  }

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify email',
  })

  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`)
})

// Handle Discord callback
router.get('/callback', async (req, res) => {
  const { code } = req.query

  if (!code || typeof code !== 'string') {
    res.redirect(`${FRONTEND_URL}/?error=discord_auth_failed`)
    return
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    })

    if (!tokenResponse.ok) {
      console.error('Discord token exchange failed:', await tokenResponse.text())
      res.redirect(`${FRONTEND_URL}/?error=discord_auth_failed`)
      return
    }

    const tokenData = await tokenResponse.json() as { access_token: string }

    // Fetch user info from Discord
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    if (!userResponse.ok) {
      console.error('Discord user fetch failed:', await userResponse.text())
      res.redirect(`${FRONTEND_URL}/?error=discord_auth_failed`)
      return
    }

    const discordUser = await userResponse.json() as {
      id: string
      username: string
      email: string | null
      global_name: string | null
    }

    // Check if user exists by Discord ID
    let user = await queryOne<User>(
      'SELECT * FROM users WHERE discord_id = $1',
      [discordUser.id]
    )

    if (!user) {
      // Check if user exists by email (to link accounts)
      if (discordUser.email) {
        user = await queryOne<User>(
          'SELECT * FROM users WHERE email = $1',
          [discordUser.email.toLowerCase()]
        )

        if (user) {
          // Link Discord to existing account
          await execute(
            'UPDATE users SET discord_id = $1, discord_username = $2 WHERE id = $3',
            [discordUser.id, discordUser.username, user.id]
          )
        }
      }
    }

    if (!user) {
      // Create new user
      const displayName = discordUser.global_name || discordUser.username
      let username = displayName.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 20)

      // Ensure username is unique
      let suffix = 1
      let finalUsername = username
      while (await queryOne<User>('SELECT id FROM users WHERE username = $1', [finalUsername])) {
        finalUsername = `${username.substring(0, 16)}_${suffix}`
        suffix++
      }

      const email = discordUser.email?.toLowerCase() || `${discordUser.id}@discord.user`
      const avatarColor = '#5865F2' // Discord blurple

      const result = await queryOne<{ id: number }>(`
        INSERT INTO users (username, email, avatar_color, discord_id, discord_username)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [finalUsername, email, avatarColor, discordUser.id, discordUser.username])

      user = await queryOne<User>(
        'SELECT * FROM users WHERE id = $1',
        [result!.id]
      )
    }

    // Generate JWT token
    const token = generateToken({ userId: user!.id, username: user!.username })

    // Redirect to frontend with token
    res.redirect(`${FRONTEND_URL}/?token=${token}`)
  } catch (error) {
    console.error('Discord auth error:', error)
    res.redirect(`${FRONTEND_URL}/?error=discord_auth_failed`)
  }
})

export default router
