// === ORBIT ROLLBACK NETCODE - CLIENT SIDE ===
// Client-side prediction, rollback, and state management

const OrbitNetcode = (function() {
  'use strict';

  // === SEEDED RNG (Mulberry32) ===
  class SeededRNG {
    constructor(seed) {
      this.state = seed >>> 0;
      if (this.state === 0) this.state = 1;
    }

    getState() { return this.state; }

    setState(state) {
      this.state = state >>> 0;
      if (this.state === 0) this.state = 1;
    }

    clone() {
      const rng = new SeededRNG(1);
      rng.state = this.state;
      return rng;
    }

    next() {
      let z = (this.state += 0x6d2b79f5);
      z = Math.imul(z ^ (z >>> 15), z | 1);
      z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
      return ((z ^ (z >>> 14)) >>> 0);
    }

    random() { return this.next() / 4294967296; }
    randomFloat() { return Math.fround(this.next() / 4294967296); }
    randomInt(min, max) { return min + (this.next() % (max - min + 1)); }
    randomRange(min, max) { return min + this.random() * (max - min); }
    randomRangeFloat(min, max) { return Math.fround(min + this.randomFloat() * (max - min)); }
    randomAngle() { return Math.fround(this.randomFloat() * Math.PI * 2); }
    randomBool(prob = 0.5) { return this.random() < prob; }
    pick(arr) { return arr[this.randomInt(0, arr.length - 1)]; }
  }

  // === STATE HISTORY (Circular Buffer) ===
  class StateHistory {
    constructor(capacity = 8) {
      this.capacity = capacity;
      this.buffer = new Array(capacity).fill(null);
      this.oldestFrame = 0;
      this.newestFrame = -1;
    }

    push(snapshot) {
      const index = snapshot.frame % this.capacity;
      this.buffer[index] = snapshot;

      if (this.newestFrame < 0) {
        this.oldestFrame = snapshot.frame;
        this.newestFrame = snapshot.frame;
      } else {
        this.newestFrame = snapshot.frame;
        if (snapshot.frame - this.oldestFrame >= this.capacity) {
          this.oldestFrame = snapshot.frame - this.capacity + 1;
        }
      }
    }

    get(frame) {
      if (frame < this.oldestFrame || frame > this.newestFrame) return null;
      const index = frame % this.capacity;
      const snapshot = this.buffer[index];
      if (snapshot && snapshot.frame === frame) return snapshot;
      return null;
    }

    getLatest() {
      if (this.newestFrame < 0) return null;
      return this.get(this.newestFrame);
    }

    clear() {
      this.buffer.fill(null);
      this.oldestFrame = 0;
      this.newestFrame = -1;
    }
  }

  // === INPUT HISTORY ===
  class InputHistory {
    constructor(capacity = 16) {
      this.capacity = capacity;
      this.inputs = new Map();
      this.oldestFrame = 0;
      this.newestFrame = -1;
    }

    addInput(frame, input) {
      let frameInputs = this.inputs.get(frame);
      if (!frameInputs) {
        frameInputs = { frame, inputs: new Map() };
        this.inputs.set(frame, frameInputs);
      }
      frameInputs.inputs.set(input.playerId, input);

      if (this.newestFrame < 0) {
        this.oldestFrame = frame;
        this.newestFrame = frame;
      } else {
        if (frame > this.newestFrame) this.newestFrame = frame;
        if (frame < this.oldestFrame) this.oldestFrame = frame;
      }
      this.prune();
    }

    getPlayerInput(frame, playerId) {
      const frameInputs = this.inputs.get(frame);
      if (!frameInputs) return null;
      return frameInputs.inputs.get(playerId) || null;
    }

    prune() {
      const cutoff = this.newestFrame - this.capacity;
      for (const [frame] of this.inputs) {
        if (frame < cutoff) this.inputs.delete(frame);
      }
    }

    clear() {
      this.inputs.clear();
      this.oldestFrame = 0;
      this.newestFrame = -1;
    }
  }

  // === INPUT DELAY MANAGER ===
  class InputDelayManager {
    constructor(minDelay = 2, maxDelay = 6, historySize = 10) {
      this.rttHistory = [];
      this.maxHistory = historySize;
      this.minDelay = minDelay;
      this.maxDelay = maxDelay;
    }

    addRttSample(rtt) {
      this.rttHistory.push(rtt);
      if (this.rttHistory.length > this.maxHistory) {
        this.rttHistory.shift();
      }
    }

    getRecommendedDelay() {
      if (this.rttHistory.length === 0) return this.minDelay;

      const sorted = [...this.rttHistory].sort((a, b) => a - b);
      const p75Index = Math.floor(sorted.length * 0.75);
      const p75Rtt = sorted[p75Index];

      const oneWayLatency = p75Rtt / 2;
      const delayFrames = Math.ceil((oneWayLatency + 10) / (1000 / 60));

      return Math.max(this.minDelay, Math.min(this.maxDelay, delayFrames));
    }

    getAverageRtt() {
      if (this.rttHistory.length === 0) return 0;
      return this.rttHistory.reduce((a, b) => a + b, 0) / this.rttHistory.length;
    }

    getJitter() {
      if (this.rttHistory.length < 2) return 0;
      const avg = this.getAverageRtt();
      const squareDiffs = this.rttHistory.map(rtt => Math.pow(rtt - avg, 2));
      return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / this.rttHistory.length);
    }

    clear() { this.rttHistory = []; }
  }

  // === VISUAL SMOOTHER ===
  class VisualSmoother {
    constructor() {
      this.corrections = new Map();
    }

    startCorrection(entityId, currentX, currentY, targetX, targetY, durationFrames = 3) {
      this.corrections.set(entityId, {
        startX: currentX,
        startY: currentY,
        targetX,
        targetY,
        progress: 0,
        duration: durationFrames
      });
    }

    update() {
      for (const [entityId, correction] of this.corrections) {
        correction.progress += 1 / correction.duration;
        if (correction.progress >= 1) {
          this.corrections.delete(entityId);
        }
      }
    }

    getSmoothedPosition(entityId, actualX, actualY) {
      const correction = this.corrections.get(entityId);
      if (!correction) return { x: actualX, y: actualY };

      const t = 1 - Math.pow(1 - correction.progress, 3);
      const visualX = correction.startX + (correction.targetX - correction.startX) * t;
      const visualY = correction.startY + (correction.targetY - correction.startY) * t;
      const blendFactor = correction.progress;

      return {
        x: visualX * (1 - blendFactor) + actualX * blendFactor,
        y: visualY * (1 - blendFactor) + actualY * blendFactor
      };
    }

    hasCorrection(entityId) { return this.corrections.has(entityId); }
    clear() { this.corrections.clear(); }
  }

  // === PREDICTION STATE ===
  class PredictionState {
    constructor() {
      this.stateHistory = new StateHistory(8);
      this.inputHistory = new InputHistory(16);
      this.inputDelayManager = new InputDelayManager();
      this.visualSmoother = new VisualSmoother();

      this.localFrame = 0;
      this.serverFrame = 0;
      this.rng = null;
      this.playerId = null;

      this.pendingInputs = []; // Inputs sent but not yet confirmed
      this.lastServerState = null;
      this.lastPredictedState = null;

      this.rollbackCount = 0;
      this.rollbackFrameSum = 0;
      this.statsResetTime = Date.now();
    }

    initialize(playerId, serverState) {
      this.playerId = playerId;
      this.serverFrame = serverState.frame;
      this.localFrame = serverState.frame;
      this.rng = new SeededRNG(serverState.rngState);
      this.lastServerState = serverState;
      this.stateHistory.push(this.serverStateToSnapshot(serverState));
    }

    // Convert server state to our snapshot format
    serverStateToSnapshot(state) {
      return {
        frame: state.frame,
        gameTime: state.gameTime,
        rngState: state.rngState,
        checksum: state.checksum,
        players: new Map(Object.entries(state.players).map(([id, p]) => [id, { ...p }])),
        balls: state.balls.map(b => ({ ...b })),
        powerups: state.powerups.map(p => ({ ...p })),
        specialBall: null, // Handled via balls array (isSpecial flag)
        specialBallTimer: state.specialBallTimer,
        specialBallActiveTime: state.specialBallActiveTime,
        specialBallReturning: state.specialBallReturning,
        waveActive: state.waveActive,
        waveType: state.waveType,
        spawnTimer: state.spawnTimer
      };
    }

    // Add local input (before sending to server)
    addLocalInput(input) {
      input.frame = this.localFrame + 1;
      this.inputHistory.addInput(input.frame, input);
      this.pendingInputs.push({ ...input, sentTime: Date.now() });
      return input;
    }

    // Receive server state update
    receiveServerState(serverState) {
      const now = Date.now();

      // Calculate RTT if we have pending inputs for this frame
      for (let i = this.pendingInputs.length - 1; i >= 0; i--) {
        if (this.pendingInputs[i].frame <= serverState.frame) {
          const rtt = now - this.pendingInputs[i].sentTime;
          this.inputDelayManager.addRttSample(rtt);
          this.pendingInputs.splice(i, 1);
        }
      }

      // Check for mismatch
      const predicted = this.stateHistory.get(serverState.frame);
      if (predicted && predicted.checksum !== serverState.checksum) {
        // Checksum mismatch - need to correct
        console.log(`[NETCODE] Checksum mismatch at frame ${serverState.frame}: predicted=${predicted.checksum}, server=${serverState.checksum}`);
        this.handleMismatch(serverState);
      }

      this.serverFrame = serverState.frame;
      this.lastServerState = serverState;

      // Store server state
      const snapshot = this.serverStateToSnapshot(serverState);
      this.stateHistory.push(snapshot);
    }

    // Handle state mismatch (rollback)
    handleMismatch(serverState) {
      this.rollbackCount++;
      const framesToRollback = this.localFrame - serverState.frame;
      this.rollbackFrameSum += framesToRollback;

      // Visual smoothing for entities that need correction
      const currentState = this.lastPredictedState;
      if (currentState) {
        for (const ball of serverState.balls) {
          const predictedBall = currentState.balls?.find(b => b.id === ball.id);
          if (predictedBall) {
            const dx = Math.abs(ball.x - predictedBall.x);
            const dy = Math.abs(ball.y - predictedBall.y);
            if (dx > 5 || dy > 5) {
              this.visualSmoother.startCorrection(ball.id, predictedBall.x, predictedBall.y, ball.x, ball.y);
            }
          }
        }
      }

      // Reset RNG to server state
      this.rng.setState(serverState.rngState);
    }

    // Get current display state (with visual smoothing)
    getDisplayState() {
      if (!this.lastServerState) return null;

      // Apply visual smoothing to ball positions
      const state = { ...this.lastServerState };
      state.balls = state.balls.map(ball => {
        const smoothed = this.visualSmoother.getSmoothedPosition(ball.id, ball.x, ball.y);
        return { ...ball, x: smoothed.x, y: smoothed.y };
      });

      return state;
    }

    // Get network statistics
    getNetStats() {
      const now = Date.now();
      const elapsed = (now - this.statsResetTime) / 1000;

      const stats = {
        rtt: this.inputDelayManager.getAverageRtt(),
        jitter: this.inputDelayManager.getJitter(),
        inputDelay: this.inputDelayManager.getRecommendedDelay(),
        rollbackCount: this.rollbackCount,
        avgRollbackFrames: this.rollbackCount > 0 ? this.rollbackFrameSum / this.rollbackCount : 0,
        framesBehind: this.localFrame - this.serverFrame,
        pendingInputs: this.pendingInputs.length
      };

      if (elapsed >= 1) {
        this.rollbackCount = 0;
        this.rollbackFrameSum = 0;
        this.statsResetTime = now;
      }

      return stats;
    }

    // Update visual smoother (call each render frame)
    updateVisuals() {
      this.visualSmoother.update();
    }

    // Reset state
    reset() {
      this.stateHistory.clear();
      this.inputHistory.clear();
      this.inputDelayManager.clear();
      this.visualSmoother.clear();
      this.pendingInputs = [];
      this.localFrame = 0;
      this.serverFrame = 0;
      this.rng = null;
      this.lastServerState = null;
      this.lastPredictedState = null;
    }
  }

  // === PHYSICS CONSTANTS (must match server) ===
  const TICK_RATE = 60;
  const DT = 1 / TICK_RATE;

  const PADDLE_SPEED = 4;
  const PADDLE_ACCELERATION = 5;
  const PADDLE_ARC_BASE = 0.20;
  const PADDLE_THICKNESS = 18;
  const RING_SWITCH_DURATION = 0.25;

  const BALL_SPEED = 150;
  const SPECIAL_BALL_GRAVITY_STRENGTH = 120;

  // === HELPER FUNCTIONS ===
  function normalizeAngle(angle) {
    let a = angle;
    while (a < -Math.PI) a = Math.fround(a + Math.PI * 2);
    while (a > Math.PI) a = Math.fround(a - Math.PI * 2);
    return Math.fround(a);
  }

  function angleDifference(a, b) {
    return normalizeAngle(Math.fround(a - b));
  }

  // === PUBLIC API ===
  return {
    SeededRNG,
    StateHistory,
    InputHistory,
    InputDelayManager,
    VisualSmoother,
    PredictionState,

    // Constants
    TICK_RATE,
    DT,
    PADDLE_SPEED,
    PADDLE_ACCELERATION,
    PADDLE_ARC_BASE,
    PADDLE_THICKNESS,
    RING_SWITCH_DURATION,
    BALL_SPEED,
    SPECIAL_BALL_GRAVITY_STRENGTH,

    // Helpers
    normalizeAngle,
    angleDifference
  };
})();

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.OrbitNetcode = OrbitNetcode;
}
