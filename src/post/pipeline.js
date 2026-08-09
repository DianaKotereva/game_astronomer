/**
 * Post-processing stack.
 *
 *   TAA -> SSAO2 -> SSR (selective) -> tonemap/grade -> bloom -> DOF -> grain
 *   -> sharpen
 *
 * TAA matters more here than in most games: constellation threads are a pixel
 * wide, engraved scales are sub-pixel at reading distance, and stars must not
 * crawl. Everything is individually toggleable from the developer overlay so a
 * regression can be bisected by eye in seconds.
 */
import {
  DefaultRenderingPipeline, SSAO2RenderingPipeline, SSRRenderingPipeline,
  TAARenderingPipeline, ImageProcessingConfiguration, Color4, Vector3,
} from "../core/bjs.js";
import { tune, toggles } from "../core/tune.js";
import { clamp } from "../core/scratch.js";

export class PostStack {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {import("../core/bjs.js").Camera} camera
   */
  constructor(scene, camera) {
    this.name = "post";
    this.order = 900;
    this.scene = scene;
    this.camera = camera;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = tune.exposure;
    ip.contrast = tune.contrast;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = tune.vignette * 3.2;
    ip.vignetteStretch = 0.32;
    ip.vignetteCameraFov = 1.1;
    ip.vignetteColor = new Color4(0, 0, 0.01, 0);
    ip.colorCurvesEnabled = true;

    // Grade: cool the shadows, keep the warm lantern warm, desaturate slightly.
    const cc = ip.colorCurves;
    cc.globalSaturation = tune.saturation * 100 - 100 + 0;
    cc.shadowsHue = 215; cc.shadowsDensity = 22; cc.shadowsSaturation = -6; cc.shadowsExposure = -3;
    cc.midtonesHue = 210; cc.midtonesDensity = 6; cc.midtonesSaturation = -4;
    cc.highlightsHue = 40; cc.highlightsDensity = 9; cc.highlightsSaturation = -8;

    this.pipeline = new DefaultRenderingPipeline("main", true, scene, [camera], false);
    const p = this.pipeline;
    p.samples = 1;
    p.fxaaEnabled = false;               // TAA handles edges
    p.bloomEnabled = true;
    p.bloomThreshold = tune.bloomThreshold;
    p.bloomWeight = tune.bloom;
    p.bloomKernel = 64;
    p.bloomScale = 0.6;
    p.imageProcessingEnabled = true;
    p.grainEnabled = true;
    p.grain.intensity = tune.grain * 12;
    p.grain.animated = true;
    p.sharpenEnabled = true;
    p.sharpen.edgeAmount = tune.sharpen;
    p.sharpen.colorAmount = 1;
    p.depthOfFieldEnabled = false;       // enabled only for inspection framing
    p.depthOfField.focalLength = 42;
    p.depthOfField.fStop = 4.4;
    p.depthOfField.focusDistance = 3000;
    p.chromaticAberrationEnabled = true;
    p.chromaticAberration.aberrationAmount = 3.2;
    p.chromaticAberration.radialIntensity = 0.65;

    /** @type {SSAO2RenderingPipeline|null} */
    this.ssao = null;
    /** @type {SSRRenderingPipeline|null} */
    this.ssr = null;
    /** @type {TAARenderingPipeline|null} */
    this.taa = null;

    this._dofBlend = 0;
    this.inspectFocus = 0;      // 0 = off, >0 = focus distance in metres
  }

  /** Built after the world exists so the depth renderer sees real geometry. */
  enableSSAO(ratio = 0.75, samples = 16) {
    this.ssao = new SSAO2RenderingPipeline("ssao", this.scene, { ssaoRatio: ratio, blurRatio: 1 }, [this.camera], true);
    this.ssao.radius = 1.35;
    this.ssao.totalStrength = 1.15;
    this.ssao.base = 0.06;
    this.ssao.samples = samples;
    this.ssao.maxZ = 60;
    this.ssao.minZAspect = 0.24;
    this.ssao.epsilon = 0.024;
    this.ssao.expensiveBlur = true;
    this.ssao.bypassBlur = false;
    return this.ssao;
  }

  /**
   * Not used. Babylon 9.20's WGSL variant of screenSpaceReflection2 fails to
   * compile ("unresolved value 'hitPixel'"), so screen-space reflections are
   * off on the WebGPU path. Mirrors and standing water use planar reflection
   * probes instead, which are sharper and — for an optics puzzle where the
   * player must trust what a mirror shows — more honest than a screen-space
   * approximation that drops anything off-screen. Kept for the day the engine
   * bug is fixed.
   */
  enableSSR() {
    const ssr = new SSRRenderingPipeline("ssr", this.scene, [this.camera], false);
    ssr.thickness = 0.09;
    ssr.selfCollisionNumSkip = 2;
    ssr.enableSmoothReflections = true;
    ssr.enableAutomaticThicknessComputation = false;
    ssr.blurDispersionStrength = 0.045;
    ssr.roughnessFactor = 0.16;
    ssr.reflectivityThreshold = 0.06;
    ssr.ssrDownsample = 1;
    ssr.blurDownsample = 1;
    ssr.step = 0.6;
    ssr.maxSteps = 700;
    ssr.maxDistance = 55;
    ssr.attenuateIntersectionDistance = true;
    ssr.attenuateScreenBorders = true;
    ssr.attenuateBackfaceReflection = true;
    ssr.clipToFrustum = true;
    this.ssr = ssr;
    return ssr;
  }

  enableTAA(samples = 12) {
    const taa = new TAARenderingPipeline("taa", this.scene, [this.camera]);
    taa.samples = samples;
    taa.factor = 0.06;             // heavy history: stars and threads must not crawl
    taa.disableOnCameraMove = false;
    this.taa = taa;
    return taa;
  }

  /** Ask for a shallow depth of field, e.g. while inspecting an instrument. */
  setInspectFocus(distance, blend) {
    this.inspectFocus = distance;
    this._dofTarget = blend;
  }

  update(dt) {
    const p = this.pipeline;
    const ip = this.scene.imageProcessingConfiguration;
    ip.exposure = tune.exposure;
    ip.contrast = tune.contrast;
    ip.vignetteWeight = tune.vignette * 3.2;
    ip.colorCurves.globalSaturation = tune.saturation * 100 - 100;

    p.bloomWeight = tune.bloom;
    p.bloomThreshold = tune.bloomThreshold;
    p.grain.intensity = tune.grain * 12;
    p.sharpen.edgeAmount = tune.sharpen;

    if (p.bloomEnabled !== toggles.post) p.bloomEnabled = toggles.post;
    if (p.grainEnabled !== toggles.post) p.grainEnabled = toggles.post;
    if (p.sharpenEnabled !== toggles.post) p.sharpenEnabled = toggles.post;
    if (p.imageProcessingEnabled !== toggles.post) p.imageProcessingEnabled = toggles.post;

    if (this.ssao) {
      const want = toggles.ssao;
      if (this._ssaoOn !== want) {
        this._ssaoOn = want;
        if (want) this.scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", this.camera);
        else this.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("ssao", this.camera);
      }
    }
    if (this.ssr) {
      const want = toggles.ssr;
      if (this._ssrOn !== want) {
        this._ssrOn = want;
        if (want) this.scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssr", this.camera);
        else this.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("ssr", this.camera);
      }
    }
    if (this.taa) {
      const want = toggles.taa;
      if (this.taa.isEnabled !== undefined && this._taaOn !== want) {
        this._taaOn = want;
        if (want) this.scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("taa", this.camera);
        else this.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("taa", this.camera);
      }
    }

    // Restrained DOF: only while inspecting, and never enough to soften the
    // architecture behind the player's hands.
    const target = this._dofTarget || 0;
    this._dofBlend += (target - this._dofBlend) * Math.min(1, dt * 4);
    const wantDof = this._dofBlend > 0.02 && toggles.post;
    if (p.depthOfFieldEnabled !== wantDof) p.depthOfFieldEnabled = wantDof;
    if (wantDof) {
      p.depthOfField.focusDistance = clamp(this.inspectFocus, 0.4, 40) * 1000;
      p.depthOfField.fStop = 12 - this._dofBlend * 8.4;
    }
  }
}

export { Vector3 };
