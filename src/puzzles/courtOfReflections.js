/**
 * Puzzle 4 — The Court of Reflections.
 *
 * The astronomy-dominant puzzle (§31). Everything mechanical here is trivial —
 * four mirrors, each free to turn about a vertical axis, each with a graduated
 * dial. What is not trivial is knowing what to set them to.
 *
 * The recovered leaf states the rule outright: "The mirrors are not set to catch
 * a beam. They are set to hold an angle: each pair stands at the separation of
 * two stars of the figure, so that light entering along one edge leaves along
 * the next. Measure the sky first. Then set the metal."
 *
 * So: the court floor carries the temple's own figure, the Gate, inlaid in
 * bronze at a fixed number of metres to the degree, with a mirror mount standing
 * on each of its four stars. The mount standing on a star is set to the angular
 * separation between that star and the next one round the figure. Those four
 * numbers are not written anywhere in the temple. They are in the sky, and the
 * player gets them the way an astronomer would: mark a star in Observation Mode,
 * sight the next one, read the separation off the instrument.
 *
 * Two things make this hold together rather than being arithmetic homework:
 *
 * - The dials are datum-offset. Each mount carries a cut datum mark, and the
 *   dial reads degrees *from that mark*. The builders supplied the datums; the
 *   astronomer supplies the separations. This is why the numbers to enter are
 *   the raw separations and not some derived angle — and it is also why the
 *   optics below are real rather than a lookup.
 * - The beam is genuinely ray-traced through the mirrors' actual orientations.
 *   A mirror a degree out does not "fail a check"; it sends the light somewhere
 *   else, and you can see where, and the direction of the error tells you which
 *   way to turn. That is the failure feedback (§64), and it costs nothing
 *   because reflecting a 2-D vector is four multiplies.
 *
 * The figure is the Gate, which is a temple figure — so it is legible only to a
 * player who has been to the Archive and recovered the temple's own constellation
 * set. That is the cross-area knowledge dependency §83 asks for.
 *
 * Full write-up in PUZZLES.md.
 */
import { Vector3, TransformNode, Quaternion } from "../core/bjs.js";
import { Accum, addBlock, addCylinder, addRingBand, addDisc } from "../world/geo.js";
import { RotaryAxis } from "../mechanisms/mechanism.js";
import { ThreadRenderer, MoteRenderer, MagicLights } from "../magic/stellar.js";
import { REFLECT } from "../world/chambers/courtOfReflections.js";
import { BRIGHT_STARS } from "../astronomy/catalog.js";
import { angularSeparation } from "../interaction/observation.js";
import { DEG, RAD, TAU, clamp, clamp01, damp, wrapPi } from "../core/scratch.js";

/** The Gate's outer cycle. Each mount is set to the edge leaving its own star. */
export const CYCLE = ["Vega", "Deneb", "Albireo", "Altair"];

/** The order the light visits the mounts. Chosen for readability of the path,
 *  not for meaning — the dial values depend on the figure, never on the tour. */
export const TOUR = ["Deneb", "Vega", "Albireo", "Altair"];

/** Height of the optical plane above the court floor. */
const BEAM_Y = 1.55;
/** How close a dial must be, in degrees, before its mount seats. */
export const TOLERANCE = 0.6;

const _v = new Vector3();
const _q = new Quaternion();

/** Look a catalogue star up by name. */
function star(name) {
  for (let i = 0; i < BRIGHT_STARS.length; i++) if (BRIGHT_STARS[i].name === name) return BRIGHT_STARS[i];
  return null;
}

/**
 * Lay a figure out flat.
 *
 * Gnomonic projection about the figure's own centroid — the same projection a
 * draughtsman with a straightedge would get by sighting through a hole, which
 * is presumably how the builders did it. Returns offsets in degrees, which the
 * caller scales to metres.
 */
function projectFigure(names) {
  const V = names.map((n) => {
    const s = star(n);
    const r = s.ra * DEG, d = s.dec * DEG;
    return [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)];
  });
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  let c = [0, 0, 0];
  for (const v of V) { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; }
  c = norm(c);
  const up = [0, 0, 1];
  const e1 = norm([up[0] - c[0] * dot(c, up), up[1] - c[1] * dot(c, up), up[2] - c[2] * dot(c, up)]);
  const e2 = cross(c, e1);

  return V.map((v) => {
    const s = 1 / dot(v, c);
    const p = [v[0] * s, v[1] * s, v[2] * s];
    return [dot(p, e1) * RAD, dot(p, e2) * RAD];
  });
}

/**
 * Everything about the court that is pure geometry: where the stars land, what
 * each dial must read, and the datum that makes those two agree.
 *
 * Kept free of the scene deliberately. The correctness of this puzzle *is* the
 * puzzle — if the datums are wrong then the intended solution does not work and
 * no amount of looking at the room will reveal it — so it has to be checkable
 * without booting a renderer. `tools/courtcheck.mjs` does exactly that.
 */
export function planCourt(fieldRadius = REFLECT.fieldRadius, cx = REFLECT.cx, cz = REFLECT.cz) {
  const offs = projectFigure(CYCLE);
  let maxR = 0;
  for (const p of offs) maxR = Math.max(maxR, Math.hypot(p[0], p[1]));
  const metresPerDegree = (fieldRadius - 1.4) / maxR;

  const starPos = new Map();
  CYCLE.forEach((n, i) => {
    // u (toward celestial north) runs north on the floor; v runs east.
    starPos.set(n, { x: cx + offs[i][1] * metresPerDegree, z: cz + offs[i][0] * metresPerDegree });
  });

  const target = new Map();
  for (let i = 0; i < CYCLE.length; i++) {
    const a = star(CYCLE[i]), b = star(CYCLE[(i + 1) % CYCLE.length]);
    target.set(CYCLE[i], angularSeparation(a.ra, a.dec, b.ra, b.dec));
  }

  const collector = { x: cx - 9.0, z: REFLECT.doorZ };
  const path = [[collector.x, collector.z]];
  for (const n of TOUR) { const p = starPos.get(n); path.push([p.x, p.z]); }
  const last = path[path.length - 1];
  const receiver = { x: last[0] + 7.5, z: last[1] };
  path.push([receiver.x, receiver.z]);

  // Each mount's required orientation follows from the two segments meeting at
  // it; the datum is whatever makes the dial read the separation instead.
  const datum = new Map();
  for (let i = 1; i < path.length - 1; i++) {
    const name = TOUR[i - 1];
    const inc = normalise(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    const out = normalise(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    const n = normalise(out[0] - inc[0], out[1] - inc[1]);
    datum.set(name, wrapPi(Math.atan2(n[0], n[1]) - target.get(name) * DEG));
  }

  return { metresPerDegree, starPos, target, datum, collector, receiver };
}

/**
 * Trace the beam through the mirrors as they actually stand.
 *
 * @param {ReturnType<typeof planCourt>} plan
 * @param {(name:string)=>number} angleOf  dial angle, radians from the datum
 * @param {number[]} [out] reused polyline buffer (x,z pairs)
 */
export function traceBeam(plan, angleOf, out = []) {
  out.length = 0;
  out.push(plan.collector.x, plan.collector.z);

  let px = plan.collector.x, pz = plan.collector.z;
  const first = plan.starPos.get(TOUR[0]);
  // Normalised inline rather than through the helper: this runs every frame and
  // the helper returns a fresh pair (§53 — nothing allocates in the loop).
  let dx = first.x - px, dz = first.z - pz;
  {
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
  }

  let reached = 0;
  for (let i = 0; i < TOUR.length; i++) {
    const name = TOUR[i];
    const m = plan.starPos.get(name);
    const toX = m.x - px, toZ = m.z - pz;
    const along = toX * dx + toZ * dz;
    if (along <= 0.2) break;                        // behind us: the path is lost
    // The plate is 0.68 m across; a little forgiveness so a nearly correct
    // mirror still catches, and shows a nearly correct exit.
    if (Math.abs(toX * dz - toZ * dx) > 0.42) break;

    px = m.x; pz = m.z;
    out.push(px, pz);
    reached++;

    const yaw = plan.datum.get(name) + angleOf(name);
    const nx = Math.sin(yaw), nz = Math.cos(yaw);
    const d2 = 2 * (dx * nx + dz * nz);
    dx -= d2 * nx; dz -= d2 * nz;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
  }

  // The bowl's mouth. Sized against the optics, not by eye: a mirror off by the
  // seating tolerance (0.6 deg) turns the ray 1.2 deg, which over the last 7.5 m
  // is 0.16 m and must still arrive; a mirror off by 1.5 deg turns it 3 deg,
  // which is 0.39 m and must not. Anything wider and the court would accept
  // settings the dials call wrong.
  const rx = plan.receiver.x - px, rz = plan.receiver.z - pz;
  const onReceiver = reached === TOUR.length
    && (rx * dx + rz * dz) > 0.2 && Math.abs(rx * dz - rz * dx) < 0.22;
  if (onReceiver) out.push(plan.receiver.x, plan.receiver.z);
  else out.push(px + dx * 26, pz + dz * 26);

  // Written into a shared result rather than returned fresh: this is called
  // every frame and a per-frame object literal is a per-frame allocation.
  _traceResult.path = out;
  _traceResult.reached = reached;
  _traceResult.onReceiver = onReceiver;
  return _traceResult;
}

const _traceResult = { path: null, reached: 0, onReceiver: false };

export class CourtOfReflectionsPuzzle {
  /** @param {Object} ctx */
  constructor(ctx) {
    this.name = "puzzle_reflections";
    this.order = 384;
    this.ctx = ctx;
    this.scene = ctx.scene;

    this.solved = false;
    this.meshes = [];
    this._t = 0;
    this._charge = 0;        // how strongly the collector is being fed
    this._seatGlow = [0, 0, 0, 0];
    this._readField = false;
    this._entered = false;
    this._hitCount = 0;      // how many mounts the beam currently reaches
  }

  /* ================================================================= */
  /*  Build                                                             */
  /* ================================================================= */

  build(accums) {
    const { stone, dark, bronze } = accums;
    const R = REFLECT;

    /* --- the plan: positions, dial targets and datums ----------------- */
    const plan = this.plan = planCourt();
    this.metresPerDegree = plan.metresPerDegree;
    this.starPos = plan.starPos;
    this.target = plan.target;

    /* --- the inlay: the figure itself, cut into the black field ------- */
    for (let i = 0; i < CYCLE.length; i++) {
      const p = this.starPos.get(CYCLE[i]);
      const q = this.starPos.get(CYCLE[(i + 1) % CYCLE.length]);
      const dx = q.x - p.x, dz = q.z - p.z;
      const len = Math.hypot(dx, dz);
      // The edge, as a fine bronze line flush with the stone.
      addBlock(bronze, (p.x + q.x) * 0.5, -0.048, (p.z + q.z) * 0.5,
        len * 0.5, 0.012, 0.026, { yaw: Math.atan2(dx, dz) - Math.PI / 2, bevel: 0.004, uvScale: 2.2 });
      // The star: a disc, sized by magnitude the way the Book draws them.
      const s = star(CYCLE[i]);
      const rad = 0.16 - s.mag * 0.028;
      addDisc(bronze, p.x, -0.044, p.z, Math.max(0.07, rad), 20, 1, 2.4);
    }

    /* --- the four mounts --------------------------------------------- */
    this.mounts = [];
    for (const name of CYCLE) {
      const p = this.starPos.get(name);
      // Plinth and fork, cut from the same stone as the court.
      addBlock(stone, p.x, 0.42, p.z, 0.44, 0.42, 0.44, { bevel: 0.03, uvScale: 0.42 });
      addBlock(dark, p.x, 0.88, p.z, 0.50, 0.05, 0.50, { bevel: 0.02, uvScale: 0.7 });
      for (const s of [-1, 1]) {
        addBlock(dark, p.x + s * 0.42, 1.32, p.z, 0.06, 0.44, 0.10, { bevel: 0.014, uvScale: 0.8 });
      }
      // The graduated dial: a bronze ring on the plinth, marked every degree
      // with every fifth long. This is what makes an exact setting possible.
      addRingBand(bronze, p.x, 0.94, p.z, {
        radius: 0.46, width: 0.05, depth: 0.022, segments: 64, axis: 1, uvScale: 1.6,
      });
      for (let d = 0; d < 72; d++) {
        const a = (d / 72) * TAU;
        const long = d % 5 === 0;
        addBlock(bronze, p.x + Math.cos(a) * 0.455, 0.955, p.z + Math.sin(a) * 0.455,
          long ? 0.05 : 0.026, 0.006, 0.007, { yaw: -a, bevel: 0.002, uvScale: 3.2 });
      }
      // The datum: one mark in black stone, deeper and wider than the rest.
      addBlock(dark, p.x + 0.50, 0.95, p.z, 0.07, 0.012, 0.016, { bevel: 0.003, uvScale: 1.4 });

      /* the mirror itself, built about its own origin so it can turn */
      const m = new Accum("mirror_" + name);
      m.uvScale = 1.2;
      addBlock(m, 0, 0, 0, 0.02, 0.40, 0.34, { bevel: 0.012, uvScale: 1.2 });        // the plate
      addRingBand(m, 0, 0, 0, { radius: 0.36, width: 0.05, depth: 0.05, segments: 40, axis: 0, uvScale: 1.4 });
      addBlock(m, 0, -0.44, 0, 0.05, 0.06, 0.05, { bevel: 0.01, uvScale: 1.4 });     // the pivot boss
      // A sighting vane, so you can tell at a glance which way it faces.
      addBlock(m, 0.10, 0.40, 0, 0.09, 0.012, 0.012, { bevel: 0.004, uvScale: 2.0 });

      const root = new TransformNode("mirrorRoot_" + name, this.scene);
      root.position.set(p.x, 1.32, p.z);
      root.rotationQuaternion = Quaternion.Identity();
      const mesh = m.toMesh(this.scene, this.ctx.mats.bronze({ key: "_mirror", seed: 71, polish: 0.88 }),
        { collide: false, freeze: false });
      mesh.parent = root;
      this.meshes.push(mesh);

      this.mounts.push({
        name, x: p.x, z: p.z, root, mesh,
        axis: new RotaryAxis({
          inertia: 5.0, friction: 2.0, stiction: 0.30, backlash: 0.0015,
          min: -0.35, max: Math.PI * 0.62,
        }),
        datum: plan.datum.get(name),
        seated: false,
      });
    }

    /* --- collector and receiver --------------------------------------- */
    // The collector stands where the aperture's light falls: a fixed dish that
    // takes gathered starlight and lays it flat across the court.
    this.collector = new Vector3(plan.collector.x, BEAM_Y, plan.collector.z);
    addBlock(stone, this.collector.x, 0.55, this.collector.z, 0.5, 0.55, 0.5, { bevel: 0.03, uvScale: 0.42 });
    addCylinder(dark, this.collector.x, 1.10, this.collector.z, { radius: 0.24, height: 0.42, segments: 18, uvScale: 0.7 });
    addRingBand(bronze, this.collector.x, BEAM_Y, this.collector.z, {
      radius: 0.52, width: 0.08, depth: 0.06, segments: 44, axis: 0, uvScale: 1.2,
    });
    addRingBand(bronze, this.collector.x, BEAM_Y, this.collector.z, {
      radius: 0.38, width: 0.06, depth: 0.05, segments: 40, axis: 0, uvScale: 1.2,
    });

    // The receiver sits off the last mount on the bearing that keeps the whole
    // path clear of the mounts it does not use — a bronze bowl on a black
    // plinth, at the end of it all.
    this.receiver = new Vector3(plan.receiver.x, BEAM_Y, plan.receiver.z);
    addBlock(dark, this.receiver.x, 0.50, this.receiver.z, 0.46, 0.50, 0.46, { bevel: 0.03, uvScale: 0.6 });
    addCylinder(bronze, this.receiver.x, 1.00, this.receiver.z, {
      radiusBottom: 0.16, radiusTop: 0.42, height: 0.62, segments: 28, uvScale: 1.0,
    });
    addRingBand(bronze, this.receiver.x, BEAM_Y + 0.08, this.receiver.z, {
      radius: 0.44, width: 0.06, depth: 0.05, segments: 40, axis: 1, uvScale: 1.2,
    });

    /* --- the beam renderer -------------------------------------------- */
    this.threads = new ThreadRenderer(this.scene, 96, [0.70, 0.82, 1.0]);
    this.motes = new MoteRenderer(this.scene, 260, [0.74, 0.85, 1.0]);
    this.lights = new MagicLights(this.scene, 3);
  }

  /* ================================================================= */
  /*  Install                                                           */
  /* ================================================================= */

  install() {
    const { interaction, magic, observation, hud } = this.ctx;

    for (const m of this.mounts) {
      interaction.add({
        id: "mirror_" + m.name,
        position: new Vector3(m.x, 1.32, m.z),
        radius: 2.6,
        verb: "Take hold of the mirror",
        sub: "it turns on its dial",
        dragVerb: "Set the mirror",
        axis: m.axis,
        axisOrigin: new Vector3(m.x, 1.32, m.z),
        axisDir: new Vector3(0, 1, 0),
        gripPoint: new Vector3(m.x, 1.60, m.z + 0.36),
        gripRest: new Vector3(m.x, 1.60, m.z + 0.36),
        onInteract: () => {
          const read = m.axis.angle * RAD;
          hud.journal(`The dial reads ${read.toFixed(1)}° from the datum.`, 6);
        },
      });
    }

    interaction.add({
      id: "reflectField",
      position: new Vector3(REFLECT.cx, 0.2, REFLECT.cz),
      radius: 4.2,
      verb: "Read the floor",
      sub: "a figure, inlaid full size",
      onInteract: () => this._readTheField(),
    });

    interaction.add({
      id: "reflectReceiver",
      position: this.receiver.clone(),
      radius: 2.4,
      verb: "Examine the bowl",
      sub: "it has been struck by light before",
      onInteract: () => {
        hud.journal(this.solved
          ? "The bowl is full of cold light, and holding it."
          : "The inside of the bowl is polished to a mirror everywhere except one ring, where centuries of arriving light have burned it matt.", 9);
      },
    });

    // Stellar Light into the collector is what energises the whole court.
    magic.addResonant({
      id: "reflectCollector",
      position: this.collector.clone(),
      radius: 1.4,
      quality: () => this._quality(),
      onLit: (ramp, dt) => { this._charge = Math.min(1, this._charge + dt * (0.6 + ramp)); },
      onResonate: (q, dt, ramp) => { this._charge = Math.min(1, this._charge + dt * ramp * 0.8); },
      onComplete: () => this._solve(),
    });

    observation.addResidue(new Vector3(REFLECT.cx, 0.2, REFLECT.cz), 0.9,
      "The figure was walked as much as it was read. The bronze is worn brightest at the stars.", "trace");
    observation.addResidue(this.collector.clone(), 0.8,
      "Light was given to this dish, over and over, by someone standing exactly here.", "trace");

    this.enterPos = new Vector3(REFLECT.cx - REFLECT.half + 2.0, 1.0, REFLECT.doorZ);
  }

  _readTheField() {
    const { hud, book } = this.ctx;
    const known = book.knownFigures && book.knownFigures.has("T_gate");
    if (!this._readField) {
      this._readField = true;
      book.unlockFragment("reflection.geometry");
    }
    if (known) {
      hud.journal("It is the Gate, laid out on the ground at so many paces to the degree — and there is a mirror standing on each of its four stars.", 12);
    } else {
      hud.journal("Four bronze stars and four edges, inlaid full size. It is a figure, but not one this house has taught me yet.", 10);
    }
  }

  /* ================================================================= */
  /*  The optics                                                        */
  /* ================================================================= */

  /**
   * Trace the beam through the mirrors as they actually stand.
   * Writes the polyline into `this.path` and returns how many mounts it reached.
   */
  _trace() {
    if (!this.path) this.path = [];
    // The callback is bound once, not rebuilt per frame: a closure allocated
    // every update is exactly the kind of steady nursery pressure §53 is about.
    if (!this._angleOf) this._angleOf = (name) => this._angleByName(name);
    // The mirrors are read through their *visual* angle, so the beam moves with
    // the metal rather than with the idealised mechanism state — backlash and
    // settling oscillation are visible in the light, which is the point.
    const r = traceBeam(this.plan, this._angleOf, this.path);
    this.onReceiver = r.onReceiver;
    return r.reached;
  }

  _angleByName(name) {
    for (let i = 0; i < this.mounts.length; i++) {
      if (this.mounts[i].name === name) return this.mounts[i].axis.visualAngle;
    }
    return 0;
  }

  /**
   * 0..1 — how close the whole court is to correct, for the resonance to
   * express (§27). Never floors on "the light arrived": arriving is necessary
   * but a mirror can be measurably wrong and still throw light into the bowl,
   * and a court that called that correct would be teaching the wrong lesson.
   */
  _quality() {
    let worst = 0;
    for (const m of this.mounts) {
      worst = Math.max(worst, Math.abs(m.axis.angle * RAD - this.target.get(m.name)));
    }
    const dialQ = clamp01(1 - worst / 6);
    return this.onReceiver ? dialQ : dialQ * 0.55;
  }

  /** Every dial seated *and* the light actually in the bowl. */
  _isCorrect() {
    if (!this.onReceiver) return false;
    for (const m of this.mounts) if (!m.seated) return false;
    return true;
  }

  /* ================================================================= */
  /*  Update                                                            */
  /* ================================================================= */

  update(dt) {
    this._t += dt;

    if (!this._entered && this.enterPos) {
      if (Vector3.Distance(this.ctx.player.position, this.enterPos) < 4.5) {
        this._entered = true;
        this.ctx.hud.banner("The Court of Reflections", "the east wing", 5);
        this.ctx.hud.journal("No roof at all. After the slit and the oculus, the whole sky at once.", 9);
      }
    }

    // Mechanism physics, and the mirror transforms that follow from them.
    for (let i = 0; i < this.mounts.length; i++) {
      const m = this.mounts[i];
      m.axis.update(dt);
      const wasSeated = m.seated;
      m.seated = Math.abs(m.axis.angle * RAD - this.target.get(m.name)) < TOLERANCE;
      if (m.seated && !wasSeated && this.ctx.audio) this.ctx.audio.threadJoin();
      this._seatGlow[i] = damp(this._seatGlow[i], m.seated ? 1 : 0, 0.002, dt);

      Quaternion.RotationAxisToRef(Vector3.UpReadOnly, m.datum + m.axis.visualAngle, _q);
      m.root.rotationQuaternion.copyFrom(_q);
    }

    this._charge = Math.max(0, this._charge - dt * 0.55);
    this._hitCount = this._trace();

    this._draw(dt);
  }

  /** Render the beam as it currently runs. */
  _draw(dt) {
    const th = this.threads, mo = this.motes, li = this.lights;
    th.begin(); mo.begin(); li.begin();

    const strength = clamp01(this._charge);
    if (strength > 0.01) {
      const p = this.path;
      // Warmer where the light has not yet been folded, colder further along:
      // each mirror takes a little and the survivor gets bluer.
      for (let i = 0; i < p.length - 2; i += 2) {
        const t = i / Math.max(2, p.length - 2);
        const s = strength * (1 - t * 0.35);
        th.add(p[i], BEAM_Y, p[i + 1], p[i + 2], BEAM_Y, p[i + 3], s * 0.9, 0.04 + i * 0.01);
        // Motes riding the segment make the beam legible against the black field.
        const segs = 9;
        for (let k = 0; k < segs; k++) {
          const u = (k + ((this._t * 0.35 + i) % 1)) / segs;
          mo.add(p[i] + (p[i + 2] - p[i]) * u, BEAM_Y + Math.sin(this._t * 2 + k) * 0.012,
            p[i + 1] + (p[i + 3] - p[i + 1]) * u, 1.9, s * 0.75);
        }
      }
      // Real light where it lands, so the stone and bronze answer.
      for (let i = 0; i < this.mounts.length && i < 3; i++) {
        const m = this.mounts[i];
        if (i < this._hitCount) li.place(m.x, BEAM_Y, m.z, 1.5 * strength, 5.5, 0.70, 0.82, 1.0);
      }
      if (this.onReceiver) {
        li.place(this.receiver.x, BEAM_Y + 0.1, this.receiver.z, 3.2 * strength, 8.0, 0.78, 0.86, 1.0);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU + this._t * 0.7;
          mo.add(this.receiver.x + Math.cos(a) * 0.34, BEAM_Y + 0.10 + Math.sin(this._t + i) * 0.03,
            this.receiver.z + Math.sin(a) * 0.34, 2.4, strength);
        }
      }
    }

    // Seated mounts show it: a thin ring of light around the dial.
    for (let i = 0; i < this.mounts.length; i++) {
      const g = this._seatGlow[i];
      if (g < 0.02) continue;
      const m = this.mounts[i];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU + this._t * 0.4;
        mo.add(m.x + Math.cos(a) * 0.47, 0.98, m.z + Math.sin(a) * 0.47, 1.5, g * 0.6);
      }
    }

    th.end(dt); mo.end(dt); li.end(dt);
  }

  _solve() {
    // The resonance drives the feedback, but the solve itself is gated on the
    // real condition, so a court that merely resonates loudly cannot pass.
    if (this.solved || !this._isCorrect()) return;
    this.solved = true;
    const ctx = this.ctx;
    ctx.hud.banner("The court answers", "Court of Reflections", 6);
    ctx.hud.journal("Four angles, and the light walks the figure. The mirrors were never aimed — they were set.", 12);
    ctx.book.unlockFragment("light.collimated");
    if (ctx.audio) ctx.audio.resonanceComplete();
    if (ctx.save) ctx.save.write();
  }
}

/** Normalise a 2-D vector; returns a fresh pair (build-time only). */
function normalise(x, z) {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}

void clamp;
