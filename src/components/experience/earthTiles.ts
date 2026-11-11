'use client'

import * as THREE from 'three'

import { mercatorY, PatchLayer, type Source } from './surfaceTiles'

/* ============================================================
   EARTH'S GROUND, FOR FLYING LOW AND LANDING
   Two more tile sources, streamed only while the ground patch is up over
   Earth:
   - elevation: "Terrain Tiles" on AWS Open Data (Terrarium encoding,
     mostly NASA SRTM, with bathymetry), so the mountains, valleys and
     coasts under the ship are the real ones;
   - imagery: Sentinel-2 cloudless 2016 by EOX (CC BY 4.0, contains
     modified Copernicus Sentinel data 2016), about 10 m a pixel.
   Both are Web Mercator tiles. Each comes as a fine patch under the ship
   and a coarse one, eight times wider, out to the horizon. Elevation is
   decoded to metres twice over: into a texture for the GPU (the drawn
   ground) and into an array here (where the ship touches down).
============================================================ */

const sentinel: Source = {
  url: (z, row, col) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${z}/${row}/${col}.jpg`,
  tile: 256,
  maxLevel: 14,
  degrees: (z) => 360 / 2 ** z,
  mercator: true,
}

const terrariumUrl = (z: number, row: number, col: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${col}/${row}.png`

const TILE = 256
const SPAN = 4 // tiles a side
const SIZE = TILE * SPAN
const MAX_IN_FLIGHT = 6
const UPLOAD_GAP = 0.3

export const earthGround = {
  uImgFine: { value: null as THREE.Texture | null },
  uImgFineRect: { value: new THREE.Vector4() },
  uImgCoarse: { value: null as THREE.Texture | null },
  uImgCoarseRect: { value: new THREE.Vector4() },
  uElevFine: { value: null as THREE.Texture | null },
  uElevFineRect: { value: new THREE.Vector4() },
  uElevCoarse: { value: null as THREE.Texture | null },
  uElevCoarseRect: { value: new THREE.Vector4() },
}

/* ---- decoded elevation tiles, kept for a while */
const cache = new Map<string, Float32Array>()
const failed = new Set<string>()
let decodeCanvas: HTMLCanvasElement | null = null

async function decodeTile(url: string, signal: AbortSignal) {
  const response = await fetch(url, { mode: 'cors', signal })
  if (!response.ok) throw new Error(String(response.status))
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  })
  decodeCanvas ??= Object.assign(document.createElement('canvas'), { width: TILE, height: TILE })
  const context = decodeCanvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const data = context.getImageData(0, 0, TILE, TILE).data
  const heights = new Float32Array(TILE * TILE)
  // Terrarium: metres = R * 256 + G + B / 256 - 32768
  for (let i = 0; i < TILE * TILE; i += 1) {
    heights[i] = data[i * 4] * 256 + data[i * 4 + 1] + data[i * 4 + 2] / 256 - 32768
  }
  return heights
}

class ElevationLayer {
  /** metres, row 0 at the bottom (south), as the texture */
  readonly heights = new Float32Array(SIZE * SIZE)
  readonly known = new Uint8Array(SIZE * SIZE)
  private half = new Uint16Array(SIZE * SIZE * 2)
  readonly texture = new THREE.DataTexture(this.half, SIZE, SIZE, THREE.RGFormat, THREE.HalfFloatType)
  /** the rectangle the CPU arrays describe (u, v, width, height) */
  readonly rect = new THREE.Vector4()
  private layout: { z: number; c0: number; r0: number; count: number } | null = null
  private dirty = false
  private sinceUpload = 0
  private inFlight = new Map<string, AbortController>()
  private queue: { url: string; x: number; y: number; distance: number }[] = []

  constructor(
    private textureUniform: { value: THREE.Texture | null },
    private rectUniform: { value: THREE.Vector4 },
  ) {
    this.texture.magFilter = THREE.LinearFilter
    this.texture.minFilter = THREE.LinearFilter
    this.texture.wrapS = THREE.ClampToEdgeWrapping
    this.texture.wrapT = THREE.ClampToEdgeWrapping
    this.texture.colorSpace = THREE.NoColorSpace
  }

  aim(z: number, lon: number, lat: number) {
    const count = 2 ** z
    const colF = ((lon + 180) / 360) * count
    const rowF = mercatorY(lat) * count
    const current = this.layout
    if (
      current &&
      current.z === z &&
      Math.abs(colF - (current.c0 + SPAN / 2)) <= 0.75 &&
      Math.abs(rowF - (current.r0 + SPAN / 2)) <= 0.75
    ) {
      return
    }
    const c0 = Math.round(colF - SPAN / 2)
    const r0 = THREE.MathUtils.clamp(Math.round(rowF - SPAN / 2), 0, Math.max(0, count - SPAN))
    this.layout = { z, c0, r0, count }
    this.known.fill(0)
    this.half.fill(0)
    const wanted = new Set<string>()
    this.queue = []
    for (let y = 0; y < SPAN; y += 1) {
      for (let x = 0; x < SPAN; x += 1) {
        const col = (((c0 + x) % count) + count) % count
        const url = terrariumUrl(z, r0 + y, col)
        const heights = cache.get(url)
        if (heights) this.place(heights, x, y)
        else if (!failed.has(url)) {
          wanted.add(url)
          if (!this.inFlight.has(url)) {
            this.queue.push({ url, x, y, distance: Math.hypot(x + 0.5 - (colF - c0), y + 0.5 - (rowF - r0)) })
          }
        }
      }
    }
    this.queue.sort((a, b) => a.distance - b.distance)
    this.inFlight.forEach((controller, url) => {
      if (!wanted.has(url)) {
        controller.abort()
        this.inFlight.delete(url)
      }
    })
    this.rect.set(c0 / count - Math.floor(c0 / count), 1 - (r0 + SPAN) / count, SPAN / count, SPAN / count)
    this.dirty = true
  }

  /* a tile into its slot: x across, y down from the north */
  private place(heights: Float32Array, slotX: number, slotY: number) {
    for (let py = 0; py < TILE; py += 1) {
      const row = SIZE - 1 - (slotY * TILE + py)
      for (let px = 0; px < TILE; px += 1) {
        const i = row * SIZE + slotX * TILE + px
        const h = heights[py * TILE + px]
        this.heights[i] = h
        this.known[i] = 1
        this.half[i * 2] = THREE.DataUtils.toHalfFloat(h)
        this.half[i * 2 + 1] = 0x3c00 // 1.0
      }
    }
    this.dirty = true
  }

  update(delta: number) {
    while (this.inFlight.size < MAX_IN_FLIGHT && this.queue.length) {
      const job = this.queue.shift()!
      const layout = this.layout
      const controller = new AbortController()
      this.inFlight.set(job.url, controller)
      decodeTile(job.url, controller.signal)
        .then((heights) => {
          this.inFlight.delete(job.url)
          cache.set(job.url, heights)
          while (cache.size > 96) cache.delete(cache.keys().next().value as string)
          if (this.layout === layout) this.place(heights, job.x, job.y)
        })
        .catch((error: unknown) => {
          this.inFlight.delete(job.url)
          if ((error as Error)?.name !== 'AbortError') failed.add(job.url)
        })
    }
    this.sinceUpload += delta
    if (this.dirty && this.sinceUpload >= UPLOAD_GAP) {
      this.dirty = false
      this.sinceUpload = 0
      this.texture.needsUpdate = true
      this.rectUniform.value.copy(this.rect)
      this.textureUniform.value = this.texture
    }
  }

  /* bilinear: metres and how much of it is known (0..1) at (u, Mercator v) */
  sample(u: number, vm: number) {
    if (this.rect.z <= 0) return null
    const lx = ((((u - this.rect.x) % 1) + 1) % 1) / this.rect.z
    const ly = (vm - this.rect.y) / this.rect.w
    if (lx < 0 || lx > 1 || ly < 0 || ly > 1) return null
    const x = lx * SIZE - 0.5
    const y = ly * SIZE - 0.5
    const x0 = THREE.MathUtils.clamp(Math.floor(x), 0, SIZE - 1)
    const y0 = THREE.MathUtils.clamp(Math.floor(y), 0, SIZE - 1)
    const x1 = Math.min(x0 + 1, SIZE - 1)
    const y1 = Math.min(y0 + 1, SIZE - 1)
    const tx = THREE.MathUtils.clamp(x - x0, 0, 1)
    const ty = THREE.MathUtils.clamp(y - y0, 0, 1)
    let height = 0
    let weight = 0
    const add = (xx: number, yy: number, w: number) => {
      const i = yy * SIZE + xx
      if (this.known[i]) {
        height += this.heights[i] * w
        weight += w
      }
    }
    add(x0, y0, (1 - tx) * (1 - ty))
    add(x1, y0, tx * (1 - ty))
    add(x0, y1, (1 - tx) * ty)
    add(x1, y1, tx * ty)
    return { height: weight > 0 ? height / weight : 0, known: weight }
  }

  hide() {
    this.rectUniform.value.set(0, 0, 0, 0)
    this.rect.set(0, 0, 0, 0)
    this.inFlight.forEach((controller) => controller.abort())
    this.inFlight.clear()
    this.queue = []
    this.layout = null
  }
}

let layers: {
  imgFine: PatchLayer
  imgCoarse: PatchLayer
  elevFine: ElevationLayer
  elevCoarse: ElevationLayer
} | null = null

function getLayers() {
  if (!layers) {
    const u = earthGround
    layers = {
      imgFine: new PatchLayer(u.uImgFine, u.uImgFineRect),
      imgCoarse: new PatchLayer(u.uImgCoarse, u.uImgCoarseRect),
      elevFine: new ElevationLayer(u.uElevFine, u.uElevFineRect),
      elevCoarse: new ElevationLayer(u.uElevCoarse, u.uElevCoarseRect),
    }
    layers.imgFine.setColorSpace(THREE.SRGBColorSpace)
    layers.imgCoarse.setColorSpace(THREE.SRGBColorSpace)
  }
  return layers
}

const EARTH_EQUATOR_M = 40075016.686

/* the web-map zoom whose pixels are about `metres` across here */
function zoomFor(metres: number, lat: number, max: number) {
  const z = Math.round(Math.log2((EARTH_EQUATOR_M * Math.cos(THREE.MathUtils.degToRad(lat))) / (TILE * metres)))
  return THREE.MathUtils.clamp(z, 2, max)
}

/* keep the patches under the ship (lon, lat in degrees, altitude in km) */
export function aimEarthGround(lon: number, lat: number, altitudeKm: number, delta: number) {
  const all = getLayers()
  const metres = altitudeKm * 1000
  const zElev = zoomFor(Math.max(metres / 25, 20), lat, 13)
  const zImg = zoomFor(Math.max(metres / 60, 5), lat, sentinel.maxLevel)
  all.elevFine.aim(zElev, lon, lat)
  all.elevCoarse.aim(Math.max(2, zElev - 3), lon, lat)
  all.imgFine.aim(sentinel, zImg, lon, lat)
  all.imgCoarse.aim(sentinel, Math.max(2, zImg - 3), lon, lat)
  all.elevFine.update(delta)
  all.elevCoarse.update(delta)
  all.imgFine.update(delta)
  all.imgCoarse.update(delta)
}

export function releaseEarthGround() {
  if (!layers) return
  layers.elevFine.hide()
  layers.elevCoarse.hide()
  layers.imgFine.hide()
  layers.imgCoarse.hide()
}

/* elevation on the CPU, as the GPU blends it: the fine patch over the coarse */
export function earthElevation(u: number, vm: number) {
  if (!layers) return null
  const coarse = layers.elevCoarse.sample(u, vm)
  const fine = layers.elevFine.sample(u, vm)
  const known = Math.max(coarse?.known ?? 0, fine?.known ?? 0)
  if (known <= 0) return null
  const hc = coarse?.height ?? 0
  const height = fine ? hc + (fine.height - hc) * fine.known : hc
  return { height, known }
}

/* latitude (from a map's v) to Mercator v (0 south .. 1 north) */
export function mercatorV(v: number) {
  const lat = THREE.MathUtils.clamp((v - 0.5) * Math.PI, -1.4835, 1.4835)
  return 0.5 + Math.asinh(Math.tan(lat)) / (2 * Math.PI)
}
