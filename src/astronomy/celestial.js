/**
 * The celestial model.
 *
 * One simulation serves everything: what the player sees in the sky, where an
 * instrument must point, where a beam of moonlight lands, and what a spell can
 * reach. Nothing in this game fakes the sky separately from the astronomy — if
 * an axis points at Vega, it is because Vega is actually there.
 *
 * Accuracy is deliberately "good planetarium, not ephemeris": positions are
 * within a fraction of a degree, which is far beyond what any puzzle needs, and
 * the internal consistency is exact.
 *
 * Frames used here:
 *   equatorial  right ascension / declination, J2000, as catalogued
 *   horizontal  altitude / azimuth for the observer, azimuth 0 = north, +east
 *   world       +X east, +Y up, +Z north
 */
import { DEG, RAD, TAU, clamp } from "../core/scratch.js";

/** Days per Julian century. */
const JCENT = 36525;
export const J2000 = 2451545.0;

/** The temple's observer. A latitude of 34° N puts the pole comfortably high
 *  without making circumpolar motion dominate the sky. */
export const OBSERVER = {
  latitude: 34.05,
  longitude: 33.4,      // east, degrees
  elevation: 980,
};

/* ------------------------------------------------------------------ */
/* Time                                                                */
/* ------------------------------------------------------------------ */

/** Julian Date from a calendar date (UTC). */
export function toJD(year, month, day, hour = 0, minute = 0, second = 0) {
  let y = year, m = month;
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + B - 1524.5;
  return jd + (hour + minute / 60 + second / 3600) / 24;
}

/** Greenwich mean sidereal time in degrees. */
export function gmst(jd) {
  const T = (jd - J2000) / JCENT;
  let theta = 280.46061837 + 360.98564736629 * (jd - J2000)
    + 0.000387933 * T * T - (T * T * T) / 38710000;
  theta %= 360;
  return theta < 0 ? theta + 360 : theta;
}

/** Local sidereal time in degrees. */
export function lst(jd, longitudeDeg = OBSERVER.longitude) {
  const t = (gmst(jd) + longitudeDeg) % 360;
  return t < 0 ? t + 360 : t;
}

/* ------------------------------------------------------------------ */
/* Coordinate transforms                                               */
/* ------------------------------------------------------------------ */

/**
 * Equatorial -> horizontal.
 * @param {number} raDeg right ascension, degrees
 * @param {number} decDeg declination, degrees
 * @param {number} lstDeg local sidereal time, degrees
 * @param {number} latDeg observer latitude, degrees
 * @param {{alt:number, az:number}} out
 */
export function equatorialToHorizontal(raDeg, decDeg, lstDeg, latDeg, out) {
  const H = (lstDeg - raDeg) * DEG;          // hour angle
  const dec = decDeg * DEG, lat = latDeg * DEG;
  const sinDec = Math.sin(dec), cosDec = Math.cos(dec);
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
  const cosH = Math.cos(H), sinH = Math.sin(H);

  const sinAlt = sinDec * sinLat + cosDec * cosLat * cosH;
  const alt = Math.asin(clamp(sinAlt, -1, 1));
  // Azimuth measured from north, increasing toward east.
  const az = Math.atan2(-sinH * cosDec, sinDec * cosLat - cosDec * sinLat * cosH);
  out.alt = alt * RAD;
  out.az = ((az * RAD) % 360 + 360) % 360;
  return out;
}

/** Horizontal -> equatorial (used when the player aims an instrument at the sky). */
export function horizontalToEquatorial(altDeg, azDeg, lstDeg, latDeg, out) {
  const alt = altDeg * DEG, az = azDeg * DEG, lat = latDeg * DEG;
  const sinDec = Math.sin(alt) * Math.sin(lat) + Math.cos(alt) * Math.cos(lat) * Math.cos(az);
  const dec = Math.asin(clamp(sinDec, -1, 1));
  const H = Math.atan2(-Math.sin(az) * Math.cos(alt), Math.sin(alt) * Math.cos(lat) - Math.cos(alt) * Math.sin(lat) * Math.cos(az));
  out.dec = dec * RAD;
  out.ra = ((lstDeg - H * RAD) % 360 + 360) % 360;
  return out;
}

/** Altitude/azimuth -> a unit direction in world space. */
export function altAzToWorld(altDeg, azDeg, out) {
  const alt = altDeg * DEG, az = azDeg * DEG;
  const ca = Math.cos(alt);
  out.x = ca * Math.sin(az);
  out.y = Math.sin(alt);
  out.z = ca * Math.cos(az);
  return out;
}

/** World direction -> altitude/azimuth. */
export function worldToAltAz(x, y, z, out) {
  const l = Math.hypot(x, y, z) || 1;
  out.alt = Math.asin(clamp(y / l, -1, 1)) * RAD;
  out.az = ((Math.atan2(x, z) * RAD) % 360 + 360) % 360;
  return out;
}

/**
 * Precession of equatorial coordinates between epochs, using the rigorous
 * rotation rather than the linear approximation — the temple is old enough that
 * the difference matters to its own builders' sky (§36).
 * @param {number} raDeg @param {number} decDeg
 * @param {number} fromJD @param {number} toJD
 */
export function precess(raDeg, decDeg, fromJD, toJD, out) {
  const T = (fromJD - J2000) / JCENT;
  const t = (toJD - fromJD) / JCENT;
  const sec = 1 / 3600;
  const zeta = ((2306.2181 + 1.39656 * T - 0.000139 * T * T) * t
    + (0.30188 - 0.000344 * T) * t * t + 0.017998 * t * t * t) * sec * DEG;
  const z = ((2306.2181 + 1.39656 * T - 0.000139 * T * T) * t
    + (1.09468 + 0.000066 * T) * t * t + 0.018203 * t * t * t) * sec * DEG;
  const theta = ((2004.3109 - 0.85330 * T - 0.000217 * T * T) * t
    - (0.42665 + 0.000217 * T) * t * t - 0.041833 * t * t * t) * sec * DEG;

  const ra = raDeg * DEG, dec = decDeg * DEG;
  const A = Math.cos(dec) * Math.sin(ra + zeta);
  const B = Math.cos(theta) * Math.cos(dec) * Math.cos(ra + zeta) - Math.sin(theta) * Math.sin(dec);
  const C = Math.sin(theta) * Math.cos(dec) * Math.cos(ra + zeta) + Math.cos(theta) * Math.sin(dec);
  out.ra = ((Math.atan2(A, B) + z) * RAD % 360 + 360) % 360;
  out.dec = Math.asin(clamp(C, -1, 1)) * RAD;
  return out;
}

/* ------------------------------------------------------------------ */
/* The moon                                                            */
/* ------------------------------------------------------------------ */

const _moon = { ra: 0, dec: 0, distance: 385000, phase: 0, illum: 0, elong: 0 };

/**
 * Moon position — the principal terms of the lunar theory. Good to a few tenths
 * of a degree, which is far finer than the moon's own half-degree disc.
 */
export function moonPosition(jd) {
  const T = (jd - J2000) / JCENT;
  const L = 218.316 + 13.176396 * (jd - J2000);          // mean longitude
  const M = 134.963 + 13.064993 * (jd - J2000);          // mean anomaly
  const F = 93.272 + 13.229350 * (jd - J2000);           // argument of latitude
  const D = 297.8502 + 12.19074912 * (jd - J2000);       // mean elongation
  const Ms = 357.5291 + 0.98560028 * (jd - J2000);       // solar mean anomaly

  const lam = L
    + 6.289 * Math.sin(M * DEG)
    + 1.274 * Math.sin((2 * D - M) * DEG)
    + 0.658 * Math.sin(2 * D * DEG)
    + 0.214 * Math.sin(2 * M * DEG)
    - 0.186 * Math.sin(Ms * DEG)
    - 0.114 * Math.sin(2 * F * DEG);
  const beta = 5.128 * Math.sin(F * DEG)
    + 0.281 * Math.sin((M + F) * DEG)
    - 0.278 * Math.sin((F - M) * DEG)
    - 0.173 * Math.sin((2 * D - F) * DEG);
  const dist = 385001 - 20905 * Math.cos(M * DEG) - 3699 * Math.cos((2 * D - M) * DEG)
    - 2956 * Math.cos(2 * D * DEG);

  // Ecliptic -> equatorial
  const eps = (23.439291 - 0.0130042 * T) * DEG;
  const l = lam * DEG, b = beta * DEG;
  const sinB = Math.sin(b), cosB = Math.cos(b);
  const x = cosB * Math.cos(l);
  const y = Math.cos(eps) * cosB * Math.sin(l) - Math.sin(eps) * sinB;
  const z = Math.sin(eps) * cosB * Math.sin(l) + Math.cos(eps) * sinB;

  _moon.ra = ((Math.atan2(y, x) * RAD) % 360 + 360) % 360;
  _moon.dec = Math.asin(clamp(z, -1, 1)) * RAD;
  _moon.distance = dist;

  // Phase from elongation of the moon from the sun.
  const sunLam = 280.459 + 0.98564736 * (jd - J2000) + 1.915 * Math.sin(Ms * DEG) + 0.020 * Math.sin(2 * Ms * DEG);
  const elong = ((lam - sunLam) % 360 + 360) % 360;
  _moon.elong = elong;
  _moon.illum = (1 - Math.cos(elong * DEG)) * 0.5;
  _moon.phase = elong / 360;                              // 0 new, 0.5 full
  return _moon;
}

/* ------------------------------------------------------------------ */
/* Planets — the wandering stars                                       */
/* ------------------------------------------------------------------ */

/*
 * Mean orbital elements at J2000 with linear rates. Kepler solved to second
 * order. This is the classic low-precision method and lands within about a
 * tenth of a degree over the game's timespan — plenty for the Chamber of
 * Wandering Stars, where what matters is that the planets are really where the
 * orrery says they are.
 */
const PLANETS = [
  //        a (AU)     e         i        L         peri      node    rates...
  { name: "Mercury", a: 0.38709927, e: 0.20563593, i: 7.00497902, L: 252.25032350, w: 77.45779628, node: 48.33076593, aD: 0.00000037, eD: 0.00001906, iD: -0.00594749, LD: 149472.67411175, wD: 0.16047689, nodeD: -0.12534081, color: [0.86, 0.83, 0.76], mag: -0.4 },
  { name: "Venus", a: 0.72333566, e: 0.00677672, i: 3.39467605, L: 181.97909950, w: 131.60246718, node: 76.67984255, aD: 0.00000390, eD: -0.00004107, iD: -0.00078890, LD: 58517.81538729, wD: 0.00268329, nodeD: -0.27769418, color: [1.0, 0.97, 0.88], mag: -4.2 },
  { name: "Mars", a: 1.52371034, e: 0.09339410, i: 1.84969142, L: -4.55343205, w: -23.94362959, node: 49.55953891, aD: 0.00001847, eD: 0.00007882, iD: -0.00813131, LD: 19140.30268499, wD: 0.44441088, nodeD: -0.29257343, color: [1.0, 0.62, 0.42], mag: -1.2 },
  { name: "Jupiter", a: 5.20288700, e: 0.04838624, i: 1.30439695, L: 34.39644051, w: 14.72847983, node: 100.47390909, aD: -0.00011607, eD: -0.00013253, iD: -0.00183714, LD: 3034.74612775, wD: 0.21252668, nodeD: 0.20469106, color: [1.0, 0.93, 0.80], mag: -2.4 },
  { name: "Saturn", a: 9.53667594, e: 0.05386179, i: 2.48599187, L: 49.95424423, w: 92.59887831, node: 113.66242448, aD: -0.00125060, eD: -0.00050991, iD: 0.00193609, LD: 1222.49362201, wD: -0.41897216, nodeD: -0.28867794, color: [0.98, 0.92, 0.72], mag: 0.7 },
];

const _earth = { x: 0, y: 0, z: 0 };
const _pl = { x: 0, y: 0, z: 0 };

function heliocentric(p, T, out) {
  const a = p.a + p.aD * T;
  const e = p.e + p.eD * T;
  const I = (p.i + p.iD * T) * DEG;
  const L = (p.L + p.LD * T) * DEG;
  const w = (p.w + p.wD * T) * DEG;
  const node = (p.node + p.nodeD * T) * DEG;
  const argPeri = w - node;
  let M = L - w;
  M = ((M % TAU) + TAU) % TAU;
  if (M > Math.PI) M -= TAU;
  // Kepler
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 5; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-9) break;
  }
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(argPeri), sw = Math.sin(argPeri);
  const cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(I), si = Math.sin(I);
  out.x = (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp;
  out.y = (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp;
  out.z = (sw * si) * xp + (cw * si) * yp;
  return out;
}

const EARTH = { a: 1.00000261, e: 0.01671123, i: -0.00001531, L: 100.46457166, w: 102.93768193, node: 0.0, aD: 0.00000562, eD: -0.00004392, iD: -0.01294668, LD: 35999.37244981, wD: 0.32327364, nodeD: 0.0 };

const _pout = { ra: 0, dec: 0, mag: 0, name: "", color: null, elong: 0 };

/**
 * Geocentric equatorial position of a planet.
 * @param {number} index into PLANETS
 */
export function planetPosition(index, jd) {
  const T = (jd - J2000) / JCENT;
  const p = PLANETS[index];
  heliocentric(EARTH, T, _earth);
  heliocentric(p, T, _pl);
  const gx = _pl.x - _earth.x, gy = _pl.y - _earth.y, gz = _pl.z - _earth.z;
  const eps = (23.439291 - 0.0130042 * T) * DEG;
  const ce = Math.cos(eps), se = Math.sin(eps);
  const x = gx;
  const y = ce * gy - se * gz;
  const z = se * gy + ce * gz;
  _pout.ra = ((Math.atan2(y, x) * RAD) % 360 + 360) % 360;
  _pout.dec = Math.asin(clamp(z / Math.hypot(x, y, z), -1, 1)) * RAD;
  _pout.name = p.name;
  _pout.color = p.color;
  // Brightness varies with distance; enough to make Mars and Jupiter behave.
  const dEarth = Math.hypot(gx, gy, gz);
  const dSun = Math.hypot(_pl.x, _pl.y, _pl.z);
  _pout.mag = p.mag + 5 * Math.log10(Math.max(0.05, dEarth * dSun));
  return _pout;
}

export function planetCount() { return PLANETS.length; }
export function planetName(i) { return PLANETS[i].name; }

/* ------------------------------------------------------------------ */
/* Atmosphere                                                          */
/* ------------------------------------------------------------------ */

/** Atmospheric extinction in magnitudes at a given altitude. */
export function extinction(altDeg) {
  if (altDeg <= -1) return 12;
  const z = (90 - Math.max(altDeg, -0.9)) * DEG;
  // Kasten & Young airmass — behaves near the horizon where sec(z) explodes.
  const X = 1 / (Math.cos(z) + 0.50572 * Math.pow(96.07995 - z * RAD, -1.6364));
  return 0.23 * Math.min(X, 12);
}

/** Refraction near the horizon, degrees. */
export function refraction(altDeg) {
  if (altDeg > 15) return 0.00452 * 1010 / ((273 + 10) * Math.tan(altDeg * DEG));
  const a = altDeg;
  return (1010 / 1010) * (0.1594 + 0.0196 * a + 0.00002 * a * a) / (1 + 0.505 * a + 0.0845 * a * a);
}

export { PLANETS };
