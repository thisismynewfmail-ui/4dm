// ---------------------------------------------------------------------------
// The running game: scene, world, entities, interaction, spawning, saving.
// ---------------------------------------------------------------------------

import * as THREE from '../vendor/three.module.js';
import { World } from './world/world.js';
import { Player, MAX_STABILITY } from './entity/player.js';
import { Mob, SPECIES, SPECIES_KEYS, MOB_W_RANGE } from './entity/mobs.js';
import { NPC, PROFESSION_KEYS } from './entity/npcs.js';
import { ItemEntity, setItemEntityMaterial } from './entity/itementity.js';
import { TerrainRenderer } from './render/terrain.js';
import { Sky } from './render/sky.js';
import { Particles } from './render/particles.js';
import { globalUniforms, createEntityMaterial } from './render/voxelmat.js';
import { HUD } from './ui/hud.js';
import { InventoryUI } from './ui/inventory.js';
import { Dialogue } from './ui/dialogue.js';
import { Container, stack, cloneStack, INV_SIZE } from './world/inventory.js';
import { blocks, block, blockByName, B, IS_SOLID, RENDER_KIND } from './world/blocks.js';
import { getItem, fuelValue, items } from './world/items.js';
import { smeltMap } from './world/recipes.js';
import { W_LAYERS, W_MID, WORLD_H, SEA_LEVEL, layerName, blockKey } from './world/constants.js';
import { clamp, damp } from './core/mathx.js';
import { RNG, hash4 } from './core/rng.js';
import { sfx, phaseDroneStart, phaseDroneSet, phaseDroneStop } from './audio/sfx.js';

const FACING_FROM_YAW = (yaw) => {
  // 0=-Z, 1=+X, 2=+Z, 3=-X  — the block's front faces the player
  const a = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (a < Math.PI / 4 || a >= Math.PI * 7 / 4) return 0;
  if (a < Math.PI * 3 / 4) return 3;
  if (a < Math.PI * 5 / 4) return 2;
  return 1;
};

const REPLACEABLE = new Set(['air', 'water', 'tall_grass', 'fern', 'dead_bush', 'wheat_tuft']);

export class Game {
  constructor(app, canvas, meta, data) {
    this.app = app;
    this.meta = meta;
    this.worldId = meta.id;
    this.settings = app.settings;
    this.canvas = canvas;

    // --- renderer --------------------------------------------------------
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x0a0e18, 1);
    this.renderer.localClippingEnabled = true;
    this.renderer.autoClear = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.08, 1000);
    this.scene.add(this.camera);

    // --- world -----------------------------------------------------------
    this.world = new World(meta.seed, { time: data.time });
    this.world.loadEdits(data.edits);
    this.loadContainers(data);

    this.terrain = new TerrainRenderer(this.scene, this.world);
    this.sky = new Sky(this.scene);
    this.particles = new Particles(this.scene);
    this.particles.enabled = this.settings.particles;
    setItemEntityMaterial(createEntityMaterial());

    // --- entities --------------------------------------------------------
    this.mobs = [];
    this.npcs = [];
    this.drops = [];
    this.entityGroup = new THREE.Group();
    this.scene.add(this.entityGroup);
    this.spawnedVillages = new Set();
    this.spawnTimer = 2;

    // --- player ----------------------------------------------------------
    const spawn = data.player
      ? { x: data.player.x, y: data.player.y, z: data.player.z, w: data.player.w }
      : this.world.findSpawn(W_MID);
    this.player = new Player(this.world, spawn.x, spawn.y, spawn.z, spawn.w, meta.mode);
    if (data.player) this.restorePlayer(data.player);
    else this.player.spawnPoint = { x: spawn.x, y: spawn.y, z: spawn.z, w: Math.round(spawn.w) };

    this.freshWorld = !data.player;
    this.data = data;

    // --- ui --------------------------------------------------------------
    this.hud = new HUD(this);
    this.inventoryUI = new InventoryUI(this);
    this.dialogue = new Dialogue(this);

    // --- interaction state -----------------------------------------------
    this.lookTarget = null;
    this.lookEntity = null;
    this.breakOverlay = this.makeBreakOverlay();
    this.highlight = this.makeHighlight();
    this.scene.add(this.highlight);
    this.scene.add(this.breakOverlay);
    this.riftCooldown = 0;
    this.trimTimer = 0;
    this.lastAnnouncedLayer = -1;
    this.stepTimer = 0;
    this.phaseSoundTimer = 0;
    this.phaseNoticeTimer = 0;
    this.thirdPerson = 0;
    this.hudHidden = false;
    this.debugOn = false;
    this.fps = 60;
    this.frameTimes = [];
    this.paused = false;
    this.discovered = new Set(data.discovered || []);
    this.cameraShake = 0;
    this.catchUp = 0;

    if (meta.mode === 'creative') this.player.flying = true;
    this.applySettings();
  }

  // =========================================================================
  // Setup helpers
  // =========================================================================
  makeHighlight() {
    const g = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const edges = new THREE.EdgesGeometry(g);
    const m = new THREE.LineBasicMaterial({ color: 0x0b0d12, transparent: true, opacity: 0.55, depthTest: true });
    const l = new THREE.LineSegments(edges, m);
    l.visible = false;
    l.renderOrder = 3;
    return l;
  }

  makeBreakOverlay() {
    const g = new THREE.BoxGeometry(1.02, 1.02, 1.02);
    const m = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false,
      blending: THREE.MultiplyBlending, side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.visible = false;
    mesh.renderOrder = 4;
    return mesh;
  }

  applySettings() {
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.particles.enabled = this.settings.particles;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // =========================================================================
  // Save / load
  // =========================================================================
  loadContainers(data) {
    for (const c of data.containers || []) {
      const cont = Container.deserialize(c.slots, c.size);
      cont.type = c.type;
      cont.burn = c.burn || 0;
      cont.burnMax = c.burnMax || 0;
      cont.cook = c.cook || 0;
      this.world.containers.set(c.k, cont);
    }
    for (const f of data.facings || []) this.world.facings.set(f.k, f.d);
  }

  restorePlayer(p) {
    const pl = this.player;
    // Worlds saved before the fourth axis was refined hold a hyper-position on
    // a coarser scale; drop those players at ORIGIN rather than somewhere
    // arbitrary. Terrain regenerates from the seed either way.
    const savedDepth = this.meta.wDepth || 0;
    if (savedDepth !== W_LAYERS && p.w !== undefined) {
      pl.w = W_MID;
      pl.wTarget = W_MID;
      if (p.spawn) p.spawn.w = W_MID;
      p.anchorLayer = W_MID;
    }
    pl.yaw = p.yaw || 0; pl.pitch = p.pitch || 0;
    pl.health = p.health != null ? p.health : 20;
    pl.food = p.food != null ? p.food : 20;
    pl.stability = p.stability != null ? p.stability : MAX_STABILITY;
    pl.gameMode = p.mode || this.meta.mode;
    pl.inventory.selected = p.selected || 0;
    if (p.inv) {
      const c = Container.deserialize(p.inv, INV_SIZE);
      pl.inventory.slots = c.slots;
    }
    if (p.armor) {
      const c = Container.deserialize(p.armor, 4);
      pl.inventory.armor.slots = c.slots;
    }
    if (p.spawn) pl.spawnPoint = p.spawn;
    if (p.anchorLayer != null) pl.anchorLayer = p.anchorLayer;
    if (p.stats) Object.assign(pl.stats, p.stats);
    if (p.discovered) pl.discovered = new Set(p.discovered);
  }

  serialize() {
    const containers = [];
    for (const [k, c] of this.world.containers) {
      if (c.isEmpty() && !c.burn) continue;
      containers.push({ k, size: c.size, type: c.type, slots: c.serialize(), burn: c.burn || 0, burnMax: c.burnMax || 0, cook: c.cook || 0 });
    }
    const facings = [];
    for (const [k, d] of this.world.facings) facings.push({ k, d });
    return {
      edits: this.world.serializeEdits(),
      containers, facings,
      player: this.player.serialize(),
      time: this.world.time,
      discovered: Array.from(this.discovered),
      starterPlaced: this.data.starterPlaced || false,
    };
  }

  // =========================================================================
  // Starter cache — the guaranteed chest at spawn
  // =========================================================================
  placeStarterCache() {
    if (this.data.starterPlaced) return;
    const p = this.player;
    const w = p.slice;
    const rng = new RNG(this.world.seed ^ 0x51a7);
    let placed = null;
    for (let r = 2; r <= 8 && !placed; r++) {
      for (let a = 0; a < 16 && !placed; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const x = Math.round(p.x + Math.cos(ang) * r);
        const z = Math.round(p.z + Math.sin(ang) * r);
        const h = this.world.heightAt(x, z, w);
        if (h <= SEA_LEVEL) continue;
        this.world.ensureSlice(x >> 4, z >> 4, w);
        const ground = this.world.getBlock(x, h, z, w);
        if (!IS_SOLID[ground]) continue;
        if (this.world.getBlock(x, h + 1, z, w) !== 0) continue;
        placed = { x, y: h + 1, z };
      }
    }
    if (!placed) placed = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) + 2 };

    this.world.setBlock(placed.x, placed.y, placed.z, w, B.chest);
    this.world.setFacing(placed.x, placed.y, placed.z, w, 0);
    const c = new Container(27, 'Cache');
    c.type = 'chest';
    const loot = [
      ['stone_pickaxe', 1], ['stone_axe', 1], ['stone_shovel', 1], ['stone_sword', 1],
      ['torch', 16], ['oak_planks', 24], ['bread', 6], ['coal', 8],
      ['crafting_table', 1], ['chrono_berry', 4], ['phase_shard', 3], ['iron_ingot', 3],
      ['hide', 2], ['stick', 8],
    ];
    loot.forEach(([item, n], i) => { c.set(i, stack(item, n)); });
    this.world.putContainer(placed.x, placed.y, placed.z, w, c);
    // a torch and an anchor block so the spawn is findable in every layer
    this.world.setBlock(placed.x, placed.y, placed.z + 1, w, B.anchor_block);
    this.data.starterPlaced = true;
    this.starterCache = placed;
    this.hud.toast('Supply cache', 'A Cache and an Anchor Block were left for you at spawn.');
  }

  // =========================================================================
  // Containers
  // =========================================================================
  containerAt(x, y, z, w) {
    const id = this.world.getBlock(x, y, z, w);
    const bd = block(id);
    if (!bd.container) return null;
    const key = blockKey(x, y, z, w);
    let c = this.world.containers.get(key);
    if (!c) {
      if (bd.container === 'chest') {
        c = new Container(27, 'Cache');
        c.type = 'chest';
        this.fillNaturalChest(c, x, y, z, w);
      } else if (bd.container === 'smelter') {
        c = new Container(3, 'Smelter');
        c.type = 'smelter';
        c.burn = 0; c.burnMax = 0; c.cook = 0;
      } else return null;
      this.world.containers.set(key, c);
    }
    return c;
  }

  /** Deterministic loot for a chest the world generated. */
  fillNaturalChest(c, x, y, z, w) {
    const rng = new RNG(`${this.world.seed}:${x}:${y}:${z}:${w}`);
    const deep = y < 26;
    const pool = deep
      ? [['iron_ingot', 1, 4], ['coal', 2, 6], ['aetherite_gem', 0, 2], ['phaseite_crystal', 0, 1],
         ['torch', 2, 8], ['bread', 0, 3], ['iron_pickaxe', 0, 1], ['phase_shard', 1, 4],
         ['lumen_dust', 1, 5], ['bone', 0, 3]]
      : [['oak_planks', 2, 8], ['bread', 1, 4], ['coal', 1, 5], ['stick', 2, 6],
         ['iron_ingot', 0, 2], ['hide', 0, 3], ['chrono_berry', 0, 4], ['phase_shard', 0, 3],
         ['stone_pickaxe', 0, 1], ['torch', 2, 6], ['wool_white', 0, 2]];
    const n = rng.int(4, 8);
    const used = new Set();
    for (let i = 0; i < n; i++) {
      const [item, lo, hi] = rng.pick(pool);
      const count = rng.int(lo, hi);
      if (count <= 0) continue;
      let slot = rng.int(0, 26);
      let guard = 0;
      while (used.has(slot) && guard++ < 40) slot = rng.int(0, 26);
      used.add(slot);
      c.set(slot, stack(item, count));
    }
  }

  isFuel(name) { return fuelValue(name) > 0; }
  fuelTime(name) { return fuelValue(name); }
  canSmelt(name) { return smeltMap.has(name); }

  tickSmelters(dt) {
    for (const [key, c] of this.world.containers) {
      if (c.type !== 'smelter') continue;
      const input = c.get(0), fuel = c.get(1), out = c.get(2);
      const recipe = input ? smeltMap.get(input.item) : null;
      const canOutput = recipe && (!out || (out.item === recipe.output && out.count < 64));
      if (c.burn > 0) c.burn -= dt;
      if (c.burn <= 0 && recipe && canOutput && fuel && fuelValue(fuel.item) > 0) {
        c.burnMax = fuelValue(fuel.item);
        c.burn = c.burnMax;
        fuel.count -= 1;
        if (fuel.count <= 0) c.set(1, null);
      }
      if (c.burn > 0 && recipe && canOutput) {
        c.cook = (c.cook || 0) + dt / recipe.time;
        if (c.cook >= 1) {
          c.cook = 0;
          input.count -= 1;
          if (input.count <= 0) c.set(0, null);
          if (out) out.count += 1;
          else c.set(2, stack(recipe.output, 1));
        }
      } else {
        c.cook = Math.max(0, (c.cook || 0) - dt * 0.5);
      }
      if (c.burn < 0) c.burn = 0;
    }
  }

  // =========================================================================
  // Raycasting
  // =========================================================================
  /** Amanatides–Woo voxel traversal inside one hyper-layer. */
  raycastBlock(ox, oy, oz, dx, dy, dz, maxDist, w) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDX = Math.abs(1 / (dx || 1e-9)), tDY = Math.abs(1 / (dy || 1e-9)), tDZ = Math.abs(1 / (dz || 1e-9));
    let tMX = ((dx > 0 ? x + 1 - ox : ox - x)) * tDX;
    let tMY = ((dy > 0 ? y + 1 - oy : oy - y)) * tDY;
    let tMZ = ((dz > 0 ? z + 1 - oz : oz - z)) * tDZ;
    let face = [0, 0, 0];
    let t = 0;
    for (let i = 0; i < 260 && t <= maxDist; i++) {
      const id = this.world.getBlockGen(x, y, z, w);
      if (id !== 0 && RENDER_KIND[id] !== 0 && id !== B.water) {
        return { x, y, z, id, nx: face[0], ny: face[1], nz: face[2], dist: t };
      }
      if (tMX < tMY && tMX < tMZ) { x += stepX; t = tMX; tMX += tDX; face = [-stepX, 0, 0]; }
      else if (tMY < tMZ) { y += stepY; t = tMY; tMY += tDY; face = [0, -stepY, 0]; }
      else { z += stepZ; t = tMZ; tMZ += tDZ; face = [0, 0, -stepZ]; }
    }
    return null;
  }

  raycastEntity(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = null, bestT = maxDist;
    const consider = (e, extra) => {
      if (e.dead) return;
      const cy = e.y + e.height * 0.5;
      const rx = e.x - ox, ry = cy - oy, rz = e.z - oz;
      const proj = rx * dx + ry * dy + rz * dz;
      if (proj < 0 || proj > bestT) return;
      const px = ox + dx * proj, py = oy + dy * proj, pz = oz + dz * proj;
      const d = Math.hypot(e.x - px, cy - py, e.z - pz);
      const radius = Math.max(e.width, e.height * 0.42) * 0.62 + (extra || 0);
      if (d < radius) { best = e; bestT = proj; }
    };
    const pw = this.player.w;
    for (const m of this.mobs) if (Math.abs(m.w - pw) < (m.def.dim === 4 ? m.hyperExtent : MOB_W_RANGE)) consider(m);
    for (const n of this.npcs) if (Math.abs(n.w - pw) < MOB_W_RANGE) consider(n, 0.1);
    return best ? { entity: best, dist: bestT } : null;
  }

  updateLookTarget() {
    const p = this.player;
    const dir = this.lookDir();
    const reach = p.gameMode === 'creative' ? 7 : 5;
    const b = this.raycastBlock(p.x, p.eyeY, p.z, dir.x, dir.y, dir.z, reach, p.slice);
    const e = this.raycastEntity(p.x, p.eyeY, p.z, dir.x, dir.y, dir.z, reach);
    if (e && (!b || e.dist < b.dist)) { this.lookEntity = e.entity; this.lookTarget = null; }
    else { this.lookEntity = null; this.lookTarget = b; }

    this.highlight.visible = !!this.lookTarget && !this.hudHidden;
    if (this.lookTarget) {
      this.highlight.position.set(this.lookTarget.x + 0.5, this.lookTarget.y + 0.5, this.lookTarget.z + 0.5);
    }

    // interaction prompt
    let prompt = '';
    if (this.lookEntity && this.lookEntity instanceof NPC) {
      prompt = `<b>RIGHT CLICK</b> speak with ${this.lookEntity.name}`;
    } else if (this.lookTarget) {
      const bd = block(this.lookTarget.id);
      if (bd.container) prompt = `<b>RIGHT CLICK</b> open ${bd.display}`;
    }
    this.hud.setInteract(this.hudHidden ? '' : prompt);
  }

  lookDir() {
    const p = this.player;
    const cp = Math.cos(p.pitch);
    return new THREE.Vector3(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
  }

  // =========================================================================
  // Mining & placing
  // =========================================================================
  breakTimeFor(id) {
    const bd = block(id);
    if (bd.hardness < 0) return Infinity;
    const held = this.player.held;
    const it = held ? getItem(held.item) : null;
    let speed = 1;
    if (it && it.kind === 'tool' && it.toolType === bd.tool) speed = it.speed;
    const tier = it && it.kind === 'tool' ? it.tier : 0;
    const canHarvest = bd.tier === 0 || tier >= bd.tier;
    if (this.player.gameMode === 'creative') return 0.02;
    return Math.max(0.05, bd.hardness * (canHarvest ? 1.5 : 5) / speed);
  }

  canHarvest(id) {
    const bd = block(id);
    if (bd.tier === 0) return true;
    const held = this.player.held;
    const it = held ? getItem(held.item) : null;
    const tier = it && it.kind === 'tool' ? it.tier : 0;
    return tier >= bd.tier;
  }

  updateMining(dt, mouseDown) {
    const p = this.player;
    if (!mouseDown || !this.lookTarget || this.lookEntity) {
      p.breakProgress = 0; p.breakTarget = null;
      this.breakOverlay.visible = false;
      return;
    }
    const t = this.lookTarget;
    const key = `${t.x},${t.y},${t.z}`;
    if (p.breakTarget !== key) { p.breakTarget = key; p.breakProgress = 0; }
    const time = this.breakTimeFor(t.id);
    if (!isFinite(time)) { this.breakOverlay.visible = false; return; }
    p.breakProgress += dt / time;

    this.breakOverlay.visible = true;
    this.breakOverlay.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
    const f = clamp(p.breakProgress, 0, 1);
    this.breakOverlay.material.opacity = 0.06 + f * 0.55;
    this.breakOverlay.scale.setScalar(1 + f * 0.02);

    if (Math.random() < dt * 22) {
      this.particles.hitPuff(t.x + 0.5, t.y + 0.5, t.z + 0.5, t.id);
      sfx.dig(block(t.id).step);
    }
    if (p.breakProgress >= 1) this.mineBlock(t.x, t.y, t.z);
  }

  mineBlock(x, y, z) {
    const p = this.player;
    const w = p.slice;
    const id = this.world.getBlock(x, y, z, w);
    if (id === 0) return;
    const bd = block(id);
    if (bd.hardness < 0) return;

    // container contents spill
    const cont = this.world.containers.get(blockKey(x, y, z, w));
    if (cont) {
      for (let i = 0; i < cont.size; i++) {
        const s = cont.get(i);
        if (s) this.spawnDrop(s, x + 0.5, y + 0.5, z + 0.5, w);
      }
      this.world.containers.delete(blockKey(x, y, z, w));
    }

    this.world.setBlock(x, y, z, w, 0);
    this.particles.blockBreak(x, y, z, id);
    sfx.break(bd.step);
    p.stats.blocksMined++;
    p.breakProgress = 0;
    p.exhaustion += 0.03;

    if (this.canHarvest(id) && bd.drop) {
      const n = bd.dropCount || 1;
      if (p.gameMode === 'creative') { /* creative keeps nothing */ }
      else this.spawnDrop(stack(bd.drop, n), x + 0.5, y + 0.5, z + 0.5, w);
    }
    // plants above fall
    const above = this.world.getBlock(x, y + 1, z, w);
    if (above && RENDER_KIND[above] === 2) {
      const ad = block(above);
      this.world.setBlock(x, y + 1, z, w, 0);
      if (ad.drop && p.gameMode !== 'creative') this.spawnDrop(stack(ad.drop, ad.dropCount || 1), x + 0.5, y + 1.5, z + 0.5, w);
    }
    this.damageHeldTool(1);
    this.discover(bd.drop);
  }

  damageHeldTool(n) {
    const p = this.player;
    if (p.gameMode === 'creative') return;
    const held = p.held;
    if (!held) return;
    const it = getItem(held.item);
    if (!it || !it.durability) return;
    held.dur = (held.dur === undefined ? it.durability : held.dur) - n;
    if (held.dur <= 0) {
      p.inventory.setHeld(null);
      sfx.hurt();
      this.hud.toast('Tool broke', `${it.display} wore through.`, 'warn');
    }
  }

  tryPlace() {
    const p = this.player;
    const held = p.held;
    if (!held) return false;
    const it = getItem(held.item);
    if (!it) return false;

    // non-block uses
    if (it.kind === 'food') return this.tryEat();
    if (it.name === 'phase_anchor') {
      p.spawnPoint = { x: p.x, y: p.y, z: p.z, w: p.slice };
      p.anchorLayer = p.slice;
      this.hud.toast('Anchor set', `Respawn bound to ${layerName(p.slice)} at ${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}.`);
      sfx.levelUp();
      return true;
    }
    if (it.kind === 'armor') {
      const idx = ['head', 'chest', 'legs', 'feet'].indexOf(it.slot);
      if (idx >= 0) {
        const cur = p.inventory.armor.get(idx);
        p.inventory.armor.set(idx, cloneStack(held));
        p.inventory.setHeld(cur ? cloneStack(cur) : null);
        sfx.click();
        return true;
      }
    }
    if (it.kind !== 'block') return false;
    if (!this.lookTarget) return false;

    const t = this.lookTarget;
    const w = p.slice;
    let x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
    const targetBlock = block(t.id);
    const existing = this.world.getBlock(x, y, z, w);
    const exName = block(existing).name;
    if (!REPLACEABLE.has(exName)) return false;
    if (y < 0 || y >= WORLD_H) return false;

    const bd = blockByName.get(it.blockName);
    if (!bd) return false;
    if (bd.solid) {
      const box = { x0: x, x1: x + 1, y0: y, y1: y + 1, z0: z, z1: z + 1 };
      const pb = p.aabb();
      const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0 && a.z0 < b.z1 && a.z1 > b.z0;
      if (overlap(box, pb)) return false;
      for (const m of this.mobs) if (Math.abs(m.w - p.w) < 1.2 && overlap(box, m.aabb())) return false;
      for (const n of this.npcs) if (Math.abs(n.w - p.w) < 1.2 && overlap(box, n.aabb())) return false;
    }
    // plants need something to stand on
    if (bd.render === 'cross' && !IS_SOLID[this.world.getBlock(x, y - 1, z, w)]) return false;

    this.world.setBlock(x, y, z, w, bd.id);
    if (bd.tex && bd.tex.north) this.world.setFacing(x, y, z, w, FACING_FROM_YAW(p.yaw));
    if (bd.render === 'flat') this.world.setFacing(x, y, z, w, (FACING_FROM_YAW(p.yaw) + 2) & 3);
    sfx.place(bd.step);
    p.stats.blocksPlaced++;
    if (p.gameMode !== 'creative') {
      held.count -= 1;
      if (held.count <= 0) p.inventory.setHeld(null);
    }
    return true;
  }

  tryEat() {
    const p = this.player;
    const held = p.held;
    const it = held ? getItem(held.item) : null;
    if (!it || it.kind !== 'food') return false;
    if (p.food >= p.maxFood && !it.phase && p.health >= p.maxHealth) return false;
    p.feed(it.nutrition);
    if (it.heal) p.heal(it.heal);
    if (it.phase) p.restoreStability(it.phase);
    sfx.eat();
    this.hud.toast(it.display, `+${it.nutrition} sustenance${it.phase ? ` · +${it.phase} stability` : ''}`);
    if (p.gameMode !== 'creative') {
      held.count -= 1;
      if (held.count <= 0) p.inventory.setHeld(null);
      if (it.name === 'mushroom_stew') p.inventory.addSmart('bowl', 1);
    }
    return true;
  }

  tryInteract() {
    const p = this.player;
    if (this.lookEntity && this.lookEntity instanceof NPC) {
      this.dialogue.open(this.lookEntity);
      return true;
    }
    if (!this.lookTarget) return false;
    const t = this.lookTarget;
    const bd = block(t.id);
    if (!bd.container) return false;
    const w = p.slice;
    if (bd.container === 'craft') { this.inventoryUI.openScreen('crafting'); return true; }
    if (bd.container === 'tesseract') { this.inventoryUI.openScreen('tesseract'); return true; }
    const c = this.containerAt(t.x, t.y, t.z, w);
    if (!c) return false;
    this.inventoryUI.openScreen(bd.container === 'smelter' ? 'smelter' : 'chest', { container: c, pos: { x: t.x, y: t.y, z: t.z, w } });
    sfx.door();
    return true;
  }

  attack() {
    const p = this.player;
    if (p.attackCooldown > 0) return;
    const e = this.lookEntity;
    if (!e) return;
    p.attackCooldown = 0.42;
    const it = p.heldItemDef();
    const dmg = it && it.kind === 'tool' ? it.damage : 1;
    const dead = e.health - dmg <= 0;
    if (e.damage(dmg, p)) {
      sfx.hit();
      this.particles.damageBurst(e.x, e.y + e.height * 0.6, e.z);
      const dx = e.x - p.x, dz = e.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      e.vx += (dx / d) * 5.5; e.vz += (dz / d) * 5.5; e.vy = Math.max(e.vy, 3.6);
      this.damageHeldTool(1);
      if (dead && e instanceof Mob) {
        p.stats.kills++;
        for (const d2 of e.rollDrops()) this.spawnDrop(stack(d2.item, d2.count), e.x, e.y + 0.5, e.z, e.w);
      }
    }
  }

  hurtPlayer(dmg, source) {
    const p = this.player;
    if (p.damage(dmg, `slain by a ${source.def ? source.def.name : 'creature'}`)) {
      sfx.hurt();
      this.cameraShake = 0.35;
      const dx = p.x - source.x, dz = p.z - source.z;
      const d = Math.hypot(dx, dz) || 1;
      p.vx += (dx / d) * 5; p.vz += (dz / d) * 5; p.vy = Math.max(p.vy, 3.4);
      if (p.dead) { sfx.die(); this.app.onPlayerDeath(); }
    }
  }

  // =========================================================================
  // Item entities
  // =========================================================================
  spawnDrop(st, x, y, z, w, vx, vy, vz) {
    if (!st || st.count <= 0) return;
    if (!getItem(st.item)) { console.warn('drop of unknown item', st.item); return; }
    const e = new ItemEntity(this.world, st.item, st.count, x, y, z, w);
    if (st.dur !== undefined) e.dur = st.dur;
    e.vx = vx !== undefined ? vx : (Math.random() - 0.5) * 2;
    e.vy = vy !== undefined ? vy : 2.2;
    e.vz = vz !== undefined ? vz : (Math.random() - 0.5) * 2;
    this.drops.push(e);
    this.entityGroup.add(e.mesh);
  }

  dropStack(st) {
    if (!st || st.count <= 0) return;
    const p = this.player;
    const dir = this.lookDir();
    this.spawnDrop(st, p.x + dir.x * 0.6, p.eyeY - 0.25, p.z + dir.z * 0.6, p.w,
      dir.x * 5.4, dir.y * 4 + 2.2, dir.z * 5.4);
  }

  dropHeld(all) {
    const p = this.player;
    const held = p.held;
    if (!held) return;
    const n = all ? held.count : 1;
    const out = stack(held.item, n, held.dur);
    held.count -= n;
    if (held.count <= 0) p.inventory.setHeld(null);
    this.dropStack(out);
  }

  // =========================================================================
  // Spawning
  // =========================================================================
  spawnMobs() {
    const p = this.player;
    if (this.mobs.length >= 40) return;
    const world = this.world;
    const attempts = 8;
    for (let i = 0; i < attempts; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 22 + Math.random() * 26;
      const x = Math.floor(p.x + Math.cos(ang) * r);
      const z = Math.floor(p.z + Math.sin(ang) * r);
      const layerOffset = Math.random() < 0.4 ? Math.round((Math.random() - 0.5) * 8) : 0;
      const w = clamp(p.slice + layerOffset, 0, W_LAYERS - 1);
      if (!world.isSliceReady(x >> 4, z >> 4, w)) continue;
      const surface = world.heightAt(x, z, w);
      const underground = Math.random() < 0.5;
      let y;
      if (underground) {
        y = 6 + Math.floor(Math.random() * Math.max(1, surface - 10));
      } else {
        y = surface + 1;
      }
      if (y < 2 || y > WORLD_H - 3) continue;
      if (IS_SOLID[world.getBlock(x, y, z, w)] || IS_SOLID[world.getBlock(x, y + 1, z, w)]) continue;
      if (!IS_SOLID[world.getBlock(x, y - 1, z, w)]) continue;
      const light = world.lightValue(x, y, z, w, false);
      const biome = world.biomeAt(x, z, w).key;
      const outer = Math.abs(w - W_MID) >= 2;

      const candidates = [];
      for (const key of SPECIES_KEYS) {
        const s = SPECIES[key];
        const sp = s.spawn;
        if (!sp) continue;
        if (sp.rare && Math.random() > 0.02) continue;
        if (s.rare && Math.random() > 0.015) continue;
        if (sp.light === 'dark' && light > 0.34) continue;
        if (sp.biomes && !sp.biomes.includes(biome)) continue;
        if (sp.layers === 'outer' && !outer) continue;
        if (sp.underground && !underground) continue;
        if (!sp.underground && underground && s.kind === 'passive') continue;
        candidates.push([key, sp.weight || 1]);
      }
      if (!candidates.length) continue;
      let total = 0;
      for (const c of candidates) total += c[1];
      let roll = Math.random() * total;
      let picked = candidates[0][0];
      for (const c of candidates) { roll -= c[1]; if (roll <= 0) { picked = c[0]; break; } }

      const m = new Mob(this.world, picked, x + 0.5, y, z + 0.5, w);
      this.mobs.push(m);
      this.entityGroup.add(m.group);
      return;
    }
  }

  spawnVillagers() {
    const p = this.player;
    const w = p.slice;
    const ccx = Math.floor(p.x / 16), ccz = Math.floor(p.z / 16);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const cx = ccx + dx, cz = ccz + dz;
        const key = `${cx},${cz},${w}`;
        if (this.spawnedVillages.has(key)) continue;
        if (!this.world.isSliceReady(cx, cz, w)) continue;
        this.spawnedVillages.add(key);
        const roll = hash4(cx, 0, cz, 0, 500 + w * 13);
        const isVillage = roll >= 0.055 && roll < 0.075;
        if (!isVillage) continue;
        const rng = new RNG(`${this.world.seed}:v:${cx}:${cz}:${w}`);
        const n = rng.int(3, 6);
        for (let i = 0; i < n; i++) {
          const x = cx * 16 + rng.int(1, 14);
          const z = cz * 16 + rng.int(1, 14);
          const h = this.world.heightAt(x, z, w);
          let y = h + 1;
          let guard = 0;
          while (y < WORLD_H - 2 && IS_SOLID[this.world.getBlock(x, y, z, w)] && guard++ < 8) y++;
          const prof = PROFESSION_KEYS[rng.int(0, PROFESSION_KEYS.length - 1)];
          const npc = new NPC(this.world, prof, x + 0.5, y, z + 0.5, w, `${this.world.seed}:${x}:${z}:${i}`);
          this.npcs.push(npc);
          this.entityGroup.add(npc.group);
        }
        this.hud.toast('Settlement', `Layer-folk live nearby in ${layerName(w)}.`);
      }
    }
  }

  /** A couple of wanderers near the very first spawn so the world feels inhabited. */
  seedStarterNPCs() {
    const p = this.player;
    const rng = new RNG(this.world.seed ^ 0x9a7f);
    for (let i = 0; i < 2; i++) {
      const ang = rng.float(0, Math.PI * 2);
      const r = 9 + rng.float(0, 8);
      const x = Math.round(p.x + Math.cos(ang) * r);
      const z = Math.round(p.z + Math.sin(ang) * r);
      const h = this.world.heightAt(x, z, p.slice);
      if (h <= SEA_LEVEL) continue;
      const prof = PROFESSION_KEYS[rng.int(0, PROFESSION_KEYS.length - 1)];
      const npc = new NPC(this.world, prof, x + 0.5, h + 1, z + 0.5, p.slice, `${this.world.seed}:start:${i}`);
      this.npcs.push(npc);
      this.entityGroup.add(npc.group);
    }
  }

  // =========================================================================
  // Discovery
  // =========================================================================
  discover(itemName) {
    if (!itemName) return;
    const it = getItem(itemName);
    if (!it) return;
    if (this.discovered.has(itemName)) return;
    this.discovered.add(itemName);
    if (it.rarity === 'rare' || it.rarity === 'hyper') {
      this.hud.toast('Discovery', `First ${it.display}. ${it.desc || ''}`.trim(), 'warn');
      sfx.levelUp();
    }
  }

  // =========================================================================
  // Main update
  // =========================================================================
  update(dt, input) {
    const p = this.player;
    this.world.tick(dt * 1000);
    if (this.phaseNoticeTimer > 0) this.phaseNoticeTimer -= dt;

    // --- phase drive -------------------------------------------------------
    const wasPhasing = p.phaseHeld;
    p.phaseHeld = input.phase && !this.inventoryUI.isOpen() && !this.dialogue.isOpen();
    if (p.phaseHeld && !wasPhasing) {
      sfx.phaseStart();
      phaseDroneStart();
      this.particles.phaseSpark(p.x, p.y, p.z, 14);
    }
    if (!p.phaseHeld && wasPhasing) {
      phaseDroneStop();
      // releasing settles onto the nearest whole layer, so the world is crisp
      // and unambiguous whenever you are not actually travelling
      p.snapToLayer();
    }
    if (input.phaseNotches !== 0) {
      p.nudgePhase(input.phaseNotches);
      input.phaseNotches = 0;
    }

    const wBefore = p.w;
    const res = p.updatePhase(dt);
    if (res === 'blocked') {
      if (this.phaseNoticeTimer <= 0) {
        this.phaseNoticeTimer = 3;
        sfx.phaseBlocked();
        this.cameraShake = 0.22;
        this.particles.phaseSpark(p.x, p.y + 0.8, p.z, 10);
        this.hud.toast('Phase refused', 'Solid matter occupies that layer. Move, then try again.', 'bad');
      }
    } else if (res === 'drained') {
      if (this.phaseNoticeTimer <= 0) {
        this.phaseNoticeTimer = 4;
        sfx.phaseBlocked();
        p.damage(1.5, 'lost cohesion between layers');
        this.hud.toast('Stability spent', 'The drive cannot hold. Rest, or eat a Chrono Berry.', 'warn');
      }
    } else if (res === 'moving') {
      this.phaseSoundTimer -= Math.abs(p.w - wBefore);
      if (this.phaseSoundTimer <= 0) { this.phaseSoundTimer = 0.22; sfx.phaseTick(); }
      if (p.slice !== this.lastAnnouncedLayer) {
        this.lastAnnouncedLayer = p.slice;
        if (this.settings.particles) this.particles.phaseSpark(p.x, p.y + 1, p.z, 4);
      }
    }
    p.phaseAmount = damp(p.phaseAmount, p.phaseHeld ? 1 : 0, 9, dt);
    if (p.phaseHeld) phaseDroneSet(p.phaseSpeed, p.w - Math.floor(p.w));

    // --- player ------------------------------------------------------------
    const uiOpen = this.inventoryUI.isOpen() || this.dialogue.isOpen();
    const playerInput = uiOpen ? {} : input;
    p.update(dt, playerInput, this.settings, this);

    // rift blocks push you along W
    this.riftCooldown -= dt;
    if (this.riftCooldown <= 0) {
      const inside = this.world.getBlock(Math.floor(p.x), Math.floor(p.y + 0.5), Math.floor(p.z), p.slice);
      if (inside === B.rift_block) {
        const dir = p.slice >= W_LAYERS - 1 ? -1 : (p.slice <= 0 ? 1 : (Math.random() < 0.5 ? -1 : 1));
        const target = clamp(p.slice + dir * 2, 0, W_LAYERS - 1);
        if (!p.collides(p.aabb(), target)) {
          p.setPhaseTarget(target);
          p.stats.phaseShifts++;
          sfx.phaseEnd();
          this.particles.phaseSpark(p.x, p.y, p.z, 22);
          this.hud.toast('Rift', `Pushed to ${layerName(target)}.`);
        }
        this.riftCooldown = 1.4;
      }
    }

    // footsteps
    if (p.onGround && p.stepDistance > (p.sprinting ? 1.9 : 2.4)) {
      p.stepDistance = 0;
      this.stepTimer = 0;
      sfx.step(block(p.standingOn).step);
    }

    // --- world streaming ---------------------------------------------------
    // Changing hyper-layer means a whole new set of meshes, so give the builder
    // a burst of budget and pull the fog in while it catches up. Holding F
    // pre-builds the neighbouring layers at full range, which is both what the
    // ghost view wants to draw and what makes the commit instant.
    // A slab covers several layers, so most travel needs no work at all; a
    // rebuild only lands when the slab re-centres, and the fog closes in while
    // the builder catches up so the horizon thickens instead of showing holes.
    this.terrain.update(p.x, p.z, p.w, {
      renderDistance: this.settings.renderDistance,
    }, this.paused ? 1 : (this.terrain.settling ? 12 : 5));
    if (this.catchUp > 0) this.catchUp -= dt;
    this.unloadFarChunks();

    // --- entities ----------------------------------------------------------
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.6;
      this.spawnMobs();
      this.spawnVillagers();
    }
    this.updateEntities(dt);
    this.tickSmelters(dt);
    this.particles.update(dt);

    // --- interaction -------------------------------------------------------
    if (!uiOpen) {
      this.updateLookTarget();
      this.updateMining(dt, input.mine);
    } else {
      this.highlight.visible = false;
      this.breakOverlay.visible = false;
      this.hud.setInteract('');
    }

    // drop hyper-slices we have travelled away from
    this.trimTimer -= dt;
    if (this.trimTimer <= 0) { this.trimTimer = 2.5; this.world.trimSlices(p.slice); }

    this.updateCamera(dt);
    if (!this.hudHidden) this.hud.update(dt);
    if (this.debugOn) this.hud.setDebug(this.debugText());
  }

  heldIs(name) {
    const h = this.player.held;
    return !!(h && h.item === name);
  }

  updateEntities(dt) {
    const p = this.player;
    const viewW = p.w;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      m.update(dt, this);
      if (m.dead) {
        for (const d of m.rollDrops()) this.spawnDrop(stack(d.item, d.count), m.x, m.y + 0.4, m.z, m.w);
        this.entityGroup.remove(m.group);
        m.dispose();
        this.mobs.splice(i, 1);
        continue;
      }
      const light = this.world.lightValue(Math.floor(m.x), Math.floor(m.y + 1), Math.floor(m.z), m.slice);
      m.render(viewW, Math.max(0.12, light), dt);
    }
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i];
      n.update(dt, this);
      if (n.dead || n.distanceTo(p) > 110) {
        this.entityGroup.remove(n.group);
        n.dispose();
        this.npcs.splice(i, 1);
        if (this.dialogue.npc === n) this.dialogue.close();
        continue;
      }
      const light = this.world.lightValue(Math.floor(n.x), Math.floor(n.y + 1), Math.floor(n.z), n.slice);
      n.render(viewW, Math.max(0.15, light), dt);
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.update(dt);
      let gone = d.dead;
      if (!gone && d.pickupDelay <= 0 && Math.abs(d.w - p.w) < 1.2) {
        const dist = Math.hypot(d.x - p.x, d.y - (p.y + 0.9), d.z - p.z);
        if (dist < 1.7) {
          const left = p.inventory.addSmart(d.item, d.count);
          if (left < d.count) {
            sfx.pickup();
            const it = getItem(d.item);
            this.discover(d.item);
            if (left === 0) gone = true;
            else d.count = left;
          }
        } else if (dist < 3.4) {
          const k = dt * 7;
          d.vx += (p.x - d.x) * k; d.vy += (p.y + 0.6 - d.y) * k * 0.6; d.vz += (p.z - d.z) * k;
        }
      }
      if (gone) {
        this.entityGroup.remove(d.mesh);
        this.drops.splice(i, 1);
        continue;
      }
      d.render(viewW, 1);
    }
  }

  unloadFarChunks() {
    const p = this.player;
    const ccx = Math.floor(p.x / 16), ccz = Math.floor(p.z / 16);
    const keep = this.settings.renderDistance + 3;
    if (this.world.chunks.size < (keep * 2 + 1) * (keep * 2 + 1) + 12) return;
    for (const [k, c] of this.world.chunks) {
      if (Math.abs(c.cx - ccx) > keep || Math.abs(c.cz - ccz) > keep) this.world.unloadChunk(c.cx, c.cz);
    }
  }

  // =========================================================================
  // Camera & slice roles
  // =========================================================================
  updateCamera(dt) {
    const p = this.player;
    const cam = this.camera;
    let bob = 0, roll = 0;
    if (this.settings.viewBob && p.onGround) {
      bob = Math.sin(p.bob) * 0.055 * Math.min(1, Math.hypot(p.vx, p.vz) / 4);
      roll = Math.cos(p.bob * 0.5) * 0.012 * Math.min(1, Math.hypot(p.vx, p.vz) / 4);
    }
    if (this.cameraShake > 0) {
      this.cameraShake -= dt * 1.6;
      bob += (Math.random() - 0.5) * this.cameraShake * 0.25;
      roll += (Math.random() - 0.5) * this.cameraShake * 0.12;
    }
    const eye = new THREE.Vector3(p.x, p.eyeY + bob, p.z);
    if (this.thirdPerson > 0) {
      const dir = this.lookDir();
      const back = this.thirdPerson === 1 ? -1 : 1;
      const target = eye.clone().addScaledVector(dir, back * 4.2).add(new THREE.Vector3(0, 0.4, 0));
      cam.position.copy(target);
      cam.lookAt(eye);
      if (back === 1) cam.rotation.z += Math.PI;
    } else {
      cam.position.copy(eye);
      cam.rotation.set(0, 0, 0);
      cam.rotation.order = 'YXZ';
      cam.rotation.y = p.yaw;
      cam.rotation.x = p.pitch;
      cam.rotation.z = roll;
    }
    // FOV nudge when sprinting or phasing
    const targetFov = this.settings.fov * (p.sprinting ? 1.07 : 1) * (p.phaseHeld ? 1.06 : 1);
    if (Math.abs(cam.fov - targetFov) > 0.05) {
      cam.fov = damp(cam.fov, targetFov, 8, dt);
      cam.updateProjectionMatrix();
    }

    const daylight = this.world.daylight();
    const under = p.eyeY < SEA_LEVEL - 3 && this.world.getSky(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z), p.slice) < 3;
    let rd = this.settings.renderDistance * 16;
    if (this.catchUp > 0) rd *= 0.45 + 0.55 * (1 - clamp(this.catchUp / 1.5, 0, 1));
    globalUniforms.uFogNear.value = under ? 4 : rd * 0.58;
    globalUniforms.uFogFar.value = under ? 34 : rd * 1.08;
    globalUniforms.uTime.value = performance.now() / 1000;
    // the peek bubble widens while the phase drive is engaged
    this.sky.update(this.world.time, p.w, cam.position, p.phaseAmount, daylight);
    if (p.headInWater) {
      globalUniforms.uFogColor.value.setRGB(0.08, 0.2, 0.36);
      globalUniforms.uFogNear.value = 0.5;
      globalUniforms.uFogFar.value = 14;
    }
  }

  debugText() {
    const p = this.player;
    const t = this.terrain.stats;
    const s = this.world.stats;
    const look = this.lookTarget
      ? `${block(this.lookTarget.id).display} @ ${this.lookTarget.x},${this.lookTarget.y},${this.lookTarget.z},w${p.slice}`
      : (this.lookEntity ? (this.lookEntity.name || this.lookEntity.def.name) : '—');
    return [
      `4D-MC · ${this.fps.toFixed(0)} fps · ${this.renderer.info.render.calls} draws · ${(this.renderer.info.render.triangles / 1000).toFixed(0)}k tris`,
      `xyzw ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)} ${p.w.toFixed(3)}`,
      `layer ${p.slice} (${layerName(p.slice)}) · anchor ${p.anchorLayer} · stability ${p.stability.toFixed(0)}`,
      `W ${p.w.toFixed(3)} -> ${p.wTarget.toFixed(2)} · pair ${this.terrain.lower}/${this.terrain.upper} t=${(p.w - Math.floor(p.w)).toFixed(2)}`,
      `chunks ${s.chunks} · slices ${s.slices} gen ${s.slicesGen} lit ${s.slicesLit}`,
      `meshes ${t.meshes} (${t.drawn} drawn, ${t.stale} stale) · queued ${t.queue} · faces ${(t.faces / 1000).toFixed(1)}k · mesh ${t.meshMs.toFixed(1)}ms`,
      `entities: mobs ${this.mobs.length} npcs ${this.npcs.length} drops ${this.drops.length}`,
      `biome ${this.world.biomeAt(Math.floor(p.x), Math.floor(p.z), p.slice).name} · light ${(this.world.lightValue(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z), p.slice)).toFixed(2)}`,
      `looking at ${look}`,
      `time ${Math.floor(this.world.time)} · daylight ${this.world.daylight().toFixed(2)}`,
    ].join('\n');
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.terrain.clear();
    for (const m of this.mobs) m.dispose();
    for (const n of this.npcs) n.dispose();
    this.particles.clear();
    this.renderer.dispose();
  }
}
