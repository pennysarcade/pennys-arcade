import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useSocket } from './SocketContext'
import { useAuth } from './AuthContext'

export interface CRTSettings {
  enabled: boolean
  scanlines: { enabled: boolean; intensity: number; spacing: number }
  glow: { enabled: boolean; intensity: number; color: string }
  curvature: { enabled: boolean; intensity: number }
  chromaticAberration: { enabled: boolean; intensity: number }
  noise: { enabled: boolean; intensity: number; animated: boolean }
  vignette: { enabled: boolean; intensity: number }
  brightness: number
  contrast: number
  saturation: number
}

export const DEFAULT_CRT_SETTINGS: CRTSettings = {
  enabled: true,
  scanlines: { enabled: true, intensity: 0.15, spacing: 2 },
  glow: { enabled: true, intensity: 0.3, color: '#00ffff' },
  curvature: { enabled: false, intensity: 0.02 },
  chromaticAberration: { enabled: false, intensity: 0.5 },
  noise: { enabled: false, intensity: 0.05, animated: false },
  vignette: { enabled: true, intensity: 0.3 },
  brightness: 1,
  contrast: 1,
  saturation: 1,
}

interface CRTContextType {
  // Active settings (what's displayed) - comes from server or is null if disabled
  settings: CRTSettings | null
  // Local preview settings for admin panel (always has values for sliders)
  localSettings: CRTSettings
  // Whether we're in preview mode (admin adjusting settings locally)
  isPreviewMode: boolean
  // Loading state
  isLoading: boolean
  // Update local preview settings
  updateLocalSettings: (updates: Partial<CRTSettings>) => void
  updateNestedLocalSettings: <K extends keyof CRTSettings>(
    key: K,
    updates: Partial<CRTSettings[K]>
  ) => void
  // Reset local settings to defaults
  resetToDefaults: () => void
  // Push current local settings to all users (admin only)
  pushToAllUsers: () => Promise<void>
  // Turn CRT on/off globally (admin only)
  setGlobalEnabled: (enabled: boolean) => Promise<void>
  // Enable preview mode to see changes before pushing
  setPreviewMode: (enabled: boolean) => void
}

const CRTContext = createContext<CRTContextType | undefined>(undefined)

export function CRTProvider({ children }: { children: ReactNode }) {
  const { socket } = useSocket()
  const { token } = useAuth()

  // Server-side settings (null means CRT is globally disabled)
  const [serverSettings, setServerSettings] = useState<CRTSettings | null>(null)
  // Local settings for admin preview/editing
  const [localSettings, setLocalSettings] = useState<CRTSettings>(DEFAULT_CRT_SETTINGS)
  // Preview mode - when true, show localSettings instead of serverSettings
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch initial settings from server
  useEffect(() => {
    fetch('/api/auth/crt-settings')
      .then(res => res.json())
      .then(data => {
        if (data) {
          setServerSettings(data)
          setLocalSettings(data)
        } else {
          setServerSettings(null)
          // Keep default local settings for admin panel
        }
        setIsLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch CRT settings:', err)
        setIsLoading(false)
      })
  }, [])

  // Listen for socket updates
  useEffect(() => {
    if (!socket) return

    const handleCRTSettings = (data: CRTSettings) => {
      setServerSettings(data)
      // Also update local settings if not in preview mode
      if (!isPreviewMode) {
        setLocalSettings(data)
      }
    }

    socket.on('site:crtSettings', handleCRTSettings)

    return () => {
      socket.off('site:crtSettings', handleCRTSettings)
    }
  }, [socket, isPreviewMode])

  // The active settings to display
  const settings = isPreviewMode ? localSettings : serverSettings

  const updateLocalSettings = useCallback((updates: Partial<CRTSettings>) => {
    setLocalSettings(prev => ({ ...prev, ...updates }))
  }, [])

  const updateNestedLocalSettings = useCallback(<K extends keyof CRTSettings>(
    key: K,
    updates: Partial<CRTSettings[K]>
  ) => {
    setLocalSettings(prev => ({
      ...prev,
      [key]: { ...(prev[key] as object), ...updates }
    }))
  }, [])

  const resetToDefaults = useCallback(() => {
    setLocalSettings(DEFAULT_CRT_SETTINGS)
  }, [])

  const pushToAllUsers = useCallback(async () => {
    if (!token) return

    try {
      const response = await fetch('/api/auth/admin/crt-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ settings: localSettings }),
      })

      if (!response.ok) {
        throw new Error('Failed to push CRT settings')
      }

      // Server will broadcast to all clients via socket
      // Exit preview mode since settings are now live
      setIsPreviewMode(false)
    } catch (err) {
      console.error('Failed to push CRT settings:', err)
      throw err
    }
  }, [token, localSettings])

  const setGlobalEnabled = useCallback(async (enabled: boolean) => {
    if (!token) return

    try {
      const newSettings = enabled ? { ...localSettings, enabled: true } : null

      const response = await fetch('/api/auth/admin/crt-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ settings: newSettings }),
      })

      if (!response.ok) {
        throw new Error('Failed to update CRT enabled state')
      }

      // Update local state immediately for responsive UI
      if (enabled) {
        setLocalSettings(prev => ({ ...prev, enabled: true }))
      }
      setIsPreviewMode(false)
    } catch (err) {
      console.error('Failed to set CRT enabled:', err)
      throw err
    }
  }, [token, localSettings])

  const setPreviewMode = useCallback((enabled: boolean) => {
    setIsPreviewMode(enabled)
  }, [])

  return (
    <CRTContext.Provider value={{
      settings,
      localSettings,
      isPreviewMode,
      isLoading,
      updateLocalSettings,
      updateNestedLocalSettings,
      resetToDefaults,
      pushToAllUsers,
      setGlobalEnabled,
      setPreviewMode,
    }}>
      {children}
    </CRTContext.Provider>
  )
}

export function useCRT() {
  const context = useContext(CRTContext)
  if (context === undefined) {
    throw new Error('useCRT must be used within a CRTProvider')
  }
  return context
}
