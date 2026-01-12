import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import MainLayout from './components/Layout/MainLayout'
import Home from './pages/Home'
import Game from './pages/Game'
import Leaderboard from './pages/Leaderboard'
import Privacy from './pages/Privacy'
import About from './pages/About'
import Admin from './pages/Admin'

function App() {
  const { isLoading, loadingProgress, loadingStatus } = useAuth()

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <img src="/logo.png" alt="Penny's Arcade" className="loading-logo" />
          <h1 className="loading-title">Penny's Arcade</h1>
          <div className="loading-progress-container">
            <div className="loading-progress-bar">
              <div
                className="loading-progress-fill"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <div className="loading-progress-text">{Math.round(loadingProgress)}%</div>
          </div>
          <div className="loading-status">{loadingStatus}</div>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={
        <MainLayout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/game/:id" element={<Game />} />
            <Route path="/about" element={<About />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/roadmap" element={<Navigate to="/about" replace />} />
            <Route path="/privacy" element={<Privacy />} />
          </Routes>
        </MainLayout>
      } />
    </Routes>
  )
}

export default App
