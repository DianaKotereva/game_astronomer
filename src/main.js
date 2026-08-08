/**
 * The Book of Stars — entry point.
 */
import { createEngine, Runtime, applyResolution } from "./core/engine.js";
import { bootInit, bootPlan, bootStep, bootPhase, bootFinish, bootFail } from "./core/boot.js";
import { Input } from "./core/input.js";
import { ThirdPersonCamera } from "./camera/thirdPerson.js";
import { DevOverlay } from "./ui/devOverlay.js";
import { Vector3, HemisphericLight, MeshBuilder, PBRMaterial, Color3 } from "./core/bjs.js";

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

  bootPlan(10);
  await bootStep("aligning the meridian", 1);

  const cam = new ThirdPersonCamera(scene, input);
  rt.add(cam);

  // --- temporary scene (replaced in milestone 2) -------------------------
  const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
  hemi.intensity = 0.6;
  const ground = MeshBuilder.CreateGround("ground", { width: 60, height: 60 }, scene);
  const gm = new PBRMaterial("gm", scene);
  gm.albedoColor = new Color3(0.32, 0.3, 0.27);
  gm.metallic = 0; gm.roughness = 0.85;
  ground.material = gm;
  ground.checkCollisions = true;
  const box = MeshBuilder.CreateBox("box", { size: 2 }, scene);
  box.position.set(0, 1, 4);
  box.material = gm;
  cam.target.set(0, 0, 0);
  cam.snap();

  await bootStep("kindling the lantern", 4);

  const dev = new DevOverlay(rt, input);
  rt.add(dev);
  rt.add({
    name: "inputEnd", order: 999,
    update() { input.endFrame(); },
  });

  await bootStep("compiling the celestial tables", 4);
  await scene.whenReadyAsync();
  await bootPhase("opening the doors");

  rt.start();
  window.__rt = rt;
  window.__scene = scene;
  window.__game = { rt, scene, cam, input, dev };
  await bootFinish(600);
}

main().catch((e) => {
  console.error(e);
  bootFail(String(e && e.message ? e.message : e));
});
