'use client'

import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { lens } from './lens'

/* ============================================================
   STARFIELD

   A procedural deep-space stellar population.

   Design goals:
   - No uniform "sphere of dots"
   - Strong depth perception via layered populations
   - Milky-Way-inspired galactic flattening
   - Stellar temperature variation (O/B/A/F/G/K/M)
   - Per-star size and brightness (apparent magnitude)
   - Soft circular rendering via custom shader
   - Subtle per-star twinkling
   - Deterministic generation (seeded PRNG)
   - GPU-friendly point rendering
   - Extremely subtle motion
============================================================ */

const STAR_COUNT = 14000

/* ============================================================
   SEEDED RANDOM (Mulberry32)
============================================================ */

function seededRandom(seed: number) {
  let value = seed
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ============================================================
   STAR COLOR — Approximate stellar colour from temperature
============================================================ */

function temperatureToColor(temperature: number, color: THREE.Color) {
  if (temperature > 0.88) {
    color.setRGB(0.58, 0.76, 1.0) // Hot blue
  } else if (temperature > 0.68) {
    color.setRGB(0.78, 0.88, 1.0) // Blue-white
  } else if (temperature > 0.40) {
    color.setRGB(1.0, 0.96, 0.86) // Sun-like
  } else if (temperature > 0.18) {
    color.setRGB(1.0, 0.78, 0.55) // Warm
  } else {
    color.setRGB(1.0, 0.52, 0.36) // Cool red
  }
}

/* ============================================================
   CUSTOM STAR SHADERS

   Replaces the default square pointsMaterial with:
   - Soft circular falloff (no hard edges)
   - Per-star size via vertex attribute
   - Per-star brightness via vertex attribute
   - Subtle independent twinkling per star
============================================================ */

const STAR_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aBrightness;

  varying vec3 vColor;
  varying float vBrightness;

  uniform float uPixelRatio;
  uniform float uSoften;

  void main() {
    vColor = aColor;
    vBrightness = aBrightness;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // Per-star size attenuation based on distance
    gl_PointSize = aSize * uPixelRatio * (280.0 / -mvPosition.z);

    // Clamp minimum size so distant stars remain visible
    gl_PointSize = max(gl_PointSize, 0.5 * uPixelRatio);

    // close-ups: background stars slightly out of focus (larger, softer, dimmer)
    gl_PointSize *= 1.0 + uSoften * 0.9;

    gl_Position = projectionMatrix * mvPosition;
  }
`

const STAR_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vBrightness;

  uniform float uTime;
  uniform float uSoften;

  void main() {
    // Circular point sprite with soft falloff
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);

    if (dist > 0.5) discard;

    // Smooth circular alpha with a slightly brighter core
    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
    alpha = pow(alpha, mix(1.4, 0.9, uSoften)) * mix(1.0, 0.42, uSoften);

    // Subtle per-star twinkling using screen position as phase offset
    // This is intentionally very gentle — barely perceptible
    float twinklePhase = gl_FragCoord.x * 0.017 + gl_FragCoord.y * 0.023;
    float twinkle = 1.0 + sin(uTime * 1.8 + twinklePhase) * 0.06;

    vec3 finalColor = vColor * vBrightness * twinkle;

    gl_FragColor = vec4(finalColor, alpha * vBrightness);
  }
`

/* ============================================================
   COMPONENT
============================================================ */

export default function Starfield() {
  const group = useRef<THREE.Group>(null)
  const pixelRatio = useThree((state) => state.viewport.dpr)

  /* ==========================================================
     GEOMETRY GENERATION
  ========================================================== */

  const geometry = useMemo(() => {
    const random = seededRandom(847293)

    const positions = new Float32Array(STAR_COUNT * 3)
    const colors = new Float32Array(STAR_COUNT * 3)
    const sizes = new Float32Array(STAR_COUNT)
    const brightness = new Float32Array(STAR_COUNT)

    const color = new THREE.Color()

    for (let i = 0; i < STAR_COUNT; i++) {
      const i3 = i * 3

      // Random direction on a sphere
      const theta = random() * Math.PI * 2
      const vertical = random() * 2 - 1
      const radial = Math.sqrt(1 - vertical * vertical)

      // Layer the universe:
      // 70% distant background | 20% intermediate | 10% foreground
      const population = random()
      let radius: number

      if (population < 0.70) {
        radius = 85 + random() * 110 // Deep background
      } else if (population < 0.90) {
        radius = 48 + random() * 55 // Intermediate
      } else {
        radius = 28 + random() * 25 // Foreground
      }

      // Galactic flattening — compress toward a plane
      const galacticBias = Math.pow(random(), 2.8)
      const y = vertical * radius * (0.28 + galacticBias * 0.72)
      const x = radial * Math.cos(theta) * radius
      const z = radial * Math.sin(theta) * radius

      positions[i3] = x
      positions[i3 + 1] = y
      positions[i3 + 2] = z

      // Stellar temperature → color
      const temperature = random()
      temperatureToColor(temperature, color)

      // Small natural colour variation
      const variation = 0.94 + random() * 0.12
      colors[i3] = color.r * variation
      colors[i3 + 1] = color.g * variation
      colors[i3 + 2] = color.b * variation

      // Apparent magnitude — most stars are faint
      const rareBrightStar = random()
      let brightnessValue: number

      if (rareBrightStar > 0.997) {
        brightnessValue = 0.90 + random() * 0.10 // Rare bright anchor
      } else if (rareBrightStar > 0.94) {
        brightnessValue = 0.45 + random() * 0.35 // Noticeable
      } else {
        brightnessValue = 0.12 + Math.pow(random(), 2.4) * 0.30 // Vast majority
      }

      brightness[i] = brightnessValue

      // Per-star apparent size (now actually used by the shader)
      sizes[i] = 0.014 + Math.pow(brightnessValue, 2.0) * 0.065
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geo.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1))

    return geo
  }, [])

  /* ==========================================================
     MATERIAL
  ========================================================== */

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX_SHADER,
      fragmentShader: STAR_FRAGMENT_SHADER,
      uniforms: {
        uPixelRatio: { value: pixelRatio },
        uTime: { value: 0 },
        uSoften: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    })
  }, [pixelRatio])

  /* ==========================================================
     CLEANUP
  ========================================================== */

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  /* ==========================================================
     MOTION — Almost imperceptible drift + twinkle time
  ========================================================== */

  useFrame((state, delta) => {
    if (!group.current) return

    // Update twinkle time uniform
    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uSoften.value = lens.closeUp

    // Stars should NOT visibly rotate like a skybox
    group.current.rotation.y += delta * 0.00035

    // Extremely subtle pointer-reactive drift
    group.current.rotation.x = THREE.MathUtils.lerp(
      group.current.rotation.x,
      state.pointer.y * 0.0015,
      0.008
    )

    group.current.rotation.z = THREE.MathUtils.lerp(
      group.current.rotation.z,
      state.pointer.x * 0.001,
      0.008
    )
  })

  return (
    <group ref={group}>
      <points geometry={geometry} material={material} frustumCulled={false} renderOrder={-20} />
    </group>
  )
}