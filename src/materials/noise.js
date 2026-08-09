/**
 * Tileable procedural noise.
 *
 * Every function here is *periodic*: lattice coordinates wrap on an integer
 * period so a texture generated over u,v in [0,1) tiles seamlessly. That matters
 * a great deal for architecture — a visible repeat seam on a 30 m wall reads as
 * "asset flip" immediately.
 *
 * These run at load time only (never per frame), so clarity beats micro-tuning.
 */

/* ---------------------------------------------------------------- hashing */

function hash2i(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function hash3i(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 1442695040 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function wrap(i, p) { return ((i % p) + p) % p; }

const quintic = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/* ------------------------------------------------------------ value noise */

/** Periodic value noise. `p` = lattice period in cells. */
export function value2(x, y, p, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = wrap(xi, p), y0 = wrap(yi, p);
  const x1 = wrap(xi + 1, p), y1 = wrap(yi + 1, p);
  const u = quintic(xf), v = quintic(yf);
  const a = hash2i(x0, y0, seed), b = hash2i(x1, y0, seed);
  const c = hash2i(x0, y1, seed), d = hash2i(x1, y1, seed);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

/* --------------------------------------------------------- gradient noise */

/*
 * Gradient lookup. Computing cos/sin per lattice corner made texture baking the
 * slowest part of the load: eight transcendentals per noise sample, twenty
 * samples per texel, half a million texels. A 256-entry table of unit vectors
 * gives identical-looking noise for a fraction of the cost.
 */
const GRAD_N = 256;
const GRAD_X = new Float32Array(GRAD_N);
const GRAD_Y = new Float32Array(GRAD_N);
for (let i = 0; i < GRAD_N; i++) {
  const a = (i / GRAD_N) * Math.PI * 2;
  GRAD_X[i] = Math.cos(a);
  GRAD_Y[i] = Math.sin(a);
}

/** Periodic Perlin-style gradient noise, output roughly in [-1,1]. */
export function perlin2(x, y, p, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = wrap(xi, p), y0 = wrap(yi, p);
  const x1 = wrap(xi + 1, p), y1 = wrap(yi + 1, p);

  const g = (gx, gy, dx, dy) => {
    const i = (hash2i(gx, gy, seed) * GRAD_N) | 0;
    return GRAD_X[i] * dx + GRAD_Y[i] * dy;
  };

  const u = quintic(xf), v = quintic(yf);
  const n00 = g(x0, y0, xf, yf);
  const n10 = g(x1, y0, xf - 1, yf);
  const n01 = g(x0, y1, xf, yf - 1);
  const n11 = g(x1, y1, xf - 1, yf - 1);
  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return (nx0 + (nx1 - nx0) * v) * 1.4;
}

/** Multi-octave periodic gradient noise in [0,1]. */
export function fbm2(x, y, period, octaves, seed, gain = 0.5, lacunarity = 2) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += perlin2(x * freq, y * freq, Math.max(1, Math.round(period * freq)), seed + o * 131) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm * 0.5 + 0.5;
}

/** Ridged multifractal — the useful one for cracks, erosion and rock strata. */
export function ridged2(x, y, period, octaves, seed, gain = 0.5, lacunarity = 2.07) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(perlin2(x * freq, y * freq, Math.max(1, Math.round(period * freq)), seed + o * 977));
    sum += n * n * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Billowy noise — rounded lumps, good for plaster and dust accumulation. */
export function billow2(x, y, period, octaves, seed, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += Math.abs(perlin2(x * freq, y * freq, Math.max(1, Math.round(period * freq)), seed + o * 613)) * amp;
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / norm;
}

/* ------------------------------------------------------------- cellular */

const _cell = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };

/**
 * Periodic Worley/cellular noise. Returns a shared result object — read the
 * fields immediately, do not retain it.
 * @param {number} jitter 0 = perfect grid, 1 = fully random feature points
 */
export function worley2(x, y, p, seed, jitter = 1) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 1e9, f2 = 1e9, id = 0, bx = 0, by = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy;
      const wx = wrap(cx, p), wy = wrap(cy, p);
      const px = cx + 0.5 + (hash2i(wx, wy, seed) - 0.5) * jitter;
      const py = cy + 0.5 + (hash2i(wx, wy, seed + 7919) - 0.5) * jitter;
      const ddx = px - x, ddy = py - y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < f1) { f2 = f1; f1 = d; id = hash2i(wx, wy, seed + 104729); bx = wx; by = wy; }
      else if (d < f2) f2 = d;
    }
  }
  _cell.f1 = f1; _cell.f2 = f2; _cell.id = id; _cell.cx = bx; _cell.cy = by;
  return _cell;
}

/** Distance to the nearest cell *border* — the basis of every crack pattern. */
export function cellEdge(x, y, p, seed, jitter = 1) {
  const c = worley2(x, y, p, seed, jitter);
  return c.f2 - c.f1;
}

/* ---------------------------------------------------------------- domain */

/** Domain-warped fbm: the single cheapest way to stop noise looking like noise. */
export function warpedFbm2(x, y, period, octaves, seed, warp = 0.6) {
  const wx = fbm2(x + 5.2, y + 1.3, period, 3, seed + 41) - 0.5;
  const wy = fbm2(x + 1.7, y + 9.2, period, 3, seed + 97) - 0.5;
  return fbm2(x + wx * warp, y + wy * warp, period, octaves, seed);
}

export { hash2i, hash3i };

/* ------------------------------------------------------------- utilities */

export function smoothstepf(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
}

export function mix(a, b, t) { return a + (b - a) * t; }
export function clamp01f(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/**
 * Derive a tangent-space normal map from a height field.
 * @param {Float32Array} height
 * @param {Uint8Array} out RGBA destination
 * @param {number} size
 * @param {number} strength
 */
export function heightToNormal(height, out, size, strength) {
  const s = size;
  for (let y = 0; y < s; y++) {
    const yp = ((y - 1) + s) % s, yn = (y + 1) % s;
    for (let x = 0; x < s; x++) {
      const xp = ((x - 1) + s) % s, xn = (x + 1) % s;
      // Sobel gives noticeably calmer normals than central difference on noise.
      const h00 = height[yp * s + xp], h10 = height[yp * s + x], h20 = height[yp * s + xn];
      const h01 = height[y * s + xp], h21 = height[y * s + xn];
      const h02 = height[yn * s + xp], h12 = height[yn * s + x], h22 = height[yn * s + xn];
      const dx = (h20 + 2 * h21 + h22) - (h00 + 2 * h01 + h02);
      const dy = (h02 + 2 * h12 + h22) - (h00 + 2 * h10 + h20);
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inv; ny *= inv; nz *= inv;
      const i = (y * s + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
}

/**
 * Cheap ambient occlusion from a height field: compare each texel against a
 * blurred version of itself. Concave areas darken, which is exactly what makes
 * carved detail read at a distance.
 */
export function heightToAO(height, size, radius, strength, out) {
  const s = size;
  const blur = new Float32Array(s * s);
  const r = Math.max(1, radius | 0);
  // separable box blur, wrapping
  const tmp = new Float32Array(s * s);
  const inv = 1 / (r * 2 + 1);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += height[y * s + ((x + k + s) % s)];
      tmp[y * s + x] = sum * inv;
    }
  }
  for (let x = 0; x < s; x++) {
    for (let y = 0; y < s; y++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[((y + k + s) % s) * s + x];
      blur[y * s + x] = sum * inv;
    }
  }
  for (let i = 0; i < s * s; i++) {
    const d = height[i] - blur[i];
    out[i] = clamp01f(1 + d * strength);
  }
  return out;
}
