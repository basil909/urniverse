'use client'

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

import { INTERIORS } from '../../data/interiors'
import { cutaway } from './cutawayState'
import { SYSTEM_OFFSET } from './orbit'

/* The planet cut open: its surface with a quarter wedge removed, turned
   so the opening faces the camera, and the two cut faces painted with
   the layers inside (a glowing core, mantle, crust or the gas giants'
   hydrogen layers). It swings into view as it opens; the real planet is
   hidden meanwhile. Each layer gets a small label. */

const GAP_START = (3 * Math.PI) / 4 // the wedge is centred on +Z
const SHELL_LENGTH = (3 * Math.PI) / 2
const MAX_LAYERS = 4

const SHELL_VERTEX = /* glsl */ `
varying vec3 vLocal;
varying vec3 vWorldNormal;
void main() {
  vLocal = position;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const SHELL_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uSrgb;
uniform vec3 uBase;
uniform vec3 uSunDir;
uniform float uSpin;
varying vec3 vLocal;
varying vec3 vWorldNormal;
void main() {
  vec3 p = normalize(vLocal);
  /* the sphere's own texture mapping, from the position (the shell is
     only part of a sphere, so its built-in uvs would not match) */
  float u = fract(atan(p.z, -p.x) / 6.28318 + uSpin);
  float v = 1.0 - acos(clamp(p.y, -1.0, 1.0)) / 3.14159;
  vec3 color = uBase;
  if (uHasMap > 0.5) {
    color = texture2D(uMap, vec2(u, v)).rgb;
    if (uSrgb > 0.5) color = pow(color, vec3(1.0 / 2.2));
  }
  float light = 0.32 + 0.68 * max(dot(normalize(vWorldNormal), uSunDir), 0.0);
  gl_FragColor = vec4(color * light, 1.0);
}`

const FACE_VERTEX = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const FACE_FRAGMENT = /* glsl */ `
uniform float uEdges[${MAX_LAYERS}];
uniform vec3 uColors[${MAX_LAYERS}];
uniform float uHot[${MAX_LAYERS}];
uniform int uCount;
uniform float uOpacity;
uniform float uTime;
varying vec2 vPos;
void main() {
  float r = length(vPos);
  vec3 color = uColors[0];
  float hot = uHot[0];
  float inner = 0.0;
  float outer = uEdges[0];
  for (int i = 1; i < ${MAX_LAYERS}; i++) {
    if (i >= uCount) break;
    if (r > uEdges[i - 1]) {
      color = uColors[i];
      hot = uHot[i];
      inner = uEdges[i - 1];
      outer = uEdges[i];
    }
  }
  /* within each layer: a little brighter towards its inner edge, with a
     faint grain so it reads as material, not flat paint */
  float within = clamp((r - inner) / max(outer - inner, 1e-3), 0.0, 1.0);
  float grain = fract(sin(dot(floor(vPos * 180.0), vec2(12.9898, 78.233))) * 43758.5453);
  vec3 c = color * (1.08 - 0.22 * within) * (0.96 + 0.06 * grain);
  /* hot layers glow (and pulse very slowly) */
  c *= 1.0 + hot * (0.35 + 0.08 * sin(uTime * 0.8)) * (1.0 - within * 0.6);
  /* thin pale lines at the boundaries */
  for (int i = 0; i < ${MAX_LAYERS}; i++) {
    if (i >= uCount - 1) break;
    float line = 1.0 - smoothstep(0.0, 0.006, abs(r - uEdges[i]));
    c = mix(c, vec3(1.0, 0.96, 0.9), line * 0.5);
  }
  gl_FragColor = vec4(c, uOpacity);
}`

const _sunDir = new THREE.Vector3()
const _center = new THREE.Vector3()

export default function Cutaway({
  index,
  radius,
  progressRef,
  getMap,
  hide,
}: {
  index: number
  radius: number
  progressRef: RefObject<number>
  getMap: () => { texture: THREE.Texture | null; srgb: boolean }
  hide: RefObject<THREE.Object3D | null>[]
}) {
  const group = useRef<THREE.Group>(null)
  const swing = useRef<THREE.Group>(null)
  const labels = useRef<(HTMLDivElement | null)[]>([])
  const amount = useRef(0)
  // labels exist only while this planet is (being) cut open
  const [labelled, setLabelled] = useState(false)
  const camera = useThree((state) => state.camera)
  const layers = INTERIORS[index] ?? []

  const shellGeometry = useMemo(
    () => new THREE.SphereGeometry(1, 96, 64, GAP_START, SHELL_LENGTH),
    [],
  )
  const faceGeometry = useMemo(
    () => new THREE.CircleGeometry(1, 96, -Math.PI / 2, Math.PI),
    [],
  )

  const shellMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: null as THREE.Texture | null },
          uHasMap: { value: 0 },
          uSrgb: { value: 0 },
          uBase: { value: new THREE.Color(layers[layers.length - 1]?.color ?? '#888888') },
          uSunDir: { value: new THREE.Vector3(1, 0, 0) },
          uSpin: { value: 0 },
        },
        vertexShader: SHELL_VERTEX,
        fragmentShader: SHELL_FRAGMENT,
        toneMapped: false,
      }),
    [layers],
  )

  const faceMaterial = useMemo(() => {
    const edges = new Array(MAX_LAYERS).fill(1)
    const colors = new Array(MAX_LAYERS).fill(0).map(() => new THREE.Color('#888888'))
    const hot = new Array(MAX_LAYERS).fill(0)
    layers.forEach((layer, i) => {
      edges[i] = layer.to
      colors[i] = new THREE.Color(layer.color)
      hot[i] = layer.hot ? 1 : 0
    })
    return new THREE.ShaderMaterial({
      uniforms: {
        uEdges: { value: edges },
        uColors: { value: colors },
        uHot: { value: hot },
        uCount: { value: layers.length },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: FACE_VERTEX,
      fragmentShader: FACE_FRAGMENT,
      transparent: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
  }, [layers])

  useEffect(
    () => () => {
      shellGeometry.dispose()
      faceGeometry.dispose()
      shellMaterial.dispose()
      faceMaterial.dispose()
    },
    [shellGeometry, faceGeometry, shellMaterial, faceMaterial],
  )

  useFrame((_, delta) => {
    const root = group.current
    if (!root || !swing.current) return
    const chapter = Math.floor(progressRef.current ?? 0)
    const wanted = cutaway.planet === index && chapter - 2 === index ? 1 : 0
    amount.current += (wanted - amount.current) * (1 - Math.exp(-delta * 3))
    if (wanted === 0 && amount.current < 0.01) amount.current = 0
    const open = amount.current

    const showing = open > 0.01
    root.visible = showing
    if (showing !== labelled) setLabelled(showing)
    // the real planet steps aside while the cut-open model is shown
    for (const ref of hide) if (ref.current) ref.current.visible = open < 0.15
    labels.current.forEach((label) => {
      if (label) label.style.opacity = THREE.MathUtils.smoothstep(open, 0.6, 1).toFixed(3)
    })
    if (!showing) return

    // the opening faces the camera, seen a little from above
    root.lookAt(camera.position)
    // and swings round into place as it opens
    swing.current.rotation.set(-0.22, (1 - open) * 1.4, 0)
    swing.current.scale.setScalar(radius * (0.94 + 0.06 * open))

    const { texture, srgb } = getMap()
    shellMaterial.uniforms.uMap.value = texture
    shellMaterial.uniforms.uHasMap.value = texture ? 1 : 0
    shellMaterial.uniforms.uSrgb.value = srgb ? 1 : 0
    shellMaterial.uniforms.uSpin.value += delta * 0.004
    root.getWorldPosition(_center)
    _sunDir.copy(SYSTEM_OFFSET).sub(_center).normalize()
    shellMaterial.uniforms.uSunDir.value.copy(_sunDir)
    faceMaterial.uniforms.uOpacity.value = THREE.MathUtils.smoothstep(open, 0.2, 0.7)
    faceMaterial.uniforms.uTime.value += delta
  })

  // the two cut faces sit on the wedge's edges (half-discs turned about Y)
  const faceAngles = [GAP_START, GAP_START + SHELL_LENGTH]

  return (
    <group ref={group} visible={false}>
      <group ref={swing} scale={radius}>
        <mesh geometry={shellGeometry} material={shellMaterial} />
        {faceAngles.map((phi) => (
          <mesh
            key={phi}
            geometry={faceGeometry}
            material={faceMaterial}
            rotation={[0, Math.PI + phi, 0]}
          />
        ))}
        {/* labels on the right-hand face, fanned out from the centre */}
        {labelled && layers.map((layer, i) => {
          const inner = i === 0 ? 0 : layers[i - 1].to
          const mid = (inner + layer.to) / 2
          const tilt = ((i - (layers.length - 1) / 2) * 0.55)
          const along = Math.cos(tilt) * mid
          const height = Math.sin(tilt) * mid
          // the right-hand face points along (sin 45, 0, cos 45) in this group
          return (
            <Html
              key={layer.name}
              position={[along * Math.SQRT1_2, height, along * Math.SQRT1_2]}
              zIndexRange={[6, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <div
                ref={(element) => {
                  labels.current[i] = element
                }}
                className="cutaway-label"
                style={{ opacity: 0 }}
                aria-hidden="true"
              >
                {/* numbered to match the key in the panel */}
                <span className="cutaway-dot">{i + 1}</span>
              </div>
            </Html>
          )
        })}
      </group>
    </group>
  )
}
