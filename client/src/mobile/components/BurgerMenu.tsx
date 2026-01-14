import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useDeviceType } from '../../hooks/useDeviceType'
import { GAMES } from '../../components/Games/ArcadeGrid'

interface BurgerMenuProps {
  isOpen: boolean
  onClose: () => void
}

export default function BurgerMenu({ isOpen, onClose }: BurgerMenuProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { setPreferredVersion } = useDeviceType()

  const isSignedIn = user && !user.isGuest

  // Menu items ordered by importance, matching desktop layout
  const menuItems = [
    { id: '/', label: 'Home' },
    { id: '/chat', label: 'Chat' },
    { id: '/profile', label: isSignedIn ? 'Profile' : 'Sign In' },
    { id: '/about', label: 'About' },
    { id: '/leaderboard', label: 'Leaderboard' },
    { id: '/privacy', label: 'Privacy' },
  ]

  const isGamePath = (pathname: string) => {
    if (pathname.startsWith('/game/')) return true
    const gameId = pathname.slice(1) // remove leading slash
    return GAMES.some(g => g.id === gameId)
  }

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/' || isGamePath(location.pathname)
    }
    return location.pathname === path
  }

  const handleNavigation = (path: string) => {
    navigate(path)
    onClose()
  }

  const handleLogout = () => {
    logout()
    onClose()
  }

  const handleSwitchToDesktop = () => {
    setPreferredVersion('desktop')
  }

  return (
    <>
      <div
        className={`mobile-menu-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />
      <div className={`mobile-menu ${isOpen ? 'open' : ''}`}>
        <div className="mobile-menu-header">
          <span className="mobile-menu-title">Menu</span>
          <button className="mobile-menu-close" onClick={onClose}>×</button>
        </div>

        <div className="mobile-menu-content">
          <div className="mobile-menu-section">
            {menuItems.map((item) => (
              <button
                key={item.id}
                className={`mobile-menu-item ${isActive(item.id) ? 'active' : ''}`}
                onClick={() => handleNavigation(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mobile-menu-section">
            <button
              className="mobile-menu-item"
              onClick={handleSwitchToDesktop}
              title="Switch to desktop version"
            >
              Desktop Version
            </button>
          </div>

          {isSignedIn && (
            <div className="mobile-menu-section mobile-menu-footer">
              <button className="mobile-menu-item mobile-menu-logout" onClick={handleLogout}>
                Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
