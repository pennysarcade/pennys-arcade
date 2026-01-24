import GameCard from './GameCard'
import { useAuth } from '../../context/AuthContext'

// Platform support types: 'both' | 'desktop' | 'mobile'
export type PlatformSupport = 'both' | 'desktop' | 'mobile'

export interface GameConfig {
  id: string
  title: string
  description: string
  banner?: string
  video?: string
  platforms?: PlatformSupport // defaults to 'both' if not specified
  requiresAuth?: boolean // requires registered user (not guest)
  multiplayer?: boolean // has real-time multiplayer lobby
  maxPlayers?: number // for multiplayer games
  hidden?: boolean // hidden from game list but still accessible via direct URL
  /**
   * Suppress session/score ticker messages for this game.
   * Used for beta games that don't have proper high score tracking yet.
   *
   * TO RE-ENABLE TICKER MESSAGES:
   * 1. Remove `disableTickerMessages: true` from the game config below
   * 2. Also remove "(Beta)" from the title if the game is out of beta
   *
   * Currently disabled for: orbit
   */
  disableTickerMessages?: boolean
}

export const GAMES: GameConfig[] = [
  {
    id: 'tessles',
    title: 'Tessles',
    description: 'Dodge, dash, survive!',
    banner: '/games/tessles/banner.jpg',
    video: '/games/tessles/banner.webm',
    platforms: 'both',
  },
  {
    id: 'onzac',
    title: 'ONZAC',
    description: 'Oh no, zombies are coming!',
    banner: '/games/onzac/banner.jpg',
    video: '/games/onzac/banner.webm',
    platforms: 'both',
  },
  {
    id: 'orbit',
    title: 'Orbit',
    description: 'Keep the balls in the ring!',
    banner: '/games/orbit/banner.jpg',
    video: '/games/orbit/banner.webm',
    platforms: 'both',
  },
  { id: '04', title: 'Game 04', description: 'Under construction...' },
  { id: '05', title: 'Game 05', description: 'Under construction...' },
  { id: '06', title: 'Game 06', description: 'Under construction...' },
  { id: '07', title: 'Game 07', description: 'Under construction...' },
  { id: '08', title: 'Game 08', description: 'Under construction...' },
  { id: '09', title: 'Game 09', description: 'Under construction...' },
  { id: '10', title: 'Game 10', description: 'Under construction...' },
  { id: '11', title: 'Game 11', description: 'Under construction...' },
  { id: '12', title: 'Game 12', description: 'Under construction...' },
  { id: '13', title: 'Game 13', description: 'Under construction...' },
  { id: '14', title: 'Game 14', description: 'Under construction...' },
  { id: '15', title: 'Game 15', description: 'Under construction...' },
  { id: '16', title: 'Game 16', description: 'Under construction...' },
  { id: '17', title: 'Game 17', description: 'Under construction...' },
  { id: '18', title: 'Game 18', description: 'Under construction...' },
  { id: '19', title: 'Game 19', description: 'Under construction...' },
  { id: '20', title: 'Game 20', description: 'Under construction...' },
]

export default function ArcadeGrid() {
  const { user } = useAuth()

  // Filter out mobile-only and hidden games for desktop view
  const desktopGames = GAMES.filter((game) => game.platforms !== 'mobile' && !game.hidden)

  const isGuest = user?.isGuest ?? true

  return (
    <div className="arcade-grid">
      {desktopGames.map((game) => {
        // Check if game requires auth and user is guest
        const requiresAuthButGuest = game.requiresAuth && isGuest

        return (
          <GameCard
            key={game.id}
            id={game.id}
            title={game.title}
            description={game.description}
            banner={game.banner}
            video={game.video}
            disabled={requiresAuthButGuest}
            disabledReason={requiresAuthButGuest ? 'Register to play' : undefined}
            multiplayer={game.multiplayer}
          />
        )
      })}
    </div>
  )
}
