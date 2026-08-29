// ---------------------------------------------------------------------------
// Terrain streaming.
//
// Each chunk holds one mesh per hyper-layer it has built. Two of those layers
// are on screen at a time — the pair bracketing your position in W — and the
// shader dissolves between them, which is what makes travel along the fourth
// axis continuous rather than a slideshow.
//
// Three rules keep it seamless:
//   * a layer of lookahead in each direction is built ahead of you;
//   * a chunk with only one of the pair draws that one outright;
//   * a chunk with neither draws its nearest built layer instead, and its
//     stale mesh is never disposed until a replacement exists.
// Travel therefore never has to wait, and the world is never holed.
// ---------------------------------------------------------------------------

import * as THREE from '../../vendor/three.module.js';
import { meshChunkSlice } from '../world/mesher.js';
import { W_LAYERS, chunkKey } from '../world/constants.js';
import { createMaterialSets, globalUniforms } from './voxelmat.js';
import { clamp } from '../core/mathx.js';

/** Layers kept meshed either side of the pair on screen. */
const LOOKAHEAD = 1;

export class TerrainRenderer {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.chunks = new Map();          // "cx,cz" -> Map(w -> {list, faces})
    this.queue = [];
    this.queued = new Set();
    this.mats = createMaterialSets();
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);
    this.lower = 0;
    this.upper = 0;
    this.stats = { meshes: 0, faces: 0, queue: 0, built: 0, meshMs: 0, drawn: 0, stale: 0 };
  }

  update(px, pz, w, opts, budgetMs = 6) {
    const R = opts.renderDistance;
    const ccx = Math.floor(px / 16), ccz = Math.floor(pz / 16);

    const lower = clamp(Math.floor(w), 0, W_LAYERS - 1);
    const upper = clamp(lower + 1, 0, W_LAYERS - 1);
    this.lower = lower;
    this.upper = upper;
    globalUniforms.uT.value = clamp(w - lower, 0, 1);

    // build order: what is on screen first, then the lookahead
    const wantLayers = [lower];
    if (upper !== lower) wantLayers.push(upper);
    for (let k = 1; k <= LOOKAHEAD; k++) {
      if (lower - k >= 0) wantLayers.push(lower - k);
      if (upper + k < W_LAYERS) wantLayers.push(upper + k);
    }
    const wantSet = new Set(wantLayers);

    // --- which chunks are in range ----------------------------------------
    const inRange = new Set();
    const fresh = [];
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R + R) continue;
        const cx = ccx + dx, cz = ccz + dz;
        const key = chunkKey(cx, cz);
        inRange.add(key);
        const have = this.chunks.get(key);
        for (let wi = 0; wi < wantLayers.length; wi++) {
          const lw = wantLayers[wi];
          if (have && have.has(lw)) continue;
          const qk = `${key},${lw}`;
          if (this.queued.has(qk)) continue;
          fresh.push({ cx, cz, w: lw, key, qk, pri: wi * 1e4 + d2 });
        }
      }
    }

    // --- retire ------------------------------------------------------------
    for (const [key, layers] of this.chunks) {
      if (!inRange.has(key)) {
        for (const [, rec] of layers) this._dispose(rec);
        this.chunks.delete(key);
        continue;
      }
      // never drop a chunk's last mesh: a stale layer beats a hole
      let keepsOne = false;
      for (const lw of layers.keys()) if (wantSet.has(lw)) { keepsOne = true; break; }
      if (!keepsOne) continue;
      for (const [lw, rec] of layers) {
        if (!wantSet.has(lw)) { this._dispose(rec); layers.delete(lw); }
      }
    }

    this.queue = this.queue.filter((q) => inRange.has(q.key) && wantSet.has(q.w));
    this.queued = new Set(this.queue.map((q) => q.qk));
    for (const f of fresh) { this.queue.push(f); this.queued.add(f.qk); }
    this.queue.sort((a, b) => a.pri - b.pri);

    // --- edits -------------------------------------------------------------
    if (this.world.dirtyMeshes.size) {
      for (const key of this.world.dirtyMeshes) {
        const i = key.lastIndexOf(',');
        const dw = Number(key.slice(i + 1));
        const ck = key.slice(0, i);
        if (!wantSet.has(dw) || !inRange.has(ck)) continue;
        const have = this.chunks.get(ck);
        if (!have || !have.has(dw)) continue;
        if (this.queued.has(key)) continue;
        const [cx, cz] = ck.split(',').map(Number);
        this.queue.unshift({ cx, cz, w: dw, key: ck, qk: key, pri: -1e6 });
        this.queued.add(key);
      }
      this.world.dirtyMeshes.clear();
    }

    // --- build -------------------------------------------------------------
    const t0 = performance.now();
    let built = 0;
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const q = this.queue.shift();
      this.queued.delete(q.qk);
      this._build(q.cx, q.cz, q.w, q.key);
      built++;
    }
    this.stats.meshMs = performance.now() - t0;
    this.stats.queue = this.queue.length;
    this.stats.built += built;

    this._applyVisibility();
  }

  /**
   * Choose what each chunk draws. Both layers present: dissolve. One present:
   * draw it outright. Neither: draw whatever layer that chunk does have that
   * is nearest in W, so the horizon is stale for a moment rather than missing.
   */
  _applyVisibility() {
    let faces = 0, drawn = 0, stale = 0, meshes = 0;
    for (const [, layers] of this.chunks) {
      meshes += layers.size;
      const hasLower = layers.has(this.lower);
      const hasUpper = this.upper !== this.lower && layers.has(this.upper);
      let fallback = -1;
      if (!hasLower && !hasUpper) {
        let best = Infinity;
        for (const lw of layers.keys()) {
          const d = Math.abs(lw - this.lower);
          if (d < best) { best = d; fallback = lw; }
        }
        if (fallback >= 0) stale++;
      }
      for (const [lw, rec] of layers) {
        let mats = null;
        if (hasLower && hasUpper) {
          if (lw === this.lower) mats = this.mats.lower;
          else if (lw === this.upper) mats = this.mats.upper;
        } else if (lw === this.lower || lw === this.upper || lw === fallback) {
          mats = this.mats.solo;
        }
        for (const m of rec.list) {
          m.visible = !!mats;
          if (mats) m.material = mats[m.userData.kind];
        }
        if (mats) { faces += rec.faces; drawn++; }
      }
    }
    this.stats.meshes = meshes;
    this.stats.faces = faces;
    this.stats.drawn = drawn;
    this.stats.stale = stale;
  }

  _dispose(rec) {
    for (const m of rec.list) {
      this.group.remove(m);
      m.geometry.dispose();
    }
  }

  _build(cx, cz, w, key) {
    let res;
    try {
      res = meshChunkSlice(this.world, cx, cz, w);
    } catch (err) {
      console.error('mesh error', cx, cz, w, err);
      return;
    }
    let layers = this.chunks.get(key);
    if (!layers) { layers = new Map(); this.chunks.set(key, layers); }
    const old = layers.get(w);
    if (old) this._dispose(old);
    const list = [];
    const add = (geo, kind) => {
      if (!geo) return;
      const m = new THREE.Mesh(geo, this.mats.solo[kind]);
      m.frustumCulled = true;
      m.userData.kind = kind;
      m.renderOrder = kind === 'blend' ? 2 : 0;
      m.visible = false;
      this.group.add(m);
      list.push(m);
    };
    add(res.opaque, 'opaque');
    add(res.cutout, 'cutout');
    add(res.blend, 'blend');
    layers.set(w, { list, faces: res.faces });
  }

  /** True while the resident set still needs work. */
  get settling() { return this.queue.length > 0; }

  clear() {
    for (const [, layers] of this.chunks) for (const [, rec] of layers) this._dispose(rec);
    this.chunks.clear();
    this.queue.length = 0;
    this.queued.clear();
  }
}
