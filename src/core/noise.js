// 4D gradient (Perlin-style) noise plus fBm helpers.
// Everything is deterministic from a uint32 seed.

import { smootherstep } from './mathx.js';

const GRAD4 = new Int8Array([
  0, 1, 1, 1,  0, 1, 1, -1,  0, 1, -1, 1,  0, 1, -1, -1,
  0, -1, 1, 1,  0, -1, 1, -1,  0, -1, -1, 1,  0, -1, -1, -1,
  1, 0, 1, 1,  1, 0, 1, -1,  1, 0, -1, 1,  1, 0, -1, -1,
  -1, 0, 1, 1,  -1, 0, 1, -1,  -1, 0, -1, 1,  -1, 0, -1, -1,
  1, 1, 0, 1,  1, 1, 0, -1,  1, -1, 0, 1,  1, -1, 0, -1,
  -1, 1, 0, 1,  -1, 1, 0, -1,  -1, -1, 0, 1,  -1, -1, 0, -1,
  1, 1, 1, 0,  1, 1, -1, 0,  1, -1, 1, 0,  1, -1, -1, 0,
  -1, 1, 1, 0,  -1, 1, -1, 0,  -1, -1, 1, 0,  -1, -1, -1, 0,
]);

export class Noise4D {
  constructor(seed) {
    this.seed = seed >>> 0;
  }

  /** Integer hash of a lattice point → gradient index 0..31 */
  _grad(ix, iy, iz, iw) {
    let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^
            Math.imul(iz, 0x9e3779b1) ^ Math.imul(iw, 0x85ebca6b) ^ this.seed;
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    return (h >>> 0) & 31;
  }

  _dot(ix, iy, iz, iw, dx, dy, dz, dw) {
    const g = this._grad(ix, iy, iz, iw) << 2;
    return GRAD4[g] * dx + GRAD4[g + 1] * dy + GRAD4[g + 2] * dz + GRAD4[g + 3] * dw;
  }

  /** 4D Perlin noise, roughly in [-1, 1]. */
  noise(x, y, z, w) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), W = Math.floor(w);
    const fx = x - X, fy = y - Y, fz = z - Z, fw = w - W;
    const u = smootherstep(fx), v = smootherstep(fy), s = smootherstep(fz), t = smootherstep(fw);

    let acc = 0;
    // 16 lattice corners, trilinear+ blend.
    for (let c = 0; c < 16; c++) {
      const ox = c & 1, oy = (c >> 1) & 1, oz = (c >> 2) & 1, ow = (c >> 3) & 1;
      const wx = ox ? u : 1 - u;
      const wy = oy ? v : 1 - v;
      const wz = oz ? s : 1 - s;
      const ww = ow ? t : 1 - t;
      const weight = wx * wy * wz * ww;
      if (weight < 1e-6) continue;
      acc += weight * this._dot(X + ox, Y + oy, Z + oz, W + ow,
        fx - ox, fy - oy, fz - oz, fw - ow);
    }
    return acc * 1.1;
  }

  /** 3D convenience (w pinned). */
  noise3(x, y, z) { return this.noise(x, y, z, 0.5); }

  /** Fractal Brownian motion. */
  fbm(x, y, z, w, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x * freq, y * freq, z * freq, w * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged fractal — good for mountain spines and cave walls. */
  ridged(x, y, z, w, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.noise(x * freq, y * freq, z * freq, w * freq));
      sum += amp * n * n;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return (sum / norm) * 2 - 1;
  }
}

/** A bundle of independent noise fields derived from one world seed. */
export function makeNoiseSet(seed) {
  const s = seed >>> 0;
  return {
    continent: new Noise4D(s ^ 0x1a2b3c4d),
    hills:     new Noise4D(s ^ 0x51ed270b),
    detail:    new Noise4D(s ^ 0x2f9d1e77),
    temp:      new Noise4D(s ^ 0x77ab13c5),
    humid:     new Noise4D(s ^ 0x3ce0ff21),
    cave:      new Noise4D(s ^ 0x6b1a99f3),
    cave2:     new Noise4D(s ^ 0x0d5f7a13),
    ore:       new Noise4D(s ^ 0x44c1b8e9),
    tree:      new Noise4D(s ^ 0x91e7d3a5),
    rift:      new Noise4D(s ^ 0xbadc0ffe),
    beach:     new Noise4D(s ^ 0x1337c0de),
  };
}
