import * as THREE from 'three'

/* ============================================================
   TODAY'S CLOUDS
   Earth's weather as it really was yesterday: NASA's daily true-colour
   imagery (GIBS: the VIIRS cameras on NOAA-20 and NOAA-21, and MODIS on
   Aqua), stitched into one global map, 2560 x 1280 (about 16 km a pixel),
   and turned into a cloud map: a pixel is cloud where it is bright and
   colourless (deserts are bright but coloured). Snow is bright and
   colourless too: NASA's own daily snow map from the same VIIRS cameras
   (NDSI snow cover, made with a proper cloud mask, about 500 m a pixel,
   read at two to each of ours) says where the white was snow, so it is
   taken out of the clouds and kept as a snow map of its own: real snow
   on the mountains and the plains, as it lay yesterday. (Sea ice still
   reads as cloud.) Where no satellite saw the ground in daylight (the
   gaps between their passes, the polar night) the usual cloud map fills
   in. Fetched only when the camera comes near Earth. The result feeds
   the cloud layer, the clouds' shadows, the 3D clouds flying low, the
   mist you fly through, and the snow on the ground.
============================================================ */

const LAYERS = [
  'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
  'VIIRS_NOAA21_CorrectedReflectance_TrueColor',
  'MODIS_Aqua_CorrectedReflectance_TrueColor',
]
const LEVEL = 2 // tiles of 512 px covering 72 degrees
const WIDTH = 2560
const HEIGHT = 1280
const FALLBACK = '/textures/hd/earth-clouds.webp'
/* NASA's daily snow maps (NDSI snow cover), from both VIIRS cameras: two
   passes, so cloud over one is often clear in the other */
const SNOW_LAYERS = ['VIIRS_NOAA20_NDSI_Snow_Cover', 'VIIRS_NOAA21_NDSI_Snow_Cover']
const SNOW_LEVEL = 3 // tiles of 512 px covering 36 degrees: 2 x 2 pixels to each of the map's

type Sampler = { width: number; height: number; data: Uint8ClampedArray }

export const earthToday = {
  /** the map, once ready */
  texture: null as THREE.CanvasTexture | null,
  /** yesterday's snow on the ground (0..1 cover, in each channel), once ready */
  snow: null as THREE.CanvasTexture | null,
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

/* the snow map's colour scale back to its value: NDSI x 100 (1..100) where
   snow was seen, 0 elsewhere (no snow, cloud, water, night: transparent) */
function ndsiOf(g: number, b: number, a: number) {
  if (a < 128) return 0
  if (g > 225) return b - 127 // 1..20
  if (g > 195) return b - 107 // 21..40
  if (g > 165) return b - 87 // 41..60
  if (g > 140) return b - 67 // 61..80
  return 90 // 81..100
}

/* one camera's snow, per cell of our map: the share of its pixels where
   snow was seen, and the ground's snow cover (the fraction of the ground
   white, from NDSI as NASA's own snow products estimate it) */
async function snowCells(layer: string, date: string) {
  const seen = new Float32Array(WIDTH * HEIGHT)
  const cover = new Float32Array(WIDTH * HEIGHT)
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  let any = false
  const jobs: Promise<void>[] = []
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      const url = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${layer}/default/${date}/500m/${SNOW_LEVEL}/${row}/${col}.png`
      jobs.push(
        fetch(url)
          .then((response) => (response.ok ? response.blob() : null))
          .then((blob) => (blob ? createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }) : null))
          .then((bitmap) => {
            if (!bitmap) return
            any = true
            context.clearRect(0, 0, 512, 512)
            context.drawImage(bitmap, 0, 0)
            bitmap.close()
            const data = context.getImageData(0, 0, 512, 512).data
            for (let y = 0; y < 256; y += 1) {
              for (let x = 0; x < 256; x += 1) {
                let count = 0
                let white = 0
                for (let k = 0; k < 4; k += 1) {
                  const i = ((y * 2 + (k >> 1)) * 512 + x * 2 + (k & 1)) * 4
                  const ndsi = ndsiOf(data[i + 1], data[i + 2], data[i + 3])
                  if (ndsi <= 0) continue
                  count += 1
                  white += Math.min(1, Math.max(0, 0.0145 * ndsi - 0.01))
                }
                if (count === 0) continue
                const cell = (row * 256 + y) * WIDTH + col * 256 + x
                // in the warm low latitudes a lone snowy pixel is more
                // likely a cloud's bright edge: there, snow must fill half
                const lat = 90 - ((cell / WIDTH) | 0) * (180 / HEIGHT)
                if (Math.abs(lat) < 30 && count < 2) continue
                seen[cell] = count / 4
                cover[cell] = white / 4
              }
            }
          })
          .catch(() => {}),
      )
    }
  }
  await Promise.all(jobs)
  return any ? { seen, cover } : null
}

/* a snowfield's few unseen pixels (a wisp of cloud, a lake) are filled
   from round about: each cell takes at least 0.6 of its neighbours' most */
function soften(values: Float32Array) {
  const out = new Float32Array(values.length)
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      let most = 0
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = Math.min(HEIGHT - 1, Math.max(0, y + dy))
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = (x + dx + WIDTH) % WIDTH
          most = Math.max(most, values[yy * WIDTH + xx])
        }
      }
      const i = y * WIDTH + x
      out[i] = Math.max(values[i], most * 0.6)
    }
  }
  return out
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
  Promise.all([
    Promise.all(LAYERS.map((layer) => layerPixels(layer, date))),
    fallbackPixels(),
    Promise.all(SNOW_LAYERS.map((layer) => snowCells(layer, date))),
  ])
    .then(([layers, fallback, snowLayers]) => {
      // snow: what either camera saw
      const snows = snowLayers.filter((snow) => snow !== null)
      let snowSeen: Float32Array | null = null
      let snowCover: Float32Array | null = null
      let snowNear: Float32Array | null = null
      if (snows.length) {
        const seenBoth = new Float32Array(WIDTH * HEIGHT)
        const coverBoth = new Float32Array(WIDTH * HEIGHT)
        for (const snow of snows) {
          for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
            seenBoth[i] = Math.max(seenBoth[i], snow.seen[i])
            coverBoth[i] = Math.max(coverBoth[i], snow.cover[i])
          }
        }
        snowSeen = soften(seenBoth)
        snowCover = coverBoth
        snowNear = soften(coverBoth)
      }
      // the snow on the ground: as seen, and where the snow map has a gap
      // (a wisp of cloud over the snowfield, or its cloud mask too eager
      // over snow) but the picture is white beside a snowfield, snow
      const paint = snowCover ? new Float32Array(WIDTH * HEIGHT) : null
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
        if (paint && snowCover && snowNear) {
          const cell = i >> 2
          paint[cell] = snowCover[cell] > 0 ? snowCover[cell] : cloud > 0.5 ? snowNear[cell] : 0
        }
        if (cloud < 0) cloud = fallback ? fallback[i + 1] / 255 : 0
        else seen += 1
        // where the white was snow, it is not cloud
        if (snowSeen) cloud *= 1 - smoothstep(0.1, 0.6, snowSeen[i >> 2])
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
      if (paint) {
        const snowCanvas = document.createElement('canvas')
        snowCanvas.width = WIDTH
        snowCanvas.height = HEIGHT
        const snowContext = snowCanvas.getContext('2d')!
        const snowData = snowContext.createImageData(WIDTH, HEIGHT)
        for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
          const value = Math.round(paint[i] * 255)
          snowData.data[i * 4] = value
          snowData.data[i * 4 + 1] = value
          snowData.data[i * 4 + 2] = value
          snowData.data[i * 4 + 3] = 255
        }
        snowContext.putImageData(snowData, 0, 0)
        const snow = new THREE.CanvasTexture(snowCanvas)
        snow.wrapS = THREE.RepeatWrapping
        snow.anisotropy = 4
        snow.needsUpdate = true
        earthToday.snow = snow
      }
      earthToday.date = date
      earthToday.sampler = { width: WIDTH, height: HEIGHT, data: out.data }
      earthToday.ready.forEach((listener) => listener())
    })
    .catch(() => {})
}
