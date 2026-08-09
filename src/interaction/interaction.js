/**
 * Interaction.
 *
 * One key, E, whose meaning comes from context, plus click-and-drag for
 * anything that turns. Nothing is outlined in a bright colour: an object
 * announces itself by being reachable and by the prompt naming what it is
 * (§37).
 *
 * The drag model is the important part. Grabbing a bronze ring maps mouse
 * movement onto the direction that point of the ring would actually travel on
 * screen, and feeds it in as torque — so a heavy ring resists, accelerates, and
 * carries past where you stopped pushing, and the hand stays on the metal.
 */
import { Vector3, Matrix, Ray } from "../core/bjs.js";
import { clamp, clamp01, damp, lerp } from "../core/scratch.js";

const _p = new Vector3();
const _q = new Vector3();
const _t = new Vector3();
const _s1 = new Vector3();
const _s2 = new Vector3();
const _ray = new Ray(new Vector3(), new Vector3(0, 0, 1), 6);

/**
 * @typedef {Object} Interactable
 * @property {string} id
 * @property {Vector3} position
 * @property {number} radius        how close the player must be
 * @property {string} verb          shown after the key, e.g. "Inspect"
 * @property {string} [sub]         a quieter second line
 * @property {string} [key]         defaults to "E"
 * @property {(ctx:any)=>void} [onInteract]
 * @property {import("../mechanisms/mechanism.js").RotaryAxis} [axis]  makes it draggable
 * @property {Vector3} [axisOrigin]
 * @property {Vector3} [axisDir]
 * @property {number} [gain]
 * @property {boolean} [enabled]
 * @property {()=>boolean} [available]
 * @property {string} [dragVerb]
 */

export class Interaction {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {import("../character/player.js").Player} player
   * @param {import("../camera/thirdPerson.js").ThirdPersonCamera} cam
   * @param {import("../core/input.js").Input} input
   * @param {import("../ui/hud.js").Hud} hud
   */
  constructor(scene, player, cam, input, hud) {
    this.name = "interaction";
    this.order = 320;
    this.scene = scene;
    this.player = player;
    this.cam = cam;
    this.input = input;
    this.hud = hud;

    /** @type {Interactable[]} */
    this.items = [];
    /** @type {Interactable|null} */
    this.focused = null;
    /** @type {Interactable|null} */
    this.gripped = null;
    this.gripPoint = new Vector3();
    this.gripLocal = new Vector3();
    this.blocked = false;      // set while the Book or a menu owns input

    this._dragTorque = 0;
    this._lastAngle = 0;
    this.onInteract = null;    // global hook (audio, save, tutorial)
  }

  /** @param {Interactable} item */
  add(item) {
    if (item.enabled === undefined) item.enabled = true;
    if (!item.key) item.key = "E";
    if (!item.radius) item.radius = 2.6;
    this.items.push(item);
    return item;
  }

  remove(id) {
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].id === id) { this.items.splice(i, 1); return; }
    }
  }

  get(id) {
    for (let i = 0; i < this.items.length; i++) if (this.items[i].id === id) return this.items[i];
    return null;
  }

  _score(item, px, py, pz, fx, fy, fz) {
    if (!item.enabled) return -1;
    if (item.available && !item.available()) return -1;
    const dx = item.position.x - px, dy = item.position.y - py, dz = item.position.z - pz;
    const d = Math.hypot(dx, dy, dz);
    if (d > item.radius) return -1;
    const inv = 1 / (d || 1e-4);
    const facing = (dx * fx + dy * fy + dz * fz) * inv;
    if (facing < 0.15) return -1;
    // Prefer what the player is looking at, then what is close.
    return facing * 2 + (1 - d / item.radius);
  }

  update(dt) {
    const inp = this.input;
    const player = this.player;

    if (this.gripped) { this._updateGrip(dt); return; }

    if (this.blocked) {
      this.hud.setPrompt(null);
      this.focused = null;
      return;
    }

    const p = player.position;
    const cam = this.cam;
    const cp = Math.cos(cam.pitch);
    const fx = Math.sin(cam.yaw) * cp, fy = Math.sin(cam.pitch), fz = Math.cos(cam.yaw) * cp;

    let best = null, bestScore = 0;
    for (let i = 0; i < this.items.length; i++) {
      const s = this._score(this.items[i], p.x, p.y + 1.2, p.z, fx, fy, fz);
      if (s > bestScore) { bestScore = s; best = this.items[i]; }
    }
    this.focused = best;

    if (best) {
      if (best.axis) {
        this.hud.setPrompt("Drag", best.dragVerb || "Turn", best.sub || "");
      } else {
        this.hud.setPrompt(best.key, best.verb, best.sub || "");
      }
      if (best.key && inp.justPressed(keyCode(best.key)) && best.onInteract) {
        best.onInteract(this);
        if (this.onInteract) this.onInteract(best);
      }
      if (best.axis && inp.lmbPressed) this._beginGrip(best);
    } else {
      this.hud.setPrompt(null);
    }
  }

  _beginGrip(item) {
    this.gripped = item;
    // Grip the point on the rim nearest the player's hand.
    this.gripPoint.copyFrom(item.gripPoint || item.position);
    this.cam.inspect = 1;
    this._dragTorque = 0;
    if (item.onGrip) item.onGrip(this);
  }

  _updateGrip(dt) {
    const item = this.gripped;
    const inp = this.input;
    if (!inp.lmb) {
      this.gripped = null;
      this.cam.inspect = 0;
      this.player.controller.reachRight(null);
      this.hud.setPrompt(null);
      if (item && item.onRelease) item.onRelease(this);
      return;
    }

    const axis = item.axis;
    const origin = item.axisOrigin || item.position;
    const dir = item.axisDir || Vector3.UpReadOnly;

    // The grip point rides the rotation, so the hand follows the metal.
    const ang = axis.visualAngle;
    rotateAbout(item.gripRest || item.gripPoint, origin, dir, ang, _p);
    this.gripPoint.copyFrom(_p);

    // Direction this point is travelling: axis x radius.
    _q.copyFrom(_p).subtractInPlace(origin);
    Vector3.CrossToRef(dir, _q, _t);
    if (_t.lengthSquared() < 1e-8) { _t.set(1, 0, 0); }
    _t.normalize();

    // Project the point and the point-plus-tangent, and compare with the mouse.
    const ok1 = this._project(_p, _s1);
    _q.set(_p.x + _t.x * 0.15, _p.y + _t.y * 0.15, _p.z + _t.z * 0.15);
    const ok2 = this._project(_q, _s2);
    if (ok1 && ok2) {
      let tx = _s2.x - _s1.x, ty = _s2.y - _s1.y;
      const l = Math.hypot(tx, ty);
      if (l > 1e-4) {
        tx /= l; ty /= l;
        const drag = inp.mouseDX * tx + inp.mouseDY * ty;
        const gain = (item.gain || 1) * 0.9;
        axis.push(drag * gain);
      }
    }

    this.player.controller.reachRight(this.gripPoint);
    this.hud.setPrompt("Release", item.dragVerb || "Turn", item.sub || "");
    this.cam.inspectPoint.copyFrom(this.gripPoint);
    void dt;
  }

  _project(world, out) {
    const cam = this.scene.activeCamera;
    const engine = this.scene.getEngine();
    Vector3.ProjectToRef(world, Matrix.IdentityReadOnly, this.scene.getTransformMatrix(),
      cam.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()), out);
    return out.z > 0 && out.z < 1;
  }
}

const _axisQ = new Vector3();

/** Rotate `point` about the line (origin, dir) by `angle`. */
export function rotateAbout(point, origin, dir, angle, out) {
  const px = point.x - origin.x, py = point.y - origin.y, pz = point.z - origin.z;
  const c = Math.cos(angle), s = Math.sin(angle);
  const dx = dir.x, dy = dir.y, dz = dir.z;
  const dot = px * dx + py * dy + pz * dz;
  const cx = dy * pz - dz * py, cy = dz * px - dx * pz, cz = dx * py - dy * px;
  out.x = origin.x + px * c + cx * s + dx * dot * (1 - c);
  out.y = origin.y + py * c + cy * s + dy * dot * (1 - c);
  out.z = origin.z + pz * c + cz * s + dz * dot * (1 - c);
  void _axisQ;
  return out;
}

function keyCode(k) {
  if (k.length === 1 && k >= "A" && k <= "Z") return "Key" + k;
  if (k.length === 1 && k >= "0" && k <= "9") return "Digit" + k;
  return k;
}

export { clamp, clamp01, damp, lerp };
