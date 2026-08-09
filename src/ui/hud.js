/**
 * Contextual UI.
 *
 * There is no permanent HUD: no health, no mana, no minimap, no hotbar. Two
 * things can appear — a prompt when something is within reach, and, in
 * Observation Mode, annotations pinned to points in the world.
 *
 * The annotations are HTML rather than textured quads on purpose. Astronomical
 * notation has to be *legible*: hairline rules, small caps, real sexagesimal
 * figures. A DOM layer gives that for free at any resolution, and it keeps the
 * typography closer to a handwritten observing journal than to a sci-fi overlay.
 */
import { Vector3, Matrix } from "../core/bjs.js";
import { clamp01, damp } from "../core/scratch.js";

const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; z-index: 20;
  font-family: Georgia, "Iowan Old Style", "Times New Roman", serif; color: #d6cfbe; }

#hud .prompt { position: absolute; left: 50%; bottom: 13.5%; transform: translateX(-50%);
  text-align: center; opacity: 0; transition: opacity 220ms ease; }
#hud .prompt.on { opacity: 1; }
#hud .prompt .verb { font-size: 15px; letter-spacing: .30em; text-transform: uppercase;
  color: #e6dfcd; text-shadow: 0 1px 12px rgba(0,0,0,.9); }
#hud .prompt .key {
  display: inline-block; min-width: 1.55em; padding: 1px 5px; margin-right: .75em;
  border: 1px solid rgba(214,207,190,.42); border-radius: 2px;
  font-size: 12px; letter-spacing: .06em; vertical-align: 2px; color: #cfc7b3; }
#hud .prompt .sub { margin-top: .7em; font-size: 12px; letter-spacing: .16em;
  color: #8d8574; font-style: italic; }

#hud .note { position: absolute; transform: translate(-50%, -50%);
  font-size: 12px; letter-spacing: .12em; white-space: nowrap;
  color: #b9cbe8; text-shadow: 0 0 10px rgba(0,0,0,.95); opacity: 0; }
#hud .note.on { opacity: 1; }
#hud .note .name { font-variant: small-caps; letter-spacing: .22em; font-size: 13px; color: #dbe6f7; }
#hud .note .val { font-size: 11px; color: #8fa6c6; letter-spacing: .10em; }
#hud .note.faint { color: #7f93b0; }
#hud .note.warm { color: #d9b98a; }
#hud .note.warm .name { color: #ecd3a6; }

#hud .banner { position: absolute; left: 50%; top: 34%; transform: translateX(-50%);
  text-align: center; opacity: 0; transition: opacity 1200ms ease; }
#hud .banner.on { opacity: 1; }
#hud .banner .t { font-size: 21px; letter-spacing: .60em; text-indent: .60em;
  text-transform: uppercase; color: #e8e1cf; text-shadow: 0 0 26px rgba(150,180,255,.25); }
#hud .banner .s { margin-top: 1.4em; font-size: 12px; letter-spacing: .34em;
  text-indent: .34em; color: #7d7566; }

#hud .journal { position: absolute; right: 4.5%; bottom: 12%; max-width: 30ch;
  text-align: right; opacity: 0; transition: opacity 900ms ease; }
#hud .journal.on { opacity: 1; }
#hud .journal .line { font-size: 13px; line-height: 1.95; color: #a49b88;
  font-style: italic; text-shadow: 0 1px 10px rgba(0,0,0,.9); }

#hud .obs { position: absolute; inset: 0; opacity: 0; transition: opacity 320ms ease; }
#hud .obs.on { opacity: 1; }
#hud .obs .cross { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px;
  margin: -23px 0 0 -23px; }
#hud .obs .cross i { position: absolute; background: rgba(190,210,240,.34); }
#hud .obs .cross i.h { left: 0; right: 0; top: 50%; height: 1px; }
#hud .obs .cross i.v { top: 0; bottom: 0; left: 50%; width: 1px; }
#hud .obs .cross b { position: absolute; inset: 14px; border: 1px solid rgba(190,210,240,.30);
  border-radius: 50%; }
#hud .obs .read { position: absolute; left: 50%; top: calc(50% + 34px); transform: translateX(-50%);
  font-size: 11px; letter-spacing: .26em; color: #93a8c6; white-space: nowrap; }
`;

export class Hud {
  constructor(scene) {
    this.scene = scene;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "hud";
    root.innerHTML = `
      <div class="prompt" id="hud-prompt"><div class="verb"></div><div class="sub"></div></div>
      <div class="banner" id="hud-banner"><div class="t"></div><div class="s"></div></div>
      <div class="journal" id="hud-journal"></div>
      <div class="obs" id="hud-obs">
        <div class="cross"><i class="h"></i><i class="v"></i><b></b></div>
        <div class="read" id="hud-read"></div>
      </div>`;
    document.body.appendChild(root);
    this.root = root;

    this.promptEl = root.querySelector("#hud-prompt");
    this.promptVerb = this.promptEl.querySelector(".verb");
    this.promptSub = this.promptEl.querySelector(".sub");
    this.bannerEl = root.querySelector("#hud-banner");
    this.journalEl = root.querySelector("#hud-journal");
    this.obsEl = root.querySelector("#hud-obs");
    this.readEl = root.querySelector("#hud-read");

    /** Pool of world-anchored annotations. */
    this.notes = [];
    this.noteCount = 0;
    for (let i = 0; i < 24; i++) {
      const el = document.createElement("div");
      el.className = "note";
      el.innerHTML = `<div class="name"></div><div class="val"></div>`;
      root.appendChild(el);
      this.notes.push({ el, name: el.querySelector(".name"), val: el.querySelector(".val"), lastText: "", lastVal: "" });
    }

    this._promptShown = false;
    this._journalTimer = 0;
    /** How often the player has seen each prompt; repeated ones fade back. */
    this._seen = Object.create(null);
    this._project = new Vector3();
  }

  /**
   * @param {string|null} key  e.g. "E"; null hides the prompt
   * @param {string} verb
   * @param {string} [sub]
   */
  setPrompt(key, verb, sub = "") {
    if (!key) {
      if (this._promptShown) { this.promptEl.classList.remove("on"); this._promptShown = false; }
      return;
    }
    const id = key + verb;
    const text = `<span class="key">${key}</span>${verb}`;
    if (this.promptVerb.innerHTML !== text) {
      this.promptVerb.innerHTML = text;
      this._seen[id] = (this._seen[id] || 0) + 1;
    }
    if (this.promptSub.textContent !== sub) this.promptSub.textContent = sub;
    // Once a prompt has been read a few times it steps back rather than shouting.
    const n = this._seen[id] || 1;
    this.promptEl.style.opacity = n > 6 ? "0.42" : "";
    if (!this._promptShown) { this.promptEl.classList.add("on"); this._promptShown = true; }
  }

  /** A short line of the protagonist's own notes, bottom right. */
  journal(text, seconds = 6) {
    if (!text) { this.journalEl.classList.remove("on"); return; }
    this.journalEl.innerHTML = `<div class="line">${text}</div>`;
    this.journalEl.classList.add("on");
    this._journalTimer = seconds;
  }

  /** A title card — used exactly twice in the slice. */
  banner(title, sub, seconds = 5) {
    this.bannerEl.querySelector(".t").textContent = title || "";
    this.bannerEl.querySelector(".s").textContent = sub || "";
    this.bannerEl.classList.add("on");
    this._bannerTimer = seconds;
  }

  setObserve(on, readout) {
    this.obsEl.classList.toggle("on", on);
    if (on && readout !== undefined && this.readEl.textContent !== readout) {
      this.readEl.textContent = readout;
    }
  }

  /** Begin a frame of world-anchored annotations. */
  beginNotes() { this.noteCount = 0; }

  /**
   * Pin a label to a world position.
   * @param {Vector3} world
   * @param {string} name
   * @param {string} value
   * @param {string} [cls] extra class: 'faint' | 'warm'
   */
  note(world, name, value, cls = "") {
    if (this.noteCount >= this.notes.length) return;
    const cam = this.scene.activeCamera;
    if (!cam) return;
    const engine = this.scene.getEngine();
    Vector3.ProjectToRef(world, Matrix.IdentityReadOnly, this.scene.getTransformMatrix(),
      cam.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()), this._project);
    const p = this._project;
    // Behind the camera, or off screen.
    if (p.z < 0 || p.z > 1) return;
    const w = engine.getRenderWidth(), h = engine.getRenderHeight();
    if (p.x < -100 || p.y < -100 || p.x > w + 100 || p.y > h + 100) return;

    const slot = this.notes[this.noteCount++];
    const sx = (p.x / w) * 100, sy = (p.y / h) * 100;
    slot.el.style.left = sx.toFixed(2) + "%";
    slot.el.style.top = sy.toFixed(2) + "%";
    slot.el.className = "note on " + cls;
    if (slot.lastText !== name) { slot.name.textContent = name; slot.lastText = name; }
    if (slot.lastVal !== value) { slot.val.textContent = value; slot.lastVal = value; }
  }

  endNotes() {
    for (let i = this.noteCount; i < this.notes.length; i++) {
      const s = this.notes[i];
      if (s.el.className !== "note") s.el.className = "note";
    }
  }

  update(dt) {
    if (this._journalTimer > 0) {
      this._journalTimer -= dt;
      if (this._journalTimer <= 0) this.journalEl.classList.remove("on");
    }
    if (this._bannerTimer > 0) {
      this._bannerTimer -= dt;
      if (this._bannerTimer <= 0) this.bannerEl.classList.remove("on");
    }
  }
}

/** Format degrees the way the temple does: degrees and arcminutes. */
export function fmtAngle(deg) {
  const sign = deg < 0 ? "−" : "";
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const m = Math.round((a - d) * 60);
  return `${sign}${d}° ${String(m).padStart(2, "0")}′`;
}

export { clamp01, damp };
