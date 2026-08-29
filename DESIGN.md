# 4D-MC — Design Document

> A first-person voxel sandbox where the world is genuinely four-dimensional.
> You do not just walk **north/south, east/west, up/down** — you also *phase*
> along **ana/kata**, the fourth axis. Hold **F** and the world melts and
> re-forms around you as you slide between hyper-slices.

---

## 1. The Core Premise

The world is a 4-dimensional grid of voxels indexed `(x, y, z, w)`.

A human eye can only perceive a 3-dimensional **cross-section** of a 4D object,
exactly as a 2D "Flatlander" can only perceive a 2D slice of a 3D apple. So the
player always sees one *slice* of the world: the `w = W` hyperplane they
currently occupy. Everything the player does — mining, building, walking,
fighting — happens inside that slice.

Holding **F** engages the phase drive; the **mouse wheel** then slides your
cross-section along `w` while you keep looking around freely. Each notch moves
a *destination*, and your position eases toward it under a speed cap, so travel
is always slow enough to read.

The terrain **morphs continuously**: hills flow into valleys, a wall dissolves
into a doorway, an ore vein you could see but not reach becomes solid rock at
your feet. Two things make that work. The world is generated from **4D noise**,
so neighbouring layers are *related* rather than random; and there are **41 of
them, closely spaced**, so a whole layer of travel moves the ground by about
one block on average. Fine steps are what turn a slideshow into motion — the
same reason a flipbook works and a slide carousel does not.

The **Slice Compass** in the bottom-right corner is a small isometric stack of
plates — one per hyper-layer near you — showing a live cross-section of the
terrain around you at every depth. It slides *continuously* with `w`, so at
20.4 the stack sits four tenths of a step along and the instrument moves with
the world instead of ticking after it. The plate you occupy is lit; the others
fade with distance, and a ruler down the side shows where this window sits in
the full 41-layer range. It is the single most important piece of UI in the
game, and it is always on.

While the drive is engaged, a **hyper-tape** rises above the hotbar: a
filmstrip of the fourth axis with layer ticks sliding past, your position
pinned at the centre and your destination marked ahead of it.

---

## 2. Brainstorm — 60 Concepts Considered

Everything below was considered during design. Items marked **[BUILT]** ship in
this version; **[HOOK]** means the systems exist and the feature is scaffolded
for a later pass.

### World & the Fourth Dimension

1. **[BUILT] 4D value/gradient noise terrain.** One continuous hyper-landscape;
   slices are neighbours in a smooth 4D field, so phasing *morphs* rather than
   teleports.
2. **[BUILT] Per-slice palette drift.** Each hyper-layer owns a slightly
   different sky gradient, fog colour and sun hue. You learn to recognise
   "where" you are in W by the colour of the light — navigation by mood.
3. **[BUILT] Cross-section Slice Compass HUD.** Isometric plate stack that
   slides continuously with W, live terrain sampling on every plate, a
   full-range ruler, and a destination marker while travelling.
4. **[BUILT] Continuous phase blending.** An ordered-dither cross-dissolve
   between the two bracketing layers, at 41 closely spaced layers, so travel
   reads as the terrain flowing rather than as slides changing.
5. **[CUT] Phase ghosts.** Neighbouring layers were once drawn over your own as
   translucent overlays. With 41 fine layers and a live compass the overlay
   became noise on top of a view that already morphs, so it was removed in
   favour of the dissolve and the instruments. The Compass answers "what is
   over there" better than a hologram ever did.
6. **[BUILT] Phase collision.** You cannot materialise inside rock. Blocked
   phases shove you back with a stability penalty and a hard audio cue.
7. **[BUILT] Phase Stability meter.** A third vital. Phasing drains it, standing
   still restores it, Anchor blocks restore it fast. Hitting zero causes a
   violent snap back to your anchor slice and damage.
8. **[BUILT] Hyper-blocks.** Certain blocks (Tesseract Core, Boundary Stone)
   exist at *every* w simultaneously — they are 4D-solid, the landmarks of the
   hyperworld and the only truly reliable navigation aid.
9. **[BUILT] Phase Glass & the Slice Lantern.** Hyper-optics, built from
   phaseite and aetherite; landmarks that read as belonging to the fourth
   dimension rather than the third.
10. **[BUILT] Rift Blocks.** Step in and you are shoved one layer ana or kata.
    Natural ones generate in caves; crafted ones let you build hyper-elevators.
11. **[BUILT] Anchor Blocks.** Suppress phasing in a radius and regenerate
    stability. Bases get built on them. They are also mob-repellent.
12. **[BUILT] 4D caves.** Cave noise is 4D, so a tunnel can dead-end in your
    slice and continue in the next one. The correct answer to "this cave is
    blocked" is often *phase, don't dig*.
13. **[BUILT] Biomes that drift with W.** Biome selection samples w, so a desert
    in slice 2 can be tundra in slice 5 at the same x/z.
14. **[BUILT] Ore stratification by layer.** Phaseite only forms in the outer
    hyper-layers; Aetherite hugs the core layers. You must phase to get rich.
15. **[BUILT] Structures.** Ruined shrines, rift altars, surface villages,
    buried supply caches, and a guaranteed starter chest at spawn.
16. **[BUILT] Deterministic seeds.** Named worlds, typed or random seeds, string
    seeds hashed to 32-bit. Same seed = same hyperworld.
17. **[HOOK] Hyper-structures spanning W.** Buildings whose rooms are stacked in
    the fourth dimension rather than vertically.
18. **[BUILT] Day/night cycle** with a moving sun, moon, star field and a
    per-slice time offset so dawn arrives at different moments in each layer.
19. **[BUILT] Weather-lite:** drifting motes/ash particles keyed to biome.
20. **[BUILT] Bedrock as "Boundary Stone"** — a hyper-block floor and hard W
    limits so the world always has edges you can feel.

### Blocks, Items & Crafting

21. **[BUILT] 90+ block types** across stone, soil, three wood sets, ores,
    crystals, wool colours, plants, liquids and 4D-exclusive materials.
22. **[BUILT] 100+ item types** including a full five-tier tool ladder.
23. **[BUILT] Procedural Beta-styled texture atlas.** Every texture is drawn at
    runtime, 16×16, from a muted palette with per-pixel dither — no image files,
    no loading, no licensing, and a coherent art direction.
24. **[BUILT] 4×4 personal crafting grid** in the inventory (recipes up to 3×3).
25. **[BUILT] Fabricator (crafting table)** — 4×4 grid, unlocks 4-wide recipes.
26. **[BUILT] Tesseract Bench** — the 4D station. Its grid has *two* w-layers, so
    recipes literally have depth in the fourth dimension.
27. **[BUILT] Smelter** with fuel, burn time and a progress bar.
28. **[BUILT] Codex.** An in-game recipe browser. Discoverability is a first
    class feature; nobody should have to look up a wiki.
29. **[BUILT] Tool tiers gate block hardness** — correct tool, correct tier,
    correct speed, with a per-tool durability bar.
30. **[BUILT] Torches + flood-filled block light**, with a soft bleed of light
    *between* slices so a lit base glows faintly in neighbouring layers.
31. **[BUILT] Chests** (27 slots) with full drag/drop against the player
    inventory, and persistent contents.
32. **[BUILT] Food & Sustenance** — berries, bread, cooked meat; sprinting and
    phasing burn it.
33. **[HOOK] Armour slots** exist in the UI and in the damage pipeline.
34. **[BUILT] Item entities are 4D.** A dropped item lives at a `w`; it is solid
    in its own slice, a ghost in the neighbours, and invisible beyond that.
35. **[BUILT] Q to drop**, shift-click quick-move, right-click split, drag a
    stack anywhere, drop-outside-to-discard.

### Creatures

36. **[BUILT] 3D mobs** bound to a single hyper-layer. Fully visible, fully
    solid, only when you share their slice.
37. **[BUILT] 4D mobs** whose bodies extend along w. You see only the
    cross-section that intersects your slice, so they appear **sliced open**,
    with a shimmering cut-plane where geometry has been removed.
38. **[BUILT] Phasing predators.** Some hostiles hunt *through* W: they vanish
    from your slice, close distance, and re-materialise behind you.
39. **[BUILT] 18 creature species** — passive, hostile, 4D and neutral.
40. **[BUILT] Light-and-layer-based spawning.** Darkness spawns hostiles; outer
    hyper-layers spawn the strange things.
41. **[BUILT] Knockback, invulnerability frames, death drops, despawn rules.**
42. **[BUILT] The Fold-Kin — 10 professions of four-dimensional being.** Not
    humans: hovering cores of nested boxes with shards in orbit, some of which
    drift along W and blink out of your cross-section. Silhouette carries
    identity — a ring, a stack, a cage, a lens — so a profession is readable
    across a field before its colours are.
43. **[BUILT] Trading UI** using Phase Shards as currency.
44. **[HOOK] NPC schedules / village reputation.**
45. **[BUILT] The Warden of Layers** — a rare neutral giant that is *anchored in
    4D*; it is visible from every slice and reacts if you mine near it.

### Interface & Feel

46. **[BUILT] Original UI language — "Tessellate".** Angular bevelled panels,
    45° clipped corners, slate/indigo ground, cyan (4D), amber (matter) and
    rose (harm) accents. Deliberately *not* Minecraft's grey stone GUI.
47. **[BUILT] Slanted hotbar ribbon** with a raised, glowing selected slot and a
    slide-in item nameplate.
48. **[BUILT] Chevron vital meters** — Health, Sustenance, Phase Stability —
    segmented, animated, colour-coded, bottom-left.
49. **[BUILT] Tesseract reticle.** The crosshair is a 4-point star that unfolds
    into a rotating hypercube projection while phasing.
50. **[BUILT] Telemetry panel** — coordinates including W, biome, slice name,
    clock, FPS.
51. **[BUILT] Toast notifications** for discoveries and milestones.
52. **[BUILT] Animated main menu** with a live rotating tesseract and drifting
    voxel field behind the buttons.
53. **[BUILT] World manager** — create (name + seed + mode + hyper-depth), load,
    duplicate, delete, with timestamps and playtime.
54. **[BUILT] Settings** — FOV, render distance, sensitivity, phase sensitivity,
    invert-Y, volume, particles, ghost slices, crosshair style, full key rebind.
55. **[BUILT] Pause menu, death screen, respawn, save-and-quit.**
56. **[BUILT] Procedural audio.** Every sound is synthesised in the WebAudio
    graph — footsteps by material, mining thuds, the phase whoosh, mob calls.
57. **[BUILT] localStorage persistence** of world meta, player state, block
    deltas and container contents.
58. **[BUILT] Creative mode** with flight and a full block palette.
59. **[BUILT] Multiplayer & Mods** menus present, themed, honestly labelled
    *Coming Soon* with a roadmap panel rather than a dead button.
60. **[BUILT] Debug overlay (F3)** with chunk/mesh/entity counters and the raw
    4D coordinate of the block you are looking at.

---

## 3. Technical Architecture

```
index.html          bootstrap + DOM skeleton
styles/*.css        the Tessellate design system
vendor/three.module.js
src/
  core/       rng, 4D noise, tiny event bus, math helpers
  world/      block & item registries, recipes, chunks, 4D worldgen,
              lighting, greedy-ish mesher, structures
  render/     procedural texture atlas, voxel shader, sky, particles
  entity/     player controller, mobs, NPCs, dropped items
  ui/         menu, HUD, inventory, containers, slice compass, settings
  audio/      WebAudio synth
  save/       localStorage world store
```

### Data layout

A chunk is `16 × H × 16 × WLAYERS` block ids in a flat `Uint8Array`, indexed
column-major so vertical scans are cache friendly:

```
index = w * (16 * 16 * H) + (lx * 16 + lz) * H + y
```

Terrain, lighting and meshing are all **lazy per hyper-slice**: entering a chunk
only generates the slice you are standing in, plus the two neighbours you can
peek into. That is a ~7× saving over generating the whole hyper-column.

### Rendering

One `DataArrayTexture` (16×16×N) holds every tile, so there is zero atlas
bleeding and no UV padding maths. A single custom GLSL3 `ShaderMaterial` draws
all terrain: position, uv, texture-layer index and a pre-baked RGB that already
contains ambient occlusion, face shading and light level. Fog is computed in the
shader from view depth and tinted for the current hyper-position.

**Travel along W is a rendering problem, not a generation problem.** Two
hyper-layers are meshed and resident at any moment — the pair bracketing your
position — and the shader runs an **8×8 ordered-dither cross-dissolve** between
them: each pixel commits to one layer or the other, so there is no transparency,
no sorting and no depth trouble. Where the two layers agree, which is most of
the world, the dissolve is invisible; where they disagree, the terrain appears
to flow.

Meshing a whole *slab* of layers into one buffer with a per-face layer bitmask
was tried first and rejected: neighbouring layers put their surfaces at
different heights, so the union costs one full copy per layer exactly where the
faces are. Two thin meshes beat one fat one.

Three rules keep travel seamless:

* a layer of **lookahead** in each direction is meshed ahead of you, so
  crossing into a new layer never waits for a build;
* a chunk that has only one of the pair draws it outright;
* a chunk that has neither draws its nearest built layer instead, and a stale
  mesh is never disposed until a replacement exists.

Nothing therefore blocks the drive, and the horizon can be a moment stale but
is never holed.

### Testing

`test/` drives the real game in headless Chromium through Playwright: worldgen
and lighting are also unit-testable in plain Node because `src/world/` and
`src/core/` never touch the DOM.
