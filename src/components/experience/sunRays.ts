import * as THREE from 'three'
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'

/* ============================================================
   SUNBEAMS
   Light scattered in the lens (and, on film, in the air of the camera):
   from the Sun's bright disc, faint rays reach out across the frame. Each
   pixel gathers the light that lies between it and the Sun on screen, so
   a world in front of the Sun cuts dark lanes through them, and with the
   Sun just behind its edge, beams stream out round the limb. Only the
   brightest light makes rays (the Sun and its corona, not the planets);
   none while the Sun is far out of the frame (the work is skipped).
============================================================ */

const FRAGMENT = /* glsl */ `
uniform vec2 uSun;
uniform float uStrength;
uniform float uAspect;
#define STEPS 12
#define THRESHOLD 1.1
#define REACH 0.85
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = inputColor;
  if (uStrength <= 0.0) return;
  /* from this pixel towards the Sun, at most 0.6 of the screen */
  vec2 toSun = uSun - uv;
  float far = length(toSun * vec2(uAspect, 1.0));
  /* (far from the Sun the beams have faded: no work there, which is most
     of the frame) */
  if (far > REACH) return;
  vec2 stepUv = toSun * min(1.0, 0.6 / max(far, 1e-4)) / float(STEPS);
  /* (few samples, each pixel starting at its own offset along the way:
     the steps blur into a smooth beam instead of showing as bands) */
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec2 p = uv + stepUv * (jitter - 1.0);
  vec3 gathered = vec3(0.0);
  float weight = 1.0;
  for (int i = 0; i < STEPS; i++) {
    p += stepUv;
    if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) break;
    vec3 s = textureLod(inputBuffer, p, 0.0).rgb;
    float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
    gathered += s * smoothstep(THRESHOLD, THRESHOLD * 4.0, l) * weight;
    weight *= 0.86;
  }
  /* strongest close to the Sun, fading out across the frame */
  float near = exp(-far * 2.2) * (1.0 - smoothstep(REACH * 0.6, REACH, far));
  vec3 rays = gathered / float(STEPS) * near * uStrength;
  /* warm, as sunlight through a lens is */
  outputColor = vec4(inputColor.rgb + rays * vec3(1.0, 0.86, 0.66), inputColor.a);
}`

export class SunRaysEffect extends Effect {
  constructor() {
    super('SunRaysEffect', FRAGMENT, {
      attributes: EffectAttribute.CONVOLUTION,
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uSun', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))],
        ['uStrength', new THREE.Uniform(0)],
        ['uAspect', new THREE.Uniform(1)],
      ]),
    })
  }

  /** the Sun on screen (0..1, from the bottom left), how strong, the aspect */
  set(x: number, y: number, strength: number, aspect: number) {
    ;(this.uniforms.get('uSun')!.value as THREE.Vector2).set(x, y)
    this.uniforms.get('uStrength')!.value = strength
    this.uniforms.get('uAspect')!.value = aspect
  }
}
