import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GAMES } from '../components/Games/ArcadeGrid'

interface HighScore {
  id: number
  username: string
  avatar_color: string
  avatar_image: string | null
  game_id: string
  score: number
  platform?: string
  created_at: string
}

interface PersonalBest {
  game_id: string
  score: number
  plays: string
}

const playableGames = GAMES.filter(g => g.banner)

export default function Leaderboard() {
  const { user, token } = useAuth()
  const [scores, setScores] = useState<HighScore[]>([])
  const [personalBests, setPersonalBests] = useState<PersonalBest[]>([])
  const [selectedGame, setSelectedGame] = useState('')
  const [loading, setLoading] = useState(true)

  // Fetch scores for selected game (or all champions if none selected)
  useEffect(() => {
    async function fetchScores() {
      setLoading(true)
      try {
        const url = selectedGame
          ? `/api/scores/${selectedGame}?limit=100`
          : '/api/scores/'
        const response = await fetch(url)
        if (response.ok) {
          const data = await response.json()
          setScores(data.scores)
        }
      } catch (error) {
        console.error('Failed to fetch scores:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchScores()
  }, [selectedGame])

  // Fetch personal bests if logged in
  useEffect(() => {
    if (!token) return
    async function fetchPersonalBests() {
      try {
        const response = await fetch('/api/scores/user/me', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (response.ok) {
          const data = await response.json()
          setPersonalBests(data.scores)
        }
      } catch (error) {
        console.error('Failed to fetch personal bests:', error)
      }
    }
    fetchPersonalBests()
  }, [token])

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  const getGameName = (gameId: string) => {
    return playableGames.find(g => g.id === gameId)?.title || gameId
  }

  return (
    <div className="leaderboard-page">
      <div className="leaderboard-controls">
        <select
          value={selectedGame}
          onChange={(e) => setSelectedGame(e.target.value)}
          className="leaderboard-select"
        >
          <option value="">All Games (Champions Only)</option>
          {playableGames.map(game => (
            <option key={game.id} value={game.id}>{game.title}</option>
          ))}
        </select>
        {selectedGame && (
          <Link to={`/game/${selectedGame}`} className="btn btn-small">
            Play {getGameName(selectedGame)}
          </Link>
        )}
      </div>

      <div className="leaderboard-section">
        <h2>{selectedGame ? `${getGameName(selectedGame)} Top Scores` : 'Champions'}</h2>

        {loading ? (
          <div className="leaderboard-loading">Loading...</div>
        ) : scores.length === 0 ? (
          <div className="leaderboard-loading">No scores recorded yet</div>
        ) : (
          <div className="leaderboard-table-container">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  {selectedGame && <th style={{ width: '60px' }}>Rank</th>}
                  {!selectedGame && <th>Game</th>}
                  <th>Player</th>
                  <th style={{ textAlign: 'right' }}>Score</th>
                  <th style={{ width: '120px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((score, index) => (
                  <tr key={score.id}>
                    {selectedGame && (
                      <td className="leaderboard-rank">
                        {index === 0 && <span className="rank-gold">1st</span>}
                        {index === 1 && <span className="rank-silver">2nd</span>}
                        {index === 2 && <span className="rank-bronze">3rd</span>}
                        {index > 2 && <span className="rank-number">{index + 1}</span>}
                      </td>
                    )}
                    {!selectedGame && <td>{getGameName(score.game_id)}</td>}
                    <td>
                      <span className="leaderboard-player">
                        {score.avatar_image ? (
                          <img
                            src={`/avatars/${score.avatar_image}`}
                            alt=""
                            className="leaderboard-avatar leaderboard-avatar-img"
                          />
                        ) : (
                          <span
                            className="leaderboard-avatar"
                            style={{ backgroundColor: score.avatar_color }}
                          />
                        )}
                        {score.username}
                        {score.platform === 'mobile' && (
                          <span className="platform-badge mobile" title="Played on mobile">M</span>
                        )}
                      </span>
                    </td>
                    <td className="leaderboard-score">
                      {score.score.toLocaleString()}
                    </td>
                    <td className="leaderboard-date">{formatDate(score.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {user && !user.isGuest && personalBests.length > 0 && (
        <div className="leaderboard-section">
          <h2>My Personal Bests</h2>
          <div className="leaderboard-table-container">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th style={{ textAlign: 'right' }}>Best Score</th>
                  <th style={{ textAlign: 'right' }}>Times Played</th>
                  <th style={{ width: '100px' }}></th>
                </tr>
              </thead>
              <tbody>
                {personalBests.map(pb => (
                  <tr key={pb.game_id}>
                    <td>{getGameName(pb.game_id)}</td>
                    <td className="leaderboard-score">
                      {pb.score.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>{pb.plays}</td>
                    <td>
                      <Link to={`/game/${pb.game_id}`} className="btn btn-small">
                        Play
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
