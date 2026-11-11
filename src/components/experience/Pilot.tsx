'use client'

import { useMemo, useRef } from 'react'
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
   arrows turn, Shift boosts. Speed adapts to the nearest body: slow
   enough to drift past a moon, fast enough to cross the system. Planets
   and the Sun are solid.
============================================================ */

const SUN_RADIUS = 1
const SHIP_LENGTH = 0.09

const _forward = new THREE.Vector3()
const _up = new THREE.Vector3()
const _right = new THREE.Vector3()
const _bodyPos = new THREE.Vector3()
const _camTarget = new THREE.Vector3()
const _camPos = new THREE.Vector3()
const _turn = new THREE.Quaternion()
const _axis = new THREE.Vector3()
const _bodyCenter = new THREE.Vector3()

function Jet({ thrust }: { thrust: { current: number } }) {
  const exhaustL = useRef<THREE.Mesh>(null)
  const exhaustR = useRef<THREE.Mesh>(null)

  const hull = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#d9dde6', metalness: 0.7, roughness: 0.32 }),
    [],
  )
  const dark = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#3a4150', metalness: 0.6, roughness: 0.5 }),
    [],
  )
  const glass = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#7fb4ff',
        metalness: 0.2,
        roughness: 0.05,
        emissive: '#244a88',
        emissiveIntensity: 0.6,
      }),
    [],
  )
  const flame = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#9fd0ff',
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  )
  // the exhaust flame: base at the nozzle, so it grows backwards
  const flameGeometry = useMemo(
    () => new THREE.ConeGeometry(0.026, 0.3, 12, 1, true).translate(0, 0.15, 0),
    [],
  )
  // swept wings, drawn flat and extruded thin (side: +1 right, -1 left)
  const wings = useMemo(
    () =>
      [1, -1].map((side) => {
        const shape = new THREE.Shape()
        shape.moveTo(0, 0.18)
        shape.lineTo(0.42 * side, -0.12)
        shape.lineTo(0.42 * side, -0.2)
        shape.lineTo(0, -0.12)
        shape.closePath()
        return new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: false })
      }),
    [],
  )

  useFrame((state) => {
    const t = thrust.current
    const flicker = 0.9 + Math.sin(state.clock.elapsedTime * 40) * 0.1
    ;[exhaustL.current, exhaustR.current].forEach((mesh) => {
      if (!mesh) return
      // the cone's length runs along its own y axis
      mesh.scale.set(1, 0.3 + t * 1.6 * flicker, 1)
    })
    flame.opacity = 0.35 + t * 0.6
  })

  // built along -Z (the direction of flight), 1 unit long, then scaled
  return (
    <group scale={SHIP_LENGTH}>
      {/* fuselage */}
      <mesh material={hull} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.05]}>
        <cylinderGeometry args={[0.035, 0.075, 0.7, 20]} />
      </mesh>
      <mesh material={hull} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.42]}>
        <coneGeometry args={[0.035, 0.18, 20]} />
      </mesh>
      {/* canopy */}
      <mesh material={glass} position={[0, 0.045, -0.12]} scale={[0.04, 0.03, 0.12]}>
        <sphereGeometry args={[1, 20, 12]} />
      </mesh>
      {/* wings */}
      <mesh geometry={wings[0]} material={hull} rotation={[-Math.PI / 2, 0, 0]} position={[0.03, -0.01, 0.1]} />
      <mesh geometry={wings[1]} material={hull} rotation={[-Math.PI / 2, 0, 0]} position={[-0.03, -0.01, 0.1]} />
      {/* tail fin */}
      <mesh material={dark} position={[0, 0.09, 0.32]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.012, 0.16, 0.12]} />
      </mesh>
      {/* engines and their glow */}
      {[-0.06, 0.06].map((x, i) => (
        <group key={x} position={[x, -0.02, 0.36]}>
          <mesh material={dark} rotation={[-Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.035, 0.12, 14]} />
          </mesh>
          {/* exhaust: a cone pointing backwards (+z), growing from the nozzle */}
          <group position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh ref={i === 0 ? exhaustL : exhaustR} material={flame} geometry={flameGeometry} />
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
        camera.updateProjectionMatrix()
      }
      jet.visible = false
      return
    }

    if (!wasActive.current) {
      // take off from where the camera is, facing where it looks
      wasActive.current = true
      savedFov.current = camera.fov
      camera.getWorldDirection(_forward)
      jet.position.copy(camera.position).addScaledVector(_forward, 0.6)
      jet.quaternion.copy(camera.quaternion)
      speed.current = 0
      camOffset.current.copy(camera.position).sub(jet.position)
    }
    jet.visible = true

    // ---- the nearest body sets the pace (and must not be flown into)
    let nearest = 'the Sun'
    let clearance = jet.position.distanceTo(SYSTEM_OFFSET) - SUN_RADIUS
    _bodyPos.copy(SYSTEM_OFFSET)
    let nearestRadius = SUN_RADIUS
    const bodyCenter = _bodyCenter
    for (let i = 0; i < PLANETS.length; i += 1) {
      getPlanetPosition(i, simClock.jd, bodyCenter)
      const radius = getPlanetVisualRadius(i)
      const gap = jet.position.distanceTo(bodyCenter) - radius
      if (gap < clearance) {
        clearance = gap
        nearest = PLANETS[i].name
        nearestRadius = radius
        _bodyPos.copy(bodyCenter)
      }
    }
    pilot.nearest = nearest

    // ---- controls
    const keys = pilot.keys
    const forwardKey = keys.has('w') || keys.has('arrowup') || pilot.touchThrust
    const brakeKey = keys.has('s') || keys.has('arrowdown')
    const boost = keys.has('shift')
    const turnLeft = keys.has('a') || keys.has('arrowleft')
    const turnRight = keys.has('d') || keys.has('arrowright')

    const limit = THREE.MathUtils.clamp(clearance * 0.9, 0.25, 40) * (boost ? 3 : 1)
    const target = forwardKey ? limit : brakeKey ? 0 : speed.current * 0.995
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
    const roll = _right.y
    _turn.setFromAxisAngle(_forward, roll * delta * 1.5)
    jet.quaternion.premultiply(_turn).normalize()

    // ---- move, and stay out of solid bodies
    _forward.set(0, 0, -1).applyQuaternion(jet.quaternion)
    jet.position.addScaledVector(_forward, speed.current * delta)
    const minimum = nearestRadius * 1.04 + SHIP_LENGTH
    const offset = _axis.copy(jet.position).sub(_bodyPos)
    if (offset.length() < minimum) {
      jet.position.copy(_bodyPos).addScaledVector(offset.normalize(), minimum)
      speed.current *= 0.5
    }

    // ---- the chase camera, banking into turns
    bank.current += (THREE.MathUtils.clamp(yaw * 0.45, -0.6, 0.6) - bank.current) * (1 - Math.exp(-delta * 3))
    _up.set(0, 1, 0).applyQuaternion(jet.quaternion)
    // the camera keeps its distance at any speed: only its offset around
    // the jet is smoothed (so it swings gently behind in turns), never its
    // position, which would trail far behind at speed
    _camPos.set(0, 0, 0).addScaledVector(_forward, -SHIP_LENGTH * 3.2).addScaledVector(_up, SHIP_LENGTH * 0.9)
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
