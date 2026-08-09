/**
 * Fast static check: import every module and report load-time failures.
 * A browser capture takes minutes on the software rasteriser; this takes a
 * second and catches syntax errors, bad imports and missing exports.
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

// Minimal DOM/browser stubs: modules may touch these at import time.
globalThis.window = globalThis;
globalThis.location = { search: "", href: "http://localhost/" };
const el = () => ({
  style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  appendChild() {}, append() {}, addEventListener() {}, removeEventListener() {},
  querySelector: () => el(), querySelectorAll: () => [], getContext: () => null,
  setAttribute() {}, innerHTML: "", textContent: "", width: 1, height: 1,
});
globalThis.document = {
  createElement: () => el(), getElementById: () => el(), body: el(), head: el(),
  addEventListener() {}, querySelector: () => el(),
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

const files = walk("src").sort();
let failed = 0;
for (const f of files) {
  try {
    await import(path.resolve(f));
  } catch (e) {
    failed++;
    console.log("FAIL " + f + "\n     " + String(e.message).split("\n")[0]);
  }
}
console.log(`${files.length - failed}/${files.length} modules loaded`);
process.exit(failed ? 1 : 0);
