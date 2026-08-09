/**
 * Constellation figures.
 *
 * Two sets live here, and the difference between them is a puzzle.
 *
 * MODERN — the figures the protagonist was taught, drawn over real stars.
 * TEMPLE — the figures the temple's own astronomers used. Same sky, different
 *          joins, different names, and in two cases a figure that includes a
 *          star the modern tradition never bothered to name. Recognising that
 *          two records describe the same region of sky in different languages is
 *          the reasoning the Court of Reflections and the Archive are built on.
 */

/** @typedef {{key:string, name:string, lines:string[][], anchor?:string}} Figure */

/** @type {Figure[]} */
export const MODERN = [
  {
    key: "UMa", name: "Ursa Major",
    lines: [["Alkaid", "Mizar"], ["Mizar", "Alioth"], ["Alioth", "Megrez"], ["Megrez", "Phecda"],
    ["Phecda", "Merak"], ["Merak", "Dubhe"], ["Dubhe", "Megrez"]],
  },
  {
    key: "UMi", name: "Ursa Minor",
    lines: [["Polaris", "Yildun"], ["Yildun", "Epsilon UMi"], ["Epsilon UMi", "Zeta UMi"],
    ["Zeta UMi", "Kochab"], ["Kochab", "Pherkad"], ["Pherkad", "Eta UMi"], ["Eta UMi", "Zeta UMi"]],
    anchor: "Polaris",
  },
  {
    key: "Cas", name: "Cassiopeia",
    lines: [["Caph", "Schedar"], ["Schedar", "Gamma Cas"], ["Gamma Cas", "Ruchbah"], ["Ruchbah", "Segin"]],
  },
  {
    key: "Ori", name: "Orion",
    lines: [["Betelgeuse", "Bellatrix"], ["Betelgeuse", "Alnitak"], ["Bellatrix", "Mintaka"],
    ["Alnitak", "Alnilam"], ["Alnilam", "Mintaka"], ["Alnitak", "Saiph"], ["Mintaka", "Rigel"],
    ["Saiph", "Rigel"], ["Meissa", "Betelgeuse"], ["Meissa", "Bellatrix"]],
    anchor: "Alnilam",
  },
  {
    key: "Lyr", name: "Lyra",
    lines: [["Vega", "Zeta Lyr"], ["Zeta Lyr", "Sheliak"], ["Sheliak", "Sulafat"],
    ["Sulafat", "Delta Lyr"], ["Delta Lyr", "Zeta Lyr"]],
    anchor: "Vega",
  },
  {
    key: "Cyg", name: "Cygnus",
    lines: [["Deneb", "Sadr"], ["Sadr", "Albireo"], ["Aljanah", "Sadr"], ["Sadr", "Delta Cyg"]],
    anchor: "Deneb",
  },
  {
    key: "Aql", name: "Aquila",
    lines: [["Tarazed", "Altair"], ["Altair", "Alshain"], ["Tarazed", "Deneb el Okab"]],
    anchor: "Altair",
  },
  {
    key: "Boo", name: "Boötes",
    lines: [["Arcturus", "Izar"], ["Izar", "Seginus"], ["Seginus", "Nekkar"], ["Arcturus", "Muphrid"]],
    anchor: "Arcturus",
  },
  {
    key: "Leo", name: "Leo",
    lines: [["Regulus", "Algieba"], ["Algieba", "Adhafera"], ["Adhafera", "Algenubi"],
    ["Algenubi", "Rasalas"], ["Rasalas", "Algieba"], ["Regulus", "Chertan"],
    ["Chertan", "Zosma"], ["Zosma", "Denebola"], ["Denebola", "Chertan"]],
  },
  {
    key: "Tau", name: "Taurus",
    lines: [["Elnath", "Ain"], ["Ain", "Aldebaran"], ["Aldebaran", "Zeta Tau"], ["Aldebaran", "Alcyone"]],
    anchor: "Aldebaran",
  },
  {
    key: "Gem", name: "Gemini",
    lines: [["Castor", "Pollux"], ["Pollux", "Wasat"], ["Wasat", "Alhena"], ["Castor", "Mebsuta"],
    ["Mebsuta", "Tejat"], ["Tejat", "Propus"], ["Wasat", "Alzirr"]],
  },
  {
    key: "Sco", name: "Scorpius",
    lines: [["Acrab", "Dschubba"], ["Dschubba", "Antares"], ["Antares", "Larawag"],
    ["Larawag", "Shaula"], ["Shaula", "Sargas"], ["Sargas", "Girtab"]],
    anchor: "Antares",
  },
  {
    key: "CMa", name: "Canis Major",
    lines: [["Mirzam", "Sirius"], ["Sirius", "Wezen"], ["Wezen", "Adhara"], ["Wezen", "Aludra"], ["Adhara", "Furud"]],
    anchor: "Sirius",
  },
  {
    key: "Per", name: "Perseus",
    lines: [["Mirfak", "Algol"], ["Algol", "Zeta Per"], ["Mirfak", "Epsilon Per"],
    ["Mirfak", "Delta Per"], ["Delta Per", "Miram"]],
  },
  {
    key: "And", name: "Andromeda",
    lines: [["Alpheratz", "Delta And"], ["Delta And", "Mirach"], ["Mirach", "Almach"]],
  },
  {
    key: "Peg", name: "Pegasus",
    lines: [["Markab", "Scheat"], ["Scheat", "Alpheratz"], ["Alpheratz", "Algenib"],
    ["Algenib", "Markab"], ["Markab", "Homam"], ["Homam", "Enif"]],
  },
  {
    key: "Dra", name: "Draco",
    lines: [["Eltanin", "Rastaban"], ["Eltanin", "Altais"], ["Altais", "Aldhibah"],
    ["Aldhibah", "Edasich"], ["Edasich", "Thuban"], ["Thuban", "Giausar"]],
    anchor: "Thuban",
  },
  {
    key: "Aur", name: "Auriga",
    lines: [["Capella", "Menkalinan"], ["Menkalinan", "Mahasim"], ["Mahasim", "Elnath"],
    ["Capella", "Almaaz"], ["Almaaz", "Hassaleh"], ["Hassaleh", "Elnath"]],
    anchor: "Capella",
  },
];

/**
 * The temple's own figures.
 *
 * Note what the builders cared about. Their sky is organised around the pole and
 * the meridian, not around animals: the Gate, the Balance, the Ascent. And
 * "The Nail" is their name for the pole star of *their* era — which, because of
 * precession, was Thuban and not Polaris. That single disagreement is the thread
 * the whole mystery hangs from.
 */
export const TEMPLE = [
  {
    key: "T_nail", name: "The Nail",
    // Their pole. Drawn as a short bar of the stars that circled closest to it.
    lines: [["Thuban", "Edasich"], ["Edasich", "Aldhibah"], ["Thuban", "Giausar"]],
    anchor: "Thuban",
    note: "The still point. All else turns upon it.",
  },
  {
    key: "T_gate", name: "The Gate",
    // Our Cygnus and Lyra joined into one figure straddling the Milky Way.
    lines: [["Vega", "Deneb"], ["Deneb", "Albireo"], ["Albireo", "Altair"], ["Altair", "Vega"],
    ["Sadr", "Albireo"], ["Aljanah", "Sadr"], ["Sadr", "Delta Cyg"]],
    anchor: "Deneb",
    note: "Where the river of light is crossed.",
  },
  {
    key: "T_balance", name: "The Balance",
    // Arcturus and Spica as the two pans, the beam between them.
    lines: [["Arcturus", "Muphrid"], ["Muphrid", "Spica"], ["Spica", "Porrima"], ["Porrima", "Vindemiatrix"]],
    anchor: "Spica",
    note: "The weighing of the year.",
  },
  {
    key: "T_ascent", name: "The Ascent",
    // Orion's belt read as a stair rather than a belt, continued to Sirius.
    lines: [["Mintaka", "Alnilam"], ["Alnilam", "Alnitak"], ["Alnitak", "Sirius"], ["Sirius", "Wezen"]],
    anchor: "Alnilam",
    note: "Three steps, and then the fire at the bottom of the sky.",
  },
  {
    key: "T_lamp", name: "The Lamp-Bearer",
    // Their Auriga, but hung from Capella rather than standing on Elnath — the
    // figure is upside down relative to the modern one, which is exactly the
    // sort of thing that makes a copied diagram look wrong until you notice.
    lines: [["Capella", "Menkalinan"], ["Capella", "Almaaz"], ["Almaaz", "Hassaleh"],
    ["Menkalinan", "Mahasim"], ["Mahasim", "Elnath"], ["Hassaleh", "Elnath"]],
    anchor: "Capella",
    note: "She carries the light that does not go out.",
  },
  {
    key: "T_seven", name: "The Seven Oxen",
    lines: [["Dubhe", "Merak"], ["Merak", "Phecda"], ["Phecda", "Megrez"], ["Megrez", "Alioth"],
    ["Alioth", "Mizar"], ["Mizar", "Alkaid"]],
    anchor: "Dubhe",
    note: "They draw the year around the Nail.",
  },
];

/** @param {string} key */
export function findFigure(key, set = MODERN) {
  for (let i = 0; i < set.length; i++) if (set[i].key === key) return set[i];
  return null;
}

/** Every star name referenced by a figure set — used to validate the catalogue. */
export function figureStarNames(set) {
  const names = new Set();
  for (const f of set) for (const seg of f.lines) { names.add(seg[0]); names.add(seg[1]); }
  return names;
}
