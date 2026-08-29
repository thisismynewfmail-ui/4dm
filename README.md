# 4D-MC

A first-person voxel sandbox where the world is genuinely **four-dimensional**.

You mine, build, craft and survive inside one three-dimensional *cross-section*
of a larger world — and you can move that cross-section. Hold **F** and the
terrain morphs around you as you slide along **ana/kata**, the fourth axis.
Hills flow into valleys, a wall dissolves into a doorway, and an ore vein you
could see but not reach becomes solid rock under your feet.

Runs in the browser. No build step, no bundler, no image or audio assets —
every texture is drawn from code at boot and every sound is synthesised in the
WebAudio graph.

---

## Running it

Any static file server works; the game is plain ES modules.

```bash
# from the repository root
python3 -m http.server 8000
# then open http://localhost:8000
```

or

```bash
npx serve .
```

Requires a browser with **WebGL2** (Chrome, Edge, Firefox, Safari 15+).
Worlds are saved to `localStorage`; nothing is uploaded anywhere.

---

## Controls

| | |
|---|---|
| **W A S D** | Move |
| **Space** | Jump / swim up |
| **Shift** | Sneak (won't walk off ledges) / descend |
| **Ctrl** | Sprint |
| **F** *(hold)* + **wheel** | **Phase** — travel through the fourth dimension. Look around freely while you do it |
| **Mouse** | Look. Left click mines and attacks, right click places, uses and talks |
| **Wheel** / **1–9** | Select hotbar slot (with **F** held, the wheel drives W instead) |
| **E** | Inventory (4×4 assembly grid, armour, storage) |
| **C** | Codex — every recipe in the game |
| **Q** | Drop the held item (**Ctrl+Q** drops the stack) |
| **R** | Interact |
| **F3** | Debug overlay · **F5** camera · **F1** hide HUD |
| **Esc** | Pause / close |

Everything is rebindable in Settings.

---

## The fourth dimension, briefly

The world is a grid indexed `(x, y, z, w)`. Your position along `w` is a real
number, and what you see is the 3D cross-section there. There are **41
hyper-layers**, KATA 20 through ORIGIN to ANA 20.

**Hold F and roll the wheel.** Each notch moves your *destination*; your actual
position eases toward it under a speed cap, so travel is slow enough to read
and never jumps. Two layers are on screen at once and the GPU dissolves between
them with an ordered dither, so the terrain **flows** — hills rise, coastlines
walk, a wall opens into a doorway — rather than cutting between slides. Layers
are deliberately close together (a whole layer moves the ground by about one
block on average) which is exactly what makes the motion continuous. Let go of
F and you settle onto the nearest whole layer.

- **The Slice Compass**, bottom right, is an isometric stack of the layers
  around you showing a live cross-section of the terrain at every depth. It
  slides continuously as you travel. An empty plate means that layer is open
  air there; a full one means rock. It is the single most important instrument
  in the game.
- **The hyper-tape** appears above the hotbar while the drive is engaged: a
  filmstrip of the fourth axis with your position, your destination and the
  layer ticks sliding past.
- **Phasing costs Phase Stability** (the cyan meter). It regenerates on its
  own, fast near an Anchor Block, and instantly from a Chrono Berry.
- **You cannot materialise inside stone.** The drive refuses and shoves you
  back, and the compass flashes.
- **Terrain is generated from 4D noise**, so adjacent layers are *related*
  rather than random. A cave that dead-ends in your layer often keeps going in
  the next one — the right answer to a blocked tunnel is frequently *phase,
  don't dig*.
- **Ores stratify by layer.** Phaseite only forms in the outer layers;
  Aetherite hugs the core. You have to travel in W to get rich.
- **The people are not people.** The **Fold-Kin** are four-dimensional beings,
  and what you meet is the part of one that intersects your layer: a hovering
  core of nested boxes with shards in orbit, some of which drift out of your
  cross-section and briefly stop existing. Ten professions, ten silhouettes —
  a ring, a stack, a cage, a lens — readable across a field.
- **Some creatures are 4D.** Their bodies extend along `w`, so you see only the
  cross-section that intersects you: they appear cut open, with a shimmering
  plane where the rest of them isn't. Others are ordinary 3D beings, whole and
  solid — but only from their own layer.

---

## What's in it

- **94 block types** — stone and soil families, three wood sets, eight ores,
  crystals, wool, plants, liquids, and 4D-exclusive materials (Tesseract Core,
  Rift Block, Phase Glass, Anchor Block, Slice Lantern, Hyper Lattice).
- **157 items** — a five-tier tool ladder (wood → stone → iron → aetherite →
  phase), three armour sets, food, materials and hyper-instruments.
- **82 recipes + 17 smelts** across three stations: the 4×4 grid in your
  inventory, the **Fabricator** (4 wide), and the **Tesseract Bench**, whose
  pattern has *two hyper-layers* — the only place phase gear can be made.
- **18 creature species**, split between layer-bound and hyper-dimensional,
  with light- and layer-sensitive spawning.
- **10 Fold-Kin professions**, each a distinct hovering geometry with its own
  voice, orbiting shards that drift along W, and a trade table paid in Phase
  Shards.
- **Structures** — ruins, rift shrines, villages, buried caches, and a
  guaranteed supply Cache and Anchor Block at spawn.
- **12 biomes** that drift with `w`, 4D caves, a day/night cycle whose palette
  is a continuous function of your hyper-position, flood-filled light, and a
  full survival loop.
- An original interface ("Tessellate"), a world manager, full settings with key
  rebinding, and localStorage persistence of blocks, containers and player.

`DESIGN.md` records the sixty concepts this was designed against and what
shipped.

---

## Layout

```
index.html            bootstrap + HUD skeleton
styles/main.css       the Tessellate design system
vendor/three.module.js
src/
  core/      seeded RNG, 4D gradient noise, small helpers
  world/     block & item registries, recipes, chunks, 4D worldgen,
             lighting, the mesher, inventory model
  render/    procedural texture generator, texture-array atlas, voxel
             shader, terrain streaming, sky, particles
  entity/    physics, player + phase drive, mobs, NPCs, dropped items
  ui/        menu, HUD, Slice Compass, inventory, codex, dialogue
  audio/     WebAudio synthesis
  save/      localStorage world store
test/        headless Playwright suites
```

Everything under `src/world/` and `src/core/` is DOM-free, so worldgen,
lighting and crafting can be exercised in plain Node.

## Tests

```bash
python3 -m http.server 8123 &      # the suites drive a real browser
node test/functional.mjs           # world, crafting, mobs, lighting, phase drive
node test/inventory.mjs            # dragging, splitting, quick-move, crafting
node test/persistence.mjs          # save/load round trip + input handling
node test/interaction.mjs          # real mouse & keyboard: mine, place, WASD, wheel travel
```

They need Playwright and a Chromium build; set `CHROME_PATH` if yours is not
at the default location.
