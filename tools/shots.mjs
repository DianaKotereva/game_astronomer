/**
 * The gallery: ten framings of the vertical slice, captured in one boot.
 *
 *   node tools/capture.mjs gallery --script tools/shots.mjs --w 1280 --h 720
 *
 * Each entry is JavaScript evaluated in the page between frames. Two posing
 * modes, both going through the game's own rig rather than around it:
 *
 *   fly — the free-fly camera (F2 in play). Position is set directly and the
 *         look direction comes from yaw/pitch, exactly as _updateFreeFly reads
 *         them. Used where the subject is the architecture.
 *   3rd — the spring arm, with the character teleported into place and the rig
 *         snapped so nothing swings in. Used where the subject is the astronomer.
 *
 * Yaw follows the game's convention: forward is (sin yaw, 0, cos yaw), so yaw 0
 * looks north up the hall and positive pitch looks up.
 */

/**
 * Runs once after boot. Puts the moon on the meridian — the hall is an
 * instrument built for exactly one moment, and photographing it 45 minutes
 * early would be photographing the wrong room.
 */
export const setup = `
  (() => {
    const g = window.__game;
    g.time.jd = g.celestial.toJD(2027, 10, 14, 20, 54, 0);
    g.toggles.freezeTime = true;

    window.__pose = (o) => {
      const cam = g.cam;
      if (o.player) g.player.teleport(o.player[0], o.player[1], o.player[2], o.facing || 0);
      if (o.fly) {
        cam.freeFly = true;
        cam.camera.position.set(o.fly[0], o.fly[1], o.fly[2]);
      } else {
        cam.freeFly = false;
        if (o.dist !== undefined) cam.distance = o.dist;
      }
      if (o.yaw !== undefined) cam.yaw = o.yaw;
      if (o.pitch !== undefined) cam.pitch = o.pitch;
      if (!o.fly) { cam.target.copyFrom(g.player.position); cam.snap(); }
    };

    // Modal and held-button state, cleared between framings so a spell or an
    // open Book never leaks into the next shot.
    window.__clear = () => {
      g.input.rmb = false;
      g.input.lmb = false;
      g.magic.select(0);
      if (g.book.open) g.book.toggle();
    };
  })();
`;

export default [
  {
    // The hall entire, from the south door: 32 metres of it, the vault closing
    // 24 metres up, the meridian circle standing at the far end.
    name: "01_hall_of_meridian",
    js: `window.__clear(); window.__pose({ fly: [0, 5.6, -14.2], yaw: 0, pitch: 0.09 });`,
    settle: 3500,
  },
  {
    // What the room is for: the shaft through the slit, and the bronze line it
    // lands on. The stripe sits at z = -4.09 when the moon transits.
    name: "02_the_shaft_of_moonlight",
    js: `window.__pose({ fly: [5.5, 2.4, -8.5], yaw: -0.896, pitch: -0.196 });`,
    settle: 3000,
  },
  {
    // Straight up the meridian slit — the cut that makes the hall an instrument.
    name: "03_the_meridian_slit",
    js: `window.__pose({ fly: [0, 1.7, -4.1], yaw: 0, pitch: 1.27 });`,
    settle: 3000,
  },
  {
    // The great circle at the north end, three metres of graduated bronze.
    name: "04_the_meridian_circle",
    js: `window.__pose({ fly: [3.4, 5.0, 7.6], yaw: -0.616, pitch: -0.110 });`,
    settle: 3000,
  },
  {
    // The drum of hours: turn it and the night turns with it.
    name: "05_the_drum_of_hours",
    js: `window.__pose({ fly: [4.2, 2.05, -9.9], yaw: -0.785, pitch: -0.300 });`,
    settle: 3000,
  },
  {
    // The astronomer herself, lantern lit, standing on the scale.
    name: "06_the_astronomer",
    js: `window.__pose({ player: [0.9, 0.05, -5.4], facing: 0.30, yaw: 3.44, pitch: 0.03, dist: 2.7 });`,
    settle: 4000,
  },
  {
    // The Book of Stars, open. Charts drawn from the same catalogue the sky is.
    name: "07_the_book_of_stars",
    js: `window.__pose({ player: [1.2, 0.05, -6.6], facing: 0.10, yaw: 3.24, pitch: 0.22, dist: 2.1 });
         if (!window.__game.book.open) window.__game.book.toggle();`,
    settle: 5000,
  },
  {
    // Observation Mode: the sky named and measured, held on right mouse.
    name: "08_observation_mode",
    js: `window.__game.book.open && window.__game.book.toggle();
         window.__pose({ player: [0.6, 0.05, -6.0], facing: 0.0, yaw: 0, pitch: 0.82, dist: 2.2 });
         window.__game.input.rmb = true;`,
    settle: 5000,
  },
  {
    // Constellation Thread, mid-cast: star magic drawing figure from real stars.
    name: "09_constellation_thread",
    js: `window.__game.input.rmb = false;
         window.__pose({ player: [1.4, 0.05, -7.2], facing: 0.25, yaw: 3.39, pitch: 0.28, dist: 3.2 });
         window.__game.magic.select(2);
         window.__game.input.lmb = true;`,
    settle: 5000,
  },
  {
    // The second chamber: the orrery in its well, under the oculus.
    name: "10_chamber_of_wandering_stars",
    js: `window.__clear(); window.__pose({ fly: [0, 7.5, 26.5], yaw: 0, pitch: -0.297 });`,
    settle: 4000,
  },
];
