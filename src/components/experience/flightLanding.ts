import * as THREE from 'three'

import { pilot } from './pilotState'
import { GROUND, ground, groundAltitude, groundWorlds, sphereUv } from './groundState'
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

/* coming down through air, at the speed ships really meet it (the
   Shuttle at 7.8 km/s some 120 km over Earth; landers at Mars about
   5.6 km/s from 125 km; Huygens about 6 km/s at Titan), slowing as the
   air thickens. (Real entries take half an hour along a long, shallow
   path; this one comes nearly straight down, in 20 to 30 seconds.)
   Heating peaks about a third of the way down. */
export const ENTRY: Record<number, { top: number; speed: number; heat: number; hullC: number }> = {
  2: { top: 120, speed: 7.8, heat: 1, hullC: 1650 },
  3: { top: 125, speed: 5.6, heat: 0.8, hullC: 1300 },
  17: { top: 160, speed: 6, heat: 0.7, hullC: 1100 },
}
/** where the entry has got to: 0 at its top, 1 at 20 km */
export const entryProgress = (top: number, km: number) => THREE.MathUtils.clamp((top - km) / (top - 20), 0, 1)
/** the heating, 0..1 of this world's peak: building, holding, fading */
export const entryHeat = (e: number) => THREE.MathUtils.smoothstep(e, 0, 0.22) * (1 - THREE.MathUtils.smoothstep(e, 0.55, 0.92))

/* ---- over the sea, Earth: the nearest coast, and a point some 40 km
   inland (the glide carries on past where it starts), found from the
   land/sea map by looking out along 48 bearings, 20 km a step, to
   3,000 km. Kept in the world's own frame (radius 1). */
let landTarget: THREE.Vector3 | null = null
const _site = new THREE.Vector3()
const _east = new THREE.Vector3()
const _north = new THREE.Vector3()
const _probe = new THREE.Vector3()
const _targetWorld = new THREE.Vector3()
const _toTarget = new THREE.Vector3()

function out(from: THREE.Vector3, bearing: number, angle: number, target: THREE.Vector3) {
  return target
    .copy(_east)
    .multiplyScalar(Math.sin(bearing))
    .addScaledVector(_north, Math.cos(bearing))
    .multiplyScalar(Math.sin(angle))
    .addScaledVector(from, Math.cos(angle))
    .normalize()
}

function landAt(model: { land: (u: number, v: number) => number }, d: THREE.Vector3) {
  const [u, v] = sphereUv(d)
  return model.land(u, v)
}

/** the nearest coast from a point (world's own frame), and which way, or null */
function findCoast(model: { land: (u: number, v: number) => number }, site: THREE.Vector3, radiusKm: number) {
  _east.set(0, 1, 0).cross(site)
  if (_east.lengthSq() < 1e-10) _east.set(1, 0, 0)
  _east.normalize()
  _north.copy(site).cross(_east).normalize()
  const step = 20 / radiusKm
  const inland = 40 / radiusKm
  for (let k = 1; k * step < 3000 / radiusKm; k += 1) {
    for (let j = 0; j < 48; j += 1) {
      const bearing = (j / 48) * Math.PI * 2
      if (landAt(model, out(site, bearing, k * step, _probe)) < 0.6) continue
      // and land on past it (not a sliver of an island)
      if (landAt(model, out(site, bearing, k * step + inland, _probe)) < 0.6) continue
      return { point: out(site, bearing, k * step + inland, new THREE.Vector3()), km: k * 20, bearing: (bearing * 180) / Math.PI }
    }
  }
  return null
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

const _forward = new THREE.Vector3()
const _wanted = new THREE.Vector3()
const _groundUp = new THREE.Vector3()
const _bodyQuat = new THREE.Quaternion()
const _inverse = new THREE.Matrix4()
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
      // over the sea (Earth): come down on the nearest coast instead
      landTarget = null
      const world = groundWorlds[nearestIndex]
      if (world && GROUND[nearestIndex]?.seaMap) {
        world.body.updateWorldMatrix(true, false)
        _site.copy(jet.position).applyMatrix4(_inverse.copy(world.body.matrixWorld).invert()).normalize()
        if (landAt(world.model, _site) < 0.5) {
          const coast = findCoast(world.model, _site, GROUND[nearestIndex].radiusKm)
          if (coast) {
            landTarget = coast.point
            pilot.landState = 'descending'
            pilot.missionNote = `Over the sea: heading for the nearest coast\n${Math.round(coast.km).toLocaleString('en-GB')} km to the ${COMPASS[Math.round(coast.bearing / 45) % 8]}`
          }
        }
      }
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
    const entry = ENTRY[nearestIndex]
    let down = 0.3 + km * (0.12 + 0.38 * THREE.MathUtils.smoothstep(km, 100, 600))
    if (entry) {
      // above the air: closing fast, to arrive at its top at entry speed;
      // in it, holding that speed through the thin upper air, then slowing
      down =
        km > entry.top
          ? entry.speed + (km - entry.top) * (0.12 + 0.38 * THREE.MathUtils.smoothstep(km - entry.top, 100, 600))
          : 2 + (entry.speed - 2) * THREE.MathUtils.smoothstep(km, 20, 20 + 0.55 * (entry.top - 20))
    }
    let along = Math.min(2.5, km * 0.02 + 0.3)
    // making for a coast: across to it as the height comes down, held at
    // 20 km until it is near, then the glide takes over
    let far = 0
    const world = groundWorlds[nearestIndex]
    if (landTarget && world) {
      _targetWorld.copy(landTarget).applyMatrix4(world.body.matrixWorld)
      _toTarget.copy(_targetWorld).sub(jet.position)
      _toTarget.addScaledVector(radial, -_toTarget.dot(radial))
      far = _toTarget.length() * KM_PER_UNIT
      if (far > 1e-6) heading.current.copy(_toTarget).normalize()
      // time left coming down (to 20 km), and the crossing in that time:
      // a long way off, across above the air (fast), then in through it
      // within 300 km of the coast at orbital speed at most, glowing as
      // the Shuttle did, and held at 20 km until the coast is near
      const left = Math.max(km - 20, 0) / Math.max(down, 0.5) + 6
      along = Math.max(along, Math.min(far / left, km > 110 ? 60 : 7.8))
      if (far > 300 && km < 135) down = Math.max(0, (km - 125) * 0.5)
      else if (far > 30 && km < 24) down = Math.max(0, (km - 20) * 0.5)
    }
    flyHeading(heading.current, radial, steerX, delta)
    _wanted.copy(heading.current).multiplyScalar(along).addScaledVector(radial, -down).divideScalar(KM_PER_UNIT)
    velocity.current.lerp(_wanted, 1 - Math.exp(-delta * 2))
    jet.position.addScaledVector(velocity.current, delta)
    aimShip(jet.quaternion, heading.current, radial, Math.max(Math.atan2(-down, along) + 0.42, -1.2), 0, delta)
    speed.current = velocity.current.length()
    const floor = nearestRadius * 1.002
    if (jet.position.distanceTo(centre) < floor) jet.position.copy(centre).addScaledVector(radial, floor)
    if (onGround && groundHere * KM_PER_UNIT < 20 && far <= 30) {
      pilot.landState = 'landing'
      landTarget = null
    }
  }
  if (pilot.landState === 'flying') landTarget = null
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
        // the camera feels it
        pilot.jolt = 1
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
