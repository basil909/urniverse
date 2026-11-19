'use client'

import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/* ============================================================
   TEXT SHIELD
   Orbit trails, belt dust, the comet and the constellation lines fade
   where the chapter's words sit, so no line runs through a sentence. The
   words' box is read from the page (a few times a second), padded, and
   handed to those materials as a soft-edged rectangle in screen pixels.
============================================================ */

export const shieldUniforms = {
  /** the box, in drawing-buffer pixels from the bottom left: x0, y0, x1, y1 */
  uShield: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** how strongly the box clears (0 when no words are showing) */
  uShieldOn: { value: 0 },
}

export const SHIELD_GLSL = /* glsl */ `
uniform vec4 uShield;
uniform float uShieldOn;
/* 1 away from the words, low over them, with a soft edge */
float shieldFade() {
  if (uShieldOn < 0.001) return 1.0;
  vec2 c = (uShield.xy + uShield.zw) * 0.5;
  vec2 h = (uShield.zw - uShield.xy) * 0.5;
  vec2 d = abs(gl_FragCoord.xy - c) - h;
  float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  float soft = max(h.y, 1.0) * 0.35;
  return 1.0 - uShieldOn * 0.92 * (1.0 - smoothstep(-soft * 0.2, soft, dist));
}
`

/* the same box in CSS pixels from the viewport's top left, for labels
   drawn on the page (star names) */
export const textBox = { left: 0, top: 0, right: 0, bottom: 0, on: false }

const TEXT_BLOCKS = '.stage .intro-content, .stage .story-inner, .stage .return-content'
const _size = new THREE.Vector2()

export default function TextShield() {
  const gl = useThree((state) => state.gl)
  const clock = useRef(0)
  const target = useRef(0)
  const box = useRef(new THREE.Vector4())

  useFrame((_, delta) => {
    clock.current += delta
    if (clock.current > 0.12) {
      clock.current = 0
      target.current = 0
      textBox.on = false
      const element = document.querySelector<HTMLElement>(TEXT_BLOCKS)
      const canvas = gl.domElement
      if (element && canvas.clientWidth > 0) {
        const rect = element.getBoundingClientRect()
        const view = canvas.getBoundingClientRect()
        // the block fades in and out as a whole (its own inline opacity)
        const holder = element.closest<HTMLElement>('.intro-content, .story-content, .return-content')
        const shown = holder ? parseFloat(holder.style.opacity || '1') : 1
        if (rect.width > 0 && rect.height > 0 && shown > 0.02) {
          gl.getDrawingBufferSize(_size)
          const k = _size.x / view.width
          const pad = 28
          box.current.set(
            (rect.left - view.left - pad) * k,
            (view.bottom - rect.bottom - pad) * k,
            (rect.right - view.left + pad) * k,
            (view.bottom - rect.top + pad) * k,
          )
          target.current = Math.min(1, shown)
          textBox.left = rect.left
          textBox.top = rect.top
          textBox.right = rect.right
          textBox.bottom = rect.bottom
          textBox.on = true
        }
      }
    }
    const shield = shieldUniforms.uShield.value
    if (shieldUniforms.uShieldOn.value < 0.01) shield.copy(box.current)
    else shield.lerp(box.current, 1 - Math.exp(-delta * 8))
    shieldUniforms.uShieldOn.value += (target.current - shieldUniforms.uShieldOn.value) * (1 - Math.exp(-delta * 4))
  })

  return null
}
