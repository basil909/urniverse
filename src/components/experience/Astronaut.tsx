'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { pilot } from './pilotState'
import { SHIP_LENGTH } from './flightShip'
import { walkerBody } from './flightWalk'

/* ============================================================
   YOU, ON FOOT, SEEN FROM BEHIND (V)
   Quaternius's "Astronaut" (public domain, public/models/CREDITS.txt), 1.8
   m tall, fetched the first time you step outside, with its own
   animations: Idle standing, Walk and Run (played at the pace you move,
   so the feet keep to the ground), Run_Left, Run_Right and Run_Back
   stepping sideways and backwards, a slow-motion stride in the air, and
   a wave as you first turn to watch yourself. Until it has arrived (or
   if it cannot), a simple suited figure stands in: a white suit, a
   helmet with its gold visor down, the pack on its back, its limbs
   swinging with the gait. Drawn in the ship's layer (one unit a ship
   length, the ship at the origin), where the walker stands.
============================================================ */

const M = 1 / 37.24 // a metre, in ship lengths
const MODEL_URL = '/models/astronaut.glb'
const HEIGHT = 1.8
/* the animations' own paces (m/s): the speed at which each, played at
   its natural rate, keeps the feet still on the ground */
const PACE = { Walk: 1.45, Run: 4.2, Run_Left: 3.4, Run_Right: 3.4, Run_Back: 3.2 } as const
type Clip = 'Idle' | 'Walk' | 'Run' | 'Run_Left' | 'Run_Right' | 'Run_Back' | 'Wave'
const CLIPS: Clip[] = ['Idle', 'Walk', 'Run', 'Run_Left', 'Run_Right', 'Run_Back', 'Wave']

type Figure = {
  holder: THREE.Group
  mixer: THREE.AnimationMixer
  actions: Partial<Record<Clip, THREE.AnimationAction>>
  playing: Clip | null
  waved: boolean
}

/* the model, fetched once, scaled to 1.8 m, its feet at the origin,
   facing -z (as the walker's frame does) */
function loadFigure(onReady: (figure: Figure) => void, onFail: () => void) {
  new GLTFLoader().load(
    MODEL_URL,
    (gltf) => {
      const scene = gltf.scene
      scene.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(scene, true)
      const height = Math.max(box.max.y - box.min.y, 1e-6)
      const inner = new THREE.Group()
      inner.add(scene)
      scene.position.y = -box.min.y
      // (made facing +z)
      inner.rotation.y = Math.PI
      inner.scale.setScalar(HEIGHT / height)
      const holder = new THREE.Group()
      holder.scale.setScalar(M)
      holder.add(inner)
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.frustumCulled = false
        const material = mesh.material as THREE.MeshStandardMaterial
        if (material && 'roughness' in material) material.roughness = Math.max(material.roughness, 0.6)
      })
      const mixer = new THREE.AnimationMixer(scene)
      const actions: Figure['actions'] = {}
      for (const clip of gltf.animations) {
        const name = clip.name.split('|').pop() as Clip
        if (CLIPS.includes(name)) actions[name] = mixer.clipAction(clip)
      }
      if (actions.Wave) {
        actions.Wave.setLoop(THREE.LoopOnce, 1)
        actions.Wave.clampWhenFinished = true
      }
      onReady({ holder, mixer, actions, playing: null, waved: false })
    },
    undefined,
    () => onFail(),
  )
}

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
      return
    }
    figure.position.copy(walkerBody.feet).sub(jet.position).divideScalar(SHIP_LENGTH)
    figure.quaternion.copy(walkerBody.turn)
    if (simple.current) simple.current.visible = !model
    if (model) {
      animate(model, delta)
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


/* which of the model's animations, and at what rate, for how you move */
function animate(figure: Figure, delta: number) {
  const { ahead, across, speed, air, loping, walkPace } = walkerBody
  let want: Clip = 'Idle'
  let rate = 1
  if (air > 0.05) {
    // in the air: a slow-motion stride
    want = 'Run'
    rate = 0.22
  } else if (speed > 0.15) {
    if (Math.abs(across) > Math.abs(ahead) * 1.2) {
      want = across > 0 ? 'Run_Right' : 'Run_Left'
      rate = speed / PACE[want]
    } else if (ahead < 0) {
      want = 'Run_Back'
      rate = speed / PACE.Run_Back
    } else if (loping || speed > walkPace * 1.25) {
      want = 'Run'
      rate = loping ? 0.62 : speed / PACE.Run
    } else {
      want = 'Walk'
      rate = speed / PACE.Walk
    }
    rate = THREE.MathUtils.clamp(rate, 0.35, 1.6)
  } else if (!figure.waved && figure.actions.Wave) {
    // turning to watch yourself, standing: a wave, once
    want = 'Wave'
  }
  if (want === 'Wave') figure.waved = true
  // the wave plays out, then back to standing
  if (figure.playing === 'Wave' && want === 'Idle') {
    const wave = figure.actions.Wave
    if (wave && wave.time < wave.getClip().duration * 0.98) want = 'Wave'
  }
  const action = figure.actions[want] ?? figure.actions.Idle
  if (!action) return
  if (figure.playing !== want) {
    const last = figure.playing ? figure.actions[figure.playing] : null
    action.reset().setEffectiveWeight(1).fadeIn(0.25).play()
    last?.fadeOut(0.25)
    figure.playing = want
  }
  if (want !== 'Wave' && want !== 'Idle') action.setEffectiveTimeScale(rate)
  figure.mixer.update(delta)
}
