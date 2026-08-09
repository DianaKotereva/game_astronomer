/**
 * The protagonist's body.
 *
 * She reads as scholar, traveller and mage — long coat over a belted tunic, a
 * layered mantle at the shoulders, a scarf, a satchel of instruments, heavy
 * boots, a lantern in the left hand and the celestial focus in the right.
 *
 * The body is built from overlapping capsules parented to a hand-authored bone
 * hierarchy rather than a skinned mesh. Seen from behind at medium distance,
 * through a coat, an articulated build with rounded joints is indistinguishable
 * from skinning — and it puts the whole budget where the brief asks for it:
 * silhouette, cloth, instruments and hands (§8).
 *
 * Pose is entirely procedural. There are no animation clips: the walk is
 * generated from stride phase with real foot planting, and every interaction
 * pose is an IK target the arms solve toward.
 */
import { Mesh, VertexData, TransformNode, Vector3, Quaternion, Matrix, Space } from "../core/bjs.js";
import { TAU, clamp, lerp, damp, DEG } from "../core/scratch.js";

/* ------------------------------------------------------------------ */
/* Capsule geometry                                                    */
/* ------------------------------------------------------------------ */

/**
 * A capsule along +Y, from y=0 to y=len, with hemispherical caps.
 * Cross-section may be elliptical, which is what keeps a torso from looking
 * like a sausage.
 */
function capsuleData(len, r0, r1, seg = 12, rings = 5, squashX = 1, squashZ = 1) {
  const pos = [], nrm = [], uv = [], idx = [];
  const totalRings = rings * 2 + 2;
  const push = (x, y, z, nx, ny, nz, u, v) => {
    pos.push(x, y, z); nrm.push(nx, ny, nz); uv.push(u, v);
  };
  for (let ring = 0; ring <= totalRings; ring++) {
    let y, r, ny;
    const t = ring / totalRings;
    if (ring <= rings) {
      // bottom cap
      const a = (ring / rings) * (Math.PI / 2);
      y = -Math.cos(a) * r0;
      r = Math.sin(a) * r0;
      ny = -Math.cos(a);
    } else if (ring >= totalRings - rings) {
      const a = ((totalRings - ring) / rings) * (Math.PI / 2);
      y = len + Math.cos(a) * r1;
      r = Math.sin(a) * r1;
      ny = Math.cos(a);
    } else {
      const s = (ring - rings) / (totalRings - 2 * rings);
      y = len * s;
      r = lerp(r0, r1, s);
      ny = 0;
    }
    for (let s = 0; s <= seg; s++) {
      const ang = (s / seg) * TAU;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const rr = Math.max(1e-4, r);
      const nxy = Math.sqrt(Math.max(0, 1 - ny * ny));
      push(ca * rr * squashX, y, sa * rr * squashZ,
        ca * nxy / squashX, ny, sa * nxy / squashZ,
        s / seg, t);
    }
  }
  for (let ring = 0; ring < totalRings; ring++) {
    for (let s = 0; s < seg; s++) {
      const a = ring * (seg + 1) + s, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // normalise normals (the elliptical squash denormalises them)
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
  }
  return { pos, nrm, uv, idx };
}

/** Accumulator that can bake several capsules/boxes into one mesh. */
class PartAccum {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.idx = []; }

  /**
   * @param {{pos:number[],nrm:number[],uv:number[],idx:number[]}} data
   * @param {import("../core/bjs.js").Matrix} mat transform to bake in
   */
  add(data, mat) {
    // Babylon's Matrix keeps its floats in `.m`; indexing the object itself
    // yields undefined, and undefined arithmetic silently produces NaN for
    // every vertex — geometry that exists, reports its vertex count, and draws
    // nothing at all.
    const m = mat.m || mat;
    const base = this.pos.length / 3;
    const p = data.pos, n = data.nrm;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      this.pos.push(
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14]);
      const nx = n[i], ny = n[i + 1], nz = n[i + 2];
      this.nrm.push(
        m[0] * nx + m[4] * ny + m[8] * nz,
        m[1] * nx + m[5] * ny + m[9] * nz,
        m[2] * nx + m[6] * ny + m[10] * nz);
    }
    for (let i = 0; i < data.uv.length; i++) this.uv.push(data.uv[i]);
    for (let i = 0; i < data.idx.length; i++) this.idx.push(base + data.idx[i]);
  }

  toMesh(scene, name, material) {
    if (!this.idx.length) return null;
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = new Float32Array(this.pos);
    vd.normals = new Float32Array(this.nrm);
    vd.uvs = new Float32Array(this.uv);
    vd.indices = new Uint32Array(this.idx);
    vd.applyToMesh(mesh, false);
    mesh.material = material;
    mesh.renderingGroupId = 1;
    mesh.isPickable = false;
    return mesh;
  }
}

const _m = Matrix.Identity();

/** Build a transform for a capsule: origin, direction, and a roll. */
function capsuleMatrix(ox, oy, oz, dx, dy, dz, out) {
  let ux = dx, uy = dy, uz = dz;
  const l = Math.hypot(ux, uy, uz) || 1;
  ux /= l; uy /= l; uz /= l;
  // pick any perpendicular
  let rx = 0, ry = 0, rz = 1;
  if (Math.abs(uz) > 0.9) { rx = 1; ry = 0; rz = 0; }
  let ax = ry * uz - rz * uy, ay = rz * ux - rx * uz, az = rx * uy - ry * ux;
  const al = Math.hypot(ax, ay, az) || 1;
  ax /= al; ay /= al; az /= al;
  const bx = uy * az - uz * ay, by = uz * ax - ux * az, bz = ux * ay - uy * ax;
  const m = out.m;
  m[0] = ax; m[1] = ay; m[2] = az; m[3] = 0;
  m[4] = ux; m[5] = uy; m[6] = uz; m[7] = 0;
  m[8] = bx; m[9] = by; m[10] = bz; m[11] = 0;
  m[12] = ox; m[13] = oy; m[14] = oz; m[15] = 1;
  out.markAsUpdated();
  return out;
}

/* ------------------------------------------------------------------ */
/* Rig                                                                 */
/* ------------------------------------------------------------------ */

export const RIG = {
  height: 1.74,
  hipY: 0.94,
  chestY: 1.32,
  neckY: 1.50,
  headY: 1.60,
  shoulderX: 0.185,
  shoulderY: 1.44,
  upperArm: 0.29,
  foreArm: 0.27,
  thigh: 0.44,
  shin: 0.43,
  footLen: 0.26,
  hipX: 0.095,
};

export class Rig {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {import("../materials/materials.js").MaterialLib} mats
   */
  constructor(scene, mats) {
    this.scene = scene;
    this.mats = mats;

    this.root = new TransformNode("char", scene);
    this.root.rotationQuaternion = Quaternion.Identity();

    // --- bone nodes ------------------------------------------------------
    const N = (name, parent, x, y, z) => {
      const t = new TransformNode(name, scene);
      t.parent = parent;
      t.position.set(x, y, z);
      t.rotationQuaternion = Quaternion.Identity();
      return t;
    };
    this.pelvis = N("pelvis", this.root, 0, RIG.hipY, 0);
    this.spine = N("spine", this.pelvis, 0, 0.16, 0);
    this.chest = N("chest", this.spine, 0, 0.22, 0);
    this.neck = N("neck", this.chest, 0, 0.16, 0);
    this.head = N("head", this.neck, 0, 0.10, 0.008);

    this.armL = N("armL", this.chest, -RIG.shoulderX, 0.10, 0);
    this.foreL = N("foreL", this.armL, 0, -RIG.upperArm, 0);
    this.handL = N("handL", this.foreL, 0, -RIG.foreArm, 0);
    this.armR = N("armR", this.chest, RIG.shoulderX, 0.10, 0);
    this.foreR = N("foreR", this.armR, 0, -RIG.upperArm, 0);
    this.handR = N("handR", this.foreR, 0, -RIG.foreArm, 0);

    this.thighL = N("thighL", this.pelvis, -RIG.hipX, -0.02, 0);
    this.shinL = N("shinL", this.thighL, 0, -RIG.thigh, 0);
    this.footL = N("footL", this.shinL, 0, -RIG.shin, 0);
    this.thighR = N("thighR", this.pelvis, RIG.hipX, -0.02, 0);
    this.shinR = N("shinR", this.thighR, 0, -RIG.thigh, 0);
    this.footR = N("footR", this.shinR, 0, -RIG.shin, 0);

    this._buildMeshes();
  }

  _buildMeshes() {
    const scene = this.scene, mats = this.mats;

    const matCoat = mats.cloth({
      key: "_coat", seed: 131, color: [0.028, 0.032, 0.048], threads: 150, sheen: 0.45, wear: 0.5,
    });
    const matUnder = mats.cloth({
      key: "_under", seed: 211, color: [0.052, 0.046, 0.038], threads: 190, sheen: 0.25, wear: 0.8,
    });
    const matLeather = mats.wood({ key: "_leather", seed: 353 });
    const matSkin = mats.cloth({
      key: "_skin", seed: 407, color: [0.30, 0.215, 0.165], threads: 420, sheen: 0.12, wear: 0.2,
    });
    this.matCoat = matCoat;
    this.matUnder = matUnder;
    this.matLeather = matLeather;

    // --- torso and limbs, as capsules parented to bones -------------------
    const attach = (parent, build, material, name) => {
      const acc = new PartAccum();
      build(acc);
      const mesh = acc.toMesh(scene, name, material);
      if (mesh) { mesh.parent = parent; }
      return mesh;
    };

    // Torso: two stacked elliptical capsules — hips flaring to a fuller chest.
    this.meshPelvis = attach(this.pelvis, (a) => {
      a.add(capsuleData(0.16, 0.135, 0.128, 14, 4, 1.22, 0.86), capsuleMatrix(0, -0.02, 0, 0, 1, 0, _m));
    }, matUnder, "pelvisMesh");

    this.meshChest = attach(this.spine, (a) => {
      a.add(capsuleData(0.30, 0.128, 0.152, 14, 4, 1.20, 0.80), capsuleMatrix(0, 0, 0, 0, 1, 0, _m));
    }, matUnder, "chestMesh");

    // Head with a hood pushed back off the face.
    this.meshHead = attach(this.head, (a) => {
      a.add(capsuleData(0.085, 0.088, 0.078, 16, 6, 1.0, 1.06), capsuleMatrix(0, 0.02, 0, 0, 1, 0, _m));
    }, matSkin, "headMesh");

    this.meshHood = attach(this.head, (a) => {
      // A cowl pushed back off the face: it sits on the crown and falls behind,
      // so the head still reads as a head from any angle.
      a.add(capsuleData(0.055, 0.098, 0.104, 16, 6, 1.02, 1.10), capsuleMatrix(0, 0.028, -0.020, -0.06, 1, -0.30, _m));
      a.add(capsuleData(0.13, 0.088, 0.042, 12, 4, 1.0, 1.0), capsuleMatrix(0, 0.02, -0.085, 0, -0.55, -1, _m));
    }, matCoat, "hoodMesh");

    // Arms
    const arm = (parent, len, r0, r1, nm, mat) => attach(parent, (a) => {
      a.add(capsuleData(len, r0, r1, 10, 4), capsuleMatrix(0, 0, 0, 0, -1, 0, _m));
    }, mat, nm);
    this.meshUpperL = arm(this.armL, RIG.upperArm, 0.062, 0.052, "upperL", matCoat);
    this.meshForeL = arm(this.foreL, RIG.foreArm, 0.052, 0.042, "foreL", matCoat);
    this.meshUpperR = arm(this.armR, RIG.upperArm, 0.062, 0.052, "upperR", matCoat);
    this.meshForeR = arm(this.foreR, RIG.foreArm, 0.052, 0.042, "foreR", matCoat);

    // Hands: a palm block and a suggestion of fingers. They will be seen on
    // instrument rings, so they need enough shape to read as gripping.
    const hand = (parent, side, nm) => attach(parent, (a) => {
      a.add(capsuleData(0.075, 0.038, 0.034, 8, 3, 1.0, 0.62), capsuleMatrix(0, 0, 0, 0, -1, 0, _m));
      for (let f = 0; f < 4; f++) {
        const off = (f - 1.5) * 0.019;
        a.add(capsuleData(0.055, 0.011, 0.009, 6, 2), capsuleMatrix(off, -0.072, 0.004, 0.12 * side, -1, 0.25, _m));
      }
      a.add(capsuleData(0.045, 0.013, 0.010, 6, 2), capsuleMatrix(0.028 * side, -0.030, 0.018, 0.55 * side, -0.6, 0.5, _m));
    }, matSkin, nm);
    this.meshHandL = hand(this.handL, -1, "handL_m");
    this.meshHandR = hand(this.handR, 1, "handR_m");

    // Legs
    this.meshThighL = arm(this.thighL, RIG.thigh, 0.082, 0.062, "thighL_m", matUnder);
    this.meshShinL = arm(this.shinL, RIG.shin, 0.060, 0.048, "shinL_m", matUnder);
    this.meshThighR = arm(this.thighR, RIG.thigh, 0.082, 0.062, "thighR_m", matUnder);
    this.meshShinR = arm(this.shinR, RIG.shin, 0.060, 0.048, "shinR_m", matUnder);

    // Boots: heavy, with a defined sole and a turned-over cuff.
    const boot = (parent, nm) => attach(parent, (a) => {
      a.add(capsuleData(0.17, 0.072, 0.064, 10, 3, 1.0, 1.05), capsuleMatrix(0, 0.02, 0, 0, 1, 0, _m));   // ankle
      a.add(capsuleData(0.20, 0.055, 0.042, 10, 3, 1.15, 1.0), capsuleMatrix(0, 0.012, 0.02, 0, 0.06, 1, _m)); // foot
      a.add(capsuleData(0.24, 0.030, 0.026, 8, 2, 1.5, 1.0), capsuleMatrix(0, -0.028, 0.0, 0, 0.02, 1, _m));   // sole
      a.add(capsuleData(0.06, 0.085, 0.080, 12, 3, 1.0, 1.05), capsuleMatrix(0, 0.16, -0.005, 0, 1, 0, _m));   // cuff
    }, matLeather, nm);
    this.meshBootL = boot(this.footL, "bootL");
    this.meshBootR = boot(this.footR, "bootR");

    // Satchel and strap: the scholar's kit, worn across the body.
    this.meshSatchel = attach(this.chest, (a) => {
      a.add(capsuleData(0.16, 0.085, 0.085, 8, 3, 1.35, 0.52), capsuleMatrix(0.20, -0.30, -0.02, 0.12, 1, 0, _m));
      a.add(capsuleData(0.05, 0.088, 0.086, 8, 2, 1.34, 0.54), capsuleMatrix(0.205, -0.15, -0.02, 0.12, 1, 0, _m)); // flap
      a.add(capsuleData(0.52, 0.017, 0.017, 6, 2, 1.9, 0.5), capsuleMatrix(-0.13, 0.14, -0.02, 0.62, -1, 0.02, _m)); // strap
      // a rolled chart tube on the other hip
      a.add(capsuleData(0.34, 0.032, 0.032, 8, 3), capsuleMatrix(-0.19, -0.34, -0.05, 0.16, 1, -0.1, _m));
    }, matLeather, "satchel");

    // A belt with small brass fittings.
    this.meshBelt = attach(this.pelvis, (a) => {
      a.add(capsuleData(0.055, 0.148, 0.150, 16, 2, 1.20, 0.88), capsuleMatrix(0, 0.06, 0, 0, 1, 0, _m));
    }, matLeather, "belt");

    /** Everything that should cast a shadow. */
    this.meshes = [
      this.meshPelvis, this.meshChest, this.meshHead, this.meshHood,
      this.meshUpperL, this.meshForeL, this.meshUpperR, this.meshForeR,
      this.meshHandL, this.meshHandR,
      this.meshThighL, this.meshShinL, this.meshThighR, this.meshShinR,
      this.meshBootL, this.meshBootR, this.meshSatchel, this.meshBelt,
    ].filter(Boolean);
  }

  setEnabled(v) {
    this.root.setEnabled(v);
  }

  dispose() {
    this.root.dispose(false, true);
  }
}

export { capsuleData, PartAccum, capsuleMatrix };
