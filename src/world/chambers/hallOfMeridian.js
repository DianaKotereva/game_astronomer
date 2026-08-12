/**
 * The Hall of Meridian.
 *
 * A tall north–south hall whose entire purpose is one measurement. A 0.9 m slit
 * runs the length of the vault, 24 m up. When a celestial body crosses the local
 * meridian its light falls through that slit as a stripe lying exactly along the
 * bronze line inlaid in the floor — and how far north the stripe lands encodes
 * the body's altitude, which is read against the scale engraved beside the line.
 *
 * That is a real instrument, and it is why the room is shaped the way it is: the
 * height gives the scale its resolution, the narrowness of the slit gives the
 * stripe its edge, and the hall runs north–south because the meridian does.
 *
 * World convention: +Z north, +X east, Y up. The meridian is the plane x = 0.
 */
import { addBlock, addWall, addFloor, addStairs, addRubble, addCornice, addCylinder, addDisc, addBeam } from "../geo.js";
import { makeRng, TAU, DEG } from "../../core/scratch.js";

export const HALL = {
  x0: -9, x1: 9,
  z0: -15, z1: 17,
  wallTop: 15.2,
  vaultTop: 24.0,
  slitHalfWidth: 0.45,
  galleryY: 8.6,
  /** Metres north per degree of altitude on the floor scale. */
  scaleZ0: 2.0,
};

/**
 * @param {Object} ctx
 * @param {import("../../core/bjs.js").Scene} ctx.scene
 * @param {import("../../materials/materials.js").MaterialLib} ctx.mats
 * @param {import("../geo.js").Accum} ctx.stone
 * @param {import("../geo.js").Accum} ctx.dark
 * @param {import("../geo.js").Accum} ctx.bronze
 * @param {import("../geo.js").Accum} ctx.plaster
 * @param {import("../geo.js").Accum} ctx.collider
 */
export function buildHallOfMeridian(ctx) {
  const rng = makeRng(20250808);
  const { stone, dark, bronze, plaster, collider } = ctx;
  const H = HALL;

  /* ------------------------------------------------------------------ */
  /* Floor                                                               */
  /* ------------------------------------------------------------------ */

  // Subsidence: the hall has settled toward its centre over centuries.
  const subsidence = (x, z) => {
    const r = Math.hypot(x * 0.55, (z - 2) * 0.34);
    return -Math.exp(-r * r * 0.06) * 0.085 - Math.max(0, 0.03 * Math.sin(z * 0.7 + x * 0.3));
  };

  // The meridian strip itself is laid separately, so the slab field skips it.
  addFloor(stone, {
    x0: H.x0, x1: H.x1, z0: H.z0, z1: H.z1, y: 0, slab: 1.75, thickness: 0.3, rng,
    subsidence,
    skip: (x, z) => Math.abs(x) < 1.15 || (x > 4.4 && x < 7.2 && z > 6.4 && z < 10.2),
  });

  // Collapsed floor pocket on the east side — the sub-floor gallery below shows.
  addRubble(stone, { x: 5.8, z: 8.3, y: -0.9, radius: 1.9, count: 42, rng, minSize: 0.1, maxSize: 0.5, bias: 0.7 });
  addFloor(dark, {
    x0: 4.4, x1: 7.2, z0: 6.4, z1: 10.2, y: -1.35, slab: 1.2, thickness: 0.25, rng,
    subsidence: () => 0,
  });

  /* ------------------------------------------------------------------ */
  /* The meridian line                                                   */
  /* ------------------------------------------------------------------ */

  // Black stone kerbs either side, a bronze strip between them.
  for (const side of [-1, 1]) {
    for (let z = H.z0; z < H.z1; z += 1.6) {
      const len = Math.min(1.6, H.z1 - z) - 0.02;
      addBlock(dark, side * 0.62, -0.06 + subsidence(0, z + len / 2), z + len / 2,
        0.46, 0.13, len * 0.5, {
        bevel: 0.02, uvScale: 0.5,
      });
    }
  }
  for (let z = H.z0; z < H.z1; z += 2.4) {
    const len = Math.min(2.4, H.z1 - z) - 0.012;
    addBlock(bronze, 0, -0.055 + subsidence(0, z + len / 2), z + len / 2,
      0.16, 0.022, len * 0.5, { bevel: 0.006, uvScale: 1.6, uvContinuous: true });
  }

  // Altitude scale: a graduated bronze rule beside the line. Degree marks every
  // metre-ish, with taller marks every five degrees. This is the thing the
  // player actually reads.
  for (let deg = 44; deg <= 84; deg += 1) {
    const z = altitudeToZ(deg);
    if (z < H.z0 + 0.6 || z > H.z1 - 0.6) continue;
    const major = deg % 5 === 0;
    const len = major ? 0.42 : 0.2;
    addBlock(bronze, 0.62 + len * 0.5, -0.045 + subsidence(0.9, z), z,
      len * 0.5, 0.016, major ? 0.035 : 0.018, { bevel: 0.004, uvScale: 2.4 });
    if (major) {
      // A small square index plate for the engraved numeral.
      addBlock(bronze, 1.42, -0.05 + subsidence(1.4, z), z, 0.16, 0.012, 0.16, { bevel: 0.006, uvScale: 2.4 });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Side walls, pilasters, niches                                       */
  /* ------------------------------------------------------------------ */

  for (const side of [-1, 1]) {
    const x = side * H.x1;
    // The east wall has partially collapsed around the floor pocket.
    const ruin = side > 0 ? 0.22 : 0.07;
    addWall(stone, {
      from: [x, H.z0], to: [x, H.z1], base: -0.4, height: H.wallTop + 0.4,
      thickness: 1.5, course: 0.66, blockLen: 1.5, rng, ruin,
      openings: side > 0
        ? [{ u0: 20.5, u1: 24.5, y0: 5.2, y1: 12.4 }]     // breach, east wall
        : [{ u0: 6.2, u1: 8.0, y0: 9.4, y1: 13.6 }],      // high window, west wall
    });

    // Pilasters every 4.2 m, running the full height — vertical rhythm.
    for (let z = H.z0 + 2.1; z < H.z1; z += 4.2) {
      addBlock(stone, x - side * 0.86, (H.wallTop - 0.4) * 0.5, z,
        0.42, (H.wallTop - 0.4) * 0.5, 0.72, { bevel: 0.03 });
      // corbel bracket carrying the gallery
      addBlock(stone, x - side * 1.45, H.galleryY - 0.42, z, 0.62, 0.2, 0.5, { bevel: 0.035 });
      addBlock(stone, x - side * 1.2, H.galleryY - 0.72, z, 0.4, 0.16, 0.4, { bevel: 0.03 });
    }

    // Shallow niches between pilasters, with plaster remains and faded pigment.
    for (let z = H.z0 + 4.2; z < H.z1 - 2; z += 4.2) {
      const nicheY = 3.4;
      plaster.uvScale = 0.42;
      addBlock(plaster, x - side * 1.52, nicheY, z, 0.06, 1.5, 1.35, { bevel: 0.01, uvScale: 0.42 });
      // jambs and head
      addBlock(stone, x - side * 1.36, nicheY + 1.62, z, 0.22, 0.16, 1.55, { bevel: 0.02 });
      for (const s2 of [-1, 1]) {
        addBlock(stone, x - side * 1.36, nicheY, z + s2 * 1.5, 0.22, 1.7, 0.22, { bevel: 0.02 });
      }
    }

    // Gallery walkway at 8.6 m — lets the player later look down on the hall.
    for (let z = H.z0 + 0.6; z < H.z1; z += 1.55) {
      if (side > 0 && z > 5.2 && z < 10.4) continue;       // collapsed section
      const len = Math.min(1.55, H.z1 - z) - 0.02;
      addBlock(stone, x - side * 1.85, H.galleryY - 0.1, z + len * 0.5,
        1.05, 0.12, len * 0.5, { bevel: 0.02 });
    }
    // Balustrade, mostly gone.
    for (let z = H.z0 + 0.9; z < H.z1; z += 0.62) {
      if (side > 0 && z > 4.8 && z < 11.0) continue;
      if (rng() < 0.34) continue;
      addBlock(stone, x - side * 2.72, H.galleryY + 0.34, z, 0.09, 0.42, 0.09, { bevel: 0.012 });
    }
    for (let z = H.z0 + 0.7; z < H.z1; z += 2.2) {
      if (side > 0 && z > 4.4 && z < 11.4) continue;
      if (rng() < 0.28) continue;
      const len = Math.min(2.2, H.z1 - z) - 0.03;
      addBlock(stone, x - side * 2.72, H.galleryY + 0.63, z + len * 0.5, 0.16, 0.09, len * 0.5, { bevel: 0.016 });
    }

    addCornice(stone, {
      from: [x - side * 1.0, H.z0], to: [x - side * 1.0, H.z1], y: H.wallTop - 0.6,
      project: 0.34, layers: 3, layerHeight: 0.2, thickness: 0.8, piece: 1.7, rng, ruin: 0.16,
    });

    // Rubble along the wall feet.
    addRubble(stone, {
      x: x - side * 2.2, z: 0, y: 0, radius: 12, count: 26, rng,
      minSize: 0.08, maxSize: 0.34, bias: 0.5,
      yAt: (px, pz) => subsidence(px, pz),
    });
  }

  // Fallen blocks from the east breach.
  addRubble(stone, { x: 7.2, z: 7.6, y: 0, radius: 3.4, count: 30, rng, minSize: 0.18, maxSize: 0.78, bias: 0.75 });

  /* ------------------------------------------------------------------ */
  /* Vault and the meridian slit                                         */
  /* ------------------------------------------------------------------ */

  // Corbelled vault: successive courses step inward until only the slit is left.
  // Corbelling (rather than a true arch) suits a civilisation of stonemasons and
  // gives the ceiling a stepped profile that catches the moon beautifully.
  const courses = 13;
  for (let i = 0; i < courses; i++) {
    const t = i / (courses - 1);
    const y = H.wallTop + t * (H.vaultTop - H.wallTop);
    const halfWidth = lerpf(H.x1 - 0.2, H.slitHalfWidth + 0.55, Math.pow(t, 0.78));
    const ch = (H.vaultTop - H.wallTop) / courses;
    for (const side of [-1, 1]) {
      for (let z = H.z0; z < H.z1; z += 1.45) {
        if (side > 0 && i > 7 && z > 5.6 && z < 9.4 && rng() < 0.5) continue;  // broken vault over the breach
        const len = Math.min(1.45, H.z1 - z) - 0.02;
        const depth = 1.35 - t * 0.5;
        addBlock(stone, side * (halfWidth + depth * 0.5), y + ch * 0.5, z + len * 0.5,
          depth * 0.5, ch * 0.5 - 0.008, len * 0.5,
          { bevel: 0.028 });
      }
    }
  }

  // The slit's own dressed lip: black stone, precisely cut. The contrast between
  // the rough corbelling and this one exact edge is the point.
  for (const side of [-1, 1]) {
    for (let z = H.z0; z < H.z1; z += 2.1) {
      const len = Math.min(2.1, H.z1 - z) - 0.01;
      addBlock(dark, side * (H.slitHalfWidth + 0.28), H.vaultTop - 0.16, z + len * 0.5,
        0.28, 0.18, len * 0.5, { bevel: 0.012, uvScale: 0.6 });
    }
  }

  /* ------------------------------------------------------------------ */
  /* South portal and north apse                                         */
  /* ------------------------------------------------------------------ */

  // South wall with the great doorway.
  addWall(stone, {
    from: [H.x0, H.z0], to: [H.x1, H.z0], base: -0.4, height: H.wallTop + 0.4,
    thickness: 1.6, course: 0.66, blockLen: 1.45, rng, ruin: 0.05,
    openings: [{ u0: 6.4, u1: 11.6, y0: -1, y1: 7.6 }],
  });
  // Relieving arch over the portal, and a heavy lintel.
  addBeam(stone, -2.6, 7.9, H.z0, 2.6, 7.9, H.z0, { height: 0.85, width: 1.7 });
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.12 + 0.76 * (i / 8));
    const r = 3.3;
    addBlock(stone, Math.cos(a) * r, 8.4 + Math.sin(a) * r * 0.62, H.z0,
      0.34, 0.44, 0.85, { yaw: 0, bevel: 0.02 });
  }
  // Jamb reveals in black stone.
  for (const s of [-1, 1]) {
    addBlock(dark, s * 2.72, 3.7, H.z0, 0.2, 3.9, 0.86, { bevel: 0.02, uvScale: 0.55 });
  }

  // North wall. Two openings: a high light-slot, and the doorway the great
  // shutter has been holding closed.
  addWall(stone, {
    from: [H.x0, H.z1], to: [H.x1, H.z1], base: -0.4, height: H.wallTop + 0.4,
    thickness: 1.6, course: 0.66, blockLen: 1.45, rng, ruin: 0.1,
    openings: [
      { u0: 7.2, u1: 10.8, y0: 9.2, y1: 13.0 },
      { u0: 7.3, u1: 10.7, y0: -1, y1: 4.4 },
    ],
  });
  // Lintel and jambs of the shutter doorway, dressed in black stone.
  addBeam(dark, -1.9, 4.62, H.z1, 1.9, 4.62, H.z1, { height: 0.46, width: 1.7, uvScale: 0.5 });
  for (const s2 of [-1, 1]) {
    addBlock(dark, s2 * 1.82, 2.2, H.z1, 0.16, 2.3, 0.85, { bevel: 0.025, uvScale: 0.5 });
  }
  // The passage beyond, so the doorway leads somewhere when it opens.
  for (const s2 of [-1, 1]) {
    addWall(stone, {
      from: [s2 * 1.9, H.z1 + 0.8], to: [s2 * 1.9, H.z1 + 7.5], base: -0.4, height: 5.2,
      thickness: 0.8, course: 0.6, blockLen: 1.3, rng, ruin: 0.04,
    });
  }
  addFloor(stone, { x0: -1.9, x1: 1.9, z0: H.z1 + 0.4, z1: H.z1 + 7.5, y: 0, slab: 1.3, thickness: 0.28, rng });
  for (let z = H.z1 + 0.8; z < H.z1 + 7.4; z += 1.4) {
    addBlock(stone, 0, 5.3, z, 2.4, 0.32, 0.68, { bevel: 0.03 });
  }

  /* ------------------------------------------------------------------ */
  /* Steps down into the hall from the south                             */
  /* ------------------------------------------------------------------ */

  addStairs(stone, {
    x: 0, y: 1.35, z: H.z0 - 0.2, dir: [0, 1], steps: 5, rise: 0.27, run: 0.46,
    width: 5.2, rng, wear: 0.02, blockWidth: 1.75,
  });

  /* ------------------------------------------------------------------ */
  /* Water basin on the line                                             */
  /* ------------------------------------------------------------------ */

  const basinZ = -7.5;
  addCylinder(dark, 0, -0.28, basinZ, {
    radius: 2.05, height: 0.62, segments: 40, uvScale: 0.55, capTop: false, capBottom: false,
  });
  addDisc(dark, 0, -0.28, basinZ, 2.05, 40, -1, 0.55);
  addDisc(dark, 0, 0.34, basinZ, 2.05, 40, 1, 0.55, 1.72);
  addDisc(dark, 0, -0.24, basinZ, 1.72, 40, 1, 0.55);
  // rim
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    addBlock(dark, Math.cos(a) * 1.92, 0.36, basinZ + Math.sin(a) * 1.92,
      0.24, 0.06, 0.22, { yaw: -a, bevel: 0.012, uvScale: 0.7 });
  }

  /* ------------------------------------------------------------------ */
  /* Colliders                                                           */
  /* ------------------------------------------------------------------ */

  // Simple hull: floor plane, four walls, the pier and the basin.
  addBlock(collider, 0, -0.35, (H.z0 + H.z1) / 2, 12, 0.3, 18, { bevel: 0 });
  for (const side of [-1, 1]) {
    addBlock(collider, side * (H.x1 + 0.4), 9, (H.z0 + H.z1) / 2, 1.2, 12, 18, { bevel: 0 });
  }
  // North wall, split around the shutter doorway.
  for (const s2 of [-1, 1]) {
    addBlock(collider, s2 * 5.6, 9, H.z1 + 0.9, 3.7, 12, 1.2, { bevel: 0 });
  }
  addBlock(collider, 0, 8.4, H.z1 + 0.9, 2.2, 4.2, 1.2, { bevel: 0 });
  // The passage beyond.
  addBlock(collider, 0, -0.35, H.z1 + 4, 2.4, 0.3, 4, { bevel: 0 });
  for (const s2 of [-1, 1]) {
    addBlock(collider, s2 * 2.3, 2.6, H.z1 + 4, 0.5, 3, 4, { bevel: 0 });
  }
  addBlock(collider, 0, 5.6, H.z1 + 4, 2.4, 0.4, 4, { bevel: 0 });
  for (const s of [-1, 1]) {
    // The south wall, either side of the portal. These were centred at ±5.9
    // with a half-width of 6.2, so they met at x = ±0.3 and sealed the doorway
    // the masonry leaves open — invisible while the player was spawned inside
    // the hall, fatal now that they walk in from the Approach.
    addBlock(collider, s * 6.0, 9, H.z0 - 0.9, 3.4, 12, 1.2, { bevel: 0 });
  }
  addCylinder(collider, 0, 0, basinZ, { radius: 2.1, height: 0.7, segments: 16, capTop: false });

  return { subsidence, altitudeToZ };
}

/**
 * Where the southern edge of the light stripe falls for a body of the given
 * altitude transiting the meridian.
 *
 * The slit runs the length of the vault, so light entering it lays a band along
 * the floor whose *southern edge* is cast by the slit's own southern end — and
 * that edge is what the scale reads. Pure geometry: a beam entering at the
 * aperture height and descending at `alt` travels aperture/tan(alt) northward
 * before it reaches the floor.
 */
export function altitudeToZ(altDeg) {
  const t = Math.tan(Math.max(1, Math.min(89, altDeg)) * DEG);
  return HALL.z0 + (HALL.vaultTop - 0.05) / t;
}

/** Inverse of altitudeToZ. */
export function zToAltitude(z) {
  const d = z - HALL.z0;
  if (d <= 0.3) return 89;
  return Math.atan((HALL.vaultTop - 0.05) / d) / DEG;
}

function lerpf(a, b, t) { return a + (b - a) * t; }
