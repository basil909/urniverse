'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

import {
  BODY_COUNT,
  getBodyName,
  getBodyOrbitPosition,
  getBodyPosition,
  getBodyRadius,
  getPlanetOrbitPosition,
  getPlanetPosition,
  SMALL_BODIES,
  layout,
  PLANETS,
  SUN_TRUE_RADIUS,
  SYSTEM_BASE,
  SYSTEM_OFFSET,
} from './orbit'
import { simClock } from './simClock'
import { pilot, VIEW_NEAR } from './pilotState'
import { getShipPass, shipCamera, shipScene } from './shipLayer'
import { ground, groundAltitude, groundLatLon } from './groundState'

/* ============================================================
   FLIGHT MODE
   A small jet you fly through the Solar System. The camera rides behind
   it. The mouse (or a drag on touch screens, or a gamepad's stick)
   steers: its offset from the centre of the screen sets how fast the
   ship turns. W (or a click held, or the Thrust button) speeds up and
   the speed holds; S slows; A D and the arrows turn and pitch, Q E roll,
   Shift boosts. Near a planet the wings level to its horizon.

   Scale: the ship is drawn at its true size against the planets
   (Earth is some 340,000 Shuttle lengths across, Jupiter 3.8 million),
   in a layer of its own (see shipLayer.ts). Speed follows the distance to the nearest surface: a crawl
   when skimming a planet, fast across empty space. Planets and the Sun
   are solid.
============================================================ */

/** km per scene unit at the planets' scale (Earth: 6,371 km = 0.23) */
const KM_PER_UNIT = 6371 / 0.23
/** the Shuttle orbiter's true length, 37.24 m, in scene units: Earth is
    some 340,000 ship-lengths across */
const SHIP_LENGTH = 0.03724 / KM_PER_UNIT
/** the lowest you can fly, in planet radii: 1.0157 is 100 km over Earth,
    the edge of space */
const LOWEST = 1.0157
/** the speed of light, in scene units per second */
const LIGHT = 299792.458 / KM_PER_UNIT
/** Shift: a warp no ship has, so the outer planets are not hours away */
const WARP = 40

const _forward = new THREE.Vector3()
const _up = new THREE.Vector3()
const _right = new THREE.Vector3()
const _bodyPos = new THREE.Vector3()
const _camTarget = new THREE.Vector3()
const _camPos = new THREE.Vector3()
const _turn = new THREE.Quaternion()
const _axis = new THREE.Vector3()
const _bodyCenter = new THREE.Vector3()
const _identity = new THREE.Quaternion()
const _axisUp = new THREE.Vector3()
const _groundUp = new THREE.Vector3()
const _bodyQuat = new THREE.Quaternion()
const _bodyPosDummy = new THREE.Vector3()
const _bodyScaleDummy = new THREE.Vector3()
const _align = new THREE.Quaternion()
const _jetUp = new THREE.Vector3()
const _markerDir = new THREE.Vector3()
const _camForward = new THREE.Vector3()
const _warpLook = new THREE.Matrix4()
const _warpQuat = new THREE.Quaternion()
const _warpPrev = new THREE.Vector3()
const _bez = new THREE.Vector3()

/* ============================================================
   WARP
   Pick a world (a marker on screen, or 1-8, 0 for the Sun) and the ship
   flies itself there: it first climbs clear of the world it is at (to
   one side, so the way is never through it), then crosses at warp,
   swinging round the Sun if it lies in between, and arrives a few radii
   out on the sunlit side, facing its goal. The crossing closes the
   distance geometrically, so the goal grows steadily from a point to a
   world. S cancels.
============================================================ */
type Warp = {
  target: number
  name: string
  a0: THREE.Vector3 // all relative to the Sun, so the floating origin can move
  a1: THREE.Vector3
  ctrl: THREE.Vector3
  end: THREE.Vector3
  goal: THREE.Vector3
  climb: number
  duration: number
  t: number
  span: number
  eps: number
}

const BODY_NAMES = Array.from({ length: BODY_COUNT + 1 }, (_, i) => getBodyName(i - 1))
const _toSun = new THREE.Vector3()
const _levelUp = new THREE.Vector3()
const _targetRates = new THREE.Vector3()
const _wanted = new THREE.Vector3()

/* the first connected gamepad, if any: left stick steers, right trigger
   gives thrust, left trigger brakes, the bumpers roll, A boosts */
const NO_PAD = { x: 0, y: 0, roll: 0, thrust: 0, brake: 0, boost: false }
function readGamepad() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return NO_PAD
  for (const pad of navigator.getGamepads()) {
    if (!pad || !pad.connected) continue
    const button = (i: number) => pad.buttons[i]?.value ?? 0
    return {
      x: pad.axes[0] ?? 0,
      y: pad.axes[1] ?? 0,
      roll: button(5) - button(4),
      thrust: button(7),
      brake: button(6),
      boost: button(0) > 0.5,
    }
  }
  return NO_PAD
}

/* a hull texture: light grey panels, fine panel lines, an accent stripe
   and a few small markings, drawn once on a canvas */
function makeHullTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const g = canvas.getContext('2d')!
  g.fillStyle = '#c9ced8'
  g.fillRect(0, 0, 1024, 512)
  // faint tonal variation between panels
  for (let x = 0; x < 16; x += 1) {
    for (let y = 0; y < 10; y += 1) {
      g.fillStyle = `rgba(${(x * 7 + y * 3) % 2 === 0 ? '255,255,255' : '40,46,58'},${0.02 + ((x * 13 + y * 5) % 5) * 0.01})`
      g.fillRect(x * 64, y * 51.2, 64, 51.2)
    }
  }
  // panel lines
  g.strokeStyle = 'rgba(30,34,44,0.45)'
  g.lineWidth = 1.5
  for (let x = 0; x <= 1024; x += 64) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke()
  }
  for (let y = 0; y <= 512; y += 51.2) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke()
  }
  // rivet dots along some seams
  g.fillStyle = 'rgba(30,34,44,0.35)'
  for (let x = 32; x < 1024; x += 64) {
    for (let y = 8; y < 512; y += 16) g.fillRect(x - 1, y, 2, 2)
  }
  // accent stripe and a darker band near the tail
  g.fillStyle = '#e2763f'
  g.fillRect(0, 300, 1024, 18)
  g.fillStyle = '#3a414e'
  g.fillRect(0, 430, 1024, 82)
  // small markings
  g.fillStyle = '#2b3140'
  for (const x of [180, 690]) {
    g.fillRect(x, 200, 60, 10)
    g.fillRect(x, 216, 34, 6)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function Jet({ thrust }: { thrust: { current: number } }) {
  const flames = useRef<THREE.Group[]>([])
  const strobe = useRef<THREE.Mesh>(null)

  const parts = useMemo(() => {
    const hullTexture = makeHullTexture()
    const hull = new THREE.MeshStandardMaterial({ color: '#ffffff', map: hullTexture, metalness: 0.62, roughness: 0.36 })
    const dark = new THREE.MeshStandardMaterial({ color: '#2b313c', metalness: 0.55, roughness: 0.5 })
    const trim = new THREE.MeshStandardMaterial({ color: '#e2763f', metalness: 0.3, roughness: 0.5 })
    const glass = new THREE.MeshStandardMaterial({
      color: '#0b1424',
      metalness: 0.9,
      roughness: 0.06,
      emissive: '#1d3d6e',
      emissiveIntensity: 0.4,
    })
    const throat = new THREE.MeshBasicMaterial({ color: '#cfe8ff', toneMapped: false })
    const flameOuter = new THREE.MeshBasicMaterial({
      color: '#4f9dff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    })
    const flameCore = new THREE.MeshBasicMaterial({
      color: '#e8f5ff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    })
    const red = new THREE.MeshBasicMaterial({ color: '#ff3b3b', toneMapped: false })
    const green = new THREE.MeshBasicMaterial({ color: '#3bff7a', toneMapped: false })
    const white = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })

    // fuselage: a smooth turned body, nose at -y (turned to -z below)
    const profile = [
      [0, -0.5], [0.016, -0.47], [0.036, -0.41], [0.052, -0.33], [0.063, -0.22],
      [0.07, -0.08], [0.073, 0.08], [0.07, 0.22], [0.062, 0.34], [0.052, 0.42], [0, 0.42],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    const fuselage = new THREE.LatheGeometry(profile, 40)

    // swept wings with a little thickness
    const wing = (side: number) => {
      const shape = new THREE.Shape()
      shape.moveTo(0.05 * side, 0.12)
      shape.lineTo(0.5 * side, -0.15)
      shape.lineTo(0.5 * side, -0.22)
      shape.lineTo(0.05 * side, -0.3)
      shape.closePath()
      return new THREE.ExtrudeGeometry(shape, {
        depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1,
      })
    }
    // canards: small foreplanes
    const canard = (side: number) => {
      const shape = new THREE.Shape()
      shape.moveTo(0.05 * side, 0.36)
      shape.lineTo(0.15 * side, 0.28)
      shape.lineTo(0.15 * side, 0.25)
      shape.lineTo(0.05 * side, 0.27)
      shape.closePath()
      return new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false })
    }
    // a swept tail fin, drawn along its length (x) and height (y)
    const finShape = new THREE.Shape()
    finShape.moveTo(0, 0)
    finShape.lineTo(0.22, 0)
    finShape.lineTo(0.25, 0.17)
    finShape.lineTo(0.16, 0.17)
    finShape.closePath()
    const fin = new THREE.ExtrudeGeometry(finShape, { depth: 0.008, bevelEnabled: false })

    // flames: base at the nozzle, growing backwards (+y, turned to +z)
    const flameOuterGeometry = new THREE.ConeGeometry(0.027, 0.42, 16, 1, true).translate(0, 0.21, 0)
    const flameCoreGeometry = new THREE.ConeGeometry(0.016, 0.18, 12, 1, true).translate(0, 0.09, 0)

    return {
      materials: [hull, dark, trim, glass, throat, flameOuter, flameCore, red, green, white],
      textures: [hullTexture],
      geometries: [fuselage, fin, flameOuterGeometry, flameCoreGeometry],
      hull, dark, trim, glass, throat, flameOuter, flameCore, red, green, white,
      fuselage, wings: [wing(1), wing(-1)], canards: [canard(1), canard(-1)], fin,
      flameOuterGeometry, flameCoreGeometry,
    }
  }, [])

  useEffect(
    () => () => {
      parts.materials.forEach((m) => m.dispose())
      parts.textures.forEach((t) => t.dispose())
      parts.geometries.forEach((g) => g.dispose())
      parts.wings.forEach((g) => g.dispose())
      parts.canards.forEach((g) => g.dispose())
    },
    [parts],
  )

  useFrame((state) => {
    const t = thrust.current
    const time = state.clock.elapsedTime
    const flicker = 0.92 + Math.sin(time * 47) * 0.05 + Math.sin(time * 31) * 0.03
    flames.current.forEach((flame) => {
      if (flame) flame.scale.set(1, 0.25 + t * 1.5 * flicker, 1)
    })
    parts.flameOuter.opacity = 0.2 + t * 0.5
    parts.flameCore.opacity = 0.35 + t * 0.6
    parts.throat.color.setScalar(0.5 + t * 0.6)
    // the tail strobe flashes briefly, twice a second
    const beat = time % 1.1
    if (strobe.current) strobe.current.visible = beat < 0.07 || (beat > 0.18 && beat < 0.24)
  })

  // built along -z (the direction of flight), 1 unit long, then scaled
  return (
    <group>
      {/* fuselage, with a dark spine behind the canopy */}
      <mesh geometry={parts.fuselage} material={parts.hull} rotation={[Math.PI / 2, 0, 0]} />
      <mesh material={parts.dark} position={[0, 0.066, 0.12]}>
        <boxGeometry args={[0.03, 0.012, 0.32]} />
      </mesh>

      {/* canopy: a glossy bubble with a framed edge */}
      <mesh material={parts.glass} position={[0, 0.045, -0.2]} scale={[0.043, 0.036, 0.14]}>
        <sphereGeometry args={[1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh material={parts.dark} position={[0, 0.046, -0.2]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 3.3, 1]}>
        <torusGeometry args={[0.043, 0.0035, 6, 28]} />
      </mesh>

      {/* air intakes beside the cockpit */}
      {[1, -1].map((side) => (
        <group key={`intake${side}`} position={[0.074 * side, -0.012, -0.04]}>
          <mesh material={parts.hull}>
            <boxGeometry args={[0.034, 0.05, 0.18]} />
          </mesh>
          <mesh material={parts.dark} position={[0, 0, -0.091]}>
            <boxGeometry args={[0.026, 0.04, 0.004]} />
          </mesh>
        </group>
      ))}

      {/* wings, with a slight upward angle, flaps and wingtip lights */}
      {[1, -1].map((side, i) => (
        <group key={`wing${side}`} rotation={[0, 0, 0.05 * side]}>
          <mesh geometry={parts.wings[i]} material={parts.hull} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0.08]} />
          <mesh material={parts.trim} position={[0.28 * side, -0.022, 0.37]} rotation={[0, -0.18 * side, 0]}>
            <boxGeometry args={[0.38, 0.008, 0.035]} />
          </mesh>
          <mesh material={side > 0 ? parts.green : parts.red} position={[0.505 * side, -0.02, 0.24]}>
            <sphereGeometry args={[0.009, 10, 8]} />
          </mesh>
        </group>
      ))}

      {/* canards */}
      {[1, -1].map((side, i) => (
        <mesh key={`canard${side}`} geometry={parts.canards[i]} material={parts.hull} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0.02]} />
      ))}

      {/* twin tail fins, canted outwards, with a strobe on the right one */}
      {[1, -1].map((side) => (
        <group key={`fin${side}`} position={[0.045 * side, 0.05, 0.16]} rotation={[0, 0, -0.32 * side]}>
          <mesh geometry={parts.fin} material={parts.hull} rotation={[0, -Math.PI / 2, 0]} position={[0.004 * side, 0, 0]} />
          <mesh material={parts.trim} position={[0, 0.16, 0.22]}>
            <boxGeometry args={[0.01, 0.012, 0.07]} />
          </mesh>
          {side > 0 && (
            <mesh ref={strobe} material={parts.white} position={[0, 0.172, 0.25]}>
              <sphereGeometry args={[0.008, 8, 6]} />
            </mesh>
          )}
        </group>
      ))}

      {/* engines: nacelles, nozzles, the glowing throat and the flames */}
      {[1, -1].map((side, i) => (
        <group key={`engine${side}`} position={[0.042 * side, -0.018, 0.34]}>
          <mesh material={parts.dark} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.034, 0.036, 0.2, 20]} />
          </mesh>
          <mesh material={parts.dark} position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.035, 0.05, 20, 1, true]} />
          </mesh>
          <mesh material={parts.throat} position={[0, 0, 0.142]}>
            <circleGeometry args={[0.025, 20]} />
          </mesh>
          <group
            position={[0, 0, 0.145]}
            rotation={[Math.PI / 2, 0, 0]}
            ref={(group) => {
              if (group) flames.current[i] = group
            }}
          >
            <mesh geometry={parts.flameOuterGeometry} material={parts.flameOuter} />
            <mesh geometry={parts.flameCoreGeometry} material={parts.flameCore} />
          </group>
        </group>
      ))}
    </group>
  )
}

/* ============================================================
   THE SHUTTLE
   NASA's "Space Shuttle (A)" model (NASA 3D Resources, free and without
   copyright). The file holds the whole launch stack; only the orbiter is
   used. It has no textures, so it is coloured as the real orbiter was:
   white above, the black heat-shield tiles below. Its three main engines
   are found from the model itself, and the flames sit at their nozzles.
============================================================ */

const SHUTTLE_URL = '/models/space-shuttle.glb'

type ShuttleModel = {
  body: THREE.Mesh
  engines: { position: THREE.Vector3; radius: number }[]
}

function useShuttle() {
  const [model, setModel] = useState<ShuttleModel | null>(null)
  useEffect(() => {
    let cancelled = false
    let built: ShuttleModel | null = null
    // NASA's file is Draco-compressed: three.js's own decoder, served from /draco/
    const draco = new DRACOLoader().setDecoderPath('/draco/')
    const loader = new GLTFLoader().setDRACOLoader(draco)
    loader.load(
      SHUTTLE_URL,
      (gltf) => {
        if (cancelled) return
        gltf.scene.updateMatrixWorld(true)
        const white = new THREE.Color('#e9ecef')
        const tile = new THREE.Color('#1d1f24')
        const metal = new THREE.Color('#6a707a')
        const parts: THREE.BufferGeometry[] = []
        const engineBoxes = new Map<string, THREE.Box3>()
        // whole groups that belong to the tank and boosters: any node one
        // of whose parts uses their materials (some mix in a plain one)
        const json = gltf.parser.json as {
          nodes: { name?: string; mesh?: number }[]
          meshes: { primitives: { material?: number }[] }[]
          materials: { name?: string }[]
        }
        const launchStack = new Set(
          json.nodes
            .filter((node) =>
              node.mesh !== undefined &&
              json.meshes[node.mesh].primitives.some((p) =>
                (json.materials[p.material ?? -1]?.name ?? '').startsWith('shuttlesrbsande'),
              ),
            )
            .map((node) => THREE.PropertyBinding.sanitizeNodeName(node.name ?? '')),
        )
        const inLaunchStack = (object: THREE.Object3D) => {
          let o: THREE.Object3D | null = object
          while (o) {
            if (launchStack.has(o.name)) return true
            o = o.parent
          }
          return false
        }
        // the cockpit windows
        const WINDOW_MATERIALS = new Set(['lambert5SG', 'anisotropic1SG', 'initialShadingGr'])
        const glass = new THREE.Color('#07090d')
        const engineGroup = (object: THREE.Object3D) => {
          let o: THREE.Object3D | null = object
          while (o) {
            if (o.name.startsWith('group13')) return o.name
            o = o.parent
          }
          return ''
        }
        gltf.scene.traverse((object) => {
          const mesh = object as THREE.Mesh
          if (!mesh.isMesh) return
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          // the external tank and solid rocket boosters stay on the pad
          if (inLaunchStack(mesh) || materials.some((m) => m.name.startsWith('shuttlesrbsande'))) return
          const isWindow = materials.some((m) => WINDOW_MATERIALS.has(m.name))
          let geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
          if (geometry.index) geometry = geometry.toNonIndexed()
          if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
          // keep only what every part shares, so they merge into one
          for (const name of Object.keys(geometry.attributes)) {
            if (!['position', 'normal'].includes(name)) geometry.deleteAttribute(name)
          }
          const engine = engineGroup(mesh)
          const normal = geometry.getAttribute('normal')
          const colors = new Float32Array(normal.count * 3)
          for (let i = 0; i < normal.count; i += 1) {
            const c = isWindow ? glass : engine ? metal : normal.getY(i) < -0.3 ? tile : white
            colors[i * 3] = c.r
            colors[i * 3 + 1] = c.g
            colors[i * 3 + 2] = c.b
          }
          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
          parts.push(geometry)
          if (engine) {
            geometry.computeBoundingBox()
            const box = engineBoxes.get(engine) ?? new THREE.Box3()
            box.union(geometry.boundingBox!)
            engineBoxes.set(engine, box)
          }
        })
        // one body, centred and scaled to unit length along z
        const merged = mergeGeometries(parts)
        merged.computeBoundingBox()
        const bounds = merged.boundingBox!
        const center = bounds.getCenter(new THREE.Vector3())
        const length = bounds.max.z - bounds.min.z
        merged.translate(-center.x, -center.y, -center.z)
        merged.scale(1 / length, 1 / length, 1 / length)
        const body = new THREE.Mesh(
          merged,
          new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.12, side: THREE.DoubleSide }),
        )
        // the three main engines: the largest engine groups
        const engines = [...engineBoxes.values()]
          .map((box) => ({ box, size: box.getSize(new THREE.Vector3()) }))
          .sort((a, b) => b.size.length() - a.size.length())
          .slice(0, 3)
          .map(({ box, size }) => {
            const c = box.getCenter(new THREE.Vector3())
            return {
              position: new THREE.Vector3(
                (c.x - center.x) / length,
                (c.y - center.y) / length,
                (box.max.z - center.z) / length,
              ),
              radius: (Math.min(size.x, size.y) * 0.32) / length,
            }
          })
        parts.forEach((part) => part.dispose())
        built = { body, engines }
        setModel(built)
      },
      undefined,
      (error) => {
        // keep the built-in jet
        console.warn('Shuttle model could not be loaded:', error)
      },
    )
    return () => {
      cancelled = true
      draco.dispose()
      built?.body.geometry.dispose()
      ;(built?.body.material as THREE.Material | undefined)?.dispose()
    }
  }, [])
  return model
}

/* merge position/normal/color geometries into one (all non-indexed) */
function mergeGeometries(parts: THREE.BufferGeometry[]) {
  let count = 0
  parts.forEach((p) => (count += p.getAttribute('position').count))
  const position = new Float32Array(count * 3)
  const normal = new Float32Array(count * 3)
  const color = new Float32Array(count * 3)
  let offset = 0
  parts.forEach((p) => {
    position.set(p.getAttribute('position').array as Float32Array, offset * 3)
    normal.set(p.getAttribute('normal').array as Float32Array, offset * 3)
    color.set(p.getAttribute('color').array as Float32Array, offset * 3)
    offset += p.getAttribute('position').count
  })
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3))
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  merged.setAttribute('color', new THREE.BufferAttribute(color, 3))
  return merged
}

function Shuttle({ model, thrust }: { model: ShuttleModel; thrust: { current: number } }) {
  const flames = useRef<THREE.Group[]>([])
  const look = useMemo(
    () => ({
      outer: new THREE.MeshBasicMaterial({
        color: '#7fb6ff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }),
      core: new THREE.MeshBasicMaterial({
        color: '#fff2dc', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }),
      outerGeometry: new THREE.ConeGeometry(1, 9, 18, 1, true).translate(0, 4.5, 0),
      coreGeometry: new THREE.ConeGeometry(0.6, 3.5, 14, 1, true).translate(0, 1.75, 0),
    }),
    [],
  )
  useEffect(
    () => () => {
      look.outer.dispose()
      look.core.dispose()
      look.outerGeometry.dispose()
      look.coreGeometry.dispose()
    },
    [look],
  )
  useFrame((state) => {
    const t = thrust.current
    const time = state.clock.elapsedTime
    const flicker = 0.92 + Math.sin(time * 47) * 0.05 + Math.sin(time * 29) * 0.03
    flames.current.forEach((flame) => {
      if (flame) flame.scale.y = (0.15 + t * 1.4 * flicker) * flame.userData.radius
    })
    look.outer.opacity = 0.15 + t * 0.5
    look.core.opacity = 0.3 + t * 0.65
  })
  return (
    <group>
      <primitive object={model.body} />
      {model.engines.map((engine, i) => (
        <group
          key={i}
          position={engine.position}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[engine.radius, engine.radius, engine.radius]}
          userData={{ radius: engine.radius }}
          ref={(group) => {
            if (group) flames.current[i] = group
          }}
        >
          <mesh geometry={look.outerGeometry} material={look.outer} />
          <mesh geometry={look.coreGeometry} material={look.core} />
        </group>
      ))}
    </group>
  )
}

export default function Pilot() {
  const shuttle = useShuttle()
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const scene = useThree((state) => state.scene)
  const size = useThree((state) => state.size)
  const savedCamera = useRef({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() })
  const savedFog = useRef<THREE.Fog | THREE.FogExp2 | null>(null)
  const ship = useRef<THREE.Group>(null)
  const wasActive = useRef(false)
  const speed = useRef(0)
  const thrust = useRef(0)
  const bank = useRef(0)
  const rates = useRef(new THREE.Vector3()) // pitch, yaw, roll (rad/s)
  const velocity = useRef(new THREE.Vector3())
  const savedFov = useRef(40)
  const savedNear = useRef(0.08)
  const camOffset = useRef(new THREE.Vector3(0, SHIP_LENGTH, SHIP_LENGTH * 3))
  const visual = useRef<THREE.Group>(null)
  const sunLight = useRef<THREE.DirectionalLight>(null)
  const shine = useRef<THREE.DirectionalLight>(null)
  const shineFor = useRef(-2)
  const warp = useRef<Warp | null>(null)
  // landing: where the ship stands, in the planet's own frame (it turns)
  const landedAt = useRef(new THREE.Vector3())
  const landedTurn = useRef(new THREE.Quaternion())
  const liftTime = useRef(0)
  const viewDistance = useRef(VIEW_NEAR)
  const beacon = useRef<THREE.Sprite>(null)
  const beaconMaterial = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const context = canvas.getContext('2d')!
    const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32)
    glow.addColorStop(0, 'rgba(255,255,255,1)')
    glow.addColorStop(0.18, 'rgba(200,225,255,0.9)')
    glow.addColorStop(0.5, 'rgba(120,170,255,0.25)')
    glow.addColorStop(1, 'rgba(120,170,255,0)')
    context.fillStyle = glow
    context.fillRect(0, 0, 64, 64)
    return new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  }, [])
  useEffect(() => () => {
    beaconMaterial.map?.dispose()
    beaconMaterial.dispose()
  }, [beaconMaterial])

  useFrame((_, rawDelta) => {
    const jet = ship.current
    if (!jet) return
    const delta = Math.min(rawDelta, 0.05)

    if (!pilot.active) {
      if (wasActive.current) {
        // landing: hand the camera back to the journey
        wasActive.current = false
        camera.fov = savedFov.current
        camera.near = savedNear.current
        camera.updateProjectionMatrix()
        pilot.nearestIndex = -2
        getShipPass().enabled = false
        warp.current = null
        pilot.warping = ''
        pilot.warpGlow = 0
        pilot.landState = 'flying'
        // back to the journey's compressed Solar System, and its camera
        layout.trueScale = false
        SYSTEM_OFFSET.copy(SYSTEM_BASE)
        camera.position.copy(savedCamera.current.position)
        camera.quaternion.copy(savedCamera.current.quaternion)
        scene.fog = savedFog.current
      }
      return
    }

    if (!wasActive.current) {
      // take off from where the camera is, facing where it looks
      wasActive.current = true
      savedFov.current = camera.fov
      savedNear.current = camera.near
      savedCamera.current.position.copy(camera.position)
      savedCamera.current.quaternion.copy(camera.quaternion)
      // the fog fades the journey's far views; true distances need none
      savedFog.current = scene.fog
      scene.fog = null
      // to true scale, keeping the nearest planet where it is (so the view
      // does not jump): the Sun is placed from that planet's true position
      let anchor = 2
      let best = Infinity
      for (let i = 0; i < PLANETS.length; i += 1) {
        const d = getPlanetPosition(i, simClock.jd, _bodyCenter).distanceTo(camera.position)
        if (d < best) {
          best = d
          anchor = i
        }
      }
      getPlanetPosition(anchor, simClock.jd, _bodyPos)
      layout.trueScale = true
      SYSTEM_OFFSET.copy(_bodyPos).sub(getPlanetOrbitPosition(anchor, simClock.jd, _bodyCenter))
      // and the floating origin: the camera at the scene's origin
      SYSTEM_OFFSET.sub(camera.position)
      camera.position.set(0, 0, 0)
      camera.updateProjectionMatrix()
      camera.getWorldDirection(_forward)
      jet.position.copy(camera.position).addScaledVector(_forward, SHIP_LENGTH * 4)
      jet.quaternion.copy(camera.quaternion)
      speed.current = 0
      viewDistance.current = VIEW_NEAR
      pilot.viewTarget = VIEW_NEAR
      rates.current.set(0, 0, 0)
      velocity.current.set(0, 0, 0)
      camOffset.current.copy(camera.position).sub(jet.position)
    }
    getShipPass().enabled = true
    // floating origin: once the ship strays from the origin, the whole
    // Solar System is moved back under it (32-bit precision stays fine)
    if (jet.position.lengthSq() > 400) {
      SYSTEM_OFFSET.sub(jet.position)
      camera.position.sub(jet.position)
      jet.position.set(0, 0, 0)
    }

    // ---- the nearest surface sets the pace (and must not be flown into)
    let nearest = 'the Sun'
    let nearestIndex = -1
    let clearance = jet.position.distanceTo(SYSTEM_OFFSET) - SUN_TRUE_RADIUS
    _bodyPos.copy(SYSTEM_OFFSET)
    let nearestRadius = SUN_TRUE_RADIUS
    for (let i = 0; i < BODY_COUNT; i += 1) {
      getBodyPosition(i, simClock.jd, _bodyCenter)
      const radius = getBodyRadius(i)
      const gap = jet.position.distanceTo(_bodyCenter) - radius
      if (gap < clearance) {
        clearance = gap
        nearest = getBodyName(i)
        nearestIndex = i
        nearestRadius = radius
        _bodyPos.copy(_bodyCenter)
      }
    }
    pilot.nearest = nearest
    pilot.nearestIndex = nearestIndex
    pilot.clearance = clearance
    // altitude in km, at the planets' scale (the Sun is not drawn to it)
    pilot.altitudeKm = nearestIndex >= 0 ? clearance * KM_PER_UNIT : -1
    // over solid ground: measured from the ground itself
    pilot.shipWorld.copy(jet.position)
    const onGround = ground.body === nearestIndex && ground.model !== null
    const groundHere = onGround ? groundAltitude(jet.position) : Infinity
    if (onGround) {
      clearance = Math.max(groundHere, 0)
      pilot.clearance = clearance
      pilot.altitudeKm = groundHere * KM_PER_UNIT
    }

    // ---- controls: keys, mouse or touch, and a gamepad if one is in use
    const keys = pilot.keys
    const pad = readGamepad()
    const warping = warp.current !== null
    const grounded = pilot.landState === 'landed' || pilot.landState === 'landing'
    const thrustHeld = keys.has('w') || pilot.touchThrust || pad.thrust > 0.2
    const forwardKey = !warping && !grounded && thrustHeld
    const brakeKey = keys.has('s') || pad.brake > 0.2
    const boost = keys.has('shift') || pad.boost
    // stick-like input, -1..1: a soft centre for fine corrections, full
    // deflection for hard turns
    const shape = (v: number, dead: number) => {
      const a = Math.abs(v)
      if (a < dead) return 0
      return Math.sign(v) * Math.min(1, ((a - dead) / (1 - dead)) ** 1.6)
    }
    const steerX = warping ? 0 : THREE.MathUtils.clamp(
      shape(pilot.steer.x, 0.06) + shape(pad.x, 0.12) + (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0),
      -1,
      1,
    )
    const steerY = warping ? 0 : THREE.MathUtils.clamp(
      shape(pilot.steer.y, 0.06) + shape(pad.y, 0.12) + (keys.has('arrowdown') ? 1 : 0) - (keys.has('arrowup') ? 1 : 0),
      -1,
      1,
    )
    const rollInput = warping ? 0 : (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0) + pad.roll

    // ---- speed: W speeds up and the speed holds when released, S slows.
    // The limit follows the distance to the nearest surface, and tops out
    // at the speed of light: even so, Mars is minutes away, Neptune hours,
    // which is the point. Shift is a warp of up to 40 times light speed.
    const limit = boost
      ? THREE.MathUtils.clamp(clearance * 1.5, SHIP_LENGTH * 2, LIGHT * WARP)
      : THREE.MathUtils.clamp(clearance * 0.5, SHIP_LENGTH * 0.8, LIGHT)
    const target = forwardKey ? limit : brakeKey ? 0 : Math.min(speed.current, limit)
    speed.current += (target - speed.current) * (1 - Math.exp(-delta * (forwardKey ? 1.4 : brakeKey ? 2.2 : 3)))
    // over the limit (closing on a world): slow at once, or at these
    // speeds the ship would sail straight past it
    if (speed.current > limit) speed.current += (limit - speed.current) * (1 - Math.exp(-delta * 9))
    thrust.current += ((forwardKey ? (boost ? 1 : 0.7) : 0.08) - thrust.current) * (1 - Math.exp(-delta * 6))
    pilot.speed = THREE.MathUtils.clamp(speed.current / limit, 0, 1)
    pilot.kms = speed.current * KM_PER_UNIT

    // ---- which way is "up": away from the planet when near one (so its
    // horizon stays level), the ecliptic's north out in open space
    _axis.copy(jet.position).sub(_bodyPos)
    const fromCentre = _axis.length()
    _axis.divideScalar(fromCentre)
    const nearWeight = 1 - THREE.MathUtils.smoothstep(fromCentre / nearestRadius, 1.6, 4)
    _levelUp.set(0, 1, 0).lerp(_axis, nearWeight).normalize()

    // ---- turning: the inputs set turn rates, which the ship reaches
    // quickly but not instantly, so it has weight without lag
    _forward.set(0, 0, -1).applyQuaternion(jet.quaternion)
    _right.set(1, 0, 0).applyQuaternion(jet.quaternion)
    _up.set(0, 1, 0).applyQuaternion(jet.quaternion)
    // levels the wings when not rolling (less so when pointing straight up
    // or down, where "level" has no meaning)
    const vertical = Math.abs(_forward.dot(_levelUp))
    // (the full roll angle, so it rights itself even from upside down)
    const rollAngle = Math.atan2(_right.dot(_levelUp), _up.dot(_levelUp))
    const level = rollInput === 0 ? THREE.MathUtils.clamp(rollAngle * 2.2, -2.2, 2.2) * (1 - vertical) : 0
    // close to the ground, the nose is eased up rather than flown in
    // over solid ground the floor is the ground itself (with the ship's
    // own height to spare); elsewhere the edge of space
    const minimum = onGround ? fromCentre - groundHere + SHIP_LENGTH * (pilot.landState === 'flying' ? 0.6 : 0.1) : nearestRadius * LOWEST
    const soft = onGround ? SHIP_LENGTH * 12 : nearestRadius * 0.02
    const closeness = 1 - THREE.MathUtils.clamp((fromCentre - minimum) / soft, 0, 1)
    const diving = Math.max(0, -_forward.dot(_axis))
    const pullUp = closeness * diving * 2.5

    _targetRates.set(
      -steerY * 1.15, // pitch: nose up is positive
      -steerX * 1.25, // yaw
      rollInput * 1.8 + level, // roll: right wing down is positive
    )
    rates.current.lerp(_targetRates, 1 - Math.exp(-delta * 7))
    const [pitchInput, yawRate, rollRate] = rates.current.toArray()
    // the ground's pull-up acts at once (not smoothed), so it stops the
    // moment the nose reaches the horizon instead of overshooting it
    const pitchRate = pitchInput + pullUp
    // a turn also rolls the ship a little into it, as a plane does
    _turn.setFromAxisAngle(_up, yawRate * delta)
    jet.quaternion.premultiply(_turn)
    _turn.setFromAxisAngle(_right, pitchRate * delta)
    jet.quaternion.premultiply(_turn)
    _turn.setFromAxisAngle(_forward, rollRate * delta)
    jet.quaternion.premultiply(_turn).normalize()

    // ---- moving: the ship carries its momentum, so it slides a little
    // through hard turns before the new heading takes over
    _forward.set(0, 0, -1).applyQuaternion(jet.quaternion)
    _wanted.copy(_forward).multiplyScalar(speed.current)
    velocity.current.lerp(_wanted, 1 - Math.exp(-delta * 3.2))
    // momentum carries direction, never extra speed
    if (velocity.current.length() > speed.current) velocity.current.setLength(speed.current)
    jet.position.addScaledVector(velocity.current, delta)

    // ---- the ground: never lower than 100 km over Earth (1.6% of a
    // planet's radius), the edge of space. Nearing it, the descent is
    // taken out of the motion smoothly; nothing bounces.
    _axis.copy(jet.position).sub(_bodyPos)
    const height = _axis.length()
    _axis.divideScalar(height)
    const sink = velocity.current.dot(_axis)
    if (sink < 0) {
      const near = 1 - THREE.MathUtils.clamp((height - minimum) / soft, 0, 1)
      velocity.current.addScaledVector(_axis, -sink * near)
    }
    if (height < minimum) jet.position.copy(_bodyPos).addScaledVector(_axis, minimum)

    // ---- landing (L, low over solid ground), standing, and lifting off
    pilot.canLand = onGround && groundHere < 8 / KM_PER_UNIT && pilot.landState === 'flying' && !warping
    if (pilot.landRequest) {
      pilot.landRequest = false
      if (pilot.canLand) {
        pilot.landState = 'landing'
        // never start a landing from inside a hill
        const below = groundAltitude(jet.position)
        if (below < SHIP_LENGTH * 0.14) {
          ground.matrix.decompose(_bodyPosDummy, _bodyQuat, _bodyScaleDummy)
          _groundUp.copy(jet.position).applyMatrix4(ground.inverse).normalize().applyQuaternion(_bodyQuat)
          jet.position.addScaledVector(_groundUp, SHIP_LENGTH * 0.6 - below)
        }
      }
    }
    if (pilot.landState !== 'flying' && (!onGround || warping || pilot.warpRequest !== null)) {
      pilot.landState = 'flying'
    }
    if (pilot.landState !== 'flying' && onGround) {
      ground.matrix.decompose(_bodyPosDummy, _bodyQuat, _bodyScaleDummy)
      _groundUp.copy(jet.position).applyMatrix4(ground.inverse).normalize().applyQuaternion(_bodyQuat)
      const rest = SHIP_LENGTH * 0.14 // the belly on the ground
      if (pilot.landState === 'landing') {
        // settle down onto the ground, wings level, coming to a stop
        const altitude = groundAltitude(jet.position)
        // eased down, but never slower than a few metres a second at the end
        const next = Math.max(rest, Math.min(rest + (altitude - rest) * Math.exp(-delta * 1.3), altitude - (0.004 / KM_PER_UNIT) * delta))
        jet.position.addScaledVector(_groundUp, next - altitude)
        velocity.current.multiplyScalar(Math.exp(-delta * 2.5))
        jet.position.addScaledVector(velocity.current, delta)
        speed.current = 0
        _jetUp.set(0, 1, 0).applyQuaternion(jet.quaternion)
        _align.setFromUnitVectors(_jetUp, _groundUp)
        jet.quaternion.premultiply(_align.slerp(_identity, Math.exp(-delta * 3))).normalize()
        if (Math.abs(altitude - rest) < SHIP_LENGTH * 0.02 && velocity.current.length() < SHIP_LENGTH * 0.5) {
          pilot.landState = 'landed'
          landedAt.current.copy(jet.position).applyMatrix4(ground.inverse)
          landedTurn.current.copy(_bodyQuat).invert().multiply(jet.quaternion)
        }
      } else if (pilot.landState === 'landed') {
        // standing: carried round with the planet's turn; steering turns
        // the ship where it stands
        if (Math.abs(steerX) > 0) {
          _turn.setFromAxisAngle(_axisUp.set(0, 1, 0), -steerX * 0.8 * delta)
          landedTurn.current.multiply(_turn)
        }
        jet.position.copy(landedAt.current).applyMatrix4(ground.matrix)
        jet.quaternion.copy(_bodyQuat).multiply(landedTurn.current)
        speed.current = 0
        velocity.current.set(0, 0, 0)
        if (thrustHeld) {
          pilot.landState = 'lifting'
          liftTime.current = 0
        }
      } else if (pilot.landState === 'lifting') {
        // straight up, gathering speed, then away
        liftTime.current += delta
        const climb = SHIP_LENGTH * (1 + liftTime.current * 6)
        jet.position.addScaledVector(_groundUp, climb * delta)
        if (liftTime.current > 2.2) {
          pilot.landState = 'flying'
          speed.current = SHIP_LENGTH * 4
        }
      }
    }
    if (onGround) {
      const site = groundLatLon(jet.position)
      pilot.site.lat = site.lat
      pilot.site.lon = site.lon
    }

    // ---- warp: asked for by the HUD; while it runs it flies the ship
    if (pilot.warpRequest !== null) {
      const target = pilot.warpRequest
      pilot.warpRequest = null
      const rel = jet.position.clone().sub(SYSTEM_OFFSET)
      const goal = getBodyOrbitPosition(target, simClock.jd, new THREE.Vector3())
      const radius = getBodyRadius(target)
      const standOff = target < 0 ? 6 : target === 5 ? 5.5 : 3.2
      // arrive on the near side, turned towards the Sun (the lit face)
      const fromGoal = rel.clone().sub(goal).normalize()
      const sunward = goal.lengthSq() > 0 ? goal.clone().negate().normalize().multiplyScalar(1.2) : new THREE.Vector3()
      const arrive = fromGoal.add(sunward)
      if (arrive.lengthSq() < 1e-8) arrive.set(0, 1, 0)
      const end = goal.clone().addScaledVector(arrive.normalize(), radius * standOff)
      // first climb clear of the world we are at, to its side
      let a1 = rel.clone()
      let climb = 0
      if (nearestIndex !== target && clearance < nearestRadius * 3) {
        const atBody = _bodyPos.clone().sub(SYSTEM_OFFSET)
        const way = end.clone().sub(rel).normalize()
        const side = rel.clone().sub(atBody).normalize()
        side.addScaledVector(way, -side.dot(way))
        if (side.lengthSq() < 1e-8) side.set(0, 1, 0).addScaledVector(way, -way.y)
        a1 = atBody.addScaledVector(side.normalize(), nearestRadius * 4)
        climb = 1.6
      }
      // and round the Sun, if it lies in the way
      const segment = end.clone().sub(a1)
      const along = THREE.MathUtils.clamp(-a1.dot(segment) / segment.lengthSq(), 0, 1)
      const closest = a1.clone().addScaledVector(segment, along)
      const ctrl = a1.clone().add(end).multiplyScalar(0.5)
      const clearSun = SUN_TRUE_RADIUS * 5
      if (target >= 0 && closest.length() < clearSun) {
        const away = closest.lengthSq() > 1e-8 ? closest.clone().normalize() : new THREE.Vector3(0, 1, 0)
        ctrl.addScaledVector(away, 2 * (clearSun - closest.length()) + clearSun)
      }
      const span = Math.max(a1.distanceTo(end), radius * 0.01)
      warp.current = {
        target,
        name: BODY_NAMES[target + 1],
        a0: rel,
        a1,
        ctrl,
        end,
        goal,
        climb,
        duration: THREE.MathUtils.clamp(3.5 + 0.9 * Math.log10(Math.max(span * KM_PER_UNIT, 1e5) / 1e5), 3.5, 8),
        t: 0,
        span,
        eps: radius * 0.002,
      }
      pilot.warping = BODY_NAMES[target + 1]
      pilot.viewTarget = VIEW_NEAR
    }
    const w = warp.current
    if (w && keys.has('s')) {
      // cancelled: drop out of warp where we are
      warp.current = null
      pilot.warping = ''
    } else if (w) {
      w.t += delta
      _warpPrev.copy(jet.position).sub(SYSTEM_OFFSET)
      let glow = 0.15
      if (w.t < w.climb) {
        const s = THREE.MathUtils.smoothstep(w.t / w.climb, 0, 1)
        _bez.copy(w.a0).lerp(w.a1, s)
      } else {
        const t = Math.min(1, (w.t - w.climb) / w.duration)
        const s = t * t * (3 - 2 * t)
        // the distance left shrinks geometrically: the goal grows steadily
        const u = 1 - Math.pow(w.eps / w.span, s)
        const v = 1 - u
        _bez
          .copy(w.a1)
          .multiplyScalar(v * v)
          .addScaledVector(w.ctrl, 2 * u * v)
          .addScaledVector(w.end, u * u)
        glow = Math.pow(Math.sin(Math.PI * t), 0.6)
        if (t >= 1) {
          warp.current = null
          pilot.warping = ''
          glow = 0
        }
      }
      jet.position.copy(SYSTEM_OFFSET).add(_bez)
      // face the goal
      _markerDir.copy(SYSTEM_OFFSET).add(w.goal)
      _warpLook.lookAt(jet.position, _markerDir, _levelUp)
      _warpQuat.setFromRotationMatrix(_warpLook)
      jet.quaternion.slerp(_warpQuat, 1 - Math.exp(-delta * 3))
      _forward.set(0, 0, -1).applyQuaternion(jet.quaternion)
      const moved = _bez.distanceTo(_warpPrev)
      pilot.kms = (moved / Math.max(delta, 1e-4)) * KM_PER_UNIT
      speed.current = 0
      velocity.current.set(0, 0, 0)
      pilot.warpGlow += (glow - pilot.warpGlow) * (1 - Math.exp(-delta * 6))
      pilot.warpOrigin.addScaledVector(_forward, 70 * pilot.warpGlow * delta)
      pilot.speed = Math.max(pilot.speed, pilot.warpGlow)
    } else {
      pilot.warpGlow += (0 - pilot.warpGlow) * (1 - Math.exp(-delta * 4))
    }

    // ---- the chase camera: behind and above, swinging a little wide in
    // turns, looking slightly into them, and banking with the ship
    const bankTarget = THREE.MathUtils.clamp(yawRate * 0.42, -0.65, 0.65)
    bank.current += (bankTarget - bank.current) * (1 - Math.exp(-delta * 4))
    _up.set(0, 1, 0).applyQuaternion(jet.quaternion)
    _right.set(1, 0, 0).applyQuaternion(jet.quaternion)
    // pulled back (scroll wheel, C), the same framing at a larger scale,
    // until the Shuttle is a speck against the planet
    viewDistance.current = Math.exp(
      THREE.MathUtils.lerp(Math.log(viewDistance.current), Math.log(pilot.viewTarget), 1 - Math.exp(-delta * 2.5)),
    )
    const reach = SHIP_LENGTH * (viewDistance.current / VIEW_NEAR)
    _camPos
      .set(0, 0, 0)
      .addScaledVector(_forward, -reach * 3.2)
      .addScaledVector(_up, reach * (0.85 + pitchRate * 0.12))
      .addScaledVector(_right, reach * yawRate * 0.35)
    camOffset.current.lerp(_camPos, 1 - Math.exp(-delta * 6))
    camera.position.copy(jet.position).add(camOffset.current)
    // pulled far back, the camera stays above the ground
    _camTarget.copy(camera.position).sub(_bodyPos)
    if (!onGround && _camTarget.length() < nearestRadius * 1.004) {
      camera.position.copy(_bodyPos).addScaledVector(_camTarget.normalize(), nearestRadius * 1.004)
    }
    if (onGround) {
      const above = groundAltitude(camera.position)
      if (above < SHIP_LENGTH * 0.3) {
        _groundUp.copy(camera.position).applyMatrix4(ground.inverse).normalize()
        ground.matrix.decompose(_bodyPosDummy, _bodyQuat, _bodyScaleDummy)
        _groundUp.applyQuaternion(_bodyQuat)
        camera.position.addScaledVector(_groundUp, SHIP_LENGTH * 0.3 - above)
      }
    }
    _camTarget
      .copy(jet.position)
      .addScaledVector(_forward, reach * 6)
      .addScaledVector(_right, -reach * yawRate * 0.9)
      .addScaledVector(_up, reach * pitchRate * 0.5)
    camera.up.copy(_up)
    camera.lookAt(_camTarget)
    camera.rotateZ(-bank.current * 0.35)
    camera.up.set(0, 1, 0)

    // ---- the ship's layer: the ship one unit long at the origin, seen by
    // a camera placed as the real one is, in ship lengths
    const view = visual.current
    if (view) {
      view.quaternion.copy(jet.quaternion)
      // the ship leans into the turn, and its nose follows the pitch
      const model = view.children[0]
      model.rotation.z = bank.current
      model.rotation.x += (pitchRate * 0.06 - model.rotation.x) * (1 - Math.exp(-delta * 4))
    }
    shipCamera.position.copy(camera.position).sub(jet.position).divideScalar(SHIP_LENGTH)
    shipCamera.quaternion.copy(camera.quaternion)
    const shipAway = shipCamera.position.length()
    shipCamera.near = Math.max(0.05, shipAway * 0.05)
    shipCamera.far = shipAway * 3 + 100
    // when the ship is too small to see, a soft beacon marks it
    if (beacon.current) {
      const shown = THREE.MathUtils.smoothstep(shipAway, 120, 900)
      const pulse = 0.75 + 0.25 * Math.sin(performance.now() * 0.004)
      beaconMaterial.opacity = shown * pulse
      beacon.current.visible = shown > 0.01
    }
    // sunlight, and light thrown up by the planet below (blue off Earth,
    // ochre off Mars) on its day side
    _toSun.copy(SYSTEM_OFFSET).sub(jet.position).normalize()
    sunLight.current?.position.copy(_toSun).multiplyScalar(10)
    if (shine.current) {
      shine.current.position.copy(_axis).multiplyScalar(-10)
      const nearness = Math.min(1, (nearestRadius / Math.max(height, nearestRadius)) ** 2)
      const daySide = THREE.MathUtils.smoothstep(_axis.dot(_toSun), -0.2, 0.6)
      shine.current.intensity = nearestIndex >= 0 ? 0.55 * nearness * daySide : 0
      if (nearestIndex >= 0 && shineFor.current !== nearestIndex) {
        shineFor.current = nearestIndex
        shine.current.color.set(
          nearestIndex < PLANETS.length
            ? (PLANETS[nearestIndex].atmosphereColor ?? PLANETS[nearestIndex].baseColor)
            : SMALL_BODIES[nearestIndex - PLANETS.length].color,
        )
      }
    }

    // a wider lens at speed; the near limit follows the ground (the ship
    // is in its own layer, so nothing nearer needs drawing here)
    const fov = 52 + pilot.speed * (boost ? 16 : 8)
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-delta * 3))
    camera.near = THREE.MathUtils.clamp(clearance * 0.25, onGround ? 2e-7 : 1e-5, 0.01)
    camera.updateProjectionMatrix()
    shipCamera.fov = camera.fov
    shipCamera.aspect = camera.aspect
    shipCamera.updateProjectionMatrix()

    // ---- where each world is on screen, for the HUD's markers
    camera.updateMatrixWorld()
    camera.getWorldDirection(_camForward)
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2
    const halfHeight = size.height / 2
    if (pilot.markers.length !== BODY_COUNT + 1) {
      pilot.markers = BODY_NAMES.map((name, i) => ({ name, index: i - 1, x: 0, y: 0, ahead: false, km: 0, radiusPx: 0 }))
    }
    pilot.markers.forEach((marker) => {
      getBodyPosition(marker.index, simClock.jd, _bodyCenter)
      const radius = getBodyRadius(marker.index)
      _markerDir.copy(_bodyCenter).sub(camera.position)
      const distance = _markerDir.length()
      _markerDir.divideScalar(distance)
      marker.ahead = _markerDir.dot(_camForward) > 0
      marker.km = Math.max(0, distance - radius) * KM_PER_UNIT
      marker.radiusPx = (Math.atan(radius / Math.max(distance, radius)) / halfFov) * halfHeight
      _markerDir.add(camera.position).project(camera)
      marker.x = _markerDir.x
      marker.y = _markerDir.y
    })
  })

  return (
    <>
      {/* where the ship is (the scene's own units); it is drawn below */}
      <group ref={ship} visible={false} />
      {createPortal(
        <>
          <group ref={visual}>
            <group>{shuttle ? <Shuttle model={shuttle} thrust={thrust} /> : <Jet thrust={thrust} />}</group>
          </group>
          <directionalLight ref={sunLight} color="#fff0d0" intensity={2.4} />
          <directionalLight ref={shine} intensity={0} />
          <ambientLight intensity={0.05} />
          <sprite ref={beacon} material={beaconMaterial} scale={[0.028, 0.028, 1]} visible={false} />
        </>,
        shipScene,
      )}
    </>
  )
}
