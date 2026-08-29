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

Holding **F** unlocks the fourth axis. Vertical mouse motion now drives `w`
instead of pitch. The terrain **morphs continuously**: hills flow into valleys,
a wall dissolves into a doorway, an ore vein you could see but not reach in
slice 3 becomes solid rock at your feet in slice 4. Because the terrain is
generated from **4D noise**, adjacent slices are *related* — recognisable, but
never identical. That coherence is what sells the illusion.

The **Slice Compass** in the bottom-right corner is a small isometric stack of
plates — one plate per hyper-layer — showing a live cross-section of the terrain
around you at every depth. The plate you occupy is lit; the others are ghosted.
It is the single most important piece of UI in the game, and it is always on.

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
3. **[BUILT] Cross-section Slice Compass HUD.** Isometric plate stack, live
   terrain sampling, occupied layer highlighted, animates while phasing.
4. **[BUILT] Continuous phase blending.** Rendering interpolates between the two
   nearest slices; the dominant slice is solid, the other is an overlay, so the
   world is never hollow mid-transition.
5. **[BUILT] Phase ghosts, inside a bubble.** While F is held the neighbouring
   layers are drawn over your own in cyan and violet, with a brightness floor
   so unlit rock next door never blacks out your sky, and a distance falloff so
   the effect is a local *sphere of insight* rather than a fog of everything.
   You can see the wall you are about to materialise inside.
6. **[BUILT] Phase collision.** You cannot materialise inside rock. Blocked
   phases shove you back with a stability penalty and a hard audio cue.
7. **[BUILT] Phase Stability meter.** A third vital. Phasing drains it, standing
   still restores it, Anchor blocks restore it fast. Hitting zero causes a
   violent snap back to your anchor slice and damage.
8. **[BUILT] Hyper-blocks.** Certain blocks (Tesseract Core, Boundary Stone)
   exist at *every* w simultaneously — they are 4D-solid, the landmarks of the
   hyperworld and the only truly reliable navigation aid.
9. **[BUILT] Phase Glass & the Slice Lantern.** Hyper-optics. Standing near
   either one holds the phase bubble open without engaging the drive, so the
   neighbouring layers stay faintly visible around your base. Build a window
   out of Phase Glass and you can watch the layer next door.
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
42. **[BUILT] 10 NPC professions** with names, dialogue, and trade tables.
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
shader from view depth and tinted per hyper-layer.

Three passes per frame: the dominant slice (opaque + cutout + water), the
sub-dominant slice as a blended overlay whose alpha is the phase fraction, and —
only while F is held, or near a hyper-optic — the outer ghost slices at low
alpha with depth-write off. Each ghost role owns its own bubble radius, so the
cross-fade partner reads at range while a mere peek stays local.

Changing hyper-layer invalidates every mesh at once, so the builder gets a
burst of frame budget for 1.5 s afterwards and the fog closes in to match what
has actually been built — the world thickens toward you instead of showing
holes.

### Testing

`test/` drives the real game in headless Chromium through Playwright: worldgen
and lighting are also unit-testable in plain Node because `src/world/` and
`src/core/` never touch the DOM.
