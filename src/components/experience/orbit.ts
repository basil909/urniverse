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
  phase: number
}

export const SYSTEM_OFFSET = new THREE.Vector3(3, 0, -8)

export const EARTH_ORBIT_SPEED = 0.012

export const EARTH_RADIUS_KM = 6371
export const EARTH_RENDER_RADIUS = 0.23

export function getPlanetVisualRadius(index: number) {
  const planet = PLANETS[index]

  if (!planet) return EARTH_RENDER_RADIUS

  let renderRadius =
    (planet.radiusKm / EARTH_RADIUS_KM) * EARTH_RENDER_RADIUS

  if (planet.name === 'Jupiter') renderRadius *= 0.64
  if (planet.name === 'Saturn') renderRadius *= 0.66

  return renderRadius
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
    phase: 0,
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
    phase: 0.78,
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
    phase: 1.56,
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
    phase: 2.34,
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
    phase: 5.75,
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
    phase: 0.35,
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
    phase: 4.68,
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
    phase: 5.46,
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

const X_AXIS = new THREE.Vector3(1, 0, 0)
const SCRATCH_ORBIT = new THREE.Vector3()

export function getPlanetOrbitPosition(
  index: number,
  progress: number,
  out: THREE.Vector3,
) {
  const planet = PLANETS[index]

  if (!planet) {
    out.set(0, 0, 0)
    return out
  }

  const semiMajorAxis = orbitalDisplayDistance(planet.distanceAU)
  const meanAnomaly =
    planet.phase +
    progress * EARTH_ORBIT_SPEED * (365.256 / planet.orbitalPeriodDays)

  const E = solveKepler(meanAnomaly, planet.eccentricity)
  const semiMinorAxis =
    semiMajorAxis * Math.sqrt(1 - planet.eccentricity * planet.eccentricity)

  out.set(
    semiMajorAxis * (Math.cos(E) - planet.eccentricity),
    0,
    semiMinorAxis * Math.sin(E),
  )

  return out
}


export function getPlanetOrbitEllipsePoint(
  index: number,
  eccentricAnomaly: number,
  out: THREE.Vector3,
) {
  const planet = PLANETS[index]

  if (!planet) {
    out.set(0, 0, 0)
    return out
  }

  const a = orbitalDisplayDistance(planet.distanceAU)
  const b =
    a * Math.sqrt(1 - planet.eccentricity * planet.eccentricity)

  out.set(
    a * (Math.cos(eccentricAnomaly) - planet.eccentricity),
    0,
    b * Math.sin(eccentricAnomaly),
  )

  return out
}

/**
 * World-space planet position used by the camera.
 * Inclination and the shared Solar System offset are applied here.
 */
export function getPlanetPosition(
  index: number,
  progress: number,
  out: THREE.Vector3,
) {
  getPlanetOrbitPosition(index, progress, SCRATCH_ORBIT)

  const planet = PLANETS[index]

  if (!planet) {
    out.copy(SYSTEM_OFFSET)
    return out
  }

  SCRATCH_ORBIT.applyAxisAngle(
    X_AXIS,
    THREE.MathUtils.degToRad(planet.inclinationDeg),
  )

  out.copy(SCRATCH_ORBIT).add(SYSTEM_OFFSET)
  return out
}
