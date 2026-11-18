import * as THREE from 'three'

/* ============================================================
   EARTH'S MOUNTAINS, SEEN FROM ORBIT
   Elevation for the whole globe (AWS Terrain Tiles, Terrarium encoding,
   zoom 3: 64 tiles), reprojected from Web Mercator to a 2048 x 1024
   latitude/longitude map lined up with the day map (about 20 km a
   pixel), heights 0 to 9 km in one channel. Earth's surface shader marches
   it towards the Sun near the day/night line, where the light is low:
   the Himalayas, the Andes and the Rockies cast their long shadows, as
   in photographs from the Space Station at sunrise. Fetched only near
   Earth.

   The map is built in a worker: done on the main thread it held one
   frame for about 100 ms, a second after the journey had left Earth (when
   the last tile came in). The main thread gets back 2 MB of heights, one
   byte a pixel, and uploads them in about a millisecond.
============================================================ */

/** heights are stored 0..1 over 0..RELIEF_TOP_M metres */
export const RELIEF_TOP_M = 9000

export const earthRelief = {
  texture: null as THREE.Texture | null,
  started: false,
  ready: new Set<() => void>(),
}

type Relief = { heights: Uint8Array; width: number; height: number }

/* Fetches the tiles and reprojects them. Self-contained (it uses nothing
   from outside its own body), because its source text is what the worker
   runs. Rows run south to north: row 0 is the bottom of the texture, as
   WebGL reads it. */
async function buildRelief(): Promise<Relief> {
  const ZOOM = 3
  const TILES = 2 ** ZOOM
  const MERCATOR = 256 * TILES
  const WIDTH = 2048
  const HEIGHT = 1024
  const TOP_M = 9000
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(MERCATOR, MERCATOR)
      : Object.assign(document.createElement('canvas'), { width: MERCATOR, height: MERCATOR })
  const mc = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  const jobs: Promise<void>[] = []
  for (let y = 0; y < TILES; y += 1) {
    for (let x = 0; x < TILES; x += 1) {
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${x}/${y}.png`
      jobs.push(
        fetch(url)
          .then((response) => (response.ok ? response.blob().then((blob) => createImageBitmap(blob)) : null))
          .then((bitmap) => {
            if (!bitmap) return
            mc.drawImage(bitmap, x * 256, y * 256)
            bitmap.close()
          })
          .catch(() => {}),
      )
    }
  }
  await Promise.all(jobs)
  const source = mc.getImageData(0, 0, MERCATOR, MERCATOR).data
  const heights = new Uint8Array(WIDTH * HEIGHT)
  for (let row = 0; row < HEIGHT; row += 1) {
    // this row's latitude (south first), and where it falls in Web Mercator
    const lat = -90 + ((row + 0.5) / HEIGHT) * 180
    const phi = (Math.min(85.05, Math.max(-85.05, lat)) * Math.PI) / 180
    const my = Math.floor(((1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2) * MERCATOR)
    const sy = Math.min(MERCATOR - 1, Math.max(0, my))
    for (let col = 0; col < WIDTH; col += 1) {
      const sx = Math.floor(((col + 0.5) / WIDTH) * MERCATOR)
      const i = (sy * MERCATOR + sx) * 4
      // Terrarium: metres = R * 256 + G + B / 256 - 32768
      const metres = source[i] * 256 + source[i + 1] + source[i + 2] / 256 - 32768
      heights[row * WIDTH + col] = Math.round(Math.min(1, Math.max(0, metres / TOP_M)) * 255)
    }
  }
  return { heights, width: WIDTH, height: HEIGHT }
}

/* The worker is made from buildRelief's own source, not from a separate
   file: the bundler copies a worker file as it is (TypeScript, served as a
   video type), which no browser runs. */
function buildInWorker() {
  return new Promise<Relief>((resolve, reject) => {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      reject(new Error('no worker canvas'))
      return
    }
    const code = `(${buildRelief.toString()})().then(
      (relief) => postMessage(relief, [relief.heights.buffer]),
      () => postMessage(null),
    )`
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    const worker = new Worker(url)
    const finish = () => {
      worker.terminate()
      URL.revokeObjectURL(url)
    }
    worker.onmessage = (event: MessageEvent<Relief | null>) => {
      finish()
      if (event.data) resolve(event.data)
      else reject(new Error('worker failed'))
    }
    worker.onerror = () => {
      finish()
      reject(new Error('worker failed'))
    }
  })
}

export function loadEarthRelief() {
  if (earthRelief.started || typeof window === 'undefined') return
  earthRelief.started = true
  buildInWorker()
    .catch(() => buildRelief()) // a browser whose workers cannot draw
    .then(({ heights, width, height }) => {
      const texture = new THREE.DataTexture(heights, width, height, THREE.RedFormat, THREE.UnsignedByteType)
      texture.wrapS = THREE.RepeatWrapping
      texture.magFilter = THREE.LinearFilter
      texture.minFilter = THREE.LinearMipmapLinearFilter
      texture.generateMipmaps = true
      texture.needsUpdate = true
      earthRelief.texture = texture
      earthRelief.ready.forEach((listener) => listener())
    })
    .catch(() => {})
}
