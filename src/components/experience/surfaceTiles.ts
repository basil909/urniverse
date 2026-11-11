'use client'

import { type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { pilot } from './pilotState'

/* ============================================================
   REAL SURFACE IMAGERY, STREAMED WHILE FLYING
   The surface maps are a few km per pixel. Flying low over Earth, Mars
   or Mercury, the patch of ground you are looking at is filled in with
   NASA's own imagery, fetched tile by tile as you go:
     Earth   Blue Marble Next Generation, ~500 m/pixel, and the VIIRS
             city lights (2012) on the night side (NASA GIBS)
     Mars    Viking MDIM 2.1 colour mosaic, ~300 m/pixel (NASA Trek)
     Mercury MESSENGER MDIS basemap, ~230 m/pixel (NASA Trek)
   Mars's Viking mosaic is greyer and Mercury's basemap darker than the
   maps used everywhere else, so each is scaled, channel by channel, to
   the maps' average colour: the detail is NASA's, the colour stays.
   All are equirectangular, -180..180 degrees from the left, as the maps
   are, so a patch is just a rectangle of the map's UVs.
   Two patches per layer, like a clipmap: a fine one under the view and a
   coarse one, four times as wide, around it. Each is a 2048-pixel canvas
   the tiles are drawn into; the shaders blend it over the map, fading at
   its edges, and show the map wherever a tile has not arrived. Offline,
   nothing changes.
============================================================ */

export type Source = {
  url: (z: number, row: number, col: number) => string
  tile: number
  maxLevel: number
  /** degrees per tile at a level */
  degrees: (z: number) => number
  /** web-map tiles (Web Mercator, 2^z a side) rather than latitude/longitude */
  mercator?: boolean
}

/* Web Mercator: how far down the map a latitude is, 0 (north) to 1 */
export function mercatorY(lat: number) {
  const phi = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(lat, -85.05, 85.05))
  return (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2
}

const gibs = (layer: string, ext: string): Source => ({
  url: (z, row, col) =>
    `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${layer}/default/500m/${z}/${row}/${col}.${ext}`,
  tile: 512,
  maxLevel: 7,
  degrees: (z) => 288 / 2 ** z,
})

const trek = (body: string, layer: string, maxLevel: number): Source => ({
  url: (z, row, col) =>
    `https://trek.nasa.gov/tiles/${body}/EQ/${layer}/1.0.0/default/default028mm/${z}/${row}/${col}.jpg`,
  tile: 256,
  maxLevel,
  degrees: (z) => 180 / 2 ** z,
})

/* by orbit index; radius in km, mapWidth: the sharpest local map's width,
   gain: the colour match to the local maps */
const SOURCES: Record<
  number,
  { day: Source; night?: Source; radiusKm: number; mapWidth: number; gain: [number, number, number] }
> = {
  0: {
    day: trek('Mercury', 'Mercury_MESSENGER_MDIS_Basemap_BDR_Mosaic_Global_166m', 7),
    radiusKm: 2439.7,
    mapWidth: 4096,
    gain: [1.86, 1.84, 1.85],
  },
  2: {
    day: gibs('BlueMarble_NextGeneration', 'jpeg'),
    night: gibs('VIIRS_CityLights_2012', 'jpeg'),
    radiusKm: 6371,
    mapWidth: 4096,
    gain: [1, 1, 1],
  },
  3: {
    day: trek('Mars', 'Mars_Viking_MDIM21_ClrMosaic_global_232m', 7),
    radiusKm: 3389.5,
    mapWidth: 4096,
    gain: [1.48, 0.946, 0.659],
  },
}

export const STREAMED_PLANETS = Object.keys(SOURCES).map(Number)

const CANVAS = 2048
const MAX_IN_FLIGHT = 6
const CACHE_LIMIT = 160
const UPLOAD_GAP = 0.35 // seconds between texture uploads

/* shared by every planet's material: which planet the patches belong to,
   and the four patch textures with their rectangles (u0, v0, width, height) */
export const surfacePatch = {
  uPatchPlanet: { value: -1 },
  uPatchGain: { value: new THREE.Vector3(1, 1, 1) },
  uPatchFine: { value: null as THREE.Texture | null },
  uPatchFineRect: { value: new THREE.Vector4() },
  uPatchCoarse: { value: null as THREE.Texture | null },
  uPatchCoarseRect: { value: new THREE.Vector4() },
  uNightFine: { value: null as THREE.Texture | null },
  uNightFineRect: { value: new THREE.Vector4() },
  uNightCoarse: { value: null as THREE.Texture | null },
  uNightCoarseRect: { value: new THREE.Vector4() },
}

export const SURFACE_PATCH_GLSL = /* glsl */ `
uniform int uPatchPlanet; uniform vec3 uPatchGain;
uniform sampler2D uPatchFine; uniform vec4 uPatchFineRect;
uniform sampler2D uPatchCoarse; uniform vec4 uPatchCoarseRect;
uniform sampler2D uNightFine; uniform vec4 uNightFineRect;
uniform sampler2D uNightCoarse; uniform vec4 uNightCoarseRect;
/* a patch's texel at a map UV (premultiplied: zero outside the patch,
   where no tile has arrived, and fading over its last few percent) */
vec4 patchTexel(sampler2D map, vec4 rect, vec2 uv) {
  vec2 local = vec2(fract(uv.x - rect.x) / max(rect.z, 1e-6), (uv.y - rect.y) / max(rect.w, 1e-6));
  vec4 c = texture2D(map, clamp(local, 0.0, 1.0));
  vec2 edge = min(local, 1.0 - local);
  float keep = rect.z > 0.0 ? smoothstep(0.0, 0.06, min(edge.x, edge.y)) : 0.0;
  return c * keep;
}
/* the map, with the coarse and then the fine patch over it;
   .a says how much of the result is streamed imagery */
vec4 patched(vec3 base, sampler2D fine, vec4 fineRect, sampler2D coarse, vec4 coarseRect, vec2 uv, vec3 gain) {
  vec4 c = patchTexel(coarse, coarseRect, uv);
  vec3 color = base * (1.0 - c.a) + c.rgb * gain;
  vec4 f = patchTexel(fine, fineRect, uv);
  color = color * (1.0 - f.a) + f.rgb * gain;
  return vec4(color, max(c.a, f.a));
}
`

/* ---- tiles: fetched, decoded off the main thread, kept for a while */
const cache = new Map<string, ImageBitmap>()
const failed = new Set<string>()

function cached(url: string) {
  const bitmap = cache.get(url)
  if (bitmap) {
    // most recently used goes to the back
    cache.delete(url)
    cache.set(url, bitmap)
  }
  return bitmap
}

function remember(url: string, bitmap: ImageBitmap) {
  cache.set(url, bitmap)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string
    cache.get(oldest)?.close()
    cache.delete(oldest)
  }
}

type Layout = { source: Source; z: number; c0: number; r0: number; n: number; cols: number; rows: number }

export class PatchLayer {
  private canvas = document.createElement('canvas')
  private context: CanvasRenderingContext2D
  readonly texture: THREE.CanvasTexture
  private layout: Layout | null = null
  private rect = new THREE.Vector4()
  private dirty = false
  private sinceUpload = 0
  private inFlight = new Map<string, AbortController>()
  private queue: { url: string; slotX: number; slotY: number; distance: number }[] = []

  constructor(
    private textureUniform: { value: THREE.Texture | null },
    private rectUniform: { value: THREE.Vector4 },
  ) {
    this.canvas.width = CANVAS
    this.canvas.height = CANVAS
    this.context = this.canvas.getContext('2d')!
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.premultiplyAlpha = true
    this.texture.anisotropy = 8
    this.texture.wrapS = THREE.ClampToEdgeWrapping
    this.texture.wrapT = THREE.ClampToEdgeWrapping
  }

  /* centre the patch on (lon, lat) at level z, moving it only once the
     centre has drifted a tile away (so it does not jitter) */
  aim(source: Source, z: number, lon: number, lat: number) {
    const deg = source.degrees(z)
    const n = CANVAS / source.tile
    const count = 2 ** z
    const cols = source.mercator ? count : Math.round(360 / deg)
    const rows = source.mercator ? count : Math.ceil(180 / deg)
    const colF = source.mercator ? ((lon + 180) / 360) * count : (lon + 180) / deg
    const rowF = source.mercator ? mercatorY(lat) * count : (90 - lat) / deg
    const current = this.layout
    if (
      current &&
      current.source === source &&
      current.z === z &&
      Math.abs(wrapDelta(colF - (current.c0 + n / 2), cols)) <= 1 &&
      (Math.abs(rowF - (current.r0 + n / 2)) <= 1 || rows <= n)
    ) {
      return
    }
    const c0 = Math.round(colF - n / 2)
    const r0 = THREE.MathUtils.clamp(Math.round(rowF - n / 2), 0, Math.max(0, rows - n))
    this.layout = { source, z, c0, r0, n, cols, rows }

    // redraw from what is already here, and ask for the rest, nearest first
    this.context.clearRect(0, 0, CANVAS, CANVAS)
    const wanted = new Set<string>()
    this.queue = []
    for (let y = 0; y < n; y += 1) {
      const row = r0 + y
      if (row >= rows) continue
      for (let x = 0; x < n; x += 1) {
        const col = (((c0 + x) % cols) + cols) % cols
        const url = source.url(z, row, col)
        const bitmap = cached(url)
        if (bitmap) {
          this.draw(bitmap, x, y)
        } else if (!failed.has(url)) {
          wanted.add(url)
          if (!this.inFlight.has(url)) {
            const distance = Math.hypot(x + 0.5 - (colF - c0), y + 0.5 - (rowF - r0))
            this.queue.push({ url, slotX: x, slotY: y, distance })
          }
        }
      }
    }
    this.queue.sort((a, b) => a.distance - b.distance)
    // stop fetching tiles this patch no longer covers
    this.inFlight.forEach((controller, url) => {
      if (!wanted.has(url)) {
        controller.abort()
        this.inFlight.delete(url)
      }
    })
    if (source.mercator) {
      // in (longitude 0..1, 1 - Mercator y): the shader converts latitude
      this.rect.set(c0 / count - Math.floor(c0 / count), 1 - (r0 + n) / count, n / count, n / count)
    } else {
      this.rect.set(
        (c0 * deg) / 360 - Math.floor((c0 * deg) / 360),
        1 - ((r0 + n) * deg) / 180,
        (n * deg) / 360,
        (n * deg) / 180,
      )
    }
    this.dirty = true
  }

  private draw(bitmap: ImageBitmap, x: number, y: number) {
    const size = CANVAS / (this.layout?.n ?? 1)
    this.context.drawImage(bitmap, x * size, y * size, size, size)
  }

  private fetchMore() {
    while (this.inFlight.size < MAX_IN_FLIGHT && this.queue.length) {
      const job = this.queue.shift()!
      const layout = this.layout
      const controller = new AbortController()
      this.inFlight.set(job.url, controller)
      fetch(job.url, { mode: 'cors', signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status))
          return response.blob()
        })
        .then((blob) => createImageBitmap(blob))
        .then((bitmap) => {
          this.inFlight.delete(job.url)
          remember(job.url, bitmap)
          // still the same patch? draw it in its slot
          if (this.layout === layout) {
            this.draw(bitmap, job.slotX, job.slotY)
            this.dirty = true
          }
        })
        .catch((error: unknown) => {
          this.inFlight.delete(job.url)
          if ((error as Error)?.name !== 'AbortError') failed.add(job.url)
        })
    }
  }

  /* each frame: fetch, and upload what has arrived (not too often: a
     2048-pixel upload costs a few milliseconds) */
  update(delta: number) {
    this.fetchMore()
    this.sinceUpload += delta
    if (this.dirty && this.sinceUpload >= UPLOAD_GAP) {
      this.dirty = false
      this.sinceUpload = 0
      this.texture.needsUpdate = true
      // the rectangle changes with the pixels, never before them
      this.rectUniform.value.copy(this.rect)
      this.textureUniform.value = this.texture
    }
  }

  hide() {
    this.rectUniform.value.set(0, 0, 0, 0)
    this.inFlight.forEach((controller) => controller.abort())
    this.inFlight.clear()
    this.queue = []
    this.layout = null
    this.dirty = false
  }

  /* Earth's material reads its maps as sRGB; the planets' own shader
     reads them as stored */
  setColorSpace(space: THREE.ColorSpace) {
    if (this.texture.colorSpace === space) return
    this.texture.colorSpace = space
    this.dirty = true
  }

  release() {
    this.hide()
    this.texture.dispose()
  }
}

function wrapDelta(d: number, period: number) {
  return d - Math.round(d / period) * period
}

let layers: { dayFine: PatchLayer; dayCoarse: PatchLayer; nightFine: PatchLayer; nightCoarse: PatchLayer } | null = null
function getLayers() {
  if (!layers) {
    const u = surfacePatch
    layers = {
      dayFine: new PatchLayer(u.uPatchFine, u.uPatchFineRect),
      dayCoarse: new PatchLayer(u.uPatchCoarse, u.uPatchCoarseRect),
      nightFine: new PatchLayer(u.uNightFine, u.uNightFineRect),
      nightCoarse: new PatchLayer(u.uNightCoarse, u.uNightCoarseRect),
    }
  }
  return layers
}

let streamingAllowed: boolean | null = null
function allowed(gl: THREE.WebGLRenderer) {
  if (streamingAllowed !== null) return streamingAllowed
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  streamingAllowed =
    window.matchMedia('(min-width: 768px)').matches &&
    gl.capabilities.maxTextureSize >= CANVAS &&
    typeof createImageBitmap === 'function' &&
    (memory === undefined || memory >= 4)
  return streamingAllowed
}

/* the coarsest level whose pixels are no larger than `km` */
function levelFor(source: Source, radiusKm: number, km: number) {
  const around = 2 * Math.PI * radiusKm
  for (let z = 0; z <= source.maxLevel; z += 1) {
    if ((around * source.degrees(z)) / 360 / source.tile <= km) return z
  }
  return source.maxLevel
}

function kmPerPixel(source: Source, radiusKm: number, z: number) {
  return (2 * Math.PI * radiusKm * source.degrees(z)) / 360 / source.tile
}

const _center = new THREE.Vector3()
const _camera = new THREE.Vector3()
const _view = new THREE.Vector3()
const _tangent = new THREE.Vector3()
const _point = new THREE.Vector3()
const _local = new THREE.Vector3()
const _toSun = new THREE.Vector3()
const _up = new THREE.Vector3()

let owner = -1

/* Called by each planet that has imagery to stream: while you are flying
   low over it, keeps the patches on the ground you are looking at. */
export function useSurfacePatches(index: number, body: RefObject<THREE.Mesh | null>, sunPosition: THREE.Vector3) {
  const gl = useThree((state) => state.gl)
  useFrame((state, delta) => {
    const source = SOURCES[index]
    const mesh = body.current
    if (!source || !mesh) return
    const engaged = pilot.active && pilot.nearestIndex === index && allowed(gl)
    if (!engaged) {
      if (owner === index) {
        owner = -1
        surfacePatch.uPatchPlanet.value = -1
        const all = getLayers()
        all.dayFine.release()
        all.dayCoarse.release()
        all.nightFine.release()
        all.nightCoarse.release()
      }
      return
    }

    const camera = state.camera as THREE.PerspectiveCamera
    mesh.getWorldPosition(_center)
    const e = mesh.matrixWorld.elements
    const radius = Math.hypot(e[0], e[1], e[2])
    _camera.copy(camera.position)
    const distance = _camera.distanceTo(_center)
    const altitude = Math.max(distance - radius, radius * 1e-4)

    // where to centre: where the view meets the ground, if that is close,
    // else a little ahead of the point below
    camera.getWorldDirection(_view)
    const up = _up.copy(_camera).sub(_center).divideScalar(distance)
    _tangent.copy(_view).addScaledVector(up, -_view.dot(up))
    if (_tangent.lengthSq() < 1e-8) _tangent.set(1, 0, 0).cross(up)
    _tangent.normalize()
    let ahead = (2 * altitude) / radius // radians from the point below
    const b = _point.copy(_camera).sub(_center).dot(_view)
    const c = distance * distance - radius * radius
    const disc = b * b - c
    if (disc > 0) {
      const t = -b - Math.sqrt(disc)
      if (t > 0) {
        _point.copy(_camera).addScaledVector(_view, t).sub(_center).normalize()
        ahead = Math.min(ahead, Math.acos(THREE.MathUtils.clamp(_point.dot(up), -1, 1)))
      }
    }
    _point.copy(up).multiplyScalar(Math.cos(ahead)).addScaledVector(_tangent, Math.sin(ahead))
    // how big a screen pixel is on the ground there
    const groundDistance = _local.copy(_point).multiplyScalar(radius).add(_center).distanceTo(_camera)
    const pixel =
      (groundDistance * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / state.size.height
    const pixelKm = (pixel / radius) * source.radiusKm
    // is it day there?
    _toSun.copy(sunPosition).sub(_center).normalize()
    const sunUp = _point.dot(_toSun)

    // lon/lat in the map's frame (three.js sphere UVs)
    _local.copy(_point).multiplyScalar(radius).add(_center)
    mesh.worldToLocal(_local).normalize()
    const u = (Math.atan2(_local.z, -_local.x) / (2 * Math.PI) + 1) % 1
    const lon = u * 360 - 180
    const lat = 90 - (Math.acos(THREE.MathUtils.clamp(_local.y, -1, 1)) * 180) / Math.PI

    const all = getLayers()
    owner = index
    surfacePatch.uPatchPlanet.value = index
    surfacePatch.uPatchGain.value.fromArray(source.gain)
    const mapKm = (2 * Math.PI * source.radiusKm) / source.mapWidth

    const space = index === 2 ? THREE.SRGBColorSpace : THREE.NoColorSpace
    const aimPair = (src: Source, fine: PatchLayer, coarse: PatchLayer, wanted: boolean) => {
      fine.setColorSpace(space)
      coarse.setColorSpace(space)
      const zFine = levelFor(src, source.radiusKm, pixelKm)
      const zCoarse = Math.max(0, zFine - 2)
      if (wanted && kmPerPixel(src, source.radiusKm, zFine) < mapKm * 0.8) fine.aim(src, zFine, lon, lat)
      else fine.hide()
      if (wanted && kmPerPixel(src, source.radiusKm, zCoarse) < mapKm * 0.8) coarse.aim(src, zCoarse, lon, lat)
      else coarse.hide()
      fine.update(delta)
      coarse.update(delta)
    }
    aimPair(source.day, all.dayFine, all.dayCoarse, sunUp > -0.3)
    if (source.night) aimPair(source.night, all.nightFine, all.nightCoarse, sunUp < 0.3)
    else {
      all.nightFine.hide()
      all.nightCoarse.hide()
    }
  })
}
