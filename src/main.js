// ---------------------------------------------------------------------------
// 4D-MC bootstrap: settings, menus, input, the game loop.
// ---------------------------------------------------------------------------

import * as THREE from '../vendor/three.module.js';
import { buildAtlas, arrayTexture } from './render/atlas.js';
import { globalUniforms } from './render/voxelmat.js';
import { Game } from './game.js';
import { Menu } from './ui/menu.js';
import { openCodex, closeCodex, codexOpen } from './ui/codex.js';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, getMeta, loadWorldData, saveWorldData, updateMeta } from './save/storage.js';
import { initAudio, resumeAudio, setVolume, sfx } from './audio/sfx.js';
import { $, show, hide } from './ui/dom.js';
import { W_MID } from './world/constants.js';
import { blocks } from './world/blocks.js';
import { clamp } from './core/mathx.js';

class App {
  constructor() {
    this.canvas = $('#game');
    this.settings = loadSettings();
    this.menu = new Menu(this);
    this.game = null;
    this.state = 'menu';    // menu | loading | playing | paused | dead
    this.input = {
      forward: false, back: false, left: false, right: false,
      jump: false, sneak: false, sprint: false, phase: false,
      mine: false, use: false, phaseNotches: 0,
    };
    this.wheelAccum = 0;
    this.lastTime = performance.now();
    this.accum = 0;
    this.saveTimer = 0;
    this.playStart = 0;
    this.bindEvents();
  }

  // -------------------------------------------------------------------------
  async boot() {
    const status = $('#load-status');
    show($('#loading'));
    $('#load-tip').innerHTML = this.menu.randomTip();
    status.textContent = 'Drawing textures…';
    await frame();
    buildAtlas();
    globalUniforms.uAtlas.value = arrayTexture;
    $('#load-fill').style.width = '100%';
    status.textContent = 'Ready';
    await frame();
    hide($('#loading'));
    setVolume(this.settings.volume);
    this.menu.showRoot();
    this.loop();
  }

  saveSettings() { saveSettings(this.settings); if (this.game) this.game.applySettings(); }
  resetSettings() {
    this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    saveSettings(this.settings);
    setVolume(this.settings.volume);
    if (this.game) { this.game.settings = this.settings; this.game.applySettings(); }
  }
  applySettings() { if (this.game) this.game.applySettings(); }

  // -------------------------------------------------------------------------
  async startWorld(id) {
    const meta = getMeta(id);
    if (!meta) return;
    initAudio(); resumeAudio();
    this.menu.hide();
    this.state = 'loading';
    show($('#loading'));
    const fill = $('#load-fill'), status = $('#load-status'), tip = $('#load-tip');
    tip.innerHTML = this.menu.randomTip();
    fill.style.width = '4%';
    status.textContent = 'Reading the journal…';
    await frame();

    const data = loadWorldData(id);
    if (this.game) { this.game.dispose(); this.game = null; }
    const game = new Game(this, this.canvas, meta, data);
    this.game = game;
    game.settings = this.settings;

    status.textContent = 'Growing the hyperworld…';
    await frame();

    // pre-generate and mesh the chunks around spawn so the first frame is solid
    const p = game.player;
    const R = Math.max(2, Math.min(4, this.settings.renderDistance));
    const ccx = Math.floor(p.x / 16), ccz = Math.floor(p.z / 16);
    const jobs = [];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      jobs.push([ccx + dx, ccz + dz, dx * dx + dz * dz]);
    }
    jobs.sort((a, b) => a[2] - b[2]);
    for (let i = 0; i < jobs.length; i++) {
      game.world.ensureSlice(jobs[i][0], jobs[i][1], p.slice);
      if (i % 6 === 0) {
        fill.style.width = `${8 + (i / jobs.length) * 62}%`;
        status.textContent = `Growing the hyperworld… ${Math.round((i / jobs.length) * 100)}%`;
        await frame();
      }
    }

    // settle the player onto the ground — only ever upward, so nobody is
    // dropped through a lake or a canopy on their first frame
    if (!data.player) {
      let guard = 0;
      while (p.y < 78 && guard++ < 40 && p.collides(p.aabb(), p.slice)) p.y += 1;
      game.placeStarterCache();
      game.seedStarterNPCs();
      if (meta.mode === 'creative') this.fillCreativeInventory(game);
    }

    status.textContent = 'Lighting the slice…';
    fill.style.width = '76%';
    await frame();
    for (let i = 0; i < jobs.length; i++) {
      const d = Math.abs(jobs[i][0] - ccx) + Math.abs(jobs[i][1] - ccz);
      if (d <= R) game.world.ensureLit(jobs[i][0], jobs[i][1], p.slice);
    }

    status.textContent = 'Building meshes…';
    fill.style.width = '88%';
    await frame();
    for (let i = 0; i < 26; i++) {
      game.terrain.update(p.x, p.z, p.w, {
        renderDistance: this.settings.renderDistance,
      }, 14);
      if (i % 5 === 0) await frame();
    }

    fill.style.width = '100%';
    status.textContent = 'Ready';
    await frame();
    hide($('#loading'));
    show($('#hud'));
    this.state = 'playing';
    this.playStart = performance.now();
    this.lastTime = performance.now();
    updateMeta(id, { lastPlayed: Date.now() });
    game.hud.toast('Welcome to ' + meta.name, `Seed ${meta.seed} · hold F to phase`);
    this.requestLock();
  }

  fillCreativeInventory(game) {
    const inv = game.player.inventory;
    const starters = ['grass_block', 'stone', 'oak_planks', 'glass', 'torch', 'crafting_table', 'chest', 'phase_glass', 'rift_block'];
    starters.forEach((s, i) => { if (i < 9) inv.slots[i] = { item: s, count: 64 }; });
  }

  // -------------------------------------------------------------------------
  save() {
    if (!this.game) return;
    const data = this.game.serialize();
    saveWorldData(this.game.worldId, data);
    const meta = getMeta(this.game.worldId);
    const extra = this.playStart ? Math.max(0, performance.now() - this.playStart) : 0;
    updateMeta(this.game.worldId, {
      lastPlayed: Date.now(),
      playtime: (meta ? meta.playtime || 0 : 0) + extra,
    });
    this.playStart = performance.now();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.game.paused = true;
    document.exitPointerLock();
    this.menu.showPause(this.game);
    this.save();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.menu.clearScreen();
    this.state = 'playing';
    this.game.paused = false;
    this.lastTime = performance.now();
    this.requestLock();
  }

  openCodexFromPause() { openCodex(this.game, 'tesseract'); }

  quitToMenu() {
    this.save();
    if (this.game) { this.game.dispose(); this.game = null; }
    this.state = 'menu';
    hide($('#hud'));
    document.exitPointerLock();
    this.menu.clearScreen();
    this.menu.showRoot();
  }

  onPlayerDeath() {
    this.state = 'dead';
    document.exitPointerLock();
    this.menu.showDeath(this.game);
  }

  respawn() {
    const g = this.game;
    const p = g.player;
    this.menu.clearScreen();
    const sp = p.spawnPoint || g.world.findSpawn(W_MID);
    p.x = sp.x; p.y = sp.y + 0.2; p.z = sp.z; p.w = sp.w != null ? sp.w : W_MID;
    p.vx = p.vy = p.vz = 0;
    p.health = p.maxHealth;
    p.food = Math.max(6, p.food);
    p.stability = 100;
    p.dead = false;
    p.hurtTimer = 0;
    g.world.ensureSlice(Math.floor(p.x / 16), Math.floor(p.z / 16), p.slice);
    while (p.y < 78 && p.collides(p.aabb(), p.slice)) p.y += 1;
    this.state = 'playing';
    this.lastTime = performance.now();
    this.requestLock();
  }

  // -------------------------------------------------------------------------
  requestLock() {
    if (this.state !== 'playing') return;
    const el = this.canvas;
    if (document.pointerLockElement === el) return;
    const req = el.requestPointerLock && el.requestPointerLock({ unadjustedMovement: true });
    if (req && req.catch) req.catch(() => { try { el.requestPointerLock(); } catch (e) { /* ignore */ } });
  }

  get uiOpen() {
    return !!(this.game && (this.game.inventoryUI.isOpen() || this.game.dialogue.isOpen())) || codexOpen();
  }

  // -------------------------------------------------------------------------
  bindEvents() {
    window.addEventListener('resize', () => { if (this.game) this.game.resize(); });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('pointerdown', (e) => {
      initAudio(); resumeAudio();
      if (this.state !== 'playing') return;
      if (document.pointerLockElement !== this.canvas) { this.requestLock(); return; }
      if (e.button === 0) { this.input.mine = true; this.game.attack(); }
      else if (e.button === 2) {
        this.input.use = true;
        if (!this.game.tryInteract()) this.game.tryPlace();
      } else if (e.button === 1) {
        e.preventDefault();
        this.pickBlock();
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.input.mine = false;
      if (e.button === 2) this.input.use = false;
    });

    // Looking around is never taken over by the phase drive: you hold F, keep
    // looking wherever you like, and the wheel slides the world past you.
    document.addEventListener('mousemove', (e) => {
      if (this.state !== 'playing' || document.pointerLockElement !== this.canvas) return;
      const p = this.game.player;
      const s = this.settings;
      const dx = e.movementX || 0, dy = e.movementY || 0;
      // The first event after the pointer locks (and the odd driver hiccup)
      // reports the jump from the cursor's old page position to the lock
      // origin — hundreds of pixels in one go, which snaps the view somewhere
      // random. No human flick covers a third of the screen between two
      // events, so drop the whole sample rather than clamping it.
      const spike = Math.max(200, Math.min(window.innerWidth, window.innerHeight) * 0.35);
      if (Math.abs(dx) > spike || Math.abs(dy) > spike) return;
      p.yaw -= dx * s.mouseSensitivity;
      p.pitch += (s.invertY ? dy : -dy) * s.mouseSensitivity;
      p.pitch = clamp(p.pitch, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
    });

    window.addEventListener('wheel', (e) => {
      if (this.state !== 'playing' || this.uiOpen) return;
      // Normalise across mice, trackpads and line/page delta modes so one
      // physical notch is one notch everywhere.
      let d = e.deltaY;
      if (e.deltaMode === 1) d *= 16;
      else if (e.deltaMode === 2) d *= 400;
      this.wheelAccum += clamp(d, -600, 600);
      const NOTCH = 100;
      let n = 0;
      while (this.wheelAccum >= NOTCH) { this.wheelAccum -= NOTCH; n += 1; }
      while (this.wheelAccum <= -NOTCH) { this.wheelAccum += NOTCH; n -= 1; }
      if (!n) return;
      if (this.input.phase) {
        // scrolling down travels toward KATA, up toward ANA
        this.input.phaseNotches += -n * this.settings.phaseScrollStep;
      } else {
        const inv = this.game.player.inventory;
        inv.selected = (inv.selected + n + 9 * 4) % 9;
      }
    }, { passive: true });

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    document.addEventListener('pointerlockchange', () => {
      if (this.state === 'playing' && document.pointerLockElement !== this.canvas) {
        // browser released the lock (alt-tab, escape) — treat as a pause
        if (!this.uiOpen) this.pause();
      }
    });
    window.addEventListener('blur', () => {
      for (const k of Object.keys(this.input)) if (typeof this.input[k] === 'boolean') this.input[k] = false;
    });
  }

  pickBlock() {
    const g = this.game, p = g.player;
    if (!g.lookTarget) return;
    const bd = blocks[g.lookTarget.id];
    if (!bd || !bd.item) return;
    const inv = p.inventory;
    for (let i = 0; i < 9; i++) {
      if (inv.slots[i] && inv.slots[i].item === bd.name) { inv.selected = i; return; }
    }
    if (p.gameMode === 'creative') inv.slots[inv.selected] = { item: bd.name, count: 64 };
  }

  onKey(e, down) {
    const k = this.settings.keys;
    const code = e.code;

    if (down && code === 'Escape') {
      e.preventDefault();
      if (codexOpen()) { closeCodex(); return; }
      if (this.game && this.game.dialogue.isOpen()) { this.game.dialogue.close(); this.requestLock(); return; }
      if (this.game && this.game.inventoryUI.isOpen()) { this.game.inventoryUI.close(); this.requestLock(); return; }
      if (this.state === 'playing') { this.pause(); return; }
      if (this.state === 'paused') { this.resume(); return; }
      return;
    }

    if (this.state !== 'playing' && this.state !== 'paused') return;
    if (!this.game) return;

    const ui = this.uiOpen;

    if (down && code === k.inventory) {
      e.preventDefault();
      if (this.game.inventoryUI.isOpen()) { this.game.inventoryUI.close(); this.requestLock(); }
      else if (!ui) { document.exitPointerLock(); this.game.inventoryUI.openScreen('inventory'); }
      return;
    }
    if (down && code === k.codex) {
      e.preventDefault();
      if (codexOpen()) closeCodex();
      else { document.exitPointerLock(); openCodex(this.game, this.game.inventoryUI.isOpen() ? this.game.inventoryUI.station : 'inventory'); }
      return;
    }
    if (down && code === k.drop) {
      e.preventDefault();
      if (this.game.inventoryUI.isOpen()) this.game.inventoryUI.dropHovered();
      else if (!ui) this.game.dropHeld(e.ctrlKey);
      return;
    }
    if (down && code === k.debug) { e.preventDefault(); this.game.debugOn = !this.game.debugOn; if (!this.game.debugOn) this.game.hud.setDebug(''); return; }
    if (down && code === k.perspective) { this.game.thirdPerson = (this.game.thirdPerson + 1) % 3; return; }
    if (down && code === k.screenshotHide) {
      e.preventDefault();
      this.game.hudHidden = !this.game.hudHidden;
      document.getElementById('hud').classList.toggle('hidden', this.game.hudHidden);
      return;
    }
    if (down && code === k.interact && !ui) { this.game.tryInteract(); return; }

    if (down && /^Digit[1-9]$/.test(code) && !ui) {
      this.game.player.inventory.selected = Number(code.slice(5)) - 1;
      return;
    }

    if (ui) { if (code === k.phase) this.input.phase = false; return; }

    switch (code) {
      case k.forward: this.input.forward = down; break;
      case k.back: this.input.back = down; break;
      case k.left: this.input.left = down; break;
      case k.right: this.input.right = down; break;
      case k.jump: this.input.jump = down; e.preventDefault(); break;
      case k.sneak: this.input.sneak = down; break;
      case k.sprint: this.input.sprint = down; break;
      case k.phase: this.input.phase = down; e.preventDefault(); break;
      default: break;
    }
    // creative flight toggle
    if (down && code === k.jump && this.game.player.gameMode === 'creative') {
      const now = performance.now();
      if (this._lastJump && now - this._lastJump < 280) {
        this.game.player.flying = !this.game.player.flying;
        this.game.hud.toast(this.game.player.flying ? 'Flight on' : 'Flight off', '');
      }
      this._lastJump = now;
    }
  }

  // -------------------------------------------------------------------------
  loop() {
    const step = (now) => {
      requestAnimationFrame(step);
      let dt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      if (dt > 0.1) dt = 0.1;
      if (dt <= 0) return;

      if (this.game) {
        const g = this.game;
        g.frameTimes.push(dt);
        if (g.frameTimes.length > 40) g.frameTimes.shift();
        const avg = g.frameTimes.reduce((a, b) => a + b, 0) / g.frameTimes.length;
        g.fps = 1 / Math.max(1e-5, avg);

        if (this.state === 'playing') {
          g.update(dt, this.input);
          this.saveTimer += dt;
          if (this.saveTimer > this.settings.autoSaveSeconds) { this.saveTimer = 0; this.save(); }
        } else if (this.state === 'paused' || this.state === 'dead') {
          // keep the world rendering behind the menu, but frozen
          g.terrain.update(g.player.x, g.player.z, g.player.w, {
            renderDistance: this.settings.renderDistance,
          }, 2);
        }
        g.render();
      }
    };
    requestAnimationFrame(step);
  }
}

function frame() { return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); }

const app = new App();
window.__4dmc = app;
app.boot().catch((err) => {
  console.error(err);
  const s = document.getElementById('load-status');
  if (s) s.textContent = 'Failed to start: ' + err.message;
});
