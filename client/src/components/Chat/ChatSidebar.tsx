import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'
import OnlineUsersList from './OnlineUsersList'
import TabBar from '../UI/TabBar'
import TypewriterTicker from './TypewriterTicker'

interface ChatSidebarProps {
  onRegisterClick: () => void
  width: number
  activeTab: string
  onTabChange: (tab: string) => void
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear().toString().slice(-2)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

export default function ChatSidebar({ onRegisterClick, width, activeTab, onTabChange }: ChatSidebarProps) {
  const { user } = useAuth()
  const { messages, sendMessage, deleteMessage, editMessage, chatStatus, guestChatEnabled, registrationsPaused, announcement, highScoreAnnouncement, clearAnnouncement, clearHighScoreAnnouncement, messageRateLimitMs, canSendAt, onlineUsers, isConnected, tickerMessages, removeTickerMessage, addTickerMessage } = useSocket()

  const chatTabs = [
    { id: 'chat', label: 'Chat' },
    { id: 'users', label: isConnected ? `${onlineUsers.length} Online` : '...' },
  ]
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isInitialRender = useRef(true)
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string; text: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)

  // Update cooldown timer
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
    messagesEndRef.current?.scrollIntoView({ behavior: isInitialRender.current ? 'instant' : 'smooth' })
    isInitialRender.current = false
  }, [messages])

  useEffect(() => {
    if (editingMessageId !== null && editInputRef.current) {
      editInputRef.current.focus()
    }
  }, [editingMessageId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedInput = inputValue.trim()

    // Handle /test-ticker command
    if (trimmedInput === '/test-ticker') {
      addTickerMessage('This is a test ticker message', 'info')
      setInputValue('')
      return
    }

    if (trimmedInput && (!user?.isGuest || guestChatEnabled)) {
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

  const handleDeleteMessage = (messageId: number) => {
    deleteMessage(messageId)
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

  const handleEditKeyDown = (e: React.KeyboardEvent, messageId: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveEdit(messageId)
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  // Check if a message belongs to the current user
  const isOwnMessage = (msgUserId: number | null) => {
    return user && !user.isGuest && user.id === msgUserId
  }

  return (
    <div className="chat-sidebar" style={{ width: `${width}px` }}>
      <div className="chat-sidebar-tabs">
        <TabBar
          tabs={chatTabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
          variant="sidebar"
        />
      </div>
      {activeTab === 'chat' ? (
        <>
          {announcement && (
            <div className="announcement-banner">
              <span className="announcement-icon">📢</span>
              <span className="announcement-text">{announcement.message}</span>
              <button className="announcement-close" onClick={clearAnnouncement}>×</button>
            </div>
          )}
          {highScoreAnnouncement && (
            <div className="highscore-banner">
              <span className="highscore-icon">🏆</span>
              <span className="highscore-text">
                <strong>{highScoreAnnouncement.username}</strong> just set a new high score in <strong>{highScoreAnnouncement.gameName}</strong>: {highScoreAnnouncement.score.toLocaleString()} points!
              </span>
              <button className="highscore-close" onClick={clearHighScoreAnnouncement}>×</button>
            </div>
          )}
          <div className="chat-messages">
            {messages.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '2rem' }}>
                No messages yet. Be the first to say hello!
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`chat-message ${msg.isDeleted ? 'deleted' : ''}`}>
                  {msg.avatarImage && !msg.isDeleted ? (
                    <img
                      src={`/avatars/${msg.avatarImage}`}
                      alt=""
                      className="chat-avatar chat-avatar-image"
                      style={{ borderColor: msg.avatarColor }}
                    />
                  ) : (
                    <div
                      className="chat-avatar"
                      style={{
                        backgroundColor: msg.isDeleted ? 'var(--text-muted)' : msg.avatarColor,
                        borderColor: msg.isDeleted ? 'var(--text-muted)' : msg.avatarColor
                      }}
                    />
                  )}
                  <div className="chat-message-content">
                    {msg.replyTo && (
                      <div className="chat-reply-indicator">
                        <span className="chat-reply-icon">↩</span>
                        <span className="chat-reply-username">@{msg.replyTo.username}</span>
                        <span className="chat-reply-text">{msg.replyTo.text.length > 50 ? msg.replyTo.text.slice(0, 50) + '...' : msg.replyTo.text}</span>
                      </div>
                    )}
                    <div className={`chat-username ${msg.isGuest ? 'guest' : ''}`}>
                      {msg.username}
                      {msg.isAdmin && <span className="chat-admin-badge">👑</span>}
                      <span className="chat-timestamp">
                        {formatTimestamp(msg.timestamp || 1736164860000)}
                        {msg.isEdited && !msg.isDeleted && (
                          <span className="chat-edited-indicator">EDITED</span>
                        )}
                      </span>
                      {/* Show actions for non-deleted messages */}
                      {!msg.isDeleted && (
                        <span className="chat-message-actions">
                          {!user?.isGuest && (
                            <button
                              className="chat-reply-btn"
                              onClick={() => handleStartReply(msg.id, msg.username, msg.text)}
                              title="Reply"
                            >
                              ↩
                            </button>
                          )}
                          {isOwnMessage(msg.userId) && (
                            <button
                              className="chat-edit-btn"
                              onClick={() => handleStartEdit(msg.id, msg.text)}
                              title="Edit message"
                            >
                              ✎
                            </button>
                          )}
                          {(isOwnMessage(msg.userId) || user?.isAdmin) && (
                            <button
                              className="chat-delete-btn"
                              onClick={() => handleDeleteMessage(msg.id)}
                              title="Delete message"
                            >
                              ×
                            </button>
                          )}
                        </span>
                      )}
                      {/* Admin can hard-delete already-deleted messages */}
                      {msg.isDeleted && user?.isAdmin && (
                        <span className="chat-message-actions chat-message-actions-visible">
                          <button
                            className="chat-delete-btn chat-hard-delete-btn"
                            onClick={() => handleDeleteMessage(msg.id)}
                            title="Permanently remove message"
                          >
                            ×
                          </button>
                        </span>
                      )}
                    </div>
                    {editingMessageId === msg.id ? (
                      <div className="chat-edit-container">
                        <input
                          ref={editInputRef}
                          type="text"
                          className="chat-edit-input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => handleEditKeyDown(e, msg.id)}
                          maxLength={256}
                        />
                        <div className="chat-edit-actions">
                          <button className="chat-edit-save" onClick={() => handleSaveEdit(msg.id)}>Save</button>
                          <button className="chat-edit-cancel" onClick={handleCancelEdit}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className={`chat-text ${msg.isDeleted ? 'deleted' : ''}`}>{msg.text}</div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Game status ticker strip - always visible */}
          <div className="chat-ticker-strip">
            <TypewriterTicker
              messages={tickerMessages}
              onMessageComplete={removeTickerMessage}
            />
          </div>

          <div className="chat-input-container">
            {!chatStatus.enabled ? (
              <div className="chat-disabled-notice">
                <span className="chat-disabled-icon">⚠</span>
                Chat is currently offline
                {chatStatus.offlineMessage && (
                  <div className="chat-disabled-message">{chatStatus.offlineMessage}</div>
                )}
              </div>
            ) : user?.isGuest && !guestChatEnabled ? (
              <div className="chat-guest-prompt">
                {registrationsPaused ? (
                  <span>Registration is currently closed</span>
                ) : (
                  <><a onClick={onRegisterClick}>Register</a> to join the conversation</>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="chat-form">
                {replyingTo && (
                  <div className="chat-reply-preview">
                    <span className="chat-reply-preview-icon">↩</span>
                    <span className="chat-reply-preview-text">
                      Replying to <strong>@{replyingTo.username}</strong>: {replyingTo.text.length > 40 ? replyingTo.text.slice(0, 40) + '...' : replyingTo.text}
                    </span>
                    <button type="button" className="chat-reply-preview-cancel" onClick={handleCancelReply}>×</button>
                  </div>
                )}
                <div className="chat-input-wrapper">
                  <input
                    ref={inputRef}
                    type="text"
                    className="chat-input"
                    placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : "Type a message..."}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    maxLength={256}
                  />
                  <button
                    type="submit"
                    className="chat-send-btn"
                    disabled={!inputValue.trim() || cooldownRemaining > 0}
                    title={cooldownRemaining > 0 ? `Wait ${(cooldownRemaining / 1000).toFixed(1)}s` : "Send message"}
                  >
                    {cooldownRemaining > 0 ? (cooldownRemaining / 1000).toFixed(1) : 'SEND'}
                  </button>
                </div>
                {messageRateLimitMs > 0 && (
                  <div className="chat-rate-limit-info">
                    {messageRateLimitMs / 1000}s between messages
                  </div>
                )}
                {inputValue.length >= 256 && (
                  <div className="chat-limit-warning">
                    Maximum 256 characters reached
                  </div>
                )}
              </form>
            )}
          </div>
        </>
      ) : (
        <OnlineUsersList />
      )}
    </div>
  )
}
