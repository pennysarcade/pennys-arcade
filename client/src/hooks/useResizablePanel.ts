import { useState, useCallback, useRef } from 'react'

interface UseResizablePanelOptions {
  storageKey: string
  defaultSize: number
  minSize: number
  maxSize: number
  onHitMinimum?: (belowMin: boolean) => void
}

export function useResizablePanel(options: UseResizablePanelOptions) {
  const { storageKey, defaultSize, minSize, maxSize, onHitMinimum } = options
  const rawSize = useRef(defaultSize)
  const wasBelowMin = useRef(false)

  const [size, setSize] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (!isNaN(parsed) && parsed >= minSize && parsed <= maxSize) {
          rawSize.current = parsed
          return parsed
        }
      }
    } catch {
      // localStorage not available
    }
    return defaultSize
  })

  const handleResize = useCallback((delta: number) => {
    rawSize.current = rawSize.current + delta
    const isBelowMin = rawSize.current < minSize

    // Notify when crossing the minimum threshold
    if (isBelowMin !== wasBelowMin.current) {
      wasBelowMin.current = isBelowMin
      if (onHitMinimum) {
        onHitMinimum(isBelowMin)
      }
    }

    const clampedSize = Math.min(maxSize, Math.max(minSize, rawSize.current))
    setSize(clampedSize)
  }, [minSize, maxSize, onHitMinimum])

  const resetRawSize = useCallback(() => {
    rawSize.current = size
    wasBelowMin.current = false
  }, [size])

  const saveSize = useCallback(() => {
    try {
      localStorage.setItem(storageKey, size.toString())
    } catch {
      // localStorage not available
    }
    rawSize.current = size
    wasBelowMin.current = false
  }, [storageKey, size])

  return { size, setSize, handleResize, saveSize, resetRawSize }
}
