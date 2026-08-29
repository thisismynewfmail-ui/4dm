// ---------------------------------------------------------------------------
// The player: movement, vitals, and the phase drive that moves them along W.
// ---------------------------------------------------------------------------

import { Entity, GRAVITY } from './entity.js';
import { PlayerInventory } from '../world/inventory.js';
import { W_LAYERS, W_MID } from '../world/constants.js';
import { B, block, IS_SOLID } from '../world/blocks.js';
import { clamp, damp } from '../core/mathx.js';
import { getItem } from '../world/items.js';

export const PHASE_COST_PER_LAYER = 26;
export const MAX_STABILITY = 100;

export class Player extends Entity {
  constructor(world, x, y, z, w, mode = 'survival') {
    super(world, x, y, z, w);
    this.width = 0.6;
    this.height = 1.8;
    this.eyeHeight = 1.62;
    this.gameMode = mode;
    this.inventory = new PlayerInventory();
    this.maxHealth = 20;
    this.health = 20;
    this.food = 20;
    this.maxFood = 20;
    this.stability = MAX_STABILITY;
    this.anchorLayer = Math.round(w);
    this.spawnPoint = { x, y, z, w: Math.round(w) };
    this.exhaustion = 0;
    this.regenTimer = 0;
    this.flying = mode === 'creative';
    this.sprinting = false;
    this.sneaking = false;
    this.phaseHeld = false;
    this.phaseAmount = 0;      // 0..1 UI blend for the phase visuals
    this.phaseBlocked = 0;
    this.phaseNudge = 0;
    this.bob = 0;
    this.stepDistance = 0;
    this.fallStart = null;
    this.breakProgress = 0;
    this.breakTarget = null;
    this.attackCooldown = 0;
    this.useCooldown = 0;
    this.lastDamageCause = '';
    this.stats = { blocksMined: 0, blocksPlaced: 0, distance: 0, phaseShifts: 0, deaths: 0, kills: 0 };
    this.discovered = new Set();
  }

  get eyeY() { return this.y + this.eyeHeight - (this.sneaking ? 0.22 : 0); }

  get held() { return this.inventory.held; }

  heldItemDef() {
    const h = this.held;
    return h ? getItem(h.item) : null;
  }

  // -------------------------------------------------------------------------
  update(dt, input, settings, game) {
    this.age += dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.useCooldown > 0) this.useCooldown -= dt;
    if (this.phaseBlocked > 0) this.phaseBlocked -= dt;
    this.sampleEnvironment();

    const creative = this.gameMode === 'creative';
    this.sneaking = input.sneak && !this.flying;
    const wantSprint = input.sprint && input.forward && !this.sneaking && this.food > 6;
    this.sprinting = wantSprint;

    // --- horizontal intent -------------------------------------------------
    let mx = 0, mz = 0;
    if (input.forward) mz += 1;
    if (input.back) mz -= 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const dirX = mx * cos - mz * sin;
    const dirZ = mx * sin + mz * cos;

    let speed = 4.35;
    if (this.sneaking) speed = 1.45;
    else if (this.sprinting) speed = 5.7;
    if (this.inWater) speed *= 0.55;
    if (this.inLava) speed *= 0.35;
    if (this.flying) speed = this.sprinting ? 16 : 8.4;
    if (this.phaseHeld) speed *= 0.4;

    const accel = this.onGround || this.flying ? 14 : 4.5;
    this.vx = damp(this.vx, dirX * speed, accel, dt);
    this.vz = damp(this.vz, dirZ * speed, accel, dt);

    // --- vertical ----------------------------------------------------------
    if (this.flying) {
      let vy = 0;
      if (input.jump) vy += speed;
      if (input.sneak) vy -= speed;
      this.vy = damp(this.vy, vy, 12, dt);
    } else if (this.onLadder) {
      this.vy = input.jump ? 3.4 : (input.sneak ? -1.2 : (this.vy < -2 ? -2 : this.vy - 4 * dt));
      if (len > 0) this.vy = Math.max(this.vy, 2.6);
    } else if (this.inWater) {
      this.applyGravity(dt);
      if (input.jump) this.vy = Math.min(this.vy + 22 * dt, 3.2);
    } else if (this.inLava) {
      this.applyGravity(dt);
      if (input.jump) this.vy = Math.min(this.vy + 14 * dt, 1.6);
    } else {
      if (input.jump && this.onGround) {
        this.vy = 8.45;
        if (this.sprinting) { this.vx *= 1.12; this.vz *= 1.12; }
        this.exhaustion += 0.2;
      }
      this.applyGravity(dt);
    }

    // --- integrate ---------------------------------------------------------
    const px = this.x, py = this.y, pz = this.z;
    const wasGround = this.onGround;
    if (this.sneaking && this.onGround && !this.flying) this._sneakMove(dt);
    else this.moveBy(this.vx * dt, this.vy * dt, this.vz * dt);

    const moved = Math.hypot(this.x - px, this.z - pz);
    this.stats.distance += moved;
    this.stepDistance += moved;
    if (this.onGround) this.bob += moved * 3.4;

    // fall damage
    if (!wasGround && this.onGround && this.fallStart !== null) {
      const fall = this.fallStart - this.y;
      if (fall > 3.2 && !this.inWater && !creative) {
        this.damage(Math.floor(fall - 3), 'fell out of layer ' + this.slice);
      }
      this.fallStart = null;
    }
    if (!this.onGround && this.vy < 0 && this.fallStart === null) this.fallStart = this.y;
    if (this.onGround || this.inWater || this.onLadder || this.flying) this.fallStart = null;

    // --- vitals ------------------------------------------------------------
    if (!creative) {
      this.exhaustion += moved * (this.sprinting ? 0.06 : 0.018);
      if (this.exhaustion > 4) { this.exhaustion -= 4; this.food = Math.max(0, this.food - 1); }
      this.regenTimer += dt;
      if (this.regenTimer > 3.2) {
        this.regenTimer = 0;
        if (this.food >= 16 && this.health < this.maxHealth) { this.health = Math.min(this.maxHealth, this.health + 1); this.exhaustion += 1.2; }
        else if (this.food <= 0 && this.health > 1) this.damage(1, 'starved between layers');
      }
      const env = this.insideBlock;
      if (env === B.lava) this.damage(4 * dt * 3, 'melted');
      if (block(this.standingOn).hurt > 0 && this.onGround) this.damage(block(this.standingOn).hurt * dt, 'impaled');
      if (this.headInWater) {
        this.air = (this.air === undefined ? 10 : this.air) - dt;
        if (this.air < 0) { this.air = 0.9; this.damage(2, 'drowned'); }
      } else this.air = 10;
    } else { this.air = 10; }

    // --- phase stability ---------------------------------------------------
    const nearAnchor = this._nearAnchor();
    const regen = nearAnchor ? 16 : (this.onGround ? 4.2 : 2.2);
    if (!this.phaseHeld) this.stability = Math.min(MAX_STABILITY, this.stability + regen * dt);
    if (nearAnchor) this.anchorLayer = this.slice;
    if (this.y < -8) this.damage(1000, 'fell out of the world');
  }

  /** Don't walk off ledges while sneaking. */
  _sneakMove(dt) {
    const dx = this.vx * dt, dz = this.vz * dt;
    const w = this.slice;
    const grounded = (ox, oz) => {
      const b = this.aabb(ox, -0.06, oz);
      return this.collides({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y0 + 0.05, z0: b.z0, z1: b.z1 }, w);
    };
    this.moveBy(0, this.vy * dt, 0);
    if (grounded(dx, 0)) this.moveBy(dx, 0, 0); else this.vx = 0;
    if (grounded(0, dz)) this.moveBy(0, 0, dz); else this.vz = 0;
  }

  _nearAnchor() {
    const w = this.slice;
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      if (this.world.getBlock(bx + dx, by + dy, bz + dz, w) === B.anchor_block) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // The phase drive
  // -------------------------------------------------------------------------

  /** @returns {'ok'|'blocked'|'drained'} */
  phaseBy(delta, dt) {
    if (delta === 0) return 'ok';
    const creative = this.gameMode === 'creative';
    if (!creative) {
      const cost = Math.abs(delta) * PHASE_COST_PER_LAYER;
      if (this.stability <= 0.5) { this.snapToLayer(); return 'drained'; }
      this.stability = Math.max(0, this.stability - cost);
    }
    const target = clamp(this.w + delta, 0, W_LAYERS - 1);
    const curDom = this.slice;
    const newDom = clamp(Math.round(target), 0, W_LAYERS - 1);
    if (newDom !== curDom) {
      if (this.collides(this.aabb(), newDom)) {
        // materialising inside rock is not allowed
        this.w = curDom + Math.sign(delta) * 0.46;
        this.phaseBlocked = 0.4;
        return 'blocked';
      }
      this.stats.phaseShifts++;
    }
    this.w = target;
    return 'ok';
  }

  /** Settle onto the nearest legal integer layer. */
  snapToLayer() {
    const near = clamp(Math.round(this.w), 0, W_LAYERS - 1);
    if (!this.collides(this.aabb(), near)) { this.w = near; return near; }
    for (let r = 1; r < W_LAYERS; r++) {
      for (const s of [-1, 1]) {
        const t = near + s * r;
        if (t < 0 || t >= W_LAYERS) continue;
        if (!this.collides(this.aabb(), t)) { this.w = t; return t; }
      }
    }
    this.w = near;
    return near;
  }

  damage(amount, cause) {
    if (this.gameMode === 'creative') return false;
    if (this.hurtTimer > 0.28 || this.dead) return false;
    const def = this.inventory.totalDefense();
    const reduced = amount * (1 - Math.min(0.72, def * 0.04));
    this.health -= reduced;
    this.hurtTimer = 0.5;
    this.lastDamageCause = cause || 'died';
    this._damageArmor();
    if (this.health <= 0) { this.health = 0; this.dead = true; this.stats.deaths++; }
    return true;
  }

  _damageArmor() {
    for (let i = 0; i < this.inventory.armor.slots.length; i++) {
      const s = this.inventory.armor.slots[i];
      if (!s || s.dur === undefined) continue;
      s.dur -= 1;
      if (s.dur <= 0) this.inventory.armor.slots[i] = null;
    }
  }

  heal(n) { this.health = Math.min(this.maxHealth, this.health + n); }
  feed(n) { this.food = Math.min(this.maxFood, this.food + n); }
  restoreStability(n) { this.stability = Math.min(MAX_STABILITY, this.stability + n); }

  serialize() {
    return {
      x: this.x, y: this.y, z: this.z, w: this.w,
      yaw: this.yaw, pitch: this.pitch,
      health: this.health, food: this.food, stability: this.stability,
      mode: this.gameMode, selected: this.inventory.selected,
      inv: this.inventory.serialize(),
      armor: this.inventory.armor.serialize(),
      spawn: this.spawnPoint, anchorLayer: this.anchorLayer,
      stats: this.stats, discovered: Array.from(this.discovered),
    };
  }
}
