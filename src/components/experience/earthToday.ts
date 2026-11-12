import * as THREE from 'three'

/* ============================================================
   TODAY'S CLOUDS
   Earth's weather as it really was yesterday: NASA's daily true-colour
   imagery (GIBS: the VIIRS cameras on NOAA-20 and Suomi NPP, and MODIS on
   Aqua), stitched into one global map, 2560 x 1280 (about 16 km a pixel),
   and turned into a cloud map: a pixel is cloud where it is bright and
   colourless (deserts are bright but coloured; snow and sea ice read as
   cloud, as they are white anyway). Where no satellite saw the ground in
   daylight (the gaps between their passes, the polar night) the usual
   cloud map fills in. Fetched only when the camera comes near Earth.
   The result feeds the cloud layer, the clouds' shadows, the 3D clouds
   flying low, and the mist you fly through.
============================================================ */

const LAYERS = [
  'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
  'VIIRS_SNPP_CorrectedReflectance_TrueColor',
  'MODIS_Aqua_CorrectedReflectance_TrueColor',
]
const LEVEL = 2 // tiles of 512 px covering 72 degrees
const WIDTH = 2560
const HEIGHT = 1280
const FALLBACK = '/textures/hd/earth-clouds.webp'

type Sampler = { width: number; height: number; data: Uint8ClampedArray }

export const earthToday = {
  /** the map, once ready */
  texture: null as THREE.CanvasTexture | null,
  /** the day it shows (YYYY-MM-DD, UTC), once ready */
  date: '',
  sampler: null as Sampler | null,
  started: false,
  /** listeners told when it is ready */
  ready: new Set<() => void>(),
  /** cloud cover 0..1 at a map position (u, v as three.js sphere UVs), or null */
  cover(u: number, v: number) {
    const map = this.sampler
    if (!map) return null
    const x = Math.min(map.width - 1, Math.max(0, Math.floor(u * map.width)))
    const y = Math.min(map.height - 1, Math.max(0, Math.floor((1 - v) * map.height)))
    return map.data[(y * map.width + x) * 4 + 1] / 255
  },
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

async function tileImage(url: string): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return await createImageBitmap(await response.blob())
  } catch {
    return null
  }
}

/* one satellite's day, as a global canvas (no data: black) */
async function layerPixels(layer: string, date: string) {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.fillStyle = '#000'
  context.fillRect(0, 0, WIDTH, HEIGHT)
  const jobs: Promise<void>[] = []
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const url = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${layer}/default/${date}/250m/${LEVEL}/${row}/${col}.jpg`
      jobs.push(
        tileImage(url).then((bitmap) => {
          if (!bitmap) return
          context.drawImage(bitmap, col * 512, row * 512)
          bitmap.close()
        }),
      )
    }
  }
  await Promise.all(jobs)
  return context.getImageData(0, 0, WIDTH, HEIGHT).data
}

async function fallbackPixels() {
  const bitmap = await tileImage(FALLBACK)
  if (!bitmap) return null
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(bitmap, 0, 0, WIDTH, HEIGHT)
  bitmap.close()
  return context.getImageData(0, 0, WIDTH, HEIGHT).data
}

/** start fetching (once); listeners in earthToday.ready are told when done */
export function loadEarthToday() {
  if (earthToday.started || typeof window === 'undefined') return
  earthToday.started = true
  // yesterday (UTC): the latest day the satellites have finished
  const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  Promise.all([...LAYERS.map((layer) => layerPixels(layer, date)), fallbackPixels()])
    .then((all) => {
      const layers = all.slice(0, LAYERS.length) as Uint8ClampedArray[]
      const fallback = all[LAYERS.length] as Uint8ClampedArray | null
      const canvas = document.createElement('canvas')
      canvas.width = WIDTH
      canvas.height = HEIGHT
      const context = canvas.getContext('2d', { willReadFrequently: true })!
      const out = context.createImageData(WIDTH, HEIGHT)
      let seen = 0
      for (let i = 0; i < WIDTH * HEIGHT * 4; i += 4) {
        let cloud = -1
        for (const data of layers) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          if (r + g + b < 12) continue // no data here
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const lum = (r + g + b) / 765
          const sat = max > 0 ? (max - min) / max : 0
          cloud = smoothstep(0.3, 0.72, lum) * (1 - smoothstep(0.1, 0.28, sat))
          break
        }
        if (cloud < 0) cloud = fallback ? fallback[i + 1] / 255 : 0
        else seen += 1
        const value = Math.round(cloud * 255)
        out.data[i] = value
        out.data[i + 1] = value
        out.data[i + 2] = value
        out.data[i + 3] = 255
      }
      // barely any real data (the service down, or the day not there yet):
      // keep the usual map
      if (seen < WIDTH * HEIGHT * 0.2) return
      context.putImageData(out, 0, 0)
      const texture = new THREE.CanvasTexture(canvas)
      texture.wrapS = THREE.RepeatWrapping
      texture.anisotropy = 4
      texture.needsUpdate = true
      earthToday.texture = texture
      earthToday.date = date
      earthToday.sampler = { width: WIDTH, height: HEIGHT, data: out.data }
      earthToday.ready.forEach((listener) => listener())
    })
    .catch(() => {})
}
