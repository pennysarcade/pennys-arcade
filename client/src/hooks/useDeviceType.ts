import { useState } from 'react'

type VersionPreference = 'desktop' | 'mobile' | 'auto'

interface DeviceTypeResult {
  isMobile: boolean
  setPreferredVersion: (pref: VersionPreference) => void
  preferredVersion: VersionPreference
}

const STORAGE_KEY = 'arcade-preferred-version'

function detectMobileDevice(): boolean {
  if (typeof window === 'undefined') return false

  const userAgentMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|Opera Mini|IEMobile/i.test(
    navigator.userAgent
  )

  const hasTouchPoints = navigator.maxTouchPoints > 0

  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches

  // Consider mobile if user agent matches AND has touch capability
  return userAgentMobile && (hasTouchPoints || hasCoarsePointer)
}

export function useDeviceType(): DeviceTypeResult {
  const [preferredVersion, setPreferredVersionState] = useState<VersionPreference>(() => {
    if (typeof window === 'undefined') return 'auto'
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'desktop' || saved === 'mobile') return saved
    return 'auto'
  })

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'desktop') return false
    if (saved === 'mobile') return true
    return detectMobileDevice()
  })

  const setPreferredVersion = (pref: VersionPreference) => {
    setPreferredVersionState(pref)
    if (pref === 'auto') {
      localStorage.removeItem(STORAGE_KEY)
      setIsMobile(detectMobileDevice())
    } else {
      localStorage.setItem(STORAGE_KEY, pref)
      setIsMobile(pref === 'mobile')
    }
    // Reload to fully switch layouts
    window.location.reload()
  }

  return { isMobile, setPreferredVersion, preferredVersion }
}
