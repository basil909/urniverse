import * as THREE from 'three'

import { patchCover } from './cloudPatch'
import { MAP_HEIGHT, MAP_WIDTH } from './skyPixels'
import { runSkyJob } from './skyJobs'

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
   in. Fetched only when the camera comes near Earth, and worked out in
   a worker (skyPixels.ts), so the flight never stalls. The result feeds
   the cloud layer, the clouds' shadows, the 3D clouds flying low, the
   mist you fly through, and the snow on the ground.
============================================================ */

/** RGBA, rows from the south */
type Sampler = { width: number; height: number; data: Uint8Array }

export const earthToday = {
  /** the map, once ready */
  texture: null as THREE.Texture | null,
  /** yesterday's snow on the ground (0..1 cover, in each channel), once ready */
  snow: null as THREE.Texture | null,
  /** the day it shows (YYYY-MM-DD, UTC), once ready */
  date: '',
  sampler: null as Sampler | null,
  started: false,
  /** listeners told when it is ready */
  ready: new Set<() => void>(),
  /** cloud cover 0..1 at a map position (u, v as three.js sphere UVs), or null */
  cover(u: number, v: number) {
    // the sharp patch round the view first
    const sharp = patchCover(u, v)
    if (sharp !== null) return sharp
    const map = this.sampler
    if (!map) return null
    const x = Math.min(map.width - 1, Math.max(0, Math.floor(u * map.width)))
    const y = Math.min(map.height - 1, Math.max(0, Math.floor(v * map.height)))
    return map.data[(y * map.width + x) * 4 + 1] / 255
  },
}

/** a global map texture from the worker's pixels (rows from the south) */
export function mapTexture(data: Uint8Array, width: number, height: number) {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.wrapS = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

/** start fetching (once); listeners in earthToday.ready are told when done */
export function loadEarthToday() {
  if (earthToday.started || typeof window === 'undefined') return
  earthToday.started = true
  // yesterday (UTC): the latest day the satellites have finished
  const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  runSkyJob<{ cloud: Uint8Array; snow: Uint8Array | null } | null>({ type: 'today', date })
    .then((maps) => {
      // barely any real data (the service down, or the day not there yet):
      // keep the usual map
      if (!maps) return
      earthToday.texture = mapTexture(maps.cloud, MAP_WIDTH, MAP_HEIGHT)
      if (maps.snow) earthToday.snow = mapTexture(maps.snow, MAP_WIDTH, MAP_HEIGHT)
      earthToday.date = date
      earthToday.sampler = { width: MAP_WIDTH, height: MAP_HEIGHT, data: maps.cloud }
      earthToday.ready.forEach((listener) => listener())
    })
    .catch(() => {})
}
