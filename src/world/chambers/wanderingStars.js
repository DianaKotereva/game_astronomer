/**
 * The Chamber of Wandering Stars.
 *
 * A circular chamber, twenty-six metres across, built around a well. The floor
 * is an annulus; the middle of the room is a shaft dropping into the undercroft,
 * and standing in that shaft — its lowest ring below the floor, its highest ring
 * level with the gallery — is the orrery.
 *
 * The room is lit from a single oculus directly over the engine, which is the
 * only reason you can see the thing at all: the builders wanted the wanderers
 * lit from above, as they are in the sky.
 *
 * Below the well, through the gratings, other machinery is visible. It belongs
 * to no room. That is the point (§11.6).
 */
import { addBlock, addWall, addFloor, addStairs, addRubble, addCornice, addCylinder, addDisc, addRingBand, addColumn, addBeam } from "../geo.js";
import { makeRng, TAU, DEG } from "../../core/scratch.js";

export const COURT = {
  cx: 0, cz: 38,
  radius: 13.0,
  wellRadius: 4.6,
  floorY: 0,
  wallTop: 11.5,
  galleryY: 6.4,
  oculusRadius: 3.4,
  domeTop: 18.5,
};

export function buildWanderingStars(ctx) {
  const rng = makeRng(90210);
  const { stone, dark, bronze, plaster, collider } = ctx;
  const C = COURT;

  /* ---------------------------------------------------------------- */
  /* Floor: an annulus of radial slabs around the well                  */
  /* ---------------------------------------------------------------- */

  const rings = 5;
  for (let r = 0; r < rings; r++) {
    const r0 = C.wellRadius + (r / rings) * (C.radius - C.wellRadius);
    const r1 = C.wellRadius + ((r + 1) / rings) * (C.radius - C.wellRadius);
    const rm = (r0 + r1) * 0.5;
    const n = Math.max(12, Math.round((TAU * rm) / 1.7));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (r % 2) * (Math.PI / n);
      const w = (TAU * rm) / n * 0.5 - 0.012;
      addBlock(stone, C.cx + Math.cos(a) * rm, -0.14, C.cz + Math.sin(a) * rm,
        (r1 - r0) * 0.5 - 0.012, 0.14, w,
        { yaw: -a, bevel: 0.02, settle: [(rng() - 0.5) * 0.012, (rng() - 0.5) * 0.012, (rng() - 0.5) * 0.012, (rng() - 0.5) * 0.012], noBottom: true });
    }
  }

  // The well kerb: black stone, precisely cut, graduated.
  const kn = 64;
  for (let i = 0; i < kn; i++) {
    const a = (i / kn) * TAU;
    addBlock(dark, C.cx + Math.cos(a) * (C.wellRadius + 0.28), 0.06, C.cz + Math.sin(a) * (C.wellRadius + 0.28),
      0.30, 0.20, (TAU * C.wellRadius) / kn * 0.5 - 0.008, { yaw: -a, bevel: 0.014, uvScale: 0.7 });
  }
  // A graduation of the zodiac around the kerb: twelve long marks, sixty short.
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU;
    const long = i % 5 === 0;
    addBlock(bronze, C.cx + Math.cos(a) * (C.wellRadius + 0.42), 0.155, C.cz + Math.sin(a) * (C.wellRadius + 0.42),
      long ? 0.16 : 0.075, 0.012, long ? 0.018 : 0.010, { yaw: -a, bevel: 0.003, uvScale: 2.6 });
  }

  // The shaft wall dropping into the undercroft.
  for (let d = 0; d < 5; d++) {
    const y = -0.3 - d * 1.15;
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (d % 2) * (Math.PI / n);
      addBlock(stone, C.cx + Math.cos(a) * (C.wellRadius + 0.55), y, C.cz + Math.sin(a) * (C.wellRadius + 0.55),
        0.55, 0.56, (TAU * C.wellRadius) / n * 0.5, { yaw: -a, bevel: 0.02 });
    }
  }
  // Machinery glimpsed at the bottom: part of something much larger.
  for (let i = 0; i < 3; i++) {
    addRingBand(bronze, C.cx, -6.4 - i * 0.7, C.cz, {
      radius: 3.4 - i * 0.55, width: 0.20, depth: 0.14, segments: 48, axis: 1, uvScale: 0.7,
    });
  }
  addCylinder(dark, C.cx, -8.2, C.cz, { radius: 1.1, height: 2.2, segments: 20, uvScale: 0.6 });
  addRubble(stone, { x: C.cx, z: C.cz, y: -6.9, radius: 3.6, count: 40, rng, minSize: 0.12, maxSize: 0.5 });

  /* ---------------------------------------------------------------- */
  /* The drum wall                                                     */
  /* ---------------------------------------------------------------- */

  const segs = 40;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * TAU, a1 = ((i + 1) / segs) * TAU;
    const x0 = C.cx + Math.cos(a0) * C.radius, z0 = C.cz + Math.sin(a0) * C.radius;
    const x1 = C.cx + Math.cos(a1) * C.radius, z1 = C.cz + Math.sin(a1) * C.radius;
    // Leave the south segment open where the passage from the Hall enters.
    const am = (a0 + a1) * 0.5;
    const south = Math.abs(((am - Math.PI * 1.5 + Math.PI * 3) % TAU) - Math.PI);
    const isDoor = south > Math.PI - 0.16;
    addWall(stone, {
      from: [x0, z0], to: [x1, z1], base: -0.5, height: C.wallTop + 0.5,
      thickness: 1.5, course: 0.64, blockLen: 1.4, rng, ruin: 0.10,
      openings: isDoor ? [{ u0: -1, u1: 99, y0: -1, y1: 4.6 }]
        : (i % 5 === 2 ? [{ u0: 0.5, u1: 1.5, y0: 7.6, y1: 10.4 }] : []),
    });
  }

  // Twelve piers standing on the annulus, one per hour of right ascension.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + Math.PI / 12;
    const r = C.radius - 2.1;
    const x = C.cx + Math.cos(a) * r, z = C.cz + Math.sin(a) * r;
    addColumn(stone, x, 0, z, {
      height: C.galleryY - 0.35, radius: 0.44, segments: 22, flutes: 16, fluteDepth: 0.035,
      entasis: 1, plinth: 0.3, capital: 0.36, uvScale: 0.34,
    });
    // The gallery beam each pier carries.
    const a2 = ((i + 1) / 12) * TAU + Math.PI / 12;
    const x2 = C.cx + Math.cos(a2) * r, z2 = C.cz + Math.sin(a2) * r;
    addBeam(stone, x, C.galleryY - 0.12, z, x2, C.galleryY - 0.12, z2, { height: 0.42, width: 0.9 });
  }

  // Gallery deck around the rim, broken away on the north-east quarter.
  const gn = 72;
  for (let i = 0; i < gn; i++) {
    const a = (i / gn) * TAU;
    if (a > 0.35 && a < 1.5) continue;
    const rm = C.radius - 1.45;
    addBlock(stone, C.cx + Math.cos(a) * rm, C.galleryY, C.cz + Math.sin(a) * rm,
      1.15, 0.11, (TAU * rm) / gn * 0.5 - 0.01, { yaw: -a, bevel: 0.02 });
    if (i % 3 === 0 && rng() > 0.3) {
      addBlock(stone, C.cx + Math.cos(a) * (rm - 1.0), C.galleryY + 0.46, C.cz + Math.sin(a) * (rm - 1.0),
        0.09, 0.44, 0.09, { yaw: -a, bevel: 0.012 });
    }
  }

  addCornice(stone, {
    from: [C.cx - C.radius + 1, C.cz], to: [C.cx + C.radius - 1, C.cz], y: C.wallTop - 0.5,
    project: 0.3, layers: 2, layerHeight: 0.2, thickness: 0.7, piece: 1.6, rng, ruin: 0.2,
  });

  /* ---------------------------------------------------------------- */
  /* The dome, and its oculus                                          */
  /* ---------------------------------------------------------------- */

  const courses = 11;
  for (let c = 0; c < courses; c++) {
    const t = c / (courses - 1);
    const y = C.wallTop + t * (C.domeTop - C.wallTop);
    const rr = C.radius * Math.cos(t * Math.PI * 0.42) + C.oculusRadius * t * 0.25;
    const radius = Math.max(C.oculusRadius + 0.5, rr);
    const ch = (C.domeTop - C.wallTop) / courses;
    const n = Math.max(16, Math.round((TAU * radius) / 1.5));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (c % 2) * (Math.PI / n);
      // A section of the dome has fallen in on the north-east.
      if (c > 4 && a > 0.5 && a < 1.35 && rng() < 0.55) continue;
      const depth = 1.25 - t * 0.45;
      addBlock(stone, C.cx + Math.cos(a) * (radius + depth * 0.5), y + ch * 0.5, C.cz + Math.sin(a) * (radius + depth * 0.5),
        depth * 0.5, ch * 0.5 - 0.006, (TAU * radius) / n * 0.5 - 0.01,
        { yaw: -a, bevel: 0.026 });
    }
  }
  // The oculus ring: dressed black stone, the one exact edge in the room.
  const on = 48;
  for (let i = 0; i < on; i++) {
    const a = (i / on) * TAU;
    addBlock(dark, C.cx + Math.cos(a) * (C.oculusRadius + 0.3), C.domeTop - 0.2, C.cz + Math.sin(a) * (C.oculusRadius + 0.3),
      0.32, 0.22, (TAU * C.oculusRadius) / on * 0.5, { yaw: -a, bevel: 0.012, uvScale: 0.6 });
  }

  /* ---------------------------------------------------------------- */
  /* Fallen dome debris, and the plaster that survived                  */
  /* ---------------------------------------------------------------- */

  addRubble(stone, { x: C.cx + 6.2, z: C.cz + 6.6, y: 0, radius: 4.4, count: 64, rng, minSize: 0.15, maxSize: 0.95, bias: 0.8 });
  for (let i = 0; i < 6; i++) {
    const a = 2.2 + i * 0.55;
    const r = C.radius - 1.7;
    addBlock(plaster, C.cx + Math.cos(a) * r, 3.6, C.cz + Math.sin(a) * r, 0.06, 1.7, 1.5,
      { yaw: -a, bevel: 0.01, uvScale: 0.42 });
  }

  /* ---------------------------------------------------------------- */
  /* Stairs to the gallery                                             */
  /* ---------------------------------------------------------------- */

  addStairs(stone, {
    x: C.cx - C.radius + 2.6, y: 0, z: C.cz - 4.2, dir: [0, 1], steps: 20, rise: 0.32, run: 0.42,
    width: 2.0, rng, wear: 0.02, blockWidth: 1.1,
  });

  /* ---------------------------------------------------------------- */
  /* Colliders                                                         */
  /* ---------------------------------------------------------------- */

  // Annulus floor as a ring of boxes, the well left open.
  const cn = 24;
  for (let i = 0; i < cn; i++) {
    const a = (i / cn) * TAU;
    const rm = (C.wellRadius + C.radius) * 0.5;
    addBlock(collider, C.cx + Math.cos(a) * rm, -0.35, C.cz + Math.sin(a) * rm,
      (C.radius - C.wellRadius) * 0.5, 0.3, (TAU * rm) / cn * 0.6, { yaw: -a, bevel: 0 });
    addBlock(collider, C.cx + Math.cos(a) * (C.radius + 0.7), 6, C.cz + Math.sin(a) * (C.radius + 0.7),
      1.4, 8, (TAU * C.radius) / cn * 0.6, { yaw: -a, bevel: 0 });
  }
  // A rail around the well so the player cannot simply walk into it.
  for (let i = 0; i < cn; i++) {
    const a = (i / cn) * TAU;
    addBlock(collider, C.cx + Math.cos(a) * (C.wellRadius + 0.28), 0.5, C.cz + Math.sin(a) * (C.wellRadius + 0.28),
      0.3, 0.7, (TAU * C.wellRadius) / cn * 0.6, { yaw: -a, bevel: 0 });
  }

  return { COURT };
}

export { DEG };
