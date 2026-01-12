import { useRef, useEffect, useState } from 'react'

interface FitTextProps {
  line1: string
  line2: string
  className?: string
}

export default function FitText({ line1, line2, className }: FitTextProps) {
  const line1Ref = useRef<HTMLSpanElement>(null)
  const line2Ref = useRef<HTMLSpanElement>(null)
  const [letterSpacing, setLetterSpacing] = useState(2)

  useEffect(() => {
    const adjustSpacing = () => {
      if (!line1Ref.current || !line2Ref.current) return

      // Reset to measure natural width
      line2Ref.current.style.letterSpacing = '2px'

      // Force reflow to get accurate measurement
      void line2Ref.current.offsetWidth

      const line1Width = line1Ref.current.offsetWidth
      const line2NaturalWidth = line2Ref.current.offsetWidth
      const line2CharCount = line2.length - 1 // gaps between chars

      if (line2NaturalWidth < line1Width && line2CharCount > 0) {
        const extraSpace = (line1Width - line2NaturalWidth) / line2CharCount
        const newSpacing = 2 + extraSpace
        setLetterSpacing(newSpacing)
        line2Ref.current.style.letterSpacing = `${newSpacing}px`
      }
    }

    // Run after a short delay to ensure layout is complete
    const timeoutId = setTimeout(adjustSpacing, 50)
    window.addEventListener('resize', adjustSpacing)
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', adjustSpacing)
    }
  }, [line1, line2])

  return (
    <span className={className}>
      <span ref={line1Ref} className="fit-text-line1">{line1}</span>
      <span
        ref={line2Ref}
        className="fit-text-line2"
        style={{ letterSpacing: `${letterSpacing}px` }}
      >
        {line2}
      </span>
    </span>
  )
}
