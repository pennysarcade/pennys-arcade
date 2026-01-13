import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'
import AuthModal from '../../components/Auth/AuthModal'

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

export default function MobileChat() {
  const { user } = useAuth()
  const {
    messages,
    sendMessage,
    deleteMessage,
    editMessage,
    chatStatus,
    registrationsPaused,
    announcement,
    highScoreAnnouncement,
    clearAnnouncement,
    clearHighScoreAnnouncement,
    canSendAt,
    onlineUsers,
    isConnected,
  } = useSocket()

  const [inputValue, setInputValue] = useState('')
  const [showUsers, setShowUsers] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register')
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string; text: string } | null>(null)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (canSendAt <= Date.now()) {
      setCooldownRemaining(0)
      return
    }
    const updateCooldown = () => {
      const remaining = Math.max(0, canSendAt - Date.now())
      setCooldownRemaining(remaining)
    }
    updateCooldown()
    const interval = setInterval(updateCooldown, 100)
    return () => clearInterval(interval)
  }, [canSendAt])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (editingMessageId !== null && editInputRef.current) {
      editInputRef.current.focus()
    }
  }, [editingMessageId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedInput = inputValue.trim()
    if (trimmedInput && !user?.isGuest) {
      sendMessage(inputValue, replyingTo?.id)
      setInputValue('')
      setReplyingTo(null)
    }
  }

  const handleStartReply = (msgId: number, username: string, text: string) => {
    setReplyingTo({ id: String(msgId), username, text })
    inputRef.current?.focus()
  }

  const handleCancelReply = () => {
    setReplyingTo(null)
  }

  const handleStartEdit = (messageId: number, currentText: string) => {
    setEditingMessageId(messageId)
    setEditValue(currentText)
  }

  const handleCancelEdit = () => {
    setEditingMessageId(null)
    setEditValue('')
  }

  const handleSaveEdit = (messageId: number) => {
    if (editValue.trim()) {
      editMessage(messageId, editValue)
    }
    setEditingMessageId(null)
    setEditValue('')
  }

  const isOwnMessage = (msgUserId: number | null) => {
    return user && !user.isGuest && user.id === msgUserId
  }

  return (
    <div className="mobile-chat">
      <div className="mobile-chat-header">
        <h1 className="mobile-chat-title">Chat</h1>
        <button
          className="mobile-chat-users-btn"
          onClick={() => setShowUsers(true)}
        >
          {isConnected ? `${onlineUsers.length}` : '...'} 👥
        </button>
      </div>

      {announcement && (
        <div className="mobile-chat-announcement">
          <span>📢 {announcement.message}</span>
          <button onClick={clearAnnouncement}>×</button>
        </div>
      )}

      {highScoreAnnouncement && (
        <div className="mobile-chat-highscore">
          <span>🏆 <strong>{highScoreAnnouncement.username}</strong> scored {highScoreAnnouncement.score.toLocaleString()} in {highScoreAnnouncement.gameName}!</span>
          <button onClick={clearHighScoreAnnouncement}>×</button>
        </div>
      )}

      <div className="mobile-chat-messages">
        {messages.length === 0 ? (
          <div className="mobile-chat-empty">
            No messages yet. Be the first to say hello!
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`mobile-chat-message ${msg.isDeleted ? 'deleted' : ''}`}>
              {msg.avatarImage && !msg.isDeleted ? (
                <img
                  src={`/avatars/${msg.avatarImage}`}
                  alt=""
                  className="mobile-chat-avatar mobile-chat-avatar-image"
                  style={{ borderColor: msg.avatarColor }}
                />
              ) : (
                <div
                  className="mobile-chat-avatar"
                  style={{
                    backgroundColor: msg.isDeleted ? 'var(--text-muted)' : msg.avatarColor,
                    borderColor: msg.isDeleted ? 'var(--text-muted)' : msg.avatarColor
                  }}
                />
              )}
              <div className="mobile-chat-message-content">
                {msg.replyTo && (
                  <div className="mobile-chat-reply-indicator">
                    <span>↩ @{msg.replyTo.username}</span>
                  </div>
                )}
                <div className="mobile-chat-message-header">
                  <span className={`mobile-chat-username ${msg.isGuest ? 'guest' : ''}`}>
                    {msg.username}
                    {msg.isAdmin && ' 👑'}
                  </span>
                  <span className="mobile-chat-timestamp">
                    {formatTimestamp(msg.timestamp || Date.now())}
                    {msg.isEdited && !msg.isDeleted && ' (edited)'}
                  </span>
                </div>
                {editingMessageId === msg.id ? (
                  <div className="mobile-chat-edit">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      maxLength={256}
                    />
                    <div className="mobile-chat-edit-actions">
                      <button onClick={() => handleSaveEdit(msg.id)}>Save</button>
                      <button onClick={handleCancelEdit}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className={`mobile-chat-text ${msg.isDeleted ? 'deleted' : ''}`}>
                    {msg.text}
                  </div>
                )}
                {!msg.isDeleted && (
                  <div className="mobile-chat-actions">
                    {!user?.isGuest && (
                      <button onClick={() => handleStartReply(msg.id, msg.username, msg.text)}>↩</button>
                    )}
                    {isOwnMessage(msg.userId) && (
                      <>
                        <button onClick={() => handleStartEdit(msg.id, msg.text)}>✎</button>
                        <button onClick={() => deleteMessage(msg.id)}>×</button>
                      </>
                    )}
                    {user?.isAdmin && !isOwnMessage(msg.userId) && (
                      <button onClick={() => deleteMessage(msg.id)}>×</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="mobile-chat-input-area">
        {!chatStatus.enabled ? (
          <div className="mobile-chat-disabled">
            Chat is currently offline
            {chatStatus.offlineMessage && <span>: {chatStatus.offlineMessage}</span>}
          </div>
        ) : user?.isGuest ? (
          <div className="mobile-chat-guest">
            {registrationsPaused ? (
              <span>Registration is currently closed</span>
            ) : (
              <button onClick={() => { setAuthMode('register'); setShowAuthModal(true); }}>
                Register to chat
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mobile-chat-form">
            {replyingTo && (
              <div className="mobile-chat-reply-preview">
                <span>↩ @{replyingTo.username}</span>
                <button type="button" onClick={handleCancelReply}>×</button>
              </div>
            )}
            <div className="mobile-chat-input-row">
              <input
                ref={inputRef}
                type="text"
                placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : 'Type a message...'}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                maxLength={256}
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || cooldownRemaining > 0}
              >
                {cooldownRemaining > 0 ? (cooldownRemaining / 1000).toFixed(1) : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Online users overlay */}
      {showUsers && (
        <>
          <div className="mobile-overlay" onClick={() => setShowUsers(false)} />
          <div className="mobile-chat-users-panel">
            <div className="mobile-chat-users-header">
              <h2>Online ({onlineUsers.length})</h2>
              <button onClick={() => setShowUsers(false)}>×</button>
            </div>
            <div className="mobile-chat-users-list">
              {onlineUsers.map((u) => (
                <div key={u.username} className="mobile-chat-user">
                  {u.avatarImage ? (
                    <img
                      src={`/avatars/${u.avatarImage}`}
                      alt=""
                      className="mobile-chat-user-avatar"
                      style={{ borderColor: u.avatarColor }}
                    />
                  ) : (
                    <div
                      className="mobile-chat-user-avatar"
                      style={{ backgroundColor: u.avatarColor, borderColor: u.avatarColor }}
                    />
                  )}
                  <span className={u.isGuest ? 'guest' : ''}>{u.username}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {showAuthModal && (
        <AuthModal
          mode={authMode}
          onClose={() => setShowAuthModal(false)}
          onSwitchMode={(mode) => setAuthMode(mode)}
        />
      )}
    </div>
  )
}
