'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { pilot } from './pilotState'
import { CLOUD_GLSL, cloudVolume } from './clouds'

/* The 3D cloud layer (see clouds.ts), drawn on two shells, the top and
   the base of the layer, each a patch of sky round the ship reaching to
   the horizon. From above, the top shell is where the cloud begins for
   each line of sight; from below, the base; flying inside, the shell
   where the line of sight leaves the layer. Along that line the cloud is
   marched through: how much light is in it (sunlight, dimmed by the cloud
   between that point and the Sun; skylight), and how much it hides what
   lies behind. It is a child of Earth, in Earth's own frame (radii). */

const RINGS = 90
const SEGMENTS = 128
const INNER = 2e-6

const VERTEX = /* glsl */ `
attribute vec2 aPolar;
uniform vec3 uC; uniform vec3 uE1; uniform vec3 uE2;
uniform float uR; uniform float uSmax;
varying vec3 vRel;
void main() {
  float s = aPolar.x <= 0.0 ? 0.0 : ${INNER.toExponential()} * pow(uSmax / ${INNER.toExponential()}, aPolar.x);
  vec3 T = uE1 * cos(aPolar.y) + uE2 * sin(aPolar.y);
  float hs = sin(0.5 * s);
  // relative to the patch centre (on the shell, above uC), exact for small s
  vec3 rel = uR * (T * sin(s) - uC * 2.0 * hs * hs);
  vRel = rel;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(rel, 1.0);
}`

const FRAGMENT = /* glsl */ `
uniform vec3 uCamRel; uniform vec3 uCam; uniform vec3 uSun; uniform float uWhich; uniform float uLight;
uniform int uSteps; uniform int uLightSteps;
varying vec3 vRel;
${CLOUD_GLSL}

vec2 hitSphere(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float h = b * b - (dot(o, o) - r * r);
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  vec3 o = uCam;
  vec3 d = normalize(vRel - uCamRel);
  float camR = length(o);
  vec2 tb = hitSphere(o, d, uCloudBase);
  vec2 tt = hitSphere(o, d, uCloudTop);
  vec2 tg = hitSphere(o, d, 1.0);
  bool hitsBase = tb.x < 1e8 && tb.y > 0.0;
  float t0;
  float t1;
  if (camR > uCloudTop) {
    // from above: in at the top, out at the base (or the top again)
    if (uWhich > 0.5) discard;
    t0 = tt.x;
    t1 = hitsBase && tb.x > 0.0 ? tb.x : tt.y;
  } else if (camR < uCloudBase) {
    // from below: in at the base, out at the top
    if (uWhich < 0.5) discard;
    if (tg.x > 0.0 && tg.x < tb.y) discard;
    t0 = tb.y;
    t1 = tt.y;
  } else {
    // inside: out through whichever comes first
    bool down = hitsBase && tb.x > 0.0;
    if (down != (uWhich > 0.5)) discard;
    t0 = 0.0;
    t1 = down ? tb.x : tt.y;
  }
  t0 = max(t0, 0.0);
  // no further than the horizon's worth of cloud
  t1 = min(t1, t0 + 0.06);
  if (t1 <= t0) discard;

  float steps = float(uSteps);
  float span = t1 - t0;
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float mu = dot(d, uSun);
  // forward scattering (the silver lining) plus a soft back glow
  float phase = mix(0.08, 1.0, pow(max(mu, 0.0), 6.0)) * 1.6 + 0.35;
  vec3 color = vec3(0.0);
  float through = 1.0;
  float near = 1e9;
  for (int i = 0; i < 48; i++) {
    if (i >= uSteps) break;
    // steps short near the eye and longer further out
    float x = (float(i) + jitter) / steps;
    float t = t0 + span * x * x;
    float stride = span * 2.0 * max(x, 0.5 / steps) / steps;
    vec3 p = o + d * t;
    // fine billows only up close (beyond, they would only shimmer)
    float detail = 1.0 - smoothstep(0.0008, 0.005, t);
    float dens = cloudDensity(p, detail);
    if (dens <= 0.002) continue;
    near = min(near, t);
    // about 14 per km inside a thick cloud
    float sigma = dens * 14.0 * 6371.0;
    float a = 1.0 - exp(-sigma * stride);
    vec3 up = normalize(p);
    float sunUp = dot(up, uSun);
    // sunlight reaching this point: through the cloud towards the Sun
    float toSun = 0.0;
    // (fewer samples at lower quality, each standing for more cloud)
    for (int j = 0; j < 3; j++) {
      if (j >= uLightSteps) break;
      toSun += cloudDensity(p + uSun * (0.00012 * (float(j) + 0.5) * (float(j) + 1.0)), 0.5);
    }
    toSun *= 3.0 / float(uLightSteps);
    float beer = exp(-toSun * 0.00016 * 22.0 * 6371.0);
    // the powder effect: dark edges facing away, bright sunlit rims
    float lit = beer * mix(0.55, 1.0, 1.0 - exp(-sigma * 0.0004));
    // low sun: orange light, then none
    vec3 sunColor = mix(vec3(1.0, 0.42, 0.18), vec3(1.0, 0.96, 0.9), smoothstep(0.0, 0.22, sunUp)) * smoothstep(-0.06, 0.03, sunUp);
    // the sky's light, bluish, darker underneath the cloud
    float hf = clamp((length(p) - uCloudBase) / (uCloudTop - uCloudBase), 0.0, 1.0);
    vec3 sky = vec3(0.42, 0.5, 0.62) * (0.35 + 0.65 * hf) * smoothstep(-0.12, 0.1, sunUp);
    vec3 light = sunColor * lit * phase * 1.35 + sky * 0.32;
    color += through * a * light;
    through *= 1.0 - a;
    if (through < 0.02) break;
  }
  if (near > 1e8) discard;
  // far cloud fades into the air between
  float haze = 1.0 - exp(-near * 6371.0 / 220.0);
  float day = smoothstep(-0.1, 0.12, dot(normalize(o), uSun));
  color = mix(color, vec3(0.62, 0.72, 0.86) * (1.0 - through) * day, haze * 0.75);
  color *= uLight;
  float alpha = (1.0 - through) * uCloudOn;
  gl_FragColor = vec4(color * uCloudOn, alpha);
}`

function patchGeometry() {
  const count = (RINGS + 1) * SEGMENTS
  const polar = new Float32Array(count * 2)
  for (let r = 0; r <= RINGS; r += 1) {
    for (let s = 0; s < SEGMENTS; s += 1) {
      const i = r * SEGMENTS + s
      polar[i * 2] = r / RINGS
      polar[i * 2 + 1] = (s / SEGMENTS) * Math.PI * 2
    }
  }
  const index: number[] = []
  for (let r = 0; r < RINGS; r += 1) {
    for (let s = 0; s < SEGMENTS; s += 1) {
      const a = r * SEGMENTS + s
      const b = r * SEGMENTS + ((s + 1) % SEGMENTS)
      const c = (r + 1) * SEGMENTS + s
      const d = (r + 1) * SEGMENTS + ((s + 1) % SEGMENTS)
      index.push(a, c, b, b, c, d)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('aPolar', new THREE.BufferAttribute(polar, 2))
  // three.js needs a position attribute to draw; the shader makes its own
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geometry.setIndex(index)
  return geometry
}

/* how finely the cloud is marched, by quality (0 light .. 2 full) */
const CLOUD_STEPS = [24, 34, 48]
const CLOUD_LIGHT_STEPS = [1, 2, 3]
const CLOUD_SHADE_STEPS = [2, 3, 5]

const _inverse = new THREE.Matrix4()
const _cam = new THREE.Vector3()
const _c = new THREE.Vector3()
const _sun = new THREE.Vector3()
const _sunWorld = new THREE.Vector3()

export default function CloudVolume({ sun, light }: { sun: THREE.Vector3; light: { strength: number } }) {
  const geometry = useMemo(patchGeometry, [])
  const shared = useMemo(
    () => ({
      uC: { value: new THREE.Vector3(0, 1, 0) },
      uE1: { value: new THREE.Vector3(1, 0, 0) },
      uE2: { value: new THREE.Vector3(0, 0, 1) },
      uSmax: { value: 0.2 },
      uCam: { value: new THREE.Vector3() },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uLight: { value: 1 },
      uSteps: { value: CLOUD_STEPS[2] },
      uLightSteps: { value: CLOUD_LIGHT_STEPS[2] },
    }),
    [],
  )
  const materials = useMemo(
    () =>
      [0, 1].map(
        (which) =>
          new THREE.ShaderMaterial({
            uniforms: {
              ...shared,
              ...cloudVolume,
              uR: { value: 1 },
              uCamRel: { value: new THREE.Vector3() },
              uWhich: { value: which },
            },
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
          }),
      ),
    [shared],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      materials.forEach((material) => material.dispose())
    },
    [geometry, materials],
  )
  const top = useRef<THREE.Mesh>(null)
  const base = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const meshes = [top.current, base.current]
    const earth = top.current?.parent
    if (!meshes[0] || !meshes[1] || !earth) return
    // on when flying low over Earth
    const target = pilot.active && pilot.nearestIndex === 2 && pilot.altitudeKm >= 0 ? 1 - THREE.MathUtils.smoothstep(pilot.altitudeKm, 45, 80) : 0
    cloudVolume.uCloudOn.value = target
    const on = target > 0.002
    meshes.forEach((mesh) => mesh && (mesh.visible = on))
    if (!on) return
    earth.updateWorldMatrix(true, false)
    _inverse.copy(earth.matrixWorld).invert()
    _cam.copy(state.camera.position).applyMatrix4(_inverse)
    const camR = _cam.length()
    // only the shells a line of sight can leave by: from above the layer
    // the top, from below the base, from inside both
    meshes[0].visible = camR > cloudVolume.uCloudBase.value
    meshes[1].visible = camR < cloudVolume.uCloudTop.value
    shared.uSteps.value = CLOUD_STEPS[pilot.effects]
    shared.uLightSteps.value = CLOUD_LIGHT_STEPS[pilot.effects]
    cloudVolume.uShadeSteps.value = CLOUD_SHADE_STEPS[pilot.effects]
    _c.copy(_cam).normalize()
    shared.uCam.value.copy(_cam)
    shared.uC.value.copy(_c)
    shared.uE1.value.set(0, 1, 0).cross(_c)
    if (shared.uE1.value.lengthSq() < 1e-10) shared.uE1.value.set(1, 0, 0)
    shared.uE1.value.normalize()
    shared.uE2.value.copy(_c).cross(shared.uE1.value)
    // to the horizon, and the cloud beyond it
    const over = Math.max(camR - 1, 1e-6)
    shared.uSmax.value = Math.min(0.32, Math.acos(1 / (1 + over)) + Math.acos(1 / cloudVolume.uCloudTop.value) + 0.01)
    _sunWorld.copy(sun)
    _sun.copy(_sunWorld).applyMatrix4(_inverse).normalize()
    shared.uSun.value.copy(_sun)
    shared.uLight.value = light.strength
    const radii = [cloudVolume.uCloudTop.value, cloudVolume.uCloudBase.value]
    meshes.forEach((mesh, i) => {
      if (!mesh) return
      const r = radii[i]
      mesh.position.copy(_c).multiplyScalar(r)
      const u = (mesh.material as THREE.ShaderMaterial).uniforms
      u.uR.value = r
      // the camera relative to this patch's centre, worked out in double
      u.uCamRel.value.copy(_cam).sub(mesh.position)
    })
  })

  return (
    <>
      <mesh ref={top} geometry={geometry} material={materials[0]} frustumCulled={false} visible={false} />
      <mesh ref={base} geometry={geometry} material={materials[1]} frustumCulled={false} visible={false} />
    </>
  )
}
