// ---------------------------------------------------------------------------
// Inventory, containers and crafting.
//
// Slot interaction model (Minecraft-compatible, plus true pointer dragging):
//   left press   pick up / place whole stack, and start dragging it
//   right press  pick up half / place one
//   shift+click  quick-move between the two halves of the screen
//   Q            drop the hovered stack into the world
//   click void   drop the carried stack into the world
// ---------------------------------------------------------------------------

import { el, clear, $, esc } from './dom.js';
import { applyIcon, iconStyleString } from '../render/atlas.js';
import { getItem, maxStack, RARITY_COLOR } from '../world/items.js';
import { Container, stack, canMerge, cloneStack, HOTBAR, INV_SIZE, ARMOR_SLOTS } from '../world/inventory.js';
import { findRecipe } from '../world/recipes.js';
import { sfx } from '../audio/sfx.js';
import { openCodex } from './codex.js';

const GRID = 4;

export class InventoryUI {
  constructor(game) {
    this.game = game;
    this.overlay = $('#overlay');
    this.open = false;
    this.kind = null;
    this.cursor = null;       // stack carried by the pointer
    this.dragging = false;
    this.hovered = null;
    this.craftA = new Container(GRID * GRID, 'Assembly');
    this.craftB = new Container(GRID * GRID, 'Phase Layer');
    this.result = new Container(1, 'Result');
    this.currentRecipe = null;
    this.container = null;    // external container being viewed
    this.blockPos = null;

    this.cursorEl = el('div');
    this.cursorEl.id = 'cursor-stack';
    this.cursorEl.style.display = 'none';
    document.body.appendChild(this.cursorEl);

    this.tooltipEl = el('div');
    this.tooltipEl.id = 'tooltip';
    this.tooltipEl.style.display = 'none';
    document.body.appendChild(this.tooltipEl);

    this._onMove = (e) => this.onPointerMove(e);
    this._onUp = (e) => this.onPointerUp(e);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
  }

  // -------------------------------------------------------------------------
  isOpen() { return this.open; }

  openScreen(kind, opts = {}) {
    this.kind = kind;
    this.open = true;
    this.container = opts.container || null;
    this.blockPos = opts.pos || null;
    this.station = kind === 'crafting' ? 'table' : (kind === 'tesseract' ? 'tesseract' : 'inventory');
    this.build();
    sfx.uiOpen();
  }

  close() {
    if (!this.open) return;
    // return anything left in the crafting grids and on the cursor
    const p = this.game.player;
    const dump = (c) => {
      for (let i = 0; i < c.size; i++) {
        const s = c.get(i);
        if (!s) continue;
        const left = p.inventory.addStack(cloneStack(s));
        if (left > 0) this.game.dropStack(stack(s.item, left, s.dur));
        c.set(i, null);
      }
    };
    dump(this.craftA); dump(this.craftB);
    if (this.cursor) {
      const left = p.inventory.addStack(this.cursor);
      if (left > 0) this.game.dropStack(stack(this.cursor.item, left, this.cursor.dur));
      this.cursor = null;
    }
    this.result.set(0, null);
    this.open = false;
    this.kind = null;
    this.container = null;
    clear(this.overlay);
    this.cursorEl.style.display = 'none';
    this.tooltipEl.style.display = 'none';
    sfx.uiClose();
  }

  // -------------------------------------------------------------------------
  build() {
    clear(this.overlay);
    const screen = el('div', 'inv-screen');
    screen.addEventListener('pointerdown', (e) => {
      if (e.target === screen) this.dropCursorToWorld(e.button === 2);
    });
    screen.addEventListener('contextmenu', (e) => e.preventDefault());

    const panel = el('div', 'inv-panel panel');
    const head = el('div', 'inv-head');
    const titles = {
      inventory: ['Field Manifest', 'Everything you are carrying, and a 4×4 assembly grid.'],
      crafting: ['Fabricator', 'A 4-wide bench. Wider patterns become possible here.'],
      tesseract: ['Tesseract Bench', 'Two hyper-layers of pattern. Recipes with depth in W.'],
      chest: ['Cache', 'Contents persist with the world.'],
      smelter: ['Smelter', 'Fuel below, ore above, patience between.'],
    };
    const [title, sub] = titles[this.kind] || ['Container', ''];
    const h = el('div');
    h.appendChild(el('h2', null, title));
    h.appendChild(el('div', 'hint', sub));
    head.appendChild(h);
    const hint = el('div', 'hint');
    hint.innerHTML = 'SHIFT+CLICK move &nbsp;·&nbsp; RIGHT split &nbsp;·&nbsp; <b>Q</b> drop &nbsp;·&nbsp; <b>C</b> codex &nbsp;·&nbsp; <b>ESC</b> close';
    head.appendChild(hint);
    panel.appendChild(head);

    const body = el('div');
    if (this.kind === 'inventory') this.buildInventoryScreen(body);
    else if (this.kind === 'crafting') this.buildCraftingScreen(body);
    else if (this.kind === 'tesseract') this.buildTesseractScreen(body);
    else if (this.kind === 'chest') this.buildChestScreen(body);
    else if (this.kind === 'smelter') this.buildSmelterScreen(body);
    panel.appendChild(body);

    screen.appendChild(panel);
    this.overlay.appendChild(screen);
    this.refresh();
  }

  // --- layout helpers ------------------------------------------------------
  slotEl(source, index, cls) {
    const s = el('div', 'slot' + (cls ? ' ' + cls : ''));
    s.dataset.index = index;
    s._source = source;
    s._index = index;
    const icon = el('div', 'icon');
    s.appendChild(icon);
    s.appendChild(el('div', 'cnt'));
    const dur = el('div', 'dur');
    dur.appendChild(el('i'));
    dur.style.display = 'none';
    s.appendChild(dur);
    s.addEventListener('pointerdown', (e) => this.onSlotDown(e, s));
    s.addEventListener('pointerup', (e) => this.onSlotUp(e, s));
    s.addEventListener('pointerenter', () => { this.hovered = s; this.showTooltip(s); });
    s.addEventListener('pointerleave', () => { if (this.hovered === s) this.hovered = null; this.tooltipEl.style.display = 'none'; });
    this.slotEls.push(s);
    return s;
  }

  gridBlock(caption, source, count, cols, opts = {}) {
    const b = el('div', 'inv-block');
    if (caption) b.appendChild(el('div', 'cap', caption));
    const g = el('div', 'grid');
    g.style.gridTemplateColumns = `repeat(${cols}, var(--slot))`;
    for (let i = 0; i < count; i++) g.appendChild(this.slotEl(source, i + (opts.offset || 0), opts.cls));
    b.appendChild(g);
    return b;
  }

  playerBlock() {
    const inv = this.game.player.inventory;
    const wrap = el('div', 'inv-block');
    wrap.appendChild(el('div', 'cap', 'Carried'));
    const g = el('div', 'grid');
    g.style.gridTemplateColumns = `repeat(9, var(--slot))`;
    for (let i = HOTBAR; i < INV_SIZE; i++) g.appendChild(this.slotEl(inv, i));
    wrap.appendChild(g);
    const hb = el('div', 'grid hotbar-row');
    hb.style.gridTemplateColumns = `repeat(9, var(--slot))`;
    for (let i = 0; i < HOTBAR; i++) hb.appendChild(this.slotEl(inv, i, 'hb'));
    wrap.appendChild(hb);
    return wrap;
  }

  buildInventoryScreen(body) {
    this.slotEls = [];
    const cols = el('div', 'inv-cols');
    // assembly
    const craft = el('div', 'inv-block');
    craft.appendChild(el('div', 'cap', 'Personal Assembly · 4×4'));
    const row = el('div', 'inv-cols');
    const g = el('div', 'grid');
    g.style.gridTemplateColumns = `repeat(${GRID}, var(--slot))`;
    for (let i = 0; i < GRID * GRID; i++) g.appendChild(this.slotEl(this.craftA, i));
    row.appendChild(g);
    const arrow = el('div', 'arrow', '▶');
    this.arrowEl = arrow;
    row.appendChild(arrow);
    const rblock = el('div', 'inv-block');
    rblock.appendChild(el('div', 'cap', 'Yield'));
    rblock.appendChild(this.slotEl(this.result, 0, 'result'));
    row.appendChild(rblock);
    craft.appendChild(row);
    craft.appendChild(el('div', 'hint', 'Patterns up to 3×3 work here. A Fabricator unlocks 4-wide.'));
    cols.appendChild(craft);

    // armour + stats
    const armor = el('div', 'inv-block');
    armor.appendChild(el('div', 'cap', 'Worn'));
    const ag = el('div', 'grid');
    ag.style.gridTemplateColumns = 'var(--slot)';
    const inv = this.game.player.inventory;
    const labels = ['HEAD', 'BODY', 'LEGS', 'FEET'];
    for (let i = 0; i < 4; i++) {
      const s = this.slotEl(inv.armor, i, 'armor');
      s.appendChild(el('div', 'ghost-label', labels[i]));
      s._armorSlot = ARMOR_SLOTS[i];
      ag.appendChild(s);
    }
    armor.appendChild(ag);
    this.statsEl = el('div', 'hint');
    armor.appendChild(this.statsEl);
    cols.appendChild(armor);

    body.appendChild(cols);
    body.appendChild(el('div', 'rule'));
    body.appendChild(this.playerBlock());
    const foot = el('div', 'inv-cols');
    const cbtn = el('button', 'btn sm inline', 'Open Codex');
    cbtn.addEventListener('click', () => openCodex(this.game, this.station));
    foot.appendChild(cbtn);
    body.appendChild(el('div', 'rule'));
    body.appendChild(foot);
  }

  buildCraftingScreen(body) {
    this.slotEls = [];
    const cols = el('div', 'inv-cols');
    const g = el('div', 'grid');
    g.style.gridTemplateColumns = `repeat(${GRID}, var(--slot))`;
    for (let i = 0; i < GRID * GRID; i++) g.appendChild(this.slotEl(this.craftA, i));
    const b1 = el('div', 'inv-block');
    b1.appendChild(el('div', 'cap', 'Pattern · 4×4'));
    b1.appendChild(g);
    cols.appendChild(b1);
    this.arrowEl = el('div', 'arrow', '▶');
    cols.appendChild(this.arrowEl);
    const b2 = el('div', 'inv-block');
    b2.appendChild(el('div', 'cap', 'Yield'));
    b2.appendChild(this.slotEl(this.result, 0, 'result'));
    const cbtn = el('button', 'btn sm inline', 'Codex');
    cbtn.style.marginTop = '10px';
    cbtn.addEventListener('click', () => openCodex(this.game, 'table'));
    b2.appendChild(cbtn);
    cols.appendChild(b2);
    body.appendChild(cols);
    body.appendChild(el('div', 'rule'));
    body.appendChild(this.playerBlock());
  }

  buildTesseractScreen(body) {
    this.slotEls = [];
    const cols = el('div', 'inv-cols');
    const mk = (cap, src, tone) => {
      const b = el('div', 'inv-block');
      const c = el('div', 'cap', cap);
      c.style.color = tone;
      b.appendChild(c);
      const g = el('div', 'grid');
      g.style.gridTemplateColumns = `repeat(${GRID}, var(--slot))`;
      for (let i = 0; i < GRID * GRID; i++) g.appendChild(this.slotEl(src, i));
      b.appendChild(g);
      return b;
    };
    cols.appendChild(mk('Layer A · Matter', this.craftA, 'var(--amber)'));
    cols.appendChild(mk('Layer B · Phase', this.craftB, 'var(--violet)'));
    this.arrowEl = el('div', 'arrow', '▶');
    cols.appendChild(this.arrowEl);
    const b2 = el('div', 'inv-block');
    b2.appendChild(el('div', 'cap', 'Yield'));
    b2.appendChild(this.slotEl(this.result, 0, 'result'));
    const cbtn = el('button', 'btn sm inline', 'Codex');
    cbtn.style.marginTop = '10px';
    cbtn.addEventListener('click', () => openCodex(this.game, 'tesseract'));
    b2.appendChild(cbtn);
    cols.appendChild(b2);
    body.appendChild(cols);
    body.appendChild(el('div', 'hint', 'The two grids are the same 4×4 pattern, one hyper-layer apart. Both must match.'));
    body.appendChild(el('div', 'rule'));
    body.appendChild(this.playerBlock());
  }

  buildChestScreen(body) {
    this.slotEls = [];
    body.appendChild(this.gridBlock('Cache · 27', this.container, 27, 9));
    body.appendChild(el('div', 'rule'));
    body.appendChild(this.playerBlock());
  }

  buildSmelterScreen(body) {
    this.slotEls = [];
    const flow = el('div', 'smelt-flow');
    const inBlock = el('div', 'inv-block');
    inBlock.appendChild(el('div', 'cap', 'Ore'));
    inBlock.appendChild(this.slotEl(this.container, 0));
    const fuelBlock = el('div', 'inv-block');
    fuelBlock.appendChild(el('div', 'cap', 'Fuel'));
    fuelBlock.appendChild(this.slotEl(this.container, 1));
    const stackCol = el('div', 'inv-block');
    stackCol.appendChild(inBlock);
    stackCol.appendChild(fuelBlock);
    flow.appendChild(stackCol);

    const mid = el('div', 'inv-block');
    this.flameEl = el('div', 'flame');
    this.flameEl.appendChild(el('i'));
    mid.appendChild(this.flameEl);
    this.progEl = el('div', 'progress-arrow');
    this.progEl.appendChild(el('i'));
    mid.appendChild(this.progEl);
    flow.appendChild(mid);

    const outBlock = el('div', 'inv-block');
    outBlock.appendChild(el('div', 'cap', 'Yield'));
    outBlock.appendChild(this.slotEl(this.container, 2, 'result'));
    flow.appendChild(outBlock);
    body.appendChild(flow);
    body.appendChild(el('div', 'rule'));
    body.appendChild(this.playerBlock());
  }

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------
  onSlotDown(e, s) {
    e.preventDefault();
    e.stopPropagation();
    const src = s._source, i = s._index;
    if (!src) return;
    const isResult = src === this.result;

    if (e.shiftKey && !isResult) { this.quickMove(src, i); this.afterChange(); return; }
    if (isResult) { this.takeResult(e.shiftKey); this.afterChange(); return; }

    const cur = src.get(i);
    if (e.button === 2) {
      if (this.cursor) {
        // place a single item
        if (!cur) { if (this.slotAccepts(s, this.cursor)) { src.set(i, stack(this.cursor.item, 1, this.cursor.dur)); this.cursor.count--; } }
        else if (canMerge(cur, this.cursor) && cur.count < maxStack(cur.item)) { cur.count++; this.cursor.count--; }
        if (this.cursor && this.cursor.count <= 0) this.cursor = null;
      } else if (cur) {
        const half = Math.ceil(cur.count / 2);
        this.cursor = src.removeAt(i, half);
      }
    } else {
      if (this.cursor) {
        if (!cur) {
          if (this.slotAccepts(s, this.cursor)) { src.set(i, this.cursor); this.cursor = null; }
        } else if (canMerge(cur, this.cursor)) {
          const cap = maxStack(cur.item);
          const take = Math.min(cap - cur.count, this.cursor.count);
          cur.count += take; this.cursor.count -= take;
          if (this.cursor.count <= 0) this.cursor = null;
        } else if (this.slotAccepts(s, this.cursor)) {
          src.set(i, this.cursor); this.cursor = cloneStack(cur);
        }
      } else if (cur) {
        this.cursor = src.removeAt(i, cur.count);
        this.dragging = true;
      }
    }
    sfx.click();
    this.afterChange();
  }

  onSlotUp(e, s) {
    if (!this.dragging || !this.cursor) { this.dragging = false; return; }
    this.dragging = false;
    const src = s._source, i = s._index;
    if (!src || src === this.result) return;
    const cur = src.get(i);
    if (cur === null) {
      if (this.slotAccepts(s, this.cursor)) { src.set(i, this.cursor); this.cursor = null; }
    } else if (canMerge(cur, this.cursor)) {
      const cap = maxStack(cur.item);
      const take = Math.min(cap - cur.count, this.cursor.count);
      cur.count += take; this.cursor.count -= take;
      if (this.cursor.count <= 0) this.cursor = null;
    } else if (this.slotAccepts(s, this.cursor)) {
      src.set(i, this.cursor); this.cursor = cloneStack(cur);
    }
    this.afterChange();
  }

  slotAccepts(s, st) {
    if (!st) return true;
    if (s._armorSlot) {
      const it = getItem(st.item);
      return !!(it && it.kind === 'armor' && it.slot === s._armorSlot);
    }
    if (this.kind === 'smelter' && s._index === 2) return false;   // output only
    return true;
  }

  onPointerMove(e) {
    if (!this.open) return;
    this.cursorEl.style.left = e.clientX + 'px';
    this.cursorEl.style.top = e.clientY + 'px';
    if (this.tooltipEl.style.display !== 'none') {
      const r = this.tooltipEl.getBoundingClientRect();
      let x = e.clientX + 16, y = e.clientY + 16;
      if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 12;
      if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 12;
      this.tooltipEl.style.left = x + 'px';
      this.tooltipEl.style.top = y + 'px';
    }
  }

  onPointerUp() { this.dragging = false; }

  dropCursorToWorld(single) {
    if (!this.cursor) return;
    const n = single ? 1 : this.cursor.count;
    this.game.dropStack(stack(this.cursor.item, n, this.cursor.dur));
    this.cursor.count -= n;
    if (this.cursor.count <= 0) this.cursor = null;
    this.afterChange();
  }

  /** Q on a hovered slot, or on the carried stack. */
  dropHovered() {
    if (this.cursor) { this.dropCursorToWorld(false); return; }
    const s = this.hovered;
    if (!s || !s._source) return;
    const cur = s._source.get(s._index);
    if (!cur) return;
    const out = s._source.removeAt(s._index, 1);
    this.game.dropStack(out);
    this.afterChange();
  }

  quickMove(src, i) {
    const p = this.game.player;
    const inv = p.inventory;
    const cur = src.get(i);
    if (!cur) return;
    const moveTo = (dst, range) => {
      const left = dst === inv
        ? (range ? dst.add(cur.item, cur.count, range) : inv.addSmart(cur.item, cur.count))
        : dst.add(cur.item, cur.count);
      if (left < cur.count) { src.set(i, left > 0 ? stack(cur.item, left, cur.dur) : null); return true; }
      return false;
    };
    if (src === inv) {
      if (this.container && this.kind === 'chest') { moveTo(this.container); }
      else if (this.kind === 'smelter') {
        // ore to slot 0, fuel to slot 1
        const it = getItem(cur.item);
        const target = this.game.isFuel(cur.item) && !this.game.canSmelt(cur.item) ? 1 : 0;
        const dstStack = this.container.get(target);
        if (!dstStack) { this.container.set(target, src.removeAt(i, cur.count)); }
        else if (canMerge(dstStack, cur)) {
          const take = Math.min(maxStack(cur.item) - dstStack.count, cur.count);
          dstStack.count += take; src.removeAt(i, take);
        }
      } else {
        // hotbar <-> storage
        const range = i < HOTBAR ? [HOTBAR, INV_SIZE] : [0, HOTBAR];
        const left = inv.add(cur.item, cur.count, range);
        if (left < cur.count) src.set(i, left > 0 ? stack(cur.item, left, cur.dur) : null);
      }
    } else {
      moveTo(inv);
    }
  }

  takeResult(all) {
    const r = this.currentRecipe;
    const out = this.result.get(0);
    if (!r || !out) return;
    const inv = this.game.player.inventory;
    let made = 0;
    const maxIter = all ? 64 : 1;
    for (let n = 0; n < maxIter; n++) {
      const cur = findRecipe(this.craftA.slots, GRID, this.station, this.craftB.slots);
      if (!cur) break;
      const st = stack(cur.result, cur.count);
      if (this.cursor && !all) {
        if (!canMerge(this.cursor, st) || this.cursor.count + cur.count > maxStack(cur.result)) break;
        this.cursor.count += cur.count;
      } else if (all) {
        if (inv.addSmart(cur.result, cur.count) > 0) break;
      } else {
        this.cursor = st;
      }
      this.consumeIngredients();
      made++;
      if (!all) break;
    }
    if (made > 0) {
      sfx.craft();
      this.game.discover(this.currentRecipe ? this.currentRecipe.result : null);
    }
  }

  consumeIngredients() {
    for (const c of [this.craftA, this.craftB]) {
      for (let i = 0; i < c.size; i++) {
        const s = c.get(i);
        if (!s) continue;
        s.count -= 1;
        if (s.count <= 0) c.set(i, null);
      }
    }
  }

  afterChange() {
    this.updateRecipe();
    this.refresh();
  }

  updateRecipe() {
    if (this.kind === 'chest' || this.kind === 'smelter') { this.currentRecipe = null; return; }
    const r = findRecipe(this.craftA.slots, GRID, this.station, this.craftB.slots);
    this.currentRecipe = r;
    this.result.set(0, r ? stack(r.result, r.count) : null);
    if (this.arrowEl) this.arrowEl.classList.toggle('hot', !!r);
  }

  refresh() {
    if (!this.open) return;
    for (const s of this.slotEls) {
      const st = s._source ? s._source.get(s._index) : null;
      const icon = s.querySelector('.icon');
      const cnt = s.querySelector('.cnt');
      const dur = s.querySelector('.dur');
      if (!st) {
        icon.style.backgroundImage = 'none';
        icon.style.width = '32px'; icon.style.height = '32px';
        cnt.textContent = '';
        dur.style.display = 'none';
        const gl = s.querySelector('.ghost-label');
        if (gl) gl.style.display = '';
      } else {
        applyIcon(icon, st.item, 32);
        cnt.textContent = st.count > 1 ? st.count : '';
        const def = getItem(st.item);
        if (def && def.durability && st.dur !== undefined) {
          dur.style.display = '';
          const f = Math.max(0, Math.min(1, st.dur / def.durability));
          dur.firstChild.style.width = f * 100 + '%';
          dur.firstChild.style.background = f > 0.5 ? 'var(--green)' : (f > 0.22 ? 'var(--amber)' : 'var(--rose)');
        } else dur.style.display = 'none';
        const gl = s.querySelector('.ghost-label');
        if (gl) gl.style.display = 'none';
      }
    }
    // cursor
    if (this.cursor) {
      this.cursorEl.style.display = '';
      this.cursorEl.innerHTML = `<div class="icon" style="${iconStyleString(this.cursor.item, 34)}"></div>` +
        (this.cursor.count > 1 ? `<div class="cnt">${this.cursor.count}</div>` : '');
    } else this.cursorEl.style.display = 'none';

    if (this.statsEl) {
      const p = this.game.player;
      this.statsEl.innerHTML =
        `Defence <b class="accent-amber">${p.inventory.totalDefense()}</b><br>` +
        `Anchor layer <b class="accent-cyan">${p.anchorLayer}</b><br>` +
        `Mined ${p.stats.blocksMined} · Placed ${p.stats.blocksPlaced}<br>` +
        `Phase shifts ${p.stats.phaseShifts}`;
    }
    if (this.kind === 'smelter' && this.container) {
      const c = this.container;
      this.flameEl.firstChild.style.height = `${Math.round((c.burn > 0 ? c.burn / Math.max(1, c.burnMax) : 0) * 100)}%`;
      this.progEl.firstChild.style.width = `${Math.round((c.cook || 0) * 100)}%`;
    }
  }

  showTooltip(s) {
    const st = s._source ? s._source.get(s._index) : null;
    if (!st) { this.tooltipEl.style.display = 'none'; return; }
    const it = getItem(st.item);
    if (!it) { this.tooltipEl.style.display = 'none'; return; }
    let html = `<div class="tname" style="color:${RARITY_COLOR[it.rarity]}">${esc(it.display)}</div>`;
    const kindLabel = { block: 'Block', material: 'Material', tool: 'Tool', food: 'Sustenance', armor: 'Protection', special: 'Instrument' }[it.kind] || it.kind;
    html += `<div class="tkind">${kindLabel}${it.rarity !== 'common' ? ' · ' + it.rarity : ''}</div>`;
    if (it.desc) html += `<div class="tdesc">${esc(it.desc)}</div>`;
    const stats = [];
    if (it.kind === 'tool') {
      stats.push(`Tier ${it.tier} ${it.toolType}`, `Damage ${it.damage}`, `Speed ×${it.speed}`);
      if (st.dur !== undefined) stats.push(`Wear ${st.dur}/${it.durability}`);
    }
    if (it.kind === 'armor') stats.push(`Defence +${it.defense}`, `Wear ${st.dur}/${it.durability}`);
    if (it.kind === 'food') {
      stats.push(`Sustenance +${it.nutrition}`);
      if (it.phase) stats.push(`Stability +${it.phase}`);
    }
    if (this.game.isFuel(it.name)) stats.push(`Burns ${this.game.fuelTime(it.name)}s`);
    if (stats.length) html += `<div class="tstat">${stats.join(' · ')}</div>`;
    this.tooltipEl.innerHTML = html;
    this.tooltipEl.style.display = '';
  }
}
