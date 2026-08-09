/**
 * Puzzle 1 — The Hall of Meridian.
 *
 * Teaches the whole grammar of the game in one room, using all three of its
 * languages (§31): astronomy to understand what is being measured, mechanism to
 * set the instrument, magic to complete the relationship.
 *
 * What the player sees: a shaft of moonlight falling through the slit in the
 * vault, landing beside the bronze line but not on it. A graduated ring on a
 * pier at the north end, its sighting arm set to nothing in particular. A drum
 * of hours on a stand near the door.
 *
 * What is true: the stripe lands on the line only when the moon crosses the
 * meridian, and how far north it lands is a reading of the moon's altitude. The
 * ring must be set to that altitude. Then, and only then, Celestial Resonance
 * finds something to resonate with.
 *
 * Full write-up in PUZZLES.md.
 */
import { Vector3, TransformNode, Quaternion } from "../core/bjs.js";
import { Accum, addBlock, addCylinder, addRingBand } from "../world/geo.js";
import { MeridianCircle } from "../mechanisms/meridianCircle.js";
import { RotaryAxis } from "../mechanisms/mechanism.js";
import { ApertureBeam } from "../vfx/aperture.js";
import { HALL, altitudeToZ, zToAltitude } from "../world/chambers/hallOfMeridian.js";
import { equatorialToHorizontal, lst, OBSERVER, moonPosition } from "../astronomy/celestial.js";
import { DEG, RAD, TAU, clamp, clamp01, lerp, damp, makeRng, smoothstep } from "../core/scratch.js";
import { fmtAngle } from "../ui/hud.js";

const _v = new Vector3();
const _altaz = { alt: 0, az: 0 };

export class HallOfMeridianPuzzle {
  /**
   * @param {Object} ctx  game context: scene, mats, temple, sky, time, magic,
   *                      interaction, hud, player, observation, audio, save
   */
  constructor(ctx) {
    this.name = "puzzle.meridian";
    this.order = 380;
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.solved = false;
    this._t = 0;
    this._shutterOpen = 0;
    this._settleDust = 0;
  }

  /** Build geometry. Called during world construction, before meshes are made. */
  build(accums) {
    const ctx = this.ctx;
    const rng = makeRng(3141);

    /* --- the meridian circle, at the north end ----------------------- */
    this.circle = new MeridianCircle({
      scene: ctx.scene, mats: ctx.mats, stone: accums.stone,
      centre: [0, 4.35, 12.4], radius: 3.0,
    });

    /* --- the drum of hours ------------------------------------------- */
    // A bronze drum graduated in hours, on a low stone stand near the south
    // door. Turning it turns the night: the temple's own way of asking "and
    // what would the sky look like then?"
    const drumZ = -8.6, drumX = 2.9, drumY = 1.06;
    addBlock(accums.stone, drumX, drumY * 0.5, drumZ, 0.52, drumY * 0.5, 0.52, { bevel: 0.03 });
    addBlock(accums.stone, drumX, drumY + 0.06, drumZ, 0.62, 0.06, 0.62, { bevel: 0.02 });
    for (const s of [-1, 1]) {
      addBlock(accums.stone, drumX + s * 0.44, drumY + 0.42, drumZ, 0.08, 0.36, 0.12, { bevel: 0.015 });
    }

    const drum = new Accum("hourDrum");
    drum.uvScale = 1.1;
    // Built around the origin so the mesh can rotate about its own axis.
    addCylinder(drum, 0, -0.30, 0, { radius: 0.30, height: 0.60, segments: 32, uvScale: 1.1, capBottom: true });
    addRingBand(drum, 0, -0.30, 0, { radius: 0.315, width: 0.03, depth: 0.05, segments: 48, axis: 1, uvScale: 1.1 });
    addRingBand(drum, 0, 0.26, 0, { radius: 0.315, width: 0.03, depth: 0.05, segments: 48, axis: 1, uvScale: 1.1 });
    // Twenty-four hour marks, twelve of them long.
    for (let h = 0; h < 24; h++) {
      const a = (h / 24) * TAU;
      const long = h % 2 === 0;
      addBlock(drum, Math.cos(a) * 0.312, long ? 0 : -0.09, Math.sin(a) * 0.312,
        0.012, long ? 0.16 : 0.08, 0.012, { yaw: -a, bevel: 0.003, uvScale: 3.0 });
    }
    // A handle to take hold of.
    addBlock(drum, 0.34, 0.10, 0, 0.10, 0.026, 0.026, { bevel: 0.006, uvScale: 2.6 });
    addCylinder(drum, 0.44, 0.10, 0, { radius: 0.035, height: 0.10, segments: 12, uvScale: 2.0 });

    this.drumRoot = new TransformNode("hourDrumRoot", ctx.scene);
    this.drumRoot.position.set(drumX, drumY + 0.42, drumZ);
    this.drumRoot.rotationQuaternion = Quaternion.Identity();
    this.drumMesh = drum.toMesh(ctx.scene, ctx.mats.bronze({ key: "_instrument", seed: 71, polish: 0.55 }),
      { collide: false, freeze: false });
    this.drumMesh.parent = this.drumRoot;
    this.drumPos = new Vector3(drumX, drumY + 0.42, drumZ);

    this.drumAxis = new RotaryAxis({
      inertia: 16, friction: 3.4, stiction: 0.55, backlash: 0.004,
      min: -Math.PI * 1.9, max: Math.PI * 1.9,
    });

    /* --- the north shutter ------------------------------------------- */
    // A counterweighted stone slab closing the way onward. It does not open
    // because a puzzle was "solved"; it opens because the counterweights it
    // has been holding for centuries are finally released.
    const sh = new Accum("northShutter");
    sh.uvScale = 0.3;
    addBlock(sh, 0, 2.1, 0, 1.65, 2.1, 0.36, { bevel: 0.04 });
    addBlock(sh, 0, 4.24, 0, 1.78, 0.14, 0.44, { bevel: 0.03 });
    for (const s of [-1, 1]) {
      addBlock(sh, s * 1.5, 2.1, 0.2, 0.1, 2.0, 0.1, { bevel: 0.02 });
    }
    this.shutterRoot = new TransformNode("shutterRoot", ctx.scene);
    this.shutterRoot.position.set(0, 0, HALL.z1 - 0.1);
    this.shutterMesh = sh.toMesh(ctx.scene, ctx.mats.stone("blackstone", { seed: 31, size: 512, detailScale: 16 }),
      { collide: false, freeze: false });
    this.shutterMesh.parent = this.shutterRoot;

    // Counterweights hanging in the shafts either side, visible before they move.
    const cw = new Accum("shutterWeights");
    cw.uvScale = 0.6;
    for (const s of [-1, 1]) {
      addBlock(cw, s * 2.35, 0, 0, 0.34, 0.62, 0.34, { bevel: 0.03 });
      addBlock(cw, s * 2.35, 0.70, 0, 0.06, 0.10, 0.06, { bevel: 0.01 });
    }
    this.weightRoot = new TransformNode("weightRoot", ctx.scene);
    this.weightRoot.position.set(0, 7.4, HALL.z1 - 0.62);
    this.weightMesh = cw.toMesh(ctx.scene, ctx.mats.stone("blackstone", { seed: 31, size: 512, detailScale: 16 }),
      { collide: false, freeze: false });
    this.weightMesh.parent = this.weightRoot;

    /* --- a wall inscription, needing Stellar Light to read ------------ */
    this.inscriptionPos = new Vector3(-7.3, 1.65, -2.4);
    addBlock(accums.dark, -7.55, 1.65, -2.4, 0.08, 0.62, 1.15, { bevel: 0.02, uvScale: 0.8 });

    return this;
  }

  /** Wire behaviour once the whole game context exists. */
  install() {
    const ctx = this.ctx;
    const { interaction, magic, hud, sky, time, observation } = ctx;

    /* --- the shaft of moonlight -------------------------------------- */
    this.beam = new ApertureBeam(this.scene, {
      x: 0, y: HALL.vaultTop - 0.1, zRange: [HALL.z0, HALL.z1],
      halfWidth: HALL.slitHalfWidth, floorY: 0,
    });

    /* --- interactables ------------------------------------------------ */
    interaction.add({
      id: "hourDrum",
      position: this.drumPos.clone(),
      radius: 2.4,
      verb: "Take the drum",
      dragVerb: "Turn the hours",
      sub: "the night moves with it",
      axis: this.drumAxis,
      axisOrigin: this.drumPos.clone(),
      axisDir: new Vector3(0, 1, 0),
      gripPoint: new Vector3(this.drumPos.x + 0.44, this.drumPos.y + 0.10, this.drumPos.z),
      gripRest: new Vector3(this.drumPos.x + 0.44, this.drumPos.y + 0.10, this.drumPos.z),
      gain: 0.55,
      onGrip: () => {
        if (!this._drumTouched) {
          this._drumTouched = true;
          hud.journal("The drum is graduated in hours. Of course it is — the room measures a crossing, and a crossing has a time.");
        }
      },
    });

    interaction.add({
      id: "meridianArm",
      position: this.circle.gripPoint.clone(),
      radius: 3.0,
      verb: "Take the arm",
      dragVerb: "Swing the sighting arm",
      sub: "graduated 0 to 90",
      axis: this.circle.axis,
      axisOrigin: this.circle.centre.clone(),
      axisDir: new Vector3(-1, 0, 0),
      gripPoint: this.circle.gripPoint.clone(),
      gripRest: this.circle.gripRest.clone(),
      gain: 0.42,
      available: () => !this.circle.locked,
      onGrip: () => {
        if (!this._armTouched) {
          this._armTouched = true;
          hud.journal("Heavier than it looks. The counterweight is doing most of the work.");
        }
      },
    });

    interaction.add({
      id: "floorScale",
      position: new Vector3(1.2, 0.1, 0),
      radius: 3.2,
      verb: "Read the scale",
      sub: "degrees, in the old notation",
      onInteract: () => {
        const z = this.beam.visible ? this.beam.landingZ : null;
        if (z === null) {
          hud.journal("Degrees, running north. Without light on the floor there is nothing to read.");
        } else {
          const alt = zToAltitude(z);
          hud.journal(`The southern edge of the light falls at ${fmtAngle(alt)}. That is the altitude of whatever is crossing.`, 9);
          this.ctx.book.record("meridian.reading", alt);
        }
      },
    });

    interaction.add({
      id: "inscription",
      position: this.inscriptionPos.clone(),
      radius: 2.4,
      verb: "Examine the wall",
      sub: "the cutting is very shallow",
      onInteract: () => {
        if (this._inscriptionRead) {
          hud.journal("“Set the arm to the crossing, and the house will answer.”", 8);
        } else {
          hud.journal("Something is cut here, but so shallowly that the lantern flattens it. It needs a light that comes from one side only.");
        }
      },
    });

    // Stellar Light aimed at the inscription rakes across it and reveals it.
    magic.addResonant({
      id: "inscriptionLit",
      position: this.inscriptionPos.clone(),
      radius: 1.5,
      quality: () => 0,
      onLit: (ramp) => {
        if (ramp > 0.5 && !this._inscriptionRead) {
          this._inscriptionRead = true;
          hud.journal("“Set the arm to the crossing, and the house will answer.”", 10);
          this.ctx.book.unlockFragment("meridian.inscription");
        }
      },
    });

    /* --- the resonant instrument ------------------------------------- */
    this.resonant = magic.addResonant({
      id: "meridianCircle",
      position: this.circle.centre.clone(),
      radius: 3.4,
      ringRadius: 3.0,
      quality: () => this.alignmentQuality(),
      onResonate: (q, dt, ramp) => {
        // The instrument itself trembles when it is close.
        this.circle.axis.push((Math.random() - 0.5) * q * q * 0.6);
        this._settleDust = Math.max(this._settleDust, q * ramp);
      },
      onComplete: () => this._solve(),
    });

    /* --- observation residues ----------------------------------------- */
    // Someone stood here, night after night, and read this scale.
    observation.addResidue(new Vector3(0.9, 0.15, altitudeToZ(62)), 0.85,
      "Someone knelt here often enough to wear the stone.", "trace");
    observation.addResidue(new Vector3(0, 4.35, 12.4), 0.7,
      "The arm has been swung ten thousand times. The metal remembers the path.", "trace");
    const sight = observation.residues[observation.residues.length - 1];
    sight.kind = "sightline";
    sight.dir = new Vector3(0, Math.sin(62 * DEG), -Math.cos(62 * DEG));
    sight.length = 26;

    this.ctx.hud.journal("A slit the length of the vault, and a line of bronze beneath it. The room is an instrument. What does it measure?", 10);
    return this;
  }

  /* ------------------------------------------------------------------ */

  /**
   * How correctly the instrument is configured, 0..1.
   *
   * Two conditions, and the player must understand both: the body has to be
   * *on the meridian* (that is what the room measures), and the arm has to be
   * set to the altitude it crosses at. Neither alone is enough, which is what
   * stops the puzzle from being solved by sweeping the arm.
   */
  alignmentQuality() {
    const sky = this.ctx.sky;
    const transit = 1 - clamp01(Math.abs(((sky.moonInfo.az - 180 + 540) % 360) - 180) / 2.6);
    const armAlt = this.circle.altitude;
    const alt = 1 - clamp01(Math.abs(armAlt - sky.moonInfo.alt) / 2.2);
    if (sky.moonInfo.alt < 5) return 0;
    return Math.pow(transit, 0.7) * Math.pow(alt, 0.85);
  }

  _solve() {
    if (this.solved) return;
    this.solved = true;
    const ctx = this.ctx;
    this.circle.locked = true;
    ctx.hud.banner("The house answers", "Hall of Meridian", 6);
    ctx.hud.journal("It was never a decoration. Every stone of this room was cut to hold one line steady.", 11);
    ctx.book.unlockFragment("meridian.solved");
    ctx.book.learnFigure("UMi");
    ctx.magic.unlock(2);            // Constellation Thread becomes possible
    if (ctx.audio) ctx.audio.mechanismWake();
    if (ctx.save) ctx.save.markSolved("hallOfMeridian");
    this._settleDust = 1;
  }

  /* ------------------------------------------------------------------ */

  update(dt) {
    const ctx = this.ctx;
    const sky = ctx.sky, time = ctx.time;
    this._t += dt;

    // --- the drum turns the night ---------------------------------------
    this.drumAxis.update(dt);
    Quaternion.RotationYawPitchRollToRef(this.drumAxis.visualAngle, 0, 0, this.drumRoot.rotationQuaternion);
    if (this._drumBase === undefined) this._drumBase = time.jd;
    // One full turn is two hours of sky. Turning it *is* the time control; there
    // is no slider anywhere in this game.
    const target = this._drumBase + (this.drumAxis.angle / TAU) * (2 / 24);
    if (Math.abs(target - time.jd) > 1e-9) {
      time.jd = target;
      time.paused = true;          // while the drum is being held, the night obeys it
    }
    if (!this.drumAxis.moving) time.paused = false;

    // --- the instrument -------------------------------------------------
    this.circle.update(dt);

    // --- the shaft ------------------------------------------------------
    // Moonlight, aimed by the real moon. When it is below the horizon or the
    // slit cannot see it, there is simply no beam.
    const md = sky.moonDir;
    const strength = clamp01(smoothstep(0.06, 0.35, md.y)) * clamp01(sky.moonInfo.illum * 1.4);
    _v.set(md.x, md.y, md.z);
    this.beam.setSource(_v, strength, [0.60, 0.71, 1.0]);
    this.beam.update(dt);

    // --- dust shaken loose ---------------------------------------------
    this._settleDust = damp(this._settleDust, 0, 0.02, dt);
    if (ctx.dust) {
      const d = Math.max(this.circle.disturbance, this._settleDust);
      if (d > 0.02) ctx.dust.disturb(this.circle.centre, d, 3.2);
    }

    // --- the way onward -------------------------------------------------
    if (this.solved) {
      this._shutterOpen = damp(this._shutterOpen, 1, 0.12, dt);
      const h = this._shutterOpen;
      // Stone rises; counterweights descend the shafts to meet it.
      this.shutterRoot.position.y = h * 4.35;
      this.weightRoot.position.y = 7.4 - h * 5.6;
      if (ctx.dust && h < 0.98) ctx.dust.disturb(this.shutterRoot.position, (1 - h) * 0.8, 4);
      if (ctx.camShakeTarget !== undefined) ctx.cam.shake = Math.max(ctx.cam.shake, (1 - h) * 0.5);
      if (this._shutterOpen > 0.55 && !this._passageOpen) {
        this._passageOpen = true;
        if (ctx.onPassageOpen) ctx.onPassageOpen();
      }
    }
  }
}

export { altitudeToZ, zToAltitude };
