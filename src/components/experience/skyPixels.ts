/* ============================================================
   EARTH'S REAL WEATHER, WORKED OUT OFF THE MAIN THREAD
   The pixel work behind earthToday.ts (yesterday's clouds and snow, the
   global map) and cloudPatch.ts (the sharp patch round the view): tiles
   fetched from NASA GIBS, decoded on OffscreenCanvases and turned into
   maps, all inside a worker (skyWorker.ts), so the flight never stalls
   while it happens (it took the better part of a second). No three.js,
   no DOM: plain arrays out, RGBA, rows from the south (as a texture
   is uploaded), handed back without copying.
============================================================ */

export const MAP_WIDTH = 2560
export const MAP_HEIGHT = 1280
export const PATCH_SIZE = 2048

const TODAY_LAYERS = [
  'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
  'VIIRS_NOAA21_CorrectedReflectance_TrueColor',
  'MODIS_Aqua_CorrectedReflectance_TrueColor',
]
const PATCH_LAYERS = ['VIIRS_NOAA20_CorrectedReflectance_TrueColor', 'VIIRS_NOAA21_CorrectedReflectance_TrueColor']
const SNOW_LAYERS = ['VIIRS_NOAA20_NDSI_Snow_Cover', 'VIIRS_NOAA21_NDSI_Snow_Cover']
const LEVEL = 2 // tiles of 512 px covering 72 degrees
const SNOW_LEVEL = 3 // tiles of 512 px covering 36 degrees: 2 x 2 pixels to each of the map's
const FALLBACK = '/textures/hd/earth-clouds.webp'
const TILE = 512
const SPAN = 4
const W = MAP_WIDTH
const H = MAP_HEIGHT

const gibs = (layer: string, set: string, level: number, row: number, col: number, date: string, ext: string) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${layer}/default/${date}/${set}/${level}/${row}/${col}.${ext}`

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

async function bitmapOf(url: string, exact = false): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    return await (exact ? createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }) : createImageBitmap(blob))
  } catch {
    return null
  }
}

function canvas2d(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height)
  return canvas.getContext('2d', { willReadFrequently: true })!
}

/* a pixel's cloud from a true-colour picture: bright and colourless (-1: no data) */
function cloudOf(data: Uint8ClampedArray, i: number) {
  const r = data[i]
  const g = data[i + 1]
  const b = data[i + 2]
  if (r + g + b < 12) return -1
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const sat = max > 0 ? (max - min) / max : 0
  return smoothstep(0.3, 0.72, (r + g + b) / 765) * (1 - smoothstep(0.1, 0.28, sat))
}

/* ---- the global map */

/* one satellite's day, as a global picture (no data: black), rows from the north */
async function layerPixels(layer: string, date: string) {
  const context = canvas2d(W, H)
  context.fillStyle = '#000'
  context.fillRect(0, 0, W, H)
  const jobs: Promise<void>[] = []
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      jobs.push(
        bitmapOf(gibs(layer, '250m', LEVEL, row, col, date, 'jpg')).then((bitmap) => {
          if (!bitmap) return
          context.drawImage(bitmap, col * TILE, row * TILE)
          bitmap.close()
        }),
      )
    }
  }
  await Promise.all(jobs)
  return context.getImageData(0, 0, W, H).data
}

async function fallbackPixels() {
  const bitmap = await bitmapOf(FALLBACK)
  if (!bitmap) return null
  const context = canvas2d(W, H)
  context.drawImage(bitmap, 0, 0, W, H)
  bitmap.close()
  return context.getImageData(0, 0, W, H).data
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

/* one camera's snow, per cell of the map (rows from the north): the share
   of its pixels where snow was seen, and the ground's snow cover */
async function snowCells(layer: string, date: string) {
  const seen = new Float32Array(W * H)
  const cover = new Float32Array(W * H)
  const context = canvas2d(TILE, TILE)
  let any = false
  const jobs: Promise<void>[] = []
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      jobs.push(
        bitmapOf(gibs(layer, '500m', SNOW_LEVEL, row, col, date, 'png'), true).then((bitmap) => {
          if (!bitmap) return
          any = true
          context.clearRect(0, 0, TILE, TILE)
          context.drawImage(bitmap, 0, 0)
          bitmap.close()
          const data = context.getImageData(0, 0, TILE, TILE).data
          for (let y = 0; y < 256; y += 1) {
            for (let x = 0; x < 256; x += 1) {
              let count = 0
              let white = 0
              for (let k = 0; k < 4; k += 1) {
                const i = ((y * 2 + (k >> 1)) * TILE + x * 2 + (k & 1)) * 4
                const ndsi = ndsiOf(data[i + 1], data[i + 2], data[i + 3])
                if (ndsi <= 0) continue
                count += 1
                white += Math.min(1, Math.max(0, 0.0145 * ndsi - 0.01))
              }
              if (count === 0) continue
              const cell = (row * 256 + y) * W + col * 256 + x
              // in the warm low latitudes a lone snowy pixel is more likely
              // a cloud's bright edge: there, snow must fill half
              const lat = 90 - ((cell / W) | 0) * (180 / H)
              if (Math.abs(lat) < 30 && count < 2) continue
              seen[cell] = count / 4
              cover[cell] = white / 4
            }
          }
        }),
      )
    }
  }
  await Promise.all(jobs)
  return any ? { seen, cover } : null
}

/* a snowfield's few unseen pixels are filled from round about: each cell
   takes at least 0.6 of its neighbours' most */
function soften(values: Float32Array) {
  const out = new Float32Array(values.length)
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      let most = 0
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = Math.min(H - 1, Math.max(0, y + dy))
        for (let dx = -1; dx <= 1; dx += 1) {
          most = Math.max(most, values[yy * W + ((x + dx + W) % W)])
        }
      }
      const i = y * W + x
      out[i] = Math.max(values[i], most * 0.6)
    }
  }
  return out
}

/** yesterday's clouds and snow as global maps (RGBA, rows from the
 * south), or null when barely any real data came */
export async function todayMaps(date: string) {
  const [layers, fallback, snowLayers] = await Promise.all([
    Promise.all(TODAY_LAYERS.map((layer) => layerPixels(layer, date))),
    fallbackPixels(),
    Promise.all(SNOW_LAYERS.map((layer) => snowCells(layer, date))),
  ])
  // snow: what either camera saw
  const snows = snowLayers.filter((snow) => snow !== null)
  let snowSeen: Float32Array | null = null
  let snowCover: Float32Array | null = null
  let snowNear: Float32Array | null = null
  if (snows.length) {
    const seenBoth = new Float32Array(W * H)
    const coverBoth = new Float32Array(W * H)
    for (const snow of snows) {
      for (let i = 0; i < W * H; i += 1) {
        seenBoth[i] = Math.max(seenBoth[i], snow.seen[i])
        coverBoth[i] = Math.max(coverBoth[i], snow.cover[i])
      }
    }
    snowSeen = soften(seenBoth)
    snowCover = coverBoth
    snowNear = soften(coverBoth)
  }
  const cloudOut = new Uint8Array(W * H * 4)
  const snowOut = snowCover ? new Uint8Array(W * H * 4) : null
  let seen = 0
  for (let cell = 0; cell < W * H; cell += 1) {
    const i = cell * 4
    let cloud = -1
    for (const data of layers) {
      cloud = cloudOf(data, i)
      if (cloud >= 0) break
    }
    // (rows from the south, as uploaded)
    const o = ((H - 1 - ((cell / W) | 0)) * W + (cell % W)) * 4
    // the snow on the ground: as seen, and where the snow map has a gap
    // but the picture is white beside a snowfield, snow
    if (snowOut && snowCover && snowNear) {
      const paint = snowCover[cell] > 0 ? snowCover[cell] : cloud > 0.5 ? snowNear[cell] : 0
      const value = Math.round(paint * 255)
      snowOut[o] = value
      snowOut[o + 1] = value
      snowOut[o + 2] = value
      snowOut[o + 3] = 255
    }
    if (cloud < 0) cloud = fallback ? fallback[i + 1] / 255 : 0
    else seen += 1
    // where the white was snow, it is not cloud
    if (snowSeen) cloud *= 1 - smoothstep(0.1, 0.6, snowSeen[cell])
    const value = Math.round(cloud * 255)
    cloudOut[o] = value
    cloudOut[o + 1] = value
    cloudOut[o + 2] = value
    cloudOut[o + 3] = 255
  }
  // barely any real data (the service down, or the day not there yet)
  if (seen < W * H * 0.2) return null
  return { cloud: cloudOut, snow: snowOut }
}

/* ---- the sharp patch: 4 x 4 tiles at `level`; G is cloud (0 where
   unseen), B is 255 where seen; rows from the south */
export async function patchMap(level: number, row0: number, col0: number, cols: number, date: string) {
  const out = new Uint8Array(PATCH_SIZE * PATCH_SIZE * 4)
  for (let i = 3; i < out.length; i += 4) out[i] = 255
  const context = canvas2d(TILE, TILE)
  const read = (bitmap: ImageBitmap | null) => {
    if (!bitmap) return null
    context.clearRect(0, 0, TILE, TILE)
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    return context.getImageData(0, 0, TILE, TILE).data
  }
  const jobs: Promise<void>[] = []
  for (let ty = 0; ty < SPAN; ty += 1) {
    for (let tx = 0; tx < SPAN; tx += 1) {
      const row = row0 + ty
      const col = (col0 + tx) % cols
      const urls = [
        ...PATCH_LAYERS.map((layer) => [gibs(layer, '250m', level, row, col, date, 'jpg'), false] as const),
        ...SNOW_LAYERS.map((layer) => [gibs(layer, '500m', level, row, col, date, 'png'), true] as const),
      ]
      jobs.push(
        Promise.all(urls.map(([url, exact]) => bitmapOf(url, exact))).then((bitmaps) => {
          const pictures = bitmaps.slice(0, PATCH_LAYERS.length).map(read)
          const snows = bitmaps.slice(PATCH_LAYERS.length).map(read)
          for (let y = 0; y < TILE; y += 1) {
            const outRow = PATCH_SIZE - 1 - (ty * TILE + y)
            for (let x = 0; x < TILE; x += 1) {
              const i = (y * TILE + x) * 4
              let cloud = -1
              for (const data of pictures) {
                if (!data) continue
                cloud = cloudOf(data, i)
                if (cloud >= 0) break
              }
              if (cloud < 0) continue // unseen: the global map shows
              // the white was snow, not cloud
              for (const snow of snows) if (snow && snow[i + 3] > 128) cloud = 0
              const o = (outRow * PATCH_SIZE + tx * TILE + x) * 4
              out[o + 1] = Math.round(cloud * 255)
              out[o + 2] = 255
            }
          }
        }),
      )
    }
  }
  await Promise.all(jobs)
  return out
}
