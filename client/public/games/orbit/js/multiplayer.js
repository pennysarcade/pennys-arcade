// === ORBIT MULTIPLAYER MODULE ===
// Handles direct socket.io connection for multiplayer mode
// Updated for rollback netcode support

const OrbitMultiplayer = (function() {
  // State
  let socket = null;
  let playerId = null;
  let isSpectator = false;
  let connected = false;
  let inputSeq = 0;
  let lastServerState = null;
  let interpolationBuffer = [];
  const INTERPOLATION_DELAY = 0; // Disabled - we now extrapolate forward instead of interpolating behind

  // Track balls we've hit locally to avoid double-processing server confirmations
  const localHitBalls = new Map(); // ballId -> timestamp

  // Rollback netcode state
  let predictionState = null;
  let useRollbackNetcode = true; // Enable rollback netcode

  // Reconnection state
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_BASE = 1000; // 1 second base delay
  let reconnectTimeout = null;
  let lastConnectionCallbacks = null;
  let lastToken = null;

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
  let onRingSwitchBlocked = null;

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
    onRingSwitchBlocked = callbacks.onRingSwitchBlocked;

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

      // Attempt auto-reconnect for recoverable disconnections
      if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'transport error') {
        attemptReconnect(callbacks);
      } else {
        playerId = null;
        if (onDisconnected) onDisconnected(reason);
      }
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

      // Reset reconnection state on successful join
      reconnectAttempts = 0;
      cancelReconnect();

      // Initialize or reset rollback netcode prediction state
      if (useRollbackNetcode && typeof OrbitNetcode !== 'undefined') {
        if (predictionState) {
          predictionState.reset(); // Reset on reconnect
        } else {
          predictionState = new OrbitNetcode.PredictionState();
        }
        console.log('[ORBIT DEBUG] Rollback netcode initialized');
      }

      if (onJoined) onJoined(data);
    });

    socket.on('orbit:state', (state) => {
      // Log first state update for debugging
      if (!lastServerState) {
        console.log('[ORBIT DEBUG] Received first orbit:state update, frame:', state.frame, 'players:', Object.keys(state.players).length, 'balls:', state.balls.length);
      }
      lastServerState = state;

      // Update rollback netcode prediction state
      if (predictionState && useRollbackNetcode) {
        if (!predictionState.playerId && playerId) {
          predictionState.initialize(playerId, state);
        } else {
          predictionState.receiveServerState(state);
        }
      }

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
      console.log('[ORBIT MP] Ring switch blocked by server');
      if (onRingSwitchBlocked) onRingSwitchBlocked();
    });
  }

  // Send paddle input to server
  function sendInput(angle, velocity, ringSwitch) {
    if (!socket || !connected || isSpectator) return;

    inputSeq++;

    const input = {
      angle: angle,
      velocity: velocity,
      ringSwitch: ringSwitch || false,
      seq: inputSeq,
      playerId: playerId
    };

    // Add to prediction state for tracking
    if (predictionState && useRollbackNetcode) {
      predictionState.addLocalInput(input);
    }

    socket.emit('orbit:input', input);
  }

  // Send ball hit event to server (client-authoritative collision)
  function sendBallHit(ballId, paddleAngle, deflectAngle, edgeHit, isSpecial) {
    if (!socket || !connected || isSpectator) return;

    // Track that we hit this ball locally
    localHitBalls.set(ballId, Date.now());

    // Clean up old entries
    const now = Date.now();
    for (const [id, time] of localHitBalls) {
      if (now - time > 1000) {
        localHitBalls.delete(id);
      }
    }

    socket.emit('orbit:ball_hit', {
      ballId: ballId,
      paddleAngle: paddleAngle,
      deflectAngle: deflectAngle,
      edgeHit: edgeHit,
      isSpecial: isSpecial || false
    });
  }

  // Check if we already processed this ball hit locally
  function wasLocalHit(ballId) {
    const hitTime = localHitBalls.get(ballId);
    return hitTime && Date.now() - hitTime < 500;
  }

  // Leave the game
  function leave() {
    cancelReconnect(); // Cancel any pending reconnection
    if (socket) {
      socket.emit('orbit:leave');
      socket.disconnect();
      socket = null;
    }
    connected = false;
    playerId = null;
    if (predictionState) {
      predictionState.reset();
    }
  }

  // Get extrapolated state for rendering
  // Instead of showing where things were, predict where they are NOW
  function getInterpolatedState() {
    if (!lastServerState) {
      return null;
    }

    // Use the latest server state and extrapolate forward
    const state = lastServerState;
    const lastStateTime = interpolationBuffer.length > 0
      ? interpolationBuffer[interpolationBuffer.length - 1].timestamp
      : Date.now();

    // How far ahead to extrapolate (time since last server update)
    const extrapolateTime = Math.min((Date.now() - lastStateTime) / 1000, 0.1); // Cap at 100ms

    // Extrapolate ball positions forward using their velocity
    const extrapolatedBalls = state.balls.map(ball => {
      // Don't extrapolate if ball has high hit cooldown (just bounced, velocity may change)
      if (ball.hitCooldown > 0.05) {
        return ball;
      }
      return {
        ...ball,
        x: ball.x + ball.vx * ball.speedMult * extrapolateTime,
        y: ball.y + ball.vy * ball.speedMult * extrapolateTime
      };
    });

    // Extrapolate powerup positions
    const extrapolatedPowerups = state.powerups.map(powerup => {
      return {
        ...powerup,
        x: powerup.x + powerup.vx * extrapolateTime,
        y: powerup.y + powerup.vy * extrapolateTime
      };
    });

    // For other players, use latest position (they report their own position)
    const players = { ...state.players };

    return {
      ...state,
      players: players,
      balls: extrapolatedBalls,
      powerups: extrapolatedPowerups
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

  // Attempt to reconnect after disconnection
  function attemptReconnect(callbacks) {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[ORBIT MP] Max reconnect attempts reached');
      playerId = null;
      if (onDisconnected) onDisconnected('Connection lost (max retries exceeded)');
      return;
    }

    reconnectAttempts++;
    const delay = RECONNECT_DELAY_BASE * Math.pow(1.5, reconnectAttempts - 1);
    console.log(`[ORBIT MP] Attempting reconnect in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    // Store callbacks for reconnection
    lastConnectionCallbacks = callbacks;

    reconnectTimeout = setTimeout(() => {
      if (socket) {
        socket.connect();
      } else if (lastConnectionCallbacks) {
        // Full reconnection needed
        connect(lastConnectionCallbacks);
      }
    }, delay);
  }

  // Cancel any pending reconnection
  function cancelReconnect() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    reconnectAttempts = 0;
  }

  // Get network statistics from rollback netcode
  function getNetStats() {
    if (predictionState && useRollbackNetcode) {
      return predictionState.getNetStats();
    }
    return {
      rtt: 0,
      jitter: 0,
      inputDelay: 2,
      rollbackCount: 0,
      avgRollbackFrames: 0,
      framesBehind: 0,
      pendingInputs: 0
    };
  }

  // Get display state with visual smoothing applied
  function getDisplayState() {
    if (predictionState && useRollbackNetcode) {
      return predictionState.getDisplayState() || lastServerState;
    }
    return lastServerState;
  }

  // Update visual smoothing (call each render frame)
  function updateVisuals() {
    if (predictionState && useRollbackNetcode) {
      predictionState.updateVisuals();
    }
  }

  // Reset prediction state (e.g., on round start)
  function resetPrediction() {
    if (predictionState) {
      predictionState.reset();
    }
  }

  // Public API
  return {
    connect,
    sendInput,
    sendBallHit,
    wasLocalHit,
    leave,
    requestJoin,
    getInterpolatedState,
    getLastState: () => lastServerState,
    getDisplayState,
    getNetStats,
    updateVisuals,
    resetPrediction,
    getPlayerId: () => playerId,
    isConnected: () => connected,
    isSpectatorMode: () => isSpectator,
    isRollbackEnabled: () => useRollbackNetcode && predictionState !== null
  };
})();

// Export for use in script.js
if (typeof window !== 'undefined') {
  window.OrbitMultiplayer = OrbitMultiplayer;
}
