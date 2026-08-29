// Persistence suite: a full save/load round trip through a real page reload,
// plus keyboard and pointer input wiring.

import { launch, newWorld, reporter } from './harness.mjs';

const { browser, page, errors } = await launch();
const rep = reporter();
const ok = (n, c, x) => rep.ok(n, c, x);
const R = rep.rows;

await newWorld(page, 'persist7', 'Persist World', 20000);

// --- make changes, then save
const marker = await page.evaluate(async () => {
  const g = window.__4dmc.game, p = g.player, W = g.world;
  const { stack } = await import('/src/world/inventory.js');
  const { B } = await import('/src/world/blocks.js');
  const x = Math.floor(p.x) + 3, z = Math.floor(p.z) + 3, w = p.slice;
  const y = W.heightAt(x, z, w) + 1;
  W.setBlock(x, y, z, w, B.gold_block);
  W.setBlock(x, y + 1, z, w, B.chest);
  const c = g.containerAt(x, y + 1, z, w);
  c.slots.fill(null);
  c.set(3, stack('aetherite_gem', 7));
  p.inventory.slots[4] = stack('phaseite_crystal', 9);
  p.inventory.armor.slots[0] = stack('iron_helm', 1);
  p.health = 12.5; p.food = 14; p.w = 4;
  p.stats.blocksMined = 42;
  window.__4dmc.save();
  return { x, y, z, w, id: g.worldId };
});
ok('save wrote without error', true);

// --- reload the page entirely and load the same world
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(3000);
await page.click('text=SINGLEPLAYER'); await page.waitForTimeout(600);
await page.click('.world-item');
await page.waitForTimeout(300);
await page.click('.foot >> text=PLAY');
await page.waitForTimeout(20000);

const after = await page.evaluate(async (m) => {
  const g = window.__4dmc.game, p = g.player, W = g.world;
  const { B } = await import('/src/world/blocks.js');
  W.ensureSlice(m.x >> 4, m.z >> 4, m.w);
  const c = g.containerAt(m.x, m.y + 1, m.z, m.w);
  return {
    sameWorld: g.worldId === m.id,
    goldBlock: W.getBlock(m.x, m.y, m.z, m.w) === B.gold_block,
    chest: W.getBlock(m.x, m.y + 1, m.z, m.w) === B.chest,
    chestGem: c && c.get(3) ? c.get(3).item + 'x' + c.get(3).count : null,
    invPhaseite: p.inventory.count('phaseite_crystal'),
    helm: p.inventory.armor.get(0) ? p.inventory.armor.get(0).item : null,
    health: p.health, food: p.food, w: p.w, slice: p.slice,
    mined: p.stats.blocksMined,
  };
}, marker);
ok('world id preserved', after.sameWorld);
ok('placed block persisted', after.goldBlock);
ok('placed chest persisted', after.chest);
ok('chest contents persisted', after.chestGem === 'aetherite_gemx7', after.chestGem);
ok('inventory persisted', after.invPhaseite === 9, after.invPhaseite);
ok('armour persisted', after.helm === 'iron_helm', after.helm);
ok('health persisted', Math.abs(after.health - 12.5) < 0.001, after.health);
ok('hyper-layer persisted', after.slice === 4, after.w);
ok('stats persisted', after.mined === 42, after.mined);

// --- input handling: keyboard movement
await page.evaluate(() => {
  const a = window.__4dmc;
  a.game.player.gameMode = 'creative';
  a.game.player.flying = true;
});
const p0 = await page.evaluate(() => { const p = window.__4dmc.game.player; return [p.x, p.z, p.yaw]; });
await page.keyboard.down('w');
await page.waitForTimeout(1200);
await page.keyboard.up('w');
await page.waitForTimeout(200);
const p1 = await page.evaluate(() => { const p = window.__4dmc.game.player; return [p.x, p.z]; });
ok('W key moves the player', Math.hypot(p1[0]-p0[0], p1[1]-p0[1]) > 0.5, `moved ${Math.hypot(p1[0]-p0[0], p1[1]-p0[1]).toFixed(2)}`);

// --- F key opens the phase drive
await page.keyboard.down('f');
await page.waitForTimeout(300);
const phasing = await page.evaluate(() => ({ held: window.__4dmc.input.phase, p: window.__4dmc.game.player.phaseHeld }));
ok('F engages the phase drive', phasing.held && phasing.p);
await page.keyboard.up('f');

// --- E opens the inventory, Esc closes
await page.keyboard.press('e');
await page.waitForTimeout(500);
const invOpen = await page.evaluate(() => window.__4dmc.game.inventoryUI.isOpen());
ok('E opens the inventory', invOpen);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
ok('Escape closes the inventory', await page.evaluate(() => !window.__4dmc.game.inventoryUI.isOpen()));

// --- number keys select hotbar
await page.keyboard.press('5');
await page.waitForTimeout(120);
ok('number key selects hotbar slot', await page.evaluate(() => window.__4dmc.game.player.inventory.selected === 4));

// --- Escape pauses
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
ok('Escape pauses the game', await page.evaluate(() => window.__4dmc.state === 'paused'));

const passed = rep.finish(errors);
await browser.close();
process.exit(passed ? 0 : 1);
