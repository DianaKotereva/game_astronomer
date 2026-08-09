/**
 * Local persistence.
 *
 * Deliberately small: which major mechanisms have been woken, which leaves of
 * the Book have been recovered, what the protagonist has learnt to do, where she
 * is, and the tuning the player chose. There is no save-slot interface — the
 * game writes after every discovery and picks up where it was left.
 */
const KEY = "bookofstars.save.v1";

export class Save {
  /** @param {Object} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.solved = new Set();
    this.checkpoint = null;
    this._pending = false;
    this._timer = 0;
    this.name = "save";
    this.order = 990;
  }

  markSolved(id) {
    this.solved.add(id);
    this.write();
  }

  isSolved(id) { return this.solved.has(id); }

  setCheckpoint(x, y, z, facing) {
    this.checkpoint = { x, y, z, facing };
  }

  write() {
    const ctx = this.ctx;
    try {
      const data = {
        v: 1,
        t: Date.now(),
        solved: Array.from(this.solved),
        fragments: ctx.book ? Array.from(ctx.book.fragments) : [],
        figures: ctx.book ? Array.from(ctx.book.knownFigures) : [],
        templeFigures: ctx.book ? ctx.book.templeFiguresKnown : false,
        records: ctx.book ? Array.from(ctx.book.records.entries()) : [],
        spells: ctx.magic ? ctx.magic.unlocked : null,
        lightRefined: ctx.magic ? ctx.magic.lightRefined : false,
        lightCollimated: ctx.magic ? ctx.magic.lightCollimated : false,
        jd: ctx.time ? ctx.time.jd : null,
        checkpoint: this.checkpoint,
        position: ctx.player ? {
          x: ctx.player.position.x, y: ctx.player.position.y, z: ctx.player.position.z,
          facing: ctx.player.controller.facing,
        } : null,
      };
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  /** @returns {boolean} whether anything was restored */
  read() {
    let data;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      data = JSON.parse(raw);
    } catch { return false; }
    if (!data || data.v !== 1) return false;

    const ctx = this.ctx;
    this.solved = new Set(data.solved || []);
    this.checkpoint = data.checkpoint || null;

    if (ctx.book) {
      // Replaying the fragments (rather than assigning the set) re-applies every
      // consequence, so a loaded game and a played one are the same game.
      for (const id of data.fragments || []) ctx.book.unlockFragment(id);
      for (const k of data.figures || []) ctx.book.knownFigures.add(k);
      if (data.templeFigures) ctx.book.templeFiguresKnown = true;
      for (const [k, v] of data.records || []) ctx.book.records.set(k, v);
      ctx.book.rebuild();
    }
    if (ctx.magic && data.spells) {
      for (const k of Object.keys(data.spells)) ctx.magic.unlocked[k] = data.spells[k];
      ctx.magic.lightRefined = !!data.lightRefined;
      ctx.magic.lightCollimated = !!data.lightCollimated;
    }
    if (ctx.time && data.jd) ctx.time.jd = data.jd;
    if (ctx.player && data.position) {
      ctx.player.teleport(data.position.x, data.position.y, data.position.z, data.position.facing || 0);
    }
    return true;
  }

  clear() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    this.solved.clear();
  }

  /** Autosave shortly after anything important happens. */
  queue() { this._pending = true; this._timer = 1.2; }

  update(dt) {
    if (!this._pending) return;
    this._timer -= dt;
    if (this._timer <= 0) { this._pending = false; this.write(); }
  }
}
