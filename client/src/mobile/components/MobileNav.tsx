import { useLocation, useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  { id: '/', label: 'Home', icon: '🎮' },
  { id: '/chat', label: 'Chat', icon: '💬' },
  { id: '/profile', label: 'Profile', icon: '👤' },
]

export default function MobileNav() {
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/' || location.pathname.startsWith('/game/')
    }
    return location.pathname === path
  }

  return (
    <nav className="mobile-nav">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          className={`mobile-nav-item ${isActive(item.id) ? 'active' : ''}`}
          onClick={() => navigate(item.id)}
        >
          <span className="mobile-nav-icon">{item.icon}</span>
          <span className="mobile-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
