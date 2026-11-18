import * as THREE from 'three'
import { Pass } from 'postprocessing'

/* ============================================================
   THE MARCHED EFFECTS, AT HALF RESOLUTION
   The air round the planets, the 3D clouds and the auroras are worked
   out by stepping along each pixel's line of sight: by far the heaviest
   work when a world fills the screen. They are soft, so they are drawn
   at half the size (a quarter of the pixels) into a buffer of their own
   and laid over the frame, smoothly scaled up. They live on a render
   layer of their own (the main render skips it), and each tests the main
   render's depth itself, so a moon, a mountain or the ground still hides
   what is behind it. Drawn before the Shuttle's own layer.
============================================================ */

export const LOW_RES_LAYER = 5
/* the fraction of the frame's width and height they are drawn at */
export const LOW_RES_SCALE = 0.5

/* shared by every marched material */
export const lowResUniforms = {
  uSceneDepth: { value: null as THREE.Texture | null },
  uLowResSize: { value: new THREE.Vector2(1, 1) },
  uSceneDepthOn: { value: 0 },
}

/* call first in a marched material's main(): gone where the scene is in front */
export const LOW_RES_GLSL = /* glsl */ `
uniform sampler2D uSceneDepth; uniform vec2 uLowResSize; uniform float uSceneDepthOn;
void sceneOcclusion() {
  if (uSceneDepthOn < 0.5) return;
  // (the nearest of the frame's pixels this one covers, so a thin edge in
  // front still hides it)
  vec2 uv = gl_FragCoord.xy / uLowResSize;
  vec2 px = 0.25 / uLowResSize;
  float scene = min(
    min(texture2D(uSceneDepth, uv + vec2(-px.x, -px.y)).r, texture2D(uSceneDepth, uv + vec2(px.x, -px.y)).r),
    min(texture2D(uSceneDepth, uv + vec2(-px.x, px.y)).r, texture2D(uSceneDepth, uv + vec2(px.x, px.y)).r));
  if (gl_FragCoord.z > scene) discard;
}
`

/** put a mesh on the half-resolution layer (and only there) */
export function lowRes(object: THREE.Object3D | null) {
  object?.layers.set(LOW_RES_LAYER)
}

const COMPOSITE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`
const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uMap, vUv);
}`

export class LowResPass extends Pass {
  private target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  })
  private _clear = new THREE.Color()
  private full = new THREE.Vector2(1, 1)
  /** the fraction of the frame's size they are drawn at (the meter can switch it) */
  scale = LOW_RES_SCALE

  constructor(
    private world: THREE.Scene,
    private eye: THREE.Camera,
  ) {
    super('LowResPass')
    this.needsSwap = false
    this.needsDepthTexture = true
    this.fullscreenMaterial = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.target.texture } },
      vertexShader: COMPOSITE_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      toneMapped: false,
    })
  }

  override setDepthTexture(depthTexture: THREE.Texture) {
    lowResUniforms.uSceneDepth.value = depthTexture
    lowResUniforms.uSceneDepthOn.value = depthTexture ? 1 : 0
  }

  override setSize(width: number, height: number) {
    this.full.set(width, height)
    const w = Math.max(1, Math.round(width * this.scale))
    const h = Math.max(1, Math.round(height * this.scale))
    this.target.setSize(w, h)
    lowResUniforms.uLowResSize.value.set(w, h)
  }

  /** draw them at another fraction of the frame's size */
  setScale(scale: number) {
    this.scale = scale
    this.setSize(this.full.x, this.full.y)
  }

  override render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget | null) {
    const eye = this.eye
    const mask = eye.layers.mask
    const background = this.world.background
    const autoClear = renderer.autoClear
    renderer.getClearColor(this._clear)
    const clearAlpha = renderer.getClearAlpha()
    // the marched layer alone, into its own (transparent) buffer
    eye.layers.set(LOW_RES_LAYER)
    this.world.background = null
    renderer.autoClear = false
    renderer.setRenderTarget(this.target)
    renderer.setClearColor(0x000000, 0)
    renderer.clear(true, false, false)
    renderer.render(this.world, eye)
    eye.layers.mask = mask
    this.world.background = background
    renderer.setClearColor(this._clear, clearAlpha)
    // laid over the frame (premultiplied: the effects add their light and
    // hide what they cover)
    renderer.setRenderTarget(this.renderToScreen ? null : inputBuffer)
    renderer.render(this.scene, this.camera)
    renderer.autoClear = autoClear
  }

  override dispose() {
    this.target.dispose()
    super.dispose()
  }
}
