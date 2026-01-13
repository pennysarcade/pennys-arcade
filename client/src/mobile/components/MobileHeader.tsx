import { useLocation, useNavigate } from 'react-router-dom'

interface MobileHeaderProps {
  onMenuToggle: () => void
}

const NAV_ITEMS = [
  { id: '/', label: 'Home' },
  { id: '/chat', label: 'Chat' },
  { id: '/profile', label: 'Profile' },
]

export default function MobileHeader({ onMenuToggle }: MobileHeaderProps) {
  const location = useLocation()
  const navigate = useNavigate()

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
        {NAV_ITEMS.map((item) => (
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
