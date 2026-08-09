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
node tools/check.mjs # fast module-load check
node tools/capture.mjs <name> --w 2560 --h 1440   # headless screenshot
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

The Hall of Meridian is complete and playable end to end: observation, the drum
of hours, the meridian circle, Celestial Resonance, and the temple's answer. The
sky, the character, the Book, Observation Mode, the magic framework and all five
spells are implemented. The remaining chambers are designed in `PUZZLES.md` and
are the next build phase.
