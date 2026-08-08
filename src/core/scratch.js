/**
 * Pre-allocated scratch math.
 *
 * Rule for the whole codebase: nothing inside a per-frame path may call `new`.
 * Everything that needs a temporary vector borrows one from here. The ring
 * allocators below are intentionally small — if a system needs more than a
 * handful of temporaries at once it should own dedicated module-level scratch
 * objects instead (see any of the /magic or /mechanisms modules for the pattern).
 */
import { Vector2, Vector3, Quaternion, Matrix, Color3, Color4 } from "./bjs.js";

const V3_COUNT = 64;
const V2_COUNT = 16;
const Q_COUNT = 24;
const M_COUNT = 16;
const C3_COUNT = 16;

const v3ring = new Array(V3_COUNT);
const v2ring = new Array(V2_COUNT);
const qring = new Array(Q_COUNT);
const mring = new Array(M_COUNT);
const c3ring = new Array(C3_COUNT);

for (let i = 0; i < V3_COUNT; i++) v3ring[i] = new Vector3();
for (let i = 0; i < V2_COUNT; i++) v2ring[i] = new Vector2();
for (let i = 0; i < Q_COUNT; i++) qring[i] = new Quaternion();
for (let i = 0; i < M_COUNT; i++) mring[i] = Matrix.Identity();
for (let i = 0; i < C3_COUNT; i++) c3ring[i] = new Color3();

let v3i = 0, v2i = 0, qi = 0, mi = 0, c3i = 0;

/** @returns {Vector3} a scratch vector valid until ~64 further requests */
export function tv3(x = 0, y = 0, z = 0) {
  const v = v3ring[v3i];
  v3i = (v3i + 1) % V3_COUNT;
  v.x = x; v.y = y; v.z = z;
  return v;
}

/** @returns {Vector2} */
export function tv2(x = 0, y = 0) {
  const v = v2ring[v2i];
  v2i = (v2i + 1) % V2_COUNT;
  v.x = x; v.y = y;
  return v;
}

/** @returns {Quaternion} */
export function tq() {
  const q = qring[qi];
  qi = (qi + 1) % Q_COUNT;
  return q;
}

/** @returns {Matrix} */
export function tm() {
  const m = mring[mi];
  mi = (mi + 1) % M_COUNT;
  return m;
}

/** @returns {Color3} */
export function tc3(r = 0, g = 0, b = 0) {
  const c = c3ring[c3i];
  c3i = (c3i + 1) % C3_COUNT;
  c.r = r; c.g = g; c.b = b;
  return c;
}

/* ------------------------------------------------------------------ */
/* Small numeric helpers used everywhere. Kept allocation-free.        */
/* ------------------------------------------------------------------ */

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const TAU = Math.PI * 2;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function invLerp(a, b, v) { return b === a ? 0 : (v - a) / (b - a); }
export function smoothstep(a, b, v) { const t = clamp01(invLerp(a, b, v)); return t * t * (3 - 2 * t); }
export function smootherstep(a, b, v) { const t = clamp01(invLerp(a, b, v)); return t * t * t * (t * (t * 6 - 15) + 10); }

/** Frame-rate independent exponential approach. `rate` = fraction remaining after 1s. */
export function damp(current, target, rate, dt) {
  return target + (current - target) * Math.pow(rate, dt * 60);
}

/** Critically damped spring toward target. Returns new value; velocity kept in `state[idx]`. */
export function springTo(current, target, state, idx, stiffness, dt) {
  const omega = stiffness;
  const x = current - target;
  const v = state[idx];
  const exp = Math.exp(-omega * dt);
  const nv = (v - omega * x) * exp - omega * (x + (v - omega * x) * dt) * 0;
  const nx = (x + (v + omega * x) * dt) * exp;
  state[idx] = (v + omega * x) * exp - omega * nx;
  void nv;
  return target + nx;
}

export function wrapPi(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function wrapTau(a) {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

/** Shortest angular distance from a to b. */
export function angleDelta(a, b) { return wrapPi(b - a); }

/** Deterministic hash-based pseudo random in [0,1). */
export function hash1(n) {
  let x = Math.sin(n * 127.1) * 43758.5453123;
  return x - Math.floor(x);
}

export function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

/** Small deterministic PRNG (mulberry32) — used by every procedural generator. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { Color4 };
