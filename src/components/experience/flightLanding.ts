import * as THREE from 'three'

import { pilot } from './pilotState'
import { GROUND, ground, groundAltitude } from './groundState'
import { aimShip, flyHeading, KM_PER_UNIT, ON_WHEELS, SHIP_LENGTH } from './flightShip'
import { runwayGlide, runwayToGo } from './flightMission'

/* ============================================================
   LANDING AND TAKING OFF, FLOWN FOR YOU
   L from anywhere near a solid world: the ship comes down (through the
   air, glowing, where there is air), lines up and flies a steep glide,
   flares a few tens of metres up, touches down at about 300 km/h and
   rolls out to a stop. W any time before touchdown goes round again; L
   again calls it off. Taking off is the reverse: a roll along the
   ground, gathering speed, the nose rotates up and the ship climbs away.
   pilot.landState: 'flying', 'descending' (from high up), 'landing'
   (the glide), 'rolling', 'landed', 'lifting'. Called once a frame.
============================================================ */

type Ref<T> = { current: T }
export type LandingFrame = {
  jet: THREE.Object3D
  velocity: Ref<THREE.Vector3>
  speed: Ref<number>
  /** the heading along the ground while landing, rolling out and taking off */
  heading: Ref<THREE.Vector3>
  /** where the ship stands, in the world's own (turning) frame */
  landedAt: Ref<THREE.Vector3>
  landedTurn: Ref<THREE.Quaternion>
  liftTime: Ref<number>
  /** the ship's nose, this frame */
  forward: THREE.Vector3
  /** away from the nearest world's centre, and that centre */
  radial: THREE.Vector3
  centre: THREE.Vector3
  nearestIndex: number
  nearestRadius: number
  clearance: number
  /** over this world's landing ground (streamed under the ship), and how high above it */
  onGround: boolean
  groundHere: number
  /** a giant (or Venus): no ground to land on */
  deep: boolean
  warping: boolean
  thrustHeld: boolean
  steerX: number
  delta: number
}

const _forward = new THREE.Vector3()
const _wanted = new THREE.Vector3()
const _groundUp = new THREE.Vector3()
const _bodyQuat = new THREE.Quaternion()
const _bodyPosDummy = new THREE.Vector3()
const _bodyScaleDummy = new THREE.Vector3()
const _turn = new THREE.Quaternion()
const _axisUp = new THREE.Vector3()
const _runwayLocal = new THREE.Vector3()

export function flyLanding(frame: LandingFrame) {
  const {
    jet,
    velocity,
    speed,
    heading,
    landedAt,
    landedTurn,
    liftTime,
    forward: shipForward,
    radial,
    centre,
    nearestIndex,
    nearestRadius,
    clearance,
    onGround,
    groundHere,
    deep,
    warping,
    thrustHeld,
    steerX,
    delta,
  } = frame
  const landable = GROUND[nearestIndex] !== undefined && !deep
  pilot.canLand = landable && pilot.landState === 'flying' && !warping && (onGround || clearance < nearestRadius * 3)
  if (pilot.landRequest) {
    pilot.landRequest = false
    if (pilot.canLand) {
      pilot.landState = onGround && groundHere * KM_PER_UNIT < 20 ? 'landing' : 'descending'
      pilot.runwayApproach = false
      // the heading: as the ship moves, or as it points
      heading.current.copy(velocity.current.lengthSq() > 1e-16 ? velocity.current : shipForward)
    } else if (pilot.landState === 'descending' || pilot.landState === 'landing') {
      pilot.landState = 'flying'
      speed.current = velocity.current.length()
    }
  }
  // (a mission, launching or returning, flies itself: not this)
  const mission = pilot.landState === 'launching' || pilot.landState === 'returning'
  if (
    pilot.landState !== 'flying' &&
    !mission &&
    (warping || pilot.warpRequest !== null || !landable || (pilot.landState !== 'descending' && !onGround))
  ) {
    pilot.landState = 'flying'
  }
  // going round again: thrust before touchdown hands the ship back
  if ((pilot.landState === 'descending' || pilot.landState === 'landing') && thrustHeld) {
    pilot.landState = 'flying'
    speed.current = Math.max(velocity.current.length(), SHIP_LENGTH * 3)
  }
  if (pilot.landState === 'descending') {
    // straight for the ground below, fast and then slower, until the
    // ground under the ship is in reach
    const km = clearance * KM_PER_UNIT
    // (through the air at re-entry speeds, not faster)
    const down = 0.3 + km * (0.12 + 0.38 * THREE.MathUtils.smoothstep(km, 100, 600))
    const along = Math.min(2.5, km * 0.02 + 0.3)
    flyHeading(heading.current, radial, steerX, delta)
    _wanted.copy(heading.current).multiplyScalar(along).addScaledVector(radial, -down).divideScalar(KM_PER_UNIT)
    velocity.current.lerp(_wanted, 1 - Math.exp(-delta * 2))
    jet.position.addScaledVector(velocity.current, delta)
    aimShip(jet.quaternion, heading.current, radial, Math.max(Math.atan2(-down, along) + 0.42, -1.2), 0, delta)
    speed.current = velocity.current.length()
    const floor = nearestRadius * 1.002
    if (jet.position.distanceTo(centre) < floor) jet.position.copy(centre).addScaledVector(radial, floor)
    if (onGround && groundHere * KM_PER_UNIT < 20) pilot.landState = 'landing'
  }
  if (pilot.landState !== 'flying' && pilot.landState !== 'descending' && onGround) {
    ground.matrix.decompose(_bodyPosDummy, _bodyQuat, _bodyScaleDummy)
    _groundUp.copy(jet.position).applyMatrix4(ground.inverse).normalize().applyQuaternion(_bodyQuat)
    const rest = SHIP_LENGTH * ON_WHEELS // on its wheels
    const altitude = groundAltitude(jet.position)
    const km = Math.max(0, (altitude - rest) * KM_PER_UNIT)
    if (pilot.landState === 'landing') {
      // the glide: sink rate falls with height (a 20-25 degree slope,
      // flattening to a gentle flare), speed bleeds off to touchdown
      // a runway approach (flying home to Kennedy) is the Shuttle's own:
      // 155 m/s down a 19 degree slope, the pull-up some 600 m up, 100 m/s
      // at touchdown; L anywhere else is a quicker, steeper glide
      const runway = pilot.runwayApproach
      const along = runway ? 0.1 + 0.055 * THREE.MathUtils.smoothstep(km, 0.05, 0.6) : Math.min(2.5, 0.083 + km * 0.9)
      let down = 0.0025 + km * 0.5
      if (runway) {
        // held on the approach's glide, towards the touchdown point
        _runwayLocal.copy(jet.position).applyMatrix4(ground.inverse).normalize()
        const glide = runwayGlide(runwayToGo(_runwayLocal))
        down = THREE.MathUtils.clamp(along * glide.slope + (km - glide.height) * 0.6, 0, along * 0.5)
      }
      flyHeading(heading.current, _groundUp, steerX, delta)
      _wanted.copy(heading.current).multiplyScalar(along).addScaledVector(_groundUp, -down).divideScalar(KM_PER_UNIT)
      velocity.current.lerp(_wanted, 1 - Math.exp(-delta * 2.5))
      jet.position.addScaledVector(velocity.current, delta)
      // nose a little above the path, more in the flare
      const flare = 1 - THREE.MathUtils.smoothstep(km, 0.01, 0.08)
      aimShip(jet.quaternion, heading.current, _groundUp, Math.atan2(-down, along), 0.12 + flare * 0.12, delta)
      speed.current = velocity.current.length()
      const now = groundAltitude(jet.position)
      if (now <= rest + SHIP_LENGTH * 0.03) {
        // touchdown
        jet.position.addScaledVector(_groundUp, rest - now)
        velocity.current.addScaledVector(_groundUp, -velocity.current.dot(_groundUp))
        pilot.landState = 'rolling'
      }
    } else if (pilot.landState === 'rolling') {
      // on the ground, braking to a stop, the nose coming down
      flyHeading(heading.current, _groundUp, steerX, delta)
      // (at Kennedy as the Shuttle did, its drag chute out: a longer
      // roll-out, stopping a little past the runway's middle)
      const brake = pilot.runwayApproach ? 0.003 : 0.006
      const kms = Math.max(0, velocity.current.length() * KM_PER_UNIT - brake * delta)
      velocity.current.copy(heading.current).multiplyScalar(kms / KM_PER_UNIT)
      jet.position.addScaledVector(velocity.current, delta)
      jet.position.addScaledVector(_groundUp, rest - groundAltitude(jet.position))
      aimShip(jet.quaternion, heading.current, _groundUp, 0, 0, delta * 0.6)
      speed.current = velocity.current.length()
      if (thrustHeld) {
        // touch and go
        pilot.landState = 'lifting'
        liftTime.current = 0
      } else if (kms < 0.0005) {
        pilot.landState = 'landed'
        velocity.current.set(0, 0, 0)
        landedAt.current.copy(jet.position).applyMatrix4(ground.inverse)
        landedTurn.current.copy(_bodyQuat).invert().multiply(jet.quaternion)
      }
    } else if (pilot.landState === 'landed') {
      // standing: carried round with the planet's turn; steering turns
      // the ship where it stands
      if (Math.abs(steerX) > 0) {
        _turn.setFromAxisAngle(_axisUp.set(0, 1, 0), -steerX * 0.8 * delta)
        landedTurn.current.multiply(_turn)
      }
      jet.position.copy(landedAt.current).applyMatrix4(ground.matrix)
      jet.quaternion.copy(_bodyQuat).multiply(landedTurn.current)
      speed.current = 0
      velocity.current.set(0, 0, 0)
      if (thrustHeld) {
        pilot.landState = 'lifting'
        liftTime.current = 0
        _forward.set(0, 0, -1).applyQuaternion(jet.quaternion)
        heading.current.copy(_forward)
      }
    } else if (pilot.landState === 'lifting') {
      // the takeoff roll (about 0.8 g), rotation at 300 km/h, the climb
      flyHeading(heading.current, _groundUp, steerX, delta)
      const along = Math.min(0.16, velocity.current.dot(heading.current) * KM_PER_UNIT + 0.008 * delta)
      if (along > 0.085) liftTime.current += delta
      const climb = THREE.MathUtils.smoothstep(liftTime.current, 0, 2.5) * 0.2 // the path, radians
      _wanted.copy(heading.current).multiplyScalar(along).addScaledVector(_groundUp, along * Math.tan(climb)).divideScalar(KM_PER_UNIT)
      velocity.current.copy(_wanted)
      jet.position.addScaledVector(velocity.current, delta)
      const now = groundAltitude(jet.position)
      if (now < rest) jet.position.addScaledVector(_groundUp, rest - now)
      const rotate = THREE.MathUtils.smoothstep(liftTime.current, 0, 1.2) * 0.1
      aimShip(jet.quaternion, heading.current, _groundUp, climb, rotate, delta * 1.5)
      speed.current = velocity.current.length()
      if (km > 0.3) {
        // clear: the pilot has it, still climbing
        pilot.landState = 'flying'
        speed.current = velocity.current.length()
      }
    }
  }
  // landing and taking off: the true speed (the flying limit, which is
  // small this near the ground, does not apply)
  // (a mission gives its own: the true speed, not the sped-up motion)
  if (pilot.landState !== 'flying' && !mission) pilot.kms = velocity.current.length() * KM_PER_UNIT
}
