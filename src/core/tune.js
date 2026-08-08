/**
 * Central tuning registry.
 *
 * Every visually significant constant lives here so the developer overlay can
 * drive it live. Most of the difference between "prototype" and "premium" is
 * found by dragging these sliders while looking at the actual frame, so they
 * exist from the first milestone rather than being retro-fitted.
 *
 * Systems read `tune.<key>` directly every frame — it is a plain object, so
 * reads are free and there is no observer machinery in the hot path.
 */

export const tune = {
  // --- sky ---------------------------------------------------------------
  moonAzimuth: 118,        // degrees, clockwise from north
  moonAltitude: 27,        // degrees above horizon
  moonIntensity: 1.35,
  moonPhase: 0.78,         // 0 new .. 1 full
  moonAngularSize: 0.62,   // degrees
  skyIntensity: 0.5,
  skyHorizonLift: 0.5,
  starIntensity: 1.0,
  starSizeScale: 1.0,
  milkyWayIntensity: 0.75,
  extinctionStrength: 1.0,
  airglow: 0.35,

  // --- exposure / grade --------------------------------------------------
  exposure: 1.0,
  contrast: 1.06,
  saturation: 0.94,
  coolShadowTint: 0.5,
  warmLightTint: 0.55,
  vignette: 0.42,
  grain: 0.28,
  bloom: 0.34,
  bloomThreshold: 0.72,
  sharpen: 0.28,

  // --- atmosphere --------------------------------------------------------
  fogDensityExterior: 0.0075,
  fogDensityInterior: 0.016,
  volumetricStrength: 1.0,
  dustDensity: 1.0,

  // --- lights ------------------------------------------------------------
  lanternIntensity: 1.0,
  lanternRange: 13.5,
  lanternWarmth: 1.0,
  shadowDarkness: 0.12,
  contactShadow: 0.7,

  // --- magic -------------------------------------------------------------
  magicGlow: 1.0,
  threadWidth: 1.0,
  resonanceIntensity: 1.0,
  gravityLensDistortion: 1.0,
  stellarLightIntensity: 1.0,
  recallOpacity: 1.0,

  // --- camera ------------------------------------------------------------
  cameraDistance: 4.1,
  cameraHeight: 1.52,
  cameraShoulder: 0.62,
  cameraFov: 62,
  observeFov: 41,
  mouseSensitivity: 1.0,

  // --- character ---------------------------------------------------------
  clothStiffness: 1.0,
  clothWind: 1.0,
  walkSpeed: 1.82,
  jogSpeed: 3.5,
};

/** @typedef {{key:string,label:string,min:number,max:number,step:number,group:string}} TuneDef */

/** @type {TuneDef[]} */
export const TUNE_DEFS = [
  { key: "moonAzimuth", label: "moon azimuth", min: 0, max: 360, step: 1, group: "Sky" },
  { key: "moonAltitude", label: "moon altitude", min: -10, max: 80, step: 0.5, group: "Sky" },
  { key: "moonIntensity", label: "moon intensity", min: 0, max: 4, step: 0.01, group: "Sky" },
  { key: "moonPhase", label: "moon phase", min: 0, max: 1, step: 0.01, group: "Sky" },
  { key: "skyIntensity", label: "sky intensity", min: 0, max: 2, step: 0.01, group: "Sky" },
  { key: "starIntensity", label: "star intensity", min: 0, max: 3, step: 0.01, group: "Sky" },
  { key: "starSizeScale", label: "star size", min: 0.4, max: 2.5, step: 0.01, group: "Sky" },
  { key: "milkyWayIntensity", label: "milky way", min: 0, max: 2.5, step: 0.01, group: "Sky" },
  { key: "extinctionStrength", label: "extinction", min: 0, max: 2, step: 0.01, group: "Sky" },
  { key: "airglow", label: "airglow", min: 0, max: 2, step: 0.01, group: "Sky" },

  { key: "exposure", label: "exposure", min: 0.2, max: 3, step: 0.01, group: "Grade" },
  { key: "contrast", label: "contrast", min: 0.6, max: 1.8, step: 0.01, group: "Grade" },
  { key: "saturation", label: "saturation", min: 0, max: 1.6, step: 0.01, group: "Grade" },
  { key: "bloom", label: "bloom", min: 0, max: 1.5, step: 0.01, group: "Grade" },
  { key: "bloomThreshold", label: "bloom threshold", min: 0, max: 1.5, step: 0.01, group: "Grade" },
  { key: "vignette", label: "vignette", min: 0, max: 1.5, step: 0.01, group: "Grade" },
  { key: "grain", label: "film grain", min: 0, max: 1.5, step: 0.01, group: "Grade" },
  { key: "sharpen", label: "sharpen", min: 0, max: 1.5, step: 0.01, group: "Grade" },

  { key: "fogDensityExterior", label: "fog exterior", min: 0, max: 0.05, step: 0.0005, group: "Atmosphere" },
  { key: "fogDensityInterior", label: "fog interior", min: 0, max: 0.06, step: 0.0005, group: "Atmosphere" },
  { key: "volumetricStrength", label: "volumetrics", min: 0, max: 3, step: 0.01, group: "Atmosphere" },
  { key: "dustDensity", label: "dust density", min: 0, max: 3, step: 0.01, group: "Atmosphere" },

  { key: "lanternIntensity", label: "lantern", min: 0, max: 3, step: 0.01, group: "Light" },
  { key: "lanternRange", label: "lantern range", min: 3, max: 30, step: 0.1, group: "Light" },
  { key: "shadowDarkness", label: "shadow darkness", min: 0, max: 1, step: 0.01, group: "Light" },

  { key: "magicGlow", label: "magic glow", min: 0, max: 3, step: 0.01, group: "Magic" },
  { key: "threadWidth", label: "thread width", min: 0.2, max: 3, step: 0.01, group: "Magic" },
  { key: "resonanceIntensity", label: "resonance", min: 0, max: 3, step: 0.01, group: "Magic" },
  { key: "gravityLensDistortion", label: "gravity lens", min: 0, max: 3, step: 0.01, group: "Magic" },
  { key: "stellarLightIntensity", label: "stellar light", min: 0, max: 3, step: 0.01, group: "Magic" },
  { key: "recallOpacity", label: "astral recall", min: 0, max: 2, step: 0.01, group: "Magic" },

  { key: "cameraDistance", label: "cam distance", min: 1.5, max: 9, step: 0.05, group: "Camera" },
  { key: "cameraHeight", label: "cam height", min: 0.6, max: 3, step: 0.01, group: "Camera" },
  { key: "cameraShoulder", label: "cam shoulder", min: -1.5, max: 1.5, step: 0.01, group: "Camera" },
  { key: "cameraFov", label: "fov", min: 35, max: 95, step: 0.5, group: "Camera" },
  { key: "observeFov", label: "observe fov", min: 20, max: 70, step: 0.5, group: "Camera" },
  { key: "mouseSensitivity", label: "sensitivity", min: 0.2, max: 3, step: 0.01, group: "Camera" },

  { key: "clothStiffness", label: "cloth stiffness", min: 0.2, max: 2.5, step: 0.01, group: "Character" },
  { key: "clothWind", label: "cloth wind", min: 0, max: 3, step: 0.01, group: "Character" },
  { key: "walkSpeed", label: "walk speed", min: 0.5, max: 4, step: 0.01, group: "Character" },
  { key: "jogSpeed", label: "jog speed", min: 1, max: 8, step: 0.01, group: "Character" },
];

/** Per-system enable flags exposed in the overlay (§56). */
export const toggles = {
  stars: true,
  milkyWay: true,
  moon: true,
  shadows: true,
  ssao: true,
  ssr: true,
  volumetrics: true,
  dust: true,
  cloth: true,
  magic: true,
  post: true,
  taa: true,
  character: true,
  wireframe: false,
  freezeTime: false,
};

/** @type {Array<{key:string,label:string}>} */
export const TOGGLE_DEFS = [
  { key: "stars", label: "stars" },
  { key: "milkyWay", label: "milky way" },
  { key: "moon", label: "moon" },
  { key: "shadows", label: "shadows" },
  { key: "ssao", label: "ssao" },
  { key: "ssr", label: "ssr" },
  { key: "volumetrics", label: "volumetrics" },
  { key: "dust", label: "dust" },
  { key: "cloth", label: "cloth" },
  { key: "magic", label: "star magic" },
  { key: "post", label: "post" },
  { key: "taa", label: "taa" },
  { key: "character", label: "character" },
  { key: "wireframe", label: "wireframe" },
];

const listeners = [];
/** Subscribe to any tuning change (used by systems that must rebuild on edit). */
export function onTuneChange(fn) { listeners.push(fn); }
export function fireTuneChange(key) { for (let i = 0; i < listeners.length; i++) listeners[i](key); }
