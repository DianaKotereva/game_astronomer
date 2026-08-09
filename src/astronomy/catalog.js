/**
 * Star catalogue.
 *
 * The bright stars are real: J2000 right ascension, declination, visual
 * magnitude and B–V colour index for the naked-eye sky, so that when the temple
 * aims an instrument at Vega, it is aiming at Vega. Positions are accurate to
 * well under a tenth of a degree, which is far finer than any sight line in the
 * game needs.
 *
 * Below about magnitude 4 the catalogue is filled procedurally: a magnitude
 * distribution that follows the real count-per-magnitude law, concentrated
 * toward the galactic plane. That gives a sky with the right *texture* — dense,
 * uneven, deeper along the Milky Way — without shipping a hundred thousand
 * rows of data the player will never look at individually.
 *
 * Fields: name, ra (deg), dec (deg), mag, bv (colour index), con (constellation)
 */
import { makeRng, DEG, RAD } from "../core/scratch.js";

/** @typedef {{name:string, ra:number, dec:number, mag:number, bv:number, con:string}} Star */

const H = (h, m, s) => (h + m / 60 + (s || 0) / 3600) * 15;
const D = (d, m, s) => (d < 0 || Object.is(d, -0) ? -1 : 1) * (Math.abs(d) + m / 60 + (s || 0) / 3600);

/** @type {Star[]} */
export const BRIGHT_STARS = [
  { name: "Sirius", ra: H(6, 45, 9), dec: D(-16, 42, 58), mag: -1.46, bv: 0.00, con: "CMa" },
  { name: "Canopus", ra: H(6, 23, 57), dec: D(-52, 41, 44), mag: -0.74, bv: 0.15, con: "Car" },
  { name: "Rigil Kentaurus", ra: H(14, 39, 36), dec: D(-60, 50, 2), mag: -0.27, bv: 0.71, con: "Cen" },
  { name: "Arcturus", ra: H(14, 15, 40), dec: D(19, 10, 57), mag: -0.05, bv: 1.23, con: "Boo" },
  { name: "Vega", ra: H(18, 36, 56), dec: D(38, 47, 1), mag: 0.03, bv: 0.00, con: "Lyr" },
  { name: "Capella", ra: H(5, 16, 41), dec: D(45, 59, 53), mag: 0.08, bv: 0.80, con: "Aur" },
  { name: "Rigel", ra: H(5, 14, 32), dec: D(-8, 12, 6), mag: 0.13, bv: -0.03, con: "Ori" },
  { name: "Procyon", ra: H(7, 39, 18), dec: D(5, 13, 30), mag: 0.34, bv: 0.42, con: "CMi" },
  { name: "Achernar", ra: H(1, 37, 43), dec: D(-57, 14, 12), mag: 0.46, bv: -0.16, con: "Eri" },
  { name: "Betelgeuse", ra: H(5, 55, 10), dec: D(7, 24, 25), mag: 0.50, bv: 1.85, con: "Ori" },
  { name: "Hadar", ra: H(14, 3, 49), dec: D(-60, 22, 23), mag: 0.61, bv: -0.23, con: "Cen" },
  { name: "Altair", ra: H(19, 50, 47), dec: D(8, 52, 6), mag: 0.77, bv: 0.22, con: "Aql" },
  { name: "Acrux", ra: H(12, 26, 36), dec: D(-63, 5, 57), mag: 0.77, bv: -0.24, con: "Cru" },
  { name: "Aldebaran", ra: H(4, 35, 55), dec: D(16, 30, 33), mag: 0.85, bv: 1.54, con: "Tau" },
  { name: "Antares", ra: H(16, 29, 24), dec: D(-26, 25, 55), mag: 1.09, bv: 1.83, con: "Sco" },
  { name: "Spica", ra: H(13, 25, 12), dec: D(-11, 9, 41), mag: 1.04, bv: -0.23, con: "Vir" },
  { name: "Pollux", ra: H(7, 45, 19), dec: D(28, 1, 34), mag: 1.14, bv: 1.00, con: "Gem" },
  { name: "Fomalhaut", ra: H(22, 57, 39), dec: D(-29, 37, 20), mag: 1.16, bv: 0.09, con: "PsA" },
  { name: "Deneb", ra: H(20, 41, 26), dec: D(45, 16, 49), mag: 1.25, bv: 0.09, con: "Cyg" },
  { name: "Mimosa", ra: H(12, 47, 43), dec: D(-59, 41, 20), mag: 1.25, bv: -0.24, con: "Cru" },
  { name: "Regulus", ra: H(10, 8, 22), dec: D(11, 58, 2), mag: 1.35, bv: -0.11, con: "Leo" },
  { name: "Adhara", ra: H(6, 58, 38), dec: D(-28, 58, 19), mag: 1.50, bv: -0.21, con: "CMa" },
  { name: "Castor", ra: H(7, 34, 36), dec: D(31, 53, 18), mag: 1.58, bv: 0.03, con: "Gem" },
  { name: "Gacrux", ra: H(12, 31, 10), dec: D(-57, 6, 48), mag: 1.63, bv: 1.60, con: "Cru" },
  { name: "Shaula", ra: H(17, 33, 37), dec: D(-37, 6, 14), mag: 1.62, bv: -0.22, con: "Sco" },
  { name: "Bellatrix", ra: H(5, 25, 8), dec: D(6, 20, 59), mag: 1.64, bv: -0.22, con: "Ori" },
  { name: "Elnath", ra: H(5, 26, 18), dec: D(28, 36, 27), mag: 1.65, bv: -0.13, con: "Tau" },
  { name: "Miaplacidus", ra: H(9, 13, 12), dec: D(-69, 43, 2), mag: 1.67, bv: 0.07, con: "Car" },
  { name: "Alnilam", ra: H(5, 36, 13), dec: D(-1, 12, 7), mag: 1.69, bv: -0.18, con: "Ori" },
  { name: "Alnair", ra: H(22, 8, 14), dec: D(-46, 57, 40), mag: 1.74, bv: -0.13, con: "Gru" },
  { name: "Alnitak", ra: H(5, 40, 46), dec: D(-1, 56, 34), mag: 1.74, bv: -0.20, con: "Ori" },
  { name: "Alioth", ra: H(12, 54, 2), dec: D(55, 57, 35), mag: 1.77, bv: -0.02, con: "UMa" },
  { name: "Dubhe", ra: H(11, 3, 44), dec: D(61, 45, 3), mag: 1.79, bv: 1.07, con: "UMa" },
  { name: "Mirfak", ra: H(3, 24, 19), dec: D(49, 51, 40), mag: 1.79, bv: 0.48, con: "Per" },
  { name: "Wezen", ra: H(7, 8, 23), dec: D(-26, 23, 36), mag: 1.83, bv: 0.67, con: "CMa" },
  { name: "Kaus Australis", ra: H(18, 24, 10), dec: D(-34, 23, 5), mag: 1.85, bv: -0.03, con: "Sgr" },
  { name: "Alkaid", ra: H(13, 47, 32), dec: D(49, 18, 48), mag: 1.86, bv: -0.19, con: "UMa" },
  { name: "Sargas", ra: H(17, 37, 19), dec: D(-42, 59, 52), mag: 1.86, bv: 0.40, con: "Sco" },
  { name: "Avior", ra: H(8, 22, 31), dec: D(-59, 30, 34), mag: 1.86, bv: 1.20, con: "Car" },
  { name: "Menkalinan", ra: H(5, 59, 32), dec: D(44, 56, 51), mag: 1.90, bv: 0.08, con: "Aur" },
  { name: "Atria", ra: H(16, 48, 40), dec: D(-69, 1, 40), mag: 1.91, bv: 1.44, con: "TrA" },
  { name: "Alhena", ra: H(6, 37, 43), dec: D(16, 23, 57), mag: 1.93, bv: 0.00, con: "Gem" },
  { name: "Peacock", ra: H(20, 25, 39), dec: D(-56, 44, 6), mag: 1.94, bv: -0.12, con: "Pav" },
  { name: "Polaris", ra: H(2, 31, 49), dec: D(89, 15, 51), mag: 1.98, bv: 0.60, con: "UMi" },
  { name: "Mirzam", ra: H(6, 22, 42), dec: D(-17, 57, 21), mag: 1.98, bv: -0.24, con: "CMa" },
  { name: "Alphard", ra: H(9, 27, 35), dec: D(-8, 39, 31), mag: 1.98, bv: 1.44, con: "Hya" },
  { name: "Hamal", ra: H(2, 7, 10), dec: D(23, 27, 45), mag: 2.00, bv: 1.15, con: "Ari" },
  { name: "Algieba", ra: H(10, 19, 58), dec: D(19, 50, 30), mag: 2.08, bv: 1.13, con: "Leo" },
  { name: "Diphda", ra: H(0, 43, 35), dec: D(-17, 59, 12), mag: 2.04, bv: 1.02, con: "Cet" },
  { name: "Nunki", ra: H(18, 55, 16), dec: D(-26, 17, 48), mag: 2.05, bv: -0.22, con: "Sgr" },
  { name: "Mizar", ra: H(13, 23, 56), dec: D(54, 55, 31), mag: 2.23, bv: 0.06, con: "UMa" },
  { name: "Menkent", ra: H(14, 6, 41), dec: D(-36, 22, 11), mag: 2.06, bv: 1.01, con: "Cen" },
  { name: "Mirach", ra: H(1, 9, 44), dec: D(35, 37, 14), mag: 2.06, bv: 1.58, con: "And" },
  { name: "Alpheratz", ra: H(0, 8, 23), dec: D(29, 5, 26), mag: 2.06, bv: -0.11, con: "And" },
  { name: "Rasalhague", ra: H(17, 34, 56), dec: D(12, 33, 36), mag: 2.08, bv: 0.15, con: "Oph" },
  { name: "Kochab", ra: H(14, 50, 42), dec: D(74, 9, 20), mag: 2.08, bv: 1.47, con: "UMi" },
  { name: "Saiph", ra: H(5, 47, 45), dec: D(-9, 40, 11), mag: 2.09, bv: -0.17, con: "Ori" },
  { name: "Denebola", ra: H(11, 49, 3), dec: D(14, 34, 19), mag: 2.14, bv: 0.09, con: "Leo" },
  { name: "Algol", ra: H(3, 8, 10), dec: D(40, 57, 20), mag: 2.12, bv: -0.05, con: "Per" },
  { name: "Tiaki", ra: H(22, 42, 40), dec: D(-46, 53, 4), mag: 2.07, bv: 1.60, con: "Gru" },
  { name: "Muhlifain", ra: H(12, 41, 31), dec: D(-48, 57, 35), mag: 2.20, bv: -0.01, con: "Cen" },
  { name: "Aspidiske", ra: H(9, 17, 5), dec: D(-59, 16, 31), mag: 2.21, bv: 0.18, con: "Car" },
  { name: "Suhail", ra: H(9, 7, 60), dec: D(-43, 25, 57), mag: 2.23, bv: 1.66, con: "Vel" },
  { name: "Alphecca", ra: H(15, 34, 41), dec: D(26, 42, 53), mag: 2.22, bv: -0.02, con: "CrB" },
  { name: "Mintaka", ra: H(5, 32, 0), dec: D(-0, 17, 57), mag: 2.23, bv: -0.18, con: "Ori" },
  { name: "Sadr", ra: H(20, 22, 14), dec: D(40, 15, 24), mag: 2.23, bv: 0.68, con: "Cyg" },
  { name: "Eltanin", ra: H(17, 56, 36), dec: D(51, 29, 20), mag: 2.23, bv: 1.52, con: "Dra" },
  { name: "Schedar", ra: H(0, 40, 30), dec: D(56, 32, 15), mag: 2.24, bv: 1.17, con: "Cas" },
  { name: "Naos", ra: H(8, 3, 35), dec: D(-40, 0, 12), mag: 2.21, bv: -0.27, con: "Pup" },
  { name: "Almach", ra: H(2, 3, 54), dec: D(42, 19, 47), mag: 2.10, bv: 1.37, con: "And" },
  { name: "Caph", ra: H(0, 9, 11), dec: D(59, 8, 59), mag: 2.28, bv: 0.34, con: "Cas" },
  { name: "Izar", ra: H(14, 44, 59), dec: D(27, 4, 27), mag: 2.35, bv: 0.97, con: "Boo" },
  { name: "Dschubba", ra: H(16, 0, 20), dec: D(-22, 37, 18), mag: 2.29, bv: -0.12, con: "Sco" },
  { name: "Larawag", ra: H(16, 50, 10), dec: D(-34, 17, 36), mag: 2.29, bv: 1.15, con: "Sco" },
  { name: "Merak", ra: H(11, 1, 50), dec: D(56, 22, 57), mag: 2.37, bv: 0.03, con: "UMa" },
  { name: "Ankaa", ra: H(0, 26, 17), dec: D(-42, 18, 22), mag: 2.38, bv: 1.08, con: "Phe" },
  { name: "Girtab", ra: H(17, 42, 29), dec: D(-39, 1, 48), mag: 2.39, bv: -0.19, con: "Sco" },
  { name: "Enif", ra: H(21, 44, 11), dec: D(9, 52, 30), mag: 2.39, bv: 1.53, con: "Peg" },
  { name: "Scheat", ra: H(23, 3, 46), dec: D(28, 4, 58), mag: 2.42, bv: 1.67, con: "Peg" },
  { name: "Sabik", ra: H(17, 10, 23), dec: D(-15, 43, 30), mag: 2.43, bv: 0.06, con: "Oph" },
  { name: "Phecda", ra: H(11, 53, 50), dec: D(53, 41, 41), mag: 2.44, bv: 0.04, con: "UMa" },
  { name: "Aludra", ra: H(7, 24, 6), dec: D(-29, 18, 11), mag: 2.45, bv: -0.08, con: "CMa" },
  { name: "Markab", ra: H(23, 4, 46), dec: D(15, 12, 19), mag: 2.49, bv: -0.04, con: "Peg" },
  { name: "Aljanah", ra: H(20, 46, 13), dec: D(33, 58, 13), mag: 2.48, bv: 1.02, con: "Cyg" },
  { name: "Acrab", ra: H(16, 5, 26), dec: D(-19, 48, 20), mag: 2.56, bv: -0.07, con: "Sco" },
  { name: "Denebalgedi", ra: H(21, 47, 2), dec: D(-16, 7, 38), mag: 2.85, bv: 0.18, con: "Cap" },
  { name: "Unukalhai", ra: H(15, 44, 16), dec: D(6, 25, 32), mag: 2.63, bv: 1.17, con: "Ser" },
  { name: "Zubeneschamali", ra: H(15, 17, 0), dec: D(-9, 22, 58), mag: 2.61, bv: -0.07, con: "Lib" },
  { name: "Ruchbah", ra: H(1, 25, 49), dec: D(60, 14, 7), mag: 2.68, bv: 0.16, con: "Cas" },
  { name: "Gamma Cas", ra: H(0, 56, 43), dec: D(60, 43, 0), mag: 2.47, bv: -0.05, con: "Cas" },
  { name: "Zubenelgenubi", ra: H(14, 50, 53), dec: D(-16, 2, 30), mag: 2.75, bv: 0.15, con: "Lib" },
  { name: "Alderamin", ra: H(21, 18, 35), dec: D(62, 35, 8), mag: 2.45, bv: 0.22, con: "Cep" },
  { name: "Alfirk", ra: H(21, 28, 40), dec: D(70, 33, 39), mag: 3.23, bv: -0.20, con: "Cep" },
  { name: "Errai", ra: H(23, 39, 21), dec: D(77, 37, 57), mag: 3.21, bv: 1.03, con: "Cep" },
  { name: "Rastaban", ra: H(17, 30, 26), dec: D(52, 18, 5), mag: 2.79, bv: 0.95, con: "Dra" },
  { name: "Altais", ra: H(19, 12, 33), dec: D(67, 39, 42), mag: 3.07, bv: 1.00, con: "Dra" },
  { name: "Thuban", ra: H(14, 4, 23), dec: D(64, 22, 33), mag: 3.65, bv: -0.05, con: "Dra" },
  { name: "Edasich", ra: H(15, 24, 56), dec: D(58, 57, 58), mag: 3.29, bv: 1.17, con: "Dra" },
  { name: "Aldhibah", ra: H(17, 8, 47), dec: D(65, 42, 53), mag: 3.17, bv: -0.12, con: "Dra" },
  { name: "Giausar", ra: H(11, 31, 24), dec: D(69, 19, 52), mag: 3.82, bv: 1.62, con: "Dra" },
  { name: "Pherkad", ra: H(15, 20, 44), dec: D(71, 50, 2), mag: 3.00, bv: 0.05, con: "UMi" },
  { name: "Yildun", ra: H(17, 32, 13), dec: D(86, 35, 11), mag: 4.36, bv: 0.02, con: "UMi" },
  { name: "Epsilon UMi", ra: H(16, 45, 58), dec: D(82, 2, 14), mag: 4.21, bv: 0.89, con: "UMi" },
  { name: "Zeta UMi", ra: H(15, 44, 3), dec: D(77, 47, 40), mag: 4.29, bv: 0.04, con: "UMi" },
  { name: "Eta UMi", ra: H(16, 17, 30), dec: D(75, 45, 19), mag: 4.95, bv: 0.37, con: "UMi" },
  { name: "Megrez", ra: H(12, 15, 26), dec: D(57, 1, 57), mag: 3.31, bv: 0.08, con: "UMa" },
  { name: "Talitha", ra: H(8, 59, 13), dec: D(48, 2, 30), mag: 3.14, bv: 0.22, con: "UMa" },
  { name: "Alula Borealis", ra: H(11, 18, 29), dec: D(33, 5, 39), mag: 3.49, bv: 1.40, con: "UMa" },
  { name: "Rigel Kent B", ra: H(14, 39, 35), dec: D(-60, 50, 14), mag: 1.33, bv: 0.88, con: "Cen" },
  { name: "Meissa", ra: H(5, 35, 8), dec: D(9, 56, 3), mag: 3.39, bv: -0.16, con: "Ori" },
  { name: "Tabit", ra: H(4, 49, 50), dec: D(6, 57, 41), mag: 3.19, bv: 0.45, con: "Ori" },
  { name: "Hatysa", ra: H(5, 35, 26), dec: D(-5, 54, 36), mag: 2.75, bv: -0.21, con: "Ori" },
  { name: "Alcyone", ra: H(3, 47, 29), dec: D(24, 6, 18), mag: 2.87, bv: -0.09, con: "Tau" },
  { name: "Atlas", ra: H(3, 49, 10), dec: D(24, 3, 12), mag: 3.62, bv: -0.09, con: "Tau" },
  { name: "Electra", ra: H(3, 44, 52), dec: D(24, 6, 48), mag: 3.70, bv: -0.11, con: "Tau" },
  { name: "Maia", ra: H(3, 45, 49), dec: D(24, 22, 4), mag: 3.87, bv: -0.07, con: "Tau" },
  { name: "Merope", ra: H(3, 46, 20), dec: D(23, 56, 54), mag: 4.14, bv: -0.06, con: "Tau" },
  { name: "Taygeta", ra: H(3, 45, 12), dec: D(24, 28, 2), mag: 4.30, bv: -0.11, con: "Tau" },
  { name: "Zeta Tau", ra: H(5, 37, 39), dec: D(21, 8, 33), mag: 3.00, bv: -0.15, con: "Tau" },
  { name: "Ain", ra: H(4, 28, 37), dec: D(19, 10, 50), mag: 3.53, bv: 1.01, con: "Tau" },
  { name: "Albireo", ra: H(19, 30, 43), dec: D(27, 57, 35), mag: 3.18, bv: 1.09, con: "Cyg" },
  { name: "Delta Cyg", ra: H(19, 44, 58), dec: D(45, 7, 51), mag: 2.87, bv: -0.03, con: "Cyg" },
  { name: "Zeta Cyg", ra: H(21, 12, 56), dec: D(30, 13, 37), mag: 3.20, bv: 0.99, con: "Cyg" },
  { name: "Sheliak", ra: H(18, 50, 5), dec: D(33, 21, 46), mag: 3.52, bv: 0.00, con: "Lyr" },
  { name: "Sulafat", ra: H(18, 58, 57), dec: D(32, 41, 22), mag: 3.25, bv: -0.05, con: "Lyr" },
  { name: "Delta Lyr", ra: H(18, 54, 30), dec: D(36, 53, 55), mag: 4.30, bv: 1.68, con: "Lyr" },
  { name: "Zeta Lyr", ra: H(18, 44, 46), dec: D(37, 36, 18), mag: 4.36, bv: 0.19, con: "Lyr" },
  { name: "Tarazed", ra: H(19, 46, 16), dec: D(10, 36, 48), mag: 2.72, bv: 1.52, con: "Aql" },
  { name: "Alshain", ra: H(19, 55, 19), dec: D(6, 24, 24), mag: 3.71, bv: 0.86, con: "Aql" },
  { name: "Deneb el Okab", ra: H(19, 5, 25), dec: D(13, 51, 48), mag: 2.99, bv: 0.01, con: "Aql" },
  { name: "Nekkar", ra: H(15, 1, 57), dec: D(40, 23, 26), mag: 3.49, bv: 0.95, con: "Boo" },
  { name: "Seginus", ra: H(14, 32, 5), dec: D(38, 18, 30), mag: 3.03, bv: 0.19, con: "Boo" },
  { name: "Muphrid", ra: H(13, 54, 41), dec: D(18, 23, 52), mag: 2.68, bv: 0.58, con: "Boo" },
  { name: "Zosma", ra: H(11, 14, 7), dec: D(20, 31, 25), mag: 2.56, bv: 0.13, con: "Leo" },
  { name: "Chertan", ra: H(11, 14, 15), dec: D(15, 25, 47), mag: 3.33, bv: 0.00, con: "Leo" },
  { name: "Adhafera", ra: H(10, 16, 41), dec: D(23, 25, 2), mag: 3.43, bv: 0.31, con: "Leo" },
  { name: "Rasalas", ra: H(9, 52, 46), dec: D(26, 0, 25), mag: 3.88, bv: 1.13, con: "Leo" },
  { name: "Algenubi", ra: H(9, 45, 51), dec: D(23, 46, 27), mag: 2.98, bv: 1.21, con: "Leo" },
  { name: "Wasat", ra: H(7, 20, 7), dec: D(21, 58, 56), mag: 3.53, bv: 0.37, con: "Gem" },
  { name: "Mebsuta", ra: H(6, 43, 56), dec: D(25, 7, 52), mag: 2.98, bv: 1.40, con: "Gem" },
  { name: "Mekbuda", ra: H(7, 4, 7), dec: D(20, 34, 13), mag: 3.79, bv: 0.79, con: "Gem" },
  { name: "Tejat", ra: H(6, 22, 58), dec: D(22, 30, 49), mag: 2.87, bv: 1.64, con: "Gem" },
  { name: "Propus", ra: H(6, 14, 53), dec: D(22, 30, 24), mag: 3.28, bv: 1.60, con: "Gem" },
  { name: "Alzirr", ra: H(6, 44, 56), dec: D(12, 53, 44), mag: 3.35, bv: 0.44, con: "Gem" },
  { name: "Furud", ra: H(6, 20, 19), dec: D(-30, 3, 48), mag: 3.02, bv: -0.19, con: "CMa" },
  { name: "Gomeisa", ra: H(7, 27, 9), dec: D(8, 17, 22), mag: 2.89, bv: -0.10, con: "CMi" },
  { name: "Menkar", ra: H(3, 2, 17), dec: D(4, 5, 23), mag: 2.53, bv: 1.64, con: "Cet" },
  { name: "Mira", ra: H(2, 19, 21), dec: D(-2, 58, 39), mag: 3.50, bv: 1.42, con: "Cet" },
  { name: "Kaffaljidhma", ra: H(2, 43, 18), dec: D(3, 14, 9), mag: 3.47, bv: 0.09, con: "Cet" },
  { name: "Sheratan", ra: H(1, 54, 38), dec: D(20, 48, 29), mag: 2.64, bv: 0.13, con: "Ari" },
  { name: "Mesarthim", ra: H(1, 53, 32), dec: D(19, 17, 38), mag: 3.86, bv: 0.02, con: "Ari" },
  { name: "Homam", ra: H(22, 41, 28), dec: D(10, 49, 53), mag: 3.40, bv: -0.09, con: "Peg" },
  { name: "Algenib", ra: H(0, 13, 14), dec: D(15, 11, 1), mag: 2.83, bv: -0.19, con: "Peg" },
  { name: "Matar", ra: H(22, 43, 0), dec: D(30, 13, 17), mag: 2.94, bv: 0.86, con: "Peg" },
  { name: "Sadalsuud", ra: H(21, 31, 34), dec: D(-5, 34, 16), mag: 2.90, bv: 0.83, con: "Aqr" },
  { name: "Sadalmelik", ra: H(22, 5, 47), dec: D(-0, 19, 11), mag: 2.95, bv: 0.98, con: "Aqr" },
  { name: "Skat", ra: H(22, 54, 39), dec: D(-15, 49, 15), mag: 3.27, bv: 0.06, con: "Aqr" },
  { name: "Deneb Algedi", ra: H(21, 47, 2), dec: D(-16, 7, 38), mag: 2.85, bv: 0.18, con: "Cap" },
  { name: "Dabih", ra: H(20, 21, 1), dec: D(-14, 46, 53), mag: 3.05, bv: 0.79, con: "Cap" },
  { name: "Algedi", ra: H(20, 18, 3), dec: D(-12, 32, 41), mag: 3.57, bv: 0.91, con: "Cap" },
  { name: "Ascella", ra: H(19, 2, 37), dec: D(-29, 52, 49), mag: 2.60, bv: 0.06, con: "Sgr" },
  { name: "Kaus Media", ra: H(18, 20, 60), dec: D(-29, 49, 41), mag: 2.70, bv: 1.38, con: "Sgr" },
  { name: "Kaus Borealis", ra: H(18, 27, 58), dec: D(-25, 25, 18), mag: 2.81, bv: 1.03, con: "Sgr" },
  { name: "Alnasl", ra: H(18, 5, 48), dec: D(-30, 25, 27), mag: 2.98, bv: 0.98, con: "Sgr" },
  { name: "Phi Sgr", ra: H(18, 45, 39), dec: D(-26, 59, 27), mag: 3.17, bv: -0.11, con: "Sgr" },
  { name: "Yed Prior", ra: H(16, 14, 21), dec: D(-3, 41, 40), mag: 2.73, bv: 1.58, con: "Oph" },
  { name: "Cebalrai", ra: H(17, 43, 28), dec: D(4, 34, 2), mag: 2.76, bv: 1.16, con: "Oph" },
  { name: "Han", ra: H(16, 37, 10), dec: D(-10, 34, 2), mag: 2.54, bv: 0.04, con: "Oph" },
  { name: "Alsephina", ra: H(8, 44, 42), dec: D(-54, 42, 32), mag: 1.96, bv: 0.04, con: "Vel" },
  { name: "Markeb", ra: H(9, 22, 7), dec: D(-55, 0, 39), mag: 2.47, bv: -0.18, con: "Vel" },
  { name: "Mothallah", ra: H(1, 53, 5), dec: D(29, 34, 44), mag: 3.42, bv: 0.49, con: "Tri" },
  { name: "Alrescha", ra: H(2, 2, 3), dec: D(2, 45, 50), mag: 3.82, bv: 0.32, con: "Psc" },
  { name: "Zaurak", ra: H(3, 58, 2), dec: D(-13, 30, 31), mag: 2.95, bv: 1.59, con: "Eri" },
  { name: "Cursa", ra: H(5, 7, 51), dec: D(-5, 5, 11), mag: 2.79, bv: 0.13, con: "Eri" },
  { name: "Acamar", ra: H(2, 58, 16), dec: D(-40, 18, 17), mag: 2.88, bv: 0.13, con: "Eri" },
  { name: "Vindemiatrix", ra: H(13, 2, 11), dec: D(10, 57, 33), mag: 2.83, bv: 0.94, con: "Vir" },
  { name: "Porrima", ra: H(12, 41, 40), dec: D(-1, 26, 58), mag: 2.74, bv: 0.36, con: "Vir" },
  { name: "Auva", ra: H(12, 55, 36), dec: D(3, 23, 51), mag: 3.38, bv: 1.57, con: "Vir" },
  { name: "Heze", ra: H(13, 34, 42), dec: D(-0, 35, 45), mag: 3.38, bv: 0.11, con: "Vir" },
  { name: "Zavijava", ra: H(11, 50, 42), dec: D(1, 45, 53), mag: 3.60, bv: 0.52, con: "Vir" },
  { name: "Cor Caroli", ra: H(12, 56, 2), dec: D(38, 19, 6), mag: 2.89, bv: -0.12, con: "CVn" },
  { name: "Alcor", ra: H(13, 25, 14), dec: D(54, 59, 17), mag: 3.99, bv: 0.16, con: "UMa" },
  { name: "Capella H", ra: H(5, 6, 31), dec: D(43, 49, 24), mag: 4.71, bv: 1.37, con: "Aur" },
  { name: "Almaaz", ra: H(5, 1, 58), dec: D(43, 49, 24), mag: 2.99, bv: 0.54, con: "Aur" },
  { name: "Hassaleh", ra: H(4, 56, 60), dec: D(33, 10, 5), mag: 2.69, bv: 1.53, con: "Aur" },
  { name: "Mahasim", ra: H(5, 59, 43), dec: D(37, 12, 45), mag: 2.62, bv: -0.08, con: "Aur" },
  { name: "Zeta Per", ra: H(3, 54, 8), dec: D(31, 53, 1), mag: 2.85, bv: 0.26, con: "Per" },
  { name: "Epsilon Per", ra: H(3, 57, 51), dec: D(40, 0, 37), mag: 2.89, bv: -0.20, con: "Per" },
  { name: "Miram", ra: H(2, 50, 42), dec: D(55, 53, 44), mag: 3.77, bv: 1.69, con: "Per" },
  { name: "Atik", ra: H(3, 44, 19), dec: D(32, 17, 18), mag: 3.83, bv: 0.04, con: "Per" },
  { name: "Delta Per", ra: H(3, 42, 55), dec: D(47, 47, 15), mag: 3.01, bv: -0.13, con: "Per" },
  { name: "Achird", ra: H(0, 49, 6), dec: D(57, 48, 55), mag: 3.44, bv: 0.59, con: "Cas" },
  { name: "Segin", ra: H(1, 54, 24), dec: D(63, 40, 13), mag: 3.35, bv: -0.15, con: "Cas" },
  { name: "Adhil", ra: H(1, 22, 20), dec: D(45, 31, 44), mag: 3.59, bv: 1.28, con: "And" },
  { name: "Delta And", ra: H(0, 39, 20), dec: D(30, 51, 40), mag: 3.27, bv: 1.28, con: "And" },
];

/* ------------------------------------------------------------------ */
/* Galactic coordinates                                                */
/* ------------------------------------------------------------------ */

// J2000 north galactic pole and the galactic centre.
export const NGP_RA = 192.85948;
export const NGP_DEC = 27.12825;
export const GAL_LON_NCP = 122.93192;

const _gal = { l: 0, b: 0 };

/** Equatorial (deg) -> galactic longitude/latitude (deg). */
export function equatorialToGalactic(raDeg, decDeg, out = _gal) {
  const ra = raDeg * DEG, dec = decDeg * DEG;
  const dNGP = NGP_DEC * DEG, aNGP = NGP_RA * DEG;
  const sinb = Math.sin(dec) * Math.sin(dNGP) + Math.cos(dec) * Math.cos(dNGP) * Math.cos(ra - aNGP);
  const b = Math.asin(Math.max(-1, Math.min(1, sinb)));
  const y = Math.cos(dec) * Math.sin(ra - aNGP);
  const x = Math.sin(dec) * Math.cos(dNGP) - Math.cos(dec) * Math.sin(dNGP) * Math.cos(ra - aNGP);
  let l = GAL_LON_NCP - Math.atan2(y, x) * RAD;
  l = ((l % 360) + 360) % 360;
  out.l = l; out.b = b * RAD;
  return out;
}

/* ------------------------------------------------------------------ */
/* Procedural faint field                                              */
/* ------------------------------------------------------------------ */

/**
 * Fill the sky below the catalogued limit.
 *
 * Two things make this read as a real sky rather than as noise: the number of
 * stars grows by roughly 2.5× per magnitude (the observed count law), and the
 * fainter population clusters strongly toward the galactic plane, because that
 * is where the disc of the galaxy is.
 *
 * @param {number} count
 * @returns {Star[]}
 */
export function generateFaintStars(count = 5200, seed = 90210) {
  const rng = makeRng(seed);
  /** @type {Star[]} */
  const out = new Array(count);
  const minMag = 4.2, maxMag = 6.6;
  for (let i = 0; i < count; i++) {
    // Magnitude from the count law: N(<m) ∝ 10^(0.42 m). Inverting gives a
    // strong bias toward the faint end, exactly as the real sky has.
    const u = rng();
    const mag = minMag + (maxMag - minMag) * Math.pow(u, 0.42);

    let ra = 0, dec = 0;
    // Two thirds of the faint field is drawn toward the galactic plane.
    if (rng() < 0.66) {
      const l = rng() * 360;
      // Latitude concentrated near b = 0 — a Laplace-ish profile.
      const s = rng() < 0.5 ? -1 : 1;
      const b = s * (-Math.log(Math.max(1e-4, rng())) * 7.5);
      const eq = galacticToEquatorial(l, Math.max(-88, Math.min(88, b)));
      ra = eq.ra; dec = eq.dec;
    } else {
      ra = rng() * 360;
      dec = Math.asin(rng() * 2 - 1) * RAD;
    }

    // Colour: mostly cool disc stars with a scattering of hot blue ones.
    const t = rng();
    const bv = t < 0.14 ? -0.25 + rng() * 0.35
      : t < 0.55 ? 0.3 + rng() * 0.5
        : 0.75 + rng() * 0.9;

    out[i] = { name: "", ra, dec, mag, bv, con: "" };
  }
  return out;
}

const _eq = { ra: 0, dec: 0 };

/** Galactic -> equatorial (deg). */
export function galacticToEquatorial(lDeg, bDeg, out = _eq) {
  const l = lDeg * DEG, b = bDeg * DEG;
  const dNGP = NGP_DEC * DEG, aNGP = NGP_RA * DEG, lNCP = GAL_LON_NCP * DEG;
  const sinDec = Math.sin(b) * Math.sin(dNGP) + Math.cos(b) * Math.cos(dNGP) * Math.cos(lNCP - l);
  const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));
  const y = Math.cos(b) * Math.sin(lNCP - l);
  const x = Math.sin(b) * Math.cos(dNGP) - Math.cos(b) * Math.sin(dNGP) * Math.cos(lNCP - l);
  let ra = Math.atan2(y, x) * RAD + NGP_RA;
  ra = ((ra % 360) + 360) % 360;
  out.ra = ra; out.dec = dec * RAD;
  return out;
}

/**
 * Approximate RGB for a star of colour index B–V.
 * Restrained on purpose: real stars are far less colourful than game skies
 * usually paint them, and oversaturated stars are the fastest way to make a
 * night sky look fake.
 */
export function bvToRGB(bv, out) {
  const t = Math.max(-0.4, Math.min(2.0, bv));
  // Blue-white through white to amber.
  let r, g, b;
  if (t < 0.0) { r = 0.72 + t * 0.15; g = 0.80 + t * 0.06; b = 1.0; }
  else if (t < 0.6) { r = 0.72 + t * 0.42; g = 0.80 + t * 0.20; b = 1.0 - t * 0.13; }
  else if (t < 1.4) { r = 0.97 + (t - 0.6) * 0.04; g = 0.92 - (t - 0.6) * 0.14; b = 0.92 - (t - 0.6) * 0.33; }
  else { r = 1.0; g = 0.81 - (t - 1.4) * 0.10; b = 0.66 - (t - 1.4) * 0.16; }
  out[0] = Math.max(0, Math.min(1, r));
  out[1] = Math.max(0, Math.min(1, g));
  out[2] = Math.max(0, Math.min(1, b));
  return out;
}

/** Look a catalogued star up by name. */
export function findStar(name) {
  for (let i = 0; i < BRIGHT_STARS.length; i++) if (BRIGHT_STARS[i].name === name) return BRIGHT_STARS[i];
  return null;
}
