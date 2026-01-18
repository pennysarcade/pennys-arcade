// === ROLLBACK MANAGER ===
// Handles state restoration and resimulation for rollback netcode

import { SeededRNG } from './rng.js';
import { GameSnapshot, FrameInput, RollbackInfo, NetStats } from './types.js';
import { StateHistory, InputHistory, InputPredictor } from './history.js';
import { calculateChecksum, cloneSnapshot, TICK_RATE, DT } from './simulation.js';

export interface RollbackConfig {
  maxRollbackFrames: number;      // Maximum frames to roll back (default: 8)
  inputDelayFrames: number;       // Local input delay in frames (default: 2)
  stateHistorySize: number;       // State snapshot buffer size (default: 8)
  inputHistorySize: number;       // Input history buffer size (default: 16)
  enablePrediction: boolean;      // Enable input prediction (default: true)
  checksumVerification: boolean;  // Verify checksums on every frame (default: true)
}

const DEFAULT_CONFIG: RollbackConfig = {
  maxRollbackFrames: 8,
  inputDelayFrames: 2,
  stateHistorySize: 8,
  inputHistorySize: 16,
  enablePrediction: true,
  checksumVerification: true
};

export type SimulateFrameCallback = (
  state: GameSnapshot,
  inputs: Map<string, FrameInput>,
  rng: SeededRNG
) => GameSnapshot;

export class RollbackManager {
  private config: RollbackConfig;
  private stateHistory: StateHistory;
  private inputHistory: InputHistory;
  private inputPredictor: InputPredictor;

  private currentFrame: number;
  private lastConfirmedFrame: number;
  private rng: SeededRNG;
  private simulateFrame: SimulateFrameCallback;

  // Network stats tracking
  private rollbackCount: number;
  private rollbackFrameSum: number;
  private statsResetTime: number;

  // Rollback event tracking
  private lastRollbackInfo: RollbackInfo | null;

  constructor(
    simulateFrame: SimulateFrameCallback,
    initialSeed: number,
    config: Partial<RollbackConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stateHistory = new StateHistory(this.config.stateHistorySize);
    this.inputHistory = new InputHistory(this.config.inputHistorySize);
    this.inputPredictor = new InputPredictor();

    this.currentFrame = 0;
    this.lastConfirmedFrame = -1;
    this.rng = new SeededRNG(initialSeed);
    this.simulateFrame = simulateFrame;

    this.rollbackCount = 0;
    this.rollbackFrameSum = 0;
    this.statsResetTime = Date.now();
    this.lastRollbackInfo = null;
  }

  // Initialize with starting state
  initialize(initialState: GameSnapshot): void {
    this.currentFrame = initialState.frame;
    this.lastConfirmedFrame = initialState.frame;
    this.rng.setState(initialState.rngState);

    // Calculate and store checksum
    initialState.checksum = calculateChecksum(initialState);
    this.stateHistory.push(cloneSnapshot(initialState));
  }

  // Add input (local or remote)
  addInput(input: FrameInput): boolean {
    const frame = input.frame;

    // Reject inputs too far in the past
    if (frame < this.currentFrame - this.config.maxRollbackFrames) {
      console.warn(`[ROLLBACK] Rejected input for frame ${frame} (too old, current: ${this.currentFrame})`);
      return false;
    }

    // Store input
    this.inputHistory.addInput(frame, input);
    this.inputPredictor.updateKnown(input);

    // Check if we need to rollback
    if (frame < this.currentFrame) {
      // This is a late input - need to rollback and resimulate
      this.rollback(frame, 'late_input', input.playerId);
      return true;
    }

    return true;
  }

  // Receive authoritative server state
  receiveServerState(serverFrame: number, serverChecksum: number): void {
    // Get our state at that frame
    const ourState = this.stateHistory.get(serverFrame);
    if (!ourState) {
      // We don't have that frame anymore - request full state sync
      console.warn(`[ROLLBACK] Missing state for server frame ${serverFrame}`);
      return;
    }

    // Verify checksum
    if (this.config.checksumVerification && ourState.checksum !== serverChecksum) {
      console.warn(`[ROLLBACK] Checksum mismatch at frame ${serverFrame}: ours=${ourState.checksum}, server=${serverChecksum}`);
      this.rollback(serverFrame, 'state_mismatch', undefined, serverChecksum, ourState.checksum);
      return;
    }

    // Confirm frame
    this.lastConfirmedFrame = Math.max(this.lastConfirmedFrame, serverFrame);
  }

  // Advance simulation by one frame
  advanceFrame(localInputs: Map<string, FrameInput>): GameSnapshot {
    const nextFrame = this.currentFrame + 1;

    // Store local inputs
    for (const [playerId, input] of localInputs) {
      input.frame = nextFrame;
      this.inputHistory.addInput(nextFrame, input);
      this.inputPredictor.updateKnown(input);
    }

    // Get previous state
    const prevState = this.stateHistory.get(this.currentFrame);
    if (!prevState) {
      throw new Error(`[ROLLBACK] Missing previous state for frame ${this.currentFrame}`);
    }

    // Gather all inputs for this frame (with prediction for missing)
    const allInputs = this.gatherInputs(nextFrame, prevState);

    // Simulate
    const rngClone = this.rng.clone();
    const newState = this.simulateFrame(prevState, allInputs, rngClone);
    newState.frame = nextFrame;
    newState.rngState = rngClone.getState();
    newState.checksum = calculateChecksum(newState);

    // Store state
    this.stateHistory.push(newState);
    this.currentFrame = nextFrame;
    this.rng = rngClone;

    return newState;
  }

  // Rollback to a previous frame and resimulate
  private rollback(
    targetFrame: number,
    reason: RollbackInfo['reason'],
    playerId?: string,
    expectedChecksum?: number,
    actualChecksum?: number
  ): void {
    const framesToRollback = this.currentFrame - targetFrame;

    // Track stats
    this.rollbackCount++;
    this.rollbackFrameSum += framesToRollback;

    this.lastRollbackInfo = {
      fromFrame: this.currentFrame,
      toFrame: targetFrame,
      reason,
      playerId,
      checksumExpected: expectedChecksum,
      checksumActual: actualChecksum
    };

    console.log(`[ROLLBACK] Rolling back ${framesToRollback} frames (${reason}): ${this.currentFrame} -> ${targetFrame}`);

    // Get state to restore
    const restoreState = this.stateHistory.get(targetFrame);
    if (!restoreState) {
      console.error(`[ROLLBACK] Cannot rollback - no state for frame ${targetFrame}`);
      return;
    }

    // Restore RNG state
    this.rng.setState(restoreState.rngState);

    // Resimulate from target frame to current frame
    let state = cloneSnapshot(restoreState);
    for (let frame = targetFrame + 1; frame <= this.currentFrame; frame++) {
      const inputs = this.gatherInputs(frame, state);
      const rngClone = this.rng.clone();
      state = this.simulateFrame(state, inputs, rngClone);
      state.frame = frame;
      state.rngState = rngClone.getState();
      state.checksum = calculateChecksum(state);
      this.stateHistory.push(state);
      this.rng = rngClone;
    }
  }

  // Gather inputs for a frame (with prediction for missing)
  private gatherInputs(frame: number, state: GameSnapshot): Map<string, FrameInput> {
    const inputs = new Map<string, FrameInput>();

    // Get known inputs
    const frameInputs = this.inputHistory.getFrameInputs(frame);
    if (frameInputs) {
      for (const [playerId, input] of frameInputs.inputs) {
        inputs.set(playerId, input);
      }
    }

    // Predict missing inputs if enabled
    if (this.config.enablePrediction) {
      for (const [playerId] of state.players) {
        if (!inputs.has(playerId)) {
          inputs.set(playerId, this.inputPredictor.predict(playerId, frame));
        }
      }
    }

    return inputs;
  }

  // Get current frame
  getCurrentFrame(): number {
    return this.currentFrame;
  }

  // Get last confirmed frame
  getLastConfirmedFrame(): number {
    return this.lastConfirmedFrame;
  }

  // Get current state
  getCurrentState(): GameSnapshot | null {
    return this.stateHistory.get(this.currentFrame);
  }

  // Get state at a specific frame
  getStateAt(frame: number): GameSnapshot | null {
    return this.stateHistory.get(frame);
  }

  // Get last rollback info
  getLastRollbackInfo(): RollbackInfo | null {
    return this.lastRollbackInfo;
  }

  // Get network stats
  getNetStats(): Partial<NetStats> {
    const now = Date.now();
    const elapsed = (now - this.statsResetTime) / 1000;

    const stats: Partial<NetStats> = {
      rollbackCount: this.rollbackCount,
      avgRollbackFrames: this.rollbackCount > 0
        ? this.rollbackFrameSum / this.rollbackCount
        : 0,
      inputDelay: this.config.inputDelayFrames
    };

    // Reset stats every second
    if (elapsed >= 1) {
      this.rollbackCount = 0;
      this.rollbackFrameSum = 0;
      this.statsResetTime = now;
    }

    return stats;
  }

  // Update config
  updateConfig(config: Partial<RollbackConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Clear all state
  reset(seed: number): void {
    this.stateHistory.clear();
    this.inputHistory.clear();
    this.inputPredictor.clear();
    this.currentFrame = 0;
    this.lastConfirmedFrame = -1;
    this.rng = new SeededRNG(seed);
    this.lastRollbackInfo = null;
  }
}

// Input delay calculator based on RTT
export class InputDelayManager {
  private rttHistory: number[];
  private maxHistory: number;
  private minDelay: number;
  private maxDelay: number;

  constructor(minDelay: number = 2, maxDelay: number = 6, historySize: number = 10) {
    this.rttHistory = [];
    this.maxHistory = historySize;
    this.minDelay = minDelay;
    this.maxDelay = maxDelay;
  }

  // Add RTT sample
  addRttSample(rtt: number): void {
    this.rttHistory.push(rtt);
    if (this.rttHistory.length > this.maxHistory) {
      this.rttHistory.shift();
    }
  }

  // Calculate recommended input delay in frames
  getRecommendedDelay(): number {
    if (this.rttHistory.length === 0) {
      return this.minDelay;
    }

    // Use 75th percentile RTT for delay calculation
    const sorted = [...this.rttHistory].sort((a, b) => a - b);
    const p75Index = Math.floor(sorted.length * 0.75);
    const p75Rtt = sorted[p75Index];

    // Convert RTT to frames (at 60Hz, 16.67ms per frame)
    // Use half RTT (one-way latency) plus some buffer
    const oneWayLatency = p75Rtt / 2;
    const delayFrames = Math.ceil((oneWayLatency + 10) / (1000 / TICK_RATE));

    return Math.max(this.minDelay, Math.min(this.maxDelay, delayFrames));
  }

  // Get average RTT
  getAverageRtt(): number {
    if (this.rttHistory.length === 0) return 0;
    return this.rttHistory.reduce((a, b) => a + b, 0) / this.rttHistory.length;
  }

  // Get jitter (standard deviation)
  getJitter(): number {
    if (this.rttHistory.length < 2) return 0;
    const avg = this.getAverageRtt();
    const squareDiffs = this.rttHistory.map(rtt => Math.pow(rtt - avg, 2));
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / this.rttHistory.length);
  }

  // Clear history
  clear(): void {
    this.rttHistory = [];
  }
}

// Visual interpolation for smooth rollback corrections
export class VisualSmoother {
  private corrections: Map<string, {
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
    progress: number;
    duration: number;
  }>;

  constructor() {
    this.corrections = new Map();
  }

  // Start smoothing a position correction
  startCorrection(
    entityId: string,
    currentX: number,
    currentY: number,
    targetX: number,
    targetY: number,
    durationFrames: number = 3
  ): void {
    this.corrections.set(entityId, {
      startX: currentX,
      startY: currentY,
      targetX,
      targetY,
      progress: 0,
      duration: durationFrames
    });
  }

  // Update smoothing (call each frame)
  update(): void {
    for (const [entityId, correction] of this.corrections) {
      correction.progress += 1 / correction.duration;
      if (correction.progress >= 1) {
        this.corrections.delete(entityId);
      }
    }
  }

  // Get smoothed position for an entity
  getSmoothedPosition(entityId: string, actualX: number, actualY: number): { x: number; y: number } {
    const correction = this.corrections.get(entityId);
    if (!correction) {
      return { x: actualX, y: actualY };
    }

    // Ease out interpolation
    const t = 1 - Math.pow(1 - correction.progress, 3);

    // Interpolate from visual position to actual position
    const visualX = correction.startX + (correction.targetX - correction.startX) * t;
    const visualY = correction.startY + (correction.targetY - correction.startY) * t;

    // Blend visual position with actual position as we approach completion
    const blendFactor = correction.progress;
    return {
      x: visualX * (1 - blendFactor) + actualX * blendFactor,
      y: visualY * (1 - blendFactor) + actualY * blendFactor
    };
  }

  // Check if entity has active correction
  hasCorrection(entityId: string): boolean {
    return this.corrections.has(entityId);
  }

  // Clear all corrections
  clear(): void {
    this.corrections.clear();
  }
}
