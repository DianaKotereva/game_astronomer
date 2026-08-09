/**
 * The night sky.
 *
 * Three pieces share one rotation: a gradient dome carrying the Milky Way, a
 * point-sprite starfield built from the catalogue, and the moon. All of them are
 * stored in *equatorial* coordinates and rotated into world space by a single
 * matrix rebuilt each frame from local sidereal time and the observer's
 * latitude. That is the whole trick to keeping the sky honest: there is only one
 * place where "where is the sky pointing" is decided, and every instrument,
 * sight line and spell in the game reads the same answer.
 *
 * Stability matters as much as beauty here. Stars are static geometry in world
 * space; nothing jitters them per frame, so TAA can hold a long history without
 * crawling — and when game time is deliberately accelerated, that same history
 * turns star motion into long-exposure trails, which is exactly the look the
 * temple's own instruments imply.
 */
import {
  Mesh, VertexData, ShaderMaterial, ShaderStore, ShaderLanguage, RawTexture,
  Texture, Constants, Matrix, Vector2, Vector3, Vector4, TransformNode,
} from "../core/bjs.js";
import { BRIGHT_STARS, generateFaintStars, bvToRGB, equatorialToGalactic, galacticToEquatorial } from "../astronomy/catalog.js";
import { lst, OBSERVER, moonPosition, equatorialToHorizontal, planetPosition, planetCount, altAzToWorld } from "../astronomy/celestial.js";
import { fbm2, ridged2, warpedFbm2, smoothstepf, clamp01f, mix as mixf } from "../materials/noise.js";
import { DEG, TAU, clamp } from "../core/scratch.js";
import { tune, toggles } from "../core/tune.js";

/* ==================================================================== */
/*  Shaders                                                              */
/* ==================================================================== */

const DOME_VS = /* wgsl */ `
attribute position: vec3f;
uniform viewProjection: mat4x4f;
uniform world: mat4x4f;
uniform eqToWorld: mat4x4f;
varying vDir: vec3f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let p = vertexInputs.position;
  vertexOutputs.vDir = normalize(p);
  let worldPos = uniforms.world * vec4f(p, 1.0);
  vertexOutputs.position = uniforms.viewProjection * worldPos;
}
`;

const DOME_FS = /* wgsl */ `
varying vDir: vec3f;
var milkywaySampler: sampler;
var milkyway: texture_2d<f32>;
uniform worldToEq: mat4x4f;
uniform moonDir: vec3f;
uniform params: vec4f;   // skyIntensity, milkyWay, moonIntensity, airglow
uniform params2: vec4f;  // extinction, horizonLift, unused, unused

const PI: f32 = 3.14159265359;

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let dir = normalize(input.vDir);

  // --- base gradient: deep violet zenith, dusty horizon -------------------
  let up = clamp(dir.y, -1.0, 1.0);
  let h = pow(max(0.0, 1.0 - abs(up)), 3.2);
  var col = vec3f(0.0090, 0.0135, 0.0290) + vec3f(0.0170, 0.0205, 0.0290) * h * uniforms.params2.y;

  // --- Milky Way ---------------------------------------------------------
  // Sampled in equatorial coordinates so the band sits where it truly is.
  let eq = (uniforms.worldToEq * vec4f(dir, 0.0)).xyz;
  let ra = atan2(eq.y, eq.x);
  let dec = asin(clamp(eq.z, -1.0, 1.0));
  let uv = vec2f(fract(ra / (2.0 * PI) + 1.0), 0.5 - dec / PI);
  let mw = textureSample(milkyway, milkywaySampler, uv);
  col = col + mw.rgb * uniforms.params.y;

  // --- moon glow ---------------------------------------------------------
  let cosA = dot(dir, uniforms.moonDir);
  if (cosA > 0.0) {
    let broad = pow(cosA, 5.0) * 0.030;
    let halo  = pow(cosA, 40.0) * 0.052;
    let tight = pow(cosA, 700.0) * 0.30;
    col = col + (broad + halo + tight) * uniforms.params.z * vec3f(0.80, 0.87, 1.0);
  }

  // --- horizon extinction and airglow ------------------------------------
  // Everything within a few degrees of the horizon is seen through many
  // airmasses: it reddens slightly and loses contrast.
  let below = smoothstep(0.06, -0.02, up);
  let hazeBand = smoothstep(0.22, 0.0, up);
  let haze = vec3f(0.0180, 0.0175, 0.0195) * hazeBand * uniforms.params2.x;
  col = mix(col, haze, hazeBand * 0.55);
  col = col * (1.0 - below * 0.92);

  // faint green-blue airglow layer, strongest 10-20 degrees up
  let ag = exp(-pow((up - 0.22) * 4.4, 2.0)) * uniforms.params.w;
  col = col + vec3f(0.0016, 0.0030, 0.0028) * ag;

  fragmentOutputs.color = vec4f(col * uniforms.params.x, 1.0);
}
`;

const STAR_VS = /* wgsl */ `
attribute position: vec3f;   // unit direction, equatorial frame
attribute uv: vec2f;         // quad corner in [-1,1]
attribute color: vec4f;      // rgb + visual magnitude

uniform viewProjection: mat4x4f;
uniform world: mat4x4f;
uniform eqToWorld: mat4x4f;
uniform camPos: vec3f;
uniform screen: vec2f;
uniform params: vec4f;       // sizeScale, intensity, extinctionStrength, radius

varying vCorner: vec2f;
varying vColor: vec3f;
varying vBright: f32;
varying vSpike: f32;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let dirW = (uniforms.eqToWorld * vec4f(vertexInputs.position, 0.0)).xyz;

  // Airmass from altitude; sin(alt) is simply the y component.
  let sinAlt = dirW.y;
  let airmass = 1.0 / max(0.055, sinAlt + 0.06);
  let ext = 0.23 * min(airmass, 11.0) * uniforms.params.z;
  let mag = vertexInputs.color.w + ext;

  // Flux relative to the naked-eye limit.
  let flux = pow(10.0, -0.4 * (mag - 6.6));
  let radiusPx = clamp(0.95 + 0.62 * log2(1.0 + flux), 0.85, 8.5) * uniforms.params.x;
  let bright = pow(max(flux, 0.0), 0.42) * uniforms.params.y;

  vertexOutputs.vCorner = vertexInputs.uv;
  vertexOutputs.vColor = vertexInputs.color.rgb;
  vertexOutputs.vBright = bright;
  vertexOutputs.vSpike = smoothstep(2.2, 0.2, mag);

  var clip = uniforms.viewProjection * vec4f(uniforms.camPos + dirW * uniforms.params.w, 1.0);
  // Expand to a constant pixel size after projection.
  clip = vec4f(clip.xy + vertexInputs.uv * radiusPx / uniforms.screen * 2.0 * clip.w, clip.zw);

  // Below the horizon, or entirely extinguished: collapse the quad behind the
  // near plane. (An early return is not available: the entry point must produce
  // a FragmentInputs value on every path.)
  if (sinAlt < -0.035 || bright < 0.0012) {
    clip = vec4f(0.0, 0.0, -2.0, 1.0);
  }
  vertexOutputs.position = clip;
}
`;

const STAR_FS = /* wgsl */ `
varying vCorner: vec2f;
varying vColor: vec3f;
varying vBright: f32;
varying vSpike: f32;

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let c = input.vCorner;
  let r2 = dot(c, c);
  if (r2 > 1.0) { discard; }
  let r = sqrt(r2);

  // A tight core with a soft aureole: a star is a point source seen through an
  // imperfect atmosphere and an imperfect eye, not a disc.
  let core = exp(-r2 * 8.5);
  let halo = exp(-r * 3.1) * 0.16;

  // Very bright stars only: a whisper of diffraction, never a glamour cross.
  let sx = max(0.0, 1.0 - abs(c.x) * 7.0) * max(0.0, 1.0 - abs(c.y) * 1.35);
  let sy = max(0.0, 1.0 - abs(c.y) * 7.0) * max(0.0, 1.0 - abs(c.x) * 1.35);
  let spike = (sx + sy) * 0.10 * input.vSpike;

  let i = (core + halo + spike) * input.vBright;
  fragmentOutputs.color = vec4f(input.vColor * i, 1.0);
}
`;

const MOON_VS = /* wgsl */ `
attribute position: vec3f;
attribute uv: vec2f;
uniform viewProjection: mat4x4f;
uniform world: mat4x4f;
uniform moonBasis: mat4x4f;   // columns: right, up, dir
uniform camPos: vec3f;
uniform params: vec4f;        // angularRadius(rad), distance, intensity, phaseAngle
varying vUV: vec2f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let right = uniforms.moonBasis[0].xyz;
  let up = uniforms.moonBasis[1].xyz;
  let dir = uniforms.moonBasis[2].xyz;
  let s = tan(uniforms.params.x) * uniforms.params.y;
  let p = uniforms.camPos + dir * uniforms.params.y
        + right * (vertexInputs.uv.x * 2.0 - 1.0) * s * 2.6
        + up * (vertexInputs.uv.y * 2.0 - 1.0) * s * 2.6;
  vertexOutputs.vUV = vertexInputs.uv;
  vertexOutputs.position = uniforms.viewProjection * vec4f(p, 1.0);
}
`;

const MOON_FS = /* wgsl */ `
varying vUV: vec2f;
var surfaceSampler: sampler;
var surface: texture_2d<f32>;
uniform params: vec4f;    // angularRadius, distance, intensity, illuminatedFraction
uniform params2: vec4f;   // terminator x position (-1..1), limbSign, unused, unused

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  // The quad is 2.6x the disc so the glow has somewhere to live.
  let p = (input.vUV * 2.0 - 1.0) * 2.6;
  let r = length(p);

  var col = vec3f(0.0);

  // --- glow --------------------------------------------------------------
  let glow = exp(-r * 2.6) * 0.16 + exp(-r * 7.0) * 0.22;
  col = col + vec3f(0.72, 0.79, 0.98) * glow * uniforms.params.z;

  // --- disc --------------------------------------------------------------
  // Sampled unconditionally: WGSL forbids implicit-derivative sampling inside
  // non-uniform control flow, and the branch below is per-pixel.
  let discUV = p * 0.5 + 0.5;
  let s = textureSampleLevel(surface, surfaceSampler, discUV, 0.0).r;
  if (r < 1.0) {

    // Sphere normal across the disc, used for limb darkening and the phase.
    let nz = sqrt(max(0.0, 1.0 - r * r));
    let n = vec3f(p.x, p.y, nz);

    // Phase: the sun lies in the direction (sin g, 0, cos g) in disc space.
    let g = uniforms.params2.x;
    let sunDir = vec3f(sin(g), 0.0, cos(g));
    var lambert = max(0.0, dot(n, sunDir));
    // The moon is famously not Lambertian — it is nearly as bright at the limb
    // as at the centre. A Lommel-Seeliger-ish correction gets that flatness.
    let mu0 = max(0.0001, dot(n, sunDir));
    let mu = max(0.0001, nz);
    let ls = mu0 / (mu0 + mu);
    var lit = mix(lambert, ls * 1.5, 0.72);
    lit = lit * smoothstep(0.0, 0.035, mu0);

    let albedo = mix(0.052, 0.135, s);
    let body = albedo * lit * 26.0 * uniforms.params.z;
    // A trace of earthshine keeps the dark limb from vanishing entirely.
    let earthshine = 0.0038 * uniforms.params.z * albedo * 26.0;
    let edge = 1.0 - smoothstep(0.985, 1.0, r);
    col = col + (vec3f(1.0, 0.985, 0.955) * body + vec3f(0.55, 0.66, 0.95) * earthshine) * edge;
  }

  fragmentOutputs.color = vec4f(col, 1.0);
}
`;

/* ==================================================================== */
/*  System                                                               */
/* ==================================================================== */

const _altaz = { alt: 0, az: 0 };
const _dir = { x: 0, y: 0, z: 0 };
const _rgb = [0, 0, 0];
const _basis = new Float64Array(9);

export class Sky {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {import("../astronomy/gameTime.js").GameTime} time
   */
  constructor(scene, time) {
    this.name = "sky";
    this.order = 200;
    this.scene = scene;
    this.time = time;

    this.radius = 1400;
    this.eqToWorld = Matrix.Identity();
    this.worldToEq = Matrix.Identity();
    this.moonDir = new Vector3(0, 1, 0);
    this.moonInfo = { alt: 0, az: 0, ra: 0, dec: 0, illum: 0, phase: 0 };
    /** @type {Array<{name:string, ra:number, dec:number, alt:number, az:number, mag:number}>} */
    this.planets = [];

    this.root = new TransformNode("skyRoot", scene);

    // ShaderMaterial takes vectors, not loose floats. These are held so that
    // pushing uniforms every frame allocates nothing.
    this._u = {
      domeParams: new Vector4(0, 0, 0, 0),
      domeParams2: new Vector4(0, 0, 0, 0),
      starParams: new Vector4(0, 0, 0, 0),
      screen: new Vector2(1, 1),
      moonParams: new Vector4(0, 0, 0, 0),
      moonParams2: new Vector4(0, 0, 0, 0),
    };

    ShaderStore.ShadersStoreWGSL["templeDomeVertexShader"] = DOME_VS;
    ShaderStore.ShadersStoreWGSL["templeDomeFragmentShader"] = DOME_FS;
    ShaderStore.ShadersStoreWGSL["templeStarVertexShader"] = STAR_VS;
    ShaderStore.ShadersStoreWGSL["templeStarFragmentShader"] = STAR_FS;
    ShaderStore.ShadersStoreWGSL["templeMoonVertexShader"] = MOON_VS;
    ShaderStore.ShadersStoreWGSL["templeMoonFragmentShader"] = MOON_FS;
  }

  /** @param {(label:string, weight?:number)=>Promise<void>} report */
  async build(report) {
    await report("charting the Milky Way", 2);
    this._buildDome();
    await report("counting the fixed stars", 3);
    this._buildStars();
    await report("finding the moon", 1);
    this._buildMoon();
    this.update(0);
    return this;
  }

  /* ---------------------------------------------------------------- dome */

  _buildDome() {
    const scene = this.scene;
    const seg = 48, rings = 32;
    const pos = [], idx = [];
    for (let r = 0; r <= rings; r++) {
      const phi = (r / rings) * Math.PI;
      const sp = Math.sin(phi), cp = Math.cos(phi);
      for (let s = 0; s <= seg; s++) {
        const th = (s / seg) * TAU;
        pos.push(Math.cos(th) * sp, cp, Math.sin(th) * sp);
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < seg; s++) {
        const a = r * (seg + 1) + s, b = a + 1, c = a + seg + 1, d = c + 1;
        // inward-facing winding
        idx.push(a, c, b, b, c, d);
      }
    }
    const mesh = new Mesh("skyDome", scene);
    const vd = new VertexData();
    vd.positions = new Float32Array(pos);
    vd.indices = new Uint32Array(idx);
    vd.applyToMesh(mesh, false);
    mesh.scaling.setAll(this.radius);
    mesh.infiniteDistance = true;
    mesh.renderingGroupId = 0;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.parent = this.root;

    this.milkyway = buildMilkyWayTexture(scene, 1024, 512);

    const mat = new ShaderMaterial("skyDomeMat", scene, { vertex: "templeDome", fragment: "templeDome" }, {
      attributes: ["position"],
      uniforms: ["world", "viewProjection", "eqToWorld", "worldToEq", "moonDir", "params", "params2"],
      samplers: ["milkyway"],
      shaderLanguage: ShaderLanguage.WGSL,
    });
    mat.setTexture("milkyway", this.milkyway);
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mat.freeze();
    mesh.material = mat;
    this.domeMat = mat;
    this.dome = mesh;
  }

  /* --------------------------------------------------------------- stars */

  _buildStars() {
    const scene = this.scene;
    const faint = generateFaintStars(5200, 90210);
    /** @type {Array<{ra:number,dec:number,mag:number,bv:number,name:string}>} */
    const all = BRIGHT_STARS.concat(faint);
    this.stars = all;
    /** Index of each catalogued (named) star, for instruments to point at. */
    this.namedCount = BRIGHT_STARS.length;

    const n = all.length;
    const pos = new Float32Array(n * 4 * 3);
    const uv = new Float32Array(n * 4 * 2);
    const col = new Float32Array(n * 4 * 4);
    const idx = new Uint32Array(n * 6);

    const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];
    for (let i = 0; i < n; i++) {
      const s = all[i];
      const ra = s.ra * DEG, dec = s.dec * DEG;
      const cd = Math.cos(dec);
      const x = cd * Math.cos(ra), y = cd * Math.sin(ra), z = Math.sin(dec);
      bvToRGB(s.bv, _rgb);
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        uv[v * 2] = CORNERS[k * 2]; uv[v * 2 + 1] = CORNERS[k * 2 + 1];
        col[v * 4] = _rgb[0]; col[v * 4 + 1] = _rgb[1]; col[v * 4 + 2] = _rgb[2];
        col[v * 4 + 3] = s.mag;
      }
      const b = i * 4;
      idx[i * 6] = b; idx[i * 6 + 1] = b + 1; idx[i * 6 + 2] = b + 2;
      idx[i * 6 + 3] = b; idx[i * 6 + 4] = b + 2; idx[i * 6 + 5] = b + 3;
    }

    const mesh = new Mesh("starfield", scene);
    const vd = new VertexData();
    vd.positions = pos; vd.uvs = uv; vd.colors = col; vd.indices = idx;
    vd.applyToMesh(mesh, false);
    mesh.infiniteDistance = false;
    mesh.renderingGroupId = 0;
    mesh.alphaIndex = 1;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.parent = this.root;

    const mat = new ShaderMaterial("starMat", scene, { vertex: "templeStar", fragment: "templeStar" }, {
      attributes: ["position", "uv", "color"],
      uniforms: ["world", "viewProjection", "eqToWorld", "camPos", "screen", "params"],
      shaderLanguage: ShaderLanguage.WGSL,
      needAlphaBlending: true,
    });
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mesh.material = mat;
    this.starMat = mat;
    this.starMesh = mesh;
  }

  /* ---------------------------------------------------------------- moon */

  _buildMoon() {
    const scene = this.scene;
    const mesh = new Mesh("moon", scene);
    const vd = new VertexData();
    vd.positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
    vd.uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    vd.indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
    vd.applyToMesh(mesh, false);
    mesh.renderingGroupId = 0;
    mesh.alphaIndex = 2;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.parent = this.root;

    this.moonTex = buildMoonTexture(scene, 256);

    const mat = new ShaderMaterial("moonMat", scene, { vertex: "templeMoon", fragment: "templeMoon" }, {
      attributes: ["position", "uv"],
      uniforms: ["world", "viewProjection", "moonBasis", "camPos", "params", "params2"],
      samplers: ["surface"],
      shaderLanguage: ShaderLanguage.WGSL,
      needAlphaBlending: true,
    });
    mat.setTexture("surface", this.moonTex);
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mesh.material = mat;
    this.moonMat = mat;
    this.moonMesh = mesh;
    this._moonBasis = Matrix.Identity();
  }

  /* -------------------------------------------------------------- update */

  /**
   * Rebuild the equatorial -> world rotation. This is the single place the sky's
   * orientation is decided.
   */
  _updateRotation() {
    const jd = this.time.jd;
    const L = lst(jd, OBSERVER.longitude) * DEG;
    const phi = OBSERVER.latitude * DEG;
    const cL = Math.cos(L), sL = Math.sin(L);
    const cp = Math.cos(phi), sp = Math.sin(phi);

    // equatorial -> hour-angle frame
    // h = ( cL*ex + sL*ey , sL*ex - cL*ey , ez )
    // hour-angle -> world (x east, y up, z north)
    // east  = -h.y
    // up    =  cp*h.x + sp*h.z
    // north = -sp*h.x + cp*h.z
    // Columns are the world-space images of the equatorial basis vectors.
    // Storage is column-major, matching how WGSL reads a mat4x4f.
    const W = _basis;
    W[0] = -sL; W[1] = cp * cL; W[2] = -sp * cL;      // image of ex -> (east, up, north)
    W[3] = cL; W[4] = cp * sL; W[5] = -sp * sL;       // ey
    W[6] = 0; W[7] = sp; W[8] = cp;                   // ez

    const m = this.eqToWorld.m;
    const P = this.time.precession ? this.time.precession.m : null;
    if (P && this.time.epochYearsBack !== 0) {
      // Apply precession first, then the diurnal rotation: total = W · P.
      // Done by hand rather than through Matrix.multiply so the convention is
      // unambiguous — both matrices here are column-major rotations.
      for (let c = 0; c < 3; c++) {
        const px = P[c * 4], py = P[c * 4 + 1], pz = P[c * 4 + 2];
        m[c * 4 + 0] = W[0] * px + W[3] * py + W[6] * pz;
        m[c * 4 + 1] = W[1] * px + W[4] * py + W[7] * pz;
        m[c * 4 + 2] = W[2] * px + W[5] * py + W[8] * pz;
        m[c * 4 + 3] = 0;
      }
    } else {
      for (let c = 0; c < 3; c++) {
        m[c * 4 + 0] = W[c * 3 + 0];
        m[c * 4 + 1] = W[c * 3 + 1];
        m[c * 4 + 2] = W[c * 3 + 2];
        m[c * 4 + 3] = 0;
      }
    }
    m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
    this.eqToWorld.markAsUpdated();
    this.eqToWorld.transposeToRef(this.worldToEq);   // rotation: inverse == transpose
  }

  update(dt) {
    this._updateRotation();
    const scene = this.scene;
    const cam = scene.activeCamera;
    if (!cam) return;
    const jd = this.time.jd;

    // --- moon ------------------------------------------------------------
    const mp = moonPosition(jd);
    equatorialToHorizontal(mp.ra, mp.dec, lst(jd, OBSERVER.longitude), OBSERVER.latitude, _altaz);
    this.moonInfo.alt = _altaz.alt; this.moonInfo.az = _altaz.az;
    this.moonInfo.ra = mp.ra; this.moonInfo.dec = mp.dec;
    this.moonInfo.illum = mp.illum; this.moonInfo.phase = mp.phase;
    altAzToWorld(_altaz.alt, _altaz.az, _dir);
    this.moonDir.set(_dir.x, _dir.y, _dir.z);

    // --- planets ---------------------------------------------------------
    if (this.planets.length === 0) {
      for (let i = 0; i < planetCount(); i++) this.planets.push({ name: "", ra: 0, dec: 0, alt: 0, az: 0, mag: 0, index: i });
    }
    for (let i = 0; i < this.planets.length; i++) {
      const p = planetPosition(i, jd);
      const rec = this.planets[i];
      rec.name = p.name; rec.ra = p.ra; rec.dec = p.dec; rec.mag = p.mag;
      equatorialToHorizontal(p.ra, p.dec, lst(jd, OBSERVER.longitude), OBSERVER.latitude, _altaz);
      rec.alt = _altaz.alt; rec.az = _altaz.az;
    }

    // --- uniforms --------------------------------------------------------
    const engine = scene.getEngine();
    const w = engine.getRenderWidth(), h = engine.getRenderHeight();

    if (this.domeMat) {
      this.domeMat.setMatrix("eqToWorld", this.eqToWorld);
      this.domeMat.setMatrix("worldToEq", this.worldToEq);
      this.domeMat.setVector3("moonDir", this.moonDir);
      this._u.domeParams.set(
        tune.skyIntensity * 2.0,
        toggles.milkyWay ? tune.milkyWayIntensity : 0,
        tune.moonIntensity * (this.moonInfo.alt > -6 ? 1 : 0.1) * this.moonInfo.illum,
        tune.airglow);
      this.domeMat.setVector4("params", this._u.domeParams);
      this._u.domeParams2.set(tune.extinctionStrength, tune.skyHorizonLift, 0, 0);
      this.domeMat.setVector4("params2", this._u.domeParams2);
    }
    if (this.starMat) {
      this.starMesh.setEnabled(toggles.stars);
      this.starMat.setMatrix("eqToWorld", this.eqToWorld);
      this.starMat.setVector3("camPos", cam.globalPosition);
      this._u.screen.set(w, h);
      this.starMat.setVector2("screen", this._u.screen);
      this._u.starParams.set(tune.starSizeScale, tune.starIntensity * 0.75, tune.extinctionStrength, this.radius);
      this.starMat.setVector4("params", this._u.starParams);
    }
    if (this.moonMat) {
      this.moonMesh.setEnabled(toggles.moon && this.moonInfo.alt > -8);
      // Build an orthonormal basis around the moon direction.
      const d = this.moonDir;
      let ux = 0, uy = 1, uz = 0;
      if (Math.abs(d.y) > 0.98) { ux = 1; uy = 0; uz = 0; }
      let rx = uy * d.z - uz * d.y, ry = uz * d.x - ux * d.z, rz = ux * d.y - uy * d.x;
      const rl = Math.hypot(rx, ry, rz) || 1;
      rx /= rl; ry /= rl; rz /= rl;
      const upx = d.y * rz - d.z * ry, upy = d.z * rx - d.x * rz, upz = d.x * ry - d.y * rx;
      const m = this._moonBasis.m;
      m[0] = rx; m[1] = ry; m[2] = rz; m[3] = 0;
      m[4] = upx; m[5] = upy; m[6] = upz; m[7] = 0;
      m[8] = d.x; m[9] = d.y; m[10] = d.z; m[11] = 0;
      m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
      this._moonBasis.markAsUpdated();
      this.moonMat.setMatrix("moonBasis", this._moonBasis);
      this.moonMat.setVector3("camPos", cam.globalPosition);
      const angRad = tune.moonAngularSize * DEG * 0.5;
      this._u.moonParams.set(angRad, this.radius * 0.72, tune.moonIntensity, this.moonInfo.illum);
      this.moonMat.setVector4("params", this._u.moonParams);
      // Phase angle: 0 = full (the sun behind the observer), pi = new. The sign
      // decides which limb is lit, so a waxing moon is lit on the correct side.
      const g = this.moonInfo.phase * TAU;
      const pa = Math.acos(clamp(Math.cos(g), -1, 1)) * (Math.sin(g) > 0 ? 1 : -1);
      this._u.moonParams2.set(pa, 1, 0, 0);
      this.moonMat.setVector4("params2", this._u.moonParams2);
    }
  }

  /** World-space unit direction of a catalogued star, by index. */
  starDirection(index, out) {
    const s = this.stars[index];
    if (!s) return null;
    const ra = s.ra * DEG, dec = s.dec * DEG;
    const cd = Math.cos(dec);
    const x = cd * Math.cos(ra), y = cd * Math.sin(ra), z = Math.sin(dec);
    const m = this.eqToWorld.m;
    out.x = m[0] * x + m[4] * y + m[8] * z;
    out.y = m[1] * x + m[5] * y + m[9] * z;
    out.z = m[2] * x + m[6] * y + m[10] * z;
    return out;
  }

  /** Altitude and azimuth of a catalogued star right now. */
  starAltAz(index, out) {
    const s = this.stars[index];
    if (!s) return null;
    return equatorialToHorizontal(s.ra, s.dec, lst(this.time.jd, OBSERVER.longitude), OBSERVER.latitude, out);
  }
}

/* ==================================================================== */
/*  Procedural sky textures                                              */
/* ==================================================================== */

/**
 * Milky Way, baked in equatorial coordinates.
 *
 * Structure rather than a smear: a disc that thins with galactic latitude, a
 * bulge toward the galactic centre, star-cloud patches, and — importantly — the
 * dark rift, because the dust lanes are most of what makes the band legible.
 */
export function buildMilkyWayTexture(scene, W = 1024, H = 512) {
  const data = new Uint8Array(W * H * 4);
  const gal = { l: 0, b: 0 };
  for (let y = 0; y < H; y++) {
    const dec = 90 - (y + 0.5) / H * 180;
    for (let x = 0; x < W; x++) {
      const ra = (x + 0.5) / W * 360;
      equatorialToGalactic(ra, dec, gal);
      const b = gal.b, l = gal.l;

      // Disc profile: thin, with a broader halo of unresolved stars.
      const thin = Math.exp(-Math.pow(Math.abs(b) / 5.2, 1.55));
      const thick = Math.exp(-Math.pow(Math.abs(b) / 16.0, 1.35)) * 0.42;
      let d = thin + thick;

      // The bulge: brightest toward l = 0 (Sagittarius), fading by l = 180.
      const towardCentre = Math.cos(l * DEG);
      const bulge = Math.exp(-Math.pow(Math.abs(b) / 12.0, 1.5)) * Math.max(0, towardCentre) * 0.85;
      d = d * (0.55 + 0.55 * Math.max(0, towardCentre)) + bulge * 0.7;

      // Star clouds and filaments.
      const lx = l / 360 * 12, by = (b + 90) / 180 * 6;
      const clouds = warpedFbm2(lx * 2.2, by * 6.0, 24, 5, 771, 0.9);
      d *= 0.55 + clouds * 0.95;

      // Dark rift and dust lanes: subtract ridged noise hugging the plane.
      const dust = ridged2(lx * 3.1, by * 9.0, 36, 4, 313);
      const dustMask = Math.exp(-Math.pow(Math.abs(b) / 6.5, 2.0));
      d *= 1 - clamp01f(dust * 1.25 - 0.24) * dustMask * 0.86;
      // The Great Rift specifically, running from Cygnus to Sagittarius.
      const rift = Math.exp(-Math.pow((b - 1.2) / 2.6, 2)) *
        smoothstepf(0, 25, l < 180 ? l : 360 - l) * smoothstepf(120, 60, l < 180 ? l : 360 - l);
      d *= 1 - rift * 0.55;

      // Fine unresolved grain, so the band is not smooth.
      d *= 0.85 + fbm2(lx * 30, by * 30, 180, 3, 97) * 0.3;

      d = clamp01f(d) * 0.052;

      // Colour: the bulge is warmer, the arms a little cooler.
      const warm = clamp01f(Math.max(0, towardCentre) * 0.9);
      const r = d * mixf(0.92, 1.06, warm);
      const g = d * mixf(0.95, 0.98, warm);
      const bl = d * mixf(1.10, 0.92, warm);

      const i = (y * W + x) * 4;
      data[i] = Math.min(255, r * 255 * 8);
      data[i + 1] = Math.min(255, g * 255 * 8);
      data[i + 2] = Math.min(255, bl * 255 * 8);
      data[i + 3] = 255;
    }
  }
  const tex = RawTexture.CreateRGBATexture(data, W, H, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  tex.name = "milkyway";
  tex.gammaSpace = false;
  tex.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
  tex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 4;
  return tex;
}

/** Lunar surface: maria, highlands, a few large craters and rays. */
export function buildMoonTexture(scene, S = 256) {
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S * 2 - 1;
      const v = (y + 0.5) / S * 2 - 1;
      const r = Math.hypot(u, v);
      let val = 0.5;
      if (r <= 1.001) {
        // Project the disc onto a sphere so features compress at the limb.
        const nz = Math.sqrt(Math.max(0, 1 - r * r));
        const sx = u * 3.0, sy = v * 3.0, sz = nz * 3.0;
        const highlands = fbm2(sx + 11, sy + sz * 0.6, 24, 5, 421);
        // Maria: large dark basins in the northern-western quadrant, as ours are.
        let maria = 0;
        const basins = [[-0.30, 0.42, 0.34], [0.05, 0.52, 0.26], [-0.55, 0.10, 0.28],
        [0.34, 0.30, 0.20], [-0.12, 0.02, 0.22], [0.46, -0.10, 0.15]];
        for (const [bx, by, br] of basins) {
          const d = Math.hypot(u - bx, v - by);
          maria = Math.max(maria, smoothstepf(br, br * 0.35, d));
        }
        maria *= 0.75 + fbm2(sx * 1.4, sy * 1.4, 12, 3, 733) * 0.5;
        val = mixf(0.34 + highlands * 0.66, 0.12 + highlands * 0.18, clamp01f(maria));
        // Craters: bright rims and rays.
        const cr = ridged2(sx * 4.5, sy * 4.5, 40, 4, 919);
        val += clamp01f(cr - 0.62) * 0.9 * (1 - maria * 0.6);
        // Tycho's ray system, roughly where it belongs.
        const dt = Math.hypot(u + 0.10, v + 0.62);
        const ang = Math.atan2(v + 0.62, u + 0.10);
        const rays = Math.max(0, Math.cos(ang * 11) * 0.5 + 0.5) * Math.exp(-dt * 1.7) * 0.55;
        val += rays * (1 - maria * 0.8);
      }
      const i = (y * S + x) * 4;
      const c = Math.max(0, Math.min(255, val * 255));
      data[i] = c; data[i + 1] = c; data[i + 2] = c; data[i + 3] = 255;
    }
  }
  const tex = RawTexture.CreateRGBATexture(data, S, S, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  tex.name = "moonSurface";
  tex.gammaSpace = false;
  tex.wrapU = tex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  return tex;
}

export { galacticToEquatorial };
