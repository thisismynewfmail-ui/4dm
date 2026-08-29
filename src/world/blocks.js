// ---------------------------------------------------------------------------
// 4D-MC block registry.
//
// Every block is declared once here. Ids are assigned in declaration order and
// are what gets written into chunk storage and into save files, so the order of
// this table is part of the save format — append, never insert.
// ---------------------------------------------------------------------------

export const AIR = 0;

/** Tool material tiers. */
export const TIER = { HAND: 0, WOOD: 1, STONE: 2, IRON: 3, AETHER: 4, PHASE: 5 };

export const blocks = [];               // index === id
export const blockByName = new Map();

const DEF = {
  render: 'cube',      // cube | cross | torch | none
  solid: true,         // has collision
  opaque: true,        // fully blocks light & hides neighbour faces
  filter: 15,          // light lost passing through (only if !opaque)
  emit: 0,             // light emitted 0..15
  hardness: 1.0,       // seconds with a bare hand at tier 0
  tool: 'none',        // pick | axe | shovel | sword | none
  tier: 0,             // minimum tool tier to yield a drop
  drop: undefined,     // item name; undefined = itself, null = nothing
  dropCount: 1,
  tint: null,          // [r,g,b] 0..1 multiplier applied to the texture
  alpha: 'opaque',     // opaque | cutout | blend
  hyper: false,        // exists identically in every hyper-layer
  phaseGlass: false,   // looking through shows the neighbouring slice
  liquid: false,
  climb: false,
  container: null,     // chest | smelter | craft | tesseract
  step: 'stone',
  hurt: 0,             // contact damage per second
  item: true,          // obtainable as an item
  stack: 64,
  desc: '',
};

function def(name, display, tex, props = {}) {
  const b = Object.assign({}, DEF, props);
  b.id = blocks.length;
  b.name = name;
  b.display = display;
  // tex: string (all faces) or { top, bottom, side, north... }
  if (typeof tex === 'string') b.tex = { all: tex };
  else b.tex = tex;
  if (b.drop === undefined) b.drop = name;
  blocks.push(b);
  blockByName.set(name, b);
  return b.id;
}

// --- 0: air ----------------------------------------------------------------
def('air', 'Air', 'air', { render: 'none', solid: false, opaque: false, filter: 0, hardness: 0, item: false, drop: null });

// --- Bedrock / boundary ----------------------------------------------------
def('boundary', 'Boundary Stone', 'boundary', {
  hardness: -1, tool: 'pick', tier: 99, drop: null, hyper: true, item: false,
  desc: 'The hull of the hyperworld. It exists in every layer at once.',
});

// --- Stone family ----------------------------------------------------------
def('stone', 'Stone', 'stone', { hardness: 1.5, tool: 'pick', tier: 1, drop: 'cobblestone' });
def('cobblestone', 'Cobblestone', 'cobblestone', { hardness: 2.0, tool: 'pick', tier: 1 });
def('mossy_cobblestone', 'Mossy Cobblestone', 'mossy_cobblestone', { hardness: 2.0, tool: 'pick', tier: 1 });
def('stone_bricks', 'Stone Bricks', 'stone_bricks', { hardness: 2.0, tool: 'pick', tier: 1 });
def('cracked_bricks', 'Cracked Stone Bricks', 'cracked_bricks', { hardness: 2.0, tool: 'pick', tier: 1 });
def('slate', 'Slate', 'slate', { hardness: 2.2, tool: 'pick', tier: 1 });
def('marble', 'Pale Marble', 'marble', { hardness: 2.0, tool: 'pick', tier: 1 });
def('basalt', 'Basalt', 'basalt', { hardness: 2.2, tool: 'pick', tier: 1 });
def('ashstone', 'Ashstone', 'ashstone', { hardness: 1.2, tool: 'pick', tier: 1, step: 'gravel' });
def('obsidian', 'Obsidian', 'obsidian', { hardness: 22, tool: 'pick', tier: 4 });
def('terracotta', 'Terracotta', 'terracotta', { hardness: 1.6, tool: 'pick', tier: 1 });
def('bricks', 'Bricks', 'bricks', { hardness: 2.0, tool: 'pick', tier: 1 });

// --- Soil ------------------------------------------------------------------
def('dirt', 'Dirt', 'dirt', { hardness: 0.6, tool: 'shovel', step: 'grass' });
def('grass_block', 'Grass Block', { top: 'grass_top', bottom: 'dirt', side: 'grass_side' },
  { hardness: 0.7, tool: 'shovel', drop: 'dirt', step: 'grass', tint: null });
def('podzol', 'Forest Floor', { top: 'podzol_top', bottom: 'dirt', side: 'podzol_side' },
  { hardness: 0.6, tool: 'shovel', drop: 'dirt', step: 'grass' });
def('mycelium', 'Mycelium', { top: 'mycelium_top', bottom: 'dirt', side: 'mycelium_side' },
  { hardness: 0.6, tool: 'shovel', drop: 'dirt', step: 'grass' });
def('sand', 'Sand', 'sand', { hardness: 0.5, tool: 'shovel', step: 'sand' });
def('red_sand', 'Crimson Sand', 'red_sand', { hardness: 0.5, tool: 'shovel', step: 'sand' });
def('sandstone', 'Sandstone', { top: 'sandstone_top', bottom: 'sandstone_top', side: 'sandstone' },
  { hardness: 1.4, tool: 'pick', tier: 1 });
def('gravel', 'Gravel', 'gravel', { hardness: 0.6, tool: 'shovel', step: 'gravel', drop: 'gravel' });
def('clay', 'Clay', 'clay', { hardness: 0.6, tool: 'shovel', drop: 'clay_ball', dropCount: 4, step: 'gravel' });
def('snow_block', 'Snow Block', 'snow', { hardness: 0.4, tool: 'shovel', step: 'cloth' });
def('ice', 'Ice', 'ice', { hardness: 0.6, tool: 'pick', opaque: false, filter: 2, alpha: 'blend', drop: null, step: 'glass' });
def('crimson_soil', 'Crimson Soil', 'crimson_soil', { hardness: 0.6, tool: 'shovel', step: 'gravel' });

// --- Ores ------------------------------------------------------------------
def('coal_ore', 'Coal Seam', 'coal_ore', { hardness: 3.0, tool: 'pick', tier: 1, drop: 'coal', dropCount: 1 });
def('copper_ore', 'Copper Ore', 'copper_ore', { hardness: 3.0, tool: 'pick', tier: 1, drop: 'raw_copper' });
def('iron_ore', 'Iron Ore', 'iron_ore', { hardness: 3.0, tool: 'pick', tier: 2, drop: 'raw_iron' });
def('gold_ore', 'Gold Ore', 'gold_ore', { hardness: 3.0, tool: 'pick', tier: 3, drop: 'raw_gold' });
def('lumen_ore', 'Lumen Ore', 'lumen_ore', { hardness: 3.0, tool: 'pick', tier: 2, emit: 7, drop: 'lumen_dust', dropCount: 3 });
def('aetherite_ore', 'Aetherite Ore', 'aetherite_ore', { hardness: 5.0, tool: 'pick', tier: 3, emit: 3, drop: 'aetherite_gem' });
def('phaseite_ore', 'Phaseite Ore', 'phaseite_ore', { hardness: 6.0, tool: 'pick', tier: 4, emit: 6, drop: 'phaseite_crystal' });
def('voidstone_ore', 'Voidstone', 'voidstone_ore', { hardness: 8.0, tool: 'pick', tier: 4, drop: 'void_shard' });

// --- Wood ------------------------------------------------------------------
def('oak_log', 'Oak Log', { top: 'oak_log_top', bottom: 'oak_log_top', side: 'oak_log' },
  { hardness: 2.0, tool: 'axe', step: 'wood' });
def('oak_planks', 'Oak Planks', 'oak_planks', { hardness: 2.0, tool: 'axe', step: 'wood' });
def('oak_leaves', 'Oak Leaves', 'oak_leaves', {
  hardness: 0.3, tool: 'none', opaque: false, filter: 2, alpha: 'cutout',
  drop: null, step: 'grass',
});
def('pine_log', 'Pine Log', { top: 'pine_log_top', bottom: 'pine_log_top', side: 'pine_log' },
  { hardness: 2.0, tool: 'axe', step: 'wood' });
def('pine_planks', 'Pine Planks', 'pine_planks', { hardness: 2.0, tool: 'axe', step: 'wood' });
def('pine_leaves', 'Pine Needles', 'pine_leaves', {
  hardness: 0.3, opaque: false, filter: 2, alpha: 'cutout', drop: null, step: 'grass',
});
def('rift_log', 'Riftwood Log', { top: 'rift_log_top', bottom: 'rift_log_top', side: 'rift_log' },
  { hardness: 2.4, tool: 'axe', emit: 2, step: 'wood' });
def('rift_planks', 'Riftwood Planks', 'rift_planks', { hardness: 2.2, tool: 'axe', step: 'wood' });
def('rift_leaves', 'Rift Canopy', 'rift_leaves', {
  hardness: 0.3, opaque: false, filter: 1, alpha: 'cutout', emit: 4, drop: null, step: 'grass',
});
def('bookshelf', 'Archive Shelf', { top: 'oak_planks', bottom: 'oak_planks', side: 'bookshelf' },
  { hardness: 1.5, tool: 'axe', step: 'wood' });

// --- Glass & 4D materials --------------------------------------------------
def('glass', 'Glass', 'glass', {
  hardness: 0.5, opaque: false, filter: 0, alpha: 'blend', drop: null, step: 'glass',
});
def('phase_glass', 'Phase Glass', 'phase_glass', {
  hardness: 0.8, opaque: false, filter: 0, alpha: 'blend', phaseGlass: true, step: 'glass',
  desc: 'Looking through it shows the adjacent hyper-layer instead of your own.',
});
def('anchor_block', 'Phase Anchor Block', { top: 'anchor_top', bottom: 'anchor_top', side: 'anchor_side' },
  { hardness: 3.0, tool: 'pick', tier: 2, emit: 4,
    desc: 'Suppresses phasing nearby and restores Phase Stability quickly.' });
def('rift_block', 'Rift Block', 'rift_block', {
  hardness: 3.0, tool: 'pick', tier: 3, emit: 9, solid: false, opaque: false, filter: 0, alpha: 'blend',
  desc: 'Step inside and the fourth dimension takes you one layer onward.',
});
def('tesseract_core', 'Tesseract Core', 'tesseract_core', {
  hardness: 12, tool: 'pick', tier: 4, emit: 14, hyper: true,
  desc: 'A hyper-solid landmark. It occupies every layer of W simultaneously.',
});
def('hyper_lattice', 'Hyper Lattice', 'hyper_lattice', {
  hardness: 1.0, tool: 'pick', tier: 1, opaque: false, filter: 1, alpha: 'cutout', emit: 3,
});
def('slice_lantern', 'Slice Lantern', 'slice_lantern', {
  hardness: 1.0, tool: 'pick', tier: 1, emit: 15,
  desc: 'Reveals the ghosts of neighbouring hyper-layers around it.',
});

// --- Utility blocks --------------------------------------------------------
def('crafting_table', 'Fabricator', { top: 'craft_top', bottom: 'oak_planks', side: 'craft_side' },
  { hardness: 2.0, tool: 'axe', container: 'craft', step: 'wood' });
def('smelter', 'Smelter', { top: 'smelter_top', bottom: 'stone', side: 'smelter_side', north: 'smelter_front' },
  { hardness: 3.0, tool: 'pick', tier: 1, container: 'smelter' });
def('tesseract_bench', 'Tesseract Bench', { top: 'tess_top', bottom: 'rift_planks', side: 'tess_side' },
  { hardness: 3.0, tool: 'axe', container: 'tesseract', emit: 6, step: 'wood' });
def('chest', 'Cache', { top: 'chest_top', bottom: 'chest_top', side: 'chest_side', north: 'chest_front' },
  { hardness: 2.0, tool: 'axe', container: 'chest', step: 'wood', opaque: false, filter: 15 });
def('ladder', 'Ladder', 'ladder', {
  hardness: 0.4, tool: 'axe', solid: false, opaque: false, filter: 0, alpha: 'cutout',
  render: 'flat', climb: true, step: 'wood',
});
def('torch', 'Torch', 'torch', {
  hardness: 0.05, render: 'torch', solid: false, opaque: false, filter: 0, alpha: 'cutout',
  emit: 14, step: 'wood',
});
def('lantern', 'Iron Lantern', 'lantern', { hardness: 1.2, tool: 'pick', tier: 1, emit: 15 });
def('lumen_stone', 'Lumen Stone', 'lumen_stone', { hardness: 0.6, emit: 15, tool: 'pick' });

// --- Metal / gem blocks ----------------------------------------------------
def('coal_block', 'Coal Block', 'coal_block', { hardness: 4, tool: 'pick', tier: 1 });
def('copper_block', 'Copper Block', 'copper_block', { hardness: 4, tool: 'pick', tier: 2 });
def('iron_block', 'Iron Block', 'iron_block', { hardness: 5, tool: 'pick', tier: 2 });
def('gold_block', 'Gold Block', 'gold_block', { hardness: 4, tool: 'pick', tier: 3 });
def('aetherite_block', 'Aetherite Block', 'aetherite_block', { hardness: 6, tool: 'pick', tier: 3, emit: 4 });
def('phaseite_block', 'Phaseite Block', 'phaseite_block', { hardness: 7, tool: 'pick', tier: 4, emit: 8 });

// --- Crystals --------------------------------------------------------------
def('crystal_cyan', 'Cyan Crystal', 'crystal_cyan', { hardness: 2.0, tool: 'pick', tier: 2, emit: 10, drop: 'crystal_shard', dropCount: 2, opaque: false, filter: 1, alpha: 'blend' });
def('crystal_amber', 'Amber Crystal', 'crystal_amber', { hardness: 2.0, tool: 'pick', tier: 2, emit: 10, drop: 'crystal_shard', dropCount: 2, opaque: false, filter: 1, alpha: 'blend' });
def('crystal_rose', 'Rose Crystal', 'crystal_rose', { hardness: 2.0, tool: 'pick', tier: 2, emit: 10, drop: 'crystal_shard', dropCount: 2, opaque: false, filter: 1, alpha: 'blend' });
def('crystal_violet', 'Violet Crystal', 'crystal_violet', { hardness: 2.0, tool: 'pick', tier: 2, emit: 10, drop: 'crystal_shard', dropCount: 2, opaque: false, filter: 1, alpha: 'blend' });

// --- Wool ------------------------------------------------------------------
const WOOLS = [
  ['wool_white', 'Pale Wool'], ['wool_black', 'Soot Wool'], ['wool_red', 'Ember Wool'],
  ['wool_green', 'Moss Wool'], ['wool_blue', 'Deep Wool'], ['wool_yellow', 'Sun Wool'],
  ['wool_purple', 'Dusk Wool'], ['wool_orange', 'Rust Wool'],
];
for (const [n, d] of WOOLS) def(n, d, n, { hardness: 0.8, step: 'cloth' });

// --- Plants ----------------------------------------------------------------
const PLANT = { render: 'cross', solid: false, opaque: false, filter: 0, alpha: 'cutout', hardness: 0.05, step: 'grass' };
def('tall_grass', 'Tall Grass', 'tall_grass', Object.assign({}, PLANT, { drop: 'fiber', dropCount: 1 }));
def('fern', 'Fern', 'fern', Object.assign({}, PLANT, { drop: 'fiber' }));
def('dead_bush', 'Dead Bush', 'dead_bush', Object.assign({}, PLANT, { drop: 'stick' }));
def('flower_ember', 'Ember Bloom', 'flower_ember', Object.assign({}, PLANT));
def('flower_sun', 'Sun Bloom', 'flower_sun', Object.assign({}, PLANT));
def('flower_dusk', 'Dusk Bloom', 'flower_dusk', Object.assign({}, PLANT));
def('mushroom_red', 'Red Cap', 'mushroom_red', Object.assign({}, PLANT));
def('mushroom_brown', 'Brown Cap', 'mushroom_brown', Object.assign({}, PLANT));
def('glow_shroom', 'Glowcap', 'glow_shroom', Object.assign({}, PLANT, { emit: 9 }));
def('chrono_berry_bush', 'Chrono Bramble', 'chrono_bush', Object.assign({}, PLANT, { emit: 3, drop: 'chrono_berry', dropCount: 2 }));
def('sapling_oak', 'Oak Sapling', 'sapling_oak', Object.assign({}, PLANT));
def('sapling_pine', 'Pine Sapling', 'sapling_pine', Object.assign({}, PLANT));
def('sapling_rift', 'Rift Sapling', 'sapling_rift', Object.assign({}, PLANT, { emit: 4 }));
def('wheat_tuft', 'Wild Grain', 'wheat_tuft', Object.assign({}, PLANT, { drop: 'wheat' }));
def('cactus', 'Cactus', { top: 'cactus_top', bottom: 'cactus_top', side: 'cactus' },
  { hardness: 0.5, hurt: 1, step: 'cloth' });

// --- Liquids ---------------------------------------------------------------
def('water', 'Water', 'water', {
  render: 'cube', solid: false, opaque: false, filter: 3, alpha: 'blend', liquid: true,
  hardness: -1, drop: null, item: false, step: 'grass',
});
def('lava', 'Lava', 'lava', {
  render: 'cube', solid: false, opaque: false, filter: 0, alpha: 'blend', liquid: true,
  emit: 15, hurt: 6, hardness: -1, drop: null, item: false,
});

export const NUM_BLOCKS = blocks.length;

// --- Fast lookup tables used in hot loops ----------------------------------
export const IS_OPAQUE   = new Uint8Array(NUM_BLOCKS);
export const IS_SOLID    = new Uint8Array(NUM_BLOCKS);
export const LIGHT_EMIT  = new Uint8Array(NUM_BLOCKS);
export const LIGHT_FILT  = new Uint8Array(NUM_BLOCKS);
export const IS_LIQUID   = new Uint8Array(NUM_BLOCKS);
export const RENDER_KIND = new Uint8Array(NUM_BLOCKS); // 0 none 1 cube 2 cross 3 torch 4 flat
export const ALPHA_KIND  = new Uint8Array(NUM_BLOCKS); // 0 opaque 1 cutout 2 blend
export const IS_HYPER    = new Uint8Array(NUM_BLOCKS);

const RK = { none: 0, cube: 1, cross: 2, torch: 3, flat: 4 };
const AK = { opaque: 0, cutout: 1, blend: 2 };

for (const b of blocks) {
  IS_OPAQUE[b.id]   = b.opaque ? 1 : 0;
  IS_SOLID[b.id]    = b.solid ? 1 : 0;
  LIGHT_EMIT[b.id]  = b.emit;
  LIGHT_FILT[b.id]  = b.opaque ? 15 : b.filter;
  IS_LIQUID[b.id]   = b.liquid ? 1 : 0;
  RENDER_KIND[b.id] = RK[b.render];
  ALPHA_KIND[b.id]  = AK[b.alpha];
  IS_HYPER[b.id]    = b.hyper ? 1 : 0;
}

export const B = {};                 // B.stone === 2 etc, for readable worldgen
for (const b of blocks) B[b.name] = b.id;

export function blockId(name) {
  const b = blockByName.get(name);
  if (!b) throw new Error(`unknown block "${name}"`);
  return b.id;
}
export function block(id) { return blocks[id] || blocks[0]; }
