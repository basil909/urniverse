'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { NEBULAE } from './galaxyDive'
import { LOW_RES_GLSL, lowRes, lowResUniforms } from './lowRes'

/* ============================================================
   VOLUMETRIC NEBULAE
   The great star-forming clouds near the Sun (galaxyDive.ts says where):
   each a volume of glowing gas, marched along every line of sight
   through it: red hydrogen-alpha in its outer reaches, oxygen's teal in
   its hot heart, lit from within by young stars, dark dust lanes eating
   into it. Shaped by warped noise, so no two look alike; the Rosette a
   ring with a hollow heart. Drawn at half resolution with the air and
   the clouds (lowRes.ts), stopping at anything in front.
============================================================ */

const NEBULA_VERTEX = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const NEBULA_FRAGMENT = /* glsl */ `
${LOW_RES_GLSL}
uniform vec3 uCam;
uniform vec3 uHa;
uniform vec3 uO3;
uniform float uHollow;
uniform float uSeed;
uniform float uBright;
uniform float uTime;
uniform float uOpacity;
varying vec3 vPos;
#ifndef U_DYN
#define U_DYN
/* always 0 (never set): added to a loop count so that the Direct3D shader
   compiler behind WebGL on Windows cannot unroll the loop; unrolled, it
   took seconds and stalled the page while the shaders compiled */
uniform int uDyn;
#endif

float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y), mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4 + uDyn; i++) { v += noise(p) * a; p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return v; }

void main() {
  sceneOcclusion();
  // the line of sight through the nebula (a sphere of radius 1 here)
  vec3 ro = uCam;
  vec3 rd = normalize(vPos - uCam);
  float b = dot(ro, rd);
  float c = dot(ro, ro) - 1.0;
  float h = b * b - c;
  if (h < 0.0) discard;
  h = sqrt(h);
  float t0 = max(-b - h, 0.0);
  float t1 = -b + h;
  if (t1 <= t0) discard;

  const int STEPS = 40;
  float dt = (t1 - t0) / float(STEPS);
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float through = 1.0;
  vec3 glow = vec3(0.0);
  for (int i = 0; i < STEPS + uDyn; i++) {
    vec3 p = ro + rd * (t0 + (float(i) + jitter) * dt);
    float r = length(p);
    vec3 q = p * 1.7 + uSeed;
    vec3 warp = vec3(fbm(q + 3.1), fbm(q + 7.7 + uTime * 0.002), fbm(q + 1.3)) - 0.5;
    float n = fbm(q * 1.25 + warp * 1.8);
    // the cloud's shape: a soft ball, or a ring round a hollow
    float shape = uHollow > 0.5
      ? smoothstep(0.18, 0.5, r) * (1.0 - smoothstep(0.72, 1.0, r))
      : 1.0 - smoothstep(0.2, 1.0, r);
    // (eaten away towards the edge into wisps, no ball's outline)
    float gas = max(n - 0.4 - 0.22 * r * r, 0.0) * 2.8 * shape;
    float dust = smoothstep(0.56, 0.74, fbm(q * 2.2 + 11.0 + warp)) * shape;
    // red at its edges, teal in the hot heart (where the young stars are)
    float heart = (1.0 - smoothstep(0.0, 0.6, r)) * smoothstep(0.3, 0.75, n) * (1.0 - uHollow);
    vec3 light = mix(uHa, uO3, heart) * gas;
    // the young stars at the heart, lighting it
    light += vec3(1.0, 0.94, 0.86) * exp(-r * r * 55.0) * 0.7 * (1.0 - uHollow);
    glow += through * light * dt * 3.2 * uBright;
    through *= exp(-(dust * 3.4 + gas * 0.5) * dt * 2.4);
    if (through < 0.02) break;
  }
  // (premultiplied: the light added, what lies behind dimmed by the dust)
  gl_FragColor = vec4(glow * uOpacity, (1.0 - through) * 0.9 * uOpacity);
}`

const _cam = new THREE.Vector3()

export default function Nebulae() {
  const camera = useThree((state) => state.camera)
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 32, 24), [])
  const materials = useMemo(
    () =>
      NEBULAE.map(
        (nebula) =>
          new THREE.ShaderMaterial({
            uniforms: {
              uCam: { value: new THREE.Vector3() },
              uHa: { value: new THREE.Vector3(...nebula.ha) },
              uO3: { value: new THREE.Vector3(...nebula.o3) },
              uHollow: { value: nebula.hollow },
              uSeed: { value: nebula.seed },
              uBright: { value: nebula.bright },
              uTime: { value: 0 },
              uOpacity: { value: 0 },
              ...lowResUniforms,
            },
            vertexShader: NEBULA_VERTEX,
            fragmentShader: NEBULA_FRAGMENT,
            // (inside out: drawn from within too)
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false,
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            toneMapped: false,
          }),
      ),
    [],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      materials.forEach((material) => material.dispose())
    },
    [geometry, materials],
  )
  useFrame((_, delta) => {
    meshes.current.forEach((mesh, i) => {
      if (!mesh || !mesh.parent) return
      const u = materials[i].uniforms
      // the camera in the nebula's own frame (a sphere of radius 1)
      u.uCam.value.copy(mesh.worldToLocal(_cam.copy(camera.position)))
      // seen only near (at the galaxy's scale a nebula is far too small to
      // see: they are drawn some ten times their size for the way down);
      // distance in the nebula's own radii
      const away = u.uCam.value.length()
      u.uOpacity.value = 1 - THREE.MathUtils.smoothstep(away, 5, 14)
      mesh.visible = u.uOpacity.value > 0.002
      u.uTime.value += delta
      u.uSceneDepth.value = lowResUniforms.uSceneDepth.value
      u.uSceneDepthOn.value = lowResUniforms.uSceneDepthOn.value
    })
  })
  return (
    <>
      {NEBULAE.map((nebula, i) => (
        <mesh
          key={nebula.name}
          ref={(mesh) => {
            meshes.current[i] = mesh
            lowRes(mesh)
          }}
          geometry={geometry}
          material={materials[i]}
          position={nebula.at}
          scale={nebula.radius}
          frustumCulled
        />
      ))}
    </>
  )
}
