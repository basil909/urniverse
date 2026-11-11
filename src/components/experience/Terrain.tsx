'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { pilot } from './pilotState'
import { CLOSE_DETAIL_GLSL } from './closeDetail'
import { SURFACE_PATCH_GLSL, surfacePatch } from './surfaceTiles'
import { aimEarthGround, earthElevation, earthGround, releaseEarthGround } from './earthTiles'
import { sphereUv } from './groundState'
import { GROUND, GROUND_GLSL, GroundModel, ground, groundHole, shipShadow } from './groundState'

/* The patch of ground under the ship (see groundState.ts). A child of the
   planet's sphere, so it turns with it; its vertices are placed on the
   GPU, in rings around the point below the ship: 1 m apart there, a few
   km apart at the horizon. Positions are measured from the patch's
   centre, so 32-bit floats stay exact to centimetres where it matters. */

const RINGS = 140
const SEGMENTS = 200
/** the finest ring, in planet radii (about a metre on Earth) */
const INNER = 1.5e-7

const TERRAIN_VERTEX = /* glsl */ `
attribute vec2 aPolar; // ring position 0..1, angle
uniform vec3 uC; uniform vec3 uE1; uniform vec3 uE2;
uniform float uH0; uniform float uSmin; uniform float uSmax;
uniform vec3 uSunL;
varying vec3 vDir; varying vec3 vNormalL; varying vec3 vViewPos; varying float vEdge;
varying vec3 vUpView; varying vec3 vSunView;
${GROUND_GLSL}
void main() {
  float t = aPolar.x;
  float th = aPolar.y;
  float s = t <= 0.0 ? 0.0 : uSmin * pow(uSmax / uSmin, t);
  vec3 T = uE1 * cos(th) + uE2 * sin(th);
  vec3 B = uE2 * cos(th) - uE1 * sin(th);
  float sn = sin(s);
  float cs = cos(s);
  vec3 dir = normalize(uC * cs + T * sn);
  float spacing = max(s * 0.08, uSmin * 2.0);
  // the rim eases back down to the sphere it replaces
  float rim = 1.0 - smoothstep(0.75, 1.0, s / uSmax);
  float h = gHeight(dir, spacing) * rim;
  // slope, for the normal (steps no finer than ~10 m: 32-bit limits)
  float e = max(spacing, 1.5e-6);
  vec3 radial = normalize(T * cs - uC * sn);
  float hA = gHeight(normalize(dir + radial * e), spacing) * rim;
  float hB = gHeight(normalize(dir + B * e), spacing) * rim;
  vNormalL = normalize(dir - radial * (hA - h) / e - B * (hB - h) / e);
  vDir = dir;
  vEdge = s / uSmax;
  // for the sea's glint: the level sea's normal and the Sun, in view space
  vUpView = normalize(normalMatrix * dir);
  vSunView = normalize(normalMatrix * uSunL);
  // relative to the patch's centre, written to stay exact for small s
  float hs = sin(0.5 * s);
  vec3 rel = uC * ((h - uH0) - (1.0 + h) * 2.0 * hs * hs) + T * (1.0 + h) * sn;
  vec4 mv = modelViewMatrix * vec4(rel, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`

const TERRAIN_FRAGMENT = /* glsl */ `
uniform sampler2D uMap; uniform int uPlanetId;
uniform vec3 uSunL; uniform float uLight; uniform vec3 uLightTint;
uniform vec3 uSky; uniform float uSkyLight; uniform vec3 uHaze; uniform float uHazeK; uniform float uWorldRadius;
uniform float uEarth; uniform float uAlbedo;
uniform sampler2D uNight; uniform float uHasNight;
uniform sampler2D uImgFine; uniform vec4 uImgFineRect; uniform sampler2D uImgCoarse; uniform vec4 uImgCoarseRect;
uniform vec3 uShipView; uniform vec3 uShipFwd; uniform vec3 uShipRight; uniform float uShipLen; uniform float uShipShadow;
/* the Shuttle's shadow: is the way to the Sun blocked by its body or wings
   (a few overlapping discs along the hull)? Soft-edged, as the Sun is
   half a degree wide */
float shipShade(vec3 p, vec3 sun) {
  if (uShipShadow < 0.5) return 0.0;
  float shade = 0.0;
  for (int i = 0; i < 5; i++) {
    vec3 c = uShipView;
    float r = uShipLen * 0.1;
    if (i == 0) { c += uShipFwd * uShipLen * 0.36; r = uShipLen * 0.07; }
    if (i == 1) { c += uShipFwd * uShipLen * 0.08; r = uShipLen * 0.1; }
    if (i == 2) { c -= uShipFwd * uShipLen * 0.3; r = uShipLen * 0.11; }
    if (i == 3) { c += uShipRight * uShipLen * 0.24 - uShipFwd * uShipLen * 0.2; r = uShipLen * 0.12; }
    if (i == 4) { c -= uShipRight * uShipLen * 0.24 + uShipFwd * uShipLen * 0.2; r = uShipLen * 0.12; }
    vec3 w = c - p;
    float along = dot(w, sun);
    if (along <= 0.0) continue;
    float off = length(w - sun * along);
    float blur = r * 0.25 + along * 0.0047;
    shade = max(shade, 1.0 - smoothstep(r - blur, r + blur, off));
  }
  return shade;
}
varying vec3 vDir; varying vec3 vNormalL; varying vec3 vViewPos; varying float vEdge;
varying vec3 vUpView; varying vec3 vSunView;
${GROUND_GLSL}
${CLOSE_DETAIL_GLSL}
${SURFACE_PATCH_GLSL}
void main() {
  vec3 d = normalize(vDir);
  vec2 uv = gUv(d);
  vec3 base = texture2D(uMap, uv).rgb;
  if (uPatchPlanet == uPlanetId) base = patched(base, uPatchFine, uPatchFineRect, uPatchCoarse, uPatchCoarseRect, uv, uPatchGain).rgb;
  // Earth, low down: Sentinel-2 imagery, about 10 m a pixel
  if (uEarth > 0.5) base = patched(base, uImgFine, uImgFineRect, uImgCoarse, uImgCoarseRect, vec2(uv.x, gMercV(uv)), vec3(1.0)).rgb;
  base *= uAlbedo;
  float land = gLandAt(uv);
  vec3 n = normalize(vNormalL);
  // fine tone below the maps, and bare rock on steep slopes
  vec3 cd = closeDetail(d, 0.6, 1.0);
  base *= 1.0 + cd.y * (uEarth > 0.5 ? 0.12 : 0.3) * land;
  float slope = 1.0 - dot(n, d);
  base = mix(base, base * vec3(0.8, 0.76, 0.72), smoothstep(0.03, 0.2, slope) * land);
  float sunUp = dot(d, uSunL);
  float day = smoothstep(-0.12, 0.08, sunUp);
  float lit = max(dot(n, uSunL), 0.0) * smoothstep(-0.05, 0.05, sunUp);
  lit *= 1.0 - 0.88 * shipShade(vViewPos, normalize(vSunView));
  // sunlight, plus light from the sky itself (none on airless Mercury)
  vec3 color = base * (vec3(0.02) + lit * uLight * uLightTint + uSky * uSkyLight * day * (0.6 + 0.4 * dot(n, d)));
  // Earth's sea: darker, with the Sun's glint
  if (uEarth > 0.5 && land < 0.99) {
    vec3 viewDir = normalize(-vViewPos);
    vec3 nView = normalize(vUpView);
    vec3 sunView = normalize(vSunView);
    float glint = pow(max(dot(reflect(-sunView, nView), viewDir), 0.0), 220.0) * 3.0 + pow(max(dot(reflect(-sunView, nView), viewDir), 0.0), 18.0) * 0.12;
    vec3 sea = base * 0.85 * (0.05 + lit * uLight) + vec3(1.0, 0.93, 0.8) * glint * lit;
    color = mix(sea, color, land);
  }
  // Earth at night: its cities, from the ground as from orbit
  if (uEarth > 0.5 && uHasNight > 0.5) {
    vec3 lights = texture2D(uNight, uv).rgb;
    if (uPatchPlanet == uPlanetId) lights = patched(lights, uNightFine, uNightFineRect, uNightCoarse, uNightCoarseRect, uv, vec3(1.0)).rgb;
    float dark = 1.0 - smoothstep(-0.15, 0.05, sunUp);
    color += lights * vec3(1.0, 0.74, 0.46) * 1.4 * dark * land;
  }
  // air between here and the ground far off (aerial perspective)
  float dist = length(vViewPos) / uWorldRadius;
  float haze = 1.0 - exp(-dist * uHazeK);
  color = mix(color, uHaze * uLight * day, haze);
  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
}`

function terrainGeometry() {
  const count = (RINGS + 1) * SEGMENTS
  const polar = new Float32Array(count * 2)
  for (let i = 0; i <= RINGS; i += 1) {
    for (let j = 0; j < SEGMENTS; j += 1) {
      const v = i * SEGMENTS + j
      polar[v * 2] = i / RINGS
      polar[v * 2 + 1] = (j / SEGMENTS) * Math.PI * 2
    }
  }
  const index: number[] = []
  for (let i = 0; i < RINGS; i += 1) {
    for (let j = 0; j < SEGMENTS; j += 1) {
      const a = i * SEGMENTS + j
      const b = i * SEGMENTS + ((j + 1) % SEGMENTS)
      const c = (i + 1) * SEGMENTS + j
      const d = (i + 1) * SEGMENTS + ((j + 1) % SEGMENTS)
      index.push(a, c, b, b, c, d)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geometry.setAttribute('aPolar', new THREE.BufferAttribute(polar, 2))
  geometry.setIndex(index)
  return geometry
}

/* sky colour and how thick the air looks over distance, per planet */
const LOOK: Record<number, { sky: string; skyLight: number; hazeK: number; albedo?: number }> = {
  0: { sky: '#000000', skyLight: 0, hazeK: 0 },
  2: { sky: '#7fb0ff', skyLight: 0.28, hazeK: 60 },
  3: { sky: '#d9a07a', skyLight: 0.22, hazeK: 22 },
  // the Moon's map is brightened; the real ground is as dark as asphalt
  12: { sky: '#000000', skyLight: 0, hazeK: 0, albedo: 0.42 },
}

const _ship = new THREE.Vector3()
const _c = new THREE.Vector3()
const _e1 = new THREE.Vector3()
const _e2 = new THREE.Vector3()
const _sun = new THREE.Vector3()
const _scale = new THREE.Vector3()

export default function Terrain({
  index,
  map,
  sunPosition,
  light,
  lightTint,
  earth = false,
  srgb = false,
  night,
}: {
  index: number
  map: () => THREE.Texture | null
  sunPosition: THREE.Vector3
  light: number
  lightTint: THREE.Color
  earth?: boolean
  /** the map is sRGB (lit like three.js's own materials) */
  srgb?: boolean
  /** Earth's city lights */
  night?: () => THREE.Texture | null
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const config = GROUND[index]
  const model = useMemo(() => new GroundModel(config), [config])
  const geometry = useMemo(terrainGeometry, [])
  const reliefTexture = useMemo(() => {
    if (!config.heightMap && !config.seaMap) return null
    // filled in by an effect below (loading while rendering upsets React)
    const texture = new THREE.Texture()
    texture.colorSpace = THREE.NoColorSpace
    texture.wrapS = THREE.RepeatWrapping
    return texture
  }, [config])
  useEffect(() => {
    if (!reliefTexture) return
    let cancelled = false
    new THREE.ImageLoader().load(config.heightMap ?? config.seaMap!, (image) => {
      if (cancelled) return
      reliefTexture.image = image
      reliefTexture.needsUpdate = true
    })
    return () => {
      cancelled = true
    }
  }, [reliefTexture, config])
  const look = LOOK[index]
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uC: { value: new THREE.Vector3(0, 1, 0) },
          uE1: { value: new THREE.Vector3(1, 0, 0) },
          uE2: { value: new THREE.Vector3(0, 0, 1) },
          uH0: { value: 0 },
          uSmin: { value: INNER },
          uSmax: { value: 0.01 },
          uReliefMap: { value: config.heightMap ? reliefTexture : null },
          uHasRelief: { value: config.heightMap ? 1 : 0 },
          uRelief: { value: model.reliefRadii },
          uSeaMap: { value: config.seaMap ? reliefTexture : null },
          uHasSea: { value: config.seaMap ? 1 : 0 },
          uRough: { value: model.roughRadii },
          uRidged: { value: config.ridged },
          uDetailFreq: { value: model.detailFreq },
          uGroundFade: { value: 0 },
          uMap: { value: null as THREE.Texture | null },
          uPlanetId: { value: index },
          uSunL: { value: new THREE.Vector3(1, 0, 0) },
          uLight: { value: light },
          uLightTint: { value: lightTint },
          uSky: { value: new THREE.Color(look.sky) },
          uSkyLight: { value: look.skyLight },
          uHaze: { value: new THREE.Color(look.sky) },
          uHazeK: { value: look.hazeK },
          uWorldRadius: { value: 1 },
          uEarth: { value: earth ? 1 : 0 },
          uAlbedo: { value: look.albedo ?? 1 },
          uNight: { value: null as THREE.Texture | null },
          uHasNight: { value: 0 },
          ...surfacePatch,
          ...shipShadow,
          ...earthGround,
          uEarthElev: { value: earth ? 1 : 0 },
          uRadiusM: { value: config.radiusKm * 1000 },
        },
        vertexShader: TERRAIN_VERTEX,
        fragmentShader: TERRAIN_FRAGMENT,
        toneMapped: earth || srgb,
      }),
    [config, model, reliefTexture, index, light, lightTint, look, earth, srgb],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
      reliefTexture?.dispose()
    },
    [geometry, material, reliefTexture],
  )

  useFrame((_, delta) => {
    const patch = mesh.current
    const body = patch?.parent
    if (!patch || !body) return
    const near = pilot.active && pilot.nearestIndex === index && model.ready
    if (near) {
      _ship.copy(pilot.shipWorld)
      body.updateWorldMatrix(true, false)
      ground.inverse.copy(body.matrixWorld).invert()
      _c.copy(_ship).applyMatrix4(ground.inverse)
    }
    const altitude = near ? _c.length() - 1 : Infinity
    const active = near && altitude < 0.05
    patch.visible = active
    if (!active) {
      if (earth) {
        releaseEarthGround()
        model.elevation = null
      }
      if (ground.body === index) {
        ground.body = -2
        ground.model = null
        groundHole.uHolePlanet.value = -2
      }
      return
    }
    _c.normalize()
    const fade = 1 - THREE.MathUtils.smoothstep(altitude, 0.03, 0.05)
    // the patch reaches past the horizon
    const horizon = Math.acos(1 / (1 + Math.max(altitude, 1e-7)))
    const reach = THREE.MathUtils.clamp(horizon * 1.35 + 0.002, 0.004, 0.45)
    _e1.set(0, 1, 0).cross(_c)
    if (_e1.lengthSq() < 1e-10) _e1.set(1, 0, 0)
    _e1.normalize()
    _e2.copy(_c).cross(_e1)
    // Earth: stream real elevation and imagery under the ship
    if (earth) {
      const [u, v] = sphereUv(_c)
      aimEarthGround(u * 360 - 180, v * 180 - 90, altitude * config.radiusKm, delta)
      model.elevation = earthElevation
    }
    const h0 = model.height(_c, fade)
    patch.position.copy(_c).multiplyScalar(1 + h0)
    const u = material.uniforms
    u.uC.value.copy(_c)
    u.uE1.value.copy(_e1)
    u.uE2.value.copy(_e2)
    u.uH0.value = h0
    u.uSmax.value = reach
    u.uGroundFade.value = fade
    u.uMap.value = map()
    const lights = night?.() ?? null
    u.uNight.value = lights
    u.uHasNight.value = lights ? 1 : 0
    body.getWorldScale(_scale)
    u.uWorldRadius.value = _scale.x
    _sun.copy(sunPosition).applyMatrix4(ground.inverse).normalize()
    u.uSunL.value.copy(_sun)
    // for the pilot: the ground's height function and this frame
    ground.body = index
    ground.model = model
    ground.fade = fade
    ground.ready = true
    ground.matrix.copy(body.matrixWorld)
    ground.worldRadius = _scale.x
    // cut the sphere away under the patch
    groundHole.uHolePlanet.value = index
    groundHole.uHoleDir.value.copy(_c)
    groundHole.uHoleCos.value = Math.cos(reach * 0.9)
  })

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} visible={false} renderOrder={1} />
}
