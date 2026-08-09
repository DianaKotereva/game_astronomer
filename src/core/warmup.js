/**
 * Pipeline warm-up.
 *
 * WebGPU compiles a pipeline the first time a material/state combination is
 * actually drawn, and that compile lands as a hitch. A spell may not stutter the
 * first time it is cast, the Book may not stutter the first time it is opened,
 * and a mechanism may not stutter the first time it moves (§58, §85).
 *
 * So before the loading screen lifts we force every one of those combinations
 * through at least one real frame, with the camera pointed somewhere harmless
 * and the results discarded. Four extra seconds of loading is a trade worth
 * making many times over for a 200 ms hitch mid-cast.
 */

/**
 * @param {Object} ctx
 * @param {(label:string, weight?:number)=>Promise<void>} report
 */
export async function warmUp(ctx, report) {
  const { scene, engine, magic, book, player, cam, dust, observation } = ctx;
  const frames = async (n) => {
    for (let i = 0; i < n; i++) {
      scene.render();
      await new Promise((r) => requestAnimationFrame(() => r()));
    }
  };

  await report("warming the instruments", 2);

  // Save what we are about to disturb.
  const savedYaw = cam.yaw, savedPitch = cam.pitch;
  const savedSpell = magic.selected;
  const savedOpen = book.open;
  const savedUnlocked = Object.assign({}, magic.unlocked);

  // Everything must be castable during the warm-up, whatever the save says.
  for (const k of Object.keys(magic.unlocked)) magic.unlocked[k] = true;

  // --- every spell, once, in front of the camera ------------------------
  for (let spell = 1; spell <= 5; spell++) {
    magic.selected = spell;
    magic.casting = true;
    magic.castTime = 0.5;
    player.focus.setMode(spell);
    magic.update(1 / 60);
    await frames(1);
  }
  // Zenith draws a different geometry set again.
  magic.beginZenith(player.position, 0, 0.001);
  magic.update(1 / 60);
  await frames(1);
  magic._zenithT = 0;
  magic.casting = false;
  magic.selected = 0;
  player.focus.setMode(0);

  await report("warming the leaves", 2);

  // --- the Book: page materials, both faces, and a turn -----------------
  book.open = true;
  book.blend = 1;
  book.rebuild();
  for (let i = 0; i < Math.min(4, book.spreads.length); i++) {
    book.spread = i;
    book._dirty = true;
    book.update(1 / 60);
    await frames(1);
  }
  book.spread = 0;
  book.open = savedOpen;
  book.blend = savedOpen ? 1 : 0;
  book.update(1 / 60);

  // --- observation overlays, dust, aperture beams ------------------------
  await report("warming the sight", 2);
  observation.blend = 1;
  observation._drawFrame();
  observation.threads.end(1 / 60);
  observation.motes.begin();
  observation.motes.add(player.position.x, player.position.y + 1, player.position.z, 2, 1);
  observation.motes.end(1 / 60);
  observation.blend = 0;
  await frames(1);

  dust.disturb(player.position, 1, 3);
  dust.update(1 / 60);
  await frames(1);

  // --- mechanisms: move every axis a little so their meshes are drawn ----
  for (const p of ctx.temple.puzzles) {
    if (p.circle) { p.circle.axis.push(4); p.circle.update(1 / 60); }
    if (p.drumAxis) { p.drumAxis.push(4); p.drumAxis.update(1 / 60); }
    if (p.warm) p.warm();
  }
  await frames(2);

  // --- shadow maps for both lights, with everything present --------------
  await report("warming the shadows", 2);
  await frames(3);

  // Restore.
  cam.yaw = savedYaw; cam.pitch = savedPitch;
  magic.selected = savedSpell;
  Object.assign(magic.unlocked, savedUnlocked);
  magic.clearLinks();

  // A last pass with everything back to its resting state.
  await frames(2);
  void engine;
}
