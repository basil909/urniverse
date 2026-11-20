import * as THREE from 'three'

import { SYSTEM_OFFSET } from './orbit'
import { pilot, VIEW_NEAR } from './pilotState'
import { ground, groundAltitude } from './groundState'
import { SHIP_LENGTH } from './flightShip'
import { viewMode } from './viewMode'

/* ============================================================
   THE CAMERAS (V cycles them)
   - chase: behind and above, swinging a little wide in turns, looking
     slightly into them, banking with the ship; pulled back (scroll wheel,
     C) to the same framing at a larger scale;
   - orbit: a slow circle round the ship;
   - fly-by: parked ahead, letting the ship sweep past, then on ahead.
   The air shakes them on entry and buffets them low and fast; they never
   go below the ground. Called once a frame.
============================================================ */

type Ref<T> = { current: T }
export type CameraFrame = {
  camera: THREE.Camera
  jet: THREE.Object3D
  velocity: Ref<THREE.Vector3>
  heat: Ref<number>
  /** the camera's own memory between frames */
  bank: Ref<number>
  viewDistance: Ref<number>
  camOffset: Ref<THREE.Vector3>
  orbitAngle: Ref<number>
  flyby: Ref<THREE.Vector3 | null>
  forward: THREE.Vector3
  levelUp: THREE.Vector3
  centre: THREE.Vector3
  nearestRadius: number
  onGround: boolean
  deep: boolean
  yawRate: number
  pitchRate: number
  delta: number
}

const _up = new THREE.Vector3()
const _right = new THREE.Vector3()
const _camPos = new THREE.Vector3()
const _camTarget = new THREE.Vector3()
const _shake = new THREE.Vector3()
const _groundUp = new THREE.Vector3()
const _bodyQuat = new THREE.Quaternion()
const _bodyPosDummy = new THREE.Vector3()
const _bodyScaleDummy = new THREE.Vector3()
const _away = new THREE.Vector3()
const _side = new THREE.Vector3()
const _assistPos = new THREE.Vector3()
const _assistTarget = new THREE.Vector3()
const _aimTarget = new THREE.Quaternion()

/* the chase camera turns with weight: its aim follows the ship's a beat
   behind, as a camera on a spring would */
const aim = { quaternion: new THREE.Quaternion(), held: false, mode: '' }

/* CINEMATIC ASSIST (cinematic mode only): on a close pass of a world the
   camera swings out to the side for a few seconds, the ship crossing in
   front of the world, then returns behind it. The ship stays yours; only
   the camera moves. Once a minute and a quarter for each world at most. */
const ASSIST_SECONDS = 8
const assist = { start: -1, index: -1, weight: 0, cooldown: new Map<number, number>() }
export const assistState = { on: false }

export function placeCamera(frame: CameraFrame) {
  const {
    camera,
    jet,
    velocity,
    heat,
    bank,
    viewDistance,
    camOffset,
    orbitAngle,
    flyby,
    forward,
    levelUp,
    centre,
    nearestRadius,
    onGround,
    deep,
    yawRate,
    pitchRate,
    delta,
  } = frame
  // ---- the chase camera: behind and above, swinging a little wide in
  // turns, looking slightly into them, and banking with the ship
  const bankTarget = THREE.MathUtils.clamp(yawRate * 0.42, -0.65, 0.65)
  bank.current += (bankTarget - bank.current) * (1 - Math.exp(-delta * 4))
  _up.set(0, 1, 0).applyQuaternion(jet.quaternion)
  _right.set(1, 0, 0).applyQuaternion(jet.quaternion)
  // pulled back (scroll wheel, C), the same framing at a larger scale,
  // until the Shuttle is a speck against the planet
  viewDistance.current = Math.exp(
    THREE.MathUtils.lerp(Math.log(viewDistance.current), Math.log(pilot.viewTarget), 1 - Math.exp(-delta * 2.5)),
  )
  // closer while slow, exploring; drawn back and wider when fast
  const pace = THREE.MathUtils.smoothstep(pilot.speed, 0.05, 0.85)
  const reach = SHIP_LENGTH * (viewDistance.current / VIEW_NEAR) * THREE.MathUtils.lerp(0.86, 1.28, pace)
  _camPos
    .set(0, 0, 0)
    .addScaledVector(forward, -reach * 3.2)
    .addScaledVector(_up, reach * (0.85 + pitchRate * 0.12))
    .addScaledVector(_right, reach * yawRate * 0.35)
  camOffset.current.lerp(_camPos, 1 - Math.exp(-delta * 6))
  camera.position.copy(jet.position).add(camOffset.current)

  // cinematic assist: a close pass of a world (not a speck, not landing)
  const now = performance.now() / 1000
  const index = pilot.nearestIndex
  const distance = jet.position.distanceTo(centre)
  const eligible =
    viewMode.mode === 'cinematic' &&
    pilot.cameraMode === 'chase' &&
    pilot.altitudeKm > 200 &&
    !pilot.walking &&
    pilot.immersion < 0.05 &&
    pilot.landState === 'flying' &&
    pilot.warpGlow < 0.05 &&
    index >= 0 &&
    pilot.nearestRadiusKm > 1500 &&
    distance < nearestRadius * 4.5 &&
    distance > nearestRadius * 1.04
  if (assist.start < 0 && eligible && now > (assist.cooldown.get(index) ?? 0)) {
    assist.start = now
    assist.index = index
    assist.cooldown.set(index, now + 75)
  }
  let assistTarget = 0
  if (assist.start >= 0) {
    const t = now - assist.start
    if (t > ASSIST_SECONDS || pilot.cameraMode !== 'chase' || index !== assist.index || pilot.altitudeKm < 150 || pilot.warpGlow > 0.05) assist.start = -1
    else assistTarget = THREE.MathUtils.smoothstep(t, 0, 1.8) * (1 - THREE.MathUtils.smoothstep(t, ASSIST_SECONDS - 2, ASSIST_SECONDS))
  }
  assist.weight += (assistTarget - assist.weight) * (1 - Math.exp(-delta * 5))
  if (assistTarget === 0 && assist.weight < 0.002) assist.weight = 0
  assistState.on = assist.weight > 0.02
  if (assist.weight > 0) {
    // out from the world, a little to the side, looking back past the
    // ship at it: the ship small in front, the world filling the frame
    _away.copy(jet.position).sub(centre).normalize()
    _side.crossVectors(forward, _away)
    if (_side.lengthSq() < 1e-8) _side.copy(_right)
    _side.normalize()
    _assistPos
      .copy(jet.position)
      .addScaledVector(_away, reach * 10)
      .addScaledVector(_side, reach * 3.5)
      .addScaledVector(forward, reach * 1.5)
    camera.position.lerp(_assistPos, assist.weight)
    _assistTarget.copy(jet.position).addScaledVector(_away, -reach * 8)
  }
  // other views (V): a slow orbit round the ship, or a camera parked
  // ahead that lets the ship sweep past, then moves on ahead again
  const mode = pilot.cameraMode
  if (mode === 'orbit') {
    orbitAngle.current += delta * 0.14
    const around = reach * 5
    _camPos
      .copy(_right)
      .multiplyScalar(Math.cos(orbitAngle.current) * around)
      .addScaledVector(forward, Math.sin(orbitAngle.current) * around)
      .addScaledVector(levelUp, around * 0.3)
    camera.position.copy(jet.position).add(_camPos)
  } else if (mode === 'flyby') {
    const span = reach * 16
    const rel = flyby.current
    const passed = rel
      ? _camPos.copy(jet.position).sub(SYSTEM_OFFSET).sub(rel).dot(forward) > span * 1.1 ||
        _camPos.length() > span * 4
      : true
    if (!rel || passed) {
      // a little to the side and above the line the ship is flying
      flyby.current = (rel ?? new THREE.Vector3())
        .copy(jet.position)
        .sub(SYSTEM_OFFSET)
        .addScaledVector(velocity.current.lengthSq() > 0 ? _camPos.copy(velocity.current).normalize() : forward, span * 2.2)
        .addScaledVector(_right, span * 0.45)
        .addScaledVector(levelUp, span * 0.18)
    }
    camera.position.copy(SYSTEM_OFFSET).add(flyby.current!)
  }
  if (mode !== 'flyby') flyby.current = null
  // the air shakes the ship on entry, and buffets it low and fast
  const buffet =
    heat.current + (pilot.altitudeKm < 30 ? pilot.air * Math.min(1, pilot.kms / 0.4) * 0.3 : 0) + pilot.immersion * 0.25
  if (buffet > 0.01) {
    const t = performance.now() * 0.001
    _shake.set(Math.sin(t * 41.3) + Math.sin(t * 17.9), Math.sin(t * 37.1) + Math.sin(t * 23.3), Math.sin(t * 29.7))
    camera.position.addScaledVector(_shake, buffet * reach * 0.025)
  }
  // touchdown: a jolt, the camera dipping and settling
  if (pilot.jolt > 0.002) {
    const t = performance.now() * 0.001
    camera.position.addScaledVector(levelUp, -Math.sin(t * 26) * pilot.jolt * reach * 0.035)
    pilot.jolt *= Math.exp(-delta * 4.5)
  } else pilot.jolt = 0
  // pulled far back, the camera stays above the ground
  _camTarget.copy(camera.position).sub(centre)
  if (!onGround && !deep && _camTarget.length() < nearestRadius * 1.004) {
    camera.position.copy(centre).addScaledVector(_camTarget.normalize(), nearestRadius * 1.004)
  }
  if (onGround) {
    const above = groundAltitude(camera.position)
    if (above < SHIP_LENGTH * 0.3) {
      _groundUp.copy(camera.position).applyMatrix4(ground.inverse).normalize()
      ground.matrix.decompose(_bodyPosDummy, _bodyQuat, _bodyScaleDummy)
      _groundUp.applyQuaternion(_bodyQuat)
      camera.position.addScaledVector(_groundUp, SHIP_LENGTH * 0.3 - above)
    }
  }
  _camTarget
    .copy(jet.position)
    .addScaledVector(forward, reach * 6)
    .addScaledVector(_right, -reach * yawRate * 0.9)
    .addScaledVector(_up, reach * pitchRate * 0.5)
  if (mode === 'chase') {
    if (assist.weight > 0) {
      _camTarget.lerp(_assistTarget, assist.weight)
      _up.lerp(levelUp, assist.weight).normalize()
    }
    camera.up.copy(_up)
    camera.lookAt(_camTarget)
    camera.rotateZ(-bank.current * 0.35 * (1 - assist.weight))
    // the aim on a spring (not in warp, nor the first frame of a view)
    _aimTarget.copy(camera.quaternion)
    if (aim.held && aim.mode === mode && pilot.warpGlow < 0.2 && !pilot.walking) {
      aim.quaternion.slerp(_aimTarget, 1 - Math.exp(-delta * 7))
      camera.quaternion.copy(aim.quaternion)
    } else aim.quaternion.copy(_aimTarget)
    aim.held = true
    aim.mode = mode
  } else {
    aim.held = false
    // the other views keep the horizon level and watch the ship
    camera.up.copy(levelUp)
    camera.lookAt(jet.position)
  }
  camera.up.set(0, 1, 0)
}
