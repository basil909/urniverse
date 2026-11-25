import * as THREE from 'three'

/* ============================================================
   THE GROUND AT YOUR FEET
   Below what the maps and the generated relief hold (tens of metres), the
   ground is made up per pixel, from about 30 m down to a centimetre, each
   scale appearing only once it spans a few pixels:
   - relief: a fractal of bumps and hollows, rougher in some places,
     smoother in others, that tilts the light;
   - small craters on airless worlds, from a metre to a hundred: bowls with
     raised rims, the young ones ringed with bright ejecta, and shadow
     filling them from the sunward rim when the Sun is low;
   - stones from a few cm to a few tens, scattered thick or thin;
   - on Mars (and Titan), patches of dark sand laid in ripples a metre or
     two apart, and of bright dust;
   - the way dusty ground takes light: regolith (the Moon, Mercury, the
     airless moons) looks nearly as bright at a slant as face on, and
     brightens sharply straight away from the Sun (the opposition surge:
     the glow round your own shadow's head).
   Positions are metres from an anchor that steps in whole 2,048 m
   strides, and every pattern repeats on that stride, so nothing shifts as
   the ship moves and 32-bit floats stay precise to a millimetre.
============================================================ */

export const DETAIL_PERIOD = 2048

export type GroundLook = {
  /** fractal relief: slope of each octave */
  rough: number
  /** small craters (0 none .. 1 saturated, as on the Moon) */
  craters: number
  /** stones lying about */
  stones: number
  /** sand ripples in the dark patches */
  ripples: number
  /** regolith light (0 plain matte .. 1 lunar), and the opposition glow */
  regolith: number
  surge: number
  /** the colours of the patches and stones, as multipliers of the map */
  sand: string
  dust: string
  stone: string
  /** close in, the ground's colour as seen on the ground (not from orbit) */
  near: string
}

export const GROUND_LOOK: Record<number, GroundLook> = {
  0: { rough: 0.05, craters: 1, stones: 0.35, ripples: 0, regolith: 0.7, surge: 0.35, sand: '#c9c6c2', dust: '#ffffff', stone: '#8c8780', near: '#ffffff' },
  2: { rough: 0.045, craters: 0, stones: 0.35, ripples: 0, regolith: 0, surge: 0, sand: '#ffffff', dust: '#ffffff', stone: '#c7c2bb', near: '#ffffff' },
  // dark basaltic sand in rippled patches, bright dust, rock everywhere;
  // up close (rover pictures) a browner butterscotch than the orbital map
  3: { rough: 0.04, craters: 0.35, stones: 0.9, ripples: 1, regolith: 0.25, surge: 0.12, sand: '#b29e92', dust: '#fff0e2', stone: '#6a5246', near: '#e8d0bc' },
  12: { rough: 0.035, craters: 0.9, stones: 0.35, ripples: 0, regolith: 0.78, surge: 0.5, sand: '#cfcfcf', dust: '#ffffff', stone: '#a9a7a3', near: '#ffffff' },
  13: { rough: 0.03, craters: 0, stones: 0.25, ripples: 0, regolith: 0.4, surge: 0.2, sand: '#e6a06a', dust: '#fff7c8', stone: '#7a6a44', near: '#ffffff' },
  14: { rough: 0.022, craters: 0.12, stones: 0.35, ripples: 0, regolith: 0.3, surge: 0.35, sand: '#d9c2ae', dust: '#ffffff', stone: '#f0f6ff', near: '#ffffff' },
  15: { rough: 0.035, craters: 0.8, stones: 0.3, ripples: 0, regolith: 0.6, surge: 0.3, sand: '#c9c3bb', dust: '#ffffff', stone: '#a29b90', near: '#ffffff' },
  16: { rough: 0.035, craters: 0.9, stones: 0.3, ripples: 0, regolith: 0.7, surge: 0.35, sand: '#bdb5aa', dust: '#ffffff', stone: '#8e857a', near: '#ffffff' },
  // Huygens: rounded ice pebbles on a damp, sandy plain; dunes of dark grains
  17: { rough: 0.02, craters: 0, stones: 1, ripples: 0.5, regolith: 0, surge: 0, sand: '#8f7a62', dust: '#ffffff', stone: '#e6dccb', near: '#ffffff' },
  18: { rough: 0.04, craters: 1, stones: 0.25, ripples: 0, regolith: 0.82, surge: 0.45, sand: '#c9c3bd', dust: '#ffffff', stone: '#857b72', near: '#ffffff' },
  19: { rough: 0.03, craters: 0.6, stones: 0.15, ripples: 0, regolith: 0.82, surge: 0.45, sand: '#d0cac4', dust: '#ffffff', stone: '#8e847a', near: '#ffffff' },
}

export function groundLookUniforms(index: number) {
  const look = GROUND_LOOK[index] ?? GROUND_LOOK[2]
  return {
    uDetailOrigin: { value: new THREE.Vector3() },
    uCamL: { value: new THREE.Vector3() },
    uLookRough: { value: look.rough },
    uLookCraters: { value: look.craters },
    uLookStones: { value: look.stones },
    uLookRipples: { value: look.ripples },
    uLookRegolith: { value: look.regolith },
    uLookSurge: { value: look.surge },
    uLookSand: { value: new THREE.Color(look.sand) },
    uLookDust: { value: new THREE.Color(look.dust) },
    uLookStone: { value: new THREE.Color(look.stone) },
    uLookNear: { value: new THREE.Color(look.near) },
    uLookNearAmount: { value: 0 },
  }
}

export const GROUND_DETAIL_GLSL = /* glsl */ `
#ifndef U_DYN
#define U_DYN
/* always 0 (never set): added to a loop count so that the Direct3D shader
   compiler behind WebGL on Windows cannot unroll the loop; unrolled, it
   took seconds and stalled the page while the shaders compiled */
uniform int uDyn;
#endif
uniform vec3 uDetailOrigin; uniform vec3 uCamL;
uniform float uLookRough; uniform float uLookCraters; uniform float uLookStones; uniform float uLookRipples;
uniform float uLookRegolith; uniform float uLookSurge;
uniform vec3 uLookSand; uniform vec3 uLookDust; uniform vec3 uLookStone; uniform vec3 uLookNear; uniform float uLookNearAmount;
#define GD_PERIOD ${DETAIL_PERIOD.toFixed(1)}

/* a hash of a lattice point, repeating every period (lattice units) */
float gdHash(vec3 c, float period) {
  c = mod(c, period);
  return gHash(ivec3(c));
}
vec3 gdHash3(vec3 c, float period) {
  c = mod(c, period);
  ivec3 i = ivec3(c);
  return vec3(gHash(i), gHash(i + ivec3(71, 13, 5)), gHash(i + ivec3(29, 97, 41)));
}
/* value noise and its gradient (x in lattice units) */
vec4 gdNoise(vec3 x, float period) {
  vec3 i = floor(x);
  vec3 w = x - i;
  vec3 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);
  vec3 du = 30.0 * w * w * (w * (w - 2.0) + 1.0);
  /* the cell's eight corners, hashed in a loop the compiler keeps as a
     loop (written out, every noise call carried eight copies of the hash,
     and the shader took seconds to compile) */
  float hs[8];
  for (int k = 0; k < 8 + uDyn; k++) hs[k] = gdHash(i + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1)), period);
  float a = hs[0]; float b = hs[1]; float c = hs[2]; float d = hs[3];
  float e = hs[4]; float f = hs[5]; float g = hs[6]; float h = hs[7];
  float k1 = b - a; float k2 = c - a; float k3 = e - a;
  float k4 = a - b - c + d; float k5 = a - c - e + g; float k6 = a - b - e + f;
  float k7 = -a + b + c - d + e - f - g + h;
  float v = a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
  vec3 grad = du * vec3(
    k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
    k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x,
    k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y);
  return vec4(v, grad);
}
/* noise at a wavelength in metres (a power of two), value and gradient per metre */
vec4 gdAt(vec3 pm, float lambda, float seed) {
  float f = 1.0 / lambda;
  vec4 n = gdNoise(pm * f + seed, GD_PERIOD * f);
  return vec4(n.x, n.yzw * f);
}

struct GroundBits { vec3 grad; vec3 albedo; float shade; };

/* the noise samples groundDetail takes, by wavelength (m) and seed: taken
   in loops, one copy of the noise for each loop, rather than written out
   one by one (each a copy of its own: the bulk of the compile) */
const float GD_PATCH_L[5] = float[5](128.0, 16.0, 64.0, 32.0, 128.0);
const float GD_PATCH_S[5] = float[5](3.0, 7.0, 5.0, 9.0, 11.0);
const float GD_FINE_L[6] = float[6](0.5, 0.0625, 2.0, 0.25, 0.0625, 8.0);
const float GD_FINE_S[6] = float[6](23.0, 29.0, 61.0, 67.0, 71.0, 73.0);

/* pm: metres (anchored); up: the ground's up; px: metres a pixel;
   sunL: towards the Sun; near: 1 close in, 0 far off; on Earth, from the
   imagery's colour: veg (green: grass and scrub) and sandy (bare, bright
   and warm: desert sand) */
GroundBits groundDetail(vec3 pm, vec3 up, float px, vec3 sunL, float near, float veg, float sandy) {
  GroundBits g;
  g.grad = vec3(0.0);
  g.albedo = vec3(1.0);
  g.shade = 0.0;
  // where the ground is rough, sandy, dusty (patches tens of metres across)
  // (warped, from four scales: patches that meander, with no trace of the
  // noise's square lattice)
  vec3 warp = vec3(0.0);
  for (int k = 0; k < 3 + uDyn; k++) warp[k] = gdAt(pm, 256.0, 51.0 + 6.0 * float(k)).x - 0.5;
  vec3 pw = pm + warp * 90.0;
  // the patches (warped), and how rough the ground is here
  float np[5];
  for (int k = 0; k < 5 + uDyn; k++) np[k] = gdAt(k < 4 ? pw : pm, GD_PATCH_L[k], GD_PATCH_S[k]).x;
  vec4 m2 = vec4(np[1]);
  float patchy = np[0] * 0.45 + np[2] * 0.3 + np[3] * 0.15 + np[1] * 0.1;
  float rough = mix(0.45, 1.3, smoothstep(0.3, 0.7, np[4]));
  // (soft-edged, and lying thinner or thicker from place to place)
  float rippled = max(uLookRipples, sandy);
  float sand = rippled > 0.0 ? smoothstep(0.54, 0.72, patchy + (m2.x - 0.5) * 0.1) * max(step(0.001, uLookRipples), sandy) : 0.0;
  float dust = smoothstep(0.46, 0.3, patchy);
  // ---- relief: octaves from 16 m to a centimetre, each once it spans pixels
  float lambda = 16.0;
  float amp = uLookRough * rough * (1.0 - sand * 0.7) * (1.0 - veg * 0.4);
  for (int k = 0; k < 11 + uDyn; k++) {
    float seen = 1.0 - smoothstep(lambda * 0.18, lambda * 0.5, px);
    if (seen <= 0.0) break;
    vec4 n = gdAt(pm, lambda, float(k) * 13.7);
    g.grad += n.yzw * lambda * amp * seen;
    lambda *= 0.5;
  }
  // ---- sand ripples: a metre and a half apart, crests across the wind,
  // bent by the eddies (the wave vector is whole turns per period)
  if (sand > 0.0 && rippled > 0.0) {
    vec3 K = 6.2831853 * vec3(925.0, 375.0, 800.0) / GD_PERIOD;
    vec4 bend = gdAt(pm, 8.0, 41.0);
    float phase = dot(pm, K) + bend.x * 5.0;
    float seen = 1.0 - smoothstep(0.25, 0.7, px);
    // a long gentle stoss side, a steeper lee
    float s = sin(phase);
    float c = cos(phase);
    g.grad += (K + bend.yzw * 5.0) * (c * (1.0 + 0.35 * s)) * 0.045 * sand * seen * rippled;
  }
  // ---- small craters (airless worlds): scales from 2 m to 128 m
  if (uLookCraters > 0.0) {
    vec3 sunT = sunL - up * dot(sunL, up);
    float sunSin = clamp(dot(sunL, up), 0.0, 1.0);
    float tanE = sunSin / max(length(sunT), 1e-3);
    sunT = normalize(sunT + vec3(1e-6));
    float cell = 2.0;
    for (int s = 0; s < 4 + uDyn; s++) {
      // too small to see here: done
      if (cell < px * 3.0) { cell *= 4.0; continue; }
      float seenAll = 1.0 - smoothstep(cell * 0.06, cell * 0.2, px);
      // more of the small ones: saturated at a few metres, rarer larger
      float chance = uLookCraters * (s == 0 ? 0.3 : s == 1 ? 0.28 : s == 2 ? 0.24 : 0.2);
      vec3 x = pm / cell;
      vec3 base = floor(x - 0.5);
      float period = GD_PERIOD / cell;
      for (int i = 0; i < 8 + uDyn; i++) {
        vec3 c = base + vec3(float(i & 1), float((i >> 1) & 1), float((i >> 2) & 1));
        vec3 r3 = gdHash3(c + float(s) * 101.0, period);
        float seenC = seenAll;
        if (r3.x > min(chance, 0.9)) continue;
        vec3 centre = (c + r3) * cell;
        // (at most 0.3 of a cell, reaching 0.48: always within the cells looked at)
        float radius = cell * (0.14 + 0.16 * r3.y);
        vec3 off = pm - centre;
        float dz = abs(dot(off, up)) / cell;
        float layer = 1.0 - smoothstep(0.32, 0.5, dz);
        if (layer <= 0.0) continue;
        off -= up * dot(off, up);
        float q = length(off) / radius;
        if (q > 1.6) continue;
        seenC *= layer;
        // (young and sharp on airless worlds; worn and dust-filled on Mars)
        float fresh = r3.z * r3.z * mix(0.25, 1.0, uLookRegolith);
        float depth = radius * (0.12 + 0.3 * fresh);
        float rimH = radius * (0.02 + 0.07 * fresh);
        // a bowl, and a raised rim
        float w = 0.2;
        float bowl = q < 1.0 ? -depth * (1.0 - q * q) * (1.0 - q * q) : 0.0;
        float dBowl = q < 1.0 ? depth * 4.0 * q * (1.0 - q * q) : 0.0;
        float rim = rimH * exp(-((q - 1.0) / w) * ((q - 1.0) / w));
        float dRim = rim * -2.0 * (q - 1.0) / (w * w);
        vec3 dir = off / max(length(off), 1e-4);
        g.grad += dir * (dBowl + dRim) / radius * seenC;
        // young ones: bright ejecta round them, a brighter floor
        float ejecta = fresh * exp(-((q - 1.05) / 0.45) * ((q - 1.05) / 0.45));
        g.albedo *= 1.0 + (ejecta * 0.32 + (q < 1.0 ? fresh * 0.08 : 0.0)) * seenC;
        // the low Sun: shadow from the sunward rim across the floor
        if (q < 1.0 && sunSin < 0.6) {
          vec2 o = vec2(dot(off / radius, sunT), length(off / radius - sunT * dot(off / radius, sunT)));
          float b = o.x;
          float t = -b + sqrt(max(b * b - (q * q - 1.0), 0.0));
          float below = (rimH - bowl) / radius;
          float dark = smoothstep(-0.03, 0.09, below - t * tanE);
          g.shade = max(g.shade, dark * seenC);
        }
      }
      cell *= 4.0;
    }
  }
  // ---- stones: a few cm to a few tens, thicker where it is rough
  if (uLookStones > 0.0) {
    // (pebbles only: anything larger is a real rock, SurfaceLife.tsx)
    float cell = 0.125;
    for (int s = 0; s < 1; s++) {
      if (cell < px * 4.0) { cell *= 4.0; continue; }
      float seenAll = 1.0 - smoothstep(cell * 0.08, cell * 0.25, px);
      float chance = uLookStones * 0.2 * mix(0.4, 1.3, rough * 0.8) * (1.0 - sand * 0.85) * (1.0 - veg * 0.9);
      vec3 x = pm / cell;
      vec3 base = floor(x - 0.5);
      float period = GD_PERIOD / cell;
      for (int i = 0; i < 8 + uDyn; i++) {
        vec3 c = base + vec3(float(i & 1), float((i >> 1) & 1), float((i >> 2) & 1));
        vec3 r3 = gdHash3(c + 37.0 + float(s) * 53.0, period);
        if (r3.x > chance) continue;
        float seenS = seenAll;
        vec3 centre = (c + r3.yzx) * cell;
        float radius = cell * (0.16 + 0.22 * r3.y);
        vec3 off = pm - centre;
        float layer = 1.0 - smoothstep(0.32, 0.5, abs(dot(off, up)) / cell);
        if (layer <= 0.0) continue;
        off -= up * dot(off, up);
        float q = length(off) / radius;
        if (q > 1.25) continue;
        seenS *= layer;
        // a low dome, its edge a crisp line; and a shadow beside it
        float inside = 1.0 - smoothstep(0.92, 1.0, q);
        float hq = sqrt(max(1.0 - q * q, 0.0));
        vec3 dir = off / max(length(off), 1e-4);
        g.grad += dir * (-q / max(hq, 0.25)) * 0.8 * inside * seenS;
        vec3 tint = uLookStone * (0.75 + 0.5 * r3.z);
        g.albedo = mix(g.albedo, g.albedo * tint, inside * seenS * 0.5);
        float behind = dot(dir, normalize(sunL - up * dot(sunL, up) + vec3(1e-6)));
        g.shade = max(g.shade, (1.0 - inside) * smoothstep(1.25, 1.0, q) * smoothstep(0.0, -0.6, behind) * 0.7 * seenS * (1.0 - smoothstep(0.35, 0.8, dot(sunL, up))));
      }
      cell *= 4.0;
    }
  }
  // ---- colour: sand and dust patches, and a fine mottle
  // mottling, and on Earth's green ground grass: clumps, tufts, blades
  vec4 nf[6];
  for (int k = 0; k < 6; k++) nf[k] = vec4(0.5, 0.0, 0.0, 0.0);
  int fineCount = veg > 0.0 ? 6 : 2;
  for (int k = 0; k < fineCount + uDyn; k++) nf[k] = gdAt(pm, GD_FINE_L[k], GD_FINE_S[k]);
  vec4 fine = nf[0];
  vec4 grain = nf[1];
  float mottle = (fine.x - 0.5) * 0.14 * (1.0 - smoothstep(0.08, 0.3, px)) + (grain.x - 0.5) * 0.1 * (1.0 - smoothstep(0.012, 0.04, px));
  vec3 patchColour = mix(vec3(1.0), uLookSand, sand) * mix(vec3(1.0), uLookDust, dust * 0.6);
  g.albedo *= patchColour * (1.0 + mottle) * (1.0 + (m2.x - 0.5) * 0.18);
  // grass and scrub: clumps and tufts, light and dark, some of it dry
  if (veg > 0.0) {
    vec4 clump = nf[2];
    vec4 tuft = nf[3];
    vec4 blade = nf[4];
    float seenT = 1.0 - smoothstep(0.05, 0.18, px);
    float seenB = 1.0 - smoothstep(0.012, 0.045, px);
    float shade = (clump.x - 0.5) * 0.5 + (tuft.x - 0.5) * 0.6 * seenT + (blade.x - 0.5) * 0.5 * seenB;
    float dry = smoothstep(0.55, 0.8, nf[5].x);
    vec3 grass = mix(vec3(1.0), vec3(1.25, 1.12, 0.62), dry * 0.7) * (1.0 + shade);
    g.albedo *= mix(vec3(1.0), grass, veg);
    g.grad += (tuft.yzw * 0.25 * 0.08 * seenT + blade.yzw * 0.0625 * 0.12 * seenB) * veg;
  }
  g.grad *= near;
  g.albedo = mix(vec3(1.0), g.albedo, near);
  g.shade *= near;
  return g;
}

/* how dusty ground takes the light: mu0 towards the Sun, mu towards the
   eye, cosPhase between them (1: the Sun straight behind you) */
float regolithLight(float mu0, float mu, float cosPhase) {
  float lambert = max(mu0, 0.0);
  float ls = mu0 > 0.0 ? 2.0 * mu0 / (mu0 + max(mu, 0.08)) * 0.75 : 0.0;
  float phase = acos(clamp(cosPhase, -1.0, 1.0));
  float surge = 1.0 + uLookSurge * exp(-phase / 0.07) + uLookSurge * 0.25 * exp(-phase / 0.4);
  return mix(lambert, ls, uLookRegolith) * surge;
}
`
