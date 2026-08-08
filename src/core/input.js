/**
 * Keyboard + mouse input.
 *
 * Pointer lock is the default state during exploration; the Book and the
 * developer overlay release it. Edge-triggered state is stored in fixed-size
 * arrays that are reset (not reallocated) every frame.
 */

const MAX_EDGE = 32;

export class Input {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    /** @type {Record<string, boolean>} */
    this.down = Object.create(null);
    this._pressed = new Array(MAX_EDGE).fill("");
    this._pressedCount = 0;
    this._released = new Array(MAX_EDGE).fill("");
    this._releasedCount = 0;

    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.lmb = false;
    this.rmb = false;
    this.lmbPressed = false;
    this.lmbReleased = false;
    this.rmbPressed = false;
    this.locked = false;
    this.enabled = true;
    /** Set true while a modal surface (Book, overlay) owns the pointer. */
    this.modal = false;
    /** Screen-space pointer position, used when unlocked (Book interaction). */
    this.px = 0;
    this.py = 0;

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      const c = e.code;
      if (!this.down[c]) {
        this.down[c] = true;
        if (this._pressedCount < MAX_EDGE) this._pressed[this._pressedCount++] = c;
      }
      // Keys the browser would otherwise steal.
      if (c === "Tab" || c === "Space" || c.startsWith("Arrow") || c === "F1") e.preventDefault();
    };
    this._onKeyUp = (e) => {
      const c = e.code;
      this.down[c] = false;
      if (this._releasedCount < MAX_EDGE) this._released[this._releasedCount++] = c;
    };
    this._onMouseMove = (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
      this.px = e.clientX;
      this.py = e.clientY;
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) { if (!this.lmb) this.lmbPressed = true; this.lmb = true; }
      if (e.button === 2) { if (!this.rmb) this.rmbPressed = true; this.rmb = true; }
      if (!this.locked && !this.modal) this.requestLock();
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) { this.lmb = false; this.lmbReleased = true; }
      if (e.button === 2) this.rmb = false;
    };
    this._onWheel = (e) => { this.wheel += e.deltaY; e.preventDefault(); };
    this._onContext = (e) => e.preventDefault();
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.lmb = false; this.rmb = false; }
    };
    this._onBlur = () => {
      for (const k in this.down) this.down[k] = false;
      this.lmb = this.rmb = false;
    };

    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("mousemove", this._onMouseMove);
    window.addEventListener("mousedown", this._onMouseDown);
    window.addEventListener("mouseup", this._onMouseUp);
    window.addEventListener("wheel", this._onWheel, { passive: false });
    window.addEventListener("blur", this._onBlur);
    canvas.addEventListener("contextmenu", this._onContext);
    document.addEventListener("pointerlockchange", this._onLockChange);
  }

  requestLock() {
    if (!this.enabled || this.modal) return;
    const p = this.canvas.requestPointerLock?.({ unadjustedMovement: true });
    if (p && typeof p.catch === "function") p.catch(() => { try { this.canvas.requestPointerLock(); } catch { /* ignore */ } });
  }

  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  isDown(code) { return this.down[code] === true; }

  justPressed(code) {
    for (let i = 0; i < this._pressedCount; i++) if (this._pressed[i] === code) return true;
    return false;
  }

  justReleased(code) {
    for (let i = 0; i < this._releasedCount; i++) if (this._released[i] === code) return true;
    return false;
  }

  /** Call once at the very end of a frame. */
  endFrame() {
    this._pressedCount = 0;
    this._releasedCount = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.lmbPressed = false;
    this.lmbReleased = false;
    this.rmbPressed = false;
  }

  /** Movement axes in camera space: x = strafe, y = forward. */
  moveX() {
    let x = 0;
    if (this.down["KeyD"]) x += 1;
    if (this.down["KeyA"]) x -= 1;
    return x;
  }

  moveY() {
    let y = 0;
    if (this.down["KeyW"]) y += 1;
    if (this.down["KeyS"]) y -= 1;
    return y;
  }
}
