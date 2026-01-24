import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, mkdirSync, readFileSync } from 'fs'

import { initDatabase } from './db/schema.js'
import authRoutes from './routes/auth.js'
import scoresRoutes from './routes/scores.js'
import discordRoutes from './routes/discord.js'
import { setupChatSocket } from './socket/chat.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Ensure data directory exists
// Path is ../../../data because build outputs to dist/server/src/
const dataDir = join(__dirname, '../../../data')
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}

// Ensure avatars directory exists (use AVATARS_DIR env var for Railway volume, fallback for local dev)
// Path is ../../../avatars because build outputs to dist/server/src/
const avatarsDir = process.env.AVATARS_DIR || join(__dirname, '../../../avatars')
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

  // Graceful shutdown handler
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`)

    httpServer.close(() => {
      console.log('HTTP server closed')
      process.exit(0)
    })

    // Force exit after 10 seconds if graceful shutdown fails
    setTimeout(() => {
      console.log('Forcing shutdown after timeout')
      process.exit(0)
    }, 10000)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

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
  // Path is ../../../../client/dist because build outputs to server/dist/server/src/
  const clientDistPath = join(__dirname, '../../../../client/dist')
  if (existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath))

    // Game metadata for social sharing (OG tags)
    const GAME_META: Record<string, { title: string; description: string; image: string }> = {
      'tessles': {
        title: 'Tessles - Penny\'s Arcade',
        description: 'Dodge, dash, survive!',
        image: 'https://pennysarcade.games/games/tessles/og-image.jpg'
      },
      'onzac': {
        title: 'ONZAC - Penny\'s Arcade',
        description: 'Oh no, zombies are coming!',
        image: 'https://pennysarcade.games/games/onzac/og-image.jpg'
      },
      'orbit': {
        title: 'Orbit - Penny\'s Arcade',
        description: 'Keep the balls in the ring!',
        image: 'https://pennysarcade.games/games/orbit/og-image.jpg'
      }
    }

    // Serve index.html with game-specific OG tags for social sharing
    const serveWithGameMeta = (gameId: string, res: express.Response) => {
      const gameMeta = GAME_META[gameId]
      if (!gameMeta) {
        return res.sendFile(join(clientDistPath, 'index.html'))
      }

      const indexPath = join(clientDistPath, 'index.html')
      let html = readFileSync(indexPath, 'utf-8')

      // Replace OG meta tags
      html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${gameMeta.title}">`)
      html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${gameMeta.description}">`)
      html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${gameMeta.image}">`)
      html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="https://pennysarcade.games/${gameId}">`)

      // Replace Twitter meta tags
      html = html.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${gameMeta.title}">`)
      html = html.replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${gameMeta.description}">`)
      html = html.replace(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${gameMeta.image}">`)

      // Replace page title
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${gameMeta.title}</title>`)

      res.type('html').send(html)
    }

    // Handle game routes with custom OG tags
    app.get('/game/:id', (req, res) => {
      serveWithGameMeta(req.params.id, res)
    })

    // Also handle short game URLs (/:id)
    app.get('/:id', (req, res, next) => {
      if (GAME_META[req.params.id]) {
        serveWithGameMeta(req.params.id, res)
      } else {
        next()
      }
    })

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
