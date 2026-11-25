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
float shipNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(shipHash(i), shipHash(i + vec2(1.0, 0.0)), f.x), mix(shipHash(i + vec2(0.0, 1.0)), shipHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
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
/* the bells: the three main engines and the pods' two (axis x, y, radius,
   the mouth's z), set from the model as it is built */
uniform vec4 uBells[5];
/* the markings (the flag, "USA", "United States"), drawn once into a
   1024 px square; a mark's rectangle there, in pixels from the top left,
   and the point's place in the mark (0..1 across, 0..1 up) */
uniform sampler2D uMarks;
vec4 shipMark(vec2 local, vec4 rect) {
  if (local.x < 0.0 || local.x > 1.0 || local.y < 0.0 || local.y > 1.0) return vec4(0.0);
  return texture2D(uMarks, (rect.xy + vec2(local.x, 1.0 - local.y) * rect.zw) / 1024.0);
}
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
    /* the engines' bells: deep, flared, of a thousand brazed cooling
       tubes running their length. Which bell: the nearest axis. */
    vec4 bell = uBells[0];
    float nearest = 1e9;
    for (int k = 0; k < 5; k++) {
      float d = length(p.xy - uBells[k].xy) / max(uBells[k].z, 1e-4);
      if (d < nearest) { nearest = d; bell = uBells[k]; }
    }
    vec2 rel = p.xy - bell.xy;
    float around = atan(rel.y, rel.x) * 60.0;
    // the tubes, as fine ribs (gone where they are finer than a pixel)
    float rib = (0.5 + 0.5 * cos(around * 6.2832 / 3.1416)) * (1.0 - smoothstep(0.35, 0.9, fwidth(around)));
    // how deep into the bell: 0 at the mouth, 1 towards the throat
    float depth = clamp((bell.w - p.z) / (bell.z * 2.6), 0.0, 1.0);
    // (only the bell itself: the engine's other metal, round the pods and
    // the plumbing, stays plain worn metal)
    bool inBell = nearest < 1.12 && p.z > bell.w - bell.z * 2.8 && p.z < bell.w + 0.002;
    if (!inBell) {
      // (matte enough not to blaze in the sun or mirror the sky's blue)
      shipRough = 0.55;
      shipMetal = 0.4;
      diffuseColor.rgb *= 0.85 + 0.25 * smoothstep(0.42, 0.5, p.z);
    } else if (!gl_FrontFacing) {
      /* inside (the wall seen from within, through the open mouth): soot
         at the mouth, then metal tinted by the heat, bronze and gold,
         turning blue towards the throat */
      vec3 heat = mix(vec3(0.2, 0.12, 0.05), vec3(0.06, 0.075, 0.15), smoothstep(0.5, 0.95, depth));
      heat = mix(vec3(0.022, 0.02, 0.019), heat, smoothstep(0.06, 0.4, depth));
      diffuseColor.rgb = heat * (0.7 + 0.3 * rib);
      shipRough = mix(0.92, 0.6, smoothstep(0.1, 0.6, depth));
      shipMetal = mix(0.1, 0.5, smoothstep(0.1, 0.6, depth));
      shipBump = rib * 0.6;
    } else {
      /* outside: worn metal, the tubes in relief, a bronze and blue heat
         tint towards the throat, and soot round the lip */
      vec3 tint = mix(vec3(1.0), vec3(1.08, 0.92, 0.74), smoothstep(0.35, 0.8, depth));
      tint = mix(tint, vec3(0.8, 0.86, 1.08), smoothstep(0.8, 1.0, depth));
      diffuseColor.rgb *= tint * (0.82 + 0.18 * rib) * mix(0.45, 1.0, smoothstep(0.0, 0.07, depth));
      shipRough = 0.5;
      shipMetal = 0.6;
      shipBump = rib * 0.8;
    }
  } else {
    // the black tiles: the belly, the lower sides, and round the windows
    bool mask = p.z > -0.44 && p.z < -0.33 && p.y > -0.075 && abs(p.x) < 0.07 && n.y > -0.2
      && (p.z < -0.395 || p.y < -0.035 || abs(p.x) > 0.045);
    // (the pods' rear faces: their corners were coloured tile or blanket
    // one by one, by which way each faced, and blended into brown blotches;
    // all blanket here, the soot round the engines darkening them evenly)
    bool podRear = p.z > 0.43 && n.z > 0.55 && abs(p.x) > 0.045 && p.y > -0.075;
    if ((tile || mask) && !podRear) {
      vec2 cell = sheet / 0.0055;
      vec2 id = floor(cell);
      float shade = 0.5 + 0.95 * shipHash(id) + 0.3 * shipHash(floor(cell / 7.0) + 3.1);
      // older tiles, browner and paler, in patches; and here and there a
      // newer one, replaced after a flight, a clearly lighter grey
      vec3 tint = mix(vec3(1.0), vec3(1.35, 1.2, 1.0), step(0.93, shipHash(id + 17.0)));
      tint = mix(tint, vec3(2.1, 2.1, 2.2), step(0.965, shipHash(id + 41.0)));
      float grout = shipLines(cell, 0.06);
      // streaks along the flow, from the heat of re-entry
      float streak = 0.88 + 0.28 * shipHash(vec2(floor(p.x * 140.0), 3.0)) * smoothstep(-0.2, 0.3, p.z);
      streak *= 0.8 + 0.4 * shipNoise(vec2(p.x * 110.0, p.z * 5.0));
      vec3 black = vec3(0.012, 0.0125, 0.014) * shade * tint * streak;
      diffuseColor.rgb = mix(black, vec3(0.03, 0.03, 0.028), grout);
      shipRough = 0.92;
      shipMetal = 0.0;
      shipBump = -grout * 0.6;
    } else {
      // the white blankets: quilted, a little uneven
      if (podRear) diffuseColor.rgb = vec3(0.78, 0.8, 0.82);
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
      /* weathering: stains trailing aft from the seams (the flow ran nose
         to tail), scuffs and smudges, and the blankets yellowed unevenly
         by the sun (fine detail faded where it is smaller than a pixel) */
      float stained = smoothstep(0.55, 0.95, shipHash(vec2(qid.x, floor(qid.y / 3.0)) + 9.0));
      float trail = exp(-fract(quilt.y) * 3.2) * stained;
      float fine = 1.0 - smoothstep(0.3, 1.0, fwidth(sheet.x * 140.0));
      float smudge = smoothstep(0.62, 0.92, shipNoise(sheet * 140.0)) * fine;
      float scuff = smoothstep(0.8, 0.97, shipNoise(vec2(sheet.x * 600.0, sheet.y * 90.0))) * (1.0 - smoothstep(0.3, 1.0, fwidth(sheet.x * 600.0)));
      float yellowed = smoothstep(0.45, 0.85, shipNoise(sheet * 14.0 + 5.0));
      diffuseColor.rgb *= 1.0 - 0.24 * trail - 0.16 * smudge - 0.18 * scuff;
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.9, 0.85, 0.74), yellowed);
      // the wings' upper panels, and the fin's
      bool wingTop = abs(p.x) > 0.12 && p.y < -0.07 && n.y > 0.5;
      bool fin = abs(p.x) < 0.03 && p.y > 0.015 && p.z > 0.28;
      if (wingTop || fin) {
        vec2 grid = wingTop ? vec2(p.x / 0.05, p.z / 0.06) : vec2(p.z / 0.028, p.y / 0.03);
        float panels = shipLines(grid, 0.018);
        diffuseColor.rgb *= 1.0 - 0.32 * panels;
        shipBump -= panels * 0.7;
      }
      // the fin's leading edge: dark, as the orbiter's
      if (fin && n.z < -0.45) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.05, 0.052), smoothstep(-0.45, -0.7, n.z));
      // the crew hatch on the left side, round, with its small window
      if (p.x < -0.03 && n.x < -0.6) {
        float r = length(vec2(p.z + 0.36, p.y + 0.07));
        float ring = shipLine(r - 0.0125, 0.0007);
        diffuseColor.rgb *= 1.0 - 0.7 * ring;
        shipBump -= ring * 1.4;
        if (r < 0.0042) {
          diffuseColor.rgb = vec3(0.012, 0.014, 0.018);
          shipRough = 0.1;
        }
        // its handle
        float handle = (1.0 - step(0.0018, abs(p.y + 0.0775))) * (1.0 - step(0.004, abs(p.z + 0.36)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25), handle);
      }
      // the star trackers' doors, ahead of the payload bay
      if (n.y > 0.6 && p.y > -0.03 && p.z > -0.285 && p.z < -0.265 && abs(p.x) > 0.012 && abs(p.x) < 0.026)
        diffuseColor.rgb = vec3(0.05, 0.05, 0.055);
      // the payload bay doors: centre seam, hinge lines, section joints
      if (p.z > -0.25 && p.z < 0.285 && p.y > -0.045) {
        float seam = shipLine(p.x, 0.0007);
        float hinge = shipLine(abs(p.x) - 0.083, 0.0008);
        float joints = shipLine(fract((p.z + 0.25) / 0.107 + 0.5) - 0.5, 0.004);
        float lines = max(seam, max(hinge, joints * step(abs(p.x), 0.083)));
        diffuseColor.rgb *= 1.0 - 0.6 * lines;
        shipBump -= lines * 0.9;
      }
      /* the markings, as the orbiter wore them: the flag and "USA" on the
         left wing, read with the nose up; the flag and "United States" on
         each side of the fuselage, under the payload bay, the flag forward
         with its stars to the front (so on the right side, reversed) */
      vec4 mark = vec4(0.0);
      if (p.x < -0.12 && n.y > 0.5 && p.y > -0.125) {
        mark = shipMark(vec2((p.x + 0.2475) / 0.085, (0.1925 - p.z) / 0.045), vec4(0.0, 0.0, 950.0, 500.0));
        vec4 usa = shipMark(vec2((p.x + 0.2575) / 0.105, (0.3125 - p.z) / 0.047), vec4(0.0, 520.0, 600.0, 270.0));
        mark = mix(mark, usa, usa.a);
      }
      if (abs(p.x) > 0.12 && n.y > 0.5 && p.y > -0.125) {
        // small stencils on both wings' upper surfaces, by the roots
        float ax = abs(p.x);
        vec4 step1 = shipMark(vec2((p.x - sign(p.x) * 0.135 + 0.0175) / 0.035, (0.335 - p.z) / 0.008), vec4(620.0, 530.0, 390.0, 80.0));
        vec4 step2 = shipMark(vec2((p.x - sign(p.x) * 0.135 + 0.0175) / 0.035, (0.245 - p.z) / 0.008), vec4(620.0, 530.0, 390.0, 80.0));
        mark = mix(mark, step1, step1.a * step(ax, 0.16));
        mark = mix(mark, step2, step2.a * step(ax, 0.16));
      } else if (abs(n.x) > 0.6 && p.y > -0.1 && p.y < -0.05 && abs(p.x) > 0.06) {
        float y = (p.y + 0.091) / 0.032;
        mark = shipMark(vec2((p.z + 0.215) / 0.061, y), vec4(0.0, 0.0, 950.0, 500.0));
        float across = p.x < 0.0 ? (p.z + 0.14) / 0.177 : (0.037 - p.z) / 0.177;
        vec4 words = shipMark(vec2(across, (p.y + 0.088) / 0.026), vec4(0.0, 800.0, 1024.0, 150.0));
        mark = mix(mark, words, words.a);
      }
      // "RESCUE", under the hatch
      if (p.x < -0.03 && n.x < -0.6) {
        vec4 rescue = shipMark(vec2((p.z + 0.375) / 0.03, (p.y + 0.094) / 0.0062), vec4(620.0, 640.0, 390.0, 80.0));
        mark = mix(mark, rescue, rescue.a);
      }
      // (painted on, so the blankets' quilting and grime still show)
      diffuseColor.rgb = mix(diffuseColor.rgb, mark.rgb * (0.55 + 0.45 * shade), mark.a);
      shipBump *= 1.0 - 0.5 * mark.a;
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

    // soot: round the thrusters' ports (streaky), and on the base round
    // the engines, where their exhaust has blackened it
    float nearFwd = (1.0 - smoothstep(0.0, 0.016, max(abs(p.z + 0.45) - 0.02, 0.0) + max(abs(p.y + 0.0855) - 0.022, 0.0))) * step(0.45, abs(n.x));
    float nearAft = (1.0 - smoothstep(0.0, 0.016, max(abs(p.z - 0.46) - 0.024, 0.0) + max(abs(p.y + 0.014) - 0.02, 0.0))) * step(0.04, abs(p.x)) * step(0.45, abs(n.x));
    float streaky = 0.45 + 0.55 * shipHash(vec2(floor(p.y * 900.0), floor(p.z * 60.0)));
    float baseSoot = smoothstep(0.455, 0.49, p.z) * smoothstep(0.2, 0.6, n.z);
    // (and trailing back from the nose thrusters along the flow)
    float trailFwd = step(0.45, abs(n.x)) * (1.0 - smoothstep(0.0, 0.008, abs(p.y + 0.0855) - 0.02)) * step(-0.432, p.z) * (1.0 - smoothstep(-0.432, -0.36, p.z));
    float soot = max(max(nearFwd, nearAft) * streaky, max(baseSoot * 0.8, trailFwd * streaky * 0.7));
    diffuseColor.rgb *= 1.0 - 0.6 * soot;

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

/* The markings, drawn once into a 1024 px square (the shader's rectangles
   for each): the flag at the top left (950 x 500, the flag's own
   proportions), "USA" beneath it (600 x 270), "United States" along the
   bottom (1024 x 150). Black lettering, as the orbiter's. */
function drawMarks() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024
  const g = canvas.getContext('2d')!
  // the flag: thirteen stripes, the blue union seven stripes deep and
  // 0.76 of the flag's height across, fifty stars in rows of six and five
  const W = 950
  const H = 500
  const stripe = H / 13
  for (let i = 0; i < 13; i += 1) {
    g.fillStyle = i % 2 === 0 ? '#b22234' : '#f4f3ef'
    g.fillRect(0, i * stripe, W, Math.ceil(stripe))
  }
  const unionW = H * 0.76
  const unionH = stripe * 7
  g.fillStyle = '#3c3b6e'
  g.fillRect(0, 0, unionW, unionH)
  g.fillStyle = '#f4f3ef'
  const star = (cx: number, cy: number, r: number) => {
    g.beginPath()
    for (let k = 0; k < 10; k += 1) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5
      const rr = k % 2 === 0 ? r : r * 0.382
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
    }
    g.closePath()
    g.fill()
  }
  for (let row = 0; row < 9; row += 1) {
    const count = row % 2 === 0 ? 6 : 5
    for (let col = 0; col < count; col += 1) {
      const x = (unionW / 12) * (row % 2 === 0 ? 1 + col * 2 : 2 + col * 2)
      const y = (unionH / 10) * (row + 1)
      star(x, y, H * 0.0616 / 2)
    }
  }
  // the lettering
  g.fillStyle = '#121212'
  g.textBaseline = 'middle'
  g.textAlign = 'center'
  g.font = 'bold 250px Helvetica, Arial, sans-serif'
  g.fillText('USA', 300, 520 + 135, 590)
  g.font = '600 128px Helvetica, Arial, sans-serif'
  g.fillText('United States', 512, 800 + 75, 1010)
  // small stencils: "NO STEP" (black), "RESCUE" (black on a yellow band)
  g.font = 'bold 66px Helvetica, Arial, sans-serif'
  g.fillText('NO STEP', 620 + 195, 530 + 42, 380)
  g.fillStyle = '#e3b62a'
  g.fillRect(620, 640, 390, 80)
  g.fillStyle = '#121212'
  g.fillText('RESCUE', 620 + 195, 640 + 42, 370)
  const texture = new THREE.CanvasTexture(canvas)
  texture.flipY = false
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** give the built Shuttle's material its surface (once); bells: each
    engine's axis x, y, radius and mouth z, in the model's units */
export function detailShuttle(material: THREE.MeshStandardMaterial, bells: THREE.Vector4[] = []) {
  const far = new THREE.Vector4(9, 9, 0.01, 0)
  const bellList = Array.from({ length: 5 }, (_, i) => bells[i] ?? far)
  const marks = drawMarks()
  material.addEventListener('dispose', () => marks.dispose())
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBells = { value: bellList }
    shader.uniforms.uMarks = { value: marks }
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
  material.customProgramCacheKey = () => 'shuttle-skin-5'
  material.needsUpdate = true
}
