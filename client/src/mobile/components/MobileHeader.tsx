import { useNavigate } from 'react-router-dom'

interface MobileHeaderProps {
  onMenuToggle: () => void
}

export default function MobileHeader({ onMenuToggle }: MobileHeaderProps) {
  const navigate = useNavigate()

  return (
    <header className="mobile-header">
      <div className="mobile-header-spacer" />
      <div className="mobile-header-logo" onClick={() => navigate('/')}>
        <img src="/logo.png" alt="Penny's Arcade" className="mobile-logo-img" />
      </div>
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
