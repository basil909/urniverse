'use client'

import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { pilot } from './pilotState'

/* ============================================================
   FOCUS: spend the frame on what can be seen
   Flying, most of the Solar System is far away: planets and moons a few
   pixels across, or less. They were still drawn in full (73,000
   triangles for a planet, its air, its clouds). Each frame, after
   everything has moved, this looks at every detailed object:
   - a sphere (a planet, a moon, an air shell) under ~8 pixels across is
     drawn with a light sphere of the same size instead (it looks the
     same at that size), and gets its detail back as it grows;
   - anything else detailed and under half a pixel is not drawn at all
     (moved to a camera layer that is not rendered; nothing else in the
     scene uses layers, so the parts that show and hide things are left
     alone).
   Objects placed by their shaders (frustumCulled off: the belts, the
   ground and cloud patches, comet tails, auroras) are never touched.
   Mounted last in the scene, so it runs after the parts that move.
============================================================ */

const DETAILED = 3000 // triangles
const LIGHT_UNDER = 8 // pixels across
const DETAIL_OVER = 12
const HIDE_UNDER = 0.5
const HIDDEN_LAYER = 31

type Tracked = { mesh: THREE.Mesh; full: THREE.BufferGeometry; light: THREE.BufferGeometry | null; radius: number }

const lightSpheres = new Map<string, THREE.SphereGeometry>()
function lightSphere(params: { radius: number; phiStart: number; phiLength: number; thetaStart: number; thetaLength: number }) {
  const key = `${params.radius}|${params.phiStart}|${params.phiLength}|${params.thetaStart}|${params.thetaLength}`
  let sphere = lightSpheres.get(key)
  if (!sphere) {
    sphere = new THREE.SphereGeometry(params.radius, 24, 16, params.phiStart, params.phiLength, params.thetaStart, params.thetaLength)
    lightSpheres.set(key, sphere)
  }
  return sphere
}

const triangles = (geometry: THREE.BufferGeometry) =>
  (geometry.index ? geometry.index.count : (geometry.getAttribute('position')?.count ?? 0)) / 3

const _centre = new THREE.Vector3()
const _scale = new THREE.Vector3()

export default function FocusCull() {
  const camera = useThree((state) => state.camera)
  const scene = useThree((state) => state.scene)
  const size = useThree((state) => state.size)
  const gl = useThree((state) => state.gl)
  const tracked = useRef(new Map<THREE.Mesh, Tracked>())
  const since = useRef(Infinity)
  const wasActive = useRef(false)

  const release = () => {
    tracked.current.forEach((entry) => {
      if (entry.light && entry.mesh.geometry === entry.light) entry.mesh.geometry = entry.full
      entry.mesh.layers.set(0)
    })
  }

  useFrame((_, delta) => {
    if (!pilot.active) {
      if (wasActive.current) release()
      wasActive.current = false
      return
    }
    wasActive.current = true
    // every couple of seconds, find the detailed objects (things come and go)
    since.current += delta
    if (since.current > 2) {
      since.current = 0
      const seen = new Set<THREE.Mesh>()
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh || !mesh.frustumCulled || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return
        const known = tracked.current.get(mesh)
        const geometry = known?.full ?? mesh.geometry
        if (!geometry || triangles(geometry) < DETAILED) return
        seen.add(mesh)
        if (known && mesh.geometry !== known.full && mesh.geometry !== known.light) {
          // the scene gave it a new geometry: start again from that
          tracked.current.delete(mesh)
        }
        if (!tracked.current.has(mesh)) {
          const full = mesh.geometry
          if (!full.boundingSphere) full.computeBoundingSphere()
          const params = (full as THREE.SphereGeometry).parameters
          const sphere = full.type === 'SphereGeometry' && params
          tracked.current.set(mesh, {
            mesh,
            full,
            light: sphere ? lightSphere(params) : null,
            radius: full.boundingSphere?.radius ?? 0,
          })
        }
      })
      tracked.current.forEach((entry, mesh) => {
        if (!seen.has(mesh)) tracked.current.delete(mesh)
      })
    }
    // pixels per unit of size, one unit away
    const perspective = camera as THREE.PerspectiveCamera
    const pixels = (size.height * gl.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov ?? 50) / 2))
    tracked.current.forEach((entry) => {
      const { mesh } = entry
      mesh.getWorldPosition(_centre)
      mesh.getWorldScale(_scale)
      const radius = entry.radius * Math.max(Math.abs(_scale.x), Math.abs(_scale.y), Math.abs(_scale.z))
      const distance = Math.max(_centre.distanceTo(camera.position) - radius, 1e-9)
      const across = ((2 * radius) / distance) * pixels
      if (entry.light) {
        if (across < LIGHT_UNDER && mesh.geometry === entry.full) mesh.geometry = entry.light
        else if (across > DETAIL_OVER && mesh.geometry === entry.light) mesh.geometry = entry.full
      } else {
        mesh.layers.set(across < HIDE_UNDER ? HIDDEN_LAYER : 0)
      }
    })
  })

  return null
}
