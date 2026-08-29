// ---------------------------------------------------------------------------
// World: chunk storage, 4D block access, incremental lighting, containers and
// the edit journal used for saving.
// ---------------------------------------------------------------------------

import { Chunk } from './chunk.js';
import { WorldGen, BIOMES } from './worldgen.js';
import { makeNoiseSet } from '../core/noise.js';
import { hashSeed } from '../core/rng.js';
import {
  CX, CZ, WORLD_H, W_LAYERS, W_MID, SEA_LEVEL, idx, colOffset, chunkKey, blockKey,
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
    this.time = opts.time != null ? opts.time : 6000; // 0..24000
    this.genBudgetMs = 6;
    this._lastChunk = null;
    this._lastKey = '';
    this.stats = { chunks: 0, slicesGen: 0, slicesLit: 0 };
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
    if (!c.isGen(w)) {
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

  _applyEdits(chunk, w) {
    const m = this.editsByChunk.get(chunkKey(chunk.cx, chunk.cz));
    if (!m) return;
    for (const [k, id] of m) {
      const [lx, y, lz, ew] = k.split(',').map(Number);
      if (ew !== w) continue;
      chunk.set(lx, y, lz, w, id);
    }
  }

  // --- block access --------------------------------------------------------
  getBlock(x, y, z, w) {
    if (y < 0 || y >= WORLD_H || w < 0 || w >= W_LAYERS) return 0;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c || !c.isGen(w)) return 0;
    return c.blocks[idx(x - (cx << 4), y, z - (cz << 4), w)];
  }

  /** Like getBlock but generates the slice on demand (used by raycasts). */
  getBlockGen(x, y, z, w) {
    if (y < 0 || y >= WORLD_H || w < 0 || w >= W_LAYERS) return 0;
    const cx = x >> 4, cz = z >> 4;
    const c = this.ensureSlice(cx, cz, w);
    return c.blocks[idx(x - (cx << 4), y, z - (cz << 4), w)];
  }

  isSolid(x, y, z, w) { return IS_SOLID[this.getBlock(x, y, z, w)] === 1; }
  isOpaque(x, y, z, w) { return IS_OPAQUE[this.getBlock(x, y, z, w)] === 1; }

  setBlock(x, y, z, w, id, opts = {}) {
    if (y < 0 || y >= WORLD_H || w < 0 || w >= W_LAYERS) return false;
    const cx = x >> 4, cz = z >> 4;
    const c = this.ensureSlice(cx, cz, w);
    const lx = x - (cx << 4), lz = z - (cz << 4);
    const i = idx(lx, y, lz, w);
    const old = c.blocks[i];
    if (old === id) return false;
    c.blocks[i] = id;

    // journal for saving
    const k = blockKey(x, y, z, w);
    this.edits.set(k, id);
    const ck = chunkKey(cx, cz);
    let m = this.editsByChunk.get(ck);
    if (!m) { m = new Map(); this.editsByChunk.set(ck, m); }
    m.set(`${lx},${y},${lz},${w}`, id);

    if (id === 0) { this.containers.delete(k); this.facings.delete(k); }

    // heightmap maintenance
    const hm = c.hAt(lx, lz, w);
    if (id !== 0 && y > hm) c.setH(lx, lz, w, y);
    else if (id === 0 && y === hm) {
      let ny = y - 1;
      while (ny > 0 && c.get(lx, ny, lz, w) === 0) ny--;
      c.setH(lx, lz, w, ny);
    }

    if (!opts.noLight) this._relightAt(x, y, z, w, old, id);
    this.markDirtyAround(x, y, z, w);
    return true;
  }

  markDirty(cx, cz, w) {
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c) c.dirty[w] = 1;
    this.dirtyMeshes.add(`${cx},${cz},${w}`);
  }

  markDirtyAround(x, y, z, w) {
    const cx = x >> 4, cz = z >> 4;
    this.markDirty(cx, cz, w);
    const lx = x & 15, lz = z & 15;
    if (lx === 0) this.markDirty(cx - 1, cz, w);
    if (lx === 15) this.markDirty(cx + 1, cz, w);
    if (lz === 0) this.markDirty(cx, cz - 1, w);
    if (lz === 15) this.markDirty(cx, cz + 1, w);
    // neighbouring hyper-layers show this slice as a ghost, so they restyle too
    if (w > 0) this.markDirty(cx, cz, w - 1);
    if (w < W_LAYERS - 1) this.markDirty(cx, cz, w + 1);
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
    if (c && c.isGen(w)) {
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
    if (!c || !c.isGen(w)) return 0;
    return c.light[idx(x - (cx << 4), y, z - (cz << 4), w)];
  }
  getSky(x, y, z, w) { return (this.getLightRaw(x, y, z, w) >> 4) & 15; }
  getBlockLight(x, y, z, w) { return this.getLightRaw(x, y, z, w) & 15; }

  _setLightRaw(x, y, z, w, v) {
    if (y < 0 || y >= WORLD_H) return;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c || !c.isGen(w)) return;
    c.light[idx(x - (cx << 4), y, z - (cz << 4), w)] = v;
  }

  /** Compute lighting for one chunk-slice from scratch, pulling in neighbours. */
  ensureLit(cx, cz, w) {
    const c = this.ensureSlice(cx, cz, w);
    if (c.isLit(w)) return c;
    c.markLit(w);
    this.stats.slicesLit++;

    const ox = cx << 4, oz = cz << 4;
    const base = w * CX * CZ * WORLD_H;

    // 1. vertical skylight
    for (let lx = 0; lx < CX; lx++) {
      for (let lz = 0; lz < CZ; lz++) {
        const col = base + colOffset(lx, lz);
        let lvl = 15;
        for (let y = WORLD_H - 1; y >= 0; y--) {
          const f = LIGHT_FILT[c.blocks[col + y]];
          if (f >= 15) lvl = 0;
          else if (f > 0) lvl = Math.max(0, lvl - f);
          c.light[col + y] = (lvl << 4) | (c.light[col + y] & 15);
          if (lvl === 0) {
            for (let yy = y - 1; yy >= 0; yy--) c.light[col + yy] = c.light[col + yy] & 15;
            break;
          }
        }
      }
    }

    // 2. horizontal skylight spread + 3. block light, both as one BFS each
    const skyQ = [];
    const blkQ = [];
    for (let lx = 0; lx < CX; lx++) {
      for (let lz = 0; lz < CZ; lz++) {
        const col = base + colOffset(lx, lz);
        for (let y = 0; y < WORLD_H; y++) {
          const id = c.blocks[col + y];
          const s = (c.light[col + y] >> 4) & 15;
          if (s > 1) skyQ.push(ox + lx, y, oz + lz, s);
          const e = LIGHT_EMIT[id];
          if (e > 0) {
            c.light[col + y] = (c.light[col + y] & 0xf0) | e;
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
    c.dirty[w] = 1;
    this.dirtyMeshes.add(`${cx},${cz},${w}`);
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
        if (!c || !c.isGen(w)) continue;
        const i = idx(nx - (cx << 4), ny, nz - (cz << 4), w);
        const id = c.blocks[i];
        const filt = LIGHT_FILT[id];
        if (filt >= 15) continue;
        let next = lvl - 1 - Math.max(0, filt);
        // sunlight falls straight down without loss
        if (isSky && d[1] === -1 && lvl === 15 && filt === 0) next = 15;
        if (next <= 0) continue;
        const cur = (c.light[i] >> shift) & 15;
        if (cur >= next) continue;
        c.light[i] = (c.light[i] & mask) | (next << shift);
        c.dirty[w] = 1;
        this.dirtyMeshes.add(`${cx},${cz},${w}`);
        q.push(nx, ny, nz, next);
      }
    }
  }

  /** Incremental relight after a single block change. */
  _relightAt(x, y, z, w, oldId, newId) {
    const skyRemove = [], blkRemove = [];
    const oldSky = this.getSky(x, y, z, w), oldBlk = this.getBlockLight(x, y, z, w);

    // the cell itself
    const emit = LIGHT_EMIT[newId];
    this._setLightRaw(x, y, z, w, 0);
    if (oldSky > 0) skyRemove.push(x, y, z, oldSky);
    if (oldBlk > 0) blkRemove.push(x, y, z, oldBlk);
    this._unspread(skyRemove, w, true);
    this._unspread(blkRemove, w, false);

    // re-seed
    const skyQ = [], blkQ = [];
    if (LIGHT_FILT[newId] < 15) {
      // sunlight from above
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
    // pull from all neighbours
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
        if (!c || !c.isGen(w)) continue;
        const i = idx(nx - (cx << 4), ny, nz - (cz << 4), w);
        const cur = (c.light[i] >> shift) & 15;
        if (cur === 0) continue;
        const straightDown = isSky && d[1] === -1 && lvl === 15;
        if (cur < lvl || straightDown) {
          c.light[i] = c.light[i] & mask;
          c.dirty[w] = 1;
          this.dirtyMeshes.add(`${cx},${cz},${w}`);
          q.push(nx, ny, nz, cur === 0 ? lvl : cur);
        } else if (cur >= lvl) {
          refill.push(nx, ny, nz, cur);
        }
      }
    }
    if (refill.length) this._spread(refill, w, isSky);
  }

  // --- convenience ---------------------------------------------------------
  /** Combined 0..1 light used for shading, including a soft bleed across W. */
  lightValue(x, y, z, w, bleed = true) {
    const raw = this.getLightRaw(x, y, z, w);
    let sky = (raw >> 4) & 15, blk = raw & 15;
    if (bleed) {
      for (const dw of [-1, 1]) {
        const nw = w + dw;
        if (nw < 0 || nw >= W_LAYERS) continue;
        const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
        if (!c || !c.isLit(nw)) continue;
        const r = this.getLightRaw(x, y, z, nw);
        blk = Math.max(blk, ((r & 15) - 5));
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
   * If the origin of this hyper-layer is all ocean, the search walks along W
   * before it gives up — being able to step sideways in the fourth dimension
   * is, after all, the point.
   */
  findSpawn(w = W_MID, cxHint = 0, czHint = 0) {
    const layers = [w];
    for (let d = 1; d < W_LAYERS; d++) {
      if (w + d < W_LAYERS) layers.push(w + d);
      if (w - d >= 0) layers.push(w - d);
    }
    for (const lw of layers) {
      const hit = this._scanSpawn(lw, cxHint, czHint);
      if (hit) return hit;
    }
    // Nothing anywhere: raise a small island so the player always has ground.
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
        // three blocks of clear headroom — no canopy, no cave ceiling
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
      this.edits.set(k, id);
      const ck = chunkKey(x >> 4, z >> 4);
      let m = this.editsByChunk.get(ck);
      if (!m) { m = new Map(); this.editsByChunk.set(ck, m); }
      m.set(`${x - ((x >> 4) << 4)},${y},${z - ((z >> 4) << 4)},${w}`, id);
    }
  }
}
