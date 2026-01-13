import { useState, useEffect, useRef, useCallback } from 'react'
import { TickerMessage } from '../../context/SocketContext'

interface TypewriterTickerProps {
  messages: TickerMessage[]
  onMessageComplete: (id: number) => void
}

type TickerState = 'idle' | 'typing' | 'showing' | 'deleting'

const TYPE_SPEED = 35 // ms per character
const DELETE_SPEED = 20 // ms per character
const SHOW_DURATION = 5000 // ms to show completed message
const SCROLL_DURATION = 8000 // ms for scrolling long messages

export default function TypewriterTicker({ messages, onMessageComplete }: TypewriterTickerProps) {
  const [displayText, setDisplayText] = useState('')
  const [state, setState] = useState<TickerState>('idle')
  const [currentMessage, setCurrentMessage] = useState<TickerMessage | null>(null)
  const [messageType, setMessageType] = useState<TickerMessage['type']>('info')
  const [isScrolling, setIsScrolling] = useState(false)
  const [scrollDistance, setScrollDistance] = useState(0)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const processedIdsRef = useRef<Set<number>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  const clearCurrentTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  // Start typing a new message
  const startTyping = useCallback((message: TickerMessage) => {
    setCurrentMessage(message)
    setMessageType(message.type)
    setDisplayText('')
    setState('typing')
  }, [])

  // Process the typing/showing/deleting states
  useEffect(() => {
    if (!currentMessage) return

    clearCurrentTimeout()

    if (state === 'typing') {
      const targetText = currentMessage.text
      if (displayText.length < targetText.length) {
        timeoutRef.current = setTimeout(() => {
          setDisplayText(targetText.slice(0, displayText.length + 1))
        }, TYPE_SPEED)
      } else {
        // Typing complete, check if text overflows and needs scrolling
        if (containerRef.current && textRef.current) {
          const containerWidth = containerRef.current.offsetWidth - 30 // account for padding
          const textWidth = textRef.current.scrollWidth
          if (textWidth > containerWidth) {
            setScrollDistance(containerWidth - textWidth - 20) // negative value to scroll left
            setIsScrolling(true)
          }
        }
        setState('showing')
      }
    } else if (state === 'showing') {
      // Use longer duration if scrolling
      const duration = isScrolling ? SCROLL_DURATION : SHOW_DURATION
      timeoutRef.current = setTimeout(() => {
        setIsScrolling(false)
        setScrollDistance(0)
        setState('deleting')
      }, duration)
    } else if (state === 'deleting') {
      if (displayText.length > 0) {
        timeoutRef.current = setTimeout(() => {
          setDisplayText(displayText.slice(0, -1))
        }, DELETE_SPEED)
      } else {
        // Deletion complete
        processedIdsRef.current.add(currentMessage.id)
        onMessageComplete(currentMessage.id)
        setCurrentMessage(null)
        setState('idle')
      }
    }

    return clearCurrentTimeout
  }, [state, displayText, currentMessage, onMessageComplete, clearCurrentTimeout, isScrolling])

  // Pick up new messages from the queue
  useEffect(() => {
    if (state === 'idle' && messages.length > 0) {
      // Find first unprocessed message
      const nextMessage = messages.find(m => !processedIdsRef.current.has(m.id))
      if (nextMessage) {
        startTyping(nextMessage)
      }
    }
  }, [state, messages, startTyping])

  // Clean up processed IDs periodically (keep last 100)
  useEffect(() => {
    if (processedIdsRef.current.size > 100) {
      const idsArray = Array.from(processedIdsRef.current)
      processedIdsRef.current = new Set(idsArray.slice(-50))
    }
  }, [currentMessage])

  const showCursor = state === 'typing' || state === 'showing' || state === 'deleting'

  return (
    <div className="typewriter-ticker" ref={containerRef}>
      <span
        ref={textRef}
        className={`typewriter-text typewriter-${messageType}${isScrolling ? ' scrolling' : ''}`}
        style={isScrolling ? { '--scroll-distance': `${scrollDistance}px` } as React.CSSProperties : undefined}
      >
        {displayText}
      </span>
      {showCursor && <span className={`typewriter-cursor typewriter-${messageType}`}>_</span>}
    </div>
  )
}
