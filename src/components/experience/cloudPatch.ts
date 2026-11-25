import * as THREE from 'three'

import { runSkyJob } from './skyJobs'

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
   and the old one stays until it is ready; the pixel work is done in a
   worker (skyPixels.ts). Desktop only.
   Texture channels: G is cloud (0 where unseen), B is 1 where seen.
============================================================ */

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
/* (CLOUD_LOD0: read at full detail, as needed inside a loop the
   compiler keeps as a loop: the ground's cloud shadows, Terrain.tsx) */
#ifdef CLOUD_LOD0
#define CLOUD_READ(m, at) textureLod(m, at, 0.0)
#else
#define CLOUD_READ(m, at) texture2D(m, at)
#endif
float cloudFromMaps(sampler2D map, vec2 uv) {
  float c = CLOUD_READ(map, uv).g;
  if (uCloudPatchRect.z <= 0.0) return c;
  vec2 local = vec2(fract(uv.x - uCloudPatchRect.x) / uCloudPatchRect.z, (uv.y - uCloudPatchRect.y) / uCloudPatchRect.w);
  if (local.x > 1.0 || local.y < 0.0 || local.y > 1.0) return c;
  vec4 p = CLOUD_READ(uCloudPatch, local);
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
  texture: THREE.Texture | null
  data: Uint8Array | null
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
  // worked out in the worker (skyPixels.ts); rows from the south
  const data = await runSkyJob<Uint8Array>({ type: 'patch', level: patch.level, row0: patch.row0, col0: patch.col0, cols: patch.cols, date })
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 4
  texture.needsUpdate = true
  patch.texture = texture
  patch.data = data
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
  const py = Math.min(SIZE - 1, Math.floor(y * SIZE))
  const i = (py * SIZE + px) * 4
  if (patch.data[i + 2] < 128) return null
  return patch.data[i + 1] / 255
}
