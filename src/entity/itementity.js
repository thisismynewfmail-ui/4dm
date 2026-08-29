// Dropped items. They live at a hyper-coordinate: solid in their own layer,
// a ghost in the neighbours, invisible beyond that.

import * as THREE from '../../vendor/three.module.js';
import { Entity } from './entity.js';
import { blockByName } from '../world/blocks.js';
import { getItem } from '../world/items.js';
import { blockFaceLayer } from '../render/atlas.js';
import { texIndex } from '../render/atlas.js';
import { clamp } from '../core/mathx.js';

let sharedMat = null;
export function setItemEntityMaterial(m) { sharedMat = m; }

const FACE_V = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
  [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
];
const FACE_UV = [
  [[0, 1], [0, 0], [1, 0], [1, 1]], [[0, 1], [0, 0], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [1, 1], [1, 0]], [[0, 0], [1, 0], [1, 1], [0, 1]],
  [[0, 1], [0, 0], [1, 0], [1, 1]], [[0, 1], [0, 0], [1, 0], [1, 1]],
];
const FACE_SHADE = [0.74, 0.74, 1.0, 0.52, 0.88, 0.88];

function buildCubeGeo(itemName, size) {
  const it = getItem(itemName);
  const pos = [], uv = [], layer = [], shade = [], index = [];
  const half = size / 2;
  const b = it && it.kind === 'block' ? blockByName.get(it.blockName) : null;
  if (b && b.render === 'cube') {
    for (let f = 0; f < 6; f++) {
      const base = pos.length / 3;
      const L = blockFaceLayer[b.id * 6 + f];
      for (let i = 0; i < 4; i++) {
        const v = FACE_V[f][i];
        pos.push((v[0] - 0.5) * size, (v[1] - 0.5) * size + half, (v[2] - 0.5) * size);
        uv.push(FACE_UV[f][i][0], FACE_UV[f][i][1]);
        layer.push(L);
        const s = Math.round(FACE_SHADE[f] * 255);
        shade.push(s, s);
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  } else {
    const tex = (b && (b.tex.all || b.tex.side || b.tex.top)) || (it && it.tex) || 'stone';
    const L = texIndex.get(tex) || 0;
    for (let side = 0; side < 2; side++) {
      const base = pos.length / 3;
      const z = side ? -0.01 : 0.01;
      const order = side ? [3, 2, 1, 0] : [0, 1, 2, 3];
      const quad = [[-half, 0, z], [-half, size, z], [half, size, z], [half, 0, z]];
      const uvs = [[0, 1], [0, 0], [1, 0], [1, 1]];
      for (const i of order) {
        pos.push(quad[i][0], quad[i][1], quad[i][2]);
        uv.push(uvs[i][0], uvs[i][1]);
        layer.push(L);
        shade.push(255, 255);
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('alayer', new THREE.Float32BufferAttribute(layer, 1));
  g.setAttribute('ashade', new THREE.Uint8BufferAttribute(shade, 2, true));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

const geoCache = new Map();
function geoFor(name) {
  if (!geoCache.has(name)) geoCache.set(name, buildCubeGeo(name, 0.32));
  return geoCache.get(name);
}

export class ItemEntity extends Entity {
  constructor(world, itemName, count, x, y, z, w) {
    super(world, x, y, z, w);
    this.item = itemName;
    this.count = count;
    this.width = 0.28; this.height = 0.3;
    this.gravity = 20;
    this.pickupDelay = 0.4;
    this.life = 0;
    this.stepHeight = 0;
    this.mesh = new THREE.Mesh(geoFor(itemName), sharedMat);
    this.mesh.frustumCulled = true;
  }

  update(dt) {
    this.age += dt; this.life += dt;
    if (this.pickupDelay > 0) this.pickupDelay -= dt;
    this.sampleEnvironment();
    this.applyGravity(dt);
    const f = this.onGround ? 0.72 : 0.995;
    this.vx *= Math.pow(f, dt * 60);
    this.vz *= Math.pow(f, dt * 60);
    if (this.inWater) this.vy = Math.max(this.vy, 1.1);
    this.moveBy(this.vx * dt, this.vy * dt, this.vz * dt);
    if (this.y < -4) this.dead = true;
    if (this.life > 360) this.dead = true;
  }

  render(viewW, light) {
    const d = Math.abs(this.w - viewW);
    const visible = d < 1.35;
    this.mesh.visible = visible;
    if (!visible) return false;
    this.mesh.position.set(this.x, this.y + 0.06 + Math.sin(this.age * 2.2) * 0.06, this.z);
    this.mesh.rotation.y = this.age * 1.1;
    this.mesh.scale.setScalar(clamp(1.15 - d * 0.5, 0.5, 1.15));
    return true;
  }
}
