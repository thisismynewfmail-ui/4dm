import { CX, CZ, WORLD_H, W_LAYERS, HYPER_VOL, idx } from './constants.js';

/**
 * A chunk owns a full hyper-column: 16 x 80 x 16 x 7 blocks. Generation,
 * lighting and meshing are all lazy *per hyper-slice*, which is what makes
 * a 4D world affordable — you only pay for the layers you can actually see.
 */
export class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint8Array(HYPER_VOL);
    this.light = new Uint8Array(HYPER_VOL);   // hi nibble = sky, lo = block
    this.genMask = 0;                          // bit w set => slice generated
    this.litMask = 0;                          // bit w set => slice lit
    this.heightmap = new Int16Array(CX * CZ * W_LAYERS).fill(-1);
    this.biome = new Uint8Array(CX * CZ * W_LAYERS);
    this.dirty = new Uint8Array(W_LAYERS);     // needs remesh
    this.loaded = true;
  }
  get(lx, y, lz, w) {
    if (y < 0 || y >= WORLD_H) return 0;
    return this.blocks[idx(lx, y, lz, w)];
  }
  set(lx, y, lz, w, id) {
    if (y < 0 || y >= WORLD_H) return;
    this.blocks[idx(lx, y, lz, w)] = id;
  }
  isGen(w) { return (this.genMask & (1 << w)) !== 0; }
  isLit(w) { return (this.litMask & (1 << w)) !== 0; }
  markGen(w) { this.genMask |= (1 << w); }
  markLit(w) { this.litMask |= (1 << w); }
  clearLit(w) { this.litMask &= ~(1 << w); }
  hAt(lx, lz, w) { return this.heightmap[(w * CX + lx) * CZ + lz]; }
  setH(lx, lz, w, v) { this.heightmap[(w * CX + lx) * CZ + lz] = v; }
  biomeAt(lx, lz, w) { return this.biome[(w * CX + lx) * CZ + lz]; }
  setBiome(lx, lz, w, v) { this.biome[(w * CX + lx) * CZ + lz] = v; }
}
