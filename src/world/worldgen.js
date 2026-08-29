// ---------------------------------------------------------------------------
// 4D terrain generation.
//
// Every field is sampled with the hyper-coordinate `w` as a real fourth noise
// axis, so slices are genuinely neighbours in one continuous hyper-landscape:
// phase one layer and the hills flow, the coast walks, the cave keeps going.
// ---------------------------------------------------------------------------

import { CX, CZ, WORLD_H, W_MID, W_STEP, SEA_LEVEL, colOffset } from './constants.js';
import { B } from './blocks.js';
import { hash4, hash2 } from '../core/rng.js';
import { clamp } from '../core/mathx.js';

export const BIOMES = [
  { key: 'ocean',    name: 'Hollow Sea',     top: B.sand,        soil: B.sand,        rock: B.stone },
  { key: 'beach',    name: 'Pale Shore',     top: B.sand,        soil: B.sand,        rock: B.sandstone },
  { key: 'plains',   name: 'Open Flats',     top: B.grass_block, soil: B.dirt,        rock: B.stone },
  { key: 'forest',   name: 'Oakwood',        top: B.grass_block, soil: B.dirt,        rock: B.stone },
  { key: 'taiga',    name: 'Pinehold',       top: B.podzol,      soil: B.dirt,        rock: B.stone },
  { key: 'tundra',   name: 'Rime Waste',     top: B.snow_block,  soil: B.dirt,        rock: B.stone },
  { key: 'desert',   name: 'Sunken Dunes',   top: B.sand,        soil: B.sand,        rock: B.sandstone },
  { key: 'mesa',     name: 'Crimson Mesa',   top: B.red_sand,    soil: B.terracotta,  rock: B.terracotta },
  { key: 'fungal',   name: 'Spore Basin',    top: B.mycelium,    soil: B.dirt,        rock: B.stone },
  { key: 'crystal',  name: 'Crystal Flats',  top: B.slate,       soil: B.slate,       rock: B.marble },
  { key: 'ashlands', name: 'Ashen Reach',    top: B.ashstone,    soil: B.ashstone,    rock: B.basalt },
  { key: 'riftwood', name: 'Rift Grove',     top: B.grass_block, soil: B.dirt,        rock: B.slate },
];
export const BIOME_INDEX = {};
BIOMES.forEach((b, i) => { BIOME_INDEX[b.key] = i; });


export class WorldGen {
  constructor(noise, seed) {
    this.n = noise;
    this.seed = seed >>> 0;
    this._hcache = new Map();
  }

  /** Surface height at a global column, per hyper-layer. */
  heightAt(gx, gz, w) {
    const key = ((gx & 0xffff) * 65536 + (gz & 0xffff)) * 64 + w;
    const c = this._hcache.get(key);
    if (c !== undefined) return c;
    const n = this.n;
    const wf = (w - W_MID) * W_STEP;
    const cont = n.continent.fbm(gx * 0.0032, 40.5, gz * 0.0032, wf * 0.6 + 5.5, 4);
    const hillAmp = clamp(cont * 1.6 + 0.55, 0.05, 1.4);
    const hills = n.hills.fbm(gx * 0.013, 11.5, gz * 0.013, wf * 0.9 + 1.5, 3);
    const ridge = n.hills.ridged(gx * 0.006, 3.5, gz * 0.006, wf * 0.7 + 8.5, 3);
    const detail = n.detail.fbm(gx * 0.055, 7.5, gz * 0.055, wf * 1.3 + 2.5, 2);
    let h = SEA_LEVEL + 2 + cont * 19 + hills * 9 * hillAmp + Math.max(0, ridge) * 14 * Math.max(0, cont) + detail * 2.2;
    const res = Math.round(clamp(h, 3, WORLD_H - 14));
    if (this._hcache.size > 200000) this._hcache.clear();
    this._hcache.set(key, res);
    return res;
  }

  climateAt(gx, gz, w) {
    const n = this.n;
    const wf = (w - W_MID) * W_STEP;
    const temp = n.temp.fbm(gx * 0.0021, 60.5, gz * 0.0021, wf * 0.5 + 30.5, 3);
    const humid = n.humid.fbm(gx * 0.0026, 80.5, gz * 0.0026, wf * 0.5 + 50.5, 3);
    const strange = n.rift.fbm(gx * 0.0034, 90.5, gz * 0.0034, wf * 1.4 + 70.5, 2);
    return { temp, humid, strange };
  }

  biomeAt(gx, gz, w, h) {
    const { temp, humid, strange } = this.climateAt(gx, gz, w);
    const outer = Math.abs(w - W_MID) >= 2;
    if (h < SEA_LEVEL - 2) return BIOME_INDEX.ocean;
    if (h <= SEA_LEVEL + 1) return BIOME_INDEX.beach;
    if (strange > 0.42 && outer) return BIOME_INDEX.crystal;
    if (strange < -0.46 && outer) return BIOME_INDEX.ashlands;
    if (strange > 0.34) return BIOME_INDEX.riftwood;
    if (temp < -0.34) return BIOME_INDEX.tundra;
    if (temp < -0.10) return BIOME_INDEX.taiga;
    if (temp > 0.30 && humid < -0.22) return BIOME_INDEX.mesa;
    if (temp > 0.18 && humid < 0.02) return BIOME_INDEX.desert;
    if (humid > 0.34) return BIOME_INDEX.fungal;
    if (humid > 0.08) return BIOME_INDEX.forest;
    return BIOME_INDEX.plains;
  }

  /** Signed cave field: > 0 means "carve". */
  caveAt(gx, gy, gz, w) {
    const n = this.n;
    const wf = (w - W_MID) * W_STEP;
    const a = n.cave.noise(gx * 0.028, gy * 0.048, gz * 0.028, wf * 0.85 + 3.5);
    const b = n.cave2.noise(gx * 0.028 + 41.7, gy * 0.048 + 13.1, gz * 0.028 - 27.3, wf * 0.85 + 9.5);
    const tube = 0.017 - (a * a + b * b);
    const room = n.cave.fbm(gx * 0.019, gy * 0.030, gz * 0.019, wf * 0.6 + 17.5, 2) - 0.46 + (gy < 20 ? 0.12 : 0);
    return Math.max(tube * 40, room);
  }

  /** Fill one hyper-slice of one chunk. */
  generateSlice(chunk, w) {
    const sl = chunk.slice(w, true);
    const blocks = sl.blocks;
    const ox = chunk.cx * CX, oz = chunk.cz * CZ;

    for (let lx = 0; lx < CX; lx++) {
      const gx = ox + lx;
      for (let lz = 0; lz < CZ; lz++) {
        const gz = oz + lz;
        const h = this.heightAt(gx, gz, w);
        const bi = this.biomeAt(gx, gz, w, h);
        const biome = BIOMES[bi];
        chunk.setH(lx, lz, w, h);
        chunk.setBiome(lx, lz, w, bi);
        const col = colOffset(lx, lz);

        const soilDepth = 3 + ((hash2(gx, gz, 7 + w) * 3) | 0);
        for (let y = 0; y < WORLD_H; y++) {
          let id = 0;
          if (y === 0) id = B.boundary;
          else if (y <= 2 && hash4(gx, y, gz, w, 91) < 0.55) id = B.boundary;
          else if (y > h) {
            id = 0;
          } else if (y === h) {
            id = biome.top;
          } else if (y > h - soilDepth) {
            id = biome.soil;
          } else {
            id = biome.rock;
            // deep strata variety
            if (y < 14 && hash4(gx, y, gz, w, 12) < 0.10) id = B.slate;
            else if (y < 26 && hash4(gx, y, gz, w, 13) < 0.05) id = B.gravel;
          }
          blocks[col + y] = id;
        }

        // caves — carve after the column exists so we can leave liquids behind
        const carveTop = Math.min(h, WORLD_H - 1);
        for (let y = 3; y <= carveTop; y++) {
          if (blocks[col + y] === 0 || blocks[col + y] === B.boundary) continue;
          if (this.caveAt(gx, y, gz, w) > 0) blocks[col + y] = (y < 7) ? B.lava : 0;
        }

        // water table
        for (let y = 1; y <= SEA_LEVEL; y++) {
          if (blocks[col + y] === 0) blocks[col + y] = B.water;
        }
        // ice cap in cold biomes
        if (biome.key === 'tundra' && blocks[col + SEA_LEVEL] === B.water) blocks[col + SEA_LEVEL] = B.ice;

        // stop grass growing under water / expose sand at shorelines
        if (h < SEA_LEVEL && blocks[col + h] === B.grass_block) blocks[col + h] = B.gravel;

        this._ores(blocks, col, gx, gz, w, h);
      }
    }

    this._decorate(chunk, w);
    sl.gen = true;
  }

  _ores(blocks, col, gx, gz, w, h) {
    const n = this.n;
    const wf = (w - W_MID) * W_STEP;
    const outer = Math.abs(w - W_MID);
    const top = Math.min(h - 1, WORLD_H - 1);
    for (let y = 1; y <= top; y++) {
      const cur = blocks[col + y];
      if (cur !== B.stone && cur !== B.slate && cur !== B.marble && cur !== B.basalt &&
          cur !== B.sandstone && cur !== B.terracotta && cur !== B.ashstone) continue;
      const v = n.ore.noise(gx * 0.11, y * 0.11, gz * 0.11, wf * 1.1 + 60.5);
      const r = hash4(gx, y, gz, w, 55);
      if (y < 12 && outer <= 1 && v > 0.52 && r < 0.35) { blocks[col + y] = B.aetherite_ore; continue; }
      if (y < 26 && outer >= 2 && v > 0.50 && r < 0.32) { blocks[col + y] = B.phaseite_ore; continue; }
      if (y < 9 && v > 0.62 && r < 0.14) { blocks[col + y] = B.voidstone_ore; continue; }
      if (y < 22 && v > 0.40 && r < 0.30) { blocks[col + y] = B.gold_ore; continue; }
      if (y < 30 && v > 0.34 && r < 0.34) { blocks[col + y] = B.lumen_ore; continue; }
      if (y < 42 && v > 0.30 && r < 0.42) { blocks[col + y] = B.iron_ore; continue; }
      if (y < 50 && v > 0.26 && r < 0.44) { blocks[col + y] = B.copper_ore; continue; }
      if (y < 58 && v > 0.22 && r < 0.50) { blocks[col + y] = B.coal_ore; continue; }
    }
  }

  // -------------------------------------------------------------------------
  // Surface decoration. Runs over a padded region so trees and structures may
  // straddle chunk borders without seams.
  // -------------------------------------------------------------------------
  _decorate(chunk, w) {
    const ox = chunk.cx * CX, oz = chunk.cz * CZ;
    const PAD = 6;
    for (let lx = -PAD; lx < CX + PAD; lx++) {
      for (let lz = -PAD; lz < CZ + PAD; lz++) {
        const gx = ox + lx, gz = oz + lz;
        const inChunk = lx >= 0 && lx < CX && lz >= 0 && lz < CZ;
        const h = this.heightAt(gx, gz, w);
        if (h <= SEA_LEVEL) { if (inChunk) this._seafloorDeco(chunk, lx, lz, w, gx, gz, h); continue; }
        const bi = this.biomeAt(gx, gz, w, h);
        const biome = BIOMES[bi];
        const r = hash4(gx, 0, gz, w, 1001);

        // trees / large features may write outside this chunk, so they take the
        // world-space writer that clips.
        const treeChance = { forest: 0.09, taiga: 0.08, riftwood: 0.05, plains: 0.008, fungal: 0.02, crystal: 0.004 }[biome.key] || 0;
        if (r < treeChance) { this._tree(chunk, w, gx, gz, h, biome.key); continue; }

        if (!inChunk) continue;
        // small plants stay inside the chunk
        const s = hash4(gx, 1, gz, w, 2002);
        const put = (id) => { if (chunk.get(lx, h, lz, w) !== 0 || h + 1 >= WORLD_H) return; chunk.set(lx, h + 1, lz, w, id); };
        const surf = chunk.get(lx, h, lz, w);
        if (surf === 0 || surf === B.water) continue;
        if (chunk.get(lx, h + 1, lz, w) !== 0) continue;

        switch (biome.key) {
          case 'plains':
            if (s < 0.30) chunk.set(lx, h + 1, lz, w, B.tall_grass);
            else if (s < 0.33) chunk.set(lx, h + 1, lz, w, B.flower_sun);
            else if (s < 0.355) chunk.set(lx, h + 1, lz, w, B.flower_ember);
            else if (s < 0.37) chunk.set(lx, h + 1, lz, w, B.wheat_tuft);
            break;
          case 'forest':
            if (s < 0.34) chunk.set(lx, h + 1, lz, w, B.tall_grass);
            else if (s < 0.38) chunk.set(lx, h + 1, lz, w, B.fern);
            else if (s < 0.395) chunk.set(lx, h + 1, lz, w, B.flower_dusk);
            else if (s < 0.405) chunk.set(lx, h + 1, lz, w, B.mushroom_brown);
            else if (s < 0.412) chunk.set(lx, h + 1, lz, w, B.sapling_oak);
            break;
          case 'taiga':
            if (s < 0.22) chunk.set(lx, h + 1, lz, w, B.fern);
            else if (s < 0.24) chunk.set(lx, h + 1, lz, w, B.mushroom_red);
            break;
          case 'tundra':
            if (s < 0.05) chunk.set(lx, h + 1, lz, w, B.dead_bush);
            break;
          case 'desert':
            if (s < 0.012) this._cactus(chunk, lx, lz, w, h);
            else if (s < 0.03) chunk.set(lx, h + 1, lz, w, B.dead_bush);
            break;
          case 'mesa':
            if (s < 0.02) chunk.set(lx, h + 1, lz, w, B.dead_bush);
            break;
          case 'fungal':
            if (s < 0.16) chunk.set(lx, h + 1, lz, w, B.mushroom_brown);
            else if (s < 0.26) chunk.set(lx, h + 1, lz, w, B.mushroom_red);
            else if (s < 0.30) chunk.set(lx, h + 1, lz, w, B.glow_shroom);
            break;
          case 'crystal':
            if (s < 0.05) this._crystalSpire(chunk, lx, lz, w, h, gx, gz);
            else if (s < 0.09) chunk.set(lx, h + 1, lz, w, B.hyper_lattice);
            break;
          case 'ashlands':
            if (s < 0.04) chunk.set(lx, h + 1, lz, w, B.dead_bush);
            break;
          case 'riftwood':
            if (s < 0.20) chunk.set(lx, h + 1, lz, w, B.tall_grass);
            else if (s < 0.26) chunk.set(lx, h + 1, lz, w, B.chrono_berry_bush);
            else if (s < 0.28) chunk.set(lx, h + 1, lz, w, B.glow_shroom);
            break;
        }
      }
    }
    this._caveDeco(chunk, w);
    this._structures(chunk, w);
  }

  _seafloorDeco(chunk, lx, lz, w, gx, gz, h) {
    if (h + 1 > SEA_LEVEL) return;
    const s = hash4(gx, 2, gz, w, 3003);
    if (s < 0.02 && chunk.get(lx, h, lz, w) !== 0) chunk.set(lx, h, lz, w, B.clay);
  }

  _cactus(chunk, lx, lz, w, h) {
    const n = 2 + ((hash4(lx, 3, lz, w, 44) * 3) | 0);
    for (let k = 1; k <= n; k++) {
      if (h + k >= WORLD_H) break;
      chunk.set(lx, h + k, lz, w, B.cactus);
    }
  }

  _crystalSpire(chunk, lx, lz, w, h, gx, gz) {
    const kinds = [B.crystal_cyan, B.crystal_amber, B.crystal_rose, B.crystal_violet];
    const id = kinds[(hash4(gx, 4, gz, w, 66) * 4) | 0];
    const n = 2 + ((hash4(gx, 5, gz, w, 67) * 4) | 0);
    for (let k = 1; k <= n; k++) {
      if (h + k >= WORLD_H) break;
      chunk.set(lx, h + k, lz, w, id);
    }
  }

  /** Writes into `chunk` only where the tree overlaps it. */
  _tree(chunk, w, gx, gz, h, biomeKey) {
    const ox = chunk.cx * CX, oz = chunk.cz * CZ;
    const put = (x, y, z, id, replace) => {
      const lx = x - ox, lz = z - oz;
      if (lx < 0 || lx >= CX || lz < 0 || lz >= CZ || y < 0 || y >= WORLD_H) return;
      const cur = chunk.get(lx, y, lz, w);
      if (!replace && cur !== 0 && cur !== B.tall_grass && cur !== B.fern) return;
      chunk.set(lx, y, lz, w, id);
    };
    let log = B.oak_log, leaf = B.oak_leaves, hgt = 4 + ((hash4(gx, 6, gz, w, 88) * 3) | 0);
    let shape = 'round';
    if (biomeKey === 'taiga') { log = B.pine_log; leaf = B.pine_leaves; hgt = 6 + ((hash4(gx, 6, gz, w, 88) * 5) | 0); shape = 'conic'; }
    else if (biomeKey === 'riftwood' || biomeKey === 'crystal') { log = B.rift_log; leaf = B.rift_leaves; hgt = 5 + ((hash4(gx, 6, gz, w, 88) * 4) | 0); shape = 'rift'; }
    else if (biomeKey === 'fungal') { log = B.oak_log; leaf = B.mushroom_brown; hgt = 3; shape = 'cap'; }

    for (let y = 1; y <= hgt; y++) put(gx, h + y, gz, log, true);

    if (shape === 'conic') {
      for (let k = 0; k < 5; k++) {
        const y = h + hgt - k;
        const r = Math.min(3, Math.floor(k * 0.75) + 1);
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
          if (dx === 0 && dz === 0 && y <= h + hgt - 1) continue;
          put(gx + dx, y, gz + dz, leaf, false);
        }
      }
      put(gx, h + hgt + 1, gz, leaf, false);
    } else if (shape === 'cap') {
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > 3) continue;
        put(gx + dx, h + hgt + 1, gz + dz, leaf, false);
      }
    } else {
      const top = h + hgt;
      for (let dy = -2; dy <= 1; dy++) {
        const y = top + dy;
        const r = dy >= 1 ? 1 : (dy === 0 ? 2 : 2);
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz > r * r + r) continue;
          if (dx === 0 && dz === 0 && dy < 1) continue;
          put(gx + dx, y, gz + dz, leaf, false);
        }
      }
      if (shape === 'rift' && hash4(gx, 7, gz, w, 99) < 0.4) put(gx, top + 2, gz, B.slice_lantern, false);
    }
  }

  _caveDeco(chunk, w) {
    const ox = chunk.cx * CX, oz = chunk.cz * CZ;
    for (let lx = 0; lx < CX; lx++) for (let lz = 0; lz < CZ; lz++) {
      const gx = ox + lx, gz = oz + lz;
      for (let y = 4; y < 44; y++) {
        if (chunk.get(lx, y, lz, w) !== 0) continue;
        const below = chunk.get(lx, y - 1, lz, w);
        if (below === 0 || below === B.water || below === B.lava) continue;
        const s = hash4(gx, y, gz, w, 4004);
        if (s < 0.004) chunk.set(lx, y, lz, w, B.glow_shroom);
        else if (s < 0.006) chunk.set(lx, y, lz, w, B.mushroom_brown);
        else if (s < 0.0075 && y < 24) chunk.set(lx, y, lz, w, B.crystal_cyan);
        else if (s < 0.0082 && y < 18) chunk.set(lx, y, lz, w, B.rift_block);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Structures
  // -------------------------------------------------------------------------
  _structures(chunk, w) {
    const cx = chunk.cx, cz = chunk.cz;
    const roll = hash2(cx, cz, 500 + w * 13);
    if (roll < 0.035) this._ruin(chunk, w);
    else if (roll < 0.055) this._riftShrine(chunk, w);
    else if (roll < 0.075) this._village(chunk, w);
    if (hash2(cx, cz, 900 + w) < 0.10) this._buriedCache(chunk, w);
  }

  _placer(chunk, w) {
    const ox = chunk.cx * CX, oz = chunk.cz * CZ;
    return (x, y, z, id, force = true) => {
      const lx = x - ox, lz = z - oz;
      if (lx < 0 || lx >= CX || lz < 0 || lz >= CZ || y < 0 || y >= WORLD_H) return;
      if (!force && chunk.get(lx, y, lz, w) !== 0) return;
      chunk.set(lx, y, lz, w, id);
    };
  }

  _ruin(chunk, w) {
    const ox = chunk.cx * CX, oz = chunk.cz * CZ;
    const bx = ox + 4 + ((hash2(chunk.cx, chunk.cz, 11) * 6) | 0);
    const bz = oz + 4 + ((hash2(chunk.cx, chunk.cz, 12) * 6) | 0);
    const h = this.heightAt(bx, bz, w);
    if (h <= SEA_LEVEL) return;
    const put = this._placer(chunk, w);
    const sz = 4 + ((hash2(chunk.cx, chunk.cz, 13) * 3) | 0);
    for (let dx = 0; dx < sz; dx++) for (let dz = 0; dz < sz; dz++) {
      const edge = dx === 0 || dz === 0 || dx === sz - 1 || dz === sz - 1;
      put(bx + dx, h, bz + dz, hash4(bx + dx, h, bz + dz, w, 21) < 0.7 ? B.stone_bricks : B.cracked_bricks);
      if (!edge) continue;
      const wallH = 1 + ((hash4(bx + dx, 0, bz + dz, w, 22) * 3) | 0);
      for (let y = 1; y <= wallH; y++) {
        const id = hash4(bx + dx, y, bz + dz, w, 23) < 0.25 ? B.mossy_cobblestone :
          (hash4(bx + dx, y, bz + dz, w, 24) < 0.3 ? B.cracked_bricks : B.stone_bricks);
        put(bx + dx, h + y, bz + dz, id);
      }
    }
    put(bx + 1, h + 1, bz + 1, B.chest);
    put(bx + (sz >> 1), h + 1, bz + (sz >> 1), B.torch, false);
  }

  _riftShrine(chunk, w) {
    const ox = chunk.cx * CX, oz = chunk.cz * CZ;
    const bx = ox + 7, bz = oz + 7;
    const h = this.heightAt(bx, bz, w);
    if (h <= SEA_LEVEL) return;
    const put = this._placer(chunk, w);
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const d = Math.abs(dx) + Math.abs(dz);
      if (d > 4) continue;
      put(bx + dx, h, bz + dz, d <= 1 ? B.obsidian : B.slate);
    }
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      for (let y = 1; y <= 3; y++) put(bx + dx, h + y, bz + dz, B.obsidian);
      put(bx + dx, h + 4, bz + dz, B.slice_lantern);
    }
    put(bx, h + 1, bz, B.tesseract_core);
    put(bx, h + 2, bz, B.rift_block);
    put(bx + 1, h + 1, bz, B.chest);
    put(bx - 1, h + 1, bz, B.anchor_block);
  }

  _village(chunk, w) {
    const ox = chunk.cx * CX, oz = chunk.cz * CZ;
    const put = this._placer(chunk, w);
    const houses = 2 + ((hash2(chunk.cx, chunk.cz, 31) * 2) | 0);
    for (let i = 0; i < houses; i++) {
      const bx = ox + 1 + ((hash2(chunk.cx * 7 + i, chunk.cz, 32) * 9) | 0);
      const bz = oz + 1 + ((hash2(chunk.cx, chunk.cz * 7 + i, 33) * 9) | 0);
      const h = this.heightAt(bx, bz, w);
      if (h <= SEA_LEVEL + 1) continue;
      const sw = 5, sd = 5;
      const wood = (hash2(bx, bz, 34) < 0.5) ? B.oak_planks : B.pine_planks;
      for (let dx = 0; dx < sw; dx++) for (let dz = 0; dz < sd; dz++) {
        put(bx + dx, h, bz + dz, B.cobblestone);
        const edge = dx === 0 || dz === 0 || dx === sw - 1 || dz === sd - 1;
        for (let y = 1; y <= 3; y++) {
          if (!edge) { put(bx + dx, h + y, bz + dz, 0); continue; }
          const isDoor = (dx === 2 && dz === 0 && y <= 2);
          const isWin = (y === 2 && ((dx === 2 && dz === sd - 1) || (dz === 2 && (dx === 0 || dx === sw - 1))));
          put(bx + dx, h + y, bz + dz, isDoor ? 0 : (isWin ? B.glass : wood));
        }
        put(bx + dx, h + 4, bz + dz, B.oak_log);
      }
      put(bx + 1, h + 1, bz + 1, B.crafting_table);
      put(bx + 3, h + 1, bz + 1, B.chest);
      put(bx + 1, h + 3, bz + 2, B.torch);
      put(bx + 3, h + 1, bz + 3, B.smelter);
      put(bx + 2, h + 4, bz + 2, B.lantern);
    }
  }

  _buriedCache(chunk, w) {
    const ox = chunk.cx * CX, oz = chunk.cz * CZ;
    const bx = ox + 2 + ((hash2(chunk.cx, chunk.cz, 41) * 11) | 0);
    const bz = oz + 2 + ((hash2(chunk.cx, chunk.cz, 42) * 11) | 0);
    const y = 8 + ((hash2(chunk.cx, chunk.cz, 43) * 22) | 0);
    const put = this._placer(chunk, w);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) {
      put(bx + dx, y + dy, bz + dz, (dy === -1) ? B.stone_bricks : 0);
    }
    put(bx, y, bz, B.chest);
    put(bx + 1, y, bz + 1, B.torch);
  }
}
