import * as THREE from 'three'

/* ============================================================
   EXHAUST
   The Shuttle's main engines burned hydrogen in oxygen: an exhaust all
   but transparent, a faint blue-violet, white-hot only at the nozzle.
   In air the plume stays narrow and shows its Mach diamonds (the bright
   bands where the exhaust's shock waves cross, a nozzle's width or two
   apart); in vacuum nothing holds it in, and it spreads into a wide,
   faint cone with no diamonds at all. The solid rocket boosters burned
   aluminium: a dense, blinding yellow-orange. The steering thrusters
   (RCS) fire in short white puffs.
   One open cylinder, one unit long from the nozzle (y 0) aft (y 1), is
   shaped and lit in the shader: brightest where the line of sight
   crosses most gas (the middle), soft at the edges, flickering along
   its length.
============================================================ */

export type PlumeKind = 'main' | 'booster' | 'rcs'

const VERTEX = /* glsl */ `
uniform float uVacuum;
uniform float uKind;
varying float vAlong;
varying vec3 vNormalV;
varying vec3 vViewV;
void main() {
  vAlong = position.y;
  float t = position.y;
  // in air: a taper, a little necking; in vacuum: a wide spreading cone
  float air = 0.92 - 0.45 * t + 0.05 * cos(t * 30.0);
  float space = 0.95 + 2.6 * pow(t, 0.75);
  float r = uKind > 1.5 ? 0.9 + 1.6 * t : mix(air, space, uVacuum);
  if (uKind > 0.5 && uKind < 1.5) r = 1.0 + 0.35 * t; // the boosters' column
  vec3 p = vec3(position.x * r, position.y, position.z * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // (the walls' slope is slight once stretched to the plume's length)
  vNormalV = normalize(normalMatrix * vec3(normal.x, 0.0, normal.z));
  vViewV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`

const FRAGMENT = /* glsl */ `
uniform float uThrust;
uniform float uVacuum;
uniform float uTime;
uniform float uLength;
uniform float uKind;
uniform float uLevel;
varying float vAlong;
varying vec3 vNormalV;
varying vec3 vViewV;
float h(float n) { return fract(sin(n) * 43758.5453); }
float n1(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h(i), h(i + 1.0), f); }
void main() {
  float t = vAlong;
  // the gas the line of sight crosses: most through the middle
  float facing = abs(dot(normalize(vNormalV), normalize(vViewV)));
  float thick = pow(facing, 1.6);
  // flicker running down the plume
  float flicker = 0.82 + 0.18 * n1(t * 9.0 - uTime * 23.0) * n1(t * 3.0 - uTime * 11.0 + 4.0) * 2.0;
  vec3 color;
  float glow;
  if (uKind > 1.5) {
    // RCS: a short white puff
    glow = thick * exp(-t * 3.2) * (1.0 - smoothstep(0.75, 1.0, t)) * 1.4;
    color = vec3(0.9, 0.93, 1.0);
  } else if (uKind > 0.5) {
    // the boosters: dense, blinding, yellow-orange, to white at the nozzle
    glow = (0.35 + thick) * (exp(-t * 1.4) * 4.0 + 0.45) * (1.0 - smoothstep(0.7, 1.0, t)) * flicker;
    color = mix(vec3(1.0, 0.5, 0.14), vec3(1.0, 0.95, 0.82), exp(-t * 3.0));
    float diamonds = pow(0.5 + 0.5 * cos(t * uLength / 1.4 * 6.2832), 6.0) * exp(-t * 2.5);
    glow += thick * diamonds * 1.4;
  } else {
    // the main engines: the white-hot core at the nozzle, a faint blue-
    // violet body, Mach diamonds in air
    float core = exp(-t * uLength / 1.1) * 3.0;
    float body = exp(-t * mix(2.6, 2.4, uVacuum)) * mix(0.55, 0.2, uVacuum);
    float diamonds = pow(0.5 + 0.5 * cos(t * uLength / 1.7 * 6.2832), 10.0) * exp(-t * 3.0) * (1.0 - uVacuum) * 1.6;
    glow = thick * (core + body * flicker + diamonds) * (1.0 - smoothstep(0.65, 1.0, t));
    vec3 hot = vec3(1.0, 0.94, 0.86);
    vec3 blue = mix(vec3(0.42, 0.55, 1.0), vec3(0.5, 0.52, 0.95), t);
    color = mix(blue, hot, clamp(core * 0.5 + diamonds * 0.6, 0.0, 1.0));
  }
  float a = glow * uThrust * uLevel;
  if (a < 0.002) discard;
  gl_FragColor = vec4(color * a, 1.0);
}`

export function plumeMaterial(kind: PlumeKind) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uThrust: { value: 0 },
      uVacuum: { value: 1 },
      uTime: { value: 0 },
      uLength: { value: 12 },
      uKind: { value: kind === 'main' ? 0 : kind === 'booster' ? 1 : 2 },
      uLevel: { value: 1 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/** the plume's shape: an open cylinder one unit long, nozzle at y 0 */
export function plumeGeometry() {
  return new THREE.CylinderGeometry(1, 1, 1, 28, 40, true).translate(0, 0.5, 0)
}

/* the nozzle's throat, white-hot inside the bell: a soft disc facing aft */
const THROAT_FRAGMENT = /* glsl */ `
uniform float uThrust;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float glow = (exp(-d * d * 6.0) * 2.6 + exp(-d * 2.5) * 0.4) * (1.0 - smoothstep(0.85, 1.0, d));
  vec3 color = mix(vec3(1.0, 0.6, 0.35), vec3(1.0, 0.97, 0.92), exp(-d * 3.0));
  gl_FragColor = vec4(color * glow * uThrust, 1.0);
}`
export function throatMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uThrust: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: THROAT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/* the steering thrusters: where they are on the orbiter (one unit long,
   nose to -z) and which way each one's jet points; a jet one way turns
   the ship the other */
export const RCS_JETS: { at: [number, number, number]; dir: [number, number, number]; fires: (pitch: number, yaw: number, roll: number) => number }[] = [
  // nose: left, right, up, down
  { at: [-0.034, -0.088, -0.452], dir: [-1, 0, 0], fires: (_p, yaw) => Math.max(0, yaw) },
  { at: [0.034, -0.088, -0.452], dir: [1, 0, 0], fires: (_p, yaw) => Math.max(0, -yaw) },
  { at: [0, -0.052, -0.448], dir: [0, 1, 0], fires: (pitch) => Math.max(0, -pitch) },
  { at: [0, -0.132, -0.448], dir: [0, -1, 0], fires: (pitch) => Math.max(0, pitch) },
  // tail, on the engine pods: the other way round, and the rolls
  { at: [-0.082, -0.012, 0.462], dir: [-1, 0, 0], fires: (_p, yaw) => Math.max(0, -yaw) },
  { at: [0.082, -0.012, 0.462], dir: [1, 0, 0], fires: (_p, yaw) => Math.max(0, yaw) },
  { at: [-0.076, 0.022, 0.462], dir: [0, 1, 0], fires: (pitch, _y, roll) => Math.max(0, pitch, roll) },
  { at: [0.076, 0.022, 0.462], dir: [0, 1, 0], fires: (pitch, _y, roll) => Math.max(0, pitch, -roll) },
  { at: [-0.076, -0.04, 0.462], dir: [0, -1, 0], fires: (pitch, _y, roll) => Math.max(0, -pitch, -roll) },
  { at: [0.076, -0.04, 0.462], dir: [0, -1, 0], fires: (pitch, _y, roll) => Math.max(0, -pitch, roll) },
]
