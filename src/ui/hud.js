// ---------------------------------------------------------------------------
// The heads-up display: telemetry, chevron vitals, the slanted hotbar ribbon,
// the tesseract reticle, toasts, and the Slice Compass.
// ---------------------------------------------------------------------------

import { el, clear, $ } from './dom.js';
import { applyIcon } from '../render/atlas.js';
import { getItem, RARITY_COLOR } from '../world/items.js';
import { layerName, layerShort, W_LAYERS, W_MID } from '../world/constants.js';
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
    this.tapeEl = $('#hyper-tape');
    this.tape = $('#tape-canvas');
    this.tctx = this.tape.getContext('2d');
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
    const name = layerName(p.slice);
    const frac = p.w - p.slice;
    $('#tele-layer').textContent = Math.abs(frac) > 0.02
      ? `${name} ${frac > 0 ? '+' : '−'}${Math.abs(frac).toFixed(2)}`
      : name;
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
    // the vignette tracks travel *speed*, so holding F is calm and moving is not
    const travel = Math.min(1, p.phaseSpeed / 2.6);
    $('#phase-vignette').style.opacity =
      String((p.phaseHeld ? 0.1 : 0) + travel * 0.5);
    $('#hit-vignette').classList.toggle('on', p.hurtTimer > 0.2);

    // slice compass
    // The compass slides continuously with W, so travel is visible in it even
    // between whole layers; it is redrawn every frame while moving.
    const travelling = p.phaseHeld || Math.abs(p.w - p.wTarget) > 1e-3;
    this.compassTimer -= dt;
    if (travelling || this.compassTimer <= 0) {
      this.compassTimer = travelling ? 0 : 0.1;
      this.drawCompass();
    }
    this.compassLabel.textContent = layerName(p.slice);

    // hyper-tape: only while the drive is engaged or still settling
    const showTape = this.game.settings.hyperTape && (p.phaseHeld || Math.abs(p.w - p.wTarget) > 1e-3);
    this.tapeEl.classList.toggle('on', showTape);
    this.tapeEl.classList.toggle('hidden', false);
    if (showTape) this.drawTape();
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
  // -------------------------------------------------------------------------
  // The Slice Compass.
  //
  // A window of hyper-layers around you, drawn as an isometric stack that
  // slides *continuously* with W: at W = 20.4 the plates sit four tenths of a
  // step along, so the instrument moves with the world instead of ticking
  // after it. Each plate carries a live cross-section of the terrain at that
  // depth, which is the one thing a 3D view of a 4D world cannot show you.
  // -------------------------------------------------------------------------
  drawCompass() {
    const ctx = this.cctx;
    const W = this.compass.width, H = this.compass.height;
    const g = this.game, p = g.player, world = g.world;
    ctx.clearRect(0, 0, W, H);

    const N = 4;                        // 9x9 terrain samples per plate
    const VIS = 4;                      // layers shown either side of you
    const plateW = 120, plateH = 60;
    const spacing = 26;
    const cx = W * 0.42, cyMid = 118;
    const pxi = Math.floor(p.x), pzi = Math.floor(p.z);
    // Sample at your feet — that is the phase-safety question. If you are well
    // above the ground the answer would be "air everywhere", so drop to the
    // surface instead and show what you would be landing on.
    const py = Math.min(Math.floor(p.y) - 1, world.heightAt(pxi, pzi, p.slice));
    const cw = (plateW / 2) / (N + 1), chh = (plateH / 2) / (N + 1);
    const yFor = (layer) => cyMid + (p.w - layer) * spacing;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 8, W, H - 40);
    ctx.clip();

    // spine
    ctx.strokeStyle = 'rgba(110,231,255,.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 8); ctx.lineTo(cx, H - 32);
    ctx.stroke();

    const lo = Math.max(0, Math.floor(p.w) - VIS);
    const hi = Math.min(W_LAYERS - 1, Math.ceil(p.w) + VIS);
    const here = p.slice;

    const drawPlate = (layer) => {
      const cy = yFor(layer);
      if (cy < -plateH || cy > H + plateH) return;
      const dist = Math.abs(p.w - layer);
      const isCur = layer === here;
      const fade = Math.max(0, 1 - dist / (VIS + 0.6));

      ctx.beginPath();
      ctx.moveTo(cx, cy - plateH / 2);
      ctx.lineTo(cx + plateW / 2, cy);
      ctx.lineTo(cx, cy + plateH / 2);
      ctx.lineTo(cx - plateW / 2, cy);
      ctx.closePath();
      ctx.fillStyle = isCur ? 'rgba(14,46,64,.92)' : `rgba(9,14,23,${0.26 + fade * 0.3})`;
      ctx.fill();
      ctx.lineWidth = isCur ? 2 : 1;
      ctx.strokeStyle = isCur
        ? 'rgba(110,231,255,1)'
        : `rgba(${dist < 1.5 ? '110,231,255' : '96,112,138'},${0.12 + fade * 0.3})`;
      ctx.stroke();

      // live cross-section: real blocks where the layer is loaded, the
      // generator's heightmap everywhere else, so no plate is ever blank
      const ready = world.isSliceReady(pxi >> 4, pzi >> 4, layer);
      const alpha = isCur ? 1 : 0.16 + fade * 0.3;
      for (let i = -N; i <= N; i++) {
        for (let j = -N; j <= N; j++) {
          let r, gg, b, glow = false;
          if (ready) {
            const id = world.getBlock(pxi + i, py, pzi + j, layer);
            if (!IS_SOLID[id]) continue;
            const c = blockAvgColor;
            r = c[id * 3] * 255; gg = c[id * 3 + 1] * 255; b = c[id * 3 + 2] * 255;
            glow = block(id).emit > 6;
          } else {
            if (world.gen.heightAt(pxi + i, pzi + j, layer) < py) continue;
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
          const boost = isCur ? 1.35 : 0.85;
          ctx.fillStyle = `rgba(${Math.min(255, r * boost) | 0},${Math.min(255, gg * boost) | 0},${Math.min(255, b * boost) | 0},${alpha})`;
          ctx.fill();
          if (glow) { ctx.fillStyle = `rgba(255,232,160,${alpha * 0.8})`; ctx.fill(); }
        }
      }

      if (dist < 2.6) {
        ctx.font = `${isCur ? 'bold ' : ''}9px ui-monospace, monospace`;
        ctx.textAlign = 'left';
        ctx.fillStyle = isCur ? '#6ee7ff' : `rgba(150,166,190,${0.22 + fade * 0.5})`;
        ctx.fillText(layerShort(layer), cx + plateW / 2 + 6, cy + 3.5);
      }
    };

    // back (ana) to front (kata), then the layer you occupy on top of the lot
    // so it is never buried under the plates in front of it
    for (let layer = hi; layer >= lo; layer--) if (layer !== here) drawPlate(layer);
    if (here >= lo && here <= hi) drawPlate(here);
    ctx.restore();

    // you: always dead centre, because the stack moves and you do not
    ctx.beginPath();
    ctx.arc(cx, cyMid, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffc46b';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(0,0,0,.85)';
    ctx.stroke();

    // travel target marker
    if (Math.abs(p.wTarget - p.w) > 0.01) {
      const ty = yFor(p.wTarget);
      ctx.strokeStyle = 'rgba(255,196,107,.85)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(cx - plateW / 2, Math.max(10, Math.min(H - 34, ty)));
      ctx.lineTo(cx + plateW / 2, Math.max(10, Math.min(H - 34, ty)));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // direction labels
    ctx.font = 'bold 9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,196,107,.7)';
    ctx.fillText('ANA \u25B2', cx, 16);
    ctx.fillStyle = 'rgba(185,139,255,.7)';
    ctx.fillText('\u25BC KATA', cx, H - 20);

    // full-range ruler down the right edge: where this window sits in W
    const rx = W - 13, rTop = 22, rBot = H - 30;
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.fillRect(rx - 3, rTop, 6, rBot - rTop);
    const frac = p.w / (W_LAYERS - 1);
    const midY = rTop + (1 - frac) * (rBot - rTop);
    ctx.fillStyle = 'rgba(110,231,255,.28)';
    const halfSpan = (VIS / (W_LAYERS - 1)) * (rBot - rTop);
    ctx.fillRect(rx - 3, midY - halfSpan, 6, halfSpan * 2);
    ctx.fillStyle = '#ffc46b';
    ctx.fillRect(rx - 5, midY - 1, 10, 2);

    if (p.phaseBlocked > 0) {
      ctx.strokeStyle = 'rgba(255,122,156,.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(3, 3, W - 6, H - 6);
    }
  }

  // -------------------------------------------------------------------------
  // The hyper-tape: a filmstrip of the fourth axis that slides past while the
  // phase drive is engaged, so travel has a readable speed and destination.
  // -------------------------------------------------------------------------
  drawTape() {
    const ctx = this.tctx;
    const W = this.tape.width, H = this.tape.height;
    const p = this.game.player;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2;
    const px = 46;                      // pixels per hyper-layer
    const xFor = (layer) => cx + (layer - p.w) * px;

    // baseline
    ctx.strokeStyle = 'rgba(110,231,255,.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H - 20); ctx.lineTo(W, H - 20);
    ctx.stroke();

    const lo = Math.max(0, Math.floor(p.w - W / (2 * px)) - 1);
    const hi = Math.min(W_LAYERS - 1, Math.ceil(p.w + W / (2 * px)) + 1);
    for (let L = lo; L <= hi; L++) {
      const x = xFor(L);
      const d = Math.abs(x - cx) / (W / 2);
      const a = Math.max(0, 1 - d * d);
      const major = (L - W_MID) % 5 === 0;
      const h = major ? 20 : 11;
      ctx.strokeStyle = L === W_MID ? `rgba(255,196,107,${a})` : `rgba(150,200,225,${a * 0.75})`;
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, H - 20); ctx.lineTo(x, H - 20 - h);
      ctx.stroke();
      if (major && a > 0.25) {
        ctx.fillStyle = L === W_MID ? `rgba(255,196,107,${a})` : `rgba(190,210,230,${a * 0.8})`;
        ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(layerShort(L), x, H - 46);
      }
    }

    // destination
    if (Math.abs(p.wTarget - p.w) > 0.01) {
      const tx = Math.max(9, Math.min(W - 9, xFor(p.wTarget)));
      ctx.strokeStyle = 'rgba(255,196,107,.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx, H - 20); ctx.lineTo(tx, H - 44);
      ctx.stroke();
      ctx.fillStyle = '#ffc46b';
      ctx.beginPath();
      ctx.moveTo(tx, H - 20);
      ctx.lineTo(tx - 9, H - 4);
      ctx.lineTo(tx + 9, H - 4);
      ctx.closePath();
      ctx.fill();
    }

    // where you are, spelled out
    ctx.fillStyle = 'rgba(110,231,255,.9)';
    ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(layerName(p.slice), 10, 20);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(150,166,190,.75)';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('HOLD F \u00b7 SCROLL', W - 10, 20);

    // you
    ctx.strokeStyle = '#6ee7ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, H - 20 - 26); ctx.lineTo(cx, H - 20 + 6);
    ctx.stroke();
    ctx.fillStyle = '#6ee7ff';
    ctx.beginPath();
    ctx.moveTo(cx, H - 20 - 30);
    ctx.lineTo(cx - 6, H - 20 - 40);
    ctx.lineTo(cx + 6, H - 20 - 40);
    ctx.closePath();
    ctx.fill();
  }

  setDebug(text) {
    if (!text) { this.debugEl.classList.add('hidden'); return; }
    this.debugEl.classList.remove('hidden');
    this.debugEl.textContent = text;
  }
}
