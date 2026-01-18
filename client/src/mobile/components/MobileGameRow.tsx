import { Link } from 'react-router-dom'
import { GAMES, type GameConfig } from '../../components/Games/ArcadeGrid'
import { useAuth } from '../../context/AuthContext'

export default function MobileGameRow() {
  const { user } = useAuth()

  const isGuest = user?.isGuest ?? true

  // Filter out desktop-only and hidden games, then sort: active games (with banners) first
  const mobileGames = GAMES.filter((game) => game.platforms !== 'desktop' && !game.hidden)
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

    let disabled = false
    let disabledReason: string | undefined

    if (isPlaceholder) {
      disabled = true
      disabledReason = 'Coming soon'
    } else if (requiresAuthButGuest) {
      disabled = true
      disabledReason = 'Register to play'
    }

    return { isPlaceholder, disabled, disabledReason }
  }

  return (
    <div className="mobile-game-row">
      {sortedGames.map((game) => {
        const { isPlaceholder, disabled, disabledReason } = getGameState(game)

        const card = (
          <div className={`mobile-game-card ${isPlaceholder ? 'placeholder' : ''} ${disabled && !isPlaceholder ? 'disabled' : ''}`}>
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
          <Link key={game.id} to={`/${game.id}`}>
            {card}
          </Link>
        )
      })}
    </div>
  )
}
