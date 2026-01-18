import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

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

const STORAGE_KEY = 'arcade-crt-settings'

interface CRTContextType {
  settings: CRTSettings
  updateSettings: (updates: Partial<CRTSettings>) => void
  updateNestedSettings: <K extends keyof CRTSettings>(
    key: K,
    updates: Partial<CRTSettings[K]>
  ) => void
  resetToDefaults: () => void
}

const CRTContext = createContext<CRTContextType | undefined>(undefined)

function loadSettings(): CRTSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // Merge with defaults to handle any new properties
      return { ...DEFAULT_CRT_SETTINGS, ...parsed }
    }
  } catch {
    // Invalid JSON, use defaults
  }
  return DEFAULT_CRT_SETTINGS
}

function saveSettings(settings: CRTSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage full or unavailable
  }
}

export function CRTProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CRTSettings>(loadSettings)

  // Persist to localStorage when settings change
  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  const updateSettings = useCallback((updates: Partial<CRTSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }))
  }, [])

  const updateNestedSettings = useCallback(<K extends keyof CRTSettings>(
    key: K,
    updates: Partial<CRTSettings[K]>
  ) => {
    setSettings(prev => ({
      ...prev,
      [key]: { ...(prev[key] as object), ...updates }
    }))
  }, [])

  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_CRT_SETTINGS)
  }, [])

  return (
    <CRTContext.Provider value={{ settings, updateSettings, updateNestedSettings, resetToDefaults }}>
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
