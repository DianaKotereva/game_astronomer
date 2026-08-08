/**
 * Third-person spring-arm camera.
 *
 * Two framings share one rig: Exploration (wide, architecture dominates) and
 * Inspection / Observation (tight, instruments and hands dominate). The rig
 * never snaps — position, arm length and field of view are all damped, and the
 * arm shortens smoothly when geometry intrudes.
 */
import { UniversalCamera, Vector3, Ray, Matrix } from "../core/bjs.js";
import { tune } from "../core/tune.js";
import { clamp, damp, DEG, lerp, smoothstep } from "../core/scratch.js";

const _desired = new Vector3();
const _pivot = new Vector3();
const _dir = new Vector3();
const _tmp = new Vector3();
const _tmp2 = new Vector3();
const _rayDir = new Vector3();
const _hitPoint = new Vector3();

export class ThirdPersonCamera {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {import("../core/input.js").Input} input
   */
  constructor(scene, input) {
    this.name = "camera";
    this.order = 300;
    this.scene = scene;
    this.input = input;

    this.camera = new UniversalCamera("cam", new Vector3(0, 2, -6), scene);
    this.camera.minZ = 0.08;
    this.camera.maxZ = 4000;
    this.camera.fov = tune.cameraFov * DEG;
    this.camera.inertia = 0;
    this.camera.speed = 0;
    scene.activeCamera = this.camera;

    this.yaw = 0;
    this.pitch = -0.06;
    this.distance = tune.cameraDistance;
    this._armCurrent = tune.cameraDistance;
    this._fov = tune.cameraFov;
    this._shoulder = tune.cameraShoulder;
    this._height = tune.cameraHeight;

    /** Position the arm pivots around; the character controller writes this. */
    this.target = new Vector3(0, 1.5, 0);
    /** 0 = exploration, 1 = observation. */
    this.observe = 0;
    /** Extra framing blend used by inspection of a mechanism. */
    this.inspect = 0;
    this.inspectPoint = new Vector3();
    /** Roll/offset shake, used sparingly by heavy mechanisms. */
    this.shake = 0;
    this._shakeT = 0;

    /** Meshes the arm collides against (set by the world once built). */
    this.collisionPredicate = (m) => m.isPickable && m.checkCollisions;

    this._smoothPos = this.camera.position.clone();
    this._vel = new Vector3();
    this.enabledInput = true;
    this.freeFly = false;
    this._flyVel = new Vector3();
  }

  /** Instantly place the rig (used on load / teleport) so nothing swings in. */
  snap() {
    this._computeDesired(this.distance);
    this._smoothPos.copyFrom(_desired);
    this.camera.position.copyFrom(_desired);
    this._armCurrent = this.distance;
  }

  get forward() {
    // Horizontal forward from yaw — the movement basis.
    _dir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    return _dir;
  }

  _computeDesired(arm) {
    _pivot.copyFrom(this.target);
    _pivot.y += this._height;

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // Look direction
    _tmp.set(sy * cp, sp, cy * cp);
    // Right vector
    _tmp2.set(cy, 0, -sy);

    _desired.copyFrom(_pivot);
    _desired.x += _tmp2.x * this._shoulder - _tmp.x * arm;
    _desired.y += -_tmp.y * arm;
    _desired.z += _tmp2.z * this._shoulder - _tmp.z * arm;
    return _desired;
  }

  update(dt) {
    const inp = this.input;

    if (this.enabledInput && (inp.locked || this.freeFly)) {
      const s = 0.0022 * tune.mouseSensitivity * lerp(1, 0.45, this.observe);
      this.yaw += inp.mouseDX * s;
      this.pitch = clamp(this.pitch + inp.mouseDY * s, -1.32, 1.32);
      if (inp.wheel !== 0) {
        this.distance = clamp(this.distance + inp.wheel * 0.0016 * this.distance, 1.6, 8.5);
        tune.cameraDistance = this.distance;
      }
    }

    if (this.freeFly) { this._updateFreeFly(dt); return; }

    // Observation tightens the framing: nearer arm, lower shoulder offset, narrower fov.
    const obs = this.observe;
    const targetArm = lerp(this.distance, this.distance * 0.62, obs) * lerp(1, 0.72, this.inspect);
    const targetShoulder = lerp(tune.cameraShoulder, tune.cameraShoulder * 0.42, obs);
    const targetHeight = lerp(tune.cameraHeight, tune.cameraHeight + 0.1, obs);
    const targetFov = lerp(tune.cameraFov, tune.observeFov, smoothstep(0, 1, obs));

    this._shoulder = damp(this._shoulder, targetShoulder, 0.0006, dt);
    this._height = damp(this._height, targetHeight, 0.0006, dt);
    this._fov = damp(this._fov, targetFov, 0.00002, dt);
    this.camera.fov = this._fov * DEG;

    // --- spring arm with collision ---------------------------------------
    this._computeDesired(targetArm);
    _pivot.copyFrom(this.target);
    _pivot.y += this._height;

    let allowed = targetArm;
    _rayDir.copyFrom(_desired).subtractInPlace(_pivot);
    const len = _rayDir.length();
    if (len > 1e-4) {
      _rayDir.scaleInPlace(1 / len);
      const ray = ThirdPersonCamera._ray;
      ray.origin.copyFrom(_pivot);
      ray.direction.copyFrom(_rayDir);
      ray.length = len + 0.35;
      const hit = this.scene.pickWithRay(ray, this.collisionPredicate, false);
      if (hit && hit.hit && hit.distance < len + 0.35) {
        _hitPoint.copyFrom(hit.pickedPoint);
        const d = Math.max(0.35, hit.distance - 0.32);
        allowed = targetArm * (d / len);
      }
    }
    // Pull in fast (avoid clipping), ease out slowly (avoid pumping).
    const pullIn = allowed < this._armCurrent;
    this._armCurrent = damp(this._armCurrent, allowed, pullIn ? 1e-8 : 0.02, dt);
    this._computeDesired(this._armCurrent);

    // Slight acceleration lag: the rig trails the character a little.
    const k = this.inspect > 0.5 ? 0.0002 : 0.0009;
    this._smoothPos.x = damp(this._smoothPos.x, _desired.x, k, dt);
    this._smoothPos.y = damp(this._smoothPos.y, _desired.y, k * 0.5, dt);
    this._smoothPos.z = damp(this._smoothPos.z, _desired.z, k, dt);

    this.camera.position.copyFrom(this._smoothPos);

    if (this.shake > 0.0001) {
      this._shakeT += dt;
      const a = this.shake;
      this.camera.position.x += Math.sin(this._shakeT * 37.1) * 0.012 * a;
      this.camera.position.y += Math.sin(this._shakeT * 51.7 + 1.3) * 0.009 * a;
      this.camera.position.z += Math.sin(this._shakeT * 43.3 + 2.1) * 0.012 * a;
      this.shake = damp(this.shake, 0, 0.02, dt);
    }

    // Aim: look at the pivot, biased forward so the character sits off-centre.
    _tmp.copyFrom(_pivot);
    _tmp.y += lerp(0.06, 0.0, obs);
    this.camera.setTarget(_tmp);
  }

  _updateFreeFly(dt) {
    const inp = this.input;
    const sp = (inp.isDown("ShiftLeft") ? 26 : 8) * dt;
    const cp = Math.cos(this.pitch), sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    _tmp.set(sy * cp, Math.sin(this.pitch), cy * cp);
    _tmp2.set(cy, 0, -sy);
    const f = inp.moveY(), r = inp.moveX();
    this._flyVel.x = damp(this._flyVel.x, (_tmp.x * f + _tmp2.x * r) * sp * 60, 0.0001, dt);
    this._flyVel.y = damp(this._flyVel.y, (_tmp.y * f + (inp.isDown("KeyE") ? 1 : 0) * 0.7 - (inp.isDown("KeyQ") ? 1 : 0) * 0.7) * sp * 60, 0.0001, dt);
    this._flyVel.z = damp(this._flyVel.z, (_tmp.z * f + _tmp2.z * r) * sp * 60, 0.0001, dt);
    this.camera.position.addInPlace(_tmp2.set(this._flyVel.x * dt, this._flyVel.y * dt, this._flyVel.z * dt));
    _tmp.set(sy * cp, Math.sin(this.pitch), cy * cp).addInPlace(this.camera.position);
    this.camera.setTarget(_tmp);
    this.camera.fov = tune.cameraFov * DEG;
  }

  /** World-space ray through the screen centre (used by interaction + spells). */
  centerRay(out) {
    const m = this.camera.getWorldMatrix();
    out.origin.copyFromFloats(m.m[12], m.m[13], m.m[14]);
    const t = this.camera.getTarget();
    out.direction.copyFrom(t).subtractInPlace(out.origin).normalize();
    return out;
  }
}

ThirdPersonCamera._ray = new Ray(new Vector3(), new Vector3(0, 0, 1), 10);
void Matrix;
