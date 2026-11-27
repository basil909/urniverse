'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { pilot } from './pilotState'
import { ground } from './groundState'
import { KM_PER_UNIT, SHIP_LENGTH } from './flightShip'
import { shipCamera } from './shipLayer'
import { surfaceEvents } from './flightWalk'
import { SURFACES, type Surface } from '../ui/landingSite'

/* ============================================================
   THE GROUND UP CLOSE
   Low over a world, and standing on it, the near ground gets what the
   terrain is too coarse to show, drawn in the ship's own layer (true
   size, metres):
   - rocks: boulders out to 300 m, pebbles at your feet, scattered the
     same way every time over a world (each cell of ground its own);
     Titan's are rounded, as Huygens found them;
   - dust: thrown up at touchdown, off the wheels on the roll-out, by the
     engines on the take-off roll and by your boots. With no air it
     flies in clean arcs and falls straight back; in air it billows and
     hangs;
   - footprints, where you walk;
   - a flag, if you plant one: on an airless world held out by a rod
     along its top, as Apollo's were; in air, flying.
   All of it is kept about an anchor point in the world's own frame (so
   it turns with the world), in metres: small numbers, precise enough.
============================================================ */

const SHIP_M = 37.24
const MAX_DUST = 900
const MAX_PRINTS = 400
const BOULDER_CELL = 12
const BOULDER_REACH = 300
const PEBBLE_CELL = 3
const PEBBLE_REACH = 36
const MAX_BOULDERS = 1400
const MAX_PEBBLES = 1800

function hash(a: number, b: number, c: number) {
  let h = Math.imul(a | 0, 0x8da6b343) ^ Math.imul(b | 0, 0xd8163841) ^ Math.imul(c | 0, 0xcb1ab31f)
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/* a rock: an icosahedron, dented (or smoothed, for river-worn), with a
   flat base sitting at y = 0 */
function rockGeometry(rounded: number) {
  const smooth = rounded > 0.6
  let geometry: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, smooth ? 2 : 1)
  const position = geometry.getAttribute('position')
  const v = new THREE.Vector3()
  const dent = smooth ? 0.07 : 0.3
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i)
    const n = hash(Math.round(v.x * 97), Math.round(v.y * 97), Math.round(v.z * 97))
    v.multiplyScalar(1 - dent * 0.5 + dent * n)
    v.y = Math.max(v.y, -0.3)
    position.setXYZ(i, v.x, v.y, v.z)
  }
  if (smooth) geometry = mergeVertices(geometry)
  geometry.translate(0, 0.3, 0)
  geometry.scale(1, smooth ? 0.6 : 0.72, 1)
  geometry.computeVertexNormals()
  return geometry
}

/* rocks shrink away to nothing towards the edge of their reach */
function fadingMaterial(fade: { value: THREE.Vector2 }, flat: boolean) {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.96, metalness: 0, flatShading: flat })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFade = fade
    shader.vertexShader = `uniform vec2 uFade;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec4 at = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        transformed *= 1.0 - smoothstep(uFade.x, uFade.y, length(at.xyz) * ${SHIP_M.toFixed(2)});
      }`,
    )
  }
  return material
}

const DUST_VERTEX = /* glsl */ `
attribute float aSize; attribute float aAlpha;
uniform float uScale;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp((aSize / ${SHIP_M.toFixed(2)}) * uScale / max(-mv.z, 1e-4), 0.0, 320.0);
  vAlpha = aAlpha;
}`
const DUST_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c) * 4.0;
  if (r > 1.0) discard;
  float a = (1.0 - r);
  gl_FragColor = vec4(uColor, a * a * vAlpha);
}`

/* the flag: no country's, the night sky's: a world and its orbit */
function flagTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 384
  canvas.height = 240
  const c = canvas.getContext('2d')!
  c.fillStyle = '#17233f'
  c.fillRect(0, 0, 384, 240)
  for (let i = 0; i < 40; i += 1) {
    c.fillStyle = `rgba(255,255,255,${0.25 + hash(i, 1, 2) * 0.6})`
    c.fillRect(hash(i, 3, 4) * 384, hash(i, 5, 6) * 240, 1.6, 1.6)
  }
  c.strokeStyle = 'rgba(255,255,255,0.9)'
  c.lineWidth = 5
  c.beginPath()
  c.ellipse(192, 120, 112, 34, -0.35, 0, Math.PI * 2)
  c.stroke()
  c.fillStyle = '#f2efe6'
  c.beginPath()
  c.arc(192, 120, 44, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#17233f'
  c.beginPath()
  c.ellipse(192, 120, 112, 34, -0.35, Math.PI * 0.98, Math.PI * 2.02)
  c.lineTo(192, 120)
  c.closePath()
  c.strokeStyle = 'rgba(255,255,255,0.9)'
  c.beginPath()
  c.ellipse(192, 120, 112, 34, -0.35, Math.PI * 1.08, Math.PI * 1.92)
  c.stroke()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

type Grain = { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; floor: number }

const _anchorWorld = new THREE.Vector3()
const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _bodyQuatInv = new THREE.Quaternion()
const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _m = new THREE.Matrix4()
const _align = new THREE.Quaternion()
const _spin = new THREE.Quaternion()
const _yAxis = new THREE.Vector3(0, 1, 0)
const _scale = new THREE.Vector3()
const _color = new THREE.Color()
const _fwd = new THREE.Vector3()
const _size = new THREE.Vector2()
const _tint = new THREE.Color()
const _x = new THREE.Vector3()
const _z = new THREE.Vector3()
const _basis = new THREE.Matrix4()

/* a turn that stands things up on the ground (y along `up`) with their
   z axis along `along` (flattened onto the ground) */
function standing(up: THREE.Vector3, along: THREE.Vector3, out: THREE.Quaternion) {
  _z.copy(along).addScaledVector(up, -along.dot(up))
  if (_z.lengthSq() < 1e-12) _z.set(1, 0, 0).cross(up)
  _z.normalize()
  _x.copy(up).cross(_z)
  _basis.makeBasis(_x, up, _z)
  return out.setFromRotationMatrix(_basis)
}

/* main gear (left, right), the nose gear, and behind the engines, in the
   ship's own frame (one unit long, wheels on the ground at -0.195) */
const GEAR_POINTS = [new THREE.Vector3(-0.093, -0.195, 0.21), new THREE.Vector3(0.093, -0.195, 0.21)]
const ENGINE_POINT = new THREE.Vector3(0, -0.19, 0.62)

export default function SurfaceLife({ jetRef }: { jetRef: { current: THREE.Object3D | null } }) {
  const gl = useThree((state) => state.gl)
  const site = useRef<THREE.Group>(null)
  const boulders = useRef<THREE.InstancedMesh>(null)
  const pebbles = useRef<THREE.InstancedMesh>(null)
  const prints = useRef<THREE.InstancedMesh>(null)
  const flag = useRef<THREE.Group>(null)
  const pole = useRef<THREE.Mesh>(null)
  const cloth = useRef<THREE.Mesh>(null)
  const rod = useRef<THREE.Mesh>(null)

  const parts = useMemo(() => {
    const boulderFade = { value: new THREE.Vector2(BOULDER_REACH * 0.72, BOULDER_REACH) }
    const pebbleFade = { value: new THREE.Vector2(PEBBLE_REACH * 0.6, PEBBLE_REACH) }
    const dustGeometry = new THREE.BufferGeometry()
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_DUST * 3), 3).setUsage(THREE.DynamicDrawUsage))
    dustGeometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_DUST), 1).setUsage(THREE.DynamicDrawUsage))
    dustGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(MAX_DUST), 1).setUsage(THREE.DynamicDrawUsage))
    dustGeometry.setDrawRange(0, 0)
    const dustMaterial = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 800 }, uColor: { value: new THREE.Color('#b9774f') } },
      vertexShader: DUST_VERTEX,
      fragmentShader: DUST_FRAGMENT,
      transparent: true,
      depthWrite: false,
    })
    const printGeometry = new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2).scale(0.12, 1, 0.3)
    const printMaterial = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.4, depthWrite: false })
    const poleGeometry = new THREE.CylinderGeometry(0.018, 0.022, 2.4, 10).translate(0, 1.2, 0)
    const rodGeometry = new THREE.CylinderGeometry(0.012, 0.012, 1.25, 8).rotateZ(Math.PI / 2).translate(0.62, 2.36, 0)
    const clothGeometry = new THREE.PlaneGeometry(1.2, 0.75, 24, 12).translate(0.6, 2.0, 0)
    const metal = new THREE.MeshStandardMaterial({ color: '#d9d9d6', roughness: 0.35, metalness: 0.6 })
    // (a little of its own light: under a high Sun a hanging cloth is lit edge-on)
    const clothTexture = flagTexture()
    const clothMaterial = new THREE.MeshStandardMaterial({ map: clothTexture, emissiveMap: clothTexture, emissive: '#ffffff', emissiveIntensity: 0.22, roughness: 0.85, side: THREE.DoubleSide })
    return {
      boulderFade,
      pebbleFade,
      dustGeometry,
      dustMaterial,
      printGeometry,
      printMaterial,
      poleGeometry,
      rodGeometry,
      clothGeometry,
      clothRest: Float32Array.from(clothGeometry.getAttribute('position').array),
      metal,
      clothMaterial,
      boulderMaterial: fadingMaterial(boulderFade, true),
      pebbleMaterial: fadingMaterial(pebbleFade, true),
      smoothBoulderMaterial: fadingMaterial(boulderFade, false),
      smoothPebbleMaterial: fadingMaterial(pebbleFade, false),
      sharpRock: rockGeometry(0),
      roundRock: rockGeometry(1),
    }
  }, [])
  useEffect(
    () => () => {
      parts.dustGeometry.dispose()
      parts.dustMaterial.dispose()
      parts.printGeometry.dispose()
      parts.printMaterial.dispose()
      parts.poleGeometry.dispose()
      parts.rodGeometry.dispose()
      parts.clothGeometry.dispose()
      parts.metal.dispose()
      parts.clothMaterial.map?.dispose()
      parts.clothMaterial.dispose()
      parts.boulderMaterial.dispose()
      parts.pebbleMaterial.dispose()
      parts.smoothBoulderMaterial.dispose()
      parts.smoothPebbleMaterial.dispose()
      parts.sharpRock.dispose()
      parts.roundRock.dispose()
    },
    [parts],
  )

  const state = useRef({
    body: -2,
    surface: null as Surface | null,
    // the anchor (the world's own frame), the ground's tangent there, and
    // metres per unit of that frame
    anchor: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    east: new THREE.Vector3(1, 0, 0),
    north: new THREE.Vector3(0, 0, 1),
    metres: 1,
    anchored: false,
    boulderCell: '',
    pebbleCell: '',
    cache: new Map<string, { x: number; y: number; z: number; size: number; spin: number; tint: number; squash: number }[]>(),
    grains: [] as Grain[],
    printsShown: -1,
    lastLand: 'flying',
    flag: null as null | { dir: THREE.Vector3; heading: THREE.Vector3; time: number },
    flagShown: false,
  })

  // where a point of the world's own frame is, in the site's metres
  const toSite = (local: THREE.Vector3, out: THREE.Vector3) => out.copy(local).sub(state.current.anchor).multiplyScalar(state.current.metres)

  const reanchor = (local: THREE.Vector3) => {
    const s = state.current
    const model = ground.model
    if (!model) return
    const dir = _v.copy(local).normalize()
    const old = s.anchor.clone()
    const wasAnchored = s.anchored
    s.anchor.copy(dir).multiplyScalar(1 + model.height(dir, ground.fade))
    s.up.copy(dir)
    s.east.copy(_yAxis).cross(s.up)
    if (s.east.lengthSq() < 1e-10) s.east.set(1, 0, 0)
    s.east.normalize()
    s.north.copy(s.up).cross(s.east).normalize()
    // dust in the air moves with the anchor
    if (wasAnchored) {
      _w.copy(old).sub(s.anchor).multiplyScalar(s.metres)
      for (const g of s.grains) {
        g.x += _w.x
        g.y += _w.y
        g.z += _w.z
        g.floor = g.x * s.up.x + g.y * s.up.y + g.z * s.up.z - 0.05
      }
    }
    s.anchored = true
    s.cache.clear()
    s.boulderCell = ''
    s.pebbleCell = ''
    s.printsShown = -1
    s.flagShown = false
  }

  /* the rocks in one cell of ground: the same every time */
  const cellRocks = (ix: number, iy: number, cellSize: number, pebble: boolean) => {
    const s = state.current
    const key = `${pebble ? 'p' : 'b'}${ix},${iy}`
    const hit = s.cache.get(key)
    if (hit) return hit
    const surface = s.surface!
    const model = ground.model!
    const out: { x: number; y: number; z: number; size: number; spin: number; tint: number; squash: number }[] = []
    // the cell's place on the world (its own seed: where it is, not where the anchor is)
    _w.copy(s.east).multiplyScalar((ix + 0.5) * cellSize).addScaledVector(s.north, (iy + 0.5) * cellSize)
    _w.divideScalar(s.metres).add(s.anchor).normalize()
    const seedX = Math.round(_w.x * 4e5)
    const seedY = Math.round(_w.y * 4e5)
    const seedZ = Math.round(_w.z * 4e5) + s.body * 7919
    const area = cellSize * cellSize
    const expected = pebble ? area * surface.rocks * 0.14 : (area * surface.rocks) / 1000
    const count = Math.floor(expected + hash(seedX, seedY, seedZ))
    for (let k = 0; k < Math.min(count, 6); k += 1) {
      const u = hash(seedX + k * 31, seedY, seedZ + 1)
      const w = hash(seedX, seedY + k * 17, seedZ + 2)
      const x = (ix + u) * cellSize
      const y = (iy + w) * cellSize
      _v.copy(s.east).multiplyScalar(x).addScaledVector(s.north, y).divideScalar(s.metres).add(s.anchor).normalize()
      _v.multiplyScalar(1 + model.height(_v, ground.fade))
      toSite(_v, _p)
      const r = hash(seedX + k, seedY + k, seedZ + 3)
      const size = pebble ? 0.03 + 0.12 * r * r : 0.25 + 1.9 * r * r * r
      out.push({ x: _p.x, y: _p.y, z: _p.z, size, spin: hash(seedX, seedY, seedZ + k + 5) * Math.PI * 2, tint: hash(seedX + 2, seedY + k, seedZ), squash: 0.7 + 0.5 * hash(seedX + k, seedY, seedZ + 9) })
    }
    s.cache.set(key, out)
    return out
  }

  /* the boulders within reach of a point (the world's own frame), for the
     walker to meet: each as its offset from the point (metres, the world's
     axes), its size and squash; none where nothing is drawn */
  useEffect(() => {
    const found: { x: number; y: number; z: number; size: number; squash: number }[] = []
    const at = new THREE.Vector3()
    surfaceEvents.rocksNear = (local: THREE.Vector3, reach: number) => {
      const s = state.current
      found.length = 0
      if (!s.anchored || !s.surface || s.surface.rocks <= 0 || !ground.model || ground.body !== s.body) return found
      toSite(local, at)
      const ax = at.x
      const ay = at.y
      const az = at.z
      const cx = at.dot(s.east)
      const cy = at.dot(s.north)
      const span = Math.ceil(reach / BOULDER_CELL)
      const icx = Math.floor(cx / BOULDER_CELL)
      const icy = Math.floor(cy / BOULDER_CELL)
      for (let dx = -span; dx <= span; dx += 1) {
        for (let dy = -span; dy <= span; dy += 1) {
          for (const rock of cellRocks(icx + dx, icy + dy, BOULDER_CELL, false)) {
            const ox = rock.x - ax
            const oy = rock.y - ay
            const oz = rock.z - az
            if (ox * ox + oy * oy + oz * oz < (reach + rock.size) ** 2) found.push({ x: ox, y: oy, z: oz, size: rock.size, squash: rock.squash })
          }
        }
      }
      return found
    }
    return () => {
      surfaceEvents.rocksNear = null
    }
  }, [])

  const placeRocks = (mesh: THREE.InstancedMesh, cx: number, cy: number, cellSize: number, reach: number, max: number, pebble: boolean) => {
    const s = state.current
    const surface = s.surface!
    const span = Math.ceil(reach / cellSize)
    const icx = Math.floor(cx / cellSize)
    const icy = Math.floor(cy / cellSize)
    let n = 0
    _align.setFromUnitVectors(_yAxis, s.up)
    const base = _color.set(surface.rock)
    for (let dx = -span; dx <= span && n < max; dx += 1) {
      for (let dy = -span; dy <= span && n < max; dy += 1) {
        if ((dx * dx + dy * dy) * cellSize * cellSize > (reach + cellSize) ** 2) continue
        for (const rock of cellRocks(icx + dx, icy + dy, cellSize, pebble)) {
          if (n >= max) break
          _spin.setFromAxisAngle(_yAxis, rock.spin)
          _q.copy(_align).multiply(_spin)
          // set a little into the ground
          _p.set(rock.x, rock.y, rock.z).addScaledVector(s.up, -rock.size * 0.12)
          _m.compose(_p, _q, _scale.set(rock.size, rock.size * rock.squash, rock.size * (0.8 + 0.4 * rock.tint)))
          mesh.setMatrixAt(n, _m)
          const shade = 0.72 + rock.tint * 0.45
          mesh.setColorAt(n, _tint.setRGB(base.r * shade, base.g * shade, base.b * shade))
          n += 1
        }
      }
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  const emit = (count: number, sx: number, sy: number, sz: number, make: (g: Grain) => void) => {
    const s = state.current
    for (let i = 0; i < count; i += 1) {
      if (s.grains.length >= MAX_DUST) s.grains.shift()
      const g: Grain = { x: sx, y: sy, z: sz, vx: 0, vy: 0, vz: 0, age: 0, life: 4, size: 0.4, floor: 0 }
      make(g)
      g.floor = sx * s.up.x + sy * s.up.y + sz * s.up.z - 0.05
      s.grains.push(g)
    }
  }
  const scatter = (g: Grain, out: number, upward: number, push?: THREE.Vector3, pushBy = 0) => {
    const s = state.current
    const a = Math.random() * Math.PI * 2
    const across = out * (0.4 + Math.random() * 0.6)
    const lift = upward * (0.3 + Math.random() * 0.7)
    g.vx = s.east.x * Math.cos(a) * across + s.north.x * Math.sin(a) * across + s.up.x * lift
    g.vy = s.east.y * Math.cos(a) * across + s.north.y * Math.sin(a) * across + s.up.y * lift
    g.vz = s.east.z * Math.cos(a) * across + s.north.z * Math.sin(a) * across + s.up.z * lift
    if (push) {
      g.vx += push.x * pushBy
      g.vy += push.y * pushBy
      g.vz += push.z * pushBy
    }
  }

  // runs after the world has turned and carried the ship (GroundCarry), before the frame is drawn
  useFrame((_, rawDelta) => {
    const s = state.current
    const group = site.current
    const jet = jetRef.current
    if (!group) return
    const delta = Math.min(rawDelta, 0.05)
    const model = ground.model
    const on =
      pilot.active && !!jet && !!model && ground.body === pilot.nearestIndex && ground.body >= 0 && pilot.altitudeKm < 2.5 && !!SURFACES[ground.body]
    group.visible = on
    if (!on || !jet || !model) {
      s.grains.length = 0
      surfaceEvents.footprints.length = 0
      surfaceEvents.puffs.length = 0
      if (ground.body !== s.body) s.flag = null
      return
    }
    if (ground.body !== s.body) {
      // a new world: its rocks, its dust, no flag yet
      s.body = ground.body
      s.surface = SURFACES[ground.body]
      s.anchored = false
      s.grains.length = 0
      s.flag = null
      surfaceEvents.footprints.length = 0
      parts.dustMaterial.uniforms.uColor.value.set(s.surface.dust)
      parts.printMaterial.color.set(s.surface.dust).multiplyScalar(0.42)
      const smooth = s.surface.rounded > 0.6
      if (boulders.current) {
        boulders.current.geometry = smooth ? parts.roundRock : parts.sharpRock
        boulders.current.material = smooth ? parts.smoothBoulderMaterial : parts.boulderMaterial
      }
      if (pebbles.current) {
        pebbles.current.geometry = smooth ? parts.roundRock : parts.sharpRock
        pebbles.current.material = smooth ? parts.smoothPebbleMaterial : parts.pebbleMaterial
      }
    }
    const surface = s.surface!
    s.metres = ground.worldRadius * KM_PER_UNIT * 1000
    // the camera, in the world's own frame: re-anchor once it is far off
    const camLocal = _v.copy(shipCamera.position).multiplyScalar(SHIP_LENGTH).add(jet.position).applyMatrix4(ground.inverse)
    const camLocalCopy = _p.copy(camLocal)
    if (!s.anchored || camLocalCopy.distanceTo(s.anchor) * s.metres > 2500) reanchor(camLocalCopy)
    // the site's frame, about the ship (ship lengths)
    ground.matrix.decompose(_p, _q, _s)
    _anchorWorld.copy(s.anchor).applyMatrix4(ground.matrix).sub(jet.position).divideScalar(SHIP_LENGTH)
    group.position.copy(_anchorWorld)
    group.quaternion.copy(_q)
    group.scale.setScalar(1 / SHIP_M)
    _bodyQuatInv.copy(_q).invert()

    // where the camera stands in the site (metres along east and north)
    const camSite = toSite(_v.copy(shipCamera.position).multiplyScalar(SHIP_LENGTH).add(jet.position).applyMatrix4(ground.inverse), _w)
    const cx = camSite.dot(s.east)
    const cy = camSite.dot(s.north)
    const camHeight = camSite.dot(s.up)
    // rocks: none on Earth (it could be sea, a field or a runway)
    const rocky = surface.rocks > 0
    if (boulders.current) {
      boulders.current.visible = rocky && camHeight < 900
      const key = `${Math.floor(cx / BOULDER_CELL)},${Math.floor(cy / BOULDER_CELL)}`
      if (boulders.current.visible && key !== s.boulderCell) {
        s.boulderCell = key
        placeRocks(boulders.current, cx, cy, BOULDER_CELL, BOULDER_REACH, MAX_BOULDERS, false)
      }
    }
    if (pebbles.current) {
      pebbles.current.visible = rocky && camHeight < 60
      const key = `${Math.floor(cx / PEBBLE_CELL)},${Math.floor(cy / PEBBLE_CELL)}`
      if (pebbles.current.visible && key !== s.pebbleCell) {
        s.pebbleCell = key
        placeRocks(pebbles.current, cx, cy, PEBBLE_CELL, PEBBLE_REACH, MAX_PEBBLES, true)
      }
    }

    // ---- dust: from the ship (touchdown, the roll-out, the take-off roll) and from boots
    const land = pilot.landState
    const groundSpeed = pilot.kms * 1000 // m/s
    _fwd.set(0, 0, -1).applyQuaternion(jet.quaternion).applyQuaternion(_bodyQuatInv)
    const dusty = surface.name !== 'Earth'
    const gearAt = (point: THREE.Vector3) =>
      toSite(_p.copy(point).multiplyScalar(SHIP_LENGTH).applyQuaternion(jet.quaternion).add(jet.position).applyMatrix4(ground.inverse), _p)
    if (land === 'rolling' && s.lastLand !== 'rolling') {
      // touchdown: a burst at each main gear (on Earth, tyre smoke)
      for (const gear of GEAR_POINTS) {
        const at = gearAt(gear)
        emit(dusty ? 70 : 26, at.x, at.y, at.z, (g) => {
          scatter(g, 5, 4, _fwd, groundSpeed * 0.12)
          g.size = dusty ? 0.5 + Math.random() * 0.7 : 0.9
          g.life = surface.windy ? 3 + Math.random() * 2.5 : 5
        })
      }
    }
    if (land === 'rolling' && dusty && groundSpeed > 3) {
      // the wheels throw up rooster tails
      const rate = 110 * Math.min(1, groundSpeed / 80)
      for (const gear of GEAR_POINTS) {
        const at = gearAt(gear)
        const count = Math.floor(rate * delta + Math.random())
        emit(count, at.x, at.y, at.z, (g) => {
          scatter(g, 1.8, Math.min(9, 2 + groundSpeed * 0.06), _fwd, groundSpeed * 0.08)
          g.size = 0.35 + Math.random() * 0.5
          g.life = surface.windy ? 2.5 + Math.random() * 2 : 5
        })
      }
    }
    if (land === 'lifting' && pilot.altitudeKm < 0.05 && dusty) {
      // the engines' blast along the ground behind
      const at = gearAt(ENGINE_POINT)
      const count = Math.floor(160 * delta * Math.max(0.2, pilot.thrust) + Math.random())
      emit(count, at.x, at.y, at.z, (g) => {
        scatter(g, 4, 3, _fwd, -(14 + Math.random() * 20))
        g.size = 0.6 + Math.random() * 1.2
        g.life = surface.windy ? 3 + Math.random() * 2 : 4
      })
    }
    s.lastLand = land
    for (const puff of surfaceEvents.puffs) {
      _v.copy(puff.dir).multiplyScalar(1 + model.height(puff.dir, ground.fade))
      const at = toSite(_v, _p)
      if (!dusty) continue
      emit(puff.count, at.x, at.y, at.z, (g) => {
        scatter(g, puff.speed, puff.speed * 0.8)
        g.size = 0.05 + Math.random() * 0.08
        g.life = surface.windy ? 2 : 3
      })
    }
    surfaceEvents.puffs.length = 0

    // the grains' flight: no air, clean arcs back to the ground; air, a
    // billow that slows, spreads and hangs
    const gravity = surface.gravity
    const drag = surface.windy ? (surface.name === 'Mars' ? 0.9 : 2.6) : 0
    const settle = Math.exp(-drag * delta)
    const positions = parts.dustGeometry.getAttribute('position') as THREE.BufferAttribute
    const sizes = parts.dustGeometry.getAttribute('aSize') as THREE.BufferAttribute
    const alphas = parts.dustGeometry.getAttribute('aAlpha') as THREE.BufferAttribute
    let n = 0
    const kept: Grain[] = []
    for (const g of s.grains) {
      g.age += delta
      if (drag > 0) {
        g.vx *= settle
        g.vy *= settle
        g.vz *= settle
        const sink = gravity * 0.05 * delta
        g.vx -= s.up.x * sink
        g.vy -= s.up.y * sink
        g.vz -= s.up.z * sink
        g.size *= 1 + delta * 0.55
      } else {
        g.vx -= s.up.x * gravity * delta
        g.vy -= s.up.y * gravity * delta
        g.vz -= s.up.z * gravity * delta
      }
      g.x += g.vx * delta
      g.y += g.vy * delta
      g.z += g.vz * delta
      const height = g.x * s.up.x + g.y * s.up.y + g.z * s.up.z
      if (g.age > g.life || (drag === 0 && height < g.floor && g.age > 0.05)) continue
      kept.push(g)
      positions.setXYZ(n, g.x, g.y, g.z)
      sizes.setX(n, g.size)
      const left = 1 - g.age / g.life
      alphas.setX(n, (drag > 0 ? 0.55 * left * left : 0.85 * Math.min(1, left * 4)) * Math.min(1, g.age * 12))
      n += 1
    }
    s.grains = kept
    parts.dustGeometry.setDrawRange(0, n)
    positions.needsUpdate = true
    sizes.needsUpdate = true
    alphas.needsUpdate = true
    gl.getDrawingBufferSize(_size)
    parts.dustMaterial.uniforms.uScale.value = _size.y / (2 * Math.tan(THREE.MathUtils.degToRad(shipCamera.fov) / 2))

    // ---- footprints (not on Earth: it could be water)
    const list = surfaceEvents.footprints
    if (list.length > MAX_PRINTS) list.splice(0, list.length - MAX_PRINTS)
    if (prints.current && s.printsShown !== list.length) {
      s.printsShown = list.length
      const mesh = prints.current
      let k = 0
      for (const print of dusty ? list : []) {
        _v.copy(print.dir).multiplyScalar(1 + model.height(print.dir, ground.fade))
        toSite(_v, _p).addScaledVector(s.up, 0.012)
        // its long axis along the way walked
        standing(s.up, print.heading, _q)
        _m.compose(_p, _q, _scale.set(1, 1, 1))
        mesh.setMatrixAt(k, _m)
        k += 1
      }
      mesh.count = k
      mesh.instanceMatrix.needsUpdate = true
    }

    // ---- the flag
    const planted = surfaceEvents.flag
    if (planted) {
      s.flag = { dir: planted.dir.clone(), heading: planted.heading.clone(), time: 0 }
      surfaceEvents.flag = null
      s.flagShown = false
    }
    if (flag.current && pole.current && cloth.current && rod.current) {
      flag.current.visible = !!s.flag
      if (s.flag) {
        const f = s.flag
        f.time += delta
        if (!s.flagShown) {
          s.flagShown = true
          _v.copy(f.dir).multiplyScalar(1 + model.height(f.dir, ground.fade))
          toSite(_v, _p)
          flag.current.position.copy(_p).addScaledVector(s.up, -0.15)
          // the cloth's face towards whoever planted it
          standing(s.up, _v.copy(f.heading).negate(), flag.current.quaternion)
        }
        // up it goes, then the cloth unfurls
        const raise = THREE.MathUtils.smoothstep(f.time, 0, 0.6)
        const unfurl = THREE.MathUtils.smoothstep(f.time, 0.5, 1.4)
        pole.current.scale.set(1, Math.max(0.001, raise), 1)
        rod.current.visible = !surface.windy
        rod.current.scale.set(Math.max(0.001, unfurl), 1, 1)
        cloth.current.scale.set(Math.max(0.001, unfurl), 1, 1)
        const position = cloth.current.geometry.getAttribute('position') as THREE.BufferAttribute
        const rest = parts.clothRest
        const t = f.time
        for (let i = 0; i < position.count; i += 1) {
          const x = rest[i * 3]
          const y = rest[i * 3 + 1]
          const along = x / 1.2
          let z: number
          let dy = 0
          if (surface.windy) {
            // flying: waves running out along the cloth, stronger at its end
            const wind = surface.name === 'Earth' ? 1 : surface.name === 'Mars' ? 0.55 : 0.35
            z = along * wind * (0.09 * Math.sin(along * 9 - t * 7) + 0.04 * Math.sin(along * 17 - t * 11 + y * 4))
            dy = -along * 0.06 * (1 - wind)
          } else {
            // held out by its rod, rippled from being folded (no air to smooth it)
            z = along * 0.035 * Math.sin(along * 11 + y * 3) + 0.02 * Math.sin(y * 13)
          }
          position.setXYZ(i, x, y + dy, z)
        }
        position.needsUpdate = true
        cloth.current.geometry.computeVertexNormals()
      }
    }
  }, 0.5)

  return (
    <group ref={site} visible={false}>
      <instancedMesh ref={boulders} args={[parts.sharpRock, parts.boulderMaterial, MAX_BOULDERS]} frustumCulled={false} />
      <instancedMesh ref={pebbles} args={[parts.sharpRock, parts.pebbleMaterial, MAX_PEBBLES]} frustumCulled={false} />
      <instancedMesh ref={prints} args={[parts.printGeometry, parts.printMaterial, MAX_PRINTS]} frustumCulled={false} renderOrder={1} />
      <points geometry={parts.dustGeometry} material={parts.dustMaterial} frustumCulled={false} renderOrder={2} />
      <group ref={flag} visible={false}>
        <mesh ref={pole} geometry={parts.poleGeometry} material={parts.metal} />
        <mesh ref={rod} geometry={parts.rodGeometry} material={parts.metal} />
        <mesh ref={cloth} geometry={parts.clothGeometry} material={parts.clothMaterial} />
      </group>
    </group>
  )
}
