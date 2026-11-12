'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { AU_UNITS, farScale, getBodyPosition, getPlanetOrbitPosition, SYSTEM_OFFSET } from './orbit'
import { simClock } from './simClock'
import { pilot } from './pilotState'
import { SHIP_LENGTH } from './flightShip'
import { FIRST_TROJAN_ID, TROJANS } from './spaceBodies'

/* ============================================================
   AMONG THE ASTEROIDS
   The main belt, between Mars and Jupiter (2.1 to 3.3 AU, emptied at the
   Kirkwood gaps, where Jupiter's pull clears them), and Jupiter's two
   Trojan swarms, 60 degrees ahead of it and behind on its orbit. Flying
   through either, rocks from house-sized to a couple of km drift and
   tumble past the ship. They are drawn far denser than they are: in the
   real belt the nearest rock of any size is usually around a million km
   away, and you could cross it seeing nothing. They live in the ship's
   own layer (in ship lengths), in a box round the ship that wraps.
============================================================ */

const ROCKS = 700
const FIELD = 6000 // ship lengths: some 220 km across

/* a lumpy rock: the same direction always gets the same bump */
export function rockGeometry(detail = 3, seed = 1) {
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(1, detail))
  const position = geometry.getAttribute('position')
  const v = new THREE.Vector3()
  const a = seed * 1.7
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i)
    const bump =
      Math.sin(v.x * 2.9 + a) * Math.sin(v.y * 3.3 + 0.4 * a) * Math.sin(v.z * 2.7 + 2.1) * 0.42 +
      Math.sin(v.x * 6.8 + 4.1) * Math.sin(v.y * 7.1 + a) * Math.sin(v.z * 6.3 + 0.2) * 0.16 +
      Math.sin(v.x * 15.1 + a) * Math.sin(v.y * 13.7 + 2.0) * Math.sin(v.z * 14.3 + 1.0) * 0.05
    v.multiplyScalar(1 + bump * 0.45)
    position.setXYZ(i, v.x, v.y, v.z)
  }
  geometry.computeVertexNormals()
  return geometry
}

/* how crowded space is here with asteroids (0..1), and which crowd */
const KIRKWOOD = [
  [2.48, 2.53],
  [2.8, 2.85],
  [2.94, 2.98],
  [3.26, 3.31],
]
const _rel = new THREE.Vector3()
const _jupiter = new THREE.Vector3()
function crowding(rel: THREE.Vector3, jd: number) {
  const r = rel.length() / AU_UNITS
  const lift = Math.abs(rel.y / AU_UNITS) / Math.max(r, 1e-6)
  // the main belt
  let belt =
    THREE.MathUtils.smoothstep(r, 2.05, 2.3) * (1 - THREE.MathUtils.smoothstep(r, 3.15, 3.4)) * (1 - THREE.MathUtils.smoothstep(lift, 0.1, 0.25))
  if (KIRKWOOD.some(([lo, hi]) => r > lo && r < hi)) belt *= 0.15
  // the Trojans: on Jupiter's orbit, 60 degrees either side of it
  getPlanetOrbitPosition(4, jd, _jupiter)
  const along = Math.atan2(-rel.z, rel.x) - Math.atan2(-_jupiter.z, _jupiter.x)
  const angle = Math.atan2(Math.sin(along), Math.cos(along)) * (180 / Math.PI)
  const radial = THREE.MathUtils.smoothstep(r, 4.75, 5.0) * (1 - THREE.MathUtils.smoothstep(r, 5.45, 5.7))
  const tilt = 1 - THREE.MathUtils.smoothstep(lift, 0.2, 0.42)
  const l4 = Math.exp(-(((angle - 60) / 18) ** 2)) * radial * tilt
  const l5 = Math.exp(-(((angle + 60) / 18) ** 2)) * radial * tilt
  const most = Math.max(belt, l4, l5)
  return { amount: most, zone: most < 0.15 ? '' : most === belt ? 'belt' : most === l4 ? 'L4' : 'L5' }
}

export function AsteroidField({ jetRef }: { jetRef: { current: THREE.Object3D | null } }) {
  const parts = useMemo(() => {
    const geometry = rockGeometry(2, 3)
    const material = new THREE.MeshStandardMaterial({ color: '#8a8177', roughness: 0.95, metalness: 0, flatShading: true })
    const seeds = Array.from({ length: ROCKS }, (_, i) => {
      const r = (n: number) => Math.abs(Math.sin((i + 1) * 12.9898 * n + 7.1) * 43758.5453) % 1
      return {
        x: (r(1) - 0.5) * FIELD,
        y: (r(2) - 0.5) * FIELD,
        z: (r(3) - 0.5) * FIELD,
        // many small ones, a few big ones: 10 m to over 2 km
        size: 0.3 + Math.pow(r(4), 6) * 60,
        keep: r(5),
        spin: (r(6) - 0.5) * 0.25,
        tilt: r(7) * Math.PI,
        stretch: new THREE.Vector3(0.7 + r(8) * 0.6, 0.55 + r(9) * 0.5, 0.7 + r(10) * 0.6),
        shade: 0.6 + r(11) * 0.5,
      }
    })
    return { geometry, material, seeds, matrix: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Color() }
  }, [])
  useEffect(
    () => () => {
      parts.geometry.dispose()
      parts.material.dispose()
    },
    [parts],
  )
  const mesh = useRef<THREE.InstancedMesh>(null)
  const colored = useRef(false)

  useFrame((state) => {
    const instances = mesh.current
    const jet = jetRef.current
    if (!instances || !jet) return
    if (!colored.current) {
      parts.seeds.forEach((seed, i) => instances.setColorAt(i, parts.c.setScalar(seed.shade)))
      if (instances.instanceColor) instances.instanceColor.needsUpdate = true
      colored.current = true
    }
    _rel.copy(jet.position).sub(SYSTEM_OFFSET)
    const { amount, zone } = pilot.active && !pilot.warping ? crowding(_rel, simClock.jd) : { amount: 0, zone: '' }
    pilot.zone = zone
    instances.visible = amount > 0.01
    if (!instances.visible) return
    const L = SHIP_LENGTH
    const half = FIELD / 2
    const wrap = (v: number) => ((((v + half) % FIELD) + FIELD) % FIELD) - half
    // the ship's place among the rocks, in ship lengths from the Sun (a
    // fixed frame, so the rocks stand still and the ship flies past)
    const jx = _rel.x / L
    const jy = _rel.y / L
    const jz = _rel.z / L
    const time = state.clock.elapsedTime
    parts.seeds.forEach((seed, i) => {
      const x = wrap(seed.x - jx)
      const y = wrap(seed.y - jy)
      const z = wrap(seed.z - jz)
      // fewer where the crowd thins; shrink away at the edge of the box
      const edge = Math.max(Math.abs(x), Math.abs(y), Math.abs(z))
      const shown = seed.keep < amount ? 1 - THREE.MathUtils.smoothstep(edge, half * 0.75, half) : 0
      parts.e.set(seed.tilt + time * seed.spin, time * seed.spin * 0.7, seed.tilt * 0.5)
      parts.q.setFromEuler(parts.e)
      parts.s.copy(seed.stretch).multiplyScalar(seed.size * shown)
      parts.matrix.compose(parts.p.set(x, y, z), parts.q, parts.s)
      instances.setMatrixAt(i, parts.matrix)
    })
    instances.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[parts.geometry, parts.material, ROCKS]} frustumCulled={false} visible={false} />
}

/* ============================================================
   HEKTOR AND PATROCLUS, at their true sizes and places
   Hektor: two lobes in contact, some 225 km end to end. Patroclus and
   Menoetius: a pair of bodies of about 113 and 104 km, 680 km apart,
   circling their common centre every 4.3 days. Dark (albedo ~0.05),
   lit by the Sun. In the main scene; far, drawn nearer and smaller.
============================================================ */
const TROJAN_VERTEX = /* glsl */ `
varying vec3 vNormalW;
void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const TROJAN_FRAGMENT = /* glsl */ `
uniform vec3 uSun; uniform vec3 uTint;
varying vec3 vNormalW;
void main() {
  float light = max(dot(normalize(vNormalW), uSun), 0.0);
  gl_FragColor = vec4(uTint * (light * 1.7 + 0.015), 1.0);
}`

const _pos = new THREE.Vector3()
const _sun = new THREE.Vector3()

export function TrojanBodies() {
  const parts = useMemo(() => {
    // one each: they stand 120 degrees apart round the Sun, lit from different sides
    const materials = TROJANS.map(
      () =>
        new THREE.ShaderMaterial({
          uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) }, uTint: { value: new THREE.Color('#6f6257') } },
          vertexShader: TROJAN_VERTEX,
          fragmentShader: TROJAN_FRAGMENT,
        }),
    )
    return { materials, lobeA: rockGeometry(4, 5), lobeB: rockGeometry(4, 9) }
  }, [])
  useEffect(
    () => () => {
      parts.materials.forEach((material) => material.dispose())
      parts.lobeA.dispose()
      parts.lobeB.dispose()
    },
    [parts],
  )
  const groups = useRef<(THREE.Group | null)[]>([])
  const pair = useRef<THREE.Group>(null)

  useFrame((state) => {
    const camera = state.camera
    TROJANS.forEach((_, i) => {
      const g = groups.current[i]
      if (!g) return
      g.visible = pilot.active
      if (!pilot.active) return
      getBodyPosition(FIRST_TROJAN_ID + i, simClock.jd, _pos)
      const distance = _pos.distanceTo(camera.position)
      const far = farScale(distance)
      g.position.copy(_pos).sub(camera.position).multiplyScalar(far).add(camera.position)
      // sizes in km -> scene units, as the bodies' radius is registered
      g.scale.setScalar(far / (6371 / 0.23))
      parts.materials[i].uniforms.uSun.value.copy(_sun.copy(SYSTEM_OFFSET).sub(_pos).normalize())
    })
    // Patroclus and Menoetius round each other every 4.3 days
    if (pair.current) pair.current.rotation.y = ((simClock.bodyJd % 4.283) / 4.283) * Math.PI * 2
  })

  return (
    <>
      {/* Hektor: two lobes in contact (in km) */}
      <group ref={(g) => void (groups.current[0] = g)} visible={false}>
        <mesh geometry={parts.lobeA} material={parts.materials[0]} position={[-52, 0, 0]} scale={[66, 52, 56]} />
        <mesh geometry={parts.lobeB} material={parts.materials[0]} position={[50, 4, 0]} scale={[60, 48, 50]} />
      </group>
      {/* Patroclus and Menoetius (in km), circling each other */}
      <group ref={(g) => void (groups.current[1] = g)} visible={false}>
        <group ref={pair}>
          <mesh geometry={parts.lobeA} material={parts.materials[1]} position={[-326, 0, 0]} scale={[57, 54, 55]} />
          <mesh geometry={parts.lobeB} material={parts.materials[1]} position={[354, 0, 0]} scale={[52, 50, 51]} />
        </group>
      </group>
    </>
  )
}
