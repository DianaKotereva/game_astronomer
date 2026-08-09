/**
 * Temple assembly.
 *
 * Chambers write into a small set of shared accumulators — one per material —
 * which are then merged into a handful of frozen meshes. Static architecture
 * therefore costs a few draw calls no matter how many blocks it contains, and
 * only genuinely moving parts (rings, mirrors, doors, counterweights) exist as
 * separate transformable meshes.
 */
import { Accum } from "./geo.js";
import { MaterialLib } from "../materials/materials.js";
import { buildHallOfMeridian } from "./chambers/hallOfMeridian.js";
import { HallOfMeridianPuzzle } from "../puzzles/hallOfMeridian.js";
import { Color3 } from "../core/bjs.js";

export class Temple {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {(label:string, weight?:number)=>Promise<void>} report
   */
  constructor(scene, report) {
    this.scene = scene;
    this.report = report || (async () => {});
    this.mats = new MaterialLib(scene);
    /** @type {import("../core/bjs.js").Mesh[]} */
    this.meshes = [];
    /** @type {import("../core/bjs.js").Mesh[]} */
    this.shadowCasters = [];
    /** @type {import("../core/bjs.js").Mesh|null} */
    this.colliderMesh = null;
    /** Objects other systems need to find again. */
    this.registry = new Map();
    /** Moving meshes that must also cast shadows. */
    this.dynamicCasters = [];
    /** @type {Array<any>} */
    this.puzzles = [];
  }

  async build(ctx) {
    const scene = this.scene;

    await this.report("quarrying pale limestone", 3);
    const stone = new Accum("temple_stone");
    stone.uvScale = 0.30;
    const dark = new Accum("temple_dark");
    dark.uvScale = 0.42;
    const bronze = new Accum("temple_bronze");
    bronze.uvScale = 0.9;
    const plaster = new Accum("temple_plaster");
    plaster.uvScale = 0.42;
    const collider = new Accum("temple_collider");

    const bctx = { scene, mats: this.mats, stone, dark, bronze, plaster, collider };
    this.accums = bctx;

    await this.report("raising the Hall of Meridian", 3);
    this.hall = buildHallOfMeridian(bctx);

    // Puzzles contribute their own geometry into the same accumulators, so the
    // instruments are cut from the same stone as the room around them.
    await this.report("setting the instruments", 3);
    if (ctx) {
      ctx.mats = this.mats;
      const meridian = new HallOfMeridianPuzzle(ctx);
      meridian.build(bctx);
      this.puzzles.push(meridian);
      this.dynamicCasters.push(
        meridian.circle.fixedMesh, meridian.circle.armMesh,
        meridian.drumMesh, meridian.shutterMesh, meridian.weightMesh);
    }

    await this.report("dressing the stone", 4);
    const matStone = this.mats.stone("limestone", { seed: 11, size: 512, parallax: false, detailScale: 13 });
    const matDark = this.mats.stone("blackstone", { seed: 31, size: 512, detailScale: 16 });
    const matBronze = this.mats.bronze({ seed: 71, size: 1024, polish: 0.45 });
    const matPlaster = this.mats.plaster({ seed: 103, size: 512, pigment: [0.10, 0.16, 0.34] });

    await this.report("setting the courses", 3);
    const push = (accum, mat, opts) => {
      const m = accum.toMesh(scene, mat, opts);
      if (m) { this.meshes.push(m); this.shadowCasters.push(m); }
      return m;
    };
    this.stoneMesh = push(stone, matStone, { collide: false });
    this.darkMesh = push(dark, matDark, { collide: false });
    this.bronzeMesh = push(bronze, matBronze, { collide: false });
    this.plasterMesh = push(plaster, matPlaster, { collide: false });

    // The collision hull is invisible and coarse. Colliding against a million
    // bevelled blocks would be pointless: the player cannot feel a 20 mm chamfer.
    const col = collider.toMesh(scene, null, { collide: true, freeze: true, receiveShadows: false });
    if (col) {
      col.isVisible = false;
      col.name = "collision_hull";
      col.material = null;
      this.colliderMesh = col;
    }

    return this;
  }

  /** Freeze everything static. Call once the world is finished. */
  freezeStatic() {
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i];
      m.freezeWorldMatrix();
      if (m.material && m.material.freeze) m.material.freeze();
    }
  }

  stats() {
    let tris = 0, verts = 0;
    for (const m of this.meshes) {
      tris += m.getTotalIndices() / 3;
      verts += m.getTotalVertices();
    }
    return { meshes: this.meshes.length, tris, verts };
  }
}

export { Color3 };
