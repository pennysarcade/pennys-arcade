import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface User {
  id: number
  username: string
  email: string
  avatarColor: string
  avatarImage: string | null
  isGuest: boolean
  isAdmin: boolean
}

interface PendingVerification {
  userId: number
  email: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  loadingProgress: number
  loadingStatus: string
  pendingVerification: PendingVerification | null
  login: (email: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  verifyEmail: (code: string) => Promise<void>
  resendVerificationCode: () => Promise<void>
  cancelVerification: () => void
  logout: () => void
  updateProfile: (username: string, avatarColor: string) => Promise<void>
  uploadAvatar: (file: File, cropPosition?: string) => Promise<{ avatarImage: string; changesRemaining: number }>
  deleteAvatar: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function generateGuestUser(): User {
  // Generate a temporary guest user - server will assign actual unique name on socket connect
  return {
    id: -1,
    username: 'n00b',
    email: '',
    avatarColor: '#606060',
    avatarImage: null,
    isGuest: true,
    isAdmin: false,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingStatus, setLoadingStatus] = useState('Initializing...')
  const [pendingVerification, setPendingVerification] = useState<PendingVerification | null>(null)
  const [authReady, setAuthReady] = useState(false)

  // Animate progress bar from 0-100%
  useEffect(() => {
    if (!isLoading) return

    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        // If auth is ready, accelerate to 100%
        if (authReady) {
          const newProgress = prev + 5
          if (newProgress >= 100) {
            clearInterval(interval)
            // Small delay before hiding to show 100%
            setTimeout(() => setIsLoading(false), 300)
            return 100
          }
          return newProgress
        }
        // Before auth ready, slowly climb to 85% max
        if (prev < 85) {
          return prev + 1.5
        }
        return prev
      })
    }, 30)

    return () => clearInterval(interval)
  }, [isLoading, authReady])

  // Update status messages based on progress
  useEffect(() => {
    if (loadingProgress < 20) {
      setLoadingStatus('Initializing...')
    } else if (loadingProgress < 50) {
      setLoadingStatus('Checking authentication...')
    } else if (loadingProgress < 80) {
      setLoadingStatus('Loading user data...')
    } else {
      setLoadingStatus('Ready!')
    }
  }, [loadingProgress])

  useEffect(() => {
    async function initAuth() {
      // Check for token in URL (from Discord OAuth callback)
      const urlParams = new URLSearchParams(window.location.search)
      const urlToken = urlParams.get('token')
      const error = urlParams.get('error')

      if (error) {
        console.error('Auth error:', error)
        window.history.replaceState({}, '', window.location.pathname)
      }

      if (urlToken) {
        // Fetch user info with the token
        try {
          const response = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${urlToken}` },
          })
          if (response.ok) {
            const data = await response.json()
            setToken(urlToken)
            setUser({ ...data.user, isGuest: false })
            localStorage.setItem('token', urlToken)
            localStorage.setItem('user', JSON.stringify({ ...data.user, isGuest: false }))
          }
        } catch (err) {
          console.error('Failed to fetch user:', err)
        }
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname)
        setAuthReady(true)
        return
      }

      const savedToken = localStorage.getItem('token')

      if (savedToken) {
        // Always fetch fresh user data from the server to ensure we have the latest
        try {
          const response = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${savedToken}` },
          })
          if (response.ok) {
            const data = await response.json()
            setToken(savedToken)
            const freshUser = { ...data.user, isGuest: false }
            setUser(freshUser)
            localStorage.setItem('user', JSON.stringify(freshUser))
          } else {
            // Token invalid, clear it and become guest
            localStorage.removeItem('token')
            localStorage.removeItem('user')
            setUser(generateGuestUser())
          }
        } catch (err) {
          console.error('Failed to fetch user:', err)
          // On network error, fall back to cached user
          const savedUser = localStorage.getItem('user')
          if (savedUser) {
            setToken(savedToken)
            setUser(JSON.parse(savedUser))
          } else {
            setUser(generateGuestUser())
          }
        }
      } else {
        setUser(generateGuestUser())
      }
      setAuthReady(true)
    }

    initAuth()
  }, [])

  const login = async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const text = await response.text()
    if (!text) {
      throw new Error('Server returned empty response')
    }

    const data = JSON.parse(text)

    // Check if verification is required
    if (data.requiresVerification) {
      setPendingVerification({ userId: data.userId, email: data.email })
      throw new Error('VERIFICATION_REQUIRED')
    }

    if (!response.ok) {
      throw new Error(data.message || 'Login failed')
    }

    setToken(data.token)
    setUser({ ...data.user, isGuest: false })
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify({ ...data.user, isGuest: false }))
  }

  const register = async (username: string, email: string, password: string) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    })

    const text = await response.text()
    if (!text) {
      throw new Error('Server returned empty response')
    }

    const data = JSON.parse(text)

    if (!response.ok) {
      throw new Error(data.message || 'Registration failed')
    }

    // Registration now requires verification
    if (data.requiresVerification) {
      setPendingVerification({ userId: data.userId, email: data.email })
      // Don't throw - this is a success, just needs verification
      return
    }

    // Fallback for if verification is disabled in future
    if (data.token) {
      setToken(data.token)
      setUser({ ...data.user, isGuest: false })
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify({ ...data.user, isGuest: false }))
    }
  }

  const verifyEmail = async (code: string) => {
    if (!pendingVerification) {
      throw new Error('No pending verification')
    }

    const response = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: pendingVerification.userId, code }),
    })

    const text = await response.text()
    if (!text) {
      throw new Error('Server returned empty response')
    }

    const data = JSON.parse(text)

    if (!response.ok) {
      throw new Error(data.message || 'Verification failed')
    }

    // Success - log the user in
    setPendingVerification(null)
    setToken(data.token)
    setUser({ ...data.user, isGuest: false })
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify({ ...data.user, isGuest: false }))
  }

  const resendVerificationCode = async () => {
    if (!pendingVerification) {
      throw new Error('No pending verification')
    }

    const response = await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: pendingVerification.userId }),
    })

    const text = await response.text()
    if (!text) {
      throw new Error('Server returned empty response')
    }

    const data = JSON.parse(text)

    if (!response.ok) {
      throw new Error(data.message || 'Failed to resend code')
    }
  }

  const cancelVerification = () => {
    setPendingVerification(null)
  }

  const logout = () => {
    setToken(null)
    setUser(generateGuestUser())
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  const updateProfile = async (username: string, avatarColor: string) => {
    if (!token) throw new Error('Not authenticated')

    const response = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ username, avatarColor }),
    })

    const text = await response.text()
    if (!text) {
      throw new Error('Server returned empty response')
    }

    const data = JSON.parse(text)

    if (!response.ok) {
      throw new Error(data.message || 'Update failed')
    }

    const updatedUser = { ...data.user, isGuest: false }
    setUser(updatedUser)
    localStorage.setItem('user', JSON.stringify(updatedUser))

    // If username changed, server returns a new token - update it
    if (data.token) {
      setToken(data.token)
      localStorage.setItem('token', data.token)
    }
  }

  const uploadAvatar = async (file: File, cropPosition: string = 'center'): Promise<{ avatarImage: string; changesRemaining: number }> => {
    if (!token) throw new Error('Not authenticated')

    const formData = new FormData()
    formData.append('avatar', file)
    formData.append('cropPosition', cropPosition)

    const response = await fetch('/api/auth/avatar', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Failed to upload avatar')
    }

    // Update user with new avatar image
    if (user) {
      const updatedUser = { ...user, avatarImage: data.avatarImage }
      setUser(updatedUser)
      localStorage.setItem('user', JSON.stringify(updatedUser))
    }

    return { avatarImage: data.avatarImage, changesRemaining: data.changesRemaining }
  }

  const deleteAvatar = async () => {
    if (!token) throw new Error('Not authenticated')

    const response = await fetch('/api/auth/avatar', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Failed to delete avatar')
    }

    // Update user to remove avatar image
    if (user) {
      const updatedUser = { ...user, avatarImage: null }
      setUser(updatedUser)
      localStorage.setItem('user', JSON.stringify(updatedUser))
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, loadingProgress, loadingStatus, pendingVerification, login, register, verifyEmail, resendVerificationCode, cancelVerification, logout, updateProfile, uploadAvatar, deleteAvatar }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
