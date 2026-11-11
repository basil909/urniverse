import * as THREE from 'three'

import {
  AU_UNITS,
  EARTH_RADIUS_KM,
  EARTH_RENDER_RADIUS,
  getPlanetOrbitPosition,
  getPlanetPoleQuaternion,
  getPlanetVisualRadius,
  registerExtraBodies,
  SYSTEM_OFFSET,
} from './orbit'

/* ============================================================
   SPACECRAFT AND STARS, AS PLACES TO FLY TO (flying only)
   Body ids 20-25 are spacecraft, 26-45 named stars (after the planets,
   asteroids, the Moon and the large moons). orbit.ts asks this module for
   their positions, sizes and names.

   Spacecraft (NASA 3D Resources models):
   - the Space Station and Hubble on their real orbits (height,
     inclination, period), though not at their live places along them
     (that needs live tracking data);
   - Webb near the Sun-Earth L2 point, 1.5 million km beyond Earth, on a
     wide halo orbit;
   - Voyager 1 and 2 in their real directions (RA/Dec) and distances,
     moving outward at their real speeds (Voyager 1 is one light-day out
     in November 2026);
   - Perseverance at its real place in Jezero crater, Mars.
   Stars: twenty named stars from the HYG database, at their true 3D
   positions (parsecs, from Hipparcos).
============================================================ */

const KM_PER_UNIT = EARTH_RADIUS_KM / EARTH_RENDER_RADIUS
/** scene units per parsec */
export const PC_UNITS = 206264.806 * AU_UNITS

export const FIRST_CRAFT_ID = 20
export const FIRST_STAR_ID = 26

type Craft =
  | { name: string; model: string; sizeM: number; kind: 'orbit'; altKm: number; inclination: number; node: number; periodMin: number; phase: number }
  | { name: string; model: string; sizeM: number; kind: 'l2' }
  | { name: string; model: string; sizeM: number; kind: 'deep'; ra: number; dec: number; au: number; auPerYear: number }
  | { name: string; model: string; sizeM: number; kind: 'rover'; lat: number; lon: number }

export const SPACECRAFT: readonly Craft[] = [
  { name: 'Space Station', model: '/models/iss.glb', sizeM: 109, kind: 'orbit', altKm: 418, inclination: 51.64, node: 0.6, periodMin: 92.9, phase: 0.3 },
  { name: 'Hubble', model: '/models/hubble.glb', sizeM: 13.2, kind: 'orbit', altKm: 535, inclination: 28.47, node: 2.1, periodMin: 95.4, phase: 2.0 },
  { name: 'Webb', model: '/models/webb.glb', sizeM: 21, kind: 'l2' },
  // distances on 2026-11-11 (JD 2461355.5) and their outward speeds
  { name: 'Voyager 1', model: '/models/voyager.glb', sizeM: 13, kind: 'deep', ra: 258.2, dec: 12.1, au: 173.1, auPerYear: 3.57 },
  { name: 'Voyager 2', model: '/models/voyager.glb', sizeM: 13, kind: 'deep', ra: 301.9, dec: -59.8, au: 145.0, auPerYear: 3.25 },
  { name: 'Perseverance', model: '/models/perseverance.glb', sizeM: 3, kind: 'rover', lat: 18.4447, lon: 77.4508 },
]

export type NamedStar = { name: string; pc: [number, number, number]; absmag: number; ci: number }

/* scene-oriented positions (parsecs from the Sun), absolute magnitude, B-V */
export const NAMED_STARS: readonly NamedStar[] = [
  { name: 'Proxima Centauri', pc: [-0.472264, -0.912446, 0.789553], absmag: 15.447, ci: 1.807 },
  { name: 'Alpha Centauri A', pc: [-0.495203, -0.89647, 0.839994], absmag: 4.379, ci: 0.71 },
  { name: "Barnard's Star", pc: [-0.017373, 0.859425, 1.607392], absmag: 13.235, ci: 1.57 },
  { name: 'Sirius', pc: [-0.494323, -1.681083, -1.970648], absmag: 1.454, ci: 0.009 },
  { name: 'Procyon', pc: [-1.469312, -0.969792, -3.041377], absmag: 2.671, ci: 0.432 },
  { name: 'Altair', pc: [2.355468, 2.510443, 3.802475], absmag: 2.21, ci: 0.221 },
  { name: 'Vega', pc: [0.960565, 6.762913, 3.507291], absmag: 0.604, ci: -0.001 },
  { name: 'Fomalhaut', pc: [6.450517, -2.777758, 3.165626], absmag: 1.737, ci: 0.145 },
  { name: 'Arcturus', pc: [-8.823448, 5.753535, 3.971638], absmag: -0.307, ci: 1.239 },
  { name: 'Capella', pc: [1.712633, 5.099166, -11.970556], absmag: -0.51, ci: 0.795 },
  { name: 'Aldebaran', pc: [7.02722, -1.946884, -19.088306], absmag: -0.682, ci: 1.538 },
  { name: 'Pollux', pc: [-4.055465, 1.205687, -9.45498], absmag: 1.084, ci: 0.991 },
  { name: 'Regulus', pc: [-21.018857, 0.197249, -12.218963], absmag: -0.569, ci: -0.087 },
  { name: 'Betelgeuse', pc: [3.189296, -42.151283, -146.703216], absmag: -5.469, ci: 1.5 },
  { name: 'Rigel', pc: [51.601106, -136.739156, -220.514603], absmag: -6.933, ci: -0.03 },
  { name: 'Polaris', pc: [1.3431, 121.255077, -53.712362], absmag: -3.643, ci: 0.636 },
  { name: 'Antares', pc: [-58.542602, -13.527338, 158.791613], absmag: -5.089, ci: 1.865 },
  { name: 'Deneb', pc: [197.250632, 374.547657, 90.603303], absmag: -6.932, ci: 0.092 },
  { name: 'Spica', pc: [-69.990853, -2.745021, 30.930013], absmag: -3.44, ci: -0.235 },
  { name: 'Canopus', pc: [-5.992679, -91.900392, -22.426768], absmag: -5.504, ci: 0.164 },
]

export const SPACE_BODY_COUNT = SPACECRAFT.length + NAMED_STARS.length

/* a star's surface temperature from its colour (Ballesteros 2012) */
export function starTemperature(ci: number) {
  return 4600 * (1 / (0.92 * ci + 1.7) + 1 / (0.92 * ci + 0.62))
}

/* its radius in solar radii, from luminosity and temperature */
export function starRadiusSolar(star: NamedStar) {
  const luminosity = 10 ** ((4.83 - star.absmag) / 2.5)
  return Math.sqrt(luminosity) * (5772 / starTemperature(star.ci)) ** 2
}

/* the colour of a star of that temperature (approximate blackbody) */
export function starColor(kelvin: number, out = new THREE.Color()) {
  const t = kelvin / 100
  const r = t <= 66 ? 255 : 329.7 * (t - 60) ** -0.1332
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * (t - 60) ** -0.0755
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04
  return out.setRGB(
    THREE.MathUtils.clamp(r, 0, 255) / 255,
    THREE.MathUtils.clamp(g, 0, 255) / 255,
    THREE.MathUtils.clamp(b, 0, 255) / 255,
  )
}

const SUN_RADIUS_UNITS = (696340 / EARTH_RADIUS_KM) * EARTH_RENDER_RADIUS
const DEG = Math.PI / 180
const EPOCH_JD = 2461355.5
const _v = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _earth = new THREE.Vector3()

/* Mars's turning frame, registered by the planet (for the rover) */
export const bodyFrames: Record<number, THREE.Object3D | null> = {}
/* the height of the ground (planet radii) where the rover stands */
export const roverGround = { height: (_dir: THREE.Vector3) => 0 }

const ecliptic = (raDeg: number, decDeg: number, out: THREE.Vector3) => {
  const ra = raDeg * DEG
  const dec = decDeg * DEG
  const x = Math.cos(dec) * Math.cos(ra)
  const y = Math.cos(dec) * Math.sin(ra)
  const z = Math.sin(dec)
  const eps = 23.4392911 * DEG
  // equatorial -> ecliptic -> scene (x -> X, north -> Y, y -> -Z)
  const ye = y * Math.cos(eps) + z * Math.sin(eps)
  const ze = -y * Math.sin(eps) + z * Math.cos(eps)
  return out.set(x, ze, -ye)
}

/** position relative to the Sun (scene units) of body `id` (20 and up) */
export function spaceBodyOrbitPosition(id: number, jd: number, bodyJd: number, out: THREE.Vector3) {
  const index = id - FIRST_CRAFT_ID
  if (index >= SPACECRAFT.length) {
    const star = NAMED_STARS[index - SPACECRAFT.length]
    return out.set(star.pc[0], star.pc[1], star.pc[2]).multiplyScalar(PC_UNITS)
  }
  const craft = SPACECRAFT[index]
  if (craft.kind === 'orbit') {
    // round Earth, in its equatorial frame, tilted by the inclination
    getPlanetOrbitPosition(2, jd, out)
    const radius = (6371 + craft.altKm) / KM_PER_UNIT
    const u = craft.phase + ((bodyJd - 2451545) * 1440 * 2 * Math.PI) / craft.periodMin
    _v.set(Math.cos(u), 0, -Math.sin(u)).multiplyScalar(radius)
    _v.applyAxisAngle(new THREE.Vector3(Math.cos(craft.node), 0, -Math.sin(craft.node)), craft.inclination * DEG)
    return out.add(_v.applyQuaternion(getPlanetPoleQuaternion(2)))
  }
  if (craft.kind === 'l2') {
    // 1.5 million km beyond Earth, circling the line a few hundred
    // thousand km out over half a year
    getPlanetOrbitPosition(2, jd, _earth)
    const away = _v.copy(_earth).normalize()
    out.copy(_earth).addScaledVector(away, 1.5e6 / KM_PER_UNIT)
    const side = new THREE.Vector3(0, 1, 0).cross(away).normalize()
    const up = away.clone().cross(side)
    const a = ((bodyJd - 2451545) / 180) * 2 * Math.PI
    return out.addScaledVector(side, (Math.cos(a) * 5e5) / KM_PER_UNIT).addScaledVector(up, (Math.sin(a) * 3e5) / KM_PER_UNIT)
  }
  if (craft.kind === 'deep') {
    const au = craft.au + ((jd - EPOCH_JD) / 365.25) * craft.auPerYear
    return ecliptic(craft.ra, craft.dec, out).multiplyScalar(au * AU_UNITS)
  }
  // the rover: on Mars, where Mars's turning frame puts Jezero now
  getPlanetOrbitPosition(3, jd, out)
  const u = (craft.lon + 180) / 360
  const v = (craft.lat + 90) / 180
  const theta = (1 - v) * Math.PI
  const phi = u * Math.PI * 2
  _v.set(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta))
  const lift = 1 + roverGround.height(_v)
  const frame = bodyFrames[3]
  if (frame) {
    frame.updateWorldMatrix(true, false)
    frame.getWorldQuaternion(_q)
    _v.applyQuaternion(_q)
  }
  return out.addScaledVector(_v, getPlanetVisualRadius(3) * lift)
}

export function spaceBodyRadius(id: number) {
  const index = id - FIRST_CRAFT_ID
  if (index >= SPACECRAFT.length) return starRadiusSolar(NAMED_STARS[index - SPACECRAFT.length]) * SUN_RADIUS_UNITS
  return SPACECRAFT[index].sizeM / 2 / 1000 / KM_PER_UNIT
}

export function spaceBodyName(id: number) {
  const index = id - FIRST_CRAFT_ID
  if (index >= SPACECRAFT.length) return NAMED_STARS[index - SPACECRAFT.length].name
  return SPACECRAFT[index].name
}

/** distance of the camera from the Sun, in parsecs */
export function parsecsFromSun(point: THREE.Vector3) {
  return point.distanceTo(SYSTEM_OFFSET) / PC_UNITS
}

registerExtraBodies({ position: spaceBodyOrbitPosition, radius: spaceBodyRadius, name: spaceBodyName })
