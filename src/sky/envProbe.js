/**
 * Procedural night-sky environment probe.
 *
 * Metal cannot look like metal without something to reflect. This bakes a small
 * HDR cube from the same sky model the dome shader uses — cold zenith, slightly
 * warmer horizon haze, a bright moon lobe, and a dark ground bounce — so bronze
 * picks up a real sky gradient and the moon leaves a genuine highlight on it.
 *
 * 32² per face is plenty: the probe only supplies low-frequency lighting, while
 * sharp reflections come from SSR.
 */
import { RawCubeTexture, Constants } from "../core/bjs.js";
import { DEG } from "../core/scratch.js";

/**
 * Radiance of the night sky in a direction. Shared by the probe and (in spirit)
 * by the dome shader, so ambient light and the visible sky never disagree.
 * @param {number} x @param {number} y @param {number} z unit direction
 * @param {number[]} moonDir unit vector toward the moon
 * @param {number} moonIntensity
 * @param {number[]} out
 */
export function skyRadiance(x, y, z, moonDir, moonIntensity, out) {
  const up = Math.max(-1, Math.min(1, y));
  // Zenith is deep blue-violet; the horizon lifts to a dusty grey-blue.
  const h = Math.pow(Math.max(0, 1 - Math.abs(up)), 3.2);
  let r = 0.0090 + h * 0.0170;
  let g = 0.0135 + h * 0.0205;
  let b = 0.0290 + h * 0.0290;

  // Moon glow: a broad forward-scattering lobe plus a tight aureole.
  const cosA = x * moonDir[0] + y * moonDir[1] + z * moonDir[2];
  if (cosA > 0) {
    const broad = Math.pow(cosA, 5) * 0.20;
    const tight = Math.pow(cosA, 220) * 2.6;
    const halo = Math.pow(cosA, 40) * 0.42;
    const m = (broad + tight + halo) * moonIntensity;
    r += m * 0.86; g += m * 0.92; b += m * 1.0;
  }

  // Ground: the temple sits on cold pale rock, which bounces a little back up.
  if (up < 0) {
    const k = Math.min(1, -up * 1.6);
    const gr = 0.0075 * moonIntensity;
    r = r * (1 - k) + gr * 1.06 * k;
    g = g * (1 - k) + gr * 1.0 * k;
    b = b * (1 - k) + gr * 0.86 * k;
  }

  out[0] = r; out[1] = g; out[2] = b;
}

/* IEEE-754 binary16 encoder for the probe's pixel data. */
const _f32 = new Float32Array(1);
const _u32 = new Uint32Array(_f32.buffer);
function toHalf(v) {
  _f32[0] = v;
  const x = _u32[0];
  const sign = (x >>> 16) & 0x8000;
  let exp = (x >>> 23) & 0xff;
  let man = x & 0x7fffff;
  if (exp === 0xff) return sign | 0x7c00 | (man ? 0x200 : 0);
  exp = exp - 127 + 15;
  if (exp >= 0x1f) return sign | 0x7bff;              // clamp to max half
  if (exp <= 0) {
    if (exp < -10) return sign;
    man = (man | 0x800000) >>> (1 - exp);
    return sign | (man >>> 13);
  }
  return sign | (exp << 10) | (man >>> 13);
}

/** Direction toward the moon from altitude/azimuth in degrees (+Z = north). */
export function altAzToDir(altDeg, azDeg, out) {
  const alt = altDeg * DEG, az = azDeg * DEG;
  const ca = Math.cos(alt);
  out[0] = ca * Math.sin(az);   // east
  out[1] = Math.sin(alt);       // up
  out[2] = ca * Math.cos(az);   // north
  return out;
}

/**
 * @param {import("../core/bjs.js").Scene} scene
 * @param {number[]} moonDir
 * @param {number} moonIntensity
 * @param {number} size
 */
export function bakeEnvProbe(scene, moonDir, moonIntensity, size = 32) {
  const faces = [];
  const rgb = [0, 0, 0];
  // Half float, not float: 16-bit is filterable everywhere, while linear
  // filtering of 32-bit float textures is an optional WebGPU feature and its
  // absence silently drops the probe to nearest sampling (visible as facets).
  // +X, -X, +Y, -Y, +Z, -Z
  for (let f = 0; f < 6; f++) {
    const data = new Uint16Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = ((x + 0.5) / size) * 2 - 1;
        const v = ((y + 0.5) / size) * 2 - 1;
        let dx, dy, dz;
        switch (f) {
          case 0: dx = 1; dy = -v; dz = -u; break;
          case 1: dx = -1; dy = -v; dz = u; break;
          case 2: dx = u; dy = 1; dz = v; break;
          case 3: dx = u; dy = -1; dz = -v; break;
          case 4: dx = u; dy = -v; dz = 1; break;
          default: dx = -u; dy = -v; dz = -1; break;
        }
        const l = Math.hypot(dx, dy, dz);
        skyRadiance(dx / l, dy / l, dz / l, moonDir, moonIntensity, rgb);
        const i = (y * size + x) * 4;
        data[i] = toHalf(rgb[0]); data[i + 1] = toHalf(rgb[1]); data[i + 2] = toHalf(rgb[2]); data[i + 3] = toHalf(1);
      }
    }
    faces.push(data);
  }
  const tex = new RawCubeTexture(scene, faces, size, Constants.TEXTUREFORMAT_RGBA,
    Constants.TEXTURETYPE_HALF_FLOAT, false, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
  tex.name = "envProbe";
  tex.gammaSpace = false;
  return tex;
}
