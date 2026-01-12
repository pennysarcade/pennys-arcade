import { useState, useRef, useEffect, ReactNode } from 'react'

interface ScrollContainerProps {
  children: ReactNode
  className?: string
}

export default function ScrollContainer({ children, className = '' }: ScrollContainerProps) {
  const [atBottom, setAtBottom] = useState(false)
  const [canScroll, setCanScroll] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const checkScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const isScrollable = scrollHeight > clientHeight
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10

      setCanScroll(isScrollable)
      setAtBottom(isAtBottom)
    }

    checkScroll()
    container.addEventListener('scroll', checkScroll)

    const resizeObserver = new ResizeObserver(checkScroll)
    resizeObserver.observe(container)

    return () => {
      container.removeEventListener('scroll', checkScroll)
      resizeObserver.disconnect()
    }
  }, [])

  const showIndicator = canScroll && !atBottom

  return (
    <div className="scroll-container-wrapper">
      <div ref={containerRef} className={`scroll-container-inner ${className}`}>
        {children}
      </div>
      <div className={`scroll-indicator ${showIndicator ? '' : 'hidden'}`}>
        <span className="scroll-indicator-arrow">▼</span>
      </div>
    </div>
  )
}
