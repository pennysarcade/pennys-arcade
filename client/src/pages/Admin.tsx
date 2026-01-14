import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { GAMES } from '../components/Games/ArcadeGrid'
import '../styles/admin.css'

interface User {
  id: number
  username: string
  email: string
  avatar_color: string
  is_admin: number
  is_banned?: number
  is_muted?: number
  ban_reason?: string
  ban_expires_at?: string
  discord_username: string | null
  created_at: string
  last_active?: string
}

interface Message {
  id: number
  user_id: number | null
  username: string
  content: string
  avatar_color: string
  is_guest: number
  is_deleted: number
  is_edited: number
  created_at: string
  email?: string
}

interface GameSession {
  id: number
  user_id: number
  game_id: string
  score: number
  status: string
  started_at: string
  username?: string
}

interface WordFilter {
  id: number
  word: string
  is_regex: number
  action: string
  created_at: string
}

interface AuditLog {
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

interface Stats {
  users: { total: number; newThisWeek: number; active24h: number; active7d: number }
  messages: { total: number; thisWeek: number }
  games: { activeSessions: number; playedToday: number }
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
}

interface HighScore {
  id: number
  user_id: number
  username: string
  avatar_color: string
  game_id: string
  score: number
  created_at: string
}

// All games with banners (for admin purposes)
const ALL_ADMIN_GAMES = GAMES.filter(g => g.banner)

const PAGE_SIZE = 50

// Pagination component
function Pagination({ page, total, onPageChange }: { page: number; total: number; onPageChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / PAGE_SIZE)
  if (totalPages <= 1) return null

  return (
    <div className="pagination">
      <button className="btn btn-sm" disabled={page === 0} onClick={() => onPageChange(page - 1)}>Prev</button>
      <span className="pagination-info">Page {page + 1} of {totalPages} ({total} total)</span>
      <button className="btn btn-sm" disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)}>Next</button>
    </div>
  )
}

type Tab = 'overview' | 'users' | 'content' | 'games' | 'settings'

export default function Admin() {
  const { user, token } = useAuth()
  const { chatStatus } = useSocket()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)

  // Overview/Dashboard
  const [stats, setStats] = useState<Stats | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([])

  // Users (with pagination)
  const [users, setUsers] = useState<User[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [userSort, setUserSort] = useState('created_at')
  const [userOrder, setUserOrder] = useState('desc')
  const [usersPage, setUsersPage] = useState(0)
  const [usersTotal, setUsersTotal] = useState(0)

  // Content (Messages + Word Filter) (with pagination)
  const [messages, setMessages] = useState<Message[]>([])
  const [messageSearch, setMessageSearch] = useState('')
  const [messagesPage, setMessagesPage] = useState(0)
  const [messagesTotal, setMessagesTotal] = useState(0)
  const [wordFilters, setWordFilters] = useState<WordFilter[]>([])
  const [newWord, setNewWord] = useState('')
  const [newWordRegex, setNewWordRegex] = useState(false)

  // Games (Sessions + Scores) (with pagination)
  const [sessions, setSessions] = useState<GameSession[]>([])
  const [sessionStatus, setSessionStatus] = useState('playing')
  const [scores, setScores] = useState<HighScore[]>([])
  const [scoresPage, setScoresPage] = useState(0)
  const [scoresTotal, setScoresTotal] = useState(0)
  const [selectedGame, setSelectedGame] = useState('')
  const [wipePassword, setWipePassword] = useState('')
  const [wipeAllGames, setWipeAllGames] = useState(true)

  // Reset All
  const [resetPassword, setResetPassword] = useState('')
  const [resetDeleteUsers, setResetDeleteUsers] = useState(false)

  // Settings
  const [offlineMessage, setOfflineMessage] = useState('')
  const [chatToggling, setChatToggling] = useState(false)
  const [registrationsPaused, setRegistrationsPaused] = useState(false)
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')
  const [announcementText, setAnnouncementText] = useState('')
  const [chatRateLimit, setChatRateLimit] = useState(1000)

  // Ban Modal
  const [banModal, setBanModal] = useState<{ userId: number; username: string } | null>(null)
  const [banReason, setBanReason] = useState('')
  const [banDuration, setBanDuration] = useState<string>('permanent')

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch { /* ignore */ }
  }, [token])

  const fetchUsers = useCallback(async (page = 0) => {
    try {
      const params = new URLSearchParams()
      if (userSearch) params.set('search', userSearch)
      params.set('sort', userSort)
      params.set('order', userOrder)
      params.set('limit', '50')
      params.set('offset', String(page * 50))

      const res = await fetch(`/api/auth/admin/users?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users)
        setUsersTotal(data.total)
        setUsersPage(page)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [token, userSearch, userSort, userOrder])

  const fetchMessages = useCallback(async (page = 0) => {
    try {
      const params = new URLSearchParams()
      if (messageSearch) params.set('search', messageSearch)
      params.set('limit', '50')
      params.set('offset', String(page * 50))

      const res = await fetch(`/api/auth/admin/recent-messages?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages)
        setMessagesTotal(data.total)
        setMessagesPage(page)
      }
    } catch { /* ignore */ }
  }, [token, messageSearch])

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/auth/admin/sessions?status=${sessionStatus}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions)
      }
    } catch { /* ignore */ }
  }, [token, sessionStatus])

  const fetchSettings = useCallback(async () => {
    try {
      const [regRes, maintRes, rateLimitRes] = await Promise.all([
        fetch('/api/auth/admin/registrations', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/auth/admin/maintenance', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/auth/admin/chat-rate-limit', { headers: { 'Authorization': `Bearer ${token}` } })
      ])

      if (regRes.ok) {
        const data = await regRes.json()
        setRegistrationsPaused(data.paused)
      }
      if (maintRes.ok) {
        const data = await maintRes.json()
        setMaintenanceEnabled(data.enabled)
        setMaintenanceMessage(data.message || '')
      }
      if (rateLimitRes.ok) {
        const data = await rateLimitRes.json()
        setChatRateLimit(data.rateLimitMs)
      }
    } catch { /* ignore */ }
  }, [token])

  const fetchScores = useCallback(async (gameId: string, page = 0) => {
    try {
      const params = new URLSearchParams()
      if (gameId) params.set('gameId', gameId)
      params.set('limit', '50')
      params.set('offset', String(page * 50))

      const res = await fetch(`/api/scores/admin/all?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setScores(data.scores)
        setScoresTotal(data.total)
        setScoresPage(page)
      }
    } catch { /* ignore */ }
  }, [token])

  const fetchWordFilter = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/admin/word-filter', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setWordFilters(data.words)
      }
    } catch { /* ignore */ }
  }, [token])

  const fetchAuditLog = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/admin/audit-log?limit=50', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setAuditLogs(data.logs)
      }
    } catch { /* ignore */ }
  }, [token])

  const fetchConnectedUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/admin/connected-users', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setConnectedUsers(data.users)
      }
    } catch { /* ignore */ }
  }, [token])

  useEffect(() => {
    if (!user?.isAdmin) {
      navigate('/')
      return
    }
    fetchStats()
    fetchUsers()
    fetchSettings()
    fetchAuditLog()
    fetchConnectedUsers()

    // Auto-refresh connected users every 5 seconds
    const interval = setInterval(fetchConnectedUsers, 5000)
    return () => clearInterval(interval)
  }, [user, navigate, fetchStats, fetchUsers, fetchSettings, fetchAuditLog, fetchConnectedUsers])

  useEffect(() => {
    if (activeTab === 'content') {
      fetchMessages()
      fetchWordFilter()
    }
    if (activeTab === 'games') {
      fetchSessions()
      fetchScores(selectedGame) // Empty string means all games
    }
  }, [activeTab, fetchMessages, fetchSessions, fetchScores, selectedGame, fetchWordFilter])

  // Handlers
  const handleToggleChat = async (enable: boolean) => {
    if (!enable && !offlineMessage.trim()) {
      alert('Enter an offline message')
      return
    }
    setChatToggling(true)
    try {
      await fetch('/api/auth/admin/chat-status', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enable, offlineMessage: enable ? null : offlineMessage.trim() })
      })
      if (enable) setOfflineMessage('')
    } catch { alert('Failed') }
    setChatToggling(false)
  }

  const handleToggleRegistrations = async () => {
    try {
      const res = await fetch('/api/auth/admin/registrations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: !registrationsPaused })
      })
      if (res.ok) setRegistrationsPaused(!registrationsPaused)
    } catch { alert('Failed') }
  }

  const handleToggleMaintenance = async () => {
    if (!maintenanceEnabled && !maintenanceMessage.trim()) {
      alert('Enter a maintenance message')
      return
    }
    try {
      const res = await fetch('/api/auth/admin/maintenance', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !maintenanceEnabled, message: maintenanceMessage.trim() })
      })
      if (res.ok) setMaintenanceEnabled(!maintenanceEnabled)
    } catch { alert('Failed') }
  }

  const handleUpdateRateLimit = async () => {
    try {
      await fetch('/api/auth/admin/chat-rate-limit', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rateLimitMs: chatRateLimit })
      })
      alert('Updated')
    } catch { alert('Failed') }
  }

  const handleSendAnnouncement = async () => {
    if (!announcementText.trim()) return
    try {
      await fetch('/api/auth/admin/announcement', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: announcementText.trim() })
      })
      setAnnouncementText('')
      alert('Sent')
    } catch { alert('Failed') }
  }

  const handleClearChat = async () => {
    if (!confirm('Clear ALL chat messages?')) return
    try {
      await fetch('/api/auth/admin/messages', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      setMessages([])
      alert('Cleared')
    } catch { alert('Failed') }
  }

  const handleBanUser = async () => {
    if (!banModal) return
    const duration = banDuration === 'permanent' ? null : parseInt(banDuration)
    try {
      await fetch(`/api/auth/admin/users/${banModal.userId}/ban`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: banReason || 'Banned', duration })
      })
      setBanModal(null)
      setBanReason('')
      setBanDuration('permanent')
      fetchUsers()
    } catch { alert('Failed') }
  }

  const handleUnbanUser = async (userId: number) => {
    try {
      await fetch(`/api/auth/admin/users/${userId}/unban`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      fetchUsers()
    } catch { alert('Failed') }
  }

  const handleMuteUser = async (userId: number) => {
    try {
      await fetch(`/api/auth/admin/users/${userId}/mute`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      fetchUsers()
    } catch { alert('Failed') }
  }

  const handleUnmuteUser = async (userId: number) => {
    try {
      await fetch(`/api/auth/admin/users/${userId}/unmute`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      fetchUsers()
    } catch { alert('Failed') }
  }

  const handleDeleteUser = async (userId: number, username: string) => {
    if (!confirm(`Delete ${username} and all their data?`)) return
    try {
      await fetch(`/api/auth/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      fetchUsers()
    } catch { alert('Failed') }
  }

  const handleDeleteMessage = async (messageId: number) => {
    try {
      await fetch(`/api/auth/admin/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      fetchMessages()
    } catch { alert('Failed') }
  }

  const handleEndSession = async (sessionId: number) => {
    try {
      await fetch(`/api/auth/admin/sessions/${sessionId}/end`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      fetchSessions()
    } catch { alert('Failed') }
  }

  const handleEndAllSessions = async () => {
    if (!confirm('End ALL active game sessions across all games?')) return
    try {
      const res = await fetch('/api/auth/admin/sessions/end-all', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      alert(data.message)
      fetchSessions()
    } catch { alert('Failed') }
  }

  const handleAddWord = async () => {
    if (!newWord.trim()) return
    try {
      await fetch('/api/auth/admin/word-filter', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: newWord.trim(), isRegex: newWordRegex })
      })
      setNewWord('')
      setNewWordRegex(false)
      fetchWordFilter()
    } catch { alert('Failed') }
  }

  const handleRemoveWord = async (wordId: number) => {
    try {
      await fetch(`/api/auth/admin/word-filter/${wordId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      fetchWordFilter()
    } catch { alert('Failed') }
  }

  const handleDeleteScore = async (scoreId: number) => {
    try {
      await fetch(`/api/scores/admin/score/${scoreId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      fetchScores(selectedGame)
    } catch { alert('Failed') }
  }

  const handleWipeScores = async () => {
    const target = wipeAllGames ? 'ALL games' : selectedGame
    if (!confirm(`Wipe all scores for ${target}? This cannot be undone.`)) return
    if (!wipePassword) { alert('Enter password'); return }
    try {
      const endpoint = wipeAllGames ? '/api/scores/admin/all' : `/api/scores/admin/game/${selectedGame}`
      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: wipePassword })
      })
      if (res.ok) {
        const data = await res.json()
        alert(data.message || 'Scores wiped')
        setWipePassword('')
        fetchScores(selectedGame)
      } else {
        const data = await res.json()
        alert(data.message || 'Failed')
      }
    } catch { alert('Failed') }
  }

  const handleResetAll = async () => {
    const msg = resetDeleteUsers
      ? 'This will DELETE ALL: chat messages, high scores, game sessions, AND ALL USER ACCOUNTS (except yours). This CANNOT be undone!'
      : 'This will DELETE ALL: chat messages, high scores, and game sessions. User accounts will be preserved. This CANNOT be undone!'
    if (!confirm(msg)) return
    if (!confirm('Are you ABSOLUTELY sure? Type your password to confirm.')) return
    if (!resetPassword) { alert('Enter password'); return }
    try {
      const res = await fetch('/api/auth/admin/reset-all', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword, deleteUsers: resetDeleteUsers })
      })
      if (res.ok) {
        const data = await res.json()
        alert(data.message || 'Reset complete')
        setResetPassword('')
        setResetDeleteUsers(false)
        fetchStats()
        fetchUsers()
        fetchScores(selectedGame)
        fetchMessages()
        fetchAuditLog()
      } else {
        const data = await res.json()
        alert(data.message || 'Failed')
      }
    } catch { alert('Failed') }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const formatRelative = (dateStr: string | undefined) => {
    if (!dateStr) return 'Never'
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const formatDuration = (connectedAt: number) => {
    const diff = Date.now() - connectedAt
    const secs = Math.floor(diff / 1000)
    if (secs < 60) return `${secs}s`
    const mins = Math.floor(secs / 60)
    if (mins < 60) return `${mins}m ${secs % 60}s`
    const hours = Math.floor(mins / 60)
    return `${hours}h ${mins % 60}m`
  }

  const formatPage = (path: string) => {
    if (path === '/') return 'Home'
    if (path === '/admin') return 'Admin'
    if (path === '/profile') return 'Profile'
    if (path === '/chat') return 'Chat'
    if (path.startsWith('/game/')) return `Game: ${path.split('/')[2]}`
    if (path.startsWith('/games')) return 'Games'
    return path
  }

  if (!user?.isAdmin) return null

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h1>Admin Panel</h1>
      </div>

      <div className="admin-nav">
        {(['overview', 'users', 'content', 'games', 'settings'] as Tab[]).map(tab => (
          <button
            key={tab}
            className={`admin-nav-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'users' && ` (${users.length})`}
          </button>
        ))}
      </div>

      {/* Overview Tab - Dashboard + Audit */}
      {activeTab === 'overview' && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total Users</div>
              <div className="stat-value">{stats?.users.total ?? '-'}</div>
              <div className="stat-sub">+{stats?.users.newThisWeek ?? 0} this week</div>
            </div>
            <div className="stat-card green">
              <div className="stat-label">Active (24h)</div>
              <div className="stat-value">{stats?.users.active24h ?? '-'}</div>
              <div className="stat-sub">{stats?.users.active7d ?? 0} in 7 days</div>
            </div>
            <div className="stat-card yellow">
              <div className="stat-label">Total Messages</div>
              <div className="stat-value">{stats?.messages.total ?? '-'}</div>
              <div className="stat-sub">+{stats?.messages.thisWeek ?? 0} this week</div>
            </div>
            <div className="stat-card purple">
              <div className="stat-label">Games Today</div>
              <div className="stat-value">{stats?.games.playedToday ?? '-'}</div>
              <div className="stat-sub">{stats?.games.activeSessions ?? 0} active now</div>
            </div>
          </div>

          <div className="admin-card">
            <h2>Quick Status</h2>
            <div className="status-grid">
              <div className="status-item">
                <span className={`status-dot ${chatStatus.enabled ? 'online' : 'offline'}`} />
                <span className="status-label">Chat: <strong>{chatStatus.enabled ? 'Online' : 'Offline'}</strong></span>
              </div>
              <div className="status-item">
                <span className={`status-dot ${registrationsPaused ? 'offline' : 'online'}`} />
                <span className="status-label">Registrations: <strong>{registrationsPaused ? 'Paused' : 'Open'}</strong></span>
              </div>
              <div className="status-item">
                <span className={`status-dot ${maintenanceEnabled ? 'offline' : 'online'}`} />
                <span className="status-label">Maintenance: <strong>{maintenanceEnabled ? 'On' : 'Off'}</strong></span>
              </div>
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card-header">
              <h2>Connected Users ({connectedUsers.length})</h2>
              <button className="btn btn-sm btn-secondary" onClick={fetchConnectedUsers}>Refresh</button>
            </div>
            {connectedUsers.length === 0 ? <div className="empty">No users connected</div> : (
              <div className="admin-table-wrap">
                <table className="admin-tbl">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Type</th>
                      <th>Current Page</th>
                      <th>Connected</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connectedUsers.map(u => (
                      <tr key={u.socketId}>
                        <td>
                          <div className="user-cell">
                            {u.avatarImage ? (
                              <img className="avatar" src={`/avatars/${u.avatarImage}`} alt="" />
                            ) : (
                              <span className="avatar" style={{ backgroundColor: u.avatarColor }} />
                            )}
                            <span>{u.username}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${u.isGuest ? 'muted' : 'active'}`}>
                            {u.isGuest ? 'Guest' : 'User'}
                          </span>
                        </td>
                        <td>{formatPage(u.currentPage)}</td>
                        <td className="muted-text">{new Date(u.connectedAt).toLocaleTimeString()}</td>
                        <td className="muted-text">{formatDuration(u.connectedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="admin-card">
            <h2>Recent Activity</h2>
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              {auditLogs.length === 0 ? <div className="empty">No audit logs</div> : (
                auditLogs.slice(0, 20).map(log => (
                  <div key={log.id} className="audit-item">
                    <span className="audit-time">{formatDate(log.created_at)}</span>
                    <div className="audit-action">
                      <strong>{log.admin_username}</strong> {log.action}
                      {log.target_name && <> on <strong>{log.target_name}</strong></>}
                      {log.details && <div className="audit-details">{log.details}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="admin-card">
          <h2>Users ({usersTotal})</h2>
          <div className="search-bar">
            <input
              type="text"
              className="form-input"
              placeholder="Search users..."
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchUsers(0)}
            />
            <select className="form-select" value={userSort} onChange={e => setUserSort(e.target.value)}>
              <option value="created_at">Joined</option>
              <option value="last_active">Last Active</option>
              <option value="username">Username</option>
            </select>
            <select className="form-select" value={userOrder} onChange={e => setUserOrder(e.target.value)}>
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
            <button className="btn btn-primary" onClick={() => fetchUsers(0)}>Search</button>
          </div>
          <Pagination page={usersPage} total={usersTotal} onPageChange={fetchUsers} />

          {loading ? <div className="loading">Loading</div> : (
            <div className="admin-table-wrap">
              <table className="admin-tbl">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Last Active</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>
                        <div className="user-cell">
                          <span className="avatar" style={{ backgroundColor: u.avatar_color }} />
                          <span>{u.username}{u.is_admin ? ' (Admin)' : ''}</span>
                        </div>
                      </td>
                      <td className="muted-text">{u.email}</td>
                      <td>
                        {u.is_banned ? <span className="badge banned">Banned</span> :
                         u.is_muted ? <span className="badge muted">Muted</span> :
                         u.is_admin ? <span className="badge admin">Admin</span> :
                         <span className="badge active">Active</span>}
                      </td>
                      <td className="muted-text">{formatRelative(u.last_active)}</td>
                      <td className="muted-text">{formatDate(u.created_at)}</td>
                      <td>
                        {u.id !== user.id && (
                          <div className="action-btns">
                            {u.is_muted ? (
                              <button className="btn btn-sm btn-success" onClick={() => handleUnmuteUser(u.id)}>Unmute</button>
                            ) : (
                              <button className="btn btn-sm btn-warning" onClick={() => handleMuteUser(u.id)}>Mute</button>
                            )}
                            {u.is_banned ? (
                              <button className="btn btn-sm btn-success" onClick={() => handleUnbanUser(u.id)}>Unban</button>
                            ) : (
                              <button className="btn btn-sm btn-danger" onClick={() => setBanModal({ userId: u.id, username: u.username })}>Ban</button>
                            )}
                            <button className="btn btn-sm btn-secondary" onClick={() => handleDeleteUser(u.id, u.username)}>Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={usersPage} total={usersTotal} onPageChange={fetchUsers} />
        </div>
      )}

      {/* Content Tab - Messages + Word Filter */}
      {activeTab === 'content' && (
        <>
          <div className="admin-card">
            <h2>Chat Messages ({messagesTotal})</h2>
            <div className="search-bar">
              <input
                type="text"
                className="form-input"
                placeholder="Search messages..."
                value={messageSearch}
                onChange={e => setMessageSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchMessages(0)}
              />
              <button className="btn btn-primary" onClick={() => fetchMessages(0)}>Search</button>
              <button className="btn btn-danger" onClick={handleClearChat}>Clear All</button>
            </div>
            <Pagination page={messagesPage} total={messagesTotal} onPageChange={fetchMessages} />

            <div className="message-list">
              {messages.length === 0 ? <div className="empty">No messages</div> : (
                messages.map(m => (
                  <div key={m.id} className="message-item">
                    <span className="avatar" style={{ backgroundColor: m.avatar_color }} />
                    <div className="message-content">
                      <div className="message-header">
                        <span className="message-username">{m.username}</span>
                        <span className="message-time">{formatDate(m.created_at)}</span>
                        {m.email && <span className="message-time">({m.email})</span>}
                      </div>
                      <div className={`message-text ${m.is_deleted ? 'deleted' : ''}`}>
                        {m.content}
                      </div>
                    </div>
                    <div className="message-actions">
                      <button className="btn btn-sm btn-danger" onClick={() => handleDeleteMessage(m.id)}>Delete</button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <Pagination page={messagesPage} total={messagesTotal} onPageChange={fetchMessages} />
          </div>

          <div className="admin-card">
            <h2>Word Filter</h2>
            <p style={{ color: '#888', marginBottom: 16 }}>Messages containing these words will be blocked.</p>

            <div className="form-row">
              <input
                type="text"
                className="form-input"
                placeholder="Add word or pattern..."
                value={newWord}
                onChange={e => setNewWord(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddWord()}
                style={{ flex: 1 }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#888' }}>
                <input
                  type="checkbox"
                  checked={newWordRegex}
                  onChange={e => setNewWordRegex(e.target.checked)}
                />
                Regex
              </label>
              <button className="btn btn-primary" onClick={handleAddWord}>Add</button>
            </div>

            <div className="word-list">
              {wordFilters.map(w => (
                <div key={w.id} className={`word-tag ${w.is_regex ? 'regex' : ''}`}>
                  <span>{w.word}</span>
                  {w.is_regex === 1 && <span style={{ color: '#666' }}>(regex)</span>}
                  <button onClick={() => handleRemoveWord(w.id)}>&times;</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Games Tab - Sessions + Scores */}
      {activeTab === 'games' && (
        <>
          <div className="admin-card">
            <h2>Game Sessions</h2>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-select" value={sessionStatus} onChange={e => setSessionStatus(e.target.value)}>
                  <option value="playing">Active</option>
                  <option value="completed">Completed</option>
                  <option value="ended">Ended (timed out)</option>
                </select>
              </div>
              <button className="btn btn-primary" onClick={fetchSessions}>Refresh</button>
              <button className="btn btn-danger" onClick={handleEndAllSessions}>End All Sessions</button>
            </div>

            {sessions.length === 0 ? <div className="empty">No sessions</div> : (
              sessions.map(s => (
                <div key={s.id} className="session-item">
                  <div className="session-info">
                    <span className="session-game">{ALL_ADMIN_GAMES.find(g => g.id === s.game_id)?.title || s.game_id}</span>
                    <span className="session-user">{s.username || 'Unknown'} - Score: {s.score}</span>
                    <span className="session-time">Started {formatRelative(s.started_at)}</span>
                  </div>
                  {s.status === 'playing' && (
                    <button className="btn btn-sm btn-danger" onClick={() => handleEndSession(s.id)}>End</button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="admin-card">
            <h2>High Scores ({scoresTotal})</h2>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Filter by Game</label>
                <select
                  className="form-select"
                  value={selectedGame}
                  onChange={e => { setSelectedGame(e.target.value); setScoresPage(0) }}
                >
                  <option value="">All Games</option>
                  {ALL_ADMIN_GAMES.map(g => (
                    <option key={g.id} value={g.id}>{g.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="admin-card-section">
              <h3>Wipe Scores</h3>
              <div className="form-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={wipeAllGames}
                    onChange={e => setWipeAllGames(e.target.checked)}
                  />
                  All games
                </label>
                {!wipeAllGames && (
                  <select
                    className="form-select"
                    value={selectedGame || ALL_ADMIN_GAMES[0]?.id}
                    onChange={e => setSelectedGame(e.target.value)}
                    style={{ width: 150 }}
                  >
                    {ALL_ADMIN_GAMES.map(g => (
                      <option key={g.id} value={g.id}>{g.title}</option>
                    ))}
                  </select>
                )}
                <input
                  type="password"
                  className="form-input"
                  placeholder="Password"
                  value={wipePassword}
                  onChange={e => setWipePassword(e.target.value)}
                  style={{ width: 150 }}
                />
                <button className="btn btn-danger" onClick={handleWipeScores}>
                  Wipe {wipeAllGames ? 'All' : selectedGame}
                </button>
              </div>
            </div>

            <Pagination page={scoresPage} total={scoresTotal} onPageChange={p => fetchScores(selectedGame, p)} />

            <div className="admin-table-wrap">
              <table className="admin-tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Player</th>
                    {!selectedGame && <th>Game</th>}
                    <th>Score</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((s, i) => (
                    <tr key={s.id}>
                      <td>{scoresPage * PAGE_SIZE + i + 1}</td>
                      <td>
                        <div className="user-cell">
                          <span className="avatar" style={{ backgroundColor: s.avatar_color }} />
                          <span>{s.username}</span>
                        </div>
                      </td>
                      {!selectedGame && <td>{ALL_ADMIN_GAMES.find(g => g.id === s.game_id)?.title || s.game_id}</td>}
                      <td>{s.score.toLocaleString()}</td>
                      <td className="muted-text">{formatDate(s.created_at)}</td>
                      <td>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeleteScore(s.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={scoresPage} total={scoresTotal} onPageChange={p => fetchScores(selectedGame, p)} />
          </div>
        </>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <>
          <div className="admin-card">
            <h2>Chat Control</h2>
            <div className="toggle-row">
              <div className="toggle-info">
                <span className="toggle-label">Chat Status</span>
                <span className="toggle-desc">Currently {chatStatus.enabled ? 'online' : 'offline'}</span>
              </div>
              {chatStatus.enabled ? (
                <div className="form-row">
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Offline message..."
                    value={offlineMessage}
                    onChange={e => setOfflineMessage(e.target.value)}
                    style={{ width: 250 }}
                  />
                  <button className="btn btn-danger" onClick={() => handleToggleChat(false)} disabled={chatToggling}>
                    Disable
                  </button>
                </div>
              ) : (
                <button className="btn btn-success" onClick={() => handleToggleChat(true)} disabled={chatToggling}>
                  Enable
                </button>
              )}
            </div>

            <div className="toggle-row">
              <div className="toggle-info">
                <span className="toggle-label">Rate Limit</span>
                <span className="toggle-desc">{chatRateLimit}ms between messages</span>
              </div>
              <div className="form-row">
                <input
                  type="number"
                  className="form-input"
                  value={chatRateLimit}
                  onChange={e => setChatRateLimit(parseInt(e.target.value) || 0)}
                  style={{ width: 100 }}
                />
                <button className="btn btn-primary" onClick={handleUpdateRateLimit}>Update</button>
              </div>
            </div>
          </div>

          <div className="admin-card">
            <h2>Announcement</h2>
            <div className="form-row">
              <input
                type="text"
                className="form-input"
                placeholder="Type announcement..."
                value={announcementText}
                onChange={e => setAnnouncementText(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={handleSendAnnouncement}>Send</button>
            </div>
          </div>

          <div className="admin-card">
            <h2>Site Controls</h2>
            <div className="toggle-row">
              <div className="toggle-info">
                <span className="toggle-label">Registrations</span>
                <span className="toggle-desc">Currently {registrationsPaused ? 'paused' : 'open'}</span>
              </div>
              <button
                className={`btn ${registrationsPaused ? 'btn-success' : 'btn-danger'}`}
                onClick={handleToggleRegistrations}
              >
                {registrationsPaused ? 'Enable' : 'Pause'}
              </button>
            </div>

            <div className="toggle-row">
              <div className="toggle-info">
                <span className="toggle-label">Maintenance Mode</span>
                <span className="toggle-desc">Currently {maintenanceEnabled ? 'on' : 'off'}</span>
              </div>
              <div className="form-row">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Maintenance message..."
                  value={maintenanceMessage}
                  onChange={e => setMaintenanceMessage(e.target.value)}
                  style={{ width: 250 }}
                />
                <button
                  className={`btn ${maintenanceEnabled ? 'btn-success' : 'btn-danger'}`}
                  onClick={handleToggleMaintenance}
                >
                  {maintenanceEnabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          </div>

          <div className="admin-card danger-zone">
            <h2>Danger Zone</h2>
            <p style={{ color: '#ff6b6b', marginBottom: 16 }}>
              Reset the entire site to day zero. This will delete all chat messages, high scores, and game sessions.
            </p>

            <div className="form-row">
              <label className="checkbox-label danger">
                <input
                  type="checkbox"
                  checked={resetDeleteUsers}
                  onChange={e => setResetDeleteUsers(e.target.checked)}
                />
                Also delete all user accounts (except yours)
              </label>
            </div>

            <div className="form-row" style={{ marginTop: 16 }}>
              <input
                type="password"
                className="form-input"
                placeholder="Your password to confirm"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                style={{ width: 200 }}
              />
              <button className="btn btn-danger" onClick={handleResetAll}>
                Reset Everything
              </button>
            </div>
          </div>
        </>
      )}

      {/* Ban Modal */}
      {banModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="admin-card" style={{ width: 400, margin: 0 }}>
            <h2>Ban {banModal.username}</h2>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Reason</label>
              <input
                type="text"
                className="form-input"
                value={banReason}
                onChange={e => setBanReason(e.target.value)}
                placeholder="Ban reason..."
              />
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Duration</label>
              <select className="form-select" value={banDuration} onChange={e => setBanDuration(e.target.value)}>
                <option value="permanent">Permanent</option>
                <option value="1">1 hour</option>
                <option value="24">24 hours</option>
                <option value="168">7 days</option>
                <option value="720">30 days</option>
              </select>
            </div>
            <div className="form-row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setBanModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleBanUser}>Ban User</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
