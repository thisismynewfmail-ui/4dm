import { CX, CZ, WORLD_H, SLICE_VOL, sIdx } from './constants.js';

/**
 * One 16 x 80 x 16 hyper-slice of a chunk. Slices are allocated on demand and
 * evicted when the player travels away from them in W, which is what makes a
 * 41-layer fourth dimension affordable: you pay for the layers you visit, not
 * for the ones that exist.
 */
export class Slice {
  constructor(w) {
    this.w = w;
    this.blocks = new Uint8Array(SLICE_VOL);
    this.light = new Uint8Array(SLICE_VOL);      // hi nibble sky, lo nibble block
    this.heightmap = new Int16Array(CX * CZ).fill(-1);
    this.biome = new Uint8Array(CX * CZ);
    this.gen = false;
    this.lit = false;
    this.touched = 0;                            // for LRU-ish eviction
  }
}

/** Cap on resident slices per chunk before the farthest-in-W is dropped. */
const MAX_SLICES = 9;

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.slices = new Map();     // w -> Slice
    this.loaded = true;
    this.clock = 0;
  }

  /** @returns {Slice|null} */
  slice(w, create = false) {
    let s = this.slices.get(w);
    if (!s && create) {
      s = new Slice(w);
      this.slices.set(w, s);
    }
    if (s) s.touched = ++this.clock;
    return s || null;
  }

  hasSlice(w) { return this.slices.has(w); }
  isGen(w) { const s = this.slices.get(w); return !!(s && s.gen); }
  isLit(w) { const s = this.slices.get(w); return !!(s && s.lit); }

  /** Drop the slices furthest from `keepW` once we hold too many. */
  evict(keepW) {
    if (this.slices.size <= MAX_SLICES) return;
    const list = Array.from(this.slices.keys());
    list.sort((a, b) => Math.abs(b - keepW) - Math.abs(a - keepW));
    let n = this.slices.size - MAX_SLICES;
    for (const w of list) {
      if (n <= 0) break;
      if (Math.abs(w - keepW) <= 2) continue;    // never drop what we can see
      this.slices.delete(w);
      n--;
    }
  }

  get(lx, y, lz, w) {
    if (y < 0 || y >= WORLD_H) return 0;
    const s = this.slices.get(w);
    return s ? s.blocks[sIdx(lx, y, lz)] : 0;
  }
  set(lx, y, lz, w, id) {
    if (y < 0 || y >= WORLD_H) return;
    const s = this.slice(w, true);
    s.blocks[sIdx(lx, y, lz)] = id;
  }
  hAt(lx, lz, w) { const s = this.slices.get(w); return s ? s.heightmap[lx * CZ + lz] : -1; }
  setH(lx, lz, w, v) { const s = this.slice(w, true); s.heightmap[lx * CZ + lz] = v; }
  biomeAt(lx, lz, w) { const s = this.slices.get(w); return s ? s.biome[lx * CZ + lz] : 0; }
  setBiome(lx, lz, w, v) { const s = this.slice(w, true); s.biome[lx * CZ + lz] = v; }
}
