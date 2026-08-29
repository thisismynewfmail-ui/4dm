// ---------------------------------------------------------------------------
// Front end: main menu, world manager, world creation, settings, the honest
// "coming soon" panels, pause and death screens.
// ---------------------------------------------------------------------------

import { el, clear, $, esc } from './dom.js';
import { listWorlds, createWorld, deleteWorld, duplicateWorld, updateMeta, getMeta, storageUsage } from '../save/storage.js';
import { fmtDate, fmtTime, clamp } from '../core/mathx.js';
import { hashSeed } from '../core/rng.js';
import { LAYER_NAMES, W_LAYERS } from '../world/constants.js';
import { sfx, setVolume } from '../audio/sfx.js';

const TIPS = [
  'Hold <b>F</b> and move the mouse to look through the fourth dimension.',
  'The Slice Compass in the corner shows a cross-section of every hyper-layer at once.',
  'A cave that dead-ends in your layer often keeps going in the next one.',
  'Phaseite only grows in the outer hyper-layers. Aetherite hugs the core.',
  'Anchor Blocks restore Phase Stability fast. Build your base on one.',
  'Some creatures are 4D. You only ever see the slice of them that intersects you.',
  'Your inventory has a 4×4 assembly grid. A Fabricator unlocks 4-wide patterns.',
  'The Tesseract Bench crafts with two hyper-layers of pattern at once.',
  'Each layer has its own colour of light. Learn them and you will never be lost.',
  'You cannot materialise inside stone. The phase drive will refuse and shove you back.',
  'Press <b>C</b> anywhere to open the Codex and see every recipe.',
  'Rift Blocks push you one layer along W. They make excellent elevators.',
];

const ROADMAP_MP = [
  ['done', 'Deterministic world seeds', 'Every hyperworld is reproducible from its seed, which is the hard part of shared worlds.'],
  ['done', 'Authoritative block journal', 'All edits already live in a compact replayable journal, ready to stream.'],
  ['wip', 'Hyper-layer presence', 'Showing other players as cross-sections when they are in a neighbouring layer.'],
  ['', 'Session hosting', 'Rooms, invites, and a lobby browser.'],
  ['', 'Shared entity simulation', 'One authority for mobs, items and containers.'],
];
const ROADMAP_MODS = [
  ['done', 'Data-driven registries', 'Blocks, items, recipes, mobs and NPCs are all declarative tables already.'],
  ['done', 'Procedural texture pipeline', 'Textures are functions, so a mod can add one without shipping an image.'],
  ['wip', 'Mod manifest format', 'A single JSON entry point that can register content at boot.'],
  ['', 'Sandboxed script hooks', 'Safe lifecycle hooks for tick, place, break and craft.'],
  ['', 'In-game browser', 'Install, enable and order mods without leaving the menu.'],
];

export class Menu {
  constructor(app) {
    this.app = app;
    this.overlay = $('#overlay');
    this.bgRaf = 0;
    this.selectedWorld = null;
  }

  // -------------------------------------------------------------------------
  clearScreen() {
    this.stopBackground();
    clear(this.overlay);
  }

  hide() { this.clearScreen(); }

  // -------------------------------------------------------------------------
  // Animated tesseract background
  // -------------------------------------------------------------------------
  makeShell(cardBuilder) {
    const screen = el('div', 'screen');
    const cv = el('canvas');
    cv.id = 'menu-bg';
    screen.appendChild(cv);

    const shell = el('div', 'menu-shell');
    const left = el('div', 'menu-left');
    const brand = el('div', 'brand');
    const logo = el('div', 'logo');
    logo.innerHTML = '4D<span class="sep">·</span>MC';
    brand.appendChild(logo);
    brand.appendChild(el('div', 'tag', 'a four-dimensional sandbox'));
    brand.appendChild(el('div', 'sub',
      'Six directions were never enough. Hold F and step sideways out of the world you were standing in.'));
    left.appendChild(brand);
    this.buttonsEl = el('div', 'menu-buttons');
    left.appendChild(this.buttonsEl);
    const foot = el('div', 'menu-foot');
    foot.innerHTML = `v1.0 &nbsp;·&nbsp; ${W_LAYERS} hyper-layers &nbsp;·&nbsp; local save`;
    left.appendChild(foot);
    shell.appendChild(left);

    const right = el('div', 'menu-right');
    const card = el('div', 'panel menu-card');
    right.appendChild(card);
    shell.appendChild(right);
    screen.appendChild(shell);
    this.overlay.appendChild(screen);
    this.startBackground(cv);
    cardBuilder(card);
    return { screen, card };
  }

  startBackground(cv) {
    const ctx = cv.getContext('2d');
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = cv.clientWidth * dpr;
      cv.height = cv.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    this._resize = resize;
    window.addEventListener('resize', resize);

    // tesseract vertices and edges
    const verts = [];
    for (let i = 0; i < 16; i++) {
      verts.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
    }
    const edges = [];
    for (let a = 0; a < 16; a++) for (let b = a + 1; b < 16; b++) {
      let diff = 0;
      for (let k = 0; k < 4; k++) if (verts[a][k] !== verts[b][k]) diff++;
      if (diff === 1) edges.push([a, b]);
    }
    const motes = [];
    for (let i = 0; i < 60; i++) {
      motes.push({ x: Math.random(), y: Math.random(), s: 1 + Math.random() * 3, v: 0.004 + Math.random() * 0.012, o: 0.05 + Math.random() * 0.22 });
    }

    let t0 = performance.now();
    const draw = (now) => {
      const t = (now - t0) / 1000;
      const W = cv.clientWidth, H = cv.clientHeight;
      ctx.clearRect(0, 0, W, H);

      // drifting voxel motes
      for (const m of motes) {
        m.y -= m.v * 0.01;
        if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
        ctx.fillStyle = `rgba(140,200,235,${m.o})`;
        ctx.fillRect(m.x * W, m.y * H, m.s * 3, m.s * 3);
      }

      // the tesseract, rotating in two independent planes
      const cx = W * 0.66, cy = H * 0.5;
      const scale = Math.min(W, H) * 0.23;
      const a1 = t * 0.22, a2 = t * 0.31, a3 = t * 0.14;
      const proj = verts.map((v) => {
        let [x, y, z, w] = v;
        // XW rotation — this is the one that makes it look four-dimensional
        let nx = x * Math.cos(a1) - w * Math.sin(a1);
        let nw = x * Math.sin(a1) + w * Math.cos(a1);
        x = nx; w = nw;
        // YZ
        let ny = y * Math.cos(a2) - z * Math.sin(a2);
        let nz = y * Math.sin(a2) + z * Math.cos(a2);
        y = ny; z = nz;
        // XY for readability
        nx = x * Math.cos(a3) - y * Math.sin(a3);
        ny = x * Math.sin(a3) + y * Math.cos(a3);
        x = nx; y = ny;
        const k4 = 2.6 / (2.6 - w);
        x *= k4; y *= k4; z *= k4;
        const k3 = 3.2 / (3.2 - z);
        return [cx + x * scale * k3, cy + y * scale * k3, k4];
      });
      for (const [a, b] of edges) {
        const pa = proj[a], pb = proj[b];
        const depth = (pa[2] + pb[2]) / 2;
        ctx.strokeStyle = `rgba(110,231,255,${clamp(0.06 + depth * 0.20, 0.04, 0.52)})`;
        ctx.lineWidth = clamp(depth * 1.1, 0.4, 2.2);
        ctx.beginPath();
        ctx.moveTo(pa[0], pa[1]);
        ctx.lineTo(pb[0], pb[1]);
        ctx.stroke();
      }
      for (const p of proj) {
        ctx.fillStyle = `rgba(255,196,107,${clamp(p[2] * 0.30, 0.06, 0.62)})`;
        ctx.fillRect(p[0] - 2, p[1] - 2, 4, 4);
      }

      // horizon glow
      const grad = ctx.createLinearGradient(0, H * 0.55, 0, H);
      grad.addColorStop(0, 'rgba(30,52,80,0)');
      grad.addColorStop(1, 'rgba(20,36,58,.45)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);

      this.bgRaf = requestAnimationFrame(draw);
    };
    this.bgRaf = requestAnimationFrame(draw);
  }

  stopBackground() {
    if (this.bgRaf) cancelAnimationFrame(this.bgRaf);
    this.bgRaf = 0;
    if (this._resize) { window.removeEventListener('resize', this._resize); this._resize = null; }
  }

  btn(label, opts = {}) {
    const b = el('button', 'btn' + (opts.cls ? ' ' + opts.cls : ''));
    b.appendChild(el('span', null, label));
    if (opts.tag) b.appendChild(el('span', 'tagline', opts.tag));
    if (opts.disabled) b.disabled = true;
    if (opts.onClick) b.addEventListener('click', () => { sfx.click(); opts.onClick(); });
    return b;
  }

  // -------------------------------------------------------------------------
  showRoot() {
    this.clearScreen();
    this.makeShell((card) => {
      card.appendChild(el('h2', null, 'The Hyperworld'));
      card.appendChild(el('div', 'subtitle', 'What you are looking at is one slice of it.'));
      const body = el('div', 'body');
      body.innerHTML = `
        <p style="font-size:12.5px;line-height:1.9;color:var(--text-dim)">
          4D-MC is a first-person voxel sandbox built on a genuinely four-dimensional grid.
          You mine, build and survive inside a single three-dimensional <em>cross-section</em> of a
          much larger world — and you can move that cross-section.
        </p>
        <div class="rule"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px 20px;font-size:11.5px;line-height:1.75;color:var(--text-dim)">
          <div><b class="accent-cyan">HOLD F</b><br>Look and move through the fourth dimension. The world morphs around you.</div>
          <div><b class="accent-cyan">SLICE COMPASS</b><br>Bottom-right. A live cross-section of every hyper-layer you could be standing in.</div>
          <div><b class="accent-amber">PHASE STABILITY</b><br>Phasing costs it. Anchor Blocks and Chrono Berries give it back.</div>
          <div><b class="accent-amber">4D CREATURES</b><br>Some things here are only partly in your layer. You will see them cut open.</div>
        </div>
        <div class="rule"></div>
        <div style="font-size:11px;color:var(--slate-300);line-height:1.9">
          Worlds are stored in this browser. Nothing is uploaded.<br>
          Storage in use: <b>${(storageUsage() / 1024).toFixed(1)} KB</b> · Worlds saved: <b>${listWorlds().length}</b>
        </div>`;
      card.appendChild(body);
    });

    this.buttonsEl.appendChild(this.btn('Singleplayer', { cls: 'primary', tag: 'create · load', onClick: () => this.showSingleplayer() }));
    this.buttonsEl.appendChild(this.btn('Multiplayer', { cls: 'soon', tag: 'coming soon', onClick: () => this.showSoon('multiplayer') }));
    this.buttonsEl.appendChild(this.btn('Settings', { tag: 'controls · video', onClick: () => this.showSettings() }));
    this.buttonsEl.appendChild(this.btn('Mods', { cls: 'soon', tag: 'coming soon', onClick: () => this.showSoon('mods') }));
    this.buttonsEl.appendChild(this.btn('Quit', { cls: 'danger', tag: 'close', onClick: () => this.quit() }));
  }

  quit() {
    this.clearScreen();
    const s = el('div', 'screen');
    const p = el('div', 'panel death-panel');
    p.appendChild(el('h2', null, 'Session closed'));
    p.appendChild(el('div', 'cause', 'The hyperworld is still here. It is just not looking at you.'));
    const b = this.btn('Return', { cls: 'primary', onClick: () => this.showRoot() });
    b.style.width = '220px';
    b.style.margin = '0 auto';
    p.appendChild(b);
    s.appendChild(p);
    this.overlay.appendChild(s);
    try { window.close(); } catch (e) { /* browsers usually refuse; the panel is the fallback */ }
  }

  // -------------------------------------------------------------------------
  showSingleplayer() {
    this.clearScreen();
    let worlds = listWorlds();
    this.makeShell((card) => {
      card.appendChild(el('h2', null, 'Singleplayer'));
      card.appendChild(el('div', 'subtitle', 'Each world is a distinct hyperworld, grown from its seed.'));
      const body = el('div', 'body');
      const list = el('div', 'world-list');
      if (!worlds.length) {
        const note = el('div', 'empty-note');
        note.innerHTML = 'No worlds yet.<br>Create one — it takes a name and, if you want, a seed.';
        body.appendChild(note);
      } else {
        for (const w of worlds) list.appendChild(this.worldRow(w));
        body.appendChild(list);
      }
      card.appendChild(body);

      const foot = el('div', 'foot');
      foot.appendChild(this.btn('Create New World', { cls: 'primary', onClick: () => this.showCreate() }));
      const playBtn = this.btn('Play', { onClick: () => { if (this.selectedWorld) this.app.startWorld(this.selectedWorld); } });
      playBtn.disabled = true;
      this.playBtn = playBtn;
      foot.appendChild(playBtn);
      const delBtn = this.btn('Delete', {
        cls: 'danger',
        onClick: () => {
          if (!this.selectedWorld) return;
          const m = getMeta(this.selectedWorld);
          if (!m) return;
          this.confirm(`Delete “${m.name}”?`, 'This removes the world and everything built in it. It cannot be undone.', () => {
            deleteWorld(this.selectedWorld);
            this.selectedWorld = null;
            this.showSingleplayer();
          });
        },
      });
      delBtn.disabled = true;
      this.delBtn = delBtn;
      foot.appendChild(delBtn);
      const dupBtn = this.btn('Copy', {
        onClick: () => { if (this.selectedWorld) { duplicateWorld(this.selectedWorld); this.showSingleplayer(); } },
      });
      dupBtn.disabled = true;
      this.dupBtn = dupBtn;
      foot.appendChild(dupBtn);
      card.appendChild(foot);
    });
    this.buttonsEl.appendChild(this.btn('Back', { onClick: () => this.showRoot() }));
    this.selectedWorld = null;
  }

  worldRow(w) {
    const row = el('div', 'world-item');
    const sig = el('canvas', 'sigil');
    sig.width = 48; sig.height = 48;
    this.drawSigil(sig, hashSeed(w.seed || w.id));
    row.appendChild(sig);
    const info = el('div');
    info.appendChild(el('div', 'wname', w.name));
    const meta = el('div', 'wmeta');
    meta.textContent = `seed ${w.seed || '—'} · played ${fmtDate(w.lastPlayed)} · ${fmtTime(w.playtime || 0)}`;
    info.appendChild(meta);
    row.appendChild(info);
    row.appendChild(el('div', 'wmode' + (w.mode === 'creative' ? ' creative' : ''), w.mode));
    row.addEventListener('click', () => {
      this.selectedWorld = w.id;
      Array.from(row.parentElement.children).forEach((c) => c.classList.remove('sel'));
      row.classList.add('sel');
      if (this.playBtn) { this.playBtn.disabled = false; this.delBtn.disabled = false; this.dupBtn.disabled = false; }
      sfx.click();
    });
    row.addEventListener('dblclick', () => this.app.startWorld(w.id));
    return row;
  }

  /** A tiny deterministic emblem so worlds are recognisable at a glance. */
  drawSigil(cv, seed) {
    const ctx = cv.getContext('2d');
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    ctx.fillStyle = '#0a0e18';
    ctx.fillRect(0, 0, 48, 48);
    const hue = Math.floor(rnd() * 360);
    for (let i = 0; i < 5; i++) {
      const size = 40 - i * 7;
      const off = (48 - size) / 2 + (rnd() - 0.5) * 6;
      ctx.strokeStyle = `hsla(${(hue + i * 26) % 360}, 62%, ${45 + i * 7}%, ${0.85 - i * 0.1})`;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(off, off, size, size);
    }
    ctx.fillStyle = `hsl(${(hue + 180) % 360}, 78%, 66%)`;
    ctx.fillRect(22, 22, 4, 4);
  }

  // -------------------------------------------------------------------------
  showCreate() {
    this.clearScreen();
    const state = { name: this.suggestName(), seed: '', mode: 'survival', depth: 7 };
    this.makeShell((card) => {
      card.appendChild(el('h2', null, 'Create a world'));
      card.appendChild(el('div', 'subtitle', 'A name, a seed, and how deep the fourth dimension runs.'));
      const body = el('div', 'body');

      const nameF = el('div', 'field');
      nameF.innerHTML = `<label>World name</label><input type="text" id="cw-name" maxlength="40" value="${esc(state.name)}">
        <div class="hint">Shown in your world list. Purely cosmetic.</div>`;
      body.appendChild(nameF);

      const seedF = el('div', 'field');
      seedF.innerHTML = `<label>Seed</label>
        <div class="row"><input type="text" id="cw-seed" placeholder="leave blank for a random hyperworld" maxlength="48">
        <button class="btn sm inline" id="cw-roll" style="flex:0 0 120px">Roll</button></div>
        <div class="hint">Any text works and is hashed to 32 bits. The same seed always grows the same hyperworld — terrain, caves, biomes, structures and ore, in all ${W_LAYERS} layers.</div>`;
      body.appendChild(seedF);

      const modeF = el('div', 'field');
      modeF.innerHTML = `<label>Mode</label>
        <div class="seg" id="cw-mode">
          <button data-v="survival" class="on">Survival</button>
          <button data-v="creative">Creative</button>
        </div>
        <div class="hint" id="cw-mode-hint">Empty inventory, real damage, real hunger. Everything must be found or made.</div>`;
      body.appendChild(modeF);

      const depthF = el('div', 'field');
      depthF.innerHTML = `<label>Hyper-depth</label>
        <div class="set-row"><input type="range" id="cw-depth" min="3" max="7" step="2" value="7"><div class="val" id="cw-depth-v">7</div></div>
        <div class="hint">How many layers the fourth dimension has. Fewer layers means a tighter, faster world; seven is the full experience.</div>`;
      body.appendChild(depthF);

      const preview = el('div', 'field');
      preview.innerHTML = `<label>Layer stack</label><div id="cw-layers" style="display:flex;gap:4px"></div>`;
      body.appendChild(preview);

      card.appendChild(body);

      const foot = el('div', 'foot');
      foot.appendChild(this.btn('Create and Play', {
        cls: 'primary',
        onClick: () => {
          const name = $('#cw-name').value.trim() || 'New World';
          const seed = $('#cw-seed').value.trim() || String(Math.floor(Math.random() * 2147483647));
          const meta = createWorld({ name, seed, mode: state.mode, wDepth: state.depth });
          this.app.startWorld(meta.id);
        },
      }));
      foot.appendChild(this.btn('Cancel', { onClick: () => this.showSingleplayer() }));
      card.appendChild(foot);

      // wiring
      const renderLayers = () => {
        const host = $('#cw-layers');
        clear(host);
        const n = state.depth;
        const mid = (W_LAYERS - 1) >> 1;
        for (let i = 0; i < W_LAYERS; i++) {
          const active = Math.abs(i - mid) <= (n - 1) / 2;
          const d = el('div');
          d.style.cssText = `flex:1;height:26px;border:1px solid ${active ? 'var(--cyan-dim)' : 'var(--slate-600)'};` +
            `background:${active ? 'rgba(30,80,105,.5)' : 'rgba(10,14,24,.5)'};display:grid;place-items:center;` +
            `font-size:8px;letter-spacing:.08em;color:${active ? 'var(--cyan)' : 'var(--slate-400)'}`;
          d.textContent = LAYER_NAMES[i].split(' ')[0].slice(0, 4);
          host.appendChild(d);
        }
      };
      renderLayers();
      $('#cw-roll').addEventListener('click', () => {
        $('#cw-seed').value = String(Math.floor(Math.random() * 2147483647));
        sfx.click();
      });
      $('#cw-mode').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        state.mode = b.dataset.v;
        Array.from($('#cw-mode').children).forEach((c) => c.classList.toggle('on', c === b));
        $('#cw-mode-hint').textContent = state.mode === 'creative'
          ? 'Flight, no damage, no hunger, and the full block palette from the start.'
          : 'Empty inventory, real damage, real hunger. Everything must be found or made.';
        sfx.click();
      });
      const depth = $('#cw-depth');
      depth.addEventListener('input', () => {
        state.depth = Number(depth.value);
        $('#cw-depth-v').textContent = state.depth;
        renderLayers();
      });
    });
    this.buttonsEl.appendChild(this.btn('Back', { onClick: () => this.showSingleplayer() }));
  }

  suggestName() {
    const A = ['Folded', 'Quiet', 'Ninefold', 'Hollow', 'Sunless', 'Bright', 'Drifting', 'Cut', 'Layered', 'Second'];
    const B = ['Reach', 'Meridian', 'Basin', 'Verge', 'Terrace', 'Fathom', 'Shelf', 'Expanse', 'Threshold', 'Interval'];
    return `${A[Math.floor(Math.random() * A.length)]} ${B[Math.floor(Math.random() * B.length)]}`;
  }

  // -------------------------------------------------------------------------
  showSoon(kind) {
    this.clearScreen();
    const isMp = kind === 'multiplayer';
    this.makeShell((card) => {
      card.appendChild(el('h2', null, isMp ? 'Multiplayer' : 'Mods'));
      card.appendChild(el('div', 'subtitle', 'Not in this build — here is exactly where it stands.'));
      const body = el('div', 'body');
      const hero = el('div', 'soon-hero');
      hero.innerHTML = `<div class="badge">Coming soon</div>
        <h3>${isMp ? 'Shared hyperworlds' : 'An open content layer'}</h3>
        <p>${isMp
          ? 'Two players standing in the same place but different hyper-layers should be able to see each other as cross-sections. That is the interesting problem, and it is the one being solved first.'
          : 'Everything in 4D-MC is already a declarative table — blocks, items, recipes, creatures, professions, even textures, which are functions rather than files. The remaining work is a safe way to load someone else’s tables.'}</p>`;
      body.appendChild(hero);
      const road = el('div', 'roadmap');
      for (const [status, t, d] of (isMp ? ROADMAP_MP : ROADMAP_MODS)) {
        const item = el('div', 'roadmap-item' + (status ? ' ' + status : ''));
        item.appendChild(el('div', 'dot'));
        const c = el('div');
        c.appendChild(el('div', 'rt', t));
        c.appendChild(el('div', 'rd', d));
        item.appendChild(c);
        road.appendChild(item);
      }
      body.appendChild(road);
      card.appendChild(body);
      const foot = el('div', 'foot');
      foot.appendChild(this.btn('Back to menu', { onClick: () => this.showRoot() }));
      card.appendChild(foot);
    });
    this.buttonsEl.appendChild(this.btn('Back', { onClick: () => this.showRoot() }));
  }

  // -------------------------------------------------------------------------
  showSettings(returnTo) {
    this.clearScreen();
    const s = this.app.settings;
    const back = returnTo || (() => this.showRoot());
    this.makeShell((card) => {
      card.appendChild(el('h2', null, 'Settings'));
      card.appendChild(el('div', 'subtitle', 'Saved to this browser immediately.'));
      const body = el('div', 'body');
      const grid = el('div', 'settings-grid');

      const section = (title) => {
        const sec = el('div', 'settings-section');
        sec.appendChild(el('h3', null, title));
        return sec;
      };
      const slider = (sec, label, key, min, max, step, fmt, apply) => {
        const row = el('div', 'set-row');
        row.appendChild(el('label', null, label));
        const inp = el('input');
        inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = s[key];
        const val = el('div', 'val', fmt ? fmt(s[key]) : String(s[key]));
        inp.addEventListener('input', () => {
          s[key] = Number(inp.value);
          val.textContent = fmt ? fmt(s[key]) : String(s[key]);
          this.app.saveSettings();
          if (apply) apply(s[key]);
        });
        row.appendChild(inp);
        row.appendChild(val);
        sec.appendChild(row);
      };
      const check = (sec, label, key, apply) => {
        const c = el('div', 'check' + (s[key] ? ' on' : ''));
        c.appendChild(el('div', 'box'));
        c.appendChild(el('span', null, label));
        c.addEventListener('click', () => {
          s[key] = !s[key];
          c.classList.toggle('on', s[key]);
          this.app.saveSettings();
          if (apply) apply(s[key]);
          sfx.click();
        });
        sec.appendChild(c);
      };

      const vid = section('Video');
      slider(vid, 'Field of view', 'fov', 55, 110, 1, (v) => v + '°', () => this.app.applySettings());
      slider(vid, 'Render distance', 'renderDistance', 2, 8, 1, (v) => v + ' ch');
      slider(vid, 'Ghost layer range', 'ghostDistance', 0, 5, 1, (v) => v + ' ch');
      check(vid, 'Show neighbouring hyper-layers while phasing', 'ghostSlices');
      check(vid, 'Smooth lighting', 'smoothLighting');
      check(vid, 'Particles', 'particles');
      check(vid, 'View bob', 'viewBob');
      check(vid, 'Show FPS', 'showFps');
      grid.appendChild(vid);

      const ctl = section('Controls');
      slider(ctl, 'Mouse sensitivity', 'mouseSensitivity', 0.0004, 0.006, 0.0001, (v) => (v * 1000).toFixed(1));
      slider(ctl, 'Phase sensitivity', 'phaseSensitivity', 0.001, 0.014, 0.0002, (v) => (v * 1000).toFixed(1));
      check(ctl, 'Invert vertical look', 'invertY');
      grid.appendChild(ctl);

      const aud = section('Audio');
      slider(aud, 'Master volume', 'volume', 0, 1, 0.02, (v) => Math.round(v * 100) + '%', (v) => setVolume(v));
      grid.appendChild(aud);

      const wor = section('World');
      slider(wor, 'Autosave interval', 'autoSaveSeconds', 15, 300, 15, (v) => v + 's');
      grid.appendChild(wor);

      body.appendChild(grid);

      const keySec = el('div', 'settings-section');
      keySec.appendChild(el('h3', null, 'Key bindings'));
      const kl = el('div', 'keybind-list');
      const NICE = {
        forward: 'Walk forward', back: 'Walk back', left: 'Strafe left', right: 'Strafe right',
        jump: 'Jump / swim up', sneak: 'Sneak / descend', sprint: 'Sprint',
        phase: 'Phase (hold)', inventory: 'Inventory', drop: 'Drop item', codex: 'Codex',
        interact: 'Interact', debug: 'Debug overlay', perspective: 'Camera', screenshotHide: 'Hide HUD',
      };
      for (const k of Object.keys(s.keys)) {
        const row = el('div', 'keybind');
        row.appendChild(el('div', 'kb-name', NICE[k] || k));
        const kb = el('div', 'kb-key', prettyKey(s.keys[k]));
        kb.addEventListener('click', () => {
          if (kb.classList.contains('listening')) return;
          kb.classList.add('listening');
          kb.textContent = 'press a key';
          const handler = (e) => {
            e.preventDefault();
            s.keys[k] = e.code;
            kb.textContent = prettyKey(e.code);
            kb.classList.remove('listening');
            window.removeEventListener('keydown', handler, true);
            this.app.saveSettings();
          };
          window.addEventListener('keydown', handler, true);
        });
        row.appendChild(kb);
        kl.appendChild(row);
      }
      keySec.appendChild(kl);
      body.appendChild(keySec);
      card.appendChild(body);

      const foot = el('div', 'foot');
      foot.appendChild(this.btn('Done', { cls: 'primary', onClick: back }));
      foot.appendChild(this.btn('Reset to defaults', { onClick: () => { this.app.resetSettings(); this.showSettings(returnTo); } }));
      card.appendChild(foot);
    });
    this.buttonsEl.appendChild(this.btn('Back', { onClick: back }));
  }

  // -------------------------------------------------------------------------
  confirm(title, detail, onYes) {
    const s = el('div', 'screen dim');
    const p = el('div', 'panel pause-panel');
    p.appendChild(el('h2', null, title));
    p.appendChild(el('div', 'sub', detail));
    const bs = el('div', 'pause-buttons');
    bs.appendChild(this.btn('Yes, do it', { cls: 'danger', onClick: () => { s.remove(); onYes(); } }));
    bs.appendChild(this.btn('Cancel', { onClick: () => s.remove() }));
    p.appendChild(bs);
    s.appendChild(p);
    this.overlay.appendChild(s);
  }

  // -------------------------------------------------------------------------
  showPause(game) {
    const s = el('div', 'screen dim');
    s.id = 'pause-screen';
    const p = el('div', 'panel pause-panel');
    p.appendChild(el('h2', null, 'Paused'));
    const meta = getMeta(game.worldId);
    p.appendChild(el('div', 'sub',
      `${meta ? meta.name : 'World'} · seed ${meta ? meta.seed : '—'} · ${LAYER_NAMES[game.player.slice]}`));
    const bs = el('div', 'pause-buttons');
    bs.appendChild(this.btn('Resume', { cls: 'primary', onClick: () => this.app.resume() }));
    bs.appendChild(this.btn('Codex', { onClick: () => this.app.openCodexFromPause() }));
    bs.appendChild(this.btn('Settings', { onClick: () => { this.clearScreen(); this.showSettings(() => { this.clearScreen(); this.showPause(game); }); } }));
    bs.appendChild(this.btn('Save now', {
      onClick: () => { this.app.save(); game.hud.toast('World saved', 'Journal, containers and player state written.'); },
    }));
    bs.appendChild(this.btn('Save and quit to menu', { cls: 'danger', onClick: () => this.app.quitToMenu() }));
    p.appendChild(bs);
    s.appendChild(p);
    this.overlay.appendChild(s);
  }

  showDeath(game) {
    const s = el('div', 'screen dim');
    const p = el('div', 'panel death-panel');
    p.appendChild(el('h2', null, 'You are gone'));
    p.appendChild(el('div', 'cause', game.player.lastDamageCause || 'You stopped.'));
    const st = game.player.stats;
    const stats = el('div', 'stats');
    stats.innerHTML = `Blocks mined <b>${st.blocksMined}</b> &nbsp;·&nbsp; placed <b>${st.blocksPlaced}</b><br>
      Phase shifts <b>${st.phaseShifts}</b> &nbsp;·&nbsp; distance <b>${Math.round(st.distance)}m</b><br>
      Layer at death <b class="accent-cyan">${LAYER_NAMES[game.player.slice]}</b>`;
    p.appendChild(stats);
    const bs = el('div', 'pause-buttons');
    bs.appendChild(this.btn('Respawn', { cls: 'primary', onClick: () => this.app.respawn() }));
    bs.appendChild(this.btn('Quit to menu', { onClick: () => this.app.quitToMenu() }));
    p.appendChild(bs);
    s.appendChild(p);
    this.overlay.appendChild(s);
  }

  randomTip() { return TIPS[Math.floor(Math.random() * TIPS.length)]; }
}

export function prettyKey(code) {
  if (!code) return '—';
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Arrow/, '')
    .replace('ControlLeft', 'L-CTRL').replace('ControlRight', 'R-CTRL')
    .replace('ShiftLeft', 'L-SHIFT').replace('ShiftRight', 'R-SHIFT')
    .replace('AltLeft', 'L-ALT').replace('AltRight', 'R-ALT')
    .replace('Space', 'SPACE');
}
