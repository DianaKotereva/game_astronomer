/**
 * Developer overlay — F1 or backtick.
 *
 * Hidden by default. Shows frame-time behaviour (not just average FPS), scene
 * counters, per-system toggles and the art tuning sliders. Updates run at a low
 * rate and only while visible, so the overlay never distorts what it measures.
 */
import { EngineInstrumentation, SceneInstrumentation } from "../core/bjs.js";
import { tune, TUNE_DEFS, toggles, TOGGLE_DEFS, fireTuneChange } from "../core/tune.js";

const CSS = `
#dev { position: fixed; top: 0; left: 0; z-index: 50; display: none;
  font: 11px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  color: #b9b3a5; user-select: none; }
#dev.on { display: block; }
#dev .panel { background: rgba(6,8,13,.86); border: 1px solid rgba(150,140,120,.16);
  backdrop-filter: blur(6px); padding: 9px 11px; margin: 8px; border-radius: 2px; }
#dev .stats { min-width: 250px; }
#dev .row { display: flex; justify-content: space-between; gap: 14px; }
#dev .row b { font-weight: 500; color: #e6dfcd; }
#dev .k { color: #6f6858; }
#dev canvas { display: block; margin-top: 7px; border: 1px solid rgba(150,140,120,.13); }
#dev h4 { margin: 9px 0 4px; font-size: 10px; letter-spacing: .18em; text-transform: uppercase;
  color: #8d7f5f; font-weight: 500; border-bottom: 1px solid rgba(150,140,120,.13); padding-bottom: 3px; }
#dev .cols { display: flex; align-items: flex-start; }
#dev .toggles { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 10px; }
#dev label { display: flex; align-items: center; gap: 5px; cursor: pointer; white-space: nowrap; }
#dev input[type=checkbox] { accent-color: #b9944f; width: 11px; height: 11px; }
#dev .tunes { max-height: 74vh; overflow-y: auto; width: 258px; padding-right: 4px; }
#dev .tunes::-webkit-scrollbar { width: 6px; }
#dev .tunes::-webkit-scrollbar-thumb { background: rgba(150,140,120,.2); }
#dev .slider { display: grid; grid-template-columns: 96px 1fr 46px; align-items: center; gap: 6px; }
#dev .slider span { color: #6f6858; overflow: hidden; text-overflow: ellipsis; }
#dev .slider i { color: #cbbf9d; font-style: normal; text-align: right; }
#dev input[type=range] { width: 100%; height: 12px; accent-color: #b9944f; background: transparent; }
#dev .hint { color: #4f4a41; margin-top: 8px; font-size: 10px; }
#dev .warn { color: #c98b53; }
`;

export class DevOverlay {
  /**
   * @param {import("../core/engine.js").Runtime} rt
   * @param {import("../core/input.js").Input} input
   */
  constructor(rt, input) {
    this.name = "devOverlay";
    this.order = 950;
    this.rt = rt;
    this.input = input;
    this.visible = false;
    this._acc = 0;

    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "dev";
    root.innerHTML = `<div class="cols">
      <div class="panel stats">
        <div class="row"><span class="k">fps</span><b id="d-fps">—</b></div>
        <div class="row"><span class="k">frame</span><b id="d-ft">—</b></div>
        <div class="row"><span class="k">1% low</span><b id="d-low">—</b></div>
        <div class="row"><span class="k">gpu</span><b id="d-gpu">—</b></div>
        <div class="row"><span class="k">draw calls</span><b id="d-dc">—</b></div>
        <div class="row"><span class="k">tris</span><b id="d-tri">—</b></div>
        <div class="row"><span class="k">meshes</span><b id="d-mesh">—</b></div>
        <div class="row"><span class="k">lights</span><b id="d-lit">—</b></div>
        <div class="row"><span class="k">textures</span><b id="d-tex">—</b></div>
        <div class="row"><span class="k">js heap</span><b id="d-heap">—</b></div>
        <canvas id="d-graph" width="250" height="60"></canvas>
        <h4>systems</h4>
        <div class="toggles" id="d-toggles"></div>
        <div class="hint">F1 / \` overlay · F2 free-fly · F3 reset view</div>
      </div>
      <div class="panel tunes"><h4>art tuning</h4><div id="d-tunes"></div></div>
    </div>`;
    document.body.appendChild(root);
    this.root = root;

    this.el = {
      fps: root.querySelector("#d-fps"),
      ft: root.querySelector("#d-ft"),
      low: root.querySelector("#d-low"),
      gpu: root.querySelector("#d-gpu"),
      dc: root.querySelector("#d-dc"),
      tri: root.querySelector("#d-tri"),
      mesh: root.querySelector("#d-mesh"),
      lit: root.querySelector("#d-lit"),
      tex: root.querySelector("#d-tex"),
      heap: root.querySelector("#d-heap"),
    };
    this.graph = root.querySelector("#d-graph");
    this.gctx = this.graph.getContext("2d");

    // toggles
    const tg = root.querySelector("#d-toggles");
    for (const def of TOGGLE_DEFS) {
      const l = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!toggles[def.key];
      cb.addEventListener("change", () => { toggles[def.key] = cb.checked; fireTuneChange(def.key); });
      l.appendChild(cb);
      l.appendChild(document.createTextNode(def.label));
      tg.appendChild(l);
    }

    // tuning sliders, grouped
    const host = root.querySelector("#d-tunes");
    let group = "";
    for (const def of TUNE_DEFS) {
      if (def.group !== group) {
        group = def.group;
        const h = document.createElement("h4");
        h.textContent = group;
        host.appendChild(h);
      }
      const row = document.createElement("div");
      row.className = "slider";
      const name = document.createElement("span");
      name.textContent = def.label;
      const range = document.createElement("input");
      range.type = "range";
      range.min = String(def.min); range.max = String(def.max); range.step = String(def.step);
      range.value = String(tune[def.key]);
      const val = document.createElement("i");
      val.textContent = fmt(tune[def.key]);
      range.addEventListener("input", () => {
        tune[def.key] = parseFloat(range.value);
        val.textContent = fmt(tune[def.key]);
        fireTuneChange(def.key);
      });
      row.append(name, range, val);
      host.appendChild(row);
    }

    this.engInstr = new EngineInstrumentation(rt.engine);
    this.engInstr.captureGPUFrameTime = true;
    this.sceneInstr = new SceneInstrumentation(rt.scene);
    this.sceneInstr.captureFrameTime = true;
    this.sceneInstr.captureRenderTime = true;

    // Expose for the capture harness so screenshots can be taken with a clean UI.
    window.__dev = this;
  }

  toggle(v) {
    this.visible = v === undefined ? !this.visible : v;
    this.root.classList.toggle("on", this.visible);
  }

  update(dt) {
    const inp = this.input;
    if (inp.justPressed("F1") || inp.justPressed("Backquote")) this.toggle();
    if (!this.visible) return;
    this._acc += dt;
    if (this._acc < 0.2) return;
    this._acc = 0;
    this._refresh();
  }

  _refresh() {
    const rt = this.rt, scene = rt.scene, engine = rt.engine;
    const h = rt.ftHistory, n = rt.ftCount;
    let sum = 0, worst = 0;
    for (let i = 0; i < n; i++) { sum += h[i]; if (h[i] > worst) worst = h[i]; }
    const avg = n ? sum / n : 0;

    // 1% low: mean of the worst 1% of frames (min 1 sample). Sorted into a
    // scratch buffer that is allocated once, not per refresh.
    if (!this._sortBuf || this._sortBuf.length < h.length) this._sortBuf = new Float32Array(h.length);
    const buf = this._sortBuf;
    for (let i = 0; i < n; i++) buf[i] = h[i];
    const view = buf.subarray(0, n);
    view.sort();                       // ascending
    const k = Math.max(1, Math.floor(n * 0.01));
    let low = 0;
    for (let j = 0; j < k; j++) low += view[n - 1 - j];
    low = low / k;

    this.el.fps.textContent = avg ? (1000 / avg).toFixed(1) : "—";
    this.el.ft.textContent = avg.toFixed(2) + " ms";
    this.el.low.textContent = low ? (1000 / low).toFixed(1) + " fps / " + low.toFixed(1) + " ms" : "—";
    const gpu = this.engInstr.gpuFrameTimeCounter.lastSecAverage / 1e6;
    this.el.gpu.textContent = gpu > 0 ? gpu.toFixed(2) + " ms" : "n/a";
    this.el.dc.textContent = String(this.sceneInstr.drawCallsCounter.current);
    this.el.tri.textContent = fmtNum(scene.getActiveIndices() / 3);
    this.el.mesh.textContent = scene.getActiveMeshes().length + " / " + scene.meshes.length;
    this.el.lit.textContent = String(scene.lights.length);
    this.el.tex.textContent = String(scene.textures.length);
    const mem = performance.memory;
    this.el.heap.textContent = mem ? (mem.usedJSHeapSize / 1048576).toFixed(0) + " MB" : "n/a";
    void engine;

    this._drawGraph(h, n);
  }

  _drawGraph(h, n) {
    const c = this.gctx, W = this.graph.width, H = this.graph.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = "rgba(0,0,0,.35)";
    c.fillRect(0, 0, W, H);
    const scaleMs = 25; // full height = 25 ms
    // budget lines: 11.1 ms (90fps) and 16.6 ms (60fps)
    c.strokeStyle = "rgba(185,148,79,.4)"; c.beginPath();
    let y = H - (11.1 / scaleMs) * H; c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    c.strokeStyle = "rgba(200,90,70,.35)"; c.beginPath();
    y = H - (16.6 / scaleMs) * H; c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    c.strokeStyle = "rgba(150,190,230,.85)";
    c.beginPath();
    const start = this.rt.ftIndex;
    for (let i = 0; i < n; i++) {
      const v = h[(start + i) % h.length];
      const x = (i / (n - 1 || 1)) * W;
      const yy = H - Math.min(1, v / scaleMs) * H;
      if (i === 0) c.moveTo(x, yy); else c.lineTo(x, yy);
    }
    c.stroke();
  }
}

function fmt(v) {
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(4).replace(/0+$/, "");
}

function fmtNum(v) {
  if (v > 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v > 1e3) return (v / 1e3).toFixed(1) + "k";
  return v.toFixed(0);
}
