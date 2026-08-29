// Shared entity physics: AABB movement against the voxel grid of one
// hyper-slice, gravity, liquids and ladders.

import { W_LAYERS, WORLD_H } from '../world/constants.js';
import { IS_SOLID, block, B } from '../world/blocks.js';

export const GRAVITY = 26;
export const TERMINAL = 55;

export class Entity {
  constructor(world, x, y, z, w) {
    this.world = world;
    this.x = x; this.y = y; this.z = z;
    this.w = w;                     // fractional hyper-coordinate
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.width = 0.6; this.height = 1.8;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.inLava = false;
    this.onLadder = false;
    this.dead = false;
    this.health = 20;
    this.maxHealth = 20;
    this.hurtTimer = 0;
    this.age = 0;
    this.gravity = GRAVITY;
    this.stepHeight = 0.55;
  }

  get slice() { return Math.max(0, Math.min(W_LAYERS - 1, Math.round(this.w))); }

  aabb(ox = 0, oy = 0, oz = 0) {
    const h = this.width / 2;
    return {
      x0: this.x - h + ox, x1: this.x + h + ox,
      y0: this.y + oy, y1: this.y + this.height + oy,
      z0: this.z - h + oz, z1: this.z + h + oz,
    };
  }

  collides(box, w) {
    const world = this.world;
    const x0 = Math.floor(box.x0), x1 = Math.floor(box.x1 - 1e-7);
    const y0 = Math.floor(box.y0), y1 = Math.floor(box.y1 - 1e-7);
    const z0 = Math.floor(box.z0), z1 = Math.floor(box.z1 - 1e-7);
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= WORLD_H) { if (y < 0) return true; continue; }
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          if (IS_SOLID[world.getBlockGen(x, y, z, w)]) return true;
        }
      }
    }
    return false;
  }

  /** Axis-separated move with a small step-up assist. */
  moveBy(dx, dy, dz) {
    const w = this.slice;
    const step = 0.2;

    const tryAxis = (axis, amount) => {
      let remaining = amount;
      while (Math.abs(remaining) > 1e-6) {
        const s = Math.sign(remaining) * Math.min(Math.abs(remaining), step);
        remaining -= s;
        const ox = axis === 0 ? s : 0, oy = axis === 1 ? s : 0, oz = axis === 2 ? s : 0;
        if (!this.collides(this.aabb(ox, oy, oz), w)) {
          this.x += ox; this.y += oy; this.z += oz;
          continue;
        }
        if (axis === 1) { if (s < 0) this.onGround = true; this.vy = 0; return; }
        // step assist
        if (this.onGround && this.stepHeight > 0) {
          let lifted = false;
          for (let up = 0.25; up <= this.stepHeight + 0.001; up += 0.25) {
            if (!this.collides(this.aabb(ox, up, oz), w) && !this.collides(this.aabb(0, up, 0), w)) {
              this.y += up; this.x += ox; this.z += oz; lifted = true; break;
            }
          }
          if (lifted) continue;
        }
        if (axis === 0) this.vx = 0; else this.vz = 0;
        return;
      }
    };

    this.onGround = false;
    tryAxis(1, dy);
    tryAxis(0, dx);
    tryAxis(2, dz);
  }

  sampleEnvironment() {
    const w = this.slice;
    const world = this.world;
    const fx = Math.floor(this.x), fz = Math.floor(this.z);
    const feet = world.getBlockGen(fx, Math.floor(this.y + 0.1), fz, w);
    const mid = world.getBlockGen(fx, Math.floor(this.y + this.height * 0.5), fz, w);
    const head = world.getBlockGen(fx, Math.floor(this.y + this.height - 0.1), fz, w);
    this.inWater = feet === B.water || mid === B.water;
    this.headInWater = head === B.water;
    this.inLava = feet === B.lava || mid === B.lava;
    this.onLadder = block(mid).climb || block(feet).climb;
    this.standingOn = world.getBlockGen(fx, Math.floor(this.y - 0.15), fz, w);
    this.insideBlock = mid;
  }

  applyGravity(dt) {
    if (this.inWater) {
      this.vy -= this.gravity * 0.28 * dt;
      this.vy *= Math.pow(0.62, dt * 60 / 20);
      if (this.vy < -6) this.vy = -6;
    } else if (this.inLava) {
      this.vy -= this.gravity * 0.18 * dt;
      if (this.vy < -3) this.vy = -3;
    } else {
      this.vy -= this.gravity * dt;
      if (this.vy < -TERMINAL) this.vy = -TERMINAL;
    }
  }

  damage(amount, source) {
    if (this.hurtTimer > 0 || this.dead) return false;
    this.health -= amount;
    this.hurtTimer = 0.45;
    if (this.health <= 0) { this.health = 0; this.dead = true; }
    return true;
  }

  distanceTo(o) {
    const dx = this.x - o.x, dy = this.y - o.y, dz = this.z - o.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  /** Distance including the hyper-axis, weighted so W feels "far". */
  hyperDistanceTo(o) {
    const dx = this.x - o.x, dy = this.y - o.y, dz = this.z - o.z, dw = (this.w - o.w) * 6;
    return Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw);
  }
}
