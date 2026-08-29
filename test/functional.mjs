// Functional suite: worldgen, mining, placing, crafting (all three stations),
// containers, smelting, drops, the phase drive, creatures, NPCs, rifts and
// lighting — driven against the real game in a real browser.

import { launch, newWorld, reporter } from './harness.mjs';

const { browser, page, errors } = await launch();
await newWorld(page, 'functest', 'Func Test');
if (errors.length) { console.log('LOAD ERRORS:\n' + errors.join('\n')); errors.length = 0; }

const results = await page.evaluate(async () => {
  const R = [];
  const ok = (name, cond, extra) => R.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  ' + extra : ''}`);
  const g = window.__4dmc.game;
  const p = g.player;
  const W = g.world;
  const inv = p.inventory;
  const { stack } = await import('/src/world/inventory.js');
  const { B, block, blockByName } = await import('/src/world/blocks.js');
  const { findRecipe } = await import('/src/world/recipes.js');
  const { getItem } = await import('/src/world/items.js');
  const { Container } = await import('/src/world/inventory.js');

  // ---------- 0. starter cache ----------
  let cacheFound = null;
  for (const [k, c] of W.containers) if (c.type === 'chest' && c.count('stone_pickaxe') > 0) cacheFound = k;
  ok('starter cache exists with tools', !!cacheFound, cacheFound || '');
  ok('inventory starts empty', inv.slots.every((s) => !s));

  // ---------- 1. mining ----------
  const bx = Math.floor(p.x) + 2, bz = Math.floor(p.z);
  const w = p.slice;
  const by = W.heightAt(bx, bz, w);
  W.setBlock(bx, by, bz, w, B.stone);
  const before = W.getBlock(bx, by, bz, w);
  const dropsBefore = g.drops.length;
  g.player.inventory.slots[0] = stack('iron_pickaxe', 1);
  g.mineBlock(bx, by, bz);
  ok('mine removes block', before === B.stone && W.getBlock(bx, by, bz, w) === 0);
  ok('mine spawns a drop', g.drops.length === dropsBefore + 1, g.drops.length ? g.drops[g.drops.length-1].item : '');
  ok('stone drops cobblestone', g.drops.length > dropsBefore && g.drops[g.drops.length-1].item === 'cobblestone');

  // tier gate: wood pick cannot harvest aetherite ore
  inv.slots[0] = stack('wood_pickaxe', 1);
  W.setBlock(bx, by, bz, w, B.aetherite_ore);
  const d2 = g.drops.length;
  g.mineBlock(bx, by, bz);
  ok('tier gate blocks low-tier harvest', g.drops.length === d2);
  inv.slots[0] = stack('iron_pickaxe', 1);
  W.setBlock(bx, by, bz, w, B.aetherite_ore);
  g.mineBlock(bx, by, bz);
  ok('iron tier harvests aetherite', g.drops.length === d2 + 1 && g.drops[g.drops.length-1].item === 'aetherite_gem');

  // ---------- 2. placing ----------
  inv.slots[1] = stack('cobblestone', 10);
  inv.selected = 1;
  g.lookTarget = { x: bx, y: by - 1, z: bz, id: W.getBlock(bx, by-1, bz, w), nx: 0, ny: 1, nz: 0, dist: 3 };
  const placed = g.tryPlace();
  ok('place block', placed && W.getBlock(bx, by, bz, w) === B.cobblestone);
  ok('place consumes one', inv.slots[1] && inv.slots[1].count === 9, inv.slots[1] && inv.slots[1].count);

  // cannot place inside the player
  inv.selected = 1;
  const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
  g.lookTarget = { x: px, y: py - 1, z: pz, id: 1, nx: 0, ny: 1, nz: 0, dist: 1 };
  const blockedPlace = g.tryPlace();
  ok('cannot place inside the player', !blockedPlace);

  // ---------- 3. crafting: inventory 4x4 ----------
  const ui = g.inventoryUI;
  ui.openScreen('inventory');
  ui.craftA.set(0, stack('oak_log', 3));
  ui.updateRecipe();
  ok('log -> planks recipe found', ui.currentRecipe && ui.currentRecipe.result === 'oak_planks', ui.currentRecipe && ui.currentRecipe.count);
  ui.takeResult(false);
  ok('crafting yields to cursor', ui.cursor && ui.cursor.item === 'oak_planks' && ui.cursor.count === 4);
  ok('crafting consumes one ingredient', ui.craftA.get(0) && ui.craftA.get(0).count === 2);
  ui.cursor = null;

  // sticks (shaped, vertical)
  ui.craftA.slots.fill(null);
  ui.craftA.set(1, stack('oak_planks', 1));
  ui.craftA.set(5, stack('oak_planks', 1));
  ui.updateRecipe();
  ok('planks -> sticks (shaped)', ui.currentRecipe && ui.currentRecipe.result === 'stick');

  // 4-wide recipe must be rejected in the inventory grid
  ui.craftA.slots.fill(null);
  const bench = [['rift_planks',0],['rift_planks',1],['rift_planks',2],['rift_planks',3],
    ['rift_planks',4],['phaseite_crystal',5],['phaseite_crystal',6],['rift_planks',7],
    ['rift_planks',8],['phaseite_crystal',9],['phaseite_crystal',10],['rift_planks',11],
    ['rift_planks',12],['rift_planks',13],['rift_planks',14],['rift_planks',15]];
  for (const [n,i] of bench) ui.craftA.set(i, stack(n,1));
  ui.updateRecipe();
  ok('4-wide rejected at inventory grid', !ui.currentRecipe);
  ui.station = 'table';
  ui.updateRecipe();
  ok('4-wide accepted at Fabricator', ui.currentRecipe && ui.currentRecipe.result === 'tesseract_bench');
  ui.craftA.slots.fill(null);
  ui.station = 'inventory';
  ui.updateRecipe();

  // ---------- 4. tesseract dual-layer ----------
  ui.close();
  ui.openScreen('tesseract');
  const put = (c,x,y,n) => c.set(y*4+x, stack(n,1));
  for (const [x,y] of [[0,0],[1,0],[2,0],[0,1],[2,1],[0,2],[1,2],[2,2]]) put(ui.craftA,x,y,'obsidian');
  put(ui.craftB,1,1,'phaseite_crystal');
  ui.updateRecipe();
  ok('tesseract dual-layer recipe', ui.currentRecipe && ui.currentRecipe.result === 'rift_block', ui.currentRecipe && ui.currentRecipe.type);
  // layer B alone should not match a normal recipe
  ui.craftA.slots.fill(null); ui.craftB.slots.fill(null);
  ui.craftA.set(0, stack('oak_log',1)); ui.craftB.set(5, stack('stone',1));
  ui.updateRecipe();
  ok('stray phase-layer item blocks a 3D recipe', !ui.currentRecipe);
  ui.craftA.slots.fill(null); ui.craftB.slots.fill(null);
  ui.close();

  // ---------- 5. chest ----------
  const cx2 = bx, cy2 = by + 1, cz2 = bz;
  W.setBlock(cx2, cy2, cz2, w, B.chest);
  const chest = g.containerAt(cx2, cy2, cz2, w);
  ok('chest container created', !!chest && chest.size === 27);
  chest.set(0, stack('gold_ingot', 5));
  const chest2 = g.containerAt(cx2, cy2, cz2, w);
  ok('chest contents persist in memory', chest2.get(0) && chest2.get(0).item === 'gold_ingot');
  // natural chest loot
  const nat = new Container(27); nat.type='chest';
  g.fillNaturalChest(nat, 100, 12, 100, 3);
  ok('natural chest gets loot', !nat.isEmpty(), nat.slots.filter(Boolean).length + ' stacks');

  // ---------- 6. smelter ----------
  W.setBlock(cx2, cy2 + 1, cz2, w, B.smelter);
  const sm = g.containerAt(cx2, cy2 + 1, cz2, w);
  ok('smelter container', !!sm && sm.size === 3);
  sm.set(0, stack('raw_iron', 2));
  sm.set(1, stack('coal', 2));
  for (let i = 0; i < 400; i++) g.tickSmelters(0.05);
  ok('smelter produced ingots', sm.get(2) && sm.get(2).item === 'iron_ingot', sm.get(2) && sm.get(2).count);
  ok('smelter consumed fuel', !sm.get(1) || sm.get(1).count < 2);

  // ---------- 7. drops & pickup ----------
  inv.slots.fill(null);
  g.spawnDrop(stack('diamondless', 1), p.x, p.y, p.z, p.w); // unknown item still safe
  g.drops.pop();
  g.spawnDrop(stack('iron_ingot', 3), p.x, p.y + 0.2, p.z, p.w);
  const dropE = g.drops[g.drops.length - 1];
  dropE.pickupDelay = 0;
  for (let i = 0; i < 20; i++) g.updateEntities(0.05);
  ok('drop picked up into inventory', inv.count('iron_ingot') === 3, inv.count('iron_ingot'));

  // Q drop
  inv.slots[0] = stack('torch', 5);
  inv.selected = 0;
  const nBefore = g.drops.length;
  g.dropHeld(false);
  ok('Q drops one', g.drops.length === nBefore + 1 && inv.slots[0].count === 4);

  // ---------- 8. phase mechanics ----------
  p.w = 3; p.stability = 100;
  const r1 = p.phaseBy(0.3, 0.016);
  ok('phase moves w', r1 === 'ok' && Math.abs(p.w - 3.3) < 1e-6, p.w.toFixed(2));
  ok('phase drains stability', p.stability < 100, p.stability.toFixed(1));
  // blocked phase: wall the player into the next layer
  p.w = 3;
  const fx = Math.floor(p.x), fy = Math.floor(p.y), fz = Math.floor(p.z);
  for (let dy = 0; dy < 2; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
    W.setBlock(fx + dx, fy + dy, fz + dz, 4, B.stone);
  const r2 = p.phaseBy(0.6, 0.016);
  ok('phase into solid is blocked', r2 === 'blocked' && p.slice === 3, `${r2} w=${p.w.toFixed(2)}`);
  // drained
  p.w = 3; p.stability = 0;
  const r3 = p.phaseBy(0.4, 0.016);
  ok('no stability = no phasing', r3 === 'drained');
  p.stability = 100; p.w = 3;

  // ---------- 9. mobs & 4D clipping ----------
  const { Mob, SPECIES } = await import('/src/entity/mobs.js');
  const m4 = new Mob(W, 'tesser_wraith', p.x + 3, p.y, p.z + 3, 3);
  ok('4D mob has a hyper extent', m4.hyperExtent > 0);
  m4.w = 3.4;
  m4.render(3, 1, 0.016);
  ok('4D mob is clipped when partly out of layer',
    !!m4.materials[0].clippingPlanes && m4.materials[0].clippingPlanes.length === 2);
  ok('4D mob visible from a neighbouring offset', m4.group.visible);
  m4.w = 3 + m4.hyperExtent + 0.5;
  const vis = m4.render(3, 1, 0.016);
  ok('4D mob hidden beyond its hyper extent', !vis);
  const m3 = new Mob(W, 'shambler', p.x + 3, p.y, p.z + 3, 3);
  m3.render(3, 1, 0.016);
  ok('3D mob fully visible in its own layer', m3.group.visible && !m3.clipPlane);
  m3.w = 3; const vis3 = m3.render(4.2, 1, 0.016);
  ok('3D mob invisible from another layer', !vis3);
  m4.dispose(); m3.dispose();
  const kinds = Object.values(SPECIES);
  ok('species count >= 18', kinds.length >= 18, kinds.length);
  ok('has 4D and 3D species', kinds.some(k=>k.dim===4) && kinds.some(k=>k.dim===3));

  // ---------- 10. NPC ----------
  const { NPC, PROFESSION_KEYS } = await import('/src/entity/npcs.js');
  ok('npc professions >= 10', PROFESSION_KEYS.length >= 10, PROFESSION_KEYS.length);
  const npc = g.npcs[0] || new NPC(W, 'smith', p.x+2, p.y, p.z+2, p.slice, 'test');
  ok('npc has a name and lines', !!npc.name && !!npc.greeting());
  // trade
  inv.slots.fill(null);
  inv.addSmart('raw_iron', 4);
  const trade = npc.def.trades.find((t) => t.give.every(([i,n]) => inv.count(i) >= n));
  ok('npc trade table exists', npc.def.trades.length >= 3);

  // ---------- 11. rift block ----------
  p.w = 3;
  W.setBlock(Math.floor(p.x), Math.floor(p.y + 0.5), Math.floor(p.z), 3, B.rift_block);
  g.riftCooldown = 0;
  // the phase-blocking test above walled layer 4; clear both destinations so
  // the rift's random direction is deterministic in effect
  for (const lw of [2, 4]) {
    for (let dy = 0; dy < 3; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      W.setBlock(Math.floor(p.x) + dx, Math.floor(p.y) + dy, Math.floor(p.z) + dz, lw, 0);
    }
    W.setBlock(Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z), lw, B.stone);
  }
  g.update(0.016, { forward:false,back:false,left:false,right:false,jump:false,sneak:false,sprint:false,phase:false,mine:false,use:false,phaseDelta:0 });
  ok('rift block shifts the layer', p.slice !== 3, 'now ' + p.slice);
  W.setBlock(Math.floor(p.x), Math.floor(p.y + 0.5), Math.floor(p.z), 3, 0);

  // ---------- 12. lighting ----------
  const ly = W.heightAt(bx + 5, bz + 5, w) + 1;
  const baseline = W.getBlockLight(bx + 5, ly, bz + 5, w);   // other emitters nearby
  W.setBlock(bx + 5, ly, bz + 5, w, B.torch);
  const lit = W.getBlockLight(bx + 5, ly, bz + 5, w);
  const near = W.getBlockLight(bx + 7, ly, bz + 5, w);
  ok('torch emits block light', lit >= 13, lit);
  ok('block light falls off with distance', near > 0 && near < lit, `${near} < ${lit}`);
  W.setBlock(bx + 5, ly, bz + 5, w, 0);
  ok('removing a torch removes its light', W.getBlockLight(bx + 5, ly, bz + 5, w) === baseline,
    `${W.getBlockLight(bx + 5, ly, bz + 5, w)} back to ${baseline}`);

  // ---------- 13. 4D world coherence ----------
  const hs = [];
  for (let ww = 0; ww < 7; ww++) hs.push(W.gen.heightAt(40, 40, ww));
  const diffs = hs.slice(1).map((h, i) => Math.abs(h - hs[i]));
  ok('terrain differs across hyper-layers', new Set(hs).size > 2, hs.join(','));
  ok('adjacent layers stay related (smooth 4D field)', Math.max(...diffs) < 22, 'max step ' + Math.max(...diffs));

  return R;
});

const rep = reporter();
rep.rows.push(...results);
const passed = rep.finish(errors);
await browser.close();
process.exit(passed ? 0 : 1);
