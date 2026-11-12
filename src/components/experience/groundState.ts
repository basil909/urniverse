import * as THREE from 'three'

/* ============================================================
   GROUND, FOR LANDING
   Close to Mercury, Earth or Mars the planet's sphere gives way, under
   the ship, to real ground: a patch of terrain that follows the ship,
   finest right below it and coarser towards the horizon (rings of
   vertices, each a little wider than the last).
   Its height is the same function on the GPU (to draw it) and here on
   the CPU (so the ship touches down exactly on what is drawn):
   - the large shapes are real: Mars's and Mercury's elevation maps
     (MOLA, MESSENGER), Earth's coastlines (sea is flat, at sea level);
   - below their few-km resolution, fractal relief down to a few metres
     (generated, not data).
   The sphere is cut away under the patch, so the two never fight.
============================================================ */

export type GroundConfig = {
  /** relief map, or none (Earth) */
  heightMap?: string
  /** cloud map (Earth), for flying through the deck */
  cloudMap?: string
  /** land/sea map (Earth's specular map: sea is bright) */
  seaMap?: string
  radiusKm: number
  /** km between the lowest and highest point of the relief map */
  reliefKm: number
  /** km of generated relief at its largest scale */
  roughKm: number
  /** 0 rolling, 1 sharp ridges */
  ridged: number
}

export const GROUND: Record<number, GroundConfig> = {
  0: { heightMap: '/textures/relief/mercury-height.webp', radiusKm: 2439.7, reliefKm: 9, roughKm: 1.4, ridged: 0.4 },
  2: { seaMap: '/textures/earth-specular.webp', cloudMap: '/textures/earth-clouds.webp', radiusKm: 6371, reliefKm: 0, roughKm: 1.6, ridged: 0.7 },
  // the large moons (bodies 13-19): no elevation maps, generated relief
  13: { radiusKm: 1821.6, reliefKm: 0, roughKm: 1.2, ridged: 0.25 }, // Io
  14: { radiusKm: 1560.8, reliefKm: 0, roughKm: 0.35, ridged: 0.95 }, // Europa: smooth ice, ridges
  15: { radiusKm: 2634.1, reliefKm: 0, roughKm: 0.9, ridged: 0.5 }, // Ganymede
  16: { radiusKm: 2410.3, reliefKm: 0, roughKm: 1.1, ridged: 0.3 }, // Callisto
  17: { radiusKm: 2574.7, reliefKm: 0, roughKm: 0.5, ridged: 0.2 }, // Titan
  18: { radiusKm: 11.27, reliefKm: 0, roughKm: 0.9, ridged: 0.3 }, // Phobos
  19: { radiusKm: 6.2, reliefKm: 0, roughKm: 0.45, ridged: 0.3 }, // Deimos
  // the Moon (body 12): LRO's elevation
  12: { heightMap: '/textures/moon-height.webp', radiusKm: 1737.4, reliefKm: 18, roughKm: 1.1, ridged: 0.3 },
  3: { heightMap: '/textures/relief/mars-height.webp', radiusKm: 3389.5, reliefKm: 26, roughKm: 1.8, ridged: 0.55 },
}

/** the largest generated feature, km; octaves halve down to ~4 m */
const DETAIL_KM = 60
export const OCTAVES = 14
const GAIN = 0.47

/* ---- the same noise in JS and GLSL: integer hash, value noise */
function hash3(x: number, y: number, z: number) {
  let h = (Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f)) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0
  h = (h ^ (h >>> 15)) >>> 0
  return h / 4294967296
}

function valueNoise(x: number, y: number, z: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  const fx = x - ix
  const fy = y - iy
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const uz = fz * fz * (3 - 2 * fz)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  return lerp(
    lerp(lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), ux), lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), ux), uy),
    lerp(
      lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), ux),
      lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), ux),
      uy,
    ),
    uz,
  )
}

export const GROUND_GLSL = /* glsl */ `
float gHash(ivec3 c) {
  uvec3 u = uvec3(c);
  uint h = (u.x * 0x8da6b343u) ^ (u.y * 0xd8163841u) ^ (u.z * 0xcb1ab31fu);
  h = (h ^ (h >> 13u)) * 0x5bd1e995u;
  h ^= h >> 15u;
  return float(h) * (1.0 / 4294967296.0);
}
float gNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = p - i; vec3 u = f * f * (3.0 - 2.0 * f);
  ivec3 c = ivec3(i);
  return mix(
    mix(mix(gHash(c), gHash(c + ivec3(1,0,0)), u.x), mix(gHash(c + ivec3(0,1,0)), gHash(c + ivec3(1,1,0)), u.x), u.y),
    mix(mix(gHash(c + ivec3(0,0,1)), gHash(c + ivec3(1,0,1)), u.x), mix(gHash(c + ivec3(0,1,1)), gHash(c + ivec3(1,1,1)), u.x), u.y),
    u.z);
}
/* sphere UVs, as three.js lays a map on a sphere */
vec2 gUv(vec3 d) {
  return vec2(fract(atan(d.z, -d.x) / 6.28318530718 + 1.0), 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359);
}
uniform sampler2D uReliefMap; uniform float uHasRelief; uniform float uRelief;
uniform sampler2D uSeaMap; uniform float uHasSea;
uniform float uRough; uniform float uRidged; uniform float uDetailFreq;
uniform float uGroundFade;
/* Earth's real elevation (metres), streamed: fine and coarse patches in
   Web Mercator; .r is height times coverage, .g the coverage */
uniform sampler2D uElevFine; uniform vec4 uElevFineRect;
uniform sampler2D uElevCoarse; uniform vec4 uElevCoarseRect;
uniform float uEarthElev; uniform float uRadiusM;
float gMercV(vec2 uv) {
  float lat = clamp((uv.y - 0.5) * 3.14159265359, -1.4835, 1.4835);
  return 0.5 + asinh(tan(lat)) / 6.28318530718;
}
vec2 gElevAt(sampler2D map, vec4 rect, vec2 mu) {
  if (rect.z <= 0.0) return vec2(0.0);
  vec2 local = vec2(fract(mu.x - rect.x) / rect.z, (mu.y - rect.y) / rect.w);
  if (local.x < 0.0 || local.x > 1.0 || local.y < 0.0 || local.y > 1.0) return vec2(0.0);
  return texture2D(map, local).rg;
}
/* metres, and how much of it is known */
float gElevation(vec2 uv, out float known) {
  vec2 mu = vec2(uv.x, gMercV(uv));
  vec2 c = gElevAt(uElevCoarse, uElevCoarseRect, mu);
  vec2 f = gElevAt(uElevFine, uElevFineRect, mu);
  known = max(c.y, f.y);
  float hc = c.y > 0.0 ? c.x / c.y : 0.0;
  float hf = f.y > 0.0 ? f.x / f.y : 0.0;
  return mix(hc, hf, clamp(f.y, 0.0, 1.0));
}
/* metres above the sea (never below it), averaged over the ground one
   vertex stands for (\`spacing\`, radii): a mesh vertex hundreds of metres
   from its neighbours that read the ~30 m elevation at one point would
   land on single pixels (spikes), and as the mesh slides with the ship,
   on different ones each frame (hills that seethe) */
float gElevationOver(vec2 uv, float spacing, out float known) {
  float k0;
  float e0 = max(gElevation(uv, k0), 0.0);
  if (spacing < 1.2e-5) {
    known = k0;
    return e0;
  }
  float cosLat = max(cos((uv.y - 0.5) * 3.14159265), 0.05);
  vec2 off = vec2(spacing / (6.28318531 * cosLat), spacing / 3.14159265) * 0.5;
  float k1;
  float k2;
  float k3;
  float k4;
  float sum = e0 * 2.0
    + max(gElevation(uv + vec2(off.x, 0.0), k1), 0.0)
    + max(gElevation(uv - vec2(off.x, 0.0), k2), 0.0)
    + max(gElevation(uv + vec2(0.0, off.y), k3), 0.0)
    + max(gElevation(uv - vec2(0.0, off.y), k4), 0.0);
  known = min(k0, min(min(k1, k2), min(k3, k4)));
  return sum / 6.0;
}
/* land (1) or sea (0) */
float gLand(vec2 uv) {
  return uHasSea > 0.5 ? smoothstep(0.42, 0.22, texture2D(uSeaMap, uv).r) : 1.0;
}
/* height in planet radii; octaves finer than \`spacing\` (radii) fade out */
float gHeight(vec3 d, float spacing) {
  vec2 uv = gUv(d);
  float h = uHasRelief > 0.5 ? (texture2D(uReliefMap, uv).r - 0.5) * uRelief : 0.0;
  float land = gLand(uv);
  float detail = 0.0;
  float amp = uRough;
  float f = uDetailFreq;
  for (int k = 0; k < ${OCTAVES}; k++) {
    float wavelength = 1.0 / f;
    float shown = smoothstep(spacing * 2.0, spacing * 4.0, wavelength);
    if (shown <= 0.0) break;
    float n = gNoise(d * f + float(k) * 17.0);
    float ridge = 1.0 - abs(2.0 * n - 1.0);
    detail += (mix(n, ridge * ridge, uRidged) - 0.5) * 2.0 * amp * shown;
    amp *= ${GAIN};
    f *= 2.0;
  }
  // Earth: land rises gently from the shore; the sea is flat
  h += uHasSea > 0.5 ? land * (abs(detail) + uRough * 0.25) : detail;
  // where Earth's real elevation has arrived, it takes over (with a
  // little generated roughness below its ~30 m pixels)
  if (uEarthElev > 0.5) {
    float known;
    float elevation = gElevationOver(uv, spacing, known);
    float real = elevation / uRadiusM + (elevation > 0.0 ? detail * 0.02 : 0.0);
    h = mix(h, real, known);
  }
  return h * uGroundFade;
}
/* land (1) or sea (0), with the real coastline once it has arrived */
float gLandAt(vec2 uv) {
  float land = gLand(uv);
  if (uEarthElev > 0.5) {
    float known;
    float elevation = gElevation(uv, known);
    land = mix(land, smoothstep(-1.0, 2.0, elevation), known);
  }
  return land;
}
`

type Sampler = { width: number; height: number; data: Uint8ClampedArray }

async function loadSampler(url: string): Promise<Sampler | null> {
  try {
    const blob = await (await fetch(url)).blob()
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data }
  } catch {
    return null
  }
}

/* bilinear, red channel, 0..1; v = 1 at the top (north), as on the GPU */
function sample(map: Sampler, u: number, v: number) {
  const x = (((u % 1) + 1) % 1) * map.width - 0.5
  const y = (1 - Math.min(Math.max(v, 0), 1)) * map.height - 0.5
  const x0 = Math.floor(x)
  const y0 = Math.max(0, Math.min(map.height - 1, Math.floor(y)))
  const y1 = Math.max(0, Math.min(map.height - 1, y0 + 1))
  const tx = x - x0
  const ty = Math.min(Math.max(y - y0, 0), 1)
  const at = (xx: number, yy: number) => map.data[(yy * map.width + (((xx % map.width) + map.width) % map.width)) * 4] / 255
  return (
    (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x0 + 1, y1) * tx) * ty
  )
}

export function sphereUv(d: THREE.Vector3) {
  const u = (Math.atan2(d.z, -d.x) / (2 * Math.PI) + 1) % 1
  const v = 1 - Math.acos(Math.min(Math.max(d.y, -1), 1)) / Math.PI
  return [u, v] as const
}

/* the ground of one planet, on the CPU */
export class GroundModel {
  /** Earth only: real elevation (metres) at (u, Mercator v), if streamed */
  elevation: ((u: number, vm: number) => { height: number; known: number } | null) | null = null
  relief: Sampler | null = null
  sea: Sampler | null = null
  clouds: Sampler | null = null
  ready = false
  readonly reliefRadii: number
  readonly roughRadii: number
  readonly detailFreq: number

  constructor(readonly config: GroundConfig) {
    this.reliefRadii = config.reliefKm / config.radiusKm
    this.roughRadii = config.roughKm / config.radiusKm
    this.detailFreq = config.radiusKm / DETAIL_KM
    Promise.all([
      config.heightMap ? loadSampler(config.heightMap) : Promise.resolve(null),
      config.seaMap ? loadSampler(config.seaMap) : Promise.resolve(null),
      config.cloudMap ? loadSampler(config.cloudMap) : Promise.resolve(null),
    ]).then(([relief, sea, clouds]) => {
      this.relief = relief
      this.sea = sea
      this.clouds = clouds
      this.ready = (!config.heightMap || !!relief) && (!config.seaMap || !!sea)
    })
  }

  /** cloud cover 0..1 at a map position */
  cloudCover(u: number, v: number) {
    return this.clouds ? sample(this.clouds, u, v) : 0
  }

  land(u: number, v: number) {
    if (!this.sea) return 1
    const s = sample(this.sea, u, v)
    const t = Math.min(Math.max((s - 0.42) / (0.22 - 0.42), 0), 1)
    return t * t * (3 - 2 * t)
  }

  /** height in planet radii at a direction (unit vector, planet frame) */
  height(d: THREE.Vector3, fade: number) {
    const [u, v] = sphereUv(d)
    let h = this.relief ? (sample(this.relief, u, v) - 0.5) * this.reliefRadii : 0
    let detail = 0
    let amp = this.roughRadii
    let f = this.detailFreq
    for (let k = 0; k < OCTAVES; k += 1) {
      const n = valueNoise(d.x * f + k * 17, d.y * f + k * 17, d.z * f + k * 17)
      const ridge = 1 - Math.abs(2 * n - 1)
      detail += ((n + (ridge * ridge - n) * this.config.ridged) - 0.5) * 2 * amp
      amp *= GAIN
      f *= 2
    }
    h += this.config.seaMap ? this.land(u, v) * (Math.abs(detail) + this.roughRadii * 0.25) : detail
    if (this.elevation) {
      const lat = Math.min(Math.max((v - 0.5) * Math.PI, -1.4835), 1.4835)
      const real = this.elevation(u, 0.5 + Math.asinh(Math.tan(lat)) / (2 * Math.PI))
      if (real) {
        const value =
          Math.max(real.height, 0) / (this.config.radiusKm * 1000) + (real.height > 0 ? detail * 0.02 : 0)
        h += (value - h) * real.known
      }
    }
    return h * fade
  }
}

/* The planet the ground is under, for the flight: written by the terrain
   (which knows the planet's frame), read by the pilot. */
export const ground = {
  /** planet index, or -2 */
  body: -2,
  ready: false,
  fade: 0,
  model: null as GroundModel | null,
  /** the planet's frame, world <-> local (radius 1) */
  matrix: new THREE.Matrix4(),
  inverse: new THREE.Matrix4(),
  worldRadius: 1,
  /** the body's own object (for the end-of-frame correction) */
  object: null as THREE.Object3D | null,
}

/* Saturn's rings, for flying through them: written by Saturn each frame */
export const ringState = {
  ready: false,
  center: new THREE.Vector3(),
  normal: new THREE.Vector3(0, 1, 0),
  radius: 1,
}

const _local = new THREE.Vector3()

/** altitude above the drawn ground at a world point, in scene units */
export function groundAltitude(world: THREE.Vector3) {
  if (!ground.model) return Infinity
  _local.copy(world).applyMatrix4(ground.inverse)
  const r = _local.length()
  _local.divideScalar(r)
  return (r - 1 - ground.model.height(_local, ground.fade)) * ground.worldRadius
}

/** latitude and longitude (degrees) under a world point */
export function groundLatLon(world: THREE.Vector3) {
  _local.copy(world).applyMatrix4(ground.inverse).normalize()
  const [u, v] = sphereUv(_local)
  return { lat: v * 180 - 90, lon: u * 360 - 180 }
}

/* the ship's shadow on the ground (shared uniforms, view space: written by
   the pilot, read by the terrain) */
export const shipShadow = {
  uShipView: { value: new THREE.Vector3() },
  uShipFwd: { value: new THREE.Vector3(0, 0, -1) },
  uShipRight: { value: new THREE.Vector3(1, 0, 0) },
  uShipLen: { value: 1 },
  uShipShadow: { value: 0 },
}

/* Earth's cloud deck: its drift over the ground (fraction of a turn) and
   height, written by the cloud layer */
export const cloudDeck = { shift: 0, height: 0.012 }

/* the cut in the planet's sphere under the patch (shared uniforms) */
export const groundHole = {
  uHolePlanet: { value: -2 },
  uHoleDir: { value: new THREE.Vector3(0, 1, 0) },
  uHoleCos: { value: 2 },
}
