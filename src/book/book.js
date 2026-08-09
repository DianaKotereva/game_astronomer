/**
 * The Book of Stars.
 *
 * Catalogue, grimoire, observing journal and family archive in one volume,
 * written by many hands over generations and now missing most of its later
 * pages. It is the game's only progression system: fragments recovered in the
 * temple fill holes in it, and what is written on the recovered piece changes
 * what the protagonist can do — not by granting a spell, but by explaining
 * something she can then apply (§21).
 *
 * It is a physical object. A real mesh with real covers and real pages, lit by
 * the lantern she is holding, turned page by page. Nothing about it is a menu.
 */
import {
  Mesh, VertexData, TransformNode, Vector3, Quaternion, DynamicTexture,
  PBRMaterial, Color3, Texture,
} from "../core/bjs.js";
import { addBlock, Accum } from "../world/geo.js";
import { BRIGHT_STARS } from "../astronomy/catalog.js";
import { MODERN, TEMPLE, findFigure } from "../astronomy/constellations.js";
import { heading, scribe, penLine, penCircle, starChart, numeral, angleGlyph, damage, INK, INK_FADED, INK_RED } from "./pageArt.js";
import { makeRng, clamp, clamp01, damp, lerp, TAU, DEG } from "../core/scratch.js";
import { parchmentCanvas } from "../materials/textureLab.js";

const PAGE_PX = 1024;

/**
 * Fragment definitions. Each recovered piece names what it teaches; the effect
 * is applied in `unlockFragment`.
 */
export const FRAGMENTS = {
  "meridian.inscription": {
    section: "Temple", title: "The house of the crossing",
    body: "Cut above the west bench, in the old shallow hand: set the arm to the crossing, and the house will answer. The cutting is a finger deep and no more — it was meant to be read by a light held to one side, not by a lamp set before it.",
  },
  "meridian.solved": {
    section: "Instruments", title: "The meridian circle",
    body: "A ring standing in the plane of the crossing, graduated from the north horizon to the zenith. The arm carries two vanes and a counterweight. Set it to the altitude of a body at its crossing and the ring will hold that altitude for the night. Ours reads within a third of a degree, which the makers thought poor.",
    figure: "UMi",
  },
  "orrery.calibration": {
    section: "Instruments", title: "On the wandering stars",
    body: "The great engine in the second court is not a model of the heavens. It is a calculator: the rings are set to the wanderers, and the arm beneath reads what the sky will be. It has stood wrong since the year of the closing — someone moved the third ring and did not move it back.",
    spell: 4,
  },
  "thread.first": {
    section: "Arcana", title: "Of edges",
    body: "A figure in the sky is not a picture. It is a set of relations between fixed points, and a relation may be held in the hand as well as in the eye. Where the stone carries an anchor, an edge of a figure may be drawn between two anchors that belong to the same figure — and to no others. The thread is not a rope. It is the relation itself, made visible.",
    spell: 2,
  },
  "light.source": {
    section: "Arcana", title: "Of gathered light",
    body: "Light from a star is not weak. It is only thin, having crossed so far. Gather it as one gathers rain: with a wide mouth and a narrow throat. Sight the star first — the focus must know which light it is asking for — and the beam will carry that star's colour and that star's virtue, and no other's.",
    refinesLight: true,
  },
  "light.collimated": {
    section: "Arcana", title: "Of the third ring",
    body: "With the rings closed into a tube the gathered light leaves straight, and straight light may be given to an instrument as one gives water to a channel. A mirror will take it. A lens will take it. A dead mechanism will take it and wake.",
    collimates: true,
  },
  "recall.first": {
    section: "Arcana", title: "Of what remains",
    body: "An operation performed often enough leaves a residue upon the place, as a rope leaves a groove in a stone lip. The residue is not a record and it is not a ghost. It is a tendency. Ask the place what it is accustomed to doing, and it will show you fragments — never the whole, and never the reason.",
    spell: 5,
  },
  "archive.dispute": {
    section: "Recovered Texts", title: "A dispute, in two hands",
    body: "First hand: the Nail stands at eleven parts in the sixtieth of the circle from the true point, and has moved since my grandfather's measure. Second hand, smaller, later, angrier: it has not moved. WE have moved. The whole frame turns, and slowly, and we are the last to know it.",
    templeFigures: true,
  },
  "archive.precession": {
    section: "Sky", title: "The slow turning",
    body: "Measure the Nail against the crossing each year of your life and you will find it will not stay. The frame of the heavens turns upon another pole, a full circuit in some twenty-six thousand years. The star our founders nailed the roof to is not the star above the roof now. Every alignment in this house was cut for a sky that has since moved out from under it.",
    figure: "Dra",
  },
  "reflection.geometry": {
    section: "Instruments", title: "On the court of mirrors",
    body: "The mirrors are not set to catch a beam. They are set to hold an angle: each pair stands at the separation of two stars of the figure, so that light entering along one edge leaves along the next. Measure the sky first. Then set the metal.",
  },
  "observatory.final": {
    section: "Recovered Texts", title: "The last night",
    body: "We opened the dome for the ninth observation and it was there again, where nothing should be. Not a wanderer; it keeps no road. Not a fixed star; it has moved four parts in the sixtieth since spring. We have measured it eleven times and it is the same eleven times. Tomorrow we will show the others, and then I think we will close the house, because the model we have taught for three hundred years cannot hold this and we cannot teach what we do not have.",
    spell: 6,
  },
};

export class Book {
  /**
   * @param {import("../core/bjs.js").Scene} scene
   * @param {Object} ctx
   */
  constructor(scene, ctx) {
    this.name = "book";
    this.order = 330;
    this.scene = scene;
    this.ctx = ctx;

    /** @type {Set<string>} */
    this.fragments = new Set();
    /** @type {Set<string>} */
    this.knownFigures = new Set(["UMa", "Ori", "Cas", "Lyr", "Cyg", "Aql", "Boo", "Tau"]);
    this.templeFiguresKnown = false;
    /** Free-form measurements the player has taken. */
    this.records = new Map();

    this.open = false;
    this.blend = 0;
    this.spread = 0;          // which spread is showing
    this.spreads = [];
    this._dirty = true;
    this._turn = 0;
    this._turnDir = 0;

    this._buildMesh();
    this.rebuild();
  }

  /* ------------------------------------------------------------------ */
  /* Knowledge                                                           */
  /* ------------------------------------------------------------------ */

  has(id) { return this.fragments.has(id); }

  /** Recover a fragment. This is the only way anything is ever unlocked. */
  unlockFragment(id) {
    if (this.fragments.has(id)) return false;
    const f = FRAGMENTS[id];
    if (!f) return false;
    this.fragments.add(id);
    this._dirty = true;

    if (f.spell && this.ctx.magic) this.ctx.magic.unlock(f.spell);
    if (f.refinesLight && this.ctx.magic) this.ctx.magic.lightRefined = true;
    if (f.collimates && this.ctx.magic) this.ctx.magic.lightCollimated = true;
    if (f.figure) this.knownFigures.add(f.figure);
    if (f.templeFigures) this.templeFiguresKnown = true;

    if (this.ctx.hud) {
      this.ctx.hud.journal(`A page for the Book — ${f.title}.`, 7);
    }
    if (this.ctx.audio) this.ctx.audio.fragment();
    if (this.ctx.save) this.ctx.save.write();
    return true;
  }

  learnFigure(key) { this.knownFigures.add(key); this._dirty = true; }

  record(key, value) { this.records.set(key, value); this._dirty = true; }

  /* ------------------------------------------------------------------ */
  /* The object                                                          */
  /* ------------------------------------------------------------------ */

  _buildMesh() {
    const scene = this.scene, mats = this.ctx.mats;
    this.root = new TransformNode("book", scene);
    this.root.rotationQuaternion = Quaternion.Identity();
    this.root.setEnabled(false);

    const W = 0.24, H = 0.32, T = 0.026;

    // Covers: boards in dark wood with a worn leather spine.
    const boards = new Accum("bookBoards");
    boards.uvScale = 3.2;
    addBlock(boards, -W * 0.5 - 0.004, 0, 0, W * 0.5, T * 0.5, H * 0.5, { bevel: 0.004, uvScale: 3.2 });
    addBlock(boards, W * 0.5 + 0.004, 0, 0, W * 0.5, T * 0.5, H * 0.5, { bevel: 0.004, uvScale: 3.2 });
    addBlock(boards, 0, -0.004, 0, 0.012, T * 0.42, H * 0.5, { bevel: 0.004, uvScale: 3.2 });
    this.boardMesh = boards.toMesh(scene, mats.wood({ key: "_bookboard", seed: 97 }), { collide: false, freeze: false });
    this.boardMesh.parent = this.root;
    this.boardMesh.renderingGroupId = 1;

    // Pages: two quads, one per side of the spread.
    this.pageCanvas = [];
    this.pageTex = [];
    this.pageMesh = [];
    for (let i = 0; i < 2; i++) {
      const canvas = parchmentCanvas(PAGE_PX, 149 + i * 7);
      const tex = new DynamicTexture("bookPage" + i, canvas, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
      tex.hasAlpha = false;
      const mat = new PBRMaterial("bookPageMat" + i, scene);
      mat.albedoTexture = tex;
      mat.metallic = 0; mat.roughness = 0.92;
      mat.environmentIntensity = 0.5;
      mat.backFaceCulling = false;
      mat.twoSidedLighting = true;

      const mesh = new Mesh("bookPage" + i, scene);
      const vd = new VertexData();
      const sx = i === 0 ? -1 : 1;
      const x0 = i === 0 ? -W : 0.002, x1 = i === 0 ? -0.002 : W;
      vd.positions = new Float32Array([
        x0, T * 0.5 + 0.001, -H * 0.5, x1, T * 0.5 + 0.001, -H * 0.5,
        x1, T * 0.5 + 0.001, H * 0.5, x0, T * 0.5 + 0.001, H * 0.5,
      ]);
      vd.normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
      vd.uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
      vd.indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
      vd.applyToMesh(mesh, false);
      mesh.material = mat;
      mesh.parent = this.root;
      mesh.renderingGroupId = 1;
      mesh.isPickable = false;
      void sx;
      this.pageCanvas.push(canvas);
      this.pageTex.push(tex);
      this.pageMesh.push(mesh);
    }

    // The block of unread leaves, so the Book has thickness.
    const leaves = new Accum("bookLeaves");
    leaves.uvScale = 4;
    addBlock(leaves, -W * 0.5, T * 0.25, 0, W * 0.49, T * 0.22, H * 0.48, { bevel: 0.002, uvScale: 4 });
    addBlock(leaves, W * 0.5, T * 0.25, 0, W * 0.49, T * 0.22, H * 0.48, { bevel: 0.002, uvScale: 4 });
    this.leafMesh = leaves.toMesh(scene, mats.parchment({ key: "_leaves", size: 512, seed: 149 }), { collide: false, freeze: false });
    this.leafMesh.parent = this.root;
    this.leafMesh.renderingGroupId = 1;

    this.meshes = [this.boardMesh, this.leafMesh].concat(this.pageMesh);
  }

  /* ------------------------------------------------------------------ */
  /* Content                                                             */
  /* ------------------------------------------------------------------ */

  /** Rebuild the list of spreads from what is currently known. */
  rebuild() {
    const s = [];
    s.push({ kind: "title" });
    s.push({ kind: "sky" });
    s.push({ kind: "figures", set: MODERN, title: "Constellations" });
    if (this.templeFiguresKnown) s.push({ kind: "figures", set: TEMPLE, title: "Figures of the House" });
    s.push({ kind: "instruments" });
    const texts = Object.keys(FRAGMENTS).filter((k) => this.fragments.has(k));
    for (let i = 0; i < texts.length; i += 2) {
      s.push({ kind: "texts", ids: texts.slice(i, i + 2) });
    }
    s.push({ kind: "arcana" });
    this.spreads = s;
    this.spread = clamp(this.spread, 0, s.length - 1);
    this._dirty = true;
  }

  _render() {
    this._dirty = false;
    const spread = this.spreads[this.spread];
    for (let side = 0; side < 2; side++) {
      const g = this.pageCanvas[side].getContext("2d");
      // Redraw the parchment ground before every page: the ink is not permanent
      // in the canvas, but the paper is always the same paper.
      const fresh = parchmentCanvas(PAGE_PX, 149 + side * 7);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
      g.drawImage(fresh, 0, 0);
      g.strokeStyle = INK;
      g.fillStyle = INK;
      this._drawPage(g, spread, side);
      this.pageTex[side].update(false);
    }
  }

  _drawPage(g, spread, side) {
    const rng = makeRng(1000 + this.spread * 17 + side);
    const M = 96;                       // margin
    const W = PAGE_PX - M * 2;
    let y = 150;

    switch (spread.kind) {
      case "title":
        if (side === 0) {
          y = heading(g, "The Book of Stars", M, y, W, rng);
          y += 20;
          y = scribe(g, "Begun in the third year of the house, and continued by those who came after. Let no one add to it who has not measured.", M, y, W, { italic: true, size: 22 });
          y += 40;
          starChart(g, PAGE_PX * 0.5, y + 250, 250, {
            stars: BRIGHT_STARS, ra0: 270, dec0: 60, radiusDeg: 62, seed: 5,
            lines: this._figureLines(["UMa", "UMi", "Dra", "Cas"]),
            label: new Set(["Polaris", "Dubhe", "Vega", "Deneb"]),
          });
        } else {
          y = heading(g, "Of this copy", M, y, W, rng);
          y = scribe(g, "Six hands are in this book. The first is careful and wrong about the pole. The fourth writes only numbers. The last stops in the middle of a page.", M, y, W, { size: 21 });
          y += 26;
          y = scribe(g, `Recovered so far: ${this.fragments.size} of the missing leaves.`, M, y, W, { italic: true, color: INK_FADED });
          y += 30;
          // The index, with the lost entries struck through.
          const all = Object.keys(FRAGMENTS);
          g.font = "19px Georgia, serif";
          for (const id of all) {
            const f = FRAGMENTS[id];
            const have = this.fragments.has(id);
            g.fillStyle = have ? INK : "rgba(60,46,30,0.34)";
            g.fillText(have ? f.title : "— — — — — —", M + 12, y);
            g.fillStyle = INK_FADED;
            g.font = "italic 16px Georgia, serif";
            g.fillText(f.section, M + 470, y);
            g.font = "19px Georgia, serif";
            if (!have) {
              g.strokeStyle = "rgba(60,46,30,0.22)";
              penLine(g, M + 12, y - 6, M + 300, y - 6, 1, rng, 0.4);
            }
            y += 32;
          }
        }
        break;

      case "sky": {
        if (side === 0) {
          y = heading(g, "The Sky", M, y, W, rng);
          y = scribe(g, "The heavens turn upon one point, and everything else keeps its distance from everything else. Learn the distances and you need never learn the pictures.", M, y, W, {});
          y += 20;
          const sky = this.ctx.sky;
          if (sky) {
            g.fillStyle = INK;
            g.font = "20px Georgia, serif";
            g.fillText("Observer", M, y); y += 30;
            g.font = "18px Georgia, serif";
            g.fillText("latitude", M + 18, y);
            angleGlyph(g, 34.05, M + 200, y - 6, 15);
            y += 34;
            g.fillText("the pole stands at this height, always", M + 18, y);
            y += 44;
            const rec = this.records.get("meridian.reading");
            if (rec !== undefined) {
              g.fillText("moon, at its crossing", M + 18, y);
              angleGlyph(g, rec, M + 300, y - 6, 15);
              y += 34;
            }
          }
        } else {
          y = heading(g, "The Turning Frame", M, y, W, rng);
          if (this.fragments.has("archive.precession")) {
            y = scribe(g, FRAGMENTS["archive.precession"].body, M, y, W, {});
            y += 16;
            // Two charts of the same region, an age apart. The point of the page.
            starChart(g, M + 210, y + 190, 180, {
              stars: BRIGHT_STARS, ra0: 270, dec0: 66, radiusDeg: 46, seed: 11,
              lines: this._figureLines(["UMi", "Dra"]), label: new Set(["Polaris"]),
            });
            starChart(g, PAGE_PX - M - 210, y + 190, 180, {
              stars: this._precessedStars(4800), ra0: 270, dec0: 66, radiusDeg: 46, seed: 12,
              lines: this._figureLines(["UMi", "Dra"]), label: new Set(["Thuban"]),
            });
            g.fillStyle = INK_FADED;
            g.font = "italic 17px Georgia, serif";
            g.fillText("now", M + 186, y + 400);
            g.fillText("when the house was cut", PAGE_PX - M - 300, y + 400);
          } else {
            y = scribe(g, "This leaf is torn away below the third line. What remains reads: the Nail stands at eleven parts in the sixtieth from the true point, and has moved since my", M, y, W, {});
            damage(g, M, y - 40, W, 620, 0.9, 4);
          }
        }
        break;
      }

      case "figures": {
        const set = spread.set;
        const known = set.filter((f) => set === TEMPLE || this.knownFigures.has(f.key));
        const half = Math.ceil(known.length / 2);
        const mine = side === 0 ? known.slice(0, half) : known.slice(half);
        y = heading(g, side === 0 ? spread.title : "continued", M, y, W, rng);
        const cols = 2, cellW = W / cols, cellH = 236;
        for (let i = 0; i < mine.length && i < 6; i++) {
          const fig = mine[i];
          const cx = M + (i % cols) * cellW + cellW * 0.5;
          const cy = y + Math.floor(i / cols) * cellH + cellH * 0.42;
          const centre = this._figureCentre(fig);
          starChart(g, cx, cy, Math.min(cellW, cellH) * 0.40, {
            stars: BRIGHT_STARS, ra0: centre[0], dec0: centre[1], radiusDeg: centre[2],
            lines: fig.lines, seed: 30 + i, limit: 4.0,
            lineColor: set === TEMPLE ? INK_RED : INK_FADED,
          });
          g.fillStyle = INK;
          g.font = "italic 19px Georgia, serif";
          const w = g.measureText(fig.name).width;
          g.fillText(fig.name, cx - w * 0.5, cy + Math.min(cellW, cellH) * 0.40 + 30);
          if (fig.note) {
            g.fillStyle = INK_FADED;
            g.font = "italic 15px Georgia, serif";
            const w2 = g.measureText(fig.note).width;
            g.fillText(fig.note, cx - w2 * 0.5, cy + Math.min(cellW, cellH) * 0.40 + 52);
          }
        }
        break;
      }

      case "instruments":
        if (side === 0) {
          y = heading(g, "Instruments", M, y, W, rng);
          y = scribe(g, "Every instrument in the house answers one question and no other. Ask it the wrong question and it will still give you a number.", M, y, W, { italic: true });
          y += 30;
          this._drawMeridianDiagram(g, M, y, W, rng);
        } else {
          y = heading(g, "Their readings", M, y, W, rng);
          const ids = ["meridian.solved", "orrery.calibration", "reflection.geometry"];
          for (const id of ids) {
            const f = FRAGMENTS[id];
            g.fillStyle = this.fragments.has(id) ? INK : "rgba(60,46,30,0.3)";
            g.font = "21px Georgia, serif";
            g.fillText(f.title, M, y); y += 30;
            if (this.fragments.has(id)) {
              y = scribe(g, f.body, M + 16, y, W - 16, { size: 19 });
            } else {
              y = scribe(g, "…the leaf is missing…", M + 16, y, W - 16, { size: 19, italic: true, color: "rgba(60,46,30,0.3)" });
            }
            y += 22;
          }
        }
        break;

      case "texts": {
        const id = spread.ids[side];
        if (!id) break;
        const f = FRAGMENTS[id];
        y = heading(g, f.title, M, y, W, rng);
        y = scribe(g, f.body, M, y, W, { size: 21 });
        y += 26;
        g.fillStyle = INK_FADED;
        g.font = "italic 16px Georgia, serif";
        g.fillText(f.section, M, PAGE_PX - 110);
        // A recovered leaf is a different paper: it shows.
        damage(g, M - 30, 110, W + 60, PAGE_PX - 220, 0.35, 9 + side);
        break;
      }

      case "arcana":
        if (side === 0) {
          y = heading(g, "Arcana", M, y, W, rng);
          y = scribe(g, "The heavens have rules. That is the whole of it. What we do is not to command them but to stand in the right place at the right hour with the right thing in our hands.", M, y, W, { italic: true });
          y += 34;
          const spells = [
            [1, "Stellar Light", this.ctx.magic ? this.ctx.magic.unlocked[1] : false],
            [2, "Constellation Thread", this.ctx.magic ? this.ctx.magic.unlocked[2] : false],
            [3, "Celestial Resonance", this.ctx.magic ? this.ctx.magic.unlocked[3] : false],
            [4, "Gravity Lens", this.ctx.magic ? this.ctx.magic.unlocked[4] : false],
            [5, "Astral Recall", this.ctx.magic ? this.ctx.magic.unlocked[5] : false],
          ];
          for (const [n, name, have] of spells) {
            g.fillStyle = have ? INK : "rgba(60,46,30,0.30)";
            g.font = "22px Georgia, serif";
            numeral(g, n, M, y - 7, 15);
            g.fillText(name, M + 70, y);
            y += 38;
          }
        } else {
          y = heading(g, "Cautions", M, y, W, rng);
          y = scribe(g, "Do not ask the house to resonate with a thing you have not first set correctly. It will answer anyway, and badly, and the answer will be a lie you can hear.", M, y, W, {});
          y += 20;
          y = scribe(g, "Do not draw an edge between anchors of different figures. Nothing will happen, which is the mildest of the possible outcomes.", M, y, W, {});
          y += 20;
          if (this.fragments.has("observatory.final")) {
            y = scribe(g, "Do not open the dome for the ninth time.", M, y, W, { color: INK_RED, size: 23 });
          }
        }
        break;
    }
  }

  _figureLines(keys) {
    const out = [];
    for (const k of keys) {
      const f = findFigure(k, MODERN);
      if (f) for (const l of f.lines) out.push(l);
    }
    return out;
  }

  /** Centre and angular radius that frames a figure. */
  _figureCentre(fig) {
    let sx = 0, sy = 0, sz = 0, n = 0;
    const byName = new Map();
    for (const s of BRIGHT_STARS) byName.set(s.name, s);
    for (const seg of fig.lines) {
      for (const nm of seg) {
        const s = byName.get(nm);
        if (!s) continue;
        const ra = s.ra * DEG, dec = s.dec * DEG;
        sx += Math.cos(dec) * Math.cos(ra); sy += Math.cos(dec) * Math.sin(ra); sz += Math.sin(dec);
        n++;
      }
    }
    if (!n) return [0, 0, 40];
    const l = Math.hypot(sx, sy, sz) || 1;
    sx /= l; sy /= l; sz /= l;
    const ra0 = ((Math.atan2(sy, sx) / DEG) + 360) % 360;
    const dec0 = Math.asin(clamp(sz, -1, 1)) / DEG;
    // Radius: the widest separation from the centre, plus margin.
    let maxSep = 5;
    for (const seg of fig.lines) {
      for (const nm of seg) {
        const s = byName.get(nm);
        if (!s) continue;
        const d1 = dec0 * DEG, d2 = s.dec * DEG, dr = (ra0 - s.ra) * DEG;
        const c = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(dr);
        const sep = Math.acos(clamp(c, -1, 1)) / DEG;
        if (sep > maxSep) maxSep = sep;
      }
    }
    return [ra0, dec0, Math.min(70, maxSep * 1.45)];
  }

  /** The catalogue as it stood `years` ago — for the precession page. */
  _precessedStars(years) {
    if (this._precCache && this._precYears === years) return this._precCache;
    const { precess, J2000 } = this.ctx.celestial;
    const to = J2000 - years * 365.25;
    const out = [];
    const tmp = { ra: 0, dec: 0 };
    for (const s of BRIGHT_STARS) {
      precess(s.ra, s.dec, J2000, to, tmp);
      out.push({ name: s.name, ra: tmp.ra, dec: tmp.dec, mag: s.mag, bv: s.bv, con: s.con });
    }
    this._precCache = out;
    this._precYears = years;
    return out;
  }

  _drawMeridianDiagram(g, x, y, w, rng) {
    // A section through the hall: the slit, the beam, the floor scale.
    const h = 300;
    const cx = x + w * 0.5;
    g.strokeStyle = INK;
    penLine(g, x + 30, y + h, x + w - 30, y + h, 1.8, rng);              // floor
    penLine(g, x + 60, y + h, x + 60, y + 20, 1.4, rng);                  // south wall
    penLine(g, x + w - 60, y + h, x + w - 60, y + 20, 1.4, rng);          // north wall
    penLine(g, x + 60, y + 20, cx - 16, y + 6, 1.2, rng);                 // vault
    penLine(g, x + w - 60, y + 20, cx + 16, y + 6, 1.2, rng);
    g.strokeStyle = INK_FADED;
    penLine(g, cx - 10, y + 6, x + w - 130, y + h, 1.0, rng, 1.2);        // ray
    penLine(g, cx + 10, y + 6, x + w - 106, y + h, 1.0, rng, 1.2);
    g.fillStyle = INK;
    g.font = "italic 17px Georgia, serif";
    g.fillText("the crossing", cx - 40, y - 4);
    g.fillText("north", x + w - 96, y + h + 26);
    g.fillText("south", x + 44, y + h + 26);
    // the angle mark
    penCircle(g, x + w - 118, y + h, 46, 0.9, rng, 0.55);
    angleGlyph(g, 62, x + w - 210, y + h - 30, 14);
  }

  /* ------------------------------------------------------------------ */
  /* Presentation                                                        */
  /* ------------------------------------------------------------------ */

  toggle() {
    this.open = !this.open;
    if (this.open) {
      this.rebuild();
      if (this.ctx.audio) this.ctx.audio.bookOpen();
    }
  }

  turn(dir) {
    const n = this.spreads.length;
    const next = clamp(this.spread + dir, 0, n - 1);
    if (next === this.spread) return;
    this.spread = next;
    this._dirty = true;
    this._turn = 1;
    this._turnDir = dir;
    if (this.ctx.audio) this.ctx.audio.pageTurn();
  }

  update(dt) {
    const inp = this.ctx.input;
    if (inp.justPressed("KeyB") || inp.justPressed("Tab")) this.toggle();
    if (this.open) {
      if (inp.justPressed("ArrowRight") || inp.justPressed("KeyE")) this.turn(1);
      if (inp.justPressed("ArrowLeft") || inp.justPressed("KeyQ")) this.turn(-1);
      if (inp.justPressed("Escape")) this.open = false;
    }

    this.blend = damp(this.blend, this.open ? 1 : 0, 0.0006, dt);
    const showing = this.blend > 0.01;
    this.root.setEnabled(showing);
    if (!showing) return;

    if (this._dirty) this._render();
    this._turn = damp(this._turn, 0, 0.0015, dt);

    // Held in front of the character, tipped toward the light. The camera is
    // over her shoulder, so this is genuinely "she is holding it up to read".
    const cam = this.ctx.cam;
    const c = cam.camera;
    c.computeWorldMatrix(true);
    const m = c.getWorldMatrix();
    const fwd = _v1.set(m.m[8], m.m[9], m.m[10]).normalize();
    const right = _v2.set(m.m[0], m.m[1], m.m[2]).normalize();
    const up = _v3.set(m.m[4], m.m[5], m.m[6]).normalize();
    const eye = c.globalPosition;
    const dist = lerp(1.35, 0.62, this.blend);
    this.root.position.set(
      eye.x + fwd.x * dist + right.x * 0.02 - up.x * 0.30,
      eye.y + fwd.y * dist + right.y * 0.02 - up.y * 0.30,
      eye.z + fwd.z * dist + right.z * 0.02 - up.z * 0.30);
    // Face the reader, tilted back as a held book is.
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    Quaternion.RotationYawPitchRollToRef(yaw, lerp(1.35, 0.62, this.blend), this._turn * this._turnDir * 0.12, this.root.rotationQuaternion);
    const s = lerp(0.6, 1, this.blend);
    this.root.scaling.setAll(s);

    // Her hands come up to hold it.
    if (this.ctx.player) {
      const ctrl = this.ctx.player.controller;
      if (this.blend > 0.25) {
        _v1.copyFrom(this.root.position); _v1.x -= right.x * 0.16; _v1.y -= right.y * 0.16; _v1.z -= right.z * 0.16;
        ctrl.reachLeft(_v1.clone());
        _v2.copyFrom(this.root.position); _v2.x += right.x * 0.16; _v2.y += right.y * 0.16; _v2.z += right.z * 0.16;
        ctrl.reachRight(_v2.clone());
      } else {
        ctrl.reachLeft(null);
        ctrl.reachRight(null);
      }
    }
  }
}

const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();

export { FRAGMENTS as BOOK_FRAGMENTS };
