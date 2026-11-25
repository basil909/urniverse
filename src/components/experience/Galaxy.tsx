'use client'

import { useMemo, useRef, useEffect, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { shot } from './shots'

/* ============================================================
   PROCEDURAL GALAXY

   Drawn after the Milky Way as it is mapped today (a disc 100,000
   light-years across, so one unit is about 2,270 light-years):
   - a small round bulge inside a long central bar, reaching about
     16,000 light-years each way and lying some 20 degrees from the line
     between the Sun and the centre
   - four arms wound at a pitch of about 12.5 degrees: two major ones
     (Scutum-Centaurus and Perseus) starting from the ends of the bar and
     rich in stars, two fainter ones between them (Norma and Sagittarius)
   - the Sun 26,000 light-years out, in the Orion Spur: a short minor arm
     between the Sagittarius arm (about 1,200 ly inside) and the Perseus
     arm (about 2 kpc outside)
   - star colours by population: the bulge, bar and halo old, orange and
     yellow; the arms and the spur young, with the hot blue stars
   - dark dust along the inner edge of the arms; a faint outer halo
============================================================ */

const STAR_COUNT = 30000
const DUST_COUNT = 4000
const CLUSTER_COUNT = 80

const ARM_COUNT = 4

import { ARM_WIND, BAR_ANGLE, BAR_COS, BAR_HALF, BAR_SIN, GALAXY_RADIUS, SUN_ANGLE, SUN_RADIUS } from './galaxyLayout'
import { dive, galaxyFrame } from './galaxyDive'
import Nebulae from './Nebulae'
export { GALAXY_RADIUS, SUN_ANGLE, SUN_RADIUS }

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

/* arms 0 and 2 are the major arms, leaving the ends of the bar */
function getArmAngle(radius: number, arm: number) {
  return (
    BAR_ANGLE +
    (arm / ARM_COUNT) * Math.PI * 2 +
    ARM_WIND * Math.log(Math.max(radius, BAR_HALF * 0.85) / BAR_HALF)
  )
}

/* the Orion Spur: a short arc through the Sun, wound like the arms */
function getSpurPoint(u: number) {
  return { radius: SUN_RADIUS * Math.exp(u / ARM_WIND), angle: SUN_ANGLE + u }
}

/* a star's colour by its population: young (arms, spur) has the hot blue
   stars; old (bulge, bar, halo) has none */
const STAR_COLOURS: [number, number, number][] = [
  [0.55, 0.73, 1.0], // O, B
  [0.76, 0.88, 1.0], // A
  [1.0, 0.94, 0.8], // F, G
  [1.0, 0.72, 0.48], // K
  [1.0, 0.48, 0.32], // M
]
const POPULATIONS = {
  young: [0.18, 0.22, 0.35, 0.17, 0.08],
  disc: [0.06, 0.12, 0.42, 0.25, 0.15],
  old: [0, 0.02, 0.33, 0.4, 0.25],
}
function starColour(roll: number, mix: number[]) {
  let sum = 0
  for (let i = 0; i < mix.length; i += 1) {
    sum += mix[i]
    if (roll < sum) return STAR_COLOURS[i]
  }
  return STAR_COLOURS[STAR_COLOURS.length - 1]
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
  uniform float uFade;

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
        alpha * vFade * uFade
      );
  }
`

/* ============================================================
   GLOW: the light between the stars

   A single disc under the star points, drawn in the galaxy's plane:
   a warm core and bulge, soft bluish arms following the same spiral as
   the stars, dark dust lanes along the inner edge of each arm, and pink
   star-forming knots strung along the arms. Gives the disc the smooth,
   luminous look of a galaxy photograph instead of a cloud of dots.
============================================================ */

const glowVertexShader = /* glsl */ `
  varying vec2 vPos;
  varying vec3 vWorld;
  varying vec3 vUp;
  void main() {
    vPos = position.xy;
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    vUp = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const glowFragmentShader = /* glsl */ `
  uniform float uStrength;
  uniform float uRadius;
  varying vec2 vPos;
  varying vec3 vWorld;
  varying vec3 vUp;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 4; i++) { v += noise(p) * a; p = p * 2.03 + 1.7; a *= 0.5; }
    return v;
  }

  void main() {
    float r = length(vPos);
    /* the plane is turned flat into the disc: its y runs along -z */
    float theta = atan(-vPos.y, vPos.x);
    /* the arms wander a little, so they are not perfect curves */
    float wander = (fbm(vPos * 0.32 + 7.0) - 0.5) * 0.9;
    float spiral = theta - ${BAR_ANGLE.toFixed(4)} - ${ARM_WIND.toFixed(4)} * log(max(r, ${(BAR_HALF * 0.85).toFixed(2)}) / ${BAR_HALF.toFixed(1)}) + wander;
    float wave = cos(4.0 * spiral);
    /* the two major arms (from the bar's ends) brighter than the two between */
    float major = 0.5 + 0.5 * cos(2.0 * spiral);
    float arms = pow(0.5 + 0.5 * wave, 3.0) * mix(0.45, 1.0, major);
    /* they begin at the ends of the bar */
    arms *= smoothstep(${(BAR_HALF * 0.7).toFixed(2)}, ${(BAR_HALF * 1.05).toFixed(2)}, r);
    /* the Orion Spur, through the Sun's place */
    float u = atan(sin(theta - ${SUN_ANGLE.toFixed(4)}), cos(theta - ${SUN_ANGLE.toFixed(4)}));
    float spurR = ${SUN_RADIUS.toFixed(3)} * exp(u / ${ARM_WIND.toFixed(4)});
    arms += 0.55 * exp(-pow(r - spurR, 2.0) / 0.35) * (1.0 - smoothstep(0.26, 0.42, abs(u)));
    /* clumpy along their length, like real arms */
    arms *= 0.45 + 0.9 * fbm(vPos * 0.8 + 1.3);
    /* dust lanes trail just inside each arm, broken into filaments */
    float lanes = pow(0.5 + 0.5 * cos(4.0 * spiral - 0.6), 8.0) * smoothstep(${(BAR_HALF * 0.8).toFixed(2)}, ${(BAR_HALF * 1.2).toFixed(2)}, r) * mix(0.55, 1.0, major);
    lanes *= smoothstep(0.3, 0.7, fbm(vPos * 1.4 + 5.0));

    float mottle = 0.7 + 0.6 * fbm(vPos * 0.45 + 3.0);
    float edge = 1.0 - smoothstep(uRadius * 0.7, uRadius * 1.05, r);

    vec3 core = vec3(1.0, 0.82, 0.58) * (exp(-r / 1.6) * 1.0 + exp(-r / 4.5) * 0.3);
    /* the central bar (disc x = vPos.x, disc z = -vPos.y) */
    vec2 inPlane = vec2(vPos.x, -vPos.y);
    vec2 axis = vec2(${BAR_COS.toFixed(4)}, ${BAR_SIN.toFixed(4)});
    float along = dot(inPlane, axis);
    float across = dot(inPlane, vec2(-axis.y, axis.x));
    /* the bar: long, with soft square ends */
    core += vec3(1.0, 0.8, 0.56) * exp(-pow(abs(along) / ${BAR_HALF.toFixed(1)}, 4.0) - (across * across) / 1.4) * 0.5;
    vec3 disc = vec3(0.62, 0.72, 1.0) * exp(-r / 9.0) * (0.12 + 0.55 * arms) * mottle;
    vec3 light = (core + disc) * (1.0 - lanes * 0.75) * edge;

    /* star-forming regions: small, round pink knots on the arms */
    vec2 cell = floor(vPos * 1.6);
    vec2 centre = cell + vec2(hash(cell), hash(cell + 17.0));
    float knot = 1.0 - smoothstep(0.0, 0.11, length(vPos * 1.6 - centre));
    float present = step(0.72, hash(cell + 41.0));
    float knots = knot * present * pow(0.5 + 0.5 * wave, 6.0) * smoothstep(4.0, 8.0, r) * edge;
    light += vec3(1.0, 0.5, 0.66) * knots * 0.28;

    /* the sheet stands for the whole disc's light; seen at a slant from
       down inside the disc it would lie under the view as a flat beige
       floor (the bright core spread across it). There it gives way to the
       stars themselves: faded where it is seen nearly edge on */
    float facing = abs(dot(normalize(cameraPosition - vWorld), normalize(vUp)));
    light *= smoothstep(0.08, 0.5, facing);

    gl_FragColor = vec4(light * uStrength, 1.0);
  }
`

/* ============================================================
   MAIN COMPONENT
============================================================ */

const _cameraLocal = new THREE.Vector3()

export default function Galaxy({
  progressRef,
}: {
  progressRef?: MutableRefObject<number>
}) {
  const galaxy = useRef<THREE.Group>(null)
  const camera = useThree((state) => state.camera)
  const marker = useRef<HTMLDivElement>(null)
  const markerOpacity = useRef(0)

  /* "You are here": partway out along an arm, like the Sun's position
     about 26,000 light-years from the centre of a ~50,000 ly radius disc */
  const sunAnchor = useMemo<[number, number, number]>(
    // (on the side of the disc that faces the left of the screen in the finale)
    () => [Math.cos(SUN_ANGLE) * SUN_RADIUS, 0, Math.sin(SUN_ANGLE) * SUN_RADIUS],
    [],
  )

  const dpr = useThree(
    (state) => state.viewport.dpr
  )

  /* ==========================================================
     STELLAR DISK
  ========================================================== */

  const starGeometry = useMemo(() => {
    const random = seededRandom(193847)
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(STAR_COUNT * 3)
    const colors = new Float32Array(STAR_COUNT * 3)
    const color = new THREE.Color()
    // a bell-shaped spread about the mid-plane
    const bell = () => (random() + random() + random() - 1.5) / 3

    for (let i = 0; i < STAR_COUNT; i++) {
      const i3 = i * 3
      const population = random()
      let x = 0
      let y = 0
      let z = 0
      let mix = POPULATIONS.disc

      if (population < 0.08) {
        // the bulge: small and round, old stars
        const r = Math.pow(random(), 1.8) * 4.2
        const a = random() * Math.PI * 2
        x = Math.cos(a) * r
        z = Math.sin(a) * r
        y = bell() * 1.6
        mix = POPULATIONS.old
      } else if (population < 0.17) {
        // the bar: about 16,000 ly each way, a third as wide; old stars
        const along = (random() < 0.5 ? -1 : 1) * Math.pow(random(), 1.25) * BAR_HALF
        const across = bell() * 2.4
        x = along * BAR_COS - across * BAR_SIN
        z = along * BAR_SIN + across * BAR_COS
        y = bell() * 0.9
        mix = POPULATIONS.old
      } else if (population < 0.78) {
        // the arms: most stars on the two major arms
        const r = BAR_HALF * 0.85 + Math.pow(random(), 0.78) * (GALAXY_RADIUS - BAR_HALF * 0.85)
        const arm = random() < 0.62 ? (random() < 0.5 ? 0 : 2) : random() < 0.5 ? 1 : 3
        const a = getArmAngle(r, arm) + (random() - 0.5) * (0.16 + r * 0.024) + (random() - 0.5) * 0.16
        const rr = r + (random() - 0.5) * 0.18
        x = Math.cos(a) * rr
        z = Math.sin(a) * rr
        y = bell() * (0.32 + r * 0.018)
        mix = POPULATIONS.young
      } else if (population < 0.81) {
        // the Orion Spur
        const { radius, angle } = getSpurPoint((random() - 0.5) * 0.7)
        const a = angle + (random() - 0.5) * 0.05
        const rr = radius + (random() - 0.5) * 0.7
        x = Math.cos(a) * rr
        z = Math.sin(a) * rr
        y = bell() * 0.5
        mix = POPULATIONS.young
      } else if (population < 0.96) {
        // the disc between the arms
        const r = 6 + Math.pow(random(), 0.55) * 17
        const a = random() * Math.PI * 2
        x = Math.cos(a) * r
        z = Math.sin(a) * r
        y = bell() * (0.42 + r * 0.015)
      } else {
        // the halo: old stars in a flattened sphere
        const r = 6 + Math.pow(random(), 1.5) * 26
        const theta = random() * Math.PI * 2
        const phi = Math.acos(2 * random() - 1)
        x = r * Math.sin(phi) * Math.cos(theta)
        y = r * Math.cos(phi) * 0.6
        z = r * Math.sin(phi) * Math.sin(theta)
        mix = POPULATIONS.old
      }

      positions[i3] = x
      positions[i3 + 1] = y
      positions[i3 + 2] = z

      const [r, g, b] = starColour(random(), mix)
      color.setRGB(r, g, b, THREE.SRGBColorSpace)
      const luminosity = 0.45 + Math.pow(random(), 2.5) * 0.75
      colors[i3] = color.r * luminosity
      colors[i3 + 1] = color.g * luminosity
      colors[i3 + 2] = color.b * luminosity
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
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
        BAR_HALF * 0.9 +
        Math.pow(
          random(),
          0.78
        ) *
          (GALAXY_RADIUS - BAR_HALF * 0.9)

      // most dust on the major arms, along their inner edge
      const arm = random() < 0.6 ? (random() < 0.5 ? 0 : 2) : random() < 0.5 ? 1 : 3

      const spiral =
        getArmAngle(
          radius,
          arm
        )

      const turbulence =
        (random() - 0.5) *
        (0.08 + radius * 0.015)

      // (the inner edge: at a given radius, a little further round)
      const angle =
        spiral +
        0.09 +
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
     GLOW MATERIAL
  ========================================================== */

  const glowMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: glowVertexShader,
        fragmentShader: glowFragmentShader,
        uniforms: {
          uStrength: { value: 0.14 },
          uRadius: { value: GALAXY_RADIUS },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    [],
  )
  const glowStrength = useRef(0)
  const dustMaterial = useRef<THREE.PointsMaterial>(null)
  const clusterMaterial = useRef<THREE.PointsMaterial>(null)
  const coreMaterial = useRef<THREE.SpriteMaterial>(null)
  const haloMaterial = useRef<THREE.SpriteMaterial>(null)
  useEffect(() => () => glowMaterial.dispose(), [glowMaterial])

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

          uFade: {
            value: 0,
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

    /* We live inside the Milky Way, so it can never hang in our sky as a
       spiral: the model appears only as the camera pulls out of the galaxy
       in the finale (and leaves again on the way home). */
    const progress = progressRef ? progressRef.current ?? 0 : 11.5
    const fade =
      THREE.MathUtils.smoothstep(progress, 11.0, 11.12) *
      // (and stays, small, in the Local Group chapter)
      (1 - THREE.MathUtils.smoothstep(progress, 13.0, 13.12))
    galaxy.current.visible = fade > 0.001
    galaxyFrame.object = galaxy.current
    // the glow is a flat sheet in the disc: down near it (diving), it gives
    // way to the stars and the nebulae
    const height = Math.abs(galaxy.current.worldToLocal(_cameraLocal.copy(camera.position)).y)
    const above = THREE.MathUtils.smoothstep(height, 0.6, 5)
    glowStrength.current = 0.6 * fade * above
    // Sagittarius A*'s halo: from close by (the dive's end), a ball with
    // an edge filling the view; it thins to a faint warmth there
    const fromCentre = _cameraLocal.length()
    if (haloMaterial.current) haloMaterial.current.opacity = 0.25 * THREE.MathUtils.lerp(0.22, 1, THREE.MathUtils.smoothstep(fromCentre, 0.6, 2.5))
    glowMaterial.uniforms.uStrength.value = glowStrength.current
    starMaterial.uniforms.uFade.value = fade
    if (dustMaterial.current) dustMaterial.current.opacity = 0.42 * fade
    if (clusterMaterial.current) clusterMaterial.current.opacity = 0.2 * fade
    // (the core's round glow, too: from within the disc it would hang over
    // the horizon like a ball)
    if (coreMaterial.current) coreMaterial.current.opacity = 0.14 * fade * above

    // marker shows only once the camera has settled on the galaxy
    if (marker.current && progressRef) {
      const progress = progressRef.current ?? 0
      const local = progress - GALAXY_CHAPTER
      const target = (local >= 0.18 && local < 0.93 ? 1 : 0) * (shot.index >= 2 && shot.index <= 5 ? 0 : 1) * (dive.active ? 0 : 1)
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
            GLOW (under the stars)
        ================================================== */}
        <mesh
          material={glowMaterial}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={-6}
        >
          <planeGeometry args={[GALAXY_RADIUS * 2.2, GALAXY_RADIUS * 2.2]} />
        </mesh>

        {/* ==================================================
            STELLAR DISK
        ================================================== */}

        <points
          geometry={starGeometry}
          material={starMaterial}
          renderOrder={-5}
          frustumCulled // skipped entirely when the galaxy is off-screen
        />

        {/* ==================================================
            GALACTIC DUST LANES
        ================================================== */}

        {softDot && (
          <points
            geometry={dustGeometry}
            renderOrder={-4}
            frustumCulled // skipped entirely when the galaxy is off-screen
          >
            <pointsMaterial
              ref={dustMaterial}
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
            frustumCulled // skipped entirely when the galaxy is off-screen
          >
            <pointsMaterial
              ref={clusterMaterial}
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
            THE NEBULAE NEAR THE SUN (volumetric, Nebulae.tsx)
        ================================================== */}
        <Nebulae />

        {/* ==================================================
            SAGITTARIUS A*: the glow round the central black hole
            (its disc of hot gas), and a point of light at its heart
        ================================================== */}
        {softDot && (
          <>
            <sprite scale={[0.22, 0.22, 1]} renderOrder={-1}>
              <spriteMaterial ref={haloMaterial} map={softDot} color="#ffb070" opacity={0.25} transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
            </sprite>
            <sprite scale={[0.05, 0.05, 1]} renderOrder={-1}>
              <spriteMaterial map={softDot} color="#fff4e6" opacity={0.8} transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
            </sprite>
          </>
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
              ref={coreMaterial}
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