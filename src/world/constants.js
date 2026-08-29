export const CX = 16;          // chunk size in x
export const CZ = 16;          // chunk size in z
export const WORLD_H = 80;     // world height
export const W_LAYERS = 7;     // hyper-layers (the fourth dimension)
export const W_MID = (W_LAYERS - 1) >> 1;
export const SEA_LEVEL = 30;
export const CHUNK_VOL = CX * CZ * WORLD_H;
export const HYPER_VOL = CHUNK_VOL * W_LAYERS;

/** column-major within a slice: neighbouring y values are adjacent in memory */
export const idx = (lx, y, lz, w) => w * CHUNK_VOL + (lx * CZ + lz) * WORLD_H + y;
export const sliceOffset = (w) => w * CHUNK_VOL;
export const colOffset = (lx, lz) => (lx * CZ + lz) * WORLD_H;

export const chunkKey = (cx, cz) => `${cx},${cz}`;
export const blockKey = (x, y, z, w) => `${x},${y},${z},${w}`;

/** Names used by the Slice Compass and the telemetry panel. */
export const LAYER_NAMES = [
  'KATA III', 'KATA II', 'KATA I', 'ORIGIN', 'ANA I', 'ANA II', 'ANA III',
];

/** Per-layer light/atmosphere identity — the player navigates W by colour. */
export const LAYER_TINT = [
  [0.72, 0.78, 1.00],
  [0.80, 0.86, 1.00],
  [0.92, 0.95, 1.00],
  [1.00, 1.00, 1.00],
  [1.05, 0.98, 0.92],
  [1.08, 0.92, 0.86],
  [1.10, 0.84, 0.86],
];

export const LAYER_SKY = [
  '#2a3a6e', '#3a5590', '#5f86b8', '#7fb2e0', '#96b4c8', '#b09a94', '#b58897',
];
export const LAYER_FOG = [
  '#3a4a7a', '#49659c', '#6d92c0', '#9ec8e8', '#b3c4cc', '#c0aaa2', '#c294a0',
];
