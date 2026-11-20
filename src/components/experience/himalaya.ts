import * as THREE from 'three'

import { getPlanetPosition, SYSTEM_OFFSET } from './orbit'
import { simClock } from './simClock'
import { groundWorlds } from './groundState'
import { shot } from './shots'
import { lowView, pilot } from './pilotState'

/* ============================================================
   THE HIMALAYAS, IN EARTH'S FILM
   At Earth, the surface close-up (shot 2) is the Himalayas: the camera
   9-10 km up, some 30 km south-west of Everest, gliding slowly in
   towards it over the Khumbu, the mountains in their true heights and
   colours (the flight's own ground: AWS Terrain Tiles for the elevation,
   Sentinel-2 for the imagery). The Earth is turned to a morning there
   (about nine o'clock: the Sun in the east-south-east, the shadows long),
   held still but for the morning moving on, and given back as it was
   when the shot ends.
============================================================ */

export const EVEREST = { lat: 27.988, lon: 86.925, heightKm: 8.849 }
const EARTH_KM = 6371

/** the Himalaya shot is on screen */
export const isHimalayaShot = () => shot.index === 2 && shot.chapter === 4 && !pilot.active

/* a direction in the Earth's own frame (radius 1), from latitude and
   longitude: the inverse of groundState's sphereUv */
function earthDirection(lat: number, lon: number, out: THREE.Vector3) {
  const phi = THREE.MathUtils.degToRad(lat)
  const a = THREE.MathUtils.degToRad(lon + 180)
  return out.set(-Math.cos(phi) * Math.cos(a), Math.sin(phi), Math.cos(phi) * Math.sin(a))
}

/* ---- the clock: a morning in the Khumbu */
const SIDEREAL_DEG_PER_DAY = 360.98564736629
const OBLIQUITY = 0.4090928
/** the Sun's hour angle at Everest when the shot opens: some nine in the morning */
const MORNING_HOUR_ANGLE = -45
/** the morning moves on this many times faster than real (the shadows creep) */
const MORNING_PACE = 12

const _earth = new THREE.Vector3()
const _sun = new THREE.Vector3()
const hold = { on: false, bodyJd: 0 }

/** the spin clock (bodyJd) that puts the Sun at the given hour angle over Everest */
function morningAt(hourAngleDeg: number) {
  getPlanetPosition(2, simClock.jd, _earth)
  _sun.copy(SYSTEM_OFFSET).sub(_earth)
  // the scene's axes are the ecliptic's (x, z, -y); to the equator's
  const xe = _sun.x
  const ye = -_sun.z
  const ze = _sun.y
  const Y = ye * Math.cos(OBLIQUITY) - ze * Math.sin(OBLIQUITY)
  const ra = THREE.MathUtils.radToDeg(Math.atan2(Y, xe))
  const gmst = 280.46061837 + SIDEREAL_DEG_PER_DAY * (simClock.bodyJd - 2451545.0)
  const hourAngle = gmst + EVEREST.lon - ra
  const change = ((((hourAngleDeg - hourAngle) % 360) + 540) % 360) - 180
  return simClock.bodyJd + change / SIDEREAL_DEG_PER_DAY
}

/** the scene clock, while the shot is on (the Clock calls this first;
    true: it has done the clock's work this frame) */
export function himalayaClock(step: number) {
  const on = isHimalayaShot()
  if (on && !hold.on) {
    hold.on = true
    hold.bodyJd = simClock.bodyJd
    simClock.bodyJd = morningAt(MORNING_HOUR_ANGLE)
  } else if (!on && hold.on) {
    hold.on = false
    simClock.bodyJd = hold.bodyJd
    lowView.body = -1
    lowView.aim.km = 0
  }
  if (!on) return false
  // the planets hold their places; the morning moves on
  simClock.rate = 0
  simClock.bodyJd += (step / 86400) * MORNING_PACE
  return true
}

/* ---- the camera */
const _dir = new THREE.Vector3()
const _summit = new THREE.Vector3()
const smoother = (t: number) => t * t * (3 - 2 * t)

/** the shot's camera, in the scene (false until the Earth is ready) */
export function himalayaShotPose(time: number, outPos: THREE.Vector3, outTarget: THREE.Vector3, outUp: THREE.Vector3) {
  const world = groundWorlds[2]
  if (!world) return false
  const body = world.body
  body.updateWorldMatrix(true, false)
  // in from the south-west over some 45 s, then holding, breathing
  const k = smoother(Math.min(1, time / 45))
  const bearing = THREE.MathUtils.degToRad(206 - 12 * k + Math.sin(time * 0.05) * 1.5)
  const distanceKm = 33 - 11 * k
  const altitudeKm = 9.7 - 0.7 * k
  const north = Math.cos(bearing) * distanceKm
  const east = Math.sin(bearing) * distanceKm
  const lat = EVEREST.lat + north / 111.2
  const lon = EVEREST.lon + east / (111.2 * Math.cos(THREE.MathUtils.degToRad(EVEREST.lat)))
  earthDirection(lat, lon, _dir)
  outUp.copy(_dir).transformDirection(body.matrixWorld)
  outPos.copy(_dir).multiplyScalar(1 + altitudeKm / EARTH_KM).applyMatrix4(body.matrixWorld)
  // looking at the summit, a little below it (the sky over the range)
  earthDirection(EVEREST.lat, EVEREST.lon, _summit)
  outTarget.copy(_summit).multiplyScalar(1 + (EVEREST.heightKm - 1.6) / EARTH_KM).applyMatrix4(body.matrixWorld)
  // the ground's switches: low over Earth, here
  lowView.body = 2
  lowView.altitudeKm = altitudeKm
  lowView.world.copy(outPos)
  // the sharpest ground between the camera and the summit (tiles of
  // about 135 m for the heights, 70 m for the imagery: 4 a side)
  lowView.aim.lat = EVEREST.lat + north * 0.6 / 111.2
  lowView.aim.lon = EVEREST.lon + (east * 0.6) / (111.2 * Math.cos(THREE.MathUtils.degToRad(EVEREST.lat)))
  lowView.aim.km = 3.4
  shot.altitudeKm = altitudeKm
  shot.distanceKm = EARTH_KM + altitudeKm
  return true
}
