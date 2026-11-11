'use client'

import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { AU_UNITS, layout, orbitalDisplayDistance } from './orbit'
import { simClock } from './simClock'
import { lens } from './lens'

/* The small bodies: the main asteroid belt (with its Kirkwood gaps),
   Jupiter's Trojans sharing its orbit 60° ahead and behind, and the
   Kuiper belt beyond Neptune. Every particle orbits at its real Kepler
   rate for its distance (inner ones overtake outer ones), on a slightly
   tilted orbit, so the wide views show a living, layered system. All the
   motion is in the vertex shader: one draw call per belt.
   Flying, they stand at their true distances (2.1-3.3 AU, 5.2 AU, 30-50
   AU) as bodies tens of km across: far apart, as the real belt is (you
   could fly through it and pass nothing), shown as a faint dust of points
   beyond a pixel. Far ones are drawn nearer along the same line, so they
   fit the depth range. */

const J2000 = 2451545.0
const DEG = Math.PI / 180

/* Jupiter's mean longitude at J2000 and its daily motion (JPL elements) */
const JUPITER_L0 = 34.39644 * DEG
const JUPITER_RATE = (3034.74612775 / 36525) * DEG

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/* radians per day for a circular orbit of `a` AU (Kepler's third law) */
const meanMotion = (a: number) => (0.9856076686 * DEG) / Math.pow(a, 1.5)

type Particle = {
  a: number
  start: number // longitude at J2000
  rate: number
  tilt: number
  node: number
  size: number
  shade: number
}

function buildGeometry(particles: Particle[]) {
  const count = particles.length
  const orbit = new Float32Array(count * 3)
  const au = new Float32Array(count)
  const tilt = new Float32Array(count * 2)
  const look = new Float32Array(count * 2)
  particles.forEach((p, i) => {
    orbit[i * 3] = orbitalDisplayDistance(p.a)
    au[i] = p.a
    orbit[i * 3 + 1] = p.start
    orbit[i * 3 + 2] = p.rate
    tilt[i * 2] = p.tilt
    tilt[i * 2 + 1] = p.node
    look[i * 2] = p.size
    look[i * 2 + 1] = p.shade
  })
  const geometry = new THREE.BufferGeometry()
  // positions are computed in the shader; this only sizes the draw
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geometry.setAttribute('aOrbit', new THREE.BufferAttribute(orbit, 3))
  geometry.setAttribute('aAU', new THREE.BufferAttribute(au, 1))
  geometry.setAttribute('aTilt', new THREE.BufferAttribute(tilt, 2))
  geometry.setAttribute('aLook', new THREE.BufferAttribute(look, 2))
  // the belts surround the whole system: never cull them
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5)
  return geometry
}

function mainBelt(): Particle[] {
  const random = seeded(4021)
  const out: Particle[] = []
  // Kirkwood gaps: resonances with Jupiter keep these distances empty
  const gaps = [
    [2.48, 2.53],
    [2.80, 2.85],
    [2.94, 2.98],
    [3.26, 3.31],
  ]
  while (out.length < 5200) {
    // denser in the middle of the belt
    const a = 2.15 + (random() + random() + random()) / 3 * 1.2
    if (gaps.some(([lo, hi]) => a > lo && a < hi)) continue
    out.push({
      a,
      start: random() * Math.PI * 2,
      rate: meanMotion(a),
      tilt: Math.pow(random(), 1.6) * 16 * DEG,
      node: random() * Math.PI * 2,
      size: 0.6 + Math.pow(random(), 4) * 1.6,
      shade: 0.45 + random() * 0.55,
    })
  }
  return out
}

function trojans(): Particle[] {
  const random = seeded(733)
  const out: Particle[] = []
  for (let i = 0; i < 1400; i += 1) {
    const ahead = i % 2 === 0
    const spread = (random() + random() - 1) * 26 * DEG
    out.push({
      a: 5.2 + (random() - 0.5) * 0.3,
      start: JUPITER_L0 + (ahead ? 60 : -60) * DEG + spread,
      // they librate about the Lagrange points but share Jupiter's period
      rate: JUPITER_RATE,
      tilt: Math.pow(random(), 1.3) * 22 * DEG,
      node: random() * Math.PI * 2,
      size: 0.6 + Math.pow(random(), 4) * 1.4,
      shade: 0.4 + random() * 0.5,
    })
  }
  return out
}

function kuiperBelt(): Particle[] {
  const random = seeded(9157)
  const out: Particle[] = []
  for (let i = 0; i < 4200; i += 1) {
    const kind = random()
    // plutinos in 2:3 resonance with Neptune, the classical belt, and a
    // thinner scattered population further out
    const a =
      kind < 0.2
        ? 39.4 + (random() - 0.5) * 0.8
        : kind < 0.8
          ? 42 + random() * 5.5
          : 48 + Math.pow(random(), 1.5) * 30
    out.push({
      a,
      start: random() * Math.PI * 2,
      rate: meanMotion(a),
      tilt: Math.pow(random(), kind < 0.8 ? 2 : 1) * (kind < 0.8 ? 18 : 32) * DEG,
      node: random() * Math.PI * 2,
      size: 0.7 + Math.pow(random(), 3) * 1.6,
      shade: 0.35 + random() * 0.65,
    })
  }
  return out
}

const BELT_VERTEX = /* glsl */ `
attribute vec3 aOrbit;  // display radius, longitude at J2000, radians per day
attribute vec2 aTilt;   // inclination, ascending node
attribute vec2 aLook;   // size, shade
attribute float aAU;    // true distance, AU
uniform float uTrue;    // 1: true scale (flying)
uniform float uAU;      // scene units per AU
uniform float uTrueSize; // a typical body's size at true scale, scene units
uniform float uDays;
uniform float uScale;
uniform float uSize;
uniform float uPixelRatio;
varying float vShade;
varying float vAlpha;
void main() {
  float theta = aOrbit.y + aOrbit.z * uDays;
  // ecliptic x -> scene X, ecliptic y -> scene -Z, north -> scene Y
  vec3 p = vec3(cos(theta), sin(aTilt.x) * sin(theta - aTilt.y), -sin(theta)) * mix(aOrbit.x, aAU * uAU, uTrue);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float px = aLook.x * uSize * uScale / -mv.z;
  // below a pixel, fade instead of shrinking (no flicker, no hard dots)
  vAlpha = clamp(px / uPixelRatio, 0.0, 1.0);
  if (uTrue > 0.5) {
    float dist = length(mv.xyz);
    px = aLook.x * uTrueSize * uScale / dist;
    // a faint dust beyond a pixel, so the belt can still be seen
    vAlpha = clamp(px / uPixelRatio, 0.22, 1.0);
    float reach = 30.0 + 8.0 * log(max(dist, 1.0));
    if (dist > reach) mv.xyz *= reach / dist;
  }
  gl_PointSize = clamp(px, 1.0 * uPixelRatio, 3.0 * uPixelRatio);
  vShade = aLook.y;
  gl_Position = projectionMatrix * mv;
}`

const BELT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vShade;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.15, 0.5, d);
  gl_FragColor = vec4(uColor * vShade, a * vAlpha * uOpacity);
}`

function useBeltMaterial(color: string, size: number, opacity: number) {
  const gl = useThree((state) => state.gl)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uDays: { value: 0 },
          uTrue: { value: 0 },
          uAU: { value: AU_UNITS },
          uTrueSize: { value: 30 / (6371 / 0.23) },
          uScale: { value: 400 },
          uSize: { value: size },
          uPixelRatio: { value: 1 },
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: opacity },
        },
        vertexShader: BELT_VERTEX,
        fragmentShader: BELT_FRAGMENT,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    [color, size, opacity],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    material.uniforms.uDays.value = simClock.jd - J2000
    material.uniforms.uTrue.value = layout.trueScale ? 1 : 0
    const ratio = gl.getPixelRatio()
    material.uniforms.uPixelRatio.value = ratio
    material.uniforms.uScale.value = state.size.height * ratio * 0.5
    // step back while a planet is the subject, so it never sits in a speckle
    material.uniforms.uOpacity.value = layout.trueScale ? Math.min(1, opacity * 1.8) : opacity * (1 - 0.7 * lens.closeUp)
  })
  return material
}

export default function Belts() {
  const asteroids = useMemo(() => buildGeometry([...mainBelt(), ...trojans()]), [])
  const kuiper = useMemo(() => buildGeometry(kuiperBelt()), [])
  useEffect(
    () => () => {
      asteroids.dispose()
      kuiper.dispose()
    },
    [asteroids, kuiper],
  )

  const rocky = useBeltMaterial('#b3a48d', 0.1, 0.36)
  const icy = useBeltMaterial('#9fb2c6', 0.09, 0.4)

  return (
    <>
      <points geometry={asteroids} material={rocky} frustumCulled={false} />
      <points geometry={kuiper} material={icy} frustumCulled={false} />
    </>
  )
}
