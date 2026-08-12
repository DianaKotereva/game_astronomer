# The Book of Stars

An astronomer and star mage explores an abandoned astronomical temple, searching
for the lost knowledge of the Book of Stars.

The temple is not a ruin decorated with stars. It is an instrument. Its halls,
apertures, rings and mirrors were cut to measure the sky, and its magic works
because the heavens have rules.

Real-time 3D, Babylon.js on WebGPU, no WebGL fallback.

## Running it

```
npm install
npm run dev          # http://127.0.0.1:5173
```

Chrome or Edge 113+ on a desktop GPU. If WebGPU is unavailable the game shows a
compatibility plate and stops — by design.

```
npm run build        # production bundle
npm run preview      # serve the bundle
node tools/check.mjs          # fast module-load check (all modules import)
node tools/navcheck.mjs       # is every room reachable on foot?
node tools/knowledgecheck.mjs # is every fragment awarded, in a workable order?
node tools/courtcheck.mjs     # does the Court of Reflections actually solve?
node tools/rigcheck.mjs       # character geometry, without a renderer

node tools/capture.mjs <name> --w 2560 --h 1440              # one screenshot
node tools/capture.mjs gallery --script tools/shots.mjs      # the ten-shot gallery
```

## Controls

| | |
|---|---|
| **W A S D** | walk (camera-relative) · hold **Shift** to jog |
| **Mouse** | look · **scroll** camera distance |
| **Hold RMB** | Observation Mode |
| **E** | interact — the verb comes from what is in reach |
| **LMB drag** | take hold of a mechanism and turn it |
| **1–5** | prepare a star spell (the focus in her hand reconfigures) |
| **LMB** | cast the prepared spell |
| **F** | mark the star under the sight (separations measure from it) |
| **B** | the Book of Stars · **←/→** turn pages |
| **F1** or **`** | developer overlay: frame times, counters, system toggles, art tuning |
| **F2 / F3** | free-fly camera / reset view |

## What is actually simulated

One celestial model serves the whole game (`src/astronomy/`): local sidereal
time, the observer's horizon, real J2000 positions for ~190 named stars, the
moon by the principal terms of the lunar theory, the five naked-eye planets by
Keplerian elements, atmospheric extinction, and rigorous precession.

Nothing is faked separately. When an instrument points at Vega it is because Vega
is there; when a shaft of moonlight lands on the bronze line it is because the
moon has crossed the meridian; when a spell draws on a star it takes that star's
colour and altitude. The Book's charts are drawn from the same catalogue the sky
is rendered from, and the precession page shows the same rotation the sky itself
will apply when the epoch is moved.

## Layout

```
src/
  core/        engine, loop, input, tuning registry, save, warm-up, scratch maths
  astronomy/   celestial model, catalogue, constellations, game time, precession
  sky/         star field, Milky Way, moon, environment probe
  world/       geometry kit, masonry, chambers, lighting, temple assembly
  materials/   procedural noise and the texture bakery
  character/   rig, locomotion and IK, Verlet cloth, lantern, celestial focus
  camera/      third-person spring arm
  interaction/ reach and grip, Observation Mode
  mechanisms/  rotary axes with mass, backlash and settling; the meridian circle
  magic/       shared stellar framework; the five spells and Zenith
  puzzles/     puzzle wiring
  book/        the Book of Stars: state, page art, charts
  vfx/         dust, aperture beams
  audio/       synthesised ambience, mechanisms and magic
  post/        post-processing stack, atmospheric depth
  ui/          contextual prompts, annotations, developer overlay
```

`ASSETS.md` · `DECISIONS.md` · `PERF.md` · `PUZZLES.md` carry the asset
inventory, the deviations from the brief and why, the performance budget and
measurement caveats, and the full design of every puzzle.

## Status

**Built and running.** Six spaces stand, and the slice runs end to end:

- **The Approach** — night, bare rock, a thirty-step flight to a facade whose
  only opening is the meridian slit seen from outside. The player starts here.
- **The Hall of Meridian** — the shaft of moonlight, the floor scale, the drum
  of hours, the meridian circle, and the temple's answer opening the way north.
- **The Chamber of Wandering Stars** — the five-ring orrery over its well.
- **The Archive of the Sky** — the reading hall, the dispute in two hands, and
  the leaf that explains why every alignment in the temple is wrong.
- **The Court of Reflections** — the Gate inlaid full size in the floor, four
  mirrors standing on its stars, and light that walks the figure.
- **The Final Observatory** — the fixed axis, the epoch wheel, the awakening,
  and Zenith.

The celestial model, the sky, the protagonist, the Book of Stars, Observation
Mode, the shared magic framework and all five spells plus Zenith are
implemented, as are the mechanism physics, dust, procedural audio, save and the
pipeline warm-up.

The Deep Instrument is the undercroft below the round court's well and the
machinery visible through its gratings, rather than a separate room — see
`DECISIONS.md`.

**Verified numerically**, not by eye:

- the moon's meridian crossing lands where the hall's scale says it should, and
  the altitude read-back round-trips exactly;
- every constellation figure resolves to a real catalogued star;
- the knowledge graph (`node tools/knowledgecheck.mjs`): all eleven fragments
  are awarded, none twice, every ability is reachable, and no room depends on
  knowledge or on a constellation figure it cannot have yet — the Court needs
  the Gate from the Archive, and the Observatory needs precession from the
  Archive and collimation from the Court;
- precession puts Thuban 0.040° from the pole 4 786 years before J2000, where
  Polaris is 26.4° away — which is what the whole revelation rests on;
- the Court of Reflections' optics (`node tools/courtcheck.mjs`): the intended
  solution lands, settings inside tolerance still land, errors of 1.5° or more
  miss, and 200 000 random configurations land 0.008% of the time;
- the observatory's polar slit is a fully enclosed cut that clears the gallery
  and the column heads, and its target epoch is inside the wheel's travel;
- every connection on the route is walkable (`node tools/navcheck.mjs`), which
  is not a formality — it caught two sealed doorways that no screenshot could
  have shown.

**Not measured:** frame rate. See the note at the top of `PERF.md` — the
development container has no GPU, and inventing numbers would be worse than
leaving the column blank.
