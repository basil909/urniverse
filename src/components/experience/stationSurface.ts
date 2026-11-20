import * as THREE from 'three'

/* ============================================================
   THE SPACE STATION'S SKIN
   NASA's "ISS (B)" model is one plain grey throughout. This gives each
   part the surface it really has, from its material's name in the model
   (the modelling package's own: metal truss shaded "anisotropic", the
   Soyuz's parts named for it, and so on) and its place in the station:
   - the solar arrays (one flat sheet in the model): fields of small
     amber-bronze cells in a fine silver grid, blankets either side of a
     mast, seams between panels, a pale back;
   - the truss: silver metal in a lattice;
   - the modules: off-white insulation blankets, quilted, with seams;
   - gold-foil insulation where the model has its "horns";
   - the Soyuz's grey-green.
   Fine lines fade to their average where smaller than a pixel. Applied
   once to the loaded model (the journey's shot and the flight share it).
============================================================ */

type Kind = 'arrays' | 'truss' | 'blanket' | 'module' | 'gold' | 'soyuz'

function kindOf(mesh: THREE.Mesh, material: THREE.Material): Kind {
  const name = material.name.toLowerCase()
  const geometry = mesh.geometry
  geometry.computeBoundingBox()
  const size = geometry.boundingBox!.getSize(new THREE.Vector3())
  const dims = [size.x, size.y, size.z].sort((a, b) => a - b)
  // the one great flat sheet: the arrays (and radiators beside them)
  if (dims[0] < dims[2] * 0.02 && dims[2] > 0.3) return 'arrays'
  if (name.includes('anisotropic') || name.includes('bendedtruss')) return 'truss'
  if (name.includes('apollohorns')) return 'gold'
  if (name.includes('soyuz')) return 'soyuz'
  if (name.includes('lambert')) return 'blanket'
  return 'module'
}

const LOOK: Record<Kind, { color: string; rough: number; metal: number; id: number }> = {
  arrays: { color: '#6b4318', rough: 0.32, metal: 0.45, id: 0 },
  truss: { color: '#a9aaa6', rough: 0.42, metal: 0.65, id: 1 },
  blanket: { color: '#dcd8cf', rough: 0.82, metal: 0, id: 2 },
  module: { color: '#cfcdc7', rough: 0.55, metal: 0.1, id: 3 },
  gold: { color: '#c08a3a', rough: 0.3, metal: 0.85, id: 4 },
  soyuz: { color: '#7a816f', rough: 0.7, metal: 0.05, id: 5 },
}

const VERTEX_HEAD = /* glsl */ `
uniform mat4 uToStation;
varying vec3 vStP;
varying vec3 vStN;
`
const FRAGMENT_HEAD = /* glsl */ `
uniform float uKind;
varying vec3 vStP;
varying vec3 vStN;
float stHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float stLines(vec2 uv, float width) {
  vec2 w = fwidth(uv);
  vec2 d = abs(fract(uv + 0.5) - 0.5);
  vec2 l = 1.0 - smoothstep(vec2(width) - w, vec2(width) + w, d);
  return max(l.x, l.y) * (1.0 - smoothstep(0.2, 0.45, max(w.x, w.y)));
}
float stRough = 0.6;
float stMetal = 0.1;
`
const COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 p = vStP;
  vec3 n = normalize(vStN);
  // the face a surface lies in (for the blankets' quilting and seams)
  vec2 sheet = abs(n.x) > 0.6 ? p.yz : abs(n.y) > 0.6 ? p.xz : p.xy;
  if (uKind < 0.5) {
    // the arrays: in the plane of the sheet (y across, z along)
    vec2 a = p.yz;
    vec2 cells = a / vec2(0.0055, 0.0055);
    float grid = stLines(cells, 0.12);
    // blankets: a mast down the middle of each wing, seams between panels
    float wing = fract((a.x + 0.5) / 0.35);
    float mast = 1.0 - smoothstep(0.015, 0.03, abs(wing - 0.5));
    float seams = stLines(vec2(a.y / 0.0625, 0.5), 0.05);
    float shade = 0.85 + 0.3 * stHash(floor(cells / vec2(4.0, 8.0)));
    if (gl_FrontFacing) {
      vec3 cell = vec3(0.42, 0.25, 0.085) * shade;
      diffuseColor.rgb = mix(cell, vec3(0.62, 0.62, 0.6), max(grid * 0.55, max(seams * 0.8, mast)));
      stRough = mix(0.3, 0.5, grid);
      stMetal = 0.45;
    } else {
      diffuseColor.rgb = mix(vec3(0.72, 0.72, 0.69), vec3(0.5), max(grid * 0.3, seams * 0.6));
      stRough = 0.7;
      stMetal = 0.0;
    }
  } else if (uKind < 1.5) {
    // the truss: metal, a lattice of struts
    float lattice = stLines(sheet / 0.012, 0.08);
    diffuseColor.rgb *= mix(1.0, 0.55, lattice) * (0.9 + 0.1 * stHash(floor(sheet / 0.03)));
    stRough = 0.42;
    stMetal = 0.65;
  } else if (uKind < 3.5) {
    // blankets and modules: quilted white insulation with seams
    vec2 quilt = sheet / vec2(0.009, 0.012);
    float stitch = stLines(quilt, 0.04);
    float seam = stLines(sheet / 0.045, 0.025);
    float shade = 0.92 + 0.08 * stHash(floor(quilt));
    diffuseColor.rgb *= shade * (1.0 - 0.18 * stitch) * (1.0 - 0.35 * seam);
    stRough = uKind < 2.5 ? 0.82 : 0.55;
    stMetal = uKind < 2.5 ? 0.0 : 0.1;
  } else if (uKind < 4.5) {
    // gold foil, crinkled
    float crinkle = stHash(floor(sheet / 0.004));
    diffuseColor.rgb *= 0.8 + 0.4 * crinkle;
    stRough = 0.25 + 0.2 * crinkle;
    stMetal = 0.85;
  } else {
    float seam = stLines(sheet / 0.03, 0.03);
    diffuseColor.rgb *= 1.0 - 0.3 * seam;
    stRough = 0.7;
    stMetal = 0.05;
  }
}
`

/** give the loaded station its surfaces (once; the root at the origin) */
export function detailStation(root: THREE.Object3D) {
  if (root.userData.detailed) return
  root.userData.detailed = true
  root.updateMatrixWorld(true)
  const toRoot = root.matrixWorld.clone().invert()
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    const toStation = mesh.matrixWorld.clone().premultiply(toRoot)
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const replaced = materials.map((material) => {
      const kind = kindOf(mesh, material)
      const look = LOOK[kind]
      const skin = new THREE.MeshStandardMaterial({
        name: material.name,
        color: look.color,
        roughness: look.rough,
        metalness: look.metal,
        side: THREE.DoubleSide,
      })
      skin.onBeforeCompile = (shader) => {
        shader.uniforms.uToStation = { value: toStation }
        shader.uniforms.uKind = { value: look.id }
        shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vStP = (uToStation * vec4(position, 1.0)).xyz;
          vStN = normalize(mat3(uToStation) * normal);`,
        )
        shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader
          .replace('#include <color_fragment>', COLOR)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = stRough;')
          .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = stMetal;')
      }
      skin.customProgramCacheKey = () => `station-skin-${look.id}`
      material.dispose()
      return skin
    })
    mesh.material = Array.isArray(mesh.material) ? replaced : replaced[0]
  })
}
