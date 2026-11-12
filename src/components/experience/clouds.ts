import * as THREE from 'three'

import { CLOUD_PATCH_GLSL, cloudPatchUniforms } from './cloudPatch'

/* ============================================================
   EARTH'S CLOUDS IN 3D, FLYING LOW
   From orbit the clouds are a map on a shell. Coming down, the weather
   becomes cloud you can fly over, between and through: a layer from
   about 1.5 km up to 9 km where the cover is thick (cumulus tops a few
   km up where it is broken), its cover read from the same map, its
   billows from 3D noise a few km across, drifting with the weather.
   The same density decides the cloud seen, the light inside it (it
   shades itself) and the shadows it casts on the ground below.
   Lengths are in Earth radii, in Earth's own (turning) frame.
============================================================ */

export const CLOUD_BASE_KM = 1.5
export const CLOUD_TOP_KM = 9

export const cloudVolume = {
  uCloudMap: { value: null as THREE.Texture | null },
  uCloudShift: { value: 0 },
  uCloudBase: { value: 1 + CLOUD_BASE_KM / 6371 },
  uCloudTop: { value: 1 + CLOUD_TOP_KM / 6371 },
  /** 0..1: the 3D clouds are in use (flying low over Earth) */
  uCloudOn: { value: 0 },
  /** samples for a cloud's shadow on the ground (fewer at lower quality) */
  uShadeSteps: { value: 5 },
  // the sharp patch round the view (cloudPatch.ts)
  ...cloudPatchUniforms,
}

export const CLOUD_GLSL = /* glsl */ `
${CLOUD_PATCH_GLSL}
uniform sampler2D uCloudMap; uniform float uCloudShift;
uniform float uCloudBase; uniform float uCloudTop; uniform float uCloudOn; uniform int uShadeSteps;

float cHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float cNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(cHash(i), cHash(i + vec3(1, 0, 0)), f.x), mix(cHash(i + vec3(0, 1, 0)), cHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(cHash(i + vec3(0, 0, 1)), cHash(i + vec3(1, 0, 1)), f.x), mix(cHash(i + vec3(0, 1, 1)), cHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

/* cover from the map, where the weather has drifted to; read a little
   off its true place by noise some 20 km across, so a map pixel (the
   real-cloud map's are 16 km) never shows as a square cloud (much less
   so where the sharp patch has the clouds' real shapes) */
float cloudCoverAt(vec3 dir) {
  vec3 w = dir * 320.0;
  float warp = uCloudPatchRect.z > 0.0 ? 0.0012 : 0.006;
  dir = normalize(dir + (vec3(cNoise(w), cNoise(w + 5.2), cNoise(w + 9.7)) - 0.5) * warp);
  float u = fract(atan(dir.z, -dir.x) / 6.2831853 + 1.0 - uCloudShift);
  float v = 1.0 - acos(clamp(dir.y, -1.0, 1.0)) / 3.14159265;
  return cloudFromMaps(uCloudMap, vec2(u, v));
}

/* density 0..1 at a point (radii from Earth's centre); detail 0..1 */
float cloudDensity(vec3 p, float detail) {
  float r = length(p);
  float hf = (r - uCloudBase) / (uCloudTop - uCloudBase);
  if (hf <= 0.0 || hf >= 1.0) return 0.0;
  vec3 dir = p / r;
  float cover = cloudCoverAt(dir);
  if (cover < 0.08) return 0.0;
  // thick cover towers; broken cover is low, fair-weather cumulus
  float topHere = mix(0.3, 1.0, smoothstep(0.4, 0.95, cover));
  // a flat base, tapering to domed tops
  float profile = smoothstep(0.0, 0.06, hf) * (1.0 - smoothstep(topHere * 0.25, topHere, hf));
  // billows a few km across, turning with the weather (the drift)
  float a = uCloudShift * 6.2831853;
  vec3 q = vec3(p.x * cos(a) - p.z * sin(a), p.y, p.x * sin(a) + p.z * cos(a)) * (6371.0 / 4.5);
  float n = cNoise(q) * 0.5 + (cNoise(q * 2.3 + 3.1) * 0.32 + cNoise(q * 5.1 + 7.7) * 0.18) * detail + (1.0 - detail) * 0.25;
  float d = n * profile - (1.0 - cover) * 0.72;
  return clamp(d * 2.6, 0.0, 1.0);
}

/* the shadow of the clouds on a point below them, towards the Sun */
float cloudShade(vec3 p, vec3 sun) {
  if (uCloudOn < 0.01) return 0.0;
  float b = dot(p, sun);
  float c0 = dot(p, p);
  float hb = b * b - (c0 - uCloudBase * uCloudBase);
  float ht = b * b - (c0 - uCloudTop * uCloudTop);
  if (ht < 0.0) return 0.0;
  float t0 = hb > 0.0 ? -b + sqrt(hb) : 0.0;
  float t1 = -b + sqrt(ht);
  if (t1 <= max(t0, 0.0)) return 0.0;
  t0 = max(t0, 0.0);
  float stride = (t1 - t0) / float(uShadeSteps);
  float depth = 0.0;
  for (int i = 0; i < 5; i++) {
    if (i >= uShadeSteps) break;
    depth += cloudDensity(p + sun * (t0 + stride * (float(i) + 0.5)), 0.4);
  }
  // soft: light leaks round and through the billows
  float tau = depth * stride * 6371.0 * 6.0;
  return (1.0 - exp(-tau)) * uCloudOn;
}
`
