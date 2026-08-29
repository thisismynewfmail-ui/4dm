// ---------------------------------------------------------------------------
// The Fold-Kin.
//
// The people of the hyperworld are not people. They are four-dimensional
// beings, and what you meet is the part of one that happens to intersect your
// layer: a hovering core of nested boxes with shards in orbit around it, some
// of which drift out of your cross-section and simply stop existing for a
// while. They have no legs because they have never needed to walk in only
// three directions.
//
// Each profession is a silhouette rather than a costume — a ring, a stack, a
// cage, a lens — so you can read one across a field before you can read its
// colours.
// ---------------------------------------------------------------------------

import * as THREE from '../../vendor/three.module.js';
import { Entity } from './entity.js';
import { SEA_LEVEL, WORLD_H } from '../world/constants.js';
import { clamp, damp, yawToward } from '../core/mathx.js';
import { RNG } from '../core/rng.js';

/** How far along W the layer-folk stay visible. */
export const NPC_W_RANGE = 2.6;

const FOLD = ['Threefold', 'Ninefold', 'Sixfold', 'Twicecut', 'Half-Seen', 'Unfolded',
  'Everturning', 'Thinly-Here', 'Fourfold', 'Once-Whole', 'Sevenfold', 'Bent'];
const ROOT = ['Ilu', 'Vesh', 'Oro', 'Kath', 'Nim', 'Quen', 'Ashe', 'Mora', 'Tesk', 'Sural',
  'Ryn', 'Ombre', 'Halix', 'Pell', 'Vantt'];
const EPITHET = ['the Standing Wave', 'Many-Angled', 'Who Turns Slowly', 'of the Quiet Fold',
  'the Unsliced', 'Whose Edge Is Elsewhere', 'the Patient Section', 'Counting Backwards',
  'the Open Interval', 'Twice Present'];

// A box: [sx, sy, sz, x, y, z, colour, glow]. Glow keeps a part bright in
// caves and at night, which is how the accents stay legible as identity.
const B = (sx, sy, sz, x, y, z, c, g) => ({ s: [sx, sy, sz], p: [x, y, z], c, g: g || 0 });
// A ring of orbiting shards
const RING = (o) => Object.assign({
  n: 6, r: 0.75, y: 0.9, size: [0.16, 0.16, 0.16], speed: 0.6, tilt: 0,
  color: '#8ef0ff', wSpread: 0, wobble: 0,
}, o);

export const PROFESSIONS = {
  cartographer: {
    name: 'Surveyor', title: 'Cartographer', accent: '#8ecfff',
    hoverHeight: 0.45,
    core: [
      B(0.34, 0.34, 0.34, 0, 1.0, 0, '#26385e'),
      B(0.20, 0.20, 0.20, 0, 1.0, 0, '#9ad2ff'),
      B(0.06, 0.66, 0.06, 0, 1.0, 0, '#e8f4ff', 0.95),
      B(0.66, 0.05, 0.06, 0, 1.0, 0, '#6fa8dd', 0.5),
      B(0.06, 0.05, 0.66, 0, 1.0, 0, '#6fa8dd', 0.5),
      B(0.16, 0.05, 0.04, 0, 1.06, -0.19, '#ffffff', 1),
    ],
    rings: [
      RING({ n: 8, r: 0.82, y: 1.0, size: [0.13, 0.05, 0.13], speed: 0.45, color: '#8ecfff', wSpread: 1.6 }),
      RING({ n: 3, r: 0.42, y: 1.36, size: [0.09, 0.09, 0.09], speed: -0.9, color: '#e8f4ff' }),
    ],
    lines: [
      'You are a very thin thing. I mean no offence — most of you is simply elsewhere.',
      'I have surveyed this hill in nineteen layers. It is a different hill in twelve of them.',
      'Hold your F and scroll gently. Rushing a cross-section teaches you nothing.',
    ],
    trades: [
      { give: [['phase_shard', 6]], get: ['phase_compass', 1] },
      { give: [['phase_shard', 2]], get: ['torch', 12] },
      { give: [['hide', 4]], get: ['phase_shard', 3] },
    ],
  },

  smith: {
    name: 'Forgewright', title: 'Smith', accent: '#ff9a4f',
    hoverHeight: 0.2,
    core: [
      B(0.72, 0.30, 0.46, 0, 0.95, 0, '#3a3630'),
      B(0.52, 0.16, 0.34, 0, 1.18, 0, '#5a5148'),
      B(0.30, 0.11, 0.30, 0, 1.30, 0, '#ff9a4f', 1),
      B(0.30, 0.10, 0.05, 0, 0.98, -0.24, '#ffca7a', 1),
      B(0.46, 0.03, 0.03, 0, 1.10, -0.24, '#c2531c', 0.7),
      B(0.80, 0.08, 0.18, 0, 0.78, 0, '#2a2622'),
    ],
    rings: [
      RING({ n: 2, r: 0.86, y: 1.05, size: [0.26, 0.20, 0.20], speed: 1.15, color: '#6b6158' }),
      RING({ n: 5, r: 0.5, y: 0.72, size: [0.08, 0.08, 0.08], speed: -1.6, color: '#ffb066', wSpread: 0.9 }),
    ],
    lines: [
      'Iron holds its shape in every layer. That is why I work it and not, say, weather.',
      'Bring ore. Opinions do not smelt.',
      'A Phase pickaxe bites rock that is only partly present. It costs what it costs.',
    ],
    trades: [
      { give: [['phase_shard', 5]], get: ['iron_pickaxe', 1] },
      { give: [['raw_iron', 4]], get: ['iron_ingot', 4] },
      { give: [['phase_shard', 8]], get: ['iron_chest', 1] },
    ],
  },

  phase_monk: {
    name: 'Stillpoint', title: 'Phase Monk', accent: '#c8a8ff',
    hoverHeight: 0.6, spin: 0.12,
    core: [
      B(0.62, 0.62, 0.62, 0, 1.05, 0, '#2a1f47'),
      B(0.58, 0.04, 0.58, 0, 1.36, 0, '#a98ce0', 0.75),
      B(0.58, 0.04, 0.58, 0, 0.74, 0, '#a98ce0', 0.75),
      B(0.05, 0.62, 0.05, -0.29, 1.05, -0.29, '#a98ce0', 0.75),
      B(0.05, 0.62, 0.05, 0.29, 1.05, -0.29, '#a98ce0', 0.75),
      B(0.05, 0.62, 0.05, -0.29, 1.05, 0.29, '#a98ce0', 0.75),
      B(0.05, 0.62, 0.05, 0.29, 1.05, 0.29, '#a98ce0', 0.75),
      B(0.26, 0.26, 0.26, 0, 1.05, 0, '#e0c8ff', 0.9),
      B(0.12, 0.12, 0.12, 0, 1.05, 0, '#ffffff', 1),
      B(0.14, 0.04, 0.04, 0, 1.05, -0.33, '#ffe6a8', 1),
    ],
    rings: [
      RING({ n: 1, r: 0.0, y: 1.62, size: [0.1, 0.1, 0.1], speed: 0.2, color: '#ffe6a8' }),
    ],
    lines: [
      'You are a cross-section of yourself. Sit with that.',
      'Stability is not courage. It is a rope. Do not cut it because it is taut.',
      'When you stop scrolling you fall onto a whole layer. Nothing else does that. It is a talent.',
    ],
    trades: [
      { give: [['phase_shard', 4]], get: ['chrono_berry', 8] },
      { give: [['ectoplasm', 2]], get: ['phase_shard', 5] },
      { give: [['phase_shard', 12]], get: ['phaseite_crystal', 1] },
    ],
  },

  archivist: {
    name: 'Index', title: 'Archivist', accent: '#e0c89a',
    hoverHeight: 0.35,
    core: [
      B(0.56, 0.07, 0.44, 0, 0.62, 0, '#4a3a2a'),
      B(0.52, 0.07, 0.40, 0.04, 0.78, 0, '#6b5540'),
      B(0.56, 0.07, 0.44, -0.04, 0.94, 0, '#4a3a2a'),
      B(0.50, 0.07, 0.38, 0.05, 1.10, 0, '#6b5540'),
      B(0.54, 0.07, 0.42, -0.03, 1.26, 0, '#4a3a2a'),
      B(0.20, 0.20, 0.20, 0, 1.48, 0, '#e0c89a'),
      B(0.13, 0.05, 0.05, 0, 1.48, -0.12, '#ffd9a0', 1),
    ],
    rings: [
      RING({ n: 4, r: 0.62, y: 1.0, size: [0.10, 0.14, 0.03], speed: 0.35, color: '#cbb489', wSpread: 1.9, wobble: 0.3 }),
    ],
    lines: [
      'I hold every version of this hill. Two of them are lying, and I know which.',
      'Write your seed down. Hyperworlds are cheap; a good one is not.',
      'The Warden is not a monster. It is a bookmark.',
    ],
    trades: [
      { give: [['phase_shard', 3]], get: ['bookshelf', 2] },
      { give: [['fiber', 6]], get: ['phase_shard', 2] },
      { give: [['phase_shard', 5]], get: ['lantern', 2] },
    ],
  },

  trader: {
    name: 'Pedlar', title: 'Wandering Trader', accent: '#ffd08a',
    hoverHeight: 0.3, spin: 0.5,
    core: [
      B(0.40, 0.40, 0.40, 0, 0.95, 0, '#6b4a26'),
      B(0.24, 0.24, 0.30, 0.26, 1.16, 0.1, '#8a3b32'),
      B(0.22, 0.26, 0.22, -0.24, 1.08, -0.14, '#3a5f8a'),
      B(0.20, 0.20, 0.20, 0.08, 1.30, -0.22, '#7a6b2a'),
      B(0.16, 0.16, 0.16, -0.12, 1.34, 0.20, '#4a7a45'),
      B(0.16, 0.16, 0.16, 0, 1.02, 0, '#ffd08a', 0.85),
      B(0.13, 0.05, 0.04, 0, 1.06, -0.23, '#fff0c8', 1),
    ],
    rings: [
      RING({ n: 6, r: 0.7, y: 0.86, size: [0.11, 0.11, 0.11], speed: 0.8, tilt: 0.35, color: '#c9a86a', wSpread: 2.2, wobble: 0.5 }),
    ],
    lines: [
      'Everything I carry is a bargain in at least one layer. Possibly not this one.',
      'I sold a man a door once. He phased around it. No refund; the door was honest.',
      'Shards, friend. Shards make the world turn sideways.',
    ],
    trades: [
      { give: [['phase_shard', 2]], get: ['bread', 4] },
      { give: [['coal', 8]], get: ['phase_shard', 2] },
      { give: [['phase_shard', 4]], get: ['oak_planks', 24] },
    ],
  },

  farmer: {
    name: 'Cultivar', title: 'Farmer', accent: '#a8d86a',
    hoverHeight: 0.25,
    core: [
      B(0.44, 0.56, 0.44, 0, 0.9, 0, '#3f6b2a'),
      B(0.26, 0.26, 0.26, 0, 1.28, 0, '#a8d86a'),
      B(0.52, 0.06, 0.16, 0, 1.02, 0, '#5f8f3c'),
      B(0.16, 0.06, 0.52, 0, 1.02, 0, '#5f8f3c'),
      B(0.13, 0.05, 0.05, 0, 1.28, -0.15, '#f0ffb0', 1),
    ],
    rings: [
      RING({ n: 5, r: 0.66, y: 0.78, size: [0.07, 0.20, 0.07], speed: 0.5, color: '#d6c063', wSpread: 1.2 }),
      RING({ n: 3, r: 0.34, y: 1.44, size: [0.06, 0.06, 0.06], speed: -1.1, color: '#e8f0a8' }),
    ],
    lines: [
      'Grain grows in thirty of the forty-one. The other eleven I leave alone.',
      'Eat before you travel. A body between layers burns what it has.',
      'Wool from a Slate Ram sleeps you in the layer you lay down in. Mostly.',
    ],
    trades: [
      { give: [['wheat', 6]], get: ['phase_shard', 2] },
      { give: [['phase_shard', 2]], get: ['cooked_meat', 4] },
      { give: [['phase_shard', 1]], get: ['sapling_oak', 4] },
    ],
  },

  guard: {
    name: 'Bulwark', title: 'Layer Guard', accent: '#ffc46b',
    hoverHeight: 0.4, spin: 0.18,
    core: [
      B(0.78, 0.86, 0.20, 0, 1.05, -0.16, '#454b57'),
      B(0.60, 0.68, 0.14, 0, 1.05, -0.26, '#5f6773'),
      B(0.50, 0.07, 0.05, 0, 1.14, -0.35, '#ffc46b', 1),
      B(0.42, 0.42, 0.36, 0, 1.05, 0.12, '#33383f'),
      B(0.16, 0.44, 0.16, -0.44, 1.0, 0, '#3a4048'),
      B(0.16, 0.44, 0.16, 0.44, 1.0, 0, '#3a4048'),
    ],
    rings: [
      RING({ n: 4, r: 0.78, y: 1.42, size: [0.14, 0.06, 0.14], speed: 0.7, color: '#8a929e', wSpread: 0.8 }),
    ],
    lines: [
      'Stay near ORIGIN after dark and you will meet nothing worse than a Shambler.',
      'A Slicewalker cannot strike what it cannot fully see. The reverse is also true.',
      'Armour first. Curiosity second. I have buried the other order.',
    ],
    trades: [
      { give: [['phase_shard', 6]], get: ['iron_chest', 1] },
      { give: [['phase_shard', 4]], get: ['iron_helm', 1] },
      { give: [['bone', 5]], get: ['phase_shard', 2] },
    ],
  },

  hermit: {
    name: 'Recluse', title: 'Hermit', accent: '#ff7a6b',
    hoverHeight: 0.18, spin: 0.08,
    core: [
      B(0.05, 0.86, 0.05, -0.26, 1.0, -0.26, '#3a3a33'),
      B(0.05, 0.86, 0.05, 0.26, 1.0, -0.26, '#3a3a33'),
      B(0.05, 0.86, 0.05, -0.26, 1.0, 0.26, '#3a3a33'),
      B(0.05, 0.86, 0.05, 0.26, 1.0, 0.26, '#3a3a33'),
      B(0.58, 0.05, 0.58, 0, 1.43, 0, '#2f2f29'),
      B(0.58, 0.05, 0.58, 0, 0.57, 0, '#2f2f29'),
      B(0.26, 0.26, 0.26, 0, 1.0, 0, '#1a1a17'),
      B(0.11, 0.06, 0.05, 0, 1.0, -0.16, '#ff7a6b', 1),
    ],
    rings: [
      RING({ n: 2, r: 0.5, y: 1.0, size: [0.06, 0.06, 0.06], speed: 0.25, color: '#6b6a5c', wSpread: 2.6 }),
    ],
    lines: [
      'I live in KATA 14. Nobody visits. That is the amenity.',
      'Void shards remember being holes. Handle them politely.',
      'There is a Tesseract Core three hundred paces that way. In every layer. That is what makes it a landmark.',
    ],
    trades: [
      { give: [['void_shard', 1]], get: ['phase_shard', 9] },
      { give: [['phase_shard', 7]], get: ['aetherite_gem', 1] },
      { give: [['glow_shroom', 6]], get: ['phase_shard', 3] },
    ],
  },

  rift_warden: {
    name: 'Keyholder', title: 'Rift Warden', accent: '#8ef0ff',
    hoverHeight: 0.55, spin: 0.34, glow: 0.75,
    core: [
      B(0.30, 0.30, 0.30, 0, 1.1, 0, '#1f3a5a'),
      B(0.18, 0.18, 0.18, 0, 1.1, 0, '#8ef0ff', 0.95),
      B(0.08, 0.08, 0.08, 0, 1.1, 0, '#ffffff', 1),
      B(0.15, 0.05, 0.04, 0, 1.1, -0.2, '#ffffff', 1),
    ],
    rings: [
      RING({ n: 10, r: 0.6, y: 1.1, size: [0.10, 0.20, 0.06], speed: 0.55, tilt: 1.5708, color: '#8ef0ff' }),
      RING({ n: 6, r: 0.4, y: 1.1, size: [0.08, 0.12, 0.05], speed: -0.95, tilt: 0.6, color: '#c8a8ff', wSpread: 1.4 }),
    ],
    lines: [
      'Rift blocks are doors. Doors are not promises.',
      'If your compass shows two plates lit at once, stop scrolling and stand still.',
      'The outer layers are thin. Things come through where the world is thin.',
    ],
    trades: [
      { give: [['phase_shard', 10]], get: ['rift_block', 2] },
      { give: [['phaseite_crystal', 1]], get: ['phase_shard', 11] },
      { give: [['phase_shard', 14]], get: ['slice_lens', 1] },
    ],
  },

  glassblower: {
    name: 'Lensmaker', title: 'Glassblower', accent: '#c8f0f0',
    hoverHeight: 0.32,
    core: [
      B(0.66, 0.10, 0.66, 0, 1.05, 0, '#3a6b6b'),
      B(0.44, 0.16, 0.44, 0, 1.05, 0, '#7fc4c4'),
      B(0.24, 0.26, 0.24, 0, 1.05, 0, '#c8f0f0', 0.85),
      B(0.09, 0.32, 0.09, 0, 1.05, 0, '#ffffff', 1),
      B(0.14, 0.05, 0.04, 0, 1.05, -0.2, '#e8ffff', 1),
    ],
    rings: [
      RING({ n: 7, r: 0.86, y: 1.05, size: [0.13, 0.04, 0.13], speed: 0.4, color: '#a8dede', wSpread: 1.1 }),
      RING({ n: 4, r: 0.3, y: 1.34, size: [0.06, 0.06, 0.06], speed: -1.3, color: '#e8ffff' }),
    ],
    lines: [
      'Phase glass is the only honest window. It shows you somewhere you are not.',
      'Sand, fire, patience. I can sell you two of those.',
      'Never roof a house with ice. Ask me how I know; I have the time.',
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
    this.width = 0.8; this.height = 1.7;
    this.maxHealth = 30; this.health = 30;
    this.speed = 1.1;
    this.gravity = 0;                       // the Fold-Kin do not fall
    this.name = `${rng.pick(FOLD)} ${rng.pick(ROOT)}, ${rng.pick(EPITHET)}`;
    this.homeX = x; this.homeZ = z;
    this.driftTimer = 0;
    this.targetYaw = rng.float(0, Math.PI * 2);
    this.spinPhase = rng.float(0, Math.PI * 2);
    this.bobPhase = rng.float(0, Math.PI * 2);
    this.lineIndex = rng.int(0, this.def.lines.length - 1);
    this.hoverY = y;
    this.buildModel();
  }

  buildModel() {
    this.group = new THREE.Group();
    // authored around a unit core; scaled up so a Fold-Kin reads as a presence
    // rather than a trinket when you stand next to one
    this.group.scale.setScalar(1.35);
    this.materials = [];
    this.shards = [];
    const cache = new Map();
    const mat = (color, glow) => {
      const key = `${color}|${glow || 0}`;
      let m = cache.get(key);
      if (!m) {
        m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true });
        m.userData.base = new THREE.Color(color);
        m.userData.glow = glow || 0;
        cache.set(key, m);
        this.materials.push(m);
      }
      return m;
    };

    this.coreGroup = new THREE.Group();
    for (const b of this.def.core) {
      const m = new THREE.Mesh(boxGeo, mat(b.c, b.g));
      m.scale.set(b.s[0], b.s[1], b.s[2]);
      m.position.set(b.p[0], b.p[1], b.p[2]);
      this.coreGroup.add(m);
    }
    this.group.add(this.coreGroup);

    for (const ring of this.def.rings || []) {
      for (let i = 0; i < ring.n; i++) {
        const m = new THREE.Mesh(boxGeo, mat(ring.color, 0.5));
        m.scale.set(ring.size[0], ring.size[1], ring.size[2]);
        this.group.add(m);
        this.shards.push({ mesh: m, ring, i, base: (i / ring.n) * Math.PI * 2 });
      }
    }
  }

  update(dt, game) {
    this.age += dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    const player = game.player;

    // hover a fixed height above whatever ground is under them in their layer
    const w = this.slice;
    const gx = Math.floor(this.x), gz = Math.floor(this.z);
    let ground = this.world.heightAt(gx, gz, w) + 1;
    if (ground < SEA_LEVEL) ground = SEA_LEVEL + 1;
    const wantY = clamp(ground + (this.def.hoverHeight || 0.3), 1, WORLD_H - 3);
    this.y = damp(this.y, wantY, 2.2, dt);

    const near = this.distanceTo(player) < 5 && Math.abs(this.w - player.w) < NPC_W_RANGE * 0.6;
    if (near) {
      this.targetYaw = yawToward(player.x - this.x, player.z - this.z);
    } else {
      this.driftTimer -= dt;
      if (this.driftTimer <= 0) {
        this.driftTimer = 4 + Math.random() * 6;
        const dx = this.homeX - this.x, dz = this.homeZ - this.z;
        this.targetYaw = Math.hypot(dx, dz) > 9 ? yawToward(dx, dz) : Math.random() * Math.PI * 2;
        this.idle = Math.random() < 0.5;
      }
      if (!this.idle) {
        const sp = this.speed;
        this.x += -Math.sin(this.targetYaw) * sp * dt;
        this.z += -Math.cos(this.targetYaw) * sp * dt;
      }
    }
    this.yaw = damp(this.yaw, this.targetYaw, 3.5, dt);
    if (this.y < -4) this.dead = true;
  }

  render(viewW, light, dt) {
    const dRaw = Math.abs(this.w - viewW);
    const d = dRaw / NPC_W_RANGE;
    const visible = d < 1;
    this.group.visible = visible;
    if (!visible) return false;

    const t = this.age;
    this.group.position.set(this.x, this.y + Math.sin(t * 1.1 + this.bobPhase) * 0.09, this.z);
    this.group.rotation.y = this.yaw;
    this.coreGroup.rotation.y = this.spinPhase + t * (this.def.spin === undefined ? 0.28 : this.def.spin);

    // Orbiting shards drift along W as well as around the core, so parts of a
    // Fold-Kin blink out of your cross-section and back again.
    for (const sh of this.shards) {
      const r = sh.ring;
      const a = sh.base + t * r.speed;
      const rad = r.r + (r.wobble ? Math.sin(t * 0.8 + sh.i) * r.wobble * 0.2 : 0);
      let px = Math.cos(a) * rad;
      let pz = Math.sin(a) * rad;
      let py = r.y + (r.wobble ? Math.sin(t * 1.3 + sh.i * 1.7) * r.wobble : 0);
      if (r.tilt) {
        const c = Math.cos(r.tilt), s = Math.sin(r.tilt);
        const ny = py + pz * s;
        pz = pz * c;
        py = ny;
      }
      sh.mesh.position.set(px, py, pz);
      sh.mesh.rotation.set(a * 0.7, a, a * 0.4);
      if (r.wSpread) {
        const shardW = this.w + Math.sin(t * 0.55 + sh.base * 1.3) * r.wSpread;
        sh.mesh.visible = Math.abs(shardW - viewW) < NPC_W_RANGE * 0.75;
      }
    }

    const op = clamp(1.35 - d * 1.5, 0, 1);
    const hurt = this.hurtTimer > 0 ? 0.5 : 0;
    const glow = this.def.glow || 0.35;
    const l = Math.max(light, glow);
    for (const m of this.materials) {
      const b = m.userData.base;
      const k = Math.max(l, m.userData.glow);
      m.color.setRGB(clamp(b.r * k + hurt, 0, 1), b.g * k, b.b * k);
      m.opacity = op;
    }
    return true;
  }

  dispose() { for (const m of this.materials) m.dispose(); }

  greeting() { return this.def.lines[this.lineIndex % this.def.lines.length]; }
  nextLine() { this.lineIndex++; return this.greeting(); }
}
