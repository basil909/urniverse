'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { getPlanetPosition, getPlanetVisualRadius, PLANETS, SYSTEM_OFFSET } from './orbit'
import { simClock } from './simClock'
import { pilot } from './pilotState'

/* ============================================================
   FLIGHT MODE
   A small jet you fly through the Solar System. The camera rides behind
   it; steering follows the mouse (or a drag on touch screens), W / Up
   (or the on-screen button) gives thrust, S / Down brakes, A D or the
   arrows turn, Shift boosts.

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

export default function Pilot() {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const ship = useRef<THREE.Group>(null)
  const wasActive = useRef(false)
  const speed = useRef(0)
  const thrust = useRef(0)
  const bank = useRef(0)
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

    // ---- controls
    const keys = pilot.keys
    const forwardKey = keys.has('w') || keys.has('arrowup') || pilot.touchThrust
    const brakeKey = keys.has('s') || keys.has('arrowdown')
    const boost = keys.has('shift')
    const turnLeft = keys.has('a') || keys.has('arrowleft')
    const turnRight = keys.has('d') || keys.has('arrowright')

    // a crawl near surfaces, fast in open space
    const limit = THREE.MathUtils.clamp(clearance * 0.7, SHIP_LENGTH * 0.8, 40) * (boost ? 4 : 1)
    const target = forwardKey ? limit : brakeKey ? 0 : Math.min(speed.current, limit)
    speed.current += (target - speed.current) * (1 - Math.exp(-delta * (forwardKey ? 1.4 : 2.5)))
    thrust.current += ((forwardKey ? (boost ? 1 : 0.7) : 0.08) - thrust.current) * (1 - Math.exp(-delta * 6))
    pilot.speed = THREE.MathUtils.clamp(speed.current / limit, 0, 1)

    // steering: mouse offset (with a small dead zone) plus keys
    const dead = (v: number) => (Math.abs(v) < 0.08 ? 0 : (v - Math.sign(v) * 0.08) / 0.92)
    const yaw = -dead(pilot.steer.x) * 1.3 + (turnLeft ? 1.1 : 0) - (turnRight ? 1.1 : 0)
    const pitch = -dead(pilot.steer.y) * 1.0

    _up.set(0, 1, 0).applyQuaternion(jet.quaternion)
    _right.set(1, 0, 0).applyQuaternion(jet.quaternion)
    _turn.setFromAxisAngle(_up, yaw * delta)
    jet.quaternion.premultiply(_turn)
    _turn.setFromAxisAngle(_right, pitch * delta)
    jet.quaternion.premultiply(_turn)
    // gently level the wings when not turning
    _forward.set(0, 0, -1).applyQuaternion(jet.quaternion)
    _right.set(1, 0, 0).applyQuaternion(jet.quaternion)
    _turn.setFromAxisAngle(_forward, _right.y * delta * 1.5)
    jet.quaternion.premultiply(_turn).normalize()

    // ---- move, and stay out of solid bodies (skimming is allowed)
    _forward.set(0, 0, -1).applyQuaternion(jet.quaternion)
    jet.position.addScaledVector(_forward, speed.current * delta)
    // the closest approach: about 8% of the radius (some 500 km over Earth),
    // where the surface maps still hold up
    const minimum = nearestRadius * 1.08 + SHIP_LENGTH * 2
    const offset = _axis.copy(jet.position).sub(_bodyPos)
    if (offset.length() < minimum) {
      jet.position.copy(_bodyPos).addScaledVector(offset.normalize(), minimum)
      speed.current *= 0.5
    }

    // ---- the chase camera, banking into turns
    bank.current += (THREE.MathUtils.clamp(yaw * 0.45, -0.6, 0.6) - bank.current) * (1 - Math.exp(-delta * 3))
    _up.set(0, 1, 0).applyQuaternion(jet.quaternion)
    // the camera keeps its distance at any speed: only its offset around
    // the jet is smoothed (so it swings gently behind in turns)
    _camPos.set(0, 0, 0).addScaledVector(_forward, -SHIP_LENGTH * 3.2).addScaledVector(_up, SHIP_LENGTH * 0.85)
    camOffset.current.lerp(_camPos, 1 - Math.exp(-delta * 6))
    camera.position.copy(jet.position).add(camOffset.current)
    _camTarget.copy(jet.position).addScaledVector(_forward, SHIP_LENGTH * 6)
    camera.up.copy(_up)
    camera.lookAt(_camTarget)
    camera.rotateZ(-bank.current * 0.35)
    camera.up.set(0, 1, 0)

    // the jet itself leans into the turn
    jet.children[0].rotation.z = bank.current

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
        <Jet thrust={thrust} />
      </group>
    </group>
  )
}
