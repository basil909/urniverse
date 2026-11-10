'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { orbitalDisplayDistance, solveKepler } from './orbit'
import { simClock } from './simClock'

/* A comet on a long, eccentric orbit, timed to swing past the Sun about
   half a minute into the opening view (time runs at days per second
   there). Two tails, as on real comets:
   - the ion tail: blue, straight, pointing directly away from the Sun
   - the dust tail: pale yellow, broader, curving back along the orbit
   Both grow as the comet nears the Sun and fade as it leaves. Tail
   particles are placed in the vertex shader from a few uniforms. */

const DEG = Math.PI / 180
const PERIHELION = 0.62 // AU
const ECCENTRICITY = 0.93
const SEMI_MAJOR = PERIHELION / (1 - ECCENTRICITY)
const MEAN_MOTION = (0.9856076686 * DEG) / Math.pow(SEMI_MAJOR, 1.5) // rad per day
const INCLINATION = 32 * DEG
const NODE = 205 * DEG
const ARG_PERIHELION = 75 * DEG
/* days after the visitor's "today" when the comet rounds the Sun */
const PERIHELION_DELAY = 140

const TAIL_COUNT = 1400

const _ecl = new THREE.Vector3()

/* heliocentric position in AU (ecliptic frame) at `days` from perihelion */
function cometPosition(days: number, out: THREE.Vector3) {
  const mean = MEAN_MOTION * days
  const E = solveKepler(mean, ECCENTRICITY)
  const xv = SEMI_MAJOR * (Math.cos(E) - ECCENTRICITY)
  const yv = SEMI_MAJOR * Math.sqrt(1 - ECCENTRICITY * ECCENTRICITY) * Math.sin(E)
  const v = Math.atan2(yv, xv)
  const r = Math.hypot(xv, yv)
  const u = v + ARG_PERIHELION
  const cosN = Math.cos(NODE)
  const sinN = Math.sin(NODE)
  const cosI = Math.cos(INCLINATION)
  const sinI = Math.sin(INCLINATION)
  out.set(
    r * (cosN * Math.cos(u) - sinN * Math.sin(u) * cosI),
    r * (sinN * Math.cos(u) + cosN * Math.sin(u) * cosI),
    r * (Math.sin(u) * sinI),
  )
  return r
}

/* ecliptic AU -> scene units (compressed distance, exact direction) */
function toScene(ecl: THREE.Vector3, out: THREE.Vector3) {
  const r = ecl.length()
  const scale = r > 1e-6 ? orbitalDisplayDistance(r) / r : 0
  // scene axes: ecliptic x -> X, ecliptic north -> Y, ecliptic y -> -Z
  return out.set(ecl.x * scale, ecl.z * scale, -ecl.y * scale)
}

const TAIL_VERTEX = /* glsl */ `
attribute float aAlong;   // 0 at the head .. 1 at the tail's end
attribute vec2 aSpread;   // sideways scatter
attribute float aKind;    // 0 ion, 1 dust
uniform vec3 uHead;
uniform vec3 uAntiSun;
uniform vec3 uTrail;      // backwards along the orbit
uniform float uLength;
uniform float uScale;
uniform float uPixelRatio;
uniform float uTime;
varying float vAlpha;
varying float vKind;
void main() {
  float t = aAlong;
  // the dust tail bends back along the orbit, the ion tail stays straight
  vec3 dir = normalize(mix(uAntiSun, uTrail, aKind * t * 0.75));
  vec3 side = normalize(cross(dir, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
  vec3 up = normalize(cross(side, dir));
  float length = uLength * (aKind > 0.5 ? 0.75 : 1.0);
  float width = (aKind > 0.5 ? 0.16 : 0.035) * length;
  // ion streamers flicker along their length
  float ripple = aKind > 0.5 ? 0.0 : sin(t * 18.0 - uTime * 1.5 + aSpread.x * 9.0) * 0.012 * length;
  vec3 p = uHead + dir * t * length
    + (side * aSpread.x + up * aSpread.y) * width * (0.15 + t)
    + side * ripple;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp((aKind > 0.5 ? 0.12 : 0.07) * uScale / -mv.z, 1.0 * uPixelRatio, 6.0 * uPixelRatio);
  vAlpha = pow(1.0 - t, aKind > 0.5 ? 1.6 : 1.2);
  vKind = aKind;
  gl_Position = projectionMatrix * mv;
}`

const TAIL_FRAGMENT = /* glsl */ `
uniform float uBright;
varying float vAlpha;
varying float vKind;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  vec3 ion = vec3(0.45, 0.7, 1.0);
  vec3 dust = vec3(1.0, 0.92, 0.75);
  gl_FragColor = vec4(mix(ion, dust, vKind) * a * vAlpha * uBright, 1.0);
}`

const HEAD_FRAGMENT = /* glsl */ `
uniform float uBright;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float coma = exp(-d * 9.0) + exp(-d * 30.0) * 1.5;
  gl_FragColor = vec4(vec3(0.85, 0.95, 1.0) * coma * uBright, 1.0);
}`

const HEAD_VERTEX = /* glsl */ `
uniform vec3 uHead;
uniform float uScale;
uniform float uPixelRatio;
void main() {
  vec4 mv = modelViewMatrix * vec4(uHead, 1.0);
  gl_PointSize = clamp(0.5 * uScale / -mv.z, 3.0 * uPixelRatio, 26.0 * uPixelRatio);
  gl_Position = projectionMatrix * mv;
}`

export default function Comet() {
  const gl = useThree((state) => state.gl)
  const head = useRef(new THREE.Vector3())

  const geometry = useMemo(() => {
    let seed = 7177
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    const along = new Float32Array(TAIL_COUNT)
    const spread = new Float32Array(TAIL_COUNT * 2)
    const kind = new Float32Array(TAIL_COUNT)
    for (let i = 0; i < TAIL_COUNT; i += 1) {
      const dust = i % 3 !== 0 // two thirds dust, one third ion
      along[i] = Math.pow(random(), dust ? 1.3 : 1.0)
      // a bell-shaped scatter across the tail
      spread[i * 2] = (random() + random() + random() - 1.5) / 1.5
      spread[i * 2 + 1] = (random() + random() + random() - 1.5) / 1.5 * (dust ? 0.35 : 1)
      kind[i] = dust ? 1 : 0
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TAIL_COUNT * 3), 3))
    g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1))
    g.setAttribute('aSpread', new THREE.BufferAttribute(spread, 2))
    g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5)
    return g
  }, [])

  const headGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5)
    return g
  }, [])

  const shared = useMemo(
    () => ({
      uHead: { value: new THREE.Vector3() },
      uAntiSun: { value: new THREE.Vector3(1, 0, 0) },
      uTrail: { value: new THREE.Vector3(0, 0, 1) },
      uLength: { value: 1 },
      uScale: { value: 400 },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uBright: { value: 0 },
    }),
    [],
  )

  const tailMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: shared,
        vertexShader: TAIL_VERTEX,
        fragmentShader: TAIL_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [shared],
  )
  const headMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: shared,
        vertexShader: HEAD_VERTEX,
        fragmentShader: HEAD_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [shared],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      headGeometry.dispose()
      tailMaterial.dispose()
      headMaterial.dispose()
    },
    [geometry, headGeometry, tailMaterial, headMaterial],
  )

  const _ahead = useMemo(() => new THREE.Vector3(), [])
  const _aheadScene = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, delta) => {
    const days = simClock.jd - (simClock.startJd + PERIHELION_DELAY)
    const r = cometPosition(days, _ecl)
    toScene(_ecl, head.current)
    // a moment later, to know which way it is going
    cometPosition(days + 2, _ahead)
    toScene(_ahead, _aheadScene)

    shared.uHead.value.copy(head.current)
    // positions are relative to the Sun at the origin of this group
    shared.uAntiSun.value.copy(head.current).normalize()
    shared.uTrail.value.copy(head.current).sub(_aheadScene).normalize()
    // active only when the Sun warms it: tails grow inside ~3 AU
    const activity = THREE.MathUtils.clamp((3.2 - r) / 2.4, 0, 1)
    shared.uLength.value = 1.4 + 8 * activity * activity
    shared.uBright.value = 0.15 + 0.85 * activity
    shared.uTime.value += delta
    const ratio = gl.getPixelRatio()
    shared.uPixelRatio.value = ratio
    shared.uScale.value = state.size.height * ratio * 0.5
  })

  return (
    <>
      <points geometry={geometry} material={tailMaterial} frustumCulled={false} />
      <points geometry={headGeometry} material={headMaterial} frustumCulled={false} />
    </>
  )
}
