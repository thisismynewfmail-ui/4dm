// NPC conversation and trading.

import { el, $ } from './dom.js';
import { iconStyleString } from '../render/atlas.js';
import { getItem } from '../world/items.js';
import { sfx } from '../audio/sfx.js';

export class Dialogue {
  constructor(game) {
    this.game = game;
    this.overlay = $('#overlay');
    this.npc = null;
    this.node = null;
    this.mode = 'talk';
  }

  isOpen() { return !!this.npc; }

  open(npc) {
    this.npc = npc;
    this.mode = 'talk';
    this.render();
    sfx.uiOpen();
  }

  close() {
    if (!this.npc) return;
    this.npc = null;
    if (this.node) { this.node.remove(); this.node = null; }
    sfx.uiClose();
  }

  render() {
    if (this.node) this.node.remove();
    const npc = this.npc;
    const wrap = el('div', 'screen dim');
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) this.close(); });
    const p = el('div', 'panel dialogue');
    p.appendChild(el('div', 'who', npc.name));
    p.appendChild(el('div', 'role', `${npc.def.name} \u00b7 ${npc.def.title}`));

    if (this.mode === 'talk') {
      p.appendChild(el('div', 'line', npc.greeting()));
      const acts = el('div', 'acts');
      const b1 = el('button', 'btn sm inline', 'Trade');
      b1.addEventListener('click', () => { this.mode = 'trade'; this.render(); sfx.click(); });
      const b2 = el('button', 'btn sm inline', 'Ask again');
      b2.addEventListener('click', () => { npc.nextLine(); this.render(); sfx.click(); });
      const b3 = el('button', 'btn sm inline', 'Leave');
      b3.addEventListener('click', () => this.close());
      acts.appendChild(b1); acts.appendChild(b2); acts.appendChild(b3);
      p.appendChild(acts);
    } else {
      p.appendChild(el('div', 'line', 'Shards for goods. Nothing crosses a layer twice.'));
      const list = el('div', 'trade-list');
      const inv = this.game.player.inventory;
      npc.def.trades.forEach((t, i) => {
        const can = t.give.every(([item, n]) => inv.count(item) >= n);
        const row = el('div', 'trade' + (can ? '' : ' no'));
        const give = el('div', 'give');
        for (const [item, n] of t.give) {
          const ic = el('div', 'icon');
          ic.setAttribute('style', iconStyleString(item, 24));
          give.appendChild(ic);
          give.appendChild(el('span', 'lbl', `${n} ${getItem(item) ? getItem(item).display : item}`));
        }
        row.appendChild(give);
        row.appendChild(el('div', 'sep', '→'));
        const get = el('div', 'get');
        const [gi, gn] = t.get;
        const ic2 = el('div', 'icon');
        ic2.setAttribute('style', iconStyleString(gi, 24));
        get.appendChild(ic2);
        get.appendChild(el('span', 'lbl', `${gn} ${getItem(gi) ? getItem(gi).display : gi}`));
        row.appendChild(get);
        if (can) {
          row.addEventListener('click', () => {
            for (const [item, n] of t.give) inv.remove(item, n);
            const left = inv.addSmart(gi, gn);
            if (left > 0) this.game.dropStack({ item: gi, count: left });
            sfx.craft();
            this.game.hud.toast('Traded', `${getItem(gi) ? getItem(gi).display : gi} ×${gn}`);
            this.render();
          });
        }
        list.appendChild(row);
      });
      p.appendChild(list);
      const acts = el('div', 'acts');
      const b1 = el('button', 'btn sm inline', 'Back');
      b1.addEventListener('click', () => { this.mode = 'talk'; this.render(); sfx.click(); });
      const b2 = el('button', 'btn sm inline', 'Leave');
      b2.addEventListener('click', () => this.close());
      acts.appendChild(b1); acts.appendChild(b2);
      p.appendChild(acts);
    }

    wrap.appendChild(p);
    this.overlay.appendChild(wrap);
    this.node = wrap;
  }
}
