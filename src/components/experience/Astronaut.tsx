'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { pilot } from './pilotState'
import { SHIP_LENGTH } from './flightShip'
import { walkerBody } from './flightWalk'
import { animateFigure, loadFigure, type Figure } from './astronautRig'

/* ============================================================
   YOU, ON FOOT, SEEN FROM BEHIND (V)
   Quaternius's "Astronaut", animated as you move (astronautRig.ts),
   fetched the first time you step outside; until it has arrived (or if
   it cannot), a simple suited figure stands in. Either way the body
   turns to face the way it is going, smoothly (standing, it stays as it
   was while you look round), and leans a little into a turn. Drawn in
   the ship's layer (one unit a ship length, the ship at the origin),
   where the walker stands.
============================================================ */

const M = 1 / 37.24 // a metre, in ship lengths
const _desired = new THREE.Vector3()
const _right = new THREE.Vector3()
const _basis = new THREE.Matrix4()
const _back = new THREE.Vector3()

export default function Astronaut({ jetRef }: { jetRef: React.RefObject<THREE.Object3D | null> }) {
  const look = useMemo(() => {
    const suit = new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: 0.85 })
    const seams = new THREE.MeshStandardMaterial({ color: '#b9b6ae', roughness: 0.8 })
    const pack = new THREE.MeshStandardMaterial({ color: '#dcd8cf', roughness: 0.75 })
    const boot = new THREE.MeshStandardMaterial({ color: '#5d5f63', roughness: 0.9 })
    const visor = new THREE.MeshStandardMaterial({ color: '#c79a33', roughness: 0.12, metalness: 1 })
    const round = new THREE.SphereGeometry(1, 18, 12)
    // a limb: rounded at both ends, hanging from its joint (one unit long)
    const limb = new THREE.CapsuleGeometry(1, 1, 4, 12).translate(0, -1, 0).scale(1, 0.5, 1)
    const box = new THREE.BoxGeometry(1, 1, 1)
    // the body: a rounded trunk
    const trunk = new THREE.CapsuleGeometry(1, 1, 6, 16)
    // the visor: the helmet's front, a cap of a sphere
    // (centred on -z, the way the figure faces)
    const shield = new THREE.SphereGeometry(1, 18, 10, -Math.PI * 0.92, Math.PI * 0.84, Math.PI * 0.28, Math.PI * 0.42)
    return { suit, seams, pack, boot, visor, round, limb, box, trunk, shield }
  }, [])
  useEffect(
    () => () => {
      Object.values(look).forEach((thing) => (thing as { dispose: () => void }).dispose())
    },
    [look],
  )

  const root = useRef<THREE.Group>(null)
  const simple = useRef<THREE.Group>(null)
  // the model: asked for the first time you step outside
  const [model, setModel] = useState<Figure | null>(null)
  const asked = useRef(false)
  // which way the body faces (in the scene), and how fast it was turning
  const facing = useRef(new THREE.Vector3(0, 0, -1))
  const turning = useRef(0)
  const wasShown = useRef(false)
  useEffect(
    () => () => {
      model?.mixer.stopAllAction()
    },
    [model],
  )
  const hips = useRef<(THREE.Group | null)[]>([])
  const knees = useRef<(THREE.Group | null)[]>([])
  const shoulders = useRef<(THREE.Group | null)[]>([])
  const torso = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    const figure = root.current
    const jet = jetRef.current
    if (!figure || !jet) return
    if (pilot.walking && !asked.current) {
      asked.current = true
      loadFigure(setModel, () => {})
    }
    figure.visible = pilot.walking && walkerBody.shown
    if (!figure.visible) {
      if (model) model.waved = false
      wasShown.current = false
      return
    }
    const up = walkerBody.up
    const face = facing.current
    // just shown: facing the way you look
    if (!wasShown.current) {
      face.copy(walkerBody.forward)
      wasShown.current = true
    }
    // turning to face the way it goes (standing, it stays as it was)
    if (walkerBody.speed > 0.2) {
      _desired.copy(walkerBody.forward).multiplyScalar(walkerBody.ahead).addScaledVector(walkerBody.right, walkerBody.across)
    } else _desired.copy(face)
    _desired.addScaledVector(up, -_desired.dot(up))
    face.addScaledVector(up, -face.dot(up))
    if (_desired.lengthSq() > 1e-8 && face.lengthSq() > 1e-8) {
      _desired.normalize()
      face.normalize()
      const angle = Math.atan2(_right.copy(face).cross(_desired).dot(up), face.dot(_desired))
      // brisk when moving, a stepped-round pace otherwise
      const rate = walkerBody.hop > 0.08 ? 2 : 8
      const step = THREE.MathUtils.clamp(angle, -rate * delta, rate * delta)
      face.applyAxisAngle(up, step)
      turning.current += (step / Math.max(delta, 1e-4) - turning.current) * (1 - Math.exp(-delta * 8))
    }
    _right.copy(face).cross(up).normalize()
    _basis.makeBasis(_right, up, _back.copy(face).negate())
    figure.quaternion.setFromRotationMatrix(_basis)
    // leaning into a turn, more the faster it goes
    figure.rotateZ(THREE.MathUtils.clamp(-turning.current * walkerBody.speed * 0.035, -0.25, 0.25))
    figure.position.copy(walkerBody.feet).sub(jet.position).divideScalar(SHIP_LENGTH)
    if (simple.current) simple.current.visible = !model
    if (model) {
      // the knees taking a landing: the body dips
      const dip = animateFigure(model, delta, _right)
      figure.position.addScaledVector(up, -dip * M)
      return
    }
    // the gait: a stride's swing grows with speed; in the air the knees tuck
    const swing = Math.min(1, walkerBody.speed / 2.2)
    const s = Math.sin(walkerBody.phase)
    const tuck = Math.min(1, walkerBody.air / 0.3)
    ;[1, -1].forEach((side, i) => {
      const hip = hips.current[i]
      const knee = knees.current[i]
      const arm = shoulders.current[i]
      // (a positive turn swings a limb forward; a knee bends back)
      if (hip) hip.rotation.x = side * s * 0.55 * swing + tuck * 0.5
      if (knee) knee.rotation.x = -Math.max(0, -side * s) * 0.7 * swing - tuck * 0.9
      if (arm) arm.rotation.x = -side * s * 0.4 * swing + tuck * 0.35
    })
    // leaning into a run a little, rising and falling with each step
    if (torso.current) {
      torso.current.rotation.x = -0.12 * swing
      torso.current.position.y = Math.abs(Math.cos(walkerBody.phase)) * 0.03 * swing
    }
    void delta
  })

  const leg = (side: number, i: number) => (
    <group
      key={`leg${side}`}
      position={[side * 0.11, 0.95, 0]}
      ref={(g) => {
        hips.current[i] = g
      }}
    >
      <mesh geometry={look.limb} material={look.suit} scale={[0.1, 0.46, 0.1]} />
            <group
        position={[0, -0.46, 0]}
        ref={(g) => {
          knees.current[i] = g
        }}
      >
        <mesh geometry={look.round} material={look.seams} scale={0.095} />
        <mesh geometry={look.limb} material={look.suit} scale={[0.09, 0.4, 0.09]} />
        <mesh geometry={look.box} material={look.boot} position={[0, -0.42, -0.05]} scale={[0.15, 0.12, 0.3]} />
        <mesh geometry={look.round} material={look.boot} position={[0, -0.4, -0.18]} scale={[0.075, 0.06, 0.06]} />
      </group>
    </group>
  )
  const arm = (side: number, i: number) => (
    <group
      key={`arm${side}`}
      position={[side * 0.3, 1.5, 0]}
      ref={(g) => {
        shoulders.current[i] = g
      }}
    >
      <mesh geometry={look.round} material={look.suit} scale={0.12} />
      <mesh geometry={look.limb} material={look.suit} rotation={[0, 0, side * 0.12]} scale={[0.075, 0.58, 0.075]} />
      <mesh geometry={look.round} material={look.boot} position={[side * 0.07, -0.6, 0]} scale={[0.065, 0.075, 0.065]} />
    </group>
  )

  return (
    <group ref={root} visible={false}>
      {model && <primitive object={model.holder} />}
      <group ref={simple} scale={M}>
        {/* legs from the hips */}
        {[1, -1].map((side, i) => leg(side, i))}
        <group ref={torso}>
          {/* the torso (rounded, a little flattened front to back), its
              hips and waist ring */}
          <mesh geometry={look.trunk} material={look.suit} position={[0, 1.27, 0]} scale={[0.25, 0.2, 0.18]} />
          <mesh geometry={look.trunk} material={look.suit} position={[0, 0.98, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.14, 0.12, 0.16]} />
          <mesh geometry={look.box} material={look.seams} position={[0, 1.07, 0]} scale={[0.44, 0.05, 0.32]} />
          {/* the chest's control box */}
          <mesh geometry={look.box} material={look.seams} position={[0, 1.3, -0.2]} scale={[0.26, 0.14, 0.08]} />
          {/* the life-support pack on the back, narrower than the shoulders */}
          <mesh geometry={look.box} material={look.pack} position={[0, 1.32, 0.27]} scale={[0.42, 0.58, 0.22]} />
          <mesh geometry={look.box} material={look.seams} position={[0, 1.04, 0.27]} scale={[0.36, 0.05, 0.18]} />
          {/* the neck ring, the helmet (a bubble), its gold visor down */}
          <mesh geometry={look.trunk} material={look.seams} position={[0, 1.6, 0]} scale={[0.13, 0.02, 0.13]} />
          <mesh geometry={look.round} material={look.suit} position={[0, 1.78, -0.02]} scale={0.2} />
          <mesh geometry={look.shield} material={look.visor} position={[0, 1.78, -0.02]} scale={0.207} />
          {[1, -1].map((side, i) => arm(side, i))}
        </group>
      </group>
    </group>
  )
}
