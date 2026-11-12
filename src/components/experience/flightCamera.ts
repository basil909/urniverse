import * as THREE from 'three'

import { SYSTEM_OFFSET } from './orbit'
import { pilot, VIEW_NEAR } from './pilotState'
import { ground, groundAltitude } from './groundState'
import { SHIP_LENGTH } from './flightShip'

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
  const reach = SHIP_LENGTH * (viewDistance.current / VIEW_NEAR)
  _camPos
    .set(0, 0, 0)
    .addScaledVector(forward, -reach * 3.2)
    .addScaledVector(_up, reach * (0.85 + pitchRate * 0.12))
    .addScaledVector(_right, reach * yawRate * 0.35)
  camOffset.current.lerp(_camPos, 1 - Math.exp(-delta * 6))
  camera.position.copy(jet.position).add(camOffset.current)
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
    camera.up.copy(_up)
    camera.lookAt(_camTarget)
    camera.rotateZ(-bank.current * 0.35)
  } else {
    // the other views keep the horizon level and watch the ship
    camera.up.copy(levelUp)
    camera.lookAt(jet.position)
  }
  camera.up.set(0, 1, 0)
}
