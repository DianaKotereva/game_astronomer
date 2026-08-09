# Assets

## Summary

**This build ships no third-party binary assets.** Every texture, mesh, sound and
page in the game is generated at load time by code in this repository. There are
no `.png`, `.jpg`, `.hdr`, `.glb`, `.wav` or `.mp3` files anywhere in `src/`, and
the game makes **zero network requests at runtime** — a condition enforced on
every capture run by `tools/capture.mjs`, which fails the run if the page
requests anything outside `localhost`.

## Why nothing was vendored

The brief asks for high-quality CC0 material (Poly Haven, ambientCG) where
authored data beats procedural generation. That was the intended plan. The build
environment's network policy permits the npm registry and nothing else — both
`api.polyhaven.com` and `ambientcg.com` return `403` at the proxy — so no CC0
library could be fetched, inspected, licence-checked or vendored.

Rather than ship placeholder-quality stand-ins, the whole surfacing pipeline was
built procedurally to a standard that could carry the game on its own. See
`DECISIONS.md` for the consequences, including the things that were gained
(per-block variation with no repeat seam, engraved detail authored as vector
linework, materials that vary per instrument) and the things that were lost
(scanned micro-detail, real captured HDR environments).

## What is generated, and where

| Asset | Source | Notes |
|---|---|---|
| Limestone, sandstone, black stone | `src/materials/textureLab.js` | albedo / normal / ORM, 512², height in normal alpha |
| Aged bronze, tarnished brass | `src/materials/textureLab.js` | 1024² for instruments; patina removes metallicity rather than tinting it |
| Dark wood, leather | `src/materials/textureLab.js` | growth rings with knots |
| Cracked plaster with lapis pigment | `src/materials/textureLab.js` | survival mask, so the stone shows through where it has fallen |
| Woven cloth (coat, mantle, scarf) | `src/materials/textureLab.js` | plain-weave normal geometry + sheen |
| Parchment | `src/materials/textureLab.js` | also rendered to a 2D canvas for the Book |
| Shared micro-detail map | `src/materials/textureLab.js` | packed R albedo / G normalY / B roughness / A normalX |
| Night-sky environment probe | `src/sky/envProbe.js` | 32² half-float cube, rebaked when the moon moves |
| Milky Way | `src/sky/sky.js` | 1024×512 equirectangular, in equatorial coordinates |
| Lunar surface | `src/sky/sky.js` | maria, highlands, crater rays |
| All architecture | `src/world/geo.js` + `src/world/chambers/*` | bevelled block masonry |
| The protagonist | `src/character/rig.js` | capsule build on a hand-authored bone hierarchy |
| Book pages, charts, diagrams, numerals | `src/book/pageArt.js` | 2D canvas, redrawn per spread |
| All sound | `src/audio/audio.js` | WebAudio synthesis; convolution reverb from a generated impulse |

## Star data

Positions, magnitudes and colour indices for the ~190 named stars in
`src/astronomy/catalog.js` are standard J2000 astrometric values (right
ascension, declination, V magnitude, B−V). These are measurements of the physical
sky — facts, not authored content — and are not subject to copyright. They are
consistent with any standard bright-star catalogue to well under a tenth of a
degree, which is far finer than any sight line in the game requires.

Everything fainter than about magnitude 4 is generated (`generateFaintStars`)
using the observed magnitude-count law and a galactic-plane concentration.

Planetary elements are the standard low-precision Keplerian elements with linear
rates, likewise physical constants rather than authored data.

## Third-party code

| Package | Version | Licence | Use |
|---|---|---|---|
| `@babylonjs/core` | 9.20.0 | Apache-2.0 | engine |
| `@babylonjs/materials` | 9.20.0 | Apache-2.0 | installed; not currently imported |
| `vite` | 8.x | MIT | dev server and bundler (build-time only) |
| `playwright` | 1.x | Apache-2.0 | milestone captures (dev-time only) |

## Fonts

The interface and the Book use the platform serif stack (`Georgia`, then
`Iowan Old Style`, then `Times New Roman`). No webfont is downloaded, which keeps
the zero-network-request guarantee intact.
