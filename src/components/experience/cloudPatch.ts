import * as THREE from 'three'

/* ============================================================
   SHARP CLOUDS UNDER THE CAMERA
   Earth's global cloud map (earthToday.ts) is 16 km a pixel: from the
   Space Station's height, or flying low, that is soft. Around where you
   are looking, the same day's imagery (NASA GIBS: VIIRS on NOAA-20 and
   NOAA-21) is fetched again much finer, made into clouds the same way
   (bright and colourless, less where the snow map saw snow), and laid
   over the global map: 2 km a pixel from orbit, 1 km below 150 km,
   500 m below 30 km. A patch is 4 x 4 tiles (36, 18 or 9 degrees
   across); a new one is built when you near its edge or change height,
   and the old one stays until it is ready. Desktop only.
   Texture channels: G is cloud (0 where unseen), B is 1 where seen.
============================================================ */

const TC_LAYERS = ['VIIRS_NOAA20_CorrectedReflectance_TrueColor', 'VIIRS_NOAA21_CorrectedReflectance_TrueColor']
const SNOW_LAYERS = ['VIIRS_NOAA20_NDSI_Snow_Cover', 'VIIRS_NOAA21_NDSI_Snow_Cover']
const TILE = 512
const SPAN = 4
const SIZE = TILE * SPAN

/* the patch's texture and where it lies, in map UVs (u0, v0 from the
   south, width, height; width 0: no patch). Shared by every shader that
   reads the clouds. */
export const cloudPatchUniforms = {
  uCloudPatch: { value: null as THREE.Texture | null },
  uCloudPatchRect: { value: new THREE.Vector4(0, 0, 0, 0) },
}

export const CLOUD_PATCH_GLSL = /* glsl */ `
uniform sampler2D uCloudPatch; uniform vec4 uCloudPatchRect;
/* yesterday's clouds at a map UV: the global map, with the sharp patch
   over it where it has them (fading in over its edges) */
float cloudFromMaps(sampler2D map, vec2 uv) {
  float c = texture2D(map, uv).g;
  if (uCloudPatchRect.z <= 0.0) return c;
  vec2 local = vec2(fract(uv.x - uCloudPatchRect.x) / uCloudPatchRect.z, (uv.y - uCloudPatchRect.y) / uCloudPatchRect.w);
  if (local.x > 1.0 || local.y < 0.0 || local.y > 1.0) return c;
  vec4 p = texture2D(uCloudPatch, local);
  vec2 edge = min(local, 1.0 - local);
  float fade = smoothstep(0.0, 0.08, min(edge.x, edge.y));
  return c * (1.0 - p.b * fade) + p.g * fade;
}
`

type Patch = {
  level: number
  row0: number
  col0: number
  cols: number
  /** u0, v0 (from the south), width, height */
  rect: [number, number, number, number]
  texture: THREE.CanvasTexture | null
  data: Uint8ClampedArray | null
}

let shown: Patch | null = null
let building: Patch | null = null
let allowedHere: boolean | null = null

function allowed() {
  if (allowedHere !== null) return allowedHere
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  allowedHere =
    window.matchMedia('(min-width: 768px)').matches &&
    typeof createImageBitmap === 'function' &&
    (memory === undefined || memory >= 4)
  return allowedHere
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

async function bitmapOf(url: string) {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return await createImageBitmap(await response.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  } catch {
    return null
  }
}

const levelFor = (altitudeKm: number) => (altitudeKm > 150 ? 5 : altitudeKm > 30 ? 6 : 7)

function placeFor(level: number, lon: number, lat: number) {
  const degrees = 288 / 2 ** level
  const cols = Math.round(360 / degrees)
  const rows = Math.ceil(180 / degrees)
  const col0 = ((Math.round((lon + 180) / degrees - SPAN / 2) % cols) + cols) % cols
  const row0 = THREE.MathUtils.clamp(Math.round((90 - lat) / degrees - SPAN / 2), 0, rows - SPAN)
  return { degrees, cols, rows, col0, row0 }
}

/* is (lon, lat) well inside this patch? */
function inside(patch: Patch, lon: number, lat: number) {
  const degrees = 288 / 2 ** patch.level
  const rows = Math.ceil(180 / degrees)
  let fx = (lon + 180) / degrees - patch.col0
  fx = (((fx % patch.cols) + patch.cols) % patch.cols) / SPAN
  const fy = ((90 - lat) / degrees - patch.row0) / SPAN
  const yOk = (fy >= 0.25 || patch.row0 === 0) && (fy <= 0.75 || patch.row0 === rows - SPAN) && fy >= 0 && fy <= 1
  return fx >= 0.25 && fx <= 0.75 && yOk
}

async function build(patch: Patch, date: string) {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  const out = context.createImageData(SIZE, SIZE)
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = 255
  const tile = document.createElement('canvas')
  tile.width = TILE
  tile.height = TILE
  const tileContext = tile.getContext('2d', { willReadFrequently: true })!
  const read = (bitmap: ImageBitmap | null) => {
    if (!bitmap) return null
    tileContext.clearRect(0, 0, TILE, TILE)
    tileContext.drawImage(bitmap, 0, 0)
    bitmap.close()
    return tileContext.getImageData(0, 0, TILE, TILE).data
  }
  const jobs: Promise<void>[] = []
  for (let ty = 0; ty < SPAN; ty += 1) {
    for (let tx = 0; tx < SPAN; tx += 1) {
      const row = patch.row0 + ty
      const col = (patch.col0 + tx) % patch.cols
      const urls = [
        ...TC_LAYERS.map((layer) => `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${layer}/default/${date}/250m/${patch.level}/${row}/${col}.jpg`),
        ...SNOW_LAYERS.map((layer) => `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${layer}/default/${date}/500m/${patch.level}/${row}/${col}.png`),
      ]
      jobs.push(
        Promise.all(urls.map(bitmapOf)).then((bitmaps) => {
          // decoded one after another (one small canvas between them)
          const pictures = bitmaps.slice(0, TC_LAYERS.length).map(read)
          const snows = bitmaps.slice(TC_LAYERS.length).map(read)
          for (let y = 0; y < TILE; y += 1) {
            for (let x = 0; x < TILE; x += 1) {
              const i = (y * TILE + x) * 4
              let cloud = -1
              for (const data of pictures) {
                if (!data) continue
                const r = data[i]
                const g = data[i + 1]
                const b = data[i + 2]
                if (r + g + b < 12) continue // no data here
                const max = Math.max(r, g, b)
                const min = Math.min(r, g, b)
                const sat = max > 0 ? (max - min) / max : 0
                cloud = smoothstep(0.3, 0.72, (r + g + b) / 765) * (1 - smoothstep(0.1, 0.28, sat))
                break
              }
              const o = ((ty * TILE + y) * SIZE + tx * TILE + x) * 4
              if (cloud < 0) continue // unseen: the global map shows
              // the white was snow, not cloud
              for (const snow of snows) if (snow && snow[i + 3] > 128) cloud = 0
              out.data[o + 1] = Math.round(cloud * 255)
              out.data[o + 2] = 255
            }
          }
        }),
      )
    }
  }
  await Promise.all(jobs)
  context.putImageData(out, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = 4
  texture.needsUpdate = true
  patch.texture = texture
  patch.data = out.data
}

function show(patch: Patch | null) {
  if (shown && shown !== patch) shown.texture?.dispose()
  shown = patch
  cloudPatchUniforms.uCloudPatch.value = patch?.texture ?? null
  if (patch) cloudPatchUniforms.uCloudPatchRect.value.fromArray(patch.rect)
  else cloudPatchUniforms.uCloudPatchRect.value.set(0, 0, 0, 0)
}

/** keep a sharp patch round where you are looking (lon, lat in degrees);
 * `date` is the global map's day; null hides the patch */
export function aimCloudPatch(lon: number, lat: number, altitudeKm: number, date: string | null) {
  if (!date || typeof window === 'undefined' || !allowed()) {
    if (shown) show(null)
    return
  }
  const level = levelFor(altitudeKm)
  const current = building ?? shown
  if (current && current.level === level && inside(current, lon, lat)) return
  if (building) return // one at a time: the next is decided when it is done
  const place = placeFor(level, lon, lat)
  const span = SPAN * place.degrees
  const patch: Patch = {
    level,
    row0: place.row0,
    col0: place.col0,
    cols: place.cols,
    rect: [(place.col0 * place.degrees) / 360, (180 - (place.row0 + SPAN) * place.degrees) / 180, span / 360, span / 180],
    texture: null,
    data: null,
  }
  building = patch
  build(patch, date)
    .then(() => show(patch))
    .catch(() => {})
    .finally(() => {
      if (building === patch) building = null
    })
}

/** cloud 0..1 from the patch at a map UV, or null outside it / unseen */
export function patchCover(u: number, v: number) {
  const patch = shown
  if (!patch?.data) return null
  const [u0, v0, w, h] = patch.rect
  const x = (((u - u0) % 1) + 1) % 1 / w
  const y = (v - v0) / h
  if (x > 1 || y < 0 || y > 1) return null
  const px = Math.min(SIZE - 1, Math.floor(x * SIZE))
  const py = Math.min(SIZE - 1, Math.floor((1 - y) * SIZE))
  const i = (py * SIZE + px) * 4
  if (patch.data[i + 2] < 128) return null
  return patch.data[i + 1] / 255
}
