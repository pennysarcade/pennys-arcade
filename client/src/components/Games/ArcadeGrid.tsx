import GameCard from './GameCard'

export const GAMES = [
  { id: 'tessles', title: 'Tessles', description: 'Dodge, dash, survive!', banner: '/games/tessles/banner.jpg', video: '/games/tessles/banner.webm' },
  { id: 'onzac', title: 'ONZAC', description: 'Oh no, zombies are coming!', banner: '/games/onzac/banner.jpg', video: '/games/onzac/banner.webm' },
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
  return (
    <div className="arcade-grid">
      {GAMES.map((game) => (
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
