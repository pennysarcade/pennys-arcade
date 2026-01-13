import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useDeviceType } from '../../hooks/useDeviceType'

interface BurgerMenuProps {
  isOpen: boolean
  onClose: () => void
}

const MENU_ITEMS = [
  { id: '/about', label: 'About' },
  { id: '/leaderboard', label: 'Leaderboard' },
  { id: '/privacy', label: 'Privacy Policy' },
]

export default function BurgerMenu({ isOpen, onClose }: BurgerMenuProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { setPreferredVersion } = useDeviceType()

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
            {MENU_ITEMS.map((item) => (
              <button
                key={item.id}
                className="mobile-menu-item"
                onClick={() => handleNavigation(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mobile-menu-section">
            <button
              className="mobile-menu-item mobile-menu-item-switch"
              onClick={handleSwitchToDesktop}
              title="Switch to desktop version"
            >
              <span className="mobile-menu-item-icon">🖥️</span>
              Desktop Version
            </button>
          </div>

          {user && !user.isGuest && (
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
