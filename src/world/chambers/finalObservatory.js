/**
 * The Final Observatory.
 *
 * North on the meridian, and the largest thing the builders made: a drum
 * thirty-two metres across carrying a dome that closes twenty-eight metres up,
 * with an oculus five metres wide — shuttered, and shuttered for a long time.
 *
 * Everything here is aimed. The drum carries eight deep niches, each with a
 * bronze mirror still on its bearing; the floor is a single engraved plate; and
 * cut through the north wall, thirteen metres up, is a slit no wider than a hand
 * that looks out along one direction and one only: due north, at an altitude of
 * thirty-four degrees. That is the altitude of the celestial pole from this
 * latitude, and it is the only sight line in the temple that was cut for a fixed
 * point rather than for a moving one.
 *
 * The builders aimed it at their pole star. The whole difficulty of this room is
 * that it is no longer there (§36).
 *
 * World convention: +Z north, +X east, Y up. The temple's meridian is x = 0.
 */
import {
  addBlock, addWall, addFloor, addStairs, addRubble, addCornice,
  addColumn, addBeam, addCylinder, addDisc, addRingBand, addArch,
} from "../geo.js";
import { makeRng, TAU, DEG } from "../../core/scratch.js";
import { OBSERVER } from "../../astronomy/celestial.js";

export const OBSERVATORY = {
  cx: 0, cz: 74,
  radius: 16.0,
  floorY: 0,
  /** The raised instrument platform in the middle. */
  platformR: 6.0,
  platformY: 1.10,
  galleryY: 9.0,
  // High enough that the polar slit is an enclosed cut rather than a notch off
  // the wall head: the sight line meets the drum at 13.4 m and the slit is
  // 1.7 m tall, so the wall has to carry past 14.3.
  wallTop: 15.5,
  domeTop: 28.0,
  oculusR: 5.0,
  /** South doorway, where the passage from the round court arrives. */
  doorZ: 58.0,
  /** Height of the polar sight slit where it pierces the north wall. */
  get sightY() {
    // The axis springs from the instrument head and leaves due north at the
    // altitude of the pole. Where it meets the drum wall is where the slit is.
    return 2.60 + OBSERVATORY.radius * Math.tan(OBSERVER.latitude * DEG);
  },
};

export function buildFinalObservatory(ctx) {
  const rng = makeRng(148100);
  const { stone, dark, bronze, plaster, collider } = ctx;
  const O = OBSERVATORY;
  const sightY = O.sightY;

  /* ---------------------------------------------------------------- */
  /* Floor: an engraved plate, and the platform standing on it          */
  /* ---------------------------------------------------------------- */

  const rings = 6;
  for (let r = 0; r < rings; r++) {
    const r0 = O.platformR + (r / rings) * (O.radius - O.platformR);
    const r1 = O.platformR + ((r + 1) / rings) * (O.radius - O.platformR);
    const rm = (r0 + r1) * 0.5;
    const n = Math.max(14, Math.round((TAU * rm) / 1.9));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (r % 2) * (Math.PI / n);
      addBlock(stone, O.cx + Math.cos(a) * rm, -0.14, O.cz + Math.sin(a) * rm,
        (r1 - r0) * 0.5 - 0.014, 0.14, (TAU * rm) / n * 0.5 - 0.014,
        { yaw: -a, bevel: 0.02, noBottom: true, uvScale: 0.30 });
    }
  }

  // The engraved plate: concentric circles of declination, and twenty-four
  // radial hour lines. It is a coordinate grid, cut into the floor at temple
  // scale, and it is what the map at the end will be drawn on.
  for (let d = 1; d <= 5; d++) {
    const rr = O.platformR + (d / 5) * (O.radius - O.platformR - 1.2);
    // 1.3 m per piece. A bronze line 40 mm wide reads as a line at any
    // tessellation finer than the eye can resolve the chord, and at 0.5 m this
    // ring alone was costing more vertices than the entire Archive's shelving.
    const n = Math.max(40, Math.round(TAU * rr / 1.3));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      addBlock(bronze, O.cx + Math.cos(a) * rr, -0.036, O.cz + Math.sin(a) * rr,
        0.02, 0.010, (TAU * rr) / n * 0.5, { yaw: -a, bevel: 0.003, uvScale: 2.4 });
    }
  }
  for (let h = 0; h < 24; h++) {
    const a = (h / 24) * TAU;
    const long = h % 6 === 0;
    const r0 = O.platformR + 0.3, r1 = O.radius - (long ? 1.0 : 2.6);
    addBlock(bronze, O.cx + Math.cos(a) * (r0 + r1) * 0.5, -0.036, O.cz + Math.sin(a) * (r0 + r1) * 0.5,
      (r1 - r0) * 0.5, 0.010, long ? 0.028 : 0.016, { yaw: -a, bevel: 0.003, uvScale: 2.4 });
  }

  // The platform: black stone, three steps up, with a bronze kerb.
  addDisc(dark, O.cx, O.platformY, O.cz, O.platformR, 64, 1, 0.5);
  for (let d = 0; d < 3; d++) {
    const rr = O.platformR + 0.36 * (d + 1);
    const n = Math.max(30, Math.round(TAU * rr / 1.3));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (d % 2) * (Math.PI / n);
      addBlock(dark, O.cx + Math.cos(a) * rr, O.platformY - 0.19 - d * 0.37, O.cz + Math.sin(a) * rr,
        0.19, 0.19, (TAU * rr) / n * 0.5 - 0.01, { yaw: -a, bevel: 0.018, uvScale: 0.6 });
    }
  }
  const kn = 72;
  for (let i = 0; i < kn; i++) {
    const a = (i / kn) * TAU;
    addBlock(bronze, O.cx + Math.cos(a) * (O.platformR - 0.16), O.platformY + 0.02, O.cz + Math.sin(a) * (O.platformR - 0.16),
      0.10, 0.012, (TAU * O.platformR) / kn * 0.5, { yaw: -a, bevel: 0.004, uvScale: 2.0 });
  }

  /* ---------------------------------------------------------------- */
  /* The drum wall, its niches, the door and the sight slit             */
  /* ---------------------------------------------------------------- */

  const segs = 48;
  const doorAz = Math.PI * 1.5;                       // south
  const niches = [];
  for (let i = 0; i < 8; i++) {
    // Eight mirror niches, avoiding due north (the slit) and due south (the door).
    const a = (i / 8) * TAU + Math.PI / 8;
    niches.push(a);
  }

  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * TAU, a1 = ((i + 1) / segs) * TAU;
    const am = (a0 + a1) * 0.5;
    const x0 = O.cx + Math.cos(a0) * O.radius, z0 = O.cz + Math.sin(a0) * O.radius;
    const x1 = O.cx + Math.cos(a1) * O.radius, z1 = O.cz + Math.sin(a1) * O.radius;

    const dDoor = Math.abs(((am - doorAz + Math.PI * 3) % TAU) - Math.PI);
    const dNorth = Math.abs(((am - Math.PI * 0.5 + Math.PI * 3) % TAU) - Math.PI);

    const openings = [];
    if (dDoor < 0.14) openings.push({ u0: -1, u1: 99, y0: -1, y1: 5.2 });
    // The sight slit: narrow, and the one exact cut in the room.
    if (dNorth < 0.045) openings.push({ u0: -1, u1: 99, y0: sightY - 0.85, y1: sightY + 0.85 });
    // Gallery openings between the niches.
    if (i % 6 === 3) openings.push({ u0: 0.4, u1: 1.5, y0: O.galleryY + 0.9, y1: O.galleryY + 3.2 });

    addWall(stone, {
      from: [x0, z0], to: [x1, z1], base: -0.6, height: O.wallTop + 0.6,
      thickness: 1.8, course: 0.72, blockLen: 1.6, rng, ruin: 0.09, openings,
    });
  }

  // The slit's dressed reveal, in black stone. Every exact edge is black stone.
  for (const s of [-1, 1]) {
    addBlock(dark, s * 0.55, sightY, O.cz + O.radius - 0.6, 0.10, 0.95, 0.85, { bevel: 0.012, uvScale: 0.6 });
  }
  addBlock(dark, 0, sightY + 0.90, O.cz + O.radius - 0.6, 0.62, 0.10, 0.85, { bevel: 0.012, uvScale: 0.6 });
  addBlock(dark, 0, sightY - 0.90, O.cz + O.radius - 0.6, 0.62, 0.10, 0.85, { bevel: 0.012, uvScale: 0.6 });

  // The eight niches, each deep enough to stand a mirror in.
  for (const a of niches) {
    const cx = O.cx + Math.cos(a) * (O.radius - 0.5), cz = O.cz + Math.sin(a) * (O.radius - 0.5);
    for (const s of [-1, 1]) {
      addBlock(stone, cx - Math.cos(a) * 0.2 + Math.sin(a) * s * 1.5, 2.6, cz - Math.sin(a) * 0.2 - Math.cos(a) * s * 1.5,
        0.7, 2.6, 0.28, { yaw: -a, bevel: 0.024, uvScale: 0.32 });
    }
    addArch(stone, {
      x: cx, z: cz, y: 5.2, span: 3.0, depth: 1.2, thickness: 0.5, segments: 11,
      yaw: -a + Math.PI / 2, rng, uvScale: 0.32,
    });
    addBlock(stone, cx + Math.cos(a) * 0.5, 2.6, cz + Math.sin(a) * 0.5, 0.3, 2.6, 1.5,
      { yaw: -a, bevel: 0.02, uvScale: 0.34 });
    // The bearing block the mirror stands on.
    addBlock(dark, cx, 0.55, cz, 0.5, 0.55, 0.5, { yaw: -a, bevel: 0.025, uvScale: 0.6 });
  }

  /* ---------------------------------------------------------------- */
  /* Gallery                                                            */
  /* ---------------------------------------------------------------- */

  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + Math.PI / 16;
    const r = O.radius - 2.4;
    addColumn(stone, O.cx + Math.cos(a) * r, 0, O.cz + Math.sin(a) * r, {
      height: O.galleryY - 0.4, radius: 0.5, segments: 24, flutes: 22, fluteDepth: 0.036,
      entasis: 1, plinth: 0.34, capital: 0.42, uvScale: 0.32,
    });
    const a2 = ((i + 1) / 16) * TAU + Math.PI / 16;
    addBeam(stone, O.cx + Math.cos(a) * r, O.galleryY - 0.15, O.cz + Math.sin(a) * r,
      O.cx + Math.cos(a2) * r, O.galleryY - 0.15, O.cz + Math.sin(a2) * r,
      { height: 0.5, width: 1.0, uvScale: 0.32 });
  }
  const gn = 96;
  for (let i = 0; i < gn; i++) {
    const a = (i / gn) * TAU;
    // The gallery has come down on the north-west quadrant.
    if (a > 1.75 && a < 2.75 && rng() < 0.8) continue;
    const rm = O.radius - 1.6;
    addBlock(stone, O.cx + Math.cos(a) * rm, O.galleryY, O.cz + Math.sin(a) * rm,
      1.3, 0.12, (TAU * rm) / gn * 0.5 - 0.01, { yaw: -a, bevel: 0.02, uvScale: 0.32 });
  }

  addCornice(stone, {
    from: [O.cx - O.radius + 1.5, O.cz], to: [O.cx + O.radius - 1.5, O.cz], y: O.wallTop - 0.9,
    project: 0.36, layers: 3, layerHeight: 0.22, thickness: 0.8, piece: 1.8, rng, ruin: 0.22,
  });

  /* ---------------------------------------------------------------- */
  /* The dome                                                           */
  /* ---------------------------------------------------------------- */

  const courses = 14;
  for (let c = 0; c < courses; c++) {
    const t = c / (courses - 1);
    const y = O.wallTop + t * (O.domeTop - O.wallTop);
    const rr = O.radius * Math.cos(t * Math.PI * 0.44) + O.oculusR * t * 0.3;
    const radius = Math.max(O.oculusR + 0.6, rr);
    const ch = (O.domeTop - O.wallTop) / courses;
    const n = Math.max(18, Math.round((TAU * radius) / 1.7));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (c % 2) * (Math.PI / n);
      if (c > 6 && a > 1.9 && a < 2.6 && rng() < 0.4) continue;   // the fallen quadrant
      const depth = 1.4 - t * 0.5;
      addBlock(stone, O.cx + Math.cos(a) * (radius + depth * 0.5), y + ch * 0.5, O.cz + Math.sin(a) * (radius + depth * 0.5),
        depth * 0.5, ch * 0.5 - 0.008, (TAU * radius) / n * 0.5 - 0.012,
        { yaw: -a, bevel: 0.028, uvScale: 0.30 });
    }
  }
  // The oculus ring: the seat the shutters close against.
  const on = 56;
  for (let i = 0; i < on; i++) {
    const a = (i / on) * TAU;
    addBlock(dark, O.cx + Math.cos(a) * (O.oculusR + 0.42), O.domeTop - 0.28, O.cz + Math.sin(a) * (O.oculusR + 0.42),
      0.44, 0.28, (TAU * O.oculusR) / on * 0.5, { yaw: -a, bevel: 0.014, uvScale: 0.6 });
  }

  /* ---------------------------------------------------------------- */
  /* Passage in from the round court                                    */
  /* ---------------------------------------------------------------- */

  const passZ0 = 51.0, passZ1 = O.cz - O.radius;
  addFloor(stone, {
    x0: -2.0, x1: 2.0, z0: passZ0, z1: passZ1 + 0.4, y: 0, thickness: 0.24, slab: 1.5, rng, uvScale: 0.32,
  });
  for (const s of [-1, 1]) {
    addWall(stone, {
      from: [s * 2.0, passZ0], to: [s * 2.0, passZ1], base: -0.5, height: 6.4,
      thickness: 1.0, course: 0.66, blockLen: 1.45, rng, ruin: 0.10, openings: [],
    });
  }
  for (let z = passZ0 + 0.8; z < passZ1; z += 1.5) {
    addArch(stone, { x: 0, z, y: 3.2, span: 4.0, depth: 1.45, thickness: 0.55, segments: 11, yaw: 0, rng, uvScale: 0.32 });
  }
  addStairs(stone, {
    x: 0, y: 0, z: passZ1 + 0.4, dir: [0, 1], steps: 4, rise: 0.20, run: 0.5,
    width: 3.6, rng, wear: 0.04, blockWidth: 1.8, uvScale: 0.32,
  });
  // Steps up onto the instrument platform, on the south side.
  addStairs(dark, {
    x: 0, y: 0, z: O.cz - O.platformR - 1.5, dir: [0, 1], steps: 4, rise: 0.28, run: 0.42,
    width: 3.0, rng, wear: 0.02, blockWidth: 1.5, uvScale: 0.6,
  });

  /* ---------------------------------------------------------------- */
  /* Ruin                                                               */
  /* ---------------------------------------------------------------- */

  addRubble(stone, { x: O.cx - 8.5, z: O.cz + 7.5, y: 0, radius: 5.4, count: 76, rng, minSize: 0.18, maxSize: 1.15, bias: 0.8 });
  addRubble(stone, { x: O.cx + 9.0, z: O.cz - 6.0, y: 0, radius: 3.4, count: 34, rng, minSize: 0.10, maxSize: 0.55, bias: 0.85 });
  for (let i = 0; i < 8; i++) {
    const a = 3.4 + i * 0.42;
    addBlock(plaster, O.cx + Math.cos(a) * (O.radius - 1.9), 6.0 + rng() * 3, O.cz + Math.sin(a) * (O.radius - 1.9),
      0.07, 1.9, 1.7, { yaw: -a, bevel: 0.01, uvScale: 0.42 });
  }

  /* ---------------------------------------------------------------- */
  /* Colliders                                                          */
  /* ---------------------------------------------------------------- */

  const cn = 28;
  for (let i = 0; i < cn; i++) {
    const a = (i / cn) * TAU;
    const rm = (O.platformR + O.radius) * 0.5;
    addBlock(collider, O.cx + Math.cos(a) * rm, -0.35, O.cz + Math.sin(a) * rm,
      (O.radius - O.platformR) * 0.5, 0.3, (TAU * rm) / cn * 0.6, { yaw: -a, bevel: 0 });
    const dDoor = Math.abs(((a - doorAz + Math.PI * 3) % TAU) - Math.PI);
    if (dDoor > 0.16) {
      addBlock(collider, O.cx + Math.cos(a) * (O.radius + 0.9), 7, O.cz + Math.sin(a) * (O.radius + 0.9),
        1.6, 9, (TAU * O.radius) / cn * 0.6, { yaw: -a, bevel: 0 });
    }
  }
  // Platform top and its rim.
  addBlock(collider, O.cx, O.platformY - 0.3, O.cz, O.platformR, 0.3, O.platformR, { bevel: 0 });
  addBlock(collider, 0, -0.3, (passZ0 + passZ1) * 0.5, 2.0, 0.3, (passZ1 - passZ0) * 0.5 + 0.6, { bevel: 0 });
  for (const s of [-1, 1]) {
    addBlock(collider, s * 2.6, 3, (passZ0 + passZ1) * 0.5, 0.6, 3, (passZ1 - passZ0) * 0.5, { bevel: 0 });
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + Math.PI / 16;
    const r = O.radius - 2.4;
    addBlock(collider, O.cx + Math.cos(a) * r, 3, O.cz + Math.sin(a) * r, 0.56, 3, 0.56, { bevel: 0 });
  }

  return { OBSERVATORY: O, niches, sightY };
}
