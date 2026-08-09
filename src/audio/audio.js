/**
 * Sound, synthesised.
 *
 * No sample library ships with this build (see ASSETS.md), so everything is
 * generated: wind is filtered noise, footsteps are shaped noise bursts, bronze
 * is a struck inharmonic partial series, and magic is built from pure partials
 * and very long reverberant tails. That constraint turned out to suit the game —
 * §48 asks for harmonic tones, distant ringing and "sounds suggesting enormous
 * distance", and additive synthesis is exactly how you make those.
 *
 * Celestial Resonance is the important one. Its consonance *is* the puzzle
 * feedback: a wrong configuration beats and detunes, a correct one locks into a
 * clean fifth and octave. You can solve the last few degrees with your eyes shut.
 */
import { clamp, clamp01, lerp } from "../core/scratch.js";

export class Audio {
  constructor() {
    this.name = "audio";
    this.order = 800;
    this.ctx = null;
    this.ready = false;
    this.master = null;
    this.enabled = true;
    this._interior = 1;
    this._resonanceQ = 0;
    this._resonanceAmt = 0;
    this._stepPhase = 0;
    this._lastStepFoot = -1;
  }

  /** WebAudio needs a gesture; the first key or click starts it. */
  start() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: "interactive" });
    } catch { return; }
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    // A long, dark reverb: the temple is enormous and made of stone.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(4.2, 2.6);
    this.revGain = ctx.createGain();
    this.revGain.gain.value = 0.5;
    this.reverb.connect(this.revGain);
    this.revGain.connect(this.master);
    this.master.connect(ctx.destination);

    this.dry = ctx.createGain();
    this.dry.gain.value = 1;
    this.dry.connect(this.master);

    this._buildBeds();
    this.ready = true;
  }

  _makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Early reflections sparse, tail dense — a big hard room.
        const sparse = i < rate * 0.09 ? (Math.random() < 0.02 ? 1 : 0) : 1;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * sparse;
      }
    }
    return buf;
  }

  _noiseBuffer(seconds = 2) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // Brown-ish noise: far better bed material than white.
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  _buildBeds() {
    const ctx = this.ctx;
    this.noiseBuf = this._noiseBuffer(4);

    // --- wind (exterior) ------------------------------------------------
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuf;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(windFilter); windFilter.connect(this.windGain);
    this.windGain.connect(this.dry);
    this.windGain.connect(this.reverb);
    wind.start();
    this.windFilter = windFilter;

    // --- room tone (interior) -------------------------------------------
    const room = ctx.createBufferSource();
    room.buffer = this.noiseBuf;
    room.loop = true;
    const roomFilter = ctx.createBiquadFilter();
    roomFilter.type = "lowpass";
    roomFilter.frequency.value = 130;
    this.roomGain = ctx.createGain();
    this.roomGain.gain.value = 0.10;
    room.connect(roomFilter); roomFilter.connect(this.roomGain);
    this.roomGain.connect(this.dry);
    room.start();

    // --- the resonance voice --------------------------------------------
    // Three partials. When the configuration is correct they lock to 1 : 3/2 : 2
    // and stop beating; when it is wrong they drift apart and fight.
    this.resGain = ctx.createGain();
    this.resGain.gain.value = 0;
    this.resGain.connect(this.dry);
    this.resGain.connect(this.reverb);
    this.resOsc = [];
    const base = 146.83;   // D3 — the temple's tuning
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = i === 0 ? "sine" : "triangle";
      o.frequency.value = base * [1, 1.5, 2][i];
      const g = ctx.createGain();
      g.gain.value = [0.5, 0.3, 0.2][i];
      o.connect(g); g.connect(this.resGain);
      o.start();
      this.resOsc.push({ osc: o, gain: g, ratio: [1, 1.5, 2][i] });
    }
    this.resBase = base;

    // --- mechanism voice --------------------------------------------------
    const mech = ctx.createBufferSource();
    mech.buffer = this.noiseBuf;
    mech.loop = true;
    this.mechFilter = ctx.createBiquadFilter();
    this.mechFilter.type = "bandpass";
    this.mechFilter.frequency.value = 210;
    this.mechFilter.Q.value = 3.4;
    this.mechGain = ctx.createGain();
    this.mechGain.gain.value = 0;
    mech.connect(this.mechFilter); this.mechFilter.connect(this.mechGain);
    this.mechGain.connect(this.dry);
    this.mechGain.connect(this.reverb);
    mech.start();
  }

  /* ------------------------------------------------------------------ */
  /* One-shots                                                           */
  /* ------------------------------------------------------------------ */

  _blip(freq, dur, type = "sine", gain = 0.18, detune = 0, toReverb = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.dry);
    if (toReverb) {
      const rg = ctx.createGain();
      rg.gain.value = toReverb;
      g.connect(rg); rg.connect(this.reverb);
    }
    o.start();
    o.stop(ctx.currentTime + dur + 0.05);
  }

  _noiseBurst(dur, freq, q, gain) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(this.dry);
    const rg = ctx.createGain(); rg.gain.value = 0.5;
    g.connect(rg); rg.connect(this.reverb);
    s.start();
    s.stop(ctx.currentTime + dur + 0.02);
  }

  footstep(hard = 1) {
    // Grit under a boot: a short band of noise with a dull thud beneath it.
    this._noiseBurst(0.10 + Math.random() * 0.05, 900 + Math.random() * 700, 1.1, 0.10 * hard);
    this._blip(58 + Math.random() * 14, 0.14, "sine", 0.07 * hard, 0, 0.35);
  }

  cloth() { this._noiseBurst(0.13, 2600, 0.8, 0.018); }

  spellBegin(spell) {
    if (spell === 1) this._blip(880, 1.4, "sine", 0.05, 4, 0.8);
    else if (spell === 2) this._blip(1320, 0.9, "sine", 0.045, -6, 0.9);
    else if (spell === 3) this._blip(220, 1.6, "sine", 0.05, 0, 1);
    else if (spell === 4) this._blip(72, 2.4, "sine", 0.07, 0, 0.9);
    else if (spell === 5) this._blip(1760, 2.6, "sine", 0.035, 9, 1.2);
  }

  spellEnd() { }

  threadJoin() {
    this._blip(1568, 1.2, "sine", 0.06, 0, 1);
    this._blip(2350, 0.9, "sine", 0.03, 5, 1);
  }

  deny() { this._blip(104, 0.5, "triangle", 0.05, 0, 0.4); }

  fragment() {
    this._blip(523.25, 2.2, "sine", 0.05, 0, 1.1);
    this._blip(783.99, 2.6, "sine", 0.032, 3, 1.1);
  }

  pageTurn() { this._noiseBurst(0.22, 1800, 0.6, 0.05); }
  bookOpen() { this._noiseBurst(0.4, 700, 0.5, 0.06); }

  mechanismWake() {
    // Stone letting go of stone, then a very long low note.
    this._noiseBurst(1.6, 120, 1.6, 0.22);
    this._blip(43.65, 6.5, "sine", 0.16, 0, 1.4);
    this._blip(65.41, 5.5, "sine", 0.09, 0, 1.4);
  }

  resonanceComplete() {
    for (let i = 0; i < 4; i++) {
      const f = this.resBase * [1, 1.5, 2, 3][i];
      setTimeout(() => this._blip(f, 4.5 - i * 0.4, "sine", 0.09 - i * 0.015, 0, 1.5), i * 90);
    }
  }

  zenith() {
    if (!this.ready) return;
    const partials = [1, 1.5, 2, 3, 4, 6];
    for (let i = 0; i < partials.length; i++) {
      const f = this.resBase * partials[i] * 0.5;
      setTimeout(() => this._blip(f, 12 - i, "sine", 0.10 - i * 0.012, 0, 2), i * 420);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Continuous                                                          */
  /* ------------------------------------------------------------------ */

  setInterior(v) { this._interior = v; }

  /** @param {number} q 0..1 alignment @param {number} amount 0..1 how hard cast */
  resonance(q, amount) {
    this._resonanceQ = q;
    this._resonanceAmt = amount;
  }

  /** Called by mechanisms every frame with their current effort. */
  mechanism(velocity, load) {
    this._mechVel = velocity;
    this._mechLoad = load;
  }

  update(dt, ctx) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;

    // Wind outside, room tone inside.
    const ext = 1 - this._interior;
    this.windGain.gain.setTargetAtTime(0.10 * ext, t, 0.6);
    this.windFilter.frequency.setTargetAtTime(340 + Math.sin(t * 0.13) * 180, t, 1.2);
    this.roomGain.gain.setTargetAtTime(0.055 * this._interior, t, 0.8);

    // Resonance: consonance follows correctness.
    const q = this._resonanceQ, amt = this._resonanceAmt;
    this.resGain.gain.setTargetAtTime(amt * 0.11 * (0.35 + q * 0.9), t, 0.08);
    for (let i = 0; i < this.resOsc.length; i++) {
      const o = this.resOsc[i];
      // Detuning is the signal. At q=0 the partials are a quarter-tone apart and
      // beat against each other; at q=1 they are exactly in tune.
      const err = (1 - q) * (i === 0 ? 0 : (i === 1 ? 34 : -46));
      const wobble = (1 - q) * Math.sin(t * (3.1 + i)) * 12;
      o.osc.detune.setTargetAtTime(err + wobble, t, 0.1);
      o.osc.frequency.setTargetAtTime(this.resBase * o.ratio, t, 0.3);
    }
    this._resonanceAmt *= Math.max(0, 1 - dt * 4);

    // Mechanism friction.
    const v = Math.abs(this._mechVel || 0);
    this.mechGain.gain.setTargetAtTime(clamp(v * 0.5, 0, 0.22), t, 0.05);
    this.mechFilter.frequency.setTargetAtTime(150 + v * 260, t, 0.1);
    this._mechVel = 0;

    // Footsteps from the walk cycle: fired on the actual plant, not on a timer.
    if (ctx && ctx.player) {
      const c = ctx.player.controller;
      for (let f = 0; f < 2; f++) {
        const local = (c.phase + (f === 0 ? 0.5 : 0)) % 1;
        const planted = local <= 0.5;
        if (planted && this._lastPlanted !== undefined && !this._lastPlanted[f] && c.speed > 0.15) {
          this.footstep(clamp(c.speed / 2.2, 0.4, 1.3));
          if (Math.random() < 0.4) this.cloth();
        }
        if (!this._lastPlanted) this._lastPlanted = [false, false];
        this._lastPlanted[f] = planted;
      }
    }
  }
}
