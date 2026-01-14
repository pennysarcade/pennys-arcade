import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'

interface Stats {
  users: { total: number; newThisWeek: number; active24h: number; active7d: number }
  messages: { total: number; thisWeek: number }
  games: { activeSessions: number; playedToday: number }
}

interface DeviceInfo {
  type: string
  os: string
  browser: string
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
}

export default function MobileAdmin() {
  const { user, token } = useAuth()
  const { chatStatus } = useSocket()
  const navigate = useNavigate()

  const [stats, setStats] = useState<Stats | null>(null)
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([])
  const [loading, setLoading] = useState(true)

  // Chat toggle
  const [offlineMessage, setOfflineMessage] = useState('')
  const [chatToggling, setChatToggling] = useState(false)

  // Announcement
  const [announcement, setAnnouncement] = useState('')
  const [sending, setSending] = useState(false)

  // Ban/Mute modal
  const [actionModal, setActionModal] = useState<{
    userId: number
    username: string
    action: 'ban' | 'mute'
  } | null>(null)
  const [banReason, setBanReason] = useState('')

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

    const loadData = async () => {
      setLoading(true)
      await Promise.all([fetchStats(), fetchConnectedUsers()])
      setLoading(false)
    }
    loadData()

    const interval = setInterval(fetchConnectedUsers, 5000)
    return () => clearInterval(interval)
  }, [user, navigate, fetchStats, fetchConnectedUsers])

  const handleToggleChat = async (enable: boolean) => {
    if (!enable && !offlineMessage.trim()) {
      alert('Please enter an offline message')
      return
    }
    setChatToggling(true)
    try {
      const res = await fetch('/api/auth/admin/chat-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          enabled: enable,
          offlineMessage: enable ? '' : offlineMessage
        })
      })
      if (res.ok) {
        setOfflineMessage('')
      }
    } catch { /* ignore */ }
    setChatToggling(false)
  }

  const handleSendAnnouncement = async () => {
    if (!announcement.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/auth/admin/announcement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: announcement })
      })
      if (res.ok) {
        setAnnouncement('')
      }
    } catch { /* ignore */ }
    setSending(false)
  }

  const handleBan = async () => {
    if (!actionModal || actionModal.action !== 'ban') return
    try {
      await fetch(`/api/auth/admin/users/${actionModal.userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reason: banReason || 'Banned by admin', duration: null })
      })
      setActionModal(null)
      setBanReason('')
      fetchConnectedUsers()
    } catch { /* ignore */ }
  }

  const handleMute = async () => {
    if (!actionModal || actionModal.action !== 'mute') return
    try {
      await fetch(`/api/auth/admin/users/${actionModal.userId}/mute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      setActionModal(null)
      fetchConnectedUsers()
    } catch { /* ignore */ }
  }

  const formatPage = (page: string) => {
    if (page === '/') return 'Home'
    if (page === '/admin') return 'Admin'
    if (page === '/chat') return 'Chat'
    if (page === '/leaderboard') return 'Leaderboard'
    if (page === '/profile') return 'Profile'
    if (page.startsWith('/game/')) return `Game: ${page.slice(6)}`
    if (page.match(/^\/[a-z0-9]+$/i)) return `Game: ${page.slice(1)}`
    return page
  }

  const formatDuration = (connectedAt: number) => {
    const seconds = Math.floor((Date.now() - connectedAt) / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ${minutes % 60}m`
  }

  if (!user?.isAdmin) {
    return null
  }

  if (loading) {
    return (
      <div className="mobile-admin">
        <div className="mobile-admin-loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="mobile-admin">
      <div className="mobile-admin-header">
        <h1>Admin Panel</h1>
        <span className={`mobile-admin-status ${chatStatus.enabled ? 'online' : 'offline'}`}>
          Chat: {chatStatus.enabled ? 'On' : 'Off'}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="mobile-admin-stats">
        <div className="mobile-admin-stat">
          <span className="mobile-admin-stat-value">{stats?.users.total || 0}</span>
          <span className="mobile-admin-stat-label">Users</span>
        </div>
        <div className="mobile-admin-stat">
          <span className="mobile-admin-stat-value">{stats?.users.active24h || 0}</span>
          <span className="mobile-admin-stat-label">Active 24h</span>
        </div>
        <div className="mobile-admin-stat">
          <span className="mobile-admin-stat-value">{stats?.messages.total || 0}</span>
          <span className="mobile-admin-stat-label">Messages</span>
        </div>
        <div className="mobile-admin-stat">
          <span className="mobile-admin-stat-value">{stats?.games.playedToday || 0}</span>
          <span className="mobile-admin-stat-label">Games Today</span>
        </div>
      </div>

      {/* Connected Users */}
      <div className="mobile-admin-section">
        <div className="mobile-admin-section-header">
          <h2>Connected ({connectedUsers.length})</h2>
          <button className="mobile-admin-refresh" onClick={fetchConnectedUsers}>Refresh</button>
        </div>
        <div className="mobile-admin-users">
          {connectedUsers.length === 0 ? (
            <div className="mobile-admin-empty">No users connected</div>
          ) : (
            connectedUsers.map(u => (
              <div key={u.socketId} className="mobile-admin-user">
                <div className="mobile-admin-user-info">
                  <div className="mobile-admin-user-header">
                    {u.avatarImage ? (
                      <img
                        src={`/avatars/${u.avatarImage}`}
                        alt=""
                        className="mobile-admin-avatar"
                        style={{ borderColor: u.avatarColor }}
                      />
                    ) : (
                      <span
                        className="mobile-admin-avatar"
                        style={{ backgroundColor: u.avatarColor }}
                      />
                    )}
                    <span className="mobile-admin-username">{u.username}</span>
                    <span className={`mobile-admin-badge ${u.isGuest ? 'guest' : 'user'}`}>
                      {u.isGuest ? 'Guest' : 'User'}
                    </span>
                  </div>
                  <div className="mobile-admin-user-meta">
                    <span>{formatPage(u.currentPage)}</span>
                    <span>{formatDuration(u.connectedAt)}</span>
                  </div>
                </div>
                {!u.isGuest && u.userId && (
                  <div className="mobile-admin-user-actions">
                    <button
                      className="mobile-admin-action-btn mute"
                      onClick={() => setActionModal({ userId: u.userId!, username: u.username, action: 'mute' })}
                    >
                      Mute
                    </button>
                    <button
                      className="mobile-admin-action-btn ban"
                      onClick={() => setActionModal({ userId: u.userId!, username: u.username, action: 'ban' })}
                    >
                      Ban
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Settings */}
      <div className="mobile-admin-section">
        <h2>Quick Settings</h2>

        {/* Chat Toggle */}
        <div className="mobile-admin-setting">
          <span className="mobile-admin-setting-label">Chat</span>
          {chatStatus.enabled ? (
            <div className="mobile-admin-setting-row">
              <input
                type="text"
                placeholder="Offline message..."
                value={offlineMessage}
                onChange={e => setOfflineMessage(e.target.value)}
                className="mobile-admin-input"
              />
              <button
                className="mobile-admin-btn danger"
                onClick={() => handleToggleChat(false)}
                disabled={chatToggling}
              >
                Disable
              </button>
            </div>
          ) : (
            <button
              className="mobile-admin-btn success"
              onClick={() => handleToggleChat(true)}
              disabled={chatToggling}
            >
              Enable
            </button>
          )}
        </div>

        {/* Announcement */}
        <div className="mobile-admin-setting">
          <span className="mobile-admin-setting-label">Announcement</span>
          <div className="mobile-admin-setting-row">
            <input
              type="text"
              placeholder="Type announcement..."
              value={announcement}
              onChange={e => setAnnouncement(e.target.value)}
              className="mobile-admin-input"
            />
            <button
              className="mobile-admin-btn primary"
              onClick={handleSendAnnouncement}
              disabled={sending || !announcement.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="mobile-admin-modal-overlay" onClick={() => setActionModal(null)}>
          <div className="mobile-admin-modal" onClick={e => e.stopPropagation()}>
            <h3>{actionModal.action === 'ban' ? 'Ban' : 'Mute'} {actionModal.username}?</h3>
            {actionModal.action === 'ban' && (
              <input
                type="text"
                placeholder="Reason (optional)"
                value={banReason}
                onChange={e => setBanReason(e.target.value)}
                className="mobile-admin-input"
                style={{ marginBottom: 16 }}
              />
            )}
            <div className="mobile-admin-modal-actions">
              <button className="mobile-admin-btn secondary" onClick={() => setActionModal(null)}>
                Cancel
              </button>
              <button
                className={`mobile-admin-btn ${actionModal.action === 'ban' ? 'danger' : 'warning'}`}
                onClick={actionModal.action === 'ban' ? handleBan : handleMute}
              >
                {actionModal.action === 'ban' ? 'Ban' : 'Mute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
