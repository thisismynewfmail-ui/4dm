// ---------------------------------------------------------------------------
// Layer-folk: the people who live in the hyperworld. They wander, they talk,
// and they trade in Phase Shards.
// ---------------------------------------------------------------------------

import * as THREE from '../../vendor/three.module.js';
import { Entity } from './entity.js';
import { W_LAYERS } from '../world/constants.js';
import { IS_SOLID } from '../world/blocks.js';
import { clamp, damp } from '../core/mathx.js';
import { RNG } from '../core/rng.js';

const FIRST = ['Ora', 'Vesk', 'Tamm', 'Ilde', 'Brannoc', 'Sey', 'Ruk', 'Halle', 'Pim', 'Corvet',
  'Nesh', 'Ayla', 'Dorn', 'Ysolde', 'Kepp', 'Marrow', 'Fen', 'Quill', 'Ashe', 'Loden'];
const LAST = ['of the Third Fold', 'Sixfingers', 'Kata-born', 'Ana-walker', 'the Patient',
  'Slateknee', 'Twicefound', 'the Unsliced', 'Lampwright', 'Farhand', 'the Returned'];

export const PROFESSIONS = {
  cartographer: {
    name: 'Cartographer', robe: '#3a5f8a', accent: '#c9d8ea',
    lines: [
      'Every map I draw is wrong in six directions. Mine is only wrong in three.',
      'Hold F and look. The coast you see is not the coast that is there.',
      'Layer ORIGIN is the only one everybody agrees on. That is why it is crowded.',
    ],
    trades: [
      { give: [['phase_shard', 6]], get: ['phase_compass', 1] },
      { give: [['phase_shard', 2]], get: ['torch', 12] },
      { give: [['hide', 4]], get: ['phase_shard', 3] },
    ],
  },
  smith: {
    name: 'Smith', robe: '#6b4a2c', accent: '#d8b070',
    lines: [
      'Iron is iron in every layer. That is the whole comfort of it.',
      'Bring me ore, not opinions.',
      'A Phase pickaxe will cut stone that is only half here. Expensive, though.',
    ],
    trades: [
      { give: [['phase_shard', 5]], get: ['iron_pickaxe', 1] },
      { give: [['raw_iron', 4]], get: ['iron_ingot', 4] },
      { give: [['phase_shard', 8]], get: ['iron_chest', 1] },
    ],
  },
  phase_monk: {
    name: 'Phase Monk', robe: '#4a3378', accent: '#c8a8ff',
    lines: [
      'You are a cross-section of yourself. Sit with that for a while.',
      'Stability is not courage. Stability is a rope. Do not cut it.',
      'Chrono berries taste of the layer you are about to be in.',
    ],
    trades: [
      { give: [['phase_shard', 4]], get: ['chrono_berry', 8] },
      { give: [['ectoplasm', 2]], get: ['phase_shard', 5] },
      { give: [['phase_shard', 12]], get: ['phaseite_crystal', 1] },
    ],
  },
  archivist: {
    name: 'Archivist', robe: '#5a3a3a', accent: '#e0c8a8',
    lines: [
      'I catalogue every version of this hill. There are seven. Two are lying.',
      'Write down your seed. Worlds are cheap; a good one is not.',
      'The Warden is not a monster. It is a bookmark.',
    ],
    trades: [
      { give: [['phase_shard', 3]], get: ['bookshelf', 2] },
      { give: [['fiber', 6]], get: ['phase_shard', 2] },
      { give: [['phase_shard', 5]], get: ['lantern', 2] },
    ],
  },
  trader: {
    name: 'Wandering Trader', robe: '#7a5a2c', accent: '#e8d0a0',
    lines: [
      'Everything here is a bargain in at least one hyper-layer.',
      'I once sold a man a door. He phased around it. No refund.',
      'Shards, friend. Shards make the world turn sideways.',
    ],
    trades: [
      { give: [['phase_shard', 2]], get: ['bread', 4] },
      { give: [['coal', 8]], get: ['phase_shard', 2] },
      { give: [['phase_shard', 4]], get: ['oak_planks', 24] },
    ],
  },
  farmer: {
    name: 'Farmer', robe: '#4d7a3c', accent: '#d8e0a0',
    lines: [
      'Grain grows in five of the seven layers. The other two, I do not plant.',
      'Eat before you phase. Trust me on this.',
      'Ram wool makes a bed that keeps you where you sleep.',
    ],
    trades: [
      { give: [['wheat', 6]], get: ['phase_shard', 2] },
      { give: [['phase_shard', 2]], get: ['cooked_meat', 4] },
      { give: [['phase_shard', 1]], get: ['sapling_oak', 4] },
    ],
  },
  guard: {
    name: 'Layer Guard', robe: '#4a4b52', accent: '#b8c0cc',
    lines: [
      'Stay in ORIGIN after dark and you will meet nothing worse than a Shambler.',
      'A Slicewalker cannot hit what it cannot fully see. Neither can you.',
      'Armour first. Curiosity second.',
    ],
    trades: [
      { give: [['phase_shard', 6]], get: ['iron_chest', 1] },
      { give: [['phase_shard', 4]], get: ['iron_helm', 1] },
      { give: [['bone', 5]], get: ['phase_shard', 2] },
    ],
  },
  hermit: {
    name: 'Hermit', robe: '#3a3a30', accent: '#9aa08a',
    lines: [
      'I live in KATA III. Nobody visits. That is the amenity.',
      'Void shards remember being holes. Handle them politely.',
      'There is a Tesseract Core three hundred paces that way, in every layer.',
    ],
    trades: [
      { give: [['void_shard', 1]], get: ['phase_shard', 9] },
      { give: [['phase_shard', 7]], get: ['aetherite_gem', 1] },
      { give: [['glow_shroom', 6]], get: ['phase_shard', 3] },
    ],
  },
  rift_warden: {
    name: 'Rift Warden', robe: '#1f3a5a', accent: '#8ef0ff',
    lines: [
      'Rift blocks are doors. Doors are not promises.',
      'If your Slice Compass shows two lit plates, stop moving.',
      'The outer layers are thin. Things get through.',
    ],
    trades: [
      { give: [['phase_shard', 10]], get: ['rift_block', 2] },
      { give: [['phaseite_crystal', 1]], get: ['phase_shard', 11] },
      { give: [['phase_shard', 14]], get: ['slice_lens', 1] },
    ],
  },
  glassblower: {
    name: 'Glassblower', robe: '#3a6b6b', accent: '#c8f0f0',
    lines: [
      'Phase glass is the only honest window. It shows you somewhere else.',
      'Sand, fire, patience. Two of those I can sell you.',
      'Never build a roof out of ice. Ask me how I know.',
    ],
    trades: [
      { give: [['sand', 12]], get: ['glass', 10] },
      { give: [['phase_shard', 6]], get: ['phase_glass', 4] },
      { give: [['phase_shard', 3]], get: ['slice_lantern', 1] },
    ],
  },
};
export const PROFESSION_KEYS = Object.keys(PROFESSIONS);

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

export class NPC extends Entity {
  constructor(world, profKey, x, y, z, w, seed) {
    super(world, x, y, z, w);
    const rng = new RNG(seed || `${x}:${z}:${w}:${profKey}`);
    this.prof = profKey;
    this.def = PROFESSIONS[profKey];
    this.width = 0.6; this.height = 1.85;
    this.maxHealth = 24; this.health = 24;
    this.speed = 1.6;
    this.name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    this.skin = rng.pick(['#c8a082', '#a87a5a', '#7d5540', '#e0c0a0', '#5f4030']);
    this.homeX = x; this.homeZ = z;
    this.wanderTimer = 0;
    this.targetYaw = rng.float(0, Math.PI * 2);
    this.walkPhase = 0;
    this.moving = 0;
    this.tradeUses = this.def.trades.map(() => 0);
    this.lineIndex = rng.int(0, this.def.lines.length - 1);
    this.buildModel();
  }

  buildModel() {
    this.group = new THREE.Group();
    this.parts = [];
    this.materials = [];
    const cache = new Map();
    const mk = (sx, sy, sz, x, y, z, color, role) => {
      let mat = cache.get(color);
      if (!mat) {
        mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true });
        mat.userData.base = new THREE.Color(color);
        cache.set(color, mat); this.materials.push(mat);
      }
      const m = new THREE.Mesh(boxGeo, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.userData.rest = m.position.clone();
      m.userData.role = role || null;
      this.group.add(m); this.parts.push(m);
      return m;
    };
    const robe = this.def.robe, accent = this.def.accent;
    mk(0.52, 0.78, 0.3, 0, 0.86, 0, robe, 'body');
    mk(0.56, 0.16, 0.34, 0, 1.3, 0, accent, null);
    mk(0.44, 0.44, 0.44, 0, 1.52, 0, this.skin, 'head');
    mk(0.46, 0.16, 0.46, 0, 1.76, 0, robe, null);
    mk(0.07, 0.08, 0.02, -0.11, 1.58, -0.23, '#1a1a1a', null);
    mk(0.07, 0.08, 0.02, 0.11, 1.58, -0.23, '#1a1a1a', null);
    mk(0.16, 0.72, 0.16, -0.34, 1.0, 0, robe, 'armL');
    mk(0.16, 0.72, 0.16, 0.34, 1.0, 0, robe, 'armR');
    mk(0.18, 0.5, 0.18, -0.13, 0.25, 0, '#2f2a26', 'legL');
    mk(0.18, 0.5, 0.18, 0.13, 0.25, 0, '#2f2a26', 'legR');
  }

  update(dt, game) {
    this.age += dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    this.sampleEnvironment();
    const player = game.player;

    let wantX = 0, wantZ = 0;
    const looking = this.distanceTo(player) < 4.5 && Math.round(this.w) === player.slice;
    if (looking) {
      this.targetYaw = Math.atan2(player.x - this.x, player.z - this.z);
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 3 + Math.random() * 5;
        const dx = this.homeX - this.x, dz = this.homeZ - this.z;
        if (Math.hypot(dx, dz) > 10) this.targetYaw = Math.atan2(dx, dz);
        else this.targetYaw = Math.random() * Math.PI * 2;
        this.idle = Math.random() < 0.45;
      }
      if (!this.idle) { wantX = Math.sin(this.targetYaw); wantZ = Math.cos(this.targetYaw); }
    }

    this.vx = damp(this.vx, wantX * this.speed, 10, dt);
    this.vz = damp(this.vz, wantZ * this.speed, 10, dt);
    this.applyGravity(dt);
    if (this.onGround && (Math.abs(this.vx) > 0.1 || Math.abs(this.vz) > 0.1)) {
      const ax = Math.floor(this.x + Math.sign(this.vx) * 0.5);
      const az = Math.floor(this.z + Math.sign(this.vz) * 0.5);
      if (IS_SOLID[this.world.getBlockGen(ax, Math.floor(this.y), az, this.slice)] &&
          !IS_SOLID[this.world.getBlockGen(ax, Math.floor(this.y) + 1, az, this.slice)]) this.vy = 7.4;
    }
    if (this.inWater) this.vy = Math.max(this.vy, 1.6);
    this.moveBy(this.vx * dt, this.vy * dt, this.vz * dt);
    this.yaw = damp(this.yaw, this.targetYaw, 7, dt);
    this.moving = Math.min(1, Math.hypot(this.vx, this.vz) / this.speed);
    this.walkPhase += dt * (3 + this.moving * 8);
    if (this.y < -4) this.dead = true;
  }

  render(viewW, light, dt) {
    const swing = Math.sin(this.walkPhase) * 0.45 * this.moving;
    for (const m of this.parts) {
      const r = m.userData.role;
      if (!r) continue;
      m.rotation.set(0, 0, 0);
      if (r === 'legL' || r === 'armR') m.rotation.x = swing;
      else if (r === 'legR' || r === 'armL') m.rotation.x = -swing;
      else if (r === 'head') m.rotation.x = Math.sin(this.age * 0.9) * 0.06;
    }
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
    const d = Math.abs(this.w - viewW);
    const visible = d < 0.98;
    this.group.visible = visible;
    if (!visible) return false;
    const op = clamp(1.25 - d * 1.6, 0, 1);
    const hurt = this.hurtTimer > 0 ? 0.5 : 0;
    for (const m of this.materials) {
      const b = m.userData.base;
      m.color.setRGB(clamp(b.r * light + hurt, 0, 1), b.g * light, b.b * light);
      m.opacity = op;
    }
    return true;
  }

  dispose() { for (const m of this.materials) m.dispose(); }

  greeting() {
    return this.def.lines[this.lineIndex % this.def.lines.length];
  }
  nextLine() { this.lineIndex++; return this.greeting(); }
}
