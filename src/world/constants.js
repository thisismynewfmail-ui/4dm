export const CX = 16;          // chunk size in x
export const CZ = 16;          // chunk size in z
export const WORLD_H = 80;     // world height

/**
 * The fourth axis.
 *
 * W is fine-grained on purpose: travel along it has to read as the terrain
 * *flowing*, not as a slideshow of unrelated worlds. Many closely spaced
 * layers mean each step changes only a thin band of blocks, so scrolling
 * through them looks continuous — the same reason a flipbook works.
 */
export const W_LAYERS = 41;
export const W_MID = 20;
/** Noise distance between adjacent hyper-layers. Small = smooth travel. */
export const W_STEP = 0.09;

export const SEA_LEVEL = 30;
export const SLICE_VOL = CX * CZ * WORLD_H;

/** column-major within a slice: neighbouring y values are adjacent in memory */
export const colOffset = (lx, lz) => (lx * CZ + lz) * WORLD_H;
export const sIdx = (lx, y, lz) => (lx * CZ + lz) * WORLD_H + y;

export const chunkKey = (cx, cz) => `${cx},${cz}`;
export const blockKey = (x, y, z, w) => `${x},${y},${z},${w}`;

// ---------------------------------------------------------------------------
// Naming and atmosphere. With 41 layers these are functions of W rather than
// tables, and they read continuously so a fractional W still has a colour.
// ---------------------------------------------------------------------------

export function layerName(w) {
  const d = Math.round(w) - W_MID;
  if (d === 0) return 'ORIGIN';
  return `${d > 0 ? 'ANA' : 'KATA'} ${Math.abs(d)}`;
}
export function layerShort(w) {
  const d = Math.round(w) - W_MID;
  return d === 0 ? '0' : (d > 0 ? '+' : '−') + Math.abs(d);
}

/** Control points across the W range, interpolated for any real w. */
const SKY_STOPS = [
  [0.00, '#1e1740', '#332a63'],   // KATA 20 — deep indigo, almost night
  [0.18, '#2a4a8e', '#4a6aa0'],
  [0.36, '#3f7fd0', '#86b4dc'],
  [0.50, '#4a90e0', '#9ec8e8'],   // ORIGIN — the sky you start under
  [0.64, '#3f9fa8', '#9fccc6'],
  [0.82, '#b8823f', '#dcb684'],
  [1.00, '#8e2f4a', '#c06b78'],   // ANA 20 — a deep rose evening that never ends
];

function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
const STOPS = SKY_STOPS.map(([t, a, b]) => [t, hexToRgb(a), hexToRgb(b)]);

/** @returns {{sky:number[], fog:number[]}} 0..1 rgb triples for a real-valued w */
export function layerAtmosphere(w) {
  const t = Math.max(0, Math.min(1, w / (W_LAYERS - 1)));
  let i = 0;
  while (i < STOPS.length - 2 && t > STOPS[i + 1][0]) i++;
  const [t0, s0, f0] = STOPS[i];
  const [t1, s1, f1] = STOPS[i + 1];
  const k = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
  const mix = (a, b) => [
    (a[0] + (b[0] - a[0]) * k) / 255,
    (a[1] + (b[1] - a[1]) * k) / 255,
    (a[2] + (b[2] - a[2]) * k) / 255,
  ];
  return { sky: mix(s0, s1), fog: mix(f0, f1) };
}
