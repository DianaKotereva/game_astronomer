/**
 * The protagonist, assembled.
 *
 * Owns the rig, the locomotion controller, the three cloth layers, the lantern
 * and the celestial focus, and keeps them agreeing with each other: the cloth is
 * pinned to bones that the controller moved, the lantern's flame drives the warm
 * light rig, and the focus reconfigures when the prepared spell changes.
 */
import { Vector3, Quaternion } from "../core/bjs.js";
import { Rig, RIG } from "./rig.js";
import { CharacterController } from "./controller.js";
import { ClothPanel } from "./cloth.js";
import { CelestialFocus, Lantern } from "./focus.js";
import { clamp, lerp, damp, TAU } from "../core/scratch.js";
import { tune, toggles } from "../core/tune.js";

const _v = new Vector3();
const _p = new Float32Array(3);

export class Player {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {import("../materials/materials.js").MaterialLib} mats
   * @param {import("../camera/thirdPerson.js").ThirdPersonCamera} cam
   * @param {import("../core/input.js").Input} input
   * @param {import("../world/lighting.js").Lighting} lighting
   */
  constructor(scene, mats, cam, input, lighting) {
    this.name = "player";
    this.order = 260;
    this.scene = scene;
    this.cam = cam;
    this.lighting = lighting;

    this.rig = new Rig(scene, mats);
    this.controller = new CharacterController(scene, this.rig, cam, input);
    this.lantern = new Lantern(scene, mats, this.rig.handL);
    this.focus = new CelestialFocus(scene, mats, this.rig.handR);

    this._buildCloth(scene, mats);

    /** Exterior spaces get wind; interiors are still (§8). */
    this.windStrength = 0;
    this.targetWind = 0;
    this._lastPos = new Vector3();
    this._vel = new Vector3();

    this.meshes = this.rig.meshes
      .concat(this.lantern.meshes, this.focus.meshes,
        [this.coat.mesh, this.mantle.mesh, this.scarf.mesh]);
  }

  _buildCloth(scene, mats) {
    const matCoat = mats.cloth({ key: "_coatpanel", seed: 131, color: [0.026, 0.030, 0.046], threads: 130, sheen: 0.14, wear: 0.45 });
    const matMantle = mats.cloth({ key: "_mantle", seed: 167, color: [0.040, 0.035, 0.030], threads: 105, sheen: 0.12, wear: 0.7 });
    const matScarf = mats.cloth({ key: "_scarf", seed: 199, color: [0.072, 0.055, 0.038], threads: 220, sheen: 0.10, wear: 0.9 });

    // The coat skirt: a tube pinned around the waist, flaring to the calf.
    this.coat = new ClothPanel(scene, {
      name: "coatSkirt", cols: 16, rows: 8, width: 0.34, length: 0.80,
      flare: 0.30, wrap: true, stiffness: 0.85, damping: 0.035, iterations: 6, windScale: 1,
    });
    this.coat.mesh.material = matCoat;
    this.coat.initialise((c, out) => {
      const a = (c / 16) * TAU;
      out[0] = Math.cos(a) * 0.17;
      out[1] = RIG.hipY + 0.06;
      out[2] = Math.sin(a) * 0.125;
    });

    // The mantle: a short shoulder cape, open at the front.
    this.mantle = new ClothPanel(scene, {
      name: "mantle", cols: 13, rows: 4, width: 0.42, length: 0.27,
      flare: 0.14, wrap: false, stiffness: 0.95, damping: 0.06, iterations: 6, windScale: 0.8,
    });
    this.mantle.mesh.material = matMantle;
    this.mantle.initialise((c, out) => {
      const t = c / 12;
      const a = -Math.PI * 0.72 + t * Math.PI * 1.44;
      out[0] = Math.sin(a) * 0.165;
      out[1] = RIG.shoulderY + 0.005;
      out[2] = -Math.cos(a) * 0.125;
    });

    // The scarf: a narrow strip over one shoulder, the most mobile layer.
    this.scarf = new ClothPanel(scene, {
      name: "scarf", cols: 4, rows: 9, width: 0.09, length: 0.44,
      flare: 0.15, wrap: false, stiffness: 0.7, damping: 0.02, iterations: 5, windScale: 1.5,
    });
    this.scarf.mesh.material = matScarf;
    this.scarf.initialise((c, out) => {
      out[0] = -0.10 + (c / 3) * 0.075;
      out[1] = RIG.neckY + 0.02;
      out[2] = -0.055;
    });

    this.panels = [this.coat, this.mantle, this.scarf];
    for (const p of this.panels) p.snapToPins();
  }

  get position() { return this.controller.position; }

  teleport(x, y, z, facing) {
    this.controller.teleport(x, y, z, facing);
    this.rig.root.position.set(x, y, z);
    this.rig.root.computeWorldMatrix(true);
    this._resetCloth();
  }

  /** Snap the cloth to its pinned frame — used after teleporting. */
  _resetCloth() {
    this._pinCloth();
    for (const p of this.panels) p.snapToPins();
    // A few settling steps so it arrives already hanging naturally.
    for (let i = 0; i < 24; i++) {
      this._pinCloth();
      for (const p of this.panels) p.update(1 / 60);
    }
  }

  setInterior(v) { this.targetWind = lerp(1, 0.06, v); }

  update(dt) {
    this.controller.update(dt);
    if (!toggles.character) return;

    const pos = this.controller.position;
    _v.copyFrom(pos).subtractInPlace(this._lastPos);
    if (dt > 1e-5) _v.scaleInPlace(1 / dt);
    this._vel.x = damp(this._vel.x, _v.x, 0.002, dt);
    this._vel.y = damp(this._vel.y, _v.y, 0.002, dt);
    this._vel.z = damp(this._vel.z, _v.z, 0.002, dt);
    this._lastPos.copyFrom(pos);

    this.windStrength = damp(this.windStrength, this.targetWind, 0.02, dt);

    this._pinCloth();
    for (let i = 0; i < this.panels.length; i++) {
      const p = this.panels[i];
      p.carrierVel.copyFrom(this._vel);
      // Wind blows from a fixed quarter, with the exterior/interior blend on top.
      p.wind.set(0.85 * this.windStrength, 0.06 * this.windStrength, -0.55 * this.windStrength);
      p.update(dt);
    }

    this.lantern.update(dt, this.controller.speed);
    this.focus.update(dt);

    // Hand the lantern's real flame position to the lighting rig, so the warm
    // light and its shadows swing with the lantern rather than with the body.
    const f = this.lantern.flamePos;
    _v.set(Math.sin(this.controller.facing), 0, Math.cos(this.controller.facing));
    _v.x = lerp(_v.x, Math.sin(this.cam.yaw), 0.55);
    _v.z = lerp(_v.z, Math.cos(this.cam.yaw), 0.55);
    _v.normalize();
    this.lighting.placeLantern(f, _v);
    this.lighting.lantern.intensity *= this.lantern.flicker;
    this.lighting.lanternCore.intensity *= this.lantern.flicker;
  }

  /**
   * Drive the pinned edges of every cloth panel from the current pose, and give
   * each panel the capsules it must not pass through.
   */
  _pinCloth() {
    const rig = this.rig;
    rig.pelvis.computeWorldMatrix(true);
    rig.chest.computeWorldMatrix(true);
    rig.neck.computeWorldMatrix(true);

    const facing = this.controller.facing;
    const cf = Math.cos(facing), sf = Math.sin(facing);
    const hip = rig.pelvis.getAbsolutePosition();
    const chest = rig.chest.getAbsolutePosition();
    const neck = rig.neck.getAbsolutePosition();

    // coat: a ring around the waist
    for (let c = 0; c < this.coat.cols; c++) {
      const a = (c / this.coat.cols) * TAU;
      const lx = Math.cos(a) * 0.175, lz = Math.sin(a) * 0.128;
      this.coat.setPin(c, hip.x + lx * cf + lz * sf, hip.y + 0.055, hip.z - lx * sf + lz * cf);
    }
    // mantle: an arc across the shoulders, open at the front
    for (let c = 0; c < this.mantle.cols; c++) {
      const t = c / (this.mantle.cols - 1);
      const a = -Math.PI * 0.72 + t * Math.PI * 1.44;
      const lx = Math.sin(a) * 0.168, lz = -Math.cos(a) * 0.128;
      this.mantle.setPin(c, chest.x + lx * cf + lz * sf, chest.y + 0.105, chest.z - lx * sf + lz * cf);
    }
    // scarf: over the left shoulder
    for (let c = 0; c < this.scarf.cols; c++) {
      const lx = -0.105 + (c / (this.scarf.cols - 1)) * 0.075;
      const lz = -0.048;
      this.scarf.setPin(c, neck.x + lx * cf + lz * sf, neck.y + 0.01, neck.z - lx * sf + lz * cf);
    }

    // Collision proxies: legs and torso. Cheap, and enough to keep the coat out
    // of the knees on a long stride.
    rig.thighL.computeWorldMatrix(true); rig.shinL.computeWorldMatrix(true);
    rig.thighR.computeWorldMatrix(true); rig.shinR.computeWorldMatrix(true);
    const tl = rig.thighL.getAbsolutePosition(), sl = rig.shinL.getAbsolutePosition();
    const tr = rig.thighR.getAbsolutePosition(), sr = rig.shinR.getAbsolutePosition();
    const fl = this.controller.footPos[0], fr = this.controller.footPos[1];

    for (const p of this.panels) {
      p.clearCapsules();
      p.addCapsule(tl.x, tl.y, tl.z, sl.x, sl.y, sl.z, 0.115);
      p.addCapsule(sl.x, sl.y, sl.z, fl.x, fl.y + 0.1, fl.z, 0.092);
      p.addCapsule(tr.x, tr.y, tr.z, sr.x, sr.y, sr.z, 0.115);
      p.addCapsule(sr.x, sr.y, sr.z, fr.x, fr.y + 0.1, fr.z, 0.092);
      p.addCapsule(hip.x, hip.y - 0.05, hip.z, chest.x, chest.y + 0.1, chest.z, 0.165);
    }
  }
}

export { RIG };
