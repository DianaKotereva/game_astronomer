/**
 * Material library.
 *
 * Assembles PBR materials from the procedural bakery. Three things are worth
 * knowing:
 *
 * - UVs already carry world scale (see world/geo.js), so every texture is left
 *   at uScale = vScale = 1 and tiles by metres, not by object.
 * - The height field is stored in the normal map's alpha, which lets hero stone
 *   use parallax without a fourth texture.
 * - A shared micro-detail map is applied through Babylon's detail slot at a much
 *   finer tiling, supplying the pore/scratch tier close to the eye. That is the
 *   third of the three stone scales required by the brief; macro comes from the
 *   geometry itself.
 */
import { PBRMaterial, Texture, RawTexture, Color3, Constants } from "../core/bjs.js";
import {
  limestone, sandstone, blackstone, bronze, brass, darkwood, plaster,
  cloth, parchment, gravel, detailMap,
} from "./textureLab.js";

export class MaterialLib {
  /** @param {import("../core/bjs.js").Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, PBRMaterial>} */
    this.cache = new Map();
    this.detail = null;
    this.envIntensity = 0.55;
  }

  /** Build the shared detail map once. */
  initDetail(size = 512) {
    if (!this.detail) this.detail = detailMap(this.scene, size);
    return this.detail;
  }

  /** A clone of the detail map set to a given tiling scale (cached per scale). */
  detailAt(scale) {
    if (!this._detailScales) this._detailScales = new Map();
    const k = scale.toFixed(2);
    const hit = this._detailScales.get(k);
    if (hit) return hit;
    const base = this.initDetail();
    const t = scale === 1 ? base : base.clone();
    t.uScale = t.vScale = scale;
    t.wrapU = t.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
    t.gammaSpace = false;
    this._detailScales.set(k, t);
    return t;
  }

  /**
   * @param {string} key
   * @param {{albedo:Texture,normal:Texture,orm:Texture}} maps
   * @param {Object} [o]
   */
  fromMaps(key, maps, o = {}) {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const m = new PBRMaterial(key, this.scene);
    m.albedoTexture = maps.albedo;
    m.bumpTexture = maps.normal;
    m.metallicTexture = maps.orm;
    m.useAmbientOcclusionFromMetallicTextureRed = true;
    m.useRoughnessFromMetallicTextureGreen = true;
    m.useMetallnessFromMetallicTextureBlue = true;
    m.metallic = 1;
    m.roughness = 1;
    m.invertNormalMapY = false;
    m.forceIrradianceInFragment = true;
    m.environmentIntensity = o.envIntensity === undefined ? this.envIntensity : o.envIntensity;
    m.directIntensity = o.directIntensity === undefined ? 1 : o.directIntensity;
    m.specularIntensity = o.specularIntensity === undefined ? 1 : o.specularIntensity;
    m.albedoColor = o.tint ? new Color3(o.tint[0], o.tint[1], o.tint[2]) : new Color3(1, 1, 1);
    m.maxSimultaneousLights = o.maxLights === undefined ? 6 : o.maxLights;
    m.backFaceCulling = o.doubleSided ? false : true;
    if (o.doubleSided) m.twoSidedLighting = true;
    m.ambientColor = new Color3(1, 1, 1);

    if (o.detail !== false) {
      // One shared texture instance per tiling scale: Babylon takes uScale from
      // the texture, so materials that want different detail densities need
      // their own view of it.
      const scale = o.detailScale === undefined ? 9 : o.detailScale;
      m.detailMap.isEnabled = true;
      m.detailMap.texture = this.detailAt(scale);
      m.detailMap.diffuseBlendLevel = o.detailAlbedo === undefined ? 0.12 : o.detailAlbedo;
      m.detailMap.bumpLevel = o.detailBump === undefined ? 0.75 : o.detailBump;
      m.detailMap.roughnessBlendLevel = o.detailRough === undefined ? 0.2 : o.detailRough;
    }

    if (o.parallax) {
      m.useParallax = true;
      m.useParallaxOcclusion = true;
      m.parallaxScaleBias = o.parallaxScale === undefined ? 0.035 : o.parallaxScale;
    }

    m.freeze();
    this.cache.set(key, m);
    return m;
  }

  stone(variant = "limestone", opts = {}) {
    const key = "mat_stone_" + variant + (opts.key || "");
    const hit = this.cache.get(key);
    if (hit) return hit;
    let maps;
    if (variant === "sandstone") maps = sandstone(this.scene, opts.size || 512, opts.seed || 23);
    else if (variant === "blackstone") maps = blackstone(this.scene, opts.size || 512, opts.seed || 31);
    else maps = limestone(this.scene, opts.size || 512, opts.seed || 11, opts);
    return this.fromMaps(key, maps, {
      envIntensity: opts.envIntensity,
      detailScale: opts.detailScale === undefined ? 11 : opts.detailScale,
      detailBump: 0.9,
      parallax: opts.parallax,
      tint: opts.tint,
    });
  }

  bronze(opts = {}) {
    const key = "mat_bronze" + (opts.key || "");
    const hit = this.cache.get(key);
    if (hit) return hit;
    const maps = bronze(this.scene, opts.size || 1024, opts.seed || 71, opts);
    return this.fromMaps(key, maps, {
      envIntensity: opts.envIntensity === undefined ? 0.9 : opts.envIntensity,
      detailScale: 16, detailBump: 0.35, detailAlbedo: 0.05, detailRough: 0.12,
      tint: opts.tint,
    });
  }

  brass(opts = {}) {
    const key = "mat_brass" + (opts.key || "");
    const hit = this.cache.get(key);
    if (hit) return hit;
    const maps = brass(this.scene, opts.size || 512, opts.seed || 83);
    return this.fromMaps(key, maps, { envIntensity: 0.9, detailScale: 18, detailBump: 0.3 });
  }

  wood(opts = {}) {
    const key = "mat_wood" + (opts.key || "");
    const hit = this.cache.get(key);
    if (hit) return hit;
    const maps = darkwood(this.scene, opts.size || 512, opts.seed || 97);
    return this.fromMaps(key, maps, { envIntensity: 0.4, detailScale: 14, detailBump: 0.4 });
  }

  plaster(opts = {}) {
    const key = "mat_plaster" + (opts.key || "");
    const hit = this.cache.get(key);
    if (hit) return hit;
    const maps = plaster(this.scene, opts.size || 512, opts.seed || 103, opts);
    return this.fromMaps(key, maps, { envIntensity: 0.5, detailScale: 12, detailBump: 0.5 });
  }

  cloth(opts = {}) {
    const key = "mat_cloth" + (opts.key || "");
    const hit = this.cache.get(key);
    if (hit) return hit;
    const maps = cloth(this.scene, opts.size || 512, opts.seed || 131, opts);
    const m = this.fromMaps(key, maps, {
      envIntensity: 0.5, detail: false, doubleSided: true,
    });
    m.unfreeze();
    // Cloth needs a sheen response or it reads as painted rubber.
    m.sheen.isEnabled = true;
    m.sheen.intensity = opts.sheen === undefined ? 0.55 : opts.sheen;
    m.sheen.color = new Color3(0.62, 0.66, 0.78);
    m.sheen.roughness = 0.5;
    m.freeze();
    return m;
  }

  parchment(opts = {}) {
    const key = "mat_parchment" + (opts.key || "");
    const hit = this.cache.get(key);
    if (hit) return hit;
    const maps = parchment(this.scene, opts.size || 1024, opts.seed || 149, opts);
    return this.fromMaps(key, maps, { envIntensity: 0.6, detail: false, doubleSided: true });
  }

  gravel(opts = {}) {
    const key = "mat_gravel" + (opts.key || "");
    const hit = this.cache.get(key);
    if (hit) return hit;
    const maps = gravel(this.scene, opts.size || 512, opts.seed || 167);
    return this.fromMaps(key, maps, { envIntensity: 0.45, detailScale: 10, detailBump: 0.8 });
  }

  /** Plain emissive material used by magical geometry and light sources. */
  emissive(key, color, intensity = 1) {
    const k = "mat_emis_" + key;
    const hit = this.cache.get(k);
    if (hit) return hit;
    const m = new PBRMaterial(k, this.scene);
    m.albedoColor = new Color3(0, 0, 0);
    m.metallic = 0; m.roughness = 1;
    m.emissiveColor = new Color3(color[0] * intensity, color[1] * intensity, color[2] * intensity);
    m.disableLighting = true;
    m.backFaceCulling = false;
    this.cache.set(k, m);
    return m;
  }
}

export { RawTexture };
