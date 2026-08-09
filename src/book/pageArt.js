/**
 * Drawing for the Book of Stars.
 *
 * Everything is drawn with a 2D canvas onto a parchment ground, because the
 * Book has to look *written* — variable line weight, ink that pools at the end
 * of a stroke, diagrams ruled with compasses, marginalia in a smaller and less
 * careful hand, and damage that removes information rather than greying it out.
 *
 * The temple counts in sixties. Its numerals are wedges and chevrons, and
 * learning to read them is part of learning the Book.
 */
import { makeRng } from "../core/scratch.js";
import { fbm2, smoothstepf, clamp01f } from "../materials/noise.js";

export const INK = "#241a10";
export const INK_FADED = "rgba(52,38,24,0.62)";
export const INK_RED = "#7a2f1e";
export const INK_BLUE = "#1e3358";

/** A slightly wavering line, as drawn by a hand with a reed pen. */
export function penLine(g, x0, y0, x1, y1, w = 1.6, rng = Math.random, wobble = 0.6) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(2, Math.floor(len / 9));
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(x0, y0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const nx = -dy / (len || 1), ny = dx / (len || 1);
    const off = (rng() - 0.5) * wobble * Math.sin(t * Math.PI);
    g.lineTo(x0 + dx * t + nx * off, y0 + dy * t + ny * off);
  }
  g.stroke();
  // Ink pools where the pen lifts.
  g.beginPath();
  g.arc(x1, y1, w * 0.55, 0, Math.PI * 2);
  g.fill();
}

/** A compass-drawn circle: closes imperfectly, thins where the nib lifted. */
export function penCircle(g, cx, cy, r, w = 1.4, rng = Math.random, gap = 0.04) {
  const start = rng() * Math.PI * 2;
  const steps = 96;
  g.lineWidth = w;
  g.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (t > 1 - gap) break;
    const a = start + t * Math.PI * 2;
    const rr = r * (1 + (rng() - 0.5) * 0.004);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
}

/* ------------------------------------------------------------------ */
/* Sexagesimal numerals                                                */
/* ------------------------------------------------------------------ */

/** A single wedge — the unit mark. */
function wedge(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y - s * 0.5);
  g.lineTo(x + s * 0.34, y + s * 0.5);
  g.lineTo(x - s * 0.34, y + s * 0.5);
  g.closePath();
  g.fill();
}

/** A chevron — ten. */
function chevron(g, x, y, s) {
  g.lineWidth = Math.max(1, s * 0.16);
  g.beginPath();
  g.moveTo(x - s * 0.42, y - s * 0.34);
  g.lineTo(x, y + s * 0.36);
  g.lineTo(x + s * 0.42, y - s * 0.34);
  g.stroke();
}

/**
 * Write a number in the temple's notation: chevrons for tens, wedges for units,
 * grouped in threes as the scribes did.
 * @returns {number} the width drawn
 */
export function numeral(g, n, x, y, s = 14) {
  n = Math.max(0, Math.round(n));
  const tens = Math.floor(n / 10), units = n % 10;
  let cx = x;
  for (let i = 0; i < tens; i++) {
    chevron(g, cx + s * 0.42, y, s);
    cx += s * (i % 3 === 2 ? 1.15 : 0.92);
  }
  if (tens && units) cx += s * 0.22;
  for (let i = 0; i < units; i++) {
    wedge(g, cx + s * 0.3, y, s * 0.86);
    cx += s * (i % 3 === 2 ? 0.86 : 0.62);
  }
  return cx - x;
}

/** Degrees and arcminutes in the temple's hand. */
export function angleGlyph(g, deg, x, y, s = 14) {
  const d = Math.floor(Math.abs(deg));
  const m = Math.round((Math.abs(deg) - d) * 60);
  let w = numeral(g, d, x, y, s);
  g.save();
  g.globalAlpha *= 0.75;
  g.beginPath();
  g.arc(x + w + s * 0.5, y - s * 0.32, s * 0.16, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  w += s * 1.1;
  w += numeral(g, m, x + w, y, s * 0.78);
  return w;
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

/**
 * Lay out a paragraph in the scribe's hand.
 * @returns {number} the y position after the last line
 */
export function scribe(g, text, x, y, maxWidth, opts = {}) {
  const size = opts.size || 21;
  const lh = opts.lineHeight || size * 1.62;
  g.save();
  g.fillStyle = opts.color || INK;
  g.font = `${opts.italic ? "italic " : ""}${size}px Georgia, "Times New Roman", serif`;
  g.textBaseline = "alphabetic";
  const words = text.split(/\s+/);
  let line = "", yy = y;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (g.measureText(test).width > maxWidth && line) {
      g.fillText(line, x, yy);
      line = words[i];
      yy += lh;
    } else line = test;
  }
  if (line) { g.fillText(line, x, yy); yy += lh; }
  g.restore();
  return yy;
}

/** A heading, in small capitals with a rule under it. */
export function heading(g, text, x, y, width, rng = Math.random) {
  g.save();
  g.fillStyle = INK;
  g.font = "26px Georgia, serif";
  const letters = text.toUpperCase().split("");
  let cx = x;
  for (const ch of letters) {
    g.fillText(ch, cx, y);
    cx += g.measureText(ch).width + 5.5;
  }
  g.strokeStyle = INK_FADED;
  penLine(g, x, y + 13, x + width, y + 13, 1.1, rng, 0.5);
  g.restore();
  return y + 40;
}

/* ------------------------------------------------------------------ */
/* Star charts                                                         */
/* ------------------------------------------------------------------ */

/**
 * A circular star chart, drawn stereographically about a centre.
 *
 * @param {Object} o
 * @param {Array} o.stars     catalogue entries {ra,dec,mag,name}
 * @param {number} o.ra0 @param {number} o.dec0  chart centre, degrees
 * @param {number} o.radiusDeg  angular radius shown
 * @param {Array<string[]>} [o.lines]  figure segments by star name
 * @param {Set<string>} [o.label]      which stars to name
 * @param {number} [o.missing]         0..1 how much of the chart is lost
 */
export function starChart(g, cx, cy, R, o) {
  const rng = makeRng(o.seed || 7);
  const DEGR = Math.PI / 180;
  const ra0 = o.ra0 * DEGR, dec0 = o.dec0 * DEGR;
  const scale = R / Math.tan(Math.min(80, o.radiusDeg) * 0.5 * DEGR);

  const project = (raDeg, decDeg, out) => {
    const ra = raDeg * DEGR, dec = decDeg * DEGR;
    const cosc = Math.sin(dec0) * Math.sin(dec) + Math.cos(dec0) * Math.cos(dec) * Math.cos(ra - ra0);
    if (cosc <= 0.02) return false;
    const k = 2 / (1 + cosc);
    out[0] = cx + scale * k * Math.cos(dec) * Math.sin(ra - ra0);
    out[1] = cy - scale * k * (Math.cos(dec0) * Math.sin(dec) - Math.sin(dec0) * Math.cos(dec) * Math.cos(ra - ra0));
    return Math.hypot(out[0] - cx, out[1] - cy) <= R * 1.02;
  };

  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.clip();

  // The limb, ruled with compasses, and its graduation.
  g.strokeStyle = INK_FADED;
  g.fillStyle = INK;
  penCircle(g, cx, cy, R, 1.6, rng, 0.01);
  penCircle(g, cx, cy, R * 0.985, 0.8, rng, 0.06);
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const long = i % 6 === 0;
    const r0 = R * (long ? 0.955 : 0.972);
    penLine(g, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0,
      cx + Math.cos(a) * R * 0.998, cy + Math.sin(a) * R * 0.998, long ? 1.3 : 0.7, rng, 0.2);
  }

  const p = [0, 0], q = [0, 0];
  const byName = new Map();
  for (const s of o.stars) if (s.name) byName.set(s.name, s);

  // Figure lines first, so the stars sit on top of them.
  if (o.lines) {
    g.strokeStyle = o.lineColor || INK_FADED;
    for (const seg of o.lines) {
      const a = byName.get(seg[0]), b = byName.get(seg[1]);
      if (!a || !b) continue;
      if (!project(a.ra, a.dec, p)) continue;
      if (!project(b.ra, b.dec, q)) continue;
      if (o.missing && isLost(p[0], p[1], cx, cy, R, o.missing, o.seed)) continue;
      penLine(g, p[0], p[1], q[0], q[1], 1.0, rng, 0.9);
    }
  }

  // Stars: solid ink discs, sized by magnitude, the brightest ringed.
  g.fillStyle = INK;
  for (const s of o.stars) {
    if (s.mag > (o.limit === undefined ? 4.4 : o.limit)) continue;
    if (!project(s.ra, s.dec, p)) continue;
    if (o.missing && isLost(p[0], p[1], cx, cy, R, o.missing, o.seed)) continue;
    const r = Math.max(0.9, 4.4 - s.mag * 0.78);
    g.beginPath();
    g.arc(p[0], p[1], r, 0, Math.PI * 2);
    g.fill();
    if (s.mag < 1.0) {
      g.strokeStyle = INK;
      penCircle(g, p[0], p[1], r + 3.4, 0.7, rng, 0.12);
    }
    if (o.label && o.label.has(s.name)) {
      g.save();
      g.fillStyle = INK;
      g.font = "italic 15px Georgia, serif";
      g.fillText(s.name, p[0] + r + 5, p[1] - r - 3);
      g.restore();
    }
  }
  g.restore();
}

/** Torn or stained regions of a page: information that is simply gone. */
function isLost(x, y, cx, cy, R, amount, seed) {
  const nx = (x - cx) / R, ny = (y - cy) / R;
  const n = fbm2(nx * 2.2 + 11, ny * 2.2 + 5, 14, 4, (seed || 7) + 3);
  return n < amount * 0.62;
}

/**
 * Draw the damage itself: a torn edge and staining, painted over the page after
 * its content, so the loss reads as physical.
 */
export function damage(g, x, y, w, h, amount, seed = 3) {
  if (amount <= 0.001) return;
  const rng = makeRng(seed * 977);
  g.save();
  // Stain
  for (let i = 0; i < 40 * amount; i++) {
    const px = x + rng() * w, py = y + rng() * h;
    const r = 14 + rng() * 70;
    const grd = g.createRadialGradient(px, py, 0, px, py, r);
    grd.addColorStop(0, `rgba(96,66,34,${0.05 + rng() * 0.07})`);
    grd.addColorStop(1, "rgba(96,66,34,0)");
    g.fillStyle = grd;
    g.fillRect(px - r, py - r, r * 2, r * 2);
  }
  g.restore();
}

/**
 * The ragged edge of a fragment: everything outside the surviving region is
 * cleared, so a recovered piece can be laid into the hole later.
 */
export function tearMask(g, x, y, w, h, seed, keep = 0.62) {
  const rng = makeRng(seed * 31 + 7);
  g.save();
  g.globalCompositeOperation = "destination-out";
  g.beginPath();
  const steps = 44;
  g.moveTo(x, y);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x + t * w;
    const py = y + h * keep + Math.sin(t * 9.1 + seed) * h * 0.06 + (rng() - 0.5) * h * 0.05;
    g.lineTo(px, py);
  }
  g.lineTo(x + w, y + h);
  g.lineTo(x, y + h);
  g.closePath();
  g.fill();
  g.restore();
}

export { makeRng, clamp01f, smoothstepf };
