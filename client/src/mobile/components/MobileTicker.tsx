import { useSocket } from '../../context/SocketContext'
import TypewriterTicker from '../../components/Chat/TypewriterTicker'

export default function MobileTicker() {
  const { tickerMessages, removeTickerMessage } = useSocket()

  return (
    <div className="mobile-ticker">
      <TypewriterTicker
        messages={tickerMessages}
        onMessageComplete={removeTickerMessage}
      />
    </div>
  )
}
