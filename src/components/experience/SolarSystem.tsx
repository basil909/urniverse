'use client'

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

import {
  getPlanetOrbitEllipsePoint,
  getPlanetOrbitPosition,
  getPlanetPoleQuaternion,
  getPlanetEccentricAnomaly,
  getPlanetSunlight,
  orbitalDisplayDistance,
  getPlanetVisualRadius,
  PLANETS,
  SYSTEM_OFFSET,
  SYSTEM_BASE,
  SUN_TRUE_RADIUS,
  AU_UNITS,
  farScale,
  layout,
  SMALL_BODIES,
  getSmallBodyOrbitPosition,
  getBodyRadius,
  moonDirection,
  MOON_ID,
  MOON_TRUE_DISTANCE,
  MOON_RADIUS_KM,
  EARTH_RADIUS_KM,
  EARTH_RENDER_RADIUS,
  SATELLITES,
  FIRST_SATELLITE_ID,
} from './orbit'
import { simClock } from './simClock'
import { pilot } from './pilotState'
import { CLOSE_DETAIL_GLSL } from './closeDetail'
import Terrain from './Terrain'
import { sunVisibility } from './sunVisibility'
import { cloudDeck, GROUND, groundHole, ringState } from './groundState'
import { bodyFrames } from './spaceBodies'
import { SURFACE_PATCH_GLSL, surfacePatch, useSurfacePatches } from './surfaceTiles'
import { lens } from './lens'
import Belts from './Belts'
import Comet from './Comet'
import Cutaway from './Cutaway'
import { cutaway } from './cutawayState'
import {
  SHARP_EARTH_MAPS,
  SHARP_PLANET_MAPS,
  SHARP_SATURN_RING,
  useSharpFocus,
  useSharpTexture,
} from './sharpMaps'

/* Earth's 2K maps (sharper 4K versions load in focus: see sharpMaps.ts).
   Day and clouds: Solar System Scope (CC BY 4.0), oceans darkened. */
const EARTH_LOCAL_TEXTURES = {
  color: '/textures/earth-day.webp',
  // grayscale cloud density (white = cloud)
  clouds: '/textures/earth-clouds.webp',
  normal: '/textures/earth-normal.webp',
  specular: '/textures/earth-specular.webp',
  // city lights extracted from Solar System Scope's 2k_earth_nightmap (CC BY 4.0)
  night: '/textures/earth-night-lights.webp',
} as const

/* Earth's extras, added to its standard material:
   - city lights glow only where the Sun is down (fading across dusk)
   - clouds cast soft shadows on the ground, offset away from the Sun
     (longer near the terminator, where the light is low)
   - a sharp glint of sunlight on the oceans
   - aurora: green curtains around both poles on the night side
   Directions are in view space; north is Earth's spin axis. */
const earthNight = {
  uSunDirView: { value: new THREE.Vector3(1, 0, 0) },
  uNorthView: { value: new THREE.Vector3(0, 1, 0) },
  uClouds: { value: null as THREE.Texture | null },
  uHasClouds: { value: 0 },
  uCloudShift: { value: 0 },
  uTime: { value: 0 },
  uCloudHeight: { value: 0.012 },
}
const EARTH_CITY_LIGHTS = new THREE.Color('#ffc27a')
const _earthWorld = new THREE.Vector3()
const _earthAxis = new THREE.Vector3()
const _earthQuat = new THREE.Quaternion()

/* cloud deck height in Earth radii: 1.2% (76 km) from afar, so the
   clouds visibly stand off the ground; coming in close it settles to
   0.16% (10 km), where weather really is */
const CLOUD_HEIGHT_FAR = 0.012
const CLOUD_HEIGHT_NEAR = 0.0016
const _cloudCentre = new THREE.Vector3()

/* ============================================================
   CLOSE-UP DETAIL
   The surface maps are 2K–4K: a texel is some 10 km on Earth, so from a
   few hundred km up (flying) they turn soft. This adds what lies below
   that size: four octaves of fine relief and tone, each a quarter the
   size of the last, and each shown only once it spans a few pixels. So
   nothing changes in the wide views, and nothing shimmers. It is texture,
   not data: the real features stay those of the maps.
============================================================ */

/* for three.js's own materials: the vertex shader passes the point's
   direction on the sphere and the body's size */
function withSurfaceVaryings(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader =
    'varying vec3 vSurfaceP; varying float vSurfaceScale;\n' +
    shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vSurfaceP = position;
      vSurfaceScale = length(modelMatrix[0].xyz);`,
    )
  shader.fragmentShader =
    'varying vec3 vSurfaceP; varying float vSurfaceScale;\n' + CLOSE_DETAIL_GLSL + shader.fragmentShader
}

/* Earth's clouds: fine wisps that break up the soft edges up close */
function detailClouds(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, { uSunDirView: earthNight.uSunDirView, uTime: earthNight.uTime })
  withSurfaceVaryings(shader)
  shader.fragmentShader =
    'uniform vec3 uSunDirView; uniform float uTime;\n' +
    shader.fragmentShader
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
      float cloudCover = diffuseColor.a;
      {
        vec3 cd = closeDetail(normalize(vSurfaceP), 0.0, 1.0);
        diffuseColor.a *= clamp(1.0 + cd.y * 1.5, 0.0, 1.6);
        diffuseColor.rgb *= 1.0 + cd.y * 0.3;
      }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
      {
        /* lightning: on the night side, storm cells in the thickest cloud
           light up now and then, a flicker of a few strokes */
        float night = 1.0 - smoothstep(-0.2, 0.0, dot(normalize(normal), normalize(uSunDirView)));
        float thick = smoothstep(0.45, 0.8, cloudCover);
        if (night * thick > 0.0) {
          vec3 sp = normalize(vSurfaceP) * 55.0;
          vec3 cell = floor(sp);
          float id = cdHash(cell);
          float t = uTime * (0.5 + id * 0.7) + id * 40.0;
          float strike = step(0.965, cdHash(cell + floor(t) * 1.37));
          float beat = fract(t);
          float flicker = exp(-beat * 9.0) * (0.55 + 0.45 * sin(beat * 120.0 + id * 9.0));
          vec3 at = (cdHash(cell + 3.1) - 0.5) * vec3(0.5) + 0.5;
          float blob = 1.0 - smoothstep(0.0, 0.42, length(fract(sp) - at));
          totalEmissiveRadiance += vec3(0.78, 0.85, 1.0) * strike * max(flicker, 0.0) * blob * thick * night * 2.2;
        }
      }`,
      )
}

function maskLightsToNightSide(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, earthNight, surfacePatch, groundHole)
  withSurfaceVaryings(shader)
  shader.fragmentShader =
    'uniform int uHolePlanet; uniform vec3 uHoleDir; uniform float uHoleCos;\n' +
    shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      // landed: the ground patch replaces the sphere here
      if (uHolePlanet == 2 && dot(normalize(vSurfaceP), uHoleDir) > uHoleCos) discard;`,
    )
  shader.fragmentShader = SURFACE_PATCH_GLSL + shader.fragmentShader
  shader.fragmentShader =
    `uniform vec3 uSunDirView; uniform vec3 uNorthView; uniform sampler2D uClouds;
uniform float uHasClouds; uniform float uCloudShift; uniform float uTime; uniform float uCloudHeight;
` +
    shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
      /* flying low: NASA's imagery of the ground below, streamed in */
      float earthStreamed = 0.0;
      #ifdef USE_MAP
      if (uPatchPlanet == 2) {
        vec4 earthPatch = patched(diffuseColor.rgb, uPatchFine, uPatchFineRect, uPatchCoarse, uPatchCoarseRect, vMapUv, uPatchGain);
        diffuseColor.rgb = earthPatch.rgb;
        earthStreamed = earthPatch.a;
      }
      #endif`,
      )
      .replace(
        '#include <specularmap_fragment>',
        `#include <specularmap_fragment>
      /* close up: land gets fine relief and tone, the sea stays smooth */
      vec3 closeEarth = closeDetail(normalize(vSurfaceP), 0.45, 1.0);
      #ifdef USE_SPECULARMAP
      float closeSea = smoothstep(0.25, 0.6, specularStrength);
      #else
      float closeSea = smoothstep(0.02, 0.08, diffuseColor.b - diffuseColor.r);
      #endif
      /* real imagery carries its own detail: the made-up grain steps back */
      diffuseColor.rgb *= 1.0 + closeEarth.y * mix(0.3, 0.04, closeSea) * (1.0 - 0.7 * earthStreamed);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
      normal = closeBump(normal, -vViewPosition, closeEarth.x * vSurfaceScale * mix(0.16, 0.0, closeSea));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
      #ifdef USE_EMISSIVEMAP
      if (uPatchPlanet == 2) {
        totalEmissiveRadiance = emissive * patched(emissiveColor.rgb, uNightFine, uNightFineRect, uNightCoarse, uNightCoarseRect, vEmissiveMapUv, vec3(1.0)).rgb;
      }
      #endif
      float sunFacing = dot(normalize(normal), normalize(uSunDirView));
      totalEmissiveRadiance *= 1.0 - smoothstep(-0.2, 0.12, sunFacing);
      #ifdef USE_MAP
      {
        /* aurora ovals near 67 degrees from the equator, rippling curtains */
        float lat = (vMapUv.y - 0.5) * 180.0;
        float oval = exp(-pow((abs(lat) - 67.0) / 2.6, 2.0));
        float x = vMapUv.x * 6.28318;
        /* fine, folding curtains rather than separate patches */
        float curtain = 0.6
          + 0.25 * sin(x * 46.0 + uTime * 0.6 + 3.0 * sin(x * 7.0 - uTime * 0.15))
          + 0.15 * sin(x * 13.0 - uTime * 0.4);
        float dark = 1.0 - smoothstep(-0.3, 0.02, sunFacing);
        totalEmissiveRadiance += vec3(0.22, 1.0, 0.55) * oval * curtain * dark * 0.36;
      }
      #endif`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
      #ifdef USE_MAP
      {
        vec3 N = normalize(geometryNormal);
        vec3 sunV = normalize(uSunDirView);
        float mu = dot(N, sunV);
        float shade = 1.0;
        if (uHasClouds > 0.5 && mu > -0.05) {
          /* where is the cloud that stands between this point and the Sun? */
          vec3 east = normalize(cross(normalize(uNorthView), N));
          vec3 north = cross(N, east);
          vec3 along = sunV - N * mu;
          float reach = uCloudHeight / max(mu, 0.12);
          float coslat = max(cos((vMapUv.y - 0.5) * 3.14159), 0.15);
          vec2 shift = vec2(dot(along, east) / (6.28318 * coslat), dot(along, north) / 3.14159) * reach;
          float cover = texture2D(uClouds, vMapUv + shift - vec2(uCloudShift, 0.0)).g;
          shade = 1.0 - cover * 0.55;
        }
        reflectedLight.directDiffuse *= shade;
        reflectedLight.directSpecular *= shade;
        /* low sun through more air: light along the day/night line turns
           orange-red, as in astronaut photos of the terminator */
        vec3 sunset = mix(vec3(1.0, 0.5, 0.28), vec3(1.0), smoothstep(0.02, 0.3, mu));
        reflectedLight.directDiffuse *= sunset;
        /* the thin bright blue edge of the atmosphere, on the day side */
        float edgeView = 1.0 - max(dot(N, normalize(vViewPosition)), 0.0);
        float air = pow(edgeView, 3.0) * smoothstep(-0.05, 0.25, mu);
        reflectedLight.indirectDiffuse += vec3(0.18, 0.38, 0.9) * air * 0.55;
        /* sun glint: a tight, bright highlight where the water mirrors the Sun */
        vec3 V = normalize(vViewPosition);
        vec3 H = normalize(sunV + V);
        float spot = pow(max(dot(N, H), 0.0), 140.0) * 1.1 + pow(max(dot(N, H), 0.0), 24.0) * 0.12;
        reflectedLight.directSpecular += vec3(1.0, 0.92, 0.78) * spot * specularStrength * shade * smoothstep(0.0, 0.12, mu);
      }
      #endif`,
      )
}

const MOON_LOCAL_TEXTURES = {
  color: '/textures/moon.webp',
  height: '/textures/moon-height.webp',
} as const

const MOON_RENDER_RADIUS = 0.072
const MOON_ORBIT_RADIUS = 1.28
/* The Moon's direction from Earth at a Julian Date: a short series for
   its ecliptic longitude and latitude (good to about a degree), so it
   sits where it really is, with its real phase. */
const _moonEarth = new THREE.Vector3()

/* Earth's real rotation: Greenwich sidereal time gives where the prime
   meridian points (relative to the vernal equinox) at a Julian Date. The
   angle is returned for Earth's own spin axis (its tilt group's y), so the
   right side is in daylight for the simulated moment. */
const _meridian = new THREE.Vector3()
const _tiltInverse = new THREE.Quaternion()
function earthSpinAngle(jd: number, tilt: THREE.Quaternion) {
  const gmst = ((280.46061837 + 360.98564736629 * (jd - 2451545.0)) * Math.PI) / 180
  const eps = 0.4090928
  // prime meridian direction, equatorial -> ecliptic -> scene
  const x = Math.cos(gmst)
  const y = Math.sin(gmst)
  _meridian.set(x, -y * Math.sin(eps), -y * Math.cos(eps))
  _meridian.applyQuaternion(_tiltInverse.copy(tilt).invert())
  // the map's longitude 0 sits on the body's local +x
  return Math.atan2(-_meridian.z, _meridian.x)
}

/* a vector's angle about a tilted body's spin axis, in that body's frame */
const _ref = new THREE.Vector3()
function angleInFrame(direction: THREE.Vector3, tilt: THREE.Quaternion) {
  _ref.copy(direction).applyQuaternion(_tiltInverse.copy(tilt).invert())
  return Math.atan2(-_ref.z, _ref.x)
}
const VERNAL_EQUINOX = new THREE.Vector3(1, 0, 0) // ecliptic x in the scene


const EARTH_SPECULAR = new THREE.Color('#2b4766')
const MOON_SPECULAR = new THREE.Color('#222222')

const _scratchOrbitPos = new THREE.Vector3()
const _farWorld = new THREE.Vector3()
const _sunCamera = new THREE.Vector3()
const _trailPoint = new THREE.Vector3()

/* orbit trails: how far behind each planet the arc reaches, and its detail */
const TRAIL_SPAN = Math.PI * 0.6 // radians of eccentric anomaly (~108 degrees)
const TRAIL_POINTS = 72

const TRAIL_VERTEX = /* glsl */ `
attribute float aFade;
varying float vFade;
void main() {
  vFade = aFade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const TRAIL_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
void main() {
  gl_FragColor = vec4(uColor, vFade * uOpacity);
}`

/* Atmosphere character per planet: day colour, dusk colour (near the
   day/night line), strength and thickness (0 thin .. ~1.2 thick haze) */
const ATMOSPHERE_LOOK: Record<string, { color: string; dusk: string; intensity: number; thickness: number }> = {
  Venus: { color: '#f0d39a', dusk: '#e8a35c', intensity: 0.75, thickness: 1.1 },
  Earth: { color: '#5aa9ff', dusk: '#ff9a5a', intensity: 0.85, thickness: 0.35 },
  Mars: { color: '#e0a08c', dusk: '#c47762', intensity: 0.32, thickness: 0.1 },
  Jupiter: { color: '#e9d6b4', dusk: '#d9a878', intensity: 0.3, thickness: 0.4 },
  Saturn: { color: '#efdcb4', dusk: '#d8b07a', intensity: 0.28, thickness: 0.4 },
  Uranus: { color: '#a7e5e6', dusk: '#7fc4d6', intensity: 0.4, thickness: 0.5 },
  Neptune: { color: '#8fc0e6', dusk: '#6a9cd0', intensity: 0.42, thickness: 0.5 },
}

/* atmosphere shell size in planet radii: thick hazes stand off the
   surface, Mars's thin air hugs it */
const ATMOSPHERE_SHELL: Record<string, number> = {
  Venus: 1.085,
  Mars: 1.02,
}

/* ============================================================
   DRAG TO SPIN
   One shared state: the window pointer handler writes it, the
   focused planet reads it. `pending` is rotation from the drag in
   progress; `velocity` keeps it turning (with friction) on release.
============================================================ */

// `hold` freezes the planet while a point of interest is hovered or open
type SpinState = {
  pending: number
  velocity: number
  dragging: boolean
  hold: boolean
}

/* Planet chapters are 2-9; text (and interaction) lives in this window */
const FOCUS_IN = 0.16
const FOCUS_OUT = 0.93

function focusedPlanetIndex(progress: number) {
  const chapter = Math.floor(progress)
  const local = progress - chapter
  if (chapter < 2 || chapter > 9) return -1
  return local >= FOCUS_IN && local < FOCUS_OUT ? chapter - 2 : -1
}

/* ============================================================
   POINTS OF INTEREST
   Positions checked against the texture maps (lon -180..180, east +).
============================================================ */

type Hotspot = { name: string; fact: string; lat: number; lon: number }

const HOTSPOTS: Record<number, Hotspot[]> = {
  2: [
    {
      name: 'Himalayas',
      fact: 'Home of Mount Everest, 8,849 m above sea level: the highest point on Earth.',
      lat: 28.0,
      lon: 86.9,
    },
    {
      name: 'Sahara',
      fact: 'The largest hot desert on Earth, roughly the size of the United States.',
      lat: 23.0,
      lon: 13.0,
    },
    {
      name: 'Amazon rainforest',
      fact: 'The largest tropical rainforest, covering about 5.5 million km².',
      lat: -3.5,
      lon: -62.0,
    },
  ],
  3: [
    {
      name: 'Olympus Mons',
      fact: 'The tallest volcano in the Solar System: about 22 km high, roughly 2.5 times Everest.',
      lat: 18.65,
      lon: -133.8,
    },
    {
      name: 'Valles Marineris',
      fact: 'A canyon system more than 4,000 km long and up to 7 km deep.',
      lat: -13.9,
      lon: -59.2,
    },
  ],
  4: [
    {
      name: 'Great Red Spot',
      fact: 'A storm wider than Earth, observed continuously for at least 190 years.',
      lat: -21.1,
      lon: -46.4,
    },
  ],
}

/* Same mapping three.js SphereGeometry uses for its UVs */
function latLonToSphere(lat: number, lon: number, radius: number) {
  const u = (lon + 180) / 360
  const v = (90 - lat) / 180
  const phi = u * Math.PI * 2
  const theta = v * Math.PI
  return new THREE.Vector3(
    -Math.cos(phi) * Math.sin(theta) * radius,
    Math.cos(theta) * radius,
    Math.sin(phi) * Math.sin(theta) * radius,
  )
}

const _hotspotWorld = new THREE.Vector3()
const _hotspotCenter = new THREE.Vector3()
const _hotspotNormal = new THREE.Vector3()
const _hotspotToCamera = new THREE.Vector3()

/* Elevation maps for relief shading, by orbit index. Public domain:
   Mercury from MESSENGER (USGS), Mars from MGS MOLA (USGS). Strength
   exaggerates the slopes (real relief is under 1% of the radius). */
const RELIEF: ({ url: string; strength: number } | undefined)[] = [
  { url: '/textures/relief/mercury-height.webp', strength: 3.2 },
  undefined,
  undefined,
  { url: '/textures/relief/mars-height.webp', strength: 4.0 },
]

/* Planet surface maps by orbit index (Earth uses EARTH_LOCAL_TEXTURES) */
const PLANET_TEXTURES: (string | undefined)[] = [
  '/textures/planets/2k_mercury.webp',
  '/textures/planets/2k_venus_atmosphere.webp',
  undefined,
  '/textures/planets/2k_mars.webp',
  '/textures/planets/2k_jupiter.webp',
  '/textures/planets/2k_saturn.webp',
  '/textures/planets/2k_uranus.webp',
  '/textures/planets/2k_neptune.webp',
]

function seededRandom(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453123
  return x - Math.floor(x)
}


const SUN_VERTEX_SHADER = /* glsl */ `

varying vec3 vNormal;

varying vec3 vWorldPosition;

varying vec3 vLocalPosition;

void main() {

  vNormal = normalize(mat3(modelMatrix) * normal);

  vec4 worldPosition = modelMatrix * vec4(position, 1.0);

  vWorldPosition = worldPosition.xyz;

  vLocalPosition = position;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

}`



const SUN_FRAGMENT_SHADER = /* glsl */ `

uniform float uTime;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec3 vLocalPosition;

float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y), mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += noise(p) * a; p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return v; }

void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  float mu = clamp(dot(n, viewDir), 0.0, 1.0);
  vec3 p = normalize(vLocalPosition);

  /* granulation: two scales of slowly churning convection cells (fine
     granules inside a larger supergranule network) */
  float cells = 1.0 - abs(noise(p * 34.0 + vec3(0.0, uTime * 0.03, uTime * 0.02)) * 2.0 - 1.0);
  float fine = 1.0 - abs(noise(p * 72.0 - vec3(uTime * 0.025, 0.0, uTime * 0.02)) * 2.0 - 1.0);
  cells = pow(cells, 2.6) * 0.7 + pow(fine, 3.0) * 0.3;
  float network = 1.0 - abs(noise(p * 9.0 + vec3(uTime * 0.006)) * 2.0 - 1.0);
  cells *= 0.82 + 0.18 * smoothstep(0.3, 0.9, network);
  float churn = fbm(p * 2.4 + vec3(uTime * 0.006, 0.0, 0.0));

  /* faculae (bright active regions) and rare, small sunspots */
  float faculae = smoothstep(0.6, 0.8, fbm(p * 5.5 - vec3(0.0, uTime * 0.01, 0.0)));
  float spots = smoothstep(0.8, 0.87, fbm(p * 1.8 + vec3(3.1, 0.0, 1.4)));

  /* limb darkening: dimmer and redder towards the edge, as on the real Sun */
  float limb = 1.0 - 0.68 * (1.0 - pow(mu, 0.7));
  /* golden centre, deepening to orange and red at the limb */
  vec3 core = vec3(1.0, 0.84, 0.52);
  vec3 middle = vec3(1.0, 0.6, 0.2);
  vec3 edge = vec3(0.85, 0.27, 0.05);
  vec3 base = mix(edge, middle, smoothstep(0.0, 0.6, mu));
  base = mix(base, core, smoothstep(0.6, 1.0, mu));

  /* flying close: real granules are ~1,000 km across (a 700th of the
     radius), bright cells of rising gas parted by dark lanes; they
     resolve as you come in, finer cells within them below that */
  float px = length(fwidth(p));
  float near1 = 1.0 - smoothstep(0.25, 0.9, px * 700.0);
  if (near1 > 0.0) {
    float g = 1.0 - abs(noise(p * 700.0 + vec3(uTime * 0.05, 0.0, uTime * 0.04)) * 2.0 - 1.0);
    float g2 = 1.0 - abs(noise(p * 2600.0 - vec3(0.0, uTime * 0.08, 0.0)) * 2.0 - 1.0);
    float near2 = 1.0 - smoothstep(0.25, 0.9, px * 2600.0);
    float granules = pow(g, 2.4) * (1.0 - 0.3 * near2) + pow(g2, 3.0) * 0.3 * near2;
    cells = mix(cells, granules, near1 * 0.85);
  }

  /* exposed so the cells read: dark lanes between bright granules */
  float tone = 0.6 + 0.42 * cells + 0.1 * churn + 0.2 * faculae;
  vec3 color = base * tone * limb;
  /* a sunspot: a dark umbra inside a lighter, streaked penumbra */
  float umbra = smoothstep(0.86, 0.9, fbm(p * 1.8 + vec3(3.1, 0.0, 1.4)));
  float streaks = 0.75 + 0.25 * sin(atan(p.y, p.x) * 220.0 + fbm(p * 40.0) * 6.0);
  color *= 1.0 - spots * 0.45 * streaks - umbra * 0.4;

  // only the hottest centre is bright enough to bloom; the rest stays
  // below the bloom threshold so the surface is visible, not a white disc
  gl_FragColor = vec4(color * 1.0, 1.0);
}`



const ATMOSPHERE_VERTEX_SHADER = /* glsl */ `

uniform float uShell;
varying vec3 vNormal; varying vec3 vWorldPosition;
varying vec3 vCenter; varying float vRadius; /* the planet's centre and radius */

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPosition = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vRadius = length(modelMatrix[0].xyz) / max(uShell, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`



const ATMOSPHERE_FRAGMENT_SHADER = /* glsl */ `

uniform vec3 uColor; uniform vec3 uDusk; uniform float uIntensity; uniform float uThickness;
uniform vec3 uSunPosition; uniform float uLight; uniform float uShell; uniform float uAirglow;
uniform float uGroundSky; /* 1 standing in the air near the ground, 0 above it */
varying vec3 vNormal; varying vec3 vWorldPosition;
varying vec3 vCenter; varying float vRadius;

void main() {
  vec3 n = normalize(vNormal);
  vec3 vd = normalize(cameraPosition - vWorldPosition);
  vec3 toSun = normalize(uSunPosition - vWorldPosition);

  /* How close does this line of sight pass to the planet's centre, in
     planet radii? The glow is densest where it grazes the surface and
     thins with height, so it hugs the limb instead of drawing a ring at
     the shell's outer edge. Over the disk it only brightens near the limb. */
  float pass;
  float column = 1.0;
  float camHeight = 1.0;
  vec3 oc = vCenter - cameraPosition;
  bool inside = length(oc) < vRadius * uShell;
  if (inside) {
    /* flying inside the atmosphere (only the far side of the shell is
       seen): the same question for the ray from the camera. Looking down
       past the planet it grazes the air at its lowest point ahead; looking
       up it is lowest where you are, and crosses little air on its way
       out, so the sky overhead stays black and the horizon glows. */
    if (gl_FrontFacing) discard;
    vec3 ray = -vd;
    float t = max(dot(oc, ray), 0.0);
    vec3 closest = ray * t - oc;
    pass = length(closest) / vRadius;
    n = normalize(closest);
    toSun = normalize(uSunPosition - vCenter);
    float up = dot(ray, normalize(-oc));
    column = 1.0 / (1.0 + max(up, 0.0) * sqrt(2.0 / max(uShell - 1.0, 0.01)) * 6.0);
    camHeight = length(oc) / vRadius - 1.0;
  } else {
    if (!gl_FrontFacing) discard;
    float nv = clamp(dot(n, vd), 0.0, 1.0);
    pass = uShell * sqrt(1.0 - nv * nv);
  }
  float scale = (uShell - 1.0) * mix(0.22, 0.55, clamp(uThickness / 1.2, 0.0, 1.0));
  /* from far away the glow is drawn thicker than it is, so it shows; seen
     from inside, the air thins over its true few tens of km */
  if (inside) scale *= 0.4;
  /* standing in the air, the whole sky is lit (blue on Earth, butterscotch
     on Mars); it darkens to black as you climb out of it */
  if (inside) column = mix(column, 1.0, max(exp(-camHeight / (scale * 0.6)), uGroundSky) * 0.9);
  float above = pass - 1.0;
  /* standing on ground below the planet's mean radius (Mars's lowlands),
     the air is measured from where you stand */
  if (inside) above = max(pass - min(1.0, camHeight + 1.0), 0.0);
  float edge = above > 0.0
    ? exp(-above / scale) * (1.0 - smoothstep(mix(uShell, 1.0, 0.25), uShell, pass))
    : pow(clamp(pass, 0.0, 1.0), mix(14.0, 5.0, clamp(uThickness / 1.2, 0.0, 1.0)));

  /* only where sunlight reaches, with a warm tint near the day/night line */
  float ndl = dot(n, toSun);
  /* twilight reaches past the terminator only in thick atmospheres:
     a thin one (Mars) would float as a dark outline on the night limb */
  float day = smoothstep(mix(-0.05, -0.22, clamp(uThickness / 1.1, 0.0, 1.0)), 0.3, ndl);
  float dusk = 1.0 - smoothstep(0.0, 0.42, abs(ndl + 0.04));
  vec3 color = mix(uColor, uDusk, dusk * 0.8);

  /* forward scattering: looking towards the Sun through the limb, the
     atmosphere lights up all round (the backlit "ring of light") */
  float forward = pow(max(dot(-vd, toSun), 0.0), 5.0);
  float backlit = forward * smoothstep(-0.75, 0.05, ndl) * 2.2;

  if (inside && above < 0.0) edge = 0.0; /* that ray ends on the ground */
  if (inside) edge = mix(edge, 1.0, uGroundSky * 0.85);
  float a = edge * column * (day + backlit) * uIntensity * uLight;
  /* the daytime sky seen from the ground is far brighter than the thin
     limb seen from space */
  if (inside) a = min(a * mix(1.0, 2.6, uGroundSky), mix(4.0, 0.95, uGroundSky));
  vec3 glow = color * a;

  /* Earth's airglow: on the night side, seen edge-on, a thin green line
     about 95 km up (oxygen, glowing as it recombines) under a fainter red
     layer near 250 km, as in photographs from the Space Station. Thinner
     than a pixel from afar; it appears only as you come close. */
  if (uAirglow > 0.5 && above > 0.0) {
    float night = 1.0 - smoothstep(-0.2, 0.05, ndl);
    float green = exp(-pow((above - 0.0149) / 0.0014, 2.0));
    float red = exp(-pow((above - 0.036) / 0.006, 2.0));
    vec3 airglow = (vec3(0.32, 1.0, 0.45) * green * 0.3 + vec3(1.0, 0.35, 0.25) * red * 0.04) * night;
    glow += airglow;
    a += dot(airglow, vec3(0.33));
  }
  gl_FragColor = vec4(glow, a);
}`



const PLANET_VERTEX_SHADER = /* glsl */ `

varying vec3 vWorldPosition; varying vec3 vNormal; varying vec2 vUv; varying vec3 vLocalPosition;
varying vec3 vEast; varying vec3 vNorth; varying float vScale; varying vec3 vViewPos;

void main() {
  vUv = uv;
  vScale = length(modelMatrix[0].xyz);
  vViewPos = (modelViewMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vLocalPosition = position;
  /* map directions on the sphere: east = increasing u, north = increasing v */
  vec3 lp = normalize(position);
  vec3 east = vec3(lp.z, 0.0, -lp.x);
  east = length(east) > 1e-4 ? normalize(east) : vec3(1.0, 0.0, 0.0);
  vEast = mat3(modelMatrix) * east;
  vNorth = mat3(modelMatrix) * cross(lp, east);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPosition = wp.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`



const PLANET_FRAGMENT_SHADER = /* glsl */ `

uniform float uTime; uniform int uType; uniform int uPlanet; uniform vec3 uBaseColor; uniform vec3 uAtmosphereColor; uniform vec3 uSunPosition; uniform sampler2D uMap; uniform float uHasMap;

/* shadows (all in world space) */
uniform vec3 uMoonPos[4]; uniform float uMoonRadius[4]; uniform int uMoonCount;
uniform float uLight; uniform vec3 uLightTint; /* sunlight strength and colour at this distance */
uniform int uHolePlanet; uniform vec3 uHoleDir; uniform float uHoleCos; /* cut away under the landing ground */
uniform float uHasRings; uniform sampler2D uRingMap; uniform vec3 uRingNormal; uniform vec3 uPlanetCenter; uniform float uRingInner; uniform float uRingOuter;
uniform sampler2D uHeight; uniform float uHasHeight; uniform float uRelief; uniform vec2 uHeightTexel; /* surface relief */

varying vec3 vWorldPosition; varying vec3 vNormal; varying vec2 vUv; varying vec3 vLocalPosition;
varying vec3 vEast; varying vec3 vNorth; varying float vScale; varying vec3 vViewPos;

float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }

float noise(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = hash(i); float b = hash(i + vec3(1,0,0)); float c = hash(i + vec3(0,1,0)); float d = hash(i + vec3(1,1,0)); float e = hash(i + vec3(0,0,1)); float f1 = hash(i + vec3(1,0,1)); float g = hash(i + vec3(0,1,1)); float h = hash(i + vec3(1,1,1)); float x1 = mix(a,b,f.x); float x2 = mix(c,d,f.x); float x3 = mix(e,f1,f.x); float x4 = mix(g,h,f.x); float y1 = mix(x1,x2,f.y); float y2 = mix(x3,x4,f.y); return mix(y1,y2,f.z); }

float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += noise(p) * a; p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return v; }

/* crater-ish field: sharp-rimmed bowls from cellular-like noise */
float craters(vec3 p) { float n = noise(p); float r = abs(n - 0.5) * 2.0; return smoothstep(0.75, 0.98, 1.0 - r); }

/* ---------- MERCURY: grey, heavily cratered regolith ---------- */
vec3 mercury(vec3 p) {
  float base = fbm(p * 2.4);
  float detail = fbm(p * 9.0);
  float c = craters(p * 14.0) * 0.6 + craters(p * 31.0) * 0.4;
  vec3 dark = vec3(0.26, 0.25, 0.24);
  vec3 light = vec3(0.62, 0.60, 0.57);
  vec3 col = mix(dark, light, smoothstep(0.30, 0.72, base * 0.6 + detail * 0.4));
  col *= 1.0 - c * 0.28;
  col += vec3(0.08) * smoothstep(0.82, 0.95, detail);
  return col;
}

/* ---------- VENUS: thick sulfuric cloud deck, soft swirls ---------- */
vec3 venus(vec3 p) {
  vec3 q = p * 2.2 + vec3(uTime * 0.012, 0.0, 0.0);
  float w = fbm(q);
  float lat = p.y + (w - 0.5) * 0.35;
  float chevron = sin(lat * 7.0 + abs(p.x) * 3.0 + w * 4.0) * 0.5 + 0.5;
  float swirl = fbm(vec3(p.x * 3.0, lat * 6.0, p.z * 3.0));
  float t = chevron * 0.35 + swirl * 0.65;
  vec3 deep = vec3(0.70, 0.55, 0.32);
  vec3 cream = vec3(0.96, 0.89, 0.70);
  return mix(deep, cream, smoothstep(0.30, 0.78, t));
}

/* ---------- MARS: rust plains, dark basalt, polar caps ---------- */
vec3 mars(vec3 p) {
  float continents = fbm(p * 1.8);
  float detail = fbm(p * 7.5);
  float c = craters(p * 18.0);
  vec3 rust = vec3(0.70, 0.33, 0.16);
  vec3 ochre = vec3(0.82, 0.52, 0.30);
  vec3 basalt = vec3(0.30, 0.15, 0.10);
  vec3 col = mix(rust, ochre, smoothstep(0.45, 0.75, detail));
  col = mix(col, basalt, smoothstep(0.52, 0.62, continents) * 0.75);
  col *= 1.0 - c * 0.18;
  float cap = smoothstep(0.86, 0.93, abs(p.y) + (fbm(p * 6.0) - 0.5) * 0.08);
  col = mix(col, vec3(0.94, 0.92, 0.90), cap);
  return col;
}

/* ---------- shared gas-giant banding with domain warp ---------- */
float bands(vec3 p, float freq, float warp, float speed) {
  vec3 q = p * 2.6 + vec3(uTime * speed, 0.0, 0.0);
  float w = fbm(q) - 0.5;
  float lat = p.y + w * warp;
  float b1 = sin(lat * freq) * 0.5 + 0.5;
  float b2 = sin(lat * freq * 2.37 + 1.3) * 0.5 + 0.5;
  float fine = fbm(vec3(p.x * 3.0, lat * freq * 1.6, p.z * 3.0));
  return b1 * 0.55 + b2 * 0.25 + fine * 0.20;
}

/* ---------- JUPITER: cream zones, brown belts, Great Red Spot ---------- */
vec3 jupiter(vec3 p) {
  float t = bands(p, 21.0, 0.11, 0.010);
  vec3 belt = vec3(0.50, 0.33, 0.22);
  vec3 zone = vec3(0.93, 0.86, 0.74);
  vec3 tanC = vec3(0.80, 0.58, 0.40);
  vec3 col = mix(belt, zone, smoothstep(0.30, 0.72, t));
  col = mix(col, tanC, smoothstep(0.62, 0.90, fbm(p * 5.0)) * 0.35);
  vec2 s = vec2(atan(p.z, p.x), p.y);
  vec2 d = s - vec2(-0.55, -0.20);
  float e = length(d * vec2(1.0, 2.3));
  float spot = 1.0 - smoothstep(0.10, 0.24, e);
  float ring = smoothstep(0.18, 0.24, e) * (1.0 - smoothstep(0.24, 0.32, e));
  col = mix(col, vec3(0.72, 0.30, 0.18), spot * 0.9);
  col = mix(col, vec3(0.96, 0.90, 0.80), ring * 0.45);
  return col;
}

/* ---------- SATURN: soft butterscotch bands, low contrast ---------- */
vec3 saturn(vec3 p) {
  float t = bands(p, 28.0, 0.04, 0.008);
  vec3 a = vec3(0.74, 0.62, 0.42);
  vec3 b = vec3(0.95, 0.88, 0.68);
  vec3 col = mix(a, b, smoothstep(0.25, 0.80, t));
  col = mix(col, vec3(0.62, 0.55, 0.45), smoothstep(0.80, 0.97, abs(p.y)) * 0.6);
  return col;
}

/* ---------- URANUS: nearly featureless cyan haze ---------- */
vec3 uranus(vec3 p) {
  float t = bands(p, 9.0, 0.05, 0.004);
  vec3 a = vec3(0.56, 0.80, 0.84);
  vec3 b = vec3(0.68, 0.89, 0.91);
  vec3 col = mix(a, b, smoothstep(0.35, 0.70, t) * 0.55);
  col = mix(col, vec3(0.80, 0.94, 0.95), smoothstep(0.70, 0.98, p.y) * 0.35);
  return col;
}

/* ---------- NEPTUNE: deep blue, faint bands, dark spot, white streaks ---------- */
vec3 neptune(vec3 p) {
  float t = bands(p, 13.0, 0.08, 0.014);
  vec3 a = vec3(0.12, 0.24, 0.66);
  vec3 b = vec3(0.26, 0.44, 0.88);
  vec3 col = mix(a, b, smoothstep(0.30, 0.75, t));
  vec2 s = vec2(atan(p.z, p.x), p.y);
  float e = length((s - vec2(0.9, -0.32)) * vec2(1.0, 2.0));
  col = mix(col, vec3(0.06, 0.12, 0.38), (1.0 - smoothstep(0.08, 0.18, e)) * 0.85);
  float streak = smoothstep(0.80, 0.92, fbm(vec3(p.x * 6.0, p.y * 40.0, p.z * 6.0)));
  col = mix(col, vec3(0.86, 0.92, 1.0), streak * 0.55);
  return col;
}

/* ---------- living cloud tops (Jupiter, Saturn) ----------
   The real map, carried along a flow field: alternating east-west jets,
   small eddies so band edges ripple, and on Jupiter the Great Red Spot
   turning anticlockwise. Two samples at staggered phases are cross-faded
   (the flow-map technique), so the clouds move forever without smearing. */
/* ---------- ice giants: details over the (nearly featureless) maps ---------- */
vec3 neptuneWeather(vec3 base, vec2 uv) {
  float lat = (uv.y - 0.5) * 3.14159;
  /* a Great Dark Spot drifting west, with bright companion clouds */
  vec2 d = uv - vec2(fract(0.62 - uTime * 0.0035), 0.39);
  d.x = (fract(d.x + 0.5) - 0.5) * 1.86;
  float spot = 1.0 - smoothstep(0.6, 1.0, length(d / vec2(0.07, 0.032)));
  base = mix(base, base * vec3(0.35, 0.42, 0.7), spot * 0.75);
  float companion = 1.0 - smoothstep(0.4, 1.0, length((d - vec2(0.03, -0.045)) / vec2(0.05, 0.012)));
  /* high methane cirrus: thin white streaks in two mid-latitude bands */
  float belt = exp(-pow((abs(lat) - 0.5) / 0.12, 2.0)) + 0.6 * exp(-pow((lat + 1.05) / 0.08, 2.0));
  /* short, soft wisps rather than long lines: stretched noise, broken up */
  float streak = smoothstep(0.58, 0.78, fbm(vec3(uv.x * 22.0 - uTime * 0.012, lat * 26.0, 1.7)));
  streak *= smoothstep(0.45, 0.7, noise(vec3(uv.x * 9.0 + 3.1, lat * 4.0, uTime * 0.01)));
  float white = max(companion * 0.9, streak * belt * 0.6);
  return mix(base, vec3(0.92, 0.96, 1.0), white);
}

/* Mars: a regional dust storm drifting slowly across the surface,
   ochre and soft-edged, veiling the dark markings beneath it */
vec3 marsDust(vec3 base, vec2 uv, vec3 p) {
  vec2 d = uv - vec2(fract(0.36 + uTime * 0.0012), 0.43);
  d.x = (fract(d.x + 0.5) - 0.5) * 1.86;
  float region = 1.0 - smoothstep(0.05, 0.16, length(d * vec2(1.0, 1.6)));
  float billows = smoothstep(0.42, 0.7, fbm(p * 7.0 + vec3(uTime * 0.012, 0.0, uTime * 0.008)));
  float dust = region * (0.45 + 0.55 * billows);
  return mix(base, vec3(0.86, 0.62, 0.42), dust * 0.7);
}

/* Saturn: the hexagon, a six-sided jet stream round the north pole
   (near 78 N), with a darker vortex at the pole itself */
vec3 saturnPole(vec3 base, vec2 uv) {
  float lat = (uv.y - 0.5) * 3.14159;
  float fromPole = 1.5708 - lat;
  if (fromPole > 0.4) return base;
  float lon = uv.x * 6.28318;
  vec2 q = fromPole * vec2(cos(lon), sin(lon));
  float a = atan(q.y, q.x);
  float sector = mod(a, 1.0472) - 0.5236;
  float apothem = 0.21 * 0.866;
  float edge = length(q) * cos(sector);
  float inside = 1.0 - smoothstep(apothem - 0.006, apothem + 0.006, edge);
  float band = 1.0 - smoothstep(0.0, 0.012, abs(edge - apothem));
  vec3 polar = mix(base, vec3(0.58, 0.64, 0.66), 0.45); /* bluish polar haze */
  vec3 c = mix(base, polar, inside);
  c = mix(c, c * 0.72, band);
  c = mix(c, c * 0.55, 1.0 - smoothstep(0.0, 0.035, fromPole));
  return c;
}

vec3 uranusWeather(vec3 base, vec2 uv) {
  float lat = (uv.y - 0.5) * 3.14159;
  /* faint banding and a bright cap over the sunward (north) pole */
  base *= 0.94 + 0.06 * sin(lat * 14.0 + 0.6);
  base = mix(base, vec3(0.86, 0.97, 0.97), smoothstep(0.85, 1.35, lat) * 0.45);
  /* a few small bright storms drifting with the winds */
  float storms = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 c = vec2(fract(0.2 + fi * 0.31 + uTime * (0.003 + fi * 0.001)), 0.62 + fi * 0.07);
    vec2 d = uv - c;
    d.x = (fract(d.x + 0.5) - 0.5) * 1.86;
    storms += 1.0 - smoothstep(0.3, 1.0, length(d / vec2(0.05, 0.017)));
  }
  return mix(base, vec3(0.95, 1.0, 1.0), clamp(storms, 0.0, 1.0) * 0.7);
}

vec2 cloudFlow(vec2 uv) {
  float lat = (uv.y - 0.5) * 3.14159;
  if (uPlanet == 1) {
    /* Venus: super-rotation, the cloud tops circle the planet westwards in
       about four days, nearly as a solid shell; slower towards the poles,
       with broad eddies */
    vec3 q = vec3(uv * vec2(6.0, 12.0), uTime * 0.03);
    vec2 v = vec2(-cos(lat) * 1.0, 0.0);
    v += vec2(noise(q + 4.0) - 0.5, (noise(q) - 0.5) * 0.8) * 0.7;
    return v * 0.0011;
  }
  bool jupiter = uPlanet == 4;
  float jets = jupiter
    ? sin(lat * 13.0) * 0.7 + sin(lat * 29.0 + 1.3) * 0.3
    : sin(lat * 8.0 + 0.4) * 0.8 + sin(lat * 19.0) * 0.2;
  vec2 v = vec2(jets * (0.55 + 0.45 * cos(lat)), 0.0);
  vec3 q = vec3(uv * vec2(20.0, 40.0), uTime * 0.04);
  v += vec2(noise(q + 7.0) - 0.5, (noise(q) - 0.5) * 0.6) * 0.6;
  v *= jupiter ? 0.0009 : 0.0005; /* texture widths per second */

  if (jupiter) {
    /* the Great Red Spot (21 S, 46 W on this map), as an ellipse in
       equal-angle units: one u is twice the angle of one v */
    vec2 d = uv - vec2(0.368, 0.388);
    d.x = fract(d.x + 0.5) - 0.5;
    vec2 axes = vec2(0.068, 0.036);
    vec2 e = vec2(d.x * 1.86, d.y) / axes;
    float spin = (1.0 - smoothstep(0.75, 1.45, length(e))) * 0.045; /* radians per second */
    vec2 turn = vec2(-e.y * axes.x / 1.86, e.x * axes.y) * spin;
    float inSpot = 1.0 - smoothstep(1.0, 1.6, length(e));
    v = mix(v, turn, inSpot);
  }
  return v;
}

vec3 flowingClouds(vec2 uv) {
  vec2 v = cloudFlow(uv);
  float period = 7.0;
  float t0 = fract(uTime / period);
  float t1 = fract(uTime / period + 0.5);
  vec3 a = texture2D(uMap, uv - v * (t0 - 0.5) * period).rgb;
  vec3 b = texture2D(uMap, uv - v * (t1 - 0.5) * period).rgb;
  return mix(a, b, abs(1.0 - 2.0 * t0));
}

${CLOSE_DETAIL_GLSL}
${SURFACE_PATCH_GLSL}
void main() {

  vec3 normal = normalize(vNormal);
  vec3 p = normalize(vLocalPosition);
  vec3 surface;
  float streamedCover = 0.0;

  if (uHolePlanet == uPlanet && dot(p, uHoleDir) > uHoleCos) discard;
  if (uPlanet == 0) surface = mercury(p);
  else if (uPlanet == 1) surface = venus(p);
  else if (uPlanet == 3) surface = mars(p);
  else if (uPlanet == 4) surface = jupiter(p);
  else if (uPlanet == 5) surface = saturn(p);
  else if (uPlanet == 6) surface = uranus(p);
  else surface = neptune(p);

  /* real surface map when loaded; procedural surface above is the fallback */
  if (uHasMap > 0.5) {
    /* giants, close up (flying): the bands break into eddies and
       filaments, as in Juno's and Cassini's close views. The map's own
       colours are swirled by turbulence, strongest along the bands, and
       their contrast lifted. Off in every view of the journey itself. */
    vec2 mapUv = vUv;
    float swirl = 0.0;
    if (uType == 2 || uType == 3) {
      swirl = 1.0 - smoothstep(0.0008, 0.0025, length(fwidth(p)));
      if (swirl > 0.0) {
        vec3 q = p * vec3(1.0, 3.2, 1.0);
        vec2 eddy = vec2(fbm(q * 34.0 + vec3(0.0, 0.0, uTime * 0.004)), fbm(q * 34.0 + 7.3)) - 0.5;
        vec2 fine = vec2(noise(q * 260.0), noise(q * 260.0 + 3.7)) - 0.5;
        mapUv += (eddy * vec2(0.012, 0.007) + fine * vec2(0.0016, 0.0011)) * swirl;
      }
    }
    surface = (uPlanet == 4 || uPlanet == 5 || uPlanet == 1)
      ? flowingClouds(mapUv)
      : texture2D(uMap, mapUv).rgb;
    if (swirl > 0.0) {
      vec3 broad = texture2D(uMap, mapUv, 4.0).rgb;
      surface = max(broad + (surface - broad) * (1.0 + 1.3 * swirl), vec3(0.0));
      /* and their colour deepened, the way close views are seen */
      float grey = dot(surface, vec3(0.299, 0.587, 0.114));
      surface = max(mix(vec3(grey), surface, 1.0 + 0.6 * swirl) * (1.0 - 0.1 * swirl), vec3(0.0));
    }
    /* flying low: NASA's imagery of the ground below, streamed in */
    if (uPatchPlanet == uPlanet) {
      vec4 streamed = patched(surface, uPatchFine, uPatchFineRect, uPatchCoarse, uPatchCoarseRect, vUv, uPatchGain);
      surface = streamed.rgb;
      streamedCover = streamed.a;
    }
    /* Venus: the faint dark chevrons seen in ultraviolet, sweeping round */
    if (uPlanet == 1) {
      float lat = (vUv.y - 0.5) * 3.14159;
      float x = vUv.x * 6.28318 + uTime * 0.025;
      float chevron = sin(x * 2.0 + abs(lat) * 3.5 + fbm(vec3(vUv * vec2(5.0, 9.0), uTime * 0.01)) * 2.5);
      surface *= 1.0 - 0.07 * smoothstep(0.2, 1.0, chevron) * cos(lat);
    }
    if (uPlanet == 7) {
      /* true colour (Irwin et al. 2024): the familiar deep blue came from
         contrast-enhanced Voyager images; the planet is a pale azure */
      float lum = dot(surface, vec3(0.299, 0.587, 0.114));
      surface = mix(surface, vec3(0.62, 0.8, 0.9) * (0.55 + lum * 0.8), 0.7);
      surface = neptuneWeather(surface, vUv);
    }
    else if (uPlanet == 6) surface = uranusWeather(surface, vUv);
    else if (uPlanet == 3) surface = marsDust(surface, vUv, p);
    else if (uPlanet == 5) surface = saturnPole(surface, vUv);
  }

  vec3 toSun = normalize(uSunPosition - vWorldPosition);
  vec3 vd = normalize(cameraPosition - vWorldPosition);
  float ndl = dot(normal, toSun);

  /* relief from the elevation map: tilt the normal by the height slope,
     so mountains and crater walls catch the light near the terminator */
  vec3 lit = normal;
  if (uHasHeight > 0.5) {
    float hE = texture2D(uHeight, vUv + vec2(uHeightTexel.x, 0.0)).r;
    float hW = texture2D(uHeight, vUv - vec2(uHeightTexel.x, 0.0)).r;
    float hN = texture2D(uHeight, vUv + vec2(0.0, uHeightTexel.y)).r;
    float hS = texture2D(uHeight, vUv - vec2(0.0, uHeightTexel.y)).r;
    /* texels narrow towards the poles: the same height step is steeper */
    float across = max(cos((vUv.y - 0.5) * 3.14159), 0.2);
    vec2 slope = vec2((hE - hW) / across, hN - hS) * uRelief;
    lit = normalize(normal - slope.x * normalize(vEast) - slope.y * normalize(vNorth));
  }
  /* close up (flying): fine relief and tone below the maps' resolution:
     rugged rock on Mercury and Mars, soft streaky cloud on the others */
  bool rocky = uPlanet == 0 || uPlanet == 3;
  vec3 close = closeDetail(p, rocky ? 0.6 : 0.0, rocky ? 1.0 : 5.0);
  surface *= 1.0 + close.y * (rocky ? 0.28 : 0.14) * (1.0 - 0.7 * streamedCover);
  /* slopes from camera-relative positions: world positions are too
     coarse in 32-bit floats for steps of a few hundred metres */
  lit = closeBumpWith(lit, dFdx(vViewPos) * mat3(viewMatrix), dFdy(vViewPos) * mat3(viewMatrix), close.x * vScale * (rocky ? 0.16 : 0.04));
  float ndlLit = dot(lit, toSun);

  /* soft terminator, a touch of wrap lighting for thick atmospheres */
  float wrap = (uType == 2 || uType == 3 || uPlanet == 1) ? 0.18 : 0.04;
  float light = clamp((ndlLit + wrap) / (1.0 + wrap), 0.0, 1.0);
  light = smoothstep(0.0, 1.0, light);
  /* relief never lights a slope past the real day/night line */
  if (uHasHeight > 0.5 || close.z > 0.0) light *= smoothstep(-0.12, 0.06, ndl);

  /* limb darkening on gas / ice giants */
  float facing = max(dot(normal, vd), 0.0);
  float limb = (uType == 2 || uType == 3 || uPlanet == 1) ? mix(0.62, 1.0, pow(facing, 0.5)) : 1.0;

  /* moon shadows: does a moon sit between this point and the Sun? */
  float shadow = 1.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uMoonCount) break;
    vec3 toMoon = uMoonPos[i] - vWorldPosition;
    float along = dot(toMoon, toSun);
    if (along > 0.0) {
      float miss = length(toMoon - toSun * along);
      shadow *= mix(0.12, 1.0, smoothstep(uMoonRadius[i] * 0.7, uMoonRadius[i] * 1.25, miss));
    }
  }

  /* ring shadow: where does the sunbeam cross the ring plane, and is
     there ring material there? (the Cassini Division lets light through) */
  if (uHasRings > 0.5) {
    float facingRing = dot(toSun, uRingNormal);
    if (abs(facingRing) > 0.0001) {
      float t = dot(uPlanetCenter - vWorldPosition, uRingNormal) / facingRing;
      if (t > 0.0) {
        float r = length(vWorldPosition + toSun * t - uPlanetCenter);
        float u = (r - uRingInner) / (uRingOuter - uRingInner);
        if (u > 0.0 && u < 1.0) {
          shadow *= 1.0 - texture2D(uRingMap, vec2(u, 0.5)).a * 0.82;
        }
      }
    }
  }

  /* Saturn reads warmer and richer (butterscotch, not grey) */
  if (uPlanet == 5) surface *= vec3(1.1, 1.0, 0.82);

  float rim = pow(1.0 - facing, 3.5);
  vec3 color = surface * (vec3(0.035) + light * shadow * 0.965 * uLight * uLightTint) * limb;
  /* Mars: thin dust suspended in the air softens the limb to a warm haze */
  if (uPlanet == 3) {
    color = mix(color, vec3(0.92, 0.66, 0.48) * light * uLight, pow(1.0 - facing, 2.4) * 0.42);
  }
  color += uAtmosphereColor * rim * light * (uType == 2 ? 0.20 : 0.45);

  gl_FragColor = vec4(max(color, vec3(0.003)), 1.0);

}`




/* ============================================================
   SOLAR SYSTEM COMPONENT
============================================================ */

export default function SolarSystem({
  progressRef,
}: {
  progressRef: RefObject<number>
}) {
  const spin = useRef<SpinState>({
    pending: 0,
    velocity: 0,
    dragging: false,
    hold: false,
  })

  useEffect(() => {
    let lastX = 0
    let lastTime = 0

    const blocked = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest(
        'button, a, .story-content, .return-content, .intro-content, .rail, .hud-top, .hotspot',
      )

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || blocked(event.target)) return
      if (focusedPlanetIndex(progressRef.current ?? 0) < 0) return
      spin.current.dragging = true
      spin.current.velocity = 0
      lastX = event.clientX
      lastTime = event.timeStamp
      document.documentElement.classList.add('is-spinning')
    }

    const onMove = (event: PointerEvent) => {
      if (!spin.current.dragging) return
      const dx = event.clientX - lastX
      const dt = Math.max(1, event.timeStamp - lastTime) / 1000
      const angle = dx * 0.008
      spin.current.pending += angle
      spin.current.velocity = angle / dt
      lastX = event.clientX
      lastTime = event.timeStamp
    }

    const onUp = () => {
      if (!spin.current.dragging) return
      spin.current.dragging = false
      document.documentElement.classList.remove('is-spinning')
    }

    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [progressRef])

  /* Milky Way finale (chapter 11): the whole Solar System shrinks to
     nothing, so the galaxy's "You are here" marker stands for it */
  const system = useRef<THREE.Group>(null)
  const systemScale = useRef(1)
  const smallBodies = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (!system.current) return
    const progress = progressRef.current ?? 0
    // tied to the pull-back itself: the whole system collapses to a point
    // as the camera flies out (and grows back if you scroll back)
    const local = progress - 11
    const inFinale = local >= 0 && local < 0.97
    const target = inFinale
      ? Math.max(0.0001, Math.pow(1 - THREE.MathUtils.clamp(local / 0.16, 0, 1), 3))
      : 1
    systemScale.current +=
      (target - systemScale.current) * (1 - Math.exp(-delta * 6))
    const scale = Math.max(0.0001, systemScale.current)
    system.current.scale.setScalar(scale)
    system.current.visible = scale > 0.002
    system.current.position.copy(SYSTEM_OFFSET)
    // the comet is illustrative, drawn for the journey only
    if (smallBodies.current) smallBodies.current.visible = !layout.trueScale
  })

  return (
    <group ref={system} position={SYSTEM_BASE}>
      <group position={[-SYSTEM_BASE.x, -SYSTEM_BASE.y, -SYSTEM_BASE.z]}>
      <Sun />

      {PLANETS.map((planet, index) => (
        <Planet
          key={planet.name}
          planet={planet}
          index={index}
          progressRef={progressRef}
          spin={spin}
        />
      ))}

      <group position={SYSTEM_BASE}>
        <Belts />
      </group>
      <group ref={smallBodies} position={SYSTEM_BASE}>
        <Comet />
      </group>
      <Asteroids />
      </group>
    </group>
  )
}

/* ============================================================
   THE LARGEST ASTEROIDS (flying only)
   Ceres, Vesta, Pallas and Hygiea at their real positions (JPL orbits)
   and true sizes, turning at their real rates. No maps of them are
   bundled, so each is a grey world shaped from noise: Ceres nearly round,
   Vesta battered, with a great basin at its south pole (Rheasilvia).
============================================================ */

const ASTEROID_DAY_HOURS = [9.07, 5.34, 7.81, 13.83]
const _asteroidWorld = new THREE.Vector3()

function asteroidGeometry(lumpiness: number, seed: number, basin: boolean) {
  const geometry = new THREE.IcosahedronGeometry(1, 6)
  const position = geometry.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  const wave = (p: THREE.Vector3, f: number, k: number) =>
    Math.sin(p.x * f + k) * Math.sin(p.y * f * 1.3 + k * 1.7) * Math.sin(p.z * f * 0.9 + k * 2.3)
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i).normalize()
    let r = 1 + lumpiness * (wave(v, 2.1, seed) * 0.6 + wave(v, 4.7, seed * 1.9) * 0.3 + wave(v, 11, seed * 3.1) * 0.1)
    // small craters, everywhere
    r -= 0.012 * Math.max(0, wave(v, 23, seed * 0.7)) ** 3
    if (basin) {
      // Rheasilvia: a basin 500 km across, nearly the width of Vesta
      const south = Math.max(0, -v.y - 0.45) / 0.55
      r -= 0.12 * south * south * (1 - 0.6 * south)
    }
    position.setXYZ(i, v.x * r, v.y * r, v.z * r)
  }
  geometry.computeVertexNormals()
  return geometry
}

function Asteroids() {
  const camera = useThree((state) => state.camera)
  const groups = useRef<(THREE.Group | null)[]>([])
  const spins = useRef<(THREE.Mesh | null)[]>([])
  const shapes = useMemo(
    () => SMALL_BODIES.map((body, i) => asteroidGeometry(body.lumpiness, 1.3 + i * 2.7, body.name === 'Vesta')),
    [],
  )
  const materials = useMemo(
    () => SMALL_BODIES.map((body) => new THREE.MeshStandardMaterial({ color: body.color, roughness: 0.96, metalness: 0 })),
    [],
  )
  useEffect(
    () => () => {
      shapes.forEach((shape) => shape.dispose())
      materials.forEach((material) => material.dispose())
    },
    [shapes, materials],
  )
  useFrame(() => {
    SMALL_BODIES.forEach((_, i) => {
      const group = groups.current[i]
      if (!group) return
      group.visible = layout.trueScale
      if (!group.visible) return
      getSmallBodyOrbitPosition(i, simClock.jd, _scratchOrbitPos)
      const radius = getBodyRadius(PLANETS.length + i)
      // far away: drawn nearer and smaller, along the same line
      _asteroidWorld.copy(_scratchOrbitPos).add(SYSTEM_OFFSET)
      const far = farScale(_asteroidWorld.distanceTo(camera.position))
      if (far < 1) _asteroidWorld.sub(camera.position).multiplyScalar(far).add(camera.position)
      group.position.copy(_asteroidWorld).sub(SYSTEM_OFFSET)
      group.scale.setScalar(radius * far)
      const spin = spins.current[i]
      if (spin) spin.rotation.y = ((simClock.bodyJd * 24) / ASTEROID_DAY_HOURS[i]) * Math.PI * 2
    })
  })
  return (
    <group position={SYSTEM_BASE}>
      {SMALL_BODIES.map((body, i) => (
        <group
          key={body.name}
          ref={(group) => {
            groups.current[i] = group
          }}
          visible={false}
        >
          <mesh
            ref={(mesh) => {
              spins.current[i] = mesh
            }}
            geometry={shapes[i]}
            material={materials[i]}
          />
        </group>
      ))}
    </group>
  )
}

/* ============================================================
   SUN
============================================================ */

function Sun() {
  const sunGroup = useRef<THREE.Group>(null)
  const camera = useThree((state) => state.camera)
  const sun = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.ShaderMaterial>(null)
  const timeRef = useRef(0)

  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])

  useFrame((_, delta) => {
    const time = (timeRef.current += delta)

    if (material.current) {
      material.current.uniforms.uTime.value = time
    }

    if (sun.current) {
      // the Sun rotates about once every 25 days; here, slowly and visibly
      sun.current.rotation.y += delta * 0.012
    }

    // flying, at true scale: 109 Earths wide, drawn nearer when far
    const group = sunGroup.current
    if (group) {
      let size = 1
      group.position.copy(SYSTEM_BASE)
      if (layout.trueScale) {
        const far = farScale(SYSTEM_OFFSET.distanceTo(camera.position))
        size = SUN_TRUE_RADIUS * far
        // drawn at camera + (Sun - camera) * far: an offset from where it is
        group.position.add(_sunCamera.copy(camera.position).sub(SYSTEM_OFFSET).multiplyScalar(1 - far))
      }
      group.scale.setScalar(size)
    }
  })

  return (
    <group ref={sunGroup} position={SYSTEM_BASE}>
      <mesh ref={sun}>
        <sphereGeometry args={[1, 128, 128]} />
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          vertexShader={SUN_VERTEX_SHADER}
          fragmentShader={SUN_FRAGMENT_SHADER}
          toneMapped={false}
          depthWrite
        />
      </mesh>

      <Corona />
      <FlightGlare />
      <Prominences />

      <pointLight
        color="#fff0d0"
        intensity={2.2}
        distance={0}
        decay={0}
      />
    </group>
  )
}

/* Flying, at true scale, the Sun is half a degree across, as it is from
   Earth: too small for its corona to show, yet it should dazzle. This
   glare has a fixed apparent size (some 12 degrees of soft halo round a
   white-hot core), drawn at the Sun's distance, so planets in front of
   the Sun still hide it. */
const FLIGHT_GLARE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const FLIGHT_GLARE_FRAGMENT = /* glsl */ `
uniform float uOpacity;
uniform float uBurst;
varying vec2 vUv;
void main() {
  vec2 q = vUv - 0.5;
  float r = length(q) * 2.0;
  float glow = pow(max(1.0 - r, 0.0), 4.0) * 0.55 + exp(-r * 22.0) * 3.0;
  /* the Sun breaking over a planet's limb: a starburst of rays */
  float angle = atan(q.y, q.x);
  float rays = pow(abs(cos(angle * 3.0)), 60.0) + pow(abs(cos(angle * 3.0 + 0.52)), 140.0) * 0.6;
  glow += uBurst * rays * exp(-r * 3.2) * 2.2 + uBurst * exp(-r * 6.0) * 1.2;
  vec3 color = mix(vec3(1.0, 0.74, 0.48), vec3(1.0, 0.97, 0.92), exp(-r * 9.0));
  gl_FragColor = vec4(color * glow * uOpacity, 1.0);
}`
const _glareWorld = new THREE.Vector3()
const _glareScale = new THREE.Vector3()

function FlightGlare() {
  const mesh = useRef<THREE.Mesh>(null)
  const camera = useThree((state) => state.camera)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uOpacity: { value: 0 }, uBurst: { value: 0 } },
        vertexShader: FLIGHT_GLARE_VERTEX,
        fragmentShader: FLIGHT_GLARE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useFrame((_, delta) => {
    const glare = mesh.current
    if (!glare) return
    // hidden behind a planet, breaking out in a burst at its limb
    const seen = layout.trueScale ? sunVisibility(camera.position) : 0
    const fromSunAU = SYSTEM_OFFSET.distanceTo(camera.position) / AU_UNITS
    const target = layout.trueScale ? Math.max(seen, 0.0) * Math.min(1, 6 * Math.max(fromSunAU, 1e-3) ** -0.5) : 0
    material.uniforms.uOpacity.value += (target - material.uniforms.uOpacity.value) * (1 - Math.exp(-delta * 8))
    material.uniforms.uBurst.value = layout.trueScale ? Math.pow(Math.sin(Math.PI * Math.min(seen, 1)), 0.7) * (seen < 0.999 ? 1 : 0) : 0
    glare.visible = material.uniforms.uOpacity.value > 0.01
    if (!glare.visible) return
    glare.lookAt(camera.position)
    // 12 degrees wide at the distance it is drawn, in the Sun group's units
    glare.parent?.getWorldPosition(_glareWorld)
    glare.parent?.getWorldScale(_glareScale)
    // from far out the Sun becomes a star: its glare shrinks and dims
    const fromSun = SYSTEM_OFFSET.distanceTo(camera.position) / AU_UNITS
    const shrink = THREE.MathUtils.clamp(Math.max(fromSun, 1e-3) ** -0.5, 0.004, 1)
    const width = 2 * Math.tan(THREE.MathUtils.degToRad(6)) * _glareWorld.distanceTo(camera.position) * shrink
    glare.scale.setScalar(width / Math.max(_glareScale.x, 1e-9))
  })
  return (
    <mesh ref={mesh} material={material} renderOrder={-1} visible={false}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}

/* Prominences: seen at the Sun's edge, loops and flames of glowing gas
   rising tens of thousands of km above the surface, red-pink in the light
   of hydrogen. A shell a little larger than the Sun; for each line of
   sight that grazes the limb, how high it passes decides the glow, and
   twisting filaments of noise give the shapes. Flying only (the true-size
   Sun), and brightest close up. */
const PROMINENCE_VERTEX = /* glsl */ `
varying vec3 vWorld; varying vec3 vCenter; varying float vRadius;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vRadius = length(modelMatrix[0].xyz) / 1.18;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const PROMINENCE_FRAGMENT = /* glsl */ `
uniform float uTime; uniform float uOpacity;
varying vec3 vWorld; varying vec3 vCenter; varying float vRadius;
float pHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float pNoise(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mix(pHash(i), pHash(i + vec3(1,0,0)), f.x), mix(pHash(i + vec3(0,1,0)), pHash(i + vec3(1,1,0)), f.x), f.y), mix(mix(pHash(i + vec3(0,0,1)), pHash(i + vec3(1,0,1)), f.x), mix(pHash(i + vec3(0,1,1)), pHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
void main() {
  vec3 ray = normalize(vWorld - cameraPosition);
  vec3 oc = vCenter - cameraPosition;
  float t = max(dot(oc, ray), 0.0);
  vec3 closest = ray * t - oc;
  float height = length(closest) / vRadius - 1.0;
  if (height < 0.0) discard; // in front of the disc: the disc shows instead
  vec3 d = normalize(closest);
  // where prominences stand: a few regions round the limb
  float region = smoothstep(0.55, 0.8, pNoise(d * 3.0 + 7.1));
  // their height: tall arches in places, low spicule fringe everywhere
  float tall = 0.02 + 0.12 * pNoise(d * 6.0 + 2.3) * region;
  float shape = pNoise(vec3(d * 22.0) + vec3(0.0, height * 18.0, uTime * 0.02));
  float threads = pow(1.0 - abs(2.0 * pNoise(d * 60.0 + vec3(height * 40.0, 0.0, uTime * 0.03)) - 1.0), 6.0);
  float flame = smoothstep(0.45, 0.85, shape) * (0.4 + 0.6 * threads) * (1.0 - smoothstep(tall * 0.4, tall, height));
  float fringe = (1.0 - smoothstep(0.0, 0.012, height)) * 0.8;
  float glow = (flame * region * 1.6 + fringe) * uOpacity;
  vec3 color = mix(vec3(1.0, 0.25, 0.32), vec3(1.0, 0.55, 0.45), threads);
  gl_FragColor = vec4(color * glow, 1.0);
}`

function Prominences() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
        vertexShader: PROMINENCE_VERTEX,
        fragmentShader: PROMINENCE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  const mesh = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta
    const target = layout.trueScale ? 1 : 0
    material.uniforms.uOpacity.value += (target - material.uniforms.uOpacity.value) * (1 - Math.exp(-delta * 2))
    if (mesh.current) mesh.current.visible = material.uniforms.uOpacity.value > 0.01
  })
  return (
    <mesh ref={mesh} scale={1.18} material={material} visible={false}>
      <sphereGeometry args={[1, 96, 64]} />
    </mesh>
  )
}

/* Corona: a camera-facing glow with faint radiating streamers, drawn
   behind the Sun's disc. It fades out when the camera is close so it
   never washes over a planet in focus. */
const CORONA_SIZE = 6.4 // in Sun radii, edge to edge

const CORONA_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const CORONA_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uHalf;
varying vec2 vUv;

float hash1(float n) { return fract(sin(n) * 43758.5453); }
float noise2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash1(i.x + i.y * 57.0), b = hash1(i.x + 1.0 + i.y * 57.0);
  float c = hash1(i.x + (i.y + 1.0) * 57.0), d = hash1(i.x + 1.0 + (i.y + 1.0) * 57.0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/* Prominences: loops of glowing plasma standing on the limb. Each one
   rises, lives for a minute or two and fades, and a new one appears
   somewhere else. Shape: a thin, filamentary arch between two footpoints. */
float prominences(float r, float a) {
  float z = r - 1.0;
  if (z < 0.0) return 0.0;
  float total = 0.0;
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    float life = uTime * 0.009 + hash1(fk * 7.13);
    float cycle = floor(life);
    float phase = fract(life);
    float seed = fk * 13.7 + cycle * 3.1;
    float at = hash1(seed) * 6.28318;
    float halfWidth = mix(0.08, 0.2, hash1(seed + 1.0));
    float height = mix(0.05, 0.17, hash1(seed + 2.0)) * (0.55 + 0.45 * phase);
    float da = mod(a - at + 3.14159, 6.28318) - 3.14159;
    vec2 q = vec2(da * r / halfWidth, z / height);
    /* lean and wobble: no two loops alike, none a perfect arch */
    q.x += q.y * (hash1(seed + 3.0) - 0.5) * 1.2;
    q += (vec2(noise2(q * 2.3 + seed + uTime * 0.05), noise2(q * 2.3 - seed)) - 0.5) * 0.35;
    float e = length(q);
    float along = atan(q.y, q.x);
    float threads = pow(noise2(vec2(along * 11.0 + seed, uTime * 0.1 + e * 6.0)), 1.6)
      * (0.6 + 0.4 * noise2(vec2(along * 3.0 - seed, uTime * 0.04)));
    float arch = 1.0 - smoothstep(0.0, 0.11, abs(e - 1.0));
    float veil = (1.0 - smoothstep(0.5, 1.0, e)) * 0.1 * noise2(q * 5.0 + seed);
    float alive = sin(phase * 3.14159);
    total += (arch * threads * 1.6 + veil) * alive * smoothstep(0.0, 0.015, z);
  }
  return total;
}

void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float r = length(c) * uHalf; // distance from the centre, in Sun radii
  float a = atan(c.y, c.x);
  float t = uTime * 0.04;

  float streamers = 0.55
    + 0.25 * sin(a * 5.0 + 1.3 + t)
    + 0.14 * sin(a * 11.0 - t * 1.7)
    + 0.08 * sin(a * 23.0 + t * 0.6);

  float above = max(r - 1.0, 0.0);
  float glow = exp(-above * 3.4) * 0.55 + exp(-above * 1.0) * 0.16 * streamers;
  glow *= 1.0 - smoothstep(uHalf * 0.72, uHalf, r);

  /* hydrogen-alpha red, as prominences look at the solar limb */
  vec3 plasma = vec3(1.0, 0.3, 0.16) * prominences(r, a) * 1.5;

  gl_FragColor = vec4((vec3(1.0, 0.68, 0.34) * glow + plasma) * uOpacity, 1.0);
}`

function Corona() {
  const mesh = useRef<THREE.Mesh>(null)
  const camera = useThree((state) => state.camera)

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 1 },
          uHalf: { value: CORONA_SIZE / 2 },
        },
        vertexShader: CORONA_VERTEX,
        fragmentShader: CORONA_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )

  useEffect(() => () => material.dispose(), [material])

  useFrame((_, delta) => {
    if (!mesh.current) return
    // face the camera itself (not just its viewing direction), so the glow
    // plane stays behind the Sun's disc even when the Sun is off-centre
    mesh.current.lookAt(camera.position)
    material.uniforms.uTime.value += delta
    const distance = camera.position.distanceTo(SYSTEM_OFFSET)
    const fade = THREE.MathUtils.clamp((distance - 3.5) / 5, 0, 1)
    material.uniforms.uOpacity.value = fade
    mesh.current.visible = fade > 0.01
  })

  return (
    <mesh ref={mesh} material={material} renderOrder={-1}>
      <planeGeometry args={[CORONA_SIZE, CORONA_SIZE]} />
    </mesh>
  )
}

/* ============================================================
   RIM RAYS
   In the backlit hero shots (Venus, Earth, Saturn) the Sun sits just
   behind the planet: soft rays of light fan out from its rim, strongest
   on the Sun's side. A camera-facing glow behind the planet (the planet
   itself hides the inner part); fades in with the backlit drift.
============================================================ */

const RIM_RAYS: Record<number, string> = {
  1: '#ffe0b0', // Venus: thick, golden haze
  2: '#cfe3ff', // Earth: blue-white
  5: '#ffe6c4', // Saturn: pale gold
}
const RIM_RAYS_SIZE = 7 // plane width in planet radii

const RIM_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const RIM_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec2 uSun;
uniform float uStrength;
uniform float uTime;
varying vec2 vUv;
float rimHash(float n) { return fract(sin(n) * 43758.5453); }
float rimNoise(float x) {
  float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(rimHash(i), rimHash(i + 1.0), f);
}
void main() {
  vec2 c = (vUv * 2.0 - 1.0) * ${(RIM_RAYS_SIZE / 2).toFixed(1)};
  float r = length(c);
  float above = r - 1.0;
  if (above < 0.0) discard;
  vec2 radial = c / r;
  float a = atan(c.y, c.x);
  /* stronger towards the Sun, a faint ring all round */
  float sunward = pow(max(dot(radial, uSun), 0.0), 2.0);
  float weight = 0.06 + 0.94 * sunward;
  /* fine streaks of differing length, drifting very slowly */
  float streaks = pow(rimNoise(a * 34.0 + uTime * 0.02), 2.0) * 0.7
    + pow(rimNoise(a * 91.0 - uTime * 0.015 + 13.0), 3.0) * 0.5;
  float reach = 0.12 + 0.45 * rimNoise(a * 17.0 + 5.0);
  float rays = streaks * exp(-above / reach);
  float halo = exp(-above / 0.06);
  /* gone well before the plane's edge */
  float edge = 1.0 - smoothstep(1.0, 2.6, r);
  float glow = (rays * 0.16 + halo * 0.22) * weight * edge * uStrength;
  gl_FragColor = vec4(uColor * glow, 1.0);
}`

const _rimSun = new THREE.Vector3()
const _rimCenter = new THREE.Vector3()
const _rimRight = new THREE.Vector3()
const _rimUp = new THREE.Vector3()

function RimRays({
  index,
  radius,
  progressRef,
}: {
  index: number
  radius: number
  progressRef: RefObject<number>
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const camera = useThree((state) => state.camera)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(RIM_RAYS[index] ?? '#ffffff') },
          uSun: { value: new THREE.Vector2(1, 0) },
          uStrength: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: RIM_VERTEX,
        fragmentShader: RIM_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [index],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame((_, delta) => {
    const plane = mesh.current
    if (!plane) return
    // only for the planet that is the subject of the current chapter
    const chapter = Math.floor(progressRef.current ?? 0)
    const strength = chapter - 2 === index ? lens.backlit : 0
    material.uniforms.uStrength.value = strength
    plane.visible = strength > 0.01
    if (!plane.visible) return
    material.uniforms.uTime.value += delta
    plane.lookAt(camera.position)
    // the Sun's direction, in the plane's own right/up axes
    plane.getWorldPosition(_rimCenter)
    _rimSun.copy(SYSTEM_OFFSET).sub(_rimCenter)
    plane.updateMatrixWorld()
    _rimRight.setFromMatrixColumn(plane.matrixWorld, 0).normalize()
    _rimUp.setFromMatrixColumn(plane.matrixWorld, 1).normalize()
    material.uniforms.uSun.value
      .set(_rimSun.dot(_rimRight), _rimSun.dot(_rimUp))
      .normalize()
  })

  return (
    <mesh ref={mesh} material={material} scale={radius} renderOrder={-1} visible={false}>
      <planeGeometry args={[RIM_RAYS_SIZE, RIM_RAYS_SIZE]} />
    </mesh>
  )
}

/* ============================================================
   PLANET
============================================================ */

function Planet({
  planet,
  index,
  progressRef,
  spin,
}: {
  spin: RefObject<SpinState>
  planet: (typeof PLANETS)[number]
  index: number
  progressRef: RefObject<number>
}) {
  const orbit = useRef<THREE.Group>(null)
  const body = useRef<THREE.Mesh>(null)
  const timeRef = useRef(0)
  const focusScale = useRef(1)
  const lastSpinJd = useRef(0)
  const { gl } = useThree()
  // sharper maps once the camera has arrived (desktop only)
  const sharp = useSharpFocus(progressRef, index, FOCUS_IN)
  useSurfacePatches(index, body, SYSTEM_OFFSET)
  // Mars's turning frame, for the rover standing on it
  useEffect(() => {
    if (index === 3) bodyFrames[3] = body.current
  })
  /* the Sun's position for this planet's shaders: the Sun itself, or,
     when the planet is drawn nearer than it is (far, at true scale), the
     Sun moved with it, so its light still falls from the true direction */
  const planetSun = useMemo(() => SYSTEM_OFFSET.clone(), [])
  const sharpMap = useSharpTexture(SHARP_PLANET_MAPS[index], sharp, {
    colorSpace: THREE.NoColorSpace,
  })
  const sharpDay = useSharpTexture(
    index === 2 ? SHARP_EARTH_MAPS.day : undefined,
    sharp,
    { colorSpace: THREE.SRGBColorSpace, anisotropy: 16 },
  )
  const sharpClouds = useSharpTexture(
    index === 2 ? SHARP_EARTH_MAPS.clouds : undefined,
    sharp,
    { colorSpace: THREE.NoColorSpace },
  )
  const sharpNight = useSharpTexture(
    index === 2 ? SHARP_EARTH_MAPS.night : undefined,
    sharp,
    { colorSpace: THREE.SRGBColorSpace },
  )
  const baseMap = useRef<THREE.Texture | null>(null)
  const atmosphereMesh = useRef<THREE.Mesh>(null)

  const visualRadius = getPlanetVisualRadius(index)
  // sunlight here: dimmer and cooler with distance from the Sun
  const sunlight = useMemo(() => getPlanetSunlight(index), [index])

  // real spin axis (IAU pole), so tilt, seasons and ring angle are true
  const poleQuaternion = useMemo(() => getPlanetPoleQuaternion(index), [index])
  // Earth: rotation added by dragging, on top of its true orientation
  const userSpin = useRef(0)
  const lastTrueSpin = useRef(0)
  const planetType =
    planet.type === 'earth'
      ? 1
      : planet.type === 'gas'
        ? 2
        : planet.type === 'ice'
          ? 3
          : 0

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uType: { value: planetType },
      uPlanet: { value: index },
      uBaseColor: { value: new THREE.Color(planet.baseColor) },
      uAtmosphereColor: {
        value: new THREE.Color(
          planet.atmosphereColor ?? planet.baseColor,
        ),
      },
      uSunPosition: { value: planetSun },
      uMap: { value: null as THREE.Texture | null },
      uHasMap: { value: 0 },
      // sunlight at this distance
      uLight: { value: sunlight.strength },
      uLightTint: { value: sunlight.tint },
      // shadows
      uMoonPos: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) },
      uMoonRadius: { value: [0, 0, 0, 0] },
      uMoonCount: { value: 0 },
      uHasRings: { value: planet.name === 'Saturn' ? 1 : 0 },
      uRingMap: { value: null as THREE.Texture | null },
      uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
      uPlanetCenter: { value: new THREE.Vector3() },
      uRingInner: { value: 0 },
      uRingOuter: { value: 0 },
      // surface relief (Mercury, Mars)
      uHeight: { value: null as THREE.Texture | null },
      uHasHeight: { value: 0 },
      uRelief: { value: RELIEF[index]?.strength ?? 0 },
      uHeightTexel: { value: new THREE.Vector2(1 / 1024, 1 / 512) },
      // streamed imagery while flying low (shared by all planets)
      ...surfacePatch,
      // the cut under the landing ground
      ...groundHole,
    }),
    [planet, planetType, index, sunlight],
  )

  /* Built here rather than as <shaderMaterial uniforms={...}>: React Three
     Fiber copies a uniforms prop into objects of its own, so everything
     written to `uniforms` later (the surface map, time, moon and ring
     shadows) would never reach the shader. */
  const planetMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: PLANET_VERTEX_SHADER,
        fragmentShader: PLANET_FRAGMENT_SHADER,
        toneMapped: false,
      }),
    [uniforms],
  )
  useEffect(() => () => planetMaterial.dispose(), [planetMaterial])

  const atmosphereUniforms = useMemo(() => {
    const look = ATMOSPHERE_LOOK[planet.name] ?? {
      color: planet.atmosphereColor ?? '#000000',
      dusk: planet.atmosphereColor ?? '#000000',
      intensity: 0.35,
      thickness: 0,
    }
    return {
      uColor: { value: new THREE.Color(look.color) },
      uDusk: { value: new THREE.Color(look.dusk) },
      uIntensity: { value: look.intensity },
      uThickness: { value: look.thickness },
      uSunPosition: { value: planetSun },
      uLight: { value: sunlight.strength },
      uShell: { value: ATMOSPHERE_SHELL[planet.name] ?? 1.055 },
      uAirglow: { value: planet.name === 'Earth' ? 1 : 0 },
      uGroundSky: { value: 0 },
    }
  }, [planet, sunlight])

  useEffect(() => {
    let disposed = false
    let loadedTexture: THREE.Texture | null = null
    // Local equirectangular maps (Solar System Scope, CC BY 4.0).
    // Earth has its own material, so it has no entry here.
    const url = PLANET_TEXTURES[index]

    if (!url) {
      uniforms.uMap.value = null
      uniforms.uHasMap.value = 0
      return () => {
        disposed = true
      }
    }

    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')

    loader.load(
      url,
      (loaded) => {
        if (disposed) {
          loaded.dispose()
          return
        }

        // The shader writes colour straight to the screen without a
        // linear-to-sRGB step, so the map's raw sRGB values are used as-is
        loaded.colorSpace = THREE.NoColorSpace
        loaded.wrapS = THREE.RepeatWrapping
        loaded.wrapT = THREE.ClampToEdgeWrapping
        loaded.anisotropy = Math.min(
          8,
          gl.capabilities.getMaxAnisotropy(),
        )
        loaded.needsUpdate = true

        baseMap.current = loaded
        // a sharp map may already be in place: it stays until released
        if (!uniforms.uHasMap.value || uniforms.uMap.value === null) {
          uniforms.uMap.value = loaded
        }
        uniforms.uHasMap.value = 1
        loadedTexture = loaded
      },
      undefined,
      () => {
        if (!disposed) {
          uniforms.uMap.value = null
          uniforms.uHasMap.value = 0
        }
      },
    )

    return () => {
      disposed = true

      if (loadedTexture) {
        loadedTexture.dispose()
      }

      baseMap.current = null
      uniforms.uMap.value = null
      uniforms.uHasMap.value = 0
    }
  }, [gl, index, uniforms])

  // elevation map for relief shading
  useEffect(() => {
    const relief = RELIEF[index]
    if (!relief) return
    let disposed = false
    let owned: THREE.Texture | null = null
    new THREE.TextureLoader().load(relief.url, (texture) => {
      if (disposed) {
        texture.dispose()
        return
      }
      texture.colorSpace = THREE.NoColorSpace
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.ClampToEdgeWrapping
      const image = texture.image as { width: number; height: number }
      uniforms.uHeightTexel.value.set(1 / image.width, 1 / image.height)
      uniforms.uHeight.value = texture
      uniforms.uHasHeight.value = 1
      owned = texture
    })
    return () => {
      disposed = true
      uniforms.uHasHeight.value = 0
      uniforms.uHeight.value = null
      owned?.dispose()
    }
  }, [index, uniforms])

  // swap the sharp map in, and the 2K map back when it is released
  useEffect(() => {
    const map = sharpMap ?? baseMap.current
    if (!map) return
    uniforms.uMap.value = map
    uniforms.uHasMap.value = 1
  }, [sharpMap, uniforms])

  const [earthMap, setEarthMap] =
    useState<THREE.Texture | null>(null)
  const [earthClouds, setEarthClouds] =
    useState<THREE.Texture | null>(null)
  const [earthNormal, setEarthNormal] =
    useState<THREE.Texture | null>(null)
  const [earthSpecular, setEarthSpecular] =
    useState<THREE.Texture | null>(null)
  const [earthLights, setEarthLights] =
    useState<THREE.Texture | null>(null)
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    if (planet.name !== 'Earth') {
      setEarthMap(null)
      setEarthClouds(null)
      setEarthNormal(null)
      setEarthSpecular(null)
      setEarthLights(null)
      return
    }

    let cancelled = false
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    const owned: THREE.Texture[] = []

    const loadLocal = (
      url: string,
      colorTexture: boolean,
      onLoaded: (value: THREE.Texture) => void,
    ) => {
      loader.load(url, (loaded) => {
        if (cancelled) {
          loaded.dispose()
          return
        }

        loaded.colorSpace = colorTexture
          ? THREE.SRGBColorSpace
          : THREE.NoColorSpace
        loaded.wrapS = THREE.RepeatWrapping
        loaded.wrapT = THREE.ClampToEdgeWrapping
        loaded.anisotropy = Math.min(
          16,
          gl.capabilities.getMaxAnisotropy(),
        )
        loaded.needsUpdate = true
        owned.push(loaded)
        onLoaded(loaded)
      })
    }

    loadLocal(EARTH_LOCAL_TEXTURES.color, true, setEarthMap)
    loadLocal(EARTH_LOCAL_TEXTURES.clouds, false, setEarthClouds)
    loadLocal(EARTH_LOCAL_TEXTURES.normal, false, setEarthNormal)
    loadLocal(
      EARTH_LOCAL_TEXTURES.specular,
      false,
      setEarthSpecular,
    )
    loadLocal(EARTH_LOCAL_TEXTURES.night, true, setEarthLights)

    return () => {
      cancelled = true
      owned.forEach((asset) => asset.dispose())
      setEarthMap(null)
      setEarthClouds(null)
      setEarthNormal(null)
      setEarthSpecular(null)
      setEarthLights(null)
    }
  }, [gl, planet.name])

  const rotationSpeed =
    (24 / planet.rotationPeriodHours) * 0.12 // negative = retrograde (Venus, Uranus)

  /* Orbit trail: a fading arc of the real orbit behind the planet,
     recomputed each frame as the planet moves */
  const orbitLine = useMemo(() => {
    const positions = new Float32Array(TRAIL_POINTS * 3)
    const fade = new Float32Array(TRAIL_POINTS)
    for (let i = 0; i < TRAIL_POINTS; i += 1) {
      fade[i] = Math.pow(1 - i / (TRAIL_POINTS - 1), 1.7)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aFade', new THREE.BufferAttribute(fade, 1))

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: {
          value: new THREE.Color(planet.atmosphereColor ?? planet.baseColor).lerp(
            new THREE.Color('#ffffff'),
            0.45,
          ),
        },
        uOpacity: { value: 0.5 },
      },
      vertexShader: TRAIL_VERTEX,
      fragmentShader: TRAIL_FRAGMENT,
      transparent: true,
      depthWrite: false,
    })

    const line = new THREE.Line(geometry, material)
    line.frustumCulled = false
    return line
  }, [index, planet])

  useEffect(() => {
    return () => {
      orbitLine.geometry.dispose()
      orbitLine.material.dispose()
    }
  }, [orbitLine])

  useFrame((_, delta) => {
    if (!orbit.current || !body.current) return

    const time = (timeRef.current += delta)
    const journeyProgress = progressRef.current ?? 0
    const safeProgress = Number.isFinite(journeyProgress)
      ? THREE.MathUtils.clamp(
          journeyProgress,
          0,
          12.999999,
        )
      : 0

    // real position on the real orbit at the simulated date
    getPlanetOrbitPosition(index, simClock.jd, _scratchOrbitPos)
    orbit.current.position.copy(_scratchOrbitPos)
    // at true scale (flying), a far planet is drawn nearer and smaller,
    // along the same line of sight
    let far = 1
    if (layout.trueScale) {
      _farWorld.copy(_scratchOrbitPos).add(SYSTEM_OFFSET)
      far = farScale(_farWorld.distanceTo(camera.position))
      if (far < 1) {
        _farWorld.sub(camera.position).multiplyScalar(far).add(camera.position)
        orbit.current.position.copy(_farWorld).sub(SYSTEM_OFFSET)
      }
    }
    planetSun.copy(SYSTEM_OFFSET).add(orbit.current.position).sub(_scratchOrbitPos)
    if (atmosphereMesh.current) {
      const atmosphere = (atmosphereMesh.current.material as THREE.ShaderMaterial).uniforms
      atmosphere.uSunPosition.value = planetSun
      // low over this world's ground, its sky lights up (fading out by
      // 60 km up on Earth, 40 km on Mars)
      const low = pilot.active && pilot.nearestIndex === index && pilot.altitudeKm >= 0
      const top = planet.name === 'Earth' ? 60 : 40
      if (atmosphere.uGroundSky) {
        atmosphere.uGroundSky.value = low ? 1 - THREE.MathUtils.smoothstep(pilot.altitudeKm, top * 0.15, top) : 0
      }
    }

    // Focus: while one planet is the subject, the others shrink to distant
    // dots so oversized outer planets never loom behind a close-up
    const chapter = Math.floor(safeProgress)
    // which planet is the subject: the close-up's planet, or Earth for the
    // Pale Blue Dot (chapter 10); the others become points of light
    const subject =
      chapter >= 2 && chapter <= 9 ? chapter - 2 : chapter === 10 ? 2 : -1
    // In the Sun chapter the Sun is the subject: giants step back too
    const sunFocus = chapter === 1 && index >= 4
    // flying, every planet is its true size
    const targetScale = pilot.active
      ? 1
      : sunFocus
      ? 0.35
      : subject < 0 || subject === index
        ? 1
        : 0.04 // a point of light, like a planet seen from another planet
    focusScale.current +=
      (targetScale - focusScale.current) * (1 - Math.exp(-delta * 3))
    orbit.current.scale.setScalar(focusScale.current * far)

    // trail: arc of the real orbit behind the planet, fading to nothing
    const trailPositions = orbitLine.geometry.attributes.position as THREE.BufferAttribute
    const headE = getPlanetEccentricAnomaly(index, simClock.jd)
    for (let i = 0; i < TRAIL_POINTS; i += 1) {
      const E = headE - (i / (TRAIL_POINTS - 1)) * TRAIL_SPAN
      getPlanetOrbitEllipsePoint(index, E, simClock.jd, _trailPoint)
      trailPositions.setXYZ(i, _trailPoint.x, _trailPoint.y, _trailPoint.z)
    }
    trailPositions.needsUpdate = true

    // almost invisible while a planet is in focus, so trails never streak across it
    const inPlanetChapter = safeProgress >= 2.1 && safeProgress < 10
    const trailOpacity = (orbitLine.material as THREE.ShaderMaterial).uniforms.uOpacity
    // orbit trails are a diagram: none while flying among the real thing
    const targetOpacity = pilot.active ? 0 : inPlanetChapter ? 0.012 : 0.5
    trailOpacity.value +=
      (targetOpacity - trailOpacity.value) * (1 - Math.exp(-delta * 4))

    if (materialIsShader(body.current.material)) {
      body.current.material.uniforms.uTime.value = time
    }

    // drag to spin: only the planet in focus responds
    const spinState = spin.current
    const isFocused = focusedPlanetIndex(safeProgress) === index
    const held = isFocused && !!spinState?.hold

    // ring-shadow geometry in world space (follows tilt, orbit and focus scale)
    if (uniforms.uHasRings.value > 0.5) {
      body.current.updateWorldMatrix(true, false)
      body.current.getWorldPosition(uniforms.uPlanetCenter.value)
      const e = body.current.matrixWorld.elements
      const worldRadius = Math.hypot(e[0], e[1], e[2])
      uniforms.uRingNormal.value.set(e[4], e[5], e[6]).normalize()
      uniforms.uRingInner.value = worldRadius * SATURN_RING_INNER
      uniforms.uRingOuter.value = worldRadius * SATURN_RING_OUTER
      // for flying through them
      ringState.center.copy(uniforms.uPlanetCenter.value)
      ringState.normal.copy(uniforms.uRingNormal.value)
      ringState.radius = worldRadius
      ringState.ready = true
    }

    // keep the Sun direction (in view space) current for Earth's night mask
    if (planet.name === 'Earth') {
      body.current.getWorldPosition(_earthWorld)
      earthNight.uSunDirView.value
        .copy(planetSun)
        .sub(_earthWorld)
        .transformDirection(camera.matrixWorldInverse)
      body.current.getWorldQuaternion(_earthQuat)
      earthNight.uNorthView.value
        .copy(_earthAxis.set(0, 1, 0).applyQuaternion(_earthQuat))
        .transformDirection(camera.matrixWorldInverse)
      earthNight.uTime.value = time
    }

    // Earth turns with the simulated clock to its real orientation; the
    // others spin at their real relative rates. Dragging adds an offset.
    const trueSpin = planet.name === 'Earth' ? earthSpinAngle(simClock.bodyJd, poleQuaternion) : null
    if (trueSpin !== null && held) {
      // a hovered marker holds Earth still: absorb the clock's turn
      userSpin.current -= trueSpin - lastTrueSpin.current
    }
    if (trueSpin !== null) lastTrueSpin.current = trueSpin

    if (!held) {
      // flying, they turn at their real rates on the flight's clock (which
      // can be sped up); in the journey, at a gentle pace of their own
      if (trueSpin === null) {
        if (!pilot.active) body.current.rotation.y += delta * rotationSpeed
        else body.current.rotation.y += ((simClock.bodyJd - lastSpinJd.current) * 24 * Math.PI * 2) / planet.rotationPeriodHours
      }
      lastSpinJd.current = simClock.bodyJd
    } else if (spinState) {
      spinState.velocity = 0
    }

    if (spinState && isFocused) {
      userSpin.current += spinState.pending
      if (trueSpin === null) body.current.rotation.y += spinState.pending
      spinState.pending = 0
      if (!spinState.dragging) {
        userSpin.current += spinState.velocity * delta
        if (trueSpin === null) body.current.rotation.y += spinState.velocity * delta
        spinState.velocity *= Math.exp(-delta * 2.2)
      }
    }
    if (trueSpin !== null) body.current.rotation.y = trueSpin + userSpin.current
  })

  return (
    <group
      position={SYSTEM_BASE}
    >
      <primitive object={orbitLine} />

      <group ref={orbit}>
        <group quaternion={poleQuaternion}>
          <mesh ref={body} scale={visualRadius}>
            {HOTSPOTS[index] && (
              <Hotspots
                index={index}
                spots={HOTSPOTS[index]}
                progressRef={progressRef}
                spin={spin}
              />
            )}
            <sphereGeometry args={[1, 192, 192]} />

            {/* the ground under the ship, for landing (rocky worlds) */}
            {GROUND[index] && (
              <Terrain
                index={index}
                map={() => (planet.name === 'Earth' ? (sharpDay ?? earthMap) : uniforms.uMap.value)}
                sunPosition={planetSun}
                light={sunlight.strength}
                lightTint={sunlight.tint}
                earth={planet.name === 'Earth'}
                night={planet.name === 'Earth' ? () => sharpNight ?? earthLights : undefined}
              />
            )}

            {/* clouds ride on Earth and drift slowly over it */}
            {planet.type === 'earth' && (
              <EarthCloudLayer radius={1} texture={sharpClouds ?? earthClouds} />
            )}

            {planet.name === 'Earth' && earthMap ? (
              <meshPhongMaterial
                // rebuild when a map arrives: three.js only picks up a newly
                // added texture (normal, specular, night lights) on recompile
                key={`earth-${!!earthNormal}-${!!earthSpecular}-${!!earthLights}`}
                map={sharpDay ?? earthMap}
                normalMap={earthNormal ?? undefined}
                normalScale={[0.34, 0.34]}
                specularMap={earthSpecular ?? undefined}
                specular={EARTH_SPECULAR}
                shininess={16}
                color="#ffffff"
                emissive={EARTH_CITY_LIGHTS}
                emissiveMap={sharpNight ?? earthLights ?? undefined}
                emissiveIntensity={earthLights ? 1.15 : 0}
                onBeforeCompile={maskLightsToNightSide}
              />
            ) : (
              <primitive object={planetMaterial} attach="material" />
            )}
          </mesh>

          {planet.atmosphereColor && (
            <mesh
              ref={atmosphereMesh}
              scale={visualRadius * (ATMOSPHERE_SHELL[planet.name] ?? 1.055)}
            >
              <sphereGeometry args={[1, 64, 64]} />
              <shaderMaterial
                transparent
                depthWrite={false}
                side={THREE.DoubleSide}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
                uniforms={atmosphereUniforms}
                vertexShader={ATMOSPHERE_VERTEX_SHADER}
                fragmentShader={ATMOSPHERE_FRAGMENT_SHADER}
              />
            </mesh>
          )}


          {planet.rings && (
            <PlanetRings
              planet={planet}
              radius={visualRadius}
              planetUniforms={uniforms}
              sunlight={sunlight}
              sharp={sharp}
            />
          )}

          {/* moons orbit in the planet's equatorial plane (Titan in Saturn's ring plane) */}
          {MOON_SYSTEMS[planet.name] && (
            <MoonSystem
              system={MOON_SYSTEMS[planet.name]}
              planetRadius={visualRadius}
              shadowUniforms={uniforms}
              sunlight={sunlight}
              tilt={poleQuaternion}
            />
          )}
        </group>

        {RIM_RAYS[index] && (
          <RimRays index={index} radius={visualRadius} progressRef={progressRef} />
        )}

        {/* the planet cut open, from the detail panel's "See inside" */}
        <Cutaway
          index={index}
          radius={visualRadius}
          progressRef={progressRef}
          hide={[body, atmosphereMesh]}
          getMap={() =>
            planet.name === 'Earth'
              ? { texture: sharpDay ?? earthMap, srgb: true }
              : { texture: uniforms.uMap.value, srgb: false }
          }
        />

        {planet.type === 'earth' && <Moon sharp={sharp} />}

        {/* earthshine: sunlight reflected off Earth faintly lights the Moon's
            night side (reaches only as far as the Moon) */}
        {planet.type === 'earth' && (
          <pointLight color="#9db6e0" intensity={0.09} distance={2.4} decay={0} />
        )}

        {planet.type === 'earth' && (
          <PaleBlueDotMarker progressRef={progressRef} />
        )}
      </group>
    </group>
  )
}

function materialIsShader(
  material: THREE.Material | THREE.Material[],
): material is THREE.ShaderMaterial {
  return (
    !Array.isArray(material) &&
    material instanceof THREE.ShaderMaterial
  )
}

/*
 * Clouds use alphaMap (grayscale: white = cloud, black = clear sky).
 * The cloud shell is inside the planet's axial-tilt group so it remains
 * aligned with the equatorial surface.
 */
function EarthCloudLayer({
  radius,
  texture,
}: {
  radius: number
  texture: THREE.Texture | null
}) {
  const cloud = useRef<THREE.Mesh>(null)
  const drift = useRef(0)

  // the ground's shadow map reads the same clouds
  useEffect(() => {
    earthNight.uClouds.value = texture
    earthNight.uHasClouds.value = texture ? 1 : 0
  }, [texture])

  useFrame((state, delta) => {
    // weather drifts east relative to the ground
    drift.current = (drift.current + delta * 0.01) % (Math.PI * 2)
    if (cloud.current) cloud.current.rotation.y = drift.current
    // the deck's height follows the camera's distance (in Earth radii)
    const earth = cloud.current?.parent
    if (cloud.current && earth) {
      earth.getWorldPosition(_cloudCentre)
      const e = earth.matrixWorld.elements
      const earthRadius = Math.hypot(e[0], e[1], e[2])
      const away = state.camera.position.distanceTo(_cloudCentre) / earthRadius
      const height = THREE.MathUtils.lerp(CLOUD_HEIGHT_NEAR, CLOUD_HEIGHT_FAR, THREE.MathUtils.smoothstep(away, 1.25, 3))
      cloud.current.scale.setScalar(radius * (1 + height))
      earthNight.uCloudHeight.value = height
      cloudDeck.height = height
    }
    earthNight.uCloudShift.value = drift.current / (Math.PI * 2)
    cloudDeck.shift = earthNight.uCloudShift.value
  })

  if (!texture) return null

  return (
    <mesh ref={cloud} scale={radius * (1 + CLOUD_HEIGHT_FAR)}>
      <sphereGeometry args={[1, 192, 192]} />
      <meshPhongMaterial
        color="#ffffff"
        alphaMap={texture}
        transparent
        opacity={0.85}
        depthWrite={false}
        shininess={0}
        side={THREE.DoubleSide}
        onBeforeCompile={detailClouds}
      />
    </mesh>
  )
}

/* the Moon's material: cut away under the landing ground, and NASA's
   lunar mosaic streamed in when flying low */
function moonGround(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, surfacePatch, groundHole)
  withSurfaceVaryings(shader)
  shader.fragmentShader =
    'uniform int uHolePlanet; uniform vec3 uHoleDir; uniform float uHoleCos;\n' +
    SURFACE_PATCH_GLSL +
    shader.fragmentShader
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
      if (uHolePlanet == ${MOON_ID} && dot(normalize(vSurfaceP), uHoleDir) > uHoleCos) discard;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
      #ifdef USE_MAP
      if (uPatchPlanet == ${MOON_ID}) {
        diffuseColor.rgb = patched(diffuseColor.rgb, uPatchFine, uPatchFineRect, uPatchCoarse, uPatchCoarseRect, vMapUv, uPatchGain).rgb;
      }
      #endif`,
      )
}

const MOON_LIGHT_TINT = new THREE.Color(1, 1, 1)

/* a moon's material, cut away under its landing ground (one per body) */
const satelliteGround = new Map<number, (shader: THREE.WebGLProgramParametersWithUniforms) => void>()
function satelliteHole(id: number) {
  let hook = satelliteGround.get(id)
  if (!hook) {
    hook = (shader) => {
      Object.assign(shader.uniforms, groundHole)
      withSurfaceVaryings(shader)
      shader.fragmentShader =
        'uniform int uHolePlanet; uniform vec3 uHoleDir; uniform float uHoleCos;\n' +
        shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
      if (uHolePlanet == ${id} && dot(normalize(vSurfaceP), uHoleDir) > uHoleCos) discard;`,
        )
    }
    satelliteGround.set(id, hook)
  }
  return hook
}

/* a plain texture of one colour, for moons without a map */
const plainMaps = new Map<string, THREE.Texture>()
function plainMap(color: string) {
  let texture = plainMaps.get(color)
  if (!texture) {
    const c = new THREE.Color(color)
    texture = new THREE.DataTexture(new Uint8Array([c.r * 255, c.g * 255, c.b * 255, 255]), 1, 1)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true
    plainMaps.set(color, texture)
  }
  return texture
}
const _satScale = new THREE.Vector3()

function Moon({ sharp }: { sharp: boolean }) {
  const { gl } = useThree()
  const sharpMap = useSharpTexture(SHARP_EARTH_MAPS.moon, sharp, {
    colorSpace: THREE.SRGBColorSpace,
    anisotropy: 16,
  })
  const orbit = useRef<THREE.Group>(null)
  const body = useRef<THREE.Mesh>(null)
  const timeRef = useRef(0)
  const [map, setMap] = useState<THREE.Texture | null>(null)
  useSurfacePatches(MOON_ID, body, SYSTEM_OFFSET)
  const [height, setHeight] =
    useState<THREE.Texture | null>(null)

  useEffect(() => {
    let cancelled = false
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    const owned: THREE.Texture[] = []

    const load = (
      url: string,
      colorTexture: boolean,
      setter: (value: THREE.Texture) => void,
    ) => {
      loader.load(url, (loaded) => {
        if (cancelled) {
          loaded.dispose()
          return
        }

        loaded.colorSpace = colorTexture
          ? THREE.SRGBColorSpace
          : THREE.NoColorSpace
        loaded.wrapS = THREE.RepeatWrapping
        loaded.wrapT = THREE.ClampToEdgeWrapping
        loaded.anisotropy = Math.min(
          16,
          gl.capabilities.getMaxAnisotropy(),
        )
        loaded.needsUpdate = true
        owned.push(loaded)
        setter(loaded)
      })
    }

    load(MOON_LOCAL_TEXTURES.color, true, setMap)
    load(MOON_LOCAL_TEXTURES.height, false, setHeight)

    return () => {
      cancelled = true
      owned.forEach((asset) => asset.dispose())
      setMap(null)
      setHeight(null)
    }
  }, [gl])

  useFrame((_, delta) => {
    const time = (timeRef.current += delta)

    void time
    const moon = body.current
    if (moon) {
      // where the Moon really is, seen from Earth (distance compressed in
      // the journey; flying, its true 60 Earth radii and true size)
      // (scene units: Earth's radius is 0.23)
      moonDirection(simClock.bodyJd, moon.position).multiplyScalar(layout.trueScale ? MOON_TRUE_DISTANCE : MOON_ORBIT_RADIUS)
      moon.scale.setScalar(layout.trueScale ? (MOON_RADIUS_KM / EARTH_RADIUS_KM) * EARTH_RENDER_RADIUS : MOON_RENDER_RADIUS)
      // tidally locked: the near side (longitude 0) always faces Earth
      moon.parent?.getWorldPosition(_moonEarth)
      moon.lookAt(_moonEarth)
      moon.rotateY(-Math.PI / 2)
    }
  })

  if (!map) return null

  return (
    <group>
      <group ref={orbit}>
        <mesh ref={body} scale={MOON_RENDER_RADIUS}>
          <sphereGeometry args={[1, 192, 192]} />
          <meshPhongMaterial
            map={sharpMap ?? map}
            bumpMap={height ?? undefined}
            bumpScale={0.045}
            color="#ffffff"
            shininess={3}
            specular={MOON_SPECULAR}
            onBeforeCompile={moonGround}
          />
          {/* landing ground (flying) */}
          <Terrain
            index={MOON_ID}
            map={() => sharpMap ?? map}
            sunPosition={SYSTEM_OFFSET}
            light={1}
            lightTint={MOON_LIGHT_TINT}
            srgb
          />
        </mesh>
      </group>
    </group>
  )
}

/* ============================================================
   MOONS
   Sizes and distances are in planet radii. Within each system the size
   ratios are real, enlarged 2.5x so they read on screen (Mars's moons,
   only ~11 km and ~6 km across, are enlarged far more). Orbits are
   compressed to stay in frame; periods keep their real ratios.
============================================================ */

type MoonSpec = {
  name: string
  color: string
  radius: number
  distance: number
  periodDays: number
  phase: number
  shape?: [number, number, number]
  /* thick atmosphere colour (Titan) */
  haze?: string
  /* surface map (Galileo / Voyager mosaics, USGS, public domain) */
  map?: string
  /* mean longitude at J2000 (degrees) and its daily motion: the moon's
     real position (Galilean moons, from Lieske's E5 theory) */
  longitude?: [number, number]
}

type MoonSystemSpec = {
  /* seconds for the first (innermost) moon to complete one orbit */
  baseSeconds: number
  moons: MoonSpec[]
}

const MOON_SYSTEMS: Record<string, MoonSystemSpec> = {
  Mars: {
    baseSeconds: 26,
    moons: [
      { name: 'Phobos', color: '#a39484', radius: 0.09, distance: 1.9, periodDays: 0.319, phase: 0.4, shape: [1, 0.74, 0.86] },
      { name: 'Deimos', color: '#b3a594', radius: 0.06, distance: 2.8, periodDays: 1.263, phase: 2.7, shape: [1, 0.82, 0.9] },
    ],
  },
  Jupiter: {
    baseSeconds: 30,
    moons: [
      { name: 'Io', longitude: [106.07719, 203.48895579], map: '/textures/moons/io.webp', color: '#d8bb63', radius: 0.065, distance: 1.85, periodDays: 1.769, phase: 0.3 },
      { name: 'Europa', longitude: [175.73161, 101.374724735], map: '/textures/moons/europa.webp', color: '#cdbfa3', radius: 0.056, distance: 2.3, periodDays: 3.551, phase: 2.2 },
      { name: 'Ganymede', longitude: [120.55883, 50.317609207], map: '/textures/moons/ganymede.webp', color: '#9c8f80', radius: 0.094, distance: 2.95, periodDays: 7.155, phase: 4.1 },
      { name: 'Callisto', longitude: [84.44459, 21.571071177], map: '/textures/moons/callisto.webp', color: '#6e6359', radius: 0.086, distance: 3.7, periodDays: 16.689, phase: 5.5 },
    ],
  },
  Saturn: {
    baseSeconds: 70,
    moons: [
      { name: 'Titan', color: '#d29d55', radius: 0.11, distance: 2.75, periodDays: 15.945, phase: 1.2, haze: '#e8a050' },
    ],
  },
}

type MoonShadowUniforms = {
  uMoonPos: { value: THREE.Vector3[] }
  uMoonRadius: { value: number[] }
  uMoonCount: { value: number }
}

const _moonScale = new THREE.Vector3()

function MoonSystem({
  system,
  planetRadius,
  shadowUniforms,
  sunlight,
  tilt,
}: {
  system: MoonSystemSpec
  planetRadius: number
  shadowUniforms?: MoonShadowUniforms
  sunlight?: { strength: number; tint: THREE.Color }
  /* the planet's spin-axis orientation (its equatorial frame) */
  tilt?: THREE.Quaternion
}) {
  const moonColors = useMemo(
    () =>
      system.moons.map((moon) => {
        // with a surface map, the map carries the colour and light tints it
        const color = new THREE.Color(moon.map ? '#ffffff' : moon.color)
        if (sunlight) color.multiply(sunlight.tint).multiplyScalar(sunlight.strength)
        return color
      }),
    [system, sunlight],
  )
  // loaded after render (starting a load during render would update the
  // loading screen's progress mid-render)
  const [moonMaps, setMoonMaps] = useState<(THREE.Texture | null)[]>([])
  useEffect(() => {
    const loader = new THREE.TextureLoader()
    const maps = system.moons.map((moon) => {
      if (!moon.map) return null
      const texture = loader.load(moon.map)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.wrapS = THREE.RepeatWrapping
      return texture
    })
    setMoonMaps(maps)
    return () => maps.forEach((texture) => texture?.dispose())
  }, [system])
  const arms = useRef<(THREE.Group | null)[]>([])
  const bodies = useRef<(THREE.Mesh | null)[]>([])
  // Titan's thick orange haze uses the same Sun-aware atmosphere shader
  const hazeUniforms = useMemo(
    () =>
      system.moons.map((moon) => ({
        uColor: { value: new THREE.Color(moon.haze ?? '#000000') },
        uDusk: { value: new THREE.Color(moon.haze ?? '#000000').multiplyScalar(0.8) },
        uIntensity: { value: 0.9 },
        uThickness: { value: 1.2 },
        uShell: { value: 1.14 },
        uSunPosition: { value: SYSTEM_OFFSET },
        uLight: { value: sunlight?.strength ?? 1 },
        uGroundSky: { value: 0 },
      })),
    [system, sunlight],
  )
  const hazes = useRef<(THREE.Mesh | null)[]>([])
  const bodyGetters = useMemo(() => system.moons.map((_, i) => () => bodies.current[i] ?? null), [system])
  const time = useRef(0)

  useFrame((_, delta) => {
    time.current += delta
    // on the shared simulated clock, at their real periods; the Galilean
    // moons at their real longitudes (measured from the vernal equinox)
    const days = simClock.bodyJd - 2451545.0
    const equinox = tilt ? angleInFrame(VERNAL_EQUINOX, tilt) : 0
    system.moons.forEach((moon, i) => {
      const arm = arms.current[i]
      if (!arm) return
      arm.rotation.y = moon.longitude
        ? equinox + ((moon.longitude[0] + moon.longitude[1] * days) * Math.PI) / 180
        : moon.phase + (days / moon.periodDays) * Math.PI * 2
      // flying: at their true sizes and distances (scene units)
      const satellite = SATELLITES.find((entry) => entry.name === moon.name)
      const body = bodies.current[i]
      if (satellite && body) {
        if (layout.trueScale) {
          const kmPerUnit = EARTH_RADIUS_KM / EARTH_RENDER_RADIUS
          // the group above may be scaled (a far planet drawn smaller)
          arm.parent?.getWorldScale(_satScale)
          body.position.set(satellite.distanceKm / kmPerUnit, 0, 0)
          body.scale.setScalar(satellite.radiusKm / kmPerUnit)
        } else {
          body.position.set(moon.distance * planetRadius, 0, 0)
          const shape = moon.shape ?? [1, 1, 1]
          body.scale.set(shape[0] * moon.radius * planetRadius, shape[1] * moon.radius * planetRadius, shape[2] * moon.radius * planetRadius)
        }
        // low over Titan, its orange sky
        const haze = hazes.current[i]
        if (haze) {
          const id = FIRST_SATELLITE_ID + SATELLITES.indexOf(satellite)
          const low = pilot.active && pilot.nearestIndex === id && pilot.altitudeKm >= 0
          ;(haze.material as THREE.ShaderMaterial).uniforms.uGroundSky.value = low
            ? 1 - THREE.MathUtils.smoothstep(pilot.altitudeKm, 40, 300)
            : 0
        }
      }
    })

    // tell the planet where its moons are, so they can cast shadows on it
    if (shadowUniforms) {
      let count = 0
      system.moons.forEach((moon, i) => {
        const body = bodies.current[i]
        if (!body || count >= 4) return
        body.getWorldPosition(shadowUniforms.uMoonPos.value[count])
        body.getWorldScale(_moonScale)
        shadowUniforms.uMoonRadius.value[count] = Math.max(_moonScale.x, _moonScale.y, _moonScale.z)
        count += 1
      })
      shadowUniforms.uMoonCount.value = count
    }
  })

  return (
    <>
      {system.moons.map((moon, i) => (
        <group
          key={moon.name}
          ref={(group) => {
            arms.current[i] = group
          }}
        >
          <mesh
            ref={(mesh) => {
              bodies.current[i] = mesh
            }}
            position={[moon.distance * planetRadius, 0, 0]}
            scale={(moon.shape ?? [1, 1, 1]).map(
              (axis) => axis * moon.radius * planetRadius,
            ) as [number, number, number]}
          >
            <sphereGeometry args={[1, 128, 96]} />
            <meshStandardMaterial
              // rebuilt once the map arrives (a new map needs a recompile)
              key={moonMaps[i] ? 'mapped' : 'plain'}
              color={moonColors[i]}
              map={moonMaps[i] ?? undefined}
              roughness={1}
              metalness={0}
              onBeforeCompile={satelliteIdOf(moon.name) >= 0 ? satelliteHole(satelliteIdOf(moon.name)) : undefined}
              customProgramCacheKey={() => `satellite-${moon.name}-${moonMaps[i] ? 'mapped' : 'plain'}`}
            />
            {satelliteIdOf(moon.name) >= 0 && (
              <SatelliteStream id={satelliteIdOf(moon.name)} body={bodyGetters[i]} />
            )}
            {/* landing ground (flying) */}
            {satelliteIdOf(moon.name) >= 0 && (
              <Terrain
                index={satelliteIdOf(moon.name)}
                map={() => moonMaps[i] ?? plainMap(moon.color)}
                sunPosition={SYSTEM_OFFSET}
                light={sunlight?.strength ?? 1}
                lightTint={sunlight?.tint ?? MOON_LIGHT_TINT}
                srgb
              />
            )}
            {moon.haze && (
              <mesh
                scale={1.14}
                ref={(mesh) => {
                  hazes.current[i] = mesh
                }}
              >
                <sphereGeometry args={[1, 64, 48]} />
                <shaderMaterial
                  transparent
                  depthWrite={false}
                  side={THREE.DoubleSide}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                  uniforms={hazeUniforms[i]}
                  vertexShader={ATMOSPHERE_VERTEX_SHADER}
                  fragmentShader={ATMOSPHERE_FRAGMENT_SHADER}
                />
              </mesh>
            )}
          </mesh>
        </group>
      ))}
    </>
  )
}

/* streams a moon's mosaic while flying low over it (a hook per moon) */
function SatelliteStream({ id, body }: { id: number; body: () => THREE.Mesh | null }) {
  const ref = useMemo(() => ({ get current() { return body() } }), [body])
  useSurfacePatches(id, ref as RefObject<THREE.Mesh | null>, SYSTEM_OFFSET)
  return null
}

function satelliteIdOf(name: string) {
  const index = SATELLITES.findIndex((satellite) => satellite.name === name)
  return index < 0 ? -1 : FIRST_SATELLITE_ID + index
}

/* Saturn's rings from the real ring map: the texture is a radial strip,
   so each vertex's u coordinate is its distance across the ring. */
const SATURN_RING_TEXTURE = '/textures/planets/2k_saturn_ring_alpha.png'
/* ring extent in planet radii (matches the ring texture) */
const SATURN_RING_INNER = 1.24
const SATURN_RING_OUTER = 2.35
/* the faint D ring reaches in towards the cloud tops */
const SATURN_D_RING_INNER = 1.11

/* Rings lit by the Sun, with Saturn's own shadow cut across them:
   from each point on the ring, does the sunbeam hit the planet? */
const RING_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vRingNormal;
varying vec2 vLocal;
void main() {
  vUv = uv;
  vLocal = position.xy;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vRingNormal = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * world;
}`

const RING_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uTint;
uniform vec3 uSunPosition;
uniform vec3 uPlanetCenter;
uniform float uPlanetRadius;
uniform float uTime;
uniform float uLocalRadius;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vRingNormal;
varying vec2 vLocal;

float ringHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ringNoise(float x, float seed) {
  float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(ringHash(vec2(i, seed)), ringHash(vec2(i + 1.0, seed)), f);
}

void main() {
  /* distance from Saturn's centre in planet radii; the texture covers the
     main rings (C to A), the D ring inside it is a faint, banded veil */
  float rr = length(vLocal) / uLocalRadius;
  float u = (rr - ${SATURN_RING_INNER.toFixed(2)}) / (${SATURN_RING_OUTER.toFixed(2)} - ${SATURN_RING_INNER.toFixed(2)});
  vec4 ring;
  if (u < 0.0) {
    float bands = 0.6 + 0.4 * sin(rr * 260.0) * sin(rr * 61.0);
    float fade = smoothstep(${SATURN_D_RING_INNER.toFixed(2)}, ${SATURN_D_RING_INNER.toFixed(2)} + 0.04, rr);
    ring = vec4(vec3(0.62, 0.56, 0.48), 0.05 * bands * fade);
  } else {
    ring = texture2D(uMap, vec2(u, 0.5));
    /* close up: the rings resolve into ever finer ringlets (Cassini saw
       structure down to a few hundred metres). Each scale appears only
       once it is wider than a pixel. */
    float px = fwidth(rr);
    float ringlets = 0.0;
    float f = 500.0;
    for (int i = 0; i < 4; i++) {
      float shown = 1.0 - smoothstep(0.15, 0.8, px * f);
      ringlets += (ringNoise(rr * f, float(i) * 7.0) - 0.5) * shown;
      f *= 3.6;
    }
    ring.a = clamp(ring.a * (1.0 + ringlets * 1.1), 0.0, 1.0);
    ring.rgb *= 1.0 + ringlets * 0.35;
  }
  vec3 toSun = normalize(uSunPosition - vWorld);
  vec3 toPlanet = uPlanetCenter - vWorld;
  float along = dot(toPlanet, toSun);
  float lit = 1.0;
  if (along > 0.0) {
    float miss = length(toPlanet - toSun * along);
    lit = mix(0.06, 1.0, smoothstep(uPlanetRadius * 0.97, uPlanetRadius * 1.04, miss));
  }
  /* ring particles scatter light forwards: seen against the Sun, the rings
     glow; seen from the sunward side they are plainly lit */
  vec3 toCamera = normalize(cameraPosition - vWorld);
  float forward = pow(max(dot(-toCamera, toSun), 0.0), 3.0);
  float glow = 1.0 + forward * 1.4;

  /* seen from the unlit face, sunlight only comes through where the rings
     are thin: the dense B ring turns dark, the C ring and Cassini
     Division glow. From the lit face, the usual reflected light. */
  float sunSide = dot(vRingNormal, toSun);
  float viewSide = dot(vRingNormal, toCamera);
  float unlitFace = step(sunSide * viewSide, 0.0);
  float through = (1.0 - ring.a) * 1.7 + 0.08;
  vec3 color = ring.rgb * uTint * lit * glow * mix(1.0, through, unlitFace);

  /* glitter: now and then a single ice grain catches the Sun */
  vec2 cell = floor(vLocal * 900.0);
  float flick = floor(uTime * 3.0 + ringHash(cell) * 50.0);
  float glint = step(0.9965, ringHash(cell + flick * 0.37)) * (1.0 - unlitFace) * lit;
  color += vec3(1.0, 0.95, 0.85) * glint * ring.a * 1.4;

  gl_FragColor = vec4(color, ring.a);
}`

type RingShadowUniforms = { uRingMap: { value: THREE.Texture | null }; uSunPosition?: { value: THREE.Vector3 } }

const _ringScale = new THREE.Vector3()

function SaturnRing({
  radius,
  planetUniforms,
  sunlight,
  sharp = false,
}: {
  radius: number
  planetUniforms?: RingShadowUniforms
  sunlight?: { strength: number; tint: THREE.Color }
  sharp?: boolean
}) {
  const sharpRing = useSharpTexture(SHARP_SATURN_RING, sharp, {
    colorSpace: THREE.NoColorSpace,
  })
  const baseRing = useRef<THREE.Texture | null>(null)
  const ringMesh = useRef<THREE.Mesh>(null)
  const inner = radius * SATURN_D_RING_INNER
  const outer = radius * SATURN_RING_OUTER

  const geometry = useMemo(() => {
    const ring = new THREE.RingGeometry(inner, outer, 192, 1)
    const position = ring.attributes.position
    const uv = ring.attributes.uv
    const vertex = new THREE.Vector3()

    for (let i = 0; i < position.count; i += 1) {
      vertex.fromBufferAttribute(position, i)
      uv.setXY(i, (vertex.length() - inner) / (outer - inner), 0.5)
    }

    uv.needsUpdate = true
    return ring
  }, [inner, outer])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: null as THREE.Texture | null },
          uTint: {
            value: new THREE.Color('#efe3c8')
              .multiply(sunlight?.tint ?? new THREE.Color(1, 1, 1))
              .multiplyScalar(sunlight?.strength ?? 1),
          },
          uSunPosition: { value: SYSTEM_OFFSET },
          uPlanetCenter: { value: new THREE.Vector3() },
          uPlanetRadius: { value: radius },
          uLocalRadius: { value: radius },
          uTime: { value: 0 },
        },
        vertexShader: RING_VERTEX,
        fragmentShader: RING_FRAGMENT,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [radius, sunlight],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useEffect(() => {
    let disposed = false
    let loadedTexture: THREE.Texture | null = null

    new THREE.TextureLoader().load(SATURN_RING_TEXTURE, (texture) => {
      if (disposed) {
        texture.dispose()
        return
      }
      // raw values: the shader writes colour straight to the screen
      texture.colorSpace = THREE.NoColorSpace
      loadedTexture = texture
      baseRing.current = texture
      if (material.uniforms.uMap.value) return // the sharp map is showing
      material.uniforms.uMap.value = texture
      // Saturn's own shader reads the same map to draw the rings' shadow
      if (planetUniforms) planetUniforms.uRingMap.value = texture
    })

    return () => {
      disposed = true
      baseRing.current = null
      loadedTexture?.dispose()
    }
  }, [material, planetUniforms])

  // the sharp ring map while Saturn is in focus, the 2K one otherwise
  useEffect(() => {
    const map = sharpRing ?? baseRing.current
    if (!map) return
    material.uniforms.uMap.value = map
    if (planetUniforms) planetUniforms.uRingMap.value = map
  }, [sharpRing, material, planetUniforms])

  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta
    if (planetUniforms?.uSunPosition) material.uniforms.uSunPosition.value = planetUniforms.uSunPosition.value
    const mesh = ringMesh.current
    if (!mesh) return
    // the ring sits at Saturn's centre; scale follows the focus shrink
    mesh.getWorldPosition(material.uniforms.uPlanetCenter.value)
    mesh.getWorldScale(_ringScale)
    material.uniforms.uPlanetRadius.value = radius * _ringScale.x
    mesh.visible = material.uniforms.uMap.value !== null
  })

  return (
    <mesh
      ref={ringMesh}
      rotation={[Math.PI / 2, 0, 0]}
      geometry={geometry}
      material={material}
    />
  )
}

/* Pale Blue Dot (chapter 10): a hairline ring round Earth's speck, shown
   only once the camera has settled on the long view home */
const PALE_BLUE_DOT_CHAPTER = 10

function PaleBlueDotMarker({ progressRef }: { progressRef: RefObject<number> }) {
  const element = useRef<HTMLDivElement>(null)
  const opacity = useRef(0)

  useFrame((_, delta) => {
    if (!element.current) return
    const progress = progressRef.current ?? 0
    const local = progress - PALE_BLUE_DOT_CHAPTER
    const target = local >= 0.2 && local < 0.93 ? 1 : 0
    opacity.current += (target - opacity.current) * (1 - Math.exp(-delta * 3))
    element.current.style.opacity = opacity.current.toFixed(3)
  })

  return (
    <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div ref={element} className="pale-blue-dot" style={{ opacity: 0 }}>
        <span className="pale-blue-dot-ring" />
        <span className="pale-blue-dot-label">Earth</span>
      </div>
    </Html>
  )
}

/* Clickable markers pinned to the planet surface. They rotate with the
   body, fade out as they turn away from the camera, and only appear
   while the planet is in focus. */
function Hotspots({
  index,
  spots,
  progressRef,
  spin,
}: {
  index: number
  spots: Hotspot[]
  progressRef: RefObject<number>
  spin: RefObject<SpinState>
}) {
  const hovered = useRef(false)
  const wasFocused = useRef(false)
  const group = useRef<THREE.Group>(null)
  const items = useRef<(HTMLDivElement | null)[]>([])
  const camera = useThree((state) => state.camera)
  const [open, setOpen] = useState<number | null>(null)
  const openRef = useRef<number | null>(null)
  openRef.current = open

  const anchors = useMemo(
    () => spots.map((spot) => latLonToSphere(spot.lat, spot.lon, 1.02)),
    [spots],
  )

  useFrame(() => {
    if (!group.current) return
    const focused = focusedPlanetIndex(progressRef.current ?? 0) === index

    if (!focused && openRef.current !== null) {
      openRef.current = null
      setOpen(null)
    }
    // only the focused planet's markers own the pause flag
    if (spin.current) {
      if (focused) {
        spin.current.hold = hovered.current || openRef.current !== null
      } else if (wasFocused.current) {
        spin.current.hold = false
        hovered.current = false
      }
    }
    wasFocused.current = focused

    group.current.getWorldPosition(_hotspotCenter)

    anchors.forEach((anchor, i) => {
      const element = items.current[i]
      if (!element) return

      _hotspotWorld.copy(anchor).applyMatrix4(group.current!.matrixWorld)
      _hotspotNormal.copy(_hotspotWorld).sub(_hotspotCenter).normalize()
      _hotspotToCamera.copy(camera.position).sub(_hotspotWorld).normalize()
      const facing = _hotspotNormal.dot(_hotspotToCamera)

      const opacity = focused && cutaway.planet !== index
        ? THREE.MathUtils.smoothstep(facing, 0.12, 0.4)
        : 0
      element.style.opacity = opacity.toFixed(3)

      const usable = opacity > 0.5
      const button = element.firstElementChild as HTMLButtonElement | null
      if (button && button.tabIndex !== (usable ? 0 : -1)) {
        button.tabIndex = usable ? 0 : -1
      }
      element.style.pointerEvents = usable ? 'auto' : 'none'
    })
  })

  return (
    <group ref={group}>
      {spots.map((spot, i) => (
        <Html
          key={spot.name}
          position={anchors[i]}
          center
          zIndexRange={[6, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            ref={(element) => {
              items.current[i] = element
            }}
            className={`hotspot ${open === i ? 'is-open' : ''}`}
            style={{ opacity: 0 }}
            onPointerEnter={() => {
              hovered.current = true
            }}
            onPointerLeave={() => {
              hovered.current = false
            }}
          >
            <button
              type="button"
              className="hotspot-dot"
              tabIndex={-1}
              aria-label={`${spot.name}: ${spot.fact}`}
              aria-expanded={open === i}
              onClick={() => setOpen(open === i ? null : i)}
            />
            <div className="hotspot-card" role="note">
              <b>{spot.name}</b>
              <span>{spot.fact}</span>
            </div>
          </div>
        </Html>
      ))}
    </group>
  )
}

/* Uranus's rings: [radius, width, opacity], in planet radii */
const URANUS_RINGS: [number, number, number][] = [
  [1.65, 0.005, 0.12],
  [1.67, 0.005, 0.12],
  [1.75, 0.005, 0.14],
  [1.79, 0.005, 0.14],
  [1.84, 0.004, 0.1],
  [1.86, 0.005, 0.14],
  [1.9, 0.006, 0.16],
  [2.0, 0.016, 0.28],
]

function PlanetRings({
  planet,
  radius,
  planetUniforms,
  sunlight,
  sharp = false,
}: {
  planet: (typeof PLANETS)[number]
  radius: number
  planetUniforms?: RingShadowUniforms
  sunlight?: { strength: number; tint: THREE.Color }
  sharp?: boolean
}) {
  const isSaturn = planet.name === 'Saturn'
  const isUranus = planet.name === 'Uranus'

  if (isSaturn)
    return (
      <SaturnRing
        radius={radius}
        planetUniforms={planetUniforms}
        sunlight={sunlight}
        sharp={sharp}
      />
    )
  const isNeptune = planet.name === 'Neptune'

  // Uranus: a set of narrow, dark rings (6, 5, 4, alpha, beta, eta, gamma,
  // delta, and the widest, epsilon), not one bright band
  if (isUranus) {
    return (
      <>
        {URANUS_RINGS.map(([at, width, opacity]) => (
          <mesh key={at} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[radius * at, radius * (at + width), 160]} />
            <meshBasicMaterial
              color="#8a9496"
              transparent
              opacity={opacity}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        ))}
      </>
    )
  }

  // Neptune has thin, faint rings: a broad band read as a dark hole
  const outer = isSaturn
    ? radius * 2.65
    : isUranus
      ? radius * 1.68
      : radius * 1.64
  const inner = isSaturn
    ? radius * 1.35
    : isUranus
      ? radius * 1.63
      : radius * 1.6

  return (
    <>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[inner, outer, 128]} />
        <meshBasicMaterial
          color={
            isSaturn
              ? '#c8b48d'
              : isUranus
                ? '#a9c2c9'
                : '#7d8ea6'
          }
          transparent
          opacity={
            isSaturn
              ? 0.48
              : isUranus
                ? 0.42
                : 0.2
          }
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {isNeptune && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry
            args={[radius * 1.78, radius * 1.86, 128]}
          />
          <meshBasicMaterial
            color="#5d718d"
            transparent
            opacity={0.12}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </>
  )
}
