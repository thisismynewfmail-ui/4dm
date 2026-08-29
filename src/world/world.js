// ---------------------------------------------------------------------------
// World: sparse 4D chunk storage, block access, incremental lighting,
// containers and the edit journal used for saving.
//
// The fourth axis has 41 layers but a chunk only allocates the slices you
// actually visit, so travelling in W costs memory proportional to where you
// have been rather than to the size of the hyperworld.
// ---------------------------------------------------------------------------

import { Chunk } from './chunk.js';
import { WorldGen, BIOMES } from './worldgen.js';
import { makeNoiseSet } from '../core/noise.js';
import { hashSeed } from '../core/rng.js';
import {
  CX, CZ, WORLD_H, W_LAYERS, W_MID, SEA_LEVEL, sIdx, colOffset, chunkKey, blockKey,
} from './constants.js';
import {
  B, IS_OPAQUE, IS_SOLID, LIGHT_EMIT, LIGHT_FILT, IS_LIQUID, blocks, block,
} from './blocks.js';

const NEIGHBORS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

export class World {
  constructor(seedStr, opts = {}) {
    this.seedStr = String(seedStr);
    this.seed = hashSeed(seedStr);
    this.noise = makeNoiseSet(this.seed);
    this.gen = new WorldGen(this.noise, this.seed);
    this.chunks = new Map();
    this.containers = new Map();   // "x,y,z,w" -> container state
    this.facings = new Map();      // "x,y,z,w" -> 0..3
    this.edits = new Map();        // "x,y,z,w" -> block id  (save journal)
    this.editsByChunk = new Map(); // "cx,cz" -> Map(localKey -> id)
    this.dirtyMeshes = new Set();  // "cx,cz,w"
    this.time = opts.time != null ? opts.time : 6000;
    this._lastChunk = null;
    this._lastKey = '';
    this.stats = { chunks: 0, slices: 0, slicesGen: 0, slicesLit: 0 };
  }

  // --- chunk access --------------------------------------------------------
  getChunk(cx, cz, create = false) {
    const k = chunkKey(cx, cz);
    if (this._lastKey === k && this._lastChunk) return this._lastChunk;
    let c = this.chunks.get(k);
    if (!c && create) {
      c = new Chunk(cx, cz);
      this.chunks.set(k, c);
      this.stats.chunks = this.chunks.size;
    }
    if (c) { this._lastKey = k; this._lastChunk = c; }
    return c || null;
  }

  unloadChunk(cx, cz) {
    const k = chunkKey(cx, cz);
    this.chunks.delete(k);
    if (this._lastKey === k) { this._lastKey = ''; this._lastChunk = null; }
    this.stats.chunks = this.chunks.size;
  }

  ensureSlice(cx, cz, w) {
    if (w < 0 || w >= W_LAYERS) return null;
    const c = this.getChunk(cx, cz, true);
    const s = c.slice(w, true);
    if (!s.gen) {
      this.gen.generateSlice(c, w);
      this._applyEdits(c, w);
      this.stats.slicesGen++;
    }
    return c;
  }

  isSliceReady(cx, cz, w) {
    const c = this.chunks.get(chunkKey(cx, cz));
    return !!(c && c.isGen(w));
  }

  /** Drop slices far from `keepW` across every loaded chunk. */
  trimSlices(keepW) {
    let total = 0;
    for (const [, c] of this.chunks) {
      c.evict(keepW);
      total += c.slices.size;
    }
    this.stats.slices = total;
  }

  _applyEdits(chunk, w) {
    const m = this.editsByChunk.get(chunkKey(chunk.cx, chunk.cz));
    if (!m) return;
    const sl = chunk.slice(w, true);
    for (const [k, id] of m) {
      const c = k.indexOf(':');
      if (Number(k.slice(0, c)) !== w) continue;
      sl.blocks[Number(k.slice(c + 1))] = id;
    }
  }

  // --- block access --------------------------------------------------------
  getBlock(x, y, z, w) {
    if (y < 0 || y >= WORLD_H || w < 0 || w >= W_LAYERS) return 0;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return 0;
    const s = c.slices.get(w);
    if (!s || !s.gen) return 0;
    return s.blocks[sIdx(x - (cx << 4), y, z - (cz << 4))];
  }

  /** Like getBlock but generates the slice on demand (raycasts, physics). */
  getBlockGen(x, y, z, w) {
    if (y < 0 || y >= WORLD_H || w < 0 || w >= W_LAYERS) return 0;
    const cx = x >> 4, cz = z >> 4;
    const c = this.ensureSlice(cx, cz, w);
    if (!c) return 0;
    return c.slices.get(w).blocks[sIdx(x - (cx << 4), y, z - (cz << 4))];
  }

  isSolid(x, y, z, w) { return IS_SOLID[this.getBlock(x, y, z, w)] === 1; }
  isOpaque(x, y, z, w) { return IS_OPAQUE[this.getBlock(x, y, z, w)] === 1; }

  setBlock(x, y, z, w, id, opts = {}) {
    if (y < 0 || y >= WORLD_H || w < 0 || w >= W_LAYERS) return false;
    const cx = x >> 4, cz = z >> 4;
    const c = this.ensureSlice(cx, cz, w);
    const sl = c.slices.get(w);
    const lx = x - (cx << 4), lz = z - (cz << 4);
    const i = sIdx(lx, y, lz);
    const old = sl.blocks[i];
    if (old === id) return false;
    sl.blocks[i] = id;

    // journal for saving
    const k = blockKey(x, y, z, w);
    this.edits.set(k, id);
    const ck = chunkKey(cx, cz);
    let m = this.editsByChunk.get(ck);
    if (!m) { m = new Map(); this.editsByChunk.set(ck, m); }
    m.set(`${w}:${i}`, id);

    if (id === 0) { this.containers.delete(k); this.facings.delete(k); }

    // heightmap maintenance
    const hm = sl.heightmap[lx * CZ + lz];
    if (id !== 0 && y > hm) sl.heightmap[lx * CZ + lz] = y;
    else if (id === 0 && y === hm) {
      let ny = y - 1;
      while (ny > 0 && sl.blocks[sIdx(lx, ny, lz)] === 0) ny--;
      sl.heightmap[lx * CZ + lz] = ny;
    }

    if (!opts.noLight) this._relightAt(x, y, z, w, old, id);
    this.markDirtyAround(x, y, z, w);
    return true;
  }

  markDirty(cx, cz, w) { this.dirtyMeshes.add(`${cx},${cz},${w}`); }

  markDirtyAround(x, y, z, w) {
    const cx = x >> 4, cz = z >> 4;
    this.markDirty(cx, cz, w);
    const lx = x & 15, lz = z & 15;
    if (lx === 0) this.markDirty(cx - 1, cz, w);
    if (lx === 15) this.markDirty(cx + 1, cz, w);
    if (lz === 0) this.markDirty(cx, cz - 1, w);
    if (lz === 15) this.markDirty(cx, cz + 1, w);
  }

  // --- orientation & containers -------------------------------------------
  setFacing(x, y, z, w, dir) { this.facings.set(blockKey(x, y, z, w), dir & 3); }
  getFacing(x, y, z, w) { const f = this.facings.get(blockKey(x, y, z, w)); return f === undefined ? 0 : f; }

  getContainer(x, y, z, w, makeDefault) {
    const k = blockKey(x, y, z, w);
    let c = this.containers.get(k);
    if (!c && makeDefault) { c = makeDefault(); this.containers.set(k, c); }
    return c || null;
  }
  putContainer(x, y, z, w, c) { this.containers.set(blockKey(x, y, z, w), c); }

  // --- height / biome ------------------------------------------------------
  heightAt(x, z, w) {
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c) {
      const h = c.hAt(x - (cx << 4), z - (cz << 4), w);
      if (h >= 0) return h;
    }
    return this.gen.heightAt(x, z, w);
  }

  biomeAt(x, z, w) {
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c && c.isGen(w)) return BIOMES[c.biomeAt(x - (cx << 4), z - (cz << 4), w)];
    return BIOMES[this.gen.biomeAt(x, z, w, this.gen.heightAt(x, z, w))];
  }

  // --- lighting ------------------------------------------------------------
  getLightRaw(x, y, z, w) {
    if (y < 0) return 0;
    if (y >= WORLD_H) return 0xf0;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return 0;
    const s = c.slices.get(w);
    if (!s || !s.gen) return 0;
    return s.light[sIdx(x - (cx << 4), y, z - (cz << 4))];
  }
  getSky(x, y, z, w) { return (this.getLightRaw(x, y, z, w) >> 4) & 15; }
  getBlockLight(x, y, z, w) { return this.getLightRaw(x, y, z, w) & 15; }

  _setLightRaw(x, y, z, w, v) {
    if (y < 0 || y >= WORLD_H) return;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return;
    const s = c.slices.get(w);
    if (!s || !s.gen) return;
    s.light[sIdx(x - (cx << 4), y, z - (cz << 4))] = v;
  }

  /** Compute lighting for one chunk-slice from scratch, pulling in neighbours. */
  ensureLit(cx, cz, w) {
    const c = this.ensureSlice(cx, cz, w);
    const sl = c.slices.get(w);
    if (sl.lit) return c;
    sl.lit = true;
    this.stats.slicesLit++;

    const ox = cx << 4, oz = cz << 4;
    const blocksArr = sl.blocks, lightArr = sl.light;

    // 1. vertical skylight
    for (let lx = 0; lx < CX; lx++) {
      for (let lz = 0; lz < CZ; lz++) {
        const col = colOffset(lx, lz);
        let lvl = 15;
        for (let y = WORLD_H - 1; y >= 0; y--) {
          const f = LIGHT_FILT[blocksArr[col + y]];
          if (f >= 15) lvl = 0;
          else if (f > 0) lvl = Math.max(0, lvl - f);
          lightArr[col + y] = (lvl << 4) | (lightArr[col + y] & 15);
          if (lvl === 0) {
            for (let yy = y - 1; yy >= 0; yy--) lightArr[col + yy] &= 15;
            break;
          }
        }
      }
    }

    // 2. horizontal skylight spread + block light, one BFS each
    const skyQ = [];
    const blkQ = [];
    for (let lx = 0; lx < CX; lx++) {
      for (let lz = 0; lz < CZ; lz++) {
        const col = colOffset(lx, lz);
        for (let y = 0; y < WORLD_H; y++) {
          const id = blocksArr[col + y];
          const s = (lightArr[col + y] >> 4) & 15;
          if (s > 1) skyQ.push(ox + lx, y, oz + lz, s);
          const e = LIGHT_EMIT[id];
          if (e > 0) {
            lightArr[col + y] = (lightArr[col + y] & 0xf0) | e;
            blkQ.push(ox + lx, y, oz + lz, e);
          }
        }
      }
    }
    // seed from already-lit neighbouring chunks so light crosses borders
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nb = this.chunks.get(chunkKey(cx + dx, cz + dz));
      if (!nb || !nb.isLit(w)) continue;
      for (let t = 0; t < 16; t++) {
        const nx = dx === 0 ? (cx << 4) + t : (cx << 4) + (dx > 0 ? 16 : -1);
        const nz = dz === 0 ? (cz << 4) + t : (cz << 4) + (dz > 0 ? 16 : -1);
        for (let y = 0; y < WORLD_H; y++) {
          const raw = this.getLightRaw(nx, y, nz, w);
          const s = (raw >> 4) & 15, b = raw & 15;
          if (s > 1) skyQ.push(nx, y, nz, s);
          if (b > 1) blkQ.push(nx, y, nz, b);
        }
      }
    }
    this._spread(skyQ, w, true);
    this._spread(blkQ, w, false);
    this.markDirty(cx, cz, w);
    return c;
  }

  /** BFS light propagation. `q` is a flat [x,y,z,level,...] queue. */
  _spread(q, w, isSky) {
    let head = 0;
    const shift = isSky ? 4 : 0;
    const mask = isSky ? 0x0f : 0xf0;
    while (head < q.length) {
      const x = q[head++], y = q[head++], z = q[head++], lvl = q[head++];
      if (lvl <= 1) continue;
      for (let n = 0; n < 6; n++) {
        const d = NEIGHBORS[n];
        const nx = x + d[0], ny = y + d[1], nz = z + d[2];
        if (ny < 0 || ny >= WORLD_H) continue;
        const cx = nx >> 4, cz = nz >> 4;
        const c = this.chunks.get(chunkKey(cx, cz));
        if (!c) continue;
        const s = c.slices.get(w);
        if (!s || !s.gen) continue;
        const i = sIdx(nx - (cx << 4), ny, nz - (cz << 4));
        const filt = LIGHT_FILT[s.blocks[i]];
        if (filt >= 15) continue;
        let next = lvl - 1 - Math.max(0, filt);
        if (isSky && d[1] === -1 && lvl === 15 && filt === 0) next = 15;
        if (next <= 0) continue;
        const cur = (s.light[i] >> shift) & 15;
        if (cur >= next) continue;
        s.light[i] = (s.light[i] & mask) | (next << shift);
        this.markDirty(cx, cz, w);
        q.push(nx, ny, nz, next);
      }
    }
  }

  /** Incremental relight after a single block change. */
  _relightAt(x, y, z, w, oldId, newId) {
    const skyRemove = [], blkRemove = [];
    const oldSky = this.getSky(x, y, z, w), oldBlk = this.getBlockLight(x, y, z, w);
    const emit = LIGHT_EMIT[newId];
    this._setLightRaw(x, y, z, w, 0);
    if (oldSky > 0) skyRemove.push(x, y, z, oldSky);
    if (oldBlk > 0) blkRemove.push(x, y, z, oldBlk);
    this._unspread(skyRemove, w, true);
    this._unspread(blkRemove, w, false);

    const skyQ = [], blkQ = [];
    if (LIGHT_FILT[newId] < 15) {
      let above = this.getSky(x, y + 1, z, w);
      if (y + 1 >= WORLD_H) above = 15;
      const filt = LIGHT_FILT[newId];
      const v = (above === 15 && filt === 0) ? 15 : Math.max(0, above - 1 - filt);
      if (v > 0) { this._setSky(x, y, z, w, v); skyQ.push(x, y, z, v); }
    }
    if (emit > 0) {
      const cur = this.getLightRaw(x, y, z, w);
      this._setLightRaw(x, y, z, w, (cur & 0xf0) | emit);
      blkQ.push(x, y, z, emit);
    }
    for (let n = 0; n < 6; n++) {
      const d = NEIGHBORS[n];
      const nx = x + d[0], ny = y + d[1], nz = z + d[2];
      const s = this.getSky(nx, ny, nz, w), b = this.getBlockLight(nx, ny, nz, w);
      if (s > 1) skyQ.push(nx, ny, nz, s);
      if (b > 1) blkQ.push(nx, ny, nz, b);
    }
    this._spread(skyQ, w, true);
    this._spread(blkQ, w, false);
  }

  _setSky(x, y, z, w, v) {
    const cur = this.getLightRaw(x, y, z, w);
    this._setLightRaw(x, y, z, w, (cur & 0x0f) | (v << 4));
  }

  /** Darkness BFS: zero out everything that was lit *by* the removed source. */
  _unspread(q, w, isSky) {
    let head = 0;
    const shift = isSky ? 4 : 0;
    const mask = isSky ? 0x0f : 0xf0;
    const refill = [];
    while (head < q.length) {
      const x = q[head++], y = q[head++], z = q[head++], lvl = q[head++];
      for (let n = 0; n < 6; n++) {
        const d = NEIGHBORS[n];
        const nx = x + d[0], ny = y + d[1], nz = z + d[2];
        if (ny < 0 || ny >= WORLD_H) continue;
        const cx = nx >> 4, cz = nz >> 4;
        const c = this.chunks.get(chunkKey(cx, cz));
        if (!c) continue;
        const s = c.slices.get(w);
        if (!s || !s.gen) continue;
        const i = sIdx(nx - (cx << 4), ny, nz - (cz << 4));
        const cur = (s.light[i] >> shift) & 15;
        if (cur === 0) continue;
        const straightDown = isSky && d[1] === -1 && lvl === 15;
        if (cur < lvl || straightDown) {
          s.light[i] &= mask;
          this.markDirty(cx, cz, w);
          q.push(nx, ny, nz, cur === 0 ? lvl : cur);
        } else {
          refill.push(nx, ny, nz, cur);
        }
      }
    }
    if (refill.length) this._spread(refill, w, isSky);
  }

  // --- convenience ---------------------------------------------------------
  /** Combined 0..1 light used for entity shading, with a soft bleed across W. */
  lightValue(x, y, z, w, bleed = true) {
    const raw = this.getLightRaw(x, y, z, w);
    let sky = (raw >> 4) & 15, blk = raw & 15;
    if (bleed) {
      const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
      if (c) {
        for (const dw of [-1, 1]) {
          const nw = w + dw;
          if (nw < 0 || nw >= W_LAYERS || !c.isLit(nw)) continue;
          blk = Math.max(blk, (this.getLightRaw(x, y, z, nw) & 15) - 4);
        }
      }
    }
    const daylight = this.daylight();
    return Math.max(blk / 15, (sky / 15) * daylight);
  }

  /** 0..1 sun strength for the current time of day. */
  daylight() {
    const t = (this.time % 24000) / 24000;
    const a = Math.sin((t - 0.25) * Math.PI * 2);
    return Math.max(0.16, Math.min(1, a * 1.5 + 0.55));
  }

  /**
   * Find a safe surface spawn: dry land, three blocks of headroom, no canopy.
   * If this hyper-layer is all ocean near the origin, the search walks along W
   * before it gives up — being able to step sideways in the fourth dimension
   * is, after all, the point.
   */
  findSpawn(w = W_MID, cxHint = 0, czHint = 0) {
    const layers = [w];
    for (let d = 1; d <= 8; d++) {
      if (w + d < W_LAYERS) layers.push(w + d);
      if (w - d >= 0) layers.push(w - d);
    }
    for (const lw of layers) {
      const hit = this._scanSpawn(lw, cxHint, czHint);
      if (hit) return hit;
    }
    const x = cxHint, z = czHint, y = SEA_LEVEL + 1;
    this.ensureSlice(x >> 4, z >> 4, w);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        this.setBlock(x + dx, y, z + dz, w, B.sand, { noLight: true });
        for (let yy = y + 1; yy <= y + 3; yy++) this.setBlock(x + dx, yy, z + dz, w, 0, { noLight: true });
      }
    }
    return { x: x + 0.5, y: y + 1.02, z: z + 0.5, w };
  }

  _scanSpawn(w, cxHint, czHint) {
    for (let r = 0; r < 30; r++) {
      const steps = Math.max(1, r * 8);
      for (let a = 0; a < steps; a++) {
        const ang = (a / steps) * Math.PI * 2;
        const x = Math.round(cxHint + Math.cos(ang) * r * 5);
        const z = Math.round(czHint + Math.sin(ang) * r * 5);
        const h = this.gen.heightAt(x, z, w);
        if (h <= SEA_LEVEL + 1 || h > WORLD_H - 12) continue;
        const key = BIOMES[this.gen.biomeAt(x, z, w, h)].key;
        if (key === 'ocean' || key === 'ashlands') continue;
        this.ensureSlice(x >> 4, z >> 4, w);
        const ground = this.getBlock(x, h, z, w);
        if (!IS_SOLID[ground] || IS_LIQUID[ground]) continue;
        let clear = true;
        for (let dy = 1; dy <= 3; dy++) if (this.getBlock(x, h + dy, z, w) !== 0) { clear = false; break; }
        if (!clear) continue;
        return { x: x + 0.5, y: h + 1.02, z: z + 0.5, w };
      }
    }
    return null;
  }

  tick(dtMs) { this.time = (this.time + dtMs * 0.02) % 24000; }

  // --- save ----------------------------------------------------------------
  serializeEdits() {
    const out = [];
    for (const [k, v] of this.edits) out.push(k + '=' + v);
    return out.join(';');
  }
  loadEdits(str) {
    if (!str) return;
    for (const part of str.split(';')) {
      if (!part) continue;
      const eq = part.lastIndexOf('=');
      const k = part.slice(0, eq);
      const id = Number(part.slice(eq + 1));
      const [x, y, z, w] = k.split(',').map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(w)) continue;
      this.edits.set(k, id);
      const cx = x >> 4, cz = z >> 4;
      const ck = chunkKey(cx, cz);
      let m = this.editsByChunk.get(ck);
      if (!m) { m = new Map(); this.editsByChunk.set(ck, m); }
      m.set(`${w}:${sIdx(x - (cx << 4), y, z - (cz << 4))}`, id);
    }
  }
}
