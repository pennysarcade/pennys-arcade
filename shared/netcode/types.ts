// === ROLLBACK NETCODE TYPES ===
// Shared types used by both server and client for rollback netcode

// Input for a single frame
export interface FrameInput {
  frame: number;
  playerId: string;
  angle?: number;          // Target angle for drag input
  velocity?: number;       // Direction for WASD input (-1, 0, 1)
  ringSwitch?: boolean;    // Request ring switch
  seq: number;             // Client sequence number
}

// Compact player state for snapshots
export interface PlayerSnapshot {
  id: string;
  angle: number;
  velocity: number;
  targetAngle: number;
  ring: number;
  ringSwitchProgress: number;
  ringSwitchFrom: number;
  ringSwitchTo: number;
  score: number;
  combo: number;
  lastHitTime: number;
  ballsHit: number;
  paddleArc: number;
  phaseInProgress: number;
  activePowerups: Array<{
    type: string;
    endTime: number;
  }>;
}

// Compact ball state for snapshots
export interface BallSnapshot {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  spawnProgress: number;
  age: number;
  speedMult: number;
  hitCooldown: number;
  spin: number;
  isSpecial: boolean;
}

// Compact powerup state for snapshots
export interface PowerupSnapshot {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: string;
  spawnProgress: number;
}

// Full game state snapshot for rollback
export interface GameSnapshot {
  frame: number;
  gameTime: number;
  rngState: number;        // SeededRNG state for restoration
  checksum: number;        // State hash for mismatch detection

  // Entity states
  players: Map<string, PlayerSnapshot>;
  balls: BallSnapshot[];
  powerups: PowerupSnapshot[];
  specialBall: BallSnapshot | null;

  // Game state
  specialBallTimer: number;
  specialBallActiveTime: number;
  specialBallReadyToReturn: boolean;
  specialBallReturning: boolean;

  currentWave: number;
  waveTimer: number;
  waveActive: boolean;
  waveType: string;

  spawnTimer: number;
}

// Frame input collection for all players
export interface FrameInputs {
  frame: number;
  inputs: Map<string, FrameInput>;
}

// Server -> Client: Authoritative state update with frame
export interface AuthoritativeState {
  frame: number;
  checksum: number;
  gameTime: number;
  rngState: number;

  players: Record<string, {
    angle: number;
    velocity: number;
    ring: number;
    ringSwitchProgress: number;
    score: number;
    combo: number;
    isInactive: boolean;
    username: string;
    avatarColor: string;
    paddleArc: number;
    phaseInProgress: number;
    isAI: boolean;
  }>;

  balls: Array<{
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    isSpecial: boolean;
    age: number;
    spawnProgress: number;
  }>;

  powerups: Array<{
    id: string;
    x: number;
    y: number;
    type: string;
    spawnProgress: number;
  }>;

  waveActive: boolean;
  waveType: string;
  specialBallReturning: boolean;
}

// Client -> Server: Input with prediction frame
export interface ClientInput {
  frame: number;           // Frame this input is for
  input: FrameInput;
  predictedChecksum?: number; // Client's predicted state checksum (for mismatch detection)
}

// Server -> Client: Input acknowledgment
export interface InputAck {
  frame: number;           // Frame acknowledged
  serverFrame: number;     // Current server frame
  checksum: number;        // Server state checksum at this frame
}

// Rollback info for debugging
export interface RollbackInfo {
  fromFrame: number;
  toFrame: number;
  reason: 'late_input' | 'state_mismatch' | 'prediction_correction';
  playerId?: string;
  checksumExpected?: number;
  checksumActual?: number;
}

// Network statistics
export interface NetStats {
  rtt: number;             // Round-trip time in ms
  jitter: number;          // RTT variance
  packetLoss: number;      // Estimated packet loss percentage
  inputDelay: number;      // Current input delay in frames
  rollbackCount: number;   // Rollbacks in last second
  avgRollbackFrames: number; // Average frames rolled back
}
