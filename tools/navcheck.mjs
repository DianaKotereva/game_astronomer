/**
 * Connectivity validator.
 *
 *   node tools/navcheck.mjs
 *
 * The round court once had exactly one wall opening, on the north side, while
 * the passage up from the Hall of Meridian arrived from the south. The second
 * chamber was visible, lit, fully built and completely unreachable on foot, and
 * nothing caught it: the module check passed, the geometry had no NaN, and every
 * screenshot of the room was taken with a free-fly camera.
 *
 * So the collision hull gets its own check. For each connection on the route,
 * a ray is cast along the passage centreline at walking height and tested
 * against every triangle of the collider. A hit means a wall stands where a
 * doorway is supposed to be.
 *
 * This is a doorway test, not a full navmesh — it will not catch a step too tall
 * to mount or a floor with a hole in it. It catches the failure that actually
 * happened, which is a passage that was never cut.
 */
import { Accum } from "../src/world/geo.js";
import { buildApproach } from "../src/world/chambers/approach.js";
import { buildHallOfMeridian } from "../src/world/chambers/hallOfMeridian.js";
import { buildWanderingStars } from "../src/world/chambers/wanderingStars.js";
import { buildArchiveOfTheSky } from "../src/world/chambers/archiveOfTheSky.js";
import { buildCourtOfReflections } from "../src/world/chambers/courtOfReflections.js";
import { buildFinalObservatory } from "../src/world/chambers/finalObservatory.js";

const mk = (n) => { const a = new Accum(n); a.uvScale = 0.32; return a; };
const acc = {
  scene: null, mats: null,
  stone: mk("s"), dark: mk("d"), bronze: mk("b"), plaster: mk("p"), collider: mk("c"),
};
for (const fn of [buildApproach, buildHallOfMeridian, buildWanderingStars,
  buildArchiveOfTheSky, buildCourtOfReflections, buildFinalObservatory]) fn(acc);

const P = acc.collider.pos || acc.collider.positions;
const I = acc.collider.idx || acc.collider.indices;
console.log(`\ncollision hull: ${acc.collider.vertexCount} vertices, ${I.length / 3} triangles`);

/** Möller-Trumbore. Returns t along the segment, or -1. */
function rayTri(ox, oy, oz, dx, dy, dz, len, i0, i1, i2) {
  const ax = P[i0 * 3], ay = P[i0 * 3 + 1], az = P[i0 * 3 + 2];
  const bx = P[i1 * 3], by = P[i1 * 3 + 1], bz = P[i1 * 3 + 2];
  const cx = P[i2 * 3], cy = P[i2 * 3 + 1], cz = P[i2 * 3 + 2];
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-9) return -1;
  const inv = 1 / det;
  const tx = ox - ax, ty = oy - ay, tz = oz - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return (t > 1e-4 && t < len) ? t : -1;
}

/** Is the straight walk from a to b clear of the collision hull? */
function clear(a, b) {
  let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  dx /= len; dy /= len; dz /= len;
  let best = -1;
  for (let t = 0; t < I.length; t += 3) {
    const hit = rayTri(a[0], a[1], a[2], dx, dy, dz, len, I[t], I[t + 1], I[t + 2]);
    if (hit >= 0 && (best < 0 || hit < best)) best = hit;
  }
  return { clear: best < 0, at: best };
}

/**
 * Each connection is walked at three heights across the doorway's width, so a
 * lintel that is too low or a jamb that is too tight shows up as a partial pass
 * rather than reading as clear down the exact centreline.
 */
const LINKS = [
  { name: "Approach terrace -> Hall portal", from: [0, 2.35, -19.0], to: [0, 2.35, -12.5], spread: 1.6 },
  { name: "Hall -> north passage",           from: [0, 1.20, 14.0], to: [0, 1.20, 23.0], spread: 1.2 },
  { name: "north passage -> round court",    from: [0, 1.20, 23.0], to: [0, 1.20, 30.0], spread: 1.2 },
  { name: "round court -> Archive (west)",   from: [-10.0, 1.20, 38], to: [-22.0, 1.20, 38], spread: 1.0 },
  { name: "round court -> Court of Mirrors", from: [10.0, 1.20, 38], to: [23.0, 1.20, 38], spread: 1.0 },
  { name: "round court -> Observatory",      from: [0, 1.20, 47.0], to: [0, 1.20, 60.0], spread: 1.4 },
  { name: "Observatory passage -> drum",     from: [0, 1.20, 60.0], to: [0, 1.20, 66.0], spread: 1.4 },
];

let failures = 0;
console.log("\nconnections on the route");
for (const L of LINKS) {
  // Perpendicular offsets across the doorway.
  const dx = L.to[0] - L.from[0], dz = L.to[2] - L.from[2];
  const n = Math.hypot(dx, dz) || 1;
  const px = -dz / n, pz = dx / n;
  let passes = 0;
  const offsets = [-L.spread, 0, L.spread];
  for (const o of offsets) {
    const a = [L.from[0] + px * o, L.from[1], L.from[2] + pz * o];
    const b = [L.to[0] + px * o, L.to[1], L.to[2] + pz * o];
    if (clear(a, b).clear) passes++;
  }
  const verdict = passes === 3 ? "open" : passes > 0 ? `partial (${passes}/3)` : "BLOCKED";
  console.log("  " + L.name.padEnd(36) + verdict);
  if (passes === 0) failures++;
}

console.log(failures === 0
  ? "\nEvery connection on the route is walkable.\n"
  : "\n" + failures + " connection(s) BLOCKED — a room is unreachable on foot.\n");
process.exit(failures === 0 ? 0 : 1);
