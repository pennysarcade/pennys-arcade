import { useEffect, useState } from 'react'
import GameCard, { LobbyStatus } from './GameCard'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'

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
  // HEXGRID - temporarily offline for further development
  // {
  //   id: 'hexgrid',
  //   title: 'HEXGRID',
  //   description: 'Claim territory. Eliminate rivals!',
  //   banner: '/games/hexgrid/banner.jpg',
  //   platforms: 'both',
  //   requiresAuth: true,
  //   multiplayer: true,
  //   maxPlayers: 4,
  // },
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

  // Filter out mobile-only games for desktop view
  const desktopGames = GAMES.filter((game) => game.platforms !== 'mobile')

  const isGuest = user?.isGuest ?? true

  return (
    <div className="arcade-grid">
      {desktopGames.map((game) => {
        // Check if game requires auth and user is guest
        const requiresAuthButGuest = game.requiresAuth && isGuest
        // Check if lobby is full (for multiplayer games)
        const lobbyStatus = game.multiplayer ? lobbyStatuses[game.id] : undefined
        const lobbyFull =
          lobbyStatus && game.maxPlayers && lobbyStatus.playerCount >= game.maxPlayers

        let disabled = false
        let disabledReason: string | undefined

        if (requiresAuthButGuest) {
          disabled = true
          disabledReason = 'Register to play'
        } else if (lobbyFull) {
          disabled = true
          disabledReason = 'Lobby full'
        }

        return (
          <GameCard
            key={game.id}
            id={game.id}
            title={game.title}
            description={game.description}
            banner={game.banner}
            video={game.video}
            disabled={disabled}
            disabledReason={disabledReason}
            lobbyStatus={lobbyStatus}
          />
        )
      })}
    </div>
  )
}
