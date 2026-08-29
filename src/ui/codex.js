// The Codex — an in-game recipe browser. Discoverability is a feature.

import { el, clear, $ } from './dom.js';
import { iconStyleString } from '../render/atlas.js';
import { recipesFor, tagExample, smelting } from '../world/recipes.js';
import { getItem } from '../world/items.js';
import { sfx } from '../audio/sfx.js';

let closeFn = null;
export function codexOpen() { return !!closeFn; }
export function closeCodex() { if (closeFn) closeFn(); }

export function openCodex(game, station = 'inventory') {
  const overlay = $('#overlay');
  const prev = Array.from(overlay.children);
  for (const c of prev) c.style.display = 'none';

  const screen = el('div', 'screen dim');
  const panel = el('div', 'panel menu-card');
  panel.style.width = 'min(1000px, 94vw)';
  panel.style.maxHeight = '90vh';
  panel.style.flex = '0 0 auto';

  panel.appendChild(el('h2', null, 'Codex'));
  panel.appendChild(el('div', 'subtitle',
    `Everything you can make${station === 'inventory' ? ' by hand' : station === 'table' ? ' at a Fabricator' : ' at a Tesseract Bench'}. Recipes marked with a wider station need one.`));

  const wrap = el('div', 'codex-wrap');
  const groupsEl = el('div', 'codex-groups');
  const listEl = el('div', 'codex-list');
  wrap.appendChild(groupsEl);
  wrap.appendChild(listEl);
  panel.appendChild(wrap);

  const all = recipesFor(station);
  const groups = ['All'];
  for (const r of all) {
    const g = r.group || 'Other';
    if (!groups.includes(g)) groups.push(g);
  }
  groups.push('Smelting');

  let active = 'All';
  const renderList = () => {
    clear(listEl);
    if (active === 'Smelting') {
      for (const s of smelting) {
        listEl.appendChild(smeltCard(s));
      }
      return;
    }
    const shown = all.filter((r) => active === 'All' || (r.group || 'Other') === active);
    if (!shown.length) { listEl.appendChild(el('div', 'empty-note', 'Nothing here yet.')); return; }
    for (const r of shown) listEl.appendChild(recipeCard(r));
  };

  const mini = (itemName, size = 20) => {
    const m = el('div', 'm');
    if (itemName) {
      const i = el('div', 'icon');
      i.setAttribute('style', iconStyleString(itemName, size - 2));
      m.appendChild(i);
    }
    return m;
  };

  function gridFor(r, pattern) {
    const g = el('div', 'mini');
    const h = pattern.length, w = Math.max(...pattern.map((x) => x.length));
    g.style.gridTemplateColumns = `repeat(${w}, 22px)`;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = pattern[y][x] || ' ';
        g.appendChild(mini(ch === ' ' ? null : tagExample(r.key[ch])));
      }
    }
    return g;
  }

  function recipeCard(r) {
    const card = el('div', 'recipe-card');
    if (r.type === 'shapeless') {
      const g = el('div', 'mini');
      g.style.gridTemplateColumns = `repeat(${Math.min(4, r.ingredients.length)}, 22px)`;
      for (const ing of r.ingredients) g.appendChild(mini(tagExample(ing)));
      card.appendChild(g);
    } else if (r.type === 'hyper') {
      const holder = el('div');
      holder.style.display = 'flex'; holder.style.gap = '8px'; holder.style.alignItems = 'center';
      holder.appendChild(gridFor(r, r.pattern));
      const plus = el('div', 'hyper-tag', '⊕W');
      holder.appendChild(plus);
      holder.appendChild(gridFor(r, r.patternB));
      card.appendChild(holder);
    } else {
      card.appendChild(gridFor(r, r.pattern));
    }
    const res = el('div', 'mini');
    res.style.gridTemplateColumns = '30px';
    const rm = el('div', 'm');
    rm.style.width = '30px'; rm.style.height = '30px';
    const ri = el('div', 'icon');
    ri.setAttribute('style', iconStyleString(r.result, 28));
    rm.appendChild(ri);
    res.appendChild(rm);
    card.appendChild(res);

    const info = el('div', 'rinfo');
    const it = getItem(r.result);
    info.appendChild(el('div', 'rname', `${it ? it.display : r.result}${r.count > 1 ? ' ×' + r.count : ''}`));
    const stationName = { inventory: 'Hand or any bench', table: 'Fabricator · 4 wide', tesseract: 'Tesseract Bench · dual layer' }[r.station];
    const sta = el('div', 'rsta ' + r.station, stationName);
    info.appendChild(sta);
    card.appendChild(info);
    return card;
  }

  function smeltCard(s) {
    const card = el('div', 'recipe-card');
    const g = el('div', 'mini');
    g.style.gridTemplateColumns = '22px';
    g.appendChild(mini(s.input));
    card.appendChild(g);
    const res = el('div', 'mini');
    res.style.gridTemplateColumns = '30px';
    const rm = el('div', 'm');
    rm.style.width = '30px'; rm.style.height = '30px';
    const ri = el('div', 'icon');
    ri.setAttribute('style', iconStyleString(s.output, 28));
    rm.appendChild(ri);
    res.appendChild(rm);
    card.appendChild(res);
    const info = el('div', 'rinfo');
    const it = getItem(s.output);
    info.appendChild(el('div', 'rname', it ? it.display : s.output));
    info.appendChild(el('div', 'rsta table', `Smelter · ${s.time}s`));
    card.appendChild(info);
    return card;
  }

  for (const g of groups) {
    const b = el('div', 'codex-group' + (g === active ? ' on' : ''), g);
    b.addEventListener('click', () => {
      active = g;
      Array.from(groupsEl.children).forEach((c) => c.classList.toggle('on', c.textContent === g));
      renderList();
      sfx.click();
    });
    groupsEl.appendChild(b);
  }
  renderList();

  const foot = el('div', 'foot');
  const back = el('button', 'btn inline', 'Close Codex');
  back.addEventListener('click', () => close());
  foot.appendChild(back);
  panel.appendChild(foot);

  screen.appendChild(panel);
  overlay.appendChild(screen);

  function close() {
    screen.remove();
    for (const c of prev) c.style.display = '';
    closeFn = null;
    sfx.uiClose();
  }
  closeFn = close;
  sfx.uiOpen();
}
