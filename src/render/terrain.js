// ---------------------------------------------------------------------------
// Terrain mesh manager. Owns one mesh set per (chunk, hyper-layer) and decides
// which hyper-layers are drawn solid, which are drawn as ghosts, and which are
// not drawn at all.
// ---------------------------------------------------------------------------

import * as THREE from '../../vendor/three.module.js';
import { meshChunkSlice } from '../world/mesher.js';
import { W_LAYERS } from '../world/constants.js';
import { createMaterialSet } from './voxelmat.js';

export class TerrainRenderer {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.meshes = new Map();          // "cx,cz,w" -> record
    this.sliceGroups = new Map();     // w -> THREE.Group
    this.queue = [];
    this.queued = new Set();
    this.mats = {
      solid: createMaterialSet('solid'),
      ghost: createMaterialSet('ghost'),
      faint: createMaterialSet('faint'),
    };
    this.stats = { meshes: 0, faces: 0, queue: 0, built: 0 };
    for (let w = 0; w < W_LAYERS; w++) {
      const g = new THREE.Group();
      g.name = 'slice' + w;
      g.visible = false;
      scene.add(g);
      this.sliceGroups.set(w, g);
    }
  }

  group(w) { return this.sliceGroups.get(w); }

  key(cx, cz, w) { return `${cx},${cz},${w}`; }

  /** Decide the working set and top up the build queue. */
  update(px, pz, wDominant, opts, budgetMs = 6) {
    const R = opts.renderDistance;
    const RG = Math.min(R, opts.ghostDistance);
    const ghostDepth = opts.ghostDepth;
    const ccx = Math.floor(px / 16), ccz = Math.floor(pz / 16);

    const needed = new Set();
    const wants = [];
    for (let dw = -ghostDepth; dw <= ghostDepth; dw++) {
      const w = wDominant + dw;
      if (w < 0 || w >= W_LAYERS) continue;
      const rad = dw === 0 ? R : RG;
      for (let dx = -rad; dx <= rad; dx++) {
        for (let dz = -rad; dz <= rad; dz++) {
          const d2 = dx * dx + dz * dz;
          if (d2 > rad * rad + rad) continue;
          const cx = ccx + dx, cz = ccz + dz;
          const k = this.key(cx, cz, w);
          needed.add(k);
          if (!this.meshes.has(k) && !this.queued.has(k)) {
            wants.push({ cx, cz, w, k, pri: d2 + Math.abs(dw) * 400 });
          }
        }
      }
    }

    // drop what left the working set
    for (const [k, rec] of this.meshes) {
      if (!needed.has(k)) { this._dispose(rec); this.meshes.delete(k); }
    }
    this.queue = this.queue.filter((q) => needed.has(q.k));
    this.queued = new Set(this.queue.map((q) => q.k));
    for (const wt of wants) { this.queue.push(wt); this.queued.add(wt.k); }
    this.queue.sort((a, b) => a.pri - b.pri);

    // rebuild anything the world marked dirty
    if (this.world.dirtyMeshes.size) {
      for (const k of this.world.dirtyMeshes) {
        if (this.meshes.has(k) && !this.queued.has(k)) {
          const [cx, cz, w] = k.split(',').map(Number);
          this.queue.unshift({ cx, cz, w, k, pri: -1 });
          this.queued.add(k);
        }
      }
      this.world.dirtyMeshes.clear();
    }

    const t0 = performance.now();
    let built = 0;
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const q = this.queue.shift();
      this.queued.delete(q.k);
      this._build(q.cx, q.cz, q.w, q.k);
      built++;
      if (built > 24) break;
    }
    this.stats.queue = this.queue.length;
    this.stats.meshes = this.meshes.size;
    this.stats.built += built;
  }

  _dispose(rec) {
    for (const m of rec.list) {
      rec.group.remove(m);
      m.geometry.dispose();
    }
  }

  _build(cx, cz, w, k) {
    const old = this.meshes.get(k);
    if (old) { this._dispose(old); this.meshes.delete(k); }
    let res;
    try { res = meshChunkSlice(this.world, cx, cz, w); }
    catch (err) { console.error('mesh error', cx, cz, w, err); return; }
    const group = this.sliceGroups.get(w);
    const list = [];
    const add = (geo, kind) => {
      if (!geo) return;
      const m = new THREE.Mesh(geo, this.mats.solid[kind]);
      m.frustumCulled = true;
      m.userData.kind = kind;
      m.renderOrder = kind === 'blend' ? 2 : 0;
      group.add(m);
      list.push(m);
    };
    add(res.opaque, 'opaque');
    add(res.cutout, 'cutout');
    add(res.blend, 'blend');
    this.meshes.set(k, { list, group, w, faces: res.faces });
  }

  /**
   * Assign per-frame roles.
   * @param {Map<number, {role:string, alpha:number}>} roles  w -> role
   */
  applyRoles(roles) {
    for (const [w, g] of this.sliceGroups) {
      const r = roles.get(w);
      g.visible = !!r;
      if (!r) continue;
      g.renderOrder = r.role === 'solid' ? 0 : 5;
    }
    for (const [, rec] of this.meshes) {
      const r = roles.get(rec.w);
      if (!r) continue;
      const set = this.mats[r.role];
      for (const m of rec.list) {
        m.material = set[m.userData.kind];
        m.renderOrder = r.role === 'solid' ? (m.userData.kind === 'blend' ? 2 : 0) : 6;
      }
    }
    for (const key of ['ghost', 'faint']) {
      let a = 0;
      for (const [, r] of roles) if (r.role === key) a = Math.max(a, r.alpha);
      this.mats[key].setAlpha(a);
    }
    let faces = 0;
    for (const [, rec] of this.meshes) if (roles.has(rec.w)) faces += rec.faces;
    this.stats.faces = faces;
  }

  clear() {
    for (const [, rec] of this.meshes) this._dispose(rec);
    this.meshes.clear();
    this.queue.length = 0;
    this.queued.clear();
  }
}
