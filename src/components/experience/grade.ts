import { BlendFunction, Effect } from 'postprocessing'

/* ============================================================
   THE GRADE
   A documentary film's colour: blacks deepened and lifted only a breath,
   towards navy (space on film is never a flat, empty black), the shadows
   a touch cool and the sunlit highlights a touch warm. Works on the
   scene's linear light, before the tone curve; small enough that the
   planets keep their true colours.
============================================================ */

const FRAGMENT = /* glsl */ `
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb, vec3(0.0));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  /* deeper blacks: the faint haze of near-black eased down */
  c *= mix(0.72, 1.0, smoothstep(0.0, 0.018, l));
  /* cool in the shade, warm in the sun */
  c *= mix(vec3(0.965, 0.99, 1.045), vec3(1.04, 1.0, 0.955), smoothstep(0.015, 0.5, l));
  /* and the darkest a breath of navy, never quite empty */
  c += vec3(0.0007, 0.0012, 0.003) * (1.0 - smoothstep(0.0, 0.03, l));
  outputColor = vec4(c, inputColor.a);
}
`

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', FRAGMENT, { blendFunction: BlendFunction.NORMAL })
  }
}
