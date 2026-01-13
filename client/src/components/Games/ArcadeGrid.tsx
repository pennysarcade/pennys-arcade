import GameCard from './GameCard'

// Platform support types: 'both' | 'desktop' | 'mobile'
export type PlatformSupport = 'both' | 'desktop' | 'mobile'

export interface GameConfig {
  id: string
  title: string
  description: string
  banner?: string
  video?: string
  platforms?: PlatformSupport  // defaults to 'both' if not specified
}

export const GAMES: GameConfig[] = [
  { id: 'tessles', title: 'Tessles', description: 'Dodge, dash, survive!', banner: '/games/tessles/banner.jpg', video: '/games/tessles/banner.webm', platforms: 'both' },
  { id: 'onzac', title: 'ONZAC', description: 'Oh no, zombies are coming!', banner: '/games/onzac/banner.jpg', video: '/games/onzac/banner.webm', platforms: 'both' },
  { id: '03', title: 'Game 03', description: 'Under construction...' },
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
  // Filter out mobile-only games for desktop view
  const desktopGames = GAMES.filter(game => game.platforms !== 'mobile')

  return (
    <div className="arcade-grid">
      {desktopGames.map((game) => (
        <GameCard
          key={game.id}
          id={game.id}
          title={game.title}
          description={game.description}
          banner={game.banner}
          video={game.video}
        />
      ))}
    </div>
  )
}
