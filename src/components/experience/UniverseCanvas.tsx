'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { PerformanceMonitor } from '@react-three/drei'
import { memo, Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'

import SolarSystem from './SolarSystem'
import Galaxy, {
  GALAXY_POSITION,
  GALAXY_RADIUS,
  GALAXY_SCALE,
  GALAXY_TILT,
} from './Galaxy'
import Starfield from './Starfield'
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

const BLEND = 0.18

const isPlanetChapter = (chapter: number) =>
  chapter >= 2 && chapter <= 9

const ease = (value: number) => {
  const x = THREE.MathUtils.clamp(value, 0, 1)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

function calculatePlanetPose(
  planetIndex: number,
  progressPhase: number,
  outHero: THREE.Vector3,
  outArrival: THREE.Vector3,
  outTarget: THREE.Vector3,
) {
  const config = PLANET_CONFIG[planetIndex]

  getPlanetPosition(planetIndex, progressPhase, _planetCenter)

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
  _viewDir
    .copy(_toSun)
    .multiplyScalar(0.62)
    .addScaledVector(_side, 0.78)
    .addScaledVector(_worldUp, 0.16)
    .normalize()

  const visualRadius = getPlanetVisualRadius(planetIndex)
  // Tighter framing so the planet fills the centre of the screen
  const heroDistance =
    Math.max(
      config.minHeroDistance,
      visualRadius * config.radiusMultiplier,
    ) * (planetIndex === 5 ? 1.9 : planetIndex >= 4 ? 1.2 : 0.95)
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
    const baseFov = planet ? PLANET_CONFIG[chapter - 2].fov : 41
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

    parallaxWeight.current +=
      ((planet || reducedMotion ? 0 : 1) - parallaxWeight.current) *
      (1 - Math.exp(-delta * 4))

    camera.position.x +=
      pointer.x * 0.18 * parallaxWeight.current
    camera.position.y +=
      pointer.y * 0.10 * parallaxWeight.current

    const fovDiff = targetFov - camera.fov

    if (Math.abs(fovDiff) > 0.01) {
      camera.fov +=
        fovDiff * (1 - Math.exp(-delta * 7))
      camera.updateProjectionMatrix()
    }

    camera.lookAt(_scratchTarget)
  })

  return null
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

const CA_OFFSET = new THREE.Vector2(0.000035, 0.000035)
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



function Scene({ progressRef }: { progressRef: MutableRefObject<number> }) {

  return (

    <>

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



      <EffectComposer multisampling={2}>

        <Bloom intensity={0.82} luminanceThreshold={0.70} luminanceSmoothing={0.90} mipmapBlur />

        <ChromaticAberration offset={CA_OFFSET} />

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
  const [dpr, setDpr] = useState(1.5)

  return (

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

      <PerformanceMonitor
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr(1.5)}
      />

      <Scene progressRef={progressRef} />

    </Canvas>

  )

}   

export default memo(UniverseCanvas)
