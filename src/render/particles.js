// A tiny pooled particle system: break debris, footstep puffs, phase sparks.

import * as THREE from '../../vendor/three.module.js';
import { blockAvgColor } from './atlas.js';

const MAX = 900;

export class Particles {
  constructor(scene) {
    this.n = 0;
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.size = new Float32Array(MAX);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.PointsMaterial({
      size: 0.11, vertexColors: true, sizeAttenuation: true,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.enabled = true;
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, life) {
    if (!this.enabled) return;
    let i = this.n;
    if (i >= MAX) {
      // recycle the oldest
      let worst = 0, wl = Infinity;
      for (let k = 0; k < MAX; k++) if (this.life[k] < wl) { wl = this.life[k]; worst = k; }
      i = worst;
    } else this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life;
  }

  blockBreak(x, y, z, id, count = 14) {
    const r = blockAvgColor[id * 3], g = blockAvgColor[id * 3 + 1], b = blockAvgColor[id * 3 + 2];
    for (let k = 0; k < count; k++) {
      const j = 0.65 + Math.random() * 0.5;
      this.spawn(
        x + 0.15 + Math.random() * 0.7, y + 0.15 + Math.random() * 0.7, z + 0.15 + Math.random() * 0.7,
        (Math.random() - 0.5) * 3.2, Math.random() * 3.4, (Math.random() - 0.5) * 3.2,
        r * j, g * j, b * j, 0.5 + Math.random() * 0.6,
      );
    }
  }

  hitPuff(x, y, z, id) {
    const r = blockAvgColor[id * 3], g = blockAvgColor[id * 3 + 1], b = blockAvgColor[id * 3 + 2];
    for (let k = 0; k < 3; k++) {
      this.spawn(x, y, z, (Math.random() - 0.5) * 1.6, Math.random() * 1.4, (Math.random() - 0.5) * 1.6,
        r, g, b, 0.28 + Math.random() * 0.2);
    }
  }

  phaseSpark(x, y, z, count = 10) {
    for (let k = 0; k < count; k++) {
      this.spawn(x + (Math.random() - 0.5) * 1.2, y + Math.random() * 1.8, z + (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 1.4, Math.random() * 1.6, (Math.random() - 0.5) * 1.4,
        0.43 + Math.random() * 0.3, 0.85, 1.0, 0.5 + Math.random() * 0.5);
    }
  }

  damageBurst(x, y, z) {
    for (let k = 0; k < 8; k++) {
      this.spawn(x, y, z, (Math.random() - 0.5) * 3, Math.random() * 2.6, (Math.random() - 0.5) * 3,
        0.85, 0.15, 0.25, 0.35 + Math.random() * 0.3);
    }
  }

  update(dt) {
    let live = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; continue; }
      this.vel[i * 3 + 1] -= 14 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= 0.96; this.vel[i * 3 + 2] *= 0.96;
      live++;
    }
    if (live === 0 && this.n > 0) this.n = 0;
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  clear() { this.n = 0; this.life.fill(0); this.geo.setDrawRange(0, 0); }
}
