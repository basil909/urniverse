import * as THREE from 'three'

import { getBodyName, getBodyOrbitPosition, getBodyRadius, SUN_TRUE_RADIUS, SYSTEM_OFFSET } from './orbit'
import { simClock } from './simClock'
import { COMET_ID, FIRST_CRAFT_ID, FIRST_STAR_ID } from './spaceBodies'
import { KM_PER_UNIT } from './flightShip'

/* ============================================================
   WARP
   Pick a world (a marker on screen, or 1-8, 0 for the Sun) and the ship
   flies itself there: it first climbs clear of the world it is at (to
   one side, so the way is never through it), then crosses at warp,
   swinging round the Sun if it lies in between, and arrives a few radii
   out on the sunlit side, facing its goal. The crossing closes the
   distance geometrically, so the goal grows steadily from a point to a
   world. S cancels.
============================================================ */
export type Warp = {
  target: number
  name: string
  a0: THREE.Vector3 // all relative to the Sun, so the floating origin can move
  a1: THREE.Vector3
  ctrl: THREE.Vector3
  end: THREE.Vector3
  goal: THREE.Vector3
  climb: number
  duration: number
  t: number
  span: number
  eps: number
}

const _warpLook = new THREE.Matrix4()
const _warpQuat = new THREE.Quaternion()
const _warpPrev = new THREE.Vector3()
const _bez = new THREE.Vector3()
const _goalWorld = new THREE.Vector3()

/* the route to body `target`, from `from` (world), leaving the world the
   ship is at (`at`) to one side */
export function planWarp(
  target: number,
  from: THREE.Vector3,
  at: { index: number; radius: number; clearance: number; centre: THREE.Vector3 },
): Warp {
  const rel = from.clone().sub(SYSTEM_OFFSET)
  const goal = getBodyOrbitPosition(target, simClock.jd, new THREE.Vector3())
  const radius = getBodyRadius(target)
  // close enough that a planet overfills the view behind the tiny ship
  // (Saturn a little further, so its rings fit; the Sun further still)
  const standOff = target < 0 ? 6 : target === 5 ? 3.4 : target < 8 ? 1.6 : 2.4
  // arrive on the near side, turned towards the Sun (the lit face)
  const fromGoal = rel.clone().sub(goal).normalize()
  const sunward = goal.lengthSq() > 0 ? goal.clone().negate().normalize().multiplyScalar(1.2) : new THREE.Vector3()
  const arrive = fromGoal.add(sunward)
  if (arrive.lengthSq() < 1e-8) arrive.set(0, 1, 0)
  let end = goal.clone().addScaledVector(arrive.normalize(), radius * standOff)
  if (target === COMET_ID) {
    // the comet: inside its coma, 1,500 km from the nucleus, sunward
    end = goal.clone().addScaledVector(arrive.normalize(), 1500 / KM_PER_UNIT)
  }
  if (target >= FIRST_CRAFT_ID && target < FIRST_STAR_ID) {
    // a spacecraft: alongside, close enough to see it against the Shuttle
    // (the rover: from above)
    const off = Math.max(radius * 3, 0.08 / KM_PER_UNIT)
    if (target === FIRST_CRAFT_ID + 5) {
      const mars = getBodyOrbitPosition(3, simClock.jd, new THREE.Vector3())
      end = goal.clone().addScaledVector(goal.clone().sub(mars).normalize(), off)
    } else {
      end = goal.clone().addScaledVector(arrive.normalize(), off)
    }
  }
  // first climb clear of the world we are at, to its side
  let a1 = rel.clone()
  let climb = 0
  if (at.index !== target && at.clearance < at.radius * 3) {
    const atBody = at.centre.clone().sub(SYSTEM_OFFSET)
    const way = end.clone().sub(rel).normalize()
    const side = rel.clone().sub(atBody).normalize()
    side.addScaledVector(way, -side.dot(way))
    if (side.lengthSq() < 1e-8) side.set(0, 1, 0).addScaledVector(way, -way.y)
    a1 = atBody.addScaledVector(side.normalize(), at.radius * 4)
    climb = 1.6
  }
  // and round the Sun, if it lies in the way
  const segment = end.clone().sub(a1)
  const along = THREE.MathUtils.clamp(-a1.dot(segment) / segment.lengthSq(), 0, 1)
  const closest = a1.clone().addScaledVector(segment, along)
  const ctrl = a1.clone().add(end).multiplyScalar(0.5)
  const clearSun = SUN_TRUE_RADIUS * 5
  if (target >= 0 && closest.length() < clearSun) {
    const away = closest.lengthSq() > 1e-8 ? closest.clone().normalize() : new THREE.Vector3(0, 1, 0)
    ctrl.addScaledVector(away, 2 * (clearSun - closest.length()) + clearSun)
  }
  const span = Math.max(a1.distanceTo(end), radius * 0.01)
  return {
    target,
    name: getBodyName(target),
    a0: rel,
    a1,
    ctrl,
    end,
    goal,
    climb,
    duration: THREE.MathUtils.clamp(3.5 + 0.9 * Math.log10(Math.max(span * KM_PER_UNIT, 1e5) / 1e5), 3.5, 8),
    t: 0,
    span,
    eps: radius * 0.002,
  }
}

/* one frame along the route: places and turns the ship; returns whether
   it has arrived, the warp's glow (0..1) and the speed it moved at, km/s */
export function stepWarp(w: Warp, jet: THREE.Object3D, delta: number, levelUp: THREE.Vector3) {
  w.t += delta
  _warpPrev.copy(jet.position).sub(SYSTEM_OFFSET)
  let glow = 0.15
  let done = false
  if (w.t < w.climb) {
    const s = THREE.MathUtils.smoothstep(w.t / w.climb, 0, 1)
    _bez.copy(w.a0).lerp(w.a1, s)
  } else {
    const t = Math.min(1, (w.t - w.climb) / w.duration)
    const s = t * t * (3 - 2 * t)
    // the distance left shrinks geometrically: the goal grows steadily
    const u = 1 - Math.pow(w.eps / w.span, s)
    const v = 1 - u
    _bez
      .copy(w.a1)
      .multiplyScalar(v * v)
      .addScaledVector(w.ctrl, 2 * u * v)
      .addScaledVector(w.end, u * u)
    glow = Math.pow(Math.sin(Math.PI * t), 0.6)
    if (t >= 1) {
      done = true
      glow = 0
    }
  }
  jet.position.copy(SYSTEM_OFFSET).add(_bez)
  // face the goal
  _goalWorld.copy(SYSTEM_OFFSET).add(w.goal)
  _warpLook.lookAt(jet.position, _goalWorld, levelUp)
  _warpQuat.setFromRotationMatrix(_warpLook)
  jet.quaternion.slerp(_warpQuat, 1 - Math.exp(-delta * 3))
  const kms = (_bez.distanceTo(_warpPrev) / Math.max(delta, 1e-4)) * KM_PER_UNIT
  return { done, glow, kms }
}
