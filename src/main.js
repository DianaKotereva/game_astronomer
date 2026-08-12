/**
 * The Book of Stars — entry point.
 *
 * Build order matters: the celestial simulation exists before anything that
 * reads it, the world before the shadows that must know its casters, and the
 * post stack after the geometry the depth renderer will see.
 */
import { createEngine, Runtime, applyResolution } from "./core/engine.js";
import { bootInit, bootPlan, bootStep, bootPhase, bootFinish, bootFail } from "./core/boot.js";
import { Input } from "./core/input.js";
import { ThirdPersonCamera } from "./camera/thirdPerson.js";
import { DevOverlay } from "./ui/devOverlay.js";
import { Hud } from "./ui/hud.js";
import { Temple } from "./world/temple.js";
import { GameTime } from "./astronomy/gameTime.js";
import { Sky } from "./sky/sky.js";
import { Lighting } from "./world/lighting.js";
import { PostStack } from "./post/pipeline.js";
import { Atmosphere } from "./post/atmosphere.js";
import { Player } from "./character/player.js";
import { Interaction } from "./interaction/interaction.js";
import { Observation } from "./interaction/observation.js";
import { Magic } from "./magic/spells.js";
import { Book } from "./book/book.js";
import { Dust } from "./vfx/dust.js";
import { Audio } from "./audio/audio.js";
import { Save } from "./core/save.js";
import { warmUp } from "./core/warmup.js";
import * as celestial from "./astronomy/celestial.js";
import { tune, toggles } from "./core/tune.js";
import { damp } from "./core/scratch.js";
import { APPROACH } from "./world/chambers/approach.js";
import { HALL } from "./world/chambers/hallOfMeridian.js";
import { REFLECT } from "./world/chambers/courtOfReflections.js";

/** Quality profile. `?q=low` keeps every system on but cheapens the maps, which
 *  is what makes iterating on a software rasteriser bearable. */
const Q = new URLSearchParams(location.search).get("q") || "high";
const QUALITY = Q === "low"
  ? { shadow: 1024, cascades: 2, lanternShadow: 512, ssao: 0.5, ssaoSamples: 8, taa: 6 }
  : { shadow: 2048, cascades: 4, lanternShadow: 1024, ssao: 0.75, ssaoSamples: 16, taa: 12 };

async function main() {
  bootInit();
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("view"));

  if (!navigator.gpu) {
    bootFail("Chrome or Edge 113+ on a desktop GPU. If you are already using one, check that hardware acceleration is enabled.");
    return;
  }

  let engine, scene;
  try {
    ({ engine, scene } = await createEngine(canvas));
  } catch (err) {
    console.error(err);
    bootFail("A WebGPU device could not be created on this machine.");
    return;
  }

  applyResolution(engine, canvas, 1);
  window.addEventListener("resize", () => applyResolution(engine, canvas, 1));

  const rt = new Runtime(engine, scene);
  const input = new Input(canvas);

  bootPlan(34);
  await bootStep("aligning the meridian", 1);

  /* --- context: every system gets the same object ---------------------- */
  const ctx = { scene, engine, rt, input, celestial, tune, toggles };

  const cam = new ThirdPersonCamera(scene, input);
  rt.add(cam);
  ctx.cam = cam;

  const time = new GameTime();
  ctx.time = time;
  rt.add({ name: "time", order: 90, update(dt) { if (!toggles.freezeTime) time.update(dt); } });

  const lighting = new Lighting(scene, rt);
  rt.add(lighting);
  ctx.lighting = lighting;

  const sky = new Sky(scene, time);
  await sky.build(bootStep);
  rt.add(sky);
  lighting.sky = sky;
  ctx.sky = sky;

  /* --- the temple ------------------------------------------------------ */
  const temple = new Temple(scene, bootStep);
  ctx.temple = temple;
  await temple.build(ctx);
  ctx.mats = temple.mats;

  /* --- the protagonist -------------------------------------------------- */
  await bootStep("waking the traveller", 3);
  const player = new Player(scene, temple.mats, cam, input, lighting);
  rt.add(player);
  ctx.player = player;
  // The player begins outside, at the foot of the great stair, facing the
  // temple (§11.1). Everything about the opening minute is the approach.
  player.teleport(0, APPROACH.plainY + 0.05, APPROACH.plainZ1 - 5.5, 0);

  await bootStep("hanging the shadows", 3);
  lighting.initShadows(temple.shadowCasters, QUALITY.shadow, QUALITY.cascades, QUALITY.lanternShadow);
  for (const m of player.meshes) if (m) lighting.addCaster(m);
  for (const m of temple.dynamicCasters) if (m) lighting.addCaster(m);

  /* --- interface, knowledge, magic -------------------------------------- */
  const hud = new Hud(scene);
  ctx.hud = hud;
  rt.add({ name: "hud", order: 960, update(dt) { hud.update(dt); } });

  const audio = new Audio();
  ctx.audio = audio;
  rt.add({ name: "audio", order: 810, update(dt) { audio.update(dt, ctx); } });
  const startAudio = () => { audio.start(); window.removeEventListener("pointerdown", startAudio); window.removeEventListener("keydown", startAudio); };
  window.addEventListener("pointerdown", startAudio);
  window.addEventListener("keydown", startAudio);

  const book = new Book(scene, ctx);
  ctx.book = book;
  rt.add(book);
  for (const m of book.meshes) if (m) lighting.addCaster(m);

  const magic = new Magic(scene, ctx);
  ctx.magic = magic;
  rt.add(magic);

  const observation = new Observation(scene, cam, input, sky, player, hud, book);
  ctx.observation = observation;
  rt.add(observation);
  magic.observation = observation;

  const interaction = new Interaction(scene, player, cam, input, hud);
  ctx.interaction = interaction;
  rt.add(interaction);

  const dust = new Dust(scene, 520);
  ctx.dust = dust;
  rt.add(dust);

  const save = new Save(ctx);
  ctx.save = save;
  rt.add(save);

  /* --- puzzles ---------------------------------------------------------- */
  await bootStep("winding the mechanisms", 2);
  for (const p of temple.puzzles) {
    p.install();
    rt.add(p);
  }

  /* --- atmosphere and post ---------------------------------------------- */
  await bootStep("letting in the night", 2);
  // Interior-ness is a property of where the player is standing, not a constant
  // set once at boot: the slice now opens on an exterior, and the Court of
  // Reflections has no roof at all. Everything that cares about the difference
  // between cold sky and enclosed stone reads the same blend.
  let interior = 0;
  const applyInterior = (v) => {
    lighting.setInterior(v); player.setInterior(v); dust.setInterior(v); audio.setInterior(v);
  };
  applyInterior(0);
  rt.add({
    name: "interior", order: 95,
    update(dt) {
      const p = player.position;
      let want = 1;
      if (p.z < HALL.z0 + 1.5) want = 0;                                  // the approach
      else if (Math.hypot(p.x - REFLECT.cx, p.z - REFLECT.cz) < REFLECT.half) want = 0.25;
      // Damped, so walking through the portal is a transition and not a switch.
      interior = damp(interior, want, 0.0012, dt);
      applyInterior(interior);
      tune.exposureBlend = interior;
    },
  });

  const post = new PostStack(scene, cam.camera);
  post.enableSSAO(QUALITY.ssao, QUALITY.ssaoSamples);
  post.enableTAA(QUALITY.taa);
  rt.add(post);
  ctx.post = post;

  const atmosphere = new Atmosphere(scene, cam.camera, lighting);
  rt.add(atmosphere);
  ctx.atmosphere = atmosphere;

  cam.target.copyFrom(player.position);
  cam.yaw = 0; cam.pitch = 0.04;
  cam.snap();
  rt.add({ name: "camFollow", order: 290, update() { cam.target.copyFrom(player.position); } });

  /* --- modal coordination ------------------------------------------------ */
  rt.add({
    name: "modal", order: 340,
    update() {
      const modal = book.open;
      input.modal = modal;
      interaction.blocked = modal;
      magic.blocked = modal;
      observation.blocked = modal;
      player.controller.enabledMovement = !modal;
      if (modal && input.locked) input.releaseLock();
      // Free-fly for looking at the architecture (F2), reset view (F3).
      if (input.justPressed("F2")) cam.freeFly = !cam.freeFly;
      if (input.justPressed("F3")) { cam.freeFly = false; cam.snap(); }
    },
  });

  const dev = new DevOverlay(rt, input);
  rt.add(dev);
  ctx.dev = dev;
  rt.add({ name: "inputEnd", order: 999, update() { input.endFrame(); } });

  /* --- warm every pipeline before the doors open ------------------------- */
  await bootStep("compiling the celestial tables", 3);
  // Bounded: if a single material never reports ready the game must still open,
  // with the problem visible in the console, rather than hanging on a spinner.
  await Promise.race([
    scene.whenReadyAsync(),
    // Eight seconds, not sixty: with every mesh material verified ready, what
    // remains is Babylon's own post-process readiness bookkeeping, and the
    // warm-up below is what actually forces those pipelines to compile.
    new Promise((r) => setTimeout(() => {
      console.warn("scene.whenReadyAsync timed out; continuing. Not ready:", notReady(scene));
      r();
    }, 8000)),
  ]);
  if (new URLSearchParams(location.search).get("warm") !== "0") await warmUp(ctx, bootStep);

  temple.freezeStatic();

  save.read();

  await bootPhase("opening the doors");
  rt.start();

  window.__rt = rt;
  window.__scene = scene;
  window.__game = ctx;
  window.__status = temple.stats();
  await bootFinish(700);

  hud.banner("The Book of Stars", "an abandoned observatory, and one line of bronze", 7);
  hud.journal("Hold right mouse to look properly. E to touch what is in reach. B for the Book.", 12);
}

/** Which meshes are holding up readiness, and why. */
function notReady(scene) {
  const out = [];
  for (const m of scene.meshes) {
    if (!m.isEnabled() || !m.subMeshes || !m.subMeshes.length) continue;
    const mat = m.material;
    if (!mat) continue;
    if (!mat.isReady(m, false)) out.push(m.name + " <- " + mat.name + " (" + mat.getClassName() + ")");
  }
  return out.length ? out : "(nothing — readiness was blocked elsewhere)";
}

main().catch((e) => {
  console.error(e);
  bootFail(String(e && e.message ? e.message : e));
});
