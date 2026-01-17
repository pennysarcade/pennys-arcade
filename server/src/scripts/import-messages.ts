import pg from 'pg'
import fs from 'fs'

const { Pool } = pg

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

interface ExportData {
  exportedAt: string
  messageCount: number
  messages: ExportedMessage[]
}

async function importMessages() {
  const filepath = process.argv[2]

  if (!filepath) {
    console.error('Usage: npx ts-node src/scripts/import-messages.ts <backup-file.json>')
    console.error('Example: npx ts-node src/scripts/import-messages.ts backups/messages-2026-01-17.json')
    process.exit(1)
  }

  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is required')
    process.exit(1)
  }

  // Read and parse backup file
  if (!fs.existsSync(filepath)) {
    console.error(`ERROR: File not found: ${filepath}`)
    process.exit(1)
  }

  let exportData: ExportData
  try {
    const fileContent = fs.readFileSync(filepath, 'utf-8')
    exportData = JSON.parse(fileContent)
  } catch (error) {
    console.error('ERROR: Failed to parse JSON file:', error)
    process.exit(1)
  }

  // Validate data structure
  if (!exportData.messages || !Array.isArray(exportData.messages)) {
    console.error('ERROR: Invalid backup file format - missing messages array')
    process.exit(1)
  }

  console.log(`Backup file info:`)
  console.log(`  Exported at: ${exportData.exportedAt}`)
  console.log(`  Message count: ${exportData.messageCount}`)
  console.log('')

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  })

  try {
    console.log('Connecting to database...')

    let imported = 0
    let skipped = 0

    // Process messages in batches to avoid memory issues
    const batchSize = 100
    for (let i = 0; i < exportData.messages.length; i += batchSize) {
      const batch = exportData.messages.slice(i, i + batchSize)

      for (const msg of batch) {
        try {
          // Use INSERT ... ON CONFLICT DO NOTHING to skip duplicates by id
          const result = await pool.query(`
            INSERT INTO messages (id, user_id, username, content, avatar_color, is_guest, is_deleted, is_edited, reply_to_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (id) DO NOTHING
          `, [
            msg.id,
            msg.user_id,
            msg.username,
            msg.content,
            msg.avatar_color,
            msg.is_guest,
            msg.is_deleted,
            msg.is_edited,
            msg.reply_to_id,
            msg.created_at,
          ])

          if (result.rowCount && result.rowCount > 0) {
            imported++
          } else {
            skipped++
          }
        } catch (error) {
          console.error(`Warning: Failed to import message ${msg.id}:`, error)
          skipped++
        }
      }

      // Progress indicator
      const progress = Math.min(i + batchSize, exportData.messages.length)
      process.stdout.write(`\rProcessed ${progress}/${exportData.messages.length} messages...`)
    }

    // Update the sequence to avoid ID conflicts with future messages
    const maxIdResult = await pool.query('SELECT MAX(id) as max_id FROM messages')
    const maxId = maxIdResult.rows[0]?.max_id || 0
    if (maxId > 0) {
      await pool.query(`SELECT setval('messages_id_seq', $1, true)`, [maxId])
    }

    console.log(`\n\nImport complete!`)
    console.log(`Messages imported: ${imported}`)
    console.log(`Messages skipped (duplicates): ${skipped}`)
  } catch (error) {
    console.error('Import failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

importMessages()
