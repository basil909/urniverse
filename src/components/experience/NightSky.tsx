'use client'

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

/* The real night sky: the brightest stars at their true positions
   (J2000 right ascension and declination) and colours (from their B-V
   colour index), on the same sky as the Milky Way panorama. Constellation
   lines and a few names fade in only in the opening, wide view. */

type Star = [name: string, raHours: number, decDeg: number, mag: number, bv: number]

const STARS: Star[] = [
  ['Sirius', 6.7525, -16.716, -1.46, 0.0],
  ['Canopus', 6.3992, -52.696, -0.74, 0.15],
  ['Arcturus', 14.261, 19.182, -0.05, 1.23],
  ['Vega', 18.6156, 38.784, 0.03, 0.0],
  ['Capella', 5.2782, 45.998, 0.08, 0.8],
  ['Rigel', 5.2423, -8.202, 0.13, -0.03],
  ['Procyon', 7.655, 5.225, 0.34, 0.42],
  ['Achernar', 1.6286, -57.237, 0.46, -0.16],
  ['Betelgeuse', 5.9195, 7.407, 0.5, 1.85],
  ['Hadar', 14.0637, -60.373, 0.61, -0.23],
  ['Altair', 19.8464, 8.868, 0.76, 0.22],
  ['Acrux', 12.4433, -63.099, 0.77, -0.24],
  ['Aldebaran', 4.5987, 16.509, 0.85, 1.54],
  ['Antares', 16.4901, -26.432, 0.96, 1.83],
  ['Spica', 13.4199, -11.161, 0.97, -0.23],
  ['Pollux', 7.7553, 28.026, 1.14, 1.0],
  ['Fomalhaut', 22.9608, -29.622, 1.16, 0.09],
  ['Deneb', 20.6905, 45.28, 1.25, 0.09],
  ['Mimosa', 12.7954, -59.689, 1.25, -0.23],
  ['Regulus', 10.1395, 11.967, 1.4, -0.11],
  ['Adhara', 6.9771, -28.972, 1.5, -0.21],
  ['Castor', 7.5767, 31.888, 1.58, 0.03],
  ['Gacrux', 12.5194, -57.113, 1.63, 1.59],
  ['Shaula', 17.5601, -37.104, 1.62, -0.22],
  ['Bellatrix', 5.4189, 6.35, 1.64, -0.22],
  ['Elnath', 5.4382, 28.608, 1.65, -0.13],
  ['Alnilam', 5.6036, -1.202, 1.69, -0.18],
  ['Alnitak', 5.6793, -1.943, 1.74, -0.21],
  ['Alioth', 12.9005, 55.96, 1.76, -0.02],
  ['Dubhe', 11.0621, 61.751, 1.79, 1.07],
  ['Mirfak', 3.4054, 49.861, 1.79, 0.48],
  ['Wezen', 7.1399, -26.393, 1.83, 0.68],
  ['Sargas', 17.6219, -42.998, 1.86, 0.4],
  ['Alkaid', 13.7923, 49.313, 1.85, -0.1],
  ['Menkalinan', 5.9921, 44.948, 1.9, 0.08],
  ['Polaris', 2.5303, 89.264, 1.98, 0.6],
  ['Mirzam', 6.3783, -17.956, 1.98, -0.23],
  ['Alphard', 9.4598, -8.659, 1.98, 1.44],
  ['Saiph', 5.7959, -9.67, 2.06, -0.17],
  ['Algieba', 10.3329, 19.842, 2.08, 1.15],
  ['Denebola', 11.8177, 14.572, 2.14, 0.09],
  ['Mintaka', 5.5334, -0.299, 2.23, -0.22],
  ['Mizar', 13.3988, 54.925, 2.23, 0.02],
  ['Sadr', 20.3705, 40.257, 2.23, 0.67],
  ['Schedar', 0.6751, 56.537, 2.24, 1.17],
  ['Caph', 0.153, 59.15, 2.28, 0.34],
  ['Dschubba', 16.0056, -22.622, 2.29, -0.12],
  ['Larawag', 16.8361, -34.293, 2.29, 1.15],
  ['Merak', 11.0307, 56.382, 2.37, -0.02],
  ['Kappa Sco', 17.7081, -39.03, 2.41, -0.17],
  ['Phecda', 11.8972, 53.695, 2.44, 0.0],
  ['Gamma Cas', 0.9451, 60.717, 2.47, -0.15],
  ['Aljanah', 20.7702, 33.97, 2.48, 1.03],
  ['Zosma', 11.2351, 20.524, 2.56, 0.12],
  ['Acrab', 16.0906, -19.806, 2.62, -0.07],
  ['Ruchbah', 1.4303, 60.235, 2.68, 0.13],
  ['Delta Cru', 12.2524, -58.749, 2.79, -0.19],
  ['Fawaris', 19.7496, 45.131, 2.87, -0.03],
  ['Albireo', 19.512, 27.96, 3.05, 1.13],
  ['Megrez', 12.2571, 57.033, 3.31, 0.08],
  ['Segin', 1.9066, 63.67, 3.38, -0.15],
]

const LINES: [string, string][] = [
  // Orion
  ['Betelgeuse', 'Bellatrix'], ['Betelgeuse', 'Alnitak'], ['Bellatrix', 'Mintaka'],
  ['Mintaka', 'Alnilam'], ['Alnilam', 'Alnitak'], ['Alnitak', 'Saiph'], ['Mintaka', 'Rigel'],
  // the Big Dipper
  ['Dubhe', 'Merak'], ['Merak', 'Phecda'], ['Phecda', 'Megrez'], ['Megrez', 'Dubhe'],
  ['Megrez', 'Alioth'], ['Alioth', 'Mizar'], ['Mizar', 'Alkaid'],
  // Cassiopeia
  ['Caph', 'Schedar'], ['Schedar', 'Gamma Cas'], ['Gamma Cas', 'Ruchbah'], ['Ruchbah', 'Segin'],
  // the Southern Cross
  ['Acrux', 'Gacrux'], ['Mimosa', 'Delta Cru'],
  // Cygnus, the Northern Cross
  ['Deneb', 'Sadr'], ['Sadr', 'Albireo'], ['Sadr', 'Aljanah'], ['Sadr', 'Fawaris'],
  // Scorpius
  ['Acrab', 'Dschubba'], ['Dschubba', 'Antares'], ['Antares', 'Larawag'],
  ['Larawag', 'Sargas'], ['Sargas', 'Kappa Sco'], ['Kappa Sco', 'Shaula'],
  // Leo
  ['Regulus', 'Algieba'], ['Algieba', 'Zosma'], ['Zosma', 'Denebola'], ['Denebola', 'Regulus'],
  // Canis Major
  ['Sirius', 'Mirzam'], ['Sirius', 'Adhara'], ['Adhara', 'Wezen'], ['Sirius', 'Wezen'],
]

/* a few names, for the brightest and best known */
const NAMED = ['Sirius', 'Canopus', 'Arcturus', 'Vega', 'Betelgeuse', 'Rigel', 'Antares', 'Polaris', 'Deneb', 'Aldebaran']

const SKY_RADIUS = 860
const EPS = 0.4090928 // obliquity of the ecliptic (J2000)

/* equatorial (RA, Dec) -> the scene's sky direction (ecliptic frame,
   with ecliptic x -> X, ecliptic north -> Y, ecliptic y -> -Z) */
function skyDirection(raHours: number, decDeg: number, out: THREE.Vector3) {
  const ra = (raHours * 15 * Math.PI) / 180
  const dec = (decDeg * Math.PI) / 180
  const x = Math.cos(dec) * Math.cos(ra)
  const y = Math.cos(dec) * Math.sin(ra)
  const z = Math.sin(dec)
  const eclY = y * Math.cos(EPS) + z * Math.sin(EPS)
  const eclZ = -y * Math.sin(EPS) + z * Math.cos(EPS)
  return out.set(x, eclZ, -eclY)
}

/* B-V colour index -> an approximate star colour */
function starColor(bv: number) {
  const stops: [number, [number, number, number]][] = [
    [-0.3, [0.62, 0.72, 1.0]],
    [0.0, [0.84, 0.88, 1.0]],
    [0.6, [1.0, 0.96, 0.86]],
    [1.0, [1.0, 0.84, 0.62]],
    [1.5, [1.0, 0.7, 0.44]],
    [1.9, [1.0, 0.58, 0.34]],
  ]
  for (let i = 1; i < stops.length; i += 1) {
    if (bv <= stops[i][0]) {
      const [b0, c0] = stops[i - 1]
      const [b1, c1] = stops[i]
      const t = THREE.MathUtils.clamp((bv - b0) / (b1 - b0), 0, 1)
      return c0.map((v, k) => v + (c1[k] - v) * t) as [number, number, number]
    }
  }
  return stops[stops.length - 1][1]
}

const STAR_VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aBright;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vBright;
void main() {
  vColor = aColor;
  vBright = aBright;
  gl_PointSize = aSize * uPixelRatio;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  p.z = p.w * 0.99999; // on the far sky, behind everything
  gl_Position = p;
}`

const STAR_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vBright;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float core = exp(-d * d * 60.0);
  float halo = exp(-d * 9.0) * 0.35;
  gl_FragColor = vec4(vColor * (core + halo) * vBright, 1.0);
}`

const LINE_VERTEX = /* glsl */ `
void main() {
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  p.z = p.w * 0.99999;
  gl_Position = p;
}`

const LINE_FRAGMENT = /* glsl */ `
uniform float uOpacity;
void main() {
  gl_FragColor = vec4(vec3(0.62, 0.72, 0.95) * uOpacity, 1.0);
}`

export default function NightSky({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const linesOn = useRef(0)
  const labels = useRef<(HTMLDivElement | null)[]>([])
  const [showNames, setShowNames] = useState(false)

  const positions = useMemo(() => {
    const map = new Map<string, THREE.Vector3>()
    STARS.forEach(([name, ra, dec]) => {
      map.set(name, skyDirection(ra, dec, new THREE.Vector3()).multiplyScalar(SKY_RADIUS))
    })
    return map
  }, [])

  const starGeometry = useMemo(() => {
    const pos = new Float32Array(STARS.length * 3)
    const size = new Float32Array(STARS.length)
    const color = new Float32Array(STARS.length * 3)
    const bright = new Float32Array(STARS.length)
    STARS.forEach(([name, , , mag, bv], i) => {
      const p = positions.get(name)!
      pos.set([p.x, p.y, p.z], i * 3)
      size[i] = THREE.MathUtils.clamp(9 - 1.9 * (mag + 1.46), 3, 9)
      color.set(starColor(bv), i * 3)
      bright[i] = THREE.MathUtils.clamp(Math.pow(10, -0.4 * mag) * 0.9, 0.25, 1.6)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    g.setAttribute('aBright', new THREE.BufferAttribute(bright, 1))
    return g
  }, [positions])

  const lineGeometry = useMemo(() => {
    const pos = new Float32Array(LINES.length * 6)
    LINES.forEach(([a, b], i) => {
      const pa = positions.get(a)!
      const pb = positions.get(b)!
      // stop short of each star, so the lines never touch the points
      const from = pa.clone().lerp(pb, 0.08)
      const to = pa.clone().lerp(pb, 0.92)
      pos.set([from.x, from.y, from.z, to.x, to.y, to.z], i * 6)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [positions])

  const starMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uPixelRatio: { value: 1 } },
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  )
  const lineMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uOpacity: { value: 0 } },
        vertexShader: LINE_VERTEX,
        fragmentShader: LINE_FRAGMENT,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  )

  useEffect(
    () => () => {
      starGeometry.dispose()
      lineGeometry.dispose()
      starMaterial.dispose()
      lineMaterial.dispose()
    },
    [starGeometry, lineGeometry, starMaterial, lineMaterial],
  )

  useFrame((_, delta) => {
    if (!group.current) return
    // the sky is infinitely far: it travels with the camera
    group.current.position.copy(camera.position)
    starMaterial.uniforms.uPixelRatio.value = gl.getPixelRatio()

    // constellations only in the opening, wide view (and the return)
    const progress = progressRef.current ?? 0
    const chapter = Math.floor(progress)
    const wide = chapter === 0 || chapter === 12
    linesOn.current += ((wide ? 1 : 0) - linesOn.current) * (1 - Math.exp(-delta * 1.5))
    lineMaterial.uniforms.uOpacity.value = linesOn.current * 0.16
    const names = linesOn.current > 0.05
    if (names !== showNames) setShowNames(names)
    const opacity = (linesOn.current * 0.55).toFixed(3)
    labels.current.forEach((label) => {
      if (label) label.style.opacity = opacity
    })
  })

  return (
    <group ref={group}>
      <lineSegments geometry={lineGeometry} material={lineMaterial} renderOrder={-9} frustumCulled={false} />
      <points geometry={starGeometry} material={starMaterial} renderOrder={-9} frustumCulled={false} />
      {showNames &&
        NAMED.map((name, i) => {
          const p = positions.get(name)!
          return (
            <Html key={name} position={[p.x, p.y, p.z]} zIndexRange={[2, 0]} style={{ pointerEvents: 'none' }}>
              <div
                ref={(element) => {
                  labels.current[i] = element
                }}
                className="star-name"
                style={{ opacity: 0 }}
              >
                {name}
              </div>
            </Html>
          )
        })}
    </group>
  )
}
