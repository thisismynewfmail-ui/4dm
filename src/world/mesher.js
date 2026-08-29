// ---------------------------------------------------------------------------
// Chunk-slice mesher.
//
// One geometry per (chunk, hyper-layer). Smooth travel along W comes from
// keeping the two layers that bracket your position resident at once and
// dissolving between them on the GPU — meshing a whole slab into one buffer
// was tried and costs one copy per layer exactly where the faces are, at the
// surface, because neighbouring layers put their surfaces at *different*
// heights. Two thin meshes beat one fat one.
// ---------------------------------------------------------------------------

import * as THREE from '../../vendor/three.module.js';
import { CX, CZ, WORLD_H, colOffset } from './constants.js';
import { IS_OPAQUE, ALPHA_KIND, RENDER_KIND, blocks, B } from './blocks.js';
import { blockFaceLayer, ORIENTED } from '../render/atlas.js';

// face order: +X -X +Y -Y +Z -Z
const FACES = [
  { d: [1, 0, 0],  u1: [0, 1, 0], u2: [0, 0, 1], shade: 0.74,
    v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], ab: [[0, 0], [1, 0], [1, 1], [0, 1]],
    uv: [[0, 1], [0, 0], [1, 0], [1, 1]] },
  { d: [-1, 0, 0], u1: [0, 1, 0], u2: [0, 0, 1], shade: 0.74,
    v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], ab: [[0, 1], [1, 1], [1, 0], [0, 0]],
    uv: [[0, 1], [0, 0], [1, 0], [1, 1]] },
  { d: [0, 1, 0],  u1: [1, 0, 0], u2: [0, 0, 1], shade: 1.0,
    v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], ab: [[0, 0], [0, 1], [1, 1], [1, 0]],
    uv: [[0, 0], [0, 1], [1, 1], [1, 0]] },
  { d: [0, -1, 0], u1: [1, 0, 0], u2: [0, 0, 1], shade: 0.52,
    v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], ab: [[0, 0], [1, 0], [1, 1], [0, 1]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]] },
  { d: [0, 0, 1],  u1: [1, 0, 0], u2: [0, 1, 0], shade: 0.88,
    v: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], ab: [[1, 0], [1, 1], [0, 1], [0, 0]],
    uv: [[0, 1], [0, 0], [1, 0], [1, 1]] },
  { d: [0, 0, -1], u1: [1, 0, 0], u2: [0, 1, 0], shade: 0.88,
    v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], ab: [[0, 0], [0, 1], [1, 1], [1, 0]],
    uv: [[0, 1], [0, 0], [1, 0], [1, 1]] },
];

// facing (0..3) -> which world face is the "front"
const FACING_TO_FACE = [5, 0, 4, 1]; // -Z, +X, +Z, -X

class Buf {
  constructor() {
    this.pos = []; this.uv = []; this.layer = []; this.shade = []; this.index = [];
    this.count = 0;
  }
  get empty() { return this.count === 0; }
  quad(px, py, pz, face, layerIdx, ao, lightB, lightS, scaleY = 1) {
    const f = FACES[face];
    const base = this.count;
    for (let i = 0; i < 4; i++) {
      const v = f.v[i];
      this.pos.push(px + v[0], py + v[1] * scaleY, pz + v[2]);
      this.uv.push(f.uv[i][0], f.uv[i][1]);
      this.layer.push(layerIdx);
      const a = ao[i];
      this.shade.push(
        Math.round(Math.min(1, lightB[i] * a * f.shade) * 255),
        Math.round(Math.min(1, lightS[i] * a * f.shade) * 255),
      );
    }
    if (ao[0] + ao[2] > ao[1] + ao[3]) {
      this.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    } else {
      this.index.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    }
    this.count += 4;
  }
  /** Arbitrary quad (cross-shaped plants). */
  free(p0, p1, p2, p3, layerIdx, light, sky, shadeF = 1) {
    const base = this.count;
    const pts = [p0, p1, p2, p3];
    const uvs = [[0, 1], [0, 0], [1, 0], [1, 1]];
    for (let i = 0; i < 4; i++) {
      this.pos.push(pts[i][0], pts[i][1], pts[i][2]);
      this.uv.push(uvs[i][0], uvs[i][1]);
      this.layer.push(layerIdx);
      this.shade.push(Math.round(Math.min(1, light * shadeF) * 255), Math.round(Math.min(1, sky * shadeF) * 255));
    }
    this.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.count += 4;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('alayer', new THREE.Float32BufferAttribute(this.layer, 1));
    g.setAttribute('ashade', new THREE.Uint8BufferAttribute(this.shade, 2, true));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    return g;
  }
}

const AO_TABLE = [0.44, 0.63, 0.82, 1.0];

/**
 * @param {World} world
 * @param {number} cx @param {number} cz
 * @param {number} w   the hyper-layer to mesh
 */
export function meshChunkSlice(world, cx, cz, w) {
  world.ensureLit(cx, cz, w);
  const sl = world.getChunk(cx, cz).slices.get(w);
  const bl = sl.blocks, lt = sl.light;
  const ox = cx << 4, oz = cz << 4;

  const opaque = new Buf(), cutout = new Buf(), blend = new Buf();

  // A cell walled in on all six sides can never contribute a face. Most of a
  // chunk is exactly that, and skipping it early is the single biggest win in
  // this loop.
  const buried = (lx, y, lz) => {
    if (lx < 1 || lx > CX - 2 || lz < 1 || lz > CZ - 2 || y < 1 || y > WORLD_H - 2) return false;
    const col = colOffset(lx, lz);
    return !!(IS_OPAQUE[bl[col + y + 1]] && IS_OPAQUE[bl[col + y - 1]] &&
      IS_OPAQUE[bl[colOffset(lx + 1, lz) + y]] && IS_OPAQUE[bl[colOffset(lx - 1, lz) + y]] &&
      IS_OPAQUE[bl[colOffset(lx, lz + 1) + y]] && IS_OPAQUE[bl[colOffset(lx, lz - 1) + y]]);
  };

  const getId = (x, y, z) => {
    if (y < 0 || y >= WORLD_H) return 0;
    const lx = x - ox, lz = z - oz;
    if (lx >= 0 && lx < CX && lz >= 0 && lz < CZ) return bl[colOffset(lx, lz) + y];
    return world.getBlock(x, y, z, w);
  };
  const getLight = (x, y, z) => {
    if (y < 0) return 0;
    if (y >= WORLD_H) return 0xf0;
    const lx = x - ox, lz = z - oz;
    if (lx >= 0 && lx < CX && lz >= 0 && lz < CZ) return lt[colOffset(lx, lz) + y];
    return world.getLightRaw(x, y, z, w);
  };

  const aoBuf = [0, 0, 0, 0], lbBuf = [0, 0, 0, 0], lsBuf = [0, 0, 0, 0];

  function emitBlock(id, x, y, z) {
    const kind = RENDER_KIND[id];
    if (kind === 0) return;
    const ak = ALPHA_KIND[id];
    const buf = ak === 0 ? opaque : (ak === 1 ? cutout : blend);
    const bdef = blocks[id];

    if (kind === 2 || kind === 3) {                   // cross-shaped plant / torch
      const raw = getLight(x, y, z);
      const lightB = Math.max((raw & 15), bdef.emit) / 15;
      const lightS = ((raw >> 4) & 15) / 15;
      const layer = blockFaceLayer[id * 6 + 2];
      const s = kind === 3 ? 0.42 : 0.5;
      const hgt = kind === 3 ? 0.86 : 1.0;
      const c = [x + 0.5, y, z + 0.5];
      const a0 = [c[0] - s, c[1], c[2] - s], a1 = [c[0] - s, c[1] + hgt, c[2] - s];
      const a2 = [c[0] + s, c[1] + hgt, c[2] + s], a3 = [c[0] + s, c[1], c[2] + s];
      buf.free(a0, a1, a2, a3, layer, lightB, lightS, 1.0);
      buf.free(a3, a2, a1, a0, layer, lightB, lightS, 1.0);
      const b0 = [c[0] + s, c[1], c[2] - s], b1 = [c[0] + s, c[1] + hgt, c[2] - s];
      const b2 = [c[0] - s, c[1] + hgt, c[2] + s], b3 = [c[0] - s, c[1], c[2] + s];
      buf.free(b0, b1, b2, b3, layer, lightB, lightS, 0.92);
      buf.free(b3, b2, b1, b0, layer, lightB, lightS, 0.92);
      return;
    }

    const isLiquid = id === B.water || id === B.lava;
    const yScale = (isLiquid && getId(x, y + 1, z) !== id) ? 0.875 : 1;
    const oriented = ORIENTED.has(id);
    const frontFace = oriented ? FACING_TO_FACE[world.getFacing(x, y, z, w)] : -1;

    if (kind === 4) {                                  // flat panel (ladder)
      const face = FACING_TO_FACE[world.getFacing(x, y, z, w)];
      const raw = getLight(x, y, z);
      const layer = blockFaceLayer[id * 6 + face];
      for (let i = 0; i < 4; i++) { aoBuf[i] = 1; lbBuf[i] = (raw & 15) / 15; lsBuf[i] = ((raw >> 4) & 15) / 15; }
      const F = FACES[face], eps = 0.94;
      const px = x - F.d[0] * eps, py = y - F.d[1] * eps, pz = z - F.d[2] * eps;
      buf.quad(px, py, pz, face, layer, aoBuf, lbBuf, lsBuf, 1);
      buf.quad(px, py, pz, face ^ 1, layer, aoBuf, lbBuf, lsBuf, 1);
      return;
    }

    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const nx = x + F.d[0], ny = y + F.d[1], nz = z + F.d[2];
      const nid = getId(nx, ny, nz);
      if (IS_OPAQUE[nid]) continue;
      if (nid === id && ak === 2) continue;            // merge water/glass volumes
      const layer = (oriented && f === frontFace) ? bdef.frontLayer : blockFaceLayer[id * 6 + f];

      for (let i = 0; i < 4; i++) {
        const a = F.ab[i][0] ? 1 : -1, b = F.ab[i][1] ? 1 : -1;
        const s1x = nx + F.u1[0] * a, s1y = ny + F.u1[1] * a, s1z = nz + F.u1[2] * a;
        const s2x = nx + F.u2[0] * b, s2y = ny + F.u2[1] * b, s2z = nz + F.u2[2] * b;
        const cxp = s1x + F.u2[0] * b, cyp = s1y + F.u2[1] * b, czp = s1z + F.u2[2] * b;
        const o1 = IS_OPAQUE[getId(s1x, s1y, s1z)] ? 1 : 0;
        const o2 = IS_OPAQUE[getId(s2x, s2y, s2z)] ? 1 : 0;
        const oc = IS_OPAQUE[getId(cxp, cyp, czp)] ? 1 : 0;
        const level = (o1 && o2) ? 0 : (3 - o1 - o2 - oc);
        aoBuf[i] = AO_TABLE[level];

        let sb = 0, ss = 0, n = 0;
        const cells = [[nx, ny, nz], [s1x, s1y, s1z], [s2x, s2y, s2z], [cxp, cyp, czp]];
        for (const cc of cells) {
          if (IS_OPAQUE[getId(cc[0], cc[1], cc[2])]) continue;
          const raw = getLight(cc[0], cc[1], cc[2]);
          sb += raw & 15; ss += (raw >> 4) & 15; n++;
        }
        if (n === 0) { const raw = getLight(nx, ny, nz); sb = raw & 15; ss = (raw >> 4) & 15; n = 1; }
        lbBuf[i] = Math.max(sb / n, bdef.emit * 0.85) / 15;
        lsBuf[i] = (ss / n) / 15;
      }
      buf.quad(x, y, z, f, layer, aoBuf, lbBuf, lsBuf, yScale);
    }
  }

  for (let lx = 0; lx < CX; lx++) {
    for (let lz = 0; lz < CZ; lz++) {
      const col = colOffset(lx, lz);
      const x = ox + lx, z = oz + lz;
      let top = WORLD_H - 1;
      while (top > 0 && bl[col + top] === 0) top--;
      for (let y = 0; y <= top; y++) {
        const id = bl[col + y];
        if (id === 0 || buried(lx, y, lz)) continue;
        emitBlock(id, x, y, z);
      }
    }
  }

  return {
    opaque: opaque.empty ? null : opaque.build(),
    cutout: cutout.empty ? null : cutout.build(),
    blend: blend.empty ? null : blend.build(),
    faces: (opaque.count + cutout.count + blend.count) >> 2,
  };
}
