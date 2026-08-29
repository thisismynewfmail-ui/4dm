// ---------------------------------------------------------------------------
// Item registry. Every placeable block automatically gets a matching item;
// everything else (tools, materials, food, armour) is declared here.
// ---------------------------------------------------------------------------

import { blocks, TIER } from './blocks.js';

export const items = [];
export const itemByName = new Map();

const IDEF = {
  kind: 'material',   // block | material | tool | food | armor | special
  stack: 64,
  tex: null,
  blockName: null,
  toolType: null,     // pick | axe | shovel | sword
  tier: 0,
  speed: 1,           // mining speed multiplier
  damage: 1,          // melee damage
  durability: 0,      // 0 = indestructible
  nutrition: 0,
  heal: 0,
  phase: 0,           // phase stability restored
  slot: null,         // armour slot
  defense: 0,
  desc: '',
  rarity: 'common',   // common | fine | rare | hyper
};

function item(name, display, tex, props = {}) {
  const it = Object.assign({}, IDEF, props);
  it.name = name;
  it.display = display;
  it.tex = tex;
  itemByName.set(name, it);
  items.push(it);
  return it;
}

// --- Block items -----------------------------------------------------------
for (const b of blocks) {
  if (!b.item || b.id === 0) continue;
  item(b.name, b.display, null, {
    kind: 'block', blockName: b.name, stack: b.stack, desc: b.desc,
    rarity: b.hyper || b.phaseGlass ? 'hyper' : 'common',
  });
}

// --- Raw materials ---------------------------------------------------------
item('stick', 'Stick', 'i_stick', { desc: 'Two lengths of wood, split.' });
item('coal', 'Coal', 'i_coal', { desc: 'Burns for 80 seconds in a Smelter.' });
item('charcoal', 'Charcoal', 'i_charcoal', { desc: 'Burns for 80 seconds in a Smelter.' });
item('raw_copper', 'Raw Copper', 'i_raw_copper');
item('copper_ingot', 'Copper Ingot', 'i_copper_ingot');
item('raw_iron', 'Raw Iron', 'i_raw_iron');
item('iron_ingot', 'Iron Ingot', 'i_iron_ingot');
item('raw_gold', 'Raw Gold', 'i_raw_gold');
item('gold_ingot', 'Gold Ingot', 'i_gold_ingot', { rarity: 'fine' });
item('aetherite_gem', 'Aetherite', 'i_aetherite', { rarity: 'rare', desc: 'A gem that hums at the edge of hearing.' });
item('phaseite_crystal', 'Phaseite', 'i_phaseite', { rarity: 'hyper', desc: 'Grown across two hyper-layers at once.' });
item('void_shard', 'Void Shard', 'i_void_shard', { rarity: 'hyper', desc: 'A hole in the shape of a stone.' });
item('phase_shard', 'Phase Shard', 'i_phase_shard', { rarity: 'fine', desc: 'Currency of the layer-folk.' });
item('lumen_dust', 'Lumen Dust', 'i_lumen_dust');
item('crystal_shard', 'Crystal Shard', 'i_crystal_shard');
item('clay_ball', 'Clay Lump', 'i_clay_ball');
item('brick_item', 'Fired Brick', 'i_brick');
item('flint', 'Flint', 'i_flint');
item('fiber', 'Plant Fiber', 'i_fiber');
item('hide', 'Rough Hide', 'i_hide');
item('leather', 'Cured Leather', 'i_leather');
item('bone', 'Bone', 'i_bone');
item('ectoplasm', 'Phase Essence', 'i_ectoplasm', { rarity: 'rare', desc: 'What is left when a 4D creature stops.' });
item('feather', 'Down Feather', 'i_feather');
item('wheat', 'Wild Grain', 'i_wheat');
item('bowl', 'Wooden Bowl', 'i_bowl', { stack: 16 });

// --- Food ------------------------------------------------------------------
item('chrono_berry', 'Chrono Berry', 'i_berry', { kind: 'food', nutrition: 2, phase: 12, desc: 'Restores Phase Stability.' });
item('bread', 'Flatbread', 'i_bread', { kind: 'food', nutrition: 5 });
item('raw_meat', 'Raw Cut', 'i_raw_meat', { kind: 'food', nutrition: 2, heal: 0 });
item('cooked_meat', 'Seared Cut', 'i_cooked_meat', { kind: 'food', nutrition: 8, heal: 1 });
item('mushroom_stew', 'Cap Stew', 'i_stew', { kind: 'food', nutrition: 7, heal: 2, stack: 1 });
item('glow_fruit', 'Glow Fruit', 'i_glow_fruit', { kind: 'food', nutrition: 4, phase: 25, rarity: 'rare' });

// --- Tools -----------------------------------------------------------------
const TOOL_MATS = [
  { key: 'wood',      label: 'Wooden',    tier: TIER.WOOD,   speed: 2.0, dur: 60,   dmg: 1, rarity: 'common' },
  { key: 'stone',     label: 'Stone',     tier: TIER.STONE,  speed: 4.0, dur: 132,  dmg: 2, rarity: 'common' },
  { key: 'iron',      label: 'Iron',      tier: TIER.IRON,   speed: 6.5, dur: 260,  dmg: 3, rarity: 'fine'   },
  { key: 'aetherite', label: 'Aetherite', tier: TIER.AETHER, speed: 9.0, dur: 820,  dmg: 4, rarity: 'rare'   },
  { key: 'phase',     label: 'Phase',     tier: TIER.PHASE,  speed: 13.0, dur: 1600, dmg: 5, rarity: 'hyper' },
];
const TOOL_KINDS = [
  { key: 'pickaxe', label: 'Pickaxe', type: 'pick',   dmgBonus: 1 },
  { key: 'axe',     label: 'Axe',     type: 'axe',    dmgBonus: 2 },
  { key: 'shovel',  label: 'Spade',   type: 'shovel', dmgBonus: 0 },
  { key: 'sword',   label: 'Sword',   type: 'sword',  dmgBonus: 3 },
];

export const TOOL_MATERIALS = TOOL_MATS;

for (const m of TOOL_MATS) {
  for (const k of TOOL_KINDS) {
    const name = `${m.key}_${k.key}`;
    let display = `${m.label} ${k.label}`;
    let desc = '';
    if (m.key === 'phase' && k.key === 'sword') { display = 'Rift Blade'; desc = 'Cuts things that are only partly here.'; }
    if (m.key === 'phase') desc = desc || 'Mines across the grain of reality.';
    item(name, display, `tool_${k.key}_${m.key}`, {
      kind: 'tool', stack: 1, toolType: k.type, tier: m.tier,
      speed: k.key === 'sword' ? 1.5 : m.speed,
      damage: m.dmg + k.dmgBonus,
      durability: k.key === 'sword' ? Math.round(m.dur * 1.2) : m.dur,
      rarity: m.rarity, desc,
    });
  }
}

// --- Armour ----------------------------------------------------------------
const ARMOR_MATS = [
  { key: 'hide',      label: 'Hide',      def: 1, dur: 90,  rarity: 'common' },
  { key: 'iron',      label: 'Iron',      def: 2, dur: 300, rarity: 'fine' },
  { key: 'aetherite', label: 'Aetherite', def: 3, dur: 900, rarity: 'rare' },
];
const ARMOR_SLOTS = [
  { key: 'helm',  label: 'Helm',    slot: 'head',  mult: 1.0 },
  { key: 'chest', label: 'Cuirass', slot: 'chest', mult: 1.6 },
  { key: 'legs',  label: 'Greaves', slot: 'legs',  mult: 1.3 },
  { key: 'boots', label: 'Boots',   slot: 'feet',  mult: 0.8 },
];
for (const m of ARMOR_MATS) {
  for (const s of ARMOR_SLOTS) {
    item(`${m.key}_${s.key}`, `${m.label} ${s.label}`, `armor_${s.key}_${m.key}`, {
      kind: 'armor', stack: 1, slot: s.slot,
      defense: Math.max(1, Math.round(m.def * s.mult)),
      durability: Math.round(m.dur * s.mult), rarity: m.rarity,
    });
  }
}

// --- Special ---------------------------------------------------------------
item('phase_compass', 'Phase Compass', 'i_compass', {
  kind: 'special', stack: 1, rarity: 'rare',
  desc: 'Marks your anchor layer on the Slice Compass and slows stability drain.',
});
item('slice_lens', 'Slice Lens', 'i_lens', {
  kind: 'special', stack: 1, rarity: 'hyper',
  desc: 'Hold to see two hyper-layers deep instead of one.',
});
item('phase_anchor', 'Anchor Pin', 'i_anchor_pin', {
  kind: 'special', stack: 1, rarity: 'rare',
  desc: 'Use to set your respawn point, including its hyper-layer.',
});

// --- Index -----------------------------------------------------------------
items.forEach((it, i) => { it.id = i; });
export const NUM_ITEMS = items.length;

export function getItem(name) { return itemByName.get(name) || null; }
export function itemDisplay(name) { const it = itemByName.get(name); return it ? it.display : name; }
export function maxStack(name) { const it = itemByName.get(name); return it ? it.stack : 64; }

export const RARITY_COLOR = {
  common: '#d8dee9', fine: '#8fd8ff', rare: '#ffc46b', hyper: '#ff8ce0',
};

/** Fuel burn time in seconds, or 0 if not a fuel. */
export function fuelValue(name) {
  switch (name) {
    case 'coal': case 'charcoal': return 80;
    case 'coal_block': return 800;
    case 'stick': return 5;
    case 'oak_planks': case 'pine_planks': case 'rift_planks': return 15;
    case 'oak_log': case 'pine_log': case 'rift_log': return 15;
    case 'crafting_table': case 'bookshelf': case 'ladder': return 15;
    case 'lava': return 1000;
    default: return 0;
  }
}
