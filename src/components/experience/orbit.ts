import * as THREE from 'three'

export type PlanetType = 'rocky' | 'earth' | 'gas' | 'ice'

export type PlanetDefinition = {
  name: string
  radiusKm: number
  distanceAU: number
  eccentricity: number
  inclinationDeg: number
  axialTiltDeg: number
  orbitalPeriodDays: number
  rotationPeriodHours: number
  baseColor: string
  atmosphereColor?: string
  textureUrl?: string
  type: PlanetType
  rings?: boolean
}

export const SYSTEM_OFFSET = new THREE.Vector3(3, 0, -8)
/** where the Sun sits in the journey (SYSTEM_OFFSET moves while flying) */
export const SYSTEM_BASE = SYSTEM_OFFSET.clone()

export const EARTH_RADIUS_KM = 6371
export const EARTH_RENDER_RADIUS = 0.23

/* ============================================================
   TRUE SCALE, WHILE FLYING
   The journey compresses distances so the whole Solar System fits on a
   screen. Flying, the planets stand at their real distances instead:
   1 AU is some 5,400 scene units at the planets' scale (Earth's radius
   0.23), so Neptune is 160,000 units out and the Sun, at its true size,
   is 109 Earths wide. `layout.trueScale` switches every position below.
   SYSTEM_OFFSET (the Sun's place) then also moves: the flight keeps the
   camera near the scene's origin (a floating origin), where 32-bit
   numbers on the GPU are precise.
============================================================ */
export const layout = { trueScale: false }
/** scene units per AU at the planets' scale */
export const AU_UNITS = 149597870.7 / (EARTH_RADIUS_KM / EARTH_RENDER_RADIUS)
/** the Sun's true radius in scene units (it is drawn with radius 1) */
export const SUN_TRUE_RADIUS = (696340 / EARTH_RADIUS_KM) * EARTH_RENDER_RADIUS

/* Far bodies at true scale lie beyond any depth buffer's reach (and the
   fog). They are drawn nearer to the camera, along the same line, and
   shrunk by the same factor, so they look exactly as they would: the
   factor for a body at `distance`. Nearer ones keep their order. */
export function farScale(distance: number) {
  const reach = 30 + 8 * Math.log(Math.max(distance, 1))
  return distance > reach ? reach / distance : 1
}

export function getPlanetVisualRadius(index: number) {
  const planet = PLANETS[index]

  if (!planet) return EARTH_RENDER_RADIUS

  // true relative sizes (distances are compressed, sizes are not)
  return (planet.radiusKm / EARTH_RADIUS_KM) * EARTH_RENDER_RADIUS
}

export const PLANETS: readonly PlanetDefinition[] = [
  {
    name: 'Mercury',
    radiusKm: 2439.4,
    distanceAU: 0.387,
    eccentricity: 0.206,
    inclinationDeg: 7.0,
    axialTiltDeg: 0.034,
    orbitalPeriodDays: 87.969,
    rotationPeriodHours: 1407.6,
    baseColor: '#8b857c',
    textureUrl:
      'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia12/pia12397/PIA12397.jpg?crop=faces%2Cfocalpoint&fit=clip&h=1534&w=2048',
    type: 'rocky',
  },
  {
    name: 'Venus',
    radiusKm: 6051.8,
    distanceAU: 0.723,
    eccentricity: 0.007,
    inclinationDeg: 3.394,
    axialTiltDeg: 177.4,
    orbitalPeriodDays: 224.701,
    rotationPeriodHours: -5832.5,
    baseColor: '#d6ad70',
    textureUrl:
      'https://assets.science.nasa.gov/dynamicimage/assets/science/cds/3d/resources/image/venus/preview.webp?w=2048',
    atmosphereColor: '#e4c28b',
    type: 'rocky',
  },
  {
    name: 'Earth',
    radiusKm: 6371.0,
    distanceAU: 1.0,
    eccentricity: 0.0167,
    inclinationDeg: 0,
    axialTiltDeg: 23.44,
    orbitalPeriodDays: 365.256,
    rotationPeriodHours: 23.934,
    baseColor: '#356fa8',
    atmosphereColor: '#4da5ff',
    type: 'earth',
  },
  {
    name: 'Mars',
    radiusKm: 3389.5,
    distanceAU: 1.524,
    eccentricity: 0.0934,
    inclinationDeg: 1.85,
    axialTiltDeg: 25.19,
    orbitalPeriodDays: 686.98,
    rotationPeriodHours: 24.623,
    baseColor: '#a84f38',
    textureUrl:
      'https://assets.science.nasa.gov/dynamicimage/assets/science/cds/3d/resources/image/mars/preview.webp?w=2048',
    atmosphereColor: '#c47762',
    type: 'rocky',
  },
  {
    name: 'Jupiter',
    radiusKm: 69911,
    distanceAU: 5.203,
    eccentricity: 0.0489,
    inclinationDeg: 1.304,
    axialTiltDeg: 3.13,
    orbitalPeriodDays: 4332.59,
    rotationPeriodHours: 9.925,
    baseColor: '#c5a47c',
    textureUrl:
      'https://assets.science.nasa.gov/dynamicimage/assets/science/cds/3d/resources/image/jupiter/preview.webp?w=2048',
    atmosphereColor: '#e1cba8',
    type: 'gas',
  },
  {
    name: 'Saturn',
    radiusKm: 58232,
    distanceAU: 9.537,
    eccentricity: 0.0565,
    inclinationDeg: 2.485,
    axialTiltDeg: 26.73,
    orbitalPeriodDays: 10759.22,
    rotationPeriodHours: 10.656,
    baseColor: '#cdb88c',
    textureUrl:
      'https://assets.science.nasa.gov/dynamicimage/assets/science/cds/3d/resources/image/saturn/preview.webp?w=2048',
    atmosphereColor: '#ead7ae',
    type: 'gas',
    rings: true,
  },
  {
    name: 'Uranus',
    radiusKm: 25362,
    distanceAU: 19.191,
    eccentricity: 0.0472,
    inclinationDeg: 0.772,
    axialTiltDeg: 97.77,
    orbitalPeriodDays: 30688.5,
    rotationPeriodHours: -17.24,
    baseColor: '#8ac8cf',
    textureUrl:
      'https://assets.science.nasa.gov/dynamicimage/assets/science/cds/3d/resources/image/uranus/preview.webp?w=2048',
    atmosphereColor: '#a7e5e6',
    type: 'ice',
    rings: true,
  },
  {
    name: 'Neptune',
    radiusKm: 24622,
    distanceAU: 30.07,
    eccentricity: 0.0086,
    inclinationDeg: 1.769,
    axialTiltDeg: 28.32,
    orbitalPeriodDays: 60182,
    rotationPeriodHours: 16.11,
    baseColor: '#315ba5',
    textureUrl:
      'https://assets.science.nasa.gov/dynamicimage/assets/science/cds/3d/resources/image/neptune/preview.webp?w=2048',
    atmosphereColor: '#4e80d4',
    type: 'ice',
    rings: true,
  },
]

export function orbitalDisplayDistance(distanceAU: number) {
  const INNER_BUFFER = 2.8
  const ORBIT_SCALE = 2.75
  const ORBIT_EXPONENT = 0.88

  return INNER_BUFFER + ORBIT_SCALE * Math.pow(distanceAU, ORBIT_EXPONENT)
}

export function solveKepler(meanAnomaly: number, eccentricity: number) {
  let E = eccentricity < 0.8 ? meanAnomaly : Math.PI

  for (let i = 0; i < 8; i += 1) {
    const f = E - eccentricity * Math.sin(E) - meanAnomaly
    const fp = 1 - eccentricity * Math.cos(E)
    E -= f / fp
  }

  return E
}

/* ============================================================
   REAL ORBITS
   JPL "Keplerian Elements for Approximate Positions of the Major
   Planets" (E. M. Standish), Table 1: J2000 elements and their rates
   per Julian century, valid 1800-2050. Accurate to well under a degree
   in direction, far finer than anything visible on screen.

   Positions are heliocentric ecliptic coordinates in AU. For display,
   the direction is kept exactly and only the distance from the Sun is
   compressed (orbitalDisplayDistance), so the outer planets fit.
   Scene axes: ecliptic x -> X, ecliptic north (z) -> Y, ecliptic y -> -Z.
============================================================ */

// a (AU), a/cy, e, e/cy, I (deg), I/cy, L (deg), L/cy, long. perihelion, /cy, long. node, /cy
type OrbitalElements = readonly [
  number, number, number, number, number, number,
  number, number, number, number, number, number,
]

const ELEMENTS: readonly OrbitalElements[] = [
  [0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.2503235, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081], // Mercury
  [0.72333566, 0.0000039, 0.00677672, -0.00004107, 3.39467605, -0.0007889, 181.9790995, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418], // Venus
  [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0], // Earth-Moon barycentre
  [1.52371034, 0.00001847, 0.0933941, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343], // Mars
  [5.202887, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106], // Jupiter
  [9.53667594, -0.0012506, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794], // Saturn
  [19.18916464, -0.00196176, 0.04725744, -0.00004397, 0.77263783, -0.00242939, 313.23810451, 428.48202785, 170.9542763, 0.40805281, 74.01692503, 0.04240589], // Uranus
  [30.06992276, 0.00026291, 0.00859048, 0.00005105, 1.77004347, 0.00035372, -55.12002969, 218.45945325, 44.96476227, -0.32241464, 131.78422574, -0.00508664], // Neptune
]

export const J2000 = 2451545.0

/** Julian Date for a JavaScript Date */
export function julianDate(date: Date) {
  return date.getTime() / 86400000 + 2440587.5
}

const DEG = Math.PI / 180

type OrbitAtEpoch = {
  a: number
  e: number
  meanAnomaly: number
  // rotation from the orbital plane to ecliptic coordinates
  px: [number, number, number]
  qx: [number, number, number]
}

function orbitAt(index: number, jd: number): OrbitAtEpoch | null {
  const el = ELEMENTS[index]
  if (!el) return null
  const T = (jd - J2000) / 36525
  const a = el[0] + el[1] * T
  const e = el[2] + el[3] * T
  const I = (el[4] + el[5] * T) * DEG
  const L = el[6] + el[7] * T
  const peri = el[8] + el[9] * T
  const node = el[10] + el[11] * T

  let M = (L - peri) % 360
  if (M > 180) M -= 360
  if (M < -180) M += 360

  const w = (peri - node) * DEG
  const O = node * DEG
  const cw = Math.cos(w)
  const sw = Math.sin(w)
  const cO = Math.cos(O)
  const sO = Math.sin(O)
  const cI = Math.cos(I)
  const sI = Math.sin(I)

  return {
    a,
    e,
    meanAnomaly: M * DEG,
    px: [cw * cO - sw * sO * cI, cw * sO + sw * cO * cI, sw * sI],
    qx: [-sw * cO - cw * sO * cI, -sw * sO + cw * cO * cI, cw * sI],
  }
}

/* Orbit point for an eccentric anomaly, in AU ecliptic, then to display */
function toDisplay(orbit: OrbitAtEpoch, E: number, out: THREE.Vector3) {
  const xp = orbit.a * (Math.cos(E) - orbit.e)
  const yp = orbit.a * Math.sqrt(1 - orbit.e * orbit.e) * Math.sin(E)
  const x = orbit.px[0] * xp + orbit.qx[0] * yp
  const y = orbit.px[1] * xp + orbit.qx[1] * yp
  const z = orbit.px[2] * xp + orbit.qx[2] * yp
  const r = Math.sqrt(x * x + y * y + z * z) || 1
  const scale = layout.trueScale ? AU_UNITS : orbitalDisplayDistance(r) / r
  return out.set(x * scale, z * scale, -y * scale)
}

/**
 * Planet position relative to the Sun, in scene units, at a Julian Date.
 */
export function getPlanetOrbitPosition(
  index: number,
  jd: number,
  out: THREE.Vector3,
) {
  const orbit = orbitAt(index, jd)
  if (!orbit) return out.set(0, 0, 0)
  const E = solveKepler(orbit.meanAnomaly, orbit.e)
  return toDisplay(orbit, E, out)
}

/**
 * For flat diagrams: the planet's heliocentric position in the ecliptic
 * plane (AU, x towards the vernal equinox, y 90 degrees ahead), and its
 * orbit as a list of points.
 */
export function getPlanetEclipticAU(index: number, jd: number): [number, number] {
  const orbit = orbitAt(index, jd)
  if (!orbit) return [0, 0]
  const E = solveKepler(orbit.meanAnomaly, orbit.e)
  return eclipticPoint(orbit, E)
}

export function getPlanetOrbitPathAU(index: number, jd: number, samples = 96): [number, number][] {
  const orbit = orbitAt(index, jd)
  if (!orbit) return []
  const points: [number, number][] = []
  for (let i = 0; i <= samples; i += 1) {
    points.push(eclipticPoint(orbit, (i / samples) * Math.PI * 2))
  }
  return points
}

function eclipticPoint(orbit: OrbitAtEpoch, E: number): [number, number] {
  const xp = orbit.a * (Math.cos(E) - orbit.e)
  const yp = orbit.a * Math.sqrt(1 - orbit.e * orbit.e) * Math.sin(E)
  return [orbit.px[0] * xp + orbit.qx[0] * yp, orbit.px[1] * xp + orbit.qx[1] * yp]
}

/**
 * A point on the planet's (real, oriented, inclined) orbit, for drawing
 * the orbit line. `eccentricAnomaly` runs 0..2PI around the ellipse.
 */
export function getPlanetOrbitEllipsePoint(
  index: number,
  eccentricAnomaly: number,
  jd: number,
  out: THREE.Vector3,
) {
  const orbit = orbitAt(index, jd)
  if (!orbit) return out.set(0, 0, 0)
  return toDisplay(orbit, eccentricAnomaly, out)
}

/**
 * World-space planet position used by the camera.
 */
export function getPlanetPosition(
  index: number,
  jd: number,
  out: THREE.Vector3,
) {
  getPlanetOrbitPosition(index, jd, out)
  return out.add(SYSTEM_OFFSET)
}

/* ============================================================
   REAL SPIN AXES
   IAU north-pole directions (RA, Dec in degrees, J2000 equatorial),
   converted to ecliptic and then scene axes. This gives every planet
   its true axial tilt pointing the true way, so seasons, Saturn's ring
   angle to the Sun (and its shadows) and Uranus lying on its side are
   all real. Venus and Uranus spin backwards about these poles.
============================================================ */

const POLES: readonly (readonly [number, number])[] = [
  [281.0103, 61.4155], // Mercury
  [272.76, 67.16], // Venus
  [0, 90], // Earth
  [317.68143, 52.8865], // Mars
  [268.057, 64.495], // Jupiter
  [40.589, 83.537], // Saturn
  [257.311, -15.175], // Uranus
  [299.36, 43.46], // Neptune
]

const OBLIQUITY_J2000 = 23.4392911 * DEG
const UP = new THREE.Vector3(0, 1, 0)

/** Rotation that turns the planet's local +Y into its real north pole */
export function getPlanetPoleQuaternion(index: number) {
  const pole = POLES[index] ?? [0, 90]
  const ra = pole[0] * DEG
  const dec = pole[1] * DEG
  const x = Math.cos(dec) * Math.cos(ra)
  const y = Math.cos(dec) * Math.sin(ra)
  const z = Math.sin(dec)
  // equatorial -> ecliptic
  const ex = x
  const ey = y * Math.cos(OBLIQUITY_J2000) + z * Math.sin(OBLIQUITY_J2000)
  const ez = -y * Math.sin(OBLIQUITY_J2000) + z * Math.cos(OBLIQUITY_J2000)
  // ecliptic -> scene (same mapping as the orbits)
  const axis = new THREE.Vector3(ex, ez, -ey).normalize()
  return new THREE.Quaternion().setFromUnitVectors(UP, axis)
}

/** Eccentric anomaly of the planet at a Julian Date (for drawing trails) */
export function getPlanetEccentricAnomaly(index: number, jd: number) {
  const orbit = orbitAt(index, jd)
  return orbit ? solveKepler(orbit.meanAnomaly, orbit.e) : 0
}

/* Sunlight at the planet: dims gently with distance (a soft version of
   the inverse-square law, so the outer planets stay visible) and shifts
   from slightly warm near the Sun to cool far out. */
const WARM_LIGHT = new THREE.Color(1.0, 0.93, 0.84)
const COOL_LIGHT = new THREE.Color(0.84, 0.92, 1.08)

export function getPlanetSunlight(index: number) {
  const au = PLANETS[index]?.distanceAU ?? 1
  const strength = THREE.MathUtils.clamp(Math.pow(1 / au, 0.3), 0.36, 1.25)
  const t = THREE.MathUtils.clamp(
    (Math.log(au) + 1) / (Math.log(30) + 1),
    0,
    1,
  )
  const tint = WARM_LIGHT.clone().lerp(COOL_LIGHT, t)
  return { strength, tint }
}
