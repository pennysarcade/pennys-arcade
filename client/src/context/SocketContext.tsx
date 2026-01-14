import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from './AuthContext'

interface ReplyInfo {
  id: string
  username: string
  text: string
}

interface ChatMessage {
  id: number
  username: string
  text: string
  avatarColor: string
  avatarImage: string | null
  isGuest: boolean
  isAdmin: boolean
  isDeleted: boolean
  isEdited: boolean
  userId: number | null
  timestamp: number
  replyTo: ReplyInfo | null
}

export interface OnlineUser {
  username: string
  avatarColor: string
  avatarImage: string | null
  isGuest: boolean
}

interface ChatStatus {
  enabled: boolean
  offlineMessage: string | null
}

interface MaintenanceStatus {
  enabled: boolean
  message?: string
}

interface Announcement {
  message: string
  timestamp: number
}

interface HighScoreAnnouncement {
  username: string
  gameName: string
  score: number
  timestamp: number
}

export interface TickerMessage {
  id: number
  text: string
  type: 'info' | 'success' | 'error' | 'celebration'
  timestamp: number
}

let tickerIdCounter = 0

interface SocketContextType {
  socket: Socket | null
  isConnected: boolean
  messages: ChatMessage[]
  onlineUsers: OnlineUser[]
  chatStatus: ChatStatus
  guestChatEnabled: boolean
  maintenance: MaintenanceStatus
  registrationsPaused: boolean
  announcement: Announcement | null
  highScoreAnnouncement: HighScoreAnnouncement | null
  messageRateLimitMs: number
  canSendAt: number
  tickerMessages: TickerMessage[]
  sendMessage: (text: string, replyToId?: string) => void
  deleteMessage: (messageId: number) => void
  editMessage: (messageId: number, newText: string) => void
  clearAnnouncement: () => void
  clearHighScoreAnnouncement: () => void
  addTickerMessage: (text: string, type?: TickerMessage['type'], priority?: 'high' | 'low') => void
  removeTickerMessage: (id: number) => void
  updatePage: (page: string) => void
}

const SocketContext = createContext<SocketContextType | undefined>(undefined)

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [chatStatus, setChatStatus] = useState<ChatStatus>({ enabled: true, offlineMessage: null })
  const [guestChatEnabled, setGuestChatEnabled] = useState(false)
  const [maintenance, setMaintenance] = useState<MaintenanceStatus>({ enabled: false })
  const [registrationsPaused, setRegistrationsPaused] = useState(false)
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [highScoreAnnouncement, setHighScoreAnnouncement] = useState<HighScoreAnnouncement | null>(null)
  const [messageRateLimitMs, setMessageRateLimitMs] = useState(1000)
  const [canSendAt, setCanSendAt] = useState(0)
  const [tickerMessages, setTickerMessages] = useState<TickerMessage[]>([])

  // Add a ticker message to the queue
  // Low priority messages are only added if queue is empty
  const addTickerMessage = useCallback((text: string, type: TickerMessage['type'] = 'info', priority: 'high' | 'low' = 'high') => {
    setTickerMessages(prev => {
      // Skip low priority messages if queue is not empty
      if (priority === 'low' && prev.length > 0) return prev
      const msgId = ++tickerIdCounter
      const newMessage: TickerMessage = { id: msgId, text, type, timestamp: Date.now() }
      return [...prev, newMessage]
    })
  }, [])

  // Remove a ticker message (called by TypewriterTicker when done)
  const removeTickerMessage = useCallback((id: number) => {
    setTickerMessages(prev => prev.filter(m => m.id !== id))
  }, [])

  // Fetch site status and chat rate limit on mount
  useEffect(() => {
    fetch('/api/auth/site-status')
      .then(res => res.json())
      .then(data => {
        setRegistrationsPaused(data.registrationsPaused)
        setMaintenance(data.maintenance)
      })
      .catch(err => console.error('Failed to fetch site status:', err))

    // Fetch chat rate limit (public endpoint, no auth needed)
    fetch('/api/auth/chat-rate-limit')
      .then(res => res.json())
      .then(data => {
        if (data.rateLimitMs !== undefined) {
          setMessageRateLimitMs(data.rateLimitMs)
        }
      })
      .catch(() => { /* ignore - will use default */ })
  }, [])

  useEffect(() => {
    if (!user) return

    const newSocket = io({
      auth: {
        token: token || undefined,
        guestUsername: user.isGuest ? user.username : undefined,
        avatarColor: user.avatarColor,
        currentPage: window.location.pathname,
      },
    })

    newSocket.on('connect', () => {
      setIsConnected(true)
    })

    newSocket.on('disconnect', () => {
      setIsConnected(false)
    })

    newSocket.on('chat:history', (history: ChatMessage[]) => {
      setMessages(history)
    })

    newSocket.on('chat:message', (message: ChatMessage) => {
      setMessages((prev) => [...prev, message])
    })

    newSocket.on('chat:users', (users: OnlineUser[]) => {
      setOnlineUsers(users)
    })

    newSocket.on('chat:deleted', (data: { messageId: number; softDelete?: boolean; hardDelete?: boolean }) => {
      const messageId = data.messageId
      const messageIdStr = String(data.messageId)
      if (data.hardDelete) {
        // Hard delete - remove the message entirely and update any replies
        setMessages((prev) =>
          prev
            .filter((msg) => msg.id !== messageId)
            .map((msg) =>
              msg.replyTo && msg.replyTo.id === messageIdStr
                ? { ...msg, replyTo: { ...msg.replyTo, text: '[Message removed.]' } }
                : msg
            )
        )
      } else if (data.softDelete) {
        // Soft delete - update the message content and any replies referencing it
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === messageId) {
              return { ...msg, text: '[Message deleted.]', isDeleted: true }
            }
            if (msg.replyTo && msg.replyTo.id === messageIdStr) {
              return { ...msg, replyTo: { ...msg.replyTo, text: '[Message deleted.]' } }
            }
            return msg
          })
        )
      } else {
        // Legacy hard delete - remove the message
        setMessages((prev) => prev.filter((msg) => msg.id !== messageId))
      }
    })

    newSocket.on('chat:edited', (data: { messageId: number; newText: string; isEdited: boolean }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId
            ? { ...msg, text: data.newText, isEdited: true }
            : msg
        )
      )
    })

    newSocket.on('chat:status', (status: ChatStatus) => {
      setChatStatus(status)
    })

    newSocket.on('chat:avatarUpdate', (data: { username: string; avatarColor: string }) => {
      // Update all messages from this user with new avatar color
      setMessages((prev) =>
        prev.map((msg) =>
          msg.username === data.username
            ? { ...msg, avatarColor: data.avatarColor }
            : msg
        )
      )
      // Update online users list
      setOnlineUsers((prev) =>
        prev.map((user) =>
          user.username === data.username
            ? { ...user, avatarColor: data.avatarColor }
            : user
        )
      )
    })

    newSocket.on('chat:avatarImageUpdate', (data: { username: string; avatarImage: string | null }) => {
      // Update all messages from this user with new avatar image
      setMessages((prev) =>
        prev.map((msg) =>
          msg.username === data.username
            ? { ...msg, avatarImage: data.avatarImage }
            : msg
        )
      )
      // Update online users list
      setOnlineUsers((prev) =>
        prev.map((user) =>
          user.username === data.username
            ? { ...user, avatarImage: data.avatarImage }
            : user
        )
      )
    })

    newSocket.on('chat:usernameUpdate', (data: { oldUsername: string; newUsername: string }) => {
      // Update all messages from this user with new username
      setMessages((prev) =>
        prev.map((msg) => {
          let updated = msg
          // Update message author
          if (msg.username === data.oldUsername) {
            updated = { ...updated, username: data.newUsername }
          }
          // Update reply references
          if (msg.replyTo && msg.replyTo.username === data.oldUsername) {
            updated = { ...updated, replyTo: { ...msg.replyTo, username: data.newUsername } }
          }
          return updated
        })
      )
      // Update online users list
      setOnlineUsers((prev) =>
        prev.map((user) =>
          user.username === data.oldUsername
            ? { ...user, username: data.newUsername }
            : user
        )
      )
    })

    newSocket.on('chat:cleared', () => {
      setMessages([])
    })

    newSocket.on('chat:announcement', (data: Announcement) => {
      setAnnouncement(data)
    })

    newSocket.on('site:maintenance', (data: MaintenanceStatus) => {
      setMaintenance(data)
    })

    newSocket.on('site:registrations', (data: { paused: boolean }) => {
      setRegistrationsPaused(data.paused)
    })

    newSocket.on('chat:highscore', (data: HighScoreAnnouncement) => {
      setHighScoreAnnouncement(data)
      // Auto-clear after 30 seconds
      setTimeout(() => setHighScoreAnnouncement(null), 30000)
    })

    newSocket.on('chat:rateLimit', (data: { rateLimitMs: number }) => {
      setMessageRateLimitMs(data.rateLimitMs)
    })

    newSocket.on('chat:guestChatStatus', (data: { enabled: boolean }) => {
      setGuestChatEnabled(data.enabled)
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [user?.id, user?.username, token])

  const sendMessage = (text: string, replyToId?: string) => {
    const canSend = socket && text.trim() && (!user?.isGuest || guestChatEnabled)
    if (canSend) {
      socket.emit('chat:send', { text: text.trim(), replyToId })
      // Set cooldown for next message
      if (messageRateLimitMs > 0) {
        setCanSendAt(Date.now() + messageRateLimitMs)
      }
    }
  }

  const deleteMessage = (messageId: number) => {
    if (socket) {
      socket.emit('chat:delete', { messageId })
    }
  }

  const editMessage = (messageId: number, newText: string) => {
    if (socket && newText.trim()) {
      socket.emit('chat:edit', { messageId, newText: newText.trim() })
    }
  }

  const clearAnnouncement = () => {
    setAnnouncement(null)
  }

  const clearHighScoreAnnouncement = () => {
    setHighScoreAnnouncement(null)
  }

  const updatePage = useCallback((page: string) => {
    if (socket) {
      socket.emit('page:update', { page })
    }
  }, [socket])

  return (
    <SocketContext.Provider
      value={{ socket, isConnected, messages, onlineUsers, chatStatus, guestChatEnabled, maintenance, registrationsPaused, announcement, highScoreAnnouncement, messageRateLimitMs, canSendAt, tickerMessages, sendMessage, deleteMessage, editMessage, clearAnnouncement, clearHighScoreAnnouncement, addTickerMessage, removeTickerMessage, updatePage }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const context = useContext(SocketContext)
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider')
  }
  return context
}
