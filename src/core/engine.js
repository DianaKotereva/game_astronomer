/**
 * WebGPU bootstrap and the render loop.
 *
 * There is no WebGL path and no compatibility branch by design: if the browser
 * cannot give us a WebGPU device we show the compatibility plate and stop.
 */
import { WebGPUEngine, Scene, Color4, Vector3 } from "./bjs.js";
import { clamp } from "./scratch.js";

/** @typedef {{ name: string, update: (dt: number, now: number) => void, order?: number, enabled?: boolean }} System */

export class Runtime {
  /**
   * @param {WebGPUEngine} engine
   * @param {Scene} scene
   */
  constructor(engine, scene) {
    this.engine = engine;
    this.scene = scene;
    /** @type {System[]} */
    this.systems = [];
    this.time = 0;          // seconds since gameplay start
    this.dt = 0;            // clamped frame delta
    this.rawDt = 0;
    this.frame = 0;
    this.paused = false;
    this._running = false;
    this._lastNow = 0;
    /** Frame time history for the overlay, in ms. Fixed-size, no allocation. */
    this.ftHistory = new Float32Array(240);
    this.ftIndex = 0;
    this.ftCount = 0;
  }

  /** @param {System} sys */
  add(sys) {
    if (sys.enabled === undefined) sys.enabled = true;
    if (sys.order === undefined) sys.order = 100;
    this.systems.push(sys);
    this.systems.sort((a, b) => a.order - b.order);
    return sys;
  }

  get(name) {
    for (let i = 0; i < this.systems.length; i++) if (this.systems[i].name === name) return this.systems[i];
    return null;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastNow = performance.now();
    this.engine.runRenderLoop(this._tick);
  }

  stop() {
    this._running = false;
    this.engine.stopRenderLoop(this._tick);
  }

  _tick = () => {
    const now = performance.now();
    let dt = (now - this._lastNow) * 0.001;
    this._lastNow = now;
    this.rawDt = dt;
    // A software-rendered or freshly-loaded frame can be enormous; clamp so no
    // simulation integrates across a stall.
    dt = clamp(dt, 0.0001, 0.05);
    this.dt = dt;
    if (!this.paused) this.time += dt;
    this.frame++;

    this.ftHistory[this.ftIndex] = this.rawDt * 1000;
    this.ftIndex = (this.ftIndex + 1) % this.ftHistory.length;
    if (this.ftCount < this.ftHistory.length) this.ftCount++;

    const sys = this.systems;
    for (let i = 0; i < sys.length; i++) {
      const s = sys[i];
      if (s.enabled) s.update(dt, this.time);
    }

    this.scene.render();
  };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<{engine: WebGPUEngine, scene: Scene}>}
 */
export async function createEngine(canvas) {
  if (!navigator.gpu) throw new Error("no-webgpu");

  const engine = new WebGPUEngine(canvas, {
    antialias: false,            // TAA in the post pipeline handles edges
    stencil: true,
    powerPreference: "high-performance",
    audioEngine: false,
    adaptToDeviceRatio: false,   // we drive resolution explicitly
  });

  // No glslang / twgsl options: every shader we author is WGSL and every stock
  // Babylon material has a WGSL variant, so nothing ever needs the WASM
  // transpilers — which is what keeps this a zero-network-request runtime.
  await engine.initAsync();

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.004, 0.006, 0.013, 1);
  scene.ambientColor = new Vector3(0, 0, 0);
  scene.useRightHandedSystem = false;
  scene.skipPointerMovePicking = true;
  scene.autoClearDepthAndStencil = true;
  scene.performancePrioritizedAccessor = true;

  return { engine, scene };
}

/** Resolution policy: render at the device pixel size, capped for sanity. */
export function applyResolution(engine, canvas, scale = 1) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr * scale);
  const h = Math.round(canvas.clientHeight * dpr * scale);
  engine.setSize(w, h, true);
}
