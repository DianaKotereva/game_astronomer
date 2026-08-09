/**
 * Locomotion, foot planting and arm IK.
 *
 * There are no animation clips. The walk is generated from a stride phase that
 * advances with *distance travelled*, not with time, and each foot is pinned to
 * a world position for the whole of its stance — which is the only way to be
 * certain the character never skates (§80). Arms solve two-bone IK toward
 * targets, so the same code that swings them while walking also puts a hand on a
 * bronze ring when the player grips one.
 */
import { Vector3, Quaternion, Ray, MeshBuilder } from "../core/bjs.js";
import { RIG } from "./rig.js";
import { clamp, clamp01, lerp, damp, wrapPi, TAU, DEG, smoothstep } from "../core/scratch.js";
import { tune, toggles } from "../core/tune.js";

const _v = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _q = new Quaternion();
const _ray = new Ray(new Vector3(), new Vector3(0, -1, 0), 4);
const _up = new Vector3(0, 1, 0);

/** Aim a bone whose rest direction is local -Y along a world direction. */
function aimBone(node, wx, wy, wz, twist = 0) {
  const parent = node.parent;
  _v.set(wx, wy, wz);
  const l = _v.length();
  if (l < 1e-5) return;
  _v.scaleInPlace(1 / l);
  if (parent) {
    parent.computeWorldMatrix(true);
    const inv = parent.getWorldMatrix().clone().invert();
    Vector3.TransformNormalToRef(_v, inv, _v2);
    _v2.normalize();
  } else {
    _v2.copyFrom(_v);
  }
  // Rotation taking (0,-1,0) to _v2
  const dot = -_v2.y;
  if (dot > 0.99999) {
    Quaternion.RotationAxisToRef(_up, twist, node.rotationQuaternion);
    return;
  }
  if (dot < -0.99999) {
    Quaternion.RotationAxisToRef(new Vector3(1, 0, 0), Math.PI, node.rotationQuaternion);
    return;
  }
  // axis = (0,-1,0) x v
  const ax = -(-1) * _v2.z * 0 + (-1) * 0; // expanded below for clarity
  void ax;
  const cx = (-1) * _v2.z - 0 * _v2.y;
  const cy = 0 * _v2.x - 0 * _v2.z;
  const cz = 0 * _v2.y - (-1) * _v2.x;
  _v3.set(cx * -1, cy, cz * -1);
  // cross((0,-1,0), v) = (-1*v.z - 0, 0 - 0, 0 - (-1)*v.x) = (-v.z, 0, v.x)
  _v3.set(-_v2.z, 0, _v2.x);
  const len = _v3.length();
  if (len < 1e-6) { _v3.set(1, 0, 0); } else { _v3.scaleInPlace(1 / len); }
  const angle = Math.acos(clamp(dot, -1, 1));
  Quaternion.RotationAxisToRef(_v3, angle, node.rotationQuaternion);
  if (twist !== 0) {
    Quaternion.RotationAxisToRef(_v2, twist, _q);
    node.rotationQuaternion.multiplyInPlace(_q);
  }
}

/**
 * Two-bone IK. Places `upper` and `lower` so the chain from `originWorld`
 * reaches `targetWorld`, bending toward `poleWorld`.
 */
function solveTwoBone(upper, lower, originX, originY, originZ, tx, ty, tz, poleX, poleY, poleZ, l1, l2) {
  let dx = tx - originX, dy = ty - originY, dz = tz - originZ;
  let dist = Math.hypot(dx, dy, dz);
  const maxLen = (l1 + l2) * 0.998;
  if (dist > maxLen) { const k = maxLen / dist; dx *= k; dy *= k; dz *= k; dist = maxLen; }
  if (dist < 1e-4) return;
  const minLen = Math.abs(l1 - l2) + 0.02;
  if (dist < minLen) { const k = minLen / dist; dx *= k; dy *= k; dz *= k; dist = minLen; }

  // Angle at the root between the chain direction and the upper bone.
  const cosA = clamp((dist * dist + l1 * l1 - l2 * l2) / (2 * dist * l1), -1, 1);
  const a = Math.acos(cosA);

  // Build a frame: chain direction, and a perpendicular toward the pole.
  const ix = dx / dist, iy = dy / dist, iz = dz / dist;
  let px = poleX, py = poleY, pz = poleZ;
  const pd = px * ix + py * iy + pz * iz;
  px -= ix * pd; py -= iy * pd; pz -= iz * pd;
  let pl = Math.hypot(px, py, pz);
  if (pl < 1e-5) { px = 0; py = 0; pz = 1; pl = 1; }
  px /= pl; py /= pl; pz /= pl;

  const ca = Math.cos(a), sa = Math.sin(a);
  const ux = ix * ca + px * sa, uy = iy * ca + py * sa, uz = iz * ca + pz * sa;
  aimBone(upper, ux, uy, uz);

  const kneeX = originX + ux * l1, kneeY = originY + uy * l1, kneeZ = originZ + uz * l1;
  aimBone(lower, tx - kneeX, ty - kneeY, tz - kneeZ);
}

export class CharacterController {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {import("./rig.js").Rig} rig
   * @param {import("../camera/thirdPerson.js").ThirdPersonCamera} cam
   * @param {import("../core/input.js").Input} input
   */
  constructor(scene, rig, cam, input) {
    this.name = "character";
    this.order = 250;
    this.scene = scene;
    this.rig = rig;
    this.cam = cam;
    this.input = input;

    // Movement proxy. Babylon's collide-and-slide works on a mesh, and keeping
    // it separate from the visible rig means the body can lean and bob without
    // ever affecting where the player actually is.
    this.proxy = MeshBuilder.CreateBox("playerProxy", { width: 0.5, height: 1.7, depth: 0.5 }, scene);
    this.proxy.isVisible = false;
    this.proxy.isPickable = false;
    this.proxy.checkCollisions = true;
    this.proxy.ellipsoid = new Vector3(0.32, 0.85, 0.32);
    this.proxy.ellipsoidOffset = new Vector3(0, 0.85, 0);
    this.proxy.position.set(0, 0.02, -11);

    this.velocity = new Vector3();
    this.speed = 0;
    this.facing = 0;             // yaw the body is turned to
    this.targetFacing = 0;
    this.grounded = true;
    this.verticalVel = 0;

    // stride
    this.phase = 0;
    this.strideLength = 1.32;
    this.footPlant = [new Vector3(), new Vector3()];
    this.footPrev = [new Vector3(), new Vector3()];
    this.footPos = [new Vector3(), new Vector3()];
    this.footDown = [1, 0];       // 1 = planted
    this._initFeet = false;

    this.leanX = 0; this.leanZ = 0;
    this.bob = 0;
    this.headYaw = 0; this.headPitch = 0;

    /** Where the hands are asked to be. Null means "use the walk pose". */
    this.handTargetL = null;
    this.handTargetR = null;
    this.handBlendL = 0;
    this.handBlendR = 0;

    /** Set by the interaction system while gripping a mechanism. */
    this.gripping = null;

    this.enabledMovement = true;
    this.moveScale = 1;
    this._groundY = 0;
  }

  get position() { return this.proxy.position; }

  teleport(x, y, z, facing = 0) {
    this.proxy.position.set(x, y, z);
    this.facing = this.targetFacing = facing;
    this.velocity.setAll(0);
    this._initFeet = false;
  }

  update(dt) {
    if (!toggles.character) { this.rig.setEnabled(false); return; }
    this.rig.setEnabled(true);

    const inp = this.input;
    const cam = this.cam;

    // --- desired movement in camera space --------------------------------
    let ix = 0, iy = 0;
    if (this.enabledMovement && !inp.modal) { ix = inp.moveX(); iy = inp.moveY(); }
    const mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }

    const jog = inp.isDown("ShiftLeft") || inp.isDown("ShiftRight");
    const observing = cam.observe > 0.5;
    let target = (jog ? tune.jogSpeed : tune.walkSpeed) * this.moveScale;
    if (observing) target *= 0.42;
    const wanted = mag * target;

    // Camera-relative basis
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const dirX = sy * iy + cy * ix;
    const dirZ = cy * iy - sy * ix;

    // Acceleration: deliberate, never twitchy.
    const accel = wanted > this.speed ? 9.5 : 13;
    this.speed = damp(this.speed, wanted, Math.exp(-accel * 0.06), dt);
    if (this.speed < 0.02) this.speed = 0;

    if (mag > 0.01) {
      this.targetFacing = Math.atan2(dirX, dirZ);
    }
    const turn = wrapPi(this.targetFacing - this.facing);
    this.facing += turn * clamp(dt * (9 + this.speed * 2.2), 0, 1);

    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    this.velocity.x = fx * this.speed;
    this.velocity.z = fz * this.speed;

    // --- gravity and collision -------------------------------------------
    this.verticalVel -= 15.5 * dt;
    if (this.verticalVel < -22) this.verticalVel = -22;
    _v.set(this.velocity.x * dt, this.verticalVel * dt, this.velocity.z * dt);
    const before = this.proxy.position.y;
    this.proxy.moveWithCollisions(_v);
    const after = this.proxy.position.y;
    if (after - before > this.verticalVel * dt + 0.0001) {
      this.grounded = true;
      this.verticalVel = 0;
    } else {
      this.grounded = after - before > -0.0005;
      if (this.grounded) this.verticalVel = 0;
    }

    // --- pose -------------------------------------------------------------
    const rig = this.rig;
    rig.root.position.copyFrom(this.proxy.position);
    Quaternion.RotationYawPitchRollToRef(this.facing, 0, 0, rig.root.rotationQuaternion);

    this._updateStride(dt);
    this._updateLegs(dt);
    this._updateSpine(dt);
    this._updateArms(dt);
  }

  /* ------------------------------------------------------------------ */

  _groundAt(x, z, fromY) {
    _ray.origin.set(x, fromY + 1.1, z);
    _ray.direction.set(0, -1, 0);
    _ray.length = 3.2;
    const hit = this.scene.pickWithRay(_ray, (m) => m.checkCollisions, false);
    return hit && hit.hit ? hit.pickedPoint.y : fromY;
  }

  _updateStride(dt) {
    const p = this.proxy.position;
    if (!this._initFeet) {
      this._initFeet = true;
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        const ox = Math.cos(this.facing) * side * RIG.hipX;
        const oz = -Math.sin(this.facing) * side * RIG.hipX;
        this.footPlant[i].set(p.x + ox, p.y, p.z + oz);
        this.footPos[i].copyFrom(this.footPlant[i]);
        this.footPrev[i].copyFrom(this.footPlant[i]);
      }
      this.phase = 0;
    }

    // Phase advances with distance, so the feet cannot slide however the speed
    // ramps. Standing still lets the phase settle to a neutral stance.
    if (this.speed > 0.05) {
      this.phase += (this.speed * dt) / this.strideLength;
      this.phase %= 1;
    } else {
      const toNeutral = wrapPi((0 - this.phase) * TAU) / TAU;
      this.phase = (this.phase + toNeutral * clamp(dt * 3.4, 0, 1) + 1) % 1;
    }

    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    const rx = fz, rz = -fx;
    const stride = this.strideLength * clamp(this.speed / Math.max(0.3, tune.jogSpeed), 0.35, 1.05);

    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      // Left foot swings in the second half of the cycle, right in the first.
      const local = (this.phase + (i === 0 ? 0.5 : 0)) % 1;
      const swinging = local > 0.5 && this.speed > 0.05;
      if (swinging) {
        if (this.footDown[i]) {
          this.footDown[i] = 0;
          this.footPrev[i].copyFrom(this.footPos[i]);
          // Plant target: half a stride ahead of where the body will be.
          const tx = p.x + fx * stride * 0.5 + rx * side * RIG.hipX * 1.15;
          const tz = p.z + fz * stride * 0.5 + rz * side * RIG.hipX * 1.15;
          const gy = this._groundAt(tx, tz, p.y);
          this.footPlant[i].set(tx, gy, tz);
        }
        const s = clamp01((local - 0.5) * 2);
        const e = smoothstep(0, 1, s);
        const a = this.footPrev[i], b = this.footPlant[i];
        this.footPos[i].x = lerp(a.x, b.x, e);
        this.footPos[i].z = lerp(a.z, b.z, e);
        // Lift with a heel-then-toe feel: rise fast, settle slow.
        const lift = Math.sin(s * Math.PI) * (0.055 + this.speed * 0.022);
        this.footPos[i].y = lerp(a.y, b.y, e) + lift * (1 - s * 0.25);
      } else {
        this.footDown[i] = 1;
        // Planted: the foot does not move at all, whatever the body does.
        this.footPos[i].copyFrom(this.footPlant[i]);
      }
    }

    // Body bob follows the double-support rhythm, twice per stride.
    const bobT = Math.abs(Math.sin(this.phase * TAU));
    this.bob = damp(this.bob, -0.026 * bobT * clamp(this.speed / 1.6, 0, 1.3), 0.001, dt);
  }

  _updateLegs(dt) {
    const rig = this.rig;
    // Pelvis position in world, with bob.
    rig.pelvis.position.y = RIG.hipY + this.bob;
    rig.pelvis.computeWorldMatrix(true);

    for (let i = 0; i < 2; i++) {
      const thigh = i === 0 ? rig.thighL : rig.thighR;
      const shin = i === 0 ? rig.shinL : rig.shinR;
      const foot = i === 0 ? rig.footL : rig.footR;
      thigh.computeWorldMatrix(true);
      const hip = thigh.getAbsolutePosition();
      const t = this.footPos[i];
      // Ankle sits above the foot's ground contact.
      const ankleY = t.y + 0.11;
      // Knee pole: forward and slightly outward.
      const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
      solveTwoBone(thigh, shin,
        hip.x, hip.y, hip.z,
        t.x, ankleY, t.z,
        fx, 0.15, fz,
        RIG.thigh, RIG.shin);
      shin.computeWorldMatrix(true);
      // Foot: roll through the step rather than staying flat.
      const local = (this.phase + (i === 0 ? 0.5 : 0)) % 1;
      let pitch = 0;
      if (this.speed > 0.05) {
        if (local < 0.12) pitch = lerp(0.22, 0, local / 0.12);          // heel strike
        else if (local > 0.38 && local < 0.5) pitch = -lerp(0, 0.42, (local - 0.38) / 0.12); // toe off
        else if (local > 0.5) pitch = lerp(-0.42, 0.22, clamp01((local - 0.5) * 2));
      }
      Quaternion.RotationYawPitchRollToRef(0, pitch, 0, foot.rotationQuaternion);
    }
    void dt;
  }

  _updateSpine(dt) {
    const rig = this.rig;
    const sp = clamp(this.speed / Math.max(0.5, tune.jogSpeed), 0, 1);
    // Lean into acceleration and into turns.
    const turnRate = wrapPi(this.targetFacing - this.facing);
    this.leanZ = damp(this.leanZ, -turnRate * 0.22 * sp, 0.002, dt);
    this.leanX = damp(this.leanX, sp * 0.075, 0.002, dt);

    // Counter-rotation: shoulders swing opposite to the hips.
    const swing = Math.sin(this.phase * TAU) * sp;
    Quaternion.RotationYawPitchRollToRef(swing * 0.10, this.leanX, this.leanZ * 0.5, rig.pelvis.rotationQuaternion);
    Quaternion.RotationYawPitchRollToRef(-swing * 0.16, this.leanX * 0.5, this.leanZ, rig.chest.rotationQuaternion);
    Quaternion.RotationYawPitchRollToRef(0, -this.leanX * 0.4, 0, rig.spine.rotationQuaternion);

    // The head drifts toward where the camera is looking — she is an observer,
    // and her attention should read from behind.
    const rel = wrapPi(this.cam.yaw - this.facing);
    this.headYaw = damp(this.headYaw, clamp(rel, -0.85, 0.85) * 0.55, 0.002, dt);
    this.headPitch = damp(this.headPitch, clamp(this.cam.pitch, -0.9, 0.9) * 0.42, 0.002, dt);
    Quaternion.RotationYawPitchRollToRef(this.headYaw * 0.45, this.headPitch * 0.5, 0, rig.neck.rotationQuaternion);
    Quaternion.RotationYawPitchRollToRef(this.headYaw * 0.55, this.headPitch * 0.5, 0, rig.head.rotationQuaternion);
  }

  _updateArms(dt) {
    const rig = this.rig;
    const sp = clamp(this.speed / Math.max(0.5, tune.jogSpeed), 0, 1);
    const swing = Math.sin(this.phase * TAU);

    rig.chest.computeWorldMatrix(true);
    rig.armL.computeWorldMatrix(true);
    rig.armR.computeWorldMatrix(true);
    const shL = rig.armL.getAbsolutePosition();
    const shR = rig.armR.getAbsolutePosition();

    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    const rx = fz, rz = -fx;
    const reach = RIG.upperArm + RIG.foreArm;

    // Default poses. The left hand carries the lantern out and slightly forward
    // so it lights the ground ahead; the right holds the focus close to the
    // body, ready rather than brandished.
    this.handBlendL = damp(this.handBlendL, this.handTargetL ? 1 : 0, 0.0008, dt);
    this.handBlendR = damp(this.handBlendR, this.handTargetR ? 1 : 0, 0.0008, dt);

    // --- left (lantern) ---
    let lx = shL.x + fx * 0.22 - rx * 0.16;
    let ly = shL.y - 0.46 + swing * 0.035 * sp;
    let lz = shL.z + fz * 0.22 - rz * 0.16;
    lx += fx * swing * 0.055 * sp;
    lz += fz * swing * 0.055 * sp;
    if (this.handTargetL) {
      const b = this.handBlendL;
      lx = lerp(lx, this.handTargetL.x, b);
      ly = lerp(ly, this.handTargetL.y, b);
      lz = lerp(lz, this.handTargetL.z, b);
    }
    solveTwoBone(rig.armL, rig.foreL, shL.x, shL.y, shL.z, lx, ly, lz,
      fx * 0.4 - rx, -0.55, fz * 0.4 - rz, RIG.upperArm, RIG.foreArm);

    // --- right (focus) ---
    let rxp = shR.x + fx * 0.16 + rx * 0.13;
    let ryp = shR.y - 0.48 - swing * 0.035 * sp;
    let rzp = shR.z + fz * 0.16 + rz * 0.13;
    rxp -= fx * swing * 0.055 * sp;
    rzp -= fz * swing * 0.055 * sp;
    if (this.handTargetR) {
      const b = this.handBlendR;
      rxp = lerp(rxp, this.handTargetR.x, b);
      ryp = lerp(ryp, this.handTargetR.y, b);
      rzp = lerp(rzp, this.handTargetR.z, b);
    }
    solveTwoBone(rig.armR, rig.foreR, shR.x, shR.y, shR.z, rxp, ryp, rzp,
      fx * 0.4 + rx, -0.55, fz * 0.4 + rz, RIG.upperArm, RIG.foreArm);

    rig.handL.computeWorldMatrix(true);
    rig.handR.computeWorldMatrix(true);
    void reach;
  }

  /** Ask the left/right hand to reach a world point. Pass null to release. */
  reachLeft(v) { this.handTargetL = v; }
  reachRight(v) { this.handTargetR = v; }
}

export { solveTwoBone, aimBone };
