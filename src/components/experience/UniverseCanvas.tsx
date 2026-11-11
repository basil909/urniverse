'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Bloom,
  EffectComposer,
  Noise,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { PerformanceMonitor, useProgress } from '@react-three/drei'
import { memo, Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import * as THREE from 'three'

import SolarSystem from './SolarSystem'
import { BODY_RATE, CLOSE_UP_RATE, simClock, WIDE_VIEW_RATE } from './simClock'
import Galaxy, {
  GALAXY_POSITION,
  GALAXY_RADIUS,
  GALAXY_SCALE,
  GALAXY_TILT,
} from './Galaxy'
import Starfield from './Starfield'
import NightSky from './NightSky'
import { lens } from './lens'
import {
  SYSTEM_OFFSET,
  getPlanetPosition,
  getPlanetVisualRadius,
} from './orbit'

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
function heroDistanceFor(planetIndex: number) {
  const config = PLANET_CONFIG[planetIndex]
  const visualRadius = getPlanetVisualRadius(planetIndex)
  const rockyFill = ROCKY_FILL[planetIndex]
  return rockyFill !== undefined
    ? visualRadius / rockyFill
    : Math.max(config.minHeroDistance, visualRadius * config.radiusMultiplier) *
        (planetIndex === 5 ? 1.9 : planetIndex === 4 ? 1.08 : 1.2)
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
  // never sits on the Sun line (at Mercury it ended up inside the Sun's glow)
  // Jupiter: almost in the plane of its moons, so they line up across the
  // disc and pass in front of it (with their shadows), as in a telescope
  _viewDir
    .copy(_toSun)
    .multiplyScalar(0.62)
    .addScaledVector(_side, 0.78)
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
            : RETURN

  outPos.copy(fixed.position)
  outTarget.copy(fixed.target)
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

  useFrame((_, delta) => {
    const progress = progressRef.current

    const safeProgress = Number.isFinite(progress)
      ? THREE.MathUtils.clamp(progress, 0, 12.999999)
      : 0

    const chapter = Math.min(12, Math.floor(safeProgress))
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
    if (planet && local >= BLEND && !reducedMotion) {
      heroTime.current += delta
      heroDrift[chapter] = ease(
        (heroTime.current - HERO_DELAY) / HERO_DURATION,
      )
    }

    // lens changes travel with the flight (e.g. the long lens on Earth
    // opening up to the wide galaxy view during the pull-back)
    const baseFov =
      chapter > 0 && local < BLEND
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
    if (planet && local >= BLEND && !reducedMotion && !HERO_BACKLIT.has(chapter - 2)) {
      const settle = ease((heroTime.current - 0.8) / 3)
      const leave = 1 - THREE.MathUtils.smoothstep(local, 0.86, 0.99)
      const swing = Math.sin(heroTime.current * 0.09) * 0.2 * settle * leave
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

    if (!initialized.current) {
      smoothPosition.current.copy(_scratchPos)
      camera.position.copy(smoothPosition.current)
      camera.fov = targetFov
      camera.updateProjectionMatrix()
      initialized.current = true
    }

    if (reducedMotion) {
      smoothPosition.current.copy(_scratchPos)
    } else {
      smoothPosition.current.lerp(
        _scratchPos,
        1 - Math.exp(-delta * 8.5),
      )
    }
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

    // breathe: open the field of view a little with speed, settle on arrival
    const fovDiff = targetFov + flight.intensity * FOV_BREATH - camera.fov

    if (Math.abs(fovDiff) > 0.01) {
      camera.fov +=
        fovDiff * (1 - Math.exp(-delta * 7))
      camera.updateProjectionMatrix()
    }

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
uniform vec3 uTrail;
uniform float uBox;
attribute float aTail;
varying float vFade;

void main() {
  // wrap every streak into a box that travels with the camera
  vec3 rel = mod(position - uCamera + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 world = uCamera + rel - uTrail * aTail;

  float distance = length(rel);
  float nearFade = smoothstep(3.0, 9.0, distance); // nothing streaks right past the lens
  float farFade = 1.0 - smoothstep(uBox * 0.28, uBox * 0.5, distance);
  vFade = nearFade * farFade * (1.0 - aTail * 0.85);

  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`

const STREAK_FRAGMENT = /* glsl */ `
uniform float uIntensity;
varying float vFade;

void main() {
  // squared: barely there at cruising speed, a whisper at peak
  gl_FragColor = vec4(vec3(0.72, 0.8, 1.0) * vFade * uIntensity * uIntensity * 0.16, 1.0);
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
    const intensity = flight.intensity
    lines.current.visible = intensity > 0.05
    if (!lines.current.visible) return

    // trail = how far each streak reaches back along the motion
    const speed = flight.velocity.length()
    const length = Math.min(speed * 0.035, 1.6) * intensity
    _trail.copy(flight.velocity)
    if (speed > 1e-4) _trail.multiplyScalar(length / speed)

    material.uniforms.uCamera.value.copy(camera.position)
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

const SPREAD_FAR: [number, number, number] = [150, 100, 190]
const SPREAD_NEAR: [number, number, number] = [90, 70, 130]

function DeepStarLayer({

  count,

  spread,

  size,

  opacity,

  speed,

}: {

  count: number

  spread: [number, number, number]

  size: number

  opacity: number

  speed: number

}) {

  const points = useRef<THREE.Points>(null)

  const positions = useMemo(() => {
    const data = new Float32Array(count * 3)
    const random = mulberry32(
      count * 1000 + Math.round(spread[2]),
    )

    for (let i = 0; i < count; i++) {

      const i3 = i * 3

      data[i3] = (random() - 0.5) * spread[0]

      data[i3 + 1] = (random() - 0.5) * spread[1]

      data[i3 + 2] = (random() - 0.5) * spread[2]

    }

    return data

  }, [count, spread])



  useFrame((state, delta) => {

    if (!points.current) return

    points.current.rotation.y += delta * speed

    points.current.rotation.x += delta * speed * 0.08

    points.current.position.x += (state.pointer.x * speed * 5 - points.current.position.x) * 0.004

    points.current.position.y += (state.pointer.y * speed * 3 - points.current.position.y) * 0.004

  })



  return (

    <points ref={points}>

      <bufferGeometry>

        <bufferAttribute attach="attributes-position" args={[positions, 3]} />

      </bufferGeometry>

      <pointsMaterial

        size={size}

        transparent

        opacity={opacity}

        depthWrite={false}

        sizeAttenuation

        toneMapped={false}
        fog={false}

      />

    </points>

  )

}



/* ============================================================

   SCENE

============================================================ */



/* ============================================================
   WARM-UP
   Shaders compile, and textures upload to the GPU, the first time
   something is drawn: if that happens mid-flight it is a visible hitch.
   Once every texture has loaded (behind the loading screen), compile all
   materials and upload all textures up front, including objects that
   are currently hidden (like the star streaks).
============================================================ */

function WarmUp() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const { active, loaded, total } = useProgress()
  const warmedAt = useRef(-1)

  useEffect(() => {
    if (active || total === 0 || warmedAt.current === loaded) return
    warmedAt.current = loaded

    const warm = () => {
      const hidden: THREE.Object3D[] = []
      scene.traverse((object) => {
        if (!object.visible) {
          hidden.push(object)
          object.visible = true
        }
      })

      gl.compile(scene, camera)

      const seen = new Set<THREE.Texture>()
      const upload = (value: unknown) => {
        if (value instanceof THREE.Texture && !seen.has(value)) {
          seen.add(value)
          gl.initTexture(value)
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
    }

    warm()
    // Earth's material rebuilds as its maps arrive: warm again after that
    const again = window.setTimeout(warm, 400)
    return () => window.clearTimeout(again)
  }, [active, loaded, total, gl, scene, camera])

  return null
}

/* Advances the shared simulation date. Wide views run at a few days per
   second so the orbits are visible; close-ups almost stop the clock. */
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
    if (simClock.real) {
      // real motion: one clock for everything, at the chosen speed
      simClock.rate = simClock.realRate
      simClock.jd += simClock.rate * step
      simClock.bodyJd = simClock.jd
      return
    }
    // cinematic: the Pale Blue Dot (10) holds still, like a photograph
    const wideView = chapter === 0 || chapter === 1 || chapter === 12
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
  float rift = smoothstep(0.42, 0.68, skyFbm(gal * vec3(11.0, 11.0, 26.0) + 4.0))
    * exp(-pow((b + 0.012) / 0.038, 2.0))
    * (1.0 - smoothstep(0.6, 2.4, fromCentre));
  vec3 tint = mix(vec3(0.6, 0.68, 0.92), vec3(1.0, 0.83, 0.62), exp(-pow(fromCentre / 0.9, 2.0)));
  /* clumpy, not a flat haze: star clouds stand out, gaps stay dark */
  float clumps = smoothstep(0.35, 0.8, clouds);
  float glow = (band * along * (0.15 + 1.2 * clumps) + bulge * 1.2) * (1.0 - rift * 0.85);
  sky = sky * (1.0 - rift * 0.6 * band) + tint * glow * 0.022;

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
    new THREE.TextureLoader().load(SKY_TEXTURE, (texture) => {
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
    const target = material.uniforms.uMap.value ? (chapter === 11 ? 0.15 : SKY_BRIGHTNESS) : 0
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

function Lens({
  progressRef,
  glare,
}: {
  progressRef: MutableRefObject<number>
  glare: RefObject<HTMLDivElement | null>
}) {
  const camera = useThree((state) => state.camera)
  const level = useRef(0)

  useFrame((_, delta) => {
    const progress = progressRef.current ?? 0
    const chapter = Math.floor(progress)
    const local = progress - chapter

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
    element.style.setProperty('--gx', `${((x * 0.5 + 0.5) * 100).toFixed(2)}%`)
    element.style.setProperty('--gy', `${((0.5 - y * 0.5) * 100).toFixed(2)}%`)
  })

  return null
}

/* How far into a backlit hero shot we are (0..1): the planet's rim rays
   read it (see RimRays in SolarSystem) */
function BacklitDriver({ progressRef }: { progressRef: MutableRefObject<number> }) {
  useFrame(() => {
    const progress = progressRef.current ?? 0
    const chapter = Math.floor(progress)
    lens.backlit =
      isPlanetChapter(chapter) && HERO_BACKLIT.has(chapter - 2)
        ? heroDrift[chapter] ?? 0
        : 0
  })
  return null
}

function Scene({
  progressRef,
  glare,
}: {
  progressRef: MutableRefObject<number>
  glare: RefObject<HTMLDivElement | null>
}) {

  return (

    <>

      {/* first, so the date is advanced before planets and camera read it */}
      <Clock progressRef={progressRef} />

      <Lens progressRef={progressRef} glare={glare} />

      <BacklitDriver progressRef={progressRef} />

      <MilkyWaySky progressRef={progressRef} />

      <NightSky progressRef={progressRef} />

      <color attach="background" args={['#010207']} />

      <fog attach="fog" args={['#010207', 40, 190]} />



      <ambientLight intensity={0.04} />

      <directionalLight position={[-6, 3, 8]} intensity={0.08} color="#fff4dc" />

      <directionalLight position={[4, -2, -8]} intensity={0.04} color="#3158a8" />



      <Suspense fallback={<LoadingUniverse />}>

        <Starfield />

      </Suspense>



      <DeepStarLayer count={850} spread={SPREAD_FAR} size={0.028} opacity={0.42} speed={0.00025} />

      <DeepStarLayer count={420} spread={SPREAD_NEAR} size={0.045} opacity={0.28} speed={0.00055} />



      <SpaceDust />

      <DeepSpaceGlow />



      <Suspense fallback={<LoadingUniverse />}>

        <Galaxy progressRef={progressRef} />

      </Suspense>



      <Suspense fallback={<LoadingUniverse />}>

        <SolarSystem progressRef={progressRef} />

      </Suspense>



      <CinematicCamera progressRef={progressRef} />

      <WarmUp />

      <StarStreaks />



      {/* no MSAA (costly with these buffers): SMAA below smooths planet
          and ring edges for a fraction of the price */}
      <EffectComposer multisampling={0}>

        {/* glow is soft, so half resolution looks identical and costs a quarter */}
        <Bloom intensity={0.82} luminanceThreshold={0.70} luminanceSmoothing={0.90} mipmapBlur resolutionScale={0.5} />

        {/* edge smoothing, before the grain so the grain stays crisp */}
        <SMAA />


        {/* the only film grain on the page (the CSS grain layer was removed) */}
        <Noise opacity={0.02} />

        <Vignette eskil={false} offset={0.34} darkness={0.48} />

      </EffectComposer>

    </>

  )

}



/* ============================================================

   CANVAS

============================================================ */



function UniverseCanvas({ progressRef }: { progressRef: MutableRefObject<number> }) {
  // Adaptive resolution: drops pixel ratio when frame rate dips, restores when healthy
  // start at up to 1.5x; if the frame rate struggles, step down once and
  // stay there (switching back and forth resizes every buffer = a hitch)
  const [dpr, setDpr] = useState(() =>
    Math.min(1.5, typeof window === 'undefined' ? 1 : window.devicePixelRatio),
  )
  const glare = useRef<HTMLDivElement>(null)

  return (
    <>
    <Canvas

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

      <Scene progressRef={progressRef} glare={glare} />

    </Canvas>
    <div ref={glare} className="sun-glare" aria-hidden="true" />
    </>

  )

}   

export default memo(UniverseCanvas)
