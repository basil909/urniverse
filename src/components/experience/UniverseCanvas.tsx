'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { BloomEffect, ToneMappingMode } from 'postprocessing'
import { Html, PerformanceMonitor, useProgress } from '@react-three/drei'
import { Component, memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'

import SolarSystem from './SolarSystem'
import { BODY_RATE, CLOSE_UP_RATE, simClock, WIDE_VIEW_RATE } from './simClock'
import Galaxy, {
  GALAXY_POSITION,
  GALAXY_RADIUS,
  GALAXY_SCALE,
  GALAXY_TILT,
  SUN_RADIUS as GALAXY_SUN_RADIUS,
} from './Galaxy'
import Starfield from './Starfield'
import LocalGroup, { LOCAL_GROUP_VIEW, NEIGHBOURS } from './LocalGroup'
import PlanetPicker from './PlanetPicker'
import NightSky from './NightSky'
import { lens } from './lens'
import TextShield from './TextShield'
import { GradeEffect } from './grade'
import SpaceStation, { stationShotPose } from './SpaceStation'
import Pilot, { GroundCarry, pilotObjects } from './Pilot'
import PhotoCapture from './PhotoCapture'
import NearStars, { skyHandOver } from './NearStars'
import FocusCull from './FocusCull'
import { drainTextures, textureLoader } from './textures'
import { getShipPass } from './shipLayer'
import { LowResLayer, PerfMeter } from './PerfMeter'
import { pilot } from './pilotState'
import {
  PLANETS,
  SYSTEM_OFFSET,
  getPlanetPosition,
  getPlanetVisualRadius,
} from './orbit'
import { EARTH_KM, REVEAL_END, REVEAL_HOLD, REVEAL_PULL, reveal } from './scaleReveal'
import { shot } from './shots'
import { OPENING_SECONDS, SEQUENCE_EVENT, opening, resetOrbit, sequence, viewMode } from './viewMode'
import { latLonToSphere } from './SolarSystem'
import { pickBodies } from './PlanetPicker'
import { ringState } from './groundState'

/* ============================================================
   CINEMATIC SOLAR SYSTEM JOURNEY

   00 Intro | 01 Sun | 02-09 Planets | 10 Beyond | 11 Milky Way | 12 Return
============================================================ */

type PlanetConfig = {
  minHeroDistance: number
  radiusMultiplier: number
  compositionOffset: number
  fov: number
}

const PLANET_CONFIG: PlanetConfig[] = [
  { minHeroDistance: 3.15, radiusMultiplier: 8.5, compositionOffset: 0, fov: 34 },
  { minHeroDistance: 4.55, radiusMultiplier: 9.5, compositionOffset: 0, fov: 36 },
  { minHeroDistance: 3.85, radiusMultiplier: 8.5, compositionOffset: 0, fov: 32 },
  { minHeroDistance: 4.05, radiusMultiplier: 8.8, compositionOffset: 0, fov: 34 },
  { minHeroDistance: 7.00, radiusMultiplier: 6.8, compositionOffset: 0, fov: 36 },
  { minHeroDistance: 8.50, radiusMultiplier: 7.5, compositionOffset: 0, fov: 39 },
  { minHeroDistance: 6.50, radiusMultiplier: 7.5, compositionOffset: 0, fov: 37 },
  { minHeroDistance: 6.50, radiusMultiplier: 7.5, compositionOffset: 0, fov: 37 },
]

// Slightly above the orbital plane, system framed on the right of the screen
const INTRO = {
  position: new THREE.Vector3(-2, 11, 22),
  target: new THREE.Vector3(-4.5, -1.5, -8),
}
const SUN = {
  position: new THREE.Vector3(0, 0.7, 5.2),
  target: SYSTEM_OFFSET.clone(),
}
const BEYOND = {
  position: new THREE.Vector3(11, 5, 22),
  target: SYSTEM_OFFSET.clone(),
}
// Aim below the Sun so the system sits in the upper half, above the closing text
// Finale: far above the galactic disc, looking down on the whole Milky Way
const GALAXY_VIEW = (() => {
  const center = new THREE.Vector3(...GALAXY_POSITION)
  const normal = new THREE.Vector3(0, 1, 0).applyEuler(
    new THREE.Euler(...GALAXY_TILT),
  )
  const radius = GALAXY_RADIUS * GALAXY_SCALE
  // slight tilt off the pole so the disc reads as a 3D object
  const tilt = new THREE.Vector3(1, 0, 0)
    .cross(normal)
    .normalize()
    .multiplyScalar(radius * 0.45)
  const position = center
    .clone()
    .addScaledVector(normal, radius * 2.6)
    .add(tilt)
  // aim right of the centre so the galaxy sits left, clear of the text column
  const forward = center.clone().sub(position).normalize()
  const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize()
  return {
    position,
    target: center.clone().addScaledVector(right, radius * 0.62),
    // portrait: text sits below, so keep the galaxy centred
    portraitTarget: center.clone(),
  }
})()

const RETURN = {
  position: new THREE.Vector3(4, 3.2, 9),
  target: SYSTEM_OFFSET.clone().add(new THREE.Vector3(0, -2.6, 0)),
}

/* ============================================================
   MODULE-LEVEL SCRATCH VECTORS
============================================================ */

const _scratchPos = new THREE.Vector3()
const _scratchTarget = new THREE.Vector3()
const _arrival = new THREE.Vector3()
const _dummyArrival = new THREE.Vector3()
const _prevPos = new THREE.Vector3()
const _prevTarget = new THREE.Vector3()
const _currPos = new THREE.Vector3()
const _currTarget = new THREE.Vector3()
const _planetCenter = new THREE.Vector3()
const _toSun = new THREE.Vector3()
const _side = new THREE.Vector3()
const _worldUp = new THREE.Vector3(0, 1, 0)
const _viewDir = new THREE.Vector3()

/* Share of the view each rocky planet fills: Mercury, Venus, Earth, Mars */
const ROCKY_FILL: (number | undefined)[] = [0.062, 0.08, 0.082, 0.07]

/* Flight feel: written by the camera each frame, read by the streak field.
   `intensity` (0..1) is speed relative to the distance to what we look at,
   so a short hop between inner planets feels as quick as a long haul. */
const flight = {
  velocity: new THREE.Vector3(),
  intensity: 0,
}
const _prevCameraPosition = new THREE.Vector3()
const _rawVelocity = new THREE.Vector3()
const _cameraRight = new THREE.Vector3()

const FOV_BREATH = 5 // extra degrees of field of view at full speed
const MAX_BANK = 0.055 // radians (~3 degrees) of roll into turns

/* Backlit hero shots: on these planets, after arriving front-lit, the
   camera drifts slowly round to the night side, looking back towards the
   Sun (just out of frame): a thin crescent, a glowing atmosphere, Earth's
   city lights, Saturn's rings lit from behind. Planet indices. */
const HERO_BACKLIT = new Set([1, 2, 5]) // Venus, Earth, Saturn
/* half the horizontal field of view, kept current by the camera, so the
   backlit angle can be chosen to keep the Sun's disc just out of frame */
const view = { halfWidthAngle: 0.5 }
const SUN_RADIUS = 1

/* Most backlit camera angle (measured from the anti-Sun direction, as seen
   from the planet) that still keeps the Sun just outside the frame. The
   Sun's direction as seen from the camera is solved with the triangle
   camera-planet-Sun (law of sines). */
function backlitAngle(cameraDistance: number, sunDistance: number) {
  for (let deg = 18; deg <= 80; deg += 2) {
    const theta = (deg * Math.PI) / 180
    const atPlanet = Math.PI - theta // angle camera-planet-Sun
    const cameraToSun = Math.sqrt(
      cameraDistance * cameraDistance +
        sunDistance * sunDistance -
        2 * cameraDistance * sunDistance * Math.cos(atPlanet),
    )
    const atCamera = Math.asin(
      Math.min(1, (sunDistance * Math.sin(atPlanet)) / cameraToSun),
    )
    const sunRadiusAngle = Math.asin(Math.min(1, (SUN_RADIUS * 1.05) / cameraToSun))
    if (atCamera - sunRadiusAngle >= view.halfWidthAngle) return theta
  }
  return (80 * Math.PI) / 180
}
const HERO_DELAY = 1.4 // seconds after arriving before the drift starts
const HERO_DURATION = 9 // seconds for the full drift
/* drift amount (0 front-lit .. 1 backlit) per chapter; frozen on leaving so
   the next flight starts exactly where the camera is */
const heroDrift: number[] = new Array(13).fill(0)
const _backDir = new THREE.Vector3()

const BLEND = 0.18

/* the opening sweep into the Solar System */
const ENTRANCE_SECONDS = 5.5
const _driftOffset = new THREE.Vector3()

const isPlanetChapter = (chapter: number) =>
  chapter >= 2 && chapter <= 9

const ease = (value: number) => {
  const x = THREE.MathUtils.clamp(value, 0, 1)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/* Camera distance for a planet close-up.
   Rocky planets: framed by how much of the view they fill (radius /
   distance) so small worlds like Mercury and Mars are not lost; Earth
   keeps ~0.063, smaller worlds stay smaller. Giants: by their radius. */
/* hero shots: on a wide screen the planet is drawn large, a film's hero
   shot, and set left of the words (a lens shift, below); a tall screen
   keeps it whole above them */
const heroFrame = { closer: 1 }

function heroDistanceFor(planetIndex: number) {
  const config = PLANET_CONFIG[planetIndex]
  const visualRadius = getPlanetVisualRadius(planetIndex)
  const rockyFill = ROCKY_FILL[planetIndex]
  return (
    (rockyFill !== undefined
      ? visualRadius / rockyFill
      : Math.max(config.minHeroDistance, visualRadius * config.radiusMultiplier) *
        (planetIndex === 5 ? 1.9 : planetIndex === 4 ? 1.08 : 1.2)) * heroFrame.closer
  )
}

function calculatePlanetPose(
  planetIndex: number,
  progressPhase: number,
  outHero: THREE.Vector3,
  outArrival: THREE.Vector3,
  outTarget: THREE.Vector3,
) {
  const config = PLANET_CONFIG[planetIndex]

  getPlanetPosition(planetIndex, simClock.jd, _planetCenter)

  _toSun.copy(SYSTEM_OFFSET).sub(_planetCenter)

  if (_toSun.lengthSq() > 0.000001) {
    _toSun.normalize()
  } else {
    _toSun.set(0, 0, 1)
  }

  _side.crossVectors(_worldUp, _toSun)

  if (_side.lengthSq() < 0.000001) {
    _side.set(1, 0, 0)
  } else {
    _side.normalize()
  }

  // Three-quarter view: mostly from the side, partly sunward, so the camera
  // never sits on the Sun line (at Mercury it ended up inside the Sun's glow);
  // some 77 degrees off it: half-lit, the terminator across the disc and
  // the night side falling away into the dark beside the words
  // Jupiter: almost in the plane of its moons, so they line up across the
  // disc and pass in front of it (with their shadows), as in a telescope
  _viewDir
    .copy(_toSun)
    .multiplyScalar(0.22)
    .addScaledVector(_side, 0.975)
    .addScaledVector(_worldUp, planetIndex === 4 ? 0.035 : 0.16)
    .normalize()

  // drift towards the night side, looking back at the Sun
  const drift = HERO_BACKLIT.has(planetIndex) ? heroDrift[planetIndex + 2] : 0
  if (drift > 0) {
    const sunDistance = _planetCenter.distanceTo(SYSTEM_OFFSET)
    const theta = backlitAngle(heroDistanceFor(planetIndex), sunDistance)
    _backDir
      .copy(_toSun)
      .multiplyScalar(-Math.cos(theta))
      .addScaledVector(_side, Math.sin(theta))
      .addScaledVector(_worldUp, 0.1)
      .normalize()
    _viewDir.lerp(_backDir, drift).normalize()
  }

  const heroDistance = heroDistanceFor(planetIndex)
  const arrivalDistance = heroDistance * 2.35

  outTarget
    .copy(_planetCenter)
    .addScaledVector(_side, config.compositionOffset)

  outHero
    .copy(_planetCenter)
    .addScaledVector(_viewDir, heroDistance)
    .addScaledVector(_side, config.compositionOffset * 0.18)

  outArrival
    .copy(_planetCenter)
    .addScaledVector(_viewDir, arrivalDistance)
    .addScaledVector(_side, config.compositionOffset * 0.10)
}

/* Pale Blue Dot: from far out, look back home with a long, narrow lens.
   The camera sits beyond the Sun from Earth and above the planets' plane,
   so Earth shows its sunlit face as a tiny blue speck just past the
   Sun's glare (like the speck in Voyager 1's photo, caught in sunlight). */
const PALE_BLUE_DOT_DISTANCE = 95
const PALE_BLUE_DOT_ELEVATION = (50 * Math.PI) / 180
const PALE_BLUE_DOT_FOV = 16
const _pbdEarth = new THREE.Vector3()
const _pbdDir = new THREE.Vector3()

function paleBlueDotPose(outPos: THREE.Vector3, outTarget: THREE.Vector3) {
  getPlanetPosition(2, simClock.jd, _pbdEarth)
  // direction from Earth through the Sun and out the far side
  _pbdDir.copy(SYSTEM_OFFSET).sub(_pbdEarth)
  _pbdDir.y = 0
  _pbdDir.normalize()
  _pbdDir
    .multiplyScalar(Math.cos(PALE_BLUE_DOT_ELEVATION))
    .addScaledVector(_worldUp, Math.sin(PALE_BLUE_DOT_ELEVATION))
    .normalize()
  outPos.copy(SYSTEM_OFFSET).addScaledVector(_pbdDir, PALE_BLUE_DOT_DISTANCE)
  outTarget.copy(_pbdEarth)
}

function fovFor(chapter: number) {
  if (isPlanetChapter(chapter)) return PLANET_CONFIG[chapter - 2].fov
  if (chapter === 10) return PALE_BLUE_DOT_FOV // long lens: Earth as a single speck
  return 41
}

function getRestPose(
  chapter: number,
  progress: number,
  outPos: THREE.Vector3,
  outTarget: THREE.Vector3,
  outArrival: THREE.Vector3 = _dummyArrival,
) {
  if (isPlanetChapter(chapter)) {
    calculatePlanetPose(
      chapter - 2,
      progress,
      outPos,
      outArrival,
      outTarget,
    )
    return
  }

  if (chapter === 10) {
    paleBlueDotPose(outPos, outTarget)
    return
  }

  const fixed =
    chapter === 0
      ? INTRO
      : chapter === 1
        ? SUN
        : chapter === 10
          ? BEYOND
          : chapter === 11
            ? GALAXY_VIEW
            : chapter === 12
              ? LOCAL_GROUP_VIEW
              : RETURN

  outPos.copy(fixed.position)
  outTarget.copy(fixed.target)
}

/* ============================================================
   TRUE SIZE (see scaleReveal.ts): where the Earth goes, and the camera's
   path from close on it back to the whole world
============================================================ */

const _rC = new THREE.Vector3()
const _rV = new THREE.Vector3()
const _rRight = new THREE.Vector3()
const _rUp = new THREE.Vector3()
const _rP0 = new THREE.Vector3()
const _rP1 = new THREE.Vector3()
const _rT1 = new THREE.Vector3()
const _rHero = new THREE.Vector3()
const _rArrival = new THREE.Vector3()
const _rTarget = new THREE.Vector3()

const _orbitAxis = new THREE.Vector3()
const _openingScratch = new THREE.Vector3()
const _openingScratch2 = new THREE.Vector3()
const _openingScratch3 = new THREE.Vector3()
const _guardCentre = new THREE.Vector3()
const _guardOffset = new THREE.Vector3()
const _orbitCentre = new THREE.Vector3()
const _revealPos = new THREE.Vector3()
const _revealTarget = new THREE.Vector3()

const smoother = (x: number) => {
  const t = THREE.MathUtils.clamp(x, 0, 1)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/** the reveal's pose at a time; writes where the Earth is into `reveal` */
function revealPose(
  chapter: number,
  progress: number,
  camera: THREE.PerspectiveCamera,
  time: number,
  fromPos: THREE.Vector3,
  fromTarget: THREE.Vector3,
  outPos: THREE.Vector3,
  outTarget: THREE.Vector3,
) {
  const isSun = chapter === 1
  const index = chapter - 2
  let radius: number
  let realKm: number
  if (isSun) {
    _rC.copy(SYSTEM_OFFSET)
    radius = 1
    realKm = 695700
    _rV.copy(SUN.position).sub(_rC).normalize()
  } else {
    calculatePlanetPose(index, progress, _rHero, _rArrival, _rTarget)
    getPlanetPosition(index, simClock.jd, _rC)
    radius = getPlanetVisualRadius(index)
    realKm = PLANETS[index].radiusKm
    _rV.copy(_rHero).sub(_rC).normalize()
  }
  const earth = (radius * EARTH_KM) / realKm
  // the view's own right and up
  _rRight.copy(_rV).negate().cross(_worldUp).normalize()
  _rUp.copy(_rRight).cross(_rV).negate().normalize()

  // the Earth: beside the world's sunlit edge, at the same depth as its
  // centre (in front of it, it would look larger than it is); Saturn's
  // beyond the rings, the Sun's clear of its glow
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.min(1, camera.aspect)
  const small = earth >= radius * 0.5
  const apart = isSun
    ? (radius + earth) * 1.3
    : index === 5
      ? radius * 2.55 + earth
      : (radius + earth) * (small ? 1.3 : 1.16)
  reveal.earth.copy(_rC).addScaledVector(_rRight, -apart)
  _rT1.copy(_rC).lerp(reveal.earth, small ? 0.5 : isSun ? 0.18 : 0.22)
  const halfSpan = Math.max(radius + _rT1.distanceTo(_rC), reveal.earth.distanceTo(_rT1) + earth)
  _rP1.copy(_rT1).addScaledVector(_rV, (halfSpan / tanHalf) * 1.22)
  reveal.earthRadius = earth
  // close on the Earth: it fills most of the frame
  _rP0.copy(reveal.earth).addScaledVector(_rV, earth * 4.4)

  if (time < REVEAL_HOLD) {
    // in from where the camera was, and hold
    const k = smoother(time / 1.8)
    outPos.lerpVectors(fromPos, _rP0, k)
    outTarget.lerpVectors(fromTarget, reveal.earth, smoother(time / 1.2))
    return
  }
  // the pull back: slow at first, gathering pace as the size dawns
  const pull = smoother((time - REVEAL_HOLD) / REVEAL_PULL)
  const grow = (Math.exp(4 * pull) - 1) / (Math.exp(4) - 1)
  outPos.lerpVectors(_rP0, _rP1, grow)
  outTarget.lerpVectors(reveal.earth, _rT1, grow)
}

/* ============================================================
   THE SIX SHOTS (see shots.ts): each a camera of its own round the
   chapter's planet, drifting slowly while it holds
============================================================ */

const _sC = new THREE.Vector3()
const _sS = new THREE.Vector3()
const _sSide = new THREE.Vector3()
const _sN = new THREE.Vector3()
const _sF = new THREE.Vector3()
const _sHero = new THREE.Vector3()
const _sArrival = new THREE.Vector3()
const _sTarget = new THREE.Vector3()
const KM_PER_UNIT = EARTH_KM / getPlanetVisualRadius(2)
/** the camera's up for the shot (the local vertical, low over a world) */
const shotUp = new THREE.Vector3(0, 1, 0)

function shotPose(
  which: number,
  index: number,
  progress: number,
  time: number,
  outPos: THREE.Vector3,
  outTarget: THREE.Vector3,
) {
  shotUp.set(0, 1, 0)
  calculatePlanetPose(index, progress, _sHero, _sArrival, _sTarget)
  getPlanetPosition(index, simClock.jd, _sC)
  const radius = getPlanetVisualRadius(index)
  _sS.copy(SYSTEM_OFFSET).sub(_sC).normalize()
  _sSide.crossVectors(_worldUp, _sS).normalize()
  const hero = _sHero.distanceTo(_sC)
  // a slow turn about the planet while the shot holds
  const turn = time * 0.012

  switch (which) {
    case 2: {
      // over the sunlit side, the Sun some 45 degrees up (bright enough
      // to read the clouds, low enough for relief), looking along the
      // surface towards the limb
      _sN.copy(_sS).multiplyScalar(0.72).addScaledVector(_sSide, 0.64).addScaledVector(_worldUp, 0.26).normalize()
      _sN.applyAxisAngle(_worldUp, turn)
      _sF.crossVectors(_worldUp, _sN).normalize()
      outPos.copy(_sC).addScaledVector(_sN, radius * 1.3)
      outTarget.copy(_sC).addScaledVector(_sN.clone().addScaledVector(_sF, 0.55).addScaledVector(_worldUp, 0.12).normalize(), radius)
      break
    }
    case 3: {
      // the night side, the Sun almost straight behind
      // (straight back from the Sun: the planet hides it, an eclipse)
      _sN.copy(_sS).multiplyScalar(-1).addScaledVector(_sSide, 0.02).addScaledVector(_worldUp, 0.06).normalize()
      _sN.applyAxisAngle(_worldUp, Math.sin(time * 0.15) * 0.01)
      outPos.copy(_sC).addScaledVector(_sN, hero * 1.05)
      outTarget.copy(_sC)
      break
    }
    case 4: {
      // at Earth: beside the Space Station, 418 km up (SpaceStation.tsx)
      if (index === 2 && shot.chapter === 4) {
        stationShotPose(time, SYSTEM_OFFSET, outPos, outTarget, shotUp)
        break
      }
      // a wider three-quarter view: the ship is in the foreground (ExplorerShip)
      _sN.copy(_sS).multiplyScalar(0.34).addScaledVector(_sSide, 0.92).addScaledVector(_worldUp, 0.2).normalize()
      _sN.applyAxisAngle(_worldUp, -turn * 0.6)
      outPos.copy(_sC).addScaledVector(_sN, hero * 1.3)
      outTarget.copy(_sC).addScaledVector(_sSide, -radius * 0.2)
      break
    }
    case 5: {
      // just above the air, looking along the curve to the horizon
      _sN.copy(_sS).multiplyScalar(0.5).addScaledVector(_sSide, 0.78).addScaledVector(_worldUp, 0.38).normalize()
      _sN.applyAxisAngle(_worldUp, turn * 0.8)
      _sF.crossVectors(_sN, _worldUp).normalize()
      outPos.copy(_sC).addScaledVector(_sN, radius * 1.045)
      outTarget.copy(outPos).addScaledVector(_sF, radius).addScaledVector(_sN, -radius * 0.2)
      // the camera's up is the local vertical: the ground below, the sky above
      shotUp.copy(_sN)
      break
    }
    case 6: {
      // far out, above the plane of its moons
      // from the Sun's side, looking out (back towards the Sun the
      // journey's shortened distances would show it, near and large)
      // (near the plane of the moons: they string out in a line, and faint
      // rings stay a thread)
      _sN.copy(_sSide).multiplyScalar(0.55).addScaledVector(_worldUp, 0.12).addScaledVector(_sS, 0.62).normalize()
      _sN.applyAxisAngle(_worldUp, turn * 0.6)
      // (from the Sun's side, no further than most of the way to it: the
      // journey's distances are shortened, and further out the camera
      // would pass it; a wide lens, below, takes in the moons)
      // (and well clear of the Sun itself, for the inner worlds)
      outPos.copy(_sC).addScaledVector(_sN, Math.min(hero * 6.5, Math.max(hero * 1.6, _sC.distanceTo(SYSTEM_OFFSET) - 3.4)))
      outTarget.copy(_sC)
      break
    }
    default: {
      outPos.copy(_sHero)
      outTarget.copy(_sTarget)
    }
  }
  shot.distanceKm = outPos.distanceTo(_sC) * KM_PER_UNIT
  shot.altitudeKm = (outPos.distanceTo(_sC) - radius) * KM_PER_UNIT
  return radius
}

/* The film at the Sun, the Pale Blue Dot, the Milky Way and the Local
   Group: the same six kinds of shot, each world's own version of them */
const FILM_CHAPTERS = new Set([1, 10, 11, 12])
const filmable = (chapter: number) => isPlanetChapter(chapter) || FILM_CHAPTERS.has(chapter)

/** the lens for a shot (null: the chapter's own) */
function shotFov(chapter: number, which: number) {
  if (isPlanetChapter(chapter)) return which === 6 ? 64 : null
  if (chapter === 10) return which === 6 ? PALE_BLUE_DOT_FOV : PLANET_CONFIG[2].fov
  if (chapter === 1) return which === 6 ? 52 : which === 3 ? 30 : 41
  return which === 6 ? 56 : 44
}

const _gN = new THREE.Vector3()
const _gE1 = new THREE.Vector3()
const _gE2 = new THREE.Vector3()
const _gC = new THREE.Vector3()
const _gA = new THREE.Vector3()
const _gV = new THREE.Vector3()
const _gD = new THREE.Vector3()
const _gEuler = new THREE.Euler()
const _venus = new THREE.Vector3()
const _earthAt = new THREE.Vector3()

/** a chapter's shot that is not a planet's own; returns the near plane */
function chapterShotPose(which: number, chapter: number, time: number, outPos: THREE.Vector3, outTarget: THREE.Vector3) {
  shotUp.set(0, 1, 0)
  const turn = time * 0.01

  if (chapter === 1) {
    const S = SYSTEM_OFFSET
    _gD.copy(SUN.position).sub(S).normalize().applyAxisAngle(_worldUp, turn)
    _gE1.crossVectors(_worldUp, _gD).normalize()
    switch (which) {
      case 2: {
        // low over the photosphere, looking along it to the limb
        outPos.copy(S).addScaledVector(_gD, 1.3)
        outTarget.copy(S).addScaledVector(_gD.clone().addScaledVector(_gE1, 1.25).normalize(), 1)
        shotUp.copy(_gD)
        shot.altitudeKm = 0.3 * 695700
        return 0.01
      }
      case 3: {
        // Venus in transit: on the line from the Sun out through Venus,
        // beyond it, so it crosses the Sun's face (its air lit round it)
        getPlanetPosition(1, simClock.jd, _venus)
        _gV.copy(_venus).sub(S)
        const gap = _gV.length()
        _gV.normalize()
        _gE2.crossVectors(_worldUp, _gV).normalize()
        outPos.copy(_venus).addScaledVector(_gV, gap * 2.2).addScaledVector(_gE2, gap * 0.38 + Math.sin(time * 0.12) * gap * 0.02)
        outTarget.copy(S)
        return 0.05
      }
      case 4: {
        outPos.copy(S).addScaledVector(_gD, 4.2).addScaledVector(_worldUp, 0.6)
        outTarget.copy(S)
        return 0.004
      }
      case 5: {
        // sunrise from orbit: over Earth's night side by the terminator,
        // the Sun just clearing the curve of the world
        getPlanetPosition(2, simClock.jd, _earthAt)
        const rE = getPlanetVisualRadius(2)
        _gV.copy(S).sub(_earthAt).normalize()
        _gN.copy(_worldUp).addScaledVector(_gV, -_gV.y).normalize()
        _gN.multiplyScalar(0.97).addScaledVector(_gV, -0.24).normalize()
        outPos.copy(_earthAt).addScaledVector(_gN, rE * 1.045)
        _gE2.copy(_gV).addScaledVector(_gN, -_gV.dot(_gN)).normalize()
        outTarget.copy(outPos).addScaledVector(_gE2, Math.cos(0.2)).addScaledVector(_gN, -Math.sin(0.2))
        shotUp.copy(_gN)
        shot.altitudeKm = 0.045 * 6371
        return rE * 0.01
      }
      case 6: {
        outPos.copy(S).addScaledVector(_worldUp, 10).addScaledVector(_gD, 9).addScaledVector(_gE1, 4)
        outTarget.copy(S)
        return 0.08
      }
      default: {
        // the Sun large, a little off-centre
        outPos.copy(S).addScaledVector(_gD, 3.1)
        outTarget.copy(S).addScaledVector(_gE1, -0.55)
        return 0.08
      }
    }
  }

  // the Milky Way's frame: its centre, pole and two axes in its disc
  const R = GALAXY_RADIUS * GALAXY_SCALE
  _gC.set(...GALAXY_POSITION)
  _gEuler.set(...GALAXY_TILT)
  _gN.set(0, 1, 0).applyEuler(_gEuler)
  _gE1.set(1, 0, 0).applyEuler(_gEuler).applyAxisAngle(_gN, turn)
  _gE2.set(0, 0, 1).applyEuler(_gEuler).applyAxisAngle(_gN, turn)

  if (chapter === 11) {
    switch (which) {
      case 2: {
        // over the arms, looking down across the star clouds and dust
        outPos.copy(_gC).addScaledVector(_gE1, R * 0.62).addScaledVector(_gN, R * 0.22)
        outTarget.copy(_gC).addScaledVector(_gE1, R * 0.3).addScaledVector(_gE2, R * 0.18)
        shotUp.copy(_gN)
        break
      }
      case 3: {
        // edge-on: the dust lane dark against the glowing bulge
        outPos.copy(_gC).addScaledVector(_gE2, R * 1.9).addScaledVector(_gN, R * 0.03)
        outTarget.copy(_gC)
        shotUp.copy(_gN)
        break
      }
      case 4: {
        outPos.copy(_gC).addScaledVector(_gN, R * 1.3).addScaledVector(_gE2, R * 1.5)
        outTarget.copy(_gC)
        break
      }
      case 5: {
        // from where the Sun is, 26,000 light-years out, in the disc,
        // looking to the centre: the Milky Way as we see it, a band
        outPos.copy(_gC).addScaledVector(_gE1, GALAXY_SUN_RADIUS * GALAXY_SCALE).addScaledVector(_gN, R * 0.012)
        outTarget.copy(_gC)
        shotUp.copy(_gN)
        break
      }
      case 6: {
        outPos.copy(_gC).addScaledVector(_gN, R * 3.3).addScaledVector(_gE2, R * 1.6)
        outTarget.copy(_gC)
        break
      }
      default: {
        outPos.copy(_gC).addScaledVector(_gN, R * 1.35).addScaledVector(_gE1, R * 0.95)
        outTarget.copy(_gC)
      }
    }
    return 0.08
  }

  // the Local Group: Andromeda and the Milky Way
  const andromeda = NEIGHBOURS[0]
  _gA.copy(andromeda.at)
  const RA = andromeda.radius
  _gEuler.set(...andromeda.tilt)
  const nA = _gD.set(0, 1, 0).applyEuler(_gEuler)
  // the way to Andromeda, in the Milky Way's disc
  _gV.copy(_gA).sub(_gC)
  _gV.addScaledVector(_gN, -_gV.dot(_gN)).normalize()
  // a view of Andromeda: mostly face-on, turned a little towards us
  const toUs = _venus.copy(_gC).sub(_gA).normalize()
  const view = _earthAt.copy(nA).multiplyScalar(nA.dot(toUs) >= 0 ? 0.8 : -0.8).addScaledVector(toUs, 0.6).normalize()
  view.applyAxisAngle(nA, turn)
  switch (which) {
    case 2:
      // close on the core, a little off it (its bright heart below the frame's middle)
      outPos.copy(_gA).addScaledVector(view, RA * 1.15)
      outTarget.copy(_gA).addScaledVector(nA, RA * 0.12)
      break
    case 3:
      // the Milky Way edge-on, its dust against its core, Andromeda beyond
      outPos.copy(_gC).addScaledVector(_gV, -R * 2.1).addScaledVector(_gN, R * 0.03)
      outTarget.copy(_gC)
      shotUp.copy(_gN)
      break
    case 4:
      outPos.copy(_gA).addScaledVector(view, RA * 3.4)
      outTarget.copy(_gA)
      break
    case 5: {
      // from above the Milky Way's far side, its disc across the lower
      // frame, Andromeda beyond it
      // (on the line from Andromeda through the Milky Way, beyond it and
      // raised: Andromeda well out of the disc's plane stays in frame)
      const line = _gC.clone().sub(_gA).normalize()
      const lift = _gN.clone().addScaledVector(line, -_gN.dot(line)).normalize()
      // (the side that keeps the Solar System's model, drawn near the
      // origin, out of the frame)
      const toOrigin = _gC.clone().addScaledVector(line, R * 1.7).negate().normalize()
      if (toOrigin.dot(lift) < 0) lift.negate()
      outPos.copy(_gC).addScaledVector(line, R * 1.7).addScaledVector(lift, -R * 0.55)
      lift.negate()
      const toCore = _gC.clone().sub(outPos).normalize()
      const toAndromeda = _gA.clone().sub(outPos).normalize()
      outTarget.copy(outPos).add(toCore.multiplyScalar(0.45).add(toAndromeda.multiplyScalar(0.55)).normalize())
      shotUp.copy(lift)
      break
    }
    case 6:
      outPos.copy(LOCAL_GROUP_VIEW.position)
      outTarget.copy(_gC).lerp(_gA, 0.5)
      break
    default:
      outPos.copy(_gA).addScaledVector(view, RA * 2.3)
      outTarget.copy(_gA)
  }
  return 0.08
}

/* ============================================================
   DIRECTED ARRIVALS (cinematic mode; see viewMode.ts)
   At five chapters the glide in ends on a shot of its own, and from
   there a short directed sequence runs to the chapter's usual view: a
   path through keyframes (Catmull-Rom), eased in and out, never inside
   the world. The chapter's words wait until it lands.
============================================================ */

const SEQUENCE_SECONDS: Record<number, number> = { 1: 8, 2: 7, 4: 10, 6: 12, 7: 14, 10: 10 }

/* the Great Red Spot's place on Jupiter now (world), and whether it is on
   the sunlit side; else the same latitude where the Sun is high */
const _grs = new THREE.Vector3()
const _grsPole = new THREE.Vector3()
function redSpot(centre: THREE.Vector3, out: THREE.Vector3) {
  const body = pickBodies[4]
  if (!body) return out.set(0, -0.36, 0.93).normalize()
  body.updateWorldMatrix(true, false)
  _grs.copy(latLonToSphere(-21.1, -46.4, 1))
  body.localToWorld(_grs)
  out.copy(_grs).sub(centre).normalize()
  _grsPole.set(0, 1, 0).applyQuaternion(body.getWorldQuaternion(new THREE.Quaternion()))
  const toSun = _kA.copy(SYSTEM_OFFSET).sub(centre).normalize()
  if (out.dot(toSun) < 0.2) {
    // (the storm is round the back: the same latitude, under the Sun)
    toSun.addScaledVector(_grsPole, -toSun.dot(_grsPole)).normalize()
    out.copy(toSun).multiplyScalar(Math.cos((21.1 * Math.PI) / 180)).addScaledVector(_grsPole, -Math.sin((21.1 * Math.PI) / 180)).normalize()
  }
  return out
}

/* a hand-held tremor for the fast passes, as a camera ship would feel
   them: tiny, and only while the pass is on */
function shakeFor(chapter: number, t: number, openingClock: number) {
  if (opening.active && chapter === 0) return THREE.MathUtils.smoothstep(openingClock, 25, 27) * (1 - THREE.MathUtils.smoothstep(openingClock, 36, 38.5))
  const window = (a: number, b: number) => THREE.MathUtils.smoothstep(t, a, a + 0.06) * (1 - THREE.MathUtils.smoothstep(t, b - 0.06, b))
  if (chapter === 2) return window(0.2, 0.55)
  if (chapter === 6) return window(0.3, 0.62)
  if (chapter === 7) return window(0.28, 0.58)
  return 0
}
const _shake = new THREE.Vector3()

/* ---- THE OPENING (viewMode.ts): one path through the Solar System ---- */
const _oPoints = Array.from({ length: 11 }, () => new THREE.Vector3())
const _oTargets = Array.from({ length: 11 }, () => new THREE.Vector3())
const _oTimes = [0, 5, 11, 17, 22, 25, 29, 33, 37, 45, OPENING_SECONDS]
const _oP = new THREE.Vector3()
const _oUp = new THREE.Vector3()
const _oFly = new THREE.Vector3()

function flybyPoint(index: number, out: THREE.Vector3, distance: number) {
  getPlanetPosition(index, simClock.jd, _oP)
  const R = getPlanetVisualRadius(index)
  _kS.copy(SYSTEM_OFFSET).sub(_oP).normalize()
  _kSide.crossVectors(_worldUp, _kS).normalize()
  return out.copy(_oP).addScaledVector(dir(_oFly, _kSide, 0.75, _kS, 0.55, _worldUp, 0.3), R * distance)
}

/** the opening's pose at a time; writes the camera's up; returns near and lens */
function openingPose(time: number, outPos: THREE.Vector3, outTarget: THREE.Vector3, outUp: THREE.Vector3) {
  const S = SYSTEM_OFFSET
  // the dark: out beyond the planets, facing away from the Sun
  _oPoints[0].copy(S).add(_oP.set(-14, 9, 40))
  _oTargets[0].copy(_oPoints[0]).add(_oP.set(-12, 6, 40))
  _oPoints[1].copy(S).add(_oP.set(-12, 8, 36))
  _oTargets[1].copy(_oPoints[1]).add(_oP.set(-20, 2, 34))
  // first light: round to the Sun
  _oPoints[2].copy(S).add(_oP.set(-4.5, 2.2, 12))
  _oTargets[2].copy(S)
  // home: in on Earth's day side, down to the horizon, along it
  getPlanetPosition(2, simClock.jd, _kC)
  const rE = getPlanetVisualRadius(2)
  _kB.copy(S).sub(_kC).normalize()
  _kSide.crossVectors(_worldUp, _kB).normalize()
  _oPoints[3].copy(_kC).addScaledVector(dir(_oFly, _kB, 0.8, _kSide, 0.55, _worldUp, 0.2), rE * 7)
  _oTargets[3].copy(_kC)
  shotPose(5, 2, 0, 0, _oPoints[4], _oTargets[4])
  _oUp.copy(shotUp)
  _kW.copy(_oTargets[4]).sub(_oPoints[4]).normalize()
  _oPoints[5].copy(_oPoints[4]).addScaledVector(_kW, rE * 0.12)
  _oTargets[5].copy(_oTargets[4]).addScaledVector(_kW, rE * 0.12)
  // beyond: past Mars, Jupiter and Saturn
  flybyPoint(3, _oPoints[6], 5)
  getPlanetPosition(3, simClock.jd, _oTargets[6])
  flybyPoint(4, _oPoints[7], 3.4)
  getPlanetPosition(4, simClock.jd, _oTargets[7])
  flybyPoint(5, _oPoints[8], 3.6)
  getPlanetPosition(5, simClock.jd, _oTargets[8])
  // the scale of space: far above it all, then down to the opening view
  getPlanetPosition(7, simClock.jd, _oP)
  const reach = _oP.distanceTo(S)
  _oPoints[9].copy(S).addScaledVector(dir(_oFly, _worldUp, 0.85, INTRO.position, 0.02, _kSide, 0.25), reach * 1.6)
  _oTargets[9].copy(S)
  _oPoints[10].copy(INTRO.position)
  _oTargets[10].copy(INTRO.target)

  // where on the path: segments timed by the beats
  const n = _oTimes.length
  const clamped = THREE.MathUtils.clamp(time, 0, OPENING_SECONDS)
  let i = 0
  while (i < n - 2 && clamped > _oTimes[i + 1]) i += 1
  let local = (clamped - _oTimes[i]) / (_oTimes[i + 1] - _oTimes[i])
  // (gentle at the very start and end)
  if (i === 0) local = local * local * (3 - 2 * local) * 0.5 + local * 0.5
  if (i === n - 2) local = smoother(local)
  const u = (i + local) / (n - 1)
  catmull(_oPoints, n, u, outPos)
  // the eye turns early to what comes next (never at empty space between)
  outTarget.lerpVectors(_oTargets[i], _oTargets[i + 1], THREE.MathUtils.smoothstep(local, 0.05, 0.5))

  // never through a world, nor the Sun
  for (let k = 0; k < 8; k += 1) {
    getPlanetPosition(k, simClock.jd, _oP)
    const R = getPlanetVisualRadius(k) * (k === 2 ? 1.03 : k === 5 ? 2.5 : 1.3)
    _kA.copy(outPos).sub(_oP)
    if (_kA.length() < R) outPos.copy(_oP).addScaledVector(_kA.normalize(), R)
  }
  // (only out of the Sun: in the journey's layout Earth sits close to it)
  _kA.copy(outPos).sub(S)
  if (_kA.length() < 1.3) outPos.copy(S).addScaledVector(_kA.normalize(), 1.3)

  const low = THREE.MathUtils.smoothstep(clamped, 19.5, 21.5) * (1 - THREE.MathUtils.smoothstep(clamped, 25, 27.5))
  outUp.set(0, 1, 0).lerp(_oUp, low).normalize()
  const near = clamped > 16 && clamped < 29 ? Math.min(0.08, rE * 0.01) : 0.08
  const fov = THREE.MathUtils.lerp(41, 54, THREE.MathUtils.smoothstep(clamped, 37, 44) * (1 - THREE.MathUtils.smoothstep(clamped, 46, OPENING_SECONDS)))
  return { near, fov }
}

const _kPoints = [0, 1, 2, 3, 4].map(() => new THREE.Vector3())
const _kTargets = [0, 1, 2, 3, 4].map(() => new THREE.Vector3())
const _kA = new THREE.Vector3()
const _kB = new THREE.Vector3()
const _kC = new THREE.Vector3()
const _kS = new THREE.Vector3()
const _kSide = new THREE.Vector3()
const _kN = new THREE.Vector3()
const _kU = new THREE.Vector3()
const _kW = new THREE.Vector3()
const _kLocalUp = new THREE.Vector3()
const _kPbd = new THREE.Vector3()
const _kPbdTarget = new THREE.Vector3()

/* a point on a Catmull-Rom path through `points` (the ends repeated) */
function catmull(points: THREE.Vector3[], count: number, u: number, out: THREE.Vector3) {
  const segments = count - 1
  const x = THREE.MathUtils.clamp(u, 0, 1) * segments
  const i = Math.min(Math.floor(x), segments - 1)
  const t = x - i
  const p0 = points[Math.max(i - 1, 0)]
  const p1 = points[i]
  const p2 = points[i + 1]
  const p3 = points[Math.min(i + 2, count - 1)]
  const t2 = t * t
  const t3 = t2 * t
  return out.set(0, 0, 0)
    .addScaledVector(p0, -0.5 * t3 + t2 - 0.5 * t)
    .addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1)
    .addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * t)
    .addScaledVector(p3, 0.5 * t3 - 0.5 * t2)
}
const dir = (v: THREE.Vector3, a: THREE.Vector3, sa: number, b: THREE.Vector3, sb: number, c: THREE.Vector3, sc: number) =>
  v.copy(a).multiplyScalar(sa).addScaledVector(b, sb).addScaledVector(c, sc).normalize()

/** the lens through a sequence */
function sequenceFov(chapter: number, t: number) {
  if (chapter === 10) return THREE.MathUtils.lerp(PLANET_CONFIG[2].fov, PALE_BLUE_DOT_FOV, THREE.MathUtils.smoothstep(t, 0.35, 1))
  return fovFor(chapter)
}

/* the pose at t (0..1) of a chapter's sequence, ending on its usual view
   (restPos, restTarget); writes the camera's up; returns the near plane */
function sequencePose(
  chapter: number,
  t: number,
  progress: number,
  restPos: THREE.Vector3,
  restTarget: THREE.Vector3,
  outPos: THREE.Vector3,
  outTarget: THREE.Vector3,
  outUp: THREE.Vector3,
) {
  const e = smoother(t)
  outUp.set(0, 1, 0)
  let count = 0
  let centre: THREE.Vector3 | null = null
  let floor = 0
  let near = 0.08
  let localUpWeight = 0

  if (chapter === 1) {
    // the Sun: low over its surface, then back to the corona, then the
    // planets for scale
    const S = SYSTEM_OFFSET
    dir(_kS, SUN.position, 1, S, -1, _worldUp, 0)
    _kSide.crossVectors(_worldUp, _kS).normalize()
    _kPoints[0].copy(S).addScaledVector(_kS, 1.3).addScaledVector(_kSide, 0.15)
    _kTargets[0].copy(S).addScaledVector(_kA.copy(_kS).addScaledVector(_kSide, 1.25).normalize(), 1)
    // (far enough back that the disc and its corona fit the frame)
    _kPoints[1].copy(S).addScaledVector(dir(_kA, _kS, 1, _kSide, 0.6, _worldUp, 0.15), 3.3)
    _kTargets[1].copy(S)
    _kPoints[2].copy(restPos)
    _kTargets[2].copy(restTarget)
    count = 3
    centre = S
    floor = 1.12
    outUp.copy(_kS).lerp(_worldUp, THREE.MathUtils.smoothstep(e, 0, 0.55)).normalize()
    near = THREE.MathUtils.lerp(0.01, 0.08, THREE.MathUtils.smoothstep(e, 0.2, 0.8))
  } else if (chapter === 10) {
    // the Pale Blue Dot: pull away from Earth until it is a point
    paleBlueDotPose(_kPbd, _kPbdTarget)
    getPlanetPosition(2, simClock.jd, _kC)
    const rE = getPlanetVisualRadius(2)
    _kA.copy(_kPbd).sub(_kC)
    const far = _kA.length()
    _kA.normalize()
    const pull = Math.pow(e, 1.25)
    const distance = Math.exp(THREE.MathUtils.lerp(Math.log(rE * 5.5), Math.log(far), pull))
    outPos.copy(_kC).addScaledVector(_kA, distance)
    outTarget.copy(_kC)
    return 0.08
  } else {
    const index = chapter - 2
    getPlanetPosition(index, simClock.jd, _kC)
    const R = getPlanetVisualRadius(index)
    centre = _kC
    // low over a small world the near plane comes close
    near = Math.min(0.08, R * 0.02)
    _kS.copy(SYSTEM_OFFSET).sub(_kC).normalize()
    _kSide.crossVectors(_worldUp, _kS).normalize()
    const hero = restPos.distanceTo(_kC)

    if (chapter === 2) {
      // Mercury: a fast pass low over the craters, swinging out round it
      _kPoints[0].copy(_kC).addScaledVector(dir(_kA, _kSide, -0.85, _kS, 0.3, _worldUp, 0.2), R * 3.4)
      _kPoints[1].copy(_kC).addScaledVector(dir(_kA, _kSide, 0.05, _kS, 0.95, _worldUp, 0.3), R * 1.14)
      _kPoints[2].copy(_kC).addScaledVector(dir(_kA, _kSide, 0.92, _kS, 0.35, _worldUp, 0.05), R * 1.8)
      _kPoints[3].copy(restPos)
      for (let i = 0; i < 3; i += 1) _kTargets[i].copy(_kC)
      _kTargets[3].copy(restTarget)
      count = 4
      floor = 1.08
    } else if (chapter === 6) {
      // Jupiter: a plunge towards the clouds and the Great Red Spot,
      // spreading across the frame, and away before the air takes it
      redSpot(_kC, _kN)
      _kU.copy(_kN).cross(_worldUp).normalize()
      dir(_kA, restPos, 1, _kC, -1, _worldUp, 0)
      _kPoints[0].copy(_kC).addScaledVector(dir(_kB, _kA, 1, _kN, 0.6, _worldUp, 0), R * 6)
      _kTargets[0].copy(_kC)
      _kPoints[1].copy(_kC).addScaledVector(_kN, R * 2.3)
      _kTargets[1].copy(_kC).addScaledVector(_kN, R)
      _kPoints[2].copy(_kC).addScaledVector(_kN, R * 1.22).addScaledVector(_kU, R * 0.08)
      _kTargets[2].copy(_kC).addScaledVector(_kN, R * 0.98).addScaledVector(_kU, -R * 0.22)
      _kPoints[3].copy(_kC).addScaledVector(dir(_kB, _kN, 1, _kA, 1, _worldUp, 0.1), R * 2.8)
      _kTargets[3].copy(_kC)
      _kPoints[4].copy(restPos)
      _kTargets[4].copy(restTarget)
      count = 5
      floor = 1.12
    } else if (chapter === 4) {
      // Earth: in from space, down to the cloud tops along the horizon,
      // a beat there, and back out
      dir(_kA, restPos, 1, _kC, -1, _worldUp, 0)
      _kPoints[0].copy(_kC).addScaledVector(_kA, hero * 2.1)
      _kTargets[0].copy(_kC)
      shotPose(5, 2, progress, 0, _kPoints[1], _kTargets[1])
      _kLocalUp.copy(shotUp)
      _kB.copy(_kTargets[1]).sub(_kPoints[1]).normalize()
      _kPoints[2].copy(_kPoints[1]).addScaledVector(_kB, R * 0.07)
      _kTargets[2].copy(_kTargets[1]).addScaledVector(_kB, R * 0.07)
      _kPoints[3].copy(restPos)
      _kTargets[3].copy(restTarget)
      count = 4
      floor = 1.035
      localUpWeight = THREE.MathUtils.smoothstep(e, 0.12, 0.3) * (1 - THREE.MathUtils.smoothstep(e, 0.7, 0.9))
      near = Math.min(0.08, R * 0.01)
    } else {
      // Saturn: down through the gap in the rings (the Cassini Division,
      // some two radii out), out beneath them, the moons in view
      const n = ringState.ready ? _kN.copy(ringState.normal) : _kN.set(0, 1, 0)
      dir(_kB, restPos, 1, _kC, -1, _worldUp, 0)
      const above = _kB.dot(n) >= 0 ? 1 : -1
      _kU.copy(_kB).addScaledVector(n, -_kB.dot(n)).normalize()
      _kW.crossVectors(n, _kU).normalize()
      const at = (angle: number, radius: number, height: number, out: THREE.Vector3) =>
        out.copy(_kC).addScaledVector(_kU, Math.cos(angle) * R * radius).addScaledVector(_kW, Math.sin(angle) * R * radius).addScaledVector(n, above * R * height)
      at(0, 5.2, 2.6, _kPoints[0])
      _kTargets[0].copy(_kC).addScaledVector(n, above * R * 0.9)
      at(0.25, 1.99, 0.24, _kPoints[1])
      at(0.62, 1.99, -0.5, _kTargets[1])
      at(0.38, 1.99, -0.24, _kPoints[2])
      _kTargets[2].copy(_kC)
      at(0.7, 3.8, -0.75, _kPoints[3])
      _kTargets[3].copy(_kC)
      _kPoints[4].copy(restPos)
      _kTargets[4].copy(restTarget)
      count = 5
      floor = 1.06
    }
  }

  catmull(_kPoints, count, e, outPos)
  catmull(_kTargets, count, e, outTarget)
  // never inside the world
  if (centre) {
    const radius = chapter === 1 ? 1 : getPlanetVisualRadius(chapter - 2)
    _kA.copy(outPos).sub(centre)
    if (_kA.length() < radius * floor) outPos.copy(centre).addScaledVector(_kA.normalize(), radius * floor)
  }
  if (localUpWeight > 0) outUp.lerp(_kLocalUp, localUpWeight).normalize()
  return near
}

/* ============================================================
   CAMERA CONTROLLER
============================================================ */

function CinematicCamera({
  progressRef,
}: {
  progressRef: MutableRefObject<number>
}) {
  const { camera: baseCamera, pointer } = useThree()
  const camera = baseCamera as THREE.PerspectiveCamera
  const size = useThree((state) => state.size)

  useEffect(() => {
    if (size.width < 760 && size.height > size.width) {
      camera.setViewOffset(
        size.width,
        size.height,
        0,
        size.height * 0.17,
        size.width,
        size.height,
      )
    } else {
      camera.clearViewOffset()
    }
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])
  const initialized = useRef(false)
  // the opening entrance: starts as the loading screen lifts
  const entranceClock = useRef(-1)
  const entranceDone = useRef(false)
  const bank = useRef(0)
  const heroChapter = useRef(-1)
  const heroTime = useRef(0)
  const smoothPosition = useRef(new THREE.Vector3())
  const parallaxWeight = useRef(1)
  // "Reduce motion": camera follows scroll directly, no drift or mouse parallax
  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const piloting = useRef(false)
  // directed arrivals: armed by the glide in, played once arrived
  const seqChapter = useRef(-1)
  const seqArmed = useRef(false)
  const seqDone = useRef(false)
  const seqClock = useRef(0)
  const seqUp = useRef(new THREE.Vector3(0, 1, 0))
  const seqRestPos = useRef(new THREE.Vector3())
  const seqRestTarget = useRef(new THREE.Vector3())
  // interactive: the orbit as eased
  const openingUp = useRef(new THREE.Vector3(0, 1, 0))
  const orbitChapter = useRef(-1)
  const orbit = useRef({ yaw: 0, pitch: 0, zoom: 1 })
  // the true-size reveal: how much of it the camera follows (1 in it,
  // easing to 0 after), and the near plane it needed
  const revealBlend = useRef(0)
  const revealFrom = useRef({ pos: new THREE.Vector3(), target: new THREE.Vector3() })
  // the lens shift that sets a planet left of the words (0..1)
  const lensShift = useRef(0)

  useFrame((_, delta) => {
    // flying the jet: the jet's camera has the controls
    if (pilot.active) {
      piloting.current = true
      if (camera.filmOffset !== 0) {
        camera.filmOffset = 0
        lensShift.current = 0
        camera.updateProjectionMatrix()
      }
      return
    }
    if (piloting.current) {
      // landed: glide back to the journey from wherever the jet was
      piloting.current = false
      smoothPosition.current.copy(camera.position)
    }
    const progress = progressRef.current

    const safeProgress = Number.isFinite(progress)
      ? THREE.MathUtils.clamp(progress, 0, 13.999999)
      : 0

    const chapter = Math.min(13, Math.floor(safeProgress))

    // the Local Group: Andromeda is 2,600 units out, past the usual reach
    const reach = safeProgress > 11.5 && safeProgress < 13.25 ? LOCAL_GROUP_VIEW.reach + 600 : 2000
    if (camera.far !== reach) {
      camera.far = reach
      camera.updateProjectionMatrix()
    }
    const local = THREE.MathUtils.clamp(
      safeProgress - chapter,
      0,
      0.999999,
    )

    const planet = isPlanetChapter(chapter)

    view.halfWidthAngle = Math.atan(
      Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect,
    )

    // backlit hero drift: reset on entering a chapter, advance once arrived
    if (chapter !== heroChapter.current) {
      heroChapter.current = chapter
      heroTime.current = 0
      heroDrift[chapter] = 0
    }
    // directed arrivals (cinematic mode): armed by the glide in
    const endSequence = () => {
      seqDone.current = true
      window.dispatchEvent(new CustomEvent(SEQUENCE_EVENT, { detail: { chapter: seqChapter.current, on: false } }))
    }
    if (chapter !== seqChapter.current) {
      if (seqArmed.current && !seqDone.current) endSequence()
      seqChapter.current = chapter
      seqArmed.current = false
      seqDone.current = false
      seqClock.current = 0
    }
    const canDirect = viewMode.mode === 'cinematic' && !reducedMotion && SEQUENCE_SECONDS[chapter] !== undefined
    if (canDirect && !seqArmed.current && !seqDone.current && chapter > 0 && local < BLEND) {
      seqArmed.current = true
      sequence.chapter = chapter
      sequence.skip = false
      window.dispatchEvent(new CustomEvent(SEQUENCE_EVENT, { detail: { chapter, on: true } }))
    }
    if (seqArmed.current && !seqDone.current && !canDirect) endSequence()
    const directing = seqArmed.current && !seqDone.current
    const seqActive = directing && local >= BLEND

    if ((planet || chapter <= 1) && (local >= BLEND || chapter === 0) && !reducedMotion && !directing) {
      heroTime.current += delta
      heroDrift[chapter] = viewMode.mode === 'cinematic' ? ease(
        (heroTime.current - HERO_DELAY) / HERO_DURATION,
      ) : 0
    }

    // lens changes travel with the flight (e.g. the long lens on Earth
    // opening up to the wide galaxy view during the pull-back)
    // a shot's own lens
    const filmFov = shot.index > 0 && shot.chapter === chapter && filmable(chapter) && local >= BLEND ? shotFov(chapter, shot.index) : null
    const seqFov = directing
      ? local < BLEND
        ? THREE.MathUtils.lerp(fovFor(chapter - 1), sequenceFov(chapter, 0), ease(local / BLEND))
        : sequenceFov(chapter, Math.min(seqClock.current / SEQUENCE_SECONDS[chapter], 1))
      : null
    const openingFov = opening.active && chapter === 0 ? openingPose(opening.clock, _openingScratch, _openingScratch2, _openingScratch3).fov : null
    const baseFov = openingFov !== null
      ? openingFov
      : filmFov !== null
      ? filmFov
      : seqFov !== null
      ? seqFov
      : chapter > 0 && local < BLEND
        ? THREE.MathUtils.lerp(fovFor(chapter - 1), fovFor(chapter), ease(local / BLEND))
        : fovFor(chapter)
    // Portrait screens: widen the vertical FOV so planets fit the narrow width
    const portraitScale = Math.max(
      1,
      0.75 / Math.max(camera.aspect, 0.42),
    )
    const targetFov =
      portraitScale === 1
        ? baseFov
        : THREE.MathUtils.radToDeg(
            2 *
              Math.atan(
                Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) *
                  portraitScale,
              ),
          )

    getRestPose(
      chapter,
      safeProgress,
      _currPos,
      _currTarget,
      _arrival,
    )
    if (chapter === 11 && camera.aspect < 1) {
      _currTarget.copy(GALAXY_VIEW.portraitTarget)
    }
    if (chapter === 12 && camera.aspect < 1) {
      _currPos.copy(LOCAL_GROUP_VIEW.portraitPosition)
      _currTarget.copy(LOCAL_GROUP_VIEW.portraitTarget)
    }
    seqRestPos.current.copy(_currPos)
    seqRestTarget.current.copy(_currTarget)
    if (directing && local < BLEND) {
      sequencePose(chapter, 0, safeProgress, seqRestPos.current, seqRestTarget.current, _currPos, _currTarget, seqUp.current)
      // come in along the shot's own line of sight
      _arrival.copy(_currPos).sub(_currTarget).multiplyScalar(0.8).add(_currPos)
    }

    if (chapter > 0 && local < BLEND) {
      getRestPose(
        chapter - 1,
        safeProgress,
        _prevPos,
        _prevTarget,
      )

      const t = ease(local / BLEND)

      if (planet) {
        const u = 1 - t

        _scratchPos
          .set(0, 0, 0)
          .addScaledVector(_prevPos, u * u)
          .addScaledVector(_arrival, 2 * u * t)
          .addScaledVector(_currPos, t * t)
      } else {
        _scratchPos.lerpVectors(_prevPos, _currPos, t)
      }

      _scratchTarget.lerpVectors(
        _prevTarget,
        _currTarget,
        t,
      )
    } else {
      _scratchPos.copy(_currPos)
      _scratchTarget.copy(_currTarget)
    }

    /* Close-ups breathe: once arrived, the camera slowly swings a little
       way round the planet and back (moons, rings and stars shift with
       real depth), then settles before the next flight. The backlit shots
       have their own drift. */
    let seqNear = 0.08
    if (seqActive) {
      const seconds = SEQUENCE_SECONDS[chapter]
      // (skipped: fast-forward along the path, never a jump across the world)
      seqClock.current = Math.min(seqClock.current + delta * (sequence.skip ? 7 : 1), seconds)
      const t = seqClock.current / seconds
      seqNear = sequencePose(chapter, t, safeProgress, seqRestPos.current, seqRestTarget.current, _scratchPos, _scratchTarget, seqUp.current)
      if (t >= 1) endSequence()
    }

    // the opening (from the intro): the camera follows its path
    const openingOn = opening.active && chapter === 0 && !pilot.active
    let openingNear = 0.08
    if (openingOn) {
      entranceDone.current = true
      opening.clock = opening.skip ? OPENING_SECONDS : Math.min(opening.clock + delta, OPENING_SECONDS)
      openingNear = openingPose(opening.clock, _scratchPos, _scratchTarget, openingUp.current).near
      // (skipped: a cut, behind the black)
      if (opening.skip) smoothPosition.current.copy(_scratchPos)
    }
    // the fast passes: a tremor, as a camera ship would feel them
    const shake = reducedMotion ? 0 : shakeFor(chapter, seqActive ? seqClock.current / SEQUENCE_SECONDS[chapter] : 0, opening.clock) * (seqActive || openingOn ? 1 : 0)
    if (shake > 0) {
      const now = performance.now() / 1000
      const size = _scratchPos.distanceTo(_scratchTarget) * 0.0035 * shake
      _shake.set(
        Math.sin(now * 13.1) + Math.sin(now * 29.3 + 1.1) * 0.5,
        Math.sin(now * 11.7 + 2.3) + Math.sin(now * 31.9) * 0.5,
        Math.sin(now * 9.4 + 0.7) * 0.6,
      )
      _scratchPos.addScaledVector(_shake, size)
    }

    const restful = (planet && !HERO_BACKLIT.has(chapter - 2)) || chapter <= 1
    if (restful && (local >= BLEND || chapter === 0) && !reducedMotion && viewMode.mode === 'cinematic' && !directing && !openingOn) {
      const settle = ease((heroTime.current - 0.8) / 3)
      const leave = 1 - THREE.MathUtils.smoothstep(local, 0.86, 0.99)
      // the wide views barely turn (the words and the scene are composed)
      const reach = planet ? 0.2 : 0.07
      const swing = Math.sin(heroTime.current * 0.09) * reach * settle * leave
      const breathe = 1 + Math.sin(heroTime.current * 0.06 + 1.3) * 0.035 * settle * leave
      _driftOffset
        .copy(_scratchPos)
        .sub(_scratchTarget)
        .applyAxisAngle(_worldUp, swing)
        .multiplyScalar(breathe)
      _scratchPos.copy(_scratchTarget).add(_driftOffset)
    }

    /* The opening: on first load the camera starts far out above the
       planets' plane, then sweeps down and round into the opening view as
       the title appears. Skipped for reduced motion or if the page opens
       mid-journey; scrolling during it finishes it at once. */
    if (!entranceDone.current) {
      if (reducedMotion || chapter !== 0) {
        entranceDone.current = true
      } else if (lens.revealed || entranceClock.current >= 0) {
        // starts as the loading screen lifts; once begun it runs to the end
        // (later loads don't restart it), in steady steps even if a frame
        // is slow
        if (entranceClock.current < 0) entranceClock.current = 0
        entranceClock.current += Math.min(delta, 0.05)
        const t = THREE.MathUtils.clamp((entranceClock.current - 0.2) / ENTRANCE_SECONDS, 0, 1)
        const e = 1 - Math.pow(1 - t, 3) // ease out: fast at first, then gliding in
        const away = 1 - e
        _driftOffset
          .copy(_scratchPos)
          .sub(_scratchTarget)
          .applyAxisAngle(_worldUp, -1.1 * away)
          .multiplyScalar(1 + 5 * away)
        _driftOffset.y += _driftOffset.length() * 0.55 * away
        _scratchPos.copy(_scratchTarget).add(_driftOffset)
        if (t >= 1) entranceDone.current = true
      } else {
        // still loading: wait, already far out
        _driftOffset.copy(_scratchPos).sub(_scratchTarget).applyAxisAngle(_worldUp, -1.1).multiplyScalar(6)
        _driftOffset.y += _driftOffset.length() * 0.55
        _scratchPos.copy(_scratchTarget).add(_driftOffset)
      }
      if (entranceDone.current === false && entranceClock.current >= 0) {
        // let the smoothing follow the sweep closely
        smoothPosition.current.copy(_scratchPos)
      }
    }

    /* interactive: the visitor's orbit and zoom about what the chapter
       is looking at (eased; back to the chapter's view on leaving it) */
    if (chapter !== orbitChapter.current) {
      orbitChapter.current = chapter
      resetOrbit()
    }
    const interactive = viewMode.mode === 'interactive' && chapter > 0
    const ok = 1 - Math.exp(-delta * 7)
    const o = orbit.current
    o.yaw += ((interactive ? viewMode.yaw : 0) - o.yaw) * ok
    o.pitch += ((interactive ? viewMode.pitch : 0) - o.pitch) * ok
    o.zoom += ((interactive ? viewMode.zoom : 1) - o.zoom) * ok
    if (Math.abs(o.yaw) > 1e-4 || Math.abs(o.pitch) > 1e-4 || Math.abs(o.zoom - 1) > 1e-4) {
      _driftOffset.copy(_scratchPos).sub(_scratchTarget)
      _driftOffset.applyAxisAngle(_worldUp, o.yaw)
      const length = _driftOffset.length()
      _orbitAxis.crossVectors(_driftOffset, _worldUp)
      if (_orbitAxis.lengthSq() > 1e-10 && length > 1e-6) {
        // (never over the pole: the view would flip)
        const elevation = Math.asin(THREE.MathUtils.clamp(_driftOffset.y / length, -1, 1))
        const pitch = THREE.MathUtils.clamp(o.pitch, -1.35 - elevation, 1.35 - elevation)
        _driftOffset.applyAxisAngle(_orbitAxis.normalize(), pitch)
      }
      _driftOffset.multiplyScalar(o.zoom)
      if (planet) {
        getPlanetPosition(chapter - 2, simClock.jd, _orbitCentre)
        const R = getPlanetVisualRadius(chapter - 2)
        _scratchPos.copy(_scratchTarget).add(_driftOffset)
        _orbitAxis.copy(_scratchPos).sub(_orbitCentre)
        if (_orbitAxis.length() < R * 1.3) _scratchPos.copy(_orbitCentre).addScaledVector(_orbitAxis.normalize(), R * 1.3)
      } else {
        _scratchPos.copy(_scratchTarget).add(_driftOffset)
      }
    }

    /* the true-size reveal: the camera follows its path while it runs,
       and eases back to the chapter's own view after */
    const revealHere = reveal.active && reveal.chapter === chapter && (planet || chapter === 1)
    if (revealHere && revealBlend.current === 0) {
      revealFrom.current.pos.copy(camera.position)
      revealFrom.current.target.copy(_scratchTarget)
      reveal.clock = 0
    }
    if (revealHere) {
      reveal.clock = reducedMotion ? REVEAL_END : Math.min(reveal.clock + delta, REVEAL_END)
      revealBlend.current = 1
    } else if (revealBlend.current > 0) {
      revealBlend.current = Math.max(0, revealBlend.current - delta / 1.8)
      if (revealBlend.current === 0 || reveal.chapter !== chapter) revealBlend.current = 0
    }
    reveal.show = revealBlend.current
    if (revealBlend.current > 0) {
      revealPose(
        chapter,
        safeProgress,
        camera,
        revealHere ? reveal.clock : REVEAL_END,
        revealFrom.current.pos,
        revealFrom.current.target,
        _revealPos,
        _revealTarget,
      )
      const k = revealHere ? 1 : smoother(revealBlend.current)
      _scratchPos.lerp(_revealPos, k)
      _scratchTarget.lerp(_revealTarget, k)
      // close on a small Earth (beside the Sun, a hundredth of its size)
      const near = Math.min(0.08, reveal.earthRadius * 0.8)
      if (Math.abs(camera.near - near) > 1e-6) {
        camera.near = near
        camera.updateProjectionMatrix()
      }
    }

    /* the six shots: the camera takes the shot's own setup; at a cut it
       jumps there (the page has faded to black) */
    const shotHere = shot.index > 0 && shot.chapter === chapter && filmable(chapter) && local >= BLEND
    let shotNear = seqActive ? seqNear : openingOn ? openingNear : 0.08
    if (shotHere) {
      shot.clock += reducedMotion ? 0 : delta
      if (planet || (chapter === 10 && shot.index < 6)) {
        const radius = shotPose(shot.index, planet ? chapter - 2 : 2, safeProgress, shot.clock, _scratchPos, _scratchTarget)
        // low over the surface the near plane follows the small worlds
        shotNear = shot.index === 4 ? (chapter === 4 ? 0.0005 : 0.004) : Math.min(0.08, radius * 0.01)
      } else if (chapter === 10) {
        paleBlueDotPose(_scratchPos, _scratchTarget)
        shotUp.set(0, 1, 0)
      } else {
        shotNear = chapterShotPose(shot.index, chapter, shot.clock, _scratchPos, _scratchTarget)
        if (shot.index === 4) shotNear = 0.004
      }
      if (shot.cut) {
        smoothPosition.current.copy(_scratchPos)
        shot.cut = false
      }
    } else if (shot.cut && shot.index === 0) {
      // leaving the film: a cut back to the chapter's view (behind the
      // black), not a glide across the world from the last shot
      smoothPosition.current.copy(_scratchPos)
      shot.cut = false
    }
    if (revealBlend.current === 0 && Math.abs(camera.near - shotNear) > 1e-6) {
      camera.near = shotNear
      camera.updateProjectionMatrix()
    }

    if (!initialized.current) {
      smoothPosition.current.copy(_scratchPos)
      camera.position.copy(smoothPosition.current)
      camera.fov = targetFov
      camera.updateProjectionMatrix()
      initialized.current = true
    }

    /* Between the planets the Sun is in the way more often than not
       (Mercury to Venus went straight through it): near it, the path
       bends smoothly out round it, never closer than 2.4 radii */
    const roundTheSun = (point: THREE.Vector3) => {
      if (chapter < 2 || chapter > 10) return
      _guardOffset.copy(point).sub(SYSTEM_OFFSET)
      const d = _guardOffset.length()
      const r0 = 4
      const m = 2.4
      if (d < r0 && d > 1e-9) point.copy(SYSTEM_OFFSET).addScaledVector(_guardOffset, (m + (1 - (2 * m) / r0) * d + (m / (r0 * r0)) * d * d) / d)
    }
    roundTheSun(_scratchPos)

    if (reducedMotion) {
      smoothPosition.current.copy(_scratchPos)
    } else {
      smoothPosition.current.lerp(
        _scratchPos,
        1 - Math.exp(-delta * 8.5),
      )
    }
    // (and the smoothed camera too: on a fast glide it cuts the corner)
    roundTheSun(smoothPosition.current)
    /* Never through a world: whatever the path (a glide between
       chapters, the camera easing back after a shot or a reveal, the
       smoothing cutting the inside of a curve), the camera stays outside
       the world it looks at, the one it is leaving, and the Sun; a path
       that would cross one slides round it instead. */
    const keepOut = (index: number, margin: number) => {
      if (index < 0) {
        if (chapter > 10) return // (the Solar System shrinks to a point out there)
        _guardCentre.copy(SYSTEM_OFFSET)
      } else getPlanetPosition(index, simClock.jd, _guardCentre)
      const radius = (index < 0 ? 1 : getPlanetVisualRadius(index)) * margin
      _guardOffset.copy(smoothPosition.current).sub(_guardCentre)
      const distance = _guardOffset.length()
      if (distance < radius && distance > 1e-9) smoothPosition.current.copy(_guardCentre).addScaledVector(_guardOffset, radius / distance)
    }
    const subject = planet ? chapter - 2 : chapter === 10 ? 2 : -2
    if (subject >= 0) keepOut(subject, 1.025)
    // the world just left, while it is still drawn large
    if (chapter > 2 && chapter <= 10 && local < BLEND * 0.7) keepOut(chapter - 3, 1.05)
    keepOut(-1, 1.06)
    camera.position.copy(smoothPosition.current)

    // ---- flight speed (from the smoothed path, before mouse parallax)
    const step = Math.max(delta, 1 / 240)
    _rawVelocity
      .copy(smoothPosition.current)
      .sub(_prevCameraPosition)
      .divideScalar(step)
    _prevCameraPosition.copy(smoothPosition.current)
    // ignore teleports (first frame, tab switches, resizes)
    if (_rawVelocity.lengthSq() > 1e6) _rawVelocity.set(0, 0, 0)
    flight.velocity.lerp(_rawVelocity, 1 - Math.exp(-delta * 6))

    const lookDistance = Math.max(
      1,
      smoothPosition.current.distanceTo(_scratchTarget),
    )
    const relativeSpeed = flight.velocity.length() / lookDistance
    const targetIntensity = reducedMotion
      ? 0
      : THREE.MathUtils.smoothstep(relativeSpeed, 0.2, 1.4)
    flight.intensity +=
      (targetIntensity - flight.intensity) * (1 - Math.exp(-delta * 5))

    parallaxWeight.current +=
      ((planet || reducedMotion ? 0 : 1) - parallaxWeight.current) *
      (1 - Math.exp(-delta * 4))

    camera.position.x +=
      pointer.x * 0.18 * parallaxWeight.current
    camera.position.y +=
      pointer.y * 0.10 * parallaxWeight.current

    // the hero frame: closer on a wide screen, and the lens shifted so the
    // planet sits left of the words (as a film frames a subject off-centre)
    const wide = camera.aspect > 1.2
    heroFrame.closer = wide ? 0.8 : 1
    const shiftTarget = planet && wide && revealBlend.current === 0 && !shotHere && !seqActive ? 1 : 0
    const shiftBefore = lensShift.current
    lensShift.current += (shiftTarget - lensShift.current) * (1 - Math.exp(-delta * (reducedMotion ? 30 : 2.2)))
    if (Math.abs(lensShift.current - shiftBefore) > 1e-5 || (shiftTarget === 0 && camera.filmOffset !== 0 && lensShift.current < 1e-4)) {
      // 0.15 of the half-width, in the film's millimetres
      const halfWidth = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect
      camera.filmOffset = lensShift.current < 1e-4 ? 0 : lensShift.current * 0.15 * camera.getFilmWidth() * halfWidth
      camera.updateProjectionMatrix()
    }

    // breathe: open the field of view a little with speed, settle on arrival
    const fovDiff = targetFov + flight.intensity * FOV_BREATH - camera.fov

    if (Math.abs(fovDiff) > 0.01) {
      camera.fov +=
        fovDiff * (1 - Math.exp(-delta * 7))
      camera.updateProjectionMatrix()
    }

    // a shot low over a world stands the camera on its local vertical
    camera.up.copy(shotHere ? shotUp : seqActive ? seqUp.current : openingOn ? openingUp.current : _worldUp)
    camera.lookAt(_scratchTarget)

    // bank: roll gently into sideways motion, level out when it stops
    _cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
    const lateral = flight.velocity.dot(_cameraRight) / lookDistance
    const targetBank = reducedMotion
      ? 0
      : THREE.MathUtils.clamp(-lateral * 0.05, -MAX_BANK, MAX_BANK)
    bank.current += (targetBank - bank.current) * (1 - Math.exp(-delta * 3))
    if (Math.abs(bank.current) > 0.0005) camera.rotateZ(bank.current)
  })

  return null
}

/* ============================================================
   STAR STREAKS
   Faint lines that wrap around the camera. At rest they are invisible;
   in flight each one trails behind along the direction of travel, so
   speed is felt without any interface.
============================================================ */

const STREAK_COUNT = 260
const STREAK_BOX = 60

const STREAK_VERTEX = /* glsl */ `
uniform vec3 uCamera;
uniform vec3 uOrigin;
uniform vec3 uTrail;
uniform float uBox;
attribute float aTail;
varying float vFade;

void main() {
  // wrap every streak into a box that travels with the camera (in warp,
  // the box scrolls past at a pace of its own: uOrigin)
  vec3 rel = mod(position - uOrigin + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 world = uCamera + rel - uTrail * aTail;

  float distance = length(rel);
  float nearFade = smoothstep(3.0, 9.0, distance); // nothing streaks right past the lens
  float farFade = 1.0 - smoothstep(uBox * 0.28, uBox * 0.5, distance);
  vFade = nearFade * farFade * (1.0 - aTail * 0.85);

  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`

const STREAK_FRAGMENT = /* glsl */ `
uniform float uIntensity;
uniform float uGain;
varying float vFade;

void main() {
  // squared: barely there at cruising speed, a whisper at peak
  gl_FragColor = vec4(vec3(0.72, 0.8, 1.0) * vFade * uIntensity * uIntensity * uGain, 1.0);
}`

const _trail = new THREE.Vector3()

function StarStreaks() {
  const camera = useThree((state) => state.camera)
  const lines = useRef<THREE.LineSegments>(null)

  const geometry = useMemo(() => {
    const positions = new Float32Array(STREAK_COUNT * 2 * 3)
    const tails = new Float32Array(STREAK_COUNT * 2)
    let seed = 1337
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < STREAK_COUNT; i += 1) {
      const x = (random() - 0.5) * STREAK_BOX
      const y = (random() - 0.5) * STREAK_BOX
      const z = (random() - 0.5) * STREAK_BOX
      for (let end = 0; end < 2; end += 1) {
        const v = i * 2 + end
        positions[v * 3] = x
        positions[v * 3 + 1] = y
        positions[v * 3 + 2] = z
        tails[v] = end
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aTail', new THREE.BufferAttribute(tails, 1))
    return g
  }, [])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uCamera: { value: new THREE.Vector3() },
          uOrigin: { value: new THREE.Vector3() },
          uGain: { value: 0.16 },
          uTrail: { value: new THREE.Vector3() },
          uBox: { value: STREAK_BOX },
          uIntensity: { value: 0 },
        },
        vertexShader: STREAK_VERTEX,
        fragmentShader: STREAK_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame(() => {
    if (!lines.current) return
    if (pilot.active) {
      // warping: streaks rush past, brighter
      const glow = pilot.warpGlow
      lines.current.visible = glow > 0.05
      if (!lines.current.visible) return
      camera.getWorldDirection(_trail)
      _trail.multiplyScalar(1.6 * glow)
      material.uniforms.uCamera.value.copy(camera.position)
      material.uniforms.uOrigin.value.copy(pilot.warpOrigin)
      material.uniforms.uTrail.value.copy(_trail)
      material.uniforms.uIntensity.value = glow
      material.uniforms.uGain.value = 0.9
      return
    }
    material.uniforms.uGain.value = 0.3
    const intensity = flight.intensity
    lines.current.visible = intensity > 0.05
    if (!lines.current.visible) return

    // trail = how far each streak reaches back along the motion
    const speed = flight.velocity.length()
    const length = Math.min(speed * 0.05, 2.2) * intensity
    _trail.copy(flight.velocity)
    if (speed > 1e-4) _trail.multiplyScalar(length / speed)

    material.uniforms.uCamera.value.copy(camera.position)
    material.uniforms.uOrigin.value.copy(camera.position)
    material.uniforms.uTrail.value.copy(_trail)
    material.uniforms.uIntensity.value = intensity
  })

  return (
    <lineSegments
      ref={lines}
      geometry={geometry}
      material={material}
      frustumCulled={false}
    />
  )
}

/* ============================================================

   SCENE COMPONENTS

============================================================ */



function LoadingUniverse() {

  const mesh = useRef<THREE.Mesh>(null)

  useFrame((state, delta) => {

    if (!mesh.current) return

    mesh.current.rotation.y += delta * 0.7

    mesh.current.rotation.x += delta * 0.25

    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.08

    mesh.current.scale.setScalar(pulse)

  })

  return (

    <mesh ref={mesh}>

      <icosahedronGeometry args={[0.65, 2]} />

      <meshBasicMaterial color="#8fb7ff" wireframe transparent opacity={0.7} toneMapped={false} />

    </mesh>

  )

}



function SpaceDust() {

  const points = useRef<THREE.Points>(null)

  const positions = useMemo(() => {

    const count = 3200

    const array = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {

      const i3 = i * 3

      array[i3] = (Math.random() - 0.5) * 120

      array[i3 + 1] = (Math.random() - 0.5) * 80

      array[i3 + 2] = (Math.random() - 0.5) * 160

    }

    return array

  }, [])



  useFrame((state, delta) => {

    if (!points.current) return

    points.current.rotation.y += delta * 0.002

    points.current.rotation.x += delta * 0.0003

    const k = 1 - Math.exp(-delta * 0.6)
    points.current.position.x +=
      (state.pointer.x * 0.25 - points.current.position.x) * k
    points.current.position.y +=
      (state.pointer.y * 0.15 - points.current.position.y) * k

  })



  return (

    <points ref={points} frustumCulled={false}>

      <bufferGeometry>

        <bufferAttribute attach="attributes-position" args={[positions, 3]} />

      </bufferGeometry>

      <pointsMaterial

        size={0.028}

        sizeAttenuation

        transparent

        opacity={0.5}

        depthWrite={false}

        blending={THREE.AdditiveBlending}

      />

    </points>

  )

}



function DeepSpaceGlow() {

  const mesh = useRef<THREE.Mesh>(null)

  useFrame((state) => {

    if (!mesh.current) return

    mesh.current.rotation.z = state.clock.elapsedTime * 0.0005

    const material = mesh.current.material as THREE.MeshBasicMaterial

    material.opacity = 0.012 + Math.sin(state.clock.elapsedTime * 0.08) * 0.004

  })

  return (

    <mesh ref={mesh} position={[0, 6, -80]} scale={[90, 55, 1]}>

      <planeGeometry args={[2, 2]} />

      <meshBasicMaterial

        color="#08111f"

        transparent

        opacity={0.012}

        depthWrite={false}

        blending={THREE.AdditiveBlending}

      />

    </mesh>

  )

}



function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0

    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t =
      (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^
      t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ============================================================
   WARM-UP
   Shaders compile, and textures upload to the GPU, the first time
   something is drawn: if that happens mid-flight it is a visible hitch.
   Once every texture has loaded (behind the loading screen), compile all
   materials and upload all textures up front, including objects that
   are currently hidden (like the star streaks).
============================================================ */

/* Whether a material's shader has finished compiling (asked without
   waiting, via KHR_parallel_shader_compile; without it, compiling happens
   on first use anyway). */
function programReady(gl: THREE.WebGLRenderer, material: THREE.Material) {
  if (!gl.extensions.has('KHR_parallel_shader_compile')) return true
  const program = (gl.properties.get(material) as { currentProgram?: { isReady(): boolean } }).currentProgram
  return !program || program.isReady()
}

function whenReady(gl: THREE.WebGLRenderer, materials: Set<THREE.Material>) {
  const waiting = new Set(materials)
  return new Promise<void>((resolve) => {
    const check = () => {
      waiting.forEach((material) => {
        if (programReady(gl, material)) waiting.delete(material)
      })
      if (waiting.size === 0) resolve()
      else window.setTimeout(check, 20)
    }
    check()
  })
}

/* Keeps whatever uses a still-compiling shader out of every view (on no
   layer at all, which leaves its own visibility alone) and lets each back
   in as its shader is done. One register for every warm-up, so an object
   held twice keeps its own layers, not the none it was given. */
const heldBack = new Map<THREE.Object3D, { mask: number; uses: Set<THREE.Material> }>()
let heldCheck = 0

function holdBackUntilReady(gl: THREE.WebGLRenderer, scene: THREE.Scene, materials: Set<THREE.Material>) {
  scene.traverse((object) => {
    const material = (object as THREE.Mesh).material
    if (!material) return
    const uses = (Array.isArray(material) ? material : [material]).filter(
      (m) => materials.has(m) && !programReady(gl, m),
    )
    if (!uses.length) return
    const held = heldBack.get(object)
    if (held) uses.forEach((m) => held.uses.add(m))
    else {
      heldBack.set(object, { mask: object.layers.mask, uses: new Set(uses) })
      object.layers.mask = 0
    }
  })
  const check = () => {
    heldCheck = 0
    heldBack.forEach(({ mask, uses }, object) => {
      uses.forEach((m) => {
        if (programReady(gl, m)) uses.delete(m)
      })
      if (uses.size === 0) {
        object.layers.mask = mask
        heldBack.delete(object)
      }
    })
    if (heldBack.size) heldCheck = window.setTimeout(check, 50)
  }
  if (heldBack.size && !heldCheck) heldCheck = window.setTimeout(check, 50)
}

function WarmUp() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const { active, loaded, total } = useProgress()
  const warmedAt = useRef(-1)
  // textures still to send up: a few a frame (about one 2K map's worth),
  // never the lot in one frame
  const warmQueue = useMemo<THREE.Texture[]>(() => [], [])
  // stands in for the effects' buffers while compiling (never drawn into)
  const warmTarget = useMemo(() => new THREE.WebGLRenderTarget(1, 1), [])
  useEffect(() => () => warmTarget.dispose(), [warmTarget])
  // warm-ups still waiting on their shaders (the scene is held back)
  const holds = useRef(0)
  useFrame(() => {
    drainTextures()
    let pixels = 0
    while (warmQueue.length && pixels < 2048 * 2048) {
      const texture = warmQueue.shift()!
      const image = texture.image as { width?: number; height?: number } | null
      pixels += Math.max(1, (image?.width ?? 1) * (image?.height ?? 1))
      gl.initTexture(texture)
    }
  })

  const warm = useCallback(() => {
      const hidden: THREE.Object3D[] = []
      scene.traverse((object) => {
        if (!object.visible) {
          hidden.push(object)
          object.visible = true
        }
      })

      // compiled side by side in the background (KHR_parallel_shader_compile).
      // A program is only free if nothing draws with it before it is ready,
      // so while the loading screen is still up the scene is held back
      // until they all are (at most a couple of seconds, then whatever is
      // not ready is held back on its own); later warm-ups just compile
      // ahead.
      // Compiled for an offscreen buffer, as they are drawn: the scene goes
      // into the effects' buffers, never straight to the screen, and a
      // shader made for the screen (its last line turns colour to sRGB) is
      // a different program. Compiled for the screen, every one was built
      // again on first use: the auroras and clouds held arriving at Earth
      // for 200 ms, the Galaxy the Milky Way for 120 ms.
      const target = gl.getRenderTarget()
      gl.setRenderTarget(warmTarget)
      const materials = gl.compile(scene, camera)
      gl.setRenderTarget(target)
      if (!lens.revealed) {
        holds.current += 1
        let released = false
        const release = (late: boolean) => {
          if (released) return
          released = true
          holds.current -= 1
          // shaders still compiling when the wait runs out: what uses them
          // stays out of the picture until they are done, rather than the
          // first frame that draws it waiting for the compiler (on Windows,
          // where WebGL runs on Direct3D, that froze the page for seconds)
          if (late) holdBackUntilReady(gl, scene, materials)
          if (holds.current === 0) scene.visible = true
        }
        whenReady(gl, materials).then(() => release(false))
        window.setTimeout(() => release(true), 2500)
      }

      const seen = new Set<THREE.Texture>()
      const upload = (value: unknown) => {
        if (value instanceof THREE.Texture && !seen.has(value)) {
          seen.add(value)
          warmQueue.push(value)
        }
      }
      scene.traverse((object) => {
        const material = (object as THREE.Mesh).material
        const materials = Array.isArray(material) ? material : material ? [material] : []
        materials.forEach((m) => {
          Object.values(m).forEach(upload)
          const uniforms = (m as THREE.ShaderMaterial).uniforms
          if (uniforms) Object.values(uniforms).forEach((u) => upload(u?.value))
        })
      })

      hidden.forEach((object) => {
        object.visible = false
      })
      if (holds.current > 0) scene.visible = false
  }, [gl, scene, camera, warmQueue, warmTarget])

  // the very first frame too: compiled in parallel before anything draws.
  // And in the built site, no reading back of each shader's compile log on
  // its first use (some 5 ms a shader, 40-odd shaders): that check is for
  // finding mistakes while developing
  useLayoutEffect(() => {
    if (process.env.NODE_ENV === 'production') gl.debug.checkShaderErrors = false
    warm()
  }, [warm, gl])

  useEffect(() => {
    if (active || total === 0 || warmedAt.current === loaded) return
    warmedAt.current = loaded

    warm()
    // Earth's material rebuilds as its maps arrive: warm again after that
    const again = window.setTimeout(warm, 400)
    return () => window.clearTimeout(again)
  }, [active, loaded, total, warm])

  return null
}

/* Advances the shared simulation date. Wide views run at a few days per
   second so the orbits are visible; close-ups almost stop the clock. */
/* the sky as seen from the Sun (the Bright Star Catalogue, the named
   stars and constellations): handed over to the 3D stars once you have
   left the Solar System (see NearStars) */
function SunSky({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    if (group.current) group.current.visible = skyHandOver.value === 0
  })
  return <group ref={group}>{children}</group>
}

function Clock({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  useFrame((_, delta) => {
    const chapter = Math.floor(progressRef.current ?? 0)
    // clamp delta so a backgrounded tab does not jump the planets
    const step = Math.min(delta, 0.1)
    if (pilot.active) {
      // flying, at true scale, the planets hold their places (Earth alone
      // covers 30 km a second); spins and moons run on the flight's own
      // clock, held still or sped up with T
      simClock.rate = 0
      simClock.bodyJd += (step / 86400) * pilot.timeScale
      return
    }
    if (simClock.real) {
      // real motion: one clock for everything, at the chosen speed
      simClock.rate = simClock.realRate
      simClock.jd += simClock.rate * step
      simClock.bodyJd = simClock.jd
      return
    }
    // cinematic: the Pale Blue Dot (10) holds still, like a photograph
    const wideView = (chapter === 0 || chapter === 1 || chapter === 13) && !pilot.active
    const target = reducedMotion ? 0 : wideView ? WIDE_VIEW_RATE : CLOSE_UP_RATE
    simClock.rate += (target - simClock.rate) * (1 - Math.exp(-delta * 1.5))
    simClock.jd += simClock.rate * step
    // spins and moons keep a calm pace of their own
    if (!reducedMotion) simClock.bodyJd += BODY_RATE * step
  })

  return null
}

/* ============================================================
   MILKY WAY SKY
   A real panorama of our galaxy (Solar System Scope, CC BY 4.0) on a
   sphere that travels with the camera, so it sits at infinity. The map
   is in galactic coordinates; the shader turns each viewing direction
   from ecliptic (our scene) into galactic latitude/longitude, so the
   Milky Way crosses the sky at its true ~60 degree angle to the planets.
   It fades in the finale, where the camera has left the galaxy.
============================================================ */

const SKY_TEXTURE = '/textures/milky-way-sky.webp'
// kept low: the sky is atmosphere, never competing with the planets
const SKY_BRIGHTNESS = 2.4

const SKY_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
  gl_Position.z = gl_Position.w; // always at the far plane
}`

const SKY_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uIntensity;
varying vec3 vDirection;
const float PI = 3.141592653589793;
const float EPS = 0.40909280; // obliquity of the ecliptic (J2000), radians
const mat3 EQ_TO_GAL = mat3(
  -0.0548755604, 0.4941094279, -0.8676661490,
  -0.8734370902, -0.4448296300, -0.1980763734,
  -0.4838350155, 0.7469822445, 0.4559837762
); // column-major: the J2000 equatorial -> galactic rotation

float skyHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float skyNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(skyHash(i), skyHash(i + vec3(1,0,0)), f.x), mix(skyHash(i + vec3(0,1,0)), skyHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(skyHash(i + vec3(0,0,1)), skyHash(i + vec3(1,0,1)), f.x), mix(skyHash(i + vec3(0,1,1)), skyHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float skyFbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += skyNoise(p) * a; p = p * 2.07 + 1.3; a *= 0.5; } return v; }

void main() {
  // scene -> ecliptic (inverse of X=x, Y=z, Z=-y)
  vec3 d = normalize(vDirection);
  vec3 ecl = vec3(d.x, -d.z, d.y);
  // ecliptic -> equatorial
  vec3 eq = vec3(
    ecl.x,
    ecl.y * cos(EPS) - ecl.z * sin(EPS),
    ecl.y * sin(EPS) + ecl.z * cos(EPS)
  );
  vec3 gal = EQ_TO_GAL * eq;
  float l = atan(gal.y, gal.x);            // galactic longitude, -PI..PI
  float b = asin(clamp(gal.z, -1.0, 1.0)); // galactic latitude
  // this panorama: longitude increases to the left, latitude is flipped
  float u = 0.5 - l / (2.0 * PI);
  // seamless wrap: use whichever of two offset versions of u is continuous
  // here, so the GPU never sees the jump and draws no line down the sky
  float uA = fract(u);
  float uB = fract(u + 0.5) - 0.5;
  float uWrap = fwidth(uA) <= fwidth(uB) + 0.0001 ? uA : uB;
  vec2 uv = vec2(uWrap, 0.5 - b / PI);
  // the photo is sRGB; the pipeline brightens shader output as if it were
  // linear, so decode first (otherwise the dark sky is lifted and its
  // compression blocks show)
  vec3 sky = pow(texture2D(uMap, uv).rgb, vec3(2.2));

  /* the luminous band of the Milky Way, drawn smooth on top of the photo:
     thicker and golden around the centre (Sagittarius, l = 0), thinner and
     bluer out along the plane, cut by dark dust rifts along its middle */
  float fromCentre = abs(l);
  float width = mix(0.2, 0.075, smoothstep(0.0, 1.3, fromCentre));
  float band = exp(-pow(b / width, 2.0));
  float along = 0.28 + 0.72 * exp(-pow(fromCentre / 1.25, 2.0));
  float bulge = exp(-pow(l / 0.42, 2.0) - pow(b / 0.16, 2.0));
  float clouds = skyFbm(gal * 7.0);
  /* dark nebulae where they really are: the Great Rift, running just north
     of the plane from Cygnus (l ~ 80) down to Sagittarius (l ~ -10), and
     the Coalsack beside the Southern Cross (l 301, b -1) */
  float riftSpan = smoothstep(-0.25, -0.05, l) * (1.0 - smoothstep(1.25, 1.45, l));
  float riftCentre = 0.03 + 0.015 * sin(l * 3.0);
  float rift = riftSpan * exp(-pow((b - riftCentre) / 0.03, 2.0))
    * (0.55 + 0.45 * smoothstep(0.35, 0.65, skyFbm(gal * vec3(12.0, 12.0, 30.0) + 4.0)));
  vec2 coalsack = vec2(l + 1.0367, b + 0.0175);
  rift = max(rift, exp(-dot(coalsack, coalsack) / 0.0036));
  vec3 tint = mix(vec3(0.6, 0.68, 0.92), vec3(1.0, 0.83, 0.62), exp(-pow(fromCentre / 0.9, 2.0)));
  /* the bright star clouds: Sagittarius (l 2, b -4), Scutum (l 27, b -2.5),
     Cygnus (l 75, b 1) and Carina (l -73, b -1) */
  vec2 sgr = vec2(l - 0.035, b + 0.07);
  vec2 sct = vec2(l - 0.47, b + 0.044);
  vec2 cyg = vec2(l - 1.31, b - 0.017);
  vec2 car = vec2(l + 1.27, b + 0.017);
  float starClouds = exp(-dot(sgr, sgr) / 0.004) * 1.1 + exp(-dot(sct, sct) / 0.0025) * 0.8
    + exp(-dot(cyg, cyg) / 0.006) * 0.6 + exp(-dot(car, car) / 0.006) * 0.6;
  /* clumpy, not a flat haze: star clouds stand out, gaps stay dark */
  float clumps = smoothstep(0.35, 0.8, clouds);
  float glow = (band * along * (0.15 + 1.2 * clumps) + bulge * 0.5 + starClouds * 0.6) * (1.0 - rift * 0.85);
  sky = sky * (1.0 - rift * 0.6 * band) + tint * glow * 0.018;

  gl_FragColor = vec4(sky * uIntensity, 1.0);
}`

function MilkyWaySky({
  progressRef,
}: {
  progressRef: MutableRefObject<number>
}) {
  const sphere = useRef<THREE.Mesh>(null)
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: null as THREE.Texture | null },
          uIntensity: { value: 0 },
        },
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  )

  useEffect(() => {
    let disposed = false
    let loaded: THREE.Texture | null = null
    textureLoader.load(SKY_TEXTURE, (texture) => {
      if (disposed) {
        texture.dispose()
        return
      }
      texture.colorSpace = THREE.NoColorSpace // shader writes raw colour
      // the seam where longitude wraps must sample both edges cleanly
      texture.wrapS = THREE.RepeatWrapping
      texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
      loaded = texture
      material.uniforms.uMap.value = texture
    })
    return () => {
      disposed = true
      loaded?.dispose()
      material.dispose()
    }
  }, [gl, material])

  useFrame((_, delta) => {
    if (!sphere.current) return
    sphere.current.position.copy(camera.position)
    // full inside the Solar System; fade out once we have left the galaxy
    const chapter = Math.floor(progressRef.current ?? 0)
    const target = material.uniforms.uMap.value ? (chapter === 11 || chapter === 12 ? 0.15 : SKY_BRIGHTNESS) : 0
    const u = material.uniforms.uIntensity
    u.value += (target - u.value) * (1 - Math.exp(-delta * 2))
  })

  return (
    <mesh ref={sphere} material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[900, 64, 32]} />
    </mesh>
  )
}

/* ============================================================
   LENS
   Close-ups ease the background stars slightly out of focus, and when the
   Sun sits just outside the frame a soft warm glow spills in from that
   edge, as it does in a real lens. The glow is a screen-blended layer
   over the canvas (see .sun-glare); this only moves and fades it.
============================================================ */

const _sunNdc = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _sunDir = new THREE.Vector3()

const _flareRay = new THREE.Vector3()
const _flarePlanet = new THREE.Vector3()

function Lens({
  progressRef,
  glare,
  flare,
}: {
  progressRef: MutableRefObject<number>
  glare: RefObject<HTMLDivElement | null>
  flare?: RefObject<HTMLDivElement | null>
}) {
  const flareLevel = useRef(0)
  const camera = useThree((state) => state.camera)
  const level = useRef(0)

  useFrame((_, delta) => {
    const progress = progressRef.current ?? 0
    const chapter = Math.floor(progress)
    const local = progress - chapter

    lens.chapter = chapter
    // close-up: settled on a planet (its text is showing)
    const settled = chapter >= 2 && chapter <= 9 && local >= 0.16 && local < 0.93
    lens.closeUp += ((settled ? 1 : 0) - lens.closeUp) * (1 - Math.exp(-delta * 1.4))

    const element = glare.current
    if (!element) return

    camera.getWorldDirection(_forward)
    _sunDir.copy(SYSTEM_OFFSET).sub(camera.position)
    const distance = _sunDir.length()
    const facing = _forward.dot(_sunDir.normalize())
    _sunNdc.copy(SYSTEM_OFFSET).project(camera)

    let target = 0
    // not in the Milky Way finale, where the Solar System is a point
    if (facing > 0 && progress < 10.95) {
      const outside = Math.max(Math.abs(_sunNdc.x), Math.abs(_sunNdc.y)) - 1
      target =
        outside < 0
          ? 0.1 // in view: the bloom already glows; don't wash out the disc
          : Math.max(0, 1 - outside / 1.3)
      // fainter the further out we are
      target *= THREE.MathUtils.clamp(14 / distance, 0.3, 1)
    }
    level.current += (target - level.current) * (1 - Math.exp(-delta * 2.5))

    const x = THREE.MathUtils.clamp(_sunNdc.x, -2.5, 2.5)
    const y = THREE.MathUtils.clamp(_sunNdc.y, -2.5, 2.5)
    element.style.opacity = (level.current * 0.55).toFixed(3)

    /* a lens flare (a streak across the frame, a ghost opposite), only
       with the Sun's disc in the frame, not behind the world in view */
    const flareElement = flare?.current
    if (flareElement) {
      let flareTarget = 0
      const inFrame = Math.abs(_sunNdc.x) < 0.95 && Math.abs(_sunNdc.y) < 0.95
      if (facing > 0 && inFrame && progress < 10.95 && !pilot.active) {
        flareTarget = THREE.MathUtils.clamp(14 / distance, 0.35, 1)
        // hidden by the world in view?
        const subject = chapter >= 2 && chapter <= 9 ? chapter - 2 : chapter === 10 ? 2 : -1
        if (subject >= 0) {
          getPlanetPosition(subject, simClock.jd, _flarePlanet).sub(camera.position)
          _flareRay.copy(SYSTEM_OFFSET).sub(camera.position)
          const toSun = _flareRay.length()
          _flareRay.divideScalar(toSun)
          const along = _flarePlanet.dot(_flareRay)
          const miss = Math.sqrt(Math.max(_flarePlanet.lengthSq() - along * along, 0))
          const radius = getPlanetVisualRadius(subject)
          if (along > 0 && along < toSun) flareTarget *= THREE.MathUtils.smoothstep(miss, radius * 0.95, radius * 1.1)
        }
        if (viewMode.mode !== 'cinematic') flareTarget *= 0.5
      }
      flareLevel.current += (flareTarget - flareLevel.current) * (1 - Math.exp(-delta * 4))
      flareElement.style.opacity = flareLevel.current.toFixed(3)
      flareElement.style.setProperty('--fx', `${((_sunNdc.x * 0.5 + 0.5) * 100).toFixed(2)}%`)
      flareElement.style.setProperty('--fy', `${((0.5 - _sunNdc.y * 0.5) * 100).toFixed(2)}%`)
    }
    element.style.setProperty('--gx', `${((x * 0.5 + 0.5) * 100).toFixed(2)}%`)
    element.style.setProperty('--gy', `${((0.5 - y * 0.5) * 100).toFixed(2)}%`)
  })

  return null
}

/* The Earth of the true-size reveal: the day map, lit by the Sun, under a
   thin blue rim of air; drawn only while the reveal shows */
const REVEAL_AIR_VERTEX = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vView;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}`
const REVEAL_AIR_FRAGMENT = /* glsl */ `
uniform vec3 uSun;
varying vec3 vNormalW;
varying vec3 vView;
varying vec3 vWorld;
void main() {
  float rim = pow(1.0 - max(dot(vNormalW, vView), 0.0), 3.0);
  float day = smoothstep(-0.25, 0.4, dot(vNormalW, normalize(uSun - vWorld)));
  gl_FragColor = vec4(vec3(0.36, 0.6, 1.0) * rim * day * day * 0.5, 1.0);
}`

function RevealEarth() {
  const group = useRef<THREE.Group>(null)
  const [map, setMap] = useState<THREE.Texture | null>(null)
  const air = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uSun: { value: SYSTEM_OFFSET } },
        vertexShader: REVEAL_AIR_VERTEX,
        fragmentShader: REVEAL_AIR_FRAGMENT,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    [],
  )
  const loading = useRef(false)
  const tag = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const size = useThree((state) => state.size)
  useEffect(() => () => air.dispose(), [air])
  useEffect(() => () => map?.dispose(), [map])

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    const on = reveal.show > 0
    g.visible = on
    if (!on) return
    if (!map && !loading.current) {
      loading.current = true
      textureLoader.load('/textures/earth-day.webp', (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = 8
        setMap(texture)
      })
    }
    g.position.copy(reveal.earth)
    g.scale.setScalar(Math.max(reveal.earthRadius, 1e-6))
    g.rotation.y += delta * 0.05
    // its name, once it is small among the moons
    if (tag.current && ring.current) {
      const shown = reveal.active && reveal.clock > REVEAL_HOLD + REVEAL_PULL * 0.62
      tag.current.style.opacity = shown ? '1' : '0'
      // a ring just outside the Earth as drawn (a speck beside the Sun)
      const distance = Math.max(camera.position.distanceTo(reveal.earth), 1e-6)
      const px = (reveal.earthRadius / distance) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (size.height / 2)
      const across = Math.max(16, px * 2 + 14)
      ring.current.style.width = `${across}px`
      ring.current.style.height = `${across}px`
      if (label.current) label.current.style.top = `${across / 2 + 8}px`
    }
  })

  return (
    <group ref={group} visible={false}>
      <mesh>
        <sphereGeometry args={[1, 96, 64]} />
        <meshStandardMaterial key={map ? 'mapped' : 'plain'} map={map ?? undefined} color={map ? '#ffffff' : '#3b6fb6'} roughness={0.85} metalness={0} />
      </mesh>
      <mesh material={air} scale={1.035}>
        <sphereGeometry args={[1, 64, 32]} />
      </mesh>
      <Html center zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={tag} className="reveal-tag" style={{ opacity: 0 }}>
          <div ref={ring} className="reveal-ring" />
          <span ref={label} className="reveal-name">Earth</span>
        </div>
      </Html>
    </group>
  )
}

/* Ice in Saturn's rings: crossing the ring plane, the camera passes
   through a drift of ring particles, near ones large and soft, rushing
   by. A box of points that travels with the camera, wrapped in world
   space (each particle stays put as the camera moves), pressed flat to
   the ring plane, and only where the rings are (thinner in the Cassini
   Division). Drawn only when the camera is near the plane among them. */
const RING_ICE_COUNT = 3200
const RING_ICE_VERTEX = /* glsl */ `
uniform vec3 uCamera; uniform float uBox; uniform vec3 uCenter; uniform vec3 uNormal; uniform float uRadius; uniform float uScale; uniform float uSizeScale;
attribute float aSize;
varying float vAlpha;
void main() {
  vec3 rel = mod(position - uCamera + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 world = uCamera + rel;
  // pressed flat to the ring plane (a function of the place alone, so steady)
  float h = dot(world - uCenter, uNormal);
  world -= uNormal * h * 0.985;
  vec3 inPlane = world - uCenter - uNormal * dot(world - uCenter, uNormal);
  float r = length(inPlane) / uRadius;
  float inRings = smoothstep(1.24, 1.3, r) * (1.0 - smoothstep(2.28, 2.35, r));
  float division = 1.0 - 0.7 * smoothstep(1.93, 1.96, r) * (1.0 - smoothstep(2.01, 2.04, r));
  vec4 mv = viewMatrix * vec4(world, 1.0);
  float d = max(-mv.z, 1e-5);
  gl_PointSize = clamp(aSize * uSizeScale * uScale / d, 1.5, 64.0);
  // not right on the lens, and gone towards the box's edge
  float near = smoothstep(uBox * 0.004, uBox * 0.03, d);
  float far = 1.0 - smoothstep(uBox * 0.3, uBox * 0.5, length(rel));
  vAlpha = inRings * division * near * far;
  gl_Position = projectionMatrix * mv;
}`
const RING_ICE_FRAGMENT = /* glsl */ `
uniform float uOn;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  // sunlit ice: a bright core that glints, a soft edge
  float core = exp(-d * d * 9.0);
  float a = (core * 1.4 + (1.0 - smoothstep(0.3, 1.0, d)) * 0.35) * vAlpha * uOn;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * a * 1.6, 1.0);
}`
const _iceCam = new THREE.Vector3()

function RingIce() {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const points = useRef<THREE.Points>(null)
  const parts = useMemo(() => {
    const positions = new Float32Array(RING_ICE_COUNT * 3)
    const sizes = new Float32Array(RING_ICE_COUNT)
    let seed = 2024
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < RING_ICE_COUNT; i += 1) {
      positions[i * 3] = random() * 1000
      positions[i * 3 + 1] = random() * 1000
      positions[i * 3 + 2] = random() * 1000
      sizes[i] = 0.0007 + Math.pow(random(), 3) * 0.006
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uCamera: { value: new THREE.Vector3() },
        uBox: { value: 1 },
        uCenter: { value: new THREE.Vector3() },
        uNormal: { value: new THREE.Vector3(0, 1, 0) },
        uRadius: { value: 1 },
        uScale: { value: 400 },
        uSizeScale: { value: 1 },
        uOn: { value: 0 },
      },
      vertexShader: RING_ICE_VERTEX,
      fragmentShader: RING_ICE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    return { geometry, material }
  }, [])
  useEffect(() => () => {
    parts.geometry.dispose()
    parts.material.dispose()
  }, [parts])

  useFrame((_, delta) => {
    const p = points.current
    if (!p) return
    const u = parts.material.uniforms
    let target = 0
    if (ringState.ready) {
      const R = ringState.radius
      // flying, the drift is sized to the ship's pace (a few seconds of
      // flight across), so skimming the rings it streams past
      const box = pilot.active
        ? THREE.MathUtils.clamp(Math.max(pilot.kms * 4, 8) / KM_PER_UNIT, 1e-5, R * 0.5)
        : R * 0.5
      u.uSizeScale.value = box / (R * 0.5)
      _iceCam.copy(camera.position).sub(ringState.center)
      const h = _iceCam.dot(ringState.normal)
      const r = Math.sqrt(Math.max(_iceCam.lengthSq() - h * h, 0)) / R
      if (Math.abs(h) < box * 0.5 && r > 1.1 && r < 2.5) target = 1
      u.uBox.value = box
      u.uCenter.value.copy(ringState.center)
      u.uNormal.value.copy(ringState.normal)
      u.uRadius.value = R
    }
    u.uOn.value += (target - u.uOn.value) * (1 - Math.exp(-delta * 6))
    p.visible = u.uOn.value > 0.01
    if (!p.visible) return
    u.uCamera.value.copy(camera.position)
    u.uScale.value = size.height * 0.5 * Math.min(window.devicePixelRatio, 2)
  })

  return <points ref={points} geometry={parts.geometry} material={parts.material} frustumCulled={false} visible={false} renderOrder={5} />
}

/* The exploration shot's spacecraft: the Shuttle (the flight's own,
   once built), close to the lens, banking gently across the frame with
   the planet beyond, as films give a world its scale */
const _shipForward = new THREE.Vector3()
const _shipRight = new THREE.Vector3()
const _shipUp = new THREE.Vector3()
const _shipLook = new THREE.Vector3()

function ExplorerShip() {
  const camera = useThree((state) => state.camera)
  const holder = useRef<THREE.Group>(null)
  const [mesh, setMesh] = useState<THREE.Mesh | null>(null)

  useFrame(() => {
    const g = holder.current
    if (!g) return
    const on = shot.index === 4 && !pilot.active && shot.chapter !== 4
    if (on && !mesh && pilotObjects.shuttleBody) {
      const body = pilotObjects.shuttleBody
      setMesh(new THREE.Mesh(body.geometry, body.material))
    }
    g.visible = on && !!mesh
    if (!g.visible) return
    camera.getWorldDirection(_shipForward)
    _shipRight.crossVectors(_shipForward, camera.up).normalize()
    _shipUp.crossVectors(_shipRight, _shipForward).normalize()
    // drifting slowly across the frame, lower right to centre
    const t = Math.min(shot.clock / 8, 1)
    const d = 0.05
    g.position
      .copy(camera.position)
      .addScaledVector(_shipForward, d * (1 + t * 0.35))
      .addScaledVector(_shipRight, d * (0.34 - t * 0.12))
      .addScaledVector(_shipUp, -d * (0.16 - t * 0.04))
    // nose towards the planet, a little across the view, banked
    _shipLook.copy(g.position).addScaledVector(_shipForward, 1).addScaledVector(_shipRight, -0.45)
    g.lookAt(_shipLook)
    g.rotateY(Math.PI) // the model's nose is -z; lookAt points +z
    g.rotateZ(0.22)
    g.scale.setScalar(d * 0.42)
  })

  return <group ref={holder} visible={false}>{mesh && <primitive object={mesh} />}</group>
}

/* How far into a backlit hero shot we are (0..1): the planet's rim rays
   read it (see RimRays in SolarSystem) */
function BacklitDriver({ progressRef }: { progressRef: MutableRefObject<number> }) {
  useFrame(() => {
    const progress = progressRef.current ?? 0
    const chapter = Math.floor(progress)
    lens.backlit =
      shot.index === 3 && shot.chapter === chapter
        ? 1
        : isPlanetChapter(chapter) && HERO_BACKLIT.has(chapter - 2)
          ? heroDrift[chapter] ?? 0
          : 0
  })
  return null
}

function Scene({
  progressRef,
  glare,
  flare,
}: {
  progressRef: MutableRefObject<number>
  glare: RefObject<HTMLDivElement | null>
  flare: RefObject<HTMLDivElement | null>
}) {
  const grade = useMemo(() => new GradeEffect(), [])
  useEffect(() => () => grade.dispose(), [grade])
  /* beside the Space Station, 418 km over sunlit cloud, the glow of the
     clouds spilled over its thin, dark solar wings and washed them out:
     the glow is softer there, and the exposure a little lower */
  const bloomRef = useRef<BloomEffect | null>(null)
  const glowLevel = useRef(1)
  useFrame(({ gl }, delta) => {
    const station = shot.index === 4 && shot.chapter === 4 && !pilot.active
    glowLevel.current += ((station ? 0 : 1) - glowLevel.current) * (1 - Math.exp(-delta * 4))
    if (bloomRef.current) bloomRef.current.intensity = THREE.MathUtils.lerp(0.22, 0.82, glowLevel.current)
    gl.toneMappingExposure = THREE.MathUtils.lerp(0.92, 1.12, glowLevel.current)
  })

  return (

    <>

      {/* first, so the date is advanced before planets and camera read it */}
      <Clock progressRef={progressRef} />

      <Lens progressRef={progressRef} glare={glare} flare={flare} />
      <RevealEarth />
      <ExplorerShip />
      <SpaceStation progressRef={progressRef} />
      <RingIce />
      <TextShield />

      <Pilot />
      <PhotoCapture />

      <BacklitDriver progressRef={progressRef} />

      <MilkyWaySky progressRef={progressRef} />

      <SunSky>
        <NightSky progressRef={progressRef} />
      </SunSky>
      <NearStars />

      <color attach="background" args={['#010207']} />

      <fog attach="fog" args={['#010207', 40, 190]} />



      <ambientLight intensity={0.04} />

      <directionalLight position={[-6, 3, 8]} intensity={0.08} color="#fff4dc" />

      <directionalLight position={[4, -2, -8]} intensity={0.04} color="#3158a8" />



      <Suspense fallback={<LoadingUniverse />}>

        <SunSky>
          <Starfield />
        </SunSky>

      </Suspense>







      <SpaceDust />

      <DeepSpaceGlow />



      <Suspense fallback={<LoadingUniverse />}>

        <Galaxy progressRef={progressRef} />

        <LocalGroup progressRef={progressRef} />

        <PlanetPicker progressRef={progressRef} />

      </Suspense>



      <Suspense fallback={<LoadingUniverse />}>

        <SolarSystem progressRef={progressRef} />

      {/* after the planets have moved: carry a ship standing on one */}
      <GroundCarry />

      </Suspense>



      <CinematicCamera progressRef={progressRef} />

      <WarmUp />

      <StarStreaks />

      {/* last: the far, tiny things drawn lightly (flight) */}
      <FocusCull />

      {/* F: the frame meter */}
      <PerfMeter />



      {/* no MSAA (costly with these buffers): SMAA below smooths planet
          and ring edges for a fraction of the price */}
      <EffectComposer multisampling={0}>

        {/* the air, the 3D clouds and the auroras, at half resolution */}
        <LowResLayer />

        {/* the Shuttle, at its true size, in a layer of its own (flight only) */}
        <primitive object={getShipPass()} />

        {/* glow is soft, so half resolution looks identical and costs a quarter */}
        <Bloom ref={bloomRef} intensity={0.82} luminanceThreshold={0.70} luminanceSmoothing={0.90} mipmapBlur resolutionScale={0.5} />

        {/* a documentary's colour: navy blacks, cool shade, warm sun */}
        <primitive object={grade} />

        {/* edge smoothing, before the grain so the grain stays crisp */}
        <SMAA />


        {/* the only film grain on the page (the CSS grain layer was removed) */}
        <Noise opacity={0.032} />

        {/* a lens's colour fringe, only towards the corners */}
        <ChromaticAberration offset={CA_OFFSET} radialModulation modulationOffset={0.42} />

        <Vignette eskil={false} offset={0.3} darkness={0.56} />

      </EffectComposer>

    </>

  )

}



/* ============================================================

   CANVAS

============================================================ */



/* ============================================================
   WHEN 3D CANNOT RUN
   No WebGL 2 (an old browser, or graphics turned off), or the canvas
   could not start: a still of the journey instead, and the words and
   the panels work as ever. If the graphics card resets mid-visit (it
   happens on laptops: a driver update, sleep, too many tabs) the view
   says so and comes back on its own, on a fresh canvas.
============================================================ */

function hasWebGL2() {
  try {
    const canvas = document.createElement('canvas')
    return !!canvas.getContext('webgl2')
  } catch {
    return false
  }
}

function markNoWebGL() {
  document.documentElement.classList.add('no-webgl')
  // nothing to wait for: the loading screen lifts at once
  lens.revealed = true
}

function StillView() {
  return (
    <div className="gl-fallback">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/still.jpg" alt="" aria-hidden="true" />
      <p className="gl-fallback-note">
        This browser can&rsquo;t show the 3D view, so here is a still. The journey&rsquo;s words and
        facts all work; for the full experience, try a recent Chrome, Edge, Firefox or Safari with
        hardware acceleration on.
      </p>
    </div>
  )
}

class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('The 3D view could not start:', error)
    markNoWebGL()
  }
  render() {
    return this.state.failed ? <StillView /> : this.props.children
  }
}

const CA_OFFSET = new THREE.Vector2(0.0009, 0.0006)

function UniverseCanvas({ progressRef }: { progressRef: MutableRefObject<number> }) {
  // Adaptive resolution: drops pixel ratio when frame rate dips, restores when healthy
  // start at up to 1.5x; if the frame rate struggles, step down once and
  // stay there (switching back and forth resizes every buffer = a hitch)
  const [dpr, setDpr] = useState(() =>
    Math.min(1.5, typeof window === 'undefined' ? 1 : window.devicePixelRatio),
  )
  const glare = useRef<HTMLDivElement>(null)
  const flare = useRef<HTMLDivElement>(null)
  const [supported, setSupported] = useState(true)
  // a fresh canvas after the graphics context was lost
  const [generation, setGeneration] = useState(0)
  const current = useRef(0)
  current.current = generation
  const [lost, setLost] = useState(false)

  useEffect(() => {
    if (hasWebGL2()) return
    markNoWebGL()
    setSupported(false)
  }, [])

  // lost: wait a moment for the browser to give it back, then start over
  useEffect(() => {
    if (!lost) return
    const timer = window.setTimeout(() => {
      setLost(false)
      setGeneration((n) => n + 1)
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [lost])

  if (!supported) return <StillView />

  return (
    <CanvasBoundary>
    <Canvas
      key={generation}
      onCreated={(rootState) => {
        const { gl } = rootState
        // only the canvas in use: a replaced one gives its context up on
        // purpose as it goes, which is not a loss
        const mine = generation
        gl.domElement.addEventListener('webglcontextlost', (event) => {
          if (mine !== current.current) return
          event.preventDefault() // ask for it back
          setLost(true)
        })
        gl.domElement.addEventListener('webglcontextrestored', () => {
          if (mine !== current.current) return
          setLost(false)
          setGeneration((n) => n + 1)
        })
      }}

      camera={{ position: [0, 0, 8], fov: 42, near: 0.08, far: 2000 }}

      dpr={dpr}

      gl={{

        antialias: false, 

        alpha: false,

        powerPreference: 'high-performance',

        toneMapping: THREE.ACESFilmicToneMapping,

        toneMappingExposure: 1.12,

      }}

      frameloop="always"

      shadows={false}

      style={{

        position: 'absolute',

        inset: 0,

        width: '100%',

        height: '100%',

        display: 'block',

      }}

    >

      <PerformanceMonitor onDecline={() => setDpr((current) => Math.min(current, 1))} />

      <Scene progressRef={progressRef} glare={glare} flare={flare} />

    </Canvas>
    <div ref={glare} className="sun-glare" aria-hidden="true" />
    <div ref={flare} className="sun-flare" aria-hidden="true" style={{ opacity: 0 }} />
    {lost && (
      <div className="gl-restoring" role="status">
        Restoring the view&hellip;
      </div>
    )}
    </CanvasBoundary>

  )

}   

export default memo(UniverseCanvas)
