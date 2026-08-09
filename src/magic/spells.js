/**
 * The five star spells, and Zenith.
 *
 * All of them are built from the shared primitives in stellar.js and all of them
 * read the same celestial simulation the instruments do. None of them is an
 * attack. Two rules shape every one:
 *
 *   magic never bypasses understanding — a spell can only complete a relationship
 *   the player has already configured physically (§31);
 *
 *   magic is light in the room — every spell places real lights, so stone,
 *   bronze, cloth and dust all answer it (§45).
 *
 * Selection is diegetic: 1–5 reconfigure the celestial focus in the character's
 * hand, and that is the only indication given.
 */
import { Vector3, Ray, Color3 } from "../core/bjs.js";
import { ThreadRenderer, MoteRenderer, MagicLights, AnchorRegistry } from "./stellar.js";
import { bvToRGB } from "../astronomy/catalog.js";
import { clamp, clamp01, lerp, damp, TAU, DEG, makeRng, smoothstep } from "../core/scratch.js";
import { tune, toggles } from "../core/tune.js";

export const SPELL = {
  NONE: 0, LIGHT: 1, THREAD: 2, RESONANCE: 3, LENS: 4, RECALL: 5, ZENITH: 6,
};

export const SPELL_NAMES = ["", "Stellar Light", "Constellation Thread", "Celestial Resonance", "Gravity Lens", "Astral Recall", "Zenith"];

const _v = new Vector3();
const _v2 = new Vector3();
const _hit = new Vector3();
const _ray = new Ray(new Vector3(), new Vector3(0, 0, 1), 40);
const _rgb = [0, 0, 0];

/**
 * @typedef {Object} ResonantObject
 * @property {string} id
 * @property {Vector3} position
 * @property {number} radius
 * @property {() => number} quality      0..1, how correctly it is configured
 * @property {(q:number, dt:number) => void} [onResonate]
 * @property {(q:number) => void} [onComplete]
 * @property {boolean} [solved]
 * @property {string} [hint]             one quiet line, shown only in the journal
 */

export class Magic {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {Object} ctx
   */
  constructor(scene, ctx) {
    this.name = "magic";
    this.order = 360;
    this.scene = scene;
    this.cam = ctx.cam;
    this.input = ctx.input;
    this.player = ctx.player;
    this.sky = ctx.sky;
    this.hud = ctx.hud;
    this.book = ctx.book;
    this.audio = ctx.audio;
    this.observation = ctx.observation;

    this.anchors = new AnchorRegistry();
    this.threads = new ThreadRenderer(scene, 320, [0.60, 0.76, 1.0]);
    this.motes = new MoteRenderer(scene, 900, [0.66, 0.80, 1.0]);
    this.lights = new MagicLights(scene, 4);

    /** @type {ResonantObject[]} */
    this.resonant = [];
    /** Persistent threads the player has established. */
    this.links = [];
    /** Active gravity lenses (max 1 in this slice). */
    this.lens = null;

    this.selected = SPELL.NONE;
    this.casting = false;
    this.castTime = 0;
    this.blocked = false;

    /** Which star the focus is currently drawing from. */
    this.sourceStar = -1;
    this.sourceColor = new Color3(0.72, 0.84, 1.0);

    /** Knowledge gates — the Book opens these (§21). */
    this.unlocked = { 1: true, 2: false, 3: true, 4: false, 5: false, 6: false };
    /** Stellar Light gains behaviour as the Book is reconstructed. */
    this.lightRefined = false;     // can draw from a named star
    this.lightCollimated = false;  // can pass through an instrument and drive it

    this._pendingAnchor = null;
    this._rng = makeRng(4242);
    this._recallTimer = 0;
    this._zenithT = 0;
    this.onCast = null;
  }

  /** @param {ResonantObject} obj */
  addResonant(obj) { this.resonant.push(obj); return obj; }

  /** Teach a spell. Called by the Book when the relevant fragment is read. */
  unlock(spell) {
    this.unlocked[spell] = true;
  }

  select(spell) {
    if (!this.unlocked[spell]) {
      this.hud.journal("The focus will not hold that configuration. Not yet.");
      return false;
    }
    this.selected = spell;
    this.player.focus.setMode(spell);
    return true;
  }

  /* ------------------------------------------------------------------ */

  update(dt) {
    const inp = this.input;
    if (!toggles.magic) { this._idle(dt); return; }

    if (!this.blocked) {
      for (let k = 1; k <= 5; k++) {
        if (inp.justPressed("Digit" + k)) this.select(k);
      }
    }

    const wantCast = !this.blocked && inp.lmb && this.selected !== SPELL.NONE;
    if (wantCast && !this.casting) this._beginCast();
    if (!wantCast && this.casting) this._endCast();
    if (this.casting) this.castTime += dt; else this.castTime = 0;

    this.threads.begin();
    this.motes.begin();
    this.lights.begin();

    this._updateSource();
    this._drawAnchors(dt);
    this._drawLinks(dt);

    switch (this.selected) {
      case SPELL.LIGHT: this._stellarLight(dt); break;
      case SPELL.THREAD: this._constellationThread(dt); break;
      case SPELL.RESONANCE: this._celestialResonance(dt); break;
      case SPELL.LENS: this._gravityLens(dt); break;
      case SPELL.RECALL: this._astralRecall(dt); break;
      default: break;
    }
    if (this._zenithT > 0) this._zenith(dt);

    this.player.focus.setCharge(this.casting ? clamp01(this.castTime * 1.6) * 0.9 + 0.1 : (this.selected ? 0.06 : 0));

    this.threads.end(dt);
    this.motes.end(dt);
    this.lights.end(dt);
  }

  _idle(dt) {
    this.threads.begin(); this.threads.end(dt);
    this.motes.begin(); this.motes.end(dt);
    this.lights.begin(); this.lights.end(dt);
  }

  _beginCast() {
    this.casting = true;
    if (this.selected === SPELL.THREAD) this._threadClick();
    if (this.selected === SPELL.RECALL) this._recallTimer = 9;
    if (this.audio) this.audio.spellBegin(this.selected);
    if (this.onCast) this.onCast(this.selected);
  }

  _endCast() {
    this.casting = false;
    if (this.audio) this.audio.spellEnd(this.selected);
  }

  /** The focus draws from whatever star the astronomer has sighted. */
  _updateSource() {
    const obs = this.observation;
    if (obs && obs.sightedStar >= 0) this.sourceStar = obs.sightedStar;
    else if (obs && obs.markedStar >= 0) this.sourceStar = obs.markedStar;
    if (this.sourceStar >= 0 && this.lightRefined) {
      const s = this.sky.stars[this.sourceStar];
      bvToRGB(s.bv, _rgb);
      this.sourceColor.set(lerp(0.72, _rgb[0], 0.75), lerp(0.84, _rgb[1], 0.75), lerp(1.0, _rgb[2], 0.75));
    } else {
      this.sourceColor.set(0.66, 0.80, 1.0);
    }
  }

  /** Aim ray: from the camera through the screen centre. */
  _aim(out) {
    const cam = this.cam;
    const cp = Math.cos(cam.pitch);
    out.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    return out;
  }

  _aimHit(maxDist, out) {
    const eye = this.cam.camera.globalPosition;
    this._aim(_v);
    _ray.origin.copyFrom(eye);
    _ray.direction.copyFrom(_v);
    _ray.length = maxDist;
    const pick = this.scene.pickWithRay(_ray, (m) => m.isPickable && m.isVisible !== false, false);
    if (pick && pick.hit) { out.copyFrom(pick.pickedPoint); return pick; }
    out.copyFrom(eye).addInPlace(_v.scale(maxDist));
    return null;
  }

  /** Where the focus sits in the world — the origin of every effect. */
  _focusPoint(out) {
    const f = this.player.focus;
    f.ringRoot.computeWorldMatrix(true);
    out.copyFrom(f.ringRoot.getAbsolutePosition());
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Anchors and links                                                   */
  /* ------------------------------------------------------------------ */

  _drawAnchors(dt) {
    // Anchors are almost invisible until magic is prepared; then they show as a
    // single point of light each, no brighter than a faint star.
    const show = this.selected === SPELL.THREAD ? 1 : this.selected ? 0.28 : 0;
    if (show <= 0.01) return;
    const list = this.anchors.list;
    const px = this.player.position.x, pz = this.player.position.z;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.known) continue;
      const d = Math.hypot(a.position.x - px, a.position.z - pz);
      if (d > 26) continue;
      a.glow = damp(a.glow, a.active ? 1 : 0.34, 0.004, dt);
      const near = clamp01(1 - d / 26);
      this.motes.add(a.position.x, a.position.y, a.position.z,
        a.active ? 3.6 : 2.4, show * near * (0.5 + a.glow) * (a.active ? 1.5 : 0.7));
    }
  }

  _drawLinks(dt) {
    for (let i = 0; i < this.links.length; i++) {
      const l = this.links[i];
      l.strength = damp(l.strength, l.broken ? 0 : 1, 0.0006, dt);
      if (l.strength < 0.01) continue;
      const a = l.a.position, b = l.b.position;
      // A thread sags very slightly — enough to read as physical, not as a laser.
      const sag = Vector3.Distance(a, b) * 0.012;
      const n = 10;
      const pts = _linkPts;
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        pts[k * 3] = lerp(a.x, b.x, t);
        pts[k * 3 + 1] = lerp(a.y, b.y, t);
        pts[k * 3 + 2] = lerp(a.z, b.z, t);
      }
      this.threads.addPath(pts, n, l.strength, l.seed, sag);
      // The link lights the space it crosses, faintly.
      _v.set((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
      this.lights.place(_v.x, _v.y, _v.z, 0.5 * l.strength, 7, 0.42, 0.56, 0.95);
    }
  }

  _threadClick() {
    const eye = this.cam.camera.globalPosition;
    this._aim(_v);
    const a = this.anchors.pick(eye.x, eye.y, eye.z, _v.x, _v.y, _v.z, 32, 0.988);
    if (!a) {
      this._pendingAnchor = null;
      return;
    }
    if (!this._pendingAnchor) {
      this._pendingAnchor = a;
      a.active = true;
      this.hud.journal("Held. Now the other end.");
      return;
    }
    if (this._pendingAnchor === a) { a.active = false; this._pendingAnchor = null; return; }

    if (!this.anchors.canLink(this._pendingAnchor, a)) {
      // Refusal is information: these two points are not part of one figure.
      this.hud.journal("Nothing answers between them. They are not of one figure.");
      this._pendingAnchor.active = false;
      this._pendingAnchor = null;
      if (this.audio) this.audio.deny();
      return;
    }
    const link = { a: this._pendingAnchor, b: a, strength: 0, broken: false, seed: this._rng() };
    this.links.push(link);
    this._pendingAnchor.active = true;
    a.active = true;
    this._pendingAnchor = null;
    if (this.audio) this.audio.threadJoin();
    if (this.onLink) this.onLink(link);
  }

  /** Remove every thread — used when a puzzle resets. */
  clearLinks() {
    for (const l of this.links) { l.a.active = false; l.b.active = false; }
    this.links.length = 0;
  }

  linkExists(idA, idB) {
    for (const l of this.links) {
      if ((l.a.id === idA && l.b.id === idB) || (l.a.id === idB && l.b.id === idA)) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* 1 — Stellar Light                                                   */
  /* ------------------------------------------------------------------ */

  _stellarLight(dt) {
    if (!this.casting) return;
    const from = this._focusPoint(_v2);
    const pick = this._aimHit(34, _hit);
    const dist = Vector3.Distance(from, _hit);

    // The beam: a line of closely spaced motes rather than a cylinder, so it
    // stays a *gathering* of starlight instead of a torch beam.
    const n = Math.min(150, Math.max(24, Math.floor(dist * 7)));
    const ramp = clamp01(this.castTime * 2.2);
    const c = this.sourceColor;
    this.motes.color[0] = c.r; this.motes.color[1] = c.g; this.motes.color[2] = c.b;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const jitter = 0.008 + t * 0.02;
      const a = t * 40 + this.castTime * 5;
      this.motes.add(
        lerp(from.x, _hit.x, t) + Math.cos(a) * jitter,
        lerp(from.y, _hit.y, t) + Math.sin(a * 1.31) * jitter,
        lerp(from.z, _hit.z, t) + Math.sin(a) * jitter,
        lerp(1.4, 2.6, t) * (0.7 + 0.5 * Math.sin(a * 0.7)),
        ramp * lerp(0.55, 1.1, t) * tune.stellarLightIntensity);
    }
    // A single fine thread down the centre keeps the beam readable at distance.
    this.threads.setColor(c.r, c.g, c.b);
    this.threads.add(from.x, from.y, from.z, _hit.x, _hit.y, _hit.z, ramp * 0.55, 0.05);

    // Real light at both ends: the focus glows, and the target is genuinely lit.
    this.lights.place(from.x, from.y, from.z, 1.1 * ramp * tune.stellarLightIntensity, 4.5, c.r, c.g, c.b);
    this.lights.place(_hit.x, _hit.y, _hit.z, 3.4 * ramp * tune.stellarLightIntensity, 8.5, c.r, c.g, c.b);

    // Landing pool of motes — this is what makes shallow engraving readable.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + this.castTime * 0.6;
      const rad = 0.10 + 0.06 * Math.sin(this.castTime * 2 + i);
      this.motes.add(_hit.x + Math.cos(a) * rad, _hit.y + 0.01, _hit.z + Math.sin(a) * rad, 2.0, ramp * 0.9);
    }

    // Anything the beam is being held on gets told about it.
    if (pick && pick.pickedMesh && pick.pickedMesh.__litTarget) {
      pick.pickedMesh.__litTarget(ramp, dt, this);
    }
    for (let i = 0; i < this.resonant.length; i++) {
      const r = this.resonant[i];
      if (!r.onLit) continue;
      if (Vector3.Distance(r.position, _hit) < r.radius) r.onLit(ramp, dt, this);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 3 — Celestial Resonance                                             */
  /* ------------------------------------------------------------------ */

  _celestialResonance(dt) {
    if (!this.casting) return;
    const from = this._focusPoint(_v2);
    this._aimHit(26, _hit);

    // Find the mechanism being addressed.
    let target = null, bestD = 1e9;
    for (let i = 0; i < this.resonant.length; i++) {
      const r = this.resonant[i];
      const d = Vector3.Distance(r.position, _hit);
      if (d < r.radius && d < bestD) { bestD = d; target = r; }
    }

    const ramp = clamp01(this.castTime * 1.4);
    const q = target ? clamp01(target.quality()) : 0;

    // The three states of §27, expressed entirely through the world.
    //   wrong        : few points, unstable, a low uneven beat
    //   near         : geometry starts to close, the tone gains a partial
    //   correct      : a clean ring, stable light, the mechanism wakes
    const centre = target ? target.position : _hit;
    const rings = target ? 3 : 1;
    const stability = q * q;
    const flicker = lerp(0.35 + 0.65 * Math.abs(Math.sin(this.castTime * 17 + q * 3)), 1, stability);

    for (let ring = 0; ring < rings; ring++) {
      const rad = (target ? target.ringRadius || 1.1 : 0.5) * (0.55 + ring * 0.35);
      const count = 18 + ring * 10;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + this.castTime * (0.25 + ring * 0.16) * (ring % 2 ? -1 : 1);
        // Wrong configurations cannot hold a circle: the points wander.
        const wob = (1 - stability) * 0.22 * Math.sin(a * 3 + this.castTime * 6 + ring);
        const rr = rad + wob;
        const y = centre.y + Math.sin(a * 2 + ring) * (1 - stability) * 0.14;
        this.motes.add(centre.x + Math.cos(a) * rr, y, centre.z + Math.sin(a) * rr,
          1.8 + stability * 1.6, ramp * (0.25 + stability * 1.15) * flicker * tune.resonanceIntensity);
      }
      // When correct, the ring closes into a drawn circle.
      if (q > 0.55) {
        const segs = 30;
        for (let i = 0; i < segs; i++) {
          const a0 = (i / segs) * TAU, a1 = ((i + 1) / segs) * TAU;
          this.threads.add(
            centre.x + Math.cos(a0) * rad, centre.y, centre.z + Math.sin(a0) * rad,
            centre.x + Math.cos(a1) * rad, centre.y, centre.z + Math.sin(a1) * rad,
            (q - 0.55) / 0.45 * ramp * 0.8, 0.4 + ring * 0.2);
        }
      }
    }

    this.threads.setColor(0.58, 0.74, 1.0);
    this.threads.add(from.x, from.y, from.z, centre.x, centre.y, centre.z, ramp * 0.5 * (0.4 + q * 0.6), 0.9);
    this.lights.place(centre.x, centre.y, centre.z,
      (0.7 + q * 3.4) * ramp * tune.resonanceIntensity * flicker, 10, 0.5, 0.68, 1.0);

    if (target) {
      if (target.onResonate) target.onResonate(q, dt, ramp);
      if (this.audio) this.audio.resonance(q, ramp);
      if (q > 0.965 && !target.solved) {
        target.solved = true;
        if (target.onComplete) target.onComplete(q);
        if (this.audio) this.audio.resonanceComplete();
      }
    } else if (this.audio) {
      this.audio.resonance(0, ramp * 0.4);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 2 — Constellation Thread (aiming feedback)                          */
  /* ------------------------------------------------------------------ */

  _constellationThread(dt) {
    const eye = this.cam.camera.globalPosition;
    this._aim(_v);
    const hovered = this.anchors.pick(eye.x, eye.y, eye.z, _v.x, _v.y, _v.z, 32, 0.988);
    if (hovered) {
      this.motes.add(hovered.position.x, hovered.position.y, hovered.position.z, 5.0, 1.4);
      this.hud.setPrompt("LMB", this._pendingAnchor ? "Join" : "Hold", "");
    }
    if (this._pendingAnchor) {
      const a = this._pendingAnchor.position;
      const to = hovered ? hovered.position : _hit;
      if (!hovered) this._aimHit(26, _hit);
      const ok = hovered && this.anchors.canLink(this._pendingAnchor, hovered);
      this.threads.setColor(ok ? 0.62 : 0.78, ok ? 0.78 : 0.62, ok ? 1.0 : 0.62);
      this.threads.add(a.x, a.y, a.z, to.x, to.y, to.z, ok ? 0.9 : 0.32, 0.2);
      this.lights.place(a.x, a.y, a.z, 0.8, 5, 0.5, 0.66, 1.0);
    }
    void dt;
  }

  /* ------------------------------------------------------------------ */
  /* 4 — Gravity Lens                                                    */
  /* ------------------------------------------------------------------ */

  _gravityLens(dt) {
    if (this.casting) {
      const eye = this.cam.camera.globalPosition;
      this._aim(_v);
      const a = this.anchors.pick(eye.x, eye.y, eye.z, _v.x, _v.y, _v.z, 30, 0.985);
      const p = a ? a.position : (this._aimHit(24, _hit), _hit);
      if (!this.lens) this.lens = { position: p.clone(), strength: 0, radius: 1.6, anchor: a };
      else { this.lens.position.copyFrom(p); this.lens.anchor = a; }
      this.lens.target = 1;
    } else if (this.lens) {
      this.lens.target = 0;
    }

    if (!this.lens) return;
    this.lens.strength = damp(this.lens.strength, this.lens.target, 0.0015, dt);
    if (this.lens.strength < 0.01 && !this.casting) { this.lens = null; return; }

    const L = this.lens;
    const s = L.strength * tune.gravityLensDistortion;
    // Dust falls into orbit around it — the only way an invisible force reads.
    const n = 46;
    for (let i = 0; i < n; i++) {
      const phase = this.castTime * (0.5 + (i % 5) * 0.13) + i * 1.7;
      const rad = L.radius * (0.35 + 0.65 * ((i % 7) / 7)) * (1 - 0.18 * Math.sin(phase * 0.7));
      const incl = ((i % 11) / 11 - 0.5) * 1.4;
      const x = Math.cos(phase) * rad;
      const z = Math.sin(phase) * rad;
      const y = Math.sin(phase * 0.5 + i) * rad * 0.22 + incl * 0.14;
      this.motes.add(L.position.x + x, L.position.y + y, L.position.z + z,
        1.5 + 1.2 * ((i % 3) / 3), s * 0.75);
    }
    // A dark rim: light bends around it, so the edge is brighter than the middle.
    const segs = 28;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * TAU, a1 = ((i + 0.55) / segs) * TAU;
      const r = L.radius * 0.72;
      this.threads.add(
        L.position.x + Math.cos(a0) * r, L.position.y + Math.sin(a0) * r * 0.35, L.position.z + Math.sin(a0) * r,
        L.position.x + Math.cos(a1) * r, L.position.y + Math.sin(a1) * r * 0.35, L.position.z + Math.sin(a1) * r,
        s * 0.5, 0.66);
    }
    this.lights.place(L.position.x, L.position.y, L.position.z, s * 0.9, 6, 0.38, 0.46, 0.9);
  }

  /* ------------------------------------------------------------------ */
  /* 5 — Astral Recall                                                   */
  /* ------------------------------------------------------------------ */

  _astralRecall(dt) {
    if (this._recallTimer <= 0) return;
    this._recallTimer -= dt;
    const fade = clamp01(this._recallTimer / 1.6) * clamp01((9 - this._recallTimer) * 2);
    const obs = this.observation;
    if (!obs) return;

    // Recall does not solve anything. It shows fragments: where an instrument
    // once stood, where a hand rested, the line of an old sight — and then it
    // goes, and the player has to have understood what they saw.
    for (let i = 0; i < obs.residues.length; i++) {
      const r = obs.residues[i];
      const d = Vector3.Distance(r.position, this.player.position);
      if (d > 20) continue;
      const s = fade * r.strength * clamp01(1 - d / 20);
      if (r.kind === "sightline" && r.dir) {
        _v.copyFrom(r.position);
        _v2.copyFrom(r.position).addInPlace(r.dir.scale(r.length || 12));
        this.threads.setColor(0.82, 0.78, 0.62);
        this.threads.add(_v.x, _v.y, _v.z, _v2.x, _v2.y, _v2.z, s * 0.75, 0.44);
      } else if (r.kind === "figure" && r.points) {
        this.threads.setColor(0.82, 0.78, 0.62);
        for (let k = 0; k + 1 < r.points.length / 3; k++) {
          this.threads.add(
            r.points[k * 3], r.points[k * 3 + 1], r.points[k * 3 + 2],
            r.points[k * 3 + 3], r.points[k * 3 + 4], r.points[k * 3 + 5], s * 0.7, 0.52);
        }
      }
      const count = r.kind === "trace" ? 12 : 6;
      for (let k = 0; k < count; k++) {
        const a = (k / count) * TAU + this._recallTimer * 0.4;
        const rad = 0.2 + 0.35 * ((k % 3) / 3);
        this.motes.add(r.position.x + Math.cos(a) * rad,
          r.position.y + 0.05 + Math.sin(this._recallTimer + k) * 0.1,
          r.position.z + Math.sin(a) * rad, 2.2, s * 1.1);
      }
      if (!r.announced && s > 0.4 && d < 9) {
        r.announced = true;
        if (r.note) this.hud.journal(r.note, 7);
      }
      this.lights.place(r.position.x, r.position.y + 0.4, r.position.z, s * 0.8, 5.5, 0.72, 0.66, 0.5);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Zenith                                                              */
  /* ------------------------------------------------------------------ */

  /** Begin the great operation. Only the final mechanism may call this. */
  beginZenith(targetPosition, starIndex, duration = 22) {
    this._zenithT = duration;
    this._zenithDuration = duration;
    this._zenithTarget = targetPosition.clone();
    this._zenithStar = starIndex;
    this.selected = SPELL.ZENITH;
    this.player.focus.setMode(SPELL.ZENITH);
    if (this.audio) this.audio.zenith();
  }

  get zenithProgress() {
    return this._zenithDuration ? 1 - this._zenithT / this._zenithDuration : 0;
  }

  _zenith(dt) {
    this._zenithT -= dt;
    const p = clamp01(this.zenithProgress);
    const target = this._zenithTarget;
    // The line to the star. Impossibly thin, impossibly long — for a moment the
    // distance between the temple and the star stops mattering.
    this.sky.starDirection(this._zenithStar, _v);
    const open = smoothstep(0.05, 0.35, p) * (1 - smoothstep(0.86, 1, p));
    _v2.set(target.x + _v.x * 900, target.y + _v.y * 900, target.z + _v.z * 900);
    this.threads.setColor(0.86, 0.92, 1.0);
    this.threads.add(target.x, target.y, target.z, _v2.x, _v2.y, _v2.z, open * 1.0, 0.0);

    // Points of light descend the line.
    for (let i = 0; i < 60; i++) {
      const t = (i / 60 + this.zenithProgress * 2.2) % 1;
      const d = t * t * 120;
      this.motes.add(target.x + _v.x * d, target.y + _v.y * d, target.z + _v.z * d,
        lerp(3.2, 1.2, t), open * lerp(1.6, 0.2, t));
    }
    this.lights.place(target.x, target.y, target.z, open * 8, 26, 0.72, 0.84, 1.0);

    this.player.focus.setCharge(open);
    if (this._zenithT <= 0) {
      this._zenithT = 0;
      this.selected = SPELL.NONE;
      this.player.focus.setMode(0);
      if (this.onZenithComplete) this.onZenithComplete();
    }
  }
}

const _linkPts = new Float32Array(3 * 16);

export { clamp, clamp01, lerp };
