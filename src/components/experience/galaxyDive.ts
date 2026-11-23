import * as THREE from 'three'

import { LY_PER_UNIT, SUN_ANGLE, SUN_RADIUS } from './galaxyLayout'

/* ============================================================
   THE DIVE TO THE CENTRE
   From the Milky Way chapter: the camera falls from the outer halo, far
   above the disc, down past the Orion Nebula to the Sun's place in the
   Orion Spur, inward past the Lagoon and Eagle nebulae, across the inner
   arms and the bar, to Sagittarius A*, the black hole at the centre.
   Scroll (or a trackpad's swipe, a touch, the arrow keys) moves the
   camera along the way, forward or back; the camera follows smoothly.
   The way runs in the galaxy model's own frame (Galaxy.tsx turns it, and
   the camera turns with it): one unit is about 2,270 light-years.
============================================================ */

export const dive = {
  active: false,
  /** where the visitor has scrolled to along the way, 0..1 */
  target: 0,
  /** where the camera is, eased towards the target */
  s: 0,
  /** what the camera is passing, for the captions */
  place: 0,
  /** light-years from the centre */
  distanceLy: 0,
}

/* the galaxy model's turning frame (set by Galaxy.tsx) */
export const galaxyFrame = { object: null as THREE.Object3D | null }

/* directions in the disc from the Sun: towards the centre (galactic
   longitude 0) and along the Sun's way round (longitude 90) */
const UP = new THREE.Vector3(0, 1, 0)
const SUN_DIR = new THREE.Vector3(Math.cos(SUN_ANGLE), 0, Math.sin(SUN_ANGLE))
const SUN = SUN_DIR.clone().multiplyScalar(SUN_RADIUS)
const TO_CENTRE = SUN_DIR.clone().negate()
const LON_90 = UP.clone().cross(TO_CENTRE).normalize()

/** a place by galactic longitude (degrees) and distance from the Sun
    (light-years), and its height above the plane (light-years) */
function galactic(longitude: number, distanceLy: number, heightLy = 0) {
  const l = THREE.MathUtils.degToRad(longitude)
  return SUN.clone()
    .addScaledVector(TO_CENTRE, Math.cos(l) * (distanceLy / LY_PER_UNIT))
    .addScaledVector(LON_90, Math.sin(l) * (distanceLy / LY_PER_UNIT))
    .addScaledVector(UP, heightLy / LY_PER_UNIT)
}

/* ---- the nebulae, where they are (drawn about ten times their size, so
   that they show at all: the Orion Nebula is 24 light-years across, a
   hundredth of a unit) */
export type Nebula = {
  name: string
  at: THREE.Vector3
  radius: number
  /** hydrogen-alpha red, and oxygen's teal (the hot heart) */
  ha: [number, number, number]
  o3: [number, number, number]
  /** a ring with a hollow heart (the Rosette) */
  hollow: number
  seed: number
  bright: number
}
export const NEBULAE: Nebula[] = [
  { name: 'Orion Nebula', at: galactic(209, 1344, -150), radius: 0.17, ha: [1.0, 0.3, 0.42], o3: [0.42, 0.9, 0.95], hollow: 0, seed: 1.3, bright: 1.15 },
  { name: 'Rosette Nebula', at: galactic(206, 5200, -100), radius: 0.22, ha: [1.0, 0.26, 0.34], o3: [0.9, 0.5, 0.55], hollow: 1, seed: 4.1, bright: 0.9 },
  { name: 'Lagoon Nebula', at: galactic(6, 4100, -60), radius: 0.22, ha: [1.0, 0.34, 0.48], o3: [0.6, 0.85, 1.0], hollow: 0, seed: 7.7, bright: 1.0 },
  { name: 'Eagle Nebula', at: galactic(17, 5700, 70), radius: 0.2, ha: [0.95, 0.55, 0.32], o3: [0.35, 0.8, 0.75], hollow: 0, seed: 2.9, bright: 0.95 },
  { name: 'Carina Nebula', at: galactic(287.6, 7500, -40), radius: 0.34, ha: [1.0, 0.36, 0.3], o3: [0.45, 0.78, 0.95], hollow: 0, seed: 9.2, bright: 1.0 },
]

/* ---- the way down, and what is passed on it */
export const DIVE_PLACES = [
  { name: 'The outer halo', note: 'High over the disc, among old stars and globular clusters: the whole Milky Way below.' },
  { name: 'Falling towards the disc', note: 'A hundred billion stars or more, in a disc 100,000 light-years across.' },
  { name: 'Over the Perseus Arm', note: 'The next arm out from ours: young stars and glowing gas along its length.' },
  { name: 'The Orion Nebula', note: 'A stellar nursery 1,344 light-years from the Sun, its heart lit by four young stars.' },
  { name: 'The Orion Spur: home', note: 'The Sun, an ordinary star in a minor arm, 26,000 light-years from the centre.' },
  { name: 'The Lagoon Nebula', note: 'Glowing hydrogen 4,100 light-years towards the centre, in the Sagittarius Arm.' },
  { name: 'The Eagle Nebula', note: 'Home of the Pillars of Creation, columns of gas and dust light-years tall.' },
  { name: 'The Scutum-Centaurus Arm', note: 'One of the two great arms, wound out from the ends of the central bar.' },
  { name: 'The central bar', note: 'Old, red stars in a bar some 30,000 light-years long.' },
  { name: 'Sagittarius A*', note: 'The black hole at the centre: four million times the Sun’s mass, in a space smaller than Mercury’s orbit.' },
]
/* the way: each stop near a nebula some three radii off it, on the side
   the camera comes from, so it fills a good part of the view */
const near = (index: number, from: THREE.Vector3, distance: number, lift = 0) =>
  NEBULAE[index].at.clone().addScaledVector(from.clone().sub(NEBULAE[index].at).normalize(), distance).addScaledVector(UP, lift)
const OVER_PERSEUS = galactic(205, 2800, 650)
const ORION_STOP = near(0, OVER_PERSEUS, 0.55, 0.05)
const LAGOON_STOP = near(2, SUN, 0.62, 0.08)
const EAGLE_STOP = near(3, NEBULAE[2].at, 0.58, 0.1)
const WAY: THREE.Vector3[] = [
  SUN_DIR.clone().multiplyScalar(SUN_RADIUS + 26).addScaledVector(UP, 20),
  SUN_DIR.clone().multiplyScalar(SUN_RADIUS + 10).addScaledVector(UP, 7),
  OVER_PERSEUS,
  ORION_STOP,
  SUN.clone().addScaledVector(UP, 0.12),
  LAGOON_STOP,
  EAGLE_STOP,
  SUN_DIR.clone().multiplyScalar(6.5).addScaledVector(UP, 0.9).addScaledVector(LON_90, -0.6),
  SUN_DIR.clone().multiplyScalar(2.6).addScaledVector(UP, 0.85),
  SUN_DIR.clone().multiplyScalar(0.55).addScaledVector(UP, 0.12),
]
/* the nebula each stop looks at (or none) */
const LOOKS_AT: (number | null)[] = [null, null, null, 0, null, 2, 3, null, null, null]
const curve = new THREE.CatmullRomCurve3(WAY, false, 'centripetal')
/* each stop an equal share of the scroll (the camera slows near them,
   speeds over the long fall from the halo) */
const STOPS = WAY.length - 1

const _p = new THREE.Vector3()
const _look = new THREE.Vector3()
const _centre = new THREE.Vector3()

/** the camera on the way at s (0..1), in the scene; false if the galaxy
    is not there yet */
export function divePose(s: number, outPos: THREE.Vector3, outTarget: THREE.Vector3, outUp: THREE.Vector3) {
  const frame = galaxyFrame.object
  if (!frame) return false
  frame.updateWorldMatrix(true, false)
  const at = THREE.MathUtils.clamp(s, 0, 1)
  curve.getPoint(at, _p)
  // looking a little ahead along the way; turning to frame a nebula as it
  // is passed; at the end, at the centre
  curve.getPoint(Math.min(1, at + 0.03), _look)
  LOOKS_AT.forEach((nebula, stop) => {
    if (nebula === null) return
    const weight = Math.exp(-Math.pow((at - stop / STOPS) / 0.05, 2))
    _look.lerp(NEBULAE[nebula].at, weight * 0.85)
  })
  _centre.set(0, 0, 0)
  _look.lerp(_centre, THREE.MathUtils.smoothstep(at, 0.86, 1))
  if (_look.distanceToSquared(_p) < 1e-8) _look.copy(_centre)
  dive.distanceLy = _p.length() * LY_PER_UNIT
  // the place being passed: the nearest stop, from a little before it
  dive.place = Math.min(STOPS, Math.max(0, Math.floor(at * STOPS + 0.35)))
  outPos.copy(_p).applyMatrix4(frame.matrixWorld)
  outTarget.copy(_look).applyMatrix4(frame.matrixWorld)
  outUp.copy(UP).transformDirection(frame.matrixWorld)
  return true
}
