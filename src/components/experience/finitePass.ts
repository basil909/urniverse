import * as THREE from 'three'
import { Pass } from 'postprocessing'

/* ============================================================
   ONLY FINITE LIGHT
   Before the glow: any pixel that is not a finite number (NaN, or
   infinite) becomes black. One such pixel, from any shader, was spread
   by the glow's blur over the whole frame, and the page went black but
   for its own markers (on Windows, Direct3D now and then gave a NaN in
   the Sun's light). The test is on the bits, which the compiler's fast
   maths cannot drop.
============================================================ */

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`

const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  uvec4 bits = floatBitsToUint(c) & 0x7f800000u;
  if (any(equal(bits, uvec4(0x7f800000u)))) c = vec4(0.0, 0.0, 0.0, 1.0);
  gl_FragColor = c;
}`

export class FinitePass extends Pass {
  private readonly material: THREE.ShaderMaterial

  constructor() {
    super('FinitePass')
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: null as THREE.Texture | null } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    this.fullscreenMaterial = this.material
    this.needsSwap = true
  }

  override render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget | null, outputBuffer: THREE.WebGLRenderTarget | null) {
    this.material.uniforms.uMap.value = inputBuffer?.texture ?? null
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)
  }

  override dispose() {
    this.material.dispose()
    super.dispose()
  }
}
