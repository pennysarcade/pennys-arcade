import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import MobileHeader from '../mobile/components/MobileHeader'
import BurgerMenu from '../mobile/components/BurgerMenu'
import MobileHome from '../mobile/pages/MobileHome'
import MobileChat from '../mobile/pages/MobileChat'
import MobileGame from '../mobile/pages/MobileGame'
import MobileProfile from '../mobile/pages/MobileProfile'
import About from '../pages/About'
import Leaderboard from '../pages/Leaderboard'
import Privacy from '../pages/Privacy'
import '../mobile/mobile.css'

export default function MobileApp() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="mobile-app">
      <MobileHeader onMenuToggle={() => setMenuOpen(true)} />

      <main className="mobile-main">
        <Routes>
          <Route path="/" element={<MobileHome />} />
          <Route path="/chat" element={<MobileChat />} />
          <Route path="/game/:id" element={<MobileGame />} />
          <Route path="/:id" element={<MobileGame />} />
          <Route path="/profile" element={<MobileProfile />} />
          <Route path="/about" element={<About />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/roadmap" element={<Navigate to="/about" replace />} />
          <Route path="/privacy" element={<Privacy />} />
        </Routes>
      </main>

      <BurgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  )
}
