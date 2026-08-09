/**
 * Scene lighting.
 *
 * The whole game runs on one contrast: cold celestial light against warm human
 * light. There is exactly one bright directional source (the moon), a baked sky
 * probe for ambient, and a small budget of warm local lights — the lantern the
 * player carries, and a handful of fixed fires and lamps.
 *
 * Shadows come from a cascaded map on the moon and a single spot map on the
 * lantern, so a moving lantern really does swing shadows across the stone.
 */
import {
  DirectionalLight, SpotLight, PointLight, Vector3, Color3,
  CascadedShadowGenerator, ShadowGenerator,
} from "../core/bjs.js";
import { tune, toggles } from "../core/tune.js";
import { bakeEnvProbe, altAzToDir } from "../sky/envProbe.js";
import { DEG, clamp, lerp, damp } from "../core/scratch.js";

const _dir = [0, 0, 0];
const _v = new Vector3();

export class Lighting {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {import("../core/engine.js").Runtime} rt
   */
  constructor(scene, rt) {
    this.name = "lighting";
    this.order = 400;
    this.scene = scene;
    this.rt = rt;

    altAzToDir(tune.moonAltitude, tune.moonAzimuth, _dir);
    this.moonDir = _dir.slice();

    // --- the moon --------------------------------------------------------
    this.moon = new DirectionalLight("moon", new Vector3(-_dir[0], -_dir[1], -_dir[2]), scene);
    this.moon.intensity = tune.moonIntensity;
    // Moonlight is sunlight; it only looks blue because of how we see at night.
    // Pushing it slightly blue-violet and letting the tonemapper pull it back
    // reads far better than a literal white.
    this.moon.diffuse = new Color3(0.60, 0.71, 1.0);
    this.moon.specular = new Color3(0.66, 0.76, 1.0);
    this.moon.shadowMinZ = 1;
    this.moon.shadowMaxZ = 140;
    this.moon.autoUpdateExtends = true;

    // --- ambient ---------------------------------------------------------
    this.env = bakeEnvProbe(scene, this.moonDir, tune.moonIntensity, 32);
    scene.environmentTexture = this.env;
    scene.environmentIntensity = tune.skyIntensity;

    // --- lantern ---------------------------------------------------------
    // A spot rather than a point: cube shadows for a point light cost six
    // renders, and the player only ever sees the lantern's forward hemisphere.
    this.lantern = new SpotLight("lantern", new Vector3(0, 1.2, 0), new Vector3(0, -0.35, 1), 2.9, 1.7, scene);
    this.lantern.diffuse = new Color3(1.0, 0.66, 0.34);
    this.lantern.specular = new Color3(1.0, 0.74, 0.45);
    this.lantern.intensity = tune.lanternIntensity * 14;
    this.lantern.range = tune.lanternRange;
    this.lantern.shadowMinZ = 0.35;
    this.lantern.shadowMaxZ = tune.lanternRange;
    // A second, tiny omni sits inside the lantern housing so the glass and the
    // player's own coat are lit from the correct place.
    this.lanternCore = new PointLight("lanternCore", new Vector3(0, 1.2, 0), scene);
    this.lanternCore.diffuse = new Color3(1.0, 0.62, 0.30);
    this.lanternCore.intensity = tune.lanternIntensity * 2.1;
    this.lanternCore.range = 3.4;

    /** @type {CascadedShadowGenerator|null} */
    this.csm = null;
    /** @type {ShadowGenerator|null} */
    this.lanternShadow = null;

    this._interior = 0;
    this.targetInterior = 0;
    this._lastMoonKey = "";
    /** Set once the sky exists; the simulated moon then drives the light. */
    this.sky = null;
  }

  /** Build shadow generators once the world's casters exist. */
  initShadows(casters, quality = 2048, cascades = 4, lanternQuality = 1024) {
    this.csm = new CascadedShadowGenerator(quality, this.moon);
    this.csm.numCascades = cascades;
    this.csm.lambda = 0.82;
    this.csm.cascadeBlendPercentage = 0.06;
    this.csm.stabilizeCascades = true;
    this.csm.depthClamp = true;
    this.csm.autoCalcDepthBounds = true;
    this.csm.shadowMaxZ = 150;
    this.csm.usePercentageCloserFiltering = true;
    this.csm.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    this.csm.bias = 0.008;
    this.csm.normalBias = 0.018;
    this.csm.darkness = tune.shadowDarkness;
    this.csm.transparencyShadow = false;

    this.lanternShadow = new ShadowGenerator(lanternQuality, this.lantern);
    this.lanternShadow.usePercentageCloserFiltering = true;
    this.lanternShadow.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    this.lanternShadow.bias = 0.004;
    this.lanternShadow.normalBias = 0.012;
    this.lanternShadow.darkness = 0.05;

    for (let i = 0; i < casters.length; i++) {
      this.csm.addShadowCaster(casters[i], false);
      this.lanternShadow.addShadowCaster(casters[i], false);
    }
    return this.csm;
  }

  addCaster(mesh, includeChildren = false) {
    if (this.csm) this.csm.addShadowCaster(mesh, includeChildren);
    if (this.lanternShadow) this.lanternShadow.addShadowCaster(mesh, includeChildren);
  }

  /**
   * Keep the little in-housing light from cooking whatever it is nearest.
   * The coat hangs 30 cm from the flame; at that range an unshielded point
   * light washes the cloth to white however dark its albedo is.
   */
  excludeFromCore(meshes) {
    for (const m of meshes) if (m) this.lanternCore.excludedMeshes.push(m);
  }

  /** Move the lantern rig. Called by the character each frame. */
  placeLantern(pos, forward) {
    this.lantern.position.copyFrom(pos);
    this.lanternCore.position.copyFrom(pos);
    _v.copyFrom(forward);
    _v.y -= 0.42;
    _v.normalize();
    this.lantern.direction.copyFrom(_v);
  }

  /** 0 = under open sky, 1 = deep interior. Drives fog and ambient falloff. */
  setInterior(v) { this.targetInterior = clamp(v, 0, 1); }

  update(dt) {
    // Where the moon is comes from the celestial simulation. The tuning sliders
    // take over only when the overlay's "manual moon" switch is on, so an art
    // pass can put the moon anywhere without the sky and the shadows
    // disagreeing during play.
    let alt = tune.moonAltitude, az = tune.moonAzimuth, illum = 1;
    if (this.sky && !toggles.moonManual) {
      alt = this.sky.moonInfo.alt;
      az = this.sky.moonInfo.az;
      illum = this.sky.moonInfo.illum;
    }
    this.moonIllum = illum;
    const key = alt.toFixed(2) + "|" + az.toFixed(2) + "|" + tune.moonIntensity.toFixed(2);
    if (key !== this._lastMoonKey) {
      this._lastMoonKey = key;
      altAzToDir(alt, az, _dir);
      this.moonDir[0] = _dir[0]; this.moonDir[1] = _dir[1]; this.moonDir[2] = _dir[2];
      this.moon.direction.set(-_dir[0], -_dir[1], -_dir[2]);
      this._envDirty = true;
      this._envTimer = 0;
    }
    if (this._envDirty) {
      this._envTimer = (this._envTimer || 0) + dt;
      if (this._envTimer > 0.25) {
        this._envDirty = false;
        const old = this.env;
        this.env = bakeEnvProbe(this.scene, this.moonDir, tune.moonIntensity, 32);
        this.scene.environmentTexture = this.env;
        if (old) old.dispose();
      }
    }

    this._interior = damp(this._interior, this.targetInterior, 0.02, dt);

    const moonUp = clamp(this.moonDir[1], 0, 1);
    // Brightness follows the real thing: a low moon is dimmed by airmass, and a
    // crescent gives a small fraction of the light of a full one.
    const illumFactor = 0.16 + 0.84 * Math.pow(this.moonIllum === undefined ? 1 : this.moonIllum, 1.35);
    this.moon.intensity = tune.moonIntensity * illumFactor * lerp(1, 0.82, this._interior)
      * (0.05 + 0.95 * Math.pow(moonUp, 0.42));
    this.scene.environmentIntensity = tune.skyIntensity * lerp(1, 0.62, this._interior);
    this.lantern.intensity = tune.lanternIntensity * 14;
    this.lanternCore.intensity = tune.lanternIntensity * 2.1;
    this.lantern.range = tune.lanternRange;
    this.lanternCore.range = tune.lanternRange * 0.34;

    if (this.csm) {
      this.csm.darkness = tune.shadowDarkness;
      const on = toggles.shadows;
      if (this.moon.shadowEnabled !== on) this.moon.shadowEnabled = on;
      if (this.lantern.shadowEnabled !== on) this.lantern.shadowEnabled = on;
    }
  }

  /** Current fog density given where the player is. */
  fogDensity() {
    return lerp(tune.fogDensityExterior, tune.fogDensityInterior, this._interior);
  }
}

export { DEG };
