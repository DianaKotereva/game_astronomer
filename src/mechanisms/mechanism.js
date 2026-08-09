/**
 * Shared physical behaviour for the temple's moving parts.
 *
 * Nothing here weighs less than a person. A bronze ring three metres across does
 * not snap to an angle — it has to be started, it carries its momentum past the
 * point you wanted, the bearing drags, and when you let go it settles with a
 * couple of slow oscillations before the friction wins. Backlash means the first
 * few degrees of a reversal move nothing at all but the handle.
 *
 * All of that lives in this one integrator so every mechanism in the game feels
 * like it came out of the same workshop.
 */
import { clamp, damp, wrapPi, TAU } from "../core/scratch.js";

export class RotaryAxis {
  /**
   * @param {Object} o
   * @param {number} [o.inertia]      relative mass — higher is heavier
   * @param {number} [o.friction]     viscous drag
   * @param {number} [o.stiction]     torque needed to start moving at all
   * @param {number} [o.backlash]     dead angle on reversal, radians
   * @param {number} [o.min] @param {number} [o.max]  travel limits, radians
   * @param {number[]} [o.detents]    angles the mechanism prefers to rest at
   * @param {number} [o.detentPull]
   */
  constructor(o = {}) {
    this.angle = o.angle || 0;
    this.velocity = 0;
    this.inertia = o.inertia === undefined ? 22 : o.inertia;
    this.friction = o.friction === undefined ? 2.2 : o.friction;
    this.stiction = o.stiction === undefined ? 0.4 : o.stiction;
    this.backlash = o.backlash === undefined ? 0.012 : o.backlash;
    this.min = o.min === undefined ? -Infinity : o.min;
    this.max = o.max === undefined ? Infinity : o.max;
    this.detents = o.detents || null;
    this.detentPull = o.detentPull === undefined ? 0 : o.detentPull;
    this.springTo = o.springTo === undefined ? null : o.springTo;
    this.springK = o.springK === undefined ? 0 : o.springK;

    /** Visible angle including backlash slop — this is what the mesh uses. */
    this.visualAngle = this.angle;
    this._lash = 0;
    this._torque = 0;
    this._lastDir = 0;
    /** Set by update(): how hard the mechanism is currently working. */
    this.effort = 0;
    /** Rises when the axis is moving after a long rest; drives dust. */
    this.disturbance = 0;
    this.restTime = 999;
    this.onHitLimit = null;
    this.moving = false;
  }

  /** Apply a torque this frame (from a hand on the ring, or a counterweight). */
  push(torque) { this._torque += torque; }

  /** Force the axis somewhere without any physics — loading a save, mostly. */
  setImmediate(a) {
    this.angle = a; this.visualAngle = a; this.velocity = 0; this._lash = 0;
  }

  update(dt) {
    let t = this._torque;
    this._torque = 0;

    if (this.springTo !== null && this.springK > 0) {
      t += -(wrapPi(this.angle - this.springTo)) * this.springK * -1;
    }

    if (this.detents && this.detentPull > 0) {
      // Pull toward the nearest detent, strongest when nearly there and slow.
      let best = 0, bestD = 1e9;
      for (let i = 0; i < this.detents.length; i++) {
        const d = wrapPi(this.detents[i] - this.angle);
        if (Math.abs(d) < Math.abs(bestD)) { bestD = d; best = this.detents[i]; }
      }
      void best;
      const near = Math.exp(-Math.abs(bestD) * 9);
      t += Math.sign(bestD) * Math.min(Math.abs(bestD) * 6, 1) * this.detentPull * near;
    }

    const absT = Math.abs(t);
    const moving = Math.abs(this.velocity) > 0.0015;
    if (!moving && absT < this.stiction) {
      // Not enough force to break the bearing free. The handle flexes; nothing turns.
      t = 0;
      this.velocity *= 0.4;
    } else if (!moving) {
      t -= Math.sign(t) * this.stiction * 0.85;
    }

    const acc = t / this.inertia;
    this.velocity += acc * dt;
    // viscous + dry friction
    this.velocity -= this.velocity * clamp(this.friction * dt, 0, 0.95);
    if (Math.abs(this.velocity) < 0.0009 && absT < this.stiction) this.velocity = 0;

    const prev = this.angle;
    this.angle += this.velocity * dt;

    if (this.angle < this.min) {
      this.angle = this.min;
      if (this.velocity < -0.05 && this.onHitLimit) this.onHitLimit(-1, -this.velocity);
      this.velocity *= -0.16;          // stone against bronze does not bounce far
    } else if (this.angle > this.max) {
      this.angle = this.max;
      if (this.velocity > 0.05 && this.onHitLimit) this.onHitLimit(1, this.velocity);
      this.velocity *= -0.16;
    }

    // Backlash: the visible part lags inside the slop of the gearing.
    const moved = this.angle - prev;
    if (this.backlash > 0) {
      this._lash = clamp(this._lash + moved, -this.backlash, this.backlash);
      this.visualAngle = this.angle - this._lash;
    } else {
      this.visualAngle = this.angle;
    }

    this.moving = Math.abs(this.velocity) > 0.004;
    this.effort = damp(this.effort, Math.min(1, Math.abs(this.velocity) * 2.4 + absT * 0.05), 0.001, dt);

    if (this.moving) {
      // The longer it has stood still, the more it sheds when it finally turns.
      this.disturbance = Math.max(this.disturbance, Math.min(1, this.restTime / 12) * Math.min(1, Math.abs(this.velocity) * 3));
      this.restTime = 0;
    } else {
      this.restTime += dt;
    }
    this.disturbance = damp(this.disturbance, 0, 0.06, dt);
    return this.moving;
  }

  /** How close the axis is to a target angle, 0..1, with a tolerance in radians. */
  alignment(target, tolerance) {
    const d = Math.abs(wrapPi(this.angle - target));
    return clamp(1 - d / tolerance, 0, 1);
  }
}

/**
 * A counterweight hanging on a rope over a pulley. Its descent is what actually
 * drives most of the temple's big movements, so it gets its own lag: the weight
 * accelerates after the axis starts and keeps pulling after the axis stops.
 */
export class Counterweight {
  constructor(o = {}) {
    this.position = o.position || 0;      // metres of descent
    this.velocity = 0;
    this.travel = o.travel === undefined ? 6 : o.travel;
    this.mass = o.mass === undefined ? 1 : o.mass;
    this.released = false;
    this.sway = 0;
    this.swayVel = 0;
  }

  release() { this.released = true; }

  update(dt, resistance = 1) {
    if (!this.released) return 0;
    if (this.position >= this.travel) {
      this.velocity *= 0.2;
      this.position = this.travel;
    } else {
      const g = 9.81 * 0.12 / Math.max(0.05, resistance);
      this.velocity += g * dt;
      this.velocity -= this.velocity * Math.min(0.9, 1.6 * dt);
      this.position = Math.min(this.travel, this.position + this.velocity * dt);
    }
    // Pendulum sway of the hanging mass.
    this.swayVel += (-this.sway * 5.5 - this.swayVel * 0.9) * dt + this.velocity * dt * 0.35;
    this.sway += this.swayVel * dt;
    return this.velocity;
  }
}

export { TAU };
