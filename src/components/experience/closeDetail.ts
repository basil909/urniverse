/* Close-up detail below the surface maps' resolution (see SolarSystem.tsx):
   fine relief and tone that appear only once each scale spans pixels. */
export const CLOSE_DETAIL_GLSL = /* glsl */ `
float cdHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cdNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cdHash(i), cdHash(i + vec3(1,0,0)), f.x), mix(cdHash(i + vec3(0,1,0)), cdHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(cdHash(i + vec3(0,0,1)), cdHash(i + vec3(1,0,1)), f.x), mix(cdHash(i + vec3(0,1,1)), cdHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
/* p: direction on the unit sphere. rugged: 1 for ridged rock, 0 for soft
   cloud. stretch: streaks the pattern east-west (banded giants).
   Returns (height in radii, tone -0.5..0.5, how much is shown 0..1). */
vec3 closeDetail(vec3 p, float rugged, float stretch) {
  float px = length(fwidth(p)); /* one pixel, in radii */
  vec3 q = p * vec3(1.0, stretch, 1.0);
  float h = 0.0; float tone = 0.0; float shown = 0.0;
  float f = 300.0;
  for (int i = 0; i < 4; i++) {
    float a = 1.0 - smoothstep(0.22, 0.9, px * f);
    if (a > 0.002) {
      vec3 c = q * f + float(i) * 31.7;
      /* a little warp, so the pattern never reads as a regular grain */
      c += (vec3(cdNoise(c * 0.31), cdNoise(c * 0.31 + 5.2), cdNoise(c * 0.31 + 9.7)) - 0.5) * 1.8;
      float n = cdNoise(c);
      float ridge = 1.0 - abs(2.0 * n - 1.0);
      float v = mix(n, ridge * ridge, rugged) - 0.5;
      h += v * a / f;
      tone += v * a * 0.6;
      shown = max(shown, a);
    }
    f *= 4.0;
  }
  /* rough ground in some places, smooth plains in others */
  float rough = shown > 0.0 ? mix(0.2, 1.0, smoothstep(0.3, 0.7, cdNoise(q * 45.0 + 3.3))) : 1.0;
  return vec3(h * rough, clamp(tone * mix(0.5, 1.0, rough), -0.5, 0.5), shown);
}
/* tilt a normal by a height field, from its screen-space slope (pos and
   n in the same space, h in its units) */
vec3 closeBumpWith(vec3 n, vec3 dpdx, vec3 dpdy, float h) {
  float dhdx = dFdx(h); float dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, n); vec3 r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  if (abs(det) < 1e-30) return n;
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * n - grad);
}
vec3 closeBump(vec3 n, vec3 pos, float h) {
  return closeBumpWith(n, dFdx(pos), dFdy(pos), h);
}
`
