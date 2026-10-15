/**
 * Seedable PRNG (mulberry32). Deterministic output per seed lets the same
 * template reproduce identical datasets across reloads, machines and exports.
 */
export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  float(min: number, max: number, decimals?: number): number;
  bool(probability?: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: readonly (readonly [T, number])[]): T;
  hex(length: number): string;
}

export function hashSeed(input: string | number): number {
  if (typeof input === 'number' && Number.isFinite(input)) return input >>> 0;
  const text = String(input);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed: string | number = Date.now()): Rng {
  let state = hashSeed(seed) || 0x9e3779b9;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return lo + Math.floor(next() * (hi - lo + 1));
  };

  return {
    next,
    int,
    float(min, max, decimals = 2) {
      const value = min + next() * (max - min);
      const factor = 10 ** decimals;
      return Math.round(value * factor) / factor;
    },
    bool(probability = 0.5) {
      return next() < probability;
    },
    pick(items) {
      if (items.length === 0) throw new Error('Cannot pick from an empty list');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    weighted(items) {
      const total = items.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
      let roll = next() * total;
      for (const [value, weight] of items) {
        roll -= Math.max(0, weight);
        if (roll < 0) return value;
      }
      const last = items[items.length - 1];
      if (!last) throw new Error('Cannot pick from an empty list');
      return last[0];
    },
    hex(length) {
      let out = '';
      while (out.length < length) out += Math.floor(next() * 16).toString(16);
      return out;
    },
  };
}
