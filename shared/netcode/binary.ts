// === BINARY PROTOCOL FOR ROLLBACK NETCODE ===
// Efficient binary encoding/decoding for network messages
// Reduces bandwidth by ~50% compared to JSON

// Message types
export const MSG_TYPE = {
  STATE_UPDATE: 0x01,
  INPUT: 0x02,
  INPUT_ACK: 0x03,
  FULL_STATE_SYNC: 0x04,
  INPUT_BATCH: 0x05,
  DELTA_STATE: 0x06
} as const;

// === BINARY WRITER ===
export class BinaryWriter {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset: number;
  private textEncoder: TextEncoder;

  constructor(initialSize: number = 1024) {
    this.buffer = new ArrayBuffer(initialSize);
    this.view = new DataView(this.buffer);
    this.offset = 0;
    this.textEncoder = new TextEncoder();
  }

  private ensureCapacity(needed: number): void {
    const required = this.offset + needed;
    if (required <= this.buffer.byteLength) return;

    // Double buffer size until sufficient
    let newSize = this.buffer.byteLength * 2;
    while (newSize < required) newSize *= 2;

    const newBuffer = new ArrayBuffer(newSize);
    new Uint8Array(newBuffer).set(new Uint8Array(this.buffer));
    this.buffer = newBuffer;
    this.view = new DataView(this.buffer);
  }

  writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.view.setUint8(this.offset++, value);
  }

  writeInt8(value: number): void {
    this.ensureCapacity(1);
    this.view.setInt8(this.offset++, value);
  }

  writeUint16(value: number): void {
    this.ensureCapacity(2);
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
  }

  writeInt16(value: number): void {
    this.ensureCapacity(2);
    this.view.setInt16(this.offset, value, true);
    this.offset += 2;
  }

  writeUint32(value: number): void {
    this.ensureCapacity(4);
    this.view.setUint32(this.offset, value, true);
    this.offset += 4;
  }

  writeInt32(value: number): void {
    this.ensureCapacity(4);
    this.view.setInt32(this.offset, value, true);
    this.offset += 4;
  }

  writeFloat32(value: number): void {
    this.ensureCapacity(4);
    this.view.setFloat32(this.offset, value, true);
    this.offset += 4;
  }

  writeFloat64(value: number): void {
    this.ensureCapacity(8);
    this.view.setFloat64(this.offset, value, true);
    this.offset += 8;
  }

  // Write string with length prefix (max 255 chars)
  writeString8(str: string): void {
    const bytes = this.textEncoder.encode(str.substring(0, 255));
    this.writeUint8(bytes.length);
    this.ensureCapacity(bytes.length);
    new Uint8Array(this.buffer, this.offset, bytes.length).set(bytes);
    this.offset += bytes.length;
  }

  // Write string with length prefix (max 65535 chars)
  writeString16(str: string): void {
    const bytes = this.textEncoder.encode(str.substring(0, 65535));
    this.writeUint16(bytes.length);
    this.ensureCapacity(bytes.length);
    new Uint8Array(this.buffer, this.offset, bytes.length).set(bytes);
    this.offset += bytes.length;
  }

  // Write boolean as single bit in a byte
  writeBool(value: boolean): void {
    this.writeUint8(value ? 1 : 0);
  }

  // Write compact angle (0-2PI encoded as uint16)
  writeAngle(radians: number): void {
    // Normalize to 0-2PI range
    let normalized = radians;
    while (normalized < 0) normalized += Math.PI * 2;
    while (normalized >= Math.PI * 2) normalized -= Math.PI * 2;
    // Encode as uint16 (0-65535)
    const encoded = Math.round((normalized / (Math.PI * 2)) * 65535);
    this.writeUint16(encoded);
  }

  // Get resulting buffer
  getBuffer(): ArrayBuffer {
    return this.buffer.slice(0, this.offset);
  }

  getUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer, 0, this.offset);
  }

  getOffset(): number {
    return this.offset;
  }

  reset(): void {
    this.offset = 0;
  }
}

// === BINARY READER ===
export class BinaryReader {
  private view: DataView;
  private offset: number;
  private textDecoder: TextDecoder;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.offset = 0;
    this.textDecoder = new TextDecoder();
  }

  readUint8(): number {
    return this.view.getUint8(this.offset++);
  }

  readInt8(): number {
    return this.view.getInt8(this.offset++);
  }

  readUint16(): number {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readInt16(): number {
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readUint32(): number {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readInt32(): number {
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readFloat32(): number {
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readFloat64(): number {
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readString8(): string {
    const length = this.readUint8();
    const bytes = new Uint8Array(this.view.buffer, this.offset, length);
    this.offset += length;
    return this.textDecoder.decode(bytes);
  }

  readString16(): string {
    const length = this.readUint16();
    const bytes = new Uint8Array(this.view.buffer, this.offset, length);
    this.offset += length;
    return this.textDecoder.decode(bytes);
  }

  readBool(): boolean {
    return this.readUint8() !== 0;
  }

  // Read compact angle (uint16 to radians)
  readAngle(): number {
    const encoded = this.readUint16();
    return (encoded / 65535) * Math.PI * 2;
  }

  getOffset(): number {
    return this.offset;
  }

  remaining(): number {
    return this.view.byteLength - this.offset;
  }
}

// === STATE UPDATE ENCODING ===

export interface BinaryStateUpdate {
  frame: number;
  checksum: number;
  gameTime: number;
  rngState: number;
  playerCount: number;
  ballCount: number;
  powerupCount: number;
  waveActive: boolean;
  waveType: number;
  specialBallReturning: boolean;
}

export function encodeStateUpdate(
  writer: BinaryWriter,
  state: {
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
      spin: number;
      speedMult: number;
      hitCooldown: number;
    }>;
    powerups: Array<{
      id: string;
      x: number;
      y: number;
      type: string;
      spawnProgress: number;
      vx: number;
      vy: number;
    }>;
    waveActive: boolean;
    waveType: string;
    specialBallReturning: boolean;
  }
): void {
  // Header
  writer.writeUint8(MSG_TYPE.STATE_UPDATE);
  writer.writeUint32(state.frame);
  writer.writeUint32(state.checksum);
  writer.writeFloat32(state.gameTime);
  writer.writeUint32(state.rngState);

  // Wave state (packed into single byte)
  let waveFlags = 0;
  if (state.waveActive) waveFlags |= 0x01;
  if (state.specialBallReturning) waveFlags |= 0x02;
  writer.writeUint8(waveFlags);
  writer.writeUint8(encodeWaveType(state.waveType));

  // Players
  const playerEntries = Object.entries(state.players);
  writer.writeUint8(playerEntries.length);

  for (const [id, player] of playerEntries) {
    writer.writeString8(id);
    writer.writeAngle(player.angle);
    writer.writeFloat32(player.velocity);
    writer.writeUint8(player.ring);
    writer.writeFloat32(player.ringSwitchProgress);
    writer.writeUint32(player.score);
    writer.writeUint16(player.combo);

    // Pack booleans into flags byte
    let flags = 0;
    if (player.isInactive) flags |= 0x01;
    if (player.isAI) flags |= 0x02;
    writer.writeUint8(flags);

    writer.writeString8(player.username);
    writer.writeString8(player.avatarColor);
    writer.writeFloat32(player.paddleArc);
    writer.writeFloat32(player.phaseInProgress);
  }

  // Balls
  writer.writeUint8(state.balls.length);
  for (const ball of state.balls) {
    writer.writeString8(ball.id);
    writer.writeFloat32(ball.x);
    writer.writeFloat32(ball.y);
    writer.writeFloat32(ball.vx);
    writer.writeFloat32(ball.vy);
    writer.writeFloat32(ball.radius);
    writer.writeBool(ball.isSpecial);
    writer.writeFloat32(ball.age);
    writer.writeFloat32(ball.spawnProgress);
    writer.writeFloat32(ball.spin);
    writer.writeFloat32(ball.speedMult);
    writer.writeFloat32(ball.hitCooldown);
  }

  // Powerups
  writer.writeUint8(state.powerups.length);
  for (const powerup of state.powerups) {
    writer.writeString8(powerup.id);
    writer.writeFloat32(powerup.x);
    writer.writeFloat32(powerup.y);
    writer.writeString8(powerup.type);
    writer.writeFloat32(powerup.spawnProgress);
    writer.writeFloat32(powerup.vx);
    writer.writeFloat32(powerup.vy);
  }
}

export function decodeStateUpdate(reader: BinaryReader): {
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
    spin: number;
    speedMult: number;
    hitCooldown: number;
  }>;
  powerups: Array<{
    id: string;
    x: number;
    y: number;
    type: string;
    spawnProgress: number;
    vx: number;
    vy: number;
  }>;
  waveActive: boolean;
  waveType: string;
  specialBallReturning: boolean;
  tick: number;
  roundNumber: number;
  specialBallTimer: number;
  specialBallActiveTime: number;
  spawnTimer: number;
} {
  // Skip message type (already read)
  const frame = reader.readUint32();
  const checksum = reader.readUint32();
  const gameTime = reader.readFloat32();
  const rngState = reader.readUint32();

  const waveFlags = reader.readUint8();
  const waveActive = (waveFlags & 0x01) !== 0;
  const specialBallReturning = (waveFlags & 0x02) !== 0;
  const waveType = decodeWaveType(reader.readUint8());

  // Players
  const playerCount = reader.readUint8();
  const players: Record<string, any> = {};

  for (let i = 0; i < playerCount; i++) {
    const id = reader.readString8();
    const angle = reader.readAngle();
    const velocity = reader.readFloat32();
    const ring = reader.readUint8();
    const ringSwitchProgress = reader.readFloat32();
    const score = reader.readUint32();
    const combo = reader.readUint16();
    const flags = reader.readUint8();
    const isInactive = (flags & 0x01) !== 0;
    const isAI = (flags & 0x02) !== 0;
    const username = reader.readString8();
    const avatarColor = reader.readString8();
    const paddleArc = reader.readFloat32();
    const phaseInProgress = reader.readFloat32();

    players[id] = {
      angle, velocity, ring, ringSwitchProgress,
      score, combo, isInactive, username, avatarColor,
      paddleArc, phaseInProgress, isAI
    };
  }

  // Balls
  const ballCount = reader.readUint8();
  const balls: Array<any> = [];

  for (let i = 0; i < ballCount; i++) {
    balls.push({
      id: reader.readString8(),
      x: reader.readFloat32(),
      y: reader.readFloat32(),
      vx: reader.readFloat32(),
      vy: reader.readFloat32(),
      radius: reader.readFloat32(),
      isSpecial: reader.readBool(),
      age: reader.readFloat32(),
      spawnProgress: reader.readFloat32(),
      spin: reader.readFloat32(),
      speedMult: reader.readFloat32(),
      hitCooldown: reader.readFloat32()
    });
  }

  // Powerups
  const powerupCount = reader.readUint8();
  const powerups: Array<any> = [];

  for (let i = 0; i < powerupCount; i++) {
    powerups.push({
      id: reader.readString8(),
      x: reader.readFloat32(),
      y: reader.readFloat32(),
      type: reader.readString8(),
      spawnProgress: reader.readFloat32(),
      vx: reader.readFloat32(),
      vy: reader.readFloat32()
    });
  }

  return {
    frame,
    checksum,
    tick: frame, // Legacy compatibility
    gameTime,
    roundNumber: 1, // Would need separate tracking
    rngState,
    players,
    balls,
    powerups,
    waveActive,
    waveType,
    specialBallReturning,
    specialBallTimer: 0,
    specialBallActiveTime: 0,
    spawnTimer: 0
  };
}

// === INPUT ENCODING ===

export function encodeInput(
  writer: BinaryWriter,
  input: {
    frame: number;
    playerId: string;
    angle?: number;
    velocity?: number;
    ringSwitch?: boolean;
    seq: number;
  }
): void {
  writer.writeUint8(MSG_TYPE.INPUT);
  writer.writeUint32(input.frame);
  writer.writeString8(input.playerId);

  // Pack optional fields into flags
  let flags = 0;
  if (input.angle !== undefined) flags |= 0x01;
  if (input.velocity !== undefined) flags |= 0x02;
  if (input.ringSwitch) flags |= 0x04;
  writer.writeUint8(flags);

  if (input.angle !== undefined) {
    writer.writeAngle(input.angle);
  }
  if (input.velocity !== undefined) {
    writer.writeFloat32(input.velocity);
  }
  writer.writeUint32(input.seq);
}

export function decodeInput(reader: BinaryReader): {
  frame: number;
  playerId: string;
  angle?: number;
  velocity?: number;
  ringSwitch?: boolean;
  seq: number;
} {
  const frame = reader.readUint32();
  const playerId = reader.readString8();
  const flags = reader.readUint8();

  const hasAngle = (flags & 0x01) !== 0;
  const hasVelocity = (flags & 0x02) !== 0;
  const ringSwitch = (flags & 0x04) !== 0;

  const angle = hasAngle ? reader.readAngle() : undefined;
  const velocity = hasVelocity ? reader.readFloat32() : undefined;
  const seq = reader.readUint32();

  return { frame, playerId, angle, velocity, ringSwitch, seq };
}

// === INPUT BATCH ENCODING ===

export function encodeInputBatch(
  writer: BinaryWriter,
  inputs: Array<{
    frame: number;
    playerId: string;
    angle?: number;
    velocity?: number;
    ringSwitch?: boolean;
    seq: number;
  }>
): void {
  writer.writeUint8(MSG_TYPE.INPUT_BATCH);
  writer.writeUint8(inputs.length);

  for (const input of inputs) {
    writer.writeUint32(input.frame);
    writer.writeString8(input.playerId);

    let flags = 0;
    if (input.angle !== undefined) flags |= 0x01;
    if (input.velocity !== undefined) flags |= 0x02;
    if (input.ringSwitch) flags |= 0x04;
    writer.writeUint8(flags);

    if (input.angle !== undefined) writer.writeAngle(input.angle);
    if (input.velocity !== undefined) writer.writeFloat32(input.velocity);
    writer.writeUint32(input.seq);
  }
}

export function decodeInputBatch(reader: BinaryReader): Array<{
  frame: number;
  playerId: string;
  angle?: number;
  velocity?: number;
  ringSwitch?: boolean;
  seq: number;
}> {
  const count = reader.readUint8();
  const inputs: Array<any> = [];

  for (let i = 0; i < count; i++) {
    const frame = reader.readUint32();
    const playerId = reader.readString8();
    const flags = reader.readUint8();

    const hasAngle = (flags & 0x01) !== 0;
    const hasVelocity = (flags & 0x02) !== 0;
    const ringSwitch = (flags & 0x04) !== 0;

    const angle = hasAngle ? reader.readAngle() : undefined;
    const velocity = hasVelocity ? reader.readFloat32() : undefined;
    const seq = reader.readUint32();

    inputs.push({ frame, playerId, angle, velocity, ringSwitch, seq });
  }

  return inputs;
}

// === HELPER FUNCTIONS ===

function encodeWaveType(type: string): number {
  switch (type) {
    case 'NORMAL': return 0;
    case 'SWARM': return 1;
    case 'RAPID': return 2;
    case 'CHAOS': return 3;
    case 'BOSS': return 4;
    default: return 0;
  }
}

function decodeWaveType(code: number): string {
  switch (code) {
    case 0: return 'NORMAL';
    case 1: return 'SWARM';
    case 2: return 'RAPID';
    case 3: return 'CHAOS';
    case 4: return 'BOSS';
    default: return 'NORMAL';
  }
}
