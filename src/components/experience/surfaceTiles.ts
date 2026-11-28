'use client'

import { type RefObject, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { lowOver } from './pilotState'

/* ============================================================
   REAL SURFACE IMAGERY, STREAMED WHILE FLYING
   The surface maps are a few km per pixel. Flying low over Earth, Mars
   or Mercury, the patch of ground you are looking at is filled in with
   NASA's own imagery, fetched tile by tile as you go:
     Earth   Blue Marble Next Generation, ~500 m/pixel, and the VIIRS
             city lights (2012) on the night side (NASA GIBS)
     Mars    Viking MDIM 2.1 colour mosaic, ~300 m/pixel (NASA Trek), and
             under it the MRO Context Camera's global mosaic, down to
             about 5 m a pixel (Murray Lab, Caltech; served by Esri):
             grey, so laid over the colour as light and shade only, each
             sharp tile divided by a copy four times coarser (which
             cancels the mosaic's strip-to-strip brightness and leaves
             the craters, dunes and channels)
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

   THE WHOLE GLOBE, SHARPER
   Earth, Mars, Mercury and the Moon take the same imagery from afar too:
   whenever the camera is close enough that a screen pixel (a device
   pixel, so a sharp screen counts) is finer than the map's own, in the
   journey's zoom and close-up shots as well as in flight. Only as sharp
   as the screen can show, only the part in view, from NASA's servers (the
   site itself sends nothing more), and only on a desktop with memory to
   spare and no data saver; further out, the patches are let go and the
   planet is just its map again.
============================================================ */

export type Source = {
  url: (z: number, row: number, col: number) => string
  tile: number
  maxLevel: number
  /** degrees per tile at a level */
  degrees: (z: number) => number
  /** web-map tiles (Web Mercator, 2^z a side) rather than latitude/longitude */
  mercator?: boolean
  /** the mosaic's longitudes run half a turn from the local map's (some
      moons' maps are centred on 180 degrees): 0.5, else 0 */
  uShift?: number
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

/* Mars's Context Camera mosaic (CTX beta01): 512-pixel tiles, levels as
   Trek's (180 degrees a tile at level 0), to 5 m a pixel at level 12 */
const ctx: Source = {
  url: (z, row, col) => `https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/${z}/${row}/${col}`,
  tile: 512,
  maxLevel: 12,
  degrees: (z) => 180 / 2 ** z,
}

const trek = (body: string, layer: string, maxLevel: number, ext = 'jpg', uShift = 0): Source => ({
  url: (z, row, col) =>
    `https://trek.nasa.gov/tiles/${body}/EQ/${layer}/1.0.0/default/default028mm/${z}/${row}/${col}.${ext}`,
  tile: 256,
  maxLevel,
  degrees: (z) => 180 / 2 ** z,
  uShift,
})

/* by orbit index; radius in km, mapWidth: the sharpest local map's width,
   gain: the colour match to the local maps */
const SOURCES: Record<
  number,
  {
    day: Source
    night?: Source
    /** grey detail laid over the colour (in the night patches' place) */
    detail?: Source
    radiusKm: number
    mapWidth: number
    gain: [number, number, number]
    /** streamed whenever the camera is close enough, not only flying low */
    globe?: boolean
  }
> = {
  0: {
    day: trek('Mercury', 'Mercury_MESSENGER_MDIS_Basemap_BDR_Mosaic_Global_166m', 7),
    globe: true,
    radiusKm: 2439.7,
    mapWidth: 4096,
    gain: [1.86, 1.84, 1.85],
  },
  2: {
    day: gibs('BlueMarble_NextGeneration', 'jpeg'),
    night: gibs('VIIRS_CityLights_2012', 'jpeg'),
    globe: true,
    radiusKm: 6371,
    mapWidth: 4096,
    gain: [1, 1, 1],
  },
  // the large moons: Galileo and Voyager mosaics, Cassini's of Titan
  // (the local maps are only 1024 pixels wide); gains match their colour
  13: {
    day: trek('Io', 'Io_GalileoSSI_Voyager_Global_Mosaic_ClrMerge_1km', 4, 'png'),
    radiusKm: 1821.6,
    mapWidth: 1024,
    gain: [1, 1, 1],
  },
  14: {
    day: trek('Europa', '20150218_europa_global_map_20000x10000', 5, 'png', 0.5),
    radiusKm: 1560.8,
    mapWidth: 1024,
    gain: [1.99, 1.87, 1.83],
  },
  15: {
    day: trek('Ganymede', 'Ganymede_global_equi_000_359m', 6, 'png', 0.5),
    radiusKm: 2634.1,
    mapWidth: 1024,
    gain: [3.2, 2.65, 1.96],
  },
  17: {
    // seen through the haze at 938 nm, grey: tinted to Titan's orange
    day: trek('Titan', 'Titan_ISS_P19658_Mosaic_Global_4km', 4, 'png'),
    radiusKm: 2574.7,
    mapWidth: 1,
    gain: [2.97, 1.58, 0.4],
  },
  // the Moon (body 12): LRO's wide-angle camera mosaic, ~100 m a pixel
  12: {
    day: trek('Moon', 'LRO_WAC_Mosaic_Global_303ppd_v02', 8),
    globe: true,
    radiusKm: 1737.4,
    mapWidth: 4096,
    // the mosaic is darker than the map (gain in linear light: sRGB)
    gain: [3.6, 3.5, 3.4],
  },
  3: {
    day: trek('Mars', 'Mars_Viking_MDIM21_ClrMosaic_global_232m', 7),
    detail: ctx,
    globe: true,
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
  /** the night patches hold grey detail instead (Mars's CTX): 1 */
  uPatchDetail: { value: 0 },
}

export const SURFACE_PATCH_GLSL = /* glsl */ `
uniform int uPatchPlanet; uniform vec3 uPatchGain;
uniform sampler2D uPatchFine; uniform vec4 uPatchFineRect;
uniform sampler2D uPatchCoarse; uniform vec4 uPatchCoarseRect;
uniform sampler2D uNightFine; uniform vec4 uNightFineRect;
uniform sampler2D uNightCoarse; uniform vec4 uNightCoarseRect;
uniform float uPatchDetail;
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
/* grey detail over the colour (Mars's CTX): the sharp patch's brightness
   over the coarse one's, where both have arrived */
vec3 withDetail(vec3 color, vec2 uv) {
  if (uPatchDetail < 0.5) return color;
  vec4 f = patchTexel(uNightFine, uNightFineRect, uv);
  vec4 c = patchTexel(uNightCoarse, uNightCoarseRect, uv);
  if (f.a <= 0.001 || c.a <= 0.001) return color;
  float lf = dot(f.rgb / f.a, vec3(0.3, 0.5, 0.2));
  float lc = dot(c.rgb / c.a, vec3(0.3, 0.5, 0.2));
  float ratio = clamp(lf / max(lc, 0.03), 0.3, 2.6);
  return color * mix(1.0, ratio, min(f.a, c.a));
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

/* the renderer, for uploading a tile into its own corner of a patch's
   texture (set by the patches' frame hook) */
let tileRenderer: THREE.WebGLRenderer | null = null
export function setTileRenderer(renderer: THREE.WebGLRenderer) {
  tileRenderer = renderer
}
/* tiles uploaded into place per frame, at most */
const TILES_PER_FRAME = 3
const _tilePlace = new THREE.Vector2()

export class PatchLayer {
  private canvas = document.createElement('canvas')
  private context: CanvasRenderingContext2D
  readonly texture: THREE.CanvasTexture
  private layout: Layout | null = null
  private rect = new THREE.Vector4()
  private dirty = false
  /* the whole canvas must go up (a new patch); else only the tiles that
     arrived, each into its own corner of the texture */
  private full = true
  private arrived: { bitmap: ImageBitmap; x: number; y: number }[] = []
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
    const shift = source.uShift ?? 0
    const lonSource = ((((lon + 180 + shift * 360) % 360) + 360) % 360) - 180
    const colF = source.mercator ? ((lonSource + 180) / 360) * count : (lonSource + 180) / deg
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
    this.full = true
    this.dropArrived()
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
      const x0 = (c0 * deg) / 360 - shift
      this.rect.set(
        x0 - Math.floor(x0),
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
          // still the same patch? draw it in its slot, and send just it up
          if (this.layout === layout) {
            this.draw(bitmap, job.slotX, job.slotY)
            this.dirty = true
            this.sendUp(bitmap, job.slotX, job.slotY, layout)
          }
        })
        .catch((error: unknown) => {
          this.inFlight.delete(job.url)
          if ((error as Error)?.name !== 'AbortError') failed.add(job.url)
        })
    }
  }

  /* a tile, turned the way the texture's rows run (bottom up), queued to
     go up into its own corner */
  private sendUp(bitmap: ImageBitmap, x: number, y: number, layout: Layout | null) {
    if (!tileRenderer || this.full || bitmap.width !== CANVAS / (layout?.n ?? 1)) return
    createImageBitmap(bitmap, { imageOrientation: 'flipY' })
      .then((flipped) => {
        if (this.layout === layout && !this.full) this.arrived.push({ bitmap: flipped, x, y })
        else flipped.close()
      })
      .catch(() => {
        this.full = true
      })
  }

  /** a patch is aimed (tiles shown or on their way) */
  get shown() {
    return this.layout !== null
  }

  private dropArrived() {
    this.arrived.forEach((tile) => tile.bitmap.close())
    this.arrived = []
  }

  /* each frame: fetch, and upload what has arrived. A whole 2048-pixel
     canvas (16 MB) only for a new patch, and not too often; otherwise
     each new tile alone, into its corner, a few a frame */
  update(delta: number) {
    this.fetchMore()
    this.sinceUpload += delta
    if (this.full || !tileRenderer) {
      if (this.dirty && this.sinceUpload >= UPLOAD_GAP) {
        this.dirty = false
        this.full = false
        this.sinceUpload = 0
        this.dropArrived()
        this.texture.needsUpdate = true
        // the rectangle changes with the pixels, never before them
        this.rectUniform.value.copy(this.rect)
        this.textureUniform.value = this.texture
      }
      return
    }
    const size = CANVAS / (this.layout?.n ?? 1)
    for (let k = 0; k < TILES_PER_FRAME && this.arrived.length; k += 1) {
      const tile = this.arrived.shift()!
      const source = new THREE.Texture(tile.bitmap)
      tileRenderer.copyTextureToTexture(source, this.texture, null, _tilePlace.set(tile.x * size, CANVAS - (tile.y + 1) * size))
      tile.bitmap.close()
    }
    if (!this.arrived.length) this.dirty = false
  }

  hide() {
    this.dropArrived()
    this.full = true
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
    this.full = true
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
  const nav = navigator as Navigator & {
    deviceMemory?: number
    connection?: { saveData?: boolean; effectiveType?: string }
  }
  const memory = nav.deviceMemory
  // (a visitor saving data, or on a slow link, keeps the maps)
  const thrifty = nav.connection?.saveData === true || /(^|-)2g|3g/.test(nav.connection?.effectiveType ?? '')
  streamingAllowed =
    window.matchMedia('(min-width: 768px)').matches &&
    gl.capabilities.maxTextureSize >= CANVAS &&
    typeof createImageBitmap === 'function' &&
    (memory === undefined || memory >= 4) &&
    !thrifty
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

/* the patches go back to no planet, their textures freed */
function releaseAll() {
  owner = -1
  surfacePatch.uPatchPlanet.value = -1
  surfacePatch.uPatchDetail.value = 0
  if (!layers) return
  layers.dayFine.release()
  layers.dayCoarse.release()
  layers.nightFine.release()
  layers.nightCoarse.release()
}

/* a patch is worth showing while its pixels are finer than the map's:
   taken up below 0.8 of the map's pixel, let go only past it (so a camera
   hovering at the edge does not fetch and drop it frame after frame) */
const TAKE_UP = 0.8
const LET_GO = 1.05

/* Called by each planet that has imagery to stream: while you are flying
   low over it, or (Earth, Mars, Mercury, the Moon) close enough anywhere
   that its map is coarser than the screen, keeps the patches on the
   ground you are looking at. One planet has them at a time. */
export function useSurfacePatches(index: number, body: RefObject<THREE.Mesh | null>, sunPosition: THREE.Vector3) {
  const gl = useThree((state) => state.gl)
  useEffect(
    () => () => {
      if (owner === index) releaseAll()
    },
    [index],
  )
  useFrame((state, delta) => {
    setTileRenderer(gl)
    const source = SOURCES[index]
    const mesh = body.current
    if (!source || !mesh) return
    const engaged = (lowOver(index) >= 0 || source.globe === true) && allowed(gl)
    if (!engaged) {
      if (owner === index) releaseAll()
      return
    }
    // another world has them (it lets go once it no longer needs them)
    if (owner !== -1 && owner !== index) return

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
    // (never past the horizon: from high up, the view may miss the world
    // altogether, and then the patch goes on the near side, towards
    // where the view passes)
    const horizon = Math.acos(THREE.MathUtils.clamp(radius / distance, -1, 1))
    let ahead = Math.min((2 * altitude) / radius, horizon * 0.5) // radians from the point below
    const b = _point.copy(_camera).sub(_center).dot(_view)
    const c = distance * distance - radius * radius
    const disc = b * b - c
    if (disc > 0) {
      const t = -b - Math.sqrt(disc)
      if (t > 0) {
        _point.copy(_camera).addScaledVector(_view, t).sub(_center).normalize()
        ahead = Math.min(ahead, Math.acos(THREE.MathUtils.clamp(_point.dot(up), -1, 1)))
      }
    } else if (b < 0) {
      // the nearest the view comes to the world's centre: lean that way
      _point.copy(_camera).addScaledVector(_view, -b).sub(_center)
      _point.addScaledVector(up, -_point.dot(up))
      if (_point.lengthSq() > 1e-12) _tangent.copy(_point).normalize()
    }
    _point.copy(up).multiplyScalar(Math.cos(ahead)).addScaledVector(_tangent, Math.sin(ahead))
    // how big a screen pixel (a device pixel) is on the ground there
    const groundDistance = _local.copy(_point).multiplyScalar(radius).add(_center).distanceTo(_camera)
    const pixel =
      (groundDistance * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) /
      (state.size.height * gl.getPixelRatio())
    const pixelKm = (pixel / radius) * source.radiusKm
    const mapKm = (2 * Math.PI * source.radiusKm) / source.mapWidth
    // the map is sharp enough here: no patches (and no fetching) at all
    const firstLevel = levelFor(source.day, source.radiusKm, pixelKm)
    if (kmPerPixel(source.day, source.radiusKm, firstLevel) >= mapKm * (owner === index ? LET_GO : TAKE_UP)) {
      if (owner === index) releaseAll()
      return
    }
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
    surfacePatch.uPatchDetail.value = source.detail ? 1 : 0

    const space = index === 2 || index >= 12 ? THREE.SRGBColorSpace : THREE.NoColorSpace
    const worth = (layer: PatchLayer, src: Source, z: number) =>
      kmPerPixel(src, source.radiusKm, z) < mapKm * (layer.shown ? LET_GO : TAKE_UP)
    const aimPair = (src: Source, fine: PatchLayer, coarse: PatchLayer, wanted: boolean) => {
      fine.setColorSpace(space)
      coarse.setColorSpace(space)
      const zFine = levelFor(src, source.radiusKm, pixelKm)
      const zCoarse = Math.max(0, zFine - 2)
      if (wanted && worth(fine, src, zFine)) fine.aim(src, zFine, lon, lat)
      else fine.hide()
      if (wanted && worth(coarse, src, zCoarse)) coarse.aim(src, zCoarse, lon, lat)
      else coarse.hide()
      fine.update(delta)
      coarse.update(delta)
    }
    aimPair(source.day, all.dayFine, all.dayCoarse, sunUp > -0.3)
    if (source.night) aimPair(source.night, all.nightFine, all.nightCoarse, sunUp < 0.3)
    else if (source.detail) aimPair(source.detail, all.nightFine, all.nightCoarse, sunUp > -0.3)
    else {
      all.nightFine.hide()
      all.nightCoarse.hide()
    }
  })
}
