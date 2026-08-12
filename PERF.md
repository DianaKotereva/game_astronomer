# Performance

## Target

| | |
|---|---|
| Reference GPU | RTX 5070 Ti |
| Resolution | 2560 × 1440 |
| Frame target | 90 FPS sustained (11.1 ms) |
| Frame floor | 60 FPS (16.6 ms), 1% lows above it |

## An honest statement about measurement

**The numbers below were not measured on the target hardware.** This build was
developed in a container whose only WebGPU adapter is SwiftShader — a software
rasteriser. Frame times measured there are a property of the CPU rasteriser and
carry no information about an RTX 5070 Ti, so quoting them as FPS figures would
be worse than useless.

What *is* measurable here, and is measured, is everything that determines the
frame cost independently of the GPU: draw calls, triangle counts, active mesh
counts, texture count and memory, allocation behaviour in the render loop, and
the presence or absence of pipeline compilation during play. Those are recorded
below. The FPS column is left blank rather than fabricated.

Run the developer overlay (`F1` or backtick) on target hardware and read the
frame-time graph — it plots the 11.1 ms and 16.6 ms budget lines directly, and
reports 1% lows separately from the average, because average FPS alone is not a
sufficient measure (§85).

## A note on the screenshots

Milestone captures in `shots/` are 1280 × 720, not the 2560 × 1440 the brief
asks for. That is a limitation of this container, not a choice: on SwiftShader a
720p frame of this scene takes roughly twenty minutes to boot and render through
the capture harness, and 1440p — four times the pixels — exceeded every timeout
tried, twice. The renderer targets 1440p and the game runs at whatever the canvas
is set to; only the *captures* are constrained.

## Scene cost, measured

Captured from `window.__status` and the scene instrumentation at 1280 × 720,
standing in the Hall of Meridian with everything enabled.

| | |
|---|---|
| Static architecture meshes | 4 (one per material) |
| Static architecture triangles | 684 200 |
| Static architecture vertices | 1 368 300 |
| Dynamic meshes (character, cloth, instruments, book, VFX) | ~34 |
| Materials | 20 |
| Textures | 61 |
| Lights | 4 fixed + up to 4 pooled magic lights |
| Shadow-casting lights | 2 (moon CSM ×4 cascades, lantern spot) |

Per-room, measured at build time:

| Space | Vertices |
|---|---|
| The Approach | 137 300 |
| Hall of Meridian | 279 000 |
| Chamber of Wandering Stars | 254 900 |
| Archive of the Sky | 165 800 |
| Court of Reflections | 150 900 |
| Final Observatory | 380 400 |

**This grew by 5× when the remaining four spaces were built, and it is the number
most likely to cost the frame target.** It is still four draw calls — everything
static is merged per material and frozen — so the base pass is cheap. The shadow
pass is not: the CSM renders the casters once per cascade, so roughly 3.4 M
triangles are submitted per frame at four cascades. On the reference GPU that
should fit, but it is untested (see the measurement note above) and it is the
first thing to look at if the target is missed.

Two trims were already taken where they cost nothing visible: the observatory's
engraved floor circles are tessellated at 1.3 m rather than 0.5 m per piece (a
40 mm bronze line reads identically and this alone was 42 000 vertices), and the
Approach is built at 0.9 m courses with rock as large low blocks, because it is
all silhouette at night. No trim was taken anywhere the player stands close to
the stone.

## Frame budget plan (11.1 ms)

| System | Budget | Notes |
|---|---|---|
| Base geometry | 1.6 ms | 4 merged meshes, world matrices and materials frozen |
| Shadows | 2.4 ms | 4 CSM cascades @2048 + one 1024 spot |
| Stone/bronze shading | 2.2 ms | PBR + detail map; parallax reserved for hero surfaces |
| Character + cloth | 0.9 ms | ~220 cloth particles, CPU Verlet, 2 substeps |
| Sky + stars | 0.5 ms | one dome draw, one starfield draw (5 400 quads) |
| Volumetrics + dust | 0.8 ms | one beam volume, one pooled mote draw |
| Star magic | 0.6 ms | two pooled draws (threads, motes) + ≤4 lights |
| Post | 2.1 ms | TAA, SSAO2, atmosphere, bloom, grade, grain, sharpen |

## What is frozen, and what is not

`Temple.freezeStatic()` freezes the world matrix and material of every static
architecture mesh. `scene.freezeActiveMeshes()` is deliberately **not** used:
the cloth panels, the thread and mote buffers, the aperture beam and the Book
all rebuild their vertex data, and freezing the active-mesh list would strand
them. The win from freezing the list is small once the static geometry is four
merged meshes; the win from freezing matrices and materials is the large one,
and that is kept.

## Allocation behaviour

The prime directive here is **zero allocation in the render loop** — a 10–15 ms
GC pause is visible and unacceptable.

Verified by construction:
- Every per-frame maths temporary comes from `core/scratch.js` ring allocators or
  from module-level scratch objects. No `new` in any `update()`.
- All particle, thread, mote and cloth data lives in pre-allocated typed arrays,
  written in place and uploaded with `updateVerticesData`; nothing is rebuilt.
- No `map`/`filter`/`reduce`/spread in any per-frame path; indexed loops
  throughout.
- The only per-frame string construction is in the developer overlay, which
  refreshes at 5 Hz and only while visible.
- Object pools: magic lights (4), HUD annotations (24), dust motes (520), thread
  segments (320), stellar motes (900).

Three exceptions, all bounded and all understood:

1. `scene.pickWithRay` allocates a small `PickingInfo` per call — Babylon's API
   offers no reusable-result form. The game makes at most four picks per frame
   (camera arm, foot ground probe, interaction reach, spell aim), so this is a
   few dozen bytes per frame of short-lived garbage in the nursery. It is the
   one allocation the loop cannot avoid without forking the engine, and it is
   small enough not to drive a collection during play.
2. The Book re-renders its page canvases when a spread changes — a discrete
   event, and the reason the Book is warmed at load.
3. The environment probe is rebaked when the moon has moved enough to matter,
   throttled to at most once per 250 ms (32² × 6 faces).

## Pipeline warm-up

`src/core/warmup.js` runs before the loading screen lifts and forces a real draw
of: every one of the five spells plus Zenith, both Book page materials across
four spreads, the observation overlays, the dust burst path, every mechanism mesh
in motion, and three full frames with both shadow maps populated.

This is what buys the guarantees in §85: no first-spell hitch, no first-Book-open
hitch, no first-mechanism hitch. It costs a few seconds of loading, which is the
right trade.

## Load-time cost

Texture generation is CPU-bound and identical on any machine. Measured:

| Stage | Cost |
|---|---|
| Stone/plaster/cloth/wood/brass bakes | ~2.5 s |
| Bronze @1024² | ~1.2 s |
| Milky Way @1024×512 | ~0.9 s |
| Star catalogue + faint field (5 400 stars) | ~40 ms |
| Architecture generation | ~350 ms |
| Pipeline warm-up | GPU-dependent |

The noise layer uses a 256-entry gradient lookup table rather than `cos`/`sin`
per lattice corner; that one change took texture generation from roughly 11 s to
under 5 s.

## Known levers, in the order they should be pulled

1. CSM cascades 4 → 3 (largest single win; `?q=low` already does this)
2. SSAO ratio 0.75 → 0.5
3. Dust population 520 → 320
4. Star field 5 400 → 3 000 (the catalogued stars are the ones that matter)
5. Shadow map 2048 → 1536
