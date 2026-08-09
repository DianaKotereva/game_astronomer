import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
const SHIM = readFileSync(new URL("./gpuShim.js", import.meta.url), "utf8");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const server = spawn("npx", ["vite","--port","5173","--host","127.0.0.1","--strictPort"], { stdio:["ignore","pipe","pipe"] });
await new Promise((res)=>{ server.stdout.on("data", d=>{ if(/Local:|ready in/.test(d.toString())) setTimeout(res,400); }); });
const b = await chromium.launch({ headless:false, executablePath:EXE, args:["--no-sandbox","--headless=new","--enable-unsafe-webgpu","--ignore-gpu-blocklist","--use-webgpu-adapter=swiftshader"], ignoreDefaultArgs:["--headless"] });
const ctx = await b.newContext({ viewport:{width:960,height:540} });
await ctx.addInitScript(SHIM);
const p = await ctx.newPage();
p.on("console", m=>console.log("[page]", m.type()[0], m.text().slice(0,300)));
p.on("pageerror", e=>console.log("[ERR]", (e.stack||e.message).slice(0,600)));
await p.goto("http://127.0.0.1:5173/");
const secs = parseInt(process.argv[2]||"120",10);
for (let i=0;i<secs;i+=10) {
  await p.waitForTimeout(10000);
  const s = await p.evaluate(()=>({ phase: document.getElementById('bootphase')?.textContent, rt: !!window.__rt, frames: window.__rt?window.__rt.frame:0 })).catch(e=>({err:e.message}));
  console.log(`t+${i+10}s`, JSON.stringify(s));
  if (s.rt && s.frames > 3) break;
}
try { await p.evaluate(()=>window.__grab()); await p.screenshot({path:"shots/watch.png"}); console.log("shot saved"); } catch(e){ console.log("shot fail", e.message); }
await b.close(); server.kill("SIGTERM");
