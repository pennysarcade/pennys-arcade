import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'

import { initDatabase } from './db/schema.js'
import authRoutes from './routes/auth.js'
import scoresRoutes from './routes/scores.js'
import discordRoutes from './routes/discord.js'
import { setupChatSocket } from './socket/chat.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Ensure data directory exists
const dataDir = join(__dirname, '../data')
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}

// Ensure avatars directory exists (use AVATARS_DIR env var for Railway volume, fallback for local dev)
const avatarsDir = process.env.AVATARS_DIR || join(__dirname, '../avatars')
console.log(`[AVATARS] Using directory: ${avatarsDir} (env: ${process.env.AVATARS_DIR || 'not set'})`)
if (!existsSync(avatarsDir)) {
  mkdirSync(avatarsDir, { recursive: true })
  console.log(`[AVATARS] Created directory: ${avatarsDir}`)
}

async function startServer() {
  // Initialize database
  await initDatabase()

  const app = express()
  const httpServer = createServer(app)

  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:5173'],
      methods: ['GET', 'POST'],
    },
  })

  // Middleware
  app.use(cors())
  app.use(express.json())

  // API Routes
  app.use('/api/auth', authRoutes)
  app.use('/api/scores', scoresRoutes)
  app.use('/api/discord', discordRoutes)

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // Serve avatar images
  app.use('/avatars', express.static(avatarsDir))

  // Serve static files from client build (production)
  const clientDistPath = join(__dirname, '../../client/dist')
  if (existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath))

    // Handle client-side routing - serve index.html for all non-API routes
    app.get('*', (_req, res) => {
      res.sendFile(join(clientDistPath, 'index.html'))
    })
  }

  // Setup WebSocket handlers
  await setupChatSocket(io)

  const PORT = process.env.PORT || 3001

  httpServer.listen(PORT, () => {
    console.log(`
  ╔═══════════════════════════════════════╗
  ║                                       ║
  ║       PENNY'S ARCADE SERVER           ║
  ║                                       ║
  ║   Running on http://localhost:${PORT}    ║
  ║                                       ║
  ╚═══════════════════════════════════════╝
    `)
  })
}

startServer()
