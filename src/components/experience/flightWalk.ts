import * as THREE from 'three'

import { pilot } from './pilotState'
import { ground } from './groundState'
import { KM_PER_UNIT, SHIP_LENGTH } from './flightShip'
import { jumpFor, SURFACES } from '../ui/landingSite'

/* ============================================================
   ON FOOT
   Landed, you can step outside: the view drops to a person's eye height
   (1.6 m, in a suit) beside the Shuttle. W and S walk, A and D turn (or
   drag to look), Shift hurries, Space jumps, off the ground at 3.1 m/s
   (about half a metre on Earth) under the world's own gravity: three
   metres and four seconds on the Moon, hundreds of metres and minutes
   on Phobos (shown faster, and said so). Footprints are left in dust.
   Positions are kept in the world's own frame (radius 1), so standing
   still you turn with it.
============================================================ */

export type Walker = {
  /** where, on the unit sphere of the world's own frame */
  dir: THREE.Vector3
  /** which way you face, along the ground (same frame) */
  heading: THREE.Vector3
  pitch: number
  /** above the ground (m), and rising (m/s) */
  height: number
  rise: number
  faster: number
  jumpHeld: boolean
  /** metres since the last footprint, and which foot */
  stride: number
  left: boolean
}

export const newWalker = (): Walker => ({
  dir: new THREE.Vector3(0, 1, 0),
  heading: new THREE.Vector3(1, 0, 0),
  pitch: 0,
  height: 0,
  rise: 0,
  faster: 1,
  jumpHeld: false,
  stride: 0,
  left: false,
})

/* what the surface scene picks up: footprints and puffs of dust, each
   where it happened (the world's own frame) */
export const surfaceEvents = {
  footprints: [] as { dir: THREE.Vector3; heading: THREE.Vector3 }[],
  /** dust kicked up: where, how many grains, how hard (m/s) */
  puffs: [] as { dir: THREE.Vector3; count: number; speed: number }[],
  /** a flag to plant: where, and which way its planter faced */
  flag: null as null | { dir: THREE.Vector3; heading: THREE.Vector3 },
}

const EYE = 1.6
const _point = new THREE.Vector3()
const _bodyQuat = new THREE.Quaternion()
const _dummyP = new THREE.Vector3()
const _dummyS = new THREE.Vector3()
const _jetLocal = new THREE.Vector3()
const _side = new THREE.Vector3()
const _look = new THREE.Vector3()
const _upWorld = new THREE.Vector3()

/** metres per unit of the world's own frame */
const metres = () => ground.worldRadius * KM_PER_UNIT * 1000

export function startWalk(walker: Walker, jet: THREE.Object3D) {
  // out by the left wing, some 50 m off, looking back at the ship
  _point.set(-1.05, 0, -0.85).multiplyScalar(SHIP_LENGTH).applyQuaternion(jet.quaternion).add(jet.position)
  walker.dir.copy(_point).applyMatrix4(ground.inverse).normalize()
  _jetLocal.copy(jet.position).applyMatrix4(ground.inverse).normalize()
  walker.heading.copy(_jetLocal).sub(walker.dir)
  walker.heading.addScaledVector(walker.dir, -walker.heading.dot(walker.dir)).normalize()
  walker.pitch = 0.1
  walker.height = 0
  walker.rise = 0
  walker.faster = 1
  walker.stride = 0
}

/** a step of walking, then the camera at your eyes */
export function stepWalk(walker: Walker, camera: THREE.PerspectiveCamera, keys: Set<string>, body: number, delta: number) {
  const model = ground.model
  if (!model) return
  const R = metres()
  // looking: a drag, or A and D (and the arrows) to turn
  const turn = (keys.has('a') || keys.has('arrowleft') ? 1 : 0) - (keys.has('d') || keys.has('arrowright') ? 1 : 0)
  const yaw = -pilot.look.dx * 0.0035 + turn * 1.5 * delta
  walker.pitch = THREE.MathUtils.clamp(walker.pitch - pilot.look.dy * 0.0035, -1.3, 1.3)
  pilot.look.dx = 0
  pilot.look.dy = 0
  if (yaw !== 0) walker.heading.applyAxisAngle(walker.dir, yaw)
  // walking: about a brisk 2 m/s, 6 hurrying
  const ahead = (keys.has('w') || keys.has('arrowup') || pilot.touchThrust ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0)
  const move = ahead * (keys.has('shift') ? 6 : 2) * delta
  if (move !== 0) {
    walker.dir.addScaledVector(walker.heading, move / R).normalize()
    if (walker.height <= 0) {
      walker.stride += Math.abs(move)
      if (walker.stride > 0.75) {
        // a footprint, a little to the side of the line walked
        walker.stride = 0
        walker.left = !walker.left
        _side.copy(walker.heading).cross(walker.dir).multiplyScalar((walker.left ? -0.13 : 0.13) / R)
        surfaceEvents.footprints.push({ dir: walker.dir.clone().add(_side).normalize(), heading: walker.heading.clone() })
      }
    }
  }
  walker.heading.addScaledVector(walker.dir, -walker.heading.dot(walker.dir)).normalize()
  // jumping (Space): the world's gravity, weaker with height on the small moons
  const surface = SURFACES[body]
  const jump = keys.has('jump')
  if (jump && !walker.jumpHeld && walker.height <= 0 && surface) {
    walker.rise = 3.1
    const flight = jumpFor(body)
    // a long time in the air is shown faster: at most some 12 seconds
    walker.faster = Math.max(1, flight.seconds / 12)
    pilot.jump = { height: flight.height, seconds: flight.seconds, faster: walker.faster, count: pilot.jump.count + 1 }
    surfaceEvents.puffs.push({ dir: walker.dir.clone(), count: 10, speed: 1.2 })
  }
  walker.jumpHeld = jump
  if ((walker.height > 0 || walker.rise > 0) && surface) {
    const dt = delta * walker.faster
    const g = surface.gravity * (R / (R + walker.height)) ** 2
    walker.rise -= g * dt
    walker.height += walker.rise * dt
    if (walker.height <= 0) {
      walker.height = 0
      walker.rise = 0
      // landing: dust, and two prints side by side
      surfaceEvents.puffs.push({ dir: walker.dir.clone(), count: 16, speed: 1.6 })
      surfaceEvents.footprints.push({ dir: walker.dir.clone(), heading: walker.heading.clone() })
    }
  }
  pilot.walkHeight = walker.height

  // the eyes: 1.6 m over the ground here
  const lift = 1 + model.height(walker.dir, ground.fade) + (walker.height + EYE) / R
  _point.copy(walker.dir).multiplyScalar(lift).applyMatrix4(ground.matrix)
  ground.matrix.decompose(_dummyP, _bodyQuat, _dummyS)
  _upWorld.copy(walker.dir).applyQuaternion(_bodyQuat)
  _look
    .copy(walker.heading)
    .multiplyScalar(Math.cos(walker.pitch))
    .addScaledVector(walker.dir, Math.sin(walker.pitch))
    .applyQuaternion(_bodyQuat)
  camera.position.copy(_point)
  camera.up.copy(_upWorld)
  camera.lookAt(_point.add(_look))
  camera.up.set(0, 1, 0)
}
