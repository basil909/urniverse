'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { lens } from './lens'
import { NAMED_STAR_DIRECTIONS, skyDirection } from './NightSky'

/* ============================================================
   THE REAL STARS
   Every star in the Yale Bright Star Catalogue (5th revised edition):
   the ~9,100 stars visible to the naked eye, at their true J2000
   positions, brightness (V magnitude) and colour (spectral class).
   Packed by scripts into /data/stars.bin: four float32 per star (RA and
   Dec in radians, V magnitude, spectral class 0-6 for O-M plus subclass
   / 10), brightest first. The brightest named stars (with spikes and
   names) are drawn by NightSky, so they are skipped here.
============================================================ */

const SKY_RADIUS = 850
const STAR_FILE = '/data/stars.bin'

/* spectral class (O B A F G K M = 0..6) -> colour */
const CLASS_COLORS: [number, number, number][] = [
  [0.6, 0.7, 1.0], // O
  [0.68, 0.78, 1.0], // B
  [0.86, 0.9, 1.0], // A
  [1.0, 0.98, 0.94], // F
  [1.0, 0.92, 0.78], // G
  [1.0, 0.8, 0.58], // K
  [1.0, 0.66, 0.44], // M
]

function classColor(value: number): [number, number, number] {
  const i = Math.min(5, Math.max(0, Math.floor(value)))
  const t = Math.min(1, Math.max(0, value - i))
  const a = CLASS_COLORS[i]
  const b = CLASS_COLORS[i + 1]
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

const VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aBright;
uniform float uPixelRatio;
uniform float uSoften;
varying vec3 vColor;
varying float vBright;
void main() {
  vColor = aColor;
  vBright = aBright;
  // close-ups: background stars slightly out of focus (larger, softer)
  gl_PointSize = aSize * uPixelRatio * (1.0 + uSoften * 0.9);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  p.z = p.w * 0.99999; // on the far sky, behind everything
  gl_Position = p;
}`

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uSoften;
varying vec3 vColor;
varying float vBright;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = pow(1.0 - smoothstep(0.0, 0.5, d), mix(1.4, 0.9, uSoften)) * mix(1.0, 0.45, uSoften);
  // the faintest shimmer, varying across the sky
  float twinkle = 1.0 + sin(uTime * 1.6 + gl_FragCoord.x * 0.017 + gl_FragCoord.y * 0.023) * 0.05;
  gl_FragColor = vec4(vColor * vBright * twinkle * a, 1.0);
}`

export default function Starfield() {
  const group = useRef<THREE.Group>(null)
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)

  useEffect(() => {
    let cancelled = false
    let built: THREE.BufferGeometry | null = null
    fetch(STAR_FILE)
      .then((response) => response.arrayBuffer())
      .then((buffer) => {
        if (cancelled) return
        const data = new Float32Array(buffer)
        const count = data.length / 4
        const position: number[] = []
        const size: number[] = []
        const color: number[] = []
        const bright: number[] = []
        const direction = new THREE.Vector3()
        for (let i = 0; i < count; i += 1) {
          const ra = data[i * 4]
          const dec = data[i * 4 + 1]
          const mag = data[i * 4 + 2]
          const cls = data[i * 4 + 3]
          skyDirection((ra * 12) / Math.PI, (dec * 180) / Math.PI, direction)
          // the brightest named stars are drawn by NightSky
          if (mag < 3.5 && NAMED_STAR_DIRECTIONS.some((named) => named.dot(direction) > 0.99999)) continue
          position.push(direction.x * SKY_RADIUS, direction.y * SKY_RADIUS, direction.z * SKY_RADIUS)
          size.push(THREE.MathUtils.clamp(4.4 - 0.6 * (mag + 1), 1.1, 4.4))
          color.push(...classColor(cls))
          bright.push(THREE.MathUtils.clamp(Math.pow(10, -0.28 * (mag - 1)), 0.06, 1.3))
        }
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
        g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1))
        g.setAttribute('aColor', new THREE.Float32BufferAttribute(color, 3))
        g.setAttribute('aBright', new THREE.Float32BufferAttribute(bright, 1))
        built = g
        setGeometry(g)
      })
      .catch(() => {
        /* no stars file: the sky panorama and named stars remain */
      })
    return () => {
      cancelled = true
      built?.dispose()
    }
  }, [])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uPixelRatio: { value: 1 },
          uTime: { value: 0 },
          uSoften: { value: 0 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    if (!group.current) return
    // the stars are infinitely far away: they travel with the camera
    group.current.position.copy(camera.position)
    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uSoften.value = lens.closeUp
    material.uniforms.uPixelRatio.value = gl.getPixelRatio()
  })

  return (
    <group ref={group}>
      {geometry && (
        <points geometry={geometry} material={material} renderOrder={-9} frustumCulled={false} />
      )}
    </group>
  )
}
