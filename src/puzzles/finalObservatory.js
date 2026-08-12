/**
 * Puzzle 5 — The Final Observatory.
 *
 * The convergence (§11.7, §75). Three things learned in three other rooms have
 * to arrive here together, and the room supplies none of them.
 *
 * The instrument does not move. That is the whole idea. The builders cut one
 * sight line through the north wall at the altitude of the celestial pole and
 * mounted the great axis on it permanently, because they were aiming at a fixed
 * point: their pole star. The pole is still exactly where they left it — the
 * pole is always at the latitude, that never changes — but the *star* has gone,
 * and a player who tries to solve this room by aiming something will get
 * nowhere, because there is nothing here to aim.
 *
 * What there is, is the epoch wheel: the temple's master mechanism, which winds
 * the whole frame of the heavens backwards. Thuban returns to the pole 4 785
 * years before J2000 — 0.04 degrees off it, closer than Polaris has ever been to
 * ours — and the moment it does, the dead sight line has a star in it again.
 *
 *   from the Archive     the frame turns, and every alignment here was cut for
 *                        a sky that has moved out from under it
 *   from the Court       gathered light, collimated, can be handed to an
 *                        instrument the way water is given to a channel
 *   from the Wandering   the figure is a set of relations, and a relation can be
 *   Stars                held in the hand as well as in the eye
 *
 * Then, and only then, the temple answers: shutters that have been shut for
 * three hundred years come off their seats, eight mirrors turn on their
 * bearings, and the last leaf of the Book — the record of the night they saw
 * something that could not be there — is finally readable.
 *
 * And then Zenith, once, for the thing they saw.
 *
 * Full write-up in PUZZLES.md.
 */
import { Vector3, TransformNode, Quaternion } from "../core/bjs.js";
import { Accum, addBlock, addCylinder, addRingBand, addDisc } from "../world/geo.js";
import { RotaryAxis } from "../mechanisms/mechanism.js";
import { OBSERVATORY } from "../world/chambers/finalObservatory.js";
import { BRIGHT_STARS } from "../astronomy/catalog.js";
import { precess, J2000, OBSERVER } from "../astronomy/celestial.js";
import { DEG, RAD, TAU, clamp, clamp01, damp, lerp, smoothstep, makeRng } from "../core/scratch.js";

/** The builders' pole star. */
const NAIL = "Thuban";
/** How close Thuban must come to the pole, in degrees, for the axis to see it. */
const POLE_TOLERANCE = 0.6;
/** Turns of the epoch wheel to wind the sky one full precessional cycle. */
const YEARS_PER_TURN = 2600;

const STAGE = {
  DEAD: 0, ALIGNED: 1, CHARGED: 2, THREADED: 3, AWAKE: 4, ZENITH: 5, DONE: 6,
};

const _v = new Vector3();
const _q = new Quaternion();
const _out = { ra: 0, dec: 0 };

/** How far Thuban stands from the pole at a given epoch, in degrees. */
export function nailPoleDistance(yearsBack) {
  let s = null;
  for (let i = 0; i < BRIGHT_STARS.length; i++) if (BRIGHT_STARS[i].name === NAIL) { s = BRIGHT_STARS[i]; break; }
  if (!s) return 90;
  precess(s.ra, s.dec, J2000, J2000 - yearsBack * 365.25, _out);
  return Math.abs(90 - _out.dec);
}

/** The epoch at which the builders' sight line has its star back. */
export function bestNailEpoch(lo = 3000, hi = 7000) {
  let best = 1e9, bestY = 0;
  for (let y = lo; y <= hi; y += 1) {
    const d = nailPoleDistance(y);
    if (d < best) { best = d; bestY = y; }
  }
  return { years: bestY, distance: best };
}

export class FinalObservatoryPuzzle {
  /** @param {Object} ctx */
  constructor(ctx) {
    this.name = "puzzle_observatory";
    this.order = 386;
    this.ctx = ctx;
    this.scene = ctx.scene;

    this.stage = STAGE.DEAD;
    this.meshes = [];
    this.mirrors = [];
    this.shutters = [];
    this._t = 0;
    this._charge = 0;
    this._open = 0;          // shutters, 0..1
    this._mirrorTurn = 0;    // 0..1
    this._mapGlow = 0;
    this._entered = false;
    this._notedDead = false;
  }

  /* ================================================================= */
  /*  Build                                                             */
  /* ================================================================= */

  build(accums) {
    const rng = makeRng(99001);
    const { stone, dark, bronze } = accums;
    const O = OBSERVATORY;
    const lat = OBSERVER.latitude * DEG;

    // The instrument head, where the axis pivots and where light is given to it.
    this.head = new Vector3(O.cx, O.platformY + 1.5, O.cz);
    /** Unit vector along the polar axis: due north, at the pole's altitude. */
    this.axisDir = new Vector3(0, Math.sin(lat), Math.cos(lat));

    /* --- the mount ---------------------------------------------------- */
    addBlock(dark, O.cx, O.platformY + 0.42, O.cz, 1.5, 0.42, 1.5, { bevel: 0.03, uvScale: 0.6 });
    for (const s of [-1, 1]) {
      addBlock(dark, O.cx + s * 1.15, O.platformY + 1.3, O.cz, 0.22, 0.88, 0.34, { bevel: 0.02, uvScale: 0.6 });
    }
    // Two great meridian rings standing in the plane of the axis.
    addRingBand(bronze, O.cx, this.head.y, O.cz, { radius: 2.5, width: 0.16, depth: 0.13, segments: 96, axis: 0, uvScale: 0.9 });
    addRingBand(bronze, O.cx, this.head.y, O.cz, { radius: 2.2, width: 0.11, depth: 0.10, segments: 88, axis: 0, uvScale: 0.9 });
    // Graduation on the outer ring, every degree.
    for (let d = 0; d < 180; d++) {
      const a = (d / 180) * Math.PI - Math.PI / 2;
      const long = d % 10 === 0;
      addBlock(bronze, O.cx + 0.14, this.head.y + Math.sin(a) * 2.62, O.cz + Math.cos(a) * 2.62,
        0.012, long ? 0.06 : 0.03, 0.008, { bevel: 0.002, uvScale: 3.0 });
    }

    /* --- the axis itself: a sighting tube, permanently aimed ---------- */
    // Built as a stack of short segments along the axis, because the kit's
    // cylinders stand on Y and this one does not stand on anything.
    const L = 5.4;
    for (let i = 0; i < 18; i++) {
      const t = (i / 17) - 0.5;
      const px = O.cx, py = this.head.y + this.axisDir.y * t * L, pz = O.cz + this.axisDir.z * t * L;
      const r = 0.30 - Math.abs(t) * 0.10;
      addBlock(dark, px, py, pz, r, r, L / 18 * 0.62, { bevel: 0.02, uvScale: 0.8 });
    }
    for (const t of [-0.5, 0.5]) {
      addRingBand(bronze, O.cx, this.head.y + this.axisDir.y * t * L, O.cz + this.axisDir.z * t * L, {
        radius: 0.34, width: 0.07, depth: 0.06, segments: 32, axis: 0, uvScale: 1.2,
      });
    }
    // The sighting vanes at the north end — cross-hairs, in blackened bronze.
    const ex = O.cx, ey = this.head.y + this.axisDir.y * 0.5 * L, ez = O.cz + this.axisDir.z * 0.5 * L;
    this.eyepiece = new Vector3(O.cx, this.head.y - this.axisDir.y * 0.5 * L, O.cz - this.axisDir.z * 0.5 * L);
    for (const rot of [0, 1]) {
      addBlock(bronze, ex, ey, ez, rot ? 0.005 : 0.30, rot ? 0.30 : 0.005, 0.005, { bevel: 0, uvScale: 3.0 });
    }

    /* --- the epoch wheel ---------------------------------------------- */
    // Horizontal, four metres across, graduated in great years. It is the
    // heaviest thing in the temple and it is meant to feel like it.
    this.wheelPos = new Vector3(O.cx, O.platformY + 0.62, O.cz - 3.6);
    addBlock(dark, this.wheelPos.x, O.platformY + 0.30, this.wheelPos.z, 1.1, 0.30, 1.1, { bevel: 0.03, uvScale: 0.6 });

    const w = new Accum("epochWheel");
    w.uvScale = 0.9;
    addDisc(w, 0, 0.05, 0, 2.0, 64, 1, 0.9);
    addRingBand(w, 0, 0, 0, { radius: 2.05, width: 0.14, depth: 0.16, segments: 72, axis: 1, uvScale: 0.9 });
    addRingBand(w, 0, 0, 0, { radius: 1.35, width: 0.09, depth: 0.11, segments: 60, axis: 1, uvScale: 0.9 });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU;
      const long = i % 13 === 0;
      addBlock(w, Math.cos(a) * 1.72, 0.07, Math.sin(a) * 1.72,
        long ? 0.26 : 0.13, 0.014, long ? 0.030 : 0.016, { yaw: -a, bevel: 0.004, uvScale: 2.4 });
    }
    // Four spokes and the handle you actually take hold of.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      addBlock(w, Math.cos(a) * 0.95, 0.02, Math.sin(a) * 0.95, 0.95, 0.05, 0.10, { yaw: -a, bevel: 0.012, uvScale: 1.2 });
    }
    addCylinder(w, 1.78, 0.20, 0, { radius: 0.055, height: 0.34, segments: 12, uvScale: 1.6 });

    this.wheelRoot = new TransformNode("epochWheelRoot", this.scene);
    this.wheelRoot.position.copyFrom(this.wheelPos);
    this.wheelRoot.rotationQuaternion = Quaternion.Identity();
    this.wheelMesh = w.toMesh(this.scene, this.ctx.mats.bronze({ key: "_epoch", seed: 71, polish: 0.4 }),
      { collide: false, freeze: false });
    this.wheelMesh.parent = this.wheelRoot;
    this.meshes.push(this.wheelMesh);

    this.wheelAxis = new RotaryAxis({
      // Enormous: this is the mechanism that moves the sky.
      inertia: 220, friction: 26, stiction: 6.0, backlash: 0.006,
      min: -TAU * 3.2, max: 0.02,
    });
    this.gripPoint = new Vector3(this.wheelPos.x + 1.78, this.wheelPos.y + 0.20, this.wheelPos.z);

    /* --- the eight mirrors -------------------------------------------- */
    const mm = new Accum("obsMirror");
    mm.uvScale = 1.1;
    addBlock(mm, 0, 0, 0, 0.03, 0.72, 0.52, { bevel: 0.014, uvScale: 1.1 });
    addRingBand(mm, 0, 0, 0, { radius: 0.76, width: 0.07, depth: 0.07, segments: 44, axis: 0, uvScale: 1.2 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      const cx = O.cx + Math.cos(a) * (O.radius - 1.5), cz = O.cz + Math.sin(a) * (O.radius - 1.5);
      const root = new TransformNode("obsMirror" + i, this.scene);
      root.position.set(cx, 1.95, cz);
      root.rotationQuaternion = Quaternion.Identity();
      const mesh = mm.toMesh(this.scene, this.ctx.mats.bronze({ key: "_mirror", seed: 71, polish: 0.88 }),
        { collide: false, freeze: false });
      mesh.parent = root;
      this.meshes.push(mesh);
      // Resting yaw is wherever it was left; the awakening turns them all to
      // face the axis, which is what makes the room look like one machine.
      this.mirrors.push({ root, rest: a + 1.2 + Math.sin(i * 3.1) * 0.5, aimed: a + Math.PI });
    }

    /* --- the dome shutters -------------------------------------------- */
    // Two stone leaves closing the oculus, each riding on a bronze track.
    for (const side of [-1, 1]) {
      const s = new Accum("shutter" + side);
      s.uvScale = 0.32;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const half = Math.sqrt(Math.max(0.02, 1 - (t * 2 - 1) * (t * 2 - 1))) * O.oculusR;
        addBlock(s, 0, 0, (t - 0.5) * O.oculusR * 2, half, 0.22, (O.oculusR * 2) / n * 0.5, { bevel: 0.03, uvScale: 0.32 });
      }
      addRingBand(s, 0, 0.26, 0, { radius: O.oculusR * 0.55, width: 0.10, depth: 0.08, segments: 40, axis: 1, uvScale: 0.9 });
      const root = new TransformNode("shutterRoot" + side, this.scene);
      root.position.set(O.cx + side * O.oculusR * 0.5, O.domeTop - 0.42, O.cz);
      root.rotationQuaternion = Quaternion.Identity();
      const mesh = s.toMesh(this.scene, this.ctx.mats.stone("blackstone", { seed: 31, size: 512 }),
        { collide: false, freeze: false });
      mesh.parent = root;
      this.meshes.push(mesh);
      this.shutters.push({ root, side, closedX: O.cx + side * O.oculusR * 0.5, openX: O.cx + side * (O.oculusR * 2.05) });
    }

    /* --- the map, waiting in the floor -------------------------------- */
    // Cut but never inlaid: the builders left the plate blank because what they
    // wanted to record on it is not a constellation and had no name.
    this.mapY = 0.02;
    void rng; void stone;
  }

  /* ================================================================= */
  /*  Install                                                           */
  /* ================================================================= */

  install() {
    const { interaction, magic, observation, hud } = this.ctx;
    const O = OBSERVATORY;

    this.nailIndex = -1;
    const sky = this.ctx.sky;
    if (sky && sky.stars) {
      for (let i = 0; i < sky.stars.length; i++) if (sky.stars[i].name === NAIL) { this.nailIndex = i; break; }
    }
    this.bestEpoch = bestNailEpoch();

    /* --- the epoch wheel ---------------------------------------------- */
    interaction.add({
      id: "epochWheel",
      position: this.wheelPos.clone(),
      radius: 3.4,
      verb: "Take hold of the great wheel",
      sub: "graduated in ages, not hours",
      dragVerb: "Wind the frame of the heavens",
      axis: this.wheelAxis,
      axisOrigin: this.wheelPos.clone(),
      axisDir: new Vector3(0, 1, 0),
      gripPoint: this.gripPoint.clone(),
      gripRest: this.gripPoint.clone(),
      onInteract: () => {
        const y = this._yearsBack();
        if (!this.ctx.book.has("archive.precession")) {
          hud.journal("A wheel four metres across, graduated in ages. Turning it would mean something if I knew what it was counting.", 10);
        } else {
          hud.journal(`Wound back ${Math.round(y)} years. ${this._nailLine()}`, 9);
        }
      },
    });

    /* --- the instrument ------------------------------------------------ */
    interaction.add({
      id: "greatAxis",
      position: this.head.clone(),
      radius: 4.0,
      verb: this.stage >= STAGE.AWAKE ? "Look through the axis" : "Sight along the axis",
      sub: "it does not move",
      onInteract: () => this._sight(),
    });

    // Stellar Light given to the instrument head — the Court's lesson.
    magic.addResonant({
      id: "observatoryAxis",
      position: this.head.clone(),
      radius: 3.0,
      quality: () => this._quality(),
      onLit: (ramp, dt) => {
        if (this.stage < STAGE.ALIGNED) {
          if (!this._notedDead) {
            this._notedDead = true;
            this.ctx.hud.journal("The light goes into the tube and comes out of the slit into empty sky. There is nothing up there to answer it.", 10);
          }
          return;
        }
        if (!this.ctx.book.has("light.collimated")) return;
        this._charge = Math.min(1, this._charge + dt * (0.5 + ramp));
        if (this._charge > 0.85 && this.stage === STAGE.ALIGNED) this._advance(STAGE.CHARGED);
      },
      onResonate: (q, dt, ramp) => {
        if (this.stage >= STAGE.THREADED) this._charge = Math.min(1, this._charge + dt * ramp);
      },
      onComplete: () => { if (this.stage === STAGE.THREADED) this._awaken(); },
    });

    // Constellation Thread, cast at the instrument once it has its star back.
    this._prevOnCast = magic.onCast;
    magic.onCast = (spell) => {
      if (this._prevOnCast) this._prevOnCast(spell);
      if (spell !== 2) return;                       // SPELL.THREAD
      if (this.stage !== STAGE.CHARGED) return;
      if (Vector3.Distance(this.ctx.player.position, this.head) > 12) return;
      this._advance(STAGE.THREADED);
    };

    observation.addResidue(this.head.clone(), 1.0,
      "They stood at this eyepiece every clear night for three hundred years, and then one night they stopped.", "trace");
    observation.addResidue(this.head.clone(), 0.95,
      "The axis has never been moved. Not once. Whatever it was cut to watch, it was cut to watch exactly there.", "sightline");
    const sight = observation.residues[observation.residues.length - 1];
    sight.dir = this.axisDir.clone();
    sight.length = 30;

    this.enterPos = new Vector3(O.cx, 1.0, O.cz - O.radius + 2.0);
  }

  _yearsBack() {
    return clamp(-this.wheelAxis.angle / TAU * YEARS_PER_TURN, 0, 26000);
  }

  _nailLine() {
    const d = nailPoleDistance(this._yearsBack());
    if (d < POLE_TOLERANCE) return "And the Nail is in the slit. It is exactly where they said it would be.";
    if (d < 4) return `The Nail stands ${d.toFixed(1)}° from the true point. Closer.`;
    return `The Nail stands ${d.toFixed(0)}° from the true point.`;
  }

  _sight() {
    const { hud, book } = this.ctx;
    if (this.stage >= STAGE.AWAKE) {
      hud.journal("Thuban, dead centre in the vanes, exactly as it was cut to be — four thousand seven hundred years ago.", 11);
      return;
    }
    if (this.stage >= STAGE.ALIGNED) {
      hud.journal("There is a star in the vanes now. Not ours — theirs.", 9);
      return;
    }
    if (book.has("archive.precession")) {
      hud.journal("Empty. The axis is cut at the altitude of the pole and it will never move — so it is not the instrument that is wrong. It is the century.", 12);
    } else {
      hud.journal("The vanes frame an empty piece of sky. The mount has no adjustment of any kind: whoever built it was certain.", 11);
    }
  }

  _quality() {
    const d = nailPoleDistance(this._yearsBack());
    return clamp01(1 - d / 6) * (this.stage >= STAGE.THREADED ? 1 : 0.5);
  }

  _advance(stage) {
    if (stage <= this.stage) return;
    this.stage = stage;
    const { hud, audio } = this.ctx;
    if (stage === STAGE.ALIGNED) {
      hud.banner("The Nail returns", "4 785 years before this night", 6);
      hud.journal("The sky has turned back under the roof, and the slit has a star in it again. Thuban. Their pole, not ours.", 13);
      if (audio) audio.mechanismWake();
    } else if (stage === STAGE.CHARGED) {
      hud.journal("The tube takes the light the way the court's mirrors did — straight, and given, not aimed.", 9);
    } else if (stage === STAGE.THREADED) {
      hud.journal("The Nail's figure closes around the axis. Now the relation is held, not merely seen.", 10);
    }
  }

  _awaken() {
    if (this.stage >= STAGE.AWAKE) return;
    this.stage = STAGE.AWAKE;
    const ctx = this.ctx;
    ctx.hud.banner("The house wakes", "Final Observatory", 8);
    ctx.hud.journal("Every instrument in the temple is moving. Not one of them was ever disconnected — they have been waiting, all of them, on this.", 15);
    ctx.book.unlockFragment("observatory.final");
    if (ctx.audio) { ctx.audio.resonanceComplete(); ctx.audio.mechanismWake(); }
    if (ctx.save) ctx.save.write();
  }

  /* ================================================================= */
  /*  Update                                                            */
  /* ================================================================= */

  update(dt) {
    this._t += dt;
    const ctx = this.ctx;

    if (!this._entered && this.enterPos) {
      if (Vector3.Distance(ctx.player.position, this.enterPos) < 5.0) {
        this._entered = true;
        ctx.hud.banner("The Final Observatory", "on the meridian, at the north end", 6);
        ctx.hud.journal("A dome closed against the sky, and one slit cut through the north wall. Everything in this room points at the same nothing.", 12);
      }
    }

    /* --- the wheel, and the sky it drags ------------------------------ */
    this.wheelAxis.update(dt);
    Quaternion.RotationAxisToRef(Vector3.UpReadOnly, this.wheelAxis.visualAngle, _q);
    this.wheelRoot.rotationQuaternion.copyFrom(_q);

    // The wheel *is* the epoch control: turning it precesses the whole sky.
    // setEpochYearsBack already no-ops below half a year, so this is cheap.
    const years = this._yearsBack();
    if (ctx.time) ctx.time.setEpochYearsBack(years);

    if (this.stage === STAGE.DEAD && nailPoleDistance(years) < POLE_TOLERANCE) this._advance(STAGE.ALIGNED);
    // Winding away again loses the alignment: the room is honest about it.
    if (this.stage === STAGE.ALIGNED && nailPoleDistance(years) > POLE_TOLERANCE * 1.6) {
      this.stage = STAGE.DEAD;
      this._charge = 0;
    }

    this._charge = Math.max(0, this._charge - dt * 0.25);

    /* --- the awakening ------------------------------------------------ */
    const wantOpen = this.stage >= STAGE.AWAKE ? 1 : 0;
    this._open = damp(this._open, wantOpen, 0.00035, dt);
    for (const s of this.shutters) {
      s.root.position.x = lerp(s.closedX, s.openX, smoothstep(0, 1, this._open));
    }
    this._mirrorTurn = damp(this._mirrorTurn, wantOpen, 0.0006, dt);
    for (let i = 0; i < this.mirrors.length; i++) {
      const m = this.mirrors[i];
      // Staggered, so the room turns in sequence rather than as one object.
      const t = clamp01((this._mirrorTurn - i * 0.05) / 0.7);
      Quaternion.RotationAxisToRef(Vector3.UpReadOnly, lerp(m.rest, m.aimed, smoothstep(0, 1, t)), _q);
      m.root.rotationQuaternion.copyFrom(_q);
    }

    // Dust comes off everything that has just moved for the first time in
    // centuries — the one moment in the game that earns a big dust cue (§44).
    if (this.ctx.dust && this._open > 0.01 && this._open < 0.8) {
      _v.set(OBSERVATORY.cx, OBSERVATORY.domeTop - 2.5, OBSERVATORY.cz);
      this.ctx.dust.disturb(_v, 3.2 * dt, OBSERVATORY.oculusR + 2);
      // And off each mirror as its bearing breaks free.
      const i = Math.floor(this._t * 6) % this.mirrors.length;
      const m = this.mirrors[i];
      _v.copyFrom(m.root.position);
      this.ctx.dust.disturb(_v, 1.1 * dt, 2.2);
    }

    /* --- Zenith ------------------------------------------------------- */
    if (this.stage === STAGE.AWAKE && ctx.book.has("observatory.final")
      && ctx.magic && ctx.magic.unlocked && ctx.magic.unlocked[6]) {
      const near = Vector3.Distance(ctx.player.position, this.head) < 6.0;
      if (near && !this._zenithOffered) {
        this._zenithOffered = true;
        ctx.hud.journal("The last leaf says they measured it eleven times. The axis is still warm. There is one thing left to do.", 12);
        const item = ctx.interaction.get("greatAxis");
        if (item) {
          item.verb = "Perform the great operation";
          item.sub = "Zenith";
          item.onInteract = () => this._zenith();
        }
      }
    }

    if (this.stage === STAGE.ZENITH) {
      const p = ctx.magic ? ctx.magic.zenithProgress : 1;
      this._mapGlow = damp(this._mapGlow, smoothstep(0.35, 0.8, p), 0.0006, dt);
      if (p >= 0.999) this._finish();
    }
  }

  _zenith() {
    if (this.stage !== STAGE.AWAKE) return;
    this.stage = STAGE.ZENITH;
    const ctx = this.ctx;
    if (ctx.magic && this.nailIndex >= 0) ctx.magic.beginZenith(this.head, this.nailIndex, 22);
    ctx.hud.journal("For a moment the distance stops mattering.", 10);
  }

  _finish() {
    if (this.stage >= STAGE.DONE) return;
    this.stage = STAGE.DONE;
    const ctx = this.ctx;
    ctx.hud.banner("What they saw", "and did not write down", 12);
    ctx.hud.journal("The plate in the floor is not blank any more. It is not the temple, and it is not any figure in the Book. It is a map of somewhere else — and the eleven marks on it are the eleven measurements from the last night.", 18);
    if (ctx.save) ctx.save.write();
  }
}

void RAD; void addCylinder; void addDisc;
