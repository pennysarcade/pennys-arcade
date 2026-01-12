import { useCallback, useRef, useEffect, useState } from 'react'

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
  onResizeEnd?: () => void
  onActiveChange?: (active: boolean) => void
}

export default function ResizeHandle({ direction, onResize, onResizeEnd, onActiveChange }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const startPos = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    startPos.current = direction === 'vertical' ? e.clientX : e.clientY
    document.body.classList.add('resizing')
    onActiveChange?.(true)
  }, [direction, onActiveChange])

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true)
    if (!isDragging) onActiveChange?.(true)
  }, [isDragging, onActiveChange])

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false)
    if (!isDragging) onActiveChange?.(false)
  }, [isDragging, onActiveChange])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'vertical' ? e.clientX : e.clientY
      const delta = startPos.current - currentPos
      startPos.current = currentPos
      onResize(delta)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.body.classList.remove('resizing')
      onResizeEnd?.()
      if (!isHovering) onActiveChange?.(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, isHovering, direction, onResize, onResizeEnd, onActiveChange])

  return (
    <div
      className={`resize-handle resize-handle-${direction}${isDragging ? ' dragging' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    />
  )
}
