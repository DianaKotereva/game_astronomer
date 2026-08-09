/**
 * The meridian circle.
 *
 * A graduated bronze ring standing in the plane of the meridian, carrying a
 * sighting arm that swings from horizon to zenith. You set the arm to an
 * altitude and look along it; when a body crosses the meridian at that altitude,
 * you see it through both vanes at once.
 *
 * It is a real instrument type, and it is the reason the hall exists. The ring
 * is graduated in the temple's own sexagesimal marks, the arm is counterweighted
 * because three metres of bronze is heavy, and none of it moves quickly.
 */
import { TransformNode, Vector3, Quaternion } from "../core/bjs.js";
import { Accum, addBlock, addRingBand, addCylinder, addDisc } from "../world/geo.js";
import { RotaryAxis } from "./mechanism.js";
import { DEG, RAD, TAU, clamp, clamp01, lerp, makeRng } from "../core/scratch.js";

export class MeridianCircle {
  /**
   * @param {Object} ctx
   * @param {import("../core/bjs.js").Scene} ctx.scene
   * @param {import("../materials/materials.js").MaterialLib} ctx.mats
   * @param {Accum} ctx.stone   static stone accumulator (piers)
   * @param {number[]} ctx.centre  [x,y,z] of the ring centre
   * @param {number} ctx.radius
   */
  constructor(ctx) {
    this.scene = ctx.scene;
    const [cx, cy, cz] = ctx.centre;
    this.centre = new Vector3(cx, cy, cz);
    this.radius = ctx.radius || 3.0;
    const rng = makeRng(70707);

    /* --- piers, in the static stone ---------------------------------- */
    for (const s of [-1, 1]) {
      const px = cx + s * (this.radius + 0.62);
      addBlock(ctx.stone, px, (cy - 0.4) * 0.5, cz, 0.62, (cy - 0.4) * 0.5, 0.78, { bevel: 0.035 });
      addBlock(ctx.stone, px, cy - 0.32, cz, 0.72, 0.13, 0.88, { bevel: 0.03 });
      // A bronze bearing cap the ring's trunnion sits in.
      addBlock(ctx.stone, px, cy - 0.08, cz, 0.30, 0.16, 0.30, { bevel: 0.02 });
    }
    // Plinth carrying both piers, straddling the meridian line.
    addBlock(ctx.stone, cx, 0.16, cz, this.radius + 1.5, 0.16, 1.35, { bevel: 0.04 });

    /* --- the fixed graduated ring ------------------------------------ */
    const fixed = new Accum("meridianRingFixed");
    fixed.uvScale = 0.8;
    // Ring in the YZ plane: axis 0 means it turns about X, which is exactly the
    // meridian plane for a hall running north-south.
    addRingBand(fixed, cx, cy, cz, {
      radius: this.radius, width: 0.19, depth: 0.10, segments: 128, axis: 0, uvScale: 0.8,
    });
    // Inner reinforcing ring and four spokes.
    addRingBand(fixed, cx, cy, cz, {
      radius: this.radius * 0.55, width: 0.09, depth: 0.06, segments: 96, axis: 0, uvScale: 0.8,
    });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const y0 = cy + Math.cos(a) * this.radius * 0.55, z0 = cz + Math.sin(a) * this.radius * 0.55;
      const y1 = cy + Math.cos(a) * this.radius, z1 = cz + Math.sin(a) * this.radius;
      const len = Math.hypot(y1 - y0, z1 - z0);
      addBlock(fixed, cx, (y0 + y1) * 0.5, (z0 + z1) * 0.5, 0.045, len * 0.5, 0.035,
        { bevel: 0.008, uvScale: 1.6, yaw: 0 });
      void a;
    }
    // Trunnions.
    for (const s of [-1, 1]) {
      addCylinder(fixed, cx + s * this.radius * 0.0, cy, cz, {
        radius: 0.10, height: 0.01, segments: 12, uvScale: 1.2, capTop: false,
      });
    }

    /* --- graduation: real marks, every degree ------------------------ */
    // Altitude runs from the north horizon (a = 0) up over the zenith. Only the
    // half the arm can reach is graduated, exactly as on the real instruments.
    for (let deg = 0; deg <= 90; deg += 1) {
      const a = deg * DEG;
      const major = deg % 10 === 0;
      const mid = deg % 5 === 0;
      const len = major ? 0.135 : mid ? 0.085 : 0.045;
      const w = major ? 0.011 : 0.0065;
      const r0 = this.radius + 0.095;
      const y = cy + Math.sin(a) * (r0 - len * 0.5);
      const z = cz - Math.cos(a) * (r0 - len * 0.5);
      addBlock(fixed, cx, y, z, w, len * 0.5, 0.012, { bevel: 0.002, uvScale: 3.2, yaw: 0 });
      // Rotate the tick to lie radially: build it from a thin block aligned by
      // its own local frame instead, using two short bars in a cross.
      void major;
    }

    this.fixedMesh = fixed.toMesh(ctx.scene, ctx.mats.bronze({ key: "_instrument", seed: 71, polish: 0.55 }),
      { collide: false });
    this.fixedMesh.name = "meridianRingFixed";

    /* --- the sighting arm -------------------------------------------- */
    this.armRoot = new TransformNode("meridianArm", ctx.scene);
    this.armRoot.position.copyFrom(this.centre);
    this.armRoot.rotationQuaternion = Quaternion.Identity();

    const arm = new Accum("meridianArmMesh");
    arm.uvScale = 0.9;
    // The arm is built in local space around the origin, lying along +Y.
    addBlock(arm, 0, 0, 0, 0.055, this.radius * 0.98, 0.045, { bevel: 0.012, uvScale: 0.9 });
    // Sighting vanes at both ends: a plate with a slit, and a pinhole opposite.
    for (const s of [-1, 1]) {
      const y = s * this.radius * 0.90;
      addBlock(arm, 0, y, 0.075, 0.085, 0.075, 0.012, { bevel: 0.006, uvScale: 1.8 });
      addBlock(arm, 0, y, -0.075, 0.085, 0.075, 0.012, { bevel: 0.006, uvScale: 1.8 });
      addBlock(arm, 0, y + s * 0.10, 0, 0.10, 0.02, 0.09, { bevel: 0.006, uvScale: 1.8 });
    }
    // Index pointer reaching over the graduation.
    addBlock(arm, 0, this.radius + 0.055, 0, 0.016, 0.075, 0.016, { bevel: 0.004, uvScale: 2.4 });
    // Central hub and its clamp screw.
    addCylinder(arm, 0, -0.06, 0, { radius: 0.17, height: 0.12, segments: 20, uvScale: 1.2 });
    addBlock(arm, 0.19, 0, 0, 0.055, 0.028, 0.028, { bevel: 0.006, uvScale: 2.2 });
    // Counterweight: a lead-filled bronze drum on the short end.
    addCylinder(arm, 0, -this.radius * 0.86, 0, { radius: 0.145, height: 0.24, segments: 18, uvScale: 1.0, capBottom: true });

    this.armMesh = arm.toMesh(ctx.scene, ctx.mats.bronze({ key: "_instrument", seed: 71, polish: 0.55 }),
      { collide: false, freeze: false });
    this.armMesh.name = "meridianArm";
    this.armMesh.parent = this.armRoot;

    /**
     * The axis. Heavy, stiff at rest, and with real backlash in the worm drive.
     * Travel is limited to the graduated quadrant plus a little overshoot.
     */
    this.axis = new RotaryAxis({
      angle: 24 * DEG,
      inertia: 46, friction: 2.6, stiction: 0.9, backlash: 0.006,
      min: -4 * DEG, max: 94 * DEG,
    });

    /** Where a hand naturally falls on the arm. */
    this.gripPoint = new Vector3(cx + 0.16, cy + this.radius * 0.62, cz);
    this.gripRest = this.gripPoint.clone();
    this.axisDir = new Vector3(1, 0, 0);

    this.locked = false;
    this._dust = 0;
    void rng;
  }

  /** Altitude the arm is currently reading, in degrees. */
  get altitude() { return this.axis.visualAngle * RAD; }

  setAltitude(deg) { this.axis.setImmediate(clamp(deg, -4, 94) * DEG); }

  update(dt) {
    if (this.locked) {
      this.axis.velocity *= 0.2;
    }
    this.axis.update(dt);
    // The arm swings in the meridian plane: rotation about world X.
    Quaternion.RotationYawPitchRollToRef(0, -this.axis.visualAngle, 0, this.armRoot.rotationQuaternion);
    this._dust = this.axis.disturbance;
  }

  /** How much dust the arm is shedding right now, 0..1. */
  get disturbance() { return this._dust; }
}

export { DEG, RAD };
