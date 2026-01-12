import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'

interface AuthModalProps {
  mode: 'login' | 'register'
  onClose: () => void
  onSwitchMode: (mode: 'login' | 'register') => void
}

export default function AuthModal({ mode, onClose, onSwitchMode }: AuthModalProps) {
  const { login, register, pendingVerification, verifyEmail, resendVerificationCode, cancelVerification } = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const codeInputRef = useRef<HTMLInputElement>(null)

  // Focus the code input when verification modal appears
  useEffect(() => {
    if (pendingVerification && codeInputRef.current) {
      codeInputRef.current.focus()
    }
  }, [pendingVerification])

  // Handle resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      if (mode === 'login') {
        await login(email, password)
        onClose()
      } else {
        if (username.length < 3) {
          throw new Error('Username must be at least 3 characters')
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters')
        }
        await register(username, email, password)
        // Don't close - registration will set pendingVerification
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      // Don't show VERIFICATION_REQUIRED as error - it's expected
      if (message !== 'VERIFICATION_REQUIRED') {
        setError(message)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await verifyEmail(verificationCode)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendCode = async () => {
    setError('')
    setSuccess('')
    setIsLoading(true)

    try {
      await resendVerificationCode()
      setSuccess('A new code has been sent to your email')
      setResendCooldown(60) // 60 second cooldown
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    cancelVerification()
    setVerificationCode('')
    setError('')
    setSuccess('')
  }

  const handleDiscordLogin = () => {
    window.location.href = '/api/discord/auth'
  }

  // Show verification form if pending
  if (pendingVerification) {
    return (
      <div className="modal-overlay" onClick={handleCancel}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={handleCancel} aria-label="Close">&times;</button>
          <h2>Verify Your Email</h2>

          <p style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
            We've sent a 6-digit code to<br />
            <strong style={{ color: 'var(--accent-primary)' }}>{pendingVerification.email}</strong>
          </p>

          <form onSubmit={handleVerify}>
            <div className="form-group">
              <label>Verification Code</label>
              <input
                ref={codeInputRef}
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit code"
                required
                maxLength={6}
                pattern="\d{6}"
                style={{
                  textAlign: 'center',
                  fontSize: '1.5rem',
                  letterSpacing: '0.5rem',
                  fontFamily: 'monospace'
                }}
              />
            </div>

            {error && <div className="form-error">{error}</div>}
            {success && <div className="form-success" style={{ color: 'var(--accent-secondary)', marginBottom: '1rem', textAlign: 'center' }}>{success}</div>}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading || verificationCode.length !== 6}
              >
                {isLoading ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </form>

          <div className="modal-switch" style={{ marginTop: '1.5rem' }}>
            Didn't receive the code?{' '}
            {resendCooldown > 0 ? (
              <span style={{ color: 'var(--text-secondary)' }}>Resend in {resendCooldown}s</span>
            ) : (
              <a onClick={handleResendCode} style={{ cursor: isLoading ? 'wait' : 'pointer' }}>
                Resend Code
              </a>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        <h2>{mode === 'login' ? 'Welcome Back' : 'Join the Arcade'}</h2>

        <button
          type="button"
          className="btn btn-discord"
          onClick={handleDiscordLogin}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          Continue with Discord
        </button>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
                required
                minLength={3}
                maxLength={20}
              />
            </div>
          )}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              minLength={6}
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Loading...' : mode === 'login' ? 'Login' : 'Register'}
            </button>
          </div>
        </form>

        <div className="modal-switch">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <a onClick={() => onSwitchMode('register')}>Register</a>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <a onClick={() => onSwitchMode('login')}>Login</a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
