// Deterministic small-state PRNGs and hashing helpers.

/** Hash an arbitrary string seed into a uint32. */
export function hashSeed(str) {
  str = String(str == null ? '' : str);
  if (str.length === 0) return (Math.random() * 0xffffffff) >>> 0;
  // If it is a plain integer, honour it literally so "12345" behaves as expected.
  if (/^-?\d+$/.test(str.trim())) {
    const n = Number(str.trim());
    if (Number.isSafeInteger(n)) return (n >>> 0) || 1;
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) || 1;
}

/** mulberry32 — fast, decent quality, 32 bits of state. */
export function mulberry32(a) {
  a = a >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A tiny stateful RNG object with convenience helpers. */
export class RNG {
  constructor(seed) {
    this.next = mulberry32(hashSeed(seed));
  }
  float(min = 0, max = 1) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(min + this.next() * (max - min + 1)); }
  bool(p = 0.5) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  /** Weighted pick. `entries` = [[value, weight], ...] */
  weighted(entries) {
    let total = 0;
    for (const e of entries) total += e[1];
    let r = this.next() * total;
    for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
    return entries[entries.length - 1][0];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
}

/** Stateless integer hash → [0,1). Used for per-coordinate decisions. */
export function hash4(x, y, z, w, salt = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^
          Math.imul(z | 0, 0x9e3779b1) ^ Math.imul(w | 0, 0x85ebca6b) ^
          Math.imul(salt | 0, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function hash2(x, z, salt = 0) { return hash4(x, 0, z, 0, salt); }
