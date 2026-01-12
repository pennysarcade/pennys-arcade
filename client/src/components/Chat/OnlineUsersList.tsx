import { useSocket } from '../../context/SocketContext'

export default function OnlineUsersList() {
  const { onlineUsers, isConnected } = useSocket()

  return (
    <div className="online-users-list">
      <div className="online-users-header">
        <span className="online-status-dot" />
        <span className="online-users-count">
          {isConnected
            ? `${onlineUsers.length} user${onlineUsers.length !== 1 ? 's' : ''} online`
            : 'Connecting...'}
        </span>
      </div>

      {isConnected && onlineUsers.length > 0 ? (
        <div className="online-users-entries">
          {onlineUsers.map((user) => (
            <div key={user.username} className={`online-user-entry ${user.isGuest ? 'guest' : ''}`}>
              {user.avatarImage ? (
                <img
                  src={`/avatars/${user.avatarImage}`}
                  alt=""
                  className="online-user-avatar online-user-avatar-image"
                  style={{ borderColor: user.avatarColor }}
                />
              ) : (
                <span
                  className="online-user-avatar"
                  style={{ backgroundColor: user.avatarColor, borderColor: user.avatarColor }}
                />
              )}
              <span className="online-user-name">{user.username}</span>
              {user.isGuest && <span className="online-user-badge">guest</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="online-users-placeholder">
          <p>{isConnected ? 'No users online' : 'Connecting to server...'}</p>
        </div>
      )}
    </div>
  )
}
