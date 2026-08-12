/**
 * Knowledge-graph validator.
 *
 *   node tools/knowledgecheck.mjs
 *
 * The Book is the only progression system in the game, so a fragment that
 * nothing awards is a spell the player can never learn, and a puzzle that reads
 * a fragment awarded in a room further along the route is a dead end. Neither
 * is visible from inside the game: the player just finds a mechanism that will
 * not respond and has no way to know whether that is the puzzle or a bug.
 *
 * Checks:
 *   1. every fragment is awarded somewhere;
 *   2. no fragment is awarded twice;
 *   3. every spell 1-6 is granted by some fragment;
 *   4. every fragment a room reads is awarded strictly earlier on the route;
 *   5. every figure a room reads is granted by a fragment awarded earlier.
 */
import { readFileSync, readdirSync } from "node:fs";
import { FRAGMENTS } from "../src/book/book.js";

/** The intended route through the temple. */
const ROUTE = [
  ["hallOfMeridian", "Hall of Meridian"],
  ["wanderingStars", "Chamber of Wandering Stars"],
  ["archiveOfTheSky", "Archive of the Sky"],
  ["courtOfReflections", "Court of Reflections"],
  ["finalObservatory", "Final Observatory"],
];

let failures = 0;
const fail = (m) => { console.log("  FAIL " + m); failures++; };
const ok = (m) => console.log("  ok   " + m);

const src = new Map();
for (const [file] of ROUTE) {
  src.set(file, readFileSync(new URL(`../src/puzzles/${file}.js`, import.meta.url), "utf8"));
}

const all = (text, re) => {
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
};

/* --- who awards what ------------------------------------------------- */
const awardedBy = new Map();          // fragment -> [room index]
ROUTE.forEach(([file], i) => {
  for (const id of all(src.get(file), /unlockFragment\("([^"]+)"\)/g)) {
    if (!awardedBy.has(id)) awardedBy.set(id, []);
    awardedBy.get(id).push(i);
  }
});

console.log("\nfragment awards, in route order");
ROUTE.forEach(([file, name], i) => {
  const mine = [...awardedBy.entries()].filter(([, v]) => v.includes(i)).map(([k]) => k);
  console.log("  " + String(i + 1) + ". " + name.padEnd(30) + (mine.join(", ") || "—"));
});

console.log("\n1. every fragment is awarded");
const orphans = Object.keys(FRAGMENTS).filter((id) => !awardedBy.has(id));
if (orphans.length === 0) ok(Object.keys(FRAGMENTS).length + " fragments, all reachable");
else fail("never awarded: " + orphans.join(", "));

console.log("\n2. no fragment is awarded twice");
const dupes = [...awardedBy.entries()].filter(([, v]) => v.length > 1);
if (dupes.length === 0) ok("no duplicate awards");
else fail("awarded more than once: " + dupes.map(([k, v]) => `${k} (rooms ${v.map((i) => i + 1).join(",")})`).join("; "));

console.log("\n3. every spell is granted");
const spellOf = new Map();
for (const [id, f] of Object.entries(FRAGMENTS)) if (f.spell) spellOf.set(f.spell, id);
const names = { 1: "Stellar Light", 2: "Constellation Thread", 3: "Celestial Resonance", 4: "Gravity Lens", 5: "Astral Recall", 6: "Zenith" };
let missing = 0;
for (let s = 1; s <= 6; s++) {
  // 1 and 3 are known from the start; the rest must be taught.
  if (s === 1 || s === 3) { console.log("  " + names[s].padEnd(22) + "known from the start"); continue; }
  const id = spellOf.get(s);
  if (!id) { fail(names[s] + " is granted by no fragment"); missing++; continue; }
  const room = awardedBy.get(id);
  console.log("  " + names[s].padEnd(22) + id.padEnd(22) + "room " + (room ? room[0] + 1 : "?"));
  if (!room) missing++;
}
if (missing === 0) ok("all six abilities are reachable");

console.log("\n4. prerequisites are awarded earlier on the route");
let disorder = 0;
ROUTE.forEach(([file, name], i) => {
  const reads = new Set([
    ...all(src.get(file), /book\.has\("([^"]+)"\)/g),
    ...all(src.get(file), /has\("([^"]+)"\)/g),
  ].filter((id) => Object.prototype.hasOwnProperty.call(FRAGMENTS, id)));
  for (const id of reads) {
    const at = awardedBy.get(id);
    if (!at) { fail(name + " reads " + id + ", which nothing awards"); disorder++; continue; }
    const earliest = Math.min(...at);
    if (earliest > i) {
      fail(name + " (room " + (i + 1) + ") reads " + id + ", awarded later in room " + (earliest + 1));
      disorder++;
    } else {
      console.log("  " + name.padEnd(30) + "needs " + id.padEnd(22) + "from room " + (earliest + 1));
    }
  }
});
if (disorder === 0) ok("no room depends on knowledge it cannot have yet");

console.log("\n5. figures are taught before they are read");
let figProblems = 0;
const figureFrom = new Map();
ROUTE.forEach(([file], i) => {
  for (const id of all(src.get(file), /unlockFragment\("([^"]+)"\)/g)) {
    const f = FRAGMENTS[id];
    if (!f) continue;
    if (f.figure) figureFrom.set(f.figure, i);
    // templeFigures grants the temple's whole set at once.
    if (f.templeFigures) for (const k of ["T_nail", "T_gate", "T_balance", "T_ascent", "T_lamp", "T_seven"]) {
      if (!figureFrom.has(k)) figureFrom.set(k, i);
    }
  }
});
ROUTE.forEach(([file, name], i) => {
  for (const key of all(src.get(file), /knownFigures\s*&&\s*\w+\.knownFigures\.has\("([^"]+)"\)|knownFigures\.has\("([^"]+)"\)/g)) {
    if (!key) continue;
    const at = figureFrom.get(key);
    if (at === undefined) { fail(name + " reads figure " + key + ", which nothing teaches"); figProblems++; }
    else if (at > i) { fail(name + " reads figure " + key + ", taught later in room " + (at + 1)); figProblems++; }
    else console.log("  " + name.padEnd(30) + "needs figure " + key.padEnd(10) + "from room " + (at + 1));
  }
});
if (figProblems === 0) ok("no room reads a figure it has not been taught");

console.log(failures === 0 ? "\nKnowledge graph is sound.\n" : "\n" + failures + " problem(s) FOUND.\n");
process.exit(failures === 0 ? 0 : 1);
