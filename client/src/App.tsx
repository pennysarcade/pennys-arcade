import { Routes, Route } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useDeviceType } from './hooks/useDeviceType'
import DesktopApp from './layouts/DesktopApp'
import MobileApp from './layouts/MobileApp'

function App() {
  const { isLoading, loadingProgress, loadingStatus } = useAuth()
  const { isMobile } = useDeviceType()

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
      <Route path="*" element={isMobile ? <MobileApp /> : <DesktopApp />} />
    </Routes>
  )
}

export default App
