// ---------------------------------------------------------------------------
// The heads-up display: telemetry, chevron vitals, the slanted hotbar ribbon,
// the tesseract reticle, toasts, and the Slice Compass.
// ---------------------------------------------------------------------------

import { el, clear, $ } from './dom.js';
import { applyIcon, iconStyleString } from '../render/atlas.js';
import { getItem, RARITY_COLOR } from '../world/items.js';
import { LAYER_NAMES, W_LAYERS, W_MID } from '../world/constants.js';
import { IS_SOLID, block } from '../world/blocks.js';
import { blockAvgColor } from '../render/atlas.js';
import { HOTBAR } from '../world/inventory.js';
import { clamp } from '../core/mathx.js';

const CROSSHAIRS = {
  tesseract: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26">
    <g fill="none" stroke="%23ffffff" stroke-width="1.6" stroke-linecap="square">
      <path d="M13 1.5 L13 7 M13 19 L13 24.5 M1.5 13 L7 13 M19 13 L24.5 13"/>
      <rect x="10" y="10" width="6" height="6" stroke-width="1.2"/>
    </g></svg>`,
  dot: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26">
    <circle cx="13" cy="13" r="2" fill="%23ffffff"/></svg>`,
  cross: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26">
    <g stroke="%23ffffff" stroke-width="2"><path d="M13 5 L13 21 M5 13 L21 13"/></g></svg>`,
};

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('#hud');
    this.hotbarEl = $('#hotbar');
    this.heldName = $('#held-name');
    this.toastsEl = $('#toasts');
    this.compass = $('#compass-canvas');
    this.cctx = this.compass.getContext('2d');
    this.compassLabel = $('#compass-label');
    this.debugEl = $('#debug');
    this.interactEl = $('#interact-prompt');
    this.slots = [];
    this.lastSelected = -1;
    this.heldTimer = 0;
    this.compassTimer = 0;
    this.compassCache = null;
    this.setCrosshair('tesseract');
    this.buildHotbar();
  }

  setCrosshair(kind) {
    const svg = CROSSHAIRS[kind] || CROSSHAIRS.tesseract;
    $('#crosshair').style.backgroundImage = `url("data:image/svg+xml,${svg.replace(/\n\s*/g, ' ')}")`;
  }

  buildHotbar() {
    clear(this.hotbarEl);
    this.slots = [];
    for (let i = 0; i < HOTBAR; i++) {
      const s = el('div', 'hb-slot');
      s.appendChild(el('div', 'num', String(i + 1)));
      const icon = el('div', 'icon');
      s.appendChild(icon);
      const cnt = el('div', 'cnt');
      s.appendChild(cnt);
      const dur = el('div', 'dur hidden');
      dur.appendChild(el('i'));
      s.appendChild(dur);
      this.hotbarEl.appendChild(s);
      this.slots.push({ root: s, icon, cnt, dur });
    }
  }

  showHeld() {
    const st = this.game.player.inventory.held;
    if (!st) { this.heldName.classList.remove('show'); return; }
    const it = getItem(st.item);
    this.heldName.textContent = it ? it.display : st.item;
    this.heldName.style.color = it ? RARITY_COLOR[it.rarity] : '#fff';
    this.heldName.classList.add('show');
    this.heldTimer = 2.2;
  }

  toast(title, detail, kind) {
    const t = el('div', 'toast' + (kind ? ' ' + kind : ''));
    if (kind === 'item' || (detail && detail.icon)) { /* noop */ }
    const wrap = el('div');
    wrap.appendChild(el('div', 'tt', title));
    if (detail) wrap.appendChild(el('div', 'td', detail));
    t.appendChild(wrap);
    this.toastsEl.appendChild(t);
    setTimeout(() => { t.classList.add('fade'); setTimeout(() => t.remove(), 400); }, 3600);
    while (this.toastsEl.children.length > 5) this.toastsEl.firstChild.remove();
  }

  update(dt) {
    const g = this.game, p = g.player;

    // vitals
    const set = (id, num, v, max, low) => {
      const fill = document.getElementById('m-' + id);
      const n = document.getElementById('n-' + id);
      if (!fill) return;
      fill.style.width = clamp(v / max, 0, 1) * 100 + '%';
      n.textContent = num;
      fill.parentElement.parentElement.classList.toggle('low', v / max < low);
    };
    set('health', Math.ceil(p.health), p.health, p.maxHealth, 0.25);
    set('food', Math.ceil(p.food), p.food, p.maxFood, 0.2);
    set('phase', Math.round(p.stability), p.stability, 100, 0.2);
    const airMeter = document.querySelector('.meter-air');
    if (p.headInWater || (p.air !== undefined && p.air < 9.9)) {
      airMeter.classList.remove('hidden');
      set('air', Math.ceil(p.air), p.air, 10, 0.3);
    } else airMeter.classList.add('hidden');

    // telemetry
    $('#tele-pos').textContent = `${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}`;
    const layerName = LAYER_NAMES[p.slice] || `W${p.slice}`;
    const frac = p.w - p.slice;
    $('#tele-layer').textContent = Math.abs(frac) > 0.04
      ? `${layerName} ${frac > 0 ? '+' : '−'}${Math.abs(frac).toFixed(2)}`
      : layerName;
    $('#tele-biome').textContent = g.world.biomeAt(Math.floor(p.x), Math.floor(p.z), p.slice).name;
    const t = g.world.time % 24000;
    const hh = String(Math.floor(t / 1000)).padStart(2, '0');
    const mm = String(Math.floor((t % 1000) / 1000 * 60)).padStart(2, '0');
    $('#tele-clock').textContent = `${hh}:${mm}`;

    // hotbar
    const inv = p.inventory;
    for (let i = 0; i < HOTBAR; i++) {
      const s = this.slots[i];
      const st = inv.slots[i];
      s.root.classList.toggle('sel', i === inv.selected);
      if (!st) {
        s.icon.style.backgroundImage = 'none';
        s.icon.style.width = '32px'; s.icon.style.height = '32px';
        s.cnt.textContent = '';
        s.dur.classList.add('hidden');
      } else {
        applyIcon(s.icon, st.item, 32);
        s.cnt.textContent = st.count > 1 ? st.count : '';
        const def = getItem(st.item);
        if (def && def.durability && st.dur !== undefined) {
          s.dur.classList.remove('hidden');
          const f = clamp(st.dur / def.durability, 0, 1);
          s.dur.firstChild.style.width = f * 100 + '%';
          s.dur.firstChild.style.background = f > 0.5 ? 'var(--green)' : (f > 0.22 ? 'var(--amber)' : 'var(--rose)');
        } else s.dur.classList.add('hidden');
      }
    }
    if (inv.selected !== this.lastSelected) { this.lastSelected = inv.selected; this.showHeld(); }
    if (this.heldTimer > 0) { this.heldTimer -= dt; if (this.heldTimer <= 0) this.heldName.classList.remove('show'); }

    // crosshair / phase overlays
    const ch = $('#crosshair');
    ch.classList.toggle('phasing', p.phaseHeld);
    $('#phase-vignette').style.opacity = p.phaseHeld ? String(0.35 + Math.abs(p.w - p.slice) * 1.2) : '0';
    $('#hit-vignette').classList.toggle('on', p.hurtTimer > 0.2);

    // slice compass
    this.compassTimer -= dt;
    if (this.compassTimer <= 0) { this.compassTimer = 0.09; this.drawCompass(); }
    this.compassLabel.textContent = LAYER_NAMES[p.slice] || `W${p.slice}`;
  }

  setInteract(text) {
    if (!text) { this.interactEl.classList.add('hidden'); return; }
    this.interactEl.classList.remove('hidden');
    this.interactEl.innerHTML = text;
  }

  // -------------------------------------------------------------------------
  // The Slice Compass: an isometric stack of hyper-layers, each showing a live
  // cross-section of the terrain around you at that depth.
  // -------------------------------------------------------------------------
  drawCompass() {
    const ctx = this.cctx;
    const W = this.compass.width, H = this.compass.height;
    const g = this.game, p = g.player, world = g.world;
    ctx.clearRect(0, 0, W, H);

    const N = 4;                       // 9x9 samples around the player
    const plateW = 124, plateH = 62;
    const spacing = 25;
    const cx = W * 0.44, cy0 = 54;
    const py = Math.floor(p.y) - 1;
    const pxi = Math.floor(p.x), pzi = Math.floor(p.z);
    const cw = (plateW / 2) / (N + 1), chh = (plateH / 2) / (N + 1);
    const plateY = (w) => cy0 + (W_LAYERS - 1 - w) * spacing;

    // spine through the stack, so the plates read as one object
    ctx.strokeStyle = 'rgba(110,231,255,.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, plateY(W_LAYERS - 1) - plateH / 2 - 4);
    ctx.lineTo(cx, plateY(0) + plateH / 2 + 4);
    ctx.stroke();

    // ana / kata direction labels
    ctx.font = 'bold 9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,196,107,.75)';
    ctx.fillText('ANA \u25B2', cx, plateY(W_LAYERS - 1) - plateH / 2 - 10);
    ctx.fillStyle = 'rgba(185,139,255,.75)';
    ctx.fillText('\u25BC KATA', cx, plateY(0) + plateH / 2 + 17);

    for (let k = 0; k < W_LAYERS; k++) {
      const w = W_LAYERS - 1 - k;      // draw back (ana) to front (kata)
      const cy = plateY(w);
      const dist = Math.abs(p.w - w);
      const isCur = w === p.slice;
      const near = dist < 1.05;

      ctx.beginPath();
      ctx.moveTo(cx, cy - plateH / 2);
      ctx.lineTo(cx + plateW / 2, cy);
      ctx.lineTo(cx, cy + plateH / 2);
      ctx.lineTo(cx - plateW / 2, cy);
      ctx.closePath();
      ctx.fillStyle = isCur ? 'rgba(16,54,74,.88)' : (near ? 'rgba(11,20,33,.72)' : 'rgba(8,12,20,.6)');
      ctx.fill();
      ctx.lineWidth = isCur ? 2 : 1;
      ctx.strokeStyle = isCur ? 'rgba(110,231,255,1)'
        : (near ? 'rgba(110,231,255,.42)' : 'rgba(96,112,138,.45)');
      ctx.stroke();

      // Live cross-section of the terrain at that depth. Layers that are
      // actually loaded read their real blocks (caves and your own building
      // included); the rest fall back to the generator's heightmap, which is
      // cheap and keeps every plate informative.
      const ready = world.isSliceReady(pxi >> 4, pzi >> 4, w);
      const alpha = isCur ? 1 : Math.max(0.24, 0.66 - dist * 0.12);
      for (let i = -N; i <= N; i++) {
        for (let j = -N; j <= N; j++) {
          let r, gg, b, glow = false;
          if (ready) {
            const id = world.getBlock(pxi + i, py, pzi + j, w);
            if (!IS_SOLID[id]) continue;
            const c = blockAvgColor;
            r = c[id * 3] * 255; gg = c[id * 3 + 1] * 255; b = c[id * 3 + 2] * 255;
            glow = block(id).emit > 6;
          } else {
            if (world.gen.heightAt(pxi + i, pzi + j, w) < py) continue;
            r = 96; gg = 108; b = 126;
          }
          const sx = cx + (i - j) * cw;
          const sy = cy + (i + j) * chh;
          ctx.beginPath();
          ctx.moveTo(sx, sy - chh);
          ctx.lineTo(sx + cw, sy);
          ctx.lineTo(sx, sy + chh);
          ctx.lineTo(sx - cw, sy);
          ctx.closePath();
          const boost = isCur ? 1.3 : 0.9;
          ctx.fillStyle = `rgba(${Math.min(255, r * boost) | 0},${Math.min(255, gg * boost) | 0},${Math.min(255, b * boost) | 0},${alpha})`;
          ctx.fill();
          if (glow) { ctx.fillStyle = `rgba(255,232,160,${alpha * 0.7})`; ctx.fill(); }
        }
      }

      if (isCur) {
        // you are here
        ctx.beginPath();
        ctx.arc(cx, cy, 3.8, 0, Math.PI * 2);
        ctx.fillStyle = '#ffc46b';
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(0,0,0,.85)';
        ctx.stroke();
      }

      ctx.font = `${isCur ? 'bold ' : ''}9px ui-monospace, monospace`;
      ctx.textAlign = 'left';
      ctx.fillStyle = isCur ? '#6ee7ff' : (near ? 'rgba(160,175,198,.85)' : 'rgba(107,122,146,.5)');
      ctx.fillText(LAYER_NAMES[w].replace('ORIGIN', 'ORIG'), cx + plateW / 2 + 7, cy + 3.5);
    }

    // travelling pip: exactly where you are between plates
    const pipY = cy0 + (W_LAYERS - 1 - p.w) * spacing;
    ctx.beginPath();
    ctx.moveTo(cx - plateW / 2 - 15, pipY);
    ctx.lineTo(cx - plateW / 2 - 6, pipY - 5);
    ctx.lineTo(cx - plateW / 2 - 6, pipY + 5);
    ctx.closePath();
    ctx.fillStyle = p.phaseHeld ? '#ffc46b' : '#6ee7ff';
    ctx.fill();

    if (p.phaseBlocked > 0) {
      ctx.strokeStyle = 'rgba(255,122,156,.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(3, 3, W - 6, H - 6);
      ctx.fillStyle = 'rgba(255,122,156,.95)';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BLOCKED', W / 2, H - 8);
    }
  }

  setDebug(text) {
    if (!text) { this.debugEl.classList.add('hidden'); return; }
    this.debugEl.classList.remove('hidden');
    this.debugEl.textContent = text;
  }
}
