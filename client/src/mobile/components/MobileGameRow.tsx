import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GAMES, type GameConfig } from '../../components/Games/ArcadeGrid'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'
import type { LobbyStatus } from '../../components/Games/GameCard'

export default function MobileGameRow() {
  const { user } = useAuth()
  const { socket } = useSocket()
  const [lobbyStatuses, setLobbyStatuses] = useState<Record<string, LobbyStatus>>({})

  // Listen for hexgrid lobby status updates
  useEffect(() => {
    if (!socket) return

    const handleLobbyStatus = (data: {
      lobbyId: string
      playerCount: number
      maxPlayers: number
      status: string
    }) => {
      setLobbyStatuses((prev) => ({
        ...prev,
        hexgrid: {
          playerCount: data.playerCount,
          maxPlayers: data.maxPlayers,
          status: data.status as LobbyStatus['status'],
        },
      }))
    }

    socket.on('hexgrid:lobby_status', handleLobbyStatus)

    return () => {
      socket.off('hexgrid:lobby_status', handleLobbyStatus)
    }
  }, [socket])

  const isGuest = user?.isGuest ?? true

  // Filter out desktop-only games, then sort: active games (with banners) first
  const mobileGames = GAMES.filter((game) => game.platforms !== 'desktop')
  const sortedGames = [...mobileGames].sort((a, b) => {
    const aActive = !!a.banner
    const bActive = !!b.banner
    if (aActive && !bActive) return -1
    if (!aActive && bActive) return 1
    return 0
  })

  const getGameState = (game: GameConfig) => {
    const isPlaceholder = !game.banner
    const requiresAuthButGuest = game.requiresAuth && isGuest
    const lobbyStatus = game.multiplayer ? lobbyStatuses[game.id] : undefined
    const lobbyFull = lobbyStatus && game.maxPlayers && lobbyStatus.playerCount >= game.maxPlayers

    let disabled = false
    let disabledReason: string | undefined

    if (isPlaceholder) {
      disabled = true
      disabledReason = 'Coming soon'
    } else if (requiresAuthButGuest) {
      disabled = true
      disabledReason = 'Register to play'
    } else if (lobbyFull) {
      disabled = true
      disabledReason = 'Lobby full'
    }

    return { isPlaceholder, disabled, disabledReason, lobbyStatus }
  }

  return (
    <div className="mobile-game-row">
      {sortedGames.map((game) => {
        const { isPlaceholder, disabled, disabledReason, lobbyStatus } = getGameState(game)

        const card = (
          <div className={`mobile-game-card ${isPlaceholder ? 'placeholder' : ''} ${disabled && !isPlaceholder ? 'disabled' : ''}`}>
            {lobbyStatus && (
              <div className="mobile-game-card-lobby">
                <span className={`lobby-dot ${lobbyStatus.status}`}></span>
                <span>{lobbyStatus.playerCount}/{lobbyStatus.maxPlayers}</span>
              </div>
            )}

            <div className="mobile-game-card-banner">
              {game.banner ? (
                <img src={game.banner} alt={game.title} />
              ) : (
                <span className="mobile-game-card-placeholder">?</span>
              )}
            </div>

            <div className="mobile-game-card-info">
              <h3 className="mobile-game-card-title">{game.title}</h3>
              <p className="mobile-game-card-desc">
                {disabled ? disabledReason : game.description}
              </p>
            </div>

            {disabled && !isPlaceholder && (
              <div className="mobile-game-card-overlay">
                <span>{disabledReason}</span>
              </div>
            )}
          </div>
        )

        if (disabled) {
          return (
            <div key={game.id} style={{ cursor: 'not-allowed' }}>
              {card}
            </div>
          )
        }

        return (
          <Link key={game.id} to={`/game/${game.id}`}>
            {card}
          </Link>
        )
      })}
    </div>
  )
}
