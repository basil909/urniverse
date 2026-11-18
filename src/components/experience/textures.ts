import * as THREE from 'three'

/* ============================================================
   TEXTURES, WITHOUT THE STALLS
   three's TextureLoader hands the GPU an <img>: the browser decodes it on
   the main thread the moment it is first drawn (a 2K map: 10-40 ms, the
   4K sky: 70 ms; some 25 maps at the start, half a second frozen), and
   the same file asked for twice is decoded twice. Here instead:
   - each file is fetched and decoded once, off the main thread
     (createImageBitmap), and shared by everything that asks for it;
   - it is decoded already turned the way the GPU wants it (bottom row
     first), so the texture needs no flipping (flipY false);
   - the finished maps are handed over a few a frame (by size), so no
     single frame uploads more than about one large map.
   The loading screen still counts them (the default loading manager).
   A drop-in for TextureLoader: load(url, onLoad, onProgress, onError)
   returns the texture at once and fills it when ready.
============================================================ */

const bitmaps = new Map<string, Promise<ImageBitmap>>()
/* a decoded file is kept a little while for anyone else asking, then let
   go (the textures hold their own reference) */
const KEEP_MS = 30000

function decode(url: string) {
  let pending = bitmaps.get(url)
  if (!pending) {
    pending = fetch(url, { mode: 'cors', credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${url}`)
        return response.blob()
      })
      .then((blob) =>
        createImageBitmap(blob, {
          imageOrientation: 'flipY',
          premultiplyAlpha: 'none',
          colorSpaceConversion: 'none',
        }),
      )
    bitmaps.set(url, pending)
    pending.then(
      () => window.setTimeout(() => bitmaps.delete(url), KEEP_MS),
      () => bitmaps.delete(url),
    )
  }
  return pending
}

/* finished maps waiting to be handed over, and how many pixels a frame may
   take (one 2048 x 2048; a larger map still goes, alone) */
const handOver: { pixels: number; run: () => void }[] = []
const PIXELS_PER_FRAME = 2048 * 2048

/** each frame (UniverseCanvas): hand over what fits */
export function drainTextures() {
  let pixels = 0
  while (handOver.length && (pixels === 0 || pixels + handOver[0].pixels <= PIXELS_PER_FRAME)) {
    const next = handOver.shift()!
    pixels += next.pixels
    next.run()
  }
}

const canDecode = typeof window !== 'undefined' && typeof createImageBitmap === 'function'

export class BitmapTextureLoader {
  private fallback = new THREE.TextureLoader()

  setCrossOrigin(value: string) {
    this.fallback.setCrossOrigin(value)
    return this
  }

  load(
    url: string,
    onLoad?: (texture: THREE.Texture) => void,
    _onProgress?: unknown,
    onError?: (error: unknown) => void,
  ): THREE.Texture {
    if (!canDecode) return this.fallback.load(url, onLoad, undefined, onError)
    const texture = new THREE.Texture()
    texture.flipY = false // decoded bottom row first
    const manager = THREE.DefaultLoadingManager
    manager.itemStart(url)
    decode(url).then(
      (bitmap) => {
        handOver.push({
          pixels: bitmap.width * bitmap.height,
          run: () => {
            texture.image = bitmap
            texture.needsUpdate = true
            try {
              onLoad?.(texture)
            } finally {
              manager.itemEnd(url)
            }
          },
        })
      },
      (error) => {
        onError?.(error)
        manager.itemError(url)
        manager.itemEnd(url)
      },
    )
    return texture
  }
}

/** a shared loader (it keeps no state of its own beyond the fallback) */
export const textureLoader = new BitmapTextureLoader()
