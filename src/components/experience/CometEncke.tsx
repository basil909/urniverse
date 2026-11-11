'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { AU_UNITS, EARTH_RADIUS_KM, EARTH_RENDER_RADIUS, farScale, getBodyPosition, SYSTEM_OFFSET } from './orbit'
import { simClock } from './simClock'
import { pilot } from './pilotState'
import { COMET, COMET_ID, cometHelioAU } from './spaceBodies'

/* ============================================================
   COMET ENCKE, IN FLIGHT
   Where its orbit puts it (spaceBodies.ts), at its true size:
   - the nucleus, a dark lumpy body 4.8 km across;
   - the coma, the cloud of gas and dust round it, thinning as the square
     of the distance; its glow along each line of sight is worked out
     exactly (the integral of 1/r^2), so it reads right from outside and
     flying through it;
   - two tails: the ion tail, blue, narrow, streaming straight away from
     the Sun (the solar wind carries the gas off); the dust tail, broader
     and yellow-white, curving back along the orbit (the dust is pushed
     away by sunlight, more gently, and lags behind).
   How big it all is follows the distance from the Sun (activity rises
   steeply as it nears it): in November 2026, 1.7 AU out and on its way
   in, a coma some 20,000 km across and tails millions of km long.
============================================================ */

const KM_PER_UNIT = EARTH_RADIUS_KM / EARTH_RENDER_RADIUS
const ION_COUNT = 4500
const DUST_COUNT = 9000

const NUCLEUS_VERTEX = /* glsl */ `
varying vec3 vNormalW;
void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const NUCLEUS_FRAGMENT = /* glsl */ `
uniform vec3 uSun;
varying vec3 vNormalW;
void main() {
  float light = max(dot(normalize(vNormalW), uSun), 0.0);
  // dark as soot (albedo 0.05), drawn a little brighter so its shape reads
  vec3 rock = vec3(0.16, 0.15, 0.14);
  gl_FragColor = vec4(rock * (light * 1.8 + 0.02), 1.0);
}`

const COMA_VERTEX = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const COMA_FRAGMENT = /* glsl */ `
uniform vec3 uCam; uniform vec3 uSun; uniform float uCore; uniform float uBright;
varying vec3 vPos;
void main() {
  // in coma radii, from the nucleus
  vec3 o = uCam;
  vec3 d = normalize(vPos - uCam);
  float camR = length(o);
  if (camR < 1.0 ? gl_FrontFacing : !gl_FrontFacing) discard;
  float b = dot(o, d);
  float h = b * b - (dot(o, o) - 1.0);
  if (h < 0.0) discard;
  h = sqrt(h);
  float t0 = max(-b - h, 0.0);
  float t1 = -b + h;
  if (t1 <= t0) discard;
  // density 1/(r^2 + core^2) along the line: an arctangent
  float tc = -b;
  vec3 closest = o + d * tc;
  float B = sqrt(dot(closest, closest) + uCore * uCore);
  float column = (atan((t1 - tc) / B) - atan((t0 - tc) / B)) / B;
  // less the uniform floor at the edge, so the cloud ends softly
  column = max(column - (t1 - t0), 0.0);
  float sunward = 0.7 + 0.3 * dot(normalize(closest + vec3(1e-6)), uSun);
  float glow = 1.0 - exp(-column * 0.007 * uBright * sunward);
  // gas glowing green-cyan (carbon, C2), the dusty core whiter
  vec3 color = mix(vec3(0.5, 0.95, 0.72), vec3(1.0, 0.98, 0.92), smoothstep(0.25, 0.8, glow));
  gl_FragColor = vec4(color * glow, 1.0);
}`

const TAIL_VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uAnti; uniform vec3 uBack; uniform float uLen; uniform float uWidth;
uniform float uTime; uniform float uDust; uniform float uPixel; uniform float uScale; uniform float uBright;
varying float vAlpha;
// a roughly normal spread from two uniform numbers
float spread(float a, float b) { return sqrt(-2.0 * log(max(a, 1e-4))) * cos(6.2831853 * b); }
void main() {
  // the tail flows outwards (the ion tail fast, the dust slowly)
  float u = fract(aSeed.x + uTime * (uDust > 0.5 ? 0.0025 : 0.012));
  float s = pow(u, 1.15);
  vec3 normalAxis = normalize(cross(uAnti, uBack));
  vec3 inPlane = normalize(cross(normalAxis, uAnti));
  vec3 p;
  float width;
  if (uDust > 0.5) {
    // curving back along the orbit, fanning out in the orbit's plane
    width = uWidth * (0.5 + s * 5.0);
    p = uAnti * s * uLen + inPlane * (s * s * uLen * 0.42)
      + inPlane * spread(aSeed.y, aSeed.z) * width * 0.6 + normalAxis * spread(aSeed.z, aSeed.w) * width * 0.18;
  } else {
    // straight from the Sun, in a few streamers that wander
    width = uWidth * (0.2 + s * 1.1);
    float streamer = floor(aSeed.y * 6.0) / 6.0 * 6.2831853 + sin(s * 9.0 + uTime * 0.05 + aSeed.y * 20.0) * 0.4;
    float r = width * (0.25 + 0.75 * aSeed.w);
    p = uAnti * s * uLen + (normalAxis * cos(streamer) + inPlane * sin(streamer)) * r;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float want = width * (uDust > 0.5 ? 1.1 : 0.7) * uScale * uPixel / max(-mv.z, 1e-9);
  float size = clamp(want, 1.5, 160.0);
  // keep the light the same when a near puff is capped in size; fade the
  // nearest (flying through, they would be blots)
  float energy = want > 160.0 ? (160.0 / want) * (160.0 / want) : 1.0;
  float near = smoothstep(width * uScale * 0.2, width * uScale * 1.5, -mv.z);
  vAlpha = pow(1.0 - u, 1.4) * uBright * (uDust > 0.5 ? 0.045 : 0.2) * energy * near * min(1.0, want / 1.5);
  gl_PointSize = size;
  gl_Position = projectionMatrix * mv;
}`
const TAIL_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = exp(-d * d * 3.5) * vAlpha;
  gl_FragColor = vec4(uColor * a, 1.0);
}`

function nucleusGeometry() {
  // a lumpy, two-lobed body (Encke's true shape is not known in detail)
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(1, 5))
  const position = geometry.getAttribute('position')
  const v = new THREE.Vector3()
  const bump = (x: number, y: number, z: number) =>
    Math.sin(x * 3.1 + 1.7) * Math.sin(y * 2.7 + 0.4) * Math.sin(z * 3.3 + 2.1) * 0.5 +
    Math.sin(x * 7.3 + 4.1) * Math.sin(y * 6.1 + 1.3) * Math.sin(z * 6.9 + 0.2) * 0.18 +
    Math.sin(x * 15.1) * Math.sin(y * 13.7 + 2.0) * Math.sin(z * 14.3 + 1.0) * 0.06
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i)
    const r = 1 + bump(v.x, v.y, v.z) * 0.35
    v.multiplyScalar(r)
    v.x *= 1.35 // elongated
    position.setXYZ(i, v.x, v.y, v.z)
  }
  geometry.computeVertexNormals()
  return geometry
}

function tailGeometry(count: number, seed: number) {
  const seeds = new Float32Array(count * 4)
  let state = seed
  const random = () => {
    state = (state * 16807) % 2147483647
    return state / 2147483647
  }
  for (let i = 0; i < seeds.length; i += 1) seeds[i] = random()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  return geometry
}

const _pos = new THREE.Vector3()
const _anti = new THREE.Vector3()
const _now = new THREE.Vector3()
const _later = new THREE.Vector3()
const _back = new THREE.Vector3()

export default function CometEncke() {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const group = useRef<THREE.Group>(null)
  const nucleus = useRef<THREE.Mesh>(null)
  const coma = useRef<THREE.Mesh>(null)
  const parts = useMemo(() => {
    const tail = (dust: boolean, color: string) =>
      new THREE.ShaderMaterial({
        uniforms: {
          uAnti: { value: new THREE.Vector3(1, 0, 0) },
          uBack: { value: new THREE.Vector3(0, 0, 1) },
          uLen: { value: 1 },
          uWidth: { value: 1 },
          uTime: { value: 0 },
          uDust: { value: dust ? 1 : 0 },
          uPixel: { value: 500 },
          uScale: { value: 1 },
          uBright: { value: 1 },
          uColor: { value: new THREE.Color(color) },
        },
        vertexShader: TAIL_VERTEX,
        fragmentShader: TAIL_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
    return {
      nucleusGeometry: nucleusGeometry(),
      nucleusMaterial: new THREE.ShaderMaterial({
        uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) } },
        vertexShader: NUCLEUS_VERTEX,
        fragmentShader: NUCLEUS_FRAGMENT,
      }),
      comaMaterial: new THREE.ShaderMaterial({
        uniforms: {
          uCam: { value: new THREE.Vector3() },
          uSun: { value: new THREE.Vector3(1, 0, 0) },
          uCore: { value: 0.002 },
          uBright: { value: 1 },
        },
        vertexShader: COMA_VERTEX,
        fragmentShader: COMA_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      ionGeometry: tailGeometry(ION_COUNT, 12345),
      dustGeometry: tailGeometry(DUST_COUNT, 67890),
      ionMaterial: tail(false, '#7fb6ff'),
      dustMaterial: tail(true, '#ffe9c4'),
    }
  }, [])
  useEffect(
    () => () => {
      parts.nucleusGeometry.dispose()
      parts.nucleusMaterial.dispose()
      parts.comaMaterial.dispose()
      parts.ionGeometry.dispose()
      parts.dustGeometry.dispose()
      parts.ionMaterial.dispose()
      parts.dustMaterial.dispose()
    },
    [parts],
  )

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    g.visible = pilot.active
    if (!pilot.active) return
    getBodyPosition(COMET_ID, simClock.jd, _pos)
    const distance = _pos.distanceTo(camera.position)
    const far = farScale(distance)
    g.position.copy(_pos).sub(camera.position).multiplyScalar(far).add(camera.position)
    g.scale.setScalar(far)
    // from the Sun outwards, and back along the orbit
    _anti.copy(_pos).sub(SYSTEM_OFFSET)
    const au = _anti.length() / AU_UNITS
    _anti.normalize()
    cometHelioAU(simClock.jd, _now)
    cometHelioAU(simClock.jd + 0.5, _later)
    _back.copy(_now).sub(_later).normalize()
    _back.addScaledVector(_anti, -_back.dot(_anti)).normalize()
    // activity: steeply up as it nears the Sun
    const near = 1 / Math.max(au, 0.2)
    const comaKm = 45000 * near ** 1.5
    const bright = THREE.MathUtils.clamp(near ** 1.2, 0.25, 3)
    const comaUnits = comaKm / KM_PER_UNIT
    coma.current?.scale.setScalar(comaUnits)
    nucleus.current?.scale.setScalar(COMET.radiusKm / KM_PER_UNIT)
    nucleus.current?.rotateY(delta * ((2 * Math.PI) / (11.08 * 3600)) * Math.max(1, pilot.timeScale))
    const sunward = _anti.clone().negate()
    parts.nucleusMaterial.uniforms.uSun.value.copy(sunward)
    const cu = parts.comaMaterial.uniforms
    cu.uCam.value.copy(camera.position).sub(_pos).divideScalar(comaUnits)
    cu.uSun.value.copy(sunward)
    cu.uCore.value = Math.max((COMET.radiusKm * 4) / comaKm, 1e-4)
    cu.uBright.value = bright
    const pixel = size.height / (2 * Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov) / 2))
    const tails: [THREE.ShaderMaterial, number][] = [
      [parts.ionMaterial, 1.2e7 * near * near],
      [parts.dustMaterial, 6e6 * near * near],
    ]
    for (const [material, lengthKm] of tails) {
      const u = material.uniforms
      u.uAnti.value.copy(_anti)
      u.uBack.value.copy(_back)
      u.uLen.value = lengthKm / KM_PER_UNIT
      u.uWidth.value = comaUnits * 0.6
      u.uTime.value += delta
      u.uPixel.value = pixel
      u.uScale.value = far
      u.uBright.value = bright
    }
  })

  return (
    <group ref={group} visible={false}>
      <mesh ref={nucleus} geometry={parts.nucleusGeometry} material={parts.nucleusMaterial} />
      <mesh ref={coma} material={parts.comaMaterial} frustumCulled={false}>
        <sphereGeometry args={[1, 48, 32]} />
      </mesh>
      <points geometry={parts.ionGeometry} material={parts.ionMaterial} frustumCulled={false} />
      <points geometry={parts.dustGeometry} material={parts.dustMaterial} frustumCulled={false} />
    </group>
  )
}
