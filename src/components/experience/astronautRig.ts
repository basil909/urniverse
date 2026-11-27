import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { walkerBody } from './flightWalk'

/* ============================================================
   THE RIGGED ASTRONAUT, MOVING AS YOU MOVE
   Quaternius's "Astronaut" (public domain; public/models/CREDITS.txt).
   - Its walk and run are measured when it arrives: how fast each one's
     planted foot slides back under the body (the ground speed at which
     the feet stay put), and so how far a whole cycle carries it. The
     gait is then driven by the distance you cover, not by the clock: a
     cycle of the walk for every walk stride's worth of ground, so the
     feet stay planted at any pace, starting, stopping, slowing.
   - Standing, walking and running are blended by speed, the walk and
     run kept in step (their footfalls aligned) so the change between
     them never jumps; where gravity is weak, hurrying is the run played
     slow, a bounding lope.
   - On top of the animation: in a jump the knees tuck and the arms come
     up; landing, the knees take it (a squash, the body dipping, the feet
     kept on the ground); a lean into the run, and into a climb; the head
     turns (and tilts) to look where you look; picking up a sample, a
     crouch, leaning in, a hand reaching down.
   - A wave, once, as you first turn to watch yourself (if standing).
   - Dressed for the surface: the model's sci-fi colours traded for a
     white suit, grey joints and a gold visor, as EVA suits are.
============================================================ */

const MODEL_URL = '/models/astronaut.glb'
/* the suit's colours, by the model's material names (its own are sci-fi
   orange and teal): a white suit, grey at the joints, a gold visor */
const SUIT: Record<string, { color: string; roughness: number; metalness: number }> = {
  SciFi_Light_Accent: { color: '#ebe9e4', roughness: 0.78, metalness: 0 },
  SciFi_Main: { color: '#dddbd5', roughness: 0.85, metalness: 0 },
  SciFi_Light: { color: '#a9a8a4', roughness: 0.6, metalness: 0.15 },
  SciFi_MainDark: { color: '#6f7277', roughness: 0.7, metalness: 0.1 },
  Grey: { color: '#c89a3c', roughness: 0.18, metalness: 0.85 },
}
const HEIGHT = 1.8
const M = 1 / 37.24 // a metre, in ship lengths

type Gait = {
  action: THREE.AnimationAction
  duration: number
  /** ground speed at its natural rate (m/s), ground covered a cycle (m) */
  speed: number
  stride: number
  /** where in its cycle the left foot is furthest forward (0..1) */
  offset: number
}

export type Figure = {
  holder: THREE.Group
  mixer: THREE.AnimationMixer
  idle: THREE.AnimationAction | null
  wave: THREE.AnimationAction | null
  walk: Gait | null
  run: Gait | null
  bones: Record<'hipL' | 'hipR' | 'kneeL' | 'kneeR' | 'footL' | 'footR' | 'armL' | 'armR' | 'foreR' | 'spine' | 'neck' | 'head', THREE.Object3D | null>
  // what it is doing
  phase: number
  weights: { idle: number; walk: number; run: number; wave: number }
  runMix: number
  airPose: number
  squash: number
  airTime: number
  waving: boolean
  waved: boolean
  /** the head's turn and tilt (radians), eased */
  lookYaw: number
  lookPitch: number
}

const _q = new THREE.Quaternion()
const _pq = new THREE.Quaternion()
const _axis = new THREE.Vector3()

/* a bone found by its name in the file (the loader drops the dots) */
function bone(root: THREE.Object3D, name: string) {
  const plain = name.replace(/\./g, '')
  let found: THREE.Object3D | null = null
  root.traverse((object) => {
    if (!found && (object.name === name || object.name === plain)) found = object
  })
  return found as THREE.Object3D | null
}

/* how a gait moves the feet: played alone, sampled through a cycle in
   metres (the holder at one metre a unit, facing -z) */
function measure(mixer: THREE.AnimationMixer, holder: THREE.Group, action: THREE.AnimationAction, footL: THREE.Object3D, footR: THREE.Object3D): Gait {
  const duration = action.getClip().duration
  action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play()
  const N = 72
  const left: THREE.Vector3[] = []
  const right: THREE.Vector3[] = []
  for (let i = 0; i <= N; i += 1) {
    mixer.setTime((i / N) * duration)
    holder.updateMatrixWorld(true)
    left.push(footL.getWorldPosition(new THREE.Vector3()))
    right.push(footR.getWorldPosition(new THREE.Vector3()))
  }
  action.stop()
  const lowest = Math.min(...left.map((p) => p.y), ...right.map((p) => p.y))
  // the planted foot's slide backwards (+z), sample to sample
  const slides: number[] = []
  const dt = duration / N
  for (let i = 0; i < N; i += 1) {
    for (const foot of [left, right]) {
      if (foot[i].y < lowest + 0.05 && foot[i + 1].y < lowest + 0.05) {
        const v = (foot[i + 1].z - foot[i].z) / dt
        if (v > 0) slides.push(v)
      }
    }
  }
  slides.sort((x, y) => x - y)
  const speed = slides.length ? slides[Math.floor(slides.length / 2)] : 1.4
  // the left foot furthest forward
  let front = 0
  for (let i = 1; i < N; i += 1) if (left[i].z < left[front].z) front = i
  return { action, duration, speed, stride: Math.max(speed * duration, 0.3), offset: front / N }
}

export function loadFigure(onReady: (figure: Figure) => void, onFail: () => void) {
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
      holder.add(inner)
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.frustumCulled = false
        mesh.castShadow = true
        const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]
        for (const material of materials) {
          if (!material || !('roughness' in material)) continue
          const look = SUIT[material.name]
          if (look) {
            material.color.set(look.color)
            material.roughness = look.roughness
            material.metalness = look.metalness
          } else material.roughness = Math.max(material.roughness, 0.6)
        }
      })
      const mixer = new THREE.AnimationMixer(scene)
      const clip = (name: string) => gltf.animations.find((c) => c.name.split('|').pop() === name) ?? null
      const action = (name: string) => {
        const c = clip(name)
        return c ? mixer.clipAction(c) : null
      }
      const footL = bone(scene, 'Foot.L')
      const footR = bone(scene, 'Foot.R')
      const walkAction = action('Walk')
      const runAction = action('Run')
      // measured with the holder at a metre a unit
      const walk = walkAction && footL && footR ? measure(mixer, holder, walkAction, footL, footR) : null
      const run = runAction && footL && footR ? measure(mixer, holder, runAction, footL, footR) : null
      holder.scale.setScalar(M)
      const idle = action('Idle')
      const wave = action('Wave')
      if (wave) {
        wave.setLoop(THREE.LoopOnce, 1)
        wave.clampWhenFinished = true
      }
      // all the gaits running together, weighted; the walk and run held
      // still by the clock (their place is set from the distance walked)
      for (const gait of [walk, run]) {
        if (!gait) continue
        gait.action.reset().play()
        gait.action.setEffectiveTimeScale(0)
        gait.action.setEffectiveWeight(0)
      }
      idle?.reset().play()
      idle?.setEffectiveWeight(1)
      onReady({
        holder,
        mixer,
        idle,
        wave,
        walk,
        run,
        bones: {
          hipL: bone(scene, 'UpperLeg.L'),
          hipR: bone(scene, 'UpperLeg.R'),
          kneeL: bone(scene, 'LowerLeg.L'),
          kneeR: bone(scene, 'LowerLeg.R'),
          footL,
          footR,
          armL: bone(scene, 'UpperArm.L'),
          armR: bone(scene, 'UpperArm.R'),
          foreR: bone(scene, 'LowerArm.R'),
          spine: bone(scene, 'Torso') ?? bone(scene, 'Abdomen'),
          neck: bone(scene, 'Neck'),
          head: bone(scene, 'Head'),
        },
        phase: 0,
        weights: { idle: 1, walk: 0, run: 0, wave: 0 },
        runMix: 0,
        airPose: 0,
        squash: 0,
        airTime: 0,
        waving: false,
        waved: false,
        lookYaw: 0,
        lookPitch: 0,
      })
    },
    undefined,
    () => onFail(),
  )
}

/* a bone turned about an axis given in the scene (the figure's right,
   say), whatever its own axes */
function bend(bone: THREE.Object3D | null, axis: THREE.Vector3, angle: number) {
  if (!bone || !bone.parent || Math.abs(angle) < 1e-4) return
  bone.parent.getWorldQuaternion(_pq)
  _axis.copy(axis).applyQuaternion(_pq.invert()).normalize()
  bone.quaternion.premultiply(_q.setFromAxisAngle(_axis, angle))
}

/* a foot put back where its shin now ends (its place in the shin's frame,
   taken before the shin was bent), its own turn left as it was */
function follow(shin: THREE.Object3D | null, foot: THREE.Object3D | null, at: THREE.Vector3 | null) {
  if (!shin || !foot || !foot.parent || !at) return
  shin.updateWorldMatrix(true, false)
  const world = shin.localToWorld(at)
  foot.parent.updateWorldMatrix(true, false)
  foot.position.copy(foot.parent.worldToLocal(world))
}
const _footL = new THREE.Vector3()
const _footR = new THREE.Vector3()
const _wasL = new THREE.Vector3()
const _wasR = new THREE.Vector3()
const _nowL = new THREE.Vector3()
const _nowR = new THREE.Vector3()

const smooth = THREE.MathUtils.smoothstep
const frac = (x: number) => x - Math.floor(x)

/** a frame of the figure: right and up are its own in the scene, lookYaw
    how far round (left +) your view is from the way it faces; returns how
    far it dips (m) as the knees bend, standing */
export function animateFigure(figure: Figure, delta: number, right: THREE.Vector3, up: THREE.Vector3, lookYaw: number) {
  const { speed, loping, hop, walkPace } = walkerBody
  const dt = Math.min(delta, 0.05)
  const inJump = hop > 0.08 && !loping
  const grounded = hop <= 0.02

  // ---- which gaits, how much: standing, walking, running (or the lope),
  // by how much faster than this world's walking pace you go
  const walkSpeed = figure.walk?.speed ?? 1.4
  const runSpeed = figure.run?.speed ?? 4
  const runWant = loping ? 1 : smooth(speed, walkPace * 1.2, walkPace * 1.7)
  figure.runMix += (runWant - figure.runMix) * (1 - Math.exp(-dt * 6))
  const moving = smooth(speed, 0.04, 0.35)
  // a wave, once, standing, as you first turn to watch yourself
  if (!figure.waved && figure.wave && speed < 0.1 && grounded) {
    figure.waved = true
    figure.waving = true
    figure.wave.reset().play()
  }
  if (figure.waving && (moving > 0.2 || !figure.wave || figure.wave.time >= figure.wave.getClip().duration * 0.97)) {
    figure.waving = false
  }
  const target = figure.waving
    ? { idle: 0, walk: 0, run: 0, wave: 1 }
    : { idle: 1 - moving, walk: moving * (1 - figure.runMix), run: moving * figure.runMix, wave: 0 }
  const ease = 1 - Math.exp(-dt * 10)
  const w = figure.weights
  w.idle += (target.idle - w.idle) * ease
  w.walk += (target.walk - w.walk) * ease
  w.run += (target.run - w.run) * ease
  w.wave += (target.wave - w.wave) * ease
  figure.idle?.setEffectiveWeight(w.idle)
  figure.walk?.action.setEffectiveWeight(w.walk)
  figure.run?.action.setEffectiveWeight(w.run)
  if (figure.wave) {
    figure.wave.setEffectiveWeight(w.wave)
    if (w.wave < 0.01 && !figure.waving) figure.wave.stop()
  }

  // ---- the gait's place in its cycle, from the ground covered (a slow
  // drift in the air, the legs held mid-stride). Faster than the
  // animation's own pace, the strides lengthen a little as well as
  // quicken (all cadence, the legs would whirl)
  const gaitSpeed = THREE.MathUtils.lerp(walkSpeed, runSpeed, figure.runMix)
  const reach = Math.max(1, speed / gaitSpeed) ** 0.35
  const stride = THREE.MathUtils.lerp(figure.walk?.stride ?? 1.4, figure.run?.stride ?? 2.4, figure.runMix) * reach
  // a lope's bound: the legs slow while it carries you
  const drift = inJump ? 0.15 : loping && hop > 0.03 ? 0.5 : 1
  figure.phase += (speed * drift * dt) / stride
  for (const gait of [figure.walk, figure.run]) {
    if (gait) gait.action.time = frac(figure.phase + gait.offset) * gait.duration
  }
  /* (the mixer writes a bone only when its animated value has changed
     since the last frame: standing, much of the pose holds still, and
     what is bent below would pile up frame on frame, folding the figure
     over. So each bone bent is first put back as the animation left it) */
  const touched = Object.values(figure.bones)
  for (const bone of touched) {
    const was = bone?.userData.posed as { p: THREE.Vector3; q: THREE.Quaternion } | undefined
    if (bone && was) {
      bone.position.copy(was.p)
      bone.quaternion.copy(was.q)
    }
  }
  figure.mixer.update(dt)
  for (const bone of touched) {
    if (!bone) continue
    const was = (bone.userData.posed ??= { p: new THREE.Vector3(), q: new THREE.Quaternion() }) as { p: THREE.Vector3; q: THREE.Quaternion }
    was.p.copy(bone.position)
    was.q.copy(bone.quaternion)
  }

  // ---- on top: a jump's tuck, a landing's squash, a crouch, a lean
  const airWant = inJump ? 1 : loping && hop > 0.03 ? 0.3 : 0
  figure.airPose += (airWant - figure.airPose) * (1 - Math.exp(-dt * (airWant > figure.airPose ? 9 : 14)))
  if (inJump) figure.airTime += dt
  else if (grounded) {
    if (figure.airTime > 0.25) figure.squash = Math.min(1, 0.45 + figure.airTime * 0.35)
    figure.airTime = 0
  }
  figure.squash *= Math.exp(-dt * 7)
  const a = figure.airPose
  const sq = figure.squash
  const c = walkerBody.crouch
  const b = figure.bones
  /* (about the figure's right: a positive turn swings a hanging limb
     forward, and tips an upright one back). In this rig the feet are not
     the shins' children but controls of their own under the root: bent
     alone, the shins left the feet where the animation had put them and
     the boots stretched between, long and splayed. So each foot is
     carried with its shin, kept level. */
  const carry = () => {
    b.kneeL?.updateWorldMatrix(true, false)
    b.kneeR?.updateWorldMatrix(true, false)
    return [
      b.kneeL && b.footL ? b.kneeL.worldToLocal(b.footL.getWorldPosition(_footL)) : null,
      b.kneeR && b.footR ? b.kneeR.worldToLocal(b.footR.getWorldPosition(_footR)) : null,
    ] as const
  }
  // standing poses first (a landing's squash, a crouch): the feet stay on
  // the ground, so the body comes down by as much as they would rise
  let dip = 0
  if (sq > 0.01 || c > 0.01) {
    b.footL?.getWorldPosition(_wasL)
    b.footR?.getWorldPosition(_wasR)
    const [atL, atR] = carry()
    bend(b.hipL, right, 0.45 * sq + 1.15 * c)
    bend(b.hipR, right, 0.45 * sq + 0.95 * c)
    bend(b.kneeL, right, -0.75 * sq - 1.7 * c)
    bend(b.kneeR, right, -0.75 * sq - 1.45 * c)
    follow(b.kneeL, b.footL, atL)
    follow(b.kneeR, b.footR, atR)
    if (b.footL && b.footR) {
      const riseL = b.footL.getWorldPosition(_nowL).sub(_wasL).dot(up)
      const riseR = b.footR.getWorldPosition(_nowR).sub(_wasR).dot(up)
      dip = Math.max(0, Math.min(riseL, riseR)) / M
    }
  }
  // in the air: the thighs come forward and the knees bend just enough to
  // keep the feet under the body (a gentle pose, as the Apollo crews hopped)
  if (a > 0.01) {
    const [atL, atR] = carry()
    bend(b.hipL, right, 0.55 * a)
    bend(b.hipR, right, 0.42 * a)
    bend(b.kneeL, right, -0.62 * a)
    bend(b.kneeR, right, -0.5 * a)
    follow(b.kneeL, b.footL, atL)
    follow(b.kneeR, b.footR, atR)
  }
  bend(b.armL, right, 0.35 * a + 0.25 * c)
  // crouched, the right hand reaches down for the sample
  bend(b.armR, right, 0.35 * a + 0.75 * c)
  bend(b.foreR, right, 0.35 * c)
  // a lean: forward into the run, up a slope, over the knees as they take
  // a landing, and in over a sample
  const climb = THREE.MathUtils.clamp(walkerBody.slope, -0.4, 0.8) * moving
  bend(b.spine, right, -((0.05 + 0.06 * (reach - 1)) * figure.runMix * moving + 0.3 * climb + 0.25 * sq + 0.55 * c))
  // ---- the head: round to where you look (as far as a neck in a suit
  // goes), up or down with it; down to the ground, crouched
  const headEase = 1 - Math.exp(-dt * 6)
  figure.lookYaw += (THREE.MathUtils.clamp(lookYaw, -1.1, 1.1) - figure.lookYaw) * headEase
  figure.lookPitch += (THREE.MathUtils.clamp(walkerBody.pitch, -0.6, 0.6) - figure.lookPitch) * headEase
  bend(b.neck, up, figure.lookYaw * 0.4)
  bend(b.head, up, figure.lookYaw * 0.6)
  bend(b.head, right, figure.lookPitch * 0.7 * (1 - c) - 0.45 * c)
  return dip
}
