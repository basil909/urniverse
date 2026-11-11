'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { pilot } from './pilotState'

/* Sharper surface maps (4096×2048), loaded only for the planet in focus.
   Everything starts on the light 2K maps; once the camera has arrived at a
   planet its 4K maps are decoded off the main thread and swapped in, and they
   are released again when the journey moves on, so at most one planet's
   sharp maps sit in GPU memory. Phones keep the 2K maps: a planet there is a
   few hundred pixels across, and the memory is better left free. */

export const SHARP_PLANET_MAPS: (string | undefined)[] = [
  '/textures/hd/mercury.webp',
  '/textures/hd/venus-atmosphere.webp',
  undefined, // Earth: see SHARP_EARTH_MAPS
  '/textures/hd/mars.webp',
  '/textures/hd/jupiter.webp',
  '/textures/hd/saturn.webp',
  undefined, // Uranus and Neptune have no sharper maps
  undefined,
]

export const SHARP_EARTH_MAPS = {
  day: '/textures/hd/earth-day.webp',
  clouds: '/textures/hd/earth-clouds.webp',
  night: '/textures/hd/earth-night-lights.webp',
  moon: '/textures/hd/moon.webp',
} as const

export const SHARP_SATURN_RING = '/textures/hd/saturn-ring-alpha.png'

let sharpAllowed: boolean | null = null

function sharpMapsAllowed(gl: THREE.WebGLRenderer) {
  if (sharpAllowed !== null) return sharpAllowed
  if (typeof window === 'undefined') return false
  const wideScreen = window.matchMedia('(min-width: 768px)').matches
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  sharpAllowed =
    wideScreen &&
    gl.capabilities.maxTextureSize >= 4096 &&
    typeof createImageBitmap === 'function' &&
    (memory === undefined || memory >= 4)
  return sharpAllowed
}

/* Each 4K upload costs the main thread ~20–40 ms. Uploads go one at a
   time, a few frames apart, so Earth's four maps never land in one frame. */
let uploadQueue: Promise<void> = Promise.resolve()
function queueUpload(upload: () => void) {
  uploadQueue = uploadQueue.then(
    () =>
      new Promise<void>((done) => {
        requestAnimationFrame(() => {
          upload()
          requestAnimationFrame(() => requestAnimationFrame(() => done()))
        })
      }),
  )
}

/* wait this long after arriving, so the text fades in undisturbed */
const SETTLE_SECONDS = 0.8

/* True once the camera has arrived at this planet and the text has
   settled, and until the journey leaves its chapter. */
export function useSharpFocus(
  progressRef: RefObject<number>,
  index: number,
  focusIn: number,
) {
  const gl = useThree((state) => state.gl)
  const [sharp, setSharp] = useState(false)
  const sharpRef = useRef(false)
  const arrivedFor = useRef(0)

  useFrame((_, delta) => {
    if (!sharpMapsAllowed(gl)) return
    const progress = progressRef.current ?? 0
    const chapter = Math.floor(progress)
    const inChapter = chapter - 2 === index
    const arrived = inChapter && progress - chapter >= focusIn
    arrivedFor.current = arrived ? arrivedFor.current + delta : 0
    const settled = arrivedFor.current >= SETTLE_SECONDS
    // flying the jet: sharpen whichever planet you are closing in on
    const approached = pilot.active && pilot.nearestIndex === index && pilot.clearance < 3
    const stillNear = pilot.active && pilot.nearestIndex === index && pilot.clearance < 5
    const next = settled || (sharpRef.current && inChapter) || approached || (sharpRef.current && stillNear)
    if (next !== sharpRef.current) {
      sharpRef.current = next
      setSharp(next)
    }
  })

  return sharp
}

type Setup = { colorSpace: THREE.ColorSpace; anisotropy?: number }

/* Loads `url` while `active`; returns the texture once it is decoded and
   uploaded, and null otherwise. */
export function useSharpTexture(
  url: string | undefined,
  active: boolean,
  { colorSpace, anisotropy = 8 }: Setup,
) {
  const gl = useThree((state) => state.gl)
  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!url || !active) return

    let cancelled = false
    let owned: THREE.Texture | null = null
    const loader = new THREE.ImageBitmapLoader()
    // decoded off the main thread, already flipped for WebGL's UV origin
    loader.setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' })

    loader.load(
      url,
      (bitmap) => {
        if (cancelled) {
          bitmap.close()
          return
        }
        const map = new THREE.Texture(bitmap)
        map.flipY = false
        map.colorSpace = colorSpace
        map.wrapS = THREE.RepeatWrapping
        map.wrapT = THREE.ClampToEdgeWrapping
        map.anisotropy = Math.min(anisotropy, gl.capabilities.getMaxAnisotropy())
        map.needsUpdate = true
        owned = map
        // upload now (camera is at rest), not on the first frame it is drawn
        queueUpload(() => {
          if (cancelled) return
          gl.initTexture(map)
          setTexture(map)
        })
      },
      undefined,
      () => {
        /* keep the 2K map */
      },
    )

    return () => {
      cancelled = true
      setTexture(null)
      if (owned) {
        const map = owned
        // let the material switch back to the 2K map before freeing this one
        window.setTimeout(() => {
          map.dispose()
          ;(map.image as ImageBitmap | undefined)?.close?.()
        }, 1000)
      }
    }
  }, [url, active, colorSpace, anisotropy, gl])

  return texture
}
