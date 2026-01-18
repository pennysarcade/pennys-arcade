// === STATE AND INPUT HISTORY FOR ROLLBACK ===
// Circular buffers for storing snapshots and inputs for rollback netcode

import { GameSnapshot, FrameInput, FrameInputs } from './types.js';

// Circular buffer for game state snapshots
export class StateHistory {
  private buffer: (GameSnapshot | null)[];
  private capacity: number;
  private oldestFrame: number;
  private newestFrame: number;

  constructor(capacity: number = 8) {
    this.capacity = capacity;
    this.buffer = new Array(capacity).fill(null);
    this.oldestFrame = 0;
    this.newestFrame = -1;
  }

  // Store a snapshot
  push(snapshot: GameSnapshot): void {
    const index = snapshot.frame % this.capacity;
    this.buffer[index] = snapshot;

    if (this.newestFrame < 0) {
      this.oldestFrame = snapshot.frame;
      this.newestFrame = snapshot.frame;
    } else {
      this.newestFrame = snapshot.frame;
      // Update oldest if we've wrapped around
      if (snapshot.frame - this.oldestFrame >= this.capacity) {
        this.oldestFrame = snapshot.frame - this.capacity + 1;
      }
    }
  }

  // Get a snapshot by frame number
  get(frame: number): GameSnapshot | null {
    if (frame < this.oldestFrame || frame > this.newestFrame) {
      return null;
    }
    const index = frame % this.capacity;
    const snapshot = this.buffer[index];
    if (snapshot && snapshot.frame === frame) {
      return snapshot;
    }
    return null;
  }

  // Get the most recent snapshot
  getLatest(): GameSnapshot | null {
    if (this.newestFrame < 0) return null;
    return this.get(this.newestFrame);
  }

  // Get the oldest available snapshot
  getOldest(): GameSnapshot | null {
    if (this.newestFrame < 0) return null;
    return this.get(this.oldestFrame);
  }

  // Check if a frame is available
  hasFrame(frame: number): boolean {
    return this.get(frame) !== null;
  }

  // Get oldest available frame number
  getOldestFrame(): number {
    return this.oldestFrame;
  }

  // Get newest available frame number
  getNewestFrame(): number {
    return this.newestFrame;
  }

  // Clear all snapshots
  clear(): void {
    this.buffer.fill(null);
    this.oldestFrame = 0;
    this.newestFrame = -1;
  }

  // Get capacity
  getCapacity(): number {
    return this.capacity;
  }
}

// Input history with per-player tracking
export class InputHistory {
  private inputs: Map<number, FrameInputs>;
  private capacity: number;
  private oldestFrame: number;
  private newestFrame: number;

  constructor(capacity: number = 16) {
    this.capacity = capacity;
    this.inputs = new Map();
    this.oldestFrame = 0;
    this.newestFrame = -1;
  }

  // Add input for a specific frame and player
  addInput(frame: number, input: FrameInput): void {
    let frameInputs = this.inputs.get(frame);
    if (!frameInputs) {
      frameInputs = {
        frame,
        inputs: new Map()
      };
      this.inputs.set(frame, frameInputs);
    }

    frameInputs.inputs.set(input.playerId, input);

    // Update frame tracking
    if (this.newestFrame < 0) {
      this.oldestFrame = frame;
      this.newestFrame = frame;
    } else {
      if (frame > this.newestFrame) {
        this.newestFrame = frame;
      }
      if (frame < this.oldestFrame) {
        this.oldestFrame = frame;
      }
    }

    // Prune old frames
    this.prune();
  }

  // Get all inputs for a frame
  getFrameInputs(frame: number): FrameInputs | null {
    return this.inputs.get(frame) || null;
  }

  // Get a specific player's input for a frame
  getPlayerInput(frame: number, playerId: string): FrameInput | null {
    const frameInputs = this.inputs.get(frame);
    if (!frameInputs) return null;
    return frameInputs.inputs.get(playerId) || null;
  }

  // Check if we have input for a frame
  hasFrame(frame: number): boolean {
    return this.inputs.has(frame);
  }

  // Check if we have a specific player's input for a frame
  hasPlayerInput(frame: number, playerId: string): boolean {
    const frameInputs = this.inputs.get(frame);
    if (!frameInputs) return false;
    return frameInputs.inputs.has(playerId);
  }

  // Get all frames with missing inputs for a player (for prediction)
  getMissingInputFrames(playerId: string, fromFrame: number, toFrame: number): number[] {
    const missing: number[] = [];
    for (let frame = fromFrame; frame <= toFrame; frame++) {
      if (!this.hasPlayerInput(frame, playerId)) {
        missing.push(frame);
      }
    }
    return missing;
  }

  // Remove frames older than (newestFrame - capacity)
  private prune(): void {
    const cutoff = this.newestFrame - this.capacity;
    for (const [frame] of this.inputs) {
      if (frame < cutoff) {
        this.inputs.delete(frame);
      }
    }

    // Update oldest frame
    if (this.inputs.size > 0) {
      this.oldestFrame = Math.min(...this.inputs.keys());
    }
  }

  // Clear all history
  clear(): void {
    this.inputs.clear();
    this.oldestFrame = 0;
    this.newestFrame = -1;
  }

  // Get oldest frame number
  getOldestFrame(): number {
    return this.oldestFrame;
  }

  // Get newest frame number
  getNewestFrame(): number {
    return this.newestFrame;
  }
}

// Input predictor - predicts missing inputs based on previous inputs
export class InputPredictor {
  private lastKnownInputs: Map<string, FrameInput>;

  constructor() {
    this.lastKnownInputs = new Map();
  }

  // Update with known input
  updateKnown(input: FrameInput): void {
    const existing = this.lastKnownInputs.get(input.playerId);
    if (!existing || existing.frame < input.frame) {
      this.lastKnownInputs.set(input.playerId, input);
    }
  }

  // Predict input for a player at a frame
  predict(playerId: string, frame: number): FrameInput {
    const lastKnown = this.lastKnownInputs.get(playerId);

    if (lastKnown) {
      // Repeat last known input (common prediction strategy)
      return {
        frame,
        playerId,
        velocity: lastKnown.velocity,
        angle: lastKnown.angle,
        ringSwitch: false, // Don't predict ring switches
        seq: lastKnown.seq
      };
    }

    // No known input - predict idle
    return {
      frame,
      playerId,
      velocity: 0,
      ringSwitch: false,
      seq: 0
    };
  }

  // Clear predictions for a player
  clearPlayer(playerId: string): void {
    this.lastKnownInputs.delete(playerId);
  }

  // Clear all predictions
  clear(): void {
    this.lastKnownInputs.clear();
  }
}
