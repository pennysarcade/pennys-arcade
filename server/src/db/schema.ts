import pg from 'pg'
import bcrypt from 'bcryptjs'

const { Pool } = pg

// Use DATABASE_URL from Railway (automatically provided when you add PostgreSQL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

// Helper functions for database queries
export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params)
  return result.rows as T[]
}

export async function queryOne<T = unknown>(text: string, params?: unknown[]): Promise<T | undefined> {
  const result = await pool.query(text, params)
  return result.rows[0] as T | undefined
}

export async function execute(text: string, params?: unknown[]): Promise<{ rowCount: number; insertId?: number }> {
  const result = await pool.query(text, params)
  return {
    rowCount: result.rowCount || 0,
    insertId: result.rows[0]?.id,
  }
}

// Wipe all user data - call this before initDatabase when WIPE_USERS_ON_DEPLOY is set
export async function wipeAllUsers() {
  console.log('[DATABASE] Wiping all user data...')

  // Delete in order of foreign key dependencies (ignore errors if tables don't exist)
  const tables = ['audit_log', 'username_history', 'avatar_changes', 'game_sessions', 'high_scores', 'messages', 'word_filter', 'users']
  for (const table of tables) {
    try {
      await pool.query(`DELETE FROM ${table}`)
    } catch { /* table may not exist */ }
  }

  // Reset sequences so IDs start fresh (ignore errors if sequences don't exist)
  const sequences = ['users_id_seq', 'messages_id_seq', 'high_scores_id_seq', 'game_sessions_id_seq', 'audit_log_id_seq', 'username_history_id_seq', 'avatar_changes_id_seq', 'word_filter_id_seq']
  for (const seq of sequences) {
    try {
      await pool.query(`ALTER SEQUENCE ${seq} RESTART WITH 1`)
    } catch { /* sequence may not exist */ }
  }

  console.log('[DATABASE] All user data wiped successfully')
}

export async function initDatabase() {
  // Check if we should wipe all users (one-time deployment action)
  if (process.env.WIPE_USERS_ON_DEPLOY === 'true') {
    await wipeAllUsers()
  }

  // Create users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      avatar_color TEXT DEFAULT '#00ffff',
      is_admin INTEGER DEFAULT 0,
      discord_id TEXT UNIQUE,
      discord_username TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_avatar_change TIMESTAMP
    )
  `)

  // Add last_avatar_change column if it doesn't exist (migration)
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN last_avatar_change TIMESTAMP`)
  } catch { /* column exists */ }

  // Add ban/mute columns (migration)
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0`)
  } catch { /* column exists */ }
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN is_muted INTEGER DEFAULT 0`)
  } catch { /* column exists */ }
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN ban_reason TEXT`)
  } catch { /* column exists */ }

  // Add last_username_change column (migration)
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN last_username_change TIMESTAMP`)
  } catch { /* column exists */ }

  // Add ban_expires_at for timed bans (migration)
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN ban_expires_at TIMESTAMP`)
  } catch { /* column exists */ }

  // Add last_active for tracking user activity (migration)
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN last_active TIMESTAMP`)
  } catch { /* column exists */ }

  // Add email verification columns (migration)
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`)
    // Mark all existing users as verified (they were created before verification was required)
    await pool.query(`UPDATE users SET email_verified = 1 WHERE email_verified = 0 OR email_verified IS NULL`)
    console.log('Marked existing users as email verified')
  } catch { /* column exists */ }
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN verification_code TEXT`)
  } catch { /* column exists */ }
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN verification_code_expires TIMESTAMP`)
  } catch { /* column exists */ }
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN verification_code_attempts INTEGER DEFAULT 0`)
  } catch { /* column exists */ }

  // Add avatar_image column for custom pixel art avatars (migration)
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN avatar_image TEXT`)
  } catch { /* column exists */ }

  // Create avatar_changes table for rate limiting avatar uploads (12 per 24 hours)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS avatar_changes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Create index for avatar_changes lookup
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_avatar_changes_user ON avatar_changes(user_id, changed_at DESC)
  `)

  // Create messages table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      username TEXT NOT NULL,
      content TEXT NOT NULL,
      avatar_color TEXT DEFAULT '#606060',
      is_guest INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      is_edited INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Add is_deleted and is_edited columns (migration)
  try {
    await pool.query(`ALTER TABLE messages ADD COLUMN is_deleted INTEGER DEFAULT 0`)
  } catch { /* column exists */ }
  try {
    await pool.query(`ALTER TABLE messages ADD COLUMN is_edited INTEGER DEFAULT 0`)
  } catch { /* column exists */ }
  // Add reply_to_id column (migration)
  try {
    await pool.query(`ALTER TABLE messages ADD COLUMN reply_to_id INTEGER REFERENCES messages(id)`)
  } catch { /* column exists */ }

  // Create high_scores table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS high_scores (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      username TEXT NOT NULL,
      avatar_color TEXT DEFAULT '#00ffff',
      game_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      stats TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Create index for high scores
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_high_scores_game ON high_scores(game_id, score DESC)
  `)

  // Add platform column to high_scores (migration) - 'desktop' or 'mobile'
  try {
    await pool.query(`ALTER TABLE high_scores ADD COLUMN platform TEXT DEFAULT 'desktop'`)
  } catch { /* column exists */ }

  // Create game_sessions table for tracking all plays
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      game_id TEXT NOT NULL,
      score INTEGER DEFAULT 0,
      status TEXT DEFAULT 'playing',
      stats TEXT,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP
    )
  `)

  // Create index for game sessions
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_game_sessions_user ON game_sessions(user_id, game_id)
  `)

  // Add platform column to game_sessions (migration)
  try {
    await pool.query(`ALTER TABLE game_sessions ADD COLUMN platform TEXT DEFAULT 'desktop'`)
  } catch { /* column exists */ }

  // Create audit_log table for tracking admin actions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      admin_id INTEGER REFERENCES users(id),
      admin_username TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      target_name TEXT,
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Create index for audit log
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC)
  `)

  // Create username_history table for tracking username changes
  await pool.query(`
    CREATE TABLE IF NOT EXISTS username_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      old_username TEXT NOT NULL,
      new_username TEXT NOT NULL,
      changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Create index for username history
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_username_history_user ON username_history(user_id)
  `)

  // Create word_filter table for chat moderation
  await pool.query(`
    CREATE TABLE IF NOT EXISTS word_filter (
      id SERIAL PRIMARY KEY,
      word TEXT UNIQUE NOT NULL,
      is_regex INTEGER DEFAULT 0,
      action TEXT DEFAULT 'block',
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Create settings table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Initialize settings
  await pool.query(`
    INSERT INTO settings (key, value)
    VALUES ('chat_enabled', 'true')
    ON CONFLICT (key) DO NOTHING
  `)
  await pool.query(`
    INSERT INTO settings (key, value)
    VALUES ('registrations_paused', 'false')
    ON CONFLICT (key) DO NOTHING
  `)
  await pool.query(`
    INSERT INTO settings (key, value)
    VALUES ('maintenance_mode', 'false')
    ON CONFLICT (key) DO NOTHING
  `)
  await pool.query(`
    INSERT INTO settings (key, value)
    VALUES ('maintenance_message', 'Site is under maintenance. Please check back soon.')
    ON CONFLICT (key) DO NOTHING
  `)
  await pool.query(`
    INSERT INTO settings (key, value)
    VALUES ('chat_rate_limit_ms', '1000')
    ON CONFLICT (key) DO NOTHING
  `)

  console.log('Database initialized')
}

export interface User {
  id: number
  username: string
  email: string
  password_hash: string | null
  avatar_color: string
  avatar_image: string | null
  is_admin: number
  is_banned: number
  is_muted: number
  ban_reason: string | null
  ban_expires_at: string | null
  discord_id: string | null
  discord_username: string | null
  created_at: string
  last_avatar_change: string | null
  last_username_change: string | null
  last_active: string | null
  email_verified: number
  verification_code: string | null
  verification_code_expires: string | null
  verification_code_attempts: number
}

export interface AvatarChange {
  id: number
  user_id: number
  changed_at: string
}

export interface Message {
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

export interface HighScore {
  id: number
  user_id: number
  username: string
  avatar_color: string
  game_id: string
  score: number
  stats: string | null
  platform: string
  created_at: string
}

export interface GameSession {
  id: number
  user_id: number
  game_id: string
  score: number
  status: string
  stats: string | null
  platform: string
  started_at: string
  ended_at: string | null
}

export interface AuditLog {
  id: number
  admin_id: number
  admin_username: string
  action: string
  target_type: string | null
  target_id: number | null
  target_name: string | null
  details: string | null
  created_at: string
}

export interface UsernameHistory {
  id: number
  user_id: number
  old_username: string
  new_username: string
  changed_at: string
}

export interface WordFilter {
  id: number
  word: string
  is_regex: number
  action: string
  created_by: number | null
  created_at: string
}
