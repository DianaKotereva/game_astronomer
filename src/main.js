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
  player.teleport(0, 0.05, -13.2, 0);

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
  lighting.setInterior(1);
  player.setInterior(1);
  dust.setInterior(1);
  audio.setInterior(1);

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
  await scene.whenReadyAsync();
  await warmUp(ctx, bootStep);

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

main().catch((e) => {
  console.error(e);
  bootFail(String(e && e.message ? e.message : e));
});
