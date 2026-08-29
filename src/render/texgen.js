// ---------------------------------------------------------------------------
// Procedural 16x16 pixel-art texture generator.
//
// DOM-free on purpose: it emits raw RGBA byte arrays so the same code can be
// unit-tested / contact-sheeted in Node, and so the game needs zero image
// assets. The art direction targets late-Minecraft-Beta: tiny muted palettes,
// heavy per-pixel dither, hand-placed structure, nothing anti-aliased.
// ---------------------------------------------------------------------------

import { mulberry32, hashSeed } from '../core/rng.js';

export const TS = 16; // tile size

// --- colour helpers --------------------------------------------------------
export function hex(h) {
  h = h.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const mulc = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Build a dark→light ramp of `n` shades around a base colour. */
export function ramp(baseHex, n = 4, lo = 0.62, hi = 1.22) {
  const b = hex(baseHex);
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = lo + (hi - lo) * (i / (n - 1));
    out.push([
      Math.min(255, b[0] * f), Math.min(255, b[1] * f), Math.min(255, b[2] * f),
    ]);
  }
  return out;
}

/** Ramp that also drifts hue slightly toward `tintHex` in the highlights. */
export function ramp2(darkHex, lightHex, n = 4) {
  const a = hex(darkHex), b = hex(lightHex);
  const out = [];
  for (let i = 0; i < n; i++) out.push(mixc(a, b, i / (n - 1)));
  return out;
}

// --- tile ------------------------------------------------------------------
export class Tile {
  constructor(seed) {
    this.data = new Uint8ClampedArray(TS * TS * 4);
    this.rng = mulberry32(hashSeed(seed));
  }
  px(x, y, c, a = 255) {
    x = ((x % TS) + TS) % TS; y = ((y % TS) + TS) % TS;
    const i = (y * TS + x) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = a;
  }
  get(x, y) {
    x = ((x % TS) + TS) % TS; y = ((y % TS) + TS) % TS;
    const i = (y * TS + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  alphaAt(x, y) { return this.data[((y * TS + x) * 4) + 3]; }
  fill(c, a = 255) { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) this.px(x, y, c, a); }
  clear() { this.data.fill(0); }
  rect(x, y, w, h, c, a = 255) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, c, a);
  }
  /** Multiply an existing region (keeps dither, changes value). */
  shadeRect(x, y, w, h, f) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      const p = this.get(i, j);
      if (p[3] === 0) continue;
      this.px(i, j, [p[0] * f, p[1] * f, p[2] * f], p[3]);
    }
  }
  hline(x0, x1, y, c, a = 255) { for (let x = x0; x <= x1; x++) this.px(x, y, c, a); }
  vline(x, y0, y1, c, a = 255) { for (let y = y0; y <= y1; y++) this.px(x, y, c, a); }
}

/** Seamless (wrapping) value-noise sampler on a `cells`×`cells` lattice. */
export function makeNoise(rng, cells) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const sc = cells / TS;
  return (x, y) => {
    const fx = x * sc, fy = y * sc;
    const x0 = Math.floor(fx) % cells, y0 = Math.floor(fy) % cells;
    const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
    const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
    const a = g[y0 * cells + x0], b = g[y0 * cells + x1];
    const c = g[y1 * cells + x0], d = g[y1 * cells + x1];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

/**
 * The workhorse. Lays down a quantised, dithered field of `shades` — this one
 * function is responsible for the family resemblance across the whole set.
 */
export function grain(t, shades, opts = {}) {
  const { cells = 8, fine = 0.42, contrast = 1, bias = 0, alpha = 255, mask = null } = opts;
  const coarse = makeNoise(t.rng, cells);
  const detail = makeNoise(t.rng, TS);
  const n = shades.length;
  for (let y = 0; y < TS; y++) {
    for (let x = 0; x < TS; x++) {
      if (mask && !mask(x, y)) continue;
      let v = coarse(x, y) * (1 - fine) + detail(x, y) * fine;
      v = (v - 0.5) * contrast + 0.5 + bias;
      let i = Math.floor(v * n);
      if (i < 0) i = 0; if (i >= n) i = n - 1;
      t.px(x, y, shades[i], alpha);
    }
  }
}

/** Sprinkle isolated pixels/blobs — ore flecks, moss, snow crust. */
export function speckle(t, shades, count, opts = {}) {
  const { size = 1, alpha = 255, mask = null } = opts;
  for (let k = 0; k < count; k++) {
    const x = Math.floor(t.rng() * TS), y = Math.floor(t.rng() * TS);
    const c = shades[Math.floor(t.rng() * shades.length)];
    const s = typeof size === 'function' ? size(t.rng) : size;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      if (mask && !mask(x + i, y + j)) continue;
      t.px(x + i, y + j, c, alpha);
    }
  }
}

/** Irregular blob used for cobble stones, ore pockets and crystal facets. */
export function blob(t, cx, cy, r, shades, opts = {}) {
  const { alpha = 255, wobble = 0.35 } = opts;
  const off = t.rng() * 6.283;
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx);
      const rr = r * (1 + Math.sin(ang * 3 + off) * wobble * 0.5 + Math.sin(ang * 5 - off) * wobble * 0.3);
      if (d <= rr) {
        // shade by distance from centre for a rounded look
        const f = 1 - d / Math.max(0.001, rr);
        const i = Math.min(shades.length - 1, Math.floor(f * shades.length * 0.9 + t.rng() * 0.9));
        t.px(x, y, shades[i], alpha);
      }
    }
  }
}

/** Outline every opaque pixel that borders transparency (sprite readability). */
export function outline(t, c, a = 255) {
  const copy = t.data.slice();
  const at = (x, y) => (x < 0 || y < 0 || x >= TS || y >= TS) ? 0 : copy[(y * TS + x) * 4 + 3];
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if (at(x, y) !== 0) continue;
    if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) t.px(x, y, c, a);
  }
}

/** Darken the bottom / lighten the top of opaque pixels — cheap volume. */
export function vshade(t, top = 1.14, bottom = 0.8) {
  for (let y = 0; y < TS; y++) {
    const f = top + (bottom - top) * (y / (TS - 1));
    for (let x = 0; x < TS; x++) {
      const p = t.get(x, y);
      if (p[3] === 0) continue;
      t.px(x, y, [p[0] * f, p[1] * f, p[2] * f], p[3]);
    }
  }
}

export { mulc, mixc };
