'use client'

import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

import { GALAXY_POSITION, GALAXY_RADIUS, GALAXY_SCALE, GALAXY_TILT, SUN_ANGLE, SUN_RADIUS } from './Galaxy'
import { shot } from './shots'

/* ============================================================
   THE LOCAL GROUP
   The chapter after the Milky Way: the galaxy's neighbours at their true
   distances and directions, on the same scale as the Milky Way model
   (its disc, 100,000 light-years across, is about 106 units here).
   Directions are worked out from the galactic coordinates (longitude l,
   latitude b) as seen from where the model puts the Sun; distances from
   the Sun, in light-years:
   - Andromeda (M31): l 121.2, b -21.6, 2.5 million; disc ~220,000 ly
   - Triangulum (M33): l 133.6, b -31.3, 2.73 million; disc ~60,000 ly
   - the Large and Small Magellanic Clouds: l 280.5, b -32.9, 163,000;
     l 302.8, b -44.3, 206,000
   - M32 and M110, Andromeda's own satellites, beside it
============================================================ */

export const LOCAL_GROUP_CHAPTER = 12

/* light-years per unit of the Milky Way model (before its scale) */
const LY_PER_MODEL = 50_000 / GALAXY_RADIUS

const _outer = new THREE.Matrix4().compose(
  new THREE.Vector3(...GALAXY_POSITION),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(...GALAXY_TILT)),
  new THREE.Vector3(GALAXY_SCALE, GALAXY_SCALE, GALAXY_SCALE),
)

/* a place at galactic longitude / latitude (degrees) and distance (ly),
   in world space */
function galactic(l: number, b: number, ly: number) {
  const sun = new THREE.Vector3(Math.cos(SUN_ANGLE) * SUN_RADIUS, 0, Math.sin(SUN_ANGLE) * SUN_RADIUS)
  const toCentre = sun.clone().negate().normalize()
  // the way the Sun moves: the arms trail, so against their winding
  const ahead = new THREE.Vector3(Math.sin(SUN_ANGLE), 0, -Math.cos(SUN_ANGLE))
  const north = toCentre.clone().cross(ahead).normalize()
  const L = (l * Math.PI) / 180
  const B = (b * Math.PI) / 180
  const way = toCentre
    .clone()
    .multiplyScalar(Math.cos(B) * Math.cos(L))
    .addScaledVector(ahead, Math.cos(B) * Math.sin(L))
    .addScaledVector(north, Math.sin(B))
  return sun.addScaledVector(way, ly / LY_PER_MODEL).applyMatrix4(_outer)
}

const MODEL_TO_WORLD = GALAXY_SCALE / LY_PER_MODEL // world units per light-year

type Neighbour = {
  name: string
  note: string
  at: THREE.Vector3
  radius: number // world units
  kind: 'spiral' | 'flocculent' | 'irregular' | 'elliptical'
  tilt: [number, number, number]
  color: string
  stars: number
  seed: number
}

export const NEIGHBOURS: Neighbour[] = [
  {
    name: 'Andromeda',
    note: '2.5 million light-years',
    at: galactic(121.2, -21.6, 2_500_000),
    radius: 110_000 * MODEL_TO_WORLD,
    kind: 'spiral',
    tilt: [1.05, 0.35, 0.5],
    color: '#ffe2c0',
    stars: 9000,
    seed: 3101,
  },
  {
    name: 'Triangulum',
    note: '2.7 million light-years',
    at: galactic(133.6, -31.3, 2_730_000),
    radius: 30_000 * MODEL_TO_WORLD,
    kind: 'flocculent',
    tilt: [0.7, -0.4, 0.2],
    color: '#cfdcff',
    stars: 2600,
    seed: 3302,
  },
  {
    name: 'Large Magellanic Cloud',
    note: '163,000 light-years',
    at: galactic(280.5, -32.9, 163_000),
    radius: 7_000 * MODEL_TO_WORLD,
    kind: 'irregular',
    tilt: [0.5, 0.2, 0.3],
    color: '#d8e2ff',
    stars: 900,
    seed: 3503,
  },
  {
    name: 'Small Magellanic Cloud',
    note: '206,000 light-years',
    at: galactic(302.8, -44.3, 206_000),
    radius: 3_500 * MODEL_TO_WORLD,
    kind: 'irregular',
    tilt: [0.2, 0.6, 0.1],
    color: '#d8e2ff',
    stars: 420,
    seed: 3604,
  },
]
// Andromeda's two bright satellites, just beside it
const andromeda = NEIGHBOURS[0].at
export const SATELLITES_OF_ANDROMEDA = [
  { name: 'M32', at: andromeda.clone().add(new THREE.Vector3(18, -9, 6)), radius: 4.5 },
  { name: 'M110', at: andromeda.clone().add(new THREE.Vector3(-24, 22, -8)), radius: 7 },
]

/* the camera for the chapter: off to the side of the Milky Way and
   Andromeda (25 Milky Way widths apart), far enough back to hold both in
   the left part of the screen, clear of the text; on a portrait screen
   further back still, the pair centred above the text */
export const LOCAL_GROUP_VIEW = (() => {
  const milkyWay = new THREE.Vector3(...GALAXY_POSITION)
  const across = andromeda.clone().sub(milkyWay)
  const middle = milkyWay.clone().addScaledVector(across, 0.5)
  const along = across.clone().normalize()
  const up = new THREE.Vector3(0, 1, 0)
  const side = along.clone().cross(up).normalize()
  const lift = side.clone().cross(along).normalize()
  const away = side.clone().multiplyScalar(Math.cos(0.42)).addScaledVector(lift, Math.sin(0.42))
  const position = middle.clone().addScaledVector(away, across.length() * 2.3)
  const forward = middle.clone().sub(position).normalize()
  const right = forward.clone().cross(up).normalize()
  const portraitPosition = middle.clone().addScaledVector(away, across.length() * 3.5)
  return {
    position,
    target: middle.clone().addScaledVector(right, across.length() * 0.385),
    portraitPosition,
    portraitTarget: middle.clone().addScaledVector(lift, -across.length() * 0.35),
    reach: portraitPosition.distanceTo(andromeda) + 400,
  }
})()

/* ---- drawing ---- */

function seeded(seed: number) {
  let value = seed | 0
  return () => {
    value = (value + 0x6d2b79f5) | 0
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GLOW_VERTEX = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

/* a disc galaxy's light: a warm bulge, a bluish disc, spiral arms
   (none for the irregulars), dust lanes, all in the disc's own plane */
const GLOW_FRAGMENT = /* glsl */ `
uniform float uStrength;
uniform float uArms;
uniform float uTwist;
uniform float uBulge;
uniform vec3 uTint;
varying vec2 vPos;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += noise(p) * a; p = p * 2.03 + 1.7; a *= 0.5; } return v; }
void main() {
  float r = length(vPos);
  if (r > 1.0) discard;
  float theta = atan(vPos.y, vPos.x);
  float arms = 1.0;
  if (uArms > 0.5) {
    float wave = cos(uArms * (theta - log(r * 6.0 + 1.0) * uTwist) + (fbm(vPos * 5.0) - 0.5) * 1.6);
    arms = 0.25 + 0.75 * pow(0.5 + 0.5 * wave, 2.5);
  }
  float clumps = 0.6 + 0.8 * fbm(vPos * 7.0 + 3.0);
  float disc = exp(-r * 4.2) * arms * clumps;
  float lanes = uArms > 0.5 ? smoothstep(0.55, 0.75, fbm(vPos * 9.0 + 11.0)) * smoothstep(0.15, 0.35, r) : 0.0;
  vec3 light = vec3(1.0, 0.86, 0.66) * exp(-r / max(uBulge, 0.01)) * 1.4 + uTint * disc * (1.0 - lanes * 0.6);
  light *= 1.0 - smoothstep(0.75, 1.0, r);
  gl_FragColor = vec4(light * uStrength, 1.0);
}`

function NeighbourGalaxy({ galaxy, fade }: { galaxy: Neighbour; fade: RefObject<number> }) {
  const points = useMemo(() => {
    const random = seeded(galaxy.seed)
    const positions = new Float32Array(galaxy.stars * 3)
    const colors = new Float32Array(galaxy.stars * 3)
    const color = new THREE.Color()
    const arms = galaxy.kind === 'spiral' ? 2 : galaxy.kind === 'flocculent' ? 3 : 0
    for (let i = 0; i < galaxy.stars; i += 1) {
      let x = 0
      let y = 0
      let z = 0
      const bulge = random() < (galaxy.kind === 'irregular' ? 0.1 : 0.22)
      if (bulge) {
        const r = Math.pow(random(), 2) * 0.22
        const a = random() * Math.PI * 2
        x = Math.cos(a) * r
        z = Math.sin(a) * r * (galaxy.kind === 'irregular' ? 0.35 : 1)
        y = (random() - 0.5) * 0.08
        color.set('#ffd6a8')
      } else if (arms > 0) {
        const r = 0.12 + Math.pow(random(), 0.9) * 0.88
        const arm = Math.floor(random() * arms)
        const a = (arm / arms) * Math.PI * 2 + Math.log(r * 6 + 1) * 2.6 + (random() - 0.5) * (0.5 + r * 0.6)
        x = Math.cos(a) * r
        z = Math.sin(a) * r
        y = (random() - 0.5) * 0.04
        color.set(random() < 0.35 ? '#a9c2ff' : galaxy.color)
      } else {
        // an irregular: a bar and patches
        const r = Math.pow(random(), 0.7)
        const a = random() * Math.PI * 2
        x = Math.cos(a) * r * (0.6 + 0.4 * random())
        z = Math.sin(a) * r * 0.75
        y = (random() - 0.5) * 0.15
        color.set(random() < 0.4 ? '#b6caff' : galaxy.color)
      }
      positions.set([x, y, z], i * 3)
      const glow = 0.4 + random() * 0.6
      colors.set([color.r * glow, color.g * glow, color.b * glow], i * 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geometry
  }, [galaxy])
  useEffect(() => () => points.dispose(), [points])

  const pointMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 1.6,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )
  const glowMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: GLOW_VERTEX,
        fragmentShader: GLOW_FRAGMENT,
        uniforms: {
          uStrength: { value: 0 },
          uArms: { value: galaxy.kind === 'spiral' ? 2 : galaxy.kind === 'flocculent' ? 3 : 0 },
          uTwist: { value: galaxy.kind === 'spiral' ? 2.6 : 1.8 },
          uBulge: { value: galaxy.kind === 'spiral' ? 0.09 : galaxy.kind === 'flocculent' ? 0.05 : 0.12 },
          uTint: { value: new THREE.Color(galaxy.kind === 'spiral' ? '#c8d4ff' : '#b8c8ff') },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    [galaxy],
  )
  useEffect(
    () => () => {
      pointMaterial.dispose()
      glowMaterial.dispose()
    },
    [pointMaterial, glowMaterial],
  )

  useFrame(() => {
    const f = fade.current ?? 0
    pointMaterial.opacity = 0.75 * f
    glowMaterial.uniforms.uStrength.value = (galaxy.kind === 'spiral' ? 0.8 : 0.55) * f
  })

  return (
    <group position={galaxy.at} rotation={galaxy.tilt} scale={galaxy.radius}>
      <points geometry={points} material={pointMaterial} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={glowMaterial}>
        <planeGeometry args={[2, 2]} />
      </mesh>
    </group>
  )
}

/* a small elliptical galaxy: a soft, warm smudge that always faces us */
function useSmudgeTexture() {
  return useMemo(() => {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')!
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255, 236, 210, 1)')
    gradient.addColorStop(0.25, 'rgba(255, 220, 180, 0.45)')
    gradient.addColorStop(1, 'rgba(255, 210, 170, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [])
}

export default function LocalGroup({ progressRef }: { progressRef: RefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  const fade = useRef(0)
  const labels = useRef<(HTMLDivElement | null)[]>([])
  const smudge = useSmudgeTexture()
  const smudgeMaterial = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: smudge,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        opacity: 0,
      }),
    [smudge],
  )
  const haloMaterial = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: smudge,
        color: '#c8ccff',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        opacity: 0,
      }),
    [smudge],
  )
  useEffect(
    () => () => {
      smudge.dispose()
      smudgeMaterial.dispose()
      haloMaterial.dispose()
    },
    [smudge, smudgeMaterial, haloMaterial],
  )

  useFrame((_, delta) => {
    const progress = progressRef.current ?? 0
    // in from the pull-back out of the Milky Way, out on the way home
    fade.current =
      THREE.MathUtils.smoothstep(progress, 11.6, 12.12) * (1 - THREE.MathUtils.smoothstep(progress, 13.0, 13.12))
    if (group.current) group.current.visible = fade.current > 0.001
    smudgeMaterial.opacity = 0.7 * fade.current
    haloMaterial.opacity = 0.22 * fade.current
    const local = progress - LOCAL_GROUP_CHAPTER
    // (the film's close shots go without names)
    const named = (local >= 0.18 && local < 0.93 ? 1 : 0) * (shot.index >= 2 && shot.index <= 5 ? 0 : 1)
    labels.current.forEach((label) => {
      if (!label) return
      const now = Number(label.style.opacity || 0)
      const next = now + (named - now) * (1 - Math.exp(-delta * 4))
      label.style.opacity = next.toFixed(3)
    })
  })

  // the Magellanic Clouds sit too close beside the Milky Way, at this
  // distance, for labels of their own: they are named with it
  const named = [
    {
      name: 'Milky Way',
      note: 'You are here, with the Magellanic Clouds',
      at: new THREE.Vector3(...GALAXY_POSITION),
      radius: GALAXY_RADIUS * GALAXY_SCALE,
    },
    ...NEIGHBOURS.filter((galaxy) => !galaxy.name.includes('Magellanic')),
  ]

  return (
    <group ref={group} visible={false}>
      {NEIGHBOURS.map((galaxy) => (
        <NeighbourGalaxy key={galaxy.name} galaxy={galaxy} fade={fade} />
      ))}
      {/* a soft glow round each, so they read at this distance */}
      {NEIGHBOURS.map((galaxy) => (
        <sprite key={`halo-${galaxy.name}`} position={galaxy.at} scale={galaxy.radius * 2.4} material={haloMaterial} />
      ))}
      {SATELLITES_OF_ANDROMEDA.map((satellite) => (
        <sprite key={satellite.name} position={satellite.at} scale={satellite.radius * 2} material={smudgeMaterial} />
      ))}
      {named.map((galaxy, i) => (
        <Html
          key={galaxy.name}
          position={[galaxy.at.x, galaxy.at.y - galaxy.radius * 0.6, galaxy.at.z]}
          center
          zIndexRange={[5, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            ref={(element) => {
              labels.current[i] = element
            }}
            className="galaxy-label"
            style={{ opacity: 0 }}
          >
            <b>{galaxy.name}</b>
            <span>{galaxy.note}</span>
          </div>
        </Html>
      ))}
    </group>
  )
}
