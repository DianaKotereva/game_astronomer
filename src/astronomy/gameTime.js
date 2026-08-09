/**
 * Game time.
 *
 * The sky moves on its own, slowly — slowly enough that standing still and
 * watching a star climb is a thing you can notice but never a thing you have to
 * wait for. When a puzzle needs a particular hour, the player does not open a
 * slider: they drive the temple's own master mechanism, and the heavens
 * accelerate overhead while it turns (§17).
 *
 * The epoch offset is a separate axis entirely. Sliding it applies real
 * precession to the whole sky, which is how the player eventually stands under
 * the sky the builders knew — and discovers that their pole star was not ours.
 */
import { toJD, J2000, precess } from "./celestial.js";
import { DEG, clamp, smootherstep } from "../core/scratch.js";
import { Matrix } from "../core/bjs.js";

const SEC_PER_DAY = 86400;

export class GameTime {
  constructor() {
    // A clear autumn night. Late enough that Cygnus is high in the west and
    // Orion is rising — both of which the temple has opinions about.
    this.jd = toJD(2027, 10, 14, 21, 40, 0);
    this.startJD = this.jd;

    /** Game seconds per real second during ordinary play. */
    this.rate = 8;
    this.paused = false;

    /** Accelerated advance driven by a mechanism. */
    this._targetJD = 0;
    this._advancing = false;
    this._advanceT = 0;
    this._advanceDuration = 0;
    this._advanceFromJD = 0;
    /** 0..1, how hard time is currently being pushed — drives VFX and audio. */
    this.acceleration = 0;

    /** Years before J2000 that the sky is currently displayed at. */
    this.epochYearsBack = 0;
    this._epochApplied = 0;
    this.precession = Matrix.Identity();
    this._rebuildPrecession();

    this.onAdvanceComplete = null;
  }

  /** Local solar-ish clock, for the Book's marginalia and save files. */
  clockString() {
    const frac = (this.jd + 0.5) % 1;
    const h = Math.floor(frac * 24), m = Math.floor((frac * 24 - h) * 60);
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  /** Advance smoothly to a target Julian Date over `duration` real seconds. */
  advanceTo(targetJD, duration = 6) {
    this._advanceFromJD = this.jd;
    this._targetJD = targetJD;
    this._advanceDuration = Math.max(0.4, duration);
    this._advanceT = 0;
    this._advancing = true;
  }

  /** Advance by hours of game time. */
  advanceHours(hours, duration = 6) {
    this.advanceTo(this.jd + hours / 24, duration);
  }

  get advancing() { return this._advancing; }

  update(dt) {
    if (this._advancing) {
      this._advanceT += dt;
      const t = clamp(this._advanceT / this._advanceDuration, 0, 1);
      // Ease in and out: the mechanism has to overcome its own inertia at both
      // ends, and the sky should never start or stop moving abruptly.
      const s = smootherstep(0, 1, t);
      this.jd = this._advanceFromJD + (this._targetJD - this._advanceFromJD) * s;
      // Rate of change, normalised — peaks at the middle of the sweep.
      this.acceleration = Math.sin(t * Math.PI);
      if (t >= 1) {
        this._advancing = false;
        this.jd = this._targetJD;
        this.acceleration = 0;
        if (this.onAdvanceComplete) this.onAdvanceComplete();
      }
      return;
    }
    this.acceleration = 0;
    if (!this.paused) this.jd += (dt * this.rate) / SEC_PER_DAY;
  }

  /* ------------------------------------------------------------------ */
  /* Precession                                                          */
  /* ------------------------------------------------------------------ */

  /** Show the sky as it stood `years` before J2000. */
  setEpochYearsBack(years) {
    if (Math.abs(years - this.epochYearsBack) < 0.5) return;
    this.epochYearsBack = years;
    this._rebuildPrecession();
  }

  get epochJD() { return J2000 - this.epochYearsBack * 365.25; }

  /**
   * Rotation carrying J2000 equatorial coordinates to the displayed epoch.
   *
   * Built from the same rigorous angles as celestial.precess(), by transforming
   * three basis vectors — cheaper and less error-prone than composing the three
   * elementary rotations by hand, and it stays exactly consistent with the
   * scalar version used elsewhere.
   */
  _rebuildPrecession() {
    const to = this.epochJD;
    const m = this.precession.m;
    if (Math.abs(this.epochYearsBack) < 0.5) {
      Matrix.IdentityToRef(this.precession);
      this._epochApplied = 0;
      return;
    }
    const out = { ra: 0, dec: 0 };
    // Columns are the images of the J2000 axes.
    const basis = [[0, 0], [90, 0], [0, 90]];   // (ra,dec) of +x, +y, +z
    for (let c = 0; c < 3; c++) {
      precess(basis[c][0], basis[c][1], J2000, to, out);
      const ra = out.ra * DEG, dec = out.dec * DEG;
      const cd = Math.cos(dec);
      m[c * 4 + 0] = cd * Math.cos(ra);
      m[c * 4 + 1] = cd * Math.sin(ra);
      m[c * 4 + 2] = Math.sin(dec);
      m[c * 4 + 3] = 0;
    }
    m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
    this.precession.markAsUpdated();
    this._epochApplied = this.epochYearsBack;
  }
}

export { J2000, toJD };
