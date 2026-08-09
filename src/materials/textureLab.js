/**
 * Procedural texture bakery.
 *
 * Every surface in the temple is generated here at load time. Each material
 * produces three maps:
 *
 *   albedo   RGBA8, sRGB
 *   normal   RGBA8, linear, derived from the material's own height field
 *   ORM      RGBA8, linear — R ambient occlusion, G roughness, B metallic
 *
 * The height field is the spine of the whole thing: normals, cavity AO and most
 * roughness variation are all derived from it, so carving, cracks and pores stay
 * physically consistent with each other instead of being three unrelated noises.
 *
 * A generator may also draw *vector* linework into the height and ink layers via
 * a 2D canvas. That is how engraved scales, inscriptions and diagrams get their
 * millimetre-precise edges — noise cannot make a crisp line, and the contrast
 * between monumental stone and hair-thin engraving is the temple's whole visual
 * thesis (§4).
 */
import { RawTexture, Texture, Constants } from "../core/bjs.js";
import {
  fbm2, ridged2, billow2, warpedFbm2, worley2, cellEdge, perlin2,
  heightToNormal, heightToAO, smoothstepf, mix, clamp01f, hash2i,
} from "./noise.js";

/** @type {Map<string, {albedo:RawTexture, normal:RawTexture, orm:RawTexture, size:number}>} */
const cache = new Map();

/** Convert a linear channel to sRGB for storage in the albedo map. */
function toSRGB(c) {
  c = clamp01f(c);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/**
 * @typedef {Object} BakeCtx
 * @property {number} h   height, roughly [0,1]
 * @property {number} r   albedo red (linear)
 * @property {number} g   albedo green
 * @property {number} b   albedo blue
 * @property {number} rough
 * @property {number} metal
 */

/**
 * Bake one material.
 * @param {import("../core/bjs.js").Scene} scene
 * @param {Object} opt
 * @param {string} opt.name
 * @param {number} opt.size
 * @param {(u:number,v:number,c:BakeCtx)=>void} opt.shade per-texel generator
 * @param {(ctx:CanvasRenderingContext2D,size:number)=>void} [opt.engrave] vector height detail; mid grey = flat
 * @param {(ctx:CanvasRenderingContext2D,size:number)=>void} [opt.ink] vector albedo detail, drawn with alpha
 * @param {number} [opt.normalStrength]
 * @param {number} [opt.aoRadius]
 * @param {number} [opt.aoStrength]
 * @param {number} [opt.engraveDepth]
 */
export function bakeMaterial(scene, opt) {
  const key = opt.name + "|" + opt.size;
  const hit = cache.get(key);
  if (hit) return hit;

  const s = opt.size;
  const n = s * s;
  const height = new Float32Array(n);
  const albedo = new Uint8Array(n * 4);
  const normal = new Uint8Array(n * 4);
  const orm = new Uint8Array(n * 4);
  const ao = new Float32Array(n);
  const rough = new Float32Array(n);
  const metal = new Float32Array(n);

  const c = { h: 0.5, r: 0.5, g: 0.5, b: 0.5, rough: 0.7, metal: 0 };
  const inv = 1 / s;

  for (let y = 0; y < s; y++) {
    const v = (y + 0.5) * inv;
    for (let x = 0; x < s; x++) {
      const u = (x + 0.5) * inv;
      c.h = 0.5; c.r = 0.5; c.g = 0.5; c.b = 0.5; c.rough = 0.7; c.metal = 0;
      opt.shade(u, v, c);
      const i = y * s + x;
      height[i] = c.h;
      rough[i] = c.rough;
      metal[i] = c.metal;
      const j = i * 4;
      albedo[j] = toSRGB(c.r) * 255;
      albedo[j + 1] = toSRGB(c.g) * 255;
      albedo[j + 2] = toSRGB(c.b) * 255;
      albedo[j + 3] = 255;
    }
  }

  // --- vector layers ------------------------------------------------------
  if (opt.engrave) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const g2 = cv.getContext("2d", { willReadFrequently: true });
    g2.fillStyle = "#808080";
    g2.fillRect(0, 0, s, s);
    g2.lineCap = "butt";
    g2.lineJoin = "miter";
    opt.engrave(g2, s);
    const data = g2.getImageData(0, 0, s, s).data;
    const depth = opt.engraveDepth === undefined ? 0.16 : opt.engraveDepth;
    for (let i = 0; i < n; i++) {
      const d = (data[i * 4] / 255 - 0.5) * 2; // -1 carved .. +1 raised
      height[i] += d * depth;
      if (d < -0.02) {
        // Engraved recesses hold dirt and oxide: darker and rougher.
        const k = Math.min(1, -d * 1.35);
        const j = i * 4;
        albedo[j] *= 1 - 0.55 * k;
        albedo[j + 1] *= 1 - 0.55 * k;
        albedo[j + 2] *= 1 - 0.52 * k;
        rough[i] = mix(rough[i], 0.86, k * 0.8);
        metal[i] *= 1 - 0.35 * k;
      } else if (d > 0.02) {
        rough[i] = mix(rough[i], rough[i] * 0.72, Math.min(1, d));
      }
    }
  }

  if (opt.ink) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const g2 = cv.getContext("2d", { willReadFrequently: true });
    g2.clearRect(0, 0, s, s);
    opt.ink(g2, s);
    const data = g2.getImageData(0, 0, s, s).data;
    for (let i = 0; i < n; i++) {
      const a = data[i * 4 + 3] / 255;
      if (a <= 0.002) continue;
      const j = i * 4;
      albedo[j] = mix(albedo[j], data[j], a);
      albedo[j + 1] = mix(albedo[j + 1], data[j + 1], a);
      albedo[j + 2] = mix(albedo[j + 2], data[j + 2], a);
    }
  }

  // --- derived maps -------------------------------------------------------
  heightToNormal(height, normal, s, opt.normalStrength === undefined ? 6 : opt.normalStrength);
  // Height rides in the normal map's alpha so parallax needs no extra texture.
  let hMin = Infinity, hMax = -Infinity;
  for (let i = 0; i < n; i++) { if (height[i] < hMin) hMin = height[i]; if (height[i] > hMax) hMax = height[i]; }
  const hRange = hMax - hMin || 1;
  for (let i = 0; i < n; i++) normal[i * 4 + 3] = ((height[i] - hMin) / hRange) * 255;
  heightToAO(height, s, opt.aoRadius === undefined ? 5 : opt.aoRadius, opt.aoStrength === undefined ? 2.2 : opt.aoStrength, ao);

  for (let i = 0; i < n; i++) {
    const j = i * 4;
    orm[j] = clamp01f(ao[i]) * 255;
    orm[j + 1] = clamp01f(rough[i]) * 255;
    orm[j + 2] = clamp01f(metal[i]) * 255;
    orm[j + 3] = 255;
  }

  const texA = RawTexture.CreateRGBATexture(albedo, s, s, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  texA.name = opt.name + "_alb";
  texA.wrapU = texA.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
  texA.anisotropicFilteringLevel = 8;

  const texN = RawTexture.CreateRGBATexture(normal, s, s, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  texN.name = opt.name + "_nrm";
  texN.gammaSpace = false;
  texN.wrapU = texN.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
  texN.anisotropicFilteringLevel = 8;

  const texO = RawTexture.CreateRGBATexture(orm, s, s, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  texO.name = opt.name + "_orm";
  texO.gammaSpace = false;
  texO.wrapU = texO.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
  texO.anisotropicFilteringLevel = 8;

  const out = { albedo: texA, normal: texN, orm: texO, size: s };
  cache.set(key, out);
  return out;
}

export function clearTextureCache() { cache.clear(); }

/* ====================================================================== */
/*  Surface generators                                                     */
/* ====================================================================== */

/**
 * Pale limestone — the temple's dominant material.
 * Three scales, as required: block-scale subsidence and erosion, chisel-scale
 * tooling and seams, pore-scale grain.
 */
export function limestone(scene, size = 512, seed = 11, opts = {}) {
  const warm = opts.warm === undefined ? 0 : opts.warm;
  const wear = opts.wear === undefined ? 1 : opts.wear;
  const name = "limestone_" + seed + "_" + warm.toFixed(2) + "_" + wear.toFixed(2);
  return bakeMaterial(scene, {
    name, size,
    normalStrength: 5.2, aoRadius: 6, aoStrength: 2.6,
    shade(u, v, c) {
      const x = u * 6, y = v * 6;

      // macro — slow undulation, erosion hollows
      const macro = warpedFbm2(x * 0.5, y * 0.5, 3, 4, seed, 0.7);
      const erosion = ridged2(x * 0.9, y * 0.9, 6, 4, seed + 31);

      // medium — chisel tooling; the builders dressed these faces by hand
      const chisel = Math.abs(perlin2(x * 7.1 + y * 1.4, y * 3.2, 42, seed + 77));
      const tooling = smoothstepf(0.02, 0.42, chisel);

      // cracks — cell borders, thin and sharp
      const crackRaw = cellEdge(x * 1.6, y * 1.6, 10, seed + 5, 0.95);
      const crack = 1 - smoothstepf(0.0, 0.055, crackRaw);

      // micro — pores and grain
      const pores = worley2(x * 26, y * 26, 156, seed + 9, 1).f1;
      const poreMask = 1 - smoothstepf(0.08, 0.42, pores);
      const grain = fbm2(x * 34, y * 34, 204, 3, seed + 3);

      let h = 0.5
        + (macro - 0.5) * 0.55
        + (erosion - 0.5) * 0.22 * wear
        + (tooling - 0.5) * 0.055
        - crack * 0.30 * wear
        - poreMask * 0.075
        + (grain - 0.5) * 0.035;

      // mineral staining runs downward with gravity
      const stain = clamp01f(fbm2(x * 1.1, y * 2.6 + macro * 0.9, 8, 4, seed + 61) * 1.25 - 0.34);
      // pale calcite bloom on some blocks
      const bloom = smoothstepf(0.56, 0.78, fbm2(x * 0.8, y * 0.8, 5, 3, seed + 141));

      let base = 0.60 + (macro - 0.5) * 0.14 + (grain - 0.5) * 0.07;
      let r = base * (1 + 0.055 * warm);
      let g = base * (1 - 0.005 + 0.01 * warm);
      let b = base * (1 - 0.10 - 0.06 * warm);

      // staining: warm ochre, darker
      r = mix(r, r * 0.66 + 0.05, stain * 0.85 * wear);
      g = mix(g, g * 0.60 + 0.035, stain * 0.85 * wear);
      b = mix(b, b * 0.50 + 0.02, stain * 0.9 * wear);

      // bloom lifts and desaturates
      r = mix(r, 0.74, bloom * 0.32); g = mix(g, 0.73, bloom * 0.32); b = mix(b, 0.70, bloom * 0.30);

      // cracks and pores go dark
      const dark = clamp01f(crack * 0.85 + poreMask * 0.5);
      r *= 1 - dark * 0.55; g *= 1 - dark * 0.56; b *= 1 - dark * 0.55;

      c.h = h;
      c.r = r; c.g = g; c.b = b;
      c.rough = clamp01f(0.62 + (1 - tooling) * 0.14 + stain * 0.12 + poreMask * 0.16 - bloom * 0.06);
      c.metal = 0;
    },
  });
}

/** Warm sandstone: the exterior terraces and the approach. */
export function sandstone(scene, size = 512, seed = 23) {
  return bakeMaterial(scene, {
    name: "sandstone_" + seed, size,
    normalStrength: 5.8, aoRadius: 6, aoStrength: 2.4,
    shade(u, v, c) {
      const x = u * 6, y = v * 6;
      // bedding planes — sandstone is laid down in strata
      const strata = Math.sin((v * 6 + fbm2(x * 0.7, y * 0.7, 5, 3, seed) * 1.7) * 9.3) * 0.5 + 0.5;
      const macro = warpedFbm2(x * 0.6, y * 0.6, 4, 4, seed + 12, 0.8);
      const erosion = ridged2(x * 1.4, y * 1.1, 8, 5, seed + 44);
      const grit = worley2(x * 30, y * 30, 180, seed + 6, 1).f1;
      const gritMask = 1 - smoothstepf(0.05, 0.36, grit);

      const h = 0.5 + (macro - 0.5) * 0.5 + (erosion - 0.5) * 0.3 + (strata - 0.5) * 0.09 - gritMask * 0.09;
      const t = macro * 0.6 + strata * 0.4;
      let r = mix(0.52, 0.66, t), g = mix(0.40, 0.53, t), b = mix(0.30, 0.40, t);
      const dust = smoothstepf(0.4, 0.85, fbm2(x * 2.2, y * 2.2, 13, 3, seed + 88));
      r = mix(r, 0.60, dust * 0.35); g = mix(g, 0.55, dust * 0.35); b = mix(b, 0.47, dust * 0.35);
      c.h = h; c.r = r; c.g = g; c.b = b;
      c.rough = clamp01f(0.74 + gritMask * 0.14 - dust * 0.05);
      c.metal = 0;
    },
  });
}

/** Dark basalt-like stone, used for meridian lines, thresholds and instrument beds. */
export function blackstone(scene, size = 512, seed = 31) {
  return bakeMaterial(scene, {
    name: "blackstone_" + seed, size,
    normalStrength: 4.0, aoRadius: 4, aoStrength: 2.0,
    shade(u, v, c) {
      const x = u * 6, y = v * 6;
      const macro = warpedFbm2(x * 0.7, y * 0.7, 4, 4, seed, 0.5);
      const vesicles = worley2(x * 18, y * 18, 108, seed + 4, 1).f1;
      const ves = 1 - smoothstepf(0.02, 0.30, vesicles);
      const polish = smoothstepf(0.35, 0.72, fbm2(x * 0.9, y * 0.9, 6, 3, seed + 21));
      const scratch = Math.abs(perlin2(x * 40 + y * 6, y * 2.5, 240, seed + 55));
      const scr = 1 - smoothstepf(0.0, 0.12, scratch);

      const h = 0.5 + (macro - 0.5) * 0.30 - ves * 0.16 + scr * 0.012;
      const base = 0.052 + macro * 0.038 + (1 - polish) * 0.012;
      c.h = h;
      c.r = base * 1.02; c.g = base; c.b = base * 1.12;
      c.rough = clamp01f(mix(0.66, 0.24, polish) + ves * 0.30 - scr * 0.10);
      c.metal = 0;
    },
  });
}

/**
 * Aged bronze — the instrument metal.
 * Tarnish is not painted on top of metal; where the patina has taken hold the
 * surface stops being metallic at all, which is what stops bronze reading as
 * yellow plastic.
 */
export function bronze(scene, size = 1024, seed = 71, opts = {}) {
  const polishAmount = opts.polish === undefined ? 0.35 : opts.polish;
  const tarnishAmount = opts.tarnish === undefined ? 1 : opts.tarnish;
  const engrave = opts.engrave;
  const name = "bronze_" + seed + "_" + polishAmount.toFixed(2) + "_" + tarnishAmount.toFixed(2) + (engrave ? "_e" + (opts.engraveKey || "1") : "");
  return bakeMaterial(scene, {
    name, size, engrave,
    engraveDepth: opts.engraveDepth === undefined ? 0.22 : opts.engraveDepth,
    normalStrength: 4.6, aoRadius: 4, aoStrength: 2.4,
    shade(u, v, c) {
      const x = u * 4, y = v * 4;

      // Casting and hammering leave a slow undulation.
      const cast = warpedFbm2(x * 0.8, y * 0.8, 3, 4, seed, 0.5);
      // Fine circumferential turning marks from the lathe.
      const turning = Math.abs(perlin2(x * 3.0, y * 90, 360, seed + 17));
      const turn = smoothstepf(0.0, 0.5, turning);
      // Patina in patches, heavier in one direction (moisture ran downward).
      const patina = clamp01f(
        warpedFbm2(x * 1.6, y * 1.6 + 0.4, 8, 4, seed + 5, 0.9) * 1.25 - 0.32 + cast * 0.18
      ) * tarnishAmount;
      // Contact polishing: broad bands where hands and gearing have worn it bright.
      const contact = smoothstepf(0.45, 0.85, fbm2(x * 1.1 + 3.3, y * 0.9, 6, 3, seed + 33)) * polishAmount;
      // Scratches
      const sc = Math.abs(perlin2(x * 55 + y * 12, y * 3.5, 330, seed + 91));
      const scratch = (1 - smoothstepf(0.0, 0.09, sc)) * (1 - patina * 0.7);

      const pat = clamp01f(patina - contact * 0.9);
      const h = 0.5 + (cast - 0.5) * 0.34 + (turn - 0.5) * 0.03 + pat * 0.05 - scratch * 0.02;

      // Metal reflectance colour vs. patina body colour
      const mr = 0.735, mg = 0.492, mb = 0.246;         // bronze F0
      const pr = 0.150, pg = 0.235, pb = 0.196;         // verdigris
      const dr = 0.088, dg = 0.079, db = 0.062;         // dark oxide
      const heavy = smoothstepf(0.55, 0.95, pat);
      let r = mix(mr, mix(dr, pr, heavy), pat);
      let g = mix(mg, mix(dg, pg, heavy), pat);
      let b = mix(mb, mix(db, pb, heavy), pat);
      // Bright contact areas warm up and lighten
      r = mix(r, 0.86, contact * 0.35); g = mix(g, 0.62, contact * 0.33); b = mix(b, 0.32, contact * 0.3);

      c.h = h;
      c.r = r; c.g = g; c.b = b;
      c.metal = clamp01f(1 - pat * 0.92);
      c.rough = clamp01f(
        mix(0.34, 0.78, pat)          // patina is rough
        - contact * 0.22              // handled areas are smooth
        + (1 - turn) * 0.10           // turning marks scatter
        - scratch * 0.12
        + (cast - 0.5) * 0.06
      );
    },
  });
}

/** Tarnished brass — warmer and yellower than bronze, used for fine fittings. */
export function brass(scene, size = 512, seed = 83) {
  return bakeMaterial(scene, {
    name: "brass_" + seed, size,
    normalStrength: 4.0, aoRadius: 3, aoStrength: 2.0,
    shade(u, v, c) {
      const x = u * 4, y = v * 4;
      const cast = warpedFbm2(x * 0.9, y * 0.9, 4, 4, seed, 0.5);
      const tarnish = clamp01f(warpedFbm2(x * 2.1, y * 2.1, 10, 4, seed + 7, 0.8) * 1.3 - 0.42);
      const sc = Math.abs(perlin2(x * 60 + y * 9, y * 4, 360, seed + 13));
      const scratch = 1 - smoothstepf(0.0, 0.08, sc);
      c.h = 0.5 + (cast - 0.5) * 0.28 + tarnish * 0.04 - scratch * 0.02;
      const mr = 0.83, mg = 0.66, mb = 0.30;
      const tr = 0.26, tg = 0.20, tb = 0.11;
      c.r = mix(mr, tr, tarnish); c.g = mix(mg, tg, tarnish); c.b = mix(mb, tb, tarnish);
      c.metal = clamp01f(1 - tarnish * 0.75);
      c.rough = clamp01f(mix(0.28, 0.7, tarnish) - scratch * 0.1);
    },
  });
}

/** Old dark wood — instrument frames, ladders, shelving, the Book's boards. */
export function darkwood(scene, size = 512, seed = 97) {
  return bakeMaterial(scene, {
    name: "darkwood_" + seed, size,
    normalStrength: 3.4, aoRadius: 4, aoStrength: 1.9,
    shade(u, v, c) {
      const x = u * 4, y = v * 4;
      // Growth rings: distorted concentric bands along one axis.
      const warpx = fbm2(x * 0.8, y * 0.8, 5, 3, seed) * 1.6;
      const rings = Math.sin((x * 5.5 + warpx) * 6.283) * 0.5 + 0.5;
      const ringSharp = Math.pow(rings, 1.6);
      const fibre = fbm2(x * 3, y * 60, 240, 3, seed + 21);
      const knotC = worley2(x * 1.2, y * 1.2, 8, seed + 44, 1);
      const knot = 1 - smoothstepf(0.02, 0.22, knotC.f1);

      const h = 0.5 + (ringSharp - 0.5) * 0.20 + (fibre - 0.5) * 0.10 - knot * 0.22;
      let t = ringSharp * 0.7 + fibre * 0.3;
      let r = mix(0.098, 0.185, t), g = mix(0.062, 0.115, t), b = mix(0.038, 0.062, t);
      r = mix(r, 0.045, knot); g = mix(g, 0.028, knot); b = mix(b, 0.018, knot);
      // Waxed sheen along the grain where hands have passed
      const wax = smoothstepf(0.45, 0.8, fbm2(x * 1.4, y * 1.2, 8, 3, seed + 66));
      c.h = h; c.r = r; c.g = g; c.b = b;
      c.metal = 0;
      c.rough = clamp01f(0.62 - wax * 0.22 + knot * 0.15 + (1 - ringSharp) * 0.08);
    },
  });
}

/** Cracked lime plaster with faded pigment — interior wall finish, mostly lost. */
export function plaster(scene, size = 512, seed = 103, opts = {}) {
  const pigment = opts.pigment || [0.13, 0.19, 0.36]; // lapis blue by default
  return bakeMaterial(scene, {
    name: "plaster_" + seed + "_" + pigment.join("_"), size,
    normalStrength: 5.0, aoRadius: 5, aoStrength: 2.8,
    shade(u, v, c) {
      const x = u * 6, y = v * 6;
      // Where the plaster survives at all.
      const survive = clamp01f(warpedFbm2(x * 0.7, y * 0.7, 4, 4, seed, 1.0) * 1.6 - 0.42);
      const edge = smoothstepf(0.0, 0.22, survive);
      const crack = 1 - smoothstepf(0.0, 0.035, cellEdge(x * 2.6, y * 2.6, 16, seed + 3, 0.9));
      const crackFine = 1 - smoothstepf(0.0, 0.02, cellEdge(x * 7, y * 7, 42, seed + 8, 0.9));
      const trowel = billow2(x * 3.4, y * 3.4, 20, 3, seed + 12);
      const grain = fbm2(x * 24, y * 24, 144, 3, seed + 19);

      const plasterH = 0.5 + (trowel - 0.5) * 0.12 + (grain - 0.5) * 0.05 - crack * 0.25 - crackFine * 0.10;
      const stoneH = 0.34 + (fbm2(x * 4, y * 4, 24, 4, seed + 31) - 0.5) * 0.3;
      const h = mix(stoneH, plasterH, edge);

      // pigment survives only in patches on surviving plaster
      const paint = clamp01f(fbm2(x * 1.2 + 2.1, y * 1.2, 7, 4, seed + 55) * 1.5 - 0.55) * edge;
      const white = 0.68 + (trowel - 0.5) * 0.10;
      let r = mix(0.30, white, edge), g = mix(0.285, white * 0.985, edge), b = mix(0.26, white * 0.93, edge);
      r = mix(r, pigment[0], paint * 0.82); g = mix(g, pigment[1], paint * 0.82); b = mix(b, pigment[2], paint * 0.82);
      const soot = clamp01f(fbm2(x * 0.9, y * 1.8, 6, 3, seed + 77) * 1.3 - 0.5);
      r *= 1 - soot * 0.35; g *= 1 - soot * 0.35; b *= 1 - soot * 0.33;
      const dark = clamp01f(crack * 0.8 + crackFine * 0.4) * edge;
      r *= 1 - dark * 0.5; g *= 1 - dark * 0.5; b *= 1 - dark * 0.48;

      c.h = h; c.r = r; c.g = g; c.b = b;
      c.metal = 0;
      c.rough = clamp01f(0.80 - paint * 0.06 + (1 - edge) * 0.08);
    },
  });
}

/**
 * Woven cloth for the protagonist's coat, mantle and scarf.
 * Weave is real geometry in the normal map, not a roughness pattern — that is
 * what gives cloth its sheen break-up under a moving lantern.
 */
export function cloth(scene, size = 512, seed = 131, opts = {}) {
  const base = opts.color || [0.055, 0.062, 0.085];
  const threads = opts.threads || 120;
  const wearAmount = opts.wear === undefined ? 1 : opts.wear;
  return bakeMaterial(scene, {
    name: "cloth_" + seed + "_" + base.join("_") + "_" + threads, size,
    normalStrength: 3.0, aoRadius: 2, aoStrength: 2.2,
    shade(u, v, c) {
      const tx = u * threads, ty = v * threads;
      // plain weave: warp over weft alternating per cell
      const cx = Math.floor(tx), cy = Math.floor(ty);
      const over = ((cx + cy) & 1) === 0;
      const fx = tx - cx, fy = ty - cy;
      const warp = Math.sin(fx * Math.PI);
      const weft = Math.sin(fy * Math.PI);
      const weave = over ? warp * 0.9 + weft * 0.3 : weft * 0.9 + warp * 0.3;

      const slub = fbm2(u * 40, v * 40, 240, 3, seed + 3);       // thread thickness variation
      const drape = warpedFbm2(u * 3, v * 3, 18, 4, seed + 9, 0.6);
      const wearMask = clamp01f(fbm2(u * 2.2, v * 2.2, 13, 4, seed + 27) * 1.4 - 0.55) * wearAmount;
      const dirt = clamp01f(fbm2(u * 1.4, v * 2.8, 9, 4, seed + 61) * 1.35 - 0.48) * wearAmount;

      const h = 0.5 + weave * 0.30 + (slub - 0.5) * 0.10 + (drape - 0.5) * 0.10 - wearMask * 0.06;
      const shade = 0.82 + weave * 0.16 + (slub - 0.5) * 0.14;
      let r = base[0] * shade, g = base[1] * shade, b = base[2] * shade;
      // wear exposes paler fibre; dirt is warm-grey
      r = mix(r, r * 1.9 + 0.05, wearMask * 0.6);
      g = mix(g, g * 1.9 + 0.05, wearMask * 0.6);
      b = mix(b, b * 1.85 + 0.045, wearMask * 0.6);
      r = mix(r, 0.115, dirt * 0.45); g = mix(g, 0.10, dirt * 0.45); b = mix(b, 0.082, dirt * 0.42);

      c.h = h; c.r = r; c.g = g; c.b = b;
      c.metal = 0;
      c.rough = clamp01f(0.86 - weave * 0.06 + dirt * 0.06 - wearMask * 0.04);
    },
  });
}

/**
 * Aged paper rendered straight into a 2D canvas, so the Book can draw ink on
 * top of the real paper rather than compositing two textures at runtime.
 * @returns {HTMLCanvasElement}
 */
export function parchmentCanvas(size = 1024, seed = 149) {
  const key = "parchcanvas_" + size + "_" + seed;
  if (canvasCache.has(key)) {
    // Return a fresh copy: callers draw on it.
    const src = canvasCache.get(key);
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    cv.getContext("2d").drawImage(src, 0, 0);
    return cv;
  }
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d");
  const img = g.createImageData(size, size);
  const d = img.data;
  const inv = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) * inv, v = (y + 0.5) * inv;
      const px = u * 4, py = v * 4;
      const fibre = fbm2(px * 26, py * 22, 130, 3, seed);
      const blotch = warpedFbm2(px * 1.3, py * 1.3, 8, 4, seed + 11, 0.7);
      const foxing = clamp01f(worley2(px * 5, py * 5, 30, seed + 21, 1).f1 * -2.2 + 1.0);
      const edge = smoothstepf(0.40, 0.5, Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)));
      let base = 0.80 + (blotch - 0.5) * 0.13 + (fibre - 0.5) * 0.055;
      let r = base, gg = base * 0.955, b = base * 0.845;
      r = mix(r, 0.56, foxing * 0.5); gg = mix(gg, 0.44, foxing * 0.5); b = mix(b, 0.30, foxing * 0.45);
      r = mix(r, r * 0.72, edge * 0.8); gg = mix(gg, gg * 0.70, edge * 0.8); b = mix(b, b * 0.66, edge * 0.8);
      const i = (y * size + x) * 4;
      d[i] = clamp01f(r) * 255; d[i + 1] = clamp01f(gg) * 255; d[i + 2] = clamp01f(b) * 255; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  canvasCache.set(key, cv);
  const copy = document.createElement("canvas");
  copy.width = copy.height = size;
  copy.getContext("2d").drawImage(cv, 0, 0);
  return copy;
}

/** @type {Map<string, HTMLCanvasElement>} */
const canvasCache = new Map();

/** Aged paper for the Book of Stars and the loose sheets in the Archive. */
export function parchment(scene, size = 1024, seed = 149, opts = {}) {
  return bakeMaterial(scene, {
    name: "parchment_" + seed + (opts.key ? "_" + opts.key : ""), size,
    ink: opts.ink, engrave: opts.engrave, engraveDepth: 0.05,
    normalStrength: 2.0, aoRadius: 3, aoStrength: 1.4,
    shade(u, v, c) {
      const x = u * 4, y = v * 4;
      const fibre = fbm2(x * 26, y * 22, 130, 3, seed);
      const blotch = warpedFbm2(x * 1.3, y * 1.3, 8, 4, seed + 11, 0.7);
      const foxing = clamp01f(worley2(x * 5, y * 5, 30, seed + 21, 1).f1 * -2.2 + 1.0);
      const edgeDark = smoothstepf(0.44, 0.5, Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)));
      const crease = 1 - smoothstepf(0.0, 0.03, cellEdge(x * 1.1, y * 1.1, 7, seed + 33, 0.85));

      const h = 0.5 + (fibre - 0.5) * 0.16 + (blotch - 0.5) * 0.12 - crease * 0.14;
      let base = 0.70 + (blotch - 0.5) * 0.14 + (fibre - 0.5) * 0.06;
      let r = base, g = base * 0.935, b = base * 0.795;
      // foxing: rust-coloured age spots
      r = mix(r, 0.44, foxing * 0.55); g = mix(g, 0.32, foxing * 0.55); b = mix(b, 0.19, foxing * 0.5);
      // handled edges darken
      r = mix(r, r * 0.6, edgeDark * 0.7); g = mix(g, g * 0.57, edgeDark * 0.7); b = mix(b, b * 0.52, edgeDark * 0.7);
      c.h = h; c.r = r; c.g = g; c.b = b;
      c.metal = 0;
      c.rough = clamp01f(0.88 - crease * 0.05);
    },
  });
}

/** Rubble, sand and grit for exterior ground and collapse debris. */
export function gravel(scene, size = 512, seed = 167) {
  return bakeMaterial(scene, {
    name: "gravel_" + seed, size,
    normalStrength: 7.0, aoRadius: 4, aoStrength: 3.0,
    shade(u, v, c) {
      const x = u * 6, y = v * 6;
      const big = worley2(x * 7, y * 7, 42, seed, 1);
      const small = worley2(x * 19, y * 19, 114, seed + 5, 1);
      const sand = fbm2(x * 40, y * 40, 240, 3, seed + 9);
      const dune = warpedFbm2(x * 0.7, y * 0.7, 4, 4, seed + 15, 0.9);

      const stoneMask = 1 - smoothstepf(0.10, 0.34, big.f1);
      const chipMask = 1 - smoothstepf(0.05, 0.22, small.f1);
      const h = 0.42 + stoneMask * 0.34 + chipMask * 0.14 + (sand - 0.5) * 0.06 + (dune - 0.5) * 0.2;

      const tone = 0.30 + big.id * 0.16 + (sand - 0.5) * 0.08 + dune * 0.10;
      let r = tone * 1.06, g = tone * 0.95, b = tone * 0.78;
      c.h = h; c.r = r; c.g = g; c.b = b;
      c.metal = 0;
      c.rough = clamp01f(0.85 + (sand - 0.5) * 0.1 - stoneMask * 0.08);
    },
  });
}

/**
 * Shared micro-detail map, packed the way Babylon's detail slot reads it:
 *   R = albedo detail (0.5 neutral)
 *   G = normal Y
 *   B = roughness detail (0.5 neutral)
 *   A = normal X
 *
 * Applied on top of every stone surface at a much finer tiling scale, this is
 * the pore/grain/scratch tier that holds up when the player's face is 30 cm
 * from a wall — the third of the three stone scales (§12).
 *
 * @returns {Texture}
 */
export function detailMap(scene, size = 512, seed = 181) {
  const key = "detailmap_" + size + "_" + seed;
  if (detailCache.has(key)) return detailCache.get(key);

  const n = size * size;
  const height = new Float32Array(n);
  const albedoD = new Float32Array(n);
  const roughD = new Float32Array(n);
  const inv = 1 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) * inv, v = (y + 0.5) * inv;
      const px = u * 8, py = v * 8;
      const pores = worley2(px * 14, py * 14, 112, seed, 1).f1;
      const poreMask = 1 - smoothstepf(0.04, 0.30, pores);
      const grain = fbm2(px * 30, py * 30, 240, 4, seed + 3);
      const scratch = 1 - smoothstepf(0.0, 0.06, Math.abs(perlin2(px * 33 + py * 7, py * 2, 264, seed + 11)));
      const i = y * size + x;
      height[i] = 0.5 + (grain - 0.5) * 0.5 - poreMask * 0.4 - scratch * 0.15;
      albedoD[i] = 0.5 + (grain - 0.5) * 0.22 - poreMask * 0.18;
      roughD[i] = clamp01f(0.5 + (grain - 0.5) * 0.28 + poreMask * 0.22 - scratch * 0.1);
    }
  }

  const nrm = new Uint8Array(n * 4);
  heightToNormal(height, nrm, size, 2.6);
  const packed = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    packed[i * 4 + 0] = albedoD[i] * 255;      // albedo detail
    packed[i * 4 + 1] = nrm[i * 4 + 1];        // normal Y
    packed[i * 4 + 2] = roughD[i] * 255;       // roughness detail
    packed[i * 4 + 3] = nrm[i * 4 + 0];        // normal X
  }
  const tex = RawTexture.CreateRGBATexture(packed, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  tex.name = key;
  tex.gammaSpace = false;
  tex.wrapU = tex.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;
  detailCache.set(key, tex);
  return tex;
}

/** @type {Map<string, Texture>} */
const detailCache = new Map();

export { hash2i };
