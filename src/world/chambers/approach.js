/**
 * The Approach.
 *
 * The first thing anyone sees, and the only exterior in the slice. It has one
 * job: to make the sky matter before a single mechanism has been touched (§11.1).
 *
 * The composition is arranged so that the temple never reads as a building with
 * decoration on it. From the bottom of the stair the eye goes: dark ground, then
 * a long flight, then a facade whose only opening is a slot running the entire
 * height of it — and then, above the cornice, sky. The slot is the Hall of
 * Meridian's meridian slit, seen from outside, and it is aimed at nothing the
 * player can identify yet. Off to the east, on its own outcrop, a ruined
 * armillary stands against the stars at a scale that makes no sense for
 * anything except measuring.
 *
 * Nothing here is explained. §11.1 is explicit that it should not be.
 *
 * Deliberately coarse in its masonry: this is all silhouette at night and at
 * distance, and the vertex budget belongs to the rooms the player stands inside.
 *
 * World convention: +Z north, +X east, Y up. The temple's meridian is x = 0.
 */
import {
  addBlock, addWall, addFloor, addStairs, addRubble, addCornice,
  addColumn, addCylinder, addRingBand, addBeam,
} from "../geo.js";
import { makeRng, TAU } from "../../core/scratch.js";
import { HALL } from "./hallOfMeridian.js";

export const APPROACH = {
  /** The terrace immediately outside the portal, level with its threshold. */
  terraceY: 1.35,
  terraceZ0: -31.0,
  terraceZ1: HALL.z0,        // -15
  terraceHalf: 15.0,
  /** The plain the stair descends to. */
  plainY: -6.4,
  plainZ0: -78.0,
  plainZ1: -41.0,
  /** Height of the facade above the terrace. */
  facadeTop: 25.5,
};

export function buildApproach(ctx) {
  const rng = makeRng(6060);
  const { stone, dark, bronze, plaster, collider } = ctx;
  const A = APPROACH;

  /* ---------------------------------------------------------------- */
  /* The plain, and the outcrops that frame it                          */
  /* ---------------------------------------------------------------- */

  // Bare rock, not flagging. Large, low, irregular blocks — read as ground at
  // night, cost almost nothing, and take the moon well.
  for (let i = 0; i < 190; i++) {
    const x = (rng() - 0.5) * 118;
    const z = A.plainZ0 + rng() * (A.plainZ1 - A.plainZ0 + 6);
    const s = 2.2 + rng() * 5.5;
    addBlock(stone, x, A.plainY - 0.6 + rng() * 0.35, z, s, 0.8 + rng() * 0.5, s * (0.7 + rng() * 0.6),
      { yaw: rng() * TAU, bevel: 0.14, uvScale: 0.16 });
  }
  addRubble(stone, { x: 0, z: A.plainZ1 - 8, y: A.plainY, radius: 26, count: 120, rng, minSize: 0.25, maxSize: 1.6, bias: 0.85 });

  // Outcrops east and west: they close the composition and stop the player
  // walking off into nothing.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const x = side * (26 + t * 16 + rng() * 7);
      const z = A.plainZ0 + t * (A.terraceZ1 - A.plainZ0);
      const h = 5 + rng() * 13 + t * 5;
      addBlock(stone, x, A.plainY + h * 0.4, z, 4 + rng() * 5, h * 0.5, 4 + rng() * 6,
        { yaw: rng() * TAU, bevel: 0.25, uvScale: 0.14 });
    }
  }

  /* ---------------------------------------------------------------- */
  /* The great stair                                                    */
  /* ---------------------------------------------------------------- */

  const stairZ0 = A.plainZ1, stairZ1 = A.terraceZ0;
  const steps = 30;
  const rise = (A.terraceY - A.plainY) / steps;
  const run = (stairZ1 - stairZ0) / steps;
  addStairs(stone, {
    x: 0, y: A.plainY, z: stairZ0, dir: [0, 1], steps, rise, run,
    width: 19.0, rng, wear: 0.045, blockWidth: 2.6, uvScale: 0.24,
  });
  // Cheek walls, falling away with the flight.
  for (const side of [-1, 1]) {
    for (let i = 0; i < steps; i += 2) {
      const z = stairZ0 + i * run;
      const y = A.plainY + i * rise;
      addBlock(stone, side * 10.2, y + 1.0, z + run, 1.2, 1.3 + (steps - i) * 0.012, run, { bevel: 0.06, uvScale: 0.24 });
    }
  }

  /* ---------------------------------------------------------------- */
  /* The terrace                                                        */
  /* ---------------------------------------------------------------- */

  addFloor(stone, {
    x0: -A.terraceHalf, x1: A.terraceHalf, z0: A.terraceZ0, z1: A.terraceZ1 + 0.2,
    y: A.terraceY, thickness: 0.34, slab: 2.4, rng, uvScale: 0.24,
    subsidence: (x, z) => -0.05 * Math.max(0, 1 - Math.abs(x) / 9) * Math.max(0, 1 - Math.abs(z - A.terraceZ1) / 13),
  });
  addRubble(stone, { x: -11.5, z: A.terraceZ0 + 6, y: A.terraceY, radius: 4.5, count: 40, rng, minSize: 0.2, maxSize: 1.0, bias: 0.8 });

  // Two rows of monumental columns leading to the portal — the one piece of
  // formal architecture out here, and half of the west row is down.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = A.terraceZ0 + 3.2 + i * 3.1;
      const x = side * 7.4;
      if (side < 0 && i > 2) {
        // Fallen: the drums lie where they rolled, pointing away from the base.
        for (let d = 0; d < 4; d++) {
          addCylinder(stone, x + 1.0 + d * 1.7 + rng() * 0.3, A.terraceY + 0.8, z + (rng() - 0.5) * 2.0, {
            radius: 0.78, height: 1.6, segments: 16, uvScale: 0.26,
          });
        }
        continue;
      }
      addColumn(stone, x, A.terraceY, z, {
        height: 9.4, radius: 0.82, segments: 24, flutes: 24, fluteDepth: 0.05,
        entasis: 1, plinth: 0.5, capital: 0.62, uvScale: 0.26,
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* The facade                                                         */
  /* ---------------------------------------------------------------- */

  // A single mass, pierced by the portal and by the slot above it. The slot is
  // the hall's meridian slit continued down the front of the building, which is
  // why it is exactly as wide as the slit and exactly on x = 0.
  const slitHalf = HALL.slitHalfWidth + 0.15;
  addWall(stone, {
    from: [-22, A.terraceZ1 - 0.9], to: [22, A.terraceZ1 - 0.9],
    base: A.terraceY - 1.0, height: A.facadeTop, thickness: 2.6,
    course: 0.9, blockLen: 2.0, rng, ruin: 0.13,
    openings: [
      // The portal. Wider and taller than the hall's own door, so the doorway
      // reads as recessed inside a monumental frame.
      { u0: 22 - 3.6, u1: 22 + 3.6, y0: -2, y1: A.terraceY + 9.2 },
      // The slot.
      { u0: 22 - slitHalf, u1: 22 + slitHalf, y0: A.terraceY + 9.2, y1: A.terraceY + A.facadeTop },
    ],
  });

  // Pilasters marking the bays, and the cornice they carry.
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const x = i * 5.4;
    addBlock(stone, x, A.terraceY + 8.0, A.terraceZ1 - 2.4, 0.95, 8.6, 0.55, { bevel: 0.05, uvScale: 0.26 });
    addBlock(stone, x, A.terraceY + 16.9, A.terraceZ1 - 2.4, 1.15, 0.4, 0.75, { bevel: 0.04, uvScale: 0.26 });
  }
  addCornice(stone, {
    from: [-21, A.terraceZ1 - 2.5], to: [21, A.terraceZ1 - 2.5], y: A.terraceY + 17.6,
    project: 0.85, layers: 3, layerHeight: 0.34, thickness: 1.3, piece: 2.2, rng, ruin: 0.18,
  });

  // The dressed reveal of the slot: black stone, the exact edge again.
  for (const s of [-1, 1]) {
    addBlock(dark, s * (slitHalf + 0.28), A.terraceY + 16.0, A.terraceZ1 - 2.5,
      0.3, 6.6, 0.4, { bevel: 0.02, uvScale: 0.5 });
  }
  // The lintel over the portal, one stone, with the temple's mark cut in it.
  addBlock(dark, 0, A.terraceY + 9.6, A.terraceZ1 - 2.3, 4.4, 0.7, 0.7, { bevel: 0.04, uvScale: 0.5 });
  addRingBand(bronze, 0, A.terraceY + 9.6, A.terraceZ1 - 2.72, {
    radius: 0.72, width: 0.09, depth: 0.07, segments: 44, axis: 2, uvScale: 1.2,
  });
  addBlock(bronze, 0, A.terraceY + 9.6, A.terraceZ1 - 2.72, 1.05, 0.022, 0.03, { bevel: 0.004, uvScale: 2.0 });

  /* ---------------------------------------------------------------- */
  /* The mass behind, and the broken dome                                */
  /* ---------------------------------------------------------------- */

  // Two flanking pylons that carry the eye up, and the ruined drum of an
  // observatory well behind the front — the first sight of the building the
  // player will eventually stand inside.
  for (const side of [-1, 1]) {
    addBlock(stone, side * 17.5, A.terraceY + 11.5, A.terraceZ1 - 5.5, 4.2, 12.6, 4.2, { bevel: 0.1, uvScale: 0.22 });
    addBlock(stone, side * 17.5, A.terraceY + 24.6, A.terraceZ1 - 5.5, 4.8, 0.6, 4.8, { bevel: 0.06, uvScale: 0.22 });
    // A spire, broken on the west.
    const h = side < 0 ? 4.5 : 9.0;
    addCylinder(stone, side * 17.5, A.terraceY + 25.2, A.terraceZ1 - 5.5, {
      radiusBottom: 2.4, radiusTop: side < 0 ? 1.9 : 0.5, height: h, segments: 18, uvScale: 0.24,
    });
  }

  /* ---------------------------------------------------------------- */
  /* The armillary on its outcrop                                       */
  /* ---------------------------------------------------------------- */

  // East, far out, and enormous — a silhouette against the stars whose scale
  // only makes sense if it was built to measure something.
  const ax = 44, az = -46, ay = A.plainY + 13.5;
  addBlock(stone, ax, A.plainY + 6.0, az, 8.5, 7.5, 8.5, { yaw: 0.4, bevel: 0.3, uvScale: 0.14 });
  addCylinder(dark, ax, ay - 1.6, az, { radius: 1.1, height: 3.4, segments: 16, uvScale: 0.5 });
  addRingBand(bronze, ax, ay + 2.6, az, { radius: 5.4, width: 0.34, depth: 0.28, segments: 64, axis: 0, uvScale: 0.6 });
  addRingBand(bronze, ax, ay + 2.6, az, { radius: 4.7, width: 0.28, depth: 0.24, segments: 60, axis: 2, uvScale: 0.6 });
  // The third ring has fallen off its bearing and hangs.
  addRingBand(bronze, ax + 1.4, ay + 1.1, az + 0.8, { radius: 3.9, width: 0.26, depth: 0.22, segments: 52, axis: 1, uvScale: 0.6 });
  addBeam(stone, ax - 6, ay - 3.4, az, ax + 6, ay - 3.4, az, { height: 0.7, width: 0.7, uvScale: 0.3 });

  /* ---------------------------------------------------------------- */
  /* The collapsed bridge                                               */
  /* ---------------------------------------------------------------- */

  // It went from the west outcrop to the temple, and it does not any more.
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const x = -34 + t * 13;
    const y = A.plainY + 15 - t * t * 5.5;
    addBlock(stone, x, y, -34 + t * 3, 2.4, 0.9, 2.0, { yaw: 0.1 * i, bevel: 0.08, uvScale: 0.22 });
  }
  addRubble(stone, { x: -24, z: -31, y: A.plainY, radius: 7, count: 46, rng, minSize: 0.3, maxSize: 1.8, bias: 0.7 });
  for (let i = 0; i < 3; i++) {
    addBlock(plaster, -13.5 + i * 0.4, A.terraceY + 4.0 + i, A.terraceZ1 - 3.0, 0.08, 1.6, 1.4, { bevel: 0.01, uvScale: 0.42 });
  }

  /* ---------------------------------------------------------------- */
  /* Colliders                                                          */
  /* ---------------------------------------------------------------- */

  addBlock(collider, 0, A.plainY - 0.4, (A.plainZ0 + A.plainZ1) * 0.5, 60, 0.5, (A.plainZ1 - A.plainZ0) * 0.5 + 4, { bevel: 0 });
  addBlock(collider, 0, A.terraceY - 0.35, (A.terraceZ0 + A.terraceZ1) * 0.5, A.terraceHalf, 0.4, (A.terraceZ1 - A.terraceZ0) * 0.5 + 0.4, { bevel: 0 });
  // The stair as a ramp: a stack of shallow boxes the capsule can climb.
  for (let i = 0; i < steps; i++) {
    addBlock(collider, 0, A.plainY + i * rise - 0.2, stairZ0 + (i + 0.5) * run, 9.5, 0.35 + rise * 0.5, run * 0.62, { bevel: 0 });
  }
  // Keep the player on the composition.
  for (const side of [-1, 1]) {
    addBlock(collider, side * 24, A.plainY + 10, (A.plainZ0 + A.terraceZ1) * 0.5, 3, 16, (A.terraceZ1 - A.plainZ0) * 0.5, { bevel: 0 });
  }
  addBlock(collider, 0, A.plainY + 10, A.plainZ0 - 2, 60, 16, 2, { bevel: 0 });
  // The facade, with the portal left open.
  for (const side of [-1, 1]) {
    addBlock(collider, side * (3.6 + 9.2), A.terraceY + 9, A.terraceZ1 - 0.9, 9.2, 13, 1.6, { bevel: 0 });
  }

  return { APPROACH: A, portal: { x: 0, y: A.terraceY, z: A.terraceZ1 } };
}
