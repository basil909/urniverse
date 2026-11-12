import * as THREE from 'three'

/* ============================================================
   THE SHIP: its scale, and the two steering helpers the self-flying
   parts share (landing, taking off, the debug placements)
============================================================ */

/** km per scene unit at the planets' scale (Earth: 6,371 km = 0.23) */
export const KM_PER_UNIT = 6371 / 0.23
/** the Shuttle orbiter's true length, 37.24 m, in scene units: Earth is
    some 340,000 ship-lengths across */
export const SHIP_LENGTH = 0.03724 / KM_PER_UNIT
/** the lowest you can fly, in planet radii: 1.0157 is 100 km over Earth,
    the edge of space */
export const LOWEST = 1.0157
/** standing on its wheels: the ship's centre this far above the ground,
 * in ship lengths (the belly about 2 m up, as the real one stood) */
export const ON_WHEELS = 0.195
/** the speed of light, in scene units per second */
export const LIGHT = 299792.458 / KM_PER_UNIT
/** Shift: a warp no ship has, so the outer planets are not hours away */
export const WARP = 40

const _shipBasis = new THREE.Matrix4()
const _shipRight = new THREE.Vector3()
const _shipNose = new THREE.Vector3()
const _shipTop = new THREE.Vector3()
const _shipWant = new THREE.Quaternion()

/* keep a heading flat along the ground (perpendicular to `up`), turned
   by the steering: nose-wheel steering on the ground, a gentle turn in
   the air */
export function flyHeading(heading: THREE.Vector3, up: THREE.Vector3, steer: number, delta: number) {
  heading.addScaledVector(up, -heading.dot(up))
  if (heading.lengthSq() < 1e-12) heading.set(1, 0, 0).cross(up)
  if (heading.lengthSq() < 1e-12) heading.set(0, 0, 1).cross(up)
  heading.normalize()
  if (steer !== 0) heading.applyAxisAngle(up, -steer * 0.5 * delta).normalize()
}

/* turn the ship toward flying along `heading`, on a path `path` radians
   above the horizontal, nose `attack` radians above the path, wings level */
export function aimShip(quaternion: THREE.Quaternion, heading: THREE.Vector3, up: THREE.Vector3, path: number, attack: number, delta: number) {
  const pitch = path + attack
  _shipNose.copy(heading).multiplyScalar(Math.cos(pitch)).addScaledVector(up, Math.sin(pitch))
  _shipTop.copy(heading).multiplyScalar(-Math.sin(pitch)).addScaledVector(up, Math.cos(pitch))
  _shipRight.copy(_shipNose).cross(_shipTop)
  _shipNose.negate()
  _shipBasis.makeBasis(_shipRight, _shipTop, _shipNose)
  _shipWant.setFromRotationMatrix(_shipBasis)
  quaternion.slerp(_shipWant, 1 - Math.exp(-delta * 3)).normalize()
}
