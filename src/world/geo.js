/**
 * Geometry accumulation and architectural primitives.
 *
 * Everything in the temple is generated. Blocks accumulate into a small number
 * of merged meshes (one per chamber per material) so the static architecture
 * costs very few draw calls and can be frozen outright.
 *
 * Two decisions shape all of it:
 *
 * 1. Every block is *bevelled*. A hard 90° edge on stone reads as CG instantly;
 *    a 15–30 mm chamfer catches grazing moonlight and gives the silhouette its
 *    hand-cut quality. It costs ~3× the triangles of a plain box and is worth it.
 *
 * 2. UVs are world-space planar per face rather than per-block [0,1]. Texture
 *    detail then runs continuously across a wall of many blocks instead of
 *    restarting at every joint, so no repeat is ever visible. (This is also why
 *    there is no triplanar shader: on box-dominant geometry, baking the planar
 *    projection into the UVs gives the same result for one texture fetch.)
 */
import { Mesh, VertexData } from "../core/bjs.js";
import { TAU } from "../core/scratch.js";

export const WHITE = [1, 1, 1];

export class Accum {
  /** @param {string} name */
  constructor(name) {
    this.name = name;
    /** @type {number[]} */ this.pos = [];
    /** @type {number[]} */ this.nrm = [];
    /** @type {number[]} */ this.uv = [];
    /** @type {number[]} */ this.idx = [];
    /** World metres -> UV units. 0.34 ≈ a 3 m texture repeat. */
    this.uvScale = 0.34;
  }

  get vertexCount() { return this.pos.length / 3; }
  get triangleCount() { return this.idx.length / 3; }

  vert(x, y, z, nx, ny, nz, u, v) {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }

  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }

  /** World-planar UV for a point given a face normal. */
  planarUV(x, y, z, nx, ny, nz, scale, out, offU = 0, offV = 0) {
    const anx = nx < 0 ? -nx : nx, any = ny < 0 ? -ny : ny, anz = nz < 0 ? -nz : nz;
    if (any >= anx && any >= anz) { out[0] = x * scale + offU; out[1] = z * scale + offV; }
    else if (anx >= anz) { out[0] = z * scale + offU; out[1] = y * scale + offV; }
    else { out[0] = x * scale + offU; out[1] = y * scale + offV; }
  }

  /**
   * Flat-shaded polygon from world positions (CCW seen from the front).
   * @param {number[]} p flat array of 3*n coordinates
   */
  addPolygon(p, uvScale = this.uvScale, flip = false) {
    const n = p.length / 3;
    if (n < 3) return;
    let ax = p[3] - p[0], ay = p[4] - p[1], az = p[5] - p[2];
    let bx = p[(n - 1) * 3] - p[0], by = p[(n - 1) * 3 + 1] - p[1], bz = p[(n - 1) * 3 + 2] - p[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx = -nx / l; ny = -ny / l; nz = -nz / l;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const base = this.vertexCount;
    for (let i = 0; i < n; i++) {
      this.planarUV(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], nx, ny, nz, uvScale, _uv);
      this.vert(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], nx, ny, nz, _uv[0], _uv[1]);
    }
    for (let i = 1; i < n - 1; i++) {
      if (flip) this.tri(base, base + i + 1, base + i);
      else this.tri(base, base + i, base + i + 1);
    }
  }

  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {import("../core/bjs.js").Material} material
   */
  toMesh(scene, material, opts = {}) {
    if (this.idx.length === 0) return null;
    const mesh = new Mesh(this.name, scene);
    const vd = new VertexData();
    vd.positions = new Float32Array(this.pos);
    vd.normals = new Float32Array(this.nrm);
    vd.uvs = new Float32Array(this.uv);
    vd.indices = this.vertexCount > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx);
    vd.applyToMesh(mesh, false);
    mesh.material = material;
    mesh.receiveShadows = opts.receiveShadows !== false;
    mesh.isPickable = opts.pickable !== false;
    // Group 1: the sky (group 0) is laid down first with no depth write, then
    // the world paints over it.
    mesh.renderingGroupId = opts.group === undefined ? 1 : opts.group;
    mesh.checkCollisions = !!opts.collide;
    if (opts.freeze !== false) mesh.freezeWorldMatrix();
    return mesh;
  }
}

const _uv = [0, 0];
const _n = [0, 0, 0];

/* ==================================================================== */
/*  Bevelled block                                                       */
/* ==================================================================== */

/*
 * Vertex scheme. For each of the 8 sign corners (i,j,k) three vertices exist:
 *   Vx = (i·sx, j·iy, k·iz)   on the ±X face
 *   Vy = (i·ix, j·sy, k·iz)   on the ±Y face
 *   Vz = (i·ix, j·iy, k·sz)   on the ±Z face
 * where i* = s* − bevel. Faces join Vx/Vy/Vz of their own axis, the twelve edge
 * chamfers bridge two of them, and eight corner triangles close it.
 */

const CORNERS = [];
for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
  CORNERS.push([i ? 1 : -1, j ? 1 : -1, k ? 1 : -1]);
}
const cornerIndex = (i, j, k) => ((i > 0 ? 1 : 0) << 2) | ((j > 0 ? 1 : 0) << 1) | (k > 0 ? 1 : 0);

/**
 * @param {Accum} a
 * @param {number} cx @param {number} cy @param {number} cz  centre
 * @param {number} sx @param {number} sy @param {number} sz  half extents
 * @param {Object} [o]
 * @param {number} [o.yaw] rotation about Y
 * @param {number} [o.bevel] chamfer in metres (0 disables the chamfer geometry)
 * @param {number} [o.uvScale]
 * @param {boolean} [o.uvContinuous] keep the world projection unbroken across
 *        this block instead of giving it its own patch of stone
 * @param {number[]} [o.settle] four small vertical offsets applied to the top
 *        corners, in (-x-z, +x-z, -x+z, +x+z) order — subsidence
 * @param {boolean} [o.noBottom] skip the downward face (buried blocks)
 */
export function addBlock(a, cx, cy, cz, sx, sy, sz, o) {
  const bevel = o && o.bevel !== undefined ? o.bevel : 0.024;
  const uvs = (o && o.uvScale) || a.uvScale;
  const yaw = (o && o.yaw) || 0;
  const settle = o && o.settle;
  const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);

  // Each block gets its own patch of the stone texture. Real masonry varies
  // from stone to stone rather than blending smoothly across a joint, so this
  // reads better than a per-vertex tint would — and it costs no varying, which
  // matters because WebGPU allows only sixteen and two shadow-casting lights
  // are worth more than a colour channel.
  let offU = 0, offV = 0;
  if (!(o && o.uvContinuous)) {
    const hv = Math.sin(cx * 12.9898 + cy * 78.233 + cz * 37.719) * 43758.5453;
    const h1 = hv - Math.floor(hv);
    const hv2 = Math.sin(cx * 39.3468 + cy * 11.135 + cz * 83.155) * 24634.6345;
    const h2 = hv2 - Math.floor(hv2);
    offU = h1 * 7.31; offV = h2 * 5.77;
  }

  const bx = Math.min(bevel, sx * 0.4), by = Math.min(bevel, sy * 0.4), bz = Math.min(bevel, sz * 0.4);
  const ix = sx - bx, iy = sy - by, iz = sz - bz;

  // Local positions for the 24 vertices, indexed [corner][axis]
  const P = new Array(24);
  for (let c = 0; c < 8; c++) {
    const [i, j, k] = CORNERS[c];
    P[c * 3 + 0] = [i * sx, j * iy, k * iz];
    P[c * 3 + 1] = [i * ix, j * sy, k * iz];
    P[c * 3 + 2] = [i * ix, j * iy, k * sz];
  }
  if (settle) {
    for (let c = 0; c < 8; c++) {
      const [i, j, k] = CORNERS[c];
      if (j < 0) continue;
      const d = settle[(k > 0 ? 2 : 0) + (i > 0 ? 1 : 0)];
      P[c * 3 + 0][1] += d; P[c * 3 + 1][1] += d; P[c * 3 + 2][1] += d;
    }
  }

  const emit = (indices, nx, ny, nz) => {
    // rotate normal
    const rnx = nx * cyaw + nz * syaw, rnz = -nx * syaw + nz * cyaw;
    const base = a.vertexCount;
    for (let t = 0; t < indices.length; t++) {
      const p = P[indices[t]];
      const wx = cx + p[0] * cyaw + p[2] * syaw;
      const wz = cz - p[0] * syaw + p[2] * cyaw;
      const wy = cy + p[1];
      a.planarUV(wx, wy, wz, rnx, ny, rnz, uvs, _uv, offU, offV);
      a.vert(wx, wy, wz, rnx, ny, rnz, _uv[0], _uv[1]);
    }
    for (let t = 1; t < indices.length - 1; t++) a.tri(base, base + t, base + t + 1);
  };

  // --- six faces ---------------------------------------------------------
  // +X
  emit([cornerIndex(1, -1, -1) * 3, cornerIndex(1, -1, 1) * 3, cornerIndex(1, 1, 1) * 3, cornerIndex(1, 1, -1) * 3], 1, 0, 0);
  // -X
  emit([cornerIndex(-1, -1, 1) * 3, cornerIndex(-1, -1, -1) * 3, cornerIndex(-1, 1, -1) * 3, cornerIndex(-1, 1, 1) * 3], -1, 0, 0);
  // +Y
  emit([cornerIndex(-1, 1, -1) * 3 + 1, cornerIndex(1, 1, -1) * 3 + 1, cornerIndex(1, 1, 1) * 3 + 1, cornerIndex(-1, 1, 1) * 3 + 1], 0, 1, 0);
  // -Y
  if (!(o && o.noBottom)) {
    emit([cornerIndex(-1, -1, 1) * 3 + 1, cornerIndex(1, -1, 1) * 3 + 1, cornerIndex(1, -1, -1) * 3 + 1, cornerIndex(-1, -1, -1) * 3 + 1], 0, -1, 0);
  }
  // +Z
  emit([cornerIndex(1, -1, 1) * 3 + 2, cornerIndex(-1, -1, 1) * 3 + 2, cornerIndex(-1, 1, 1) * 3 + 2, cornerIndex(1, 1, 1) * 3 + 2], 0, 0, 1);
  // -Z
  emit([cornerIndex(-1, -1, -1) * 3 + 2, cornerIndex(1, -1, -1) * 3 + 2, cornerIndex(1, 1, -1) * 3 + 2, cornerIndex(-1, 1, -1) * 3 + 2], 0, 0, -1);

  if (bevel <= 0.0005) return;

  // --- twelve chamfer strips --------------------------------------------
  const s2 = Math.SQRT1_2;
  // edges along X: bridge ±Y face and ±Z face
  for (const j of [-1, 1]) for (const k of [-1, 1]) {
    const c0 = cornerIndex(-1, j, k), c1 = cornerIndex(1, j, k);
    const list = j * k > 0
      ? [c0 * 3 + 1, c1 * 3 + 1, c1 * 3 + 2, c0 * 3 + 2]
      : [c0 * 3 + 2, c1 * 3 + 2, c1 * 3 + 1, c0 * 3 + 1];
    emit(list, 0, j * s2, k * s2);
  }
  // edges along Y: bridge ±X face and ±Z face
  for (const i of [-1, 1]) for (const k of [-1, 1]) {
    const c0 = cornerIndex(i, -1, k), c1 = cornerIndex(i, 1, k);
    const list = i * k > 0
      ? [c0 * 3 + 2, c1 * 3 + 2, c1 * 3 + 0, c0 * 3 + 0]
      : [c0 * 3 + 0, c1 * 3 + 0, c1 * 3 + 2, c0 * 3 + 2];
    emit(list, i * s2, 0, k * s2);
  }
  // edges along Z: bridge ±X face and ±Y face
  for (const i of [-1, 1]) for (const j of [-1, 1]) {
    const c0 = cornerIndex(i, j, -1), c1 = cornerIndex(i, j, 1);
    const list = i * j > 0
      ? [c0 * 3 + 0, c1 * 3 + 0, c1 * 3 + 1, c0 * 3 + 1]
      : [c0 * 3 + 1, c1 * 3 + 1, c1 * 3 + 0, c0 * 3 + 0];
    emit(list, i * s2, j * s2, 0);
  }

  // --- eight corner triangles -------------------------------------------
  const s3 = 1 / Math.sqrt(3);
  for (let c = 0; c < 8; c++) {
    const [i, j, k] = CORNERS[c];
    const winding = i * j * k > 0 ? [c * 3 + 0, c * 3 + 1, c * 3 + 2] : [c * 3 + 0, c * 3 + 2, c * 3 + 1];
    emit(winding, i * s3, j * s3, k * s3);
  }
}

/* ==================================================================== */
/*  Coursed masonry                                                      */
/* ==================================================================== */

/**
 * A wall built out of individual courses of blocks with a running bond,
 * per-block settling, tonal variation and optional openings.
 *
 * @param {Accum} a
 * @param {Object} o
 * @param {number[]} o.from [x,z]
 * @param {number[]} o.to [x,z]
 * @param {number} o.base y of the wall foot
 * @param {number} o.height
 * @param {number} o.thickness
 * @param {number} [o.course] course height
 * @param {number} [o.blockLen] nominal block length
 * @param {() => number} o.rng
 * @param {Array<{u0:number,u1:number,y0:number,y1:number}>} [o.openings] in wall-local u (metres along the wall)
 * @param {number} [o.ruin] 0..1 chance a top-course block is missing
 */
export function addWall(a, o) {
  const [x0, z0] = o.from, [x1, z1] = o.to;
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return;
  const ux = dx / len, uz = dz / len;
  const yaw = Math.atan2(ux, uz) - Math.PI / 2;
  const course = o.course || 0.62;
  const blockLen = o.blockLen || 1.35;
  const rng = o.rng;
  const half = o.thickness * 0.5;
  const ruin = o.ruin || 0;
  const openings = o.openings || [];
  const courses = Math.max(1, Math.round(o.height / course));
  const ch = o.height / courses;

  for (let c = 0; c < courses; c++) {
    const y0 = o.base + c * ch;
    const yc = y0 + ch * 0.5;
    // running bond: alternate courses offset by half a block
    let u = (c & 1) ? -blockLen * 0.5 : 0;
    // slight vertical wander so courses are not machine-perfect
    const courseLift = (rng() - 0.5) * 0.012;
    while (u < len) {
      const bl = blockLen * (0.72 + rng() * 0.56);
      const u0 = Math.max(0, u), u1 = Math.min(len, u + bl);
      const w = u1 - u0;
      u += bl + 0.006 + rng() * 0.01;
      if (w < 0.12) continue;

      // openings
      let blocked = false;
      for (let i = 0; i < openings.length; i++) {
        const op = openings[i];
        if (u1 > op.u0 && u0 < op.u1 && yc + ch * 0.5 > op.y0 && yc - ch * 0.5 < op.y1) { blocked = true; break; }
      }
      if (blocked) continue;

      // ruin: upper courses lose blocks
      const heightFrac = c / courses;
      if (ruin > 0 && rng() < ruin * heightFrac * heightFrac * 1.6) continue;

      const um = (u0 + u1) * 0.5;
      const px = x0 + ux * um, pz = z0 + uz * um;
      // small outward jog: settled masonry is never flush
      const jog = (rng() - 0.5) * 0.024;
      addBlock(a,
        px - uz * jog, yc + courseLift, pz + ux * jog,
        w * 0.5 - 0.008, ch * 0.5 - 0.006, half,
        {
          yaw,
          bevel: o.bevel === undefined ? 0.022 : o.bevel,
          uvScale: o.uvScale,
          settle: [(rng() - 0.5) * 0.012, (rng() - 0.5) * 0.012, (rng() - 0.5) * 0.012, (rng() - 0.5) * 0.012],
        });
    }
  }
}

/** Floor of individual slabs with joints, settling and tonal drift. */
export function addFloor(a, o) {
  const rng = o.rng;
  const slab = o.slab || 1.6;
  const y = o.y;
  const t = o.thickness || 0.22;
  const nx = Math.max(1, Math.round((o.x1 - o.x0) / slab));
  const nz = Math.max(1, Math.round((o.z1 - o.z0) / slab));
  const sx = (o.x1 - o.x0) / nx, sz = (o.z1 - o.z0) / nz;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const cx = o.x0 + (i + 0.5) * sx, cz = o.z0 + (j + 0.5) * sz;
      if (o.skip && o.skip(cx, cz)) continue;
      const drop = o.subsidence ? o.subsidence(cx, cz) : 0;
      addBlock(a, cx, y - t * 0.5 + drop, cz, sx * 0.5 - 0.012, t * 0.5, sz * 0.5 - 0.012, {
        bevel: 0.018,
        uvScale: o.uvScale,
        settle: [(rng() - 0.5) * 0.01, (rng() - 0.5) * 0.01, (rng() - 0.5) * 0.01, (rng() - 0.5) * 0.01],
        noBottom: true,
      });
    }
  }
}

/* ==================================================================== */
/*  Rotational forms                                                     */
/* ==================================================================== */

/**
 * Cylinder / truncated cone with smooth side normals.
 * @param {Accum} a
 */
export function addCylinder(a, cx, cy, cz, o) {
  const seg = o.segments || 24;
  const r0 = o.radiusBottom !== undefined ? o.radiusBottom : o.radius;
  const r1 = o.radiusTop !== undefined ? o.radiusTop : o.radius;
  const h = o.height;
  const uvs = o.uvScale || a.uvScale;
  const flutes = o.flutes || 0;
  const fluteDepth = o.fluteDepth || 0.03;
  const entasis = o.entasis || 0;   // classical bulge, 0..1
  const rings = o.rings || (entasis > 0 ? 8 : 1);
  const base = a.vertexCount;

  for (let ry = 0; ry <= rings; ry++) {
    const v = ry / rings;
    const y = cy + v * h;
    let r = r0 + (r1 - r0) * v;
    if (entasis > 0) r *= 1 + Math.sin(v * Math.PI) * entasis * 0.055;
    for (let s = 0; s <= seg; s++) {
      const ang = (s / seg) * TAU;
      let rr = r;
      let nOff = 0;
      if (flutes > 0) {
        const f = Math.cos(ang * flutes);
        rr -= (0.5 - 0.5 * f) * fluteDepth;
        nOff = Math.sin(ang * flutes) * flutes * fluteDepth * 0.5;
      }
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const x = cx + ca * rr, z = cz + sa * rr;
      let nx = ca, nz = sa;
      if (nOff !== 0) { nx = ca - sa * nOff; nz = sa + ca * nOff; }
      const slope = (r0 - r1) / (h || 1);
      let ny = slope * 0.6;
      const l = Math.hypot(nx, ny, nz) || 1;
      a.vert(x, y, z, nx / l, ny / l, nz / l, ang * r * uvs, y * uvs);
    }
  }
  for (let ry = 0; ry < rings; ry++) {
    for (let s = 0; s < seg; s++) {
      const i0 = base + ry * (seg + 1) + s;
      const i1 = i0 + 1;
      const i2 = i0 + (seg + 1);
      const i3 = i2 + 1;
      a.quad(i0, i2, i3, i1);
    }
  }

  if (o.capTop !== false) addDisc(a, cx, cy + h, cz, r1, seg, 1, uvs);
  if (o.capBottom) addDisc(a, cx, cy, cz, r0, seg, -1, uvs);
}

export function addDisc(a, cx, cy, cz, r, seg, dir, uvs = 0.34, innerR = 0) {
  const base = a.vertexCount;
  if (innerR > 0) {
    for (let s = 0; s <= seg; s++) {
      const ang = (s / seg) * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
      a.vert(cx + ca * innerR, cy, cz + sa * innerR, 0, dir, 0, (cx + ca * innerR) * uvs, (cz + sa * innerR) * uvs);
      a.vert(cx + ca * r, cy, cz + sa * r, 0, dir, 0, (cx + ca * r) * uvs, (cz + sa * r) * uvs);
    }
    for (let s = 0; s < seg; s++) {
      const i0 = base + s * 2, i1 = i0 + 1, i2 = i0 + 2, i3 = i0 + 3;
      if (dir > 0) a.quad(i0, i2, i3, i1); else a.quad(i0, i1, i3, i2);
    }
    return;
  }
  const c = a.vert(cx, cy, cz, 0, dir, 0, cx * uvs, cz * uvs);
  for (let s = 0; s <= seg; s++) {
    const ang = (s / seg) * TAU;
    const x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
    a.vert(x, cy, z, 0, dir, 0, x * uvs, z * uvs);
  }
  for (let s = 0; s < seg; s++) {
    if (dir > 0) a.tri(c, c + 1 + s, c + 2 + s);
    else a.tri(c, c + 2 + s, c + 1 + s);
  }
}

/**
 * Rectangular-section ring — the bronze band every armillary and orrery is
 * built from. `axis` selects the ring plane: 0 = ring in YZ (spins about X),
 * 1 = ring in XZ (about Y), 2 = ring in XY (about Z).
 */
export function addRingBand(a, cx, cy, cz, o) {
  const R = o.radius;
  const w = o.width;            // radial thickness
  const t = o.depth;            // axial thickness
  const seg = o.segments || 96;
  const uvs = o.uvScale || a.uvScale;
  const axis = o.axis === undefined ? 1 : o.axis;
  const arc = o.arc === undefined ? TAU : o.arc;
  const arcStart = o.arcStart || 0;
  const closed = arc >= TAU - 1e-6;

  const put = (ang, rad, off) => {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    if (axis === 1) return [cx + ca * rad, cy + off, cz + sa * rad];
    if (axis === 0) return [cx + off, cy + ca * rad, cz + sa * rad];
    return [cx + ca * rad, cy + sa * rad, cz + off];
  };
  const nrmOf = (ang, sign) => {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    if (axis === 1) return [ca * sign, 0, sa * sign];
    if (axis === 0) return [0, ca * sign, sa * sign];
    return [ca * sign, sa * sign, 0];
  };
  const axisN = axis === 1 ? [0, 1, 0] : axis === 0 ? [1, 0, 0] : [0, 0, 1];

  const rOut = R + w * 0.5, rIn = R - w * 0.5, hz = t * 0.5;
  const strips = [
    { rad: rOut, off: -hz, n: 1, kind: "out" },
    { rad: rOut, off: hz, n: 1, kind: "out" },
    { rad: rIn, off: hz, n: -1, kind: "in" },
    { rad: rIn, off: -hz, n: -1, kind: "in" },
  ];

  // side faces (outer, inner)
  for (const face of [[0, 1, 1], [3, 2, -1]]) {
    const s0 = strips[face[0]], s1 = strips[face[1]], sign = face[2];
    const base = a.vertexCount;
    for (let s = 0; s <= seg; s++) {
      const ang = arcStart + (s / seg) * arc;
      const nb = nrmOf(ang, sign);
      const p0 = put(ang, s0.rad, s0.off), p1 = put(ang, s1.rad, s1.off);
      const arcLen = ang * R;
      a.vert(p0[0], p0[1], p0[2], nb[0], nb[1], nb[2], arcLen * uvs, -hz * uvs);
      a.vert(p1[0], p1[1], p1[2], nb[0], nb[1], nb[2], arcLen * uvs, hz * uvs);
    }
    for (let s = 0; s < seg; s++) {
      const i0 = base + s * 2;
      a.quad(i0, i0 + 2, i0 + 3, i0 + 1);
    }
  }
  // flat faces (the two annulus sides)
  for (const face of [[1, 2, 1], [0, 3, -1]]) {
    const s0 = strips[face[0]], s1 = strips[face[1]], sign = face[2];
    const base = a.vertexCount;
    const nb = [axisN[0] * sign, axisN[1] * sign, axisN[2] * sign];
    for (let s = 0; s <= seg; s++) {
      const ang = arcStart + (s / seg) * arc;
      const p0 = put(ang, s0.rad, s0.off), p1 = put(ang, s1.rad, s1.off);
      const arcLen = ang * R;
      a.vert(p0[0], p0[1], p0[2], nb[0], nb[1], nb[2], arcLen * uvs, rOut * uvs);
      a.vert(p1[0], p1[1], p1[2], nb[0], nb[1], nb[2], arcLen * uvs, rIn * uvs);
    }
    for (let s = 0; s < seg; s++) {
      const i0 = base + s * 2;
      if (sign > 0) a.quad(i0, i0 + 2, i0 + 3, i0 + 1);
      else a.quad(i0, i0 + 1, i0 + 3, i0 + 2);
    }
  }
  // end caps for arcs
  if (!closed) {
    for (const [ang, sign] of [[arcStart, -1], [arcStart + arc, 1]]) {
      const p = [];
      const a0 = put(ang, rOut, -hz), a1 = put(ang, rOut, hz), a2 = put(ang, rIn, hz), a3 = put(ang, rIn, -hz);
      if (sign > 0) p.push(...a0, ...a1, ...a2, ...a3);
      else p.push(...a3, ...a2, ...a1, ...a0);
      a.addPolygon(p, uvs);
    }
  }
}

/**
 * Hemispherical dome shell with optional oculus and internal ribs.
 * Generates both the outer and inner surfaces so it reads correctly from below.
 */
export function addDome(a, cx, cy, cz, o) {
  const R = o.radius;
  const seg = o.segments || 48;
  const rings = o.rings || 20;
  const thick = o.thickness || 0.5;
  const uvs = o.uvScale || a.uvScale;
  const oculus = o.oculus || 0;                  // radius of the opening at the top
  const startPhi = oculus > 0 ? Math.asin(Math.min(0.999, oculus / R)) : 0;
  const endPhi = o.endPhi === undefined ? Math.PI / 2 : o.endPhi;
  const arc = o.arc === undefined ? TAU : o.arc;
  const arcStart = o.arcStart || 0;
  const ruin = o.ruin || null;                   // (theta, phi) -> true to omit

  for (const side of [1, -1]) {
    const r = side > 0 ? R : R - thick;
    for (let ry = 0; ry < rings; ry++) {
      const p0 = startPhi + (endPhi - startPhi) * (ry / rings);
      const p1 = startPhi + (endPhi - startPhi) * ((ry + 1) / rings);
      for (let s = 0; s < seg; s++) {
        const t0 = arcStart + (s / seg) * arc;
        const t1 = arcStart + ((s + 1) / seg) * arc;
        if (ruin && ruin((t0 + t1) * 0.5, (p0 + p1) * 0.5)) continue;
        const P = [];
        const push = (th, ph) => {
          const cp = Math.cos(ph), sp = Math.sin(ph);
          P.push(cx + Math.cos(th) * cp * r, cy + sp * r, cz + Math.sin(th) * cp * r);
        };
        if (side > 0) { push(t0, p0); push(t1, p0); push(t1, p1); push(t0, p1); }
        else { push(t0, p1); push(t1, p1); push(t1, p0); push(t0, p0); }
        // smooth normals: radial
        const base = a.vertexCount;
        for (let i = 0; i < 4; i++) {
          const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
          let nx = (x - cx), ny = (y - cy), nz = (z - cz);
          const l = Math.hypot(nx, ny, nz) || 1;
          nx = nx / l * side; ny = ny / l * side; nz = nz / l * side;
          const th = Math.atan2(z - cz, x - cx);
          a.vert(x, y, z, nx, ny, nz, th * R * uvs, (Math.asin(Math.max(-1, Math.min(1, (y - cy) / r)))) * R * uvs);
        }
        a.quad(base, base + 1, base + 2, base + 3);
      }
    }
  }
}

/** Straight run of steps. Returns the top landing y. */
export function addStairs(a, o) {
  const steps = o.steps;
  const rise = o.rise, run = o.run;
  const width = o.width;
  const rng = o.rng || Math.random;
  const [dx, dz] = o.dir;                 // unit direction of ascent
  const px = -dz, pz = dx;                // perpendicular
  let x = o.x, z = o.z, y = o.y;
  for (let i = 0; i < steps; i++) {
    const cx = x + dx * run * 0.5, cz = z + dz * run * 0.5;
    const cy = y + rise * 0.5;
    const yaw = Math.atan2(dx, dz);
    const wear = o.wear ? o.wear * (0.4 + rng() * 0.6) : 0;
    // Steps are made of two or three stones across, not one slab.
    const pieces = Math.max(1, Math.round(width / (o.blockWidth || 1.9)));
    const pw = width / pieces;
    for (let p = 0; p < pieces; p++) {
      const off = -width * 0.5 + (p + 0.5) * pw;
      addBlock(a, cx + px * off, cy - wear * 0.25, cz + pz * off,
        run * 0.5, rise * 0.5, pw * 0.5 - 0.01,
        {
          yaw: yaw + Math.PI / 2,
          bevel: 0.03,
          uvScale: o.uvScale,
          settle: [(rng() - 0.5) * 0.008, (rng() - 0.5) * 0.008, (rng() - 0.5) * 0.008, (rng() - 0.5) * 0.008],
          noBottom: true,
        });
    }
    x += dx * run; z += dz * run; y += rise;
  }
  return { x, y, z };
}

/** Scattered collapse debris. */
export function addRubble(a, o) {
  const rng = o.rng;
  const n = o.count;
  for (let i = 0; i < n; i++) {
    const ang = rng() * TAU;
    const rad = Math.pow(rng(), o.bias || 0.6) * o.radius;
    const x = o.x + Math.cos(ang) * rad;
    const z = o.z + Math.sin(ang) * rad;
    const s = (o.minSize || 0.09) + Math.pow(rng(), 2) * ((o.maxSize || 0.55) - (o.minSize || 0.09));
    const y = (o.yAt ? o.yAt(x, z) : o.y) + s * 0.42;
    addBlock(a, x, y, z, s * (0.6 + rng() * 0.8), s * (0.4 + rng() * 0.5), s * (0.6 + rng() * 0.8), {
      yaw: rng() * TAU,
      bevel: Math.min(0.05, s * 0.3),
      uvScale: o.uvScale,
      noBottom: true,
    });
  }
}

/** Semicircular arch built from voussoirs, with an optional keystone. */
export function addArch(a, o) {
  const seg = o.segments || 13;
  const R = o.span * 0.5;
  const depth = o.depth;
  const thick = o.thickness || 0.55;
  const rng = o.rng || Math.random;
  const yaw = o.yaw || 0;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI, a1 = ((i + 1) / seg) * Math.PI;
    const am = (a0 + a1) * 0.5;
    const rMid = R + thick * 0.5;
    const lx = Math.cos(am) * rMid;
    const ly = Math.sin(am) * rMid;
    const wx = o.x + lx * cy, wz = o.z - lx * sy;
    addBlock(a, wx, o.y + ly, wz,
      (Math.PI * rMid / seg) * 0.5 - 0.008, thick * 0.5, depth * 0.5,
      {
        yaw: yaw - am + Math.PI / 2,
        bevel: 0.02,
        uvScale: o.uvScale,
      });
  }
}

/** Column with plinth, shaft (entasis + optional flutes) and capital. */
export function addColumn(a, cx, cy, cz, o) {
  const h = o.height;
  const r = o.radius;
  const uvs = o.uvScale;
  const plinth = o.plinth === undefined ? 0.24 : o.plinth;
  const capital = o.capital === undefined ? 0.3 : o.capital;
  if (plinth > 0) {
    addBlock(a, cx, cy + plinth * 0.5, cz, r * 1.42, plinth * 0.5, r * 1.42, { bevel: 0.03, uvScale: uvs, yaw: o.yaw || 0 });
  }
  const shaftH = h - plinth - capital;
  addCylinder(a, cx, cy + plinth, cz, {
    radiusBottom: r, radiusTop: r * (o.taper === undefined ? 0.88 : o.taper),
    height: shaftH, segments: o.segments || 28, flutes: o.flutes || 0,
    fluteDepth: o.fluteDepth || r * 0.09, entasis: o.entasis === undefined ? 1 : o.entasis,
    rings: 10, uvScale: uvs, capTop: false, capBottom: false,
  });
  if (capital > 0) {
    const rt = r * (o.taper === undefined ? 0.88 : o.taper);
    addCylinder(a, cx, cy + plinth + shaftH, cz, {
      radiusBottom: rt, radiusTop: rt * 1.22, height: capital * 0.55,
      segments: o.segments || 28, uvScale: uvs, capTop: false,
    });
    addBlock(a, cx, cy + plinth + shaftH + capital * 0.78, cz, rt * 1.5, capital * 0.23, rt * 1.5,
      { bevel: 0.025, uvScale: uvs, yaw: o.yaw || 0 });
  }
}

/** A horizontal beam / lintel / architrave between two points. */
export function addBeam(a, x0, y0, z0, x1, y1, z1, o) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz) - Math.PI / 2;
  addBlock(a, (x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5,
    Math.hypot(len, dy) * 0.5, (o.height || 0.4) * 0.5, (o.width || 0.4) * 0.5,
    { yaw, bevel: o.bevel === undefined ? 0.025 : o.bevel, uvScale: o.uvScale });
}

/** Thin projecting cornice course running along a wall line. */
export function addCornice(a, o) {
  const [x0, z0] = o.from, [x1, z1] = o.to;
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
  const yaw = Math.atan2(ux, uz) - Math.PI / 2;
  const n = Math.max(1, Math.round(len / (o.piece || 1.8)));
  const pl = len / n;
  const rng = o.rng || Math.random;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) * pl;
    const x = x0 + ux * u, z = z0 + uz * u;
    if (o.ruin && rng() < o.ruin) continue;
    for (let l = 0; l < (o.layers || 2); l++) {
      const proj = (o.project || 0.22) * (1 - l * 0.45);
      const hy = (o.layerHeight || 0.16);
      addBlock(a, x - uz * proj * 0.5, o.y + l * hy + hy * 0.5, z + ux * proj * 0.5,
        pl * 0.5 - 0.01, hy * 0.5, ((o.thickness || 0.5) + proj) * 0.5,
        { yaw, bevel: 0.02, uvScale: o.uvScale });
    }
  }
}
