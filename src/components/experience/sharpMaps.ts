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

/* A 4K map sent to the graphics card in one go costs a frame 30–80 ms (a
   visible jolt just as the camera settles on a planet). So it goes up in
   tiles instead: the texture's memory is reserved empty, the decoded map
   arrives cut into 1024 x 512 tiles, one tile is copied in per frame (a
   few ms), and the smaller mip levels are made once, with the last tile.
   The same pixels, spread over some 16 frames. Maps go one at a time, so
   Earth's four never share a frame. The planet keeps its 2K map until the
   last tile is in. */
const TILE_W = 1024
const TILE_H = 512
let uploadQueue: Promise<void> = Promise.resolve()

type Tiles = { width: number; height: number; tiles: { bitmap: ImageBitmap; x: number; y: number }[] }

/* Fetches, decodes (flipped for WebGL's UV origin, rows bottom up) and cuts
   a map into tiles. Self-contained, because its source text is what the
   decoding worker runs. */
async function decodeTiles(url: string, tileW: number, tileH: number): Promise<Tiles> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status}`)
  const whole = await createImageBitmap(await response.blob(), {
    imageOrientation: 'flipY',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })
  const { width, height } = whole
  const tiles: Tiles['tiles'] = []
  for (let y = 0; y < height; y += tileH) {
    for (let x = 0; x < width; x += tileW) {
      const w = Math.min(tileW, width - x)
      const h = Math.min(tileH, height - y)
      tiles.push({ bitmap: await createImageBitmap(whole, x, y, w, h, { premultiplyAlpha: 'none' }), x, y })
    }
  }
  whole.close()
  return { width, height, tiles }
}

/* Done on the main thread, the decode and the cutting held the frame the
   map arrived in for 40–90 ms (the decoded map is handed over, then cut
   up). In a worker they cost the page nothing: the finished tiles are
   handed over without a copy. The worker is made from decodeTiles' own
   source, as the bundler would copy a worker file as it is (TypeScript),
   which no browser runs. Where workers cannot decode, the main thread
   does it as before. */
let decoder: Worker | null | undefined
let nextJob = 1
const decoding = new Map<number, { resolve: (tiles: Tiles) => void; reject: (error: Error) => void }>()

function decodeWorker() {
  if (decoder !== undefined) return decoder
  decoder = null
  if (typeof Worker === 'undefined') return decoder
  try {
    const code = `const decodeTiles = ${decodeTiles.toString()}
onmessage = (event) => {
  const { id, url, tileW, tileH } = event.data
  decodeTiles(url, tileW, tileH).then(
    (result) => postMessage({ id, result }, result.tiles.map((tile) => tile.bitmap)),
    (error) => postMessage({ id, error: String(error) }),
  )
}`
    const worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })))
    worker.onmessage = (event: MessageEvent<{ id: number; result?: Tiles; error?: string }>) => {
      const job = decoding.get(event.data.id)
      if (!job) return
      decoding.delete(event.data.id)
      if (event.data.result) job.resolve(event.data.result)
      else job.reject(new Error(event.data.error))
    }
    worker.onerror = () => {
      // the worker cannot run here: what it had in hand goes to the main thread
      decoder = null
      worker.terminate()
      decoding.forEach((job) => job.reject(new Error('worker')))
      decoding.clear()
    }
    decoder = worker
  } catch {
    decoder = null
  }
  return decoder
}

function decodeOffThread(url: string): Promise<Tiles> {
  const absolute = new URL(url, window.location.href).href
  const worker = decodeWorker()
  if (!worker) return decodeTiles(absolute, TILE_W, TILE_H)
  const id = nextJob++
  return new Promise<Tiles>((resolve, reject) => {
    decoding.set(id, { resolve, reject })
    worker.postMessage({ id, url: absolute, tileW: TILE_W, tileH: TILE_H })
  }).catch((error: Error) => {
    if (error.message === 'worker') return decodeTiles(absolute, TILE_W, TILE_H)
    throw error
  })
}

const closeTiles = ({ tiles }: Tiles) => tiles.forEach(({ bitmap }) => bitmap.close())

/* Freeing a 4K map is felt too: Earth's four freed in one moment stalled
   a frame for 50 ms. So they are let go one at a time, a little apart,
   starting once the material is back on its 2K map. */
const RELEASE_AFTER_MS = 1000
const RELEASE_GAP_MS = 350
let releaseAt = 0
function releaseLater(map: THREE.Texture) {
  const now = performance.now()
  releaseAt = Math.max(now + RELEASE_AFTER_MS, releaseAt + RELEASE_GAP_MS)
  window.setTimeout(() => map.dispose(), releaseAt - now)
}
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

function uploadInTiles(gl: THREE.WebGLRenderer, { tiles }: Tiles, map: THREE.DataTexture, stillWanted: () => boolean) {
  const job = uploadQueue.then(async () => {
    if (!stillWanted()) return false
    // the memory, with room for every mip level (reserved, nothing sent)
    map.generateMipmaps = true
    gl.initTexture(map)
    const source = new THREE.Texture()
    source.flipY = false
    const place = new THREE.Vector2()
    let complete = true
    for (let i = 0; i < tiles.length; i += 1) {
      await nextFrame()
      if (!stillWanted()) {
        complete = false
        break
      }
      const { bitmap, x, y } = tiles[i]
      source.image = bitmap
      // the mip levels are made once, with the last tile
      map.generateMipmaps = i === tiles.length - 1
      gl.copyTextureToTexture(source, map, null, place.set(x, y))
    }
    map.generateMipmaps = true
    return complete
  })
  // the queue moves on whatever happens to this map
  uploadQueue = job.then(
    () => nextFrame(),
    () => nextFrame(),
  )
  return job
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

type Setup = { colorSpace: THREE.ColorSpace; anisotropy?: number; format?: THREE.PixelFormat }

/* Loads `url` while `active`; returns the texture once it is decoded and
   uploaded, and null otherwise. */
export function useSharpTexture(
  url: string | undefined,
  active: boolean,
  { colorSpace, anisotropy = 8, format = THREE.RGBAFormat }: Setup,
) {
  const gl = useThree((state) => state.gl)
  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!url || !active) return

    let cancelled = false
    let owned: THREE.Texture | null = null

    decodeOffThread(url).then(
      (decoded) => {
        if (cancelled) {
          closeTiles(decoded)
          return
        }
        // an empty texture of the map's size, filled tile by tile
        const map = new THREE.DataTexture(null, decoded.width, decoded.height, format, THREE.UnsignedByteType)
        map.source.dataReady = false
        map.flipY = false
        map.colorSpace = colorSpace
        map.wrapS = THREE.RepeatWrapping
        map.wrapT = THREE.ClampToEdgeWrapping
        map.magFilter = THREE.LinearFilter
        map.minFilter = THREE.LinearMipmapLinearFilter
        map.anisotropy = Math.min(anisotropy, gl.capabilities.getMaxAnisotropy())
        map.needsUpdate = true
        owned = map
        uploadInTiles(gl, decoded, map, () => !cancelled)
          .then((complete) => {
            if (complete && !cancelled) setTexture(map)
          })
          .catch(() => {}) // keep the 2K map
          .finally(() => closeTiles(decoded))
      },
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
        releaseLater(map)
      }
    }
  }, [url, active, colorSpace, anisotropy, gl])

  return texture
}
