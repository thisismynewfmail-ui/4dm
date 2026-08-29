// Interaction suite: real mouse and keyboard against a pointer-locked canvas —
// mining, placing, phasing with F + mouse, taking damage, dying, respawning.

import { launch, newWorld, reporter } from './harness.mjs';

const { browser, page, errors } = await launch({ width: 1100, height: 700 });
const rep = reporter();
const ok = (n, c, x) => rep.ok(n, c, x);
const R = rep.rows;

await newWorld(page, 'interact3', 'Interaction Test', 20000);

// acquire pointer lock FIRST (clicking moves the mouse, which turns the camera)
await page.click('#game');
await page.waitForTimeout(500);
const locked = await page.evaluate(() => document.pointerLockElement === document.getElementById('game'));
ok('pointer lock acquired on click', locked);

// now aim, and build a known block right in front of the player
const setup = await page.evaluate(async () => {
  const g = window.__4dmc.game, p = g.player, W = g.world;
  const { B } = await import('/src/world/blocks.js');
  const { stack } = await import('/src/world/inventory.js');
  p.gameMode = 'survival'; p.flying = false;
  p.yaw = 0; p.pitch = 0;   // looking toward -Z
  const x = Math.floor(p.x), z = Math.floor(p.z) - 3, y = Math.floor(p.y) + 1;
  for (let dy=-1; dy<=2; dy++) for (let dx=-1; dx<=1; dx++) for (let dz=-1; dz<=1; dz++)
    W.setBlock(x+dx, y+dy, z+dz, p.slice, 0);
  W.setBlock(x, y, z, p.slice, B.oak_log);
  p.inventory.slots.fill(null);
  p.inventory.slots[0] = stack('iron_axe', 1);
  p.inventory.slots[1] = stack('cobblestone', 20);
  p.inventory.selected = 0;
  return { x, y, z, w: p.slice };
});
await page.waitForTimeout(120);

await page.evaluate(() => { window.__4dmc.game.updateLookTarget(); });
const target = await page.evaluate(() => {
  const t = window.__4dmc.game.lookTarget;
  return t ? { x: t.x, y: t.y, z: t.z, id: t.id } : null;
});
ok('raycast finds the block ahead', !!target && target.z === setup.z, JSON.stringify(target));

await page.mouse.down({ button: 'left' });
await page.waitForTimeout(2500);
await page.mouse.up({ button: 'left' });
await page.waitForTimeout(600);
const mined = await page.evaluate((s) => {
  const g = window.__4dmc.game;
  return { block: g.world.getBlock(s.x, s.y, s.z, s.w), drops: g.drops.length, mined: g.player.stats.blocksMined,
    inv: g.player.inventory.count('oak_log'), toolDur: g.player.inventory.slots[0] && g.player.inventory.slots[0].dur };
}, setup);
ok('holding LMB mines the block', mined.block === 0, JSON.stringify(mined));
ok('mining wears the tool', mined.toolDur !== undefined && mined.toolDur < 260, mined.toolDur);

// place with right click — put a target back in front of us first
await page.evaluate(async (st) => {
  const g = window.__4dmc.game;
  const { B } = await import('/src/world/blocks.js');
  g.world.setBlock(st.x, st.y, st.z, st.w, B.stone);
  g.player.inventory.selected = 1;
  g.updateLookTarget();
}, setup);
await page.waitForTimeout(300);
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(150);
await page.mouse.up({ button: 'right' });
await page.waitForTimeout(400);
const placedInfo = await page.evaluate(async (st) => {
  const g = window.__4dmc.game;
  const { B } = await import('/src/world/blocks.js');
  return { placed: g.player.stats.blocksPlaced,
    left: g.player.inventory.slots[1] && g.player.inventory.slots[1].count,
    front: g.world.getBlock(st.x, st.y, st.z + 1, st.w) === B.cobblestone,
    target: !!g.lookTarget };
}, setup);
ok('right click places a block', placedInfo.placed >= 1 && placedInfo.front, JSON.stringify(placedInfo));
ok('placing consumes the stack', placedInfo.left === 19, placedInfo.left);

// phase with F + mouse move
const w0 = await page.evaluate(() => window.__4dmc.game.player.w);
await page.keyboard.down('f');
await page.waitForTimeout(200);
for (let i = 0; i < 40; i++) { await page.mouse.move(500, 350 - i * 4); await page.waitForTimeout(12); }
await page.waitForTimeout(400);
const during = await page.evaluate(() => {
  const p = window.__4dmc.game.player;
  return { w: p.w, stability: p.stability, held: p.phaseHeld };
});
ok('F + mouse moves through W', Math.abs(during.w - w0) > 0.05, `w ${w0} -> ${during.w.toFixed(3)}`);
ok('phasing drains stability', during.stability < 100, during.stability.toFixed(1));
await page.keyboard.up('f');
await page.waitForTimeout(1200);
const after = await page.evaluate(() => {
  const p = window.__4dmc.game.player;
  return { w: p.w, isInt: Math.abs(p.w - Math.round(p.w)) < 1e-6 };
});
ok('releasing F snaps to a layer', after.isInt, after.w);

// hostile mob damages the player
const dmg = await page.evaluate(async () => {
  const g = window.__4dmc.game, p = g.player;
  const { Mob } = await import('/src/entity/mobs.js');
  p.health = 20;
  const m = new Mob(g.world, 'shambler', p.x + 1.0, p.y, p.z + 0.4, p.slice);
  g.mobs.push(m); g.entityGroup.add(m.group);
  const before = p.health;
  for (let i = 0; i < 200; i++) g.updateEntities(0.05);
  return { before, after: p.health, mobAlive: !m.dead };
});
ok('hostile mob damages the player', dmg.after < dmg.before, `${dmg.before} -> ${dmg.after.toFixed(1)}`);

// death + respawn
await page.evaluate(() => {
  const g = window.__4dmc.game;
  g.player.hurtTimer = 0;
  g.player.damage(1000, 'test');
  if (g.player.dead) window.__4dmc.onPlayerDeath();
});
await page.waitForTimeout(600);
ok('death screen appears', await page.evaluate(() => window.__4dmc.state === 'dead'));
await page.click('text=RESPAWN');
await page.waitForTimeout(1500);
const resp = await page.evaluate(() => {
  const g = window.__4dmc.game;
  return { state: window.__4dmc.state, hp: g.player.health, dead: g.player.dead };
});
ok('respawn restores the player', resp.state === 'playing' && resp.hp === 20 && !resp.dead, JSON.stringify(resp));

const passed = rep.finish(errors);
await browser.close();
process.exit(passed ? 0 : 1);
