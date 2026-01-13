import { useParams } from 'react-router-dom'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { GAMES } from '../components/Games/ArcadeGrid'

interface GameConfig {
  title: string
  description: string
  path?: string
}

const GAME_CONFIGS: Record<string, GameConfig> = {
  'tessles': {
    title: 'Tessles',
    description: 'Dodge, dash, survive!',
    path: '/games/tessles/index.html'
  },
  'onzac': {
    title: 'ONZAC',
    description: 'Oh no, zombies are coming!',
    path: '/games/onzac/index.html'
  },
  'hexgrid': {
    title: 'HEXGRID',
    description: 'Claim territory. Eliminate rivals!',
    path: '/games/hexgrid/index.html'
  },
}

// Add other games from GAMES array
GAMES.forEach(game => {
  if (!GAME_CONFIGS[game.id]) {
    GAME_CONFIGS[game.id] = {
      title: game.title,
      description: game.description
    }
  }
})

interface HighScoreData {
  score: number
  username: string
}

export default function Game() {
  const { id } = useParams<{ id: string }>()
  const { user, token } = useAuth()
  const { addTickerMessage } = useSocket()
  const [sessionId, setSessionId] = useState<number | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_sessionStatus, setSessionStatus] = useState<'idle' | 'starting' | 'playing' | 'ending' | 'error'>('idle')
  const sessionStartedRef = useRef(false)
  const initialGameStartIgnoredRef = useRef(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [highScoreData, setHighScoreData] = useState<HighScoreData | null>(null)

  const game = id ? GAME_CONFIGS[id] : null

  // Start a game session when the game loads
  const startSession = useCallback(async (gameId: string) => {
    if (!token || user?.isGuest) {
      console.log('[SESSION] Skipping session start: not authenticated')
      return null
    }

    if (sessionStartedRef.current) {
      console.log('[SESSION] Session already started, skipping')
      return null
    }

    sessionStartedRef.current = true
    setSessionStatus('starting')
    addTickerMessage('Starting session...', 'info')
    console.log(`[SESSION] Starting session for game: ${gameId}`)

    try {
      const response = await fetch(`/api/scores/session/start/${gameId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        console.log(`[SESSION] Session started: ${data.sessionId}`)
        setSessionId(data.sessionId)
        setSessionStatus('playing')
        addTickerMessage('Session active - your scores will be saved', 'success')
        return data.sessionId
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('[SESSION] Failed to start session:', response.status, errorData)
        setSessionStatus('error')
        addTickerMessage('Session error - scores may not be saved', 'error')
        return null
      }
    } catch (error) {
      console.error('[SESSION] Error starting session:', error)
      setSessionStatus('error')
      addTickerMessage('Session error - scores may not be saved', 'error')
      return null
    }
  }, [token, user?.isGuest, addTickerMessage])

  // Update session score without ending (for periodic saves)
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
      // Silent fail - score updates are best-effort
    }
  }, [token, user?.isGuest])

  // End a game session with score
  const endSession = useCallback(async (currentSessionId: number, score: number, stats: unknown) => {
    console.log(`[SESSION] Ending session ${currentSessionId} with score ${score}`)
    setSessionStatus('ending')
    addTickerMessage('Saving score...', 'info')

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
        console.log('[SESSION] Session ended successfully:', data)

        // Show appropriate ticker message based on result
        if (data.isNewHighScore) {
          addTickerMessage(`NEW #1 HIGH SCORE! ${score.toLocaleString()} points!`, 'celebration')
          addTickerMessage(`You are the champion! ${data.totalPlayers} players have competed`, 'info')
        } else if (data.isPersonalBest) {
          addTickerMessage(`New personal best! ${score.toLocaleString()} pts`, 'success')
          addTickerMessage(`Ranked #${data.rank} - ${data.pointsFromHighScore.toLocaleString()} pts behind ${data.highScoreHolder}`, 'info')
        } else {
          addTickerMessage(`Score: ${score.toLocaleString()} pts - Ranked #${data.rank}`, 'success')
          if (data.pointsFromHighScore > 0) {
            addTickerMessage(`${data.pointsFromHighScore.toLocaleString()} pts to beat ${data.highScoreHolder}'s high score`, 'info')
          }
        }
        if (data.playsToday > 1) {
          addTickerMessage(`Game played ${data.playsToday} times today`, 'info')
        }

        setSessionStatus('idle')
        setSessionId(null)
        sessionStartedRef.current = false
        return true
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('[SESSION] Failed to end session:', response.status, errorData)
        setSessionStatus('error')
        addTickerMessage('Failed to save score', 'error')
        return false
      }
    } catch (error) {
      console.error('[SESSION] Error ending session:', error)
      setSessionStatus('error')
      addTickerMessage('Network error saving score', 'error')
      return false
    }
  }, [token, addTickerMessage])

  // Fallback direct score submission
  const submitScoreDirect = useCallback(async (gameId: string, score: number, stats: unknown, existingSessionId?: number) => {
    console.log(`[SCORE] Direct submission for ${gameId}: ${score}`)

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
        console.log('[SCORE] Direct submission successful:', data)

        // Show appropriate ticker message based on result
        if (data.isNewHighScore) {
          addTickerMessage(`NEW #1 HIGH SCORE! ${score.toLocaleString()} points!`, 'celebration')
          addTickerMessage(`You are the champion! ${data.totalPlayers} players have competed`, 'info')
        } else if (data.isPersonalBest) {
          addTickerMessage(`New personal best! ${score.toLocaleString()} pts`, 'success')
          addTickerMessage(`Ranked #${data.rank} - ${data.pointsFromHighScore.toLocaleString()} pts behind ${data.highScoreHolder}`, 'info')
        } else {
          addTickerMessage(`Score: ${score.toLocaleString()} pts - Ranked #${data.rank}`, 'success')
          if (data.pointsFromHighScore > 0) {
            addTickerMessage(`${data.pointsFromHighScore.toLocaleString()} pts to beat ${data.highScoreHolder}'s high score`, 'info')
          }
        }
        if (data.playsToday > 1) {
          addTickerMessage(`Game played ${data.playsToday} times today`, 'info')
        }
        return true
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('[SCORE] Direct submission failed:', response.status, errorData)
        addTickerMessage(`Score: ${score} - ${errorData.message || 'Failed to save'}`, 'error')
        return false
      }
    } catch (error) {
      console.error('[SCORE] Error in direct submission:', error)
      addTickerMessage(`Score: ${score} - Network error`, 'error')
      return false
    }
  }, [token, addTickerMessage])

  // Main score submission handler
  const submitScore = useCallback(async (gameId: string, score: number, stats: unknown) => {
    if (!token) {
      console.warn('[SCORE] Not submitted: No auth token')
      return
    }
    if (user?.isGuest) {
      console.warn('[SCORE] Not submitted: Guest user')
      return
    }

    console.log(`[SCORE] Processing score for ${gameId}: ${score}, sessionId: ${sessionId}`)

    // If we have an active session, end it with the score
    if (sessionId) {
      const success = await endSession(sessionId, score, stats)
      if (!success) {
        // Fallback to direct submission if session end fails
        console.log('[SCORE] Session end failed, falling back to direct submission')
        await submitScoreDirect(gameId, score, stats, sessionId)
      }
    } else {
      // No session, use direct submission
      await submitScoreDirect(gameId, score, stats)
    }
  }, [token, user?.isGuest, sessionId, endSession, submitScoreDirect])

  // Fetch high score for this game
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
      .catch(() => {
        // Ignore errors - high score display is optional
      })
  }, [id])

  // Send high score data to iframe when it loads
  useEffect(() => {
    if (!highScoreData || !iframeRef.current) return

    const sendHighScore = () => {
      iframeRef.current?.contentWindow?.postMessage({
        type: 'HIGH_SCORE_DATA',
        score: highScoreData.score,
        username: highScoreData.username
      }, '*')
    }

    // Send immediately and also on iframe load
    sendHighScore()
    const iframe = iframeRef.current
    iframe.addEventListener('load', sendHighScore)
    return () => iframe.removeEventListener('load', sendHighScore)
  }, [highScoreData])

  // Start session when game loads
  useEffect(() => {
    if (id && game?.path && token && !user?.isGuest) {
      startSession(id)
    }

    // Cleanup: reset session state when leaving
    return () => {
      sessionStartedRef.current = false
      initialGameStartIgnoredRef.current = false
    }
  }, [id, game?.path, token, user?.isGuest, startSession])

  // Handle game messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GAME_OVER' && event.data?.game === id) {
        submitScore(event.data.game, event.data.score, event.data.stats)
      }
      // Handle score updates (periodic saves during gameplay)
      if (event.data?.type === 'SCORE_UPDATE' && event.data?.game === id && sessionId) {
        updateSessionScore(sessionId, event.data.score, event.data.stats)
      }
      // Handle ticker messages from games
      if (event.data?.type === 'TICKER_MESSAGE' && event.data?.game === id) {
        addTickerMessage(event.data.message, event.data.level || 'info')
      }
      // Handle game restart - start a new session
      // Ignore the first GAME_START (initial load) since useEffect handles that
      if (event.data?.type === 'GAME_START' && event.data?.game === id && id) {
        if (!initialGameStartIgnoredRef.current) {
          console.log('[SESSION] Ignoring initial GAME_START (useEffect handles this)')
          initialGameStartIgnoredRef.current = true
          return
        }
        console.log('[SESSION] Game restart detected, starting new session')
        sessionStartedRef.current = false
        setSessionId(null)
        setSessionStatus('idle')
        startSession(id)
      }
      // Handle HEXGRID auth request
      if (event.data?.type === 'HEXGRID_READY' && event.data?.game === 'hexgrid' && id === 'hexgrid') {
        console.log('[HEXGRID] Auth request received, sending credentials')
        // In development, Socket.io server is on port 3001
        // In production, it's the same origin
        const serverUrl = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin
        iframeRef.current?.contentWindow?.postMessage({
          type: 'HEXGRID_AUTH',
          token: token,
          serverUrl: serverUrl,
          user: {
            id: user?.id,
            username: user?.username,
            avatarColor: user?.avatarColor,
            avatarImage: user?.avatarImage
          }
        }, '*')
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [id, sessionId, submitScore, updateSessionScore, startSession, token, user, addTickerMessage])

  if (!game) {
    return (
      <div className="game-page">
        <div className="game-container">
          <div className="game-placeholder">
            <h2>Game Not Found</h2>
            <p>The requested game does not exist.</p>
          </div>
        </div>
      </div>
    )
  }

  const isPlayable = !!game.path

  return (
    <div className="game-page">
      {isPlayable ? (
        <iframe
          ref={iframeRef}
          src={game.path}
          className="game-iframe"
          title={game.title}
          allow="autoplay"
        />
      ) : (
        <div className="game-container">
          <div className="game-placeholder">
            <h2>Under Construction</h2>
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>
              {game.description}
            </p>
            <p style={{ marginTop: '2rem', fontSize: '0.9rem' }}>
              This game is currently in development.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
