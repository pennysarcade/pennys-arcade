import { ReactNode, useState, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'
import { useResizablePanel } from '../../hooks/useResizablePanel'
import { useDeviceType } from '../../hooks/useDeviceType'
import ChatSidebar from '../Chat/ChatSidebar'
import AuthModal from '../Auth/AuthModal'
import ProfileModal from '../Profile/ProfileModal'
import ResizeHandle from '../UI/ResizeHandle'
import TabBar from '../UI/TabBar'
import FitText from '../UI/FitText'
import ScrollContainer from '../UI/ScrollContainer'
import { GAMES } from '../Games/ArcadeGrid'

interface MainLayoutProps {
  children: ReactNode
}

const HEADER_TABS = [
  { id: '/', label: 'Home' },
  { id: '/about', label: 'About' },
  { id: '/leaderboard', label: 'Leaderboard' },
  { id: '/privacy', label: 'Privacy' },
]

export default function MainLayout({ children }: MainLayoutProps) {
  const { user, logout } = useAuth()
  const { maintenance } = useSocket()
  const { setPreferredVersion } = useDeviceType()
  const location = useLocation()
  const navigate = useNavigate()
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [chatMinimized, setChatMinimized] = useState(() => {
    const saved = localStorage.getItem('arcade-chat-minimized')
    return saved === 'true'
  })
  const [chatActiveTab, setChatActiveTab] = useState('chat')

  const [minimizeHighlighted, setMinimizeHighlighted] = useState(false)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleHitMinimum = (belowMin: boolean) => {
    if (belowMin) {
      if (!highlightTimerRef.current) {
        highlightTimerRef.current = setTimeout(() => {
          setMinimizeHighlighted(true)
        }, 200)
      }
    } else {
      setMinimizeHighlighted(false)
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current)
        highlightTimerRef.current = null
      }
    }
  }

  const chatPanel = useResizablePanel({
    storageKey: 'arcade-chat-width',
    defaultSize: 500,
    minSize: 250,
    maxSize: 500,
    onHitMinimum: handleHitMinimum,
  })

  const handleMinimizeChat = () => {
    setChatMinimized(true)
    setMinimizeHighlighted(false)
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = null
    }
    localStorage.setItem('arcade-chat-minimized', 'true')
    document.body.classList.remove('resizing')
  }

  const handleChatResizeEnd = () => {
    chatPanel.saveSize()
    setMinimizeHighlighted(false)
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = null
    }
  }

  const handleExpandChat = () => {
    setChatMinimized(false)
    localStorage.setItem('arcade-chat-minimized', 'false')
    chatPanel.resetRawSize()
  }

  const openLogin = () => {
    setAuthMode('login')
    setShowAuthModal(true)
  }

  const openRegister = () => {
    setAuthMode('register')
    setShowAuthModal(true)
  }

  const handleTabChange = (tabId: string) => {
    navigate(tabId)
  }

  const isGamePath = (pathname: string) => {
    if (pathname.startsWith('/game/')) return true
    const gameId = pathname.slice(1) // remove leading slash
    return GAMES.some(g => g.id === gameId)
  }

  const getActiveTab = () => {
    if (location.pathname === '/' || isGamePath(location.pathname)) {
      return '/'
    }
    return location.pathname
  }

  return (
    <div className="app-container">
      <header className="unified-header">
        <div className="header-main">
          <div className="header-logo">
            <img
              src="/logo.png"
              alt="Penny"
              className="header-logo-img"
              onClick={() => navigate('/')}
              title="Go to Home"
              style={{ cursor: 'pointer' }}
            />
            <h1><FitText line1="PENNY'S" line2="ARCADE" /></h1>
          </div>
          <div className="header-nav">
            <TabBar
              tabs={HEADER_TABS}
              activeTab={getActiveTab()}
              onTabChange={handleTabChange}
              variant="header"
            />
          </div>
          <div className="header-user">
            {user && (
              <div className="user-display">
                <div
                  className="user-avatar"
                  style={{ borderColor: user.avatarColor, backgroundColor: user.avatarImage ? 'transparent' : user.avatarColor }}
                >
                  {user.avatarImage && (
                    <img
                      src={`/avatars/${user.avatarImage}`}
                      alt=""
                      className="user-avatar-image"
                    />
                  )}
                </div>
                <span className={`user-name ${user.isGuest ? 'guest' : ''}`}>
                  {user.username}
                </span>
              </div>
            )}
            {user?.isGuest ? (
              <button className="btn btn-purple" onClick={openLogin}>
                Sign In
              </button>
            ) : (
              <>
                <button className="btn" onClick={() => setShowProfileModal(true)}>
                  Profile
                </button>
                <button className="btn btn-secondary" onClick={logout}>
                  Logout
                </button>
              </>
            )}
            <button
              className="btn btn-icon version-toggle"
              onClick={() => setPreferredVersion('mobile')}
              title="Switch to mobile version"
            >
              📱
            </button>
          </div>
        </div>
        <button
          className={`chat-toggle-btn ${chatMinimized ? 'minimized' : ''} ${minimizeHighlighted ? 'highlighted' : ''}`}
          onClick={chatMinimized ? handleExpandChat : handleMinimizeChat}
          title={chatMinimized ? "Open chat" : "Minimize chat"}
        >
          {chatMinimized ? '+' : '−'}
        </button>
      </header>

      <div className="content-row">
        <div className="main-content">
          <ScrollContainer className="page-content">
            {children}
          </ScrollContainer>
        </div>
        {!chatMinimized && (
          <ResizeHandle
            direction="vertical"
            onResize={chatPanel.handleResize}
            onResizeEnd={handleChatResizeEnd}
          />
        )}
        {!chatMinimized && (
          <ChatSidebar
            width={chatPanel.size}
            onRegisterClick={openRegister}
            activeTab={chatActiveTab}
            onTabChange={setChatActiveTab}
          />
        )}
      </div>

      {chatMinimized && (
        <div className="chat-expand-bar-mobile" onClick={handleExpandChat}>
          <span className="chat-expand-bar-label">Chat</span>
          <span className="chat-expand-bar-icon">+</span>
        </div>
      )}

      {showAuthModal && (
        <AuthModal
          mode={authMode}
          onClose={() => setShowAuthModal(false)}
          onSwitchMode={(mode) => setAuthMode(mode)}
        />
      )}

      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} />
      )}

      {maintenance.enabled && !user?.isAdmin && (
        <div className="maintenance-overlay">
          <div className="maintenance-content">
            <h2>Under Maintenance</h2>
            <p>{maintenance.message || 'Site is under maintenance. Please check back soon.'}</p>
            <div className="maintenance-icon">🔧</div>
          </div>
        </div>
      )}
    </div>
  )
}
