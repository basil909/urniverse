'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { pilot } from './pilotState'
import { ON_WHEELS } from './flightShip'

/* ============================================================
   THE SHUTTLE'S MOVING PARTS
   NASA's model is one piece, so what moves is added, at its real places
   (the ship one unit long, nose at -z, the belly 0.145 below centre):
   - landing gear, down on final approach (the real one at about 90 m,
     14 seconds before touchdown) and up again after take-off: the nose
     gear under the cockpit, the mains under the wing roots, 6.9 m apart;
   - the drag chute, out at touchdown in air (12 m across, on lines some
     27 m long), let go at about 110 km/h;
   - the speed brake: the rudder splits and opens like a clamshell on the
     approach, wide on the roll-out (and in air, whenever you slow);
   - the elevons on the wings' trailing edges, working with pitch and
     roll in air (still in vacuum);
   - in vacuum, puffs from the attitude thrusters (in the nose and the
     tail pods), as a turn starts and as it stops.
============================================================ */

/* nose and main gear: where each leg hinges (under the belly), its
   wheels' radius and their spacing either side */
const GEAR = [
  { at: [0, -0.142, -0.32], wheel: 0.011, spread: 0.007 },
  { at: [0.093, -0.128, 0.21], wheel: 0.015, spread: 0.011 },
  { at: [-0.093, -0.128, 0.21], wheel: 0.015, spread: 0.011 },
] as const

/* the attitude thrusters: where, which way they blow, and what fires
   them (from the turn's acceleration: pitch up, yaw left, roll right +) */
type Fire = (pitch: number, yaw: number, roll: number) => number
const up = (v: number) => Math.max(0, v)
const RCS: { at: [number, number, number]; way: [number, number, number]; fire: Fire }[] = [
  { at: [0, -0.137, -0.45], way: [0, -1, 0], fire: (p) => up(p) },
  { at: [0, -0.058, -0.45], way: [0, 1, 0], fire: (p) => up(-p) },
  { at: [0.04, -0.097, -0.45], way: [1, 0, 0], fire: (_, y) => up(y) },
  { at: [-0.04, -0.097, -0.45], way: [-1, 0, 0], fire: (_, y) => up(-y) },
  { at: [0.075, 0.002, 0.45], way: [0, 1, 0], fire: (p, _, r) => up(p) + up(r) },
  { at: [-0.075, 0.002, 0.45], way: [0, 1, 0], fire: (p, _, r) => up(p) + up(-r) },
  { at: [0.075, -0.062, 0.45], way: [0, -1, 0], fire: (p, _, r) => up(-p) + up(-r) },
  { at: [-0.075, -0.062, 0.45], way: [0, -1, 0], fire: (p, _, r) => up(-p) + up(r) },
  { at: [0.097, -0.03, 0.45], way: [1, 0, 0], fire: (_, y) => up(-y) },
  { at: [-0.097, -0.03, 0.45], way: [-1, 0, 0], fire: (_, y) => up(y) },
]

/* the speed brake: the rudder's hinge line, bottom and top (y, z), and
   its trailing edge there */
const RUDDER = { bottom: [0.02, 0.418, 0.478], top: [0.135, 0.462, 0.5] } as const
/* the elevons: from the fuselage side to near the tip, along the wing's
   trailing edge (z at their inboard and outboard ends), 0.05 deep */
const ELEVON = { inner: 0.115, outer: 0.33, teInner: 0.41, teOuter: 0.385, chord: 0.05, y: -0.1185, thick: 0.0125 }

const WHITE = new THREE.Color('#e9ecef')
const TILE = new THREE.Color('#1d1f24')
const GROUND = -ON_WHEELS

const smooth = THREE.MathUtils.smoothstep

/* a thin plate as a box whose corners are given: 8 points, faces coloured
   by which way they face (white above, the black tiles below) */
function plate(corners: THREE.Vector3[], colorBelow = TILE) {
  const geometry = new THREE.BoxGeometry(1, 1, 1).toNonIndexed()
  const position = geometry.getAttribute('position')
  // a unit box's corners (+-0.5) mapped to the given ones
  for (let i = 0; i < position.count; i += 1) {
    const k = (position.getX(i) > 0 ? 1 : 0) + (position.getY(i) > 0 ? 2 : 0) + (position.getZ(i) > 0 ? 4 : 0)
    position.setXYZ(i, corners[k].x, corners[k].y, corners[k].z)
  }
  geometry.computeVertexNormals()
  const normal = geometry.getAttribute('normal')
  const colors = new Float32Array(position.count * 3)
  for (let i = 0; i < position.count; i += 1) {
    const c = normal.getY(i) < -0.3 ? colorBelow : WHITE
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

export default function ShuttleParts({ material }: { material: THREE.Material }) {
  const parts = useMemo(() => {
    // the panels sit flush on the wing and fin: drawn just in front of
    // them where they coincide, so nothing flickers
    const panel = (material as THREE.MeshStandardMaterial).clone()
    panel.polygonOffset = true
    panel.polygonOffsetFactor = -1
    panel.polygonOffsetUnits = -4
    panel.side = THREE.DoubleSide
    const metal = new THREE.MeshStandardMaterial({ color: '#a3a9b0', roughness: 0.35, metalness: 0.7 })
    const tyre = new THREE.MeshStandardMaterial({ color: '#17181b', roughness: 0.9 })
    const strut = new THREE.CylinderGeometry(1, 1, 1, 10)
    const wheel = new THREE.CylinderGeometry(1, 1, 1, 20).rotateZ(Math.PI / 2)
    // the elevons, each hinged at its leading edge (local z 0 at the hinge)
    const elevons = [1, -1].map((side) => {
      const v = (x: number, y: number, z: number) => new THREE.Vector3(x * side, y, z)
      const { inner, outer, teInner, teOuter, chord, thick } = ELEVON
      const hinge = (teInner + teOuter) / 2 - chord
      const half = thick / 2
      // corners: x (0 inner, 1 outer) + y (0 below, 2 above) + z (0 hinge, 4 trailing edge)
      const c = [
        v(inner, -half, teInner - chord - hinge), v(outer, -half, teOuter - chord - hinge),
        v(inner, half, teInner - chord - hinge), v(outer, half, teOuter - chord - hinge),
        v(inner, -half, teInner - hinge), v(outer, -half, teOuter - hinge),
        v(inner, half, teInner - hinge), v(outer, half, teOuter - hinge),
      ]
      // (mirrored on the left: swap the inner/outer corners so faces point out)
      const corners = side > 0 ? c : [c[1], c[0], c[3], c[2], c[5], c[4], c[7], c[6]]
      return { geometry: plate(corners), hinge }
    })
    // the speed brake halves: thin plates either side of the fin's middle,
    // from the hinge line back to the trailing edge (local: the hinge's
    // bottom end at the origin)
    const [yb, hb, tb] = RUDDER.bottom
    const [yt, ht, tt] = RUDDER.top
    const rudders = [1, -1].map((side) => {
      const o = 0.0025 * side
      const w = 0.0016 * side
      const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y - yb, z - hb)
      // x (0 inside, 1 outside) + y (0 bottom, 2 top) + z (0 hinge, 4 trailing edge)
      const c = [
        v(o, yb, hb), v(o + w, yb, hb), v(o, yt, ht), v(o + w, yt, ht),
        v(o, yb, tb), v(o + w, yb, tb), v(o, yt, tt), v(o + w, yt, tt),
      ]
      const corners = side > 0 ? c : [c[1], c[0], c[3], c[2], c[5], c[4], c[7], c[6]]
      return plate(corners, WHITE)
    })
    const rudderAxis = new THREE.Vector3(0, yt - yb, ht - hb).normalize()
    // the drag chute: a dome of alternating gores, apex behind; its lines
    const canopy = new THREE.SphereGeometry(1, 28, 7, 0, Math.PI * 2, 0, Math.PI * 0.45).rotateX(Math.PI / 2)
    {
      const position = canopy.getAttribute('position')
      const colors = new Float32Array(position.count * 3)
      const orange = new THREE.Color('#e8742c')
      const cream = new THREE.Color('#f1ece2')
      for (let i = 0; i < position.count; i += 1) {
        const gore = Math.floor(((Math.atan2(position.getY(i), position.getX(i)) / Math.PI + 1) * 14) / 2) % 2
        const c = gore ? orange : cream
        colors.set([c.r, c.g, c.b], i * 3)
      }
      canopy.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    }
    const chuteMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, transparent: true })
    const LINES = 14
    const lines = new THREE.BufferGeometry()
    lines.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINES * 6), 3))
    const lineMaterial = new THREE.LineBasicMaterial({ color: '#cfcac0', transparent: true, opacity: 0.8 })
    // a thruster's puff: a short cone, its tip at the nozzle
    const puff = new THREE.ConeGeometry(1, 1, 10, 1, true).rotateX(Math.PI).translate(0, 0.5, 0)
    const puffMaterial = new THREE.MeshBasicMaterial({
      color: '#dfe7f5', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    })
    return {
      panel, metal, tyre, strut, wheel, elevons, rudders, rudderAxis, canopy, chuteMaterial, LINES, lines, lineMaterial, puff, puffMaterial,
    }
  }, [material])
  useEffect(
    () => () => {
      const p = parts
      ;[p.panel, p.metal, p.tyre, p.chuteMaterial, p.lineMaterial, p.puffMaterial].forEach((m) => m.dispose())
      ;[p.strut, p.wheel, p.canopy, p.lines, p.puff, ...p.rudders, ...p.elevons.map((e) => e.geometry)].forEach((g) => g.dispose())
    },
    [parts],
  )

  const legs = useRef<(THREE.Group | null)[]>([])
  const elevonRefs = useRef<(THREE.Group | null)[]>([])
  const rudderRefs = useRef<(THREE.Group | null)[]>([])
  const chute = useRef<THREE.Group>(null)
  const canopyRef = useRef<THREE.Mesh>(null)
  const puffs = useRef<(THREE.Mesh | null)[]>([])
  const state = useRef({
    gear: 0,
    brake: 0,
    elevon: [0, 0],
    chute: 'stowed' as 'stowed' | 'out' | 'gone',
    chuteTime: 0,
    lastTurn: { pitch: 0, yaw: 0, roll: 0 },
    fire: RCS.map(() => 0),
    lastState: '',
  })
  const _q = useMemo(() => new THREE.Quaternion(), [])

  useFrame((frame, delta) => {
    const s = state.current
    const land = pilot.landState
    const air = pilot.air
    const height = pilot.altitudeKm
    const dt = Math.min(delta, 0.1)

    // ---- the gear: down on final approach (below ~120 m), up after take-off
    const gearDown =
      land === 'rolling' || land === 'landed' || (land === 'landing' && height < 0.12) || (land === 'lifting' && height < 0.08)
    s.gear = THREE.MathUtils.clamp(s.gear + (gearDown ? 1 : -1) * dt / 1.6, 0, 1)
    const swing = smooth(s.gear, 0, 1)
    legs.current.forEach((leg) => {
      if (!leg) return
      leg.visible = s.gear > 0.01
      // folded forward into the belly when up
      leg.rotation.x = (1 - swing) * Math.PI * 0.5
    })

    // ---- the speed brake: open on the approach, wide on the roll-out,
    // and whenever you slow in air
    const slowing = pilot.keys.has('s') && land === 'flying'
    const brakeTo =
      air < 0.02
        ? 0
        : land === 'rolling'
          ? 1
          : land === 'landing'
            ? height > 0.2
              ? 0.55
              : 0.25
            : land === 'returning' || slowing
              ? 0.6
              : 0
    s.brake += (brakeTo - s.brake) * (1 - Math.exp(-dt * 1.5))
    rudderRefs.current.forEach((half, i) => {
      if (!half) return
      _q.setFromAxisAngle(parts.rudderAxis, (i === 0 ? 1 : -1) * s.brake * 0.85)
      half.quaternion.copy(_q)
    })

    // ---- the elevons: pitch moves both, roll one against the other
    const inAir = smooth(air, 0.0, 0.05)
    const { pitch, yaw, roll } = pilot.turn
    ;[1, -1].forEach((side, i) => {
      const want = THREE.MathUtils.clamp((-pitch * 0.35 + side * roll * 0.2) * inAir, -0.35, 0.35)
      s.elevon[i] += (want - s.elevon[i]) * (1 - Math.exp(-dt * 8))
      const group = elevonRefs.current[i]
      if (group) group.rotation.x = s.elevon[i]
    })

    // ---- the drag chute
    if (land !== s.lastState) {
      if (land === 'rolling' && air > 0.05 && pilot.kms > 0.04) {
        s.chute = 'out'
        s.chuteTime = 0
      }
      if (land === 'flying' || land === 'lifting' || land === 'launching' || land === 'returning') s.chute = 'stowed'
      s.lastState = land
    }
    s.chuteTime += dt
    if (s.chute === 'out' && pilot.kms < 0.031) {
      s.chute = 'gone'
      s.chuteTime = 0
    }
    const group = chute.current
    const dome = canopyRef.current
    if (group && dome) {
      group.visible = s.chute !== 'stowed' && !(s.chute === 'gone' && s.chuteTime > 3)
      if (group.visible) {
        const t = s.chuteTime
        // out: unfurling, filling (with a little overshoot), swaying;
        // let go: falling behind and down, deflating, fading
        const fill = s.chute === 'out' ? smooth(t, 0.1, 0.9) * (1 + 0.08 * Math.sin(t * 9) * Math.exp(-t * 2)) : 1
        const sway = Math.sin(frame.clock.elapsedTime * 1.7) * 0.04
        const reach = 0.75
        const radius = 0.16 * Math.max(fill, 0.05)
        const fall = s.chute === 'gone' ? smooth(t, 0, 1.8) : 0
        dome.position.set(sway * 0.4, 0.03 - fall * (0.03 - GROUND - 0.05), 0.47 + reach + t * (s.chute === 'gone' ? 0.9 : 0))
        dome.scale.set(radius, radius * (1 - 0.6 * fall), radius * (s.chute === 'out' ? 0.6 + 0.4 * fill : 1 - 0.7 * fall))
        dome.rotation.set(sway, sway * 0.6, 0)
        parts.chuteMaterial.opacity = s.chute === 'gone' ? 1 - smooth(t, 1.5, 3) : 1
        parts.lineMaterial.opacity = (s.chute === 'gone' ? 0 : 0.8) * smooth(t, 0, 0.3)
        // the lines: from the fin's foot to the canopy's rim
        const position = parts.lines.getAttribute('position') as THREE.BufferAttribute
        for (let k = 0; k < parts.LINES; k += 1) {
          const a = (k / parts.LINES) * Math.PI * 2
          const rim = new THREE.Vector3(Math.cos(a) * 0.988, Math.sin(a) * 0.988, 0.156).multiply(dome.scale)
          rim.applyEuler(dome.rotation).add(dome.position)
          position.setXYZ(k * 2, 0, 0.0, 0.47)
          position.setXYZ(k * 2 + 1, rim.x, rim.y, rim.z)
        }
        position.needsUpdate = true
      }
    }

    // ---- the attitude thrusters: in vacuum, as a turn starts or stops
    const pa = (pitch - s.lastTurn.pitch) / Math.max(dt, 1e-3)
    const ya = (yaw - s.lastTurn.yaw) / Math.max(dt, 1e-3)
    const ra = (roll - s.lastTurn.roll) / Math.max(dt, 1e-3)
    s.lastTurn.pitch = pitch
    s.lastTurn.yaw = yaw
    s.lastTurn.roll = roll
    const vacuum = 1 - smooth(air, 0, 0.02)
    RCS.forEach((jet, i) => {
      const want = vacuum * THREE.MathUtils.clamp((jet.fire(pa, ya, ra) - 0.35) * 0.9, 0, 1)
      s.fire[i] = Math.max(want, s.fire[i] * Math.exp(-dt * 12))
      const mesh = puffs.current[i]
      if (!mesh) return
      const f = s.fire[i]
      mesh.visible = f > 0.02
      mesh.scale.set(0.006 + 0.01 * f, 0.02 + 0.06 * f * (0.85 + 0.15 * Math.random()), 0.006 + 0.01 * f)
    })
    parts.puffMaterial.opacity = 0.55
  })

  return (
    <group>
      {/* landing gear */}
      {GEAR.map((leg, i) => {
        const length = -(GROUND + leg.wheel) + leg.at[1]
        return (
          <group
            key={`leg${i}`}
            position={[leg.at[0], leg.at[1], leg.at[2]]}
            ref={(g) => {
              legs.current[i] = g
            }}
          >
            <mesh geometry={parts.strut} material={parts.metal} position={[0, -length / 2, 0]} scale={[0.0045, length, 0.0045]} />
            {[1, -1].map((side) => (
              <mesh
                key={side}
                geometry={parts.wheel}
                material={parts.tyre}
                position={[side * leg.spread, -length, 0]}
                scale={[0.009, leg.wheel, leg.wheel]}
              />
            ))}
          </group>
        )
      })}

      {/* elevons */}
      {parts.elevons.map((elevon, i) => (
        <group
          key={`elevon${i}`}
          position={[0, ELEVON.y, elevon.hinge]}
          ref={(g) => {
            elevonRefs.current[i] = g
          }}
        >
          <mesh geometry={elevon.geometry} material={parts.panel} />
        </group>
      ))}

      {/* the speed brake: the split rudder */}
      {parts.rudders.map((geometry, i) => (
        <group
          key={`rudder${i}`}
          position={[0, RUDDER.bottom[0], RUDDER.bottom[1]]}
          ref={(g) => {
            rudderRefs.current[i] = g
          }}
        >
          <mesh geometry={geometry} material={parts.panel} />
        </group>
      ))}

      {/* the drag chute and its lines */}
      <group ref={chute} visible={false}>
        <mesh ref={canopyRef} geometry={parts.canopy} material={parts.chuteMaterial} />
        <lineSegments geometry={parts.lines} material={parts.lineMaterial} />
      </group>

      {/* attitude thrusters' puffs */}
      {RCS.map((jet, i) => (
        <mesh
          key={`rcs${i}`}
          geometry={parts.puff}
          material={parts.puffMaterial}
          position={jet.at}
          quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...jet.way))}
          visible={false}
          ref={(m) => {
            puffs.current[i] = m
          }}
        />
      ))}
    </group>
  )
}
