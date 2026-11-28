import * as THREE from 'three'
import { AdaptiveLuminancePass, BlendFunction, Effect, LuminancePass } from 'postprocessing'

/* ============================================================
   THE EYE ADAPTS
   The picture's exposure follows how bright the scene is, slowly, as an
   eye or a camera does: with the Sun filling the frame it comes down a
   little (the Sun keeps its fire, the rest is not washed out); on a
   night side it opens up over a second or two, and city lights,
   earthshine and faint stars come through. Only part of the way, as the
   eye does (night stays night), and within limits.
   The scene's average brightness is measured on the graphics card (a
   small copy, mipmapped down to one pixel, eased over time); nothing is
   read back to the page.
============================================================ */

const FRAGMENT = /* glsl */ `
uniform lowp sampler2D uLuminance; // (packing comes with the effect shader)
uniform float uKey;
uniform float uStrength;
uniform vec2 uRange;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float average = max(unpackRGBAToDepth(texture2D(uLuminance, vec2(0.5))), 1e-4);
  float exposure = clamp(pow(uKey / average, uStrength), uRange.x, uRange.y);
  outputColor = vec4(inputColor.rgb * exposure, inputColor.a);
}`

/* the measuring copy: 64 x 64, so its sixth mip level is one pixel */
const SIZE = 64
const ONE_PIXEL_LEVEL = 6

export class EyeAdaptEffect extends Effect {
  private readonly measure: LuminancePass
  private readonly adapt: AdaptiveLuminancePass
  private readonly target: THREE.WebGLRenderTarget

  constructor({ key = 0.009, strength = 0.3, min = 0.72, max = 1.5, rate = 1.2 } = {}) {
    super('EyeAdaptEffect', FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uLuminance', new THREE.Uniform(null)],
        ['uKey', new THREE.Uniform(key)],
        ['uStrength', new THREE.Uniform(strength)],
        ['uRange', new THREE.Uniform(new THREE.Vector2(min, max))],
      ]),
    })
    this.target = new THREE.WebGLRenderTarget(SIZE, SIZE, { minFilter: THREE.LinearMipmapLinearFilter, depthBuffer: false })
    this.target.texture.generateMipmaps = true
    this.target.texture.name = 'EyeAdapt.Luminance'
    this.measure = new LuminancePass({ renderTarget: this.target })
    this.measure.resolution.setPreferredSize(SIZE, SIZE)
    this.adapt = new AdaptiveLuminancePass(this.measure.texture, { minLuminance: 0.0005, adaptationRate: rate })
    ;(this.adapt.fullscreenMaterial as THREE.ShaderMaterial & { mipLevel1x1: number }).mipLevel1x1 = ONE_PIXEL_LEVEL
    this.uniforms.get('uLuminance')!.value = this.adapt.texture
  }

  /** the measured, eased average brightness (for tuning) */
  get luminanceTexture() {
    return this.adapt.texture
  }

  override update(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, deltaTime?: number) {
    this.measure.render(renderer, inputBuffer, null)
    this.adapt.render(renderer, null, null, deltaTime)
  }

  override initialize(renderer: THREE.WebGLRenderer, alpha: boolean, frameBufferType: number) {
    this.adapt.initialize(renderer, alpha, frameBufferType)
  }

  override dispose() {
    this.measure.dispose()
    this.adapt.dispose()
    this.target.dispose()
    super.dispose()
  }
}
