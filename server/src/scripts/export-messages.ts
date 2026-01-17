import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const { Pool } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface ExportedMessage {
  id: number
  user_id: number | null
  username: string
  content: string
  avatar_color: string
  is_guest: number
  is_deleted: number
  is_edited: number
  reply_to_id: number | null
  created_at: string
}

async function exportMessages() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  })

  try {
    console.log('Connecting to database...')

    // Query all messages with user info
    const result = await pool.query<ExportedMessage>(`
      SELECT m.id, m.user_id, m.username, m.content, m.avatar_color,
             m.is_guest, m.is_deleted, m.is_edited, m.reply_to_id, m.created_at
      FROM messages m
      ORDER BY m.id ASC
    `)

    const messages = result.rows

    // Create backup data
    const exportData = {
      exportedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages,
    }

    // Ensure backups directory exists
    const backupsDir = path.join(__dirname, '..', '..', 'backups')
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true })
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `messages-${timestamp}.json`
    const filepath = path.join(backupsDir, filename)

    // Write to file
    fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2))

    console.log(`\nExport complete!`)
    console.log(`Messages exported: ${messages.length}`)
    console.log(`File saved to: ${filepath}`)
  } catch (error) {
    console.error('Export failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

exportMessages()
