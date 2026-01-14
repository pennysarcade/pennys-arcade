import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from '../components/Layout/MainLayout'
import Home from '../pages/Home'
import Game from '../pages/Game'
import Leaderboard from '../pages/Leaderboard'
import Privacy from '../pages/Privacy'
import About from '../pages/About'
import Admin from '../pages/Admin'

export default function DesktopApp() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/game/:id" element={<Game />} />
        <Route path="/:id" element={<Game />} />
        <Route path="/about" element={<About />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/roadmap" element={<Navigate to="/about" replace />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </MainLayout>
  )
}
