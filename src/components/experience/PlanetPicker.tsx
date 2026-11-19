'use client'

import { type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { pilot } from './pilotState'
import { lens } from './lens'

/* In the wide views (the opening and the ending), every world can be
   picked. This part, inside the scene, works out where each world's disc
   is on screen each frame; the buttons themselves are page elements
   (ui/PickLayer.tsx) placed over those discs. */

/* the meshes to pick, by world (-1: the Sun, 0-7: the planets) */
export const pickBodies: Record<number, THREE.Mesh | null> = {}

/* where each world is on screen (CSS pixels), and whether picking is on */
export const pickScreen = {
  on: false,
  worlds: new Map<number, { x: number; y: number; r: number; shown: boolean }>(),
}

/* asks the journey to go to a section (Journey listens) */
export const PICK_EVENT = 'urniverse:go-section'

export const PICKABLE: { index: number; name: string }[] = [
  { index: -1, name: 'Sun' },
  { index: 0, name: 'Mercury' },
  { index: 1, name: 'Venus' },
  { index: 2, name: 'Earth' },
  { index: 3, name: 'Mars' },
  { index: 4, name: 'Jupiter' },
  { index: 5, name: 'Saturn' },
  { index: 6, name: 'Uranus' },
  { index: 7, name: 'Neptune' },
]

const _at = new THREE.Vector3()
const _scale = new THREE.Vector3()
const _toCamera = new THREE.Vector3()
const _forward = new THREE.Vector3()

export default function PlanetPicker({ progressRef }: { progressRef: RefObject<number> }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const gl = useThree((state) => state.gl)

  useFrame(() => {
    const progress = progressRef.current ?? 0
    const chapter = Math.floor(progress)
    const local = progress - chapter
    // settled in the opening or at the end, not flying, loader gone
    pickScreen.on = !pilot.active && lens.revealed && ((chapter === 0 && local < 0.6) || (chapter === 13 && local > 0.2))
    if (!pickScreen.on) return
    const rect = gl.domElement.getBoundingClientRect()
    camera.getWorldDirection(_forward)
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    for (const world of PICKABLE) {
      const mesh = pickBodies[world.index]
      const entry = pickScreen.worlds.get(world.index) ?? { x: 0, y: 0, r: 0, shown: false }
      pickScreen.worlds.set(world.index, entry)
      if (!mesh || !mesh.visible) {
        entry.shown = false
        continue
      }
      mesh.getWorldPosition(_at)
      _toCamera.copy(_at).sub(camera.position)
      if (_toCamera.dot(_forward) <= 0) {
        entry.shown = false
        continue
      }
      mesh.getWorldScale(_scale)
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
      const worldRadius = (mesh.geometry.boundingSphere?.radius ?? 1) * Math.max(_scale.x, _scale.y, _scale.z)
      const radiusPx = (worldRadius / (_toCamera.length() * tanHalf)) * (rect.height / 2)
      _at.project(camera)
      entry.x = rect.left + ((_at.x + 1) / 2) * rect.width
      entry.y = rect.top + ((1 - _at.y) / 2) * rect.height
      entry.r = radiusPx
      entry.shown = entry.x > -40 && entry.x < rect.right + 40 && entry.y > -40 && entry.y < rect.bottom + 40
    }
  })

  return null
}
