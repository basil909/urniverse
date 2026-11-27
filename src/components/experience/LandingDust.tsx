'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { pilot } from './pilotState'
import { ground, groundAltitude, sphereUv } from './groundState'
import { ON_WHEELS, SHIP_LENGTH } from './flightShip'
import { shipCamera } from './shipLayer'

/* ============================================================
   DUST, LANDING AND TAKING OFF
   Drawn in the ship's own layer (the ship one unit long at the origin),
   but fixed to the ground, not the ship: the dust is kept about a point
   on the ground (the anchor) and the whole cloud shifted each frame by
   how far the ship has moved from it.
   - touchdown: a burst at each main wheel, thrown low and outward;
   - the roll-out: a trail from the main wheels, more the faster they go;
   - taking off: the engines' blast scouring the ground behind the ship,
     fast and low, dying away as it climbs.
   - flying low and fast through air: the wake whips the ground up below
     and behind the ship, dust over land and spray over the sea; and in
     vacuum, the engines' blast scours the ground if you skim it;
   - in Earth's moist air, a hard pull or turn draws vapour trails off the
     wingtips (the air's pressure drops there, and its water condenses).
   With no air, dust flies on clean ballistic arcs under the world's own
   gravity and stops where it lands (no billowing, nothing hangs); in air
   it is slowed, rises a little, spreads into puffs and lingers.
============================================================ */

const COUNT = 2600
const METRES = 37.24 // the ship's length

/* surface gravity (m/s2) and the dust's colour, by world */
const WORLD: Record<number, { g: number; color: string }> = {
  0: { g: 3.7, color: '#8a837a' }, // Mercury
  2: { g: 9.81, color: '#9a8a72' }, // Earth (dry ground)
  3: { g: 3.71, color: '#b06a44' }, // Mars: rust
  12: { g: 1.62, color: '#8e8c88' }, // the Moon: grey
  13: { g: 1.8, color: '#c9b860' }, // Io: sulphur
  14: { g: 1.31, color: '#d6d3cc' }, // Europa: ice
  15: { g: 1.43, color: '#8f877c' }, // Ganymede
  16: { g: 1.24, color: '#6f675e' }, // Callisto
  17: { g: 1.35, color: '#8a6a3e' }, // Titan: organic sand
  18: { g: 0.0057, color: '#5e5852' }, // Phobos
  19: { g: 0.003, color: '#6a635b' }, // Deimos
}
const OTHER = { g: 2, color: '#8a847c' }

/* the main wheels' contact points and the engines' line (ship lengths,
   the ship's own frame: nose to -z, up +y) */
const WHEELS = [
  [0.104, -ON_WHEELS, 0.21],
  [0.082, -ON_WHEELS, 0.21],
  [-0.082, -ON_WHEELS, 0.21],
  [-0.104, -ON_WHEELS, 0.21],
] as const
/* the wingtips' trailing corners (ship lengths, the ship's own frame) */
const TIPS = [
  [0.305, -0.108, 0.405],
  [-0.305, -0.108, 0.405],
] as const
const SPRAY = '#eef2f5'

const VERTEX = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aTint;
uniform float uScale;
varying float vAlpha;
varying float vTint;
void main() {
  vTint = aTint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 1e-4), 0.0, 256.0);
  vAlpha = aAlpha;
}`
const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uSpray;
varying float vAlpha;
varying float vTint;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = vAlpha * (1.0 - smoothstep(0.35, 1.0, d));
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(uColor, uSpray, vTint) * (0.8 + 0.2 * (1.0 - d)), a);
}`

const _up = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _dummyP = new THREE.Vector3()
const _dummyS = new THREE.Vector3()
const _point = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _side = new THREE.Vector3()
const _back = new THREE.Vector3()
const _shipVel = new THREE.Vector3()
const _toShip = new THREE.Vector3()
const _local = new THREE.Vector3()
const _trail = new THREE.Vector3()

export default function LandingDust({ jetRef }: { jetRef: React.RefObject<THREE.Object3D | null> }) {
  const size = useThree((state) => state.size)
  const gl = useThree((state) => state.gl)
  const parts = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    const position = new Float32Array(COUNT * 3)
    const sizes = new Float32Array(COUNT)
    const alphas = new Float32Array(COUNT)
    const tints = new Float32Array(COUNT)
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))
    geometry.setAttribute('aTint', new THREE.BufferAttribute(tints, 1))
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    const material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uColor: { value: new THREE.Color(OTHER.color) }, uSpray: { value: new THREE.Color(SPRAY) } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
    })
    return {
      geometry,
      material,
      position,
      sizes,
      alphas,
      tints,
      // per particle: velocity (ship lengths a second), age, life, size, growth; settled;
      // how much of the world's pull it feels (vapour none) and how bright (0..1)
      weight: new Float32Array(COUNT).fill(1),
      bright: new Float32Array(COUNT).fill(1),
      velocity: new Float32Array(COUNT * 3),
      age: new Float32Array(COUNT).fill(1e9),
      life: new Float32Array(COUNT).fill(1),
      base: new Float32Array(COUNT),
      settled: new Uint8Array(COUNT),
      next: 0,
      live: 0,
      anchor: new THREE.Vector3(),
      anchored: false,
      lastShip: new THREE.Vector3(),
      hadShip: false,
      lastLand: '',
      emitCarry: 0,
      skimCarry: 0,
      tipCarry: 0,
    }
  }, [])
  useEffect(
    () => () => {
      parts.geometry.dispose()
      parts.material.dispose()
    },
    [parts],
  )
  const points = useRef<THREE.Points>(null)

  useFrame((_, rawDelta) => {
    const jet = jetRef.current
    const mesh = points.current
    if (!jet || !mesh) return
    const dt = Math.min(rawDelta, 0.05)
    const p = parts
    const land = pilot.landState
    const world = WORLD[pilot.nearestIndex] ?? OTHER
    ;(p.material.uniforms.uColor.value as THREE.Color).set(world.color)
    // the size a particle a ship length across is drawn at, a unit away
    p.material.uniforms.uScale.value = (size.height * gl.getPixelRatio() * 0.5) / Math.tan(THREE.MathUtils.degToRad(shipCamera.fov / 2))

    // the ground's up here, and how high the ship stands over it (ship lengths)
    const onWorld = ground.ready && ground.body === pilot.nearestIndex
    if (onWorld) {
      ground.matrix.decompose(_dummyP, _quat, _dummyS)
      _up.copy(jet.position).applyMatrix4(ground.inverse).normalize().applyQuaternion(_quat)
    }
    const above = onWorld ? groundAltitude(jet.position) / SHIP_LENGTH : Infinity
    // the ship's velocity over the ground (ship lengths a second)
    if (p.hadShip && dt > 0) _shipVel.copy(jet.position).sub(p.lastShip).divideScalar(SHIP_LENGTH * Math.max(rawDelta, 1e-3))
    else _shipVel.set(0, 0, 0)
    if (_shipVel.length() > 400) _shipVel.set(0, 0, 0)
    p.lastShip.copy(jet.position)
    p.hadShip = true

    const g = world.g / METRES
    const air = pilot.air
    const metresPerSec = 1 / METRES

    // a new cloud is kept about the ship's place when it starts
    const anchorNow = () => {
      if (p.live === 0 || !p.anchored) {
        p.anchor.copy(jet.position)
        p.anchored = true
      }
    }
    // the ship's place relative to the anchor (ship lengths)
    const shipFromAnchor = () => _toShip.copy(jet.position).sub(p.anchor).divideScalar(SHIP_LENGTH)

    // a grain at a point in the ship's own frame (ship lengths), shifted by
    // an offset in the scene's axes; tinted towards white (spray, vapour),
    // feeling the world's pull by weight
    const emit = (x: number, y: number, z: number, vel: THREE.Vector3, sizeM: number, life: number, tint = 0, weight = 1, bright = 1, offset?: THREE.Vector3) => {
      const i = p.next
      p.next = (p.next + 1) % COUNT
      _point.set(x, y, z).applyQuaternion(jet.quaternion).add(shipFromAnchor())
      if (offset) _point.add(offset)
      p.tints[i] = tint
      p.weight[i] = weight
      p.bright[i] = bright
      p.position[i * 3] = _point.x
      p.position[i * 3 + 1] = _point.y
      p.position[i * 3 + 2] = _point.z
      p.velocity[i * 3] = vel.x
      p.velocity[i * 3 + 1] = vel.y
      p.velocity[i * 3 + 2] = vel.z
      p.age[i] = 0
      p.life[i] = life
      p.base[i] = sizeM / METRES
      p.settled[i] = 0
    }
    const rand = (a: number, b: number) => a + Math.random() * (b - a)

    if (onWorld && above < ON_WHEELS + 3) {
      _side.set(1, 0, 0).applyQuaternion(jet.quaternion)
      _back.set(0, 0, 1).applyQuaternion(jet.quaternion)
      // keep them along the ground
      _side.addScaledVector(_up, -_side.dot(_up)).normalize()
      _back.addScaledVector(_up, -_back.dot(_up)).normalize()
      const shipSpeed = _shipVel.length() / metresPerSec // m/s

      // ---- touchdown: a burst at each main wheel
      if (land === 'rolling' && p.lastLand === 'landing') {
        anchorNow()
        for (const wheel of WHEELS) {
          for (let k = 0; k < 70; k += 1) {
            const out = rand(-1, 1)
            _dir
              .copy(_shipVel)
              .multiplyScalar(rand(0.15, 0.45))
              .addScaledVector(_side, out * rand(4, 14) * metresPerSec)
              .addScaledVector(_up, rand(1.5, 6) * metresPerSec)
            emit(wheel[0], wheel[1], wheel[2], _dir, rand(0.8, 2.2), rand(1.6, 3))
          }
        }
      }

      // ---- the roll-out: a trail from the main wheels
      if (land === 'rolling' && shipSpeed > 4) {
        anchorNow()
        p.emitCarry += dt * 180 * Math.min(shipSpeed / 90, 1.2)
        while (p.emitCarry >= 1) {
          p.emitCarry -= 1
          const wheel = WHEELS[Math.floor(Math.random() * WHEELS.length)]
          _dir
            .copy(_shipVel)
            .multiplyScalar(rand(0.05, 0.3))
            .addScaledVector(_side, rand(-1, 1) * rand(1, 5) * metresPerSec)
            .addScaledVector(_up, rand(0.8, 3.5) * metresPerSec)
          emit(wheel[0], wheel[1], wheel[2], _dir, rand(0.6, 1.6), rand(1.4, 2.6))
        }
      }

      // ---- taking off: the engines scour the ground behind
      if (land === 'lifting' || (land === 'landed' && pilot.thrust > 0.3)) {
        const low = 1 - THREE.MathUtils.smoothstep(above - ON_WHEELS, 0, 1.6)
        if (low > 0.01) {
          anchorNow()
          p.emitCarry += dt * 420 * low
          while (p.emitCarry >= 1) {
            p.emitCarry -= 1
            // where the exhaust meets the ground, behind the ship
            const behind = rand(0.55, 1.4)
            const across = rand(-0.12, 0.12) * behind
            const fan = rand(-1, 1)
            _dir
              .copy(_back)
              .multiplyScalar(rand(14, 42) * metresPerSec)
              .addScaledVector(_side, fan * rand(4, 18) * metresPerSec)
              .addScaledVector(_up, rand(0.5, 4) * metresPerSec)
            emit(across, -above, behind, _dir, rand(0.8, 2.6), rand(1.2, 2.4))
          }
        }
      }

      // ---- skimming the ground: the wake (in air) or the engines' blast
      // (in vacuum) throws it up below and behind
      const airborne = land === 'flying' || land === 'descending' || land === 'landing'
      const clear = above - ON_WHEELS
      const blast = air < 0.02 ? Math.min(1, pilot.thrust * 1.5) : 1
      const skim = airborne ? (1 - THREE.MathUtils.smoothstep(clear, 0.25, 3.4)) * THREE.MathUtils.smoothstep(shipSpeed, 25, 90) * blast : 0
      if (skim > 0.01) {
        anchorNow()
        // over the sea (Earth's map), spray; else dust (thin over Earth's land: grass, fields)
        _local.copy(jet.position).applyMatrix4(ground.inverse).normalize()
        const [u, v] = sphereUv(_local)
        const sea = ground.model ? 1 - ground.model.land(u, v) : 0
        const wet = sea > 0.5
        const rate = (wet ? 380 : pilot.nearestIndex === 2 ? 220 : 320) * skim
        p.skimCarry += dt * rate
        while (p.skimCarry >= 1) {
          p.skimCarry -= 1
          // somewhere under the ship or in its wake
          const along = rand(-0.35, 1.6)
          _trail.copy(_up).multiplyScalar(-above).addScaledVector(_back, along).addScaledVector(_side, rand(-0.45, 0.45) * (1 + along * 0.4))
          _dir
            .copy(_shipVel)
            .multiplyScalar(rand(0.08, 0.35))
            .addScaledVector(_side, rand(-1, 1) * rand(2, 9) * metresPerSec)
            .addScaledVector(_up, (wet ? rand(3, 14) : rand(1, 7)) * metresPerSec)
          emit(0, 0, 0, _dir, wet ? rand(1.6, 3.8) : rand(1.3, 3.4), rand(1.1, 2.4), wet ? 1 : 0, wet ? 0.8 : 1, wet ? 0.9 : 1, _trail)
        }
      }
    }

    // ---- vapour off the wingtips: Earth's moist air, fast, pulling hard
    if (onWorld && pilot.nearestIndex === 2 && air > 0.25 && (land === 'flying' || land === 'descending' || land === 'landing')) {
      const shipSpeed = _shipVel.length() / metresPerSec
      const pull = Math.max(Math.abs(pilot.turn.pitch) * 1.4, Math.abs(pilot.turn.yaw) * 1.1, Math.abs(pilot.turn.roll) * 0.35)
      const vapour = THREE.MathUtils.smoothstep(pull, 0.25, 0.9) * THREE.MathUtils.smoothstep(shipSpeed, 70, 160) * Math.min(1, (air - 0.25) * 3)
      if (vapour > 0.02) {
        anchorNow()
        // laid along the path the tips took this frame, so the trail is unbroken
        p.tipCarry += dt * 260
        const n = Math.floor(p.tipCarry)
        p.tipCarry -= n
        for (let k = 0; k < n; k += 1) {
          const back = (k + Math.random()) / Math.max(n, 1)
          for (const tip of TIPS) {
            _trail.copy(_shipVel).multiplyScalar(-dt * back)
            _dir.set(rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3)).multiplyScalar(metresPerSec)
            emit(tip[0], tip[1], tip[2], _dir, rand(0.35, 0.7), rand(0.7, 1.3) * (0.5 + vapour * 0.5), 1, 0, 0.55 * vapour, _trail)
          }
        }
      }
    }
    p.lastLand = land

    // ---- the cloud: moved, slowed by air, settling on the ground
    const fromShip = shipFromAnchor()
    // the ground, as a plane through the point under the ship
    const groundD = onWorld ? fromShip.dot(_up) - above : -Infinity
    const drag = Math.exp(-dt * (0.15 + air * 2.6))
    const lift = air > 0.02 ? Math.min(air, 1) * 0.65 : 0
    let live = 0
    for (let i = 0; i < COUNT; i += 1) {
      if (p.age[i] > p.life[i]) {
        p.alphas[i] = 0
        continue
      }
      live += 1
      p.age[i] += dt
      const t = p.age[i] / p.life[i]
      const j = i * 3
      if (!p.settled[i]) {
        if (air > 0.02) {
          p.velocity[j] *= drag
          p.velocity[j + 1] *= drag
          p.velocity[j + 2] *= drag
        }
        // gravity (lessened in air, where fine dust floats)
        const fall = g * (1 - lift) * dt * p.weight[i]
        p.velocity[j] -= _up.x * fall
        p.velocity[j + 1] -= _up.y * fall
        p.velocity[j + 2] -= _up.z * fall
        p.position[j] += p.velocity[j] * dt
        p.position[j + 1] += p.velocity[j + 1] * dt
        p.position[j + 2] += p.velocity[j + 2] * dt
        // met the ground: with no air it stops dead; in air it drifts on
        if (onWorld) {
          const h = p.position[j] * _up.x + p.position[j + 1] * _up.y + p.position[j + 2] * _up.z - groundD
          if (h < 0) {
            p.position[j] -= _up.x * h
            p.position[j + 1] -= _up.y * h
            p.position[j + 2] -= _up.z * h
            if (air < 0.02) {
              p.settled[i] = 1
              // fades quickly once down
              p.life[i] = Math.min(p.life[i], p.age[i] + 0.35)
            } else {
              const vn = p.velocity[j] * _up.x + p.velocity[j + 1] * _up.y + p.velocity[j + 2] * _up.z
              p.velocity[j] -= _up.x * vn
              p.velocity[j + 1] -= _up.y * vn
              p.velocity[j + 2] -= _up.z * vn
            }
          }
        }
      }
      // in air a puff spreads and thins; in vacuum a grain stays a grain
      const grow = 1 + (air > 0.02 ? t * 3.5 * Math.min(air * 3, 1) : t * 0.4)
      p.sizes[i] = p.base[i] * grow
      p.alphas[i] = p.bright[i] * (air > 0.02 ? 0.42 : 0.6) * THREE.MathUtils.smoothstep(t, 0, 0.06) * (1 - THREE.MathUtils.smoothstep(t, 0.55, 1))
    }
    p.live = live
    if (live === 0) p.anchored = false
    mesh.visible = live > 0
    if (live === 0) return
    // the cloud, about its anchor, seen from the ship's place
    mesh.position.copy(fromShip).multiplyScalar(-1)
    p.geometry.attributes.position.needsUpdate = true
    ;(p.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true
    ;(p.geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true
    ;(p.geometry.attributes.aTint as THREE.BufferAttribute).needsUpdate = true
  })

  return <points ref={points} geometry={parts.geometry} material={parts.material} frustumCulled={false} visible={false} renderOrder={2} />
}
