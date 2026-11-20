'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

import { getPlanetOrbitPosition, getPlanetPosition, getPlanetVisualRadius, SYSTEM_OFFSET } from './orbit'
import { getShipPass, shipCamera, shipScene } from './shipLayer'
import { simClock } from './simClock'
import { FIRST_CRAFT_ID, spaceBodyOrbitPosition } from './spaceBodies'
import { shot } from './shots'
import { pilot } from './pilotState'
import { buildStation } from './issModel'
import { hiddenByMoon } from './earthMoon'

/* ============================================================
   THE SPACE STATION, IN THE JOURNEY
   At Earth, the International Space Station: 109 m across, far too small
   to see from the chapter's distance, so a glint marks it, named, on its
   real orbit (418 km up, inclined 51.6 degrees, once round every 92.9
   minutes) and in real time, whatever the scene's clock is doing; hidden
   when it passes behind the world. In Earth's film, the exploration shot
   is the station itself: the camera beside it, 418 km up, the curve of
   the Earth below (the station drawn close to the lens, as films do).
============================================================ */

const EARTH_CHAPTER = 4
const _earthOrbit = new THREE.Vector3()
const _earth = new THREE.Vector3()

/** where the station is now, in the journey's scene (round the drawn Earth) */
export function stationPosition(out: THREE.Vector3) {
  const jd = Date.now() / 86400000 + 2440587.5
  spaceBodyOrbitPosition(FIRST_CRAFT_ID, jd, jd, out)
  getPlanetOrbitPosition(2, jd, _earthOrbit)
  getPlanetPosition(2, simClock.jd, _earth)
  return out.sub(_earthOrbit).add(_earth)
}

/** the station's shot (Earth's film, shot 4): the camera's place and aim */
const _st = new THREE.Vector3()
const _up = new THREE.Vector3()
const _east = new THREE.Vector3()
const _toSun = new THREE.Vector3()
const _basis = new THREE.Matrix4()
const _sunDir = new THREE.Vector3()
/* where the station stands in the ship's layer: far from its origin,
   where the (unseen) Shuttle waits */
const STATION_AT = new THREE.Vector3(0, 0, 6000)
/** where the station stands in its shot */
const shotStation = new THREE.Vector3()
export function stationShotPose(time: number, sun: THREE.Vector3, outPos: THREE.Vector3, outTarget: THREE.Vector3, outUp: THREE.Vector3) {
  // (the marker follows the real orbit; the shot is set over the sunlit
  // side, the Sun some 35 degrees up, wherever the station is just now)
  getPlanetPosition(2, simClock.jd, _earth)
  const R = getPlanetVisualRadius(2)
  _toSun.copy(sun).sub(_earth).normalize()
  _east.set(0, 1, 0).cross(_toSun).normalize()
  _up.copy(_toSun).applyAxisAngle(_east, (55 * Math.PI) / 180).normalize()
  _st.copy(_earth).addScaledVector(_up, R * (1 + 418 / 6371))
  shotStation.copy(_st)
  // looking along the orbit towards the Sun's side of the horizon
  _toSun.copy(sun).sub(_st)
  _toSun.addScaledVector(_up, -_toSun.dot(_up)).normalize()
  // (the Sun behind the camera, over a shoulder: the station lit from the front)
  _east.copy(_toSun).applyAxisAngle(_up, Math.PI - 0.75 + Math.sin(time * 0.05) * 0.05)
  // a little above and behind the station
  outPos.copy(_st).addScaledVector(_up, R * 0.004).addScaledVector(_east, -R * 0.006)
  // looking down past the station, the horizon across the middle of the frame
  outTarget.copy(outPos).addScaledVector(_east, R).addScaledVector(_up, -R * 0.36)
  outUp.copy(_up)
}

export default function SpaceStation({ progressRef }: { progressRef: RefObject<number> }) {
  const camera = useThree((state) => state.camera)
  const marker = useRef<THREE.Group>(null)
  const tag = useRef<HTMLDivElement>(null)
  const model = useRef<THREE.Group>(null)
  const sunLight = useRef<THREE.DirectionalLight>(null)
  const earthLight = useRef<THREE.HemisphereLight>(null)
  const shipped = useRef(false)
  const [station, setStation] = useState<THREE.Object3D | null>(null)
  const wanted = useRef(false)
  const shown = useRef(0)

  useEffect(() => () => {
    station?.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (mesh.isMesh) mesh.geometry.dispose()
    })
  }, [station])

  useFrame((_, delta) => {
    const chapter = Math.floor(progressRef.current ?? 0)
    const local = (progressRef.current ?? 0) - chapter
    const g = marker.current
    if (!g) return
    stationPosition(g.position)

    // the glint and its name, at the Earth chapter (not in a film shot of it)
    getPlanetPosition(2, simClock.jd, _earth)
    const R = getPlanetVisualRadius(2)
    const toCam = camera.position.clone().sub(_earth)
    const out = g.position.clone().sub(_earth).normalize()
    // (behind the world, or the Moon passing in front)
    const behind = out.dot(toCam.clone().normalize()) < R / Math.max(toCam.length(), R) || hiddenByMoon(camera.position, g.position)
    const want = chapter === EARTH_CHAPTER && local > 0.18 && local < 0.93 && !behind && shot.index === 0 && !pilot.active ? 1 : 0
    shown.current += (want - shown.current) * (1 - Math.exp(-delta * 4))
    g.visible = shown.current > 0.01
    if (tag.current) tag.current.style.opacity = shown.current.toFixed(3)

    // the station itself, for its shot in Earth's film
    const filming = shot.index === 4 && shot.chapter === EARTH_CHAPTER && !pilot.active
    if (filming && !wanted.current) {
      wanted.current = true
      // built here, from its real layout (issModel.ts)
      const built = buildStation()
      built.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh) return
        // (the lattice's holes would cast as a solid bar)
        const lattice = (mesh.material as THREE.MeshStandardMaterial).alphaTest > 0
        mesh.castShadow = !lattice
        mesh.receiveShadow = true
      })
      setStation(built)
    }
    /* the station at its true size (109 m), in the ship's own layer, as
       the Shuttle is in flight: drawn after the world and its air, so
       nothing of the world can come between it and the camera. The
       camera there copies the real one's view, some 230 m back. */
    const m = model.current
    if (m) {
      const on = filming && !!station
      m.visible = on
      if (on) {
        getShipPass().enabled = true
        shipped.current = true
        const forward = new THREE.Vector3()
        camera.getWorldDirection(forward)
        const right = forward.clone().cross(camera.up).normalize()
        const upV = right.clone().cross(forward).normalize()
        // (the station's x is its truss: across the frame; z the way it
        // flies; y up, away from the Earth)
        const up = camera.position.clone().sub(_earth).normalize()
        const along = forward.clone().addScaledVector(up, -forward.dot(up)).normalize()
        const across = up.clone().cross(along).normalize()
        _basis.makeBasis(across, up, along)
        m.position.copy(STATION_AT)
        m.quaternion.setFromRotationMatrix(_basis)
        m.rotateY(Math.sin(shot.clock * 0.12) * 0.12)
        m.scale.setScalar(109)
        const persp = camera as THREE.PerspectiveCamera
        // (easing in, slowly, over the shot)
        const ease = Math.min(1, shot.clock / 24)
        const back = 214 - 44 * ease * ease * (3 - 2 * ease)
        shipCamera.position.copy(STATION_AT).addScaledVector(forward, -back).addScaledVector(upV, back * 0.04)
        shipCamera.quaternion.copy(camera.quaternion)
        shipCamera.fov = persp.fov
        shipCamera.aspect = persp.aspect
        shipCamera.near = 1
        shipCamera.far = 2000
        shipCamera.updateProjectionMatrix()
        // the Sun, and the Earth's light from below
        const sun = _sunDir.copy(SYSTEM_OFFSET).sub(_earth).normalize()
        const light = sunLight.current
        if (light) {
          light.position.copy(STATION_AT).addScaledVector(sun, 300)
          light.target.position.copy(STATION_AT)
          light.target.updateMatrixWorld()
        }
        const fill = earthLight.current
        if (fill) fill.position.copy(STATION_AT).addScaledVector(up, 300)
      } else if (shipped.current && !pilot.active) {
        getShipPass().enabled = false
        shipped.current = false
      }
    }
  })

  return (
    <>
      <group ref={marker} visible={false}>
        <mesh>
          <sphereGeometry args={[0.0012, 8, 6]} />
          <meshBasicMaterial color="#fff6e0" toneMapped={false} />
        </mesh>
        <Html center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <div ref={tag} className="iss-tag" style={{ opacity: 0 }}>
            <span className="iss-dot" />
            <span>
              Space Station
              <small>418 km up · round every 92 min</small>
            </span>
          </div>
        </Html>
      </group>
      {createPortal(
        <>
          <group ref={model} visible={false}>
            {station && <primitive object={station} />}
          </group>
          <directionalLight
            ref={sunLight}
            color="#fff2dc"
            intensity={2.6}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-70}
            shadow-camera-right={70}
            shadow-camera-top={70}
            shadow-camera-bottom={-70}
            shadow-camera-near={100}
            shadow-camera-far={500}
            shadow-bias={-0.0004}
            shadow-normalBias={0.05}
          />
          <hemisphereLight ref={earthLight} color="#0b0f18" groundColor="#7ea6d8" intensity={0.45} />
        </>,
        shipScene,
      )}
    </>
  )
}
