import { BlendFunction, Effect } from 'postprocessing'

/* ============================================================
   THE GRADE
   A documentary film's colour: blacks deepened and lifted only a breath,
   towards navy (space on film is never a flat, empty black), the shadows
   a touch cool and the sunlit highlights a touch warm; and then the tone
   curve, which eases the brightest light in rather than cutting it off.
   Works on the scene's linear light; small enough that the planets keep
   their true colours.
============================================================ */

const FRAGMENT = /* glsl */ `
#define KNEE 0.76
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb, vec3(0.0));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  /* deeper blacks: the faint haze of near-black eased down */
  c *= mix(0.72, 1.0, smoothstep(0.0, 0.018, l));
  /* cool in the shade, warm in the sun */
  c *= mix(vec3(0.965, 0.99, 1.045), vec3(1.04, 1.0, 0.955), smoothstep(0.015, 0.5, l));
  /* and the darkest a breath of navy, never quite empty */
  c += vec3(0.0007, 0.0012, 0.003) * (1.0 - smoothstep(0.0, 0.03, l));
  /* the tone curve (the composer turns the renderer's own off, so the
     light was simply cut off at white: the Sun a flat orange, a lit limb
     or a cloud top clipped). Below the knee nothing changes; above it the
     brightest light is eased in, and the brightest of all drifts towards
     white, as it does to the eye and on film (the highlight half of the
     Khronos PBR Neutral curve; not its toe, which would darken space) */
  c = min(c, vec3(1e4)); // (an infinite light would come out NaN below)
  float peak = max(c.r, max(c.g, c.b));
  if (peak > KNEE) {
    float d = 1.0 - KNEE;
    float eased = 1.0 - d * d / (peak + d - KNEE);
    c *= eased / peak;
    float toWhite = 1.0 - 1.0 / (0.15 * (peak - eased) + 1.0);
    c = mix(c, vec3(eased), toWhite);
  }
  outputColor = vec4(c, inputColor.a);
}
`

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', FRAGMENT, { blendFunction: BlendFunction.NORMAL })
  }
}
