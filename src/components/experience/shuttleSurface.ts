import * as THREE from 'three'

/* ============================================================
   THE SHUTTLE'S SKIN
   NASA's model has no textures: white above, black below. This shader
   gives the orbiter the surface it really had, from its own shape (the
   model is one unit long, nose to -z, fuselage top at y = 0, belly at
   y = -0.145, wings spanning +-0.355 at y = -0.11):
   - the belly's heat-shield tiles, some 24,000 of them on the real one,
     each a slightly different black, with the grout between them;
   - the white insulation blankets on top, quilted, a little uneven,
     and dirtier towards the tail;
   - the payload bay doors: the seam down the middle, the hinge lines,
     the joints between the door sections;
   - the black tiles round the cockpit windows, as the real one wore;
   - the grey reinforced carbon-carbon of the nose cap and the wings'
     leading edges, which took the hottest of re-entry;
   - glass that shines, engines of metal.
   Fine detail fades to its average where it is smaller than a pixel,
   so the ship never shimmers. Applied once, to the built model's
   material (flight, the films' exploration shot).
============================================================ */

const VERTEX_HEAD = /* glsl */ `
varying vec3 vShipP;
varying vec3 vShipN;
`
const FRAGMENT_HEAD = /* glsl */ `
varying vec3 vShipP;
varying vec3 vShipN;
float shipHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
/* a grid's lines (1 on a line), never thinner than a pixel, faded out
   where the cells are too small to draw */
float shipLines(vec2 uv, float width) {
  vec2 w = fwidth(uv);
  vec2 d = abs(fract(uv + 0.5) - 0.5);
  vec2 l = 1.0 - smoothstep(vec2(width) - w, vec2(width) + w, d);
  float fade = 1.0 - smoothstep(0.18, 0.4, max(w.x, w.y));
  return max(l.x, l.y) * fade;
}
float shipLine(float x, float width) {
  float w = fwidth(x);
  return 1.0 - smoothstep(width - w, width + w * 1.5, abs(x));
}
float shipRough = 0.6;
float shipMetal = 0.05;
float shipBump = 0.0;
`

const COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 p = vShipP;
  vec3 n = normalize(vShipN);
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2));
  bool glass = lum < 0.006;
  bool tile = !glass && lum < 0.05;
  bool metal = lum >= 0.05 && lum < 0.4;
  // the plane the tiles and blankets lie in (the hull's facing)
  vec2 sheet = abs(n.y) > 0.55 ? p.xz : p.yz;

  if (glass) {
    shipRough = 0.08;
    shipMetal = 0.0;
  } else if (metal) {
    // the main engines' bells: worn metal, darker at the throat
    shipRough = 0.38;
    shipMetal = 0.75;
    diffuseColor.rgb *= 0.85 + 0.25 * smoothstep(0.42, 0.5, p.z);
  } else {
    // the black tiles: the belly, the lower sides, and round the windows
    bool mask = p.z > -0.44 && p.z < -0.33 && p.y > -0.075 && abs(p.x) < 0.07 && n.y > -0.2
      && (p.z < -0.395 || p.y < -0.035 || abs(p.x) > 0.045);
    if (tile || mask) {
      vec2 cell = sheet / 0.0055;
      vec2 id = floor(cell);
      float shade = 0.62 + 0.75 * shipHash(id) + 0.25 * shipHash(floor(cell / 7.0) + 3.1);
      // older tiles, browner and paler, in patches
      vec3 tint = mix(vec3(1.0), vec3(1.35, 1.2, 1.0), step(0.93, shipHash(id + 17.0)));
      float grout = shipLines(cell, 0.06);
      // streaks along the flow, from the heat of re-entry
      float streak = 0.88 + 0.28 * shipHash(vec2(floor(p.x * 140.0), 3.0)) * smoothstep(-0.2, 0.3, p.z);
      vec3 black = vec3(0.012, 0.0125, 0.014) * shade * tint * streak;
      diffuseColor.rgb = mix(black, vec3(0.03, 0.03, 0.028), grout);
      shipRough = 0.92;
      shipMetal = 0.0;
      shipBump = -grout * 0.6;
    } else {
      // the white blankets: quilted, a little uneven
      vec2 quilt = sheet / vec2(0.026, 0.03);
      vec2 qid = floor(quilt);
      vec2 q = fract(quilt) - 0.5;
      float pillow = 1.0 - dot(q, q) * 1.4;
      float stitch = shipLines(quilt, 0.035);
      float shade = 0.9 + 0.1 * shipHash(qid);
      diffuseColor.rgb *= shade * mix(1.0, 0.82, stitch);
      shipBump = pillow * 0.35 - stitch * 0.5;
      shipRough = 0.72;
      // weathered towards the tail and along the top, faintly brown
      float grime = smoothstep(-0.1, 0.5, p.z) * 0.12 + smoothstep(0.6, 0.9, shipHash(floor(p.xz * vec2(60.0, 9.0)))) * 0.05;
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.86, 0.82, 0.76), grime);
      // the payload bay doors: centre seam, hinge lines, section joints
      if (p.z > -0.25 && p.z < 0.285 && p.y > -0.045) {
        float seam = shipLine(p.x, 0.0007);
        float hinge = shipLine(abs(p.x) - 0.083, 0.0008);
        float joints = shipLine(fract((p.z + 0.25) / 0.107 + 0.5) - 0.5, 0.004);
        float lines = max(seam, max(hinge, joints * step(abs(p.x), 0.083)));
        diffuseColor.rgb *= 1.0 - 0.6 * lines;
        shipBump -= lines * 0.9;
      }
    }
    // control surfaces: the elevons' hinge and split, the body flap, the rudder
    float wing = step(0.115, abs(p.x)) * step(p.y, -0.07);
    float elevon = wing * step(abs(p.x), 0.345) * max(shipLine(p.z - 0.425, 0.0009), step(0.425, p.z) * shipLine(abs(p.x) - 0.235, 0.0009));
    float flap = step(abs(p.x), 0.1) * step(p.y, -0.1) * shipLine(p.z - 0.468, 0.0009);
    float rudder = step(abs(p.x), 0.025) * step(0.012, p.y) * step(0.3, p.z) * shipLine(p.z - 0.415 - 0.32 * p.y, 0.0009);
    float hinges = max(max(elevon, flap), rudder);
    diffuseColor.rgb *= 1.0 - 0.75 * hinges;
    shipBump -= hinges * 1.2;
    // the thrusters: rows of small dark ports, on the nose and on the
    // engine pods by the tail
    bool forwardRcs = p.z > -0.468 && p.z < -0.432 && p.y > -0.105 && p.y < -0.066 && abs(n.x) > 0.45;
    bool aftRcs = p.z > 0.438 && p.z < 0.482 && p.y > -0.032 && p.y < 0.004 && abs(p.x) > 0.04 && abs(n.x) > 0.45;
    if (forwardRcs || aftRcs) {
      vec2 ports = vec2(p.z / 0.009, p.y / 0.011);
      vec2 pc = abs(fract(ports) - 0.5);
      float port = (1.0 - smoothstep(0.2, 0.28, max(pc.x, pc.y))) * (1.0 - smoothstep(0.18, 0.35, fwidth(ports.x)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.006), port);
      shipBump -= port * 1.5;
    }

    // the reinforced carbon-carbon: the nose cap, the wings' leading edges
    float noseCap = smoothstep(-0.468, -0.478, p.z);
    float leading = step(0.105, abs(p.x)) * smoothstep(-0.45, -0.75, n.z) * step(p.y, -0.07);
    float rcc = max(noseCap, leading);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.16, 0.155), rcc);
    shipRough = mix(shipRough, 0.55, rcc);
  }
}
`

const BUMP = /* glsl */ `
#include <normal_fragment_maps>
{
  // the detail's relief, from how its height changes across the pixel;
  // the height in the ship's own units (a few cm on a 37 m orbiter),
  // carried into view units by how far a pixel spans in each
  vec3 dpdx = dFdx(-vViewPosition);
  float viewPerShip = length(dpdx) / max(length(dFdx(vShipP)), 1e-12);
  float h = shipBump * 0.0005 * viewPerShip;
  vec3 dpdy = dFdy(-vViewPosition);
  float hx = dFdx(h);
  float hy = dFdy(h);
  vec3 r1 = cross(dpdy, normal);
  vec3 r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  if (abs(det) > 1e-12) {
    vec3 grad = sign(det) * (hx * r1 + hy * r2);
    normal = normalize(abs(det) * normal - grad);
  }
}
`

/** give the built Shuttle's material its surface (once) */
export function detailShuttle(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vShipP = position;
      vShipN = normal;`,
    )
    shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader
      .replace('#include <color_fragment>', COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = shipRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = shipMetal;')
      .replace('#include <normal_fragment_maps>', BUMP)
  }
  material.customProgramCacheKey = () => 'shuttle-skin-1'
  material.needsUpdate = true
}
