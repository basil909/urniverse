'use client'

import { useMemo, useRef, useEffect, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

/* ============================================================
   PROCEDURAL GALAXY

   Visual model:
   - Central bulge & dense galactic core
   - Four spiral arms with logarithmic curvature
   - Stellar temperature variation (O/B/A/F/G/K/M types)
   - Dark galactic dust lanes for volumetric depth
   - Star clusters & faint outer halo
============================================================ */

const STAR_COUNT = 42000
const DUST_COUNT = 6000
const CLUSTER_COUNT = 80

const ARM_COUNT = 4
export const GALAXY_RADIUS = 22

// Far backdrop, upper right of the intro view, so it never sits behind the Sun
export const GALAXY_POSITION: [number, number, number] = [48, 30, -125]
export const GALAXY_SCALE = 2.4
export const GALAXY_TILT: [number, number, number] = [0.62, 0.15, 0.22]

/* The finale chapter (index 11) where the Milky Way is the subject */
export const GALAXY_CHAPTER = 11

/* ============================================================
   SEEDED RANDOM — MULBERRY32
============================================================ */

function seededRandom(seed: number) {
  let value = seed | 0

  return () => {
    value = (value + 0x6d2b79f5) | 0

    let t = value

    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ============================================================
   SPIRAL ARM HELPER

   Logarithmic-style spiral shared by:
   - Stellar disk
   - Dust lanes
============================================================ */

function getArmAngle(radius: number, arm: number) {
  return (
    (arm / ARM_COUNT) * Math.PI * 2 +
    Math.log(radius / 3 + 1) * 3.2
  )
}

/* ============================================================
   CUSTOM STAR SHADERS
============================================================ */

const starVertexShader = /* glsl */ `
  attribute vec3 color;

  varying vec3 vColor;
  varying float vFade;

  uniform float uSize;
  uniform float uPixelRatio;

  void main() {
    vColor = color;

    vec4 mv = modelViewMatrix * vec4(position, 1.0);

    float dist = max(-mv.z, 0.001);

    float raw =
      uSize *
      (300.0 / dist) *
      uPixelRatio;

    float minPx = 1.5 * uPixelRatio;

    gl_PointSize = clamp(
      raw,
      minPx,
      14.0 * uPixelRatio
    );

    float small =
      clamp(
        raw / minPx,
        0.0,
        1.0
      );

    float nearFade =
      smoothstep(
        0.4,
        3.0,
        dist
      );

    vFade =
      mix(
        0.25,
        1.0,
        small
      ) *
      nearFade;

    gl_Position =
      projectionMatrix *
      mv;
  }
`

const starFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vFade;

  void main() {
    float d =
      length(
        gl_PointCoord -
        vec2(0.5)
      );

    if (d > 0.5) {
      discard;
    }

    float alpha =
      1.0 -
      smoothstep(
        0.0,
        0.5,
        d
      );

    alpha =
      pow(
        alpha,
        1.5
      );

    gl_FragColor =
      vec4(
        vColor,
        alpha * vFade
      );
  }
`

/* ============================================================
   MAIN COMPONENT
============================================================ */

export default function Galaxy({
  progressRef,
}: {
  progressRef?: MutableRefObject<number>
}) {
  const galaxy = useRef<THREE.Group>(null)
  const marker = useRef<HTMLDivElement>(null)
  const markerOpacity = useRef(0)

  /* "You are here": partway out along an arm, like the Sun's position
     about 26,000 light-years from the centre of a ~50,000 ly radius disc */
  const sunAnchor = useMemo<[number, number, number]>(() => {
    const radius = GALAXY_RADIUS * 0.56
    // on the side of the disc that faces the left of the screen in the finale
    const angle = getArmAngle(radius, 1) + 0.28 + Math.PI
    return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius]
  }, [])

  const dpr = useThree(
    (state) => state.viewport.dpr
  )

  /* ==========================================================
     STELLAR DISK
  ========================================================== */

  const starGeometry = useMemo(() => {
    const random = seededRandom(193847)

    const geometry =
      new THREE.BufferGeometry()

    const positions =
      new Float32Array(
        STAR_COUNT * 3
      )

    const colors =
      new Float32Array(
        STAR_COUNT * 3
      )

    const color =
      new THREE.Color()

    for (
      let i = 0;
      i < STAR_COUNT;
      i++
    ) {
      const i3 = i * 3

      const population =
        random()

      let radius = 0
      let angle = 0
      let verticalSpread = 0

      /* ------------------------------------------------------
         CENTRAL BULGE
      ------------------------------------------------------ */

      if (population < 0.16) {
        radius =
          Math.pow(
            random(),
            1.8
          ) * 6.0

        angle =
          random() *
          Math.PI *
          2

        verticalSpread = 1.1
      }

      /* ------------------------------------------------------
         SPIRAL ARMS
      ------------------------------------------------------ */

      else if (population < 0.82) {
        radius =
          3 +
          Math.pow(
            random(),
            0.78
          ) *
            (GALAXY_RADIUS - 3)

        const arm =
          Math.floor(
            random() *
              ARM_COUNT
          )

        const spiral =
          getArmAngle(
            radius,
            arm
          )

        const turbulence =
          (random() - 0.5) *
          (0.16 + radius * 0.028)

        const cloudOffset =
          (random() - 0.5) *
          0.18

        angle =
          spiral +
          turbulence +
          cloudOffset

        verticalSpread =
          0.32 +
          radius * 0.018
      }

      /* ------------------------------------------------------
         OUTER DISK
      ------------------------------------------------------ */

      else if (population < 0.96) {
        radius =
          7 +
          Math.pow(
            random(),
            0.55
          ) *
            16

        angle =
          random() *
          Math.PI *
          2

        verticalSpread =
          0.42 +
          radius * 0.015
      }

      /* ------------------------------------------------------
         SPHERICAL / OBLATE HALO
      ------------------------------------------------------ */

      else {
        const haloRadius =
          6 +
          Math.pow(
            random(),
            1.5
          ) *
            26

        const theta =
          random() *
          Math.PI *
          2

        const phi =
          Math.acos(
            2 * random() - 1
          )

        positions[i3] =
          haloRadius *
          Math.sin(phi) *
          Math.cos(theta)

        positions[i3 + 1] =
          haloRadius *
          Math.cos(phi) *
          0.6

        positions[i3 + 2] =
          haloRadius *
          Math.sin(phi) *
          Math.sin(theta)

        /* ----------------------------------------------------
           HALO STAR COLOUR
        ---------------------------------------------------- */

        const stellarType =
          random()

        if (stellarType > 0.92) {
          color.setRGB(
            0.55,
            0.73,
            1.0,
            THREE.SRGBColorSpace
          )
        } else if (
          stellarType > 0.78
        ) {
          color.setRGB(
            0.76,
            0.88,
            1.0,
            THREE.SRGBColorSpace
          )
        } else if (
          stellarType > 0.35
        ) {
          color.setRGB(
            1.0,
            0.94,
            0.80,
            THREE.SRGBColorSpace
          )
        } else if (
          stellarType > 0.12
        ) {
          color.setRGB(
            1.0,
            0.72,
            0.48,
            THREE.SRGBColorSpace
          )
        } else {
          color.setRGB(
            1.0,
            0.48,
            0.32,
            THREE.SRGBColorSpace
          )
        }

        const luminosity =
          0.45 +
          Math.pow(
            random(),
            2.5
          ) *
            0.75

        colors[i3] =
          color.r *
          luminosity

        colors[i3 + 1] =
          color.g *
          luminosity

        colors[i3 + 2] =
          color.b *
          luminosity

        continue
      }

      /* ------------------------------------------------------
         SMALL POSITION VARIATION
      ------------------------------------------------------ */

      radius +=
        (random() - 0.5) *
        0.18

      positions[i3] =
        Math.cos(angle) *
        radius

      /*
        Bell-shaped vertical distribution.

        This concentrates stars near
        the galactic mid-plane instead
        of producing a box-like spread.
      */
      positions[i3 + 1] =
        (
          random() +
          random() +
          random() -
          1.5
        ) /
          3 *
        verticalSpread

      positions[i3 + 2] =
        Math.sin(angle) *
        radius

      /* ------------------------------------------------------
         STELLAR POPULATION COLOUR
      ------------------------------------------------------ */

      const stellarType =
        random()

      if (stellarType > 0.92) {
        color.setRGB(
          0.55,
          0.73,
          1.0,
          THREE.SRGBColorSpace
        )
      } else if (
        stellarType > 0.78
      ) {
        color.setRGB(
          0.76,
          0.88,
          1.0,
          THREE.SRGBColorSpace
        )
      } else if (
        stellarType > 0.35
      ) {
        color.setRGB(
          1.0,
          0.94,
          0.80,
          THREE.SRGBColorSpace
        )
      } else if (
        stellarType > 0.12
      ) {
        color.setRGB(
          1.0,
          0.72,
          0.48,
          THREE.SRGBColorSpace
        )
      } else {
        color.setRGB(
          1.0,
          0.48,
          0.32,
          THREE.SRGBColorSpace
        )
      }

      const luminosity =
        0.45 +
        Math.pow(
          random(),
          2.5
        ) *
          0.75

      colors[i3] =
        color.r *
        luminosity

      colors[i3 + 1] =
        color.g *
        luminosity

      colors[i3 + 2] =
        color.b *
        luminosity
    }

    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(
        positions,
        3
      )
    )

    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(
        colors,
        3
      )
    )

    return geometry
  }, [])

  /* ==========================================================
     GALACTIC DUST
  ========================================================== */

  const dustGeometry = useMemo(() => {
    const random =
      seededRandom(847291)

    const geometry =
      new THREE.BufferGeometry()

    const positions =
      new Float32Array(
        DUST_COUNT * 3
      )

    for (
      let i = 0;
      i < DUST_COUNT;
      i++
    ) {
      const i3 = i * 3

      const radius =
        3 +
        Math.pow(
          random(),
          0.78
        ) *
          (GALAXY_RADIUS - 3)

      const arm =
        Math.floor(
          random() *
            ARM_COUNT
        )

      const spiral =
        getArmAngle(
          radius,
          arm
        )

      const turbulence =
        (random() - 0.5) *
        (0.08 + radius * 0.015)

      const angle =
        spiral +
        turbulence

      positions[i3] =
        Math.cos(angle) *
        radius

      /*
        Bell-shaped dust thickness.
      */
      const verticalSpread =
        0.15 +
        radius * 0.01

      positions[i3 + 1] =
        (
          random() +
          random() +
          random() -
          1.5
        ) /
          3 *
        verticalSpread

      positions[i3 + 2] =
        Math.sin(angle) *
        radius
    }

    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(
        positions,
        3
      )
    )

    return geometry
  }, [])

  /* ==========================================================
     STAR CLUSTERS
  ========================================================== */

  const clusterGeometry =
    useMemo(() => {
      const random =
        seededRandom(928374)

      const geometry =
        new THREE.BufferGeometry()

      const positions =
        new Float32Array(
          CLUSTER_COUNT * 3
        )

      for (
        let i = 0;
        i < CLUSTER_COUNT;
        i++
      ) {
        const i3 = i * 3

        const radius =
          4 +
          random() * 17

        const angle =
          random() *
          Math.PI *
          2

        positions[i3] =
          Math.cos(angle) *
          radius

        const verticalSpread = 0.7

        positions[i3 + 1] =
          (
            random() +
            random() +
            random() -
            1.5
          ) /
            3 *
          verticalSpread

        positions[i3 + 2] =
          Math.sin(angle) *
          radius
      }

      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(
          positions,
          3
        )
      )

      return geometry
    }, [])

  /* ==========================================================
     SOFT ROUND PARTICLE TEXTURE
  ========================================================== */

  const softDot = useMemo(() => {
    const canvas =
      document.createElement(
        'canvas'
      )

    canvas.width = 64
    canvas.height = 64

    const context =
      canvas.getContext(
        '2d'
      )

    if (!context) {
      return null
    }

    const gradient =
      context.createRadialGradient(
        32,
        32,
        0,
        32,
        32,
        32
      )

    gradient.addColorStop(
      0,
      'rgba(255,255,255,1)'
    )

    gradient.addColorStop(
      0.35,
      'rgba(255,255,255,0.75)'
    )

    gradient.addColorStop(
      1,
      'rgba(255,255,255,0)'
    )

    context.fillStyle =
      gradient

    context.fillRect(
      0,
      0,
      64,
      64
    )

    const texture =
      new THREE.CanvasTexture(
        canvas
      )

    texture.colorSpace =
      THREE.SRGBColorSpace

    texture.needsUpdate = true

    return texture
  }, [])

  /* ==========================================================
     STAR MATERIAL
  ========================================================== */

  const starMaterial =
    useMemo(() => {
      return new THREE.ShaderMaterial({
        vertexShader:
          starVertexShader,

        fragmentShader:
          starFragmentShader,

        uniforms: {
          uSize: {
            value: 0.035,
          },

          uPixelRatio: {
            value: 1,
          },
        },

        transparent: true,

        depthWrite: false,

        blending:
          THREE.AdditiveBlending,
      })
    }, [])

  /* ==========================================================
     UPDATE DPR WITHOUT REBUILDING MATERIAL
  ========================================================== */

  useEffect(() => {
    starMaterial.uniforms.uPixelRatio.value =
      dpr
  }, [
    dpr,
    starMaterial,
  ])

  /* ==========================================================
     CLEANUP
  ========================================================== */

  useEffect(() => {
    return () => {
      starGeometry.dispose()
      dustGeometry.dispose()
      clusterGeometry.dispose()

      starMaterial.dispose()

      softDot?.dispose()
    }
  }, [
    starGeometry,
    dustGeometry,
    clusterGeometry,
    starMaterial,
    softDot,
  ])

  /* ==========================================================
     ANIMATION
  ========================================================== */

  useFrame((_, delta) => {
    if (!galaxy.current) {
      return
    }

    /*
      The inner group spins around
      the galaxy's local Y axis.

      Because the outer group contains
      the tilt, the disk rotates within
      its own plane instead of precessing.
    */
    galaxy.current.rotation.y +=
      delta * 0.004

    // marker shows only once the camera has settled on the galaxy
    if (marker.current && progressRef) {
      const progress = progressRef.current ?? 0
      const local = progress - GALAXY_CHAPTER
      const target = local >= 0.18 && local < 0.93 ? 1 : 0
      markerOpacity.current +=
        (target - markerOpacity.current) * (1 - Math.exp(-delta * 4))
      marker.current.style.opacity = markerOpacity.current.toFixed(3)
    }
  })

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <group
      position={GALAXY_POSITION}
      rotation={GALAXY_TILT}
      scale={GALAXY_SCALE}
    >
      <group ref={galaxy}>
        {progressRef && (
          <Html
            position={sunAnchor}
            center
            zIndexRange={[5, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div ref={marker} className="you-are-here" style={{ opacity: 0 }}>
              <span className="you-are-here-dot" />
              <span className="you-are-here-label">
                <b>You are here</b>
                The Sun and its eight planets
              </span>
            </div>
          </Html>
        )}
        {/* ==================================================
            STELLAR DISK
        ================================================== */}

        <points
          geometry={starGeometry}
          material={starMaterial}
          renderOrder={-5}
          frustumCulled={false}
        />

        {/* ==================================================
            GALACTIC DUST LANES
        ================================================== */}

        {softDot && (
          <points
            geometry={dustGeometry}
            renderOrder={-4}
            frustumCulled={false}
          >
            <pointsMaterial
              fog={false}
              map={softDot}
              color="#020205"
              size={0.20}
              transparent
              opacity={0.42}
              sizeAttenuation
              depthWrite={false}
              blending={
                THREE.NormalBlending
              }
            />
          </points>
        )}

        {/* ==================================================
            STAR CLUSTERS
        ================================================== */}

        {softDot && (
          <points
            geometry={
              clusterGeometry
            }
            renderOrder={-3}
            frustumCulled={false}
          >
            <pointsMaterial
              fog={false}
              map={softDot}
              color="#dcecff"
              size={0.11}
              transparent
              opacity={0.20}
              sizeAttenuation
              depthWrite={false}
              blending={
                THREE.AdditiveBlending
              }
            />
          </points>
        )}

        {/* ==================================================
            GALACTIC CORE GLOW
        ================================================== */}

        {softDot && (
          <sprite
            scale={[5, 5, 1]}
            renderOrder={-2}
          >
            <spriteMaterial
              map={softDot}
              color="#ffdca8"
              opacity={0.14}
              fog={false}
              transparent
              depthWrite={false}
              blending={
                THREE.AdditiveBlending
              }
            />
          </sprite>
        )}
      </group>
    </group>
  )
}