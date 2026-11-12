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
============================================================ */

const ZOOM = 3
const TILES = 2 ** ZOOM
const MERCATOR = 256 * TILES
const WIDTH = 2048
const HEIGHT = 1024
/** heights are stored 0..1 over 0..TOP_M metres */
export const RELIEF_TOP_M = 9000

export const earthRelief = {
  texture: null as THREE.CanvasTexture | null,
  started: false,
  ready: new Set<() => void>(),
}

async function tile(x: number, y: number): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${x}/${y}.png`)
    if (!response.ok) return null
    return await createImageBitmap(await response.blob())
  } catch {
    return null
  }
}

export function loadEarthRelief() {
  if (earthRelief.started || typeof window === 'undefined') return
  earthRelief.started = true
  const mercator = document.createElement('canvas')
  mercator.width = MERCATOR
  mercator.height = MERCATOR
  const mc = mercator.getContext('2d', { willReadFrequently: true })!
  const jobs: Promise<void>[] = []
  for (let y = 0; y < TILES; y += 1) {
    for (let x = 0; x < TILES; x += 1) {
      jobs.push(
        tile(x, y).then((bitmap) => {
          if (!bitmap) return
          mc.drawImage(bitmap, x * 256, y * 256)
          bitmap.close()
        }),
      )
    }
  }
  Promise.all(jobs)
    .then(() => {
      const source = mc.getImageData(0, 0, MERCATOR, MERCATOR).data
      const canvas = document.createElement('canvas')
      canvas.width = WIDTH
      canvas.height = HEIGHT
      const context = canvas.getContext('2d')!
      const out = context.createImageData(WIDTH, HEIGHT)
      for (let row = 0; row < HEIGHT; row += 1) {
        // this row's latitude, and where it falls in Web Mercator
        const lat = 90 - ((row + 0.5) / HEIGHT) * 180
        const phi = (THREE.MathUtils.clamp(lat, -85.05, 85.05) * Math.PI) / 180
        const my = Math.floor(((1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2) * MERCATOR)
        const sy = Math.min(MERCATOR - 1, Math.max(0, my))
        for (let col = 0; col < WIDTH; col += 1) {
          const sx = Math.floor(((col + 0.5) / WIDTH) * MERCATOR)
          const i = (sy * MERCATOR + sx) * 4
          // Terrarium: metres = R * 256 + G + B / 256 - 32768
          const metres = source[i] * 256 + source[i + 1] + source[i + 2] / 256 - 32768
          const value = Math.round(THREE.MathUtils.clamp(metres / RELIEF_TOP_M, 0, 1) * 255)
          const o = (row * WIDTH + col) * 4
          out.data[o] = value
          out.data[o + 1] = value
          out.data[o + 2] = value
          out.data[o + 3] = 255
        }
      }
      context.putImageData(out, 0, 0)
      const texture = new THREE.CanvasTexture(canvas)
      texture.wrapS = THREE.RepeatWrapping
      texture.needsUpdate = true
      earthRelief.texture = texture
      earthRelief.ready.forEach((listener) => listener())
    })
    .catch(() => {})
}
