// Inventory suite: real pointer dragging between the hotbar, storage, the
// assembly grid and the armour slots, plus click-carry, right-click splitting,
// shift-click quick-move, Q-to-drop and the close-returns-everything rule.

import { launch, newWorld, reporter } from './harness.mjs';
const { browser, page, errors } = await launch();
const rep = reporter();
const ok = (n,c,x)=>rep.ok(n,c,x);
await newWorld(page, 'dragtest', 'Drag Test', 20000);

await page.evaluate(async () => {
  const g = window.__4dmc.game;
  const { stack } = await import('/src/world/inventory.js');
  const inv = g.player.inventory;
  inv.slots.fill(null);
  inv.slots[0] = stack('cobblestone', 32);   // hotbar slot 1
  inv.slots[1] = stack('oak_log', 12);       // hotbar slot 2
  inv.slots[9] = stack('iron_ingot', 5);     // storage slot 1
  document.exitPointerLock();
  g.inventoryUI.openScreen('inventory');
});
await page.waitForTimeout(700);

// slot geometry: the last two grids in the panel are storage (27) then hotbar (9)
const geo = await page.evaluate(() => {
  const slots = Array.from(document.querySelectorAll('.inv-panel .slot'));
  return slots.map((s, i) => {
    const r = s.getBoundingClientRect();
    return { i, x: r.x + r.width/2, y: r.y + r.height/2, hb: s.classList.contains('hb'), armor: s.classList.contains('armor'), res: s.classList.contains('result') };
  });
});
const hotbar = geo.filter(s => s.hb);
const storage = geo.filter(s => !s.hb && !s.armor && !s.res).slice(-27);
const craft = geo.filter(s => !s.hb && !s.armor && !s.res).slice(0, 16);
ok('screen has 9 hotbar + 27 storage + 16 craft slots',
   hotbar.length === 9 && storage.length === 27 && craft.length === 16,
   `${hotbar.length}/${storage.length}/${craft.length}`);

const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.move((from.x + to.x)/2, (from.y + to.y)/2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(160);
};
const inv = () => page.evaluate(() => window.__4dmc.game.player.inventory.slots.map(s => s ? `${s.item}x${s.count}` : null));

// 1. hotbar slot 0 -> an empty storage slot
await drag(hotbar[0], storage[5]);
let s = await inv();
ok('drag hotbar -> inventory', s[0] === null && s[9+5] === 'cobblestonex32', `${s[0]} / ${s[14]}`);

// 2. and back again
await drag(storage[5], hotbar[0]);
s = await inv();
ok('drag inventory -> hotbar', s[0] === 'cobblestonex32' && s[9+5] === null, `${s[0]} / ${s[14]}`);

// 3. drag onto an occupied slot swaps
await drag(hotbar[1], storage[0]);
s = await inv();
ok('drag onto an occupied slot swaps', s[1] === 'iron_ingotx5' && s[9] === 'oak_logx12', `${s[1]} / ${s[9]}`);

// 4. click-to-pick-up then click-to-place (Minecraft style, no drag)
await page.mouse.click(hotbar[0].x, hotbar[0].y);
await page.waitForTimeout(150);
const carrying = await page.evaluate(() => { const c = window.__4dmc.game.inventoryUI.cursor; return c ? `${c.item}x${c.count}` : null; });
ok('click picks the stack up onto the cursor', carrying === 'cobblestonex32', carrying);
await page.mouse.click(storage[8].x, storage[8].y);
await page.waitForTimeout(150);
s = await inv();
ok('second click drops it in the new slot', s[9+8] === 'cobblestonex32' && s[0] === null, `${s[17]} / ${s[0]}`);

// 5. right click splits the stack
await page.mouse.click(storage[8].x, storage[8].y, { button: 'right' });
await page.waitForTimeout(150);
const half = await page.evaluate(() => { const c = window.__4dmc.game.inventoryUI.cursor; return c ? c.count : null; });
s = await inv();
ok('right click takes half', half === 16 && s[9+8] === 'cobblestonex16', `${half} / ${s[17]}`);
await page.mouse.click(storage[8].x, storage[8].y);
await page.waitForTimeout(150);

// 6. shift-click quick-moves between halves
await page.keyboard.down('Shift');
await page.mouse.click(storage[8].x, storage[8].y);
await page.keyboard.up('Shift');
await page.waitForTimeout(200);
s = await inv();
ok('shift-click quick-moves to the hotbar', s[9+8] === null && s.slice(0,9).some(v => v && v.startsWith('cobblestone')), JSON.stringify(s.slice(0,9)));

// 7. craft by dragging into the assembly grid, then take the yield
await page.evaluate(async () => {
  const g = window.__4dmc.game;
  const { stack } = await import('/src/world/inventory.js');
  g.player.inventory.slots[8] = stack('oak_log', 4);
  g.inventoryUI.refresh();
});
await page.waitForTimeout(120);
await drag(hotbar[8], craft[0]);
await page.waitForTimeout(200);
const yieldSlot = geo.find(s => s.res);
const yielded = await page.evaluate(() => {
  const r = window.__4dmc.game.inventoryUI.result.get(0);
  return r ? `${r.item}x${r.count}` : null;
});
ok('dragging into the assembly grid finds the recipe', yielded === 'oak_planksx4', yielded);
await page.mouse.click(yieldSlot.x, yieldSlot.y);
await page.waitForTimeout(150);
const gotPlanks = await page.evaluate(() => { const c = window.__4dmc.game.inventoryUI.cursor; return c ? `${c.item}x${c.count}` : null; });
ok('clicking the yield crafts', gotPlanks === 'oak_planksx4', gotPlanks);

// 8. Q drops the hovered stack into the world
await page.mouse.click(craft[0].x, craft[0].y);   // put the cursor stack down
await page.waitForTimeout(150);
const dropsBefore = await page.evaluate(() => window.__4dmc.game.drops.length);
await page.mouse.move(craft[0].x, craft[0].y);
await page.keyboard.press('q');
await page.waitForTimeout(250);
const dropsAfter = await page.evaluate(() => window.__4dmc.game.drops.length);
ok('Q drops the hovered item into the world', dropsAfter === dropsBefore + 1, `${dropsBefore} -> ${dropsAfter}`);

// 9. closing returns grid contents to the inventory (nothing is ever eaten)
const beforeClose = await page.evaluate(() => {
  const ui = window.__4dmc.game.inventoryUI;
  return ui.craftA.slots.filter(Boolean).length;
});
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const afterClose = await page.evaluate(() => ({
  open: window.__4dmc.game.inventoryUI.isOpen(),
  logs: window.__4dmc.game.player.inventory.count('oak_log') + window.__4dmc.game.player.inventory.count('oak_planks'),
}));
ok('closing returns the crafting grid to the inventory', !afterClose.open && afterClose.logs > 0,
   `grid had ${beforeClose}, inventory now ${afterClose.logs}`);

const passed = rep.finish(errors);
await browser.close();
process.exit(passed ? 0 : 1);
