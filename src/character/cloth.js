/**
 * Verlet cloth for the protagonist's layers.
 *
 * The coat skirt, the mantle and the scarf are the silhouette. They are also the
 * only thing that tells the player, from behind and at distance, that the
 * character has weight and is moving through air — so they are simulated rather
 * than animated.
 *
 * Everything runs on flat typed arrays with a fixed substep count and zero
 * allocation per frame. Collisions use a handful of capsules standing in for the
 * body, which is enough to stop the coat passing through the legs without
 * pretending to be a physics engine.
 */
import { Mesh, VertexData, Vector3 } from "../core/bjs.js";
import { clamp, TAU } from "../core/scratch.js";
import { tune, toggles } from "../core/tune.js";

const GRAVITY = -9.81;

export class ClothPanel {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {Object} o
   * @param {number} o.cols  particles across
   * @param {number} o.rows  particles down
   * @param {number} o.width  metres across at the pinned edge
   * @param {number} o.length metres down
   * @param {number} [o.flare] how much wider the hem is than the top
   * @param {boolean} [o.wrap] join the last column to the first (a tube: coat, scarf)
   * @param {number} [o.stiffness]
   * @param {number} [o.damping]
   * @param {number} [o.mass]
   */
  constructor(scene, o) {
    this.scene = scene;
    this.cols = o.cols;
    this.rows = o.rows;
    this.wrap = !!o.wrap;
    this.width = o.width;
    this.length = o.length;
    this.flare = o.flare === undefined ? 0.25 : o.flare;
    this.stiffness = o.stiffness === undefined ? 1 : o.stiffness;
    this.damping = o.damping === undefined ? 0.028 : o.damping;
    this.iterations = o.iterations === undefined ? 6 : o.iterations;
    this.windScale = o.windScale === undefined ? 1 : o.windScale;

    const n = this.cols * this.rows;
    this.count = n;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.pinned = new Uint8Array(n);
    /** Rest positions of the pinned row in the rig's local frame. */
    this.pinLocal = new Float32Array(this.cols * 3);

    /** Constraints as [i, j, restLength] triples. */
    this._buildConstraints();

    /** Collision capsules: [x0,y0,z0, x1,y1,z1, radius] per capsule. */
    this.capsules = new Float32Array(6 * 7);
    this.capsuleCount = 0;

    this.wind = new Vector3(0, 0, 0);
    this.windTime = Math.random() * 100;
    /** Motion of the wearer, used to push the cloth around. */
    this.carrierVel = new Vector3(0, 0, 0);

    this._buildMesh(scene, o.name || "cloth");
  }

  _buildConstraints() {
    const C = this.cols, R = this.rows;
    const list = [];
    const idx = (c, r) => r * C + c;
    const lastCol = this.wrap ? C : C - 1;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        // structural across
        if (c < lastCol) list.push(idx(c, r), idx((c + 1) % C, r), 0);
        // structural down
        if (r < R - 1) list.push(idx(c, r), idx(c, r + 1), 0);
        // shear
        if (r < R - 1 && c < lastCol) {
          list.push(idx(c, r), idx((c + 1) % C, r + 1), 0);
          list.push(idx((c + 1) % C, r), idx(c, r + 1), 0);
        }
        // bend — keeps the cloth from folding back on itself like paper
        if (r < R - 2) list.push(idx(c, r), idx(c, r + 2), 0);
        if (c < lastCol - 1) list.push(idx(c, r), idx((c + 2) % C, r), 0);
      }
    }
    this.cons = new Int32Array(list.length / 3 * 2);
    this.rest = new Float32Array(list.length / 3);
    for (let k = 0, m = 0; k < list.length; k += 3, m++) {
      this.cons[m * 2] = list[k];
      this.cons[m * 2 + 1] = list[k + 1];
    }
    this.consCount = this.rest.length;
  }

  _buildMesh(scene, name) {
    const C = this.cols, R = this.rows;
    const quadsX = this.wrap ? C : C - 1;
    const idxArr = [];
    for (let r = 0; r < R - 1; r++) {
      for (let c = 0; c < quadsX; c++) {
        const a = r * C + c;
        const b = r * C + ((c + 1) % C);
        const d = (r + 1) * C + c;
        const e = (r + 1) * C + ((c + 1) % C);
        idxArr.push(a, d, b, b, d, e);
      }
    }
    // UVs in metres of cloth, so the weave keeps its real scale however large
    // the panel is. Mapping the panel to a fraction of one UV tile stretched a
    // handful of weave cells across the whole coat and read as painted stripes.
    const uvs = new Float32Array(C * R * 2);
    const uvPerMetre = 5.5;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        uvs[i * 2] = (c / C) * this.width * Math.PI * uvPerMetre;
        uvs[i * 2 + 1] = (r / (R - 1)) * this.length * uvPerMetre;
      }
    }
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = new Float32Array(this.pos.length);
    vd.normals = new Float32Array(this.pos.length);
    vd.uvs = uvs;
    vd.indices = new Uint32Array(idxArr);
    vd.applyToMesh(mesh, true);   // updatable
    mesh.renderingGroupId = 1;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    this.mesh = mesh;
    this.normals = new Float32Array(this.pos.length);
    this.indices = vd.indices;
  }

  /**
   * Lay the panel out in its rest shape hanging from a frame.
   * @param {(c:number, out:Float32Array, off:number)=>void} pinFn writes the
   *        world position of pinned column c
   */
  initialise(pinFn) {
    const C = this.cols, R = this.rows;
    const tmp = new Float32Array(3);
    for (let c = 0; c < C; c++) {
      pinFn(c, tmp, 0);
      for (let r = 0; r < R; r++) {
        const i = (r * C + c) * 3;
        const t = r / (R - 1);
        this.pos[i] = tmp[0] * (1 + this.flare * t);
        this.pos[i + 1] = tmp[1] - this.length * t;
        this.pos[i + 2] = tmp[2] * (1 + this.flare * t);
        this.prev[i] = this.pos[i];
        this.prev[i + 1] = this.pos[i + 1];
        this.prev[i + 2] = this.pos[i + 2];
      }
      this.pinned[c] = 1;
    }
    // Rest lengths measured from the laid-out shape.
    for (let m = 0; m < this.consCount; m++) {
      const a = this.cons[m * 2] * 3, b = this.cons[m * 2 + 1] * 3;
      this.rest[m] = Math.hypot(this.pos[a] - this.pos[b], this.pos[a + 1] - this.pos[b + 1], this.pos[a + 2] - this.pos[b + 2]);
    }
  }

  /**
   * Snap every particle to hang from wherever its pin currently is.
   *
   * Needed after a teleport: the panel is built in the rest pose at the world
   * origin, and relaxation alone cannot drag a sheet ten metres without leaving
   * it stretched across the room for several seconds.
   */
  snapToPins() {
    const C = this.cols, R = this.rows;
    // Flare has to open away from the wearer, so it is measured from the centre
    // of the pinned ring rather than from the world origin.
    let mx = 0, mz = 0;
    for (let c = 0; c < C; c++) { mx += this.pos[c * 3]; mz += this.pos[c * 3 + 2]; }
    mx /= C; mz /= C;
    for (let c = 0; c < C; c++) {
      const p0 = c * 3;
      const cx = this.pos[p0], cy = this.pos[p0 + 1], cz = this.pos[p0 + 2];
      const ox = cx - mx, oz = cz - mz;
      for (let r = 1; r < R; r++) {
        const i = (r * C + c) * 3;
        const t = r / (R - 1);
        const k = 1 + this.flare * t * 0.35;
        this.pos[i] = mx + ox * k;
        this.pos[i + 1] = cy - this.length * t;
        this.pos[i + 2] = mz + oz * k;
        this.prev[i] = this.pos[i];
        this.prev[i + 1] = this.pos[i + 1];
        this.prev[i + 2] = this.pos[i + 2];
      }
    }
  }

  /** Move a pinned particle (called by the rig every frame). */
  setPin(c, x, y, z) {
    const i = c * 3;
    this.pos[i] = x; this.pos[i + 1] = y; this.pos[i + 2] = z;
    this.prev[i] = x; this.prev[i + 1] = y; this.prev[i + 2] = z;
  }

  clearCapsules() { this.capsuleCount = 0; }

  addCapsule(x0, y0, z0, x1, y1, z1, r) {
    if (this.capsuleCount >= 6) return;
    const o = this.capsuleCount * 7;
    const c = this.capsules;
    c[o] = x0; c[o + 1] = y0; c[o + 2] = z0;
    c[o + 3] = x1; c[o + 4] = y1; c[o + 5] = z1;
    c[o + 6] = r;
    this.capsuleCount++;
  }

  /** @param {number} dt */
  update(dt) {
    if (!toggles.cloth) return;
    const sub = 2;
    const h = Math.min(dt, 1 / 45) / sub;
    for (let s = 0; s < sub; s++) this._step(h);
    this._updateMesh();
  }

  _step(h) {
    const n = this.count;
    const pos = this.pos, prev = this.prev, pinned = this.pinned;
    const drag = 1 - this.damping;

    // Wind: a slow base plus a faster ripple, scaled by the tuning slider and by
    // how exposed the wearer is. Interiors are still (§8).
    this.windTime += h;
    const wt = this.windTime;
    const gust = 0.65 + 0.35 * Math.sin(wt * 0.7) * Math.sin(wt * 0.23 + 1.1);
    const wx = this.wind.x * gust * tune.clothWind * this.windScale;
    const wy = this.wind.y * gust * tune.clothWind * this.windScale;
    const wz = this.wind.z * gust * tune.clothWind * this.windScale;

    // Carrier motion: the coat trails behind the walk, and lifts on a stride.
    const cvx = -this.carrierVel.x * 1.35;
    const cvy = -this.carrierVel.y * 0.55;
    const cvz = -this.carrierVel.z * 1.35;

    const h2 = h * h;
    for (let i = 0; i < n; i++) {
      if (pinned[i]) continue;
      const j = i * 3;
      const px = pos[j], py = pos[j + 1], pz = pos[j + 2];
      // Ripple varies along the panel so the cloth does not move as one sheet.
      const flutter = Math.sin(wt * 5.3 + i * 1.7) * 0.35 + Math.sin(wt * 8.9 + i * 0.9) * 0.18;
      const ax = wx * (1 + flutter) + cvx;
      const ay = GRAVITY + wy * (1 + flutter * 0.4) + cvy;
      const az = wz * (1 + flutter) + cvz;
      pos[j] = px + (px - prev[j]) * drag + ax * h2;
      pos[j + 1] = py + (py - prev[j + 1]) * drag + ay * h2;
      pos[j + 2] = pz + (pz - prev[j + 2]) * drag + az * h2;
      prev[j] = px; prev[j + 1] = py; prev[j + 2] = pz;
    }

    const stiff = clamp(this.stiffness * tune.clothStiffness, 0.05, 1) * 0.5;
    for (let it = 0; it < this.iterations; it++) {
      const cons = this.cons, rest = this.rest;
      for (let m = 0; m < this.consCount; m++) {
        const ia = cons[m * 2], ib = cons[m * 2 + 1];
        const a = ia * 3, b = ib * 3;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-6) continue;
        const diff = (d - rest[m]) / d * stiff;
        const pa = pinned[ia], pb = pinned[ib];
        if (pa && pb) continue;
        const wa = pa ? 0 : (pb ? 1 : 0.5);
        const wb = pb ? 0 : (pa ? 1 : 0.5);
        pos[a] += dx * diff * wa; pos[a + 1] += dy * diff * wa; pos[a + 2] += dz * diff * wa;
        pos[b] -= dx * diff * wb; pos[b + 1] -= dy * diff * wb; pos[b + 2] -= dz * diff * wb;
      }
      this._collide();
    }
  }

  _collide() {
    const caps = this.capsules, cc = this.capsuleCount;
    if (cc === 0) return;
    const pos = this.pos, pinned = this.pinned, n = this.count;
    for (let i = 0; i < n; i++) {
      if (pinned[i]) continue;
      const j = i * 3;
      const px = pos[j], py = pos[j + 1], pz = pos[j + 2];
      for (let k = 0; k < cc; k++) {
        const o = k * 7;
        const ax = caps[o], ay = caps[o + 1], az = caps[o + 2];
        const bx = caps[o + 3], by = caps[o + 4], bz = caps[o + 5];
        const r = caps[o + 6];
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const abLen2 = abx * abx + aby * aby + abz * abz;
        let t = abLen2 > 1e-8 ? ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / abLen2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = ax + abx * t, cy = ay + aby * t, cz = az + abz * t;
        let dx = px - cx, dy = py - cy, dz = pz - cz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < r && d > 1e-6) {
          const push = (r - d) / d;
          pos[j] = px + dx * push;
          pos[j + 1] = py + dy * push;
          pos[j + 2] = pz + dz * push;
        } else if (d <= 1e-6) {
          pos[j + 1] = py + r;
        }
      }
    }
  }

  _updateMesh() {
    const nrm = this.normals;
    nrm.fill(0);
    const idx = this.indices, pos = this.pos;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      nrm[a] += nx; nrm[a + 1] += ny; nrm[a + 2] += nz;
      nrm[b] += nx; nrm[b + 1] += ny; nrm[b + 2] += nz;
      nrm[c] += nx; nrm[c + 1] += ny; nrm[c + 2] += nz;
    }
    for (let i = 0; i < nrm.length; i += 3) {
      const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
      nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
    }
    this.mesh.updateVerticesData("position", this.pos, false, false);
    this.mesh.updateVerticesData("normal", nrm, false, false);
  }

  dispose() { this.mesh.dispose(); }
}

export { TAU };
