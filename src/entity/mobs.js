// ---------------------------------------------------------------------------
// Creatures. Two families:
//   dim 3 — bound to a single hyper-layer; fully visible only from that layer.
//   dim 4 — their bodies extend along W, so from any one layer you only see the
//           cross-section that intersects you: they appear cut open.
// ---------------------------------------------------------------------------

import * as THREE from '../../vendor/three.module.js';
import { Entity } from './entity.js';
import { W_LAYERS, W_MID, WORLD_H, SEA_LEVEL } from '../world/constants.js';
import { B, IS_SOLID } from '../world/blocks.js';
import { clamp, damp } from '../core/mathx.js';

const P = (sx, sy, sz, x, y, z, color, role) => ({ s: [sx, sy, sz], p: [x, y, z], c: color, role: role || null });

export const SPECIES = {
  // ---------------- passive, 3D ----------------
  loam_hopper: {
    name: 'Loam Hopper', kind: 'passive', dim: 3, hp: 6, dmg: 0, speed: 2.6, size: [0.5, 0.6],
    drops: [['hide', 0, 1], ['raw_meat', 1, 1]],
    spawn: { light: 'any', biomes: ['plains', 'forest', 'riftwood'], layers: 'any', weight: 8 },
    model: [
      P(0.5, 0.32, 0.7, 0, 0.16, 0, '#9a7a52', 'body'),
      P(0.36, 0.3, 0.3, 0, 0.36, -0.32, '#b08c60', 'head'),
      P(0.09, 0.34, 0.1, -0.1, 0.5, -0.36, '#c2a078', 'earL'),
      P(0.09, 0.34, 0.1, 0.1, 0.5, -0.36, '#c2a078', 'earR'),
      P(0.13, 0.18, 0.18, -0.16, 0.08, 0.22, '#7d6242', 'legBL'),
      P(0.13, 0.18, 0.18, 0.16, 0.08, 0.22, '#7d6242', 'legBR'),
      P(0.12, 0.16, 0.14, -0.15, 0.07, -0.2, '#7d6242', 'legFL'),
      P(0.12, 0.16, 0.14, 0.15, 0.07, -0.2, '#7d6242', 'legFR'),
      P(0.16, 0.14, 0.14, 0, 0.28, 0.38, '#d8c6a8', 'tail'),
    ],
  },
  dust_pig: {
    name: 'Dust Hog', kind: 'passive', dim: 3, hp: 10, dmg: 0, speed: 2.2, size: [0.7, 0.8],
    drops: [['raw_meat', 1, 3], ['hide', 0, 1]],
    spawn: { light: 'any', biomes: ['plains', 'forest', 'desert', 'mesa'], layers: 'any', weight: 7 },
    model: [
      P(0.62, 0.5, 0.9, 0, 0.35, 0, '#b8836e', 'body'),
      P(0.46, 0.44, 0.4, 0, 0.42, -0.6, '#c9927c', 'head'),
      P(0.2, 0.14, 0.1, 0, 0.34, -0.82, '#e0b2a0', null),
      P(0.16, 0.3, 0.16, -0.2, 0.15, -0.28, '#8f6353', 'legFL'),
      P(0.16, 0.3, 0.16, 0.2, 0.15, -0.28, '#8f6353', 'legFR'),
      P(0.16, 0.3, 0.16, -0.2, 0.15, 0.3, '#8f6353', 'legBL'),
      P(0.16, 0.3, 0.16, 0.2, 0.15, 0.3, '#8f6353', 'legBR'),
    ],
  },
  slate_ram: {
    name: 'Slate Ram', kind: 'passive', dim: 3, hp: 14, dmg: 2, speed: 2.4, size: [0.8, 1.2],
    drops: [['hide', 1, 2], ['raw_meat', 1, 2]],
    spawn: { light: 'any', biomes: ['tundra', 'taiga', 'plains'], layers: 'any', weight: 5 },
    model: [
      P(0.72, 0.6, 1.0, 0, 0.62, 0, '#a8a49c', 'body'),
      P(0.44, 0.42, 0.44, 0, 0.86, -0.66, '#8f8b84', 'head'),
      P(0.16, 0.16, 0.3, -0.28, 0.94, -0.6, '#5f5b55', null),
      P(0.16, 0.16, 0.3, 0.28, 0.94, -0.6, '#5f5b55', null),
      P(0.18, 0.5, 0.18, -0.24, 0.25, -0.32, '#7d7a74', 'legFL'),
      P(0.18, 0.5, 0.18, 0.24, 0.25, -0.32, '#7d7a74', 'legFR'),
      P(0.18, 0.5, 0.18, -0.24, 0.25, 0.34, '#7d7a74', 'legBL'),
      P(0.18, 0.5, 0.18, 0.24, 0.25, 0.34, '#7d7a74', 'legBR'),
    ],
  },
  glimmermoth: {
    name: 'Glimmermoth', kind: 'passive', dim: 3, hp: 5, dmg: 0, speed: 2.8, size: [0.5, 0.5],
    flying: true, glow: 0.7,
    drops: [['lumen_dust', 1, 2], ['feather', 0, 1]],
    spawn: { light: 'any', biomes: ['forest', 'riftwood', 'fungal', 'crystal'], layers: 'any', weight: 5 },
    model: [
      P(0.26, 0.26, 0.46, 0, 0.25, 0, '#8a7440', 'body'),
      P(0.30, 0.06, 0.30, -0.24, 0.32, -0.05, '#c9a95e', 'wingL'),
      P(0.30, 0.06, 0.30, 0.24, 0.32, -0.05, '#c9a95e', 'wingR'),
      P(0.20, 0.05, 0.20, -0.20, 0.30, 0.18, '#e8d8a0', 'wingL'),
      P(0.20, 0.05, 0.20, 0.20, 0.30, 0.18, '#e8d8a0', 'wingR'),
      P(0.18, 0.18, 0.18, 0, 0.32, -0.28, '#a88f52', 'head'),
      P(0.03, 0.14, 0.03, -0.05, 0.44, -0.32, '#f4e8c0', null),
      P(0.03, 0.14, 0.03, 0.05, 0.44, -0.32, '#f4e8c0', null),
    ],
  },
  cave_snail: {
    name: 'Cave Snail', kind: 'passive', dim: 3, hp: 8, dmg: 0, speed: 0.8, size: [0.6, 0.6],
    drops: [['clay_ball', 1, 2], ['crystal_shard', 0, 1]],
    spawn: { light: 'dark', biomes: null, layers: 'any', underground: true, weight: 6 },
    model: [
      P(0.5, 0.2, 0.7, 0, 0.1, 0, '#8f9aa8', 'body'),
      P(0.5, 0.5, 0.5, 0, 0.42, 0.1, '#6a5a45', null),
      P(0.3, 0.26, 0.26, 0, 0.24, -0.42, '#a8b2bf', 'head'),
      P(0.04, 0.2, 0.04, -0.08, 0.44, -0.46, '#c8d2df', null),
      P(0.04, 0.2, 0.04, 0.08, 0.44, -0.46, '#c8d2df', null),
    ],
  },
  mossback_turtle: {
    name: 'Mossback', kind: 'passive', dim: 3, hp: 16, dmg: 0, speed: 1.0, size: [0.9, 0.6],
    drops: [['hide', 1, 2], ['fiber', 1, 2]],
    spawn: { light: 'any', biomes: ['beach', 'fungal', 'forest'], layers: 'any', weight: 4 },
    model: [
      P(0.9, 0.34, 1.0, 0, 0.25, 0, '#4f6b45', null),
      P(0.7, 0.2, 0.8, 0, 0.1, 0, '#8f8a70', 'body'),
      P(0.3, 0.26, 0.3, 0, 0.2, -0.6, '#6f8a5f', 'head'),
      P(0.16, 0.16, 0.24, -0.34, 0.08, -0.3, '#6f8a5f', 'legFL'),
      P(0.16, 0.16, 0.24, 0.34, 0.08, -0.3, '#6f8a5f', 'legFR'),
      P(0.16, 0.16, 0.24, -0.34, 0.08, 0.32, '#6f8a5f', 'legBL'),
      P(0.16, 0.16, 0.24, 0.34, 0.08, 0.32, '#6f8a5f', 'legBR'),
    ],
  },

  // ---------------- hostile, 3D ----------------
  shambler: {
    name: 'Clay Shambler', kind: 'hostile', dim: 3, hp: 20, dmg: 3, speed: 2.6, size: [0.6, 1.85],
    drops: [['clay_ball', 1, 3], ['fiber', 0, 1]],
    spawn: { light: 'dark', biomes: null, layers: 'any', weight: 10 },
    model: [
      P(0.55, 0.75, 0.32, 0, 0.75, 0, '#6f6357', 'body'),
      P(0.45, 0.45, 0.45, 0, 1.62, 0, '#7d7064', 'head'),
      P(0.08, 0.08, 0.02, -0.11, 1.68, -0.24, '#d84f3f', null),
      P(0.08, 0.08, 0.02, 0.11, 1.68, -0.24, '#d84f3f', null),
      P(0.18, 0.7, 0.18, -0.37, 1.05, 0, '#5f5449', 'armL'),
      P(0.18, 0.7, 0.18, 0.37, 1.05, 0, '#5f5449', 'armR'),
      P(0.2, 0.75, 0.2, -0.14, 0.37, 0, '#544a40', 'legL'),
      P(0.2, 0.75, 0.2, 0.14, 0.37, 0, '#544a40', 'legR'),
    ],
  },
  cinder_wretch: {
    name: 'Cinder Wretch', kind: 'hostile', dim: 3, hp: 16, dmg: 4, speed: 3.2, size: [0.6, 1.6],
    glow: 0.8, drops: [['coal', 1, 2], ['charcoal', 0, 1]],
    spawn: { light: 'dark', biomes: ['ashlands', 'mesa', 'desert'], layers: 'any', weight: 7 },
    model: [
      P(0.5, 0.7, 0.3, 0, 0.65, 0, '#4a2118', 'body'),
      P(0.42, 0.42, 0.42, 0, 1.4, 0, '#6b2c18', 'head'),
      P(0.1, 0.1, 0.02, -0.1, 1.46, -0.22, '#ffb04f', null),
      P(0.1, 0.1, 0.02, 0.1, 1.46, -0.22, '#ffb04f', null),
      P(0.16, 0.6, 0.16, -0.33, 0.9, 0, '#8f3a1c', 'armL'),
      P(0.16, 0.6, 0.16, 0.33, 0.9, 0, '#8f3a1c', 'armR'),
      P(0.18, 0.62, 0.18, -0.12, 0.31, 0, '#3a1a12', 'legL'),
      P(0.18, 0.62, 0.18, 0.12, 0.31, 0, '#3a1a12', 'legR'),
    ],
  },
  stone_lurker: {
    name: 'Stone Lurker', kind: 'hostile', dim: 3, hp: 24, dmg: 5, speed: 2.2, size: [0.8, 1.4],
    drops: [['cobblestone', 1, 3], ['flint', 0, 2]],
    spawn: { light: 'dark', biomes: null, layers: 'any', underground: true, weight: 8 },
    model: [
      P(0.8, 0.6, 0.6, 0, 0.7, 0, '#5f6068', 'body'),
      P(0.5, 0.4, 0.45, 0, 1.2, -0.15, '#727480', 'head'),
      P(0.09, 0.09, 0.02, -0.13, 1.26, -0.38, '#8ef0ff', null),
      P(0.09, 0.09, 0.02, 0.13, 1.26, -0.38, '#8ef0ff', null),
      P(0.22, 0.45, 0.22, -0.3, 0.22, -0.2, '#4a4b52', 'legFL'),
      P(0.22, 0.45, 0.22, 0.3, 0.22, -0.2, '#4a4b52', 'legFR'),
      P(0.22, 0.45, 0.22, -0.3, 0.22, 0.24, '#4a4b52', 'legBL'),
      P(0.22, 0.45, 0.22, 0.3, 0.22, 0.24, '#4a4b52', 'legBR'),
    ],
  },
  bonepicker: {
    name: 'Bonepicker', kind: 'hostile', dim: 3, hp: 14, dmg: 3, speed: 3.0, size: [0.55, 1.8],
    drops: [['bone', 1, 2], ['feather', 0, 1]],
    spawn: { light: 'dark', biomes: null, layers: 'any', weight: 9 },
    model: [
      P(0.4, 0.7, 0.22, 0, 0.75, 0, '#d8d2c0', 'body'),
      P(0.4, 0.4, 0.4, 0, 1.6, 0, '#e8e2d0', 'head'),
      P(0.09, 0.07, 0.02, -0.1, 1.66, -0.21, '#222', null),
      P(0.09, 0.07, 0.02, 0.1, 1.66, -0.21, '#222', null),
      P(0.11, 0.68, 0.11, -0.3, 1.05, 0, '#cfc8b6', 'armL'),
      P(0.11, 0.68, 0.11, 0.3, 1.05, 0, '#cfc8b6', 'armR'),
      P(0.12, 0.72, 0.12, -0.12, 0.36, 0, '#c2bba8', 'legL'),
      P(0.12, 0.72, 0.12, 0.12, 0.36, 0, '#c2bba8', 'legR'),
    ],
  },
  ash_crawler: {
    name: 'Ash Crawler', kind: 'hostile', dim: 3, hp: 12, dmg: 2, speed: 3.6, size: [0.9, 0.7],
    drops: [['fiber', 1, 2]],
    spawn: { light: 'dark', biomes: null, layers: 'any', underground: true, weight: 8 },
    model: [
      P(0.7, 0.34, 0.8, 0, 0.3, 0, '#3a3038', 'body'),
      P(0.36, 0.3, 0.3, 0, 0.34, -0.5, '#4a3d46', 'head'),
      P(0.07, 0.07, 0.02, -0.09, 0.4, -0.66, '#ff6a4f', null),
      P(0.07, 0.07, 0.02, 0.09, 0.4, -0.66, '#ff6a4f', null),
      P(0.5, 0.08, 0.08, -0.42, 0.2, -0.24, '#2a232a', 'legFL'),
      P(0.5, 0.08, 0.08, 0.42, 0.2, -0.24, '#2a232a', 'legFR'),
      P(0.5, 0.08, 0.08, -0.42, 0.2, 0.26, '#2a232a', 'legBL'),
      P(0.5, 0.08, 0.08, 0.42, 0.2, 0.26, '#2a232a', 'legBR'),
    ],
  },

  // ---------------- hyper-dimensional ----------------
  tesser_wraith: {
    name: 'Tesser Wraith', kind: 'hostile', dim: 4, hyper: 1.6, hp: 22, dmg: 5, speed: 2.6, size: [0.7, 2.2],
    glow: 0.6, drops: [['ectoplasm', 1, 2], ['phase_shard', 0, 1]],
    spawn: { light: 'dark', biomes: null, layers: 'any', weight: 7 },
    model: [
      P(0.5, 1.0, 0.3, 0, 1.0, 0, '#2f3f6b', 'body'),
      P(0.42, 0.42, 0.42, 0, 1.95, 0, '#4f5f9c', 'head'),
      P(0.1, 0.1, 0.02, -0.1, 2.0, -0.22, '#a8f4ff', null),
      P(0.1, 0.1, 0.02, 0.1, 2.0, -0.22, '#a8f4ff', null),
      P(0.14, 0.9, 0.14, -0.34, 1.3, 0, '#3a4b7d', 'armL'),
      P(0.14, 0.9, 0.14, 0.34, 1.3, 0, '#3a4b7d', 'armR'),
      P(0.5, 0.5, 0.3, 0, 0.3, 0, '#24305a', null),
    ],
  },
  slicewalker: {
    name: 'Slicewalker', kind: 'hostile', dim: 4, hyper: 1.1, hp: 18, dmg: 4, speed: 3.4, size: [0.55, 1.9],
    glow: 0.5, drops: [['ectoplasm', 1, 1], ['phase_shard', 1, 2]],
    spawn: { light: 'any', biomes: null, layers: 'outer', weight: 8 },
    model: [
      P(0.36, 0.8, 0.24, 0, 0.85, 0, '#5a3f8a', 'body'),
      P(0.34, 0.34, 0.34, 0, 1.68, 0, '#7a5ab0', 'head'),
      P(0.24, 0.05, 0.05, 0, 1.74, -0.2, '#ffd4a8', null),
      P(0.1, 0.85, 0.1, -0.26, 1.1, 0, '#6b4a9c', 'armL'),
      P(0.1, 0.85, 0.1, 0.26, 1.1, 0, '#6b4a9c', 'armR'),
      P(0.11, 0.9, 0.11, -0.11, 0.44, 0, '#4a3378', 'legL'),
      P(0.11, 0.9, 0.11, 0.11, 0.44, 0, '#4a3378', 'legR'),
    ],
  },
  hyperspider: {
    name: 'Hyperspider', kind: 'hostile', dim: 4, hyper: 1.9, hp: 16, dmg: 3, speed: 4.0, size: [1.1, 0.9],
    drops: [['fiber', 1, 3], ['ectoplasm', 0, 1]],
    spawn: { light: 'dark', biomes: null, layers: 'any', weight: 7 },
    model: [
      P(0.7, 0.45, 0.85, 0, 0.4, 0, '#2c2438', 'body'),
      P(0.42, 0.36, 0.36, 0, 0.44, -0.6, '#3d3350', 'head'),
      P(0.08, 0.08, 0.02, -0.11, 0.5, -0.78, '#ff4f8a', null),
      P(0.08, 0.08, 0.02, 0.11, 0.5, -0.78, '#ff4f8a', null),
      P(0.9, 0.07, 0.07, -0.6, 0.32, -0.3, '#1f1a2a', 'legFL'),
      P(0.9, 0.07, 0.07, 0.6, 0.32, -0.3, '#1f1a2a', 'legFR'),
      P(0.9, 0.07, 0.07, -0.6, 0.32, 0.0, '#1f1a2a', 'legBL'),
      P(0.9, 0.07, 0.07, 0.6, 0.32, 0.0, '#1f1a2a', 'legBR'),
      P(0.8, 0.07, 0.07, -0.55, 0.28, 0.34, '#1f1a2a', 'legFL'),
      P(0.8, 0.07, 0.07, 0.55, 0.28, 0.34, '#1f1a2a', 'legFR'),
    ],
  },
  rift_stalker: {
    name: 'Rift Stalker', kind: 'hostile', dim: 4, hyper: 1.3, hp: 26, dmg: 6, speed: 4.4, size: [0.7, 2.0],
    glow: 0.9, phaseHunter: true,
    drops: [['phaseite_crystal', 0, 1], ['ectoplasm', 1, 2]],
    spawn: { light: 'any', biomes: null, layers: 'outer', weight: 5 },
    model: [
      P(0.5, 0.85, 0.35, 0, 0.9, 0, '#6b1d4a', 'body'),
      P(0.4, 0.38, 0.5, 0, 1.6, -0.12, '#932d63', 'head'),
      P(0.09, 0.12, 0.02, -0.11, 1.66, -0.38, '#ffe14f', null),
      P(0.09, 0.12, 0.02, 0.11, 1.66, -0.38, '#ffe14f', null),
      P(0.14, 0.8, 0.14, -0.32, 1.15, 0, '#7d2352', 'armL'),
      P(0.14, 0.8, 0.14, 0.32, 1.15, 0, '#7d2352', 'armR'),
      P(0.16, 0.9, 0.16, -0.13, 0.45, 0, '#4f1436', 'legL'),
      P(0.16, 0.9, 0.16, 0.13, 0.45, 0, '#4f1436', 'legR'),
      P(0.12, 0.12, 0.6, 0, 1.1, 0.42, '#a8397a', 'tail'),
    ],
  },
  fold_serpent: {
    name: 'Fold Serpent', kind: 'hostile', dim: 4, hyper: 2.2, hp: 20, dmg: 4, speed: 3.0, size: [0.8, 0.8],
    drops: [['hide', 1, 2], ['ectoplasm', 1, 1]],
    spawn: { light: 'any', biomes: ['crystal', 'ashlands', 'fungal'], layers: 'outer', weight: 5 },
    model: [
      P(0.42, 0.42, 0.5, 0, 0.4, -0.7, '#2f6b5a', 'head'),
      P(0.07, 0.07, 0.02, -0.11, 0.46, -0.92, '#ffe14f', null),
      P(0.07, 0.07, 0.02, 0.11, 0.46, -0.92, '#ffe14f', null),
      P(0.38, 0.38, 0.5, 0, 0.38, -0.2, '#357a66', 'seg1'),
      P(0.34, 0.34, 0.5, 0, 0.36, 0.28, '#2f6b5a', 'seg2'),
      P(0.28, 0.28, 0.5, 0, 0.34, 0.74, '#275c4c', 'seg3'),
      P(0.2, 0.2, 0.4, 0, 0.32, 1.12, '#1f4d40', 'tail'),
    ],
  },
  echo: {
    name: 'Echo', kind: 'hostile', dim: 4, hyper: 0.8, hp: 8, dmg: 2, speed: 4.6, size: [0.45, 1.2],
    glow: 0.8, drops: [['phase_shard', 1, 2]],
    spawn: { light: 'any', biomes: null, layers: 'any', weight: 6 },
    model: [
      P(0.32, 0.5, 0.2, 0, 0.5, 0, '#8ecfe8', 'body'),
      P(0.3, 0.3, 0.3, 0, 1.0, 0, '#b6e8f8', 'head'),
      P(0.08, 0.08, 0.02, -0.08, 1.04, -0.16, '#1a3a4a', null),
      P(0.08, 0.08, 0.02, 0.08, 1.04, -0.16, '#1a3a4a', null),
      P(0.09, 0.45, 0.09, -0.1, 0.22, 0, '#6fb2cc', 'legL'),
      P(0.09, 0.45, 0.09, 0.1, 0.22, 0, '#6fb2cc', 'legR'),
    ],
  },

  // ---------------- neutral ----------------
  warden_of_layers: {
    name: 'Warden of Layers', kind: 'neutral', dim: 4, hyper: 9, hp: 90, dmg: 9, speed: 1.8, size: [1.4, 3.2],
    glow: 1.0, anchored: true, rare: true,
    drops: [['phaseite_crystal', 2, 3], ['aetherite_gem', 1, 2], ['ectoplasm', 2, 4]],
    spawn: { light: 'any', biomes: null, layers: 'any', weight: 1 },
    model: [
      P(1.0, 1.4, 0.6, 0, 1.5, 0, '#1f2a4a', 'body'),
      P(0.7, 0.7, 0.7, 0, 2.6, 0, '#2f3f6b', 'head'),
      P(0.5, 0.12, 0.12, 0, 2.7, -0.34, '#ffd47a', null),
      P(0.26, 1.3, 0.26, -0.66, 1.7, 0, '#28345a', 'armL'),
      P(0.26, 1.3, 0.26, 0.66, 1.7, 0, '#28345a', 'armR'),
      P(0.3, 0.9, 0.3, -0.24, 0.45, 0, '#18213a', 'legL'),
      P(0.3, 0.9, 0.3, 0.24, 0.45, 0, '#18213a', 'legR'),
      P(0.24, 0.24, 0.24, 0, 3.2, 0, '#8ef0ff', null),
    ],
  },
};

export const SPECIES_KEYS = Object.keys(SPECIES);

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cutGeo = new THREE.PlaneGeometry(1, 1);

export class Mob extends Entity {
  constructor(world, key, x, y, z, w) {
    super(world, x, y, z, w);
    const s = SPECIES[key];
    this.key = key;
    this.def = s;
    this.width = s.size[0];
    this.height = s.size[1];
    this.maxHealth = s.hp;
    this.health = s.hp;
    this.speed = s.speed;
    this.flying = !!s.flying;
    this.hyperExtent = s.hyper || 0;
    this.wanderTimer = 0;
    this.targetYaw = Math.random() * Math.PI * 2;
    this.attackCd = 0;
    this.walkPhase = 0;
    this.moving = 0;
    this.anchorW = w;
    this.phaseCd = 0;
    if (s.dim === 4) this.w = w + (Math.random() - 0.5) * 0.8;
    this.buildModel();
  }

  buildModel() {
    this.group = new THREE.Group();
    this.parts = [];
    this.materials = [];
    const matCache = new Map();
    for (const part of this.def.model) {
      let mat = matCache.get(part.c);
      if (!mat) {
        mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(part.c), transparent: true, opacity: 1 });
        mat.userData.base = new THREE.Color(part.c);
        matCache.set(part.c, mat);
        this.materials.push(mat);
      }
      const m = new THREE.Mesh(boxGeo, mat);
      m.scale.set(part.s[0], part.s[1], part.s[2]);
      m.position.set(part.p[0], part.p[1], part.p[2]);
      m.userData.rest = m.position.clone();
      m.userData.role = part.role;
      this.group.add(m);
      this.parts.push(m);
    }
    if (this.def.dim === 4) {
      this.clipPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
      for (const m of this.materials) { m.clippingPlanes = [this.clipPlane]; m.clipShadows = false; }
      const cm = new THREE.MeshBasicMaterial({
        color: 0x9ff0ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      this.cutMesh = new THREE.Mesh(cutGeo, cm);
      this.cutMesh.scale.set(this.width * 1.6, this.height, 1);
      this.group.add(this.cutMesh);
    }
  }

  update(dt, game) {
    this.age += dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.phaseCd > 0) this.phaseCd -= dt;
    this.sampleEnvironment();

    const player = game.player;
    const dist = this.distanceTo(player);
    const dw = Math.abs(this.w - player.w);
    const sameSlice = this.def.dim === 4 ? dw < (this.hyperExtent + 0.4) : Math.round(this.w) === player.slice;
    const s = this.def;

    let wantX = 0, wantZ = 0;
    const hostile = s.kind === 'hostile';
    const aggro = hostile && sameSlice && dist < 22 && !player.dead && player.gameMode !== 'creative';

    if (aggro) {
      const a = Math.atan2(player.x - this.x, player.z - this.z);
      this.targetYaw = a;
      wantX = Math.sin(a); wantZ = Math.cos(a);
      if (dist < 1.5 && this.attackCd <= 0 && Math.abs(player.y - this.y) < 2.2) {
        game.hurtPlayer(s.dmg, this);
        this.attackCd = 1.1;
      }
      // hyper-predators cut the corner through the fourth dimension
      if (s.phaseHunter && this.phaseCd <= 0 && dist > 5) {
        this.wTarget = player.w + (Math.random() < 0.5 ? -1 : 1) * 0.9;
        this.phaseCd = 3.5;
      }
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 2 + Math.random() * 4;
        this.targetYaw = Math.random() * Math.PI * 2;
        this.idle = Math.random() < 0.35;
      }
      if (!this.idle) { wantX = Math.sin(this.targetYaw); wantZ = Math.cos(this.targetYaw); }
      if (s.kind === 'passive' && this.hurtTimer > 0 && dist < 12) {
        const a = Math.atan2(this.x - player.x, this.z - player.z);
        wantX = Math.sin(a); wantZ = Math.cos(a);
      }
    }

    // hyper drift
    if (s.dim === 4 && !s.anchored) {
      if (this.wTarget === undefined || Math.random() < dt * 0.15) {
        this.wTarget = clamp(this.anchorW + (Math.random() - 0.5) * 2.4, 0, W_LAYERS - 1);
      }
      this.w = damp(this.w, clamp(this.wTarget, 0, W_LAYERS - 1), 1.2, dt);
    }

    const sp = this.speed * (aggro ? 1.25 : 0.55);
    const accel = this.onGround || this.flying ? 12 : 3;
    this.vx = damp(this.vx, wantX * sp, accel, dt);
    this.vz = damp(this.vz, wantZ * sp, accel, dt);

    if (this.flying) {
      const targetY = this.world.heightAt(Math.floor(this.x), Math.floor(this.z), this.slice) + 2.5 + Math.sin(this.age * 1.7) * 1.2;
      this.vy = damp(this.vy, clamp(targetY - this.y, -2.5, 2.5), 2.5, dt);
    } else {
      this.applyGravity(dt);
      // hop over obstacles
      if (this.onGround && (Math.abs(this.vx) > 0.1 || Math.abs(this.vz) > 0.1)) {
        const ax = Math.floor(this.x + Math.sign(this.vx) * 0.55);
        const az = Math.floor(this.z + Math.sign(this.vz) * 0.55);
        if (IS_SOLID[this.world.getBlockGen(ax, Math.floor(this.y), az, this.slice)] &&
            !IS_SOLID[this.world.getBlockGen(ax, Math.floor(this.y) + 1, az, this.slice)]) {
          this.vy = 7.6;
        }
      }
      if (this.inWater) this.vy = Math.max(this.vy, 1.6);
    }

    this.moveBy(this.vx * dt, this.vy * dt, this.vz * dt);
    this.yaw = damp(this.yaw, this.targetYaw, 6, dt);
    this.moving = Math.min(1, Math.hypot(this.vx, this.vz) / Math.max(0.4, this.speed));
    this.walkPhase += dt * (4 + this.moving * 9);

    if (this.inLava) this.damage(3 * dt * 4, 'lava');
    if (this.y < -4) this.dead = true;
    if (dist > 96 && !this.def.rare) this.dead = true;
  }

  animate(dt) {
    const swing = Math.sin(this.walkPhase) * 0.5 * this.moving;
    const swing2 = Math.sin(this.walkPhase + Math.PI) * 0.5 * this.moving;
    for (const m of this.parts) {
      const role = m.userData.role;
      if (!role) continue;
      m.rotation.set(0, 0, 0);
      if (role === 'legL' || role === 'legFL' || role === 'legBR' || role === 'armR') m.rotation.x = swing;
      else if (role === 'legR' || role === 'legFR' || role === 'legBL' || role === 'armL') m.rotation.x = swing2;
      else if (role === 'wingL') m.rotation.z = Math.sin(this.age * 22) * 0.7;
      else if (role === 'wingR') m.rotation.z = -Math.sin(this.age * 22) * 0.7;
      else if (role === 'head') m.rotation.y = Math.sin(this.age * 0.8) * 0.25;
      else if (role === 'tail') m.rotation.y = Math.sin(this.walkPhase * 0.5) * 0.4;
      else if (role && role.startsWith('seg')) m.position.x = m.userData.rest.x + Math.sin(this.walkPhase * 0.7 - Number(role.slice(3))) * 0.16;
    }
  }

  /** Positioning + the 4D cross-section clip. Returns false if not visible. */
  render(viewW, light, dt) {
    this.animate(dt);
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;

    const d = this.w - viewW;
    let opacity = 1, visible = true, frac = 1;
    if (this.def.dim === 4) {
      const e = this.hyperExtent;
      frac = 1 - Math.min(1, Math.abs(d) / e);
      visible = frac > 0.02;
      opacity = 0.55 + frac * 0.45;
    } else {
      const a = Math.abs(d);
      visible = a < 0.98;
      opacity = clamp(1.25 - a * 1.6, 0, 1);
    }
    this.group.visible = visible;
    if (!visible) return false;

    const hurt = this.hurtTimer > 0 ? 1 : 0;
    const glow = this.def.glow || 0;
    const l = Math.max(light, glow);
    for (const m of this.materials) {
      const b = m.userData.base;
      m.color.setRGB(
        clamp(b.r * l + hurt * 0.55, 0, 1),
        clamp(b.g * l * (1 - hurt * 0.5), 0, 1),
        clamp(b.b * l * (1 - hurt * 0.5), 0, 1),
      );
      m.opacity = opacity;
    }

    if (this.clipPlane) {
      // Keep a slab of the body whose thickness is the visible fraction. The
      // rest of the creature is simply not in this hyper-layer.
      const half = this.width * 1.35;
      const centre = -d / Math.max(0.001, this.hyperExtent) * half * 0.85;
      const keep = Math.max(0.06, frac) * half;
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const origin = new THREE.Vector3(this.x, this.y, this.z).addScaledVector(right, centre);
      this.clipPlane.normal.copy(right);
      this.clipPlane.constant = -right.dot(origin) + keep;
      this.clipPlane2 = this.clipPlane2 || new THREE.Plane();
      this.clipPlane2.normal.copy(right).negate();
      this.clipPlane2.constant = right.dot(origin) + keep;
      for (const m of this.materials) m.clippingPlanes = [this.clipPlane, this.clipPlane2];
      if (this.cutMesh) {
        this.cutMesh.visible = frac < 0.985;
        this.cutMesh.position.set(centre + keep * Math.sign(d || 1) * 0, this.height * 0.5, 0);
        this.cutMesh.rotation.y = Math.PI / 2;
        this.cutMesh.scale.set(this.width * 1.5, this.height, 1);
        this.cutMesh.material.opacity = (1 - frac) * 0.5 + 0.12;
      }
    }
    return true;
  }

  dispose() {
    for (const m of this.materials) m.dispose();
    if (this.cutMesh) this.cutMesh.material.dispose();
  }

  rollDrops(rng = Math.random) {
    const out = [];
    for (const [item, min, max] of this.def.drops) {
      const n = min + Math.floor(rng() * (max - min + 1));
      if (n > 0) out.push({ item, count: n });
    }
    return out;
  }
}
