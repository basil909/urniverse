import * as THREE from 'three'

import { pilot } from './pilotState'
import { bodyFrames } from './spaceBodies'
import { getBodyPosition, getBodyRadius } from './orbit'
import { simClock } from './simClock'
import { aimShip, KM_PER_UNIT } from './flightShip'

/* ============================================================
   SHUTTLE MISSIONS FROM AND TO KENNEDY
   Launch: from Launch Complex 39A, flown for you along the Shuttle's own
   ascent (heading north-east, 42 degrees, as for the Space Station):
   straight up off the pad, the roll program, Max Q, the boosters away at
   2:04, main engine cut-off at 8:30, about 113 km up at 7.7 km/s, the
   external tank away, and into orbit. The mission clock shows the real
   T+ time; it runs 2.5 times faster than real time.
   Return: re-entry and the glide home to the Shuttle Landing Facility's
   runway 15, from 1,500 km out and 80 km up at 6.5 km/s, nose held 40
   degrees up (the belly's tiles take the heat), down the real profile of
   height and speed against distance, then the self-flying landing takes
   over about 6 km out: final glide, flare, touchdown, roll-out.
   Positions are on Earth's own (turning) frame, a unit sphere.
============================================================ */

export const PAD_39A = { lat: 28.6083, lon: -80.6041 }
/** runway 15 at the Shuttle Landing Facility: its threshold, and heading */
export const RUNWAY_15 = { lat: 28.6328, lon: -80.7062, heading: 150 }
const EARTH_KM = 6371
const LAUNCH_SPEEDUP = 2.5
const RETURN_SPEEDUP = 3

/* the Shuttle's ascent: seconds, height km, downrange km, speed km/s */
const ASCENT: [number, number, number, number][] = [
  [0, 0, 0, 0],
  [10, 0.15, 0, 0.06],
  [30, 1.6, 0.4, 0.2],
  [60, 10, 5, 0.45],
  [90, 24, 20, 0.8],
  [124, 46, 50, 1.38],
  [180, 75, 110, 1.7],
  [240, 95, 210, 2.2],
  [300, 105, 350, 3.0],
  [360, 108, 520, 4.0],
  [420, 110, 750, 5.3],
  [480, 112, 1050, 6.9],
  [510, 113, 1250, 7.7],
  [540, 113, 1480, 7.7],
]
export const ASCENT_EVENTS: [number, string][] = [
  [0.5, 'Lift-off'],
  [7, 'Roll program: turning onto the heading for orbit'],
  [55, 'Max Q: the most stress the air puts on the ship'],
  [124, 'Booster separation: the two solid rockets fall away'],
  [510, 'Main engine cut-off'],
  [528, 'External tank separation'],
]
/* the return: distance to go (km), height km, speed km/s */
const RETURN: [number, number, number][] = [
  [1500, 80, 6.5],
  [1000, 60, 5.0],
  [600, 48, 3.2],
  [300, 35, 1.8],
  [150, 26, 0.9],
  [60, 15, 0.45],
  [20, 5, 0.2],
  [10, 2.8, 0.16],
  [6, 2.2, 0.15],
  [0, 0, 0.1],
]
export const RETURN_EVENTS: [number, string][] = [
  [1499, 'Re-entry: 80 km up at 6.5 km/s, the belly to the air'],
  [600, 'Hypersonic: the glow fades as the air slows the ship'],
  [100, 'Kennedy in sight: lining up on runway 15'],
]

function table(rows: number[][], x: number, column: number) {
  if (x <= rows[0][0]) return rows[0][column]
  for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i - 1]
    const b = rows[i]
    if (x <= b[0]) return THREE.MathUtils.lerp(a[column], b[column], (x - a[0]) / (b[0] - a[0]))
  }
  return rows[rows.length - 1][column]
}
// the return table runs from far to near
function tableDown(rows: number[][], x: number, column: number) {
  if (x >= rows[0][0]) return rows[0][column]
  for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i - 1]
    const b = rows[i]
    if (x >= b[0]) return THREE.MathUtils.lerp(a[column], b[column], (a[0] - x) / (a[0] - b[0]))
  }
  return rows[rows.length - 1][column]
}

/** a place's direction on the unit sphere (three.js's sphere layout) */
export function surfaceDir(lat: number, lon: number, out = new THREE.Vector3()) {
  const u = (lon + 180) / 360
  const la = (lat * Math.PI) / 180
  return out.set(-Math.cos(2 * Math.PI * u) * Math.cos(la), Math.sin(la), Math.sin(2 * Math.PI * u) * Math.cos(la))
}
/** east and north at a direction on the sphere */
function frameAt(d: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3) {
  east.set(0, 1, 0).cross(d).normalize()
  north.copy(d).cross(east)
}
/** the direction `km` along the ground from d, heading `bearing` (degrees from north) */
function travel(d: THREE.Vector3, bearing: number, km: number, out: THREE.Vector3) {
  frameAt(d, _east, _north)
  const b = (bearing * Math.PI) / 180
  _way.copy(_north).multiplyScalar(Math.cos(b)).addScaledVector(_east, Math.sin(b))
  const s = km / EARTH_KM
  return out.copy(d).multiplyScalar(Math.cos(s)).addScaledVector(_way, Math.sin(s)).normalize()
}

const _east = new THREE.Vector3()
const _north = new THREE.Vector3()
const _way = new THREE.Vector3()
const _d = new THREE.Vector3()
const _d2 = new THREE.Vector3()
const _pos = new THREE.Vector3()
const _up = new THREE.Vector3()
const _heading = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _prev = new THREE.Vector3()

type Ref<T> = { current: T }
export type MissionMemory = {
  time: number
  note: number
  /** the return: where the ship is on the ground (unit sphere) and its height km */
  ground: THREE.Vector3
  height: number
}
export const newMission = (): MissionMemory => ({ time: 0, note: 0, ground: new THREE.Vector3(), height: 0 })

/** the launch stack's state, for drawing it: seconds since each part left (-1: still on) */
export const stack = { attached: false, boosterGone: -1, tankGone: -1, boosterFire: 0 }

type Frame = {
  jet: THREE.Object3D
  velocity: Ref<THREE.Vector3>
  speed: Ref<number>
  heading: Ref<THREE.Vector3>
  memory: MissionMemory
  delta: number
}

/* Earth's frame this frame: where it is (from its orbit, always current:
   its mesh is moved later in the frame, and would lag a re-centring of
   the floating origin), its turn (from the mesh), and its radius */
const _earth = new THREE.Matrix4()
const _scale = new THREE.Vector3()
function earth() {
  const body = bodyFrames[2]
  if (!body) return null
  body.getWorldQuaternion(_quat)
  getBodyPosition(2, simClock.jd, _pos)
  return _earth.compose(_pos, _quat, _scale.setScalar(getBodyRadius(2)))
}

/* place the ship at a direction on Earth and a height (km) above sea level */
function place(jet: THREE.Object3D, frame: THREE.Matrix4, d: THREE.Vector3, km: number) {
  jet.position.copy(d).multiplyScalar(1 + km / EARTH_KM).applyMatrix4(frame)
}

export function startLaunch(memory: MissionMemory) {
  memory.time = 0
  memory.note = 0
  stack.attached = true
  stack.boosterGone = -1
  stack.tankGone = -1
  pilot.landState = 'launching'
  pilot.orbiting = false
}

export function stepLaunch({ jet, velocity, speed, memory, delta }: Frame) {
  const body = earth()
  if (!body) return
  const first = memory.time === 0
  memory.time += delta * LAUNCH_SPEEDUP
  const t = memory.time
  // the events, as they come
  while (memory.note < ASCENT_EVENTS.length && t >= ASCENT_EVENTS[memory.note][0]) {
    pilot.missionNote = ASCENT_EVENTS[memory.note][1]
    memory.note += 1
  }
  // (each part's fall is timed where it is drawn)
  if (t >= 124 && stack.boosterGone === -1) stack.boosterGone = 0
  if (t >= 528 && stack.tankGone === -1) stack.tankGone = 0
  stack.boosterFire = t < 124 ? 1 : 0

  const height = table(ASCENT, t, 1)
  const along = table(ASCENT, t, 2)
  const pad = surfaceDir(PAD_39A.lat, PAD_39A.lon, _d2)
  travel(pad, 42, along, _d)
  _prev.copy(jet.position)
  // the ship's middle stands some 30 m up on the pad
  place(jet, body, _d, height + 0.03)
  // its nose: straight up off the pad, pitching over along the path
  const ahead = Math.min(t + 2, 540)
  const climb = Math.atan2(table(ASCENT, ahead, 1) - height, Math.max(table(ASCENT, ahead, 2) - along, 1e-3))
  const pitch = t < 8 ? Math.PI / 2 - 0.001 : climb
  _up.copy(_d).applyQuaternion(_quat)
  travel(_d, 42, 1, _d2)
  _heading.copy(_d2).sub(_d).applyQuaternion(_quat).normalize()
  aimShip(jet.quaternion, _heading, _up, pitch, 0, delta * 4)
  // its motion (for the camera, the air rushing past and the heat; from
  // rest on the first frame, which jumped the ship to the pad)
  if (first) velocity.current.set(0, 0, 0)
  else velocity.current.copy(jet.position).sub(_prev).divideScalar(Math.max(delta, 1e-4))
  speed.current = velocity.current.length()
  pilot.kms = table(ASCENT, t, 3)
  pilot.missionClock = t
  if (t >= 540) {
    // in orbit: the pilot has it, circling at this height
    stack.attached = false
    pilot.landState = 'flying'
    speed.current = (7.7 / KM_PER_UNIT)
    velocity.current.copy(_heading).multiplyScalar(speed.current)
    pilot.orbiting = true
    pilot.missionNote = 'In orbit, 113 km up at 7.7 km/s: O leaves orbit'
  }
}

/* the launch seen from the ground, as on the broadcasts: a camera 400 m
   from the pad, tracking the stack as it climbs (the first 35 seconds) */
export function launchCamera(camera: THREE.Camera, jet: THREE.Object3D) {
  const frame = earth()
  if (!frame) return
  const pad = surfaceDir(PAD_39A.lat, PAD_39A.lon, _d2)
  travel(pad, 250, 0.4, _d)
  place(camera, frame, _d, 0.02)
  camera.up.copy(_d).applyQuaternion(_quat)
  camera.lookAt(jet.position)
  camera.up.set(0, 1, 0)
}

export function startReturn(memory: MissionMemory, km = 1500) {
  memory.time = 0
  // out on the runway's line (1,500 km and 80 km up, unless asked closer)
  memory.note = RETURN_EVENTS.findIndex(([at]) => at <= km)
  if (memory.note < 0) memory.note = RETURN_EVENTS.length
  const threshold = surfaceDir(RUNWAY_15.lat, RUNWAY_15.lon, _d2)
  travel(threshold, RUNWAY_15.heading + 180, km, memory.ground)
  memory.height = tableDown(RETURN, km, 1)
  stack.attached = false
  pilot.landState = 'returning'
  pilot.orbiting = false
}

/* where the steep glide is aimed: as on the real approach, 2.3 km short
   of the runway (the flare then carries the ship onto it, touching down
   a few hundred metres past the threshold) */
function aimPoint(out: THREE.Vector3) {
  return travel(surfaceDir(RUNWAY_15.lat, RUNWAY_15.lon, _d2), RUNWAY_15.heading + 180, 2.3, out)
}

export function stepReturn({ jet, velocity, speed, heading, memory, delta }: Frame) {
  const body = earth()
  if (!body) return
  const first = memory.time === 0
  memory.time += delta
  const aim = aimPoint(_d)
  const togo = Math.acos(THREE.MathUtils.clamp(memory.ground.dot(aim), -1, 1)) * EARTH_KM
  while (memory.note < RETURN_EVENTS.length && togo <= RETURN_EVENTS[memory.note][0]) {
    pilot.missionNote = RETURN_EVENTS[memory.note][1]
    memory.note += 1
  }
  const kms = tableDown(RETURN, togo, 2)
  const step = Math.min(kms * delta * RETURN_SPEEDUP, togo)
  // along the great circle to the runway (on its extended line)
  _way.copy(aim).addScaledVector(memory.ground, -memory.ground.dot(aim))
  if (_way.lengthSq() > 1e-14) {
    _way.normalize()
    const s = step / EARTH_KM
    memory.ground.multiplyScalar(Math.cos(s)).addScaledVector(_way, Math.sin(s)).normalize()
  }
  const want = tableDown(RETURN, togo - step, 1)
  memory.height += (want - memory.height) * (1 - Math.exp(-delta * 3))
  _prev.copy(jet.position)
  place(jet, body, memory.ground, memory.height)
  // nose 40 degrees up through the hot part, easing down to a glide
  const attack = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(8, 40, THREE.MathUtils.smoothstep(togo, 120, 700)))
  const path = -Math.atan2(Math.max(memory.height - want, 0), Math.max(step, 1e-6))
  _up.copy(memory.ground).applyQuaternion(_quat)
  _heading.copy(_way).applyQuaternion(_quat).normalize()
  aimShip(jet.quaternion, _heading, _up, Math.max(path, -0.5), attack, delta * 2)
  if (first) velocity.current.copy(_heading).multiplyScalar(kms / KM_PER_UNIT)
  else velocity.current.copy(jet.position).sub(_prev).divideScalar(Math.max(delta, 1e-4))
  speed.current = velocity.current.length()
  pilot.kms = kms
  pilot.missionClock = togo
  if (togo < 6.5) {
    // the self-flying landing has it from here: lined up on the runway
    heading.current.copy(_heading)
    velocity.current.copy(_heading).multiplyScalar(kms / KM_PER_UNIT)
    pilot.landState = 'landing'
    pilot.runwayApproach = true
  }
}
