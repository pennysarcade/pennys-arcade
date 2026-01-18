// === SEEDED RANDOM NUMBER GENERATOR ===
// Mulberry32 algorithm - fast, deterministic, excellent distribution
// Used for all game randomness to ensure deterministic simulation

export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    // Ensure seed is a 32-bit unsigned integer
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 1; // Avoid zero state
    }
  }

  // Get current state (for serialization/checksum)
  getState(): number {
    return this.state;
  }

  // Set state (for rollback restoration)
  setState(state: number): void {
    this.state = state >>> 0;
    if (this.state === 0) {
      this.state = 1;
    }
  }

  // Clone the RNG (for snapshots)
  clone(): SeededRNG {
    const rng = new SeededRNG(1);
    rng.state = this.state;
    return rng;
  }

  // Mulberry32 algorithm - generates next random 32-bit integer
  private next(): number {
    let z = (this.state += 0x6d2b79f5);
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0);
  }

  // Random float [0, 1) - equivalent to Math.random()
  random(): number {
    return this.next() / 4294967296;
  }

  // Random float using Math.fround for cross-platform consistency
  randomFloat(): number {
    return Math.fround(this.next() / 4294967296);
  }

  // Random integer in range [min, max] (inclusive)
  randomInt(min: number, max: number): number {
    return min + (this.next() % (max - min + 1));
  }

  // Random float in range [min, max)
  randomRange(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  // Random float in range [min, max) with fround
  randomRangeFloat(min: number, max: number): number {
    return Math.fround(min + this.randomFloat() * (max - min));
  }

  // Random angle [0, 2*PI)
  randomAngle(): number {
    return Math.fround(this.randomFloat() * Math.PI * 2);
  }

  // Random boolean with given probability (default 0.5)
  randomBool(probability: number = 0.5): boolean {
    return this.random() < probability;
  }

  // Pick random element from array
  pick<T>(array: T[]): T {
    return array[this.randomInt(0, array.length - 1)];
  }

  // Shuffle array in place (Fisher-Yates)
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.randomInt(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

// Create a seed from a string (for consistent seeding from round IDs, etc.)
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash >>> 0;
}

// Create a combined seed from frame number and base seed (for per-frame randomness)
export function combineSeed(baseSeed: number, frame: number): number {
  // Simple mixing function
  let seed = baseSeed ^ (frame * 0x9e3779b9);
  seed = Math.imul(seed ^ (seed >>> 16), 0x85ebca6b);
  seed = Math.imul(seed ^ (seed >>> 13), 0xc2b2ae35);
  return (seed ^ (seed >>> 16)) >>> 0;
}
