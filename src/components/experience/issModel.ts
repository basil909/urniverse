import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/* ============================================================
   THE INTERNATIONAL SPACE STATION, BUILT HERE
   NASA's small model is low in detail, its parts floating apart. This
   builds the station from its real layout and dimensions (metres), every
   part joined to the next:
   - the integrated truss, 109 m: an open lattice, solid at its middle
     (S0), the rotary joints that turn the outer arrays, pallets of
     experiments and spare parts, the rail the robotic arm rides;
   - eight solar array wings on their gimbals, each two 35 m blankets of
     amber cells either side of a mast; over six of them, the newer
     roll-out arrays (iROSA), darker, on angled brackets;
   - the white radiators either side of the middle, and smaller ones
     out on the end segments;
   - Canadarm2 on its mobile base, the Ku-band dish on Z1, AMS-02;
   - the pressurised modules beneath, front to back: Dragon at its port,
     Harmony (Columbus with its outside payloads, Kibo with its porch and
     store), Destiny, Unity (a Cygnus below, with its round arrays),
     Tranquility (the Cupola, BEAM, the Bishop airlock, the PMM), Quest,
     then the Russian side: Zarya (Rassvet and a Soyuz below), Zvezda
     (Poisk above its node, Nauka and Prichal below, its own arrays), and
     a Progress at the back.
   Merged into a few meshes, one per surface. Axes: x along the truss
   (starboard +), z along the modules (forward +, the way it flies), y up,
   away from the Earth. Scaled to one unit at its widest and centred,
   like the loaded models.
============================================================ */

/* a repeatable random, so the station is the same every time */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number]) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat[0], repeat[1])
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/* a normal map from a height drawing (white high, black low) */
function normalTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number], strength: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')!
  draw(g)
  const src = g.getImageData(0, 0, width, height)
  const out = g.createImageData(width, height)
  const h = (x: number, y: number) => src.data[(((y + height) % height) * width + ((x + width) % width)) * 4] / 255
  const n = new THREE.Vector3()
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      n.set(-(h(x + 1, y) - h(x - 1, y)) * strength, (h(x, y + 1) - h(x, y - 1)) * strength, 1).normalize()
      const i = (y * width + x) * 4
      out.data[i] = Math.round((n.x * 0.5 + 0.5) * 255)
      out.data[i + 1] = Math.round((n.y * 0.5 + 0.5) * 255)
      out.data[i + 2] = Math.round((n.z * 0.5 + 0.5) * 255)
      out.data[i + 3] = 255
    }
  }
  g.putImageData(out, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat[0], repeat[1])
  texture.anisotropy = 8
  return texture
}

/* a blanket of solar cells: amber-bronze cells in a silver grid, the
   panels folded like a concertina (alternate rows catch the light), the
   bus strips down the sides */
function cellTexture(random: () => number) {
  return canvasTexture(512, 1024, (g) => {
    g.fillStyle = '#8f9296'
    g.fillRect(0, 0, 512, 1024)
    const cols = 12
    const rows = 48
    const cw = 512 / cols
    const rh = 1024 / rows
    for (let r = 0; r < rows; r += 1) {
      const fold = r % 4 < 2 ? 1.06 : 0.9
      for (let c = 0; c < cols; c += 1) {
        const shade = fold * (0.86 + random() * 0.22)
        const x = c * cw + 2
        const y = r * rh + 2
        const grad = g.createLinearGradient(x, y, x + cw, y + rh)
        grad.addColorStop(0, `rgb(${Math.round(170 * shade)}, ${Math.round(108 * shade)}, ${Math.round(42 * shade)})`)
        grad.addColorStop(1, `rgb(${Math.round(132 * shade)}, ${Math.round(80 * shade)}, ${Math.round(30 * shade)})`)
        g.fillStyle = grad
        g.fillRect(x, y, cw - 4, rh - 4)
        // the fine fingers of each cell
        g.fillStyle = 'rgba(210, 190, 150, 0.18)'
        for (let k = 1; k < 4; k += 1) g.fillRect(x + ((cw - 4) * k) / 4, y, 1, rh - 4)
      }
    }
    // a hinge between every fourth panel
    g.fillStyle = '#c9ccd0'
    for (let r = 0; r < rows; r += 4) g.fillRect(0, r * rh, 512, 3)
    // the bus strips at the edges
    g.fillStyle = '#b8bbbf'
    g.fillRect(0, 0, 6, 1024)
    g.fillRect(506, 0, 6, 1024)
  }, [1, 2])
}

/* the concertina folds, as a normal map: the rows tilt one way, then
   the other */
function foldNormals() {
  return normalTexture(64, 256, (g) => {
    for (let y = 0; y < 256; y += 1) {
      const t = (y % 32) / 32
      const v = Math.round((t < 0.5 ? t * 2 : 2 - t * 2) * 255)
      g.fillStyle = `rgb(${v}, ${v}, ${v})`
      g.fillRect(0, y, 64, 1)
    }
  }, [1, 6], 0.6)
}

/* the newer roll-out arrays: darker, blue-black cells, finer */
function rollOutTexture(random: () => number) {
  return canvasTexture(256, 512, (g) => {
    g.fillStyle = '#6d7076'
    g.fillRect(0, 0, 256, 512)
    for (let r = 0; r < 64; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const v = 0.8 + random() * 0.3
        g.fillStyle = `rgb(${Math.round(32 * v)}, ${Math.round(38 * v)}, ${Math.round(58 * v)})`
        g.fillRect(c * 32 + 1, r * 8 + 1, 30, 6)
      }
    }
    g.fillStyle = '#9da1a6'
    g.fillRect(126, 0, 4, 512)
  }, [1, 2])
}

/* the truss: struts and diagonals, see-through between, an equipment
   box here and there */
function trussTexture() {
  return canvasTexture(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256)
    g.strokeStyle = '#d6d7d4'
    g.lineWidth = 14
    g.strokeRect(7, 7, 242, 242)
    g.lineWidth = 9
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(256, 256)
    g.moveTo(256, 0)
    g.lineTo(0, 256)
    g.stroke()
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(128, 0)
    g.lineTo(128, 256)
    g.stroke()
    g.fillStyle = '#b9bbb8'
    g.fillRect(96, 96, 64, 64)
    g.fillStyle = '#8c8e8b'
    g.fillRect(100, 100, 24, 56)
  }, [36, 1])
}

/* solid equipment faces: grey and white boxes, cables, labels */
function equipmentTexture(random: () => number) {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = '#a9aba8'
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 46; i += 1) {
      const w = 16 + random() * 60
      const h = 12 + random() * 50
      const v = 140 + Math.round(random() * 100)
      g.fillStyle = `rgb(${v}, ${v + 1}, ${v - 3})`
      g.fillRect(random() * 256, random() * 256, w, h)
    }
    g.strokeStyle = 'rgba(40, 40, 40, 0.45)'
    g.lineWidth = 2
    for (let i = 0; i < 10; i += 1) {
      g.beginPath()
      g.moveTo(random() * 256, random() * 256)
      g.lineTo(random() * 256, random() * 256)
      g.stroke()
    }
    g.fillStyle = 'rgba(200, 160, 60, 0.7)'
    for (let i = 0; i < 6; i += 1) g.fillRect(random() * 256, random() * 256, 10, 4)
  }, [1, 1])
}

/* white insulation: quilted panels, seams, handrails in gold-yellow */
function blanketTexture(random: () => number, base = '#e9e7e1') {
  return canvasTexture(512, 512, (g) => {
    g.fillStyle = base
    g.fillRect(0, 0, 512, 512)
    for (let x = 0; x < 512; x += 32) {
      for (let y = 0; y < 512; y += 32) {
        const v = 228 + Math.round(random() * 24)
        g.fillStyle = `rgba(${v}, ${v - 2}, ${v - 8}, 0.5)`
        g.fillRect(x + 2, y + 2, 28, 28)
      }
    }
    // the debris shields' panel lines
    g.strokeStyle = 'rgba(110, 108, 100, 0.6)'
    g.lineWidth = 2
    for (let x = 0; x <= 512; x += 64) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, 512)
      g.stroke()
    }
    for (let y = 0; y <= 512; y += 128) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(512, y)
      g.stroke()
    }
    // handrails
    g.fillStyle = 'rgba(196, 160, 70, 0.85)'
    for (let x = 30; x < 512; x += 128) for (let y = 20; y < 512; y += 64) g.fillRect(x, y, 4, 28)
    // a few darker patches: grapple fixtures, vents, lights
    g.fillStyle = 'rgba(60, 62, 66, 0.7)'
    for (let i = 0; i < 8; i += 1) g.fillRect(random() * 512, random() * 512, 10, 10)
  }, [3, 2])
}

/* the debris panels' raised edges, for the light to catch */
function blanketNormals() {
  return normalTexture(256, 256, (g) => {
    g.fillStyle = '#808080'
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = '#c8c8c8'
    for (let x = 0; x < 256; x += 32) for (let y = 0; y < 256; y += 64) g.fillRect(x + 3, y + 3, 26, 58)
    g.fillStyle = '#9a9a9a'
    for (let x = 0; x < 256; x += 16) for (let y = 0; y < 256; y += 16) g.fillRect(x + 5, y + 5, 6, 6)
  }, [3, 2], 3)
}

/* radiator panels: white, in ribbed strips */
function radiatorTexture() {
  return canvasTexture(128, 256, (g) => {
    g.fillStyle = '#f2f2ee'
    g.fillRect(0, 0, 128, 256)
    g.fillStyle = 'rgba(150, 152, 150, 0.6)'
    for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 2, 256)
    for (let y = 0; y < 256; y += 64) g.fillRect(0, y, 128, 3)
  }, [1, 3])
}

/* what the station's metal sees: black space above, the thin blue air at
   the horizon (some 20 degrees down, 418 km up), the bright Earth below */
function orbitEnvironment(random: () => number) {
  const texture = canvasTexture(512, 256, (g) => {
    g.fillStyle = '#000000'
    g.fillRect(0, 0, 512, 256)
    const rowOf = (elevation: number) => ((90 - elevation) / 180) * 256
    const horizon = rowOf(-20)
    const air = g.createLinearGradient(0, rowOf(-8), 0, horizon + 2)
    air.addColorStop(0, 'rgba(40, 80, 160, 0)')
    air.addColorStop(1, 'rgba(120, 170, 235, 1)')
    g.fillStyle = air
    g.fillRect(0, rowOf(-8), 512, horizon + 2 - rowOf(-8))
    const earth = g.createLinearGradient(0, horizon, 0, 256)
    earth.addColorStop(0, '#7fa6d6')
    earth.addColorStop(1, '#3f6a9e')
    g.fillStyle = earth
    g.fillRect(0, horizon, 512, 256 - horizon)
    for (let i = 0; i < 70; i += 1) {
      g.fillStyle = `rgba(235, 240, 246, ${0.35 + random() * 0.4})`
      g.beginPath()
      g.ellipse(random() * 512, horizon + random() * (256 - horizon), 8 + random() * 30, 3 + random() * 10, 0, 0, Math.PI * 2)
      g.fill()
    }
  }, [1, 1])
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

const _Y = new THREE.Vector3(0, 1, 0)
const _up = new THREE.Vector3()
const _q = new THREE.Quaternion()

export function buildStation() {
  const station = new THREE.Group()
  const random = seeded(1998)
  const lit = { envMap: orbitEnvironment(random), envMapIntensity: 0.9 }
  const blanketBumps = blanketNormals()

  const m = {
    arrays: new THREE.MeshStandardMaterial({ map: cellTexture(random), normalMap: foldNormals(), normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.34, metalness: 0.3, ...lit }),
    rollOut: new THREE.MeshStandardMaterial({ map: rollOutTexture(random), roughness: 0.22, metalness: 0.6, ...lit }),
    arrayBack: new THREE.MeshStandardMaterial({ color: '#c9ccce', roughness: 0.6, metalness: 0.2, ...lit }),
    truss: new THREE.MeshStandardMaterial({ map: trussTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.55, ...lit }),
    trussCore: new THREE.MeshStandardMaterial({ color: '#8e908d', roughness: 0.5, metalness: 0.5, ...lit }),
    equipment: new THREE.MeshStandardMaterial({ map: equipmentTexture(random), roughness: 0.5, metalness: 0.35, ...lit }),
    metal: new THREE.MeshStandardMaterial({ color: '#b8bab6', roughness: 0.34, metalness: 0.75, ...lit }),
    dark: new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.5, metalness: 0.3, ...lit }),
    module: new THREE.MeshStandardMaterial({ map: blanketTexture(random), normalMap: blanketBumps, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.6, metalness: 0.05, ...lit }),
    russian: new THREE.MeshStandardMaterial({ map: blanketTexture(random, '#d8d4c2'), normalMap: blanketBumps, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.66, metalness: 0.05, ...lit }),
    green: new THREE.MeshStandardMaterial({ color: '#7d8a6c', roughness: 0.6, metalness: 0.1, ...lit }),
    gold: new THREE.MeshStandardMaterial({ color: '#c79a4a', roughness: 0.28, metalness: 0.9, ...lit }),
    radiator: new THREE.MeshStandardMaterial({ map: radiatorTexture(), roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide, ...lit }),
    glass: new THREE.MeshStandardMaterial({ color: '#0d1420', roughness: 0.04, metalness: 0.6, ...lit }),
    white: new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide, ...lit }),
  }

  type V3 = [number, number, number]
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, at: V3, rotation: V3 = [0, 0, 0], parent: THREE.Object3D = station) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...at)
    mesh.rotation.set(...rotation)
    parent.add(mesh)
    return mesh
  }
  const box = (size: V3, material: THREE.Material, at: V3, rotation?: V3) => add(new THREE.BoxGeometry(...size), material, at, rotation)
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  // a rod from one point to another
  const rod = (a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material, segments = 10) => {
    const direction = b.clone().sub(a)
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments), material)
    mesh.position.copy(a).add(b).multiplyScalar(0.5)
    mesh.quaternion.setFromUnitVectors(_Y, direction.normalize())
    station.add(mesh)
    return mesh
  }
  const ring = (radius: number, at: V3, rotation: V3 = [0, 0, 0]) => add(new THREE.TorusGeometry(radius * 1.01, 0.08, 6, 40), m.metal, at, rotation)
  // a module along z, from one end to the other (r1: its radius at z1)
  const module = (z0: number, z1: number, radius: number, material: THREE.Material, x = 0, y = 0, r1 = radius) => {
    add(new THREE.CylinderGeometry(r1, radius, Math.abs(z1 - z0), 40, 1), material, [x, y, (z0 + z1) / 2], [Math.PI / 2, 0, 0])
    ring(radius, [x, y, z0])
    ring(r1, [x, y, z1])
  }
  // a module along x
  const sideModule = (x0: number, x1: number, radius: number, material: THREE.Material, z: number, y = 0) => {
    add(new THREE.CylinderGeometry(radius, radius, Math.abs(x1 - x0), 40, 1), material, [(x0 + x1) / 2, y, z], [0, 0, Math.PI / 2])
    ring(radius, [x1, y, z], [0, Math.PI / 2, 0])
  }
  // a module along y (up, or down to the Earth)
  const upModule = (y0: number, y1: number, radius: number, material: THREE.Material, x: number, z: number) => {
    add(new THREE.CylinderGeometry(radius, radius, Math.abs(y1 - y0), 32, 1), material, [x, (y0 + y1) / 2, z])
    ring(radius, [x, y1, z], [Math.PI / 2, 0, 0])
  }
  // a cluster of payload boxes on a face
  const payloads = (at: THREE.Vector3, spread: [number, number], up: 1 | -1, count: number) => {
    for (let i = 0; i < count; i += 1) {
      const h = 0.4 + random() * 1.0
      box([0.6 + random() * 1.4, h, 0.6 + random() * 1.2], random() < 0.5 ? m.equipment : m.white, [at.x + (random() - 0.5) * spread[0], at.y + up * h * 0.5, at.z + (random() - 0.5) * spread[1]])
    }
  }

  /* a Soyuz or a Progress, docked at a port, pointing away along dir:
     the round orbital module (or the cargo module and its tanks), the
     bell of the descent module, the service module with its skirt and
     its two arrays */
  const visitor = (port: THREE.Vector3, dir: THREE.Vector3, progress: boolean) => {
    const craft = new THREE.Group()
    craft.position.copy(port)
    craft.quaternion.setFromUnitVectors(_Y, dir.clone().normalize())
    station.add(craft)
    if (progress) {
      add(new THREE.CylinderGeometry(1.1, 0.7, 0.6, 24), m.metal, [0, 0.3, 0], undefined, craft)
      add(new THREE.CylinderGeometry(1.32, 1.1, 3.0, 28), m.russian, [0, 2.1, 0], undefined, craft)
      add(new THREE.CylinderGeometry(1.0, 1.32, 1.5, 28), m.green, [0, 4.35, 0], undefined, craft)
    } else {
      add(new THREE.SphereGeometry(1.13, 24, 16), m.green, [0, 1.25, 0], undefined, craft)
      add(new THREE.CylinderGeometry(1.1, 0.95, 2.1, 28), m.russian, [0, 3.3, 0], undefined, craft)
    }
    add(new THREE.CylinderGeometry(1.1, 1.1, 2.6, 28), m.green, [0, 6.3, 0], undefined, craft)
    add(new THREE.CylinderGeometry(1.36, 1.1, 0.5, 28), m.metal, [0, 7.8, 0], undefined, craft)
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(0.6, 0.3, 0.15), m.metal, [side * 1.35, 6.6, 0], undefined, craft)
      add(new THREE.PlaneGeometry(4.6, 1.15), m.rollOut, [side * 3.9, 6.6, 0.02], [0, 0, 0], craft)
      add(new THREE.PlaneGeometry(4.6, 1.15), m.rollOut, [side * 3.9, 6.6, -0.02], [0, Math.PI, 0], craft)
    }
  }

  // ---- the truss, above Destiny: an open lattice round a core
  const trussY = 4.6
  const top = trussY + 2.1
  const bottom = trussY - 2.1
  box([109, 4.2, 4.2], m.truss, [0, trussY, 0])
  box([109, 1.1, 1.1], m.trussCore, [0, trussY, 0])
  // the middle (S0): solid, its equipment showing; the mount down to Destiny
  box([13.4, 4.5, 4.5], m.equipment, [0, trussY, 0])
  box([3.2, 2.6, 3.2], m.metal, [0, trussY - 2.6, 0])
  // the rotary joints that turn each end towards the Sun
  for (const x of [-27.5, 27.5]) {
    add(new THREE.CylinderGeometry(3.0, 3.0, 1.4, 32), m.metal, [x, trussY, 0], [0, 0, Math.PI / 2])
    add(new THREE.TorusGeometry(3.0, 0.18, 8, 40), m.dark, [x, trussY, 0], [0, Math.PI / 2, 0])
  }
  // the rail the arm's base rides, along the top of the middle
  box([40, 0.25, 0.4], m.metal, [0, top + 0.12, 1.6])
  box([40, 0.25, 0.4], m.metal, [0, top + 0.12, -1.6])
  // spare parts and boxes along the underside
  for (let x = -19; x <= 19; x += 2.4) {
    if (Math.abs(x) < 7.2) continue
    if (random() < 0.55) box([1 + random() * 1.2, 0.5 + random() * 0.6, 1 + random() * 1.6], random() < 0.5 ? m.equipment : m.white, [x, bottom - 0.3, (random() - 0.5) * 2])
  }
  // the end caps
  for (const x of [-54.5, 54.5]) box([0.4, 4.4, 4.4], m.equipment, [x, trussY, 0])

  // the pallets of experiments: two above, two below, out on P3 and S3
  for (const [x, up] of [[-23, 1], [-23, -1], [23, -1], [17.5, 1]] as const) {
    const y = up === 1 ? top : bottom
    box([4.4, 0.4, 3.6], m.metal, [x, y + up * 0.2, 0])
    payloads(v(x, y + up * 0.4, 0), [3.6, 2.8], up, 5)
  }
  // AMS-02, the particle detector, on S3's top
  box([3.2, 1.0, 3.2], m.equipment, [23, top + 0.5, 0])
  add(new THREE.CylinderGeometry(1.5, 1.5, 2.4, 28), m.white, [23, top + 2.2, 0])
  add(new THREE.CylinderGeometry(1.55, 1.55, 0.3, 28), m.gold, [23, top + 3.4, 0])
  box([0.1, 2.2, 3], m.radiator, [21.2, top + 2.2, 0])
  box([0.1, 2.2, 3], m.radiator, [24.8, top + 2.2, 0])

  // ---- eight solar wings: four gimbals near the ends, a wing each way
  const blanketGeometry = new THREE.PlaneGeometry(4.6, 34)
  const wing = (x: number, side: 1 | -1, rollOut: boolean) => {
    const z0 = side * 2.6
    const mid = z0 + side * 17
    // the mast down the middle, the blankets either side, fronts to the Sun (up)
    add(new THREE.CylinderGeometry(0.22, 0.22, 34, 8), m.metal, [x, trussY, mid], [Math.PI / 2, 0, 0])
    for (const dx of [-2.75, 2.75]) {
      add(blanketGeometry, m.arrays, [x + dx, trussY + 0.06, mid], [-Math.PI / 2, 0, 0])
      add(blanketGeometry, m.arrayBack, [x + dx, trussY - 0.06, mid], [Math.PI / 2, 0, 0])
      // the tensioning bar at the tip
      box([4.6, 0.12, 0.3], m.metal, [x + dx, trussY, z0 + side * 34])
    }
    // the blanket canisters at the root
    box([5.6, 1.0, 1.4], m.equipment, [x, trussY, z0 - side * 0.3])
    // the roll-out array over it, on an angled bracket: half the length
    if (rollOut) {
      const tilt = 0.1
      const root = v(x, trussY + 1.6, z0 + side * 0.8)
      rod(v(x - 1.2, trussY + 0.4, z0), root, 0.12, m.metal, 6)
      rod(v(x + 1.2, trussY + 0.4, z0), root, 0.12, m.metal, 6)
      const tip = root.clone().add(v(0, Math.sin(tilt) * 19, side * Math.cos(tilt) * 19))
      add(new THREE.CylinderGeometry(0.3, 0.3, 6.2, 10), m.metal, [root.x, root.y, root.z], [0, 0, Math.PI / 2])
      add(new THREE.CylinderGeometry(0.3, 0.3, 6.2, 10), m.metal, [tip.x, tip.y, tip.z], [0, 0, Math.PI / 2])
      const centre = root.clone().add(tip).multiplyScalar(0.5)
      add(new THREE.PlaneGeometry(6, 19), m.rollOut, [centre.x, centre.y + 0.04, centre.z], [-Math.PI / 2 - side * tilt, 0, 0])
      add(new THREE.PlaneGeometry(6, 19), m.arrayBack, [centre.x, centre.y - 0.04, centre.z], [Math.PI / 2 - side * tilt, 0, 0])
    }
  }
  // (iROSAs on six of the eight wings)
  const rollOuts = new Set(['-48:1', '-48:-1', '-32:1', '32:-1', '48:1', '48:-1'])
  for (const x of [-48, -32, 32, 48]) {
    // the gimbal on the truss, a ring round it
    add(new THREE.CylinderGeometry(2.6, 2.6, 1.6, 24), m.metal, [x, trussY, 0], [0, 0, Math.PI / 2])
    add(new THREE.TorusGeometry(2.6, 0.14, 8, 32), m.dark, [x, trussY, 0], [0, Math.PI / 2, 0])
    wing(x, 1, rollOuts.has(`${x}:1`))
    wing(x, -1, rollOuts.has(`${x}:-1`))
  }
  // the end segments' smaller radiators, hanging aft
  for (const x of [-40, 40, -52, 52]) {
    box([1.2, 1.0, 1.4], m.metal, [x, bottom - 0.3, -2.6])
    add(new THREE.PlaneGeometry(3.4, 13), m.radiator, [x, trussY - 2.4, -9.6], [-Math.PI / 2 + 0.3, 0, 0])
  }

  // ---- the big radiators either side of the middle, hanging aft
  for (const x of [-13, 13]) {
    box([1, 1.2, 2.4], m.metal, [x, trussY, -2.6])
    box([10.4, 0.2, 0.3], m.metal, [x, trussY - 1.4, -3.6])
    rod(v(x, trussY - 0.6, -3.0), v(x, trussY - 1.4, -3.6), 0.25, m.metal, 8)
    for (let k = 0; k < 3; k += 1) {
      const panel = add(new THREE.PlaneGeometry(3.2, 22), m.radiator, [x + (k - 1) * 3.4, trussY - 1.6, -14.4], [-Math.PI / 2 + 0.18, 0, 0])
      panel.position.y -= k * 0.05
    }
  }

  // ---- Canadarm2, on its mobile base atop the truss, reaching up and aft
  box([5.7, 1.0, 4.4], m.equipment, [9, top + 0.75, 0])
  const shoulder = v(9.8, top + 1.9, 0)
  const elbow = shoulder.clone().add(v(1.6, 6.4, -3.3))
  const wrist = elbow.clone().add(v(1.4, -2.0, -6.6))
  const hand = wrist.clone().add(v(0.3, -1.2, -0.6))
  for (const joint of [shoulder, elbow, wrist]) {
    add(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 14), m.white, [joint.x, joint.y, joint.z], [0, 0, Math.PI / 2])
    box([0.7, 0.7, 0.7], m.dark, [joint.x + 0.75, joint.y, joint.z])
  }
  rod(v(9.8, top + 1.2, 0), shoulder, 0.3, m.white)
  rod(shoulder, elbow, 0.2, m.white, 12)
  rod(elbow, wrist, 0.2, m.white, 12)
  rod(wrist, hand, 0.32, m.white, 12)
  box([0.5, 0.5, 0.5], m.dark, [hand.x, hand.y - 0.3, hand.z])

  // ---- Z1 on Unity's top: the box between it and the truss, the Ku-band
  // dish on its mast, an S-band antenna
  box([3.8, 2.4, 3.8], m.equipment, [0, 3.5, -7])
  rod(v(1.4, 4.7, -7.8), v(2.4, 8.6, -8.6), 0.12, m.metal, 6)
  add(new THREE.SphereGeometry(1.9, 24, 8, 0, Math.PI * 2, 0, 0.55), m.white, [2.4, 8.2, -8.6], [Math.PI + 0.5, 0, 0.3])
  rod(v(-1.4, 4.7, -7.4), v(-1.4, 6.6, -7.4), 0.08, m.metal, 6)
  box([0.9, 0.9, 0.2], m.white, [-1.4, 6.9, -7.4])

  // ---- the modules, front to back along z
  // Dragon, docked at the front port: the adapter, the capsule narrowing
  // to its hatch, its nose cone hinged open, the trunk behind with cells
  // on one half and its fins
  add(new THREE.CylinderGeometry(0.9, 1.3, 1.6, 24), m.metal, [0, 0, 12.5], [Math.PI / 2, 0, 0])
  add(new THREE.CylinderGeometry(1.9, 1.0, 4.4, 32), m.white, [0, 0, 15.5], [Math.PI / 2, 0, 0])
  add(new THREE.CylinderGeometry(1.9, 1.9, 0.25, 32), m.dark, [0, 0, 17.8], [Math.PI / 2, 0, 0])
  add(new THREE.SphereGeometry(1.1, 20, 8, 0, Math.PI * 2, 0, 1.0), m.white, [0, 1.5, 13.9], [-0.6, 0, 0])
  add(new THREE.CylinderGeometry(1.9, 1.9, 2.8, 32), m.dark, [0, 0, 19.3], [Math.PI / 2, 0, 0])
  add(new THREE.CylinderGeometry(1.93, 1.93, 2.4, 32, 1, true, 0, Math.PI), m.arrays, [0, 0, 19.3], [Math.PI / 2, 0, 0])
  for (const angle of [0.6, 2.2, 3.8, 5.4]) {
    box([0.12, 1.1, 1.6], m.white, [Math.cos(angle) * 2.3, Math.sin(angle) * 2.3, 20.5], [0, 0, angle])
  }
  // Harmony, with its port above (a docking adapter), Columbus
  // (starboard) and Kibo (port)
  module(4.4, 11.6, 2.2, m.module)
  upModule(2.2, 3.4, 1.0, m.metal, 0, 9)
  sideModule(2.2, 9.2, 2.25, m.module, 8)
  // Columbus's outside payloads, on its end
  box([0.8, 3.2, 3.2], m.metal, [9.6, 0, 8])
  payloads(v(10, 0.4, 8), [0.2, 2.6], 1, 3)
  sideModule(-2.2, -13.4, 2.2, m.module, 8)
  // Kibo's porch (the exposed facility), its payloads, its small arm,
  // and its store above
  box([5.6, 1.2, 5], m.metal, [-16.4, -0.4, 8])
  payloads(v(-16.4, 0.2, 8), [4.4, 3.8], 1, 6)
  rod(v(-13.6, 1.8, 6.6), v(-15.4, 4.2, 5.4), 0.12, m.white, 8)
  rod(v(-15.4, 4.2, 5.4), v(-18, 2.6, 5.8), 0.12, m.white, 8)
  add(new THREE.CylinderGeometry(2.1, 2.1, 4.2, 32), m.module, [-7, 3.9, 8])
  // Destiny, beneath the truss, its window looking down
  module(-4.2, 4.4, 2.15, m.module)
  add(new THREE.CircleGeometry(0.5, 16), m.glass, [0, -2.17, 0], [Math.PI / 2, 0, 0])
  // Unity, with a Cygnus below it (round arrays either side)
  module(-9.8, -4.2, 2.3, m.module)
  upModule(-2.3, -3.2, 1.1, m.metal, 0, -7)
  add(new THREE.CylinderGeometry(1.5, 1.5, 3.6, 28), m.white, [0, -5.0, -7])
  add(new THREE.CylinderGeometry(1.5, 1.5, 2.6, 28), m.gold, [0, -8.1, -7])
  for (const side of [-1, 1]) {
    rod(v(side * 1.4, -8.4, -7), v(side * 3.1, -8.4, -7), 0.1, m.metal, 6)
    add(new THREE.CircleGeometry(3.4, 10), m.rollOut, [side * 6.4, -8.3, -7], [-Math.PI / 2, 0, 0])
    add(new THREE.CircleGeometry(3.4, 10), m.arrayBack, [side * 6.4, -8.4, -7], [Math.PI / 2, 0, 0])
  }
  // Tranquility (port): the Cupola beneath, BEAM aft, the Bishop airlock
  // at its end, the PMM forward
  sideModule(-2.3, -9, 2.25, m.module, -7)
  add(new THREE.CylinderGeometry(1.5, 1.5, 1.2, 7), m.metal, [-6, -2.8, -7])
  add(new THREE.SphereGeometry(1.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.glass, [-6, -3.4, -7], [Math.PI, 0, 0])
  add(new THREE.TorusGeometry(1.2, 0.12, 6, 14), m.metal, [-6, -3.4, -7], [Math.PI / 2, 0, 0])
  module(-11.6, -9.2, 1.6, m.white, -4.8)
  add(new THREE.CylinderGeometry(1.0, 1.7, 2.0, 24), m.white, [-10.0, 0, -7], [0, 0, Math.PI / 2])
  module(-4.6, 1.8, 2.2, m.module, -6.4)
  // Quest, the airlock (starboard)
  sideModule(2.3, 7.8, 2.0, m.module, -7)
  add(new THREE.CylinderGeometry(1.6, 1.6, 1.4, 24), m.module, [8.5, 0, -7], [0, 0, Math.PI / 2])

  // the adapter, then Zarya (tapered at its front; its gold strip;
  // Rassvet and a Soyuz below)
  add(new THREE.CylinderGeometry(1.3, 2.1, 2, 24), m.metal, [0, 0, -10.8], [Math.PI / 2, 0, 0])
  module(-24.4, -13.4, 2.05, m.russian)
  module(-13.4, -11.8, 2.05, m.russian, 0, 0, 1.4)
  box([4.6, 0.25, 1.2], m.gold, [0, 2.1, -18])
  upModule(-2.05, -8, 1.17, m.russian, 0, -20)
  visitor(v(0, -8, -20), v(0, -1, 0), false)
  // Zvezda: its round node at the front (Poisk above, Nauka and Prichal
  // below), the narrow working section with its arrays, the wide one
  add(new THREE.SphereGeometry(1.45, 28, 18), m.russian, [0, 0, -25.9])
  upModule(1.2, 5.2, 1.27, m.russian, 0, -25.9)
  upModule(-1.2, -14.2, 2.05, m.russian, 0, -25.9)
  add(new THREE.SphereGeometry(1.6, 24, 16), m.russian, [0, -15.6, -25.9])
  for (const side of [-1, 1]) {
    rod(v(side * 2, -10.5, -25.9), v(side * 3.4, -10.5, -25.9), 0.1, m.metal, 6)
    add(new THREE.PlaneGeometry(5, 2.2), m.rollOut, [side * 5.9, -10.46, -25.9], [-Math.PI / 2, 0, 0])
    add(new THREE.PlaneGeometry(5, 2.2), m.arrayBack, [side * 5.9, -10.54, -25.9], [Math.PI / 2, 0, 0])
  }
  rod(v(2.0, -6, -25.4), v(3.6, -11.5, -24.2), 0.14, m.white, 8)
  box([0.6, 3.6, 2.6], m.radiator, [-2.4, -8, -25.9])
  module(-33, -27.3, 1.47, m.russian)
  module(-34.4, -33, 2.07, m.russian, 0, 0, 1.47)
  module(-38.4, -34.4, 2.07, m.russian)
  for (const side of [-1, 1]) {
    rod(v(side * 1.4, 0, -30.4), v(side * 4.6, 0, -30.4), 0.15, m.metal, 6)
    add(new THREE.PlaneGeometry(10, 3.2), m.arrays, [side * 9.6, 0.05, -30.4], [-Math.PI / 2, 0, 0])
    add(new THREE.PlaneGeometry(10, 3.2), m.arrayBack, [side * 9.6, -0.05, -30.4], [Math.PI / 2, 0, 0])
  }
  // antennas on its back
  rod(v(0, 2.07, -36), v(0.6, 4.4, -36.8), 0.05, m.metal, 4)
  add(new THREE.CircleGeometry(0.7, 14), m.white, [-1.2, 2.2, -37], [-Math.PI / 2, 0, 0])
  // a Progress at the back
  add(new THREE.CylinderGeometry(1.0, 1.0, 1.0, 20), m.russian, [0, 0, -38.9], [Math.PI / 2, 0, 0])
  visitor(v(0, 0, -39.4), v(0, 0, -1), true)

  /* one mesh per surface: hundreds of parts, a dozen draws */
  station.updateMatrixWorld(true)
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
  station.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    const material = mesh.material as THREE.Material
    if (!byMaterial.has(material)) byMaterial.set(material, [])
    byMaterial.get(material)!.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld))
  })
  const merged = new THREE.Group()
  for (const [material, list] of byMaterial) {
    const geometry = mergeGeometries(list, false)
    list.forEach((g) => g.dispose())
    if (!geometry) continue
    const mesh = new THREE.Mesh(geometry, material)
    // the environment turned so that its Earth lies below the station,
    // however the station is turned in the scene
    const standard = material as THREE.MeshStandardMaterial
    mesh.onBeforeRender = () => {
      const e = mesh.matrixWorld.elements
      _up.set(e[4], e[5], e[6]).normalize()
      _q.setFromUnitVectors(_Y, _up)
      standard.envMapRotation.setFromQuaternion(_q)
    }
    merged.add(mesh)
  }

  // centred, one unit across at its widest (the truss)
  const bounds = new THREE.Box3().setFromObject(merged)
  const centre = bounds.getCenter(new THREE.Vector3())
  merged.position.sub(centre)
  const size = bounds.getSize(new THREE.Vector3())
  const holder = new THREE.Group()
  holder.add(merged)
  holder.scale.setScalar(1 / Math.max(size.x, size.y, size.z))
  const wrapper = new THREE.Group()
  wrapper.add(holder)
  wrapper.userData.built = true
  return wrapper
}
