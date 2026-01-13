import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import AuthModal from '../../components/Auth/AuthModal'
import ProfileModal from '../../components/Profile/ProfileModal'

export default function MobileProfile() {
  const { user, logout } = useAuth()
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [showProfileModal, setShowProfileModal] = useState(false)

  if (user?.isGuest) {
    return (
      <div className="mobile-profile">
        <div className="mobile-profile-guest">
          <div className="mobile-profile-guest-avatar">👤</div>
          <h2>Guest User</h2>
          <p>Sign in to save your scores, customize your profile, and chat with others.</p>

          <div className="mobile-profile-actions">
            <button
              className="btn btn-primary"
              onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}
            >
              Sign In
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => { setAuthMode('register'); setShowAuthModal(true); }}
            >
              Create Account
            </button>
          </div>
        </div>

        {showAuthModal && (
          <AuthModal
            mode={authMode}
            onClose={() => setShowAuthModal(false)}
            onSwitchMode={(mode) => setAuthMode(mode)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="mobile-profile">
      <div className="mobile-profile-header">
        <div className="mobile-profile-avatar-container">
          {user?.avatarImage ? (
            <img
              src={`/avatars/${user.avatarImage}`}
              alt=""
              className="mobile-profile-avatar"
              style={{ borderColor: user.avatarColor }}
            />
          ) : (
            <div
              className="mobile-profile-avatar"
              style={{ backgroundColor: user?.avatarColor, borderColor: user?.avatarColor }}
            />
          )}
        </div>
        <h1 className="mobile-profile-username">{user?.username}</h1>
      </div>

      <div className="mobile-profile-section">
        <h2>Account</h2>
        <button
          className="mobile-profile-btn"
          onClick={() => setShowProfileModal(true)}
        >
          Edit Profile
        </button>
        <button
          className="mobile-profile-btn mobile-profile-btn-logout"
          onClick={logout}
        >
          Log Out
        </button>
      </div>

      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} />
      )}
    </div>
  )
}
