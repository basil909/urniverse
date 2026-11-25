import * as THREE from 'three'

import { pilot } from './pilotState'
import { ground } from './groundState'
import { KM_PER_UNIT, ON_WHEELS, SHIP_LENGTH } from './flightShip'
import { jumpFor, SURFACES } from '../ui/landingSite'

/* ============================================================
   ON FOOT
   Landed, you can step outside: the view drops to a person's eye height
   (1.6 m, in a suit) beside the Shuttle.
   - W and S walk, A and D step to the side, the arrows turn; the mouse
     looks (click the view to hold it, Esc lets go) or a drag does; on a
     touch screen a thumb stick walks and a drag looks.
   - Your pace follows the world's gravity, as a body's does: an easy
     2 m/s on Earth, little more than a shuffle on the Moon (where the
     Apollo crews moved faster by loping). Shift hurries: a run where
     gravity is strong, the bounding lope where it is weak, each stride a
     low hop. Speed comes and goes with momentum, and with less grip the
     weaker the gravity; the head bobs a little with each step.
   - Space jumps, off the ground at 3.1 m/s (about half a metre on Earth)
     under the world's own gravity: three metres and four seconds on the
     Moon, hundreds of metres and minutes on Phobos (shown faster, and
     said so). Footprints are left in dust.
   - The Shuttle is solid: you walk round its fuselage and gear (under the
     wings, three metres up, you can pass); by the crew hatch on its left
     side, E climbs back aboard.
   - V: watch yourself, a suited figure, from behind.
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
  /** moving: ahead and to the right (m/s); the gait's phase (radians);
      the last hop was a lope (a low stride), not a jump */
  ahead: number
  across: number
  phase: number
  loping: boolean
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
  ahead: 0,
  across: 0,
  phase: 0,
  loping: false,
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

/* the suited figure seen from behind (V): where its feet are (scene
   units), which way it stands, and how it moves */
export const walkerBody = {
  shown: false,
  feet: new THREE.Vector3(),
  turn: new THREE.Quaternion(),
  /** the gait's phase, its speed (m/s), and height in the air (m) */
  phase: 0,
  speed: 0,
  air: 0,
  /** moving ahead and to the right (m/s), loping, the walking pace here
      (m/s), and time since stepping out (s) */
  ahead: 0,
  across: 0,
  loping: false,
  walkPace: 2,
  out: 0,
}

const EYE = 1.6
/* the Shuttle as a walker meets it, in its own frame (ship lengths; nose
   at -z): the fuselage's footprint (and the engines behind it), the main
   gear's legs, and the crew hatch's place on the ground, its left side */
const HULL = { x: 0.1, z0: -0.5, z1: 0.55 }
const MAIN_GEAR = [
  [0.093, 0.21],
  [-0.093, 0.21],
] as const
const HATCH = { x: -0.11, z: -0.36 }
const BODY = 0.4 / 37.24 // a person's reach round them, ship lengths

const _point = new THREE.Vector3()
const _bodyQuat = new THREE.Quaternion()
const _dummyP = new THREE.Vector3()
const _dummyS = new THREE.Vector3()
const _jetLocal = new THREE.Vector3()
const _side = new THREE.Vector3()
const _look = new THREE.Vector3()
const _upWorld = new THREE.Vector3()
const _fwdWorld = new THREE.Vector3()
const _rightWorld = new THREE.Vector3()
const _local = new THREE.Vector3()
const _inverse = new THREE.Quaternion()
const _basis = new THREE.Matrix4()
const _head = new THREE.Vector3()
const _cam = new THREE.Vector3()

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
  walker.ahead = 0
  walker.across = 0
  walker.loping = false
  walkerBody.out = 0
}

/** the walker kept out of the Shuttle: pushed out of its fuselage and gear
    by the shortest way; and whether the crew hatch is within reach */
function keepClear(walker: Walker, jet: THREE.Object3D) {
  const model = ground.model
  if (!model) return false
  const lift = 1 + model.height(walker.dir, ground.fade)
  _point.copy(walker.dir).multiplyScalar(lift).applyMatrix4(ground.matrix)
  _inverse.copy(jet.quaternion).invert()
  _local.copy(_point).sub(jet.position).divideScalar(SHIP_LENGTH).applyQuaternion(_inverse)
  let moved = false
  // the fuselage (and engines): its footprint, with room for a body
  const hx = HULL.x + BODY
  const z0 = HULL.z0 - BODY
  const z1 = HULL.z1 + BODY
  if (Math.abs(_local.x) < hx && _local.z > z0 && _local.z < z1) {
    const side = hx - Math.abs(_local.x)
    const front = _local.z - z0
    const back = z1 - _local.z
    if (side < front && side < back) _local.x = Math.sign(_local.x || 1) * hx
    else if (front < back) _local.z = z0
    else _local.z = z1
    moved = true
  }
  // the main gear's legs, outside it
  for (const [gx, gz] of MAIN_GEAR) {
    const dx = _local.x - gx
    const dz = _local.z - gz
    const r = Math.hypot(dx, dz)
    const reach = 0.022 + BODY
    if (r < reach) {
      const k = reach / Math.max(r, 1e-6)
      _local.x = gx + dx * k
      _local.z = gz + dz * k
      moved = true
    }
  }
  if (moved) {
    _point.copy(_local).applyQuaternion(jet.quaternion).multiplyScalar(SHIP_LENGTH).add(jet.position)
    walker.dir.copy(_point).applyMatrix4(ground.inverse).normalize()
  }
  // within some 6 m of the hatch's foot
  return Math.hypot(_local.x - HATCH.x, _local.z - HATCH.z) < 6 / 37.24 && Math.abs(_local.y + ON_WHEELS) < 0.2
}

/** a step of walking, then the camera at your eyes (or behind you) */
export function stepWalk(
  walker: Walker,
  camera: THREE.PerspectiveCamera,
  keys: Set<string>,
  body: number,
  delta: number,
  jet: THREE.Object3D | null,
) {
  const model = ground.model
  if (!model) return
  const R = metres()
  const surface = SURFACES[body]
  const g = surface?.gravity ?? 9.81
  const onGround = walker.height <= 0

  // ---- looking: the mouse (or a drag), the arrows to turn
  const turn = (keys.has('arrowleft') ? 1 : 0) - (keys.has('arrowright') ? 1 : 0)
  const yaw = -pilot.look.dx * 0.0028 + turn * 1.6 * delta
  walker.pitch = THREE.MathUtils.clamp(walker.pitch - pilot.look.dy * 0.0028, -1.3, 1.3)
  pilot.look.dx = 0
  pilot.look.dy = 0
  if (yaw !== 0) walker.heading.applyAxisAngle(walker.dir, yaw)

  // ---- moving: W and S ahead and back, A and D to the side (or the stick)
  let ahead = (keys.has('w') || keys.has('arrowup') || pilot.touchThrust ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0)
  let across = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0)
  ahead += pilot.walkStick.y
  across += pilot.walkStick.x
  const amount = Math.hypot(ahead, across)
  if (amount > 1) {
    ahead /= amount
    across /= amount
  }
  // the pace gravity allows (a walk speeds up as the square root of g),
  // and hurrying: a run, or where gravity is weak the lope
  const lowG = g < 5
  const walkPace = Math.max(0.6, Math.sqrt(0.5 * g * 0.9))
  const hurry = keys.has('shift')
  const pace = hurry ? (lowG ? THREE.MathUtils.clamp(walkPace * 2.6, 1.2, 3.2) : 4.5) : walkPace
  // momentum: grip, and so how fast pace changes, falls with gravity;
  // in the air there is none
  const grip = onGround ? 2 + 6 * Math.min(1, Math.sqrt(g / 9.81)) : 0.15
  const ease = 1 - Math.exp(-grip * delta)
  walker.ahead += (ahead * pace - walker.ahead) * ease
  walker.across += (across * pace - walker.across) * ease
  const speed = Math.hypot(walker.ahead, walker.across)
  _side.copy(walker.heading).cross(walker.dir).normalize()
  if (speed > 0.01) {
    const step = delta
    walker.dir.addScaledVector(walker.heading, (walker.ahead * step) / R).addScaledVector(_side, (walker.across * step) / R).normalize()
    if (onGround) {
      walker.stride += speed * step
      walker.phase += (speed * step * Math.PI * 2) / 1.5
      if (walker.stride > 0.75) {
        // a footprint, a little to the side of the line walked
        walker.stride = 0
        walker.left = !walker.left
        const sideways = _side.clone().multiplyScalar((walker.left ? -0.13 : 0.13) / R)
        surfaceEvents.footprints.push({ dir: walker.dir.clone().add(sideways).normalize(), heading: walker.heading.clone() })
        // loping: each stride a low hop, some 20 cm
        if (hurry && lowG && speed > 0.8 && surface) {
          walker.rise = Math.sqrt(2 * g * 0.2)
          walker.faster = 1
          walker.loping = true
        }
      }
    }
  } else if (onGround) {
    // standing: the gait settles
    walker.phase += (Math.round(walker.phase / Math.PI) * Math.PI - walker.phase) * (1 - Math.exp(-delta * 6))
  }
  walker.heading.addScaledVector(walker.dir, -walker.heading.dot(walker.dir)).normalize()

  // ---- the Shuttle: walked round, not through; the hatch within reach
  pilot.nearHatch = jet ? keepClear(walker, jet) : false

  // ---- jumping (Space): the world's gravity, weaker with height on the small moons
  const jump = keys.has('jump')
  if (jump && !walker.jumpHeld && onGround && surface) {
    walker.rise = 3.1
    walker.loping = false
    const flight = jumpFor(body)
    // a long time in the air is shown faster: at most some 12 seconds
    walker.faster = Math.max(1, flight.seconds / 12)
    pilot.jump = { height: flight.height, seconds: flight.seconds, faster: walker.faster, count: pilot.jump.count + 1 }
    surfaceEvents.puffs.push({ dir: walker.dir.clone(), count: 10, speed: 1.2 })
  }
  walker.jumpHeld = jump
  if ((walker.height > 0 || walker.rise > 0) && surface) {
    const dt = delta * walker.faster
    const pull = surface.gravity * (R / (R + walker.height)) ** 2
    walker.rise -= pull * dt
    walker.height += walker.rise * dt
    if (walker.height <= 0) {
      walker.height = 0
      walker.rise = 0
      if (walker.loping) {
        // a lope's footfall: a little dust
        surfaceEvents.puffs.push({ dir: walker.dir.clone(), count: 5, speed: 0.9 })
      } else {
        // landing: dust, and two prints side by side
        surfaceEvents.puffs.push({ dir: walker.dir.clone(), count: 16, speed: 1.6 })
        surfaceEvents.footprints.push({ dir: walker.dir.clone(), heading: walker.heading.clone() })
      }
      walker.loping = false
    }
  }
  pilot.walkHeight = walker.loping ? 0 : walker.height

  // ---- the eyes: 1.6 m over the ground here, bobbing a little with each step
  const bob = onGround ? Math.abs(Math.sin(walker.phase)) * 0.035 * Math.min(1, speed / 1.5) - 0.015 * Math.min(1, speed / 1.5) : 0
  const ground0 = 1 + model.height(walker.dir, ground.fade)
  ground.matrix.decompose(_dummyP, _bodyQuat, _dummyS)
  _upWorld.copy(walker.dir).applyQuaternion(_bodyQuat)
  _fwdWorld.copy(walker.heading).applyQuaternion(_bodyQuat)
  _look.copy(walker.heading).multiplyScalar(Math.cos(walker.pitch)).addScaledVector(walker.dir, Math.sin(walker.pitch)).applyQuaternion(_bodyQuat)

  // the figure (for V): its feet, and which way it stands
  _point.copy(walker.dir).multiplyScalar(ground0 + walker.height / R).applyMatrix4(ground.matrix)
  walkerBody.feet.copy(_point)
  _rightWorld.copy(_fwdWorld).cross(_upWorld).normalize()
  _basis.makeBasis(_rightWorld, _upWorld, _fwdWorld.clone().negate())
  walkerBody.turn.setFromRotationMatrix(_basis)
  walkerBody.phase = walker.phase
  walkerBody.speed = speed
  walkerBody.air = walker.loping ? 0 : walker.height
  walkerBody.ahead = walker.ahead
  walkerBody.across = walker.across
  walkerBody.loping = walker.loping
  walkerBody.walkPace = walkPace
  walkerBody.out += delta
  walkerBody.shown = pilot.walkView === 'third'

  _head.copy(walker.dir).multiplyScalar(ground0 + (walker.height + EYE + bob) / R).applyMatrix4(ground.matrix)
  camera.up.copy(_upWorld)
  if (pilot.walkView === 'third') {
    // behind and a little above, looking where you look (in scene units)
    const unit = 1 / (ground.worldRadius > 0 ? R / ground.worldRadius : 1)
    const back = 4.2 * unit
    _cam.copy(_head).addScaledVector(_look, -back).addScaledVector(_upWorld, 0.7 * unit)
    // never into the Shuttle: closer in, short of where the line from
    // your head back to the camera would enter its hull or wings
    if (jet) {
      _inverse.copy(jet.quaternion).invert()
      const headLocal = _local.copy(_head).sub(jet.position).divideScalar(SHIP_LENGTH).applyQuaternion(_inverse).clone()
      const camLocal = _local.copy(_cam).sub(jet.position).divideScalar(SHIP_LENGTH).applyQuaternion(_inverse).clone()
      let keep = 1
      for (let k = 1; k <= 12; k += 1) {
        const at = headLocal.clone().lerp(camLocal, k / 12)
        const hull = Math.abs(at.x) < 0.105 && at.z > -0.52 && at.z < 0.56 && at.y > -0.152 && at.y < 0.02
        const wing = Math.abs(at.x) < 0.36 && at.z > -0.02 && at.z < 0.43 && at.y > -0.13 && at.y < -0.088
        const fin = Math.abs(at.x) < 0.02 && at.z > 0.28 && at.z < 0.52 && at.y > 0 && at.y < 0.16
        if (hull || wing || fin) {
          keep = (k - 1) / 12
          break
        }
      }
      if (keep < 1) _cam.lerpVectors(_head, _cam, Math.max(keep, 0.12))
    }
    // never into the ground
    const camLocal = _point.copy(_cam).applyMatrix4(ground.inverse)
    const r = camLocal.length()
    const floor = 1 + model.height(camLocal.clone().normalize(), ground.fade) + 0.5 / R
    if (r < floor) camLocal.multiplyScalar(floor / r)
    _cam.copy(camLocal).applyMatrix4(ground.matrix)
    camera.position.copy(_cam)
    camera.lookAt(_head.addScaledVector(_upWorld, 0.25 * unit))
  } else {
    camera.position.copy(_head)
    camera.lookAt(_head.add(_look))
  }
  camera.up.set(0, 1, 0)
}
