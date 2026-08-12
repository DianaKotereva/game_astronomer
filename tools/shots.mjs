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
    // Where the game now starts: the foot of the stair, the facade, and the
    // slot running the whole height of it.
    name: "01_the_approach",
    js: `window.__clear(); window.__pose({ player: [0, -6.35, -47], facing: 0, fly: [0, -3.0, -55], yaw: 0, pitch: 0.10 });`,
    settle: 4000,
  },
  {
    name: "02_hall_of_meridian",
    js: `window.__pose({ player: [1.6, 0.05, -10.4], facing: 0, fly: [0, 5.6, -14.2], yaw: 0, pitch: 0.09 });`,
    settle: 3500,
  },
  {
    // The shaft through the slit, and the bronze line it lands on.
    name: "03_the_shaft_of_moonlight",
    js: `window.__pose({ player: [1.6, 0.05, -7.0], facing: 0, fly: [5.5, 2.4, -8.5], yaw: -0.896, pitch: -0.196 });`,
    settle: 3000,
  },
  {
    name: "04_the_meridian_circle",
    js: `window.__pose({ player: [1.2, 0.05, 8.5], facing: 0, fly: [3.4, 5.0, 7.6], yaw: -0.616, pitch: -0.110 });`,
    settle: 3000,
  },
  {
    // The astronomer, lantern lit, standing on the floor scale.
    name: "05_the_astronomer",
    js: `window.__pose({ player: [0.9, 0.05, -5.4], facing: 0.30, yaw: 3.44, pitch: 0.03, dist: 2.7 });`,
    settle: 4000,
  },
  {
    name: "06_chamber_of_wandering_stars",
    js: `window.__pose({ player: [0, 0.05, 27.5], facing: 0, fly: [0, 7.5, 26.5], yaw: 0, pitch: -0.297 });`,
    settle: 4000,
  },
  {
    // The reading hall: low, warm, and built for people.
    name: "07_archive_of_the_sky",
    js: `window.__pose({ player: [-29, 0.05, 31.5], facing: 0, fly: [-29, 2.6, 30.5], yaw: 0, pitch: 0.05 });`,
    settle: 4000,
  },
  {
    // The Gate inlaid full size, with a mirror standing on each of its stars.
    name: "08_court_of_reflections",
    js: `window.__pose({ player: [26, 0.05, 38], facing: 1.57, fly: [34, 9.5, 26.0], yaw: 0, pitch: -0.669 });`,
    settle: 4000,
  },
  {
    // The fixed axis under the shuttered dome.
    name: "09_final_observatory",
    js: `window.__pose({ player: [0, 0.05, 60], facing: 0, fly: [0, 6.0, 60], yaw: 0, pitch: -0.239 });`,
    settle: 4500,
  },
  {
    // The Book of Stars, open.
    name: "10_the_book_of_stars",
    js: `window.__pose({ player: [1.2, 0.05, -6.6], facing: 0.10, yaw: 3.24, pitch: 0.22, dist: 2.1 });
         if (!window.__game.book.open) window.__game.book.toggle();`,
    settle: 5000,
  },
];
