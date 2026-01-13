import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

interface MobileHeaderProps {
  onMenuToggle: () => void
}

export default function MobileHeader({ onMenuToggle }: MobileHeaderProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const isSignedIn = user && !user.isGuest

  const navItems = [
    { id: '/', label: 'Home' },
    { id: '/chat', label: 'Chat' },
    { id: '/profile', label: isSignedIn ? 'Profile' : 'Sign in' },
  ]

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/' || location.pathname.startsWith('/game/')
    }
    return location.pathname === path
  }

  return (
    <header className="mobile-header">
      <div className="mobile-header-logo" onClick={() => navigate('/')}>
        <img src="/logo.png" alt="Penny's Arcade" className="mobile-logo-img" />
      </div>
      <nav className="mobile-header-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`mobile-header-nav-item ${isActive(item.id) ? 'active' : ''}`}
            onClick={() => navigate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <button className="mobile-menu-btn" onClick={onMenuToggle} aria-label="Open menu">
        <span className="mobile-menu-icon">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>
    </header>
  )
}
