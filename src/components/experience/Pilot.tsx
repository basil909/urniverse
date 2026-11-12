'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

import {
  AU_UNITS,
  BODY_COUNT,
  farScale,
  getBodyName,
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
import { cloudDeck, ground, groundAltitude, groundLatLon, ringState, shipShadow, sphereUv } from './groundState'
import { FEATURES } from './features'
import { CLOUD_BASE_KM, CLOUD_TOP_KM } from './clouds'
import { earthToday } from './earthToday'
import {
  FIRST_CRAFT_ID,
  COMET_ID,
  FIRST_STAR_ID,
  NAMED_STARS,
  roverGround,
  SPACECRAFT,
  starColor,
  starTemperature,
} from './spaceBodies'
import { sunVisibility } from './sunVisibility'
import { KM_PER_UNIT, LIGHT, LOWEST, SHIP_LENGTH, WARP } from './flightShip'
import { flyLanding } from './flightLanding'
import { planWarp, stepWarp, type Warp } from './flightWarp'
import { placeCamera } from './flightCamera'
import CometEncke from './CometEncke'
import { AsteroidField, TrojanBodies } from './AsteroidField'

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

const _forward = new THREE.Vector3()
const _up = new THREE.Vector3()
const _right = new THREE.Vector3()
const _bodyPos = new THREE.Vector3()
const _camPos = new THREE.Vector3()
const _turn = new THREE.Quaternion()
const _axis = new THREE.Vector3()
const _bodyCenter = new THREE.Vector3()
const _local = new THREE.Vector3()
const _craft = new THREE.Vector3()
const _craftUp = new THREE.Vector3()
const _craftM = new THREE.Matrix4()
const _starTint = new THREE.Color()
const SHIP_M = 37.24

/* ============================================================
   SPACECRAFT, AT THEIR TRUE SIZES
   NASA's models, drawn in the ship's layer (in ship lengths) when within
   a couple of hundred km: the Space Station's 109 m truss, Hubble's 13 m
   tube, Webb's 21 m sunshield, Voyager, Perseverance. Hidden when the
   world below stands between them and the camera.
============================================================ */
const craftModels = new Map<string, Promise<THREE.Object3D>>()
function loadModel(url: string) {
  let pending = craftModels.get(url)
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const draco = new DRACOLoader().setDecoderPath('/draco/')
      new GLTFLoader().setDRACOLoader(draco).load(
        url,
        (gltf) => {
          // centred, one unit across at its widest
          const box = new THREE.Box3().setFromObject(gltf.scene)
          const size = box.getSize(new THREE.Vector3())
          const centre = box.getCenter(new THREE.Vector3())
          const holder = new THREE.Group()
          gltf.scene.position.sub(centre)
          holder.add(gltf.scene)
          holder.scale.setScalar(1 / Math.max(size.x, size.y, size.z))
          const wrapper = new THREE.Group()
          wrapper.add(holder)
          resolve(wrapper)
        },
        undefined,
        reject,
      )
    })
    craftModels.set(url, pending)
  }
  return pending
}

function Spacecraft({ jetRef }: { jetRef: { current: THREE.Group | null } }) {
  const [models, setModels] = useState<(THREE.Object3D | null)[]>(() => SPACECRAFT.map(() => null))
  const holders = useRef<(THREE.Group | null)[]>([])
  const wanted = useRef(false)
  useFrame(() => {
    const jet = jetRef.current
    if (!jet || !pilot.active) return
    if (!wanted.current) {
      // load the models the first time we fly (the Voyager file serves both)
      wanted.current = true
      SPACECRAFT.forEach((craft, i) =>
        loadModel(craft.model)
          .then((model) => setModels((list) => list.map((m, j) => (j === i ? (craft.name === 'Voyager 2' ? model.clone() : model) : m))))
          .catch(() => {}),
      )
    }
    const L = SHIP_LENGTH
    SPACECRAFT.forEach((craft, i) => {
      const holder = holders.current[i]
      if (!holder) return
      getBodyPosition(FIRST_CRAFT_ID + i, simClock.jd, _craft)
      _local.copy(_craft).sub(jet.position)
      const away = _local.length()
      let shown = away < L * 6000
      // behind the nearest world? (a planet between the camera and it)
      if (shown && pilot.nearestIndex >= 0 && pilot.nearestIndex < FIRST_CRAFT_ID) {
        getBodyPosition(pilot.nearestIndex, simClock.jd, _craftUp)
        const r = getBodyRadius(pilot.nearestIndex)
        const along = THREE.MathUtils.clamp(_craftUp.clone().sub(jet.position).dot(_local) / (away * away), 0, 1)
        const nearestPoint = jet.position.clone().addScaledVector(_local, along)
        if (nearestPoint.distanceTo(_craftUp) < r * 0.999 && craft.kind !== 'rover') shown = false
      }
      holder.visible = shown
      if (!shown) return
      holder.position.copy(_local).divideScalar(L)
      holder.scale.setScalar(craft.sizeM / SHIP_M)
      // how each one faces
      if (craft.kind === 'orbit' || craft.kind === 'rover') {
        getBodyPosition(craft.kind === 'rover' ? 3 : 2, simClock.jd, _craftUp)
        _craftUp.subVectors(_craft, _craftUp).normalize()
        _craftM.lookAt(_camPos.set(0, 0, 0), _local.set(_craftUp.y, -_craftUp.x, 0.3).normalize(), _craftUp)
      } else {
        // Webb's shield and Voyager's dish towards the Sun
        _craftUp.copy(SYSTEM_OFFSET).sub(_craft).normalize()
        _craftM.lookAt(_camPos.set(0, 0, 0), _craftUp, _local.set(0, 1, 0))
      }
      holder.quaternion.setFromRotationMatrix(_craftM)
    })
  })
  return (
    <>
      {SPACECRAFT.map((craft, i) => (
        <group
          key={craft.name}
          ref={(group) => {
            holders.current[i] = group
          }}
          visible={false}
        >
          {models[i] && <primitive object={models[i]!} />}
        </group>
      ))}
    </>
  )
}

/* ============================================================
   A NEARBY STAR, UP CLOSE
   Arriving at another star: a glowing ball at its true size, in its
   colour (from its temperature), with a glare of fixed apparent size, all
   drawn nearer and smaller along the line of sight when far (as the Sun).
============================================================ */
const STAR_GLARE_FRAGMENT = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float glow = pow(max(1.0 - r, 0.0), 4.0) * 0.6 + exp(-r * 20.0) * 3.0;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), exp(-r * 12.0)) * glow * uOpacity, 1.0);
}`
const STAR_GLARE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

function NearStar() {
  const camera = useThree((state) => state.camera)
  const group = useRef<THREE.Group>(null)
  const ball = useRef<THREE.Mesh>(null)
  const glare = useRef<THREE.Mesh>(null)
  const parts = useMemo(
    () => ({
      // its colour, dimmer and redder towards the limb (as the Sun's)
      ballMaterial: new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() } },
        vertexShader: /* glsl */ `
          varying vec3 vNormalView; varying vec3 vViewPos;
          void main() {
            vNormalView = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vViewPos = mv.xyz;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying vec3 vNormalView; varying vec3 vViewPos;
          void main() {
            float mu = clamp(dot(normalize(vNormalView), normalize(-vViewPos)), 0.0, 1.0);
            vec3 limb = mix(uColor * vec3(1.0, 0.7, 0.5), uColor, pow(mu, 0.45));
            gl_FragColor = vec4(limb * (0.45 + 0.75 * pow(mu, 0.6)), 1.0);
          }`,
        toneMapped: false,
      }),
      glareMaterial: new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 1 } },
        vertexShader: STAR_GLARE_VERTEX,
        fragmentShader: STAR_GLARE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    }),
    [],
  )
  useEffect(
    () => () => {
      parts.ballMaterial.dispose()
      parts.glareMaterial.dispose()
    },
    [parts],
  )
  useFrame(() => {
    const g = group.current
    if (!g) return
    const id = pilot.nearestIndex
    const star = id >= FIRST_STAR_ID ? NAMED_STARS[id - FIRST_STAR_ID] : undefined
    g.visible = !!star && pilot.active
    if (!star) return
    getBodyPosition(id, simClock.jd, _craft)
    const radius = getBodyRadius(id)
    const distance = _craft.distanceTo(camera.position)
    const far = farScale(distance)
    g.position.copy(_craft).sub(camera.position).multiplyScalar(far).add(camera.position)
    starColor(starTemperature(star.ci), _starTint)
    parts.ballMaterial.uniforms.uColor.value.copy(_starTint)
    ball.current?.scale.setScalar(radius * far)
    parts.glareMaterial.uniforms.uColor.value.copy(_starTint)
    if (glare.current) {
      glare.current.lookAt(camera.position)
      const shown = distance * far
      // a glare some 10 degrees across, fading as the star becomes a point
      const fade = THREE.MathUtils.clamp((radius * 2000) / distance, 0.05, 1)
      glare.current.scale.setScalar(2 * Math.tan(THREE.MathUtils.degToRad(5)) * shown * fade)
      parts.glareMaterial.uniforms.uOpacity.value = fade
    }
  })
  return (
    <group ref={group} visible={false}>
      <mesh ref={ball} material={parts.ballMaterial}>
        <sphereGeometry args={[1, 64, 48]} />
      </mesh>
      <mesh ref={glare} material={parts.glareMaterial} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  )
}
/* the quality levels, lowest first: the pixel ratio (null: the screen's
   own) and how fine the marched effects are (0 light .. 2 full) */
/* where every body is this frame (filled by the nearest-body search),
   for the warp's check that a step does not cross a world */
const BODY_PLACES = Array.from({ length: BODY_COUNT }, () => new THREE.Vector3())
const BODY_RADII = new Float64Array(BODY_COUNT)
const _stepFrom = new THREE.Vector3()
const _stepDir = new THREE.Vector3()
const _oc = new THREE.Vector3()
const _hit = new THREE.Vector3()
/* the first world the step from -> to would enter (a little above its
   surface; the Sun well clear of its glare), and where to stop: just
   short of it, on the way in. null if the way is clear */
function sweepBodies(from: THREE.Vector3, to: THREE.Vector3) {
  _stepDir.copy(to).sub(from)
  const length = _stepDir.length()
  if (length < 1e-12) return null
  _stepDir.divideScalar(length)
  let first = Infinity
  // false if the step starts inside this sphere (nothing to enter)
  const test = (centre: THREE.Vector3, radius: number) => {
    _oc.copy(from).sub(centre)
    const b = _oc.dot(_stepDir)
    const c = _oc.lengthSq() - radius * radius
    if (c <= 0) return false
    const disc = b * b - c
    if (disc < 0) return true
    const t = -b - Math.sqrt(disc)
    if (t >= 0 && t <= length && t < first) first = t
    return true
  }
  // a little above each world; skimming lower than that, its surface
  for (let i = 0; i < BODY_COUNT; i += 1) {
    if (!test(BODY_PLACES[i], BODY_RADII[i] * 1.03)) test(BODY_PLACES[i], BODY_RADII[i])
  }
  test(SYSTEM_OFFSET, SUN_TRUE_RADIUS * 1.6)
  if (first === Infinity) return null
  return _hit.copy(from).addScaledVector(_stepDir, Math.max(0, first - length * 1e-4))
}

const QUALITY_DPR: (number | null)[] = [0.75, 1, null, null]
const QUALITY_EFFECTS = [0, 1, 1, 2]
const _orbitM = new THREE.Matrix4()
const _featureDir = new THREE.Vector3()

/* gravity (GM, km^3/s^2) of each body, for circular orbits (O): the
   planets, the four asteroids, the Moon, then the large moons */
const GM = [
  22032, 324859, 398600, 42828, 1.26687e8, 3.7931e7, 5.794e6, 6.8365e6,
  62.6, 17.3, 13.6, 5.8, 4903, 5960, 3203, 9888, 7179, 8978, 7.1e-4, 9.6e-5,
]
const SUN_GM = 1.32712e11

/* the objects the end-of-frame correction moves (see GroundCarry) */
export const pilotObjects = {
  jet: null as THREE.Group | null,
  visual: null as THREE.Group | null,
  camera: null as THREE.PerspectiveCamera | null,
  shipLength: 0,
}
const _carry = new THREE.Matrix4()
const _carryQ = new THREE.Quaternion()
const _carryP = new THREE.Vector3()
const _carryS = new THREE.Vector3()

/* Standing on a world (or flying low over it) the ship is carried with
   it. The world turns and moves after the ship has been placed this
   frame (its turn and orbit are worked out later), so this runs last: it
   moves ship and camera by exactly how the world moved. */
export function GroundCarry() {
  useFrame(() => {
    const { jet, camera } = pilotObjects
    const body = ground.object
    if (!pilot.active || !jet || !camera || !body || ground.body !== pilot.nearestIndex || pilot.orbiting) return
    if (pilot.timeScale <= 0) return
    body.updateWorldMatrix(true, false)
    // how the body moved since the ship was placed
    _carry.copy(body.matrixWorld).multiply(ground.inverse)
    jet.position.applyMatrix4(_carry)
    camera.position.applyMatrix4(_carry)
    _carry.decompose(_carryP, _carryQ, _carryS)
    jet.quaternion.premultiply(_carryQ)
    camera.quaternion.premultiply(_carryQ)
    pilotObjects.visual?.quaternion.copy(jet.quaternion)
    shipCamera.position.copy(camera.position).sub(jet.position).divideScalar(pilotObjects.shipLength)
    shipCamera.quaternion.copy(camera.quaternion)
    ground.matrix.copy(body.matrixWorld)
    ground.inverse.copy(body.matrixWorld).invert()
  })
  return null
}

/* ============================================================
   SATURN'S RINGS, UP CLOSE
   Near the ring plane, within the rings, chunks of ice tumble past: from
   pebbles to boulders a few tens of metres across, in a slab under a km
   thick, as thick as the ring map says the ring is there (none in the
   Cassini Division). They stand still in the rings' frame; the ship
   flies through them. In the ship's layer, in ship lengths.
============================================================ */
const CHUNKS = 900
const CHUNK_BOX = 90 // ship lengths, about 3.4 km

let ringAlpha: { width: number; data: Uint8ClampedArray } | null = null
let ringAlphaLoading = false
function loadRingAlpha() {
  if (ringAlphaLoading) return
  ringAlphaLoading = true
  fetch('/textures/planets/2k_saturn_ring_alpha.png')
    .then((response) => response.blob())
    .then((blob) => createImageBitmap(blob))
    .then((bitmap) => {
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = 1
      const context = canvas.getContext('2d', { willReadFrequently: true })!
      context.drawImage(bitmap, 0, Math.floor(bitmap.height / 2), bitmap.width, 1, 0, 0, bitmap.width, 1)
      ringAlpha = { width: bitmap.width, data: context.getImageData(0, 0, bitmap.width, 1).data }
    })
    .catch(() => {})
}
/* how much ring there is at a distance from Saturn's centre (radii) */
function ringDensity(r: number) {
  if (!ringAlpha) return 0
  const u = (r - 1.24) / (2.35 - 1.24)
  if (u < 0 || u > 1) return 0
  return ringAlpha.data[Math.min(ringAlpha.width - 1, Math.floor(u * ringAlpha.width)) * 4 + 3] / 255
}

function RingChunks({ jetRef }: { jetRef: { current: THREE.Group | null } }) {
  const parts = useMemo(() => {
    const geometry = new THREE.IcosahedronGeometry(1, 2)
    const position = geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < position.count; i += 1) {
      // lumpy: the same direction always gets the same bump
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i)
      const k = 0.8 + 0.35 * Math.abs(Math.sin(x * 5.1 + y * 3.7) * Math.cos(z * 4.3 - x * 2.1))
      position.setXYZ(i, position.getX(i) * k, position.getY(i) * k * 0.8, position.getZ(i) * k)
    }
    geometry.computeVertexNormals()
    const material = new THREE.MeshStandardMaterial({ color: '#e4dfd6', roughness: 0.75, metalness: 0 })
    const seeds = Array.from({ length: CHUNKS }, (_, i) => {
      const r = (n: number) => Math.abs(Math.sin((i + 1) * 12.9898 * n) * 43758.5453) % 1
      return {
        x: (r(1) - 0.5) * CHUNK_BOX,
        y: (r(2) - 0.5) * CHUNK_BOX,
        z: (r(3) - 0.5) * CHUNK_BOX,
        size: 0.05 + Math.pow(r(4), 3) * 1.1,
        keep: r(5),
        spin: (r(6) - 0.5) * 1.2,
        tilt: r(7) * Math.PI,
      }
    })
    return { geometry, material, seeds, matrix: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(), p: new THREE.Vector3() }
  }, [])
  useEffect(() => {
    loadRingAlpha()
    return () => {
      parts.geometry.dispose()
      parts.material.dispose()
    }
  }, [parts])
  const mesh = useRef<THREE.InstancedMesh>(null)
  const _rel = useMemo(() => new THREE.Vector3(), [])
  const _w = useMemo(() => new THREE.Vector3(), [])
  useFrame((state) => {
    const instances = mesh.current
    const jet = jetRef.current
    if (!instances || !jet) return
    let near = false
    if (pilot.active && ringState.ready && pilot.nearestIndex === 5 && ringAlpha) {
      _rel.copy(jet.position).sub(ringState.center)
      const height = _rel.dot(ringState.normal)
      const across = Math.sqrt(Math.max(_rel.lengthSq() - height * height, 0)) / ringState.radius
      near = Math.abs(height) < pilotObjects.shipLength * CHUNK_BOX && across > 1.2 && across < 2.4
    }
    instances.visible = near
    if (!near) return
    const L = pilotObjects.shipLength
    const half = CHUNK_BOX / 2
    const wrap = (v: number) => ((((v + half) % CHUNK_BOX) + CHUNK_BOX) % CHUNK_BOX) - half
    // the ship's place in the rings' frame, in ship lengths
    const jx = _rel.x / L
    const jy = _rel.y / L
    const jz = _rel.z / L
    const time = state.clock.elapsedTime
    parts.seeds.forEach((seed, i) => {
      const x = wrap(seed.x - jx)
      const y = wrap(seed.y - jy)
      const z = wrap(seed.z - jz)
      // is there ring here: within the slab, and as dense as the map says
      _w.set(x, y, z).multiplyScalar(L).add(jet.position).sub(ringState.center)
      const h = _w.dot(ringState.normal)
      const across = Math.sqrt(Math.max(_w.lengthSq() - h * h, 0)) / ringState.radius
      const slab = 1 - THREE.MathUtils.smoothstep(Math.abs(h) / L, 3, 10)
      const shown = seed.keep < ringDensity(across) * slab
      parts.e.set(seed.tilt + time * seed.spin, time * seed.spin * 0.7, seed.tilt * 0.5)
      parts.q.setFromEuler(parts.e)
      parts.s.setScalar(shown ? seed.size : 0)
      parts.matrix.compose(parts.p.set(x, y, z), parts.q, parts.s)
      instances.setMatrixAt(i, parts.matrix)
    })
    instances.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[parts.geometry, parts.material, CHUNKS]} frustumCulled={false} visible={false} />
}

/* diving into clouds (the giants, and Venus): how deep you may go (a
   fraction of the radius), the pressure (bar) and temperature (K) at the
   cloud tops, and how fast it warms with depth (K per km). Below the
   tops the air is close to adiabatic, so pressure grows as temperature
   to the power 3.5: some 16 bar 100 km into Jupiter, 500 at 400 km. */
const DEEP: Record<number, { dive: number; top: number; t0: number; lapse: number }> = {
  1: { dive: 0.008, top: 0.1, t0: 240, lapse: 8 },
  4: { dive: 0.012, top: 0.7, t0: 165, lapse: 2 },
  5: { dive: 0.012, top: 0.7, t0: 134, lapse: 0.85 },
  6: { dive: 0.012, top: 1, t0: 76, lapse: 0.7 },
  7: { dive: 0.012, top: 1, t0: 72, lapse: 0.85 },
}

/* ============================================================
   AIR RUSHING PAST
   Low in an atmosphere, faint streaks of air and dust race past the ship
   at its true speed, so speed near the ground can be felt. They live in
   the ship's own layer, in a box of space a couple of km across that
   travels with it; none in space, where there is nothing to see.
============================================================ */
const STREAKS = 160
const STREAK_BOX = 60 // ship lengths

function AirStreaks({ state }: { state: { velocity: THREE.Vector3; amount: number } }) {
  const parts = useMemo(() => {
    const seeds = new Float32Array(STREAKS * 3)
    for (let i = 0; i < STREAKS * 3; i += 1) seeds[i] = (Math.random() - 0.5) * STREAK_BOX
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(STREAKS * 6)
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), STREAK_BOX)
    const material = new THREE.LineBasicMaterial({
      color: '#dfe8f5',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { seeds, geometry, positions, material, offset: new THREE.Vector3() }
  }, [])
  useEffect(
    () => () => {
      parts.geometry.dispose()
      parts.material.dispose()
    },
    [parts],
  )
  const lines = useRef<THREE.LineSegments>(null)
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const amount = state.amount
    if (lines.current) lines.current.visible = amount > 0.01
    if (amount <= 0.01) return
    // the air stands still; the ship moves through it
    parts.offset.addScaledVector(state.velocity, -delta)
    const speed = state.velocity.length()
    const tail = Math.min(speed * 0.045, 22)
    const half = STREAK_BOX / 2
    const dir = state.velocity.lengthSq() > 0 ? state.velocity.clone().normalize() : new THREE.Vector3(0, 0, 1)
    for (let i = 0; i < STREAKS; i += 1) {
      const wrap = (value: number) => ((((value + half) % STREAK_BOX) + STREAK_BOX) % STREAK_BOX) - half
      const x = wrap(parts.seeds[i * 3] + parts.offset.x)
      const y = wrap(parts.seeds[i * 3 + 1] + parts.offset.y)
      const z = wrap(parts.seeds[i * 3 + 2] + parts.offset.z)
      parts.positions.set([x, y, z, x + dir.x * tail, y + dir.y * tail, z + dir.z * tail], i * 6)
    }
    parts.geometry.attributes.position.needsUpdate = true
    parts.material.opacity = amount * 0.35
  })
  return <lineSegments ref={lines} geometry={parts.geometry} material={parts.material} frustumCulled={false} />
}
const _sunTint = new THREE.Color()
const _sunBase = new THREE.Color('#fff0d0')
const _inverseCamera = new THREE.Quaternion()

/* scale height of each planet's air (km), and how dense it is at the
   surface relative to Earth's (Mars's thin air still glows on entry) */
const AIR: Record<number, { height: number; density: number }> = {
  1: { height: 15.9, density: 60 },
  2: { height: 8.5, density: 1 },
  3: { height: 11.1, density: 0.15 },
  4: { height: 27, density: 1 },
  5: { height: 59.5, density: 1 },
  6: { height: 27.7, density: 1 },
  7: { height: 19.7, density: 1 },
}

/* ============================================================
   RE-ENTRY
   Diving fast into air, the shock in front of the ship heats the gas to
   a glowing plasma: a sheath of orange and pink light hugging the nose
   and leading edges, and a trail behind. It grows with the air's density
   and the cube of the speed, so it flares in the upper atmosphere and
   fades as the ship slows. (Real Shuttles came in belly first; this one
   meets the air nose first.)
============================================================ */
const PLASMA_VERTEX = /* glsl */ `
varying vec3 vNormalView; varying vec3 vViewPos; varying vec3 vLocal; varying vec2 vUv;
void main() {
  vNormalView = normalize(normalMatrix * normal);
  vLocal = position;
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`
const PLASMA_SHEATH = /* glsl */ `
uniform float uHeat; uniform float uTime;
varying vec3 vNormalView; varying vec3 vViewPos; varying vec3 vLocal;
void main() {
  float facing = abs(dot(normalize(vNormalView), normalize(-vViewPos)));
  float rim = pow(1.0 - facing, 2.2);
  // the shock stands at the nose and leading edges; nothing at the tail
  float front = pow(smoothstep(0.35, -0.75, vLocal.z), 1.5);
  float flicker = 0.8 + 0.12 * sin(uTime * 37.0 + vLocal.x * 21.0) + 0.08 * sin(uTime * 23.0 - vLocal.z * 17.0);
  // orange-yellow against the hull, violet-pink at the outer edge
  vec3 color = mix(vec3(1.0, 0.55, 0.18), vec3(0.85, 0.45, 1.0), rim);
  float a = uHeat * (0.06 + rim * 0.75) * front * flicker;
  gl_FragColor = vec4(color * a * 2.6, 1.0);
}`
const PLASMA_TRAIL = /* glsl */ `
uniform float uHeat; uniform float uTime;
varying vec2 vUv; varying vec3 vLocal; varying vec3 vViewPos;
void main() {
  // along the trail (v: 0 at the ship, 1 at the tail) and round it
  float along = vUv.y;
  float streak = 0.7 + 0.3 * sin(vUv.x * 40.0 + uTime * 9.0 + along * 13.0);
  // fading out before it reaches a camera riding behind
  float clear = smoothstep(0.6, 2.4, -vViewPos.z);
  float a = uHeat * pow(1.0 - along, 3.0) * streak * 0.5 * clear;
  vec3 color = mix(vec3(1.0, 0.5, 0.18), vec3(0.8, 0.18, 0.3), along);
  gl_FragColor = vec4(color * a, 1.0);
}`

function Plasma({ heat }: { heat: { current: number } }) {
  const parts = useMemo(() => {
    const uniforms = { uHeat: { value: 0 }, uTime: { value: 0 } }
    const sheath = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: PLASMA_VERTEX,
      fragmentShader: PLASMA_SHEATH,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    const trail = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: PLASMA_VERTEX,
      fragmentShader: PLASMA_TRAIL,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    const sheathShape = new THREE.SphereGeometry(1, 48, 32).scale(0.31, 0.17, 0.64).translate(0, -0.03, -0.1)
    // a cone opening backwards from the hull, uv.y running down it
    const trailShape = new THREE.CylinderGeometry(0.12, 0.5, 3, 32, 8, true).rotateX(-Math.PI / 2).translate(0, 0, 1.8)
    const uv = trailShape.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i += 1) uv.setY(i, 1 - uv.getY(i))
    return { uniforms, sheath, trail, sheathShape, trailShape }
  }, [])
  const group = useRef<THREE.Group>(null)
  useEffect(
    () => () => {
      parts.sheath.dispose()
      parts.trail.dispose()
      parts.sheathShape.dispose()
      parts.trailShape.dispose()
    },
    [parts],
  )
  useFrame((state) => {
    parts.uniforms.uHeat.value = heat.current
    parts.uniforms.uTime.value = state.clock.elapsedTime
    if (group.current) group.current.visible = heat.current > 0.005
  })
  return (
    <group ref={group} visible={false}>
      <mesh geometry={parts.sheathShape} material={parts.sheath} />
      <mesh geometry={parts.trailShape} material={parts.trail} />
      <pointLight color="#ff8a4a" intensity={0} distance={0} decay={0} position={[0, -0.05, -0.45]} ref={(light) => {
        if (light) light.userData.plasma = true
      }} />
    </group>
  )
}

const _bodyQuat = new THREE.Quaternion()
const _bodyPosDummy = new THREE.Vector3()
const _bodyScaleDummy = new THREE.Vector3()
const _markerDir = new THREE.Vector3()
const _camForward = new THREE.Vector3()

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
  const orbit = useRef<{
    body: number
    radius: number
    axisA: THREE.Vector3
    axisB: THREE.Vector3
    angle: number
    rate: number // radians per second of real time
    kms: number
  } | null>(null)
  // landing: where the ship stands, in the planet's own frame (it turns)
  const landedAt = useRef(new THREE.Vector3())
  const landedTurn = useRef(new THREE.Quaternion())
  const liftTime = useRef(0)
  // the heading along the ground while landing, rolling out and taking off
  const heading = useRef(new THREE.Vector3())
  const heat = useRef(0)
  const orbitAngle = useRef(0)
  const flyby = useRef<THREE.Vector3 | null>(null) // relative to the Sun
  const streaks = useRef({ velocity: new THREE.Vector3(), amount: 0 })
  // automatic quality: the pixel ratio steps down when frames run long
  const setDpr = useThree((state) => state.setDpr)
  const startDpr = useRef(0)
  const quality = useRef({ level: 3, frameTime: 1 / 60, since: 0 })
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
        pilot.orbiting = false
        orbit.current = null
        pilot.timeScale = 0
        if (startDpr.current) setDpr(startDpr.current)
        quality.current.level = 3
        pilot.effects = 2
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
    pilotObjects.jet = jet
    pilotObjects.visual = visual.current
    pilotObjects.camera = camera
    pilotObjects.shipLength = SHIP_LENGTH
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
      BODY_PLACES[i].copy(_bodyCenter)
      BODY_RADII[i] = radius
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
    pilot.nearestRadiusKm = nearestRadius * KM_PER_UNIT
    // near a world (a planet, an asteroid, the Moon or a large moon): it
    // is the focus, and far things step back
    pilot.focus = nearestIndex >= 0 && nearestIndex < 20 && clearance < nearestRadius * 20
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
    // the giants (and Venus) have no ground: you can sink into their clouds
    const deep = DEEP[nearestIndex]
    const depth = deep ? Math.max(0, nearestRadius - jet.position.distanceTo(_bodyPos)) : 0
    pilot.immersion = deep ? THREE.MathUtils.clamp(depth / (nearestRadius * deep.dive), 0, 1) : 0
    if (deep && depth > 0) {
      clearance = nearestRadius * 0.004
      pilot.clearance = clearance
      pilot.altitudeKm = -depth * KM_PER_UNIT
      pilot.pressureBar = deep.top * Math.pow(1 + (deep.lapse * depth * KM_PER_UNIT) / deep.t0, 3.5)
      if (pilot.hazeColor === '#000000' || pilot.immersion < 0.001) {
        pilot.hazeColor = PLANETS[nearestIndex].atmosphereColor ?? PLANETS[nearestIndex].baseColor
      }
    }
    // near the Sun: the heat on the hull (a body in sunlight settles at
    // about 278 K at 1 AU, warmer as the square root of nearness)
    {
      const sunDistance = jet.position.distanceTo(SYSTEM_OFFSET)
      const au = sunDistance / AU_UNITS
      pilot.hullK = 278 / Math.sqrt(Math.max(au, 1e-4))
      pilot.sunHeat = THREE.MathUtils.smoothstep(SUN_TRUE_RADIUS * 6 - sunDistance, 0, SUN_TRUE_RADIUS * 4.6)
    }
    // air here (Earth at sea level = 1), for wind, streaks and sound
    {
      const air = nearestIndex >= 0 ? AIR[nearestIndex] : undefined
      pilot.air = air ? Math.min(1, air.density * Math.exp(-pilot.altitudeKm / air.height)) : 0
    }

    // near Saturn's ring plane, within the rings: as close as a surface
    if (nearestIndex === 5 && ringState.ready) {
      _local.copy(jet.position).sub(ringState.center)
      const height = _local.dot(ringState.normal)
      const across = Math.sqrt(Math.max(_local.lengthSq() - height * height, 0)) / ringState.radius
      if (across > 1.1 && across < 2.45) {
        clearance = Math.min(clearance, Math.max(Math.abs(height), SHIP_LENGTH * 20))
      }
    }

    // ---- controls: keys, mouse or touch, and a gamepad if one is in use
    const keys = pilot.keys
    const pad = readGamepad()
    const warping = warp.current !== null
    // landing, rolling out, standing and taking off fly themselves
    const auto = pilot.landState !== 'flying'
    const thrustHeld = keys.has('w') || pilot.touchThrust || pad.thrust > 0.2
    const brakeKey = keys.has('s') || pad.brake > 0.2
    // Shift: warp speed, anywhere, even skimming a planet
    const boost = (keys.has('shift') || pad.boost) && !warping && !auto && !brakeKey
    const forwardKey = !warping && !auto && (thrustHeld || boost)
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
    // (between the stars, thousands of AU from anything, the warp has no
    // ceiling: the nearest stars are light-years apart)
    const interstellar = clearance > 2000 * AU_UNITS
    // Shift: warp, anywhere, up to 40 times light speed (no ceiling between
    // the stars). It follows the distance to the nearest world, more
    // loosely than plain flight: leaving a planet it builds and builds,
    // closing on one it eases down, so you arrive instead of overshooting
    // (and it never drops below a brisk ~2 km/s, even skimming the ground)
    const limit = boost
      ? interstellar
        ? Math.max(LIGHT * WARP, clearance * 1.5)
        : THREE.MathUtils.clamp(clearance * 2.5, SHIP_LENGTH * 50, LIGHT * WARP)
      : THREE.MathUtils.clamp(clearance * 0.5, SHIP_LENGTH * 0.8, LIGHT)
    const target = forwardKey ? limit : brakeKey ? 0 : Math.min(speed.current, limit)
    if (boost) {
      // punching it: the speed multiplies, by orders of magnitude in a few
      // seconds (from walking pace to light speed in about three)
      speed.current = Math.min(Math.max(speed.current, SHIP_LENGTH * 20) * Math.exp(delta * 4.6), limit)
    } else {
      speed.current += (target - speed.current) * (1 - Math.exp(-delta * (forwardKey ? 1.4 : brakeKey ? 2.2 : 3)))
    }
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
    // in Saturn's rings, level means level with the rings: they are the horizon
    if (nearestIndex === 5 && ringState.ready) {
      _local.copy(jet.position).sub(ringState.center)
      const height = _local.dot(ringState.normal)
      const across = Math.sqrt(Math.max(_local.lengthSq() - height * height, 0)) / ringState.radius
      const inRings = across > 1.05 && across < 2.5 ? 1 - THREE.MathUtils.smoothstep(Math.abs(height) / ringState.radius, 0.05, 0.3) : 0
      if (inRings > 0) {
        _local.copy(ringState.normal).multiplyScalar(height >= 0 ? 1 : -1)
        _levelUp.lerp(_local, inRings).normalize()
      }
    }

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
    const minimum = onGround
      ? fromCentre - groundHere + SHIP_LENGTH * (pilot.landState === 'flying' ? 0.6 : 0.1)
      : nearestRadius * (deep ? 1 - deep.dive : nearestIndex < 0 ? 1.2 : LOWEST)
    const soft = onGround ? SHIP_LENGTH * 12 : nearestRadius * (deep ? 0.002 : 0.02)
    const closeness = 1 - THREE.MathUtils.clamp((fromCentre - minimum) / soft, 0, 1)
    const diving = Math.max(0, -_forward.dot(_axis))
    const pullUp = closeness * diving * 2.5

    _targetRates.set(
      -steerY * 1.15, // pitch: nose up is positive
      -steerX * 1.25, // yaw
      rollInput * 1.8 + level, // roll: right wing down is positive
    )
    if (auto) _targetRates.set(0, 0, 0)
    rates.current.lerp(_targetRates, 1 - Math.exp(-delta * 7))
    const [pitchInput, yawRate, rollRate] = rates.current.toArray()
    // the ground's pull-up acts at once (not smoothed), so it stops the
    // moment the nose reaches the horizon instead of overshooting it
    const pitchRate = pitchInput + pullUp
    // a turn also rolls the ship a little into it, as a plane does
    if (!auto) {
      _turn.setFromAxisAngle(_up, yawRate * delta)
      jet.quaternion.premultiply(_turn)
      _turn.setFromAxisAngle(_right, pitchRate * delta)
      jet.quaternion.premultiply(_turn)
      _turn.setFromAxisAngle(_forward, rollRate * delta)
      jet.quaternion.premultiply(_turn).normalize()
    }

    // ---- moving: the ship carries its momentum, so it slides a little
    // through hard turns before the new heading takes over
    _forward.set(0, 0, -1).applyQuaternion(jet.quaternion)
    if (!auto) {
      _wanted.copy(_forward).multiplyScalar(speed.current)
      // at warp the ship goes where it points (no slide of millions of km)
      velocity.current.lerp(_wanted, boost ? 1 : 1 - Math.exp(-delta * 3.2))
      // momentum carries direction, never extra speed
      if (velocity.current.length() > speed.current) velocity.current.setLength(speed.current)
      _stepFrom.copy(jet.position)
      jet.position.addScaledVector(velocity.current, delta)
      // at these speeds one frame can cross a planet: if the step would
      // pass through a world (or the Sun), the ship drops out just short
      if (velocity.current.length() * delta > clearance * 0.25) {
        const hit = sweepBodies(_stepFrom, jet.position)
        if (hit) {
          jet.position.copy(hit)
          speed.current = Math.min(speed.current, LIGHT * 0.01)
          velocity.current.setLength(speed.current)
        }
      }
    }

    // ---- the ground: never lower than 100 km over Earth (1.6% of a
    // planet's radius), the edge of space. Nearing it, the descent is
    // taken out of the motion smoothly; nothing bounces.
    _axis.copy(jet.position).sub(_bodyPos)
    const height = _axis.length()
    _axis.divideScalar(height)
    const sink = velocity.current.dot(_axis)
    if (sink < 0 && !auto) {
      const near = 1 - THREE.MathUtils.clamp((height - minimum) / soft, 0, 1)
      velocity.current.addScaledVector(_axis, -sink * near)
    }
    if (height < minimum && !auto) jet.position.copy(_bodyPos).addScaledVector(_axis, minimum)

    // ---- landing, as the Shuttle does it, flown for you. (flightLanding.ts)
    flyLanding({
      jet,
      velocity,
      speed,
      heading,
      landedAt,
      landedTurn,
      liftTime,
      forward: _forward,
      radial: _axis,
      centre: _bodyPos,
      nearestIndex,
      nearestRadius,
      clearance,
      onGround,
      groundHere,
      deep: !!deep,
      warping,
      thrustHeld,
      steerX,
      delta,
    })
    if (onGround) {
      const site = groundLatLon(jet.position)
      pilot.site.lat = site.lat
      pilot.site.lon = site.lon
    }

    // ---- orbit (O): a circular orbit round the nearest world, at the
    // height you are, at the true orbital speed; any control leaves it
    if (pilot.orbiting && !orbit.current) {
      const body = nearestIndex
      const gm = body < 0 ? SUN_GM : GM[body]
      getBodyPosition(body, simClock.jd, _bodyCenter)
      _axis.copy(jet.position).sub(_bodyCenter)
      const radius = _axis.length()
      const axisA = _axis.clone().normalize()
      _forward.set(0, 0, -1).applyQuaternion(jet.quaternion)
      const axisB = _forward.clone().addScaledVector(axisA, -_forward.dot(axisA))
      if (axisB.lengthSq() < 1e-8) axisB.set(0, 1, 0).cross(axisA)
      axisB.normalize()
      const kms = Math.sqrt(gm / Math.max(radius * KM_PER_UNIT, 1))
      orbit.current = { body, radius, axisA, axisB, angle: 0, rate: kms / (radius * KM_PER_UNIT), kms }
      pilot.orbitMinutes = ((2 * Math.PI) / orbit.current.rate) / 60
      pilot.landState = 'flying'
    }
    const leave = thrustHeld || keys.has('s') || Math.abs(steerX) > 0.3 || Math.abs(steerY) > 0.3 || warp.current || pilot.warpRequest !== null
    if (orbit.current && (!pilot.orbiting || leave)) {
      // leaving orbit keeps its speed and heading
      speed.current = orbit.current.kms / KM_PER_UNIT
      orbit.current = null
      pilot.orbiting = false
    }
    if (orbit.current) {
      const o = orbit.current
      o.angle += o.rate * delta * Math.max(1, pilot.timeScale)
      getBodyPosition(o.body, simClock.jd, _bodyCenter)
      const c = Math.cos(o.angle)
      const s = Math.sin(o.angle)
      _axis.copy(o.axisA).multiplyScalar(c).addScaledVector(o.axisB, s)
      jet.position.copy(_bodyCenter).addScaledVector(_axis, o.radius)
      // nose along the way, belly to the world
      _forward.copy(o.axisB).multiplyScalar(c).addScaledVector(o.axisA, -s)
      _orbitM.lookAt(_camPos.set(0, 0, 0), _forward, _axis)
      jet.quaternion.setFromRotationMatrix(_orbitM)
      velocity.current.copy(_forward).multiplyScalar(o.kms / KM_PER_UNIT)
      pilot.kms = o.kms
    }

    // ---- warp: asked for by the HUD; while it runs it flies the ship
    // (flightWarp.ts); S cancels
    if (pilot.warpRequest !== null) {
      const target = pilot.warpRequest
      pilot.warpRequest = null
      warp.current = planWarp(target, jet.position, { index: nearestIndex, radius: nearestRadius, clearance, centre: _bodyPos })
      pilot.warping = warp.current.name
      pilot.viewTarget = VIEW_NEAR
    }
    const w = warp.current
    if (w && keys.has('s')) {
      // cancelled: drop out of warp where we are
      warp.current = null
      pilot.warping = ''
    } else if (w) {
      const step = stepWarp(w, jet, delta, _levelUp)
      if (step.done) {
        warp.current = null
        pilot.warping = ''
      }
      _forward.set(0, 0, -1).applyQuaternion(jet.quaternion)
      pilot.kms = step.kms
      speed.current = 0
      velocity.current.set(0, 0, 0)
      pilot.warpGlow += (step.glow - pilot.warpGlow) * (1 - Math.exp(-delta * 6))
      pilot.warpOrigin.addScaledVector(_forward, 70 * pilot.warpGlow * delta)
      pilot.speed = Math.max(pilot.speed, pilot.warpGlow)
    } else {
      // flying fast yourself: the warp's streaks past a third of light speed
      const c = pilot.kms / 299792.458
      const glow = THREE.MathUtils.smoothstep(Math.log10(Math.max(c, 1e-6)), -0.5, 0.7)
      pilot.warpGlow += (glow - pilot.warpGlow) * (1 - Math.exp(-delta * 4))
      if (pilot.warpGlow > 0.01) pilot.warpOrigin.addScaledVector(_forward, 70 * pilot.warpGlow * delta)
    }

    // ---- re-entry: dense air, high speed
    {
      const air = nearestIndex >= 0 ? AIR[nearestIndex] : undefined
      let target = 0
      if (air && !warp.current && pilot.altitudeKm >= 0) {
        const density = air.density * Math.exp(-pilot.altitudeKm / air.height)
        const v = pilot.kms
        const load = density * v * v * v
        target =
          THREE.MathUtils.smoothstep(Math.log10(Math.max(load, 1e-9)), -0.6, 1.4) *
          THREE.MathUtils.smoothstep(v, 2.5, 6.5)
      }
      heat.current += (target - heat.current) * (1 - Math.exp(-delta * (target > heat.current ? 3 : 1.5)))
    }

    // ---- the cameras (flightCamera.ts)
    placeCamera({
      camera,
      jet,
      velocity,
      heat,
      bank,
      viewDistance,
      camOffset,
      orbitAngle,
      flyby,
      forward: _forward,
      levelUp: _levelUp,
      centre: _bodyPos,
      nearestRadius,
      onGround,
      deep: !!deep,
      yawRate,
      pitchRate,
      delta,
    })

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
    shipCamera.far = Math.max(shipAway * 3 + 100, 8000)
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
    // in a planet's shadow the ship goes dark; at orbital sunrise and
    // sunset the light reaching it through the air is reddened
    const sunSeen = sunVisibility(jet.position, _sunTint)
    if (sunLight.current) {
      sunLight.current.position.copy(_toSun).multiplyScalar(10)
      // fainter with distance (as the fourth root: the eye adapts)
      const sunAU = jet.position.distanceTo(SYSTEM_OFFSET) / AU_UNITS
      sunLight.current.intensity = 2.4 * sunSeen * Math.min(1, Math.max(sunAU, 1e-3) ** -0.5)
      sunLight.current.color.copy(_sunBase).multiply(_sunTint)
      // at another star, its light instead
      if (nearestIndex >= FIRST_STAR_ID && nearestIndex < COMET_ID) {
        const star = NAMED_STARS[nearestIndex - FIRST_STAR_ID]
        getBodyPosition(nearestIndex, simClock.jd, _craft)
        sunLight.current.position.copy(_craft).sub(jet.position).normalize().multiplyScalar(10)
        const starAU = jet.position.distanceTo(_craft) / AU_UNITS
        const luminosity = 10 ** ((4.83 - star.absmag) / 2.5)
        sunLight.current.intensity = 2.4 * Math.min(1.5, (luminosity / Math.max(starAU * starAU, 1e-6)) ** 0.25)
        starColor(starTemperature(star.ci), sunLight.current.color)
      }
    }
    visual.current?.traverse((object) => {
      if (object.userData.plasma) (object as THREE.PointLight).intensity = heat.current * 3
    })
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
            : (SMALL_BODIES[nearestIndex - PLANETS.length]?.color ?? '#9a9690'),
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
    // the ship's shadow, for the ground (view space)
    shipShadow.uShipShadow.value = onGround && sunSeen > 0.05 && groundHere < SHIP_LENGTH * 400 ? 1 : 0
    if (shipShadow.uShipShadow.value) {
      _inverseCamera.copy(camera.quaternion).invert()
      shipShadow.uShipView.value.copy(jet.position).sub(camera.position).applyQuaternion(_inverseCamera)
      shipShadow.uShipFwd.value.set(0, 0, -1).applyQuaternion(jet.quaternion).applyQuaternion(_inverseCamera)
      shipShadow.uShipRight.value.set(1, 0, 0).applyQuaternion(jet.quaternion).applyQuaternion(_inverseCamera)
      shipShadow.uShipLen.value = SHIP_LENGTH
    }

    // ---- how far from home
    pilot.sunAU = jet.position.distanceTo(SYSTEM_OFFSET) / AU_UNITS
    pilot.awayPc = pilot.sunAU / 206264.806
    roverGround.height = (dir) => (ground.body === 3 && ground.model ? ground.model.height(dir, ground.fade) : 0)

    // ---- air streaks (in ship lengths per second), sound
    streaks.current.velocity.copy(velocity.current).divideScalar(SHIP_LENGTH)
    streaks.current.amount =
      pilot.altitudeKm < 40 && !warp.current ? pilot.air * THREE.MathUtils.smoothstep(pilot.kms, 0.02, 0.15) : 0
    pilot.thrust = thrust.current
    pilot.heat = heat.current

    // ---- Earth's cloud deck: flying through it, a mist
    pilot.mist = 0
    if (onGround && nearestIndex === 2 && ground.model) {
      _local.copy(camera.position).applyMatrix4(ground.inverse)
      const heightKm = (_local.length() - 1) * 6371
      // inside the cloud layer, where the cover is thick enough to be in cloud
      if (heightKm > CLOUD_BASE_KM - 0.3 && heightKm < CLOUD_TOP_KM) {
        _local.normalize()
        const [u, v] = sphereUv(_local)
        const cu = (((u - cloudDeck.shift) % 1) + 1) % 1
        // yesterday's real clouds when loaded, else the usual map
        const cover = earthToday.cover(cu, v) ?? ground.model.cloudCover(cu, v)
        const topKm = CLOUD_BASE_KM + (CLOUD_TOP_KM - CLOUD_BASE_KM) * THREE.MathUtils.lerp(0.28, 1, THREE.MathUtils.smoothstep(cover, 0.4, 0.95)) * 0.8
        const near =
          THREE.MathUtils.smoothstep(heightKm, CLOUD_BASE_KM - 0.2, CLOUD_BASE_KM + 0.4) *
          (1 - THREE.MathUtils.smoothstep(heightKm, topKm - 1, topKm))
        pilot.mist = near * THREE.MathUtils.smoothstep(cover, 0.45, 0.85) * 0.85
        pilot.mistLight = THREE.MathUtils.smoothstep(_axis.dot(_toSun), -0.1, 0.25)
      }
    }

    // ---- quality: if frames run long, first the effects that march along
    // each line of sight (air, clouds, auroras) take fewer, longer steps,
    // then the pixel ratio comes down; both come back when there is room
    {
      const q = quality.current
      q.frameTime += (rawDelta - q.frameTime) * 0.05
      q.since += rawDelta
      if (!startDpr.current) startDpr.current = Math.min(window.devicePixelRatio || 1, 2)
      const slow = q.frameTime > 1 / 38
      const fast = q.frameTime < 1 / 57
      if ((slow && q.since > 2 && q.level > 0) || (fast && q.since > 6 && q.level < 3)) {
        const before = QUALITY_DPR[q.level]
        q.level += slow ? -1 : 1
        q.since = 0
        pilot.effects = QUALITY_EFFECTS[q.level]
        if (QUALITY_DPR[q.level] !== before) setDpr(QUALITY_DPR[q.level] ?? startDpr.current)
      }
    }

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

    // ---- named features on the ground below, while it is up close
    pilot.features.length = 0
    if (onGround && ground.model) {
      ground.matrix.decompose(_bodyPosDummy, _bodyQuat, _bodyScaleDummy)
      for (const feature of FEATURES) {
        if (feature.body !== nearestIndex) continue
        const u = (feature.lon + 180) / 360
        const v = (feature.lat + 90) / 180
        const theta = (1 - v) * Math.PI
        const phi = u * Math.PI * 2
        _featureDir.set(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta))
        const lift = 1 + ground.model.height(_featureDir, ground.fade)
        _markerDir.copy(_featureDir).multiplyScalar(lift).applyMatrix4(ground.matrix)
        // above this point's horizon, within a few thousand km, ahead
        _local.copy(_featureDir).applyQuaternion(_bodyQuat)
        const above = _camPos.copy(camera.position).sub(_markerDir).dot(_local) > 0
        const km = _markerDir.distanceTo(camera.position) * KM_PER_UNIT
        if (!above || km > 2500) continue
        if (_camPos.copy(_markerDir).sub(camera.position).dot(_camForward) <= 0) continue
        _markerDir.project(camera)
        if (Math.abs(_markerDir.x) > 0.95 || Math.abs(_markerDir.y) > 0.92) continue
        pilot.features.push({ name: feature.name, x: _markerDir.x, y: _markerDir.y, shown: true })
      }
    }
  })

  return (
    <>
      {/* where the ship is (the scene's own units); it is drawn below */}
      <group ref={ship} visible={false} />
      <NearStar />
      <CometEncke />
      <TrojanBodies />
      {createPortal(
        <>
          <group ref={visual}>
            <group>{shuttle ? <Shuttle model={shuttle} thrust={thrust} /> : <Jet thrust={thrust} />}</group>
            <Plasma heat={heat} />
          </group>
          <AirStreaks state={streaks.current} />
          <RingChunks jetRef={ship} />
          <AsteroidField jetRef={ship} />
          <Spacecraft jetRef={ship} />
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
