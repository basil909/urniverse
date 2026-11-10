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
} from './orbit'
import { simClock } from './simClock'
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

/* Night side: city lights are an emissive map, masked so they only glow
   where the Sun is down. The mask fades across the terminator (dusk). */
const earthNight = {
  uSunDirView: { value: new THREE.Vector3(1, 0, 0) },
}
const EARTH_CITY_LIGHTS = new THREE.Color('#ffc27a')
const _earthWorld = new THREE.Vector3()

function maskLightsToNightSide(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uSunDirView = earthNight.uSunDirView
  shader.fragmentShader =
    'uniform vec3 uSunDirView;\n' +
    shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float sunFacing = dot(normalize(normal), normalize(uSunDirView));
      totalEmissiveRadiance *= 1.0 - smoothstep(-0.2, 0.12, sunFacing);`,
    )
}

const MOON_LOCAL_TEXTURES = {
  color: '/textures/moon.webp',
  height: '/textures/moon-height.webp',
} as const

const MOON_RENDER_RADIUS = 0.072
const MOON_ORBIT_RADIUS = 1.28
const MOON_ORBIT_INCLINATION = THREE.MathUtils.degToRad(5.145)
const MOON_ORBIT_SPEED = 0.055


const EARTH_SPECULAR = new THREE.Color('#2b4766')
const MOON_SPECULAR = new THREE.Color('#222222')

const _scratchOrbitPos = new THREE.Vector3()
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
  Neptune: { color: '#5a8ee0', dusk: '#3f6cc4', intensity: 0.45, thickness: 0.5 },
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

  /* granulation: a fine, slowly churning cell pattern */
  float cells = 1.0 - abs(noise(p * 42.0 + vec3(0.0, uTime * 0.08, uTime * 0.05)) * 2.0 - 1.0);
  cells = pow(cells, 2.6);
  float churn = fbm(p * 2.4 + vec3(uTime * 0.012, 0.0, 0.0));

  /* faculae (bright active regions) and rare, small sunspots */
  float faculae = smoothstep(0.6, 0.8, fbm(p * 5.5 - vec3(0.0, uTime * 0.01, 0.0)));
  float spots = smoothstep(0.8, 0.87, fbm(p * 1.8 + vec3(3.1, 0.0, 1.4)));

  /* limb darkening: dimmer and redder towards the edge, as on the real Sun */
  float limb = 1.0 - 0.6 * (1.0 - pow(mu, 0.75));
  vec3 core = vec3(1.0, 0.94, 0.80);
  vec3 middle = vec3(1.0, 0.70, 0.30);
  vec3 edge = vec3(0.92, 0.33, 0.07);
  vec3 base = mix(edge, middle, smoothstep(0.0, 0.55, mu));
  base = mix(base, core, smoothstep(0.5, 1.0, mu));

  float tone = 0.8 + 0.2 * cells + 0.12 * churn + 0.22 * faculae;
  vec3 color = base * tone * limb;
  color *= 1.0 - spots * 0.7;

  // only the hottest centre is bright enough to bloom
  gl_FragColor = vec4(color * 1.12, 1.0);
}`



const ATMOSPHERE_VERTEX_SHADER = /* glsl */ `

varying vec3 vNormal; varying vec3 vWorldPosition;

void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPosition = wp.xyz; vNormal = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`



const ATMOSPHERE_FRAGMENT_SHADER = /* glsl */ `

uniform vec3 uColor; uniform vec3 uDusk; uniform float uIntensity; uniform float uThickness;
uniform vec3 uSunPosition; uniform float uLight;
varying vec3 vNormal; varying vec3 vWorldPosition;

void main() {
  vec3 n = normalize(vNormal);
  vec3 vd = normalize(cameraPosition - vWorldPosition);
  vec3 toSun = normalize(uSunPosition - vWorldPosition);

  /* a thin shell seen edge-on glows; uThickness widens it (Venus, Titan) */
  float rim = 1.0 - max(dot(n, vd), 0.0);
  float edge = smoothstep(0.05, 0.95, pow(rim, 3.2 - uThickness));

  /* only where sunlight reaches, with a warm tint near the day/night line */
  float ndl = dot(n, toSun);
  float day = smoothstep(-0.28, 0.3, ndl);
  float dusk = 1.0 - smoothstep(0.0, 0.42, abs(ndl + 0.04));
  vec3 color = mix(uColor, uDusk, dusk * 0.8);

  /* forward scattering: looking towards the Sun through the limb, the
     atmosphere lights up all round (the backlit "ring of light") */
  float forward = pow(max(dot(-vd, toSun), 0.0), 5.0);
  float backlit = forward * smoothstep(-0.75, 0.05, ndl) * 2.2;

  float a = edge * (day + backlit) * uIntensity * uLight;
  gl_FragColor = vec4(color * a, a);
}`



const PLANET_VERTEX_SHADER = /* glsl */ `

varying vec3 vWorldPosition; varying vec3 vNormal; varying vec2 vUv; varying vec3 vLocalPosition;

void main() { vUv = uv; vNormal = normalize(mat3(modelMatrix) * normal); vLocalPosition = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPosition = wp.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`



const PLANET_FRAGMENT_SHADER = /* glsl */ `

uniform float uTime; uniform int uType; uniform int uPlanet; uniform vec3 uBaseColor; uniform vec3 uAtmosphereColor; uniform vec3 uSunPosition; uniform sampler2D uMap; uniform float uHasMap;

/* shadows (all in world space) */
uniform vec3 uMoonPos[4]; uniform float uMoonRadius[4]; uniform int uMoonCount;
uniform float uLight; uniform vec3 uLightTint; /* sunlight strength and colour at this distance */
uniform float uHasRings; uniform sampler2D uRingMap; uniform vec3 uRingNormal; uniform vec3 uPlanetCenter; uniform float uRingInner; uniform float uRingOuter;

varying vec3 vWorldPosition; varying vec3 vNormal; varying vec2 vUv; varying vec3 vLocalPosition;

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

void main() {

  vec3 normal = normalize(vNormal);
  vec3 p = normalize(vLocalPosition);
  vec3 surface;

  if (uPlanet == 0) surface = mercury(p);
  else if (uPlanet == 1) surface = venus(p);
  else if (uPlanet == 3) surface = mars(p);
  else if (uPlanet == 4) surface = jupiter(p);
  else if (uPlanet == 5) surface = saturn(p);
  else if (uPlanet == 6) surface = uranus(p);
  else surface = neptune(p);

  /* real surface map when loaded; procedural surface above is the fallback */
  if (uHasMap > 0.5) {
    surface = texture2D(uMap, vUv).rgb;
  }

  vec3 toSun = normalize(uSunPosition - vWorldPosition);
  vec3 vd = normalize(cameraPosition - vWorldPosition);
  float ndl = dot(normal, toSun);

  /* soft terminator, a touch of wrap lighting for thick atmospheres */
  float wrap = (uType == 2 || uType == 3 || uPlanet == 1) ? 0.18 : 0.04;
  float light = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  light = smoothstep(0.0, 1.0, light);

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

  float rim = pow(1.0 - facing, 3.5);
  vec3 color = surface * (vec3(0.035) + light * shadow * 0.965 * uLight * uLightTint) * limb;
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
  const asteroidPositions = useMemo(() => {
    const count = 1800
    const positions = new Float32Array(count * 3)
    const inner = orbitalDisplayDistance(2.1)
    const outer = orbitalDisplayDistance(3.3)

    for (let i = 0; i < count; i += 1) {
      const angle = seededRandom(i * 2.17) * Math.PI * 2
      const radius =
        inner + seededRandom(i * 3.71) * (outer - inner)
      const height = (seededRandom(i * 5.17) - 0.5) * 0.18

      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = height
      positions[i * 3 + 2] = Math.sin(angle) * radius
    }

    return positions
  }, [])

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
  })

  return (
    <group ref={system} position={SYSTEM_OFFSET}>
      <group position={[-SYSTEM_OFFSET.x, -SYSTEM_OFFSET.y, -SYSTEM_OFFSET.z]}>
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

      <group position={SYSTEM_OFFSET}>
        <points>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[asteroidPositions, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            color="#81786b"
            size={0.010}
            sizeAttenuation
            transparent
            opacity={0.42}
            depthWrite={false}
            fog={false}
          />
        </points>
      </group>
      </group>
    </group>
  )
}

/* ============================================================
   SUN
============================================================ */

function Sun() {
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
  })

  return (
    <group position={SYSTEM_OFFSET}>
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

      <pointLight
        color="#fff0d0"
        intensity={2.2}
        distance={0}
        decay={0}
      />
    </group>
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

  gl_FragColor = vec4(vec3(1.0, 0.68, 0.34) * glow * uOpacity, 1.0);
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
  const { gl } = useThree()
  // sharper maps once the camera has arrived (desktop only)
  const sharp = useSharpFocus(progressRef, index, FOCUS_IN)
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

  const visualRadius = getPlanetVisualRadius(index)
  // sunlight here: dimmer and cooler with distance from the Sun
  const sunlight = useMemo(() => getPlanetSunlight(index), [index])

  // real spin axis (IAU pole), so tilt, seasons and ring angle are true
  const poleQuaternion = useMemo(() => getPlanetPoleQuaternion(index), [index])
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
      uSunPosition: { value: SYSTEM_OFFSET },
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
    }),
    [planet, planetType, index, sunlight],
  )

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
      uSunPosition: { value: SYSTEM_OFFSET },
      uLight: { value: sunlight.strength },
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

    // Focus: while one planet is the subject, the others shrink to distant
    // dots so oversized outer planets never loom behind a close-up
    const chapter = Math.floor(safeProgress)
    // which planet is the subject: the close-up's planet, or Earth for the
    // Pale Blue Dot (chapter 10); the others become points of light
    const subject =
      chapter >= 2 && chapter <= 9 ? chapter - 2 : chapter === 10 ? 2 : -1
    // In the Sun chapter the Sun is the subject: giants step back too
    const sunFocus = chapter === 1 && index >= 4
    const targetScale = sunFocus
      ? 0.35
      : subject < 0 || subject === index
        ? 1
        : 0.04 // a point of light, like a planet seen from another planet
    focusScale.current +=
      (targetScale - focusScale.current) * (1 - Math.exp(-delta * 3))
    orbit.current.scale.setScalar(focusScale.current)

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
    const targetOpacity = inPlanetChapter ? 0.04 : 0.55
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
    }

    // keep the Sun direction (in view space) current for Earth's night mask
    if (planet.name === 'Earth') {
      body.current.getWorldPosition(_earthWorld)
      earthNight.uSunDirView.value
        .copy(SYSTEM_OFFSET)
        .sub(_earthWorld)
        .transformDirection(camera.matrixWorldInverse)
    }

    if (!held) {
      body.current.rotation.y += delta * rotationSpeed
    } else if (spinState) {
      spinState.velocity = 0
    }

    if (spinState && isFocused) {
      body.current.rotation.y += spinState.pending
      spinState.pending = 0
      if (!spinState.dragging) {
        body.current.rotation.y += spinState.velocity * delta
        spinState.velocity *= Math.exp(-delta * 2.2)
      }
    }
  })

  return (
    <group
      position={SYSTEM_OFFSET}
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
            <sphereGeometry args={[1, 96, 96]} />

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
              <shaderMaterial
                uniforms={uniforms}
                vertexShader={PLANET_VERTEX_SHADER}
                fragmentShader={PLANET_FRAGMENT_SHADER}
                toneMapped={false}
              />
            )}
          </mesh>

          {planet.atmosphereColor && (
            <mesh scale={visualRadius * (planet.name === 'Venus' ? 1.085 : 1.055)}>
              <sphereGeometry args={[1, 64, 64]} />
              <shaderMaterial
                transparent
                depthWrite={false}
                side={THREE.FrontSide}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
                uniforms={atmosphereUniforms}
                vertexShader={ATMOSPHERE_VERTEX_SHADER}
                fragmentShader={ATMOSPHERE_FRAGMENT_SHADER}
              />
            </mesh>
          )}

          {planet.type === 'earth' && (
            <EarthCloudLayer
              radius={visualRadius}
              texture={sharpClouds ?? earthClouds}
            />
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
            />
          )}
        </group>

        {planet.type === 'earth' && <Moon sharp={sharp} />}

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

  useFrame((_, delta) => {
    if (cloud.current) {
      cloud.current.rotation.y += delta * 0.010
    }
  })

  if (!texture) return null

  return (
    <mesh ref={cloud} scale={radius * 1.012}>
      <sphereGeometry args={[1, 96, 96]} />
      <meshPhongMaterial
        color="#ffffff"
        alphaMap={texture}
        transparent
        opacity={0.85}
        depthWrite={false}
        shininess={0}
      />
    </mesh>
  )
}

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

    if (orbit.current) {
      orbit.current.rotation.y = time * MOON_ORBIT_SPEED
    }

    if (body.current) {
      body.current.rotation.y += delta * 0.004
    }
  })

  if (!map) return null

  return (
    <group rotation={[MOON_ORBIT_INCLINATION, 0, 0]}>
      <group ref={orbit}>
        <mesh
          ref={body}
          position={[MOON_ORBIT_RADIUS, 0, 0]}
          scale={MOON_RENDER_RADIUS}
        >
          <sphereGeometry args={[1, 96, 96]} />
          <meshPhongMaterial
            map={sharpMap ?? map}
            bumpMap={height ?? undefined}
            bumpScale={0.045}
            color="#ffffff"
            shininess={3}
            specular={MOON_SPECULAR}
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
      { name: 'Io', color: '#d8bb63', radius: 0.065, distance: 1.85, periodDays: 1.769, phase: 0.3 },
      { name: 'Europa', color: '#cdbfa3', radius: 0.056, distance: 2.3, periodDays: 3.551, phase: 2.2 },
      { name: 'Ganymede', color: '#9c8f80', radius: 0.094, distance: 2.95, periodDays: 7.155, phase: 4.1 },
      { name: 'Callisto', color: '#6e6359', radius: 0.086, distance: 3.7, periodDays: 16.689, phase: 5.5 },
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
}: {
  system: MoonSystemSpec
  planetRadius: number
  shadowUniforms?: MoonShadowUniforms
  sunlight?: { strength: number; tint: THREE.Color }
}) {
  const moonColors = useMemo(
    () =>
      system.moons.map((moon) => {
        const color = new THREE.Color(moon.color)
        if (sunlight) color.multiply(sunlight.tint).multiplyScalar(sunlight.strength)
        return color
      }),
    [system, sunlight],
  )
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
        uSunPosition: { value: SYSTEM_OFFSET },
        uLight: { value: sunlight?.strength ?? 1 },
      })),
    [system, sunlight],
  )
  const time = useRef(0)
  const referencePeriod = system.moons[0]?.periodDays ?? 1

  useFrame((_, delta) => {
    time.current += delta
    system.moons.forEach((moon, i) => {
      const arm = arms.current[i]
      if (!arm) return
      const seconds = system.baseSeconds * (moon.periodDays / referencePeriod)
      arm.rotation.y = moon.phase + (time.current / seconds) * Math.PI * 2
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
            <sphereGeometry args={[1, 32, 24]} />
            <meshStandardMaterial
              color={moonColors[i]}
              roughness={1}
              metalness={0}
            />
            {moon.haze && (
              <mesh scale={1.14}>
                <sphereGeometry args={[1, 32, 24]} />
                <shaderMaterial
                  transparent
                  depthWrite={false}
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

/* Saturn's rings from the real ring map: the texture is a radial strip,
   so each vertex's u coordinate is its distance across the ring. */
const SATURN_RING_TEXTURE = '/textures/planets/2k_saturn_ring_alpha.png'
/* ring extent in planet radii (matches the ring texture) */
const SATURN_RING_INNER = 1.24
const SATURN_RING_OUTER = 2.35

/* Rings lit by the Sun, with Saturn's own shadow cut across them:
   from each point on the ring, does the sunbeam hit the planet? */
const RING_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`

const RING_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uTint;
uniform vec3 uSunPosition;
uniform vec3 uPlanetCenter;
uniform float uPlanetRadius;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec4 ring = texture2D(uMap, vUv);
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
  gl_FragColor = vec4(ring.rgb * uTint * lit * glow, ring.a);
}`

type RingShadowUniforms = { uRingMap: { value: THREE.Texture | null } }

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
  const inner = radius * SATURN_RING_INNER
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

  useFrame(() => {
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

      const opacity = focused
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

  // Uranus and Neptune have thin, faint rings: a broad band read as a dark hole
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
