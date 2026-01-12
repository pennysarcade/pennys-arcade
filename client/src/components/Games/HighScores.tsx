import { useEffect, useState } from 'react'

interface Score {
  id: number
  username: string
  avatar_color: string
  score: number
  stats: string | null
  created_at: string
}

interface HighScoresProps {
  gameId: string
  onClose: () => void
}

export default function HighScores({ gameId, onClose }: HighScoresProps) {
  const [scores, setScores] = useState<Score[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchScores() {
      try {
        const response = await fetch(`/api/scores/${gameId}?limit=10`)
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
  }, [gameId])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString()
  }

  return (
    <div className="high-scores-container">
      <div className="high-scores-header">
        <h2>High Scores</h2>
        <button className="btn" onClick={onClose}>Back to Game</button>
      </div>

      {loading ? (
        <div className="high-scores-loading">Loading scores...</div>
      ) : scores.length === 0 ? (
        <div className="high-scores-empty">
          <p>No scores yet!</p>
          <p>Be the first to set a high score.</p>
        </div>
      ) : (
        <div className="high-scores-table">
          <div className="high-scores-row high-scores-header-row">
            <span className="rank-col">#</span>
            <span className="player-col">Player</span>
            <span className="score-col">Score</span>
            <span className="date-col">Date</span>
          </div>
          {scores.map((score, index) => (
            <div
              key={score.id}
              className={`high-scores-row ${index < 3 ? `top-${index + 1}` : ''}`}
            >
              <span className="rank-col">{index + 1}</span>
              <span className="player-col">
                <span
                  className="player-avatar"
                  style={{ backgroundColor: score.avatar_color }}
                />
                {score.username}
              </span>
              <span className="score-col">{score.score.toLocaleString()}</span>
              <span className="date-col">{formatDate(score.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="high-scores-footer">
        <p>Only registered users can submit scores</p>
      </div>
    </div>
  )
}
