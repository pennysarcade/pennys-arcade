import { Link } from 'react-router-dom'
import { useRef, useState } from 'react'

export interface LobbyStatus {
  playerCount: number
  maxPlayers: number
  status: 'waiting' | 'playing' | 'countdown' | 'ending'
}

interface GameCardProps {
  id: string
  title: string
  description: string
  banner?: string
  video?: string
  disabled?: boolean
  disabledReason?: string
  lobbyStatus?: LobbyStatus
}

export default function GameCard({
  id,
  title,
  description,
  banner,
  video,
  disabled,
  disabledReason,
  lobbyStatus,
}: GameCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isHovering, setIsHovering] = useState(false)

  const handleMouseEnter = () => {
    if (disabled) return
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

  const cardContent = (
    <div
      className={`card game-card ${disabled ? 'game-card-disabled' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {lobbyStatus && (
        <div className="game-card-lobby-status">
          <span className={`lobby-dot ${lobbyStatus.status}`}></span>
          <span>
            {lobbyStatus.playerCount}/{lobbyStatus.maxPlayers}
          </span>
        </div>
      )}

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

      {disabled && (
        <div className="game-card-disabled-overlay">
          <span>{disabledReason || 'Unavailable'}</span>
        </div>
      )}
    </div>
  )

  if (disabled) {
    return <div style={{ textDecoration: 'none', cursor: 'not-allowed' }}>{cardContent}</div>
  }

  return (
    <Link to={`/${id}`} style={{ textDecoration: 'none' }}>
      {cardContent}
    </Link>
  )
}
