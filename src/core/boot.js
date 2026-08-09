/**
 * Loading-screen driver.
 *
 * Progress is reported as a list of named phases with real weights, so the bar
 * tracks actual work rather than a faked timer. Phrasing stays diegetic — the
 * player is waiting for instruments to be prepared, not for "assets 43%".
 */

const el = {
  root: null,
  bar: null,
  phase: null,
};

let total = 1;
let done = 0;
let started = 0;
/** Timings for each phase, exposed for the capture harness and for support. */
const marks = [];
let lastMark = 0;

export function bootInit() {
  el.root = document.getElementById("boot");
  el.bar = document.getElementById("bootbar");
  el.phase = document.getElementById("bootphase");
  started = performance.now();
  lastMark = started;
  window.__boot = { marks, phase: "init" };
}

/** Record how long the previous phase took. A boot that stalls should be able
 *  to say where, rather than sitting on a spinner. */
function mark(label) {
  const now = performance.now();
  if (marks.length || label) marks.push({ label, ms: Math.round(now - lastMark) });
  lastMark = now;
  if (window.__boot) window.__boot.phase = label;
}

/** Declare the total weight of the load so the bar is honest. */
export function bootPlan(weight) { total = Math.max(1, weight); done = 0; }

/** @param {string} label diegetic phase name @param {number} weight */
export function bootStep(label, weight = 1) {
  mark(label);
  if (el.phase && label) el.phase.textContent = label;
  done += weight;
  const f = Math.min(1, done / total);
  if (el.bar) el.bar.style.width = (f * 100).toFixed(1) + "%";
  // Yield so the browser can actually paint the update.
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export function bootPhase(label) {
  mark(label);
  if (el.phase && label) el.phase.textContent = label;
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export async function bootFinish(minMs = 900) {
  mark("done");
  if (window.__boot) window.__boot.total = Math.round(performance.now() - started);
  const elapsed = performance.now() - started;
  if (elapsed < minMs) await new Promise((r) => setTimeout(r, minMs - elapsed));
  if (el.bar) el.bar.style.width = "100%";
  if (el.phase) el.phase.textContent = "the temple is open";
  await new Promise((r) => setTimeout(r, 420));
  if (el.root) {
    el.root.classList.add("gone");
    setTimeout(() => { if (el.root) el.root.style.display = "none"; }, 1500);
  }
}

export function bootFail(message) {
  const n = document.getElementById("nogpu");
  if (n) {
    n.classList.add("on");
    if (message) {
      const p = n.querySelector("p.hint");
      if (p) p.textContent = message;
    }
  }
  if (el.root) el.root.style.display = "none";
}
