'use client'

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import {
  getPlanetOrbitEllipsePoint,
  getPlanetOrbitPosition,
  orbitalDisplayDistance,
  getPlanetVisualRadius,
  PLANETS,
  SYSTEM_OFFSET,
} from './orbit'

/*
 * Place the corrected full-bleed equirectangular maps here:
 * - earth-blue-marble.png -> fixed 2:1 surface map
 * - earth-clouds.png      -> grayscale cloud map
 */
const EARTH_LOCAL_TEXTURES = {
  color: '/textures/earth-blue-marble.png',
  // grayscale density map extracted from the alpha channel of earth-clouds.png
  clouds: '/textures/earth-clouds-alpha.jpg',
  normal: '/textures/earth-normal.jpg',
  specular: '/textures/earth-specular.jpg',
} as const

const MOON_LOCAL_TEXTURES = {
  color: '/textures/moon-lroc.jpg',
  height: '/textures/moon-height.jpg',
} as const

const MOON_RENDER_RADIUS = 0.072
const MOON_ORBIT_RADIUS = 1.28
const MOON_ORBIT_INCLINATION = THREE.MathUtils.degToRad(5.145)
const MOON_ORBIT_SPEED = 0.055


const EARTH_SPECULAR = new THREE.Color('#2b4766')
const MOON_SPECULAR = new THREE.Color('#222222')

const _scratchOrbitPos = new THREE.Vector3()

/* Planet surface maps by orbit index (Earth uses EARTH_LOCAL_TEXTURES) */
const PLANET_TEXTURES: (string | undefined)[] = [
  '/textures/planets/2k_mercury.jpg',
  '/textures/planets/2k_venus_atmosphere.jpg',
  undefined,
  '/textures/planets/2k_mars.jpg',
  '/textures/planets/2k_jupiter.jpg',
  '/textures/planets/2k_saturn.jpg',
  '/textures/planets/2k_uranus.jpg',
  '/textures/planets/2k_neptune.jpg',
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

float noise(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f); float n000 = hash(i); float n100 = hash(i + vec3(1,0,0)); float n010 = hash(i + vec3(0,1,0)); float n110 = hash(i + vec3(1,1,0)); float n001 = hash(i + vec3(0,0,1)); float n101 = hash(i + vec3(1,0,1)); float n011 = hash(i + vec3(0,1,1)); float n111 = hash(i + vec3(1,1,1)); float nx00 = mix(n000, n100, f.x); float nx10 = mix(n010, n110, f.x); float nx01 = mix(n001, n101, f.x); float nx11 = mix(n011, n111, f.x); float nxy0 = mix(nx00, nx10, f.y); float nxy1 = mix(nx01, nx11, f.y); return mix(nxy0, nxy1, f.z); }

float fbm(vec3 p) { float v = 0.0; float a = 0.5; v += noise(p) * a; p *= 2.02; a *= 0.5; v += noise(p) * a; p *= 2.03; a *= 0.5; v += noise(p) * a; p *= 2.01; a *= 0.5; v += noise(p) * a; p *= 2.02; a *= 0.5; v += noise(p) * a; return v; }

void main() {

  vec3 normal = normalize(vNormal); vec3 p = vLocalPosition * 3.0; p.y += uTime * 0.035;

  float large = fbm(p * 1.35); float medium = fbm(p * 5.0 + vec3(uTime * 0.03, 0, 0)); float fine = noise(p * 16.0 + vec3(0, uTime * 0.04, 0));

  float surface = large * 0.55 + medium * 0.30 + fine * 0.15; surface = smoothstep(0.18, 0.82, surface);

  vec3 dark = vec3(0.42, 0.025, 0.002); vec3 orange = vec3(0.95, 0.14, 0.01); vec3 gold = vec3(1.0, 0.50, 0.035); vec3 whiteHot = vec3(1.0, 0.88, 0.55);

  vec3 color = mix(dark, orange, surface); color = mix(color, gold, smoothstep(0.48, 0.76, surface)); color = mix(color, whiteHot, smoothstep(0.78, 1.0, surface));

  float spots = smoothstep(0.76, 0.91, fbm(vLocalPosition * 2.4)); color = mix(color, color * 0.35, spots * 0.7);

  vec3 viewDirection = normalize(cameraPosition - vWorldPosition); float facing = max(dot(normal, viewDirection), 0.0); float limb = pow(facing, 0.42);

  color *= mix(0.58, 1.08, limb); color *= 0.98 + 0.025 * sin(uTime * 1.5 + large * 9.0); color *= 1.65;

  gl_FragColor = vec4(color, 1.0);

}`



const ATMOSPHERE_VERTEX_SHADER = /* glsl */ `

varying vec3 vNormal; varying vec3 vWorldPosition;

void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPosition = wp.xyz; vNormal = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`



const ATMOSPHERE_FRAGMENT_SHADER = /* glsl */ `

uniform vec3 uColor; uniform float uIntensity; varying vec3 vNormal; varying vec3 vWorldPosition;

void main() { vec3 vd = normalize(cameraPosition - vWorldPosition); float f = 1.0 - max(dot(normalize(vNormal), vd), 0.0); f = pow(f, 3.2); float edge = smoothstep(0.08, 0.92, f); vec3 c = uColor * edge * uIntensity; gl_FragColor = vec4(c, edge * uIntensity); }`



const PLANET_VERTEX_SHADER = /* glsl */ `

varying vec3 vWorldPosition; varying vec3 vNormal; varying vec2 vUv; varying vec3 vLocalPosition;

void main() { vUv = uv; vNormal = normalize(mat3(modelMatrix) * normal); vLocalPosition = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPosition = wp.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`



const PLANET_FRAGMENT_SHADER = /* glsl */ `

uniform float uTime; uniform int uType; uniform int uPlanet; uniform vec3 uBaseColor; uniform vec3 uAtmosphereColor; uniform vec3 uSunPosition; uniform sampler2D uMap; uniform float uHasMap;

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

  float rim = pow(1.0 - facing, 3.5);
  vec3 color = surface * (0.035 + light * 0.965) * limb;
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

  /* Milky Way finale (chapter 11): the whole Solar System shrinks to
     nothing, so the galaxy's "You are here" marker stands for it */
  const system = useRef<THREE.Group>(null)
  const systemScale = useRef(1)

  useFrame((_, delta) => {
    if (!system.current) return
    const progress = progressRef.current ?? 0
    const local = progress - 11
    const target = local >= 0.05 && local < 0.97 ? 0.0001 : 1
    systemScale.current +=
      (target - systemScale.current) * (1 - Math.exp(-delta * 2.5))
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
  const coronaOuter = useRef<THREE.Mesh>(null)
  const coronaInner = useRef<THREE.Mesh>(null)
  const coronaHalo = useRef<THREE.Mesh>(null)
  const camera = useThree((state) => state.camera)
  const material = useRef<THREE.ShaderMaterial>(null)
  const timeRef = useRef(0)

  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])

  useFrame((_, delta) => {
    const time = (timeRef.current += delta)

    if (material.current) {
      material.current.uniforms.uTime.value = time
    }

    if (sun.current) {
      sun.current.rotation.y += delta * 0.012
      sun.current.rotation.x = Math.sin(time * 0.08) * 0.015
    }

    /* Fade the back-faced glow shells when the camera is close, so the
       Sun's light never washes over a planet in focus (e.g. Mercury) */
    const sunDistance = camera.position.distanceTo(SYSTEM_OFFSET)
    const glowFade = THREE.MathUtils.clamp((sunDistance - 2.2) / 4, 0, 1)
    const shells: [THREE.Mesh | null, number][] = [
      [coronaInner.current, 0.075],
      [coronaOuter.current, 0.032],
      [coronaHalo.current, 0.012],
    ]
    for (const [mesh, base] of shells) {
      if (mesh) {
        ;(mesh.material as THREE.MeshBasicMaterial).opacity = base * glowFade
      }
    }

    if (coronaInner.current) {
      const pulse =
        1 +
        Math.sin(time * 0.75) * 0.025 +
        Math.sin(time * 1.9) * 0.008

      coronaInner.current.scale.setScalar(1.075 * pulse)
      coronaInner.current.rotation.y = time * 0.018
    }

    if (coronaOuter.current) {
      const pulse = 1 + Math.sin(time * 0.42 + 1.5) * 0.035
      coronaOuter.current.scale.setScalar(1.16 * pulse)
      coronaOuter.current.rotation.y = -time * 0.008
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

      <mesh ref={coronaInner} scale={1.075}>
        <sphereGeometry args={[1, 96, 96]} />
        <meshBasicMaterial
          color="#ffb347"
          transparent
          opacity={0.075}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={coronaOuter} scale={1.16}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial
          color="#ff6b1a"
          transparent
          opacity={0.032}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={coronaHalo} scale={1.32}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial
          color="#ff8a24"
          transparent
          opacity={0.012}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <pointLight
        color="#fff0d0"
        intensity={2.2}
        distance={0}
        decay={0}
      />
    </group>
  )
}

/* ============================================================
   PLANET
============================================================ */

function Planet({
  planet,
  index,
  progressRef,
}: {
  planet: (typeof PLANETS)[number]
  index: number
  progressRef: RefObject<number>
}) {
  const orbit = useRef<THREE.Group>(null)
  const body = useRef<THREE.Mesh>(null)
  const timeRef = useRef(0)
  const focusScale = useRef(1)
  const { gl } = useThree()

  const visualRadius = getPlanetVisualRadius(index)
  const inclination = THREE.MathUtils.degToRad(
    planet.inclinationDeg,
  )
  const axialTilt = THREE.MathUtils.degToRad(
    planet.axialTiltDeg,
  )
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
    }),
    [planet, planetType, index],
  )

  const atmosphereUniforms = useMemo(
    () => ({
      uColor: {
        value: new THREE.Color(
          planet.atmosphereColor ?? '#000000',
        ),
      },
      uIntensity: {
        value:
          planet.type === 'earth'
            ? 0.72
            : planet.type === 'gas'
              ? 0.30
              : 0.38,
      },
    }),
    [planet],
  )

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

        uniforms.uMap.value = loaded
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

      uniforms.uMap.value = null
      uniforms.uHasMap.value = 0
    }
  }, [gl, index, uniforms])

  const [earthMap, setEarthMap] =
    useState<THREE.Texture | null>(null)
  const [earthClouds, setEarthClouds] =
    useState<THREE.Texture | null>(null)
  const [earthNormal, setEarthNormal] =
    useState<THREE.Texture | null>(null)
  const [earthSpecular, setEarthSpecular] =
    useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (planet.name !== 'Earth') {
      setEarthMap(null)
      setEarthClouds(null)
      setEarthNormal(null)
      setEarthSpecular(null)
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

    return () => {
      cancelled = true
      owned.forEach((asset) => asset.dispose())
      setEarthMap(null)
      setEarthClouds(null)
      setEarthNormal(null)
      setEarthSpecular(null)
    }
  }, [gl, planet.name])

  const rotationSpeed =
    (24 / Math.abs(planet.rotationPeriodHours)) * 0.12

  const orbitLine = useMemo(() => {
    const segments = 160
    const positions = new Float32Array((segments + 1) * 3)
    const point = new THREE.Vector3()

    for (let i = 0; i <= segments; i += 1) {
      const E = (i / segments) * Math.PI * 2

      getPlanetOrbitEllipsePoint(index, E, point)

      positions[i * 3] = point.x
      positions[i * 3 + 1] = point.y
      positions[i * 3 + 2] = point.z
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    )

    const material = new THREE.LineBasicMaterial({
      color: '#9aa6b4',
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    })

    return new THREE.LineLoop(geometry, material)
  }, [index])

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

    getPlanetOrbitPosition(
      index,
      safeProgress,
      _scratchOrbitPos,
    )
    orbit.current.position.copy(_scratchOrbitPos)

    // Focus: while one planet is the subject, the others shrink to distant
    // dots so oversized outer planets never loom behind a close-up
    const chapter = Math.floor(safeProgress)
    const focusing = chapter >= 2 && chapter <= 9
    // In the Sun chapter the Sun is the subject: giants step back too
    const sunFocus = chapter === 1 && index >= 4
    const targetScale = sunFocus
      ? 0.35
      : !focusing || chapter - 2 === index
        ? 1
        : 0.1
    focusScale.current +=
      (targetScale - focusScale.current) * (1 - Math.exp(-delta * 3))
    orbit.current.scale.setScalar(focusScale.current)

    // Fade orbit lines while a planet is in focus so they don't streak across it
    const inPlanetChapter = safeProgress >= 2.1 && safeProgress < 10
    const lineMat = orbitLine.material as THREE.LineBasicMaterial
    const targetOpacity = inPlanetChapter ? 0.02 : 0.15
    lineMat.opacity +=
      (targetOpacity - lineMat.opacity) * (1 - Math.exp(-delta * 4))

    if (materialIsShader(body.current.material)) {
      body.current.material.uniforms.uTime.value = time
    }

    body.current.rotation.y += delta * rotationSpeed
  })

  return (
    <group
      position={SYSTEM_OFFSET}
      rotation={[inclination, 0, 0]}
    >
      <primitive object={orbitLine} />

      <group ref={orbit}>
        <group rotation={[0, 0, axialTilt]}>
          <mesh ref={body} scale={visualRadius}>
            <sphereGeometry args={[1, 96, 96]} />

            {planet.name === 'Earth' && earthMap ? (
              <meshPhongMaterial
                map={earthMap}
                normalMap={earthNormal ?? undefined}
                normalScale={[0.34, 0.34]}
                specularMap={earthSpecular ?? undefined}
                specular={EARTH_SPECULAR}
                shininess={16}
                color="#ffffff"
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
            <mesh scale={visualRadius * 1.055}>
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
              texture={earthClouds}
            />
          )}

          {planet.rings && (
            <PlanetRings
              planet={planet}
              radius={visualRadius}
            />
          )}
        </group>

        {planet.type === 'earth' && <Moon />}
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

function Moon() {
  const { gl } = useThree()
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
            map={map}
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

/* Saturn's rings from the real ring map: the texture is a radial strip,
   so each vertex's u coordinate is its distance across the ring. */
const SATURN_RING_TEXTURE = '/textures/planets/2k_saturn_ring_alpha.png'

function SaturnRing({ radius }: { radius: number }) {
  const [map, setMap] = useState<THREE.Texture | null>(null)
  const inner = radius * 1.24
  const outer = radius * 2.35

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

  useEffect(() => () => geometry.dispose(), [geometry])

  useEffect(() => {
    let disposed = false
    let loadedTexture: THREE.Texture | null = null

    new THREE.TextureLoader().load(SATURN_RING_TEXTURE, (texture) => {
      if (disposed) {
        texture.dispose()
        return
      }
      texture.colorSpace = THREE.SRGBColorSpace
      loadedTexture = texture
      setMap(texture)
    })

    return () => {
      disposed = true
      loadedTexture?.dispose()
    }
  }, [])

  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} geometry={geometry}>
      {map ? (
        // keyed + explicit opacity: swapping materials in place reset opacity to 0
        <meshBasicMaterial
          key="textured"
          map={map}
          color="#efe3c8"
          transparent
          opacity={1}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      ) : (
        <meshBasicMaterial
          key="fallback"
          color="#c8b48d"
          transparent
          opacity={0.45}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      )}
    </mesh>
  )
}

function PlanetRings({
  planet,
  radius,
}: {
  planet: (typeof PLANETS)[number]
  radius: number
}) {
  const isSaturn = planet.name === 'Saturn'
  const isUranus = planet.name === 'Uranus'

  if (isSaturn) return <SaturnRing radius={radius} />
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
