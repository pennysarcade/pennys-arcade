import { Link } from 'react-router-dom'
import { useRef, useState } from 'react'

interface GameCardProps {
  id: string
  title: string
  description: string
  banner?: string
  video?: string
}

export default function GameCard({ id, title, description, banner, video }: GameCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isHovering, setIsHovering] = useState(false)

  const handleMouseEnter = () => {
    setIsHovering(true)
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play()
    }
  }

  const handleMouseLeave = () => {
    setIsHovering(false)
    if (videoRef.current) {
      videoRef.current.pause()
    }
  }

  return (
    <Link to={`/game/${id}`} style={{ textDecoration: 'none' }}>
      <div
        className="card game-card"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="game-card-banner">
          {banner ? (
            <>
              <img
                src={banner}
                alt={title}
                className="game-card-banner-img"
                style={{ opacity: isHovering && video ? 0 : 1 }}
              />
              {video && (
                <video
                  ref={videoRef}
                  src={video}
                  className="game-card-banner-video"
                  muted
                  loop
                  playsInline
                  style={{ opacity: isHovering ? 1 : 0 }}
                />
              )}
            </>
          ) : (
            <span className="game-card-banner-placeholder">?</span>
          )}
        </div>
        <div className="game-card-info">
          <h3 className="game-card-title">{title}</h3>
          <p className="game-card-description">{description}</p>
        </div>
      </div>
    </Link>
  )
}
