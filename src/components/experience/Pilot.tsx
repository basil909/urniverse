'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

import { getPlanetPosition, getPlanetVisualRadius, PLANETS, SYSTEM_OFFSET } from './orbit'
import { simClock } from './simClock'
import { pilot } from './pilotState'

/* ============================================================
   FLIGHT MODE
   A small jet you fly through the Solar System. The camera rides behind
   it. The mouse (or a drag on touch screens, or a gamepad's stick)
   steers: its offset from the centre of the screen sets how fast the
   ship turns. W (or a click held, or the Thrust button) speeds up and
   the speed holds; S slows; A D and the arrows turn and pitch, Q E roll,
   Shift boosts. Near a planet the wings level to its horizon.

   Scale: the ship is tiny next to the worlds (Earth is about 115 ship
   lengths across, Jupiter about 1,250), so from the cockpit the planets
   are vast. Speed follows the distance to the nearest surface: a crawl
   when skimming a planet, fast across empty space. Planets and the Sun
   are solid.
============================================================ */

const SUN_RADIUS = 1
/** ship length in scene units (Earth's radius is 0.23) */
const SHIP_LENGTH = 0.004
/** the camera's near limit while flying, so the tiny ship still renders */
const FLIGHT_NEAR = 0.0012
/** km per scene unit at the planets' scale (Earth: 6,371 km = 0.23) */
const KM_PER_UNIT = 6371 / 0.23

const _forward = new THREE.Vector3()
const _up = new THREE.Vector3()
const _right = new THREE.Vector3()
const _bodyPos = new THREE.Vector3()
const _camTarget = new THREE.Vector3()
const _camPos = new THREE.Vector3()
const _turn = new THREE.Quaternion()
const _axis = new THREE.Vector3()
const _bodyCenter = new THREE.Vector3()
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
    <group scale={SHIP_LENGTH}>
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
    <group scale={SHIP_LENGTH}>
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
      }
      jet.visible = false
      return
    }

    if (!wasActive.current) {
      // take off from where the camera is, facing where it looks
      wasActive.current = true
      savedFov.current = camera.fov
      savedNear.current = camera.near
      camera.near = FLIGHT_NEAR
      camera.updateProjectionMatrix()
      camera.getWorldDirection(_forward)
      jet.position.copy(camera.position).addScaledVector(_forward, SHIP_LENGTH * 4)
      jet.quaternion.copy(camera.quaternion)
      speed.current = 0
      rates.current.set(0, 0, 0)
      velocity.current.set(0, 0, 0)
      camOffset.current.copy(camera.position).sub(jet.position)
    }
    jet.visible = true

    // ---- the nearest surface sets the pace (and must not be flown into)
    let nearest = 'the Sun'
    let nearestIndex = -1
    let clearance = jet.position.distanceTo(SYSTEM_OFFSET) - SUN_RADIUS
    _bodyPos.copy(SYSTEM_OFFSET)
    let nearestRadius = SUN_RADIUS
    for (let i = 0; i < PLANETS.length; i += 1) {
      getPlanetPosition(i, simClock.jd, _bodyCenter)
      const radius = getPlanetVisualRadius(i)
      const gap = jet.position.distanceTo(_bodyCenter) - radius
      if (gap < clearance) {
        clearance = gap
        nearest = PLANETS[i].name
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

    // ---- controls: keys, mouse or touch, and a gamepad if one is in use
    const keys = pilot.keys
    const pad = readGamepad()
    const forwardKey = keys.has('w') || pilot.touchThrust || pad.thrust > 0.2
    const brakeKey = keys.has('s') || pad.brake > 0.2
    const boost = keys.has('shift') || pad.boost
    // stick-like input, -1..1: a soft centre for fine corrections, full
    // deflection for hard turns
    const shape = (v: number, dead: number) => {
      const a = Math.abs(v)
      if (a < dead) return 0
      return Math.sign(v) * Math.min(1, ((a - dead) / (1 - dead)) ** 1.6)
    }
    const steerX = THREE.MathUtils.clamp(
      shape(pilot.steer.x, 0.06) + shape(pad.x, 0.12) + (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0),
      -1,
      1,
    )
    const steerY = THREE.MathUtils.clamp(
      shape(pilot.steer.y, 0.06) + shape(pad.y, 0.12) + (keys.has('arrowdown') ? 1 : 0) - (keys.has('arrowup') ? 1 : 0),
      -1,
      1,
    )
    const rollInput = (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0) + pad.roll

    // ---- speed: W speeds up and the speed holds when released, S slows;
    // the limit follows the distance to the nearest surface
    const limit = THREE.MathUtils.clamp(clearance * 0.7, SHIP_LENGTH * 0.8, 40) * (boost ? 4 : 1)
    const target = forwardKey ? limit : brakeKey ? 0 : Math.min(speed.current, limit)
    speed.current += (target - speed.current) * (1 - Math.exp(-delta * (forwardKey ? 1.4 : brakeKey ? 2.2 : 3)))
    thrust.current += ((forwardKey ? (boost ? 1 : 0.7) : 0.08) - thrust.current) * (1 - Math.exp(-delta * 6))
    pilot.speed = THREE.MathUtils.clamp(speed.current / limit, 0, 1)

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
    const minimum = nearestRadius * 1.065 + SHIP_LENGTH * 2
    const soft = Math.max(nearestRadius * 0.04, SHIP_LENGTH * 2.5)
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
    jet.position.addScaledVector(velocity.current, delta)

    // ---- the ground: never closer than 6.5% of the radius (some 410 km
    // over Earth, the Space Station's height). Nearing it, the descent is
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

    // ---- the chase camera: behind and above, swinging a little wide in
    // turns, looking slightly into them, and banking with the ship
    const bankTarget = THREE.MathUtils.clamp(yawRate * 0.42, -0.65, 0.65)
    bank.current += (bankTarget - bank.current) * (1 - Math.exp(-delta * 4))
    _up.set(0, 1, 0).applyQuaternion(jet.quaternion)
    _right.set(1, 0, 0).applyQuaternion(jet.quaternion)
    _camPos
      .set(0, 0, 0)
      .addScaledVector(_forward, -SHIP_LENGTH * 3.2)
      .addScaledVector(_up, SHIP_LENGTH * (0.85 + pitchRate * 0.12))
      .addScaledVector(_right, SHIP_LENGTH * yawRate * 0.35)
    camOffset.current.lerp(_camPos, 1 - Math.exp(-delta * 6))
    camera.position.copy(jet.position).add(camOffset.current)
    _camTarget
      .copy(jet.position)
      .addScaledVector(_forward, SHIP_LENGTH * 6)
      .addScaledVector(_right, -SHIP_LENGTH * yawRate * 0.9)
      .addScaledVector(_up, SHIP_LENGTH * pitchRate * 0.5)
    camera.up.copy(_up)
    camera.lookAt(_camTarget)
    camera.rotateZ(-bank.current * 0.35)
    camera.up.set(0, 1, 0)

    // the ship itself leans into the turn, and its nose follows the pitch
    const model = jet.children[0]
    model.rotation.z = bank.current
    model.rotation.x += (pitchRate * 0.06 - model.rotation.x) * (1 - Math.exp(-delta * 4))

    // a wider lens at speed
    const fov = 52 + pilot.speed * (boost ? 16 : 8)
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-delta * 3))
      camera.updateProjectionMatrix()
    }
  })

  return (
    <group ref={ship} visible={false}>
      <group>
        {shuttle ? <Shuttle model={shuttle} thrust={thrust} /> : <Jet thrust={thrust} />}
      </group>
    </group>
  )
}
