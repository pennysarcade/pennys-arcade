import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'
import { GAMES, type GameConfig } from '../../components/Games/ArcadeGrid'
import MobileTicker from '../components/MobileTicker'

interface ExtendedGameConfig extends GameConfig {
  path?: string
}

// Game paths for playable games
const GAME_PATHS: Record<string, string> = {
  'tessles': '/games/tessles/index.html',
  'onzac': '/games/onzac/index.html',
}

// Build game configs from GAMES array
const GAME_CONFIGS: Record<string, ExtendedGameConfig> = {}
GAMES.forEach(game => {
  GAME_CONFIGS[game.id] = {
    ...game,
    path: GAME_PATHS[game.id]
  }
})

interface HighScoreData {
  score: number
  username: string
}

export default function MobileGame() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const { addTickerMessage } = useSocket()
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'starting' | 'playing' | 'ending' | 'error'>('idle')
  const sessionStartedRef = useRef(false)
  const initialGameStartIgnoredRef = useRef(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [highScoreData, setHighScoreData] = useState<HighScoreData | null>(null)

  const game = id ? GAME_CONFIGS[id] : null

  const startSession = useCallback(async (gameId: string) => {
    if (!token || user?.isGuest) return null
    if (sessionStartedRef.current) return null

    sessionStartedRef.current = true
    setSessionStatus('starting')

    try {
      const response = await fetch(`/api/scores/session/start/${gameId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ platform: 'mobile' })
      })

      if (response.ok) {
        const data = await response.json()
        setSessionId(data.sessionId)
        setSessionStatus('playing')
        return data.sessionId
      } else {
        setSessionStatus('error')
        return null
      }
    } catch {
      setSessionStatus('error')
      return null
    }
  }, [token, user?.isGuest])

  const updateSessionScore = useCallback(async (currentSessionId: number, score: number, stats?: unknown) => {
    if (!token || user?.isGuest) return

    try {
      await fetch(`/api/scores/session/update/${currentSessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ score, stats })
      })
    } catch {
      // Silent fail
    }
  }, [token, user?.isGuest])

  const endSession = useCallback(async (currentSessionId: number, score: number, stats: unknown) => {
    setSessionStatus('ending')

    try {
      const response = await fetch(`/api/scores/session/end/${currentSessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ score, stats })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.isNewHighScore) {
          addTickerMessage(`NEW #1 HIGH SCORE! ${score.toLocaleString()} points!`, 'celebration')
        } else if (data.isPersonalBest) {
          addTickerMessage(`New personal best! ${score.toLocaleString()} pts`, 'success')
        } else {
          addTickerMessage(`Score saved: ${score.toLocaleString()} pts`, 'success')
        }
        setSessionStatus('idle')
        setSessionId(null)
        sessionStartedRef.current = false
        return true
      }
      setSessionStatus('error')
      return false
    } catch {
      setSessionStatus('error')
      return false
    }
  }, [token, addTickerMessage])

  const submitScoreDirect = useCallback(async (gameId: string, score: number, stats: unknown, existingSessionId?: number) => {
    try {
      const response = await fetch(`/api/scores/${gameId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ score, stats, sessionId: existingSessionId })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.isNewHighScore) {
          addTickerMessage(`NEW #1 HIGH SCORE! ${score.toLocaleString()} points!`, 'celebration')
        } else if (data.isPersonalBest) {
          addTickerMessage(`New personal best! ${score.toLocaleString()} pts`, 'success')
        } else {
          addTickerMessage(`Score saved: ${score.toLocaleString()} pts`, 'success')
        }
        return true
      }
      return false
    } catch {
      return false
    }
  }, [token, addTickerMessage])

  const submitScore = useCallback(async (gameId: string, score: number, stats: unknown) => {
    if (!token || user?.isGuest) return

    if (sessionId) {
      const success = await endSession(sessionId, score, stats)
      if (!success) {
        await submitScoreDirect(gameId, score, stats, sessionId)
      }
    } else {
      await submitScoreDirect(gameId, score, stats)
    }
  }, [token, user?.isGuest, sessionId, endSession, submitScoreDirect])

  useEffect(() => {
    if (!id) return

    fetch(`/api/scores/${id}?limit=1`)
      .then(res => res.json())
      .then(data => {
        if (data.scores && data.scores.length > 0) {
          setHighScoreData({
            score: data.scores[0].score,
            username: data.scores[0].username
          })
        }
      })
      .catch(() => {})
  }, [id])

  useEffect(() => {
    if (!highScoreData || !iframeRef.current) return

    const sendHighScore = () => {
      iframeRef.current?.contentWindow?.postMessage({
        type: 'HIGH_SCORE_DATA',
        score: highScoreData.score,
        username: highScoreData.username
      }, '*')
    }

    sendHighScore()
    const iframe = iframeRef.current
    iframe.addEventListener('load', sendHighScore)
    return () => iframe.removeEventListener('load', sendHighScore)
  }, [highScoreData])

  useEffect(() => {
    if (id && game?.path && token && !user?.isGuest) {
      startSession(id)
    }

    return () => {
      sessionStartedRef.current = false
      initialGameStartIgnoredRef.current = false
    }
  }, [id, game?.path, token, user?.isGuest, startSession])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GAME_OVER' && event.data?.game === id) {
        submitScore(event.data.game, event.data.score, event.data.stats)
      }
      if (event.data?.type === 'SCORE_UPDATE' && event.data?.game === id && sessionId) {
        updateSessionScore(sessionId, event.data.score, event.data.stats)
      }
      if (event.data?.type === 'TICKER_MESSAGE' && event.data?.game === id) {
        addTickerMessage(event.data.message, event.data.level || 'info')
      }
      if (event.data?.type === 'GAME_START' && event.data?.game === id && id) {
        if (!initialGameStartIgnoredRef.current) {
          initialGameStartIgnoredRef.current = true
          return
        }
        sessionStartedRef.current = false
        setSessionId(null)
        setSessionStatus('idle')
        startSession(id)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [id, sessionId, submitScore, updateSessionScore, startSession, addTickerMessage])

  if (!game) {
    return (
      <div className="mobile-game">
        <div className="mobile-game-header">
          <button className="mobile-game-back" onClick={() => navigate('/')}>←</button>
          <h1>Game Not Found</h1>
        </div>
        <div className="mobile-game-placeholder">
          <p>The requested game does not exist.</p>
        </div>
      </div>
    )
  }

  const isPlayable = !!game.path

  return (
    <div className="mobile-game">
      <div className="mobile-game-header">
        <button className="mobile-game-back" onClick={() => navigate('/')}>←</button>
        <h1>{game.title}</h1>
        {sessionStatus === 'playing' && <span className="mobile-game-status">●</span>}
      </div>

      {isPlayable ? (
        <>
          <div className="mobile-game-container">
            <iframe
              ref={iframeRef}
              src={`${game.path}?mobile=true`}
              className="mobile-game-iframe"
              title={game.title}
              allow="autoplay"
            />
          </div>
          <MobileTicker />
        </>
      ) : (
        <div className="mobile-game-placeholder">
          <h2>Under Construction</h2>
          <p>{game.description}</p>
          <p className="mobile-game-placeholder-sub">This game is currently in development.</p>
        </div>
      )}
    </div>
  )
}
