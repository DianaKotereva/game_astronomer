/**
 * Headless capture shim — TOOLING ONLY, never shipped with the game.
 *
 * The container's headless Chromium runs WebGPU on SwiftShader, and that stack
 * cannot allocate a *canvas swapchain* shared image ("Could not find
 * SharedImageBackingFactory ... WebgpuSwapChainTexture"), which kills the device
 * the moment a page calls canvas.getContext("webgpu"). Plain offscreen WebGPU
 * rendering and texture readback work perfectly.
 *
 * So for capture runs we hand the engine a virtual swapchain: an ordinary
 * texture it renders into exactly as it would the real one. window.__grab()
 * copies that texture back and paints it into the canvas's 2D context, which the
 * screenshotter can see. The game itself is untouched and uses the real
 * swapchain on real hardware.
 */
(() => {
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  const state = { canvas: null, device: null, format: "bgra8unorm", texture: null, w: 0, h: 0, ctx2d: null };
  window.__shim = state;

  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    if (type !== "webgpu") return origGetContext.call(this, type, opts);
    state.canvas = this;
    return {
      canvas: this,
      configure(cfg) {
        state.device = cfg.device;
        state.format = cfg.format;
        state.usage = (cfg.usage || 0) | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING;
        state.texture = null;
      },
      unconfigure() {
        if (state.texture) { state.texture.destroy(); state.texture = null; }
      },
      getConfiguration() { return { device: state.device, format: state.format, usage: state.usage }; },
      getCurrentTexture() {
        const w = Math.max(1, state.canvas.width), h = Math.max(1, state.canvas.height);
        if (!state.texture || state.w !== w || state.h !== h) {
          if (state.texture) state.texture.destroy();
          state.w = w; state.h = h;
          state.texture = state.device.createTexture({
            size: { width: w, height: h, depthOrArrayLayers: 1 },
            format: state.format,
            usage: state.usage,
            label: "virtual-swapchain",
          });
        }
        return state.texture;
      },
    };
  };

  /** Copy the virtual swapchain back to CPU and paint it into the canvas. */
  window.__grab = async function () {
    const s = state;
    if (!s.device || !s.texture) return "no-texture";
    const W = s.w, H = s.h;
    const bpr = Math.ceil((W * 4) / 256) * 256;
    const size = bpr * H;
    if (!s._buf || s._bufSize !== size) {
      if (s._buf) s._buf.destroy();
      s._buf = s.device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      s._bufSize = size;
    }
    const enc = s.device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: s.texture }, { buffer: s._buf, bytesPerRow: bpr }, { width: W, height: H });
    s.device.queue.submit([enc.finish()]);
    await s._buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(s._buf.getMappedRange());

    if (!s.ctx2d) {
      // The real canvas never received a webgpu context, so 2D is still free.
      s.ctx2d = origGetContext.call(s.canvas, "2d");
    }
    if (!s._img || s._img.width !== W || s._img.height !== H) {
      s._img = new ImageData(W, H);
    }
    const dst = s._img.data;
    const bgra = s.format.startsWith("bgra");
    for (let y = 0; y < H; y++) {
      let si = y * bpr;
      let di = y * W * 4;
      for (let x = 0; x < W; x++, si += 4, di += 4) {
        if (bgra) { dst[di] = src[si + 2]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si]; }
        else { dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; }
        dst[di + 3] = 255;
      }
    }
    s._buf.unmap();
    // The canvas backing store is the render resolution; CSS scales it to fit.
    s.ctx2d.putImageData(s._img, 0, 0);
    return { w: W, h: H, format: s.format };
  };
})();
