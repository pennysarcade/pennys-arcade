// === ORBIT MULTIPLAYER MODULE ===
// Handles direct socket.io connection for multiplayer mode

const OrbitMultiplayer = (function() {
  // State
  let socket = null;
  let playerId = null;
  let isSpectator = false;
  let connected = false;
  let inputSeq = 0;
  let lastServerState = null;
  let interpolationBuffer = [];
  const INTERPOLATION_DELAY = 50; // ms of interpolation buffer (reduced for tighter visuals)

  // Callbacks
  let onStateUpdate = null;
  let onJoined = null;
  let onRoundStart = null;
  let onRoundEnd = null;
  let onBallHit = null;
  let onSpecialBallSpawn = null;
  let onWaveStart = null;
  let onPowerupCollected = null;
  let onPromoted = null;
  let onInactiveWarning = null;
  let onDisconnected = null;

  // Get auth token from parent window or URL
  function getAuthToken() {
    // Check URL first
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) return urlToken;

    // Try to get from parent via postMessage
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 1000);

      function handleMessage(event) {
        if (event.data?.type === 'AUTH_TOKEN') {
          clearTimeout(timeout);
          window.removeEventListener('message', handleMessage);
          resolve(event.data.token);
        }
      }

      window.addEventListener('message', handleMessage);

      if (window.parent !== window) {
        window.parent.postMessage({ type: 'REQUEST_AUTH_TOKEN' }, '*');
      } else {
        clearTimeout(timeout);
        resolve(null);
      }
    });
  }

  // Get server URL
  function getServerUrl() {
    // In development, connect to localhost:3001
    // In production, connect to same origin
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3001';
    }
    return window.location.origin;
  }

  // Initialize socket connection
  async function connect(callbacks) {
    console.log('[ORBIT DEBUG] connect() called');

    // Store callbacks
    onStateUpdate = callbacks.onStateUpdate;
    onJoined = callbacks.onJoined;
    onRoundStart = callbacks.onRoundStart;
    onRoundEnd = callbacks.onRoundEnd;
    onBallHit = callbacks.onBallHit;
    onSpecialBallSpawn = callbacks.onSpecialBallSpawn;
    onWaveStart = callbacks.onWaveStart;
    onPowerupCollected = callbacks.onPowerupCollected;
    onPromoted = callbacks.onPromoted;
    onInactiveWarning = callbacks.onInactiveWarning;
    onDisconnected = callbacks.onDisconnected;

    // Get auth token
    console.log('[ORBIT DEBUG] Getting auth token...');
    const token = await getAuthToken();
    console.log('[ORBIT DEBUG] Auth token:', token ? 'received' : 'null (guest mode)');

    // Connect to socket
    const serverUrl = getServerUrl();
    console.log('[ORBIT DEBUG] Server URL:', serverUrl);
    console.log('[ORBIT DEBUG] Window location:', window.location.href);

    // Load socket.io client if not already loaded
    if (typeof io === 'undefined') {
      console.log('[ORBIT DEBUG] Loading socket.io library...');
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          const scriptUrl = serverUrl + '/socket.io/socket.io.js';
          console.log('[ORBIT DEBUG] Socket.io script URL:', scriptUrl);
          script.src = scriptUrl;
          script.onload = () => {
            console.log('[ORBIT DEBUG] Socket.io library loaded successfully');
            resolve();
          };
          script.onerror = (e) => {
            console.error('[ORBIT DEBUG] Socket.io script load error:', e);
            reject(new Error('Failed to load socket.io library'));
          };
          // Add timeout for script loading
          setTimeout(() => {
            console.error('[ORBIT DEBUG] Socket.io script load timeout after 15s');
            reject(new Error('Socket.io library load timeout'));
          }, 15000);
          document.head.appendChild(script);
        });
      } catch (error) {
        console.error('[ORBIT DEBUG] Failed to load socket.io:', error);
        if (onDisconnected) onDisconnected(error.message || 'Failed to load socket library');
        return;
      }
    } else {
      console.log('[ORBIT DEBUG] Socket.io already loaded');
    }

    console.log('[ORBIT DEBUG] Creating socket connection...');
    socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 10000
    });
    console.log('[ORBIT DEBUG] Socket created, waiting for connect event...');

    // Join timeout - if we don't receive orbit:joined within 10 seconds after connect, error
    let joinTimeout = null;
    let hasJoined = false;

    // Connection events
    socket.on('connect', () => {
      console.log('[ORBIT DEBUG] Socket connected! Socket ID:', socket.id);
      connected = true;

      // Join the orbit game
      console.log('[ORBIT DEBUG] Emitting orbit:join event...');
      socket.emit('orbit:join', { token });

      // Set timeout for join response
      joinTimeout = setTimeout(() => {
        if (!hasJoined) {
          console.error('[ORBIT DEBUG] Join timeout - no orbit:joined response after 10s');
          if (onDisconnected) onDisconnected('Server did not respond to join request');
        }
      }, 10000);
    });

    socket.on('disconnect', (reason) => {
      console.log('[ORBIT DEBUG] Socket disconnected:', reason);
      connected = false;
      playerId = null;
      if (onDisconnected) onDisconnected(reason);
    });

    socket.on('connect_error', (error) => {
      console.error('[ORBIT DEBUG] Connection error:', error.message || error);
      // Notify main script of connection failure
      if (onDisconnected) onDisconnected('Connection failed: ' + (error.message || 'Server unreachable'));
    });

    // Game events
    socket.on('orbit:joined', (data) => {
      console.log('[ORBIT DEBUG] Received orbit:joined event:', JSON.stringify(data));
      hasJoined = true;
      if (joinTimeout) clearTimeout(joinTimeout);
      playerId = data.playerId;
      isSpectator = data.isSpectator;
      if (onJoined) onJoined(data);
    });

    socket.on('orbit:state', (state) => {
      // Log first state update for debugging
      if (!lastServerState) {
        console.log('[ORBIT DEBUG] Received first orbit:state update, players:', Object.keys(state.players).length, 'balls:', state.balls.length);
      }
      lastServerState = state;
      // Add to interpolation buffer with timestamp
      interpolationBuffer.push({
        timestamp: Date.now(),
        state: state
      });
      // Keep buffer at reasonable size
      while (interpolationBuffer.length > 10) {
        interpolationBuffer.shift();
      }
      if (onStateUpdate) onStateUpdate(state);
    });

    socket.on('orbit:round_start', (data) => {
      console.log('[ORBIT MP] Round started:', data);
      if (onRoundStart) onRoundStart(data);
    });

    socket.on('orbit:round_end', (data) => {
      console.log('[ORBIT MP] Round ended:', data);
      if (onRoundEnd) onRoundEnd(data);
    });

    socket.on('orbit:ball_hit', (data) => {
      if (onBallHit) onBallHit(data);
    });

    socket.on('orbit:special_ball_spawn', () => {
      if (onSpecialBallSpawn) onSpecialBallSpawn();
    });

    socket.on('orbit:special_ball_hit', (data) => {
      if (onBallHit) onBallHit({ ...data, isSpecial: true });
    });

    socket.on('orbit:special_ball_returning', () => {
      console.log('[ORBIT MP] Special ball returning');
    });

    socket.on('orbit:special_ball_captured', () => {
      console.log('[ORBIT MP] Special ball captured');
    });

    socket.on('orbit:special_ball_escaped', () => {
      console.log('[ORBIT MP] Special ball escaped - round ending');
    });

    socket.on('orbit:wave_start', (data) => {
      console.log('[ORBIT MP] Wave started:', data);
      if (onWaveStart) onWaveStart(data);
    });

    socket.on('orbit:powerup_collected', (data) => {
      if (onPowerupCollected) onPowerupCollected(data);
    });

    socket.on('orbit:promoted', (data) => {
      console.log('[ORBIT MP] Promoted to player:', data);
      isSpectator = false;
      if (onPromoted) onPromoted(data);
    });

    socket.on('orbit:inactive_warning', () => {
      console.log('[ORBIT MP] Inactive warning received');
      if (onInactiveWarning) onInactiveWarning();
    });

    socket.on('orbit:ring_switch_blocked', () => {
      console.log('[ORBIT MP] Ring switch blocked');
      // Could trigger visual/audio feedback
    });
  }

  // Send paddle input to server
  function sendInput(angle, velocity, ringSwitch) {
    if (!socket || !connected || isSpectator) return;

    inputSeq++;
    socket.emit('orbit:input', {
      angle: angle,
      velocity: velocity,
      ringSwitch: ringSwitch || false,
      seq: inputSeq
    });
  }

  // Leave the game
  function leave() {
    if (socket) {
      socket.emit('orbit:leave');
      socket.disconnect();
      socket = null;
    }
    connected = false;
    playerId = null;
  }

  // Get interpolated state for smooth rendering
  function getInterpolatedState() {
    if (interpolationBuffer.length < 2) {
      return lastServerState;
    }

    const renderTime = Date.now() - INTERPOLATION_DELAY;

    // Find the two states to interpolate between
    let from = null;
    let to = null;

    for (let i = 0; i < interpolationBuffer.length - 1; i++) {
      if (interpolationBuffer[i].timestamp <= renderTime &&
          interpolationBuffer[i + 1].timestamp >= renderTime) {
        from = interpolationBuffer[i];
        to = interpolationBuffer[i + 1];
        break;
      }
    }

    if (!from || !to) {
      return lastServerState;
    }

    // Calculate interpolation factor
    const range = to.timestamp - from.timestamp;
    const t = range > 0 ? (renderTime - from.timestamp) / range : 0;

    // Interpolate player positions
    const interpolatedPlayers = {};
    for (const id in to.state.players) {
      const fromPlayer = from.state.players[id];
      const toPlayer = to.state.players[id];

      if (fromPlayer && toPlayer) {
        // Don't interpolate our own player - use latest state for responsiveness
        if (id === playerId) {
          interpolatedPlayers[id] = toPlayer;
        } else {
          interpolatedPlayers[id] = {
            ...toPlayer,
            angle: lerpAngle(fromPlayer.angle, toPlayer.angle, t),
            ringSwitchProgress: lerp(fromPlayer.ringSwitchProgress, toPlayer.ringSwitchProgress, t)
          };
        }
      } else {
        interpolatedPlayers[id] = toPlayer;
      }
    }

    // Interpolate ball positions
    const interpolatedBalls = to.state.balls.map(toBall => {
      const fromBall = from.state.balls.find(b => b.id === toBall.id);
      if (fromBall) {
        return {
          ...toBall,
          x: lerp(fromBall.x, toBall.x, t),
          y: lerp(fromBall.y, toBall.y, t)
        };
      }
      return toBall;
    });

    return {
      ...to.state,
      players: interpolatedPlayers,
      balls: interpolatedBalls
    };
  }

  // Linear interpolation
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Angle interpolation (handles wrap-around)
  function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return a + diff * t;
  }

  // Request to join the game (for spectators)
  function requestJoin() {
    if (!socket || !connected) return;
    console.log('[ORBIT MP] Requesting to join game');
    socket.emit('orbit:request_join');
  }

  // Public API
  return {
    connect,
    sendInput,
    leave,
    requestJoin,
    getInterpolatedState,
    getLastState: () => lastServerState,
    getPlayerId: () => playerId,
    isConnected: () => connected,
    isSpectatorMode: () => isSpectator
  };
})();

// Export for use in script.js
if (typeof window !== 'undefined') {
  window.OrbitMultiplayer = OrbitMultiplayer;
}
