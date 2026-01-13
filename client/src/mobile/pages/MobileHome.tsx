import { useAuth } from '../../context/AuthContext'
import MobileGameRow from '../components/MobileGameRow'

export default function MobileHome() {
  const { user } = useAuth()

  return (
    <div className="mobile-home">
      <section className="mobile-home-section">
        <MobileGameRow />
      </section>

      <section className="mobile-home-welcome">
        <p>
          {user?.isGuest
            ? 'Welcome! Sign in to save your scores and chat with others.'
            : `Welcome back, ${user?.username}!`}
        </p>
      </section>
    </div>
  )
}
