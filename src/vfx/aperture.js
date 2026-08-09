/**
 * Light through an aperture.
 *
 * The Hall of Meridian is a measuring instrument and this is its needle: the
 * shaft of light that falls through the slit in the vault, and the stripe it
 * lays on the floor. Both are computed from the real direction of the real
 * source in the celestial simulation, so when a body crosses the meridian the
 * stripe lies exactly along the bronze line — not because it was animated to,
 * but because that is where the light goes.
 *
 * The volume is drawn as camera-facing slices through the shaft rather than as
 * a box: with additive blending a box's side faces read as separate bright
 * slabs and vanish edge-on. The shader softens the edges, thickens the column
 * with drifting dust, and fades it as the camera enters, so it reads as air.
 */
import {
  Mesh, VertexData, ShaderMaterial, ShaderStore, ShaderLanguage, Constants,
  Vector3, Vector4, PointLight, Color3,
} from "../core/bjs.js";
import { clamp, clamp01, lerp, damp, DEG } from "../core/scratch.js";
import { tune, toggles } from "../core/tune.js";

const SHAFT_VS = /* wgsl */ `
attribute position: vec3f;
attribute uv: vec2f;         // x: across the beam (-1..1), y: along it (0 top, 1 floor)
uniform viewProjection: mat4x4f;
uniform world: mat4x4f;
varying vUV: vec2f;
varying vWorld: vec3f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let p = vertexInputs.position;
  vertexOutputs.vUV = vertexInputs.uv;
  vertexOutputs.vWorld = p;
  vertexOutputs.position = uniforms.viewProjection * vec4f(p, 1.0);
}
`;

const SHAFT_FS = /* wgsl */ `
varying vUV: vec2f;
varying vWorld: vec3f;
uniform tint: vec4f;
uniform params: vec4f;   // intensity, time, dustiness, softness
uniform camPos: vec3f;

fn hash13(p: vec3f) -> f32 {
  var q = fract(p * 0.1031);
  q = q + dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  // Across the beam: soft shoulders, so the shaft has no hard silhouette.
  let across = abs(input.vUV.x);
  let edge = pow(max(0.0, 1.0 - across), uniforms.params.w);

  // Along the beam: brightest near the aperture, since that is where the
  // scattering column is deepest, then recovering slightly at the floor pool.
  let along = input.vUV.y;
  let fall = mix(1.0, 0.42, along) + smoothstep(0.86, 1.0, along) * 0.5;

  // Slow dust drifting through the column.
  let t = uniforms.params.y;
  let p = input.vWorld * 1.7 + vec3f(0.0, -t * 0.12, t * 0.05);
  let n = hash13(floor(p)) * 0.5 + hash13(floor(p * 2.3)) * 0.3 + hash13(floor(p * 5.1)) * 0.2;
  let dust = mix(1.0, 0.55 + n * 0.9, uniforms.params.z);

  // Fade when the camera is nearly inside the volume: a beam should not become
  // a wall of light when you walk into it.
  let d = distance(uniforms.camPos, input.vWorld);
  let near = smoothstep(0.15, 1.4, d);

  let a = edge * fall * dust * near * uniforms.params.x;
  fragmentOutputs.color = vec4f(uniforms.tint.rgb * a, 1.0);
}
`;

export class ApertureBeam {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {Object} o
   * @param {number} o.x            aperture centre x
   * @param {number} o.y            aperture height
   * @param {number[]} o.zRange     [z0, z1] extent of the slit
   * @param {number} o.halfWidth    half the slit width
   * @param {number} o.floorY
   */
  constructor(scene, o) {
    this.scene = scene;
    this.x = o.x; this.y = o.y;
    this.z0 = o.zRange[0]; this.z1 = o.zRange[1];
    this.halfWidth = o.halfWidth;
    this.floorY = o.floorY === undefined ? 0 : o.floorY;

    ShaderStore.ShadersStoreWGSL["templeShaftVertexShader"] = SHAFT_VS;
    ShaderStore.ShadersStoreWGSL["templeShaftFragmentShader"] = SHAFT_FS;

    // Three quads. Two of them lie *through* the beam and are rolled about its
    // axis to face the camera; the third is the pool on the floor.
    //
    // A box would be wrong: with additive blending its four side faces read as
    // separate bright slabs, doubling where they overlap and vanishing edge-on.
    // A camera-aligned slice through the volume is the standard light-shaft
    // construction and reads as air from every angle.
    this.pos = new Float32Array(4 * 3 * 3);
    this.uv = new Float32Array(4 * 3 * 2);
    const idx = [];
    for (let q = 0; q < 3; q++) {
      const b = q * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const mesh = new Mesh("apertureBeam", scene);
    const vd = new VertexData();
    vd.positions = this.pos;
    vd.uvs = this.uv;
    vd.indices = new Uint32Array(idx);
    vd.applyToMesh(mesh, true);
    mesh.renderingGroupId = 2;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    this.mesh = mesh;

    const mat = new ShaderMaterial("shaftMat", scene, { vertex: "templeShaft", fragment: "templeShaft" }, {
      attributes: ["position", "uv"],
      uniforms: ["world", "viewProjection", "tint", "params", "camPos"],
      shaderLanguage: ShaderLanguage.WGSL,
      needAlphaBlending: true,
    });
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mesh.material = mat;
    this.mat = mat;

    this._tint = new Vector4(0.62, 0.72, 1.0, 1);
    this._params = new Vector4(0, 0, 1, 2.4);
    this._t = 0;

    /** A real light in the pool, so the stripe lights the floor it lands on. */
    this.light = new PointLight("beamPool", new Vector3(0, -100, 0), scene);
    this.light.diffuse = new Color3(0.62, 0.74, 1.0);
    this.light.intensity = 0;
    this.light.range = 12;

    this.intensity = 0;
    this.target = 0;
    /** Where the stripe's southern edge currently falls. */
    this.landingZ = 0;
    /** Lateral offset of the stripe from the meridian, in metres. */
    this.offsetX = 0;
    this.visible = false;
  }

  /**
   * @param {Vector3} dir     unit direction *toward* the source
   * @param {number} strength 0..1
   * @param {number[]} colour
   */
  setSource(dir, strength, colour) {
    this._dir = dir;
    this.target = strength;
    if (colour) this._tint.set(colour[0], colour[1], colour[2], 1);
  }

  update(dt) {
    this._t += dt;
    this.intensity = damp(this.intensity, this.target, 0.004, dt);
    const on = this.intensity > 0.004 && toggles.volumetrics;
    this.mesh.setEnabled(on);
    this.light.intensity = 0;
    if (!on || !this._dir) { this.visible = false; return; }
    this.visible = true;

    const d = this._dir;
    // Light travels opposite to the direction of the source.
    const lx = -d.x, ly = -d.y, lz = -d.z;
    if (ly > -0.05) { this.mesh.setEnabled(false); this.visible = false; return; }

    const drop = this.y - this.floorY;
    const t = drop / -ly;                      // distance travelled to the floor
    const dx = lx * t, dz = lz * t;
    this.offsetX = dx;
    this.landingZ = this.z0 + dz;

    const cam = this.scene.activeCamera;
    const hw = this.halfWidth;

    // The beam's own axis (the direction light travels) and a "width" axis
    // perpendicular to it, rolled to face the camera.
    let bx = lx, by = ly, bz = lz;
    const bl = Math.hypot(bx, by, bz) || 1;
    bx /= bl; by /= bl; bz /= bl;

    // Toward the camera, from a point in the middle of the shaft.
    const midX = this.x + dx * 0.5, midY = (this.y + this.floorY) * 0.5, midZ = (this.z0 + this.z1) * 0.5 + dz * 0.5;
    let tx = (cam ? cam.globalPosition.x : 0) - midX;
    let ty = (cam ? cam.globalPosition.y : 0) - midY;
    let tz = (cam ? cam.globalPosition.z : 0) - midZ;
    // Width axis = beam x toCamera, so the quad's normal faces the viewer.
    let wx = by * tz - bz * ty, wy = bz * tx - bx * tz, wz = bx * ty - by * tx;
    let wl = Math.hypot(wx, wy, wz);
    if (wl < 1e-5) { wx = 1; wy = 0; wz = 0; wl = 1; }
    wx /= wl; wy /= wl; wz /= wl;

    // The slit is long, so the shaft is a *sheet*: its cross-section is the
    // slit's width in x and its full run in z. The camera-facing quad spans
    // whichever of those the viewer can actually see.
    const halfLen = (this.z1 - this.z0) * 0.5;
    const P = _pts;
    const q = this.pos, u = this.uv;
    let w = 0, uu = 0;
    const put = (px, py, pz, ax, ay) => {
      q[w++] = px; q[w++] = py; q[w++] = pz;
      u[uu++] = ax; u[uu++] = ay;
    };

    // Quad 1: across the slit's narrow dimension, billboarded.
    const topX = this.x, topZ = (this.z0 + this.z1) * 0.5;
    const botX = topX + dx, botZ = topZ + dz;
    put(topX - wx * hw, this.y - wy * hw, topZ - wz * hw, -1, 0);
    put(topX + wx * hw, this.y + wy * hw, topZ + wz * hw, 1, 0);
    put(botX + wx * hw, this.floorY + 0.02 + wy * hw, botZ + wz * hw, 1, 1);
    put(botX - wx * hw, this.floorY + 0.02 - wy * hw, botZ - wz * hw, -1, 1);

    // Quad 2: along the slit's length, so the sheet reads from the side too.
    put(topX, this.y, topZ - halfLen, -1, 0);
    put(topX, this.y, topZ + halfLen, 1, 0);
    put(botX, this.floorY + 0.02, botZ + halfLen, 1, 1);
    put(botX, this.floorY + 0.02, botZ - halfLen, -1, 1);

    // Quad 3: the pool where it lands.
    const pz0 = Math.max(this.z0 + dz, this.z0), pz1 = Math.min(this.z1 + dz, this.z1);
    put(botX - hw * 1.6, this.floorY + 0.015, pz0, -1, 1);
    put(botX + hw * 1.6, this.floorY + 0.015, pz0, 1, 1);
    put(botX + hw * 1.6, this.floorY + 0.015, pz1, 1, 1);
    put(botX - hw * 1.6, this.floorY + 0.015, pz1, -1, 1);
    void P;

    this.mesh.updateVerticesData("position", this.pos, false, false);
    this.mesh.updateVerticesData("uv", this.uv, false, false);

    this.mat.setVector4("tint", this._tint);
    this._params.set(this.intensity * 0.30 * tune.volumetricStrength, this._t, tune.dustDensity, 2.4);
    this.mat.setVector4("params", this._params);
    if (cam) this.mat.setVector3("camPos", cam.globalPosition);

    // Light the pool. Placed at the middle of the lit stripe.
    const poolZ = clamp((Math.max(this.z0 + dz, this.z0) + Math.min(this.z1 + dz, this.z1)) * 0.5, this.z0, this.z1);
    this.light.position.set(this.x + dx, this.floorY + 0.6, poolZ);
    this.light.intensity = this.intensity * 2.6 * tune.volumetricStrength;
    this.light.diffuse.set(this._tint.x, this._tint.y, this._tint.z);
  }
}

const _pts = new Float32Array(24);

export { clamp01, DEG };
