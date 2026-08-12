/**
 * Puzzle 3 — The Archive of the Sky.
 *
 * The evidence-dominant puzzle (§31). There is no mechanism in this room and
 * nothing to configure: the entire problem is reading something that will not
 * be read by the light you are carrying.
 *
 * The temple has already taught this. The Hall of Meridian says it in as many
 * words — "cut a finger deep and no more; meant to be read by a light held to
 * one side, not by a lamp set before it". The lantern hangs at the reader's own
 * hand, so its light arrives along the line of sight and flattens every relief
 * it touches. Stellar Light does not: it arrives from wherever the star actually
 * is, which is almost never where the reader is standing, and it rakes.
 *
 * The dispute is on the stand in plain view, and the player will find it. The
 * second leaf is the interesting one. It is filed in one of nine shelf bays, and
 * nothing in the room says which — until Astral Recall shows a scholar carrying
 * something from the stand to the shelves on the last night the room was used.
 * Recall does not open the bay and does not name the fragment. It shows a route.
 * The player still has to walk it and still has to bring the right light.
 *
 * That is deliberate, and it is the rule the whole game runs on: magic supplies
 * evidence and reach, never the conclusion (§29, §31).
 *
 * Full write-up in PUZZLES.md.
 */
import { Vector3 } from "../core/bjs.js";
import { addBlock } from "../world/geo.js";
import { ARCHIVE } from "../world/chambers/archiveOfTheSky.js";
import { makeRng, TAU } from "../core/scratch.js";

export class ArchiveOfTheSkyPuzzle {
  /** @param {Object} ctx */
  constructor(ctx) {
    this.name = "puzzle_archive";
    this.order = 382;
    this.ctx = ctx;
    this.scene = ctx.scene;

    this._disputeRead = false;
    this._leafFound = false;
    this._recallSeen = false;
    this._t = 0;
  }

  /** Geometry, written into the shared accumulators during world build. */
  build(accums) {
    const rng = makeRng(7717);
    const { stone, dark, bronze } = accums;
    const A = ARCHIVE;

    // The reading stand sits in the west niche opposite the door.
    const sx = A.x0 + 1.5, sz = A.doorZ;
    this.standPos = new Vector3(sx + 0.15, 1.06, sz);

    /* --- the two tablets, in two hands ------------------------------- */
    // They are not a matched pair. One is older, thicker, and cut in a
    // generous hand; the other is a thin later slip wedged beside it, and
    // whoever cut that one pressed hard enough to split the corner.
    addBlock(stone, sx + 0.05, 1.08, sz - 0.34, 0.30, 0.035, 0.26,
      { bevel: 0.012, uvScale: 0.9, settle: [0.05, 0.05, -0.02, -0.02] });
    addBlock(dark, sx + 0.06, 1.10, sz + 0.30, 0.26, 0.022, 0.21,
      { bevel: 0.010, uvScale: 1.1, yaw: 0.07, settle: [0.04, 0.04, -0.02, -0.02] });
    // The split corner.
    addBlock(dark, sx + 0.20, 1.09, sz + 0.48, 0.07, 0.018, 0.06,
      { bevel: 0.008, uvScale: 1.4, yaw: 0.6 });

    /* --- the bay the leaf was filed in -------------------------------- */
    // Chosen as the furthest bay from the door on the west wall: the one you
    // would walk to if you wanted something out of the way. Its shelf mark is
    // bronze like all the others, but set on edge rather than flat — the only
    // physical tell in the room, and far too subtle to find without the Recall.
    const bz = A.z0 + 3.4 + 4 * 3.6;
    this.leafPos = new Vector3(A.x0 + 0.62, 2.06, bz);
    addBlock(bronze, A.x0 + 0.56, 2.06, bz, 0.012, 0.075, 0.055,
      { bevel: 0.004, uvScale: 2.6 });
    // The leaf itself, edge-on among the cases so it reads as filed, not shelved.
    addBlock(stone, A.x0 + 0.60, 2.14, bz + 0.02, 0.10, 0.115, 0.014,
      { bevel: 0.006, uvScale: 1.3 });

    /* --- the unfinished calculation ----------------------------------- */
    // A working left mid-column on the north wall. The ruled guide lines are
    // geometry; the arithmetic is carried by the plaster material.
    for (let i = 0; i < 9; i++) {
      addBlock(dark, A.x0 + 3.2 + i * 0.02, 2.2 + i * 0.0, A.z1 - 0.66,
        0.004, 1.5 - i * 0.12, 0.006, { bevel: 0, uvScale: 2.0 });
    }
    this.wallPos = new Vector3(A.x0 + 4.2, 2.4, A.z1 - 1.4);
    this.armillaryPos = new Vector3(A.x0 + 3.0, 1.3, A.z0 + 3.4);
    void rng; void TAU;
  }

  /** Wire into interaction, magic and observation. */
  install() {
    const ctx = this.ctx;
    const { interaction, magic, observation, hud, book } = ctx;

    /* --- the stand ---------------------------------------------------- */
    interaction.add({
      id: "archiveStand",
      position: this.standPos.clone(),
      radius: 2.4,
      verb: "Read the tablets",
      sub: "two hands, and they do not agree",
      onInteract: () => {
        if (this._disputeRead) {
          hud.journal("“It has not moved. WE have moved.” The later hand pressed hard enough to split the corner.", 9);
        } else {
          hud.journal("Two tablets, set side by side by someone who wanted them compared. Both are cut shallow, and the lantern lies flat across them.", 9);
        }
      },
    });

    magic.addResonant({
      id: "archiveDisputeLit",
      position: this.standPos.clone(),
      radius: 1.6,
      quality: () => 0,
      onLit: (ramp) => {
        if (ramp > 0.5 && !this._disputeRead) this._readDispute();
      },
    });

    /* --- the filed leaf ------------------------------------------------ */
    interaction.add({
      id: "archiveBay",
      position: this.leafPos.clone(),
      radius: 2.0,
      verb: "Search the bay",
      sub: "one mark is set on edge",
      onInteract: () => {
        if (this._leafFound) {
          hud.journal("The leaf is in the Book now, where whoever hid it here presumably meant it never to go.", 8);
        } else if (this._recallSeen) {
          hud.journal("A single leaf, filed edge-on between the cases so it would not be seen from the aisle. It is cut as shallow as the rest.", 9);
        } else {
          hud.journal("Cases, and dust, and one bronze mark set on edge instead of flat.", 7);
        }
      },
    });

    magic.addResonant({
      id: "archiveLeafLit",
      position: this.leafPos.clone(),
      radius: 1.1,
      quality: () => 0,
      onLit: (ramp) => {
        if (ramp > 0.5 && !this._leafFound) this._readLeaf();
      },
    });

    /* --- storytelling ---------------------------------------------------- */
    interaction.add({
      id: "archiveWall",
      position: this.wallPos.clone(),
      radius: 3.0,
      verb: "Read the working",
      sub: "column after column, struck through",
      onInteract: () => {
        const lines = [
          "Columns of arithmetic, three centuries deep. Someone has struck through an entire year of it and written the same figure again, larger.",
          "The last column stops in the middle of a subtraction. Nobody came back to finish it.",
          "A margin, in a different hand: “check this against the founders' measure. It will not agree. Check it anyway.”",
        ];
        hud.journal(lines[(this._wallRead = ((this._wallRead || 0) + 1)) % lines.length], 9);
      },
    });

    interaction.add({
      id: "archiveArmillary",
      position: this.armillaryPos.clone(),
      radius: 2.6,
      verb: "Examine the armillary",
      sub: "half dismantled",
      onInteract: () => {
        hud.journal("Two rings are off and stacked against the wall, the way you stack them when you mean to finish in the morning. The tools are still laid out.", 10);
      },
    });

    /* --- residues: what Astral Recall has to show --------------------- */
    observation.addResidue(this.standPos.clone(), 0.9,
      "Two people stood at this stand, on the same night, and did not agree.", "trace");

    // The route: stand → aisle → the bay. Recall shows a carried thing, not a
    // label, and the player has to notice where it stops.
    const A = ARCHIVE;
    const mid = new Vector3(A.x0 + 1.6, 1.0, (this.standPos.z + this.leafPos.z) * 0.5);
    observation.addResidue(mid, 0.85,
      "Someone carried a leaf from the stand to the shelves, once, and did not carry it back.", "sightline");
    const sight = observation.residues[observation.residues.length - 1];
    sight.dir = new Vector3(0, 0, 1);
    sight.length = Math.abs(this.leafPos.z - this.standPos.z) * 0.5 + 1.2;

    observation.addResidue(this.leafPos.clone(), 0.8,
      "A hand reached to this bay in the dark, and knew exactly which one it wanted.", "trace");

    // Arriving in the room is a proximity beat, not an E prompt; the
    // interaction list only scores things the player is looking at.
    this.enterPos = new Vector3(A.x1 + 2.0, 1.0, A.doorZ);
    void interaction;
  }

  _readDispute() {
    this._disputeRead = true;
    const { hud, book } = this.ctx;
    book.unlockFragment("archive.dispute");
    hud.journal("The raking light finds it at once. Two hands, a generation apart, arguing about whether the pole star has moved.", 11);
  }

  _readLeaf() {
    this._leafFound = true;
    const { hud, book } = this.ctx;
    // The Book plays the recovery sting itself when a fragment lands.
    book.unlockFragment("archive.precession");
    hud.banner("The slow turning", "Archive of the Sky", 7);
    hud.journal("The second hand was right. The whole frame turns, a full circuit in twenty-six thousand years — and every alignment cut into this temple was cut for a sky that has since moved out from under it.", 14);
  }

  update(dt) {
    this._t += dt;

    if (!this._entered && this.enterPos) {
      if (Vector3.Distance(this.ctx.player.position, this.enterPos) < 4.0) {
        this._entered = true;
        this.ctx.hud.banner("The Archive of the Sky", "the west wing", 5);
        this.ctx.hud.journal("Lower than the rest of the house, and warmer. This room was built for people.", 9);
      }
    }

    // Recall's residues are the only hint toward the bay, so note when the
    // player has actually seen them: the bay's own prompt changes afterwards,
    // which is the difference between "there is a mark here" and "this is the
    // one". The bay is lightable either way — Recall is evidence, not a gate.
    const magic = this.ctx.magic;
    if (!this._recallSeen && magic && magic._recallTimer > 0) {
      const d = Vector3.Distance(this.ctx.player.position, this.leafPos);
      if (d < 22) this._recallSeen = true;
    }
  }
}
