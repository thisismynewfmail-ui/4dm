// ---------------------------------------------------------------------------
// Crafting.
//   inventory  — 4x4 personal grid, recipes up to 3 wide
//   table      — the Fabricator, 4x4, unlocks 4-wide recipes
//   tesseract  — the Tesseract Bench: 4x4 x TWO hyper-layers, for 4D gear
// ---------------------------------------------------------------------------

import { getItem } from './items.js';

export const TAGS = {
  '#planks': ['oak_planks', 'pine_planks', 'rift_planks'],
  '#logs': ['oak_log', 'pine_log', 'rift_log'],
  '#stone': ['stone', 'cobblestone', 'slate', 'marble', 'basalt'],
  '#coal': ['coal', 'charcoal'],
  '#wool': ['wool_white', 'wool_black', 'wool_red', 'wool_green', 'wool_blue', 'wool_yellow', 'wool_purple', 'wool_orange'],
  '#flower': ['flower_ember', 'flower_sun', 'flower_dusk'],
};

export function tagMatches(spec, itemName) {
  if (!spec) return false;
  if (spec.startsWith('#')) return (TAGS[spec] || []).includes(itemName);
  return spec === itemName;
}
export function tagExample(spec) {
  if (spec && spec.startsWith('#')) return (TAGS[spec] || ['stone'])[0];
  return spec;
}

export const recipes = [];

function shaped(station, pattern, key, result, count = 1, opts = {}) {
  recipes.push({
    type: 'shaped', station, pattern, key, result, count,
    width: Math.max(...pattern.map((r) => r.length)),
    height: pattern.length,
    mirror: opts.mirror !== false,
    group: opts.group || null,
  });
}
function shapeless(station, ingredients, result, count = 1, opts = {}) {
  recipes.push({ type: 'shapeless', station, ingredients, result, count, group: opts.group || null });
}
function hyper(patternA, patternB, key, result, count = 1) {
  recipes.push({
    type: 'hyper', station: 'tesseract', pattern: patternA, patternB, key, result, count,
    width: Math.max(...patternA.map((r) => r.length), ...patternB.map((r) => r.length)),
    height: Math.max(patternA.length, patternB.length),
    mirror: false,
  });
}

// --- wood chain ------------------------------------------------------------
shapeless('inventory', ['oak_log'], 'oak_planks', 4, { group: 'Wood' });
shapeless('inventory', ['pine_log'], 'pine_planks', 4, { group: 'Wood' });
shapeless('inventory', ['rift_log'], 'rift_planks', 4, { group: 'Wood' });
shaped('inventory', ['P', 'P'], { P: '#planks' }, 'stick', 4, { group: 'Wood' });
shaped('inventory', ['PP', 'PP'], { P: '#planks' }, 'crafting_table', 1, { group: 'Stations' });

// --- basics ----------------------------------------------------------------
shaped('inventory', ['PPP', 'P P', 'PPP'], { P: '#planks' }, 'chest', 1, { group: 'Stations' });
shaped('inventory', ['CCC', 'C C', 'CCC'], { C: 'cobblestone' }, 'smelter', 1, { group: 'Stations' });
shaped('inventory', ['C', 'S'], { C: '#coal', S: 'stick' }, 'torch', 4, { group: 'Light' });
shaped('inventory', ['S S', 'SSS', 'S S'], { S: 'stick' }, 'ladder', 3, { group: 'Build' });
shaped('inventory', ['P P', ' P '], { P: '#planks' }, 'bowl', 4, { group: 'Food' });
shaped('inventory', ['PPP', 'FFF', 'PPP'], { P: '#planks', F: 'fiber' }, 'bookshelf', 1, { group: 'Build' });
shaped('inventory', ['BB', 'BB'], { B: 'brick_item' }, 'bricks', 4, { group: 'Build' });
shaped('inventory', ['SS', 'SS'], { S: 'stone' }, 'stone_bricks', 4, { group: 'Build' });
shaped('inventory', ['LL', 'LL'], { L: 'lumen_dust' }, 'lumen_stone', 1, { group: 'Light' });
shaped('inventory', [' I ', 'ILI', ' I '], { I: 'iron_ingot', L: 'lumen_dust' }, 'lantern', 1, { group: 'Light' });
shaped('inventory', ['CCC', 'CIC', 'CCC'], { C: 'cobblestone', I: 'iron_ingot' }, 'anchor_block', 1, { group: 'Hyper' });
shaped('inventory', [' I ', 'IPI', ' I '], { I: 'iron_ingot', P: 'phaseite_crystal' }, 'phase_compass', 1, { group: 'Hyper' });
shaped('inventory', [' A ', 'A A', ' A '], { A: 'aetherite_gem' }, 'hyper_lattice', 2, { group: 'Hyper' });
shaped('inventory', ['WWW'], { W: 'wheat' }, 'bread', 1, { group: 'Food' });
shapeless('inventory', ['bowl', 'mushroom_red', 'mushroom_brown'], 'mushroom_stew', 1, { group: 'Food' });
shapeless('inventory', ['fiber', 'fiber', 'fiber', 'fiber'], 'wool_white', 1, { group: 'Cloth' });
shapeless('inventory', ['hide', 'hide'], 'leather', 1, { group: 'Gear' });
shaped('inventory', ['GG', 'GG'], { G: 'gravel' }, 'flint', 1, { group: 'Basics' });

// dyeing
const DYES = [
  ['flower_ember', 'wool_red'], ['flower_sun', 'wool_yellow'], ['flower_dusk', 'wool_purple'],
  ['coal', 'wool_black'], ['tall_grass', 'wool_green'], ['crystal_shard', 'wool_blue'],
  ['copper_ingot', 'wool_orange'],
];
for (const [d, out] of DYES) shapeless('inventory', ['wool_white', d], out, 1, { group: 'Cloth' });

// storage blocks + reversals
const COMPACT = [
  ['iron_ingot', 'iron_block'], ['gold_ingot', 'gold_block'], ['copper_ingot', 'copper_block'],
  ['coal', 'coal_block'], ['aetherite_gem', 'aetherite_block'], ['phaseite_crystal', 'phaseite_block'],
];
for (const [unit, blk] of COMPACT) {
  shaped('inventory', ['UUU', 'UUU', 'UUU'], { U: unit }, blk, 1, { group: 'Storage' });
  shapeless('inventory', [blk], unit, 9, { group: 'Storage' });
}

// --- tools -----------------------------------------------------------------
const TOOL_MATS = [
  ['wood', '#planks'], ['stone', 'cobblestone'], ['iron', 'iron_ingot'],
  ['aetherite', 'aetherite_gem'], ['phase', 'phaseite_crystal'],
];
for (const [mat, ing] of TOOL_MATS) {
  const station = mat === 'phase' ? 'tesseract' : 'inventory';
  if (station === 'inventory') {
    shaped('inventory', ['XXX', ' S ', ' S '], { X: ing, S: 'stick' }, `${mat}_pickaxe`, 1, { group: 'Tools' });
    shaped('inventory', ['XX ', 'XS ', ' S '], { X: ing, S: 'stick' }, `${mat}_axe`, 1, { group: 'Tools' });
    shaped('inventory', [' X ', ' S ', ' S '], { X: ing, S: 'stick' }, `${mat}_shovel`, 1, { group: 'Tools' });
    shaped('inventory', [' X ', ' X ', ' S '], { X: ing, S: 'stick' }, `${mat}_sword`, 1, { group: 'Tools' });
  }
}

// --- armour ----------------------------------------------------------------
const ARMOR_MATS = [['hide', 'leather'], ['iron', 'iron_ingot'], ['aetherite', 'aetherite_gem']];
for (const [mat, ing] of ARMOR_MATS) {
  shaped('inventory', ['XXX', 'X X'], { X: ing }, `${mat}_helm`, 1, { group: 'Gear' });
  shaped('inventory', ['X X', 'XXX', 'XXX'], { X: ing }, `${mat}_chest`, 1, { group: 'Gear' });
  shaped('inventory', ['XXX', 'X X', 'X X'], { X: ing }, `${mat}_legs`, 1, { group: 'Gear' });
  shaped('inventory', ['X X', 'X X'], { X: ing }, `${mat}_boots`, 1, { group: 'Gear' });
}

// --- Fabricator-only, 4 wide ----------------------------------------------
shaped('table', ['RRRR', 'RPPR', 'RPPR', 'RRRR'], { R: 'rift_planks', P: 'phaseite_crystal' }, 'tesseract_bench', 1, { group: 'Hyper' });
shaped('table', ['IIII', 'IAAI', 'IIII'], { I: 'iron_ingot', A: 'aetherite_gem' }, 'slice_lantern', 2, { group: 'Light' });
shaped('table', ['GGGG', 'GPPG', 'GGGG'], { G: 'glass', P: 'phaseite_crystal' }, 'phase_glass', 6, { group: 'Hyper' });
shaped('table', ['SSSS', 'SLLS', 'SSSS'], { S: 'slate', L: 'lumen_stone' }, 'lantern', 4, { group: 'Light' });

// --- Tesseract Bench: recipes with depth in W ------------------------------
hyper(
  ['OOO', 'O O', 'OOO'],
  ['   ', ' P ', '   '],
  { O: 'obsidian', P: 'phaseite_crystal' }, 'rift_block', 2);
hyper(
  ['A A', '   ', 'A A'],
  ['P P', ' V ', 'P P'],
  { A: 'aetherite_gem', P: 'phaseite_crystal', V: 'void_shard' }, 'tesseract_core', 1);
hyper(
  ['PPP', ' S ', ' S '],
  ['   ', ' E ', '   '],
  { P: 'phaseite_crystal', S: 'stick', E: 'ectoplasm' }, 'phase_pickaxe', 1);
hyper(
  [' P ', ' P ', ' S '],
  ['   ', ' E ', '   '],
  { P: 'phaseite_crystal', S: 'stick', E: 'ectoplasm' }, 'phase_sword', 1);
hyper(
  ['PP ', 'PS ', ' S '],
  ['   ', ' E ', '   '],
  { P: 'phaseite_crystal', S: 'stick', E: 'ectoplasm' }, 'phase_axe', 1);
hyper(
  [' P ', ' S ', ' S '],
  ['   ', ' E ', '   '],
  { P: 'phaseite_crystal', S: 'stick', E: 'ectoplasm' }, 'phase_shovel', 1);
hyper(
  ['GAG', 'A A', 'GAG'],
  ['   ', ' P ', '   '],
  { G: 'glass', A: 'aetherite_gem', P: 'phaseite_crystal' }, 'slice_lens', 1);
hyper(
  [' I ', 'IAI', ' I '],
  ['   ', ' P ', '   '],
  { I: 'iron_ingot', A: 'aetherite_gem', P: 'phaseite_crystal' }, 'phase_anchor', 1);

// --- smelting --------------------------------------------------------------
export const smelting = [
  { input: 'raw_iron', output: 'iron_ingot', time: 10 },
  { input: 'raw_copper', output: 'copper_ingot', time: 9 },
  { input: 'raw_gold', output: 'gold_ingot', time: 12 },
  { input: 'sand', output: 'glass', time: 8 },
  { input: 'red_sand', output: 'glass', time: 8 },
  { input: 'cobblestone', output: 'stone', time: 8 },
  { input: 'clay_ball', output: 'brick_item', time: 8 },
  { input: 'clay', output: 'terracotta', time: 10 },
  { input: 'raw_meat', output: 'cooked_meat', time: 9 },
  { input: 'hide', output: 'leather', time: 8 },
  { input: 'oak_log', output: 'charcoal', time: 10 },
  { input: 'pine_log', output: 'charcoal', time: 10 },
  { input: 'rift_log', output: 'charcoal', time: 10 },
  { input: 'iron_ore', output: 'iron_ingot', time: 10 },
  { input: 'copper_ore', output: 'copper_ingot', time: 9 },
  { input: 'gold_ore', output: 'gold_ingot', time: 12 },
  { input: 'chrono_berry', output: 'glow_fruit', time: 14 },
];
export const smeltMap = new Map(smelting.map((s) => [s.input, s]));

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** @param grid Array(size*size) of {item,count}|null */
function bounds(grid, size) {
  let minX = size, minY = size, maxX = -1, maxY = -1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (grid[y * size + x]) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function matchShaped(r, grid, size, mirrored) {
  const b = bounds(grid, size);
  if (!b) return false;
  if (b.w !== r.width || b.h !== r.height) return false;
  for (let y = 0; y < r.height; y++) {
    const row = r.pattern[y] || '';
    for (let x = 0; x < r.width; x++) {
      const ch = (mirrored ? row[r.width - 1 - x] : row[x]) || ' ';
      const cell = grid[(b.minY + y) * size + (b.minX + x)];
      if (ch === ' ') { if (cell) return false; continue; }
      const spec = r.key[ch];
      if (!cell || !tagMatches(spec, cell.item)) return false;
    }
  }
  return true;
}

function matchHyperLayer(pattern, key, grid, size, b) {
  const height = pattern.length;
  const width = Math.max(...pattern.map((p) => p.length));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const py = y - b.minY, px = x - b.minX;
      const ch = (py >= 0 && py < height && px >= 0 && px < width) ? (pattern[py][px] || ' ') : ' ';
      const cell = grid[y * size + x];
      if (ch === ' ') { if (cell) return false; continue; }
      if (!cell || !tagMatches(key[ch], cell.item)) return false;
    }
  }
  return true;
}

function matchShapeless(r, grid) {
  const have = [];
  for (const c of grid) if (c) have.push(c.item);
  if (have.length !== r.ingredients.length) return false;
  const pool = have.slice();
  for (const need of r.ingredients) {
    const i = pool.findIndex((it) => tagMatches(need, it));
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}

const STATION_RANK = { inventory: 0, table: 1, tesseract: 2 };

/**
 * @param grid Array(size*size)
 * @param size 4
 * @param station 'inventory'|'table'|'tesseract'
 * @param gridB optional second hyper-layer (tesseract only)
 */
export function findRecipe(grid, size, station, gridB = null) {
  const maxWidth = station === 'inventory' ? 3 : 4;
  for (const r of recipes) {
    if (r.station === 'tesseract' && station !== 'tesseract') continue;
    if (r.station === 'table' && station === 'inventory') continue;
    if (r.type === 'hyper') {
      if (!gridB) continue;
      const bA = bounds(grid, size);
      if (!bA) continue;
      if (!matchHyperLayer(r.pattern, r.key, grid, size, bA)) continue;
      if (!matchHyperLayer(r.patternB, r.key, gridB, size, bA)) continue;
      return r;
    }
    if (gridB && gridB.some((c) => c)) continue; // stray items in layer B
    if (r.type === 'shaped') {
      if (r.width > maxWidth) continue;
      if (matchShaped(r, grid, size, false)) return r;
      if (r.mirror && matchShaped(r, grid, size, true)) return r;
    } else if (matchShapeless(r, grid)) return r;
  }
  return null;
}

/** All recipes visible at a station, for the Codex. */
export function recipesFor(station) {
  return recipes.filter((r) => STATION_RANK[r.station] <= STATION_RANK[station]);
}
