/**
 * The shared stellar framework.
 *
 * Every spell in the game is built from the same four primitives, and every one
 * of them reads from the same celestial simulation the puzzles and instruments
 * use. There is no separate "VFX sky".
 *
 *   anchors   places in the world magic can attach to — marked stones, mirrors,
 *             lenses, instrument points, and stars themselves
 *   threads   hair-thin luminous lines with points of light travelling in them
 *   motes     tiny stellar points, pooled, used for dust-catching and residue
 *   fields    a small budget of real lights so magic actually illuminates stone
 *
 * The visual grammar is fixed here rather than per spell: nothing is a fireball,
 * nothing is a plasma ball, everything is points, arcs and fine geometry (§23).
 */
import {
  Mesh, VertexData, ShaderMaterial, ShaderStore, ShaderLanguage, Constants,
  Vector2, Vector3, Vector4, Color3, PointLight,
} from "../core/bjs.js";
import { tune, toggles } from "../core/tune.js";
import { clamp, clamp01, lerp, damp, TAU, makeRng } from "../core/scratch.js";

/* ==================================================================== */
/*  Thread renderer                                                      */
/* ==================================================================== */

const THREAD_VS = /* wgsl */ `
attribute position: vec3f;    // segment start
attribute normal: vec3f;      // segment end
attribute uv: vec2f;          // x: along 0..1, y: side -1/+1
attribute uv2: vec2f;         // x: strength, y: seed
uniform viewProjection: mat4x4f;
uniform world: mat4x4f;
uniform camPos: vec3f;
uniform screen: vec2f;
uniform params: vec4f;        // width(px), time, glow, unused
varying vSide: f32;
varying vAlong: f32;
varying vStrength: f32;
varying vSeed: f32;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let a = vertexInputs.position;
  let b = vertexInputs.normal;
  let t = vertexInputs.uv.x;
  let p = mix(a, b, t);

  var clip = uniforms.viewProjection * vec4f(p, 1.0);
  // Expand perpendicular to the segment, in screen space, so the thread keeps a
  // constant hair width at any distance — the one thing that makes it read as a
  // drawn line rather than as a tube.
  let ca = uniforms.viewProjection * vec4f(a, 1.0);
  let cb = uniforms.viewProjection * vec4f(b, 1.0);
  let sa = ca.xy / max(0.0001, ca.w);
  let sb = cb.xy / max(0.0001, cb.w);
  var dir = sb - sa;
  let l = length(dir * uniforms.screen);
  if (l < 1e-5) { dir = vec2f(1.0, 0.0); } else { dir = normalize(vec2f(dir.x * uniforms.screen.x, dir.y * uniforms.screen.y)); }
  let perp = vec2f(-dir.y, dir.x) / uniforms.screen;

  let w = uniforms.params.x * vertexInputs.uv2.x;
  clip = vec4f(clip.xy + perp * vertexInputs.uv.y * w * clip.w, clip.zw);

  vertexOutputs.vSide = vertexInputs.uv.y;
  vertexOutputs.vAlong = t;
  vertexOutputs.vStrength = vertexInputs.uv2.x;
  vertexOutputs.vSeed = vertexInputs.uv2.y;
  vertexOutputs.position = clip;
}
`;

const THREAD_FS = /* wgsl */ `
varying vSide: f32;
varying vAlong: f32;
varying vStrength: f32;
varying vSeed: f32;
uniform params: vec4f;   // width, time, glow, unused
uniform tint: vec4f;

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let s = abs(input.vSide);
  // A hard core with a narrow bloom shoulder. No soft fat glow: the thread is a
  // constellation edge, not a laser.
  let core = pow(max(0.0, 1.0 - s), 6.0);
  let bloom = exp(-s * 3.4) * 0.30;

  // Points of light run along the thread. They are the only animated part.
  let t = uniforms.params.y;
  var travel = 0.0;
  for (var i = 0; i < 3; i = i + 1) {
    let phase = fract(t * (0.19 + f32(i) * 0.052) + input.vSeed + f32(i) * 0.37);
    let d = abs(input.vAlong - phase);
    travel = travel + exp(-d * d * 900.0) * (1.0 - s * 0.75);
  }

  let a = (core + bloom + travel * 0.85) * input.vStrength * uniforms.params.z;
  fragmentOutputs.color = vec4f(uniforms.tint.rgb * a, 1.0);
}
`;

const MOTE_VS = /* wgsl */ `
attribute position: vec3f;
attribute uv: vec2f;
attribute uv2: vec2f;      // x: size, y: brightness
uniform viewProjection: mat4x4f;
uniform world: mat4x4f;
uniform screen: vec2f;
uniform params: vec4f;     // sizeScale, time, glow, unused
varying vCorner: vec2f;
varying vBright: f32;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  var clip = uniforms.viewProjection * vec4f(vertexInputs.position, 1.0);
  let px = vertexInputs.uv2.x * uniforms.params.x;
  clip = vec4f(clip.xy + vertexInputs.uv * px / uniforms.screen * 2.0 * clip.w, clip.zw);
  vertexOutputs.vCorner = vertexInputs.uv;
  vertexOutputs.vBright = vertexInputs.uv2.y;
  vertexOutputs.position = clip;
}
`;

const MOTE_FS = /* wgsl */ `
varying vCorner: vec2f;
varying vBright: f32;
uniform tint: vec4f;
uniform params: vec4f;

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let r2 = dot(input.vCorner, input.vCorner);
  if (r2 > 1.0) { discard; }
  let core = exp(-r2 * 7.0);
  let halo = exp(-sqrt(r2) * 2.6) * 0.18;
  fragmentOutputs.color = vec4f(uniforms.tint.rgb * (core + halo) * input.vBright * uniforms.params.z, 1.0);
}
`;

/** Pooled thin-line renderer. One mesh, one draw call, no per-frame allocation. */
export class ThreadRenderer {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {number} maxSegments
   */
  constructor(scene, maxSegments = 256, color = [0.62, 0.76, 1.0]) {
    this.scene = scene;
    this.max = maxSegments;
    this.count = 0;

    ShaderStore.ShadersStoreWGSL["templeThreadVertexShader"] = THREAD_VS;
    ShaderStore.ShadersStoreWGSL["templeThreadFragmentShader"] = THREAD_FS;

    const V = maxSegments * 4;
    this.pos = new Float32Array(V * 3);
    this.nrm = new Float32Array(V * 3);
    this.uv = new Float32Array(V * 2);
    this.uv2 = new Float32Array(V * 2);
    const idx = new Uint32Array(maxSegments * 6);
    // Each segment is a quad: (start,-1) (end,-1) (end,+1) (start,+1)
    const along = [0, 1, 1, 0];
    const side = [-1, -1, 1, 1];
    for (let s = 0; s < maxSegments; s++) {
      for (let k = 0; k < 4; k++) {
        const v = s * 4 + k;
        this.uv[v * 2] = along[k];
        this.uv[v * 2 + 1] = side[k];
      }
      const b = s * 4;
      idx[s * 6] = b; idx[s * 6 + 1] = b + 1; idx[s * 6 + 2] = b + 2;
      idx[s * 6 + 3] = b; idx[s * 6 + 4] = b + 2; idx[s * 6 + 5] = b + 3;
    }

    const mesh = new Mesh("threads", scene);
    const vd = new VertexData();
    vd.positions = this.pos;
    vd.normals = this.nrm;
    vd.uvs = this.uv;
    vd.uvs2 = this.uv2;
    vd.indices = idx;
    vd.applyToMesh(mesh, true);
    mesh.renderingGroupId = 2;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    this.mesh = mesh;

    const mat = new ShaderMaterial("threadMat", scene, { vertex: "templeThread", fragment: "templeThread" }, {
      attributes: ["position", "normal", "uv", "uv2"],
      uniforms: ["world", "viewProjection", "camPos", "screen", "params", "tint"],
      shaderLanguage: ShaderLanguage.WGSL,
      needAlphaBlending: true,
    });
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mesh.material = mat;
    this.mat = mat;

    this._params = new Vector4(1.6, 0, 1, 0);
    this._screen = new Vector2(1, 1);
    this._tint = new Vector4(color[0], color[1], color[2], 1);
    this.color = color;
    this._time = 0;
  }

  begin() { this.count = 0; }

  /** Add one segment. Strength 0..1 scales width and brightness. */
  add(ax, ay, az, bx, by, bz, strength, seed) {
    if (this.count >= this.max) return;
    const s = this.count++;
    for (let k = 0; k < 4; k++) {
      const v = (s * 4 + k) * 3;
      this.pos[v] = ax; this.pos[v + 1] = ay; this.pos[v + 2] = az;
      this.nrm[v] = bx; this.nrm[v + 1] = by; this.nrm[v + 2] = bz;
      const u = (s * 4 + k) * 2;
      this.uv2[u] = strength;
      this.uv2[u + 1] = seed;
    }
  }

  /** Add a polyline, optionally sagging like a catenary between anchors. */
  addPath(points, n, strength, seed, sag = 0) {
    for (let i = 0; i < n - 1; i++) {
      const a = i * 3, b = (i + 1) * 3;
      let ay = points[a + 1], by = points[b + 1];
      if (sag !== 0) {
        const ta = i / (n - 1), tb = (i + 1) / (n - 1);
        ay -= Math.sin(ta * Math.PI) * sag;
        by -= Math.sin(tb * Math.PI) * sag;
      }
      this.add(points[a], ay, points[a + 2], points[b], by, points[b + 2], strength, seed);
    }
  }

  end(dt) {
    this._time += dt;
    // Collapse the unused tail so stale segments cannot show.
    for (let s = this.count; s < this.max; s++) {
      for (let k = 0; k < 4; k++) {
        const u = (s * 4 + k) * 2;
        this.uv2[u] = 0;
      }
    }
    this.mesh.setEnabled(this.count > 0 && toggles.magic);
    if (this.count === 0) return;
    this.mesh.updateVerticesData("position", this.pos, false, false);
    this.mesh.updateVerticesData("normal", this.nrm, false, false);
    this.mesh.updateVerticesData("uv2", this.uv2, false, false);
    const engine = this.scene.getEngine();
    this._screen.set(engine.getRenderWidth(), engine.getRenderHeight());
    this.mat.setVector2("screen", this._screen);
    this._params.set(1.55 * tune.threadWidth, this._time, tune.magicGlow, 0);
    this.mat.setVector4("params", this._params);
    this._tint.set(this.color[0], this.color[1], this.color[2], 1);
    this.mat.setVector4("tint", this._tint);
  }

  setColor(r, g, b) { this.color[0] = r; this.color[1] = g; this.color[2] = b; }
}

/** Pooled point-sprite renderer for stellar motes and residues. */
export class MoteRenderer {
  constructor(scene, maxMotes = 1024, color = [0.68, 0.80, 1.0]) {
    this.scene = scene;
    this.max = maxMotes;
    this.count = 0;

    ShaderStore.ShadersStoreWGSL["templeMoteVertexShader"] = MOTE_VS;
    ShaderStore.ShadersStoreWGSL["templeMoteFragmentShader"] = MOTE_FS;

    const V = maxMotes * 4;
    this.pos = new Float32Array(V * 3);
    this.uv = new Float32Array(V * 2);
    this.uv2 = new Float32Array(V * 2);
    const idx = new Uint32Array(maxMotes * 6);
    const cx = [-1, 1, 1, -1], cy = [-1, -1, 1, 1];
    for (let s = 0; s < maxMotes; s++) {
      for (let k = 0; k < 4; k++) {
        const v = s * 4 + k;
        this.uv[v * 2] = cx[k];
        this.uv[v * 2 + 1] = cy[k];
      }
      const b = s * 4;
      idx[s * 6] = b; idx[s * 6 + 1] = b + 1; idx[s * 6 + 2] = b + 2;
      idx[s * 6 + 3] = b; idx[s * 6 + 4] = b + 2; idx[s * 6 + 5] = b + 3;
    }
    const mesh = new Mesh("motes", scene);
    const vd = new VertexData();
    vd.positions = this.pos;
    vd.uvs = this.uv;
    vd.uvs2 = this.uv2;
    vd.indices = idx;
    vd.applyToMesh(mesh, true);
    mesh.renderingGroupId = 2;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    this.mesh = mesh;

    const mat = new ShaderMaterial("moteMat", scene, { vertex: "templeMote", fragment: "templeMote" }, {
      attributes: ["position", "uv", "uv2"],
      uniforms: ["world", "viewProjection", "screen", "params", "tint"],
      shaderLanguage: ShaderLanguage.WGSL,
      needAlphaBlending: true,
    });
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mesh.material = mat;
    this.mat = mat;
    this._params = new Vector4(1, 0, 1, 0);
    this._screen = new Vector2(1, 1);
    this._tint = new Vector4(color[0], color[1], color[2], 1);
    this.color = color;
  }

  begin() { this.count = 0; }

  add(x, y, z, sizePx, bright) {
    if (this.count >= this.max) return;
    const s = this.count++;
    for (let k = 0; k < 4; k++) {
      const v = (s * 4 + k) * 3;
      this.pos[v] = x; this.pos[v + 1] = y; this.pos[v + 2] = z;
      const u = (s * 4 + k) * 2;
      this.uv2[u] = sizePx;
      this.uv2[u + 1] = bright;
    }
  }

  end(dt) {
    for (let s = this.count; s < this.max; s++) {
      for (let k = 0; k < 4; k++) this.uv2[(s * 4 + k) * 2 + 1] = 0;
    }
    this.mesh.setEnabled(this.count > 0 && toggles.magic);
    if (this.count === 0) return;
    this.mesh.updateVerticesData("position", this.pos, false, false);
    this.mesh.updateVerticesData("uv2", this.uv2, false, false);
    const engine = this.scene.getEngine();
    this._screen.set(engine.getRenderWidth(), engine.getRenderHeight());
    this.mat.setVector2("screen", this._screen);
    this._params.set(1, 0, tune.magicGlow, 0);
    this.mat.setVector4("params", this._params);
    this._tint.set(this.color[0], this.color[1], this.color[2], 1);
    this.mat.setVector4("tint", this._tint);
    void dt;
  }
}

/* ==================================================================== */
/*  Anchors                                                              */
/* ==================================================================== */

/**
 * @typedef {Object} Anchor
 * @property {string} id
 * @property {string} kind        'node' | 'mirror' | 'lens' | 'instrument' | 'socket'
 * @property {Vector3} position
 * @property {boolean} active     whether magic currently holds it
 * @property {boolean} known      whether the protagonist has learnt to see it
 * @property {any} [owner]        the mechanism this anchor belongs to
 * @property {string[]} [links]   anchors this one may legally connect to
 */

export class AnchorRegistry {
  constructor() {
    /** @type {Anchor[]} */
    this.list = [];
    /** @type {Map<string, Anchor>} */
    this.byId = new Map();
  }

  /**
   * @param {string} id @param {string} kind @param {Vector3} position
   */
  add(id, kind, position, opts = {}) {
    const a = {
      id, kind, position: position.clone(),
      active: false, known: opts.known !== false,
      owner: opts.owner || null, links: opts.links || null,
      charge: 0, glow: 0,
    };
    this.list.push(a);
    this.byId.set(id, a);
    return a;
  }

  get(id) { return this.byId.get(id) || null; }

  /** Nearest anchor to a ray, within an angular tolerance. */
  pick(originX, originY, originZ, dx, dy, dz, maxDist = 30, cosTol = 0.985) {
    let best = null, bestScore = -1;
    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i];
      if (!a.known) continue;
      const px = a.position.x - originX, py = a.position.y - originY, pz = a.position.z - originZ;
      const d = Math.hypot(px, py, pz);
      if (d > maxDist || d < 1e-3) continue;
      const c = (px * dx + py * dy + pz * dz) / d;
      if (c < cosTol) continue;
      const score = c - d * 0.0025;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  /** Are two anchors allowed to be joined by a thread? */
  canLink(a, b) {
    if (!a || !b || a === b) return false;
    if (a.links && a.links.indexOf(b.id) >= 0) return true;
    if (b.links && b.links.indexOf(a.id) >= 0) return true;
    return false;
  }
}

/* ==================================================================== */
/*  Magic lights                                                         */
/* ==================================================================== */

/**
 * A tiny pool of real lights. Star magic must land on stone, bronze, cloth and
 * dust (§45), and the only honest way to do that is with actual scene lights —
 * but never one per particle. Four is the whole budget.
 */
export class MagicLights {
  constructor(scene, count = 4) {
    this.scene = scene;
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new PointLight("magic" + i, new Vector3(0, -100, 0), scene);
      l.diffuse = new Color3(0.55, 0.70, 1.0);
      l.specular = new Color3(0.6, 0.75, 1.0);
      l.intensity = 0;
      l.range = 9;
      l.shadowEnabled = false;
      this.lights.push({ light: l, used: false, target: 0, current: 0 });
    }
  }

  begin() { for (const l of this.lights) l.used = false; }

  /** Request a light at a position. Returns false if the budget is spent. */
  place(x, y, z, intensity, range, r, g, b) {
    for (const e of this.lights) {
      if (e.used) continue;
      e.used = true;
      e.light.position.set(x, y, z);
      e.target = intensity * tune.magicGlow;
      e.light.range = range;
      e.light.diffuse.set(r, g, b);
      e.light.specular.set(r, g, b);
      return true;
    }
    return false;
  }

  end(dt) {
    for (const e of this.lights) {
      if (!e.used) e.target = 0;
      // Fading rather than switching: a light that pops on is the fastest way to
      // make magic look detached from the room.
      e.current = damp(e.current, toggles.magic ? e.target : 0, 0.0004, dt);
      e.light.intensity = e.current;
    }
  }
}

export { clamp, clamp01, lerp, damp, TAU, makeRng };
