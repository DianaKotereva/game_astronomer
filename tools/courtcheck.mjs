/**
 * Court of Reflections — solution validator.
 *
 * The correctness of this puzzle is the puzzle. If the datums are wrong then
 * setting every dial to the true angular separation does *not* send the light
 * to the receiver, the intended solution is simply false, and no amount of
 * playing the room would reveal which of the four mounts is lying. So it gets
 * checked from the same code the game runs, without a renderer.
 *
 *   node tools/courtcheck.mjs
 *
 * Checks, in order:
 *   1. the intended solution lands on the receiver;
 *   2. the dial values are far enough apart to be distinguishable;
 *   3. being wrong misses — a mirror off by more than tolerance must fail;
 *   4. brute force is impractical — random dials almost never land;
 *   5. no beam segment grazes a mount it is not using.
 */
import { planCourt, traceBeam, CYCLE, TOUR, TOLERANCE } from "../src/puzzles/courtOfReflections.js";

const DEG = Math.PI / 180;
const plan = planCourt();
let failures = 0;
const fail = (m) => { console.log("  FAIL " + m); failures++; };
const ok = (m) => console.log("  ok   " + m);

console.log("\nThe Gate, laid on the court floor");
console.log("  " + plan.metresPerDegree.toFixed(4) + " metres per degree");
for (const n of CYCLE) {
  const p = plan.starPos.get(n);
  console.log("  " + n.padEnd(9) + "x " + p.x.toFixed(2).padStart(7) + "   z " + p.z.toFixed(2).padStart(7)
    + "   dial " + plan.target.get(n).toFixed(2).padStart(6) + " deg"
    + "   datum " + (plan.datum.get(n) / DEG).toFixed(1).padStart(7) + " deg");
}
console.log("  light: collector -> " + TOUR.join(" -> ") + " -> receiver");

console.log("\n1. the intended solution");
const solved = traceBeam(plan, (n) => plan.target.get(n) * DEG);
if (solved.onReceiver) ok("every dial at its true separation lands on the receiver");
else fail("the intended solution does NOT reach the receiver (reached " + solved.reached + "/4)");

console.log("\n2. the dials are distinguishable");
const vals = CYCLE.map((n) => plan.target.get(n));
let minGap = Infinity, gapPair = "";
for (let i = 0; i < vals.length; i++) {
  for (let j = i + 1; j < vals.length; j++) {
    const g = Math.abs(vals[i] - vals[j]);
    if (g < minGap) { minGap = g; gapPair = CYCLE[i] + "/" + CYCLE[j]; }
  }
}
console.log("  closest pair: " + gapPair + " differ by " + minGap.toFixed(2) + " deg");
if (minGap > TOLERANCE * 2) ok("closest pair separated by more than 2x tolerance (" + (TOLERANCE * 2).toFixed(1) + " deg)");
else fail("two dials are within tolerance of each other — the wrong value would also pass");

console.log("\n3a. settings inside tolerance still succeed");
// The window must not be so tight that a player who has seated every dial is
// told they are wrong. Anything within TOLERANCE has to arrive.
let strays = 0;
for (const n of CYCLE) {
  for (const err of [-TOLERANCE, -TOLERANCE * 0.5, TOLERANCE * 0.5, TOLERANCE]) {
    const r = traceBeam(plan, (m) => (plan.target.get(m) + (m === n ? err : 0)) * DEG);
    if (!r.onReceiver) { strays++; console.log("  " + n + " off by " + err.toFixed(2) + " deg (inside tolerance) MISSES"); }
  }
}
if (strays === 0) ok("all 16 within-tolerance settings still reach the receiver");
else fail(strays + " within-tolerance settings are rejected — the bowl is too tight");

console.log("\n3b. being wrong misses");
let misses = 0;
for (const n of CYCLE) {
  for (const err of [-4, -1.5, 1.5, 4]) {
    const r = traceBeam(plan, (m) => (plan.target.get(m) + (m === n ? err : 0)) * DEG);
    if (!r.onReceiver) misses++;
    else console.log("  " + n + " off by " + err + " deg still reaches the receiver");
  }
}
if (misses === CYCLE.length * 4) ok("all 16 single-mirror errors of 1.5 deg or more miss");
else fail((CYCLE.length * 4 - misses) + " of 16 wrong settings still succeed");

console.log("\n4. brute force");
let hits = 0;
const N = 200000;
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
for (let i = 0; i < N; i++) {
  const r = traceBeam(plan, () => rnd() * 40 * DEG);
  if (r.onReceiver) hits++;
}
console.log("  " + hits + " of " + N + " random configurations land (" + (100 * hits / N).toFixed(4) + "%)");
if (hits / N < 0.001) ok("random experimentation is not a viable strategy");
else fail("the court can be brute-forced");

console.log("\n5. beam clearance");
let worst = Infinity;
const p = solved.path;
for (let i = 0; i + 3 < p.length; i += 2) {
  const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
  const vx = bx - ax, vz = bz - az;
  for (const n of CYCLE) {
    const m = plan.starPos.get(n);
    const onA = Math.hypot(m.x - ax, m.z - az) < 0.01, onB = Math.hypot(m.x - bx, m.z - bz) < 0.01;
    if (onA || onB) continue;
    const t = Math.max(0, Math.min(1, ((m.x - ax) * vx + (m.z - az) * vz) / (vx * vx + vz * vz)));
    worst = Math.min(worst, Math.hypot(m.x - (ax + vx * t), m.z - (az + vz * t)));
  }
}
console.log("  minimum clearance to an unused mount: " + worst.toFixed(2) + " m");
if (worst > 1.0) ok("no segment grazes a mount it does not use");
else fail("a beam segment passes too close to an unused mount");

console.log(failures === 0 ? "\nAll court checks passed.\n" : "\n" + failures + " check(s) FAILED.\n");
process.exit(failures === 0 ? 0 : 1);
