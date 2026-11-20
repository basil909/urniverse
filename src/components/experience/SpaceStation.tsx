'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

import { getPlanetOrbitPosition, getPlanetPosition, getPlanetVisualRadius } from './orbit'
import { simClock } from './simClock'
import { FIRST_CRAFT_ID, spaceBodyOrbitPosition, SPACECRAFT } from './spaceBodies'
import { shot } from './shots'
import { pilot } from './pilotState'
import { loadModel } from './Pilot'

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
const STATION = SPACECRAFT[0]
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
  _east.copy(_toSun).applyAxisAngle(_up, 0.9 + Math.sin(time * 0.05) * 0.05)
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
    const behind = out.dot(toCam.clone().normalize()) < R / Math.max(toCam.length(), R)
    const want = chapter === EARTH_CHAPTER && local > 0.18 && local < 0.93 && !behind && shot.index === 0 && !pilot.active ? 1 : 0
    shown.current += (want - shown.current) * (1 - Math.exp(-delta * 4))
    g.visible = shown.current > 0.01
    if (tag.current) tag.current.style.opacity = shown.current.toFixed(3)

    // the station itself, for its shot in Earth's film
    const filming = shot.index === 4 && shot.chapter === EARTH_CHAPTER && !pilot.active
    if (filming && !wanted.current) {
      wanted.current = true
      loadModel(STATION.model).then(setStation).catch(() => {})
    }
    const m = model.current
    if (m) {
      m.visible = filming && !!station
      if (m.visible) {
        // close to the lens, ahead and a little low, slowly turning
        const forward = new THREE.Vector3()
        camera.getWorldDirection(forward)
        const right = forward.clone().cross(camera.up).normalize()
        const upV = right.clone().cross(forward).normalize()
        // seen from above and behind, as from a visiting craft: the truss
        // across the frame, the arrays laid along the way it flies, its
        // top to space; the whole station small in the lower frame, the
        // Earth beyond
        const d = 0.0042
        m.position.copy(camera.position).addScaledVector(forward, d).addScaledVector(upV, -d * 0.04)
        // (the model's long truss is its own y axis: across the frame)
        const up = camera.position.clone().sub(_earth).normalize()
        const along = forward.clone().addScaledVector(up, -forward.dot(up)).normalize()
        const across = up.clone().cross(along).normalize()
        _basis.makeBasis(along, across, up)
        m.quaternion.setFromRotationMatrix(_basis)
        m.rotateZ(Math.sin(shot.clock * 0.12) * 0.12)
        m.scale.setScalar(d * 0.47)
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
      <group ref={model} visible={false}>
        {station && <primitive object={station} />}
      </group>
    </>
  )
}
