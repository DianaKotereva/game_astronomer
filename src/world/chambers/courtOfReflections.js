/**
 * The Court of Reflections.
 *
 * The east wing, and the only major space in the temple with no roof at all.
 * After the Hall's slit and the round court's oculus — both of which ration the
 * sky to a stripe or a disc — this one simply opens, and the whole sky is
 * overhead at once. That contrast is the reason it is here.
 *
 * The floor is the point. A field of polished black stone fourteen metres
 * across carries a figure inlaid in bronze: four stars and the four edges
 * between them, cut at a fixed number of metres to the degree. It is not
 * decoration and it is not a map of the court — it is the figure the builders
 * called the Gate, laid out full size on the ground, with a mirror mount
 * standing on each of its four stars.
 *
 * A player who has been to the Archive will recognise it. A player who has not
 * will see four mirrors, a beautiful floor, and no idea why the mounts are
 * where they are (§35, §83).
 *
 * World convention: +Z north, +X east, Y up. The temple's meridian is x = 0.
 */
import {
  addBlock, addWall, addFloor, addStairs, addRubble, addCornice,
  addColumn, addBeam, addCylinder, addDisc,
} from "../geo.js";
import { makeRng, TAU } from "../../core/scratch.js";

export const REFLECT = {
  cx: 34, cz: 38,
  /** Half-width of the enclosure: the court is 26 m square. */
  half: 13,
  floorY: 0,
  wallTop: 9.5,
  /** Radius of the polished field carrying the inlaid figure. */
  fieldRadius: 7.0,
  /** Sill of the west aperture that admits the figure's own light. */
  apertureY: 6.4,
  /** Doorway from the round court, in the west wall. */
  doorZ: 38,
};

export function buildCourtOfReflections(ctx) {
  const rng = makeRng(30402);
  const { stone, dark, bronze, plaster, collider } = ctx;
  const R = REFLECT;
  const x0 = R.cx - R.half, x1 = R.cx + R.half;
  const z0 = R.cz - R.half, z1 = R.cz + R.half;

  /* ---------------------------------------------------------------- */
  /* The floor: pale flags outside, polished black field inside         */
  /* ---------------------------------------------------------------- */

  addFloor(stone, {
    x0, x1, z0, z1, y: R.floorY, thickness: 0.26, slab: 1.7, rng, uvScale: 0.30,
    // The field is laid separately; leave its footprint out of the flagging.
    skip: (x, z) => Math.hypot(x - R.cx, z - R.cz) < R.fieldRadius - 0.1,
    subsidence: (x, z) => -0.02 * Math.max(0, 1 - Math.hypot(x - R.cx, z - R.cz) / 11),
  });

  // The field itself: one dressed surface, sunk two courses so that standing on
  // the flags you look slightly down into it, the way you look into water.
  addDisc(dark, R.cx, R.floorY - 0.06, R.cz, R.fieldRadius, 72, 1, 0.5);
  // Its kerb.
  const kn = 72;
  for (let i = 0; i < kn; i++) {
    const a = (i / kn) * TAU;
    addBlock(dark, R.cx + Math.cos(a) * (R.fieldRadius + 0.22), 0.02, R.cz + Math.sin(a) * (R.fieldRadius + 0.22),
      0.26, 0.14, (TAU * R.fieldRadius) / kn * 0.5 - 0.006, { yaw: -a, bevel: 0.012, uvScale: 0.7 });
  }

  /* ---------------------------------------------------------------- */
  /* Enclosure walls                                                    */
  /* ---------------------------------------------------------------- */

  const wallOpts = {
    base: -0.6, height: R.wallTop + 0.6, thickness: 1.4,
    course: 0.68, blockLen: 1.5, rng, ruin: 0.16,
  };

  // West wall: the doorway from the round court, and above it the aperture the
  // whole puzzle depends on — a square opening set high enough to look out at
  // the figure itself, which stands in the west at this hour.
  addWall(stone, {
    ...wallOpts, from: [x0, z0], to: [x0, z1], ruin: 0.08,
    openings: [
      { u0: (R.doorZ - z0) - 1.5, u1: (R.doorZ - z0) + 1.5, y0: -1, y1: 3.8 },
      { u0: (R.doorZ - z0) - 1.1, u1: (R.doorZ - z0) + 1.1, y0: R.apertureY, y1: R.apertureY + 2.2 },
    ],
  });
  addWall(stone, { ...wallOpts, from: [x1, z0], to: [x1, z1] });
  addWall(stone, { ...wallOpts, from: [x0, z1], to: [x1, z1] });
  addWall(stone, { ...wallOpts, from: [x0, z0], to: [x1, z0], ruin: 0.26 });

  // The aperture's dressed reveal — black stone, because every edge in this
  // temple that has to be exact is black stone.
  for (const s of [-1, 1]) {
    addBlock(dark, x0 + 0.5, R.apertureY + 1.1, R.doorZ + s * 1.22, 0.62, 1.1, 0.16, { bevel: 0.014, uvScale: 0.6 });
  }
  addBlock(dark, x0 + 0.5, R.apertureY + 2.3, R.doorZ, 0.62, 0.16, 1.38, { bevel: 0.014, uvScale: 0.6 });
  addBlock(dark, x0 + 0.5, R.apertureY - 0.12, R.doorZ, 0.62, 0.14, 1.38, { bevel: 0.014, uvScale: 0.6 });

  /* ---------------------------------------------------------------- */
  /* Peristyle: a colonnade on three sides, half of it down              */
  /* ---------------------------------------------------------------- */

  const colY = 6.2;
  const inset = 2.6;
  const runs = [
    { from: [x0 + inset, z0 + inset], to: [x1 - inset, z0 + inset] },   // south
    { from: [x0 + inset, z1 - inset], to: [x1 - inset, z1 - inset] },   // north
    { from: [x1 - inset, z0 + inset], to: [x1 - inset, z1 - inset] },   // east
  ];
  for (let r = 0; r < runs.length; r++) {
    const [ax, az] = runs[r].from, [bx, bz] = runs[r].to;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.round(len / 3.4));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
      // The south run is the ruined one: it lost its western half.
      const fallen = r === 0 && t < 0.45;
      if (!fallen) {
        addColumn(stone, cx, 0, cz, {
          height: colY, radius: 0.46, segments: 22, flutes: 20, fluteDepth: 0.032,
          entasis: 1, plinth: 0.3, capital: 0.38, uvScale: 0.32,
        });
        if (prev) addBeam(stone, prev[0], colY + 0.2, prev[1], cx, colY + 0.2, cz, { height: 0.46, width: 0.86, uvScale: 0.32 });
        prev = [cx, cz];
      } else {
        prev = null;
        // The drums of the fallen column, lying where they rolled.
        if (i % 2 === 0) {
          for (let d = 0; d < 3; d++) {
            addCylinder(stone, cx + 0.5 + d * 0.95 + rng() * 0.2, 0.44, cz + (rng() - 0.5) * 1.4, {
              radius: 0.44, height: 0.88, segments: 16, uvScale: 0.34,
            });
          }
        }
      }
    }
  }
  addRubble(stone, { x: x0 + 5.5, z: z0 + 2.4, y: 0, radius: 4.0, count: 52, rng, minSize: 0.14, maxSize: 0.8, bias: 0.8 });

  addCornice(stone, {
    from: [x0 + 1, z1 - 0.8], to: [x1 - 1, z1 - 0.8], y: R.wallTop - 0.7,
    project: 0.3, layers: 2, layerHeight: 0.2, thickness: 0.7, piece: 1.7, rng, ruin: 0.3,
  });

  /* ---------------------------------------------------------------- */
  /* The passage in from the round court                                */
  /* ---------------------------------------------------------------- */

  const passX0 = 13.0, passX1 = x0;
  addFloor(stone, {
    x0: passX0, x1: passX1 + 0.2, z0: R.doorZ - 1.7, z1: R.doorZ + 1.7,
    y: 0, thickness: 0.24, slab: 1.4, rng, uvScale: 0.32,
  });
  for (const s of [-1, 1]) {
    addWall(stone, {
      from: [passX0, R.doorZ + s * 1.7], to: [passX1, R.doorZ + s * 1.7],
      base: -0.5, height: 5.2, thickness: 0.9, course: 0.62, blockLen: 1.35, rng, ruin: 0.08, openings: [],
    });
  }
  // Roofed, so that stepping out into the open court reads as an arrival.
  addBlock(stone, (passX0 + passX1) * 0.5, 5.3, R.doorZ, (passX1 - passX0) * 0.5, 0.3, 1.7,
    { bevel: 0.02, uvScale: 0.32 });

  addStairs(stone, {
    x: passX1 + 0.2, y: 0, z: R.doorZ, dir: [1, 0], steps: 3, rise: 0.16, run: 0.44,
    width: 3.0, rng, wear: 0.03, blockWidth: 1.5, uvScale: 0.32,
  });

  /* ---------------------------------------------------------------- */
  /* Weathering                                                         */
  /* ---------------------------------------------------------------- */

  // Open to the weather for centuries: sand has drifted into the south-east
  // corner and the plaster has gone everywhere except under the colonnade.
  addRubble(stone, { x: x1 - 3.4, z: z0 + 3.0, y: 0, radius: 4.6, count: 40, rng, minSize: 0.06, maxSize: 0.3, bias: 0.9 });
  for (let i = 0; i < 5; i++) {
    addBlock(plaster, x0 + 1.0, 3.4 + rng() * 2, z0 + 4 + i * 4, 0.06, 1.3, 1.6, { bevel: 0.01, uvScale: 0.42 });
  }

  /* ---------------------------------------------------------------- */
  /* Colliders                                                          */
  /* ---------------------------------------------------------------- */

  addBlock(collider, R.cx, -0.3, R.cz, R.half, 0.3, R.half, { bevel: 0 });
  addBlock(collider, (passX0 + passX1) * 0.5, -0.3, R.doorZ, (passX1 - passX0) * 0.5 + 0.2, 0.5, 1.7, { bevel: 0 });
  // Enclosure, with the west doorway left open.
  addBlock(collider, x1 + 0.7, 5, R.cz, 0.8, 5, R.half + 0.8, { bevel: 0 });
  addBlock(collider, R.cx, 5, z1 + 0.7, R.half + 0.8, 5, 0.8, { bevel: 0 });
  addBlock(collider, R.cx, 5, z0 - 0.7, R.half + 0.8, 5, 0.8, { bevel: 0 });
  const gapHalf = 1.7;
  addBlock(collider, x0 - 0.7, 5, R.cz + (R.half + gapHalf) * 0.5, 0.8, 5, (R.half - gapHalf) * 0.5, { bevel: 0 });
  addBlock(collider, x0 - 0.7, 5, R.cz - (R.half + gapHalf) * 0.5, 0.8, 5, (R.half - gapHalf) * 0.5, { bevel: 0 });
  // Columns.
  for (let r = 0; r < runs.length; r++) {
    const [ax, az] = runs[r].from, [bx, bz] = runs[r].to;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.round(len / 3.4));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (r === 0 && t < 0.45) continue;
      addBlock(collider, ax + (bx - ax) * t, 2.4, az + (bz - az) * t, 0.5, 2.4, 0.5, { bevel: 0 });
    }
  }

  return { REFLECT: R, bounds: { x0, x1, z0, z1 } };
}
