/**
 * The celestial focus, and the lantern.
 *
 * The focus is deliberately not a wizard's staff. It is a hand instrument that
 * happens also to be a magical implement: a blackened-metal fork carrying three
 * brass rings on a common centre, a sighting vane, a small lens, and a fragment
 * of meteoric iron at the pivot. It is held the way you hold an astrolabe.
 *
 * Its rings reconfigure when the player changes which star-spell is prepared —
 * that reconfiguration *is* the spell-selection UI (§61). No hotbar exists.
 */
import { TransformNode, Vector3, Quaternion, Color3, PointLight } from "../core/bjs.js";
import { PartAccum, capsuleData, capsuleMatrix } from "./rig.js";
import { Matrix } from "../core/bjs.js";
import { TAU, lerp, damp, clamp01 } from "../core/scratch.js";
import { tune } from "../core/tune.js";

const _m = Matrix.Identity();

/** Ring band as a torus of small capsules — cheap and reads correctly. */
function ringData(radius, tube, seg = 28) {
  const acc = new PartAccum();
  const step = TAU / seg;
  for (let i = 0; i < seg; i++) {
    const a0 = i * step, a1 = (i + 1) * step;
    const x0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
    acc.add(capsuleData(Math.hypot(x1 - x0, z1 - z0), tube, tube, 6, 2),
      capsuleMatrix(x0, 0, z0, x1 - x0, 0, z1 - z0, _m));
  }
  return acc;
}

export class CelestialFocus {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {import("../materials/materials.js").MaterialLib} mats
   * @param {TransformNode} hand
   */
  constructor(scene, mats, hand) {
    this.scene = scene;
    this.root = new TransformNode("focus", scene);
    this.root.parent = hand;
    this.root.position.set(0.0, -0.075, 0.03);
    this.root.rotationQuaternion = Quaternion.RotationYawPitchRoll(0, -0.35, 0.2);

    const matDark = mats.wood({ key: "_focusdark", seed: 617 });
    const matBrass = mats.brass({ key: "_focusbrass", seed: 83 });

    // --- frame: a blackened fork with a handle -----------------------------
    const frame = new PartAccum();
    frame.add(capsuleData(0.135, 0.0125, 0.011, 8, 3), capsuleMatrix(0, -0.135, 0, 0, 1, 0, _m));  // grip
    frame.add(capsuleData(0.030, 0.017, 0.014, 8, 2), capsuleMatrix(0, -0.010, 0, 0, 1, 0, _m));   // collar
    for (const s of [-1, 1]) {
      frame.add(capsuleData(0.115, 0.0075, 0.0060, 6, 2), capsuleMatrix(s * 0.012, 0.018, 0, s * 0.30, 1, 0, _m));
    }
    this.frameMesh = frame.toMesh(scene, "focusFrame", matDark);
    this.frameMesh.parent = this.root;

    // --- three rings on a common centre ------------------------------------
    this.ringRoot = new TransformNode("focusRings", scene);
    this.ringRoot.parent = this.root;
    this.ringRoot.position.set(0, 0.105, 0);
    this.ringRoot.rotationQuaternion = Quaternion.Identity();

    this.rings = [];
    const radii = [0.062, 0.050, 0.038];
    for (let i = 0; i < 3; i++) {
      const node = new TransformNode("focusRing" + i, scene);
      node.parent = this.ringRoot;
      node.rotationQuaternion = Quaternion.Identity();
      const mesh = ringData(radii[i], 0.0035 - i * 0.0004, 26).toMesh(scene, "focusRingMesh" + i, matBrass);
      mesh.parent = node;
      this.rings.push({ node, mesh, radius: radii[i], base: i * 0.6, target: new Vector3(0, 0, 0), current: new Vector3() });
    }

    // Sighting vane and lens on the outer frame.
    const fittings = new PartAccum();
    fittings.add(capsuleData(0.030, 0.0060, 0.0055, 6, 2), capsuleMatrix(0.062, 0.105, 0, 0, 1, 0, _m));
    fittings.add(capsuleData(0.004, 0.0125, 0.0125, 12, 2), capsuleMatrix(0.062, 0.133, 0, 0, 1, 0, _m));  // vane ring
    fittings.add(capsuleData(0.005, 0.0140, 0.0140, 14, 2), capsuleMatrix(-0.062, 0.105, 0, 0, 1, 0, _m)); // lens bezel
    this.fittingsMesh = fittings.toMesh(scene, "focusFittings", matBrass);
    this.fittingsMesh.parent = this.root;

    // The meteoric core at the pivot — the only part that ever lights up.
    const core = new PartAccum();
    core.add(capsuleData(0.010, 0.0095, 0.0095, 10, 3), capsuleMatrix(0, 0.100, 0, 0, 1, 0, _m));
    this.coreMesh = core.toMesh(scene, "focusCore", mats.emissive("focusCore", [0.42, 0.55, 1.0], 0.35));
    this.coreMesh.parent = this.root;

    /** A tiny light so the focus actually contributes to the scene when active. */
    this.light = new PointLight("focusLight", new Vector3(0, 0, 0), scene);
    this.light.diffuse = new Color3(0.52, 0.65, 1.0);
    this.light.intensity = 0;
    this.light.range = 3.2;
    this.light.parent = this.ringRoot;

    this.meshes = [this.frameMesh, this.fittingsMesh, this.coreMesh].concat(this.rings.map((r) => r.mesh));

    /** Which spell the focus is configured for. */
    this.mode = 0;
    this._charge = 0;
    this._spin = 0;
  }

  /**
   * Reconfigure for a spell. Each arrangement is distinct enough to be read at a
   * glance from behind the character — which is the whole point of doing
   * selection diegetically.
   */
  setMode(mode) { this.mode = mode; }

  /** 0..1 — how much power is currently running through the instrument. */
  setCharge(v) { this._charge = v; }

  update(dt) {
    this._spin += dt * (0.22 + this._charge * 2.6);
    const m = this.mode;
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      // Each mode is a distinct arrangement of the three rings.
      let px = 0, py = 0, pz = 0;
      switch (m) {
        case 1:  // Stellar Light — rings stack into a collimating tube
          px = 0; py = this._spin * (0.6 + i * 0.2); pz = 0.02 * i; break;
        case 2:  // Constellation Thread — rings splay into a flat figure
          px = 1.5708; py = this._spin * 0.4 + i * 2.09; pz = 0; break;
        case 3:  // Celestial Resonance — nested and counter-rotating
          px = 0.35 + i * 0.5; py = this._spin * (i % 2 ? -1 : 1); pz = 0; break;
        case 4:  // Gravity Lens — rings tilt into a shallow bowl
          px = 0.9 - i * 0.28; py = this._spin * 0.25; pz = 0.4 * i; break;
        case 5:  // Astral Recall — rings sit still, slightly offset, like a record
          px = 0.12 * i; py = i * 1.05; pz = 0.08 * i; break;
        default: // idle: gently precessing armillary
          px = 0.42 + Math.sin(this._spin * 0.5 + i) * 0.06;
          py = this._spin * (0.25 + i * 0.08);
          pz = i * 0.22; break;
      }
      r.target.set(px, py, pz);
      r.current.x = damp(r.current.x, r.target.x, 0.0025, dt);
      r.current.z = damp(r.current.z, r.target.z, 0.0025, dt);
      // Yaw runs continuously, so it is followed rather than damped toward.
      r.current.y = r.target.y;
      Quaternion.RotationYawPitchRollToRef(r.current.y, r.current.x, r.current.z, r.node.rotationQuaternion);
    }

    const glow = 0.25 + this._charge * 2.4;
    if (this.coreMesh && this.coreMesh.material) {
      const e = this.coreMesh.material.emissiveColor;
      e.set(0.42 * glow, 0.55 * glow, 1.0 * glow);
    }
    this.light.intensity = this._charge * 1.6 * tune.magicGlow;
  }
}

/**
 * The lantern. Warm, small, and the only mundane light the player owns —
 * deliberately never replaced by magic (§41).
 */
export class Lantern {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {import("../materials/materials.js").MaterialLib} mats
   * @param {TransformNode} hand
   */
  constructor(scene, mats, hand) {
    this.scene = scene;
    this.root = new TransformNode("lantern", scene);
    this.root.parent = hand;
    this.root.position.set(0, -0.10, 0.015);
    this.root.rotationQuaternion = Quaternion.Identity();

    // The body hangs from a bail, so it stays upright as the hand swings.
    this.body = new TransformNode("lanternBody", scene);
    this.body.parent = this.root;
    this.body.rotationQuaternion = Quaternion.Identity();

    const matMetal = mats.brass({ key: "_lantern", seed: 271 });
    const acc = new PartAccum();
    // bail
    acc.add(capsuleData(0.055, 0.0035, 0.0035, 6, 2), capsuleMatrix(-0.028, 0.0, 0, 0.55, 1, 0, _m));
    acc.add(capsuleData(0.055, 0.0035, 0.0035, 6, 2), capsuleMatrix(0.028, 0.0, 0, -0.55, 1, 0, _m));
    // top cap and vents
    acc.add(capsuleData(0.014, 0.042, 0.030, 10, 2), capsuleMatrix(0, -0.062, 0, 0, 1, 0, _m));
    // four uprights
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      acc.add(capsuleData(0.085, 0.0035, 0.0035, 5, 2),
        capsuleMatrix(Math.cos(a) * 0.030, -0.148, Math.sin(a) * 0.030, 0, 1, 0, _m));
    }
    // base
    acc.add(capsuleData(0.016, 0.038, 0.034, 10, 2), capsuleMatrix(0, -0.164, 0, 0, 1, 0, _m));
    this.frameMesh = acc.toMesh(scene, "lanternFrame", matMetal);
    this.frameMesh.parent = this.body;

    const flame = new PartAccum();
    flame.add(capsuleData(0.022, 0.011, 0.006, 8, 3), capsuleMatrix(0, -0.132, 0, 0, 1, 0, _m));
    this.flameMesh = flame.toMesh(scene, "lanternFlame", mats.emissive("flame", [1.0, 0.62, 0.26], 2.6));
    this.flameMesh.parent = this.body;

    this.meshes = [this.frameMesh];
    this._swing = 0; this._swingVel = 0;
    this._flicker = 0;
    /** World position of the flame, handed to the lighting rig each frame. */
    this.flamePos = new Vector3();
  }

  update(dt, carrierSpeed) {
    // Pendulum: the lantern hangs, so it lags the hand and settles slowly.
    const drive = carrierSpeed * 0.06;
    this._swingVel += (-this._swing * 26 - this._swingVel * 3.2) * dt + Math.sin(performance.now() * 0.004) * drive * dt;
    this._swing += this._swingVel * dt;
    Quaternion.RotationYawPitchRollToRef(0, this._swing, this._swing * 0.5, this.body.rotationQuaternion);

    // Flame flicker: two incommensurate frequencies so it never looks periodic.
    const t = performance.now() * 0.001;
    this._flicker = 0.86 + 0.10 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 17.7 + 1.2) + 0.04 * Math.sin(t * 3.1);
    if (this.flameMesh && this.flameMesh.material) {
      const k = this._flicker * 2.6;
      this.flameMesh.material.emissiveColor.set(1.0 * k, 0.62 * k, 0.26 * k);
    }
    this.body.computeWorldMatrix(true);
    this.flamePos.copyFrom(this.body.getAbsolutePosition());
    this.flamePos.y -= 0.132;
  }

  get flicker() { return this._flicker; }
}
