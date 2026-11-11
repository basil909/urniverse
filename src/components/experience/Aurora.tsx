'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ============================================================
   AURORAS, UP CLOSE
   Curtains of light round each magnetic pole, where particles from the
   Sun (and, at Jupiter, from Io's volcanoes) pour down the field lines
   into the upper air. They stand on an oval, nearer the pole on the day
   side; each is a thin, folded sheet, streaked with vertical rays, its
   lower edge sharp. Earth's glow green (oxygen) from about 100 km, red
   higher up, with a purple fringe at the bottom (nitrogen); the giants'
   glow in the pinks and violets of hydrogen, hundreds of km up.
   Seen at night (by day the sky drowns them). The march along each line
   of sight steps by the distance to the nearest curtain, so the sheets
   stay sharp and the work small. A child of the planet, in its frame.
============================================================ */

export type AuroraLook = {
  /** magnetic north, as latitude and east longitude (degrees) */
  poleLat: number
  poleLon: number
  /** the oval's distance from the pole (degrees), at midnight and noon */
  night: number
  day: number
  /** a curtain's thickness (degrees) */
  width: number
  /** bottom and top of the glow, km; the planet's radius, km */
  baseKm: number
  topKm: number
  radiusKm: number
  low: string
  mid: string
  high: string
  glow: number
}

export const AURORA: Record<string, AuroraLook> = {
  // geomagnetic north, 80.7 N 72.7 W
  Earth: { poleLat: 80.7, poleLon: -72.7, night: 23, day: 14, width: 0.16, baseKm: 100, topKm: 420, radiusKm: 6371, low: '#b04cff', mid: '#5dff8a', high: '#ff4a5a', glow: 1.0 },
  // tilted about 10 degrees; the main oval some 15-20 degrees from the pole
  Jupiter: { poleLat: 80.4, poleLon: 200, night: 17, day: 13, width: 0.5, baseKm: 250, topKm: 1600, radiusKm: 69911, low: '#7a5cff', mid: '#c06cff', high: '#ff5fa8', glow: 0.9 },
  // aligned with the spin axis; near 75 degrees latitude
  Saturn: { poleLat: 90, poleLon: 0, night: 16, day: 13, width: 0.6, baseKm: 800, topKm: 2600, radiusKm: 58232, low: '#7f6bff', mid: '#d46cff', high: '#ff5c7a', glow: 0.85 },
}

const VERTEX = /* glsl */ `
varying vec3 vLocal;
void main() {
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const FRAGMENT = /* glsl */ `
uniform vec3 uCam; uniform vec3 uSun; uniform vec3 uAxis;
uniform float uNight; uniform float uDay; uniform float uWidth;
uniform float uBase; uniform float uTop; uniform float uShell;
uniform vec3 uLow; uniform vec3 uMid; uniform vec3 uHigh; uniform float uGlow; uniform float uTime; uniform float uOn;
varying vec3 vLocal;

float aHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float aNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(aHash(i), aHash(i + vec2(1, 0)), f.x), mix(aHash(i + vec2(0, 1)), aHash(i + vec2(1, 1)), f.x), f.y);
}
// noise round the oval, without a seam (on a circle)
float ring(float phi, float size, float shift) {
  return aNoise(vec2(cos(phi), sin(phi)) * size + vec2(shift, shift * 0.7));
}

vec2 hitSphere(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float h = b * b - (dot(o, o) - r * r);
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  if (uOn < 0.01) discard;
  vec3 o = uCam;
  vec3 d = normalize(vLocal - uCam);
  float camR = length(o);
  if (camR < uShell ? gl_FrontFacing : !gl_FrontFacing) discard;
  float top = 1.0 + uTop;
  float bottom = 1.0 + uBase * 0.9;
  vec2 ts = hitSphere(o, d, top);
  if (ts.y <= 0.0 || ts.x > 1e8) discard;
  float t0 = max(ts.x, 0.0);
  float t1 = ts.y;
  // the planet hides what is behind it
  vec2 tg = hitSphere(o, d, 1.0);
  if (tg.x > 0.0 && tg.x < 1e8) t1 = min(t1, tg.x);
  if (t1 <= t0) discard;

  // midnight, as seen from the pole: away from the Sun
  vec3 mid = -(uSun - uAxis * dot(uSun, uAxis));
  mid = length(mid) > 1e-4 ? normalize(mid) : normalize(cross(uAxis, vec3(0.0, 0.0, 1.0)));
  vec3 dusk = cross(uAxis, mid);
  float w = uWidth * 0.0174533;

  vec3 color = vec3(0.0);
  float t = t0 + aHash(gl_FragCoord.xy) * w * 0.3;
  for (int i = 0; i < 110; i++) {
    if (t >= t1) break;
    vec3 p = o + d * t;
    float r = length(p);
    vec3 n = p / r;
    float cm = dot(n, uAxis);
    float theta = acos(clamp(abs(cm), 0.0, 1.0));
    float phi = atan(dot(n, dusk), dot(n, mid));
    float oval = mix(uNight, uDay, 0.5 - 0.5 * cos(phi)) * 0.0174533;
    // three curtains, folding and drifting
    float nearest = 10.0;
    float glow = 0.0;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float sheet = oval + (fk - 1.0) * 1.3 * 0.0174533
        + (ring(phi, 5.0 + fk * 2.0, uTime * 0.02 + fk * 7.0 + (cm < 0.0 ? 3.0 : 0.0)) - 0.5) * 2.4 * 0.0174533
        + (ring(phi, 40.0 + fk * 9.0, uTime * 0.06 + fk * 3.0) - 0.5) * 0.35 * 0.0174533;
      float off = abs(theta - sheet);
      nearest = min(nearest, off);
      float strength = (k == 1 ? 1.0 : 0.55) * smoothstep(0.25, 0.75, ring(phi, 3.0 + fk, uTime * 0.01 + fk * 11.0));
      // vertical rays, flickering
      float rays = 0.3 + 0.7 * pow(ring(phi, 520.0 + fk * 60.0, uTime * 0.4 + fk), 3.0);
      glow += exp(-off * off / (w * w)) * strength * rays;
    }
    float h = r - 1.0;
    float f = (h - uBase) / (uTop - uBase);
    float stride = clamp(max(nearest - w * 2.5, 0.0) * r * 0.8, w * r * 0.35, 0.08);
    if (f > -0.03 && f < 1.0 && glow > 0.002) {
      // a sharp lower edge; fading upwards
      float profile = smoothstep(-0.03, 0.02, f) * exp(-max(f, 0.0) * 3.2);
      vec3 tint = mix(mix(uLow, uMid, smoothstep(-0.01, 0.05, f)), uHigh, smoothstep(0.22, 0.5, f));
      // on the night side; daylight drowns it
      float dark = 1.0 - smoothstep(-0.18, 0.08, dot(n, uSun));
      // (per crossing of a curtain, the same brightness on any planet)
      color += tint * glow * profile * dark * stride / (w * r) * 0.35;
    }
    t += stride;
  }
  color *= uGlow * uOn;
  if (dot(color, vec3(1.0)) < 0.0005) discard;
  gl_FragColor = vec4(color, 1.0);
}`

const _inverse = new THREE.Matrix4()
const _centre = new THREE.Vector3()

export default function Aurora({ look, sun, near }: { look: AuroraLook; sun: THREE.Vector3; near?: { value: number } }) {
  const shell = 1 + (look.topKm / look.radiusKm) * 1.1
  const material = useMemo(() => {
    const lat = (look.poleLat * Math.PI) / 180
    const u = (look.poleLon + 180) / 360
    // on the map: u along longitude, three.js's sphere layout
    const axis = new THREE.Vector3(-Math.cos(2 * Math.PI * u) * Math.cos(lat), Math.sin(lat), Math.sin(2 * Math.PI * u) * Math.cos(lat))
    return new THREE.ShaderMaterial({
      uniforms: {
        uCam: { value: new THREE.Vector3() },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
        uAxis: { value: axis.normalize() },
        uNight: { value: look.night },
        uDay: { value: look.day },
        uWidth: { value: look.width },
        uBase: { value: look.baseKm / look.radiusKm },
        uTop: { value: look.topKm / look.radiusKm },
        uShell: { value: shell },
        uLow: { value: new THREE.Color(look.low) },
        uMid: { value: new THREE.Color(look.mid) },
        uHigh: { value: new THREE.Color(look.high) },
        uGlow: { value: look.glow },
        uTime: { value: 0 },
        uOn: { value: 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  }, [look, shell])
  useEffect(() => () => material.dispose(), [material])
  const mesh = useRef<THREE.Mesh>(null)

  useFrame((state, delta) => {
    const shellMesh = mesh.current
    const body = shellMesh?.parent
    if (!shellMesh || !body) return
    body.updateWorldMatrix(true, false)
    body.getWorldPosition(_centre)
    const e = body.matrixWorld.elements
    const radius = Math.hypot(e[0], e[1], e[2])
    // up close only: from afar the curtains are far thinner than a pixel
    const away = state.camera.position.distanceTo(_centre) / radius
    const on = 1 - THREE.MathUtils.smoothstep(away, 4, 8)
    const u = material.uniforms
    u.uOn.value = on
    if (near) near.value = on
    shellMesh.visible = on > 0.01
    if (!shellMesh.visible) return
    _inverse.copy(body.matrixWorld).invert()
    u.uCam.value.copy(state.camera.position).applyMatrix4(_inverse)
    u.uSun.value.copy(sun).applyMatrix4(_inverse).normalize()
    u.uTime.value += delta
  })

  return (
    <mesh ref={mesh} scale={shell} material={material} frustumCulled={false} renderOrder={2}>
      <sphereGeometry args={[1, 96, 64]} />
    </mesh>
  )
}
