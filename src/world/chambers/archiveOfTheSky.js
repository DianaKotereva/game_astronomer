/**
 * The Archive of the Sky.
 *
 * The west wing, and the only room in the temple built for people rather than
 * for the sky. It is low where everything else is monumental — a barrel-vaulted
 * reading hall with two aisle arcades, ten metres to the crown where the Hall of
 * Meridian rises twenty-four. That inversion is the point (§11.5): after two
 * chambers that dwarf the player, one that fits them.
 *
 * There is almost no machinery here. What there is instead is evidence of work:
 * lecterns worn hollow where forearms rested, shelf niches with the scroll cases
 * still in them, a plaster wall carrying three centuries of arithmetic, and one
 * broken armillary that somebody clearly gave up on repairing.
 *
 * The only sky admitted is through a row of clerestory slits above the arcade,
 * too high and too narrow to read by. The builders wanted lamplight in here.
 * That is why the shallow inscriptions in this room cannot be read with the
 * lantern held in front of them, and why Stellar Light — which arrives from
 * wherever the star is, not from the reader's hand — can read them.
 *
 * World convention: +Z north, +X east, Y up. The temple's meridian is x = 0.
 */
import {
  addBlock, addWall, addFloor, addStairs, addRubble, addCornice,
  addCylinder, addColumn, addBeam, addArch, addRingBand,
} from "../geo.js";
import { makeRng, TAU } from "../../core/scratch.js";

export const ARCHIVE = {
  x0: -38, x1: -20,
  z0: 28, z1: 48,
  floorY: 0,
  /** Springing line of the nave vault, and the aisle ceiling. */
  springY: 7.0,
  aisleY: 5.0,
  /** Top of the arcade columns; the spandrel carrying the clerestory sits above. */
  arcadeY: 5.3,
  vaultTop: 11.0,
  /** Outer aisle walls stop just above the aisle roof — they carry a lean-to,
   *  not the nave. The windows are in the spandrel, where they light something. */
  wallTop: 6.0,
  /** The two arcade lines that divide nave from aisles. */
  naveX0: -32.5,
  naveX1: -25.5,
  /** Doorway into the Chamber of Wandering Stars, in the east wall. */
  doorZ: 38,
};

export function buildArchiveOfTheSky(ctx) {
  const rng = makeRng(51721);
  const { stone, dark, bronze, plaster, collider } = ctx;
  const A = ARCHIVE;
  const naveMidX = (A.naveX0 + A.naveX1) * 0.5;
  const naveSpan = A.naveX1 - A.naveX0;

  /* ---------------------------------------------------------------- */
  /* Floor: worn flags, dished along the walking line                   */
  /* ---------------------------------------------------------------- */

  // Three centuries of the same route from the door to the lecterns wore a
  // shallow trough down the nave. It is only a few centimetres, but at grazing
  // lantern light it is the most human thing in the temple.
  addFloor(stone, {
    x0: A.x0, x1: A.x1, z0: A.z0, z1: A.z1, y: A.floorY, thickness: 0.24,
    slab: 1.5, rng, uvScale: 0.32,
    subsidence: (x, z) => {
      const nave = Math.max(0, 1 - Math.abs(x - naveMidX) / 4.2);
      const walk = Math.max(0, 1 - Math.abs(z - A.doorZ) / 9.0);
      return -0.035 * nave * walk - rng() * 0.004;
    },
  });

  /* ---------------------------------------------------------------- */
  /* Outer walls, with shelf niches cut into the aisle faces            */
  /* ---------------------------------------------------------------- */

  const wallOpts = {
    base: -0.6, height: A.wallTop + 0.6, thickness: 1.3,
    course: 0.58, blockLen: 1.25, rng, ruin: 0.05,
  };

  // West wall — blind. Everything on this face is shelving.
  addWall(stone, { ...wallOpts, from: [A.x0, A.z0], to: [A.x0, A.z1], openings: [] });

  // East wall — the door through to the round court.
  addWall(stone, {
    ...wallOpts, from: [A.x1, A.z0], to: [A.x1, A.z1],
    openings: [{ u0: (A.doorZ - A.z0) - 1.3, u1: (A.doorZ - A.z0) + 1.3, y0: -1, y1: 3.5 }],
  });

  // North and south end walls. The north one carries the calculation plaster.
  addWall(stone, { ...wallOpts, from: [A.x0, A.z1], to: [A.x1, A.z1], openings: [] });
  addWall(stone, {
    ...wallOpts, from: [A.x0, A.z0], to: [A.x1, A.z0], ruin: 0.22,
    openings: [{ u0: 6.4, u1: 8.2, y0: -1, y1: 2.6 }],
  });

  /* ---------------------------------------------------------------- */
  /* The arcades                                                       */
  /* ---------------------------------------------------------------- */

  // Two rows of columns carrying the nave wall above. Shorter and stockier than
  // the piers in the round court: this room was built to hold a roof up over
  // people reading, not to be looked at.
  const colZ0 = A.z0 + 2.2, colZ1 = A.z1 - 2.2;
  const nCols = 6;
  for (let side = 0; side < 2; side++) {
    const x = side === 0 ? A.naveX0 : A.naveX1;
    for (let i = 0; i < nCols; i++) {
      const z = colZ0 + (i / (nCols - 1)) * (colZ1 - colZ0);
      addColumn(stone, x, 0, z, {
        height: A.arcadeY, radius: 0.40, segments: 20, flutes: 0,
        entasis: 0.8, plinth: 0.28, capital: 0.34, uvScale: 0.34,
      });
      // Arcade arches between neighbouring columns, in the plane of the row.
      if (i < nCols - 1) {
        const z2 = colZ0 + ((i + 1) / (nCols - 1)) * (colZ1 - colZ0);
        addArch(stone, {
          x, z: (z + z2) * 0.5, y: A.arcadeY,
          span: z2 - z, depth: 0.9, thickness: 0.42, segments: 9,
          yaw: Math.PI / 2, rng, uvScale: 0.34,
        });
      }
    }

    // The spandrel the arcade carries, from the arch heads up to the springing
    // of the vault — and the clerestory cut through it. This is the only sky
    // the room gets, and it enters above the aisle roofs where it can actually
    // reach the nave floor. One slit per bay, aligned on the columns.
    const slits = [];
    for (let i = 0; i < nCols - 1; i++) {
      const u = ((i + 0.5) / (nCols - 1)) * (colZ1 - colZ0);
      slits.push({ u0: u - 0.19, u1: u + 0.19, y0: A.arcadeY + 0.55, y1: A.springY - 0.25 });
    }
    addWall(stone, {
      from: [x, colZ0], to: [x, colZ1], base: A.arcadeY, height: A.springY - A.arcadeY,
      thickness: 0.72, course: 0.52, blockLen: 1.2, rng, ruin: 0.04, openings: slits,
    });
  }

  /* ---------------------------------------------------------------- */
  /* The nave vault, and the flat aisle ceilings                        */
  /* ---------------------------------------------------------------- */

  // A true barrel: ring after ring of voussoirs, close enough to read as one
  // continuous surface, with the odd stone dropped out near the south end where
  // water has been getting in.
  const ribStep = 1.05;
  for (let z = colZ0; z <= colZ1; z += ribStep) {
    const decay = Math.max(0, 1 - (z - A.z0) / 6.0);
    addArch(stone, {
      x: naveMidX, z, y: A.springY,
      span: naveSpan + 0.9, depth: ribStep * 1.02, thickness: 0.62,
      segments: rng() < decay * 0.5 ? 9 : 13,
      yaw: 0, rng, uvScale: 0.32,
    });
  }
  // Transverse ribs every fourth bay, standing slightly proud.
  for (let z = colZ0 + 1.05; z < colZ1; z += 4.2) {
    addArch(stone, {
      x: naveMidX, z, y: A.springY,
      span: naveSpan + 0.9, depth: 0.34, thickness: 0.82, segments: 15,
      yaw: 0, rng, uvScale: 0.3,
    });
  }

  // Aisle ceilings: stone beams on the arcade, boarded over. Low and close.
  for (let side = 0; side < 2; side++) {
    const xi = side === 0 ? A.naveX0 : A.naveX1;
    const xo = side === 0 ? A.x0 : A.x1;
    for (let z = colZ0; z <= colZ1 + 0.01; z += 1.6) {
      addBeam(stone, xi, A.aisleY, z, xo, A.aisleY, z, { height: 0.34, width: 0.44, uvScale: 0.34 });
    }
    // The boards between the beams.
    addBlock(stone, (xi + xo) * 0.5, A.aisleY + 0.28, (colZ0 + colZ1) * 0.5,
      Math.abs(xo - xi) * 0.5, 0.10, (colZ1 - colZ0) * 0.5, { bevel: 0.02, uvScale: 0.34 });
  }

  /* ---------------------------------------------------------------- */
  /* Shelving: the reason the room exists                               */
  /* ---------------------------------------------------------------- */

  // Niches cut into the aisle walls, five shelves each, with scroll cases still
  // standing in most of them. Cases are dark wood; the ones that have fallen are
  // on the floor below, which is where the archive's one real puzzle lives.
  const bays = [];
  for (let side = 0; side < 2; side++) {
    const xw = side === 0 ? A.x0 : A.x1;
    const inward = side === 0 ? 1 : -1;
    for (let i = 0; i < 5; i++) {
      const z = A.z0 + 3.4 + i * 3.6;
      if (side === 1 && Math.abs(z - A.doorZ) < 2.8) continue;
      bays.push({ x: xw + inward * 0.42, z, side, inward });

      // Niche jambs and head.
      for (const s of [-1, 1]) {
        addBlock(stone, xw + inward * 0.34, 2.1, z + s * 1.28, 0.34, 2.1, 0.22,
          { bevel: 0.02, uvScale: 0.34 });
      }
      addBlock(stone, xw + inward * 0.34, 4.32, z, 0.34, 0.22, 1.5, { bevel: 0.02, uvScale: 0.34 });
      // Back of the niche, recessed.
      addBlock(stone, xw + inward * 0.12, 2.1, z, 0.12, 2.1, 1.28, { bevel: 0.01, uvScale: 0.36 });

      // Five shelves, and the cases on them.
      for (let s = 0; s < 5; s++) {
        const sy = 0.5 + s * 0.78;
        addBlock(stone, xw + inward * 0.5, sy, z, 0.5, 0.045, 1.24, { bevel: 0.01, uvScale: 0.4 });
        const nCase = 3 + Math.floor(rng() * 4);
        for (let c = 0; c < nCase; c++) {
          if (rng() < 0.22) continue;               // gaps: things were taken
          const cz = z - 1.05 + (c + 0.5) * (2.1 / nCase);
          const h = 0.30 + rng() * 0.12;
          addCylinder(dark, xw + inward * 0.52, sy + 0.045 + h * 0.5, cz, {
            radius: 0.055 + rng() * 0.018, height: h, segments: 9,
            uvScale: 1.6, capTop: true, capBottom: false,
          });
          // Bronze end-cap with the shelf mark on it.
          addCylinder(bronze, xw + inward * 0.52, sy + 0.045 + h + 0.012, cz, {
            radius: 0.062, height: 0.024, segments: 9, uvScale: 2.4, capTop: true,
          });
        }
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Lecterns down the nave                                            */
  /* ---------------------------------------------------------------- */

  // Six reading desks, alternating sides of the trough, each with a sloped top
  // and a shallow gutter along its lower edge to stop a rule rolling off.
  const lecterns = [];
  for (let i = 0; i < 6; i++) {
    const z = A.z0 + 4.5 + i * 3.1;
    const x = naveMidX + (i % 2 === 0 ? -1.9 : 1.9);
    const yaw = i % 2 === 0 ? 0.16 : -0.16;
    addBlock(stone, x, 0.42, z, 0.42, 0.42, 0.62, { bevel: 0.03, uvScale: 0.4, yaw });
    // The desk slopes toward the reader. `settle` displaces the four top
    // corners independently, so raising the back pair and dropping the front
    // pair tilts the top face without needing a rotation the kit does not have.
    addBlock(stone, x, 0.90, z, 0.62, 0.07, 0.84,
      { bevel: 0.02, uvScale: 0.4, yaw, settle: [0.15, 0.15, -0.10, -0.10] });
    addBlock(dark, x, 0.90, z + 0.78, 0.60, 0.045, 0.05, { bevel: 0.008, uvScale: 1.2, yaw });
    lecterns.push({ x, y: 0.98, z, yaw });
  }

  /* ---------------------------------------------------------------- */
  /* The calculation wall                                              */
  /* ---------------------------------------------------------------- */

  // The whole north end, plastered and then covered in working: column after
  // column of arithmetic, struck through and redone. Rendered as plaster panels
  // here; the actual writing is a decal drawn by the archive puzzle.
  for (let i = 0; i < 7; i++) {
    const x = A.x0 + 1.6 + i * 2.4;
    if (x > A.x1 - 1.2) break;
    addBlock(plaster, x, 3.0, A.z1 - 0.72, 1.16, 2.5, 0.07, { bevel: 0.012, uvScale: 0.36 });
  }
  // Plaster that has come away, in sheets, taking the working with it.
  addRubble(plaster, { x: naveMidX + 1.2, z: A.z1 - 1.9, y: 0, radius: 2.6, count: 18, rng, minSize: 0.10, maxSize: 0.42, bias: 0.9 });

  /* ---------------------------------------------------------------- */
  /* The abandoned armillary                                           */
  /* ---------------------------------------------------------------- */

  // In the south-west corner, half dismantled, with its rings stacked against
  // the wall the way you stack them when you mean to come back tomorrow.
  const ax = A.x0 + 3.0, az = A.z0 + 3.4;
  addBlock(stone, ax, 0.34, az, 0.72, 0.34, 0.72, { bevel: 0.03, uvScale: 0.4 });
  addCylinder(dark, ax, 0.68, az, { radius: 0.20, height: 0.68, segments: 14, uvScale: 0.8 });
  addRingBand(bronze, ax, 1.44, az, { radius: 0.76, width: 0.07, depth: 0.05, segments: 40, axis: 1, uvScale: 1.2 });
  addRingBand(bronze, ax, 1.44, az, { radius: 0.62, width: 0.06, depth: 0.045, segments: 40, axis: 2, uvScale: 1.2 });
  // Two more rings leaning on the wall, unmounted.
  for (let i = 0; i < 2; i++) {
    addRingBand(bronze, ax + 1.5 + i * 0.34, 0.82, az - 1.4, {
      radius: 0.80 - i * 0.1, width: 0.07, depth: 0.05, segments: 36, axis: 0, uvScale: 1.2,
    });
  }
  // The tools, left out.
  for (let i = 0; i < 5; i++) {
    addBlock(bronze, ax + 0.9 + rng() * 1.1, 0.70, az + 0.5 + rng() * 0.8,
      0.02 + rng() * 0.05, 0.014, 0.10 + rng() * 0.09, { yaw: rng() * TAU, bevel: 0.004, uvScale: 2.4 });
  }
  addBlock(stone, ax + 1.2, 0.34, az + 0.7, 0.55, 0.34, 0.42, { bevel: 0.03, uvScale: 0.4 });

  /* ---------------------------------------------------------------- */
  /* The reading niche: where the dispute is kept                       */
  /* ---------------------------------------------------------------- */

  // A deeper recess in the west wall opposite the door, with a stone stand and
  // room for two people to stand at it. The puzzle lives here.
  // Kept under the aisle ceiling at 5.0 — a recess, not a shaft.
  const nz = A.doorZ;
  addBlock(stone, A.x0 + 0.9, 2.1, nz, 0.9, 2.1, 0.26, { bevel: 0.02, uvScale: 0.34 });
  for (const s of [-1, 1]) {
    addBlock(stone, A.x0 + 1.0, 2.1, nz + s * 1.85, 1.0, 2.1, 0.34, { bevel: 0.02, uvScale: 0.34 });
  }
  addBlock(stone, A.x0 + 1.0, 4.42, nz, 1.0, 0.22, 1.85, { bevel: 0.02, uvScale: 0.34 });
  const standX = A.x0 + 1.5;
  addBlock(stone, standX, 0.48, nz, 0.46, 0.48, 1.05, { bevel: 0.03, uvScale: 0.4 });
  addBlock(stone, standX, 1.02, nz, 0.60, 0.06, 1.20, { bevel: 0.02, uvScale: 0.4, pitch: 0.14 });

  /* ---------------------------------------------------------------- */
  /* Wear, spill and the passage east                                  */
  /* ---------------------------------------------------------------- */

  // The collapsed bay: a whole niche came down, and its cases went with it.
  addRubble(stone, { x: A.x0 + 1.6, z: A.z0 + 10.6, y: 0, radius: 2.3, count: 34, rng, minSize: 0.10, maxSize: 0.52, bias: 0.75 });
  // Cases that went down with it, lying where they fell. Blocks rather than
  // cylinders: the kit's cylinders stand on Y, and a case on its side reads
  // from its silhouette and its bronze cap, not from being perfectly round.
  for (let i = 0; i < 14; i++) {
    const a = rng() * TAU, r = rng() * 1.9;
    const cx = A.x0 + 1.5 + Math.cos(a) * r, cz = A.z0 + 10.6 + Math.sin(a) * r;
    const yaw = rng() * TAU;
    addBlock(dark, cx, 0.062, cz, 0.175, 0.055, 0.055, { yaw, bevel: 0.022, uvScale: 1.6 });
    addBlock(bronze, cx + Math.cos(yaw) * 0.19, 0.062, cz - Math.sin(yaw) * 0.19,
      0.016, 0.062, 0.062, { yaw, bevel: 0.012, uvScale: 2.4 });
  }

  // The passage through to the round court.
  addWall(stone, {
    from: [A.x1, A.doorZ - 1.5], to: [A.x1 + 6.2, A.doorZ - 1.5], base: -0.5, height: 5.0,
    thickness: 0.9, course: 0.6, blockLen: 1.3, rng, ruin: 0.06, openings: [],
  });
  addWall(stone, {
    from: [A.x1, A.doorZ + 1.5], to: [A.x1 + 6.2, A.doorZ + 1.5], base: -0.5, height: 5.0,
    thickness: 0.9, course: 0.6, blockLen: 1.3, rng, ruin: 0.06, openings: [],
  });
  addFloor(stone, {
    x0: A.x1, x1: A.x1 + 6.4, z0: A.doorZ - 1.5, z1: A.doorZ + 1.5,
    y: 0, thickness: 0.22, slab: 1.3, rng, uvScale: 0.32,
  });
  for (let x = A.x1 + 0.6; x < A.x1 + 6.2; x += 1.3) {
    addArch(stone, { x, z: A.doorZ, y: 2.6, span: 3.0, depth: 1.28, thickness: 0.5, segments: 9, yaw: Math.PI / 2, rng, uvScale: 0.34 });
  }

  addCornice(stone, {
    from: [A.x0 + 1, A.z1 - 0.9], to: [A.x1 - 1, A.z1 - 0.9], y: A.aisleY + 0.5,
    project: 0.24, layers: 2, layerHeight: 0.16, thickness: 0.5, piece: 1.5, rng, ruin: 0.15,
  });

  // A few steps down into the archive: it sits slightly below the court, which
  // is why the water that ruined the south vault ended up in here.
  addStairs(stone, {
    x: A.x1 + 6.4, y: 0, z: A.doorZ, dir: [1, 0], steps: 3, rise: 0.18, run: 0.42,
    width: 2.8, rng, wear: 0.03, blockWidth: 1.4, uvScale: 0.34,
  });

  /* ---------------------------------------------------------------- */
  /* Colliders                                                         */
  /* ---------------------------------------------------------------- */

  addBlock(collider, (A.x0 + A.x1) * 0.5, -0.3, (A.z0 + A.z1) * 0.5,
    (A.x1 - A.x0) * 0.5, 0.3, (A.z1 - A.z0) * 0.5, { bevel: 0 });
  // Runs the whole way to the court wall, so the three steps up into the round
  // court have ground under them rather than a 0.6 m hole.
  const passX0 = A.x1, passX1 = -13.0;      // archive door → court wall
  addBlock(collider, (passX0 + passX1) * 0.5, -0.3, A.doorZ,
    (passX1 - passX0) * 0.5 + 0.1, 0.5, 1.6, { bevel: 0 });
  // Walls.
  addBlock(collider, A.x0 - 0.4, 4, (A.z0 + A.z1) * 0.5, 0.5, 4, (A.z1 - A.z0) * 0.5, { bevel: 0 });
  addBlock(collider, A.x1 + 0.4, 4, A.z0 + (A.doorZ - A.z0) * 0.5 - 1.6, 0.5, 4, (A.doorZ - A.z0) * 0.5 - 1.6, { bevel: 0 });
  addBlock(collider, A.x1 + 0.4, 4, A.doorZ + 1.5 + (A.z1 - A.doorZ - 1.5) * 0.5, 0.5, 4, (A.z1 - A.doorZ - 1.5) * 0.5, { bevel: 0 });
  addBlock(collider, (A.x0 + A.x1) * 0.5, 4, A.z1 + 0.4, (A.x1 - A.x0) * 0.5, 4, 0.5, { bevel: 0 });
  addBlock(collider, (A.x0 + A.x1) * 0.5, 4, A.z0 - 0.4, (A.x1 - A.x0) * 0.5, 4, 0.5, { bevel: 0 });
  // Arcade columns, as two low walls with gaps ignored — the player should not
  // be able to walk through a colonnade, and a capsule cannot feel the gaps.
  for (let side = 0; side < 2; side++) {
    const x = side === 0 ? A.naveX0 : A.naveX1;
    for (let i = 0; i < nCols; i++) {
      const z = colZ0 + (i / (nCols - 1)) * (colZ1 - colZ0);
      addBlock(collider, x, 1.6, z, 0.46, 1.6, 0.46, { bevel: 0 });
    }
  }
  // Lecterns and the stand.
  for (const l of lecterns) addBlock(collider, l.x, 0.5, l.z, 0.55, 0.5, 0.75, { bevel: 0 });
  addBlock(collider, standX, 0.55, nz, 0.5, 0.55, 1.1, { bevel: 0 });

  return { ARCHIVE: A, lecterns, bays, stand: { x: standX, y: 1.02, z: nz }, naveMidX };
}
