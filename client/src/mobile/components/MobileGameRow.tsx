import { Link } from 'react-router-dom'
import { GAMES } from '../../components/Games/ArcadeGrid'

export default function MobileGameRow() {
  // Filter out desktop-only games, then sort: active games (with banners) first
  const mobileGames = GAMES.filter(game => game.platforms !== 'desktop')
  const sortedGames = [...mobileGames].sort((a, b) => {
    const aActive = !!a.banner
    const bActive = !!b.banner
    if (aActive && !bActive) return -1
    if (!aActive && bActive) return 1
    return 0
  })

  return (
    <div className="mobile-game-row">
      {sortedGames.map((game) => {
        const isPlaceholder = !game.banner

        return (
          <Link
            key={game.id}
            to={isPlaceholder ? '#' : `/game/${game.id}`}
            className={`mobile-game-card ${isPlaceholder ? 'placeholder' : ''}`}
            onClick={(e) => isPlaceholder && e.preventDefault()}
          >
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
                {isPlaceholder ? 'Coming soon' : game.description}
              </p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
