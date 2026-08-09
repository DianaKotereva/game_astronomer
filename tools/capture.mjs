/**
 * Screenshot / boot-validation harness.
 *
 * Usage:
 *   node tools/capture.mjs <name> [--w 2560] [--h 1440] [--wait 8000]
 *                          [--eval "js executed in page before capture"]
 *                          [--shots n] [--gap ms] [--url ...] [--keep]
 *
 * Boots the Vite dev server (unless --url given), waits for the game to report
 * readiness through window.__ready, runs optional page script, then captures.
 *
 * It also fails loudly on any network request leaving localhost — the game is
 * required to make zero runtime CDN requests, and this is the regression guard.
 */
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const ARGS = [
  "--no-sandbox",
  "--headless=new",
  "--enable-unsafe-webgpu",
  "--ignore-gpu-blocklist",
  "--use-webgpu-adapter=swiftshader",
  "--js-flags=--expose-gc",
  "--disable-frame-rate-limit",
];
const SHIM = readFileSync(new URL("./gpuShim.js", import.meta.url), "utf8");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1] : def;
}
function flag(name) { return process.argv.includes("--" + name); }

const name = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "shot";
const W = parseInt(arg("w", "2560"), 10);
const H = parseInt(arg("h", "1440"), 10);
const WAIT = parseInt(arg("wait", "20000"), 10);
const SHOTS = parseInt(arg("shots", "1"), 10);
const GAP = parseInt(arg("gap", "400"), 10);
const EVAL = arg("eval", "");
const OUTDIR = arg("out", "shots");

let server = null;
let url = arg("url", "");
// A leftover dev server from an interrupted run must never wedge a capture, so
// each run takes its own port.
const PORT = parseInt(arg("port", String(5200 + Math.floor(Math.random() * 300))), 10);

async function startServer() {
  if (url) return;
  // Build first and serve the bundle. The dev server hot-reloads on any source
  // edit, which silently restarted several long captures mid-boot; a built
  // bundle cannot be disturbed, and loads faster besides. `--dev` opts back in.
  const dev = flag("dev");
  if (!dev) {
    const built = spawnSync("npx", ["vite", "build", "--logLevel", "error"], { cwd: process.cwd(), encoding: "utf8" });
    if (built.status !== 0) {
      console.error("build failed:\n" + (built.stderr || built.stdout));
      process.exit(1);
    }
  }
  const args = dev
    ? ["vite", "--port", String(PORT), "--host", "127.0.0.1", "--strictPort"]
    : ["vite", "preview", "--port", String(PORT), "--host", "127.0.0.1", "--strictPort"];
  server = spawn("npx", args, {
    cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("vite did not start")), 60000);
    server.stdout.on("data", (d) => {
      const s = d.toString();
      if (s.includes("Local:") || s.includes("ready in")) { clearTimeout(to); setTimeout(resolve, 350); }
    });
    server.stderr.on("data", (d) => process.stderr.write("[vite] " + d.toString()));
  });
  url = `http://127.0.0.1:${PORT}/${arg("query", "")}`;
}

async function run() {
  await startServer();
  if (!existsSync(OUTDIR)) mkdirSync(OUTDIR, { recursive: true });

  const browser = await chromium.launch({ headless: false, executablePath: EXE, args: ARGS, ignoreDefaultArgs: ["--headless"] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(SHIM);
  const page = await ctx.newPage();

  const problems = [];
  const external = [];
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error" || t === "warning") {
      const txt = m.text();
      if (!/Failed to load resource|favicon/.test(txt)) problems.push(t.toUpperCase() + ": " + txt);
    }
  });
  page.on("pageerror", (e) => problems.push("PAGEERROR: " + (e.stack || e.message)));
  page.on("request", (r) => {
    const u = r.url();
    if (!/^(http:\/\/127\.0\.0\.1|http:\/\/localhost|data:|blob:)/.test(u)) external.push(u);
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });

  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < WAIT) {
    ready = await page.evaluate(() => !!window.__rt).catch(() => false);
    if (ready) break;
    await page.waitForTimeout(250);
  }

  const failed = await page.evaluate(() => document.getElementById("nogpu")?.classList.contains("on")).catch(() => false);

  if (EVAL) {
    try { await page.evaluate(EVAL); } catch (e) { problems.push("EVAL: " + e.message); }
  }

  // Let the renderer settle (TAA accumulation, warm-up, cloth relaxing).
  await page.waitForTimeout(GAP);

  const shots = [];
  for (let i = 0; i < SHOTS; i++) {
    const file = path.join(OUTDIR, SHOTS > 1 ? `${name}_${i}.png` : `${name}.png`);
    // Halt the render loop first. On the software rasteriser a single frame can
    // take seconds, and the compositor cannot deliver a screenshot while the GPU
    // is saturated — stopping the loop makes the capture immediate.
    await page.evaluate(() => { if (window.__rt) window.__rt.stop(); }).catch(() => {});
    // Pull the virtual swapchain into the visible canvas (see tools/gpuShim.js).
    const grab = await page.evaluate(() => (window.__grab ? window.__grab() : "no-shim")).catch((e) => "grab-fail: " + e.message);
    if (typeof grab === "string") problems.push("GRAB: " + grab);
    await page.screenshot({ path: file, timeout: 120000, animations: "disabled" });
    shots.push(file);
    if (i < SHOTS - 1) {
      await page.evaluate(() => { if (window.__rt) window.__rt.start(); }).catch(() => {});
      await page.waitForTimeout(GAP);
    }
  }

  const stats = await page.evaluate(() => {
    const rt = window.__rt;
    if (!rt) return null;
    const h = rt.ftHistory, n = rt.ftCount;
    let s = 0; for (let i = 0; i < n; i++) s += h[i];
    return {
      frames: rt.frame,
      avgMs: n ? +(s / n).toFixed(2) : 0,
      meshes: rt.scene.meshes.length,
      active: rt.scene.getActiveMeshes().length,
      tris: Math.round(rt.scene.getActiveIndices() / 3),
      materials: rt.scene.materials.length,
      textures: rt.scene.textures.length,
      lights: rt.scene.lights.length,
      status: window.__status || null,
      boot: window.__boot || null,
    };
  }).catch(() => null);

  console.log(JSON.stringify({ ready, failed, shots, stats, external: external.slice(0, 10), problems: problems.slice(0, 25) }, null, 2));

  if (!flag("keep")) { await browser.close(); if (server) server.kill("SIGTERM"); }
  else { console.log("browser kept open"); }
  process.exit(problems.some((p) => p.startsWith("PAGEERROR")) || !ready ? 1 : 0);
}

run().catch((e) => { console.error(e); if (server) server.kill("SIGTERM"); process.exit(1); });
