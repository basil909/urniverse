'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { SYSTEM_OFFSET } from './orbit'
import { pilot } from './pilotState'
import { PC_UNITS } from './spaceBodies'

/* ============================================================
   THE STARS IN 3D
   From the Sun the sky is the Bright Star Catalogue's, on a sphere at
   infinity. Leave the Solar System and the nearer stars must move
   against the farther ones, so the sky is handed over (about 2,000 AU
   out, where the two still match) to this: every naked-eye star and
   every star within 25 parsecs (11,398, HYG database) at its true place.
   Each frame, for where you are, each star's direction and brightness
   are worked out on the GPU: its apparent magnitude from its absolute
   magnitude and its distance. The Sun is among them, so looking back
   from Alpha Centauri it is a bright yellow star in Cassiopeia.
============================================================ */

const VERTEX = /* glsl */ `
attribute float aAbsMag;
attribute float aColorIndex;
uniform vec3 uCameraPc;
uniform float uReach;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vBright;

vec3 starColour(float bv) {
  // blue-white to white to yellow to orange-red, by B-V
  vec3 hot = vec3(0.66, 0.78, 1.0);
  vec3 white = vec3(1.0, 0.97, 0.93);
  vec3 yellow = vec3(1.0, 0.86, 0.62);
  vec3 red = vec3(1.0, 0.62, 0.38);
  if (bv < 0.3) return mix(hot, white, smoothstep(-0.3, 0.3, bv));
  if (bv < 0.9) return mix(white, yellow, smoothstep(0.3, 0.9, bv));
  return mix(yellow, red, smoothstep(0.9, 1.8, bv));
}

void main() {
  vec3 rel = position - uCameraPc;
  float dist = max(length(rel), 1e-7);
  vec3 dir = rel / dist;
  // apparent magnitude from here (distance in parsecs)
  float m = aAbsMag + 5.0 * (log(dist) / log(10.0)) - 5.0;
  float flux = pow(10.0, -0.4 * (m - 1.5));
  vBright = clamp(flux, 0.0, 4.0);
  vColor = starColour(aColorIndex);
  gl_PointSize = clamp(1.4 + 2.4 * log(1.0 + flux * 3.0), 1.0, 9.0) * uPixelRatio;
  if (flux < 0.004) gl_PointSize = 0.0;
  vec4 mv = viewMatrix * vec4(cameraPosition + dir * uReach, 1.0);
  gl_Position = projectionMatrix * mv;
}`

const FRAGMENT = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vBright;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = exp(-d * d * 6.0);
  float a = core * clamp(vBright * 1.4 + 0.18, 0.0, 1.6) * uOpacity;
  gl_FragColor = vec4(vColor * a, 1.0);
}`

/* the sky hand-over: 0 at the Sun, 1 out among the stars */
export const skyHandOver = { value: 0 }
const _cameraPc = new THREE.Vector3()

export default function NearStars() {
  const gl = useThree((state) => state.gl)
  const points = useRef<THREE.Points>(null)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uCameraPc: { value: new THREE.Vector3() },
          uReach: { value: 1500 },
          uPixelRatio: { value: 1 },
          uOpacity: { value: 0 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )
  const geometry = useMemo(() => new THREE.BufferGeometry(), [])
  useEffect(() => {
    let cancelled = false
    fetch('/data/stars-3d.bin')
      .then((response) => response.arrayBuffer())
      .then((buffer) => {
        if (cancelled) return
        const data = new Float32Array(buffer)
        const count = data.length / 5 + 1
        const position = new Float32Array(count * 3)
        const absMag = new Float32Array(count)
        const colour = new Float32Array(count)
        // the Sun first: at the origin, absolute magnitude 4.83
        absMag[0] = 4.83
        colour[0] = 0.65
        for (let i = 1; i < count; i += 1) {
          const j = (i - 1) * 5
          position.set([data[j], data[j + 1], data[j + 2]], i * 3)
          absMag[i] = data[j + 3]
          colour[i] = data[j + 4]
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
        geometry.setAttribute('aAbsMag', new THREE.BufferAttribute(absMag, 1))
        geometry.setAttribute('aColorIndex', new THREE.BufferAttribute(colour, 1))
      })
      .catch(() => {})
    return () => {
      cancelled = true
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useFrame((state) => {
    // where the camera is, in parsecs from the Sun
    _cameraPc.copy(state.camera.position).sub(SYSTEM_OFFSET).divideScalar(PC_UNITS)
    material.uniforms.uCameraPc.value.copy(_cameraPc)
    material.uniforms.uPixelRatio.value = gl.getPixelRatio()
    const away = pilot.active ? _cameraPc.length() : 0
    skyHandOver.value = away > 0.0097 ? 1 : 0
    material.uniforms.uOpacity.value = skyHandOver.value
    if (points.current) points.current.visible = skyHandOver.value > 0
  })

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} visible={false} renderOrder={-2} />
}
