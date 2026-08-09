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
 * The volume is a thin parallelepiped rebuilt each frame from eight vertices;
 * the shader softens its edges, thickens it with dust, and fades it with
 * distance so it reads as air rather than as a solid.
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

    // Twelve quads: four sides of the column plus the floor pool, doubled so it
    // reads from both sides.
    this.pos = new Float32Array(4 * 6 * 3);
    this.uv = new Float32Array(4 * 6 * 2);
    const idx = [];
    for (let q = 0; q < 6; q++) {
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

    // Aperture rectangle corners, and the same rectangle projected to the floor.
    const hw = this.halfWidth;
    const aX0 = this.x - hw, aX1 = this.x + hw;
    const aZ0 = this.z0, aZ1 = this.z1;
    const P = _pts;
    // top face (at the aperture)
    P[0] = aX0; P[1] = this.y; P[2] = aZ0;
    P[3] = aX1; P[4] = this.y; P[5] = aZ0;
    P[6] = aX1; P[7] = this.y; P[8] = aZ1;
    P[9] = aX0; P[10] = this.y; P[11] = aZ1;
    // bottom face (on the floor)
    for (let i = 0; i < 4; i++) {
      P[12 + i * 3] = P[i * 3] + dx;
      P[12 + i * 3 + 1] = this.floorY + 0.012;
      P[12 + i * 3 + 2] = P[i * 3 + 2] + dz;
    }

    // Build the six quads: four column walls and the two caps.
    const q = this.pos, u = this.uv;
    let w = 0, uu = 0;
    const put = (i, ax, ay) => {
      q[w++] = P[i * 3]; q[w++] = P[i * 3 + 1]; q[w++] = P[i * 3 + 2];
      u[uu++] = ax; u[uu++] = ay;
    };
    // west wall (0-3 top, 4-7 bottom)
    put(0, -1, 0); put(3, -1, 0); put(7, -1, 1); put(4, -1, 1);
    // east wall
    put(1, 1, 0); put(5, 1, 1); put(6, 1, 1); put(2, 1, 0);
    // south end
    put(0, 0, 0); put(4, 0, 1); put(5, 0, 1); put(1, 0, 0);
    // north end
    put(3, 0, 0); put(2, 0, 0); put(6, 0, 1); put(7, 0, 1);
    // the floor pool, drawn twice so it survives being seen edge-on
    put(4, 0, 1); put(7, 0, 1); put(6, 0, 1); put(5, 0, 1);
    put(4, 0, 0.985); put(5, 0, 0.985); put(6, 0, 0.985); put(7, 0, 0.985);

    this.mesh.updateVerticesData("position", this.pos, false, false);
    this.mesh.updateVerticesData("uv", this.uv, false, false);

    const cam = this.scene.activeCamera;
    this.mat.setVector4("tint", this._tint);
    this._params.set(this.intensity * 0.30 * tune.volumetricStrength, this._t, tune.dustDensity, 2.4);
    this.mat.setVector4("params", this._params);
    if (cam) this.mat.setVector3("camPos", cam.globalPosition);

    // Light the pool. Placed at the middle of the lit stripe.
    const midZ = clamp((Math.max(this.z0 + dz, this.z0) + Math.min(this.z1 + dz, this.z1)) * 0.5, this.z0, this.z1);
    this.light.position.set(this.x + dx, this.floorY + 0.6, midZ);
    this.light.intensity = this.intensity * 2.6 * tune.volumetricStrength;
    this.light.diffuse.set(this._tint.x, this._tint.y, this._tint.z);
  }
}

const _pts = new Float32Array(24);

export { clamp01, DEG };
