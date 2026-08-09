/**
 * Dust.
 *
 * Restrained by default — a slow drift of motes in the volume around the player,
 * denser in sealed rooms than under the open sky — and violent when something
 * that has not moved in centuries finally moves. Dust falling from a turning
 * ring is how the player *sees* that the ring is heavy and old.
 *
 * One pooled buffer, integrated on the CPU, drawn in a single additive call.
 */
import { Vector3 } from "../core/bjs.js";
import { MoteRenderer } from "../magic/stellar.js";
import { makeRng, clamp01, lerp, damp, TAU } from "../core/scratch.js";
import { tune, toggles } from "../core/tune.js";

export class Dust {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {number} count
   */
  constructor(scene, count = 520) {
    this.name = "dust";
    this.order = 700;
    this.scene = scene;
    this.max = count;
    this.renderer = new MoteRenderer(scene, count, [0.82, 0.80, 0.74]);

    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.size = new Float32Array(count);
    this.bright = new Float32Array(count);
    this.active = new Uint8Array(count);
    /** Ambient motes recycle around the camera; burst motes fall and die. */
    this.kind = new Uint8Array(count);

    this.rng = makeRng(8181);
    this.interior = 1;
    this.volume = 11;         // radius of the ambient cloud around the camera
    this._t = 0;
    this._nextBurst = 0;

    // Seed the ambient population.
    for (let i = 0; i < count * 0.6; i++) this._spawnAmbient(i, true);
  }

  setInterior(v) { this.interior = v; }

  _spawnAmbient(i, initial) {
    const rng = this.rng;
    const cam = this.scene.activeCamera;
    const cx = cam ? cam.globalPosition.x : 0;
    const cy = cam ? cam.globalPosition.y : 1.5;
    const cz = cam ? cam.globalPosition.z : 0;
    const r = this.volume * Math.cbrt(rng());
    const th = rng() * TAU, ph = Math.acos(rng() * 2 - 1);
    const j = i * 3;
    this.pos[j] = cx + r * Math.sin(ph) * Math.cos(th);
    this.pos[j + 1] = cy + (rng() - 0.35) * this.volume * 0.75;
    this.pos[j + 2] = cz + r * Math.sin(ph) * Math.sin(th);
    this.vel[j] = (rng() - 0.5) * 0.05;
    this.vel[j + 1] = -0.012 - rng() * 0.03;
    this.vel[j + 2] = (rng() - 0.5) * 0.05;
    this.life[i] = initial ? 4 + rng() * 16 : 10 + rng() * 14;
    this.size[i] = 0.9 + rng() * 1.7;
    this.bright[i] = 0.05 + rng() * 0.16;
    this.active[i] = 1;
    this.kind[i] = 0;
  }

  /**
   * Shake dust loose. Called by mechanisms, collapsing stone and heavy magic.
   * @param {Vector3} at @param {number} amount 0..1 @param {number} radius
   */
  disturb(at, amount, radius = 2) {
    if (!toggles.dust) return;
    const n = Math.min(90, Math.floor(amount * 70 * tune.dustDensity));
    const rng = this.rng;
    let placed = 0;
    for (let i = 0; i < this.max && placed < n; i++) {
      if (this.active[i] && this.kind[i] === 1) continue;
      if (this.active[i] && rng() > 0.35) continue;
      const j = i * 3;
      const a = rng() * TAU, rr = radius * Math.sqrt(rng());
      this.pos[j] = at.x + Math.cos(a) * rr;
      this.pos[j + 1] = at.y + (rng() - 0.2) * radius * 0.7;
      this.pos[j + 2] = at.z + Math.sin(a) * rr;
      this.vel[j] = (rng() - 0.5) * 0.35;
      this.vel[j + 1] = -0.35 - rng() * 0.7;
      this.vel[j + 2] = (rng() - 0.5) * 0.35;
      this.life[i] = 1.6 + rng() * 3.2;
      this.size[i] = 1.2 + rng() * 2.6;
      this.bright[i] = 0.22 + rng() * 0.5;
      this.active[i] = 1;
      this.kind[i] = 1;
      placed++;
    }
  }

  update(dt) {
    const r = this.renderer;
    r.begin();
    if (!toggles.dust) { r.end(dt); return; }
    this._t += dt;

    const cam = this.scene.activeCamera;
    const cx = cam ? cam.globalPosition.x : 0;
    const cy = cam ? cam.globalPosition.y : 1.5;
    const cz = cam ? cam.globalPosition.z : 0;
    const density = clamp01(lerp(0.35, 1, this.interior)) * tune.dustDensity;
    const wantAmbient = Math.floor(this.max * 0.62 * density);

    let ambientCount = 0;
    const t = this._t;
    for (let i = 0; i < this.max; i++) {
      if (!this.active[i]) continue;
      const j = i * 3;
      this.life[i] -= dt;

      if (this.kind[i] === 1) {
        // Fallen dust: gravity, air drag, and it settles.
        this.vel[j + 1] -= 0.55 * dt;
        this.vel[j] *= 1 - 1.6 * dt;
        this.vel[j + 1] *= 1 - 0.9 * dt;
        this.vel[j + 2] *= 1 - 1.6 * dt;
      } else {
        ambientCount++;
        // Ambient motes wander on a slow turbulent field.
        this.vel[j] += Math.sin(this.pos[j + 1] * 1.7 + t * 0.31 + i) * 0.008 * dt * 60;
        this.vel[j + 2] += Math.cos(this.pos[j] * 1.5 + t * 0.24 + i) * 0.008 * dt * 60;
        this.vel[j] *= 1 - 0.7 * dt;
        this.vel[j + 2] *= 1 - 0.7 * dt;
      }

      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;

      const dx = this.pos[j] - cx, dy = this.pos[j + 1] - cy, dz = this.pos[j + 2] - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (this.life[i] <= 0 || d2 > this.volume * this.volume * 2.6) {
        this.active[i] = 0;
        continue;
      }

      // A mote is only visible when something is lighting it, and it twinkles as
      // it tumbles. Both are cheap and both matter enormously.
      const twinkle = 0.55 + 0.45 * Math.sin(t * 3.1 + i * 2.7);
      const fade = clamp01(this.life[i] * 0.6) * clamp01(1 - d2 / (this.volume * this.volume * 2.2));
      r.add(this.pos[j], this.pos[j + 1], this.pos[j + 2],
        this.size[i], this.bright[i] * twinkle * fade * (this.kind[i] === 1 ? 1.5 : 1));
    }

    // Top the ambient population back up.
    if (ambientCount < wantAmbient) {
      for (let i = 0, added = 0; i < this.max && added < 8; i++) {
        if (this.active[i]) continue;
        this._spawnAmbient(i, false);
        added++;
      }
    }

    r.end(dt);
  }
}
