/**
 * Observation Mode — hold RMB.
 *
 * This is not detective vision. Nothing is outlined, nothing is revealed through
 * walls, no solution is displayed. What happens is that the protagonist stops
 * walking and *looks properly*, and the things a trained astronomer would then
 * be able to tell you become legible:
 *
 *   - the meridian, the celestial equator and the horizon, drawn as fine arcs
 *   - the altitude and azimuth of whatever is under the sight
 *   - the name of a star bright enough to know, and its angular separation from
 *     the last star sighted
 *   - the figures she has learnt, and only those
 *   - residues of stellar magic, where any remain
 *
 * Everything here is information she could genuinely have. The overlays are
 * drawn with the same thread primitive the spells use, so notation and magic
 * share one visual language (§18).
 */
import { Vector3 } from "../core/bjs.js";
import { ThreadRenderer, MoteRenderer } from "../magic/stellar.js";
import { equatorialToHorizontal, altAzToWorld, lst, OBSERVER } from "../astronomy/celestial.js";
import { MODERN, TEMPLE } from "../astronomy/constellations.js";
import { DEG, RAD, TAU, clamp, clamp01, damp, lerp, smoothstep } from "../core/scratch.js";
import { fmtAngle } from "../ui/hud.js";
import { tune, toggles } from "../core/tune.js";

const _v = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _altaz = { alt: 0, az: 0 };
const _dir = { x: 0, y: 0, z: 0 };
const _pts = new Float32Array(3 * 64);

export class Observation {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {import("../camera/thirdPerson.js").ThirdPersonCamera} cam
   * @param {import("../core/input.js").Input} input
   * @param {import("../sky/sky.js").Sky} sky
   * @param {import("../character/player.js").Player} player
   * @param {import("../ui/hud.js").Hud} hud
   * @param {import("../book/book.js").Book} book
   */
  constructor(scene, cam, input, sky, player, hud, book) {
    this.name = "observation";
    this.order = 340;
    this.scene = scene;
    this.cam = cam;
    this.input = input;
    this.sky = sky;
    this.player = player;
    this.hud = hud;
    this.book = book;

    this.blend = 0;
    this.active = false;
    this.threads = new ThreadRenderer(scene, 420, [0.52, 0.68, 0.95]);
    this.motes = new MoteRenderer(scene, 260, [0.62, 0.78, 1.0]);

    /** The star currently under the sight, if any. */
    this.sightedStar = -1;
    /** The last star deliberately sighted — separations are measured from it. */
    this.markedStar = -1;
    /** Residues placed by the world: {position, strength, kind, note}. */
    this.residues = [];
    this.blocked = false;

    this._t = 0;
  }

  addResidue(position, strength, note, kind = "trace") {
    this.residues.push({ position: position.clone(), strength, note, kind, seen: false });
  }

  update(dt) {
    const inp = this.input;
    const want = !this.blocked && inp.rmb;
    this.active = want;
    this.blend = damp(this.blend, want ? 1 : 0, 0.0008, dt);
    this.cam.observe = this.blend;
    this._t += dt;

    // Movement slows; she is concentrating.
    this.player.controller.moveScale = lerp(1, 0.45, this.blend);

    this.threads.begin();
    this.motes.begin();
    this.hud.beginNotes();

    if (this.blend > 0.02) {
      this._drawFrame();
      this._sightStar();
      this._drawFigures();
      this._drawResidues();
    } else {
      this.sightedStar = -1;
    }

    this.hud.endNotes();
    this.threads.end(dt);
    this.motes.end(dt);
    this.hud.setObserve(this.blend > 0.35, this._readout());
  }

  /* ------------------------------------------------------------------ */

  _camDir(out) {
    const cam = this.cam;
    const cp = Math.cos(cam.pitch);
    out.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    return out;
  }

  /** The great circles an observer actually cares about. */
  _drawFrame() {
    const s = this.blend;
    const eye = this.player.position;
    const R = 60;
    const strength = s * 0.30;

    // Meridian: the plane of north, zenith and south. The temple is built on it.
    let n = 0;
    for (let i = 0; i <= 40; i++) {
      const alt = -6 + (i / 40) * 192;   // from below the north horizon over the top
      const a = alt > 90 ? 180 - alt : alt;
      const az = alt > 90 ? 180 : 0;
      altAzToWorld(a, az, _dir);
      _pts[n * 3] = eye.x + _dir.x * R;
      _pts[n * 3 + 1] = eye.y + 1.4 + _dir.y * R;
      _pts[n * 3 + 2] = eye.z + _dir.z * R;
      n++;
    }
    this.threads.addPath(_pts, n, strength * 1.25, 0.11);

    // Celestial equator: declination zero, the sky's own reference line.
    n = 0;
    const L = lst(this.sky.time.jd, OBSERVER.longitude);
    for (let i = 0; i <= 48; i++) {
      const ra = (i / 48) * 360;
      equatorialToHorizontal(ra, 0, L, OBSERVER.latitude, _altaz);
      if (_altaz.alt < -4) { if (n > 1) this.threads.addPath(_pts, n, strength * 0.75, 0.29); n = 0; continue; }
      altAzToWorld(_altaz.alt, _altaz.az, _dir);
      _pts[n * 3] = eye.x + _dir.x * R;
      _pts[n * 3 + 1] = eye.y + 1.4 + _dir.y * R;
      _pts[n * 3 + 2] = eye.z + _dir.z * R;
      n++;
    }
    if (n > 1) this.threads.addPath(_pts, n, strength * 0.75, 0.29);

    // Altitude ticks up the meridian, every ten degrees, with the cardinal
    // points marked. Small, exact, and drawn like a scale rather than a UI.
    for (let alt = 0; alt <= 80; alt += 10) {
      altAzToWorld(alt, 0, _dir);
      _a.set(eye.x + _dir.x * R, eye.y + 1.4 + _dir.y * R, eye.z + _dir.z * R);
      altAzToWorld(alt, 2.2, _dir);
      _b.set(eye.x + _dir.x * R, eye.y + 1.4 + _dir.y * R, eye.z + _dir.z * R);
      this.threads.add(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, strength * 1.4, 0.5 + alt * 0.01);
      if (alt % 30 === 0 && this.blend > 0.6) {
        this.hud.note(_a, "", alt + "°", "faint");
      }
    }

    // The pole: where everything turns. Marked, because the temple is obsessed
    // with it and because her era's pole star is not the builders'.
    altAzToWorld(OBSERVER.latitude, 0, _dir);
    _a.set(eye.x + _dir.x * R, eye.y + 1.4 + _dir.y * R, eye.z + _dir.z * R);
    if (this.blend > 0.5) this.hud.note(_a, "Pole", fmtAngle(OBSERVER.latitude));
    for (let i = 0; i < 12; i++) {
      const t0 = (i / 12) * TAU, t1 = ((i + 0.45) / 12) * TAU;
      circlePoint(_dir, t0, 1.6, _a, eye, R);
      circlePoint(_dir, t1, 1.6, _b, eye, R);
      this.threads.add(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, strength * 0.9, 0.7);
    }
  }

  /** Identify what the sight is on, and measure it. */
  _sightStar() {
    const sky = this.sky;
    this._camDir(_v);
    const eye = this.player.position;

    let best = -1, bestDot = 0.9993;   // ~2 degrees
    for (let i = 0; i < sky.namedCount; i++) {
      const s = sky.stars[i];
      if (s.mag > 3.2) continue;
      sky.starDirection(i, _dir);
      if (_dir.y < -0.02) continue;
      const d = _dir.x * _v.x + _dir.y * _v.y + _dir.z * _v.z;
      if (d > bestDot) { bestDot = d; best = i; }
    }
    this.sightedStar = best;

    if (best >= 0) {
      const s = sky.stars[best];
      sky.starAltAz(best, _altaz);
      sky.starDirection(best, _dir);
      _a.set(eye.x + _dir.x * 55, eye.y + 1.4 + _dir.y * 55, eye.z + _dir.z * 55);
      this.hud.note(_a, s.name, `alt ${fmtAngle(_altaz.alt)}   az ${fmtAngle(_altaz.az)}`);

      // A small sighting circle drawn around it.
      for (let i = 0; i < 16; i++) {
        const t0 = (i / 16) * TAU, t1 = ((i + 0.5) / 16) * TAU;
        circlePoint(_dir, t0, 0.55, _a, eye, 55);
        circlePoint(_dir, t1, 0.55, _b, eye, 55);
        this.threads.add(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, this.blend * 0.7, 0.33);
      }

      // Angular separation from the marked star — the astronomer's basic
      // measurement, and the one several puzzles are read with.
      if (this.markedStar >= 0 && this.markedStar !== best) {
        const m = this.sky.stars[this.markedStar];
        const sep = angularSeparation(s.ra, s.dec, m.ra, m.dec);
        sky.starDirection(this.markedStar, _dir);
        _b.set(eye.x + _dir.x * 55, eye.y + 1.4 + _dir.y * 55, eye.z + _dir.z * 55);
        this.threads.add(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, this.blend * 0.55, 0.77);
        _a.addInPlace(_b).scaleInPlace(0.5);
        this.hud.note(_a, "", fmtAngle(sep), "faint");
      }

      if (this.input.justPressed("KeyF")) this.markedStar = best;
    }

    // The moon and the planets, named — a wandering star is worth pointing out.
    const md = sky.moonDir;
    if (md.y > -0.05) {
      const d = md.x * _v.x + md.y * _v.y + md.z * _v.z;
      if (d > 0.995) {
        _a.set(eye.x + md.x * 50, eye.y + 1.4 + md.y * 50, eye.z + md.z * 50);
        this.hud.note(_a, "Moon", `alt ${fmtAngle(sky.moonInfo.alt)}   ${Math.round(sky.moonInfo.illum * 100)}% lit`, "warm");
      }
    }
    for (let i = 0; i < sky.planets.length; i++) {
      const p = sky.planets[i];
      if (p.alt < 0) continue;
      altAzToWorld(p.alt, p.az, _dir);
      const d = _dir.x * _v.x + _dir.y * _v.y + _dir.z * _v.z;
      if (d > 0.9985) {
        _a.set(eye.x + _dir.x * 52, eye.y + 1.4 + _dir.y * 52, eye.z + _dir.z * 52);
        this.hud.note(_a, p.name, `a wandering star   alt ${fmtAngle(p.alt)}`, "warm");
      }
    }
  }

  /** Draw only the figures she knows — the Book decides which. */
  _drawFigures() {
    const sky = this.sky;
    const eye = this.player.position;
    const known = this.book ? this.book.knownFigures : null;
    const strength = this.blend * 0.34;
    const R = 55;

    const drawSet = (set, useTemple) => {
      for (let f = 0; f < set.length; f++) {
        const fig = set[f];
        if (known && !known.has(fig.key)) continue;
        for (let l = 0; l < fig.lines.length; l++) {
          const s0 = starIndexByName(sky, fig.lines[l][0]);
          const s1 = starIndexByName(sky, fig.lines[l][1]);
          if (s0 < 0 || s1 < 0) continue;
          sky.starDirection(s0, _dir);
          if (_dir.y < -0.03) continue;
          _a.set(eye.x + _dir.x * R, eye.y + 1.4 + _dir.y * R, eye.z + _dir.z * R);
          sky.starDirection(s1, _dir);
          if (_dir.y < -0.03) continue;
          _b.set(eye.x + _dir.x * R, eye.y + 1.4 + _dir.y * R, eye.z + _dir.z * R);
          this.threads.add(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z,
            strength * (useTemple ? 1.25 : 1), useTemple ? 0.61 : 0.19);
        }
        // Name the figure at its anchor star.
        if (fig.anchor && this.blend > 0.55) {
          const ai = starIndexByName(sky, fig.anchor);
          if (ai >= 0) {
            sky.starDirection(ai, _dir);
            if (_dir.y > 0.02) {
              _a.set(eye.x + _dir.x * R, eye.y + 1.4 + _dir.y * R + 2.4, eye.z + _dir.z * R);
              this.hud.note(_a, fig.name, useTemple ? "as the builders drew it" : "", useTemple ? "warm" : "faint");
            }
          }
        }
      }
    };

    drawSet(MODERN, false);
    if (this.book && this.book.templeFiguresKnown) drawSet(TEMPLE, true);
  }

  /** Residues of past stellar magic — fragmentary by design. */
  _drawResidues() {
    const t = this._t;
    for (let i = 0; i < this.residues.length; i++) {
      const r = this.residues[i];
      const d = Vector3.Distance(r.position, this.player.position);
      if (d > 16) continue;
      const near = clamp01(1 - d / 16);
      const pulse = 0.55 + 0.45 * Math.sin(t * 1.3 + i * 2.1);
      const str = this.blend * near * r.strength * pulse * tune.recallOpacity;
      // A residue is a scatter of points, not a shape: what is left is evidence,
      // not a picture.
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU + t * 0.09 + i;
        const rad = 0.26 + 0.12 * Math.sin(t * 0.7 + k * 1.7 + i);
        this.motes.add(
          r.position.x + Math.cos(a) * rad,
          r.position.y + Math.sin(t * 0.5 + k) * 0.12,
          r.position.z + Math.sin(a) * rad,
          2.1 + Math.sin(k * 3.1) * 0.7, str * 1.6);
      }
      if (r.note && this.blend > 0.6 && d < 7) {
        _a.copyFrom(r.position); _a.y += 0.4;
        this.hud.note(_a, "", r.note, "faint");
        r.seen = true;
      }
    }
  }

  _readout() {
    const sky = this.sky;
    const t = sky.time;
    const jd = t.jd;
    const L = lst(jd, OBSERVER.longitude);
    const h = Math.floor(L / 15), m = Math.floor(((L / 15) - h) * 60);
    return `sidereal ${String(h).padStart(2, "0")}ʰ ${String(m).padStart(2, "0")}ᵐ    lat ${fmtAngle(OBSERVER.latitude)} N`;
  }
}

/* ------------------------------------------------------------------ */

const _nameCache = new Map();
function starIndexByName(sky, name) {
  let idx = _nameCache.get(name);
  if (idx !== undefined) return idx;
  idx = -1;
  for (let i = 0; i < sky.namedCount; i++) {
    if (sky.stars[i].name === name) { idx = i; break; }
  }
  _nameCache.set(name, idx);
  return idx;
}

/** A point on a small circle of angular radius `deg` about direction `dir`. */
function circlePoint(dir, theta, deg, out, eye, R) {
  // Build a basis around dir.
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(dir.y) > 0.97) { ux = 1; uy = 0; uz = 0; }
  let rx = uy * dir.z - uz * dir.y, ry = uz * dir.x - ux * dir.z, rz = ux * dir.y - uy * dir.x;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  const sx = dir.y * rz - dir.z * ry, sy = dir.z * rx - dir.x * rz, sz = dir.x * ry - dir.y * rx;
  const a = deg * DEG;
  const ca = Math.cos(a), sa = Math.sin(a);
  const c = Math.cos(theta), s = Math.sin(theta);
  const dx = dir.x * ca + (rx * c + sx * s) * sa;
  const dy = dir.y * ca + (ry * c + sy * s) * sa;
  const dz = dir.z * ca + (rz * c + sz * s) * sa;
  out.set(eye.x + dx * R, eye.y + 1.4 + dy * R, eye.z + dz * R);
  return out;
}

/** Angular separation between two equatorial positions, in degrees. */
export function angularSeparation(ra1, dec1, ra2, dec2) {
  const d1 = dec1 * DEG, d2 = dec2 * DEG, dr = (ra1 - ra2) * DEG;
  const c = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(dr);
  return Math.acos(clamp(c, -1, 1)) * RAD;
}

export { starIndexByName };
