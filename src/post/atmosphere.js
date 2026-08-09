/**
 * Atmospheric depth as a post-process.
 *
 * Two reasons this is not Babylon's built-in scene fog:
 *
 * 1. Scene fog costs an inter-stage varying in every material, and WebGPU gives
 *    us only sixteen. Two shadow-casting lights (the moon and the lantern) are
 *    worth far more than that varying.
 * 2. Doing it here buys height falloff, a colour that varies with view direction
 *    (looking toward the moon must haze warmer than looking away), and a
 *    separate near-field dust term for sealed interiors — none of which
 *    exponential vertex fog can express.
 */
import { PostProcess, ShaderStore, ShaderLanguage, Matrix, Color3 } from "../core/bjs.js";
import { tune } from "../core/tune.js";
import { lerp } from "../core/scratch.js";

const FRAG = /* wgsl */ `
varying vUV: vec2f;
var textureSamplerSampler: sampler;
var textureSampler: texture_2d<f32>;
var depthSamplerSampler: sampler;
var depthSampler: texture_2d<f32>;

uniform camPos: vec3f;
uniform invProjView: mat4x4f;
uniform fogColorNear: vec3f;
uniform fogColorFar: vec3f;
uniform moonDir: vec3f;
uniform params: vec4f;      // density, heightFalloff, maxZ, interior
uniform params2: vec4f;     // airglow, moonGlowStrength, groundY, time

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let src = textureSample(textureSampler, textureSamplerSampler, input.vUV);
  let depth = textureSample(depthSampler, depthSamplerSampler, input.vUV).r;

  // Reconstruct the world position of this pixel.
  let ndc = vec4f(input.vUV.x * 2.0 - 1.0, (1.0 - input.vUV.y) * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  var world = uniforms.invProjView * ndc;
  world = world / max(1e-6, world.w);

  let toPixel = world.xyz - uniforms.camPos;
  var dist = length(toPixel);
  let dir = toPixel / max(1e-5, dist);

  // Depth of exactly 1 is the far plane: sky. The sky already contains its own
  // extinction, so fog must not double up on it.
  let isSky = step(0.9999, depth);
  dist = min(dist, uniforms.params.z);

  // Height-integrated exponential fog. Density falls off with altitude, so a
  // deep courtyard hazes while a tower top stays clear.
  let hf = uniforms.params.y;
  let y0 = uniforms.camPos.y - uniforms.params2.z;
  let y1 = world.y - uniforms.params2.z;
  let dy = y1 - y0;
  var integral: f32;
  if (abs(dy) < 0.01) {
    integral = dist * exp(-hf * y0);
  } else {
    integral = dist * (exp(-hf * y0) - exp(-hf * y1)) / (hf * dy);
  }
  let amount = 1.0 - exp(-uniforms.params.x * max(0.0, integral));

  // Haze colour leans toward the moon: forward scattering is what makes a night
  // exterior read as air rather than as a grey wash.
  let cosM = max(0.0, dot(dir, uniforms.moonDir));
  let glow = pow(cosM, 6.0) * uniforms.params2.y;
  let fogCol = mix(uniforms.fogColorNear, uniforms.fogColorFar, clamp(dist / uniforms.params.z, 0.0, 1.0))
             + vec3f(0.30, 0.36, 0.52) * glow;

  var outc = mix(src.rgb, fogCol, amount * (1.0 - isSky));

  // Airglow: a very faint lift toward the top of the frame that keeps deep
  // shadow from crushing to pure black.
  outc = outc + vec3f(0.0016, 0.0022, 0.0042) * uniforms.params2.x * (1.0 - amount * 0.5);

  fragmentOutputs.color = vec4f(outc, src.a);
}
`;

export class Atmosphere {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {import("../core/bjs.js").Camera} camera
   * @param {import("../world/lighting.js").Lighting} lighting
   */
  constructor(scene, camera, lighting) {
    this.name = "atmosphere";
    this.order = 880;
    this.scene = scene;
    this.camera = camera;
    this.lighting = lighting;

    ShaderStore.ShadersStoreWGSL["templeAtmosphereFragmentShader"] = FRAG;

    this.depthRenderer = scene.enableDepthRenderer(camera, false, false);

    this.pp = new PostProcess("templeAtmosphere", "templeAtmosphere", {
      uniforms: ["camPos", "invProjView", "fogColorNear", "fogColorFar", "moonDir", "params", "params2"],
      samplers: ["depthSampler"],
      size: 1.0,
      camera,
      engine: scene.getEngine(),
      reusable: true,
      shaderLanguage: ShaderLanguage.WGSL,
    });

    this._invProjView = Matrix.Identity();
    this._near = new Color3(0.030, 0.040, 0.062);
    this._far = new Color3(0.055, 0.070, 0.105);
    this._groundY = 0;
    this.interior = 0;

    this.pp.onApply = (effect) => {
      const cam = this.camera;
      effect.setTexture("depthSampler", this.depthRenderer.getDepthMap());
      effect.setVector3("camPos", cam.globalPosition);
      cam.getViewMatrix().multiplyToRef(cam.getProjectionMatrix(), this._invProjView);
      this._invProjView.invertToRef(this._invProjView);
      effect.setMatrix("invProjView", this._invProjView);
      effect.setColor3("fogColorNear", this._near);
      effect.setColor3("fogColorFar", this._far);
      const md = this.lighting.moonDir;
      effect.setFloat3("moonDir", md[0], md[1], md[2]);
      const density = lerp(tune.fogDensityExterior, tune.fogDensityInterior, this.interior);
      effect.setFloat4("params", density, lerp(0.020, 0.006, this.interior), 900, this.interior);
      effect.setFloat4("params2", tune.airglow, tune.moonIntensity * 0.55, this._groundY, performance.now() * 0.001);
    };
  }

  setInterior(v) { this.interior = v; }
  setGroundY(y) { this._groundY = y; }

  update() {
    this.interior = this.lighting._interior;
  }
}
