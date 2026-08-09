/**
 * Puzzle 2 — The Chamber of Wandering Stars.
 *
 * The orrery is not a model of the heavens. It is a calculator: five nested
 * bronze rings, one per wanderer, each graduated in the twelve houses. Set every
 * ring to where its planet actually stands tonight and the train will turn.
 *
 * This is the mechanism-dominant puzzle (§31). The astronomy required is only
 * "go and look, then come back and match" — but you cannot do it without going
 * and looking, because nothing in the room tells you where Jupiter is. The magic
 * required is Celestial Resonance to wake the train, and Gravity Lens to hold
 * the counterweight while the last ring seats.
 *
 * Full write-up in PUZZLES.md.
 */
import { Vector3, TransformNode, Quaternion } from "../core/bjs.js";
import { Accum, addBlock, addCylinder, addRingBand, addDisc } from "../world/geo.js";
import { RotaryAxis, Counterweight } from "../mechanisms/mechanism.js";
import { COURT } from "../world/chambers/wanderingStars.js";
import { planetPosition, planetCount, planetName, lst, OBSERVER, equatorialToHorizontal } from "../astronomy/celestial.js";
import { DEG, RAD, TAU, clamp, clamp01, lerp, damp, wrapPi, makeRng } from "../core/scratch.js";
import { fmtAngle } from "../ui/hud.js";

const _v = new Vector3();
const _altaz = { alt: 0, az: 0 };

/** Ecliptic longitude of a planet, which is what the rings are graduated in. */
function eclipticLongitude(index, jd) {
  const p = planetPosition(index, jd);
  // Equatorial to ecliptic; the obliquity term is small but the rings are
  // graduated in houses, so it matters at the edges.
  const eps = 23.439 * DEG;
  const ra = p.ra * DEG, dec = p.dec * DEG;
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(eps) * Math.cos(dec) * Math.sin(ra) + Math.sin(eps) * Math.sin(dec);
  let l = Math.atan2(y, x) * RAD;
  return ((l % 360) + 360) % 360;
}

export class WanderingStarsPuzzle {
  constructor(ctx) {
    this.name = "puzzle.orrery";
    this.order = 382;
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.solved = false;
    this.rings = [];
    this._t = 0;
  }

  build(accums) {
    const ctx = this.ctx;
    const rng = makeRng(5150);
    const C = COURT;
    const matBronze = ctx.mats.bronze({ key: "_instrument", seed: 71, polish: 0.55 });
    const matBrass = ctx.mats.brass({ key: "_orrery", seed: 83 });

    this.centre = new Vector3(C.cx, 3.1, C.cz);

    /* --- the central column, standing in the well ------------------- */
    addCylinder(accums.dark, C.cx, -5.6, C.cz, {
      radius: 0.72, height: 8.2, segments: 24, uvScale: 0.5, capTop: false,
    });
    addCylinder(accums.dark, C.cx, 2.6, C.cz, {
      radius: 0.95, height: 0.34, segments: 24, uvScale: 0.5,
    });

    /* --- five rings, nested ------------------------------------------ */
    // Radii chosen so the rings clear each other and the outermost is level
    // with the gallery: the player can look down the whole engine from above.
    const spec = [
      { r: 1.30, tilt: 7.0, w: 0.13, d: 0.075 },
      { r: 1.95, tilt: 3.4, w: 0.15, d: 0.085 },
      { r: 2.62, tilt: 1.9, w: 0.16, d: 0.090 },
      { r: 3.30, tilt: 1.3, w: 0.17, d: 0.095 },
      { r: 3.98, tilt: 2.5, w: 0.18, d: 0.100 },
    ];

    for (let i = 0; i < 5 && i < planetCount(); i++) {
      const s = spec[i];
      const root = new TransformNode("orreryRing" + i, ctx.scene);
      root.position.copyFrom(this.centre);
      root.rotationQuaternion = Quaternion.Identity();

      const acc = new Accum("orreryRingMesh" + i);
      acc.uvScale = 0.9;
      // The ring itself, in the XZ plane, tilted by its own inclination.
      addRingBand(acc, 0, 0, 0, {
        radius: s.r, width: s.w, depth: s.d, segments: 96, axis: 1, uvScale: 0.9,
      });
      // Graduation: twelve houses, sixty parts.
      for (let k = 0; k < 60; k++) {
        const a = (k / 60) * TAU;
        const long = k % 5 === 0;
        addBlock(acc, Math.cos(a) * (s.r + s.w * 0.5 + 0.012), 0, Math.sin(a) * (s.r + s.w * 0.5 + 0.012),
          long ? 0.055 : 0.026, 0.006, 0.006, { yaw: -a, bevel: 0.002, uvScale: 3.0 });
      }
      // Four spokes to the hub, and the hub itself.
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU;
        const len = s.r - 0.22;
        addBlock(acc, Math.cos(a) * (0.22 + len * 0.5), 0, Math.sin(a) * (0.22 + len * 0.5),
          len * 0.5, 0.022, 0.022, { yaw: -a, bevel: 0.005, uvScale: 1.6 });
      }
      addCylinder(acc, 0, -0.06, 0, { radius: 0.20, height: 0.12, segments: 16, uvScale: 1.2 });
      const ringMesh = acc.toMesh(ctx.scene, matBronze, { collide: false, freeze: false });
      ringMesh.parent = root;

      // The wanderer's own bead, on an arm that stands out from the ring.
      const bead = new Accum("orreryBead" + i);
      bead.uvScale = 2.0;
      addBlock(bead, s.r, 0.10, 0, 0.02, 0.10, 0.02, { bevel: 0.004, uvScale: 2.0 });
      addCylinder(bead, s.r, 0.20, 0, { radius: 0.052 + i * 0.008, height: 0.09, segments: 14, uvScale: 2.0 });
      const beadMesh = bead.toMesh(ctx.scene, matBrass, { collide: false, freeze: false });
      const beadRoot = new TransformNode("orreryBeadRoot" + i, ctx.scene);
      beadRoot.parent = root;
      beadRoot.rotationQuaternion = Quaternion.Identity();
      beadMesh.parent = beadRoot;

      // Tilt is fixed; only the rotation about the vertical is settable.
      Quaternion.RotationYawPitchRollToRef(0, s.tilt * DEG, 0, root.rotationQuaternion);

      const axis = new RotaryAxis({
        angle: rng() * TAU,
        // Heavier the further out; the outermost ring is four metres of bronze.
        inertia: 26 + i * 16, friction: 2.4 + i * 0.5, stiction: 0.7 + i * 0.28,
        backlash: 0.008 + i * 0.002,
      });

      this.rings.push({
        index: i, root, mesh: ringMesh, beadRoot, beadMesh, axis, spec: s,
        name: planetName(i), seated: false,
      });
    }

    /* --- the reading arm beneath the rings --------------------------- */
    const armAcc = new Accum("orreryArm");
    armAcc.uvScale = 1.0;
    addBlock(armAcc, 2.1, 0, 0, 2.1, 0.035, 0.05, { bevel: 0.008, uvScale: 1.0 });
    addBlock(armAcc, 4.15, 0, 0, 0.09, 0.055, 0.012, { bevel: 0.004, uvScale: 2.0 });
    this.armRoot = new TransformNode("orreryArmRoot", ctx.scene);
    this.armRoot.position.set(C.cx, 0.42, C.cz);
    this.armRoot.rotationQuaternion = Quaternion.Identity();
    this.armMesh = armAcc.toMesh(ctx.scene, matBronze, { collide: false, freeze: false });
    this.armMesh.parent = this.armRoot;

    /* --- the counterweight, hanging in its shaft ---------------------- */
    const cwAcc = new Accum("orreryWeight");
    cwAcc.uvScale = 0.6;
    addBlock(cwAcc, 0, 0, 0, 0.42, 0.72, 0.42, { bevel: 0.03 });
    addBlock(cwAcc, 0, 0.80, 0, 0.05, 0.10, 0.05, { bevel: 0.01 });
    this.weightRoot = new TransformNode("orreryWeightRoot", ctx.scene);
    this.weightRoot.position.set(C.cx + 5.6, 5.4, C.cz - 1.2);
    this.weightMesh = cwAcc.toMesh(ctx.scene, ctx.mats.stone("blackstone", { seed: 31, size: 512, detailScale: 16 }),
      { collide: false, freeze: false });
    this.weightMesh.parent = this.weightRoot;
    this.weight = new Counterweight({ travel: 7.6, mass: 1 });

    this.meshes = [this.armMesh, this.weightMesh].concat(
      this.rings.map((r) => r.mesh), this.rings.map((r) => r.beadMesh));

    return this;
  }

  install() {
    const ctx = this.ctx;
    const { interaction, magic, hud, observation } = ctx;

    for (const ring of this.rings) {
      const grip = new Vector3(
        this.centre.x + ring.spec.r, this.centre.y + 0.05, this.centre.z);
      interaction.add({
        id: "orreryRing" + ring.index,
        position: grip.clone(),
        radius: 3.0,
        verb: "Take the ring",
        dragVerb: `Turn the ring of ${ring.name}`,
        sub: "graduated in the twelve houses",
        axis: ring.axis,
        axisOrigin: this.centre.clone(),
        axisDir: new Vector3(0, 1, 0),
        gripPoint: grip.clone(),
        gripRest: grip.clone(),
        gain: 0.5 - ring.index * 0.05,
        available: () => !this.solved,
      });
    }

    this.resonant = magic.addResonant({
      id: "orrery",
      position: this.centre.clone(),
      radius: 5.2,
      ringRadius: 4.2,
      quality: () => this.alignmentQuality(),
      onResonate: (q, dt, ramp) => {
        for (const r of this.rings) r.axis.push((Math.random() - 0.5) * q * q * 0.5);
        this._shake = Math.max(this._shake || 0, q * ramp);
      },
      onComplete: () => this._solve(),
    });

    observation.addResidue(new Vector3(COURT.cx + 4.6, 0.4, COURT.cz + 1.2), 0.8,
      "Someone stood here and turned the third ring. Once. In a hurry.", "trace");
    observation.addResidue(new Vector3(COURT.cx, 5.2, COURT.cz), 0.6,
      "The engine has run ten thousand times. It remembers the whole cycle.", "trace");

    // The fragment that explains the engine is lying where it fell, on the
    // gallery. Reaching it teaches the player to go up.
    const fragPos = new Vector3(COURT.cx - 3.4, COURT.galleryY + 0.2, COURT.cz + 8.4);
    interaction.add({
      id: "orreryFragment",
      position: fragPos,
      radius: 2.0,
      verb: "Take the leaf",
      sub: "loose, and face down",
      available: () => !ctx.book.has("orrery.calibration"),
      onInteract: () => {
        ctx.book.unlockFragment("orrery.calibration");
        ctx.book.unlockFragment("light.source");
      },
    });

    return this;
  }

  /**
   * Every ring must stand at its planet's true ecliptic longitude. The tolerance
   * is three degrees per ring — generous individually, impossible to hit on five
   * rings at once by accident.
   */
  alignmentQuality() {
    const jd = this.ctx.time.jd;
    let total = 1;
    for (const ring of this.rings) {
      const want = eclipticLongitude(ring.index, jd) * DEG;
      const have = ring.axis.angle;
      const err = Math.abs(wrapPi(have - want)) * RAD;
      const q = clamp01(1 - err / 3.0);
      ring.seated = q > 0.8;
      total *= Math.pow(q, 0.55);
    }
    return total;
  }

  _solve() {
    if (this.solved) return;
    this.solved = true;
    const ctx = this.ctx;
    ctx.hud.banner("The engine turns", "Chamber of Wandering Stars", 6);
    ctx.hud.journal("Not a model. A calculator — and it has been waiting three hundred years for someone to give it tonight's sky.", 11);
    ctx.book.unlockFragment("thread.first");
    ctx.book.unlockFragment("recall.first");
    this.weight.release();
    if (ctx.audio) ctx.audio.mechanismWake();
    if (ctx.save) ctx.save.markSolved("wanderingStars");
  }

  update(dt) {
    const ctx = this.ctx;
    this._t += dt;

    for (const ring of this.rings) {
      ring.axis.update(dt);
      // The ring turns about its own (tilted) vertical; the bead rides it.
      const tilt = ring.spec.tilt * DEG;
      Quaternion.RotationYawPitchRollToRef(ring.axis.visualAngle, tilt, 0, ring.root.rotationQuaternion);
      if (ctx.audio && ring.axis.moving) ctx.audio.mechanism(ring.axis.velocity, ring.index);
      if (ctx.dust && ring.axis.disturbance > 0.02) {
        _v.set(this.centre.x, this.centre.y, this.centre.z);
        ctx.dust.disturb(_v, ring.axis.disturbance * 0.6, ring.spec.r);
      }
    }

    // Once solved the whole train runs, slowly, at its designed rate: each
    // wanderer at its own period. It is a clock again.
    if (this.solved) {
      const rate = this.weight.update(dt, 1.2);
      this.weightRoot.position.y = 5.4 - this.weight.position;
      this.weightRoot.position.x = COURT.cx + 5.6 + Math.sin(this.weight.sway) * 0.12;
      for (const ring of this.rings) {
        ring.axis.push(0.9 * (1 + ring.index * 0.25) * (rate > 0.02 ? 1 : 0.25));
      }
      this.armRoot.rotationQuaternion = this.armRoot.rotationQuaternion || Quaternion.Identity();
      Quaternion.RotationYawPitchRollToRef(this.rings[2].axis.visualAngle * 0.5, 0, 0, this.armRoot.rotationQuaternion);
      if (ctx.dust && this.weight.velocity > 0.05) {
        ctx.dust.disturb(this.weightRoot.position, clamp01(this.weight.velocity * 0.6), 1.6);
      }
    }

    if (this._shake > 0.01) {
      ctx.cam.shake = Math.max(ctx.cam.shake, this._shake * 0.35);
      this._shake = damp(this._shake, 0, 0.02, dt);
    }
  }

  /** Called by the warm-up so every ring mesh is drawn once before play. */
  warm() {
    for (const r of this.rings) { r.axis.push(3); r.axis.update(1 / 60); }
    this.update(1 / 60);
  }
}

export { eclipticLongitude };
