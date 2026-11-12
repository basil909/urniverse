import * as THREE from 'three'

/* ============================================================
   ECLIPSES
   The worlds' shadows on one another, from the light's real geometry:
   from any point, how much of the Sun's disc a world in the way hides
   (the two discs, overlapping). So:
   - the Moon's shadow crosses Earth on an eclipse's real date and path,
     a dark core a hundred-odd km wide inside a penumbra thousands of km
     across (the Moon's place from the lunar theory in orbit.ts);
   - Earth's shadow falls on the Moon, and in it the Moon turns copper:
     the only light left is sunlight bent through Earth's air, reddened
     by every sunrise and sunset on Earth at once;
   - a moon passing behind its planet (Io every 42 hours) goes dark.
   Each body's shader gets the occluder and the Sun in its own frame.
============================================================ */

export const ECLIPSE_GLSL = /* glsl */ `
/* the angle between two directions (precise even when tiny) */
float eAngle(vec3 a, vec3 b) { return atan(length(cross(a, b)), dot(a, b)); }
/* the share of a disc of angular radius rs (the Sun) hidden by a disc of
   radius ro whose centre is d away */
float discCover(float rs, float ro, float d) {
  if (d >= rs + ro) return 0.0;
  if (d <= abs(ro - rs)) return ro >= rs ? 1.0 : (ro * ro) / (rs * rs);
  float a = rs * rs;
  float b = ro * ro;
  float c1 = clamp((d * d + a - b) / (2.0 * d * rs), -1.0, 1.0);
  float c2 = clamp((d * d + b - a) / (2.0 * d * ro), -1.0, 1.0);
  float k = max((-d + rs + ro) * (d + rs - ro) * (d - rs + ro) * (d + rs + ro), 0.0);
  return clamp((a * acos(c1) + b * acos(c2) - 0.5 * sqrt(k)) / (3.14159265 * a), 0.0, 1.0);
}
`

/* the Sun's angular radius from Earth's distance (radians) */
export const SUN_ANGLE_1AU = 0.004652

/* ---- the Moon's shadow on Earth: in Earth's own (turning) frame, the
   Moon's centre from Earth's (km) and the way to the Sun */
export const earthEclipse = {
  uMoonKm: { value: new THREE.Vector3(0, 0, 4e5) },
  uSunWay: { value: new THREE.Vector3(1, 0, 0) },
}
/* the same for Earth's cloud layer (its own frame drifts with the weather) */
export const cloudEclipse = {
  uMoonKm: { value: new THREE.Vector3(0, 0, 4e5) },
  uSunWay: { value: new THREE.Vector3(1, 0, 0) },
}
export const MOON_SHADOW_GLSL = /* glsl */ `
${ECLIPSE_GLSL}
uniform vec3 uMoonKm; uniform vec3 uSunWay;
/* the share of sunlight the Moon takes away at a point of Earth (its
   direction from Earth's centre, in Earth's frame, and height in km) */
float moonShadow(vec3 dir, float heightKm) {
  vec3 toMoon = uMoonKm - dir * (6371.0 + heightKm);
  float rm = asin(min(1737.4 / length(toMoon), 1.0));
  float d = eAngle(toMoon, uSunWay);
  if (d > rm + 0.0047) return 0.0;
  return discCover(${SUN_ANGLE_1AU}, rm, d);
}
`

/* ---- Earth's shadow on the Moon: in the Moon's own frame, Earth's
   centre from the Moon's (km) and the way to the Sun */
export const moonEclipse = {
  uEarthKm: { value: new THREE.Vector3(0, 0, -4e5) },
  uSunWayM: { value: new THREE.Vector3(1, 0, 0) },
}
export const EARTH_SHADOW_GLSL = /* glsl */ `
${ECLIPSE_GLSL}
uniform vec3 uEarthKm; uniform vec3 uSunWayM;
/* the share of sunlight Earth hides from a point of the Moon (its
   direction from the Moon's centre); umbra: how deep in the full shadow
   (Earth's air widens it by about 2%) */
float earthShadow(vec3 dir, out float umbra) {
  vec3 toEarth = uEarthKm - dir * 1737.4;
  float re = asin(min(6371.0 * 1.02 / length(toEarth), 1.0));
  float d = eAngle(toEarth, uSunWayM);
  float rs = ${SUN_ANGLE_1AU};
  umbra = clamp((re - rs - d) / max(re - rs, 1e-5), 0.0, 1.0);
  return discCover(rs, re, d);
}
`

/* ---- a planet's shadow on its moons: per moon, in the moon's own frame
   and in moon radii, the planet's centre and radius, the way to the Sun
   and the Sun's angular radius there */
export type SatelliteEclipse = {
  uOccluder: { value: THREE.Vector3 }
  uOccluderR: { value: number }
  uSunWayS: { value: THREE.Vector3 }
  uSunAng: { value: number }
}
const satellites = new Map<number, SatelliteEclipse>()
export function satelliteEclipse(id: number) {
  let uniforms = satellites.get(id)
  if (!uniforms) {
    uniforms = {
      uOccluder: { value: new THREE.Vector3(1e6, 0, 0) },
      uOccluderR: { value: 0 },
      uSunWayS: { value: new THREE.Vector3(1, 0, 0) },
      uSunAng: { value: SUN_ANGLE_1AU },
    }
    satellites.set(id, uniforms)
  }
  return uniforms
}
export const PLANET_SHADOW_GLSL = /* glsl */ `
${ECLIPSE_GLSL}
uniform vec3 uOccluder; uniform float uOccluderR; uniform vec3 uSunWayS; uniform float uSunAng;
/* the share of sunlight the planet hides from a point of its moon */
float planetShadow(vec3 dir) {
  vec3 toPlanet = uOccluder - dir;
  float rp = asin(min(uOccluderR / length(toPlanet), 1.0));
  return discCover(uSunAng, rp, eAngle(toPlanet, uSunWayS));
}
`

const _inverse = new THREE.Quaternion()
/** a world vector, turned into an object's own frame (rotation only) */
export function intoFrame(vector: THREE.Vector3, object: THREE.Object3D, out: THREE.Vector3) {
  object.getWorldQuaternion(_inverse).invert()
  return out.copy(vector).applyQuaternion(_inverse)
}
