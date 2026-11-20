import * as THREE from 'three'

/* ============================================================
   THE INTERNATIONAL SPACE STATION, BUILT HERE
   NASA's small model is low in detail, its parts floating apart. This
   builds the station from its real layout and dimensions (metres), every
   part joined to the next:
   - the integrated truss, 109 m, an open lattice;
   - eight solar array wings, four at each end in pairs on their
     gimbals, each wing two 35 m blankets either side of a mast, amber
     cells in a silver grid;
   - the white radiators either side of the middle;
   - the pressurised modules in a line beneath it, front to back:
     Dragon at its port, Harmony (Columbus and Kibo either side), Destiny
     under the truss, Unity (Tranquility with the Cupola, and Quest),
     Zarya, Zvezda with its own small arrays, a Progress at the back.
   Axes: x along the truss (starboard +), z along the modules (forward +,
   the way it flies), y up, away from the Earth. Scaled to one unit at its
   widest and centred, like the loaded models.
============================================================ */

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

/* a blanket of solar cells: amber cells in a silver grid, a seam every
   few panels */
function cellTexture() {
  return canvasTexture(256, 512, (g) => {
    g.fillStyle = '#9aa0a6'
    g.fillRect(0, 0, 256, 512)
    const cols = 8
    const rows = 32
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        const shade = 0.85 + Math.random() * 0.25
        g.fillStyle = `rgb(${Math.round(120 * shade)}, ${Math.round(72 * shade)}, ${Math.round(24 * shade)})`
        g.fillRect(c * 32 + 2, r * 16 + 2, 28, 12)
      }
    }
    g.fillStyle = '#c4c8cc'
    for (let r = 0; r < rows; r += 8) g.fillRect(0, r * 16, 256, 2)
  }, [1, 4])
}

/* the truss: struts and diagonals, see-through between */
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
    // equipment boxes here and there
    g.fillStyle = '#b9bbb8'
    g.fillRect(96, 96, 64, 64)
  }, [36, 1])
}

/* white insulation: quilted, with seams */
function blanketTexture(base = '#e9e7e1') {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = base
    g.fillRect(0, 0, 256, 256)
    for (let x = 0; x < 256; x += 32) {
      for (let y = 0; y < 256; y += 32) {
        const v = 235 + Math.round(Math.random() * 18)
        g.fillStyle = `rgba(${v}, ${v - 2}, ${v - 8}, 0.55)`
        g.fillRect(x + 2, y + 2, 28, 28)
      }
    }
    g.strokeStyle = 'rgba(120, 118, 110, 0.55)'
    g.lineWidth = 2
    for (let x = 0; x <= 256; x += 64) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, 256)
      g.stroke()
    }
    for (let y = 0; y <= 256; y += 128) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(256, y)
      g.stroke()
    }
  }, [3, 2])
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

export function buildStation() {
  const station = new THREE.Group()
  const cells = cellTexture()
  const truss = trussTexture()
  const blanket = blanketTexture()
  const russian = blanketTexture('#dad6c4')
  const radiatorMap = radiatorTexture()

  const m = {
    arrays: new THREE.MeshStandardMaterial({ map: cells, roughness: 0.32, metalness: 0.5 }),
    arrayBack: new THREE.MeshStandardMaterial({ color: '#c9ccce', roughness: 0.6, metalness: 0.2 }),
    truss: new THREE.MeshStandardMaterial({ map: truss, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.55 }),
    trussCore: new THREE.MeshStandardMaterial({ color: '#8e908d', roughness: 0.5, metalness: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ color: '#b8bab6', roughness: 0.38, metalness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.5, metalness: 0.3 }),
    module: new THREE.MeshStandardMaterial({ map: blanket, roughness: 0.62, metalness: 0.05 }),
    russian: new THREE.MeshStandardMaterial({ map: russian, roughness: 0.68, metalness: 0.05 }),
    gold: new THREE.MeshStandardMaterial({ color: '#c79a4a', roughness: 0.3, metalness: 0.85 }),
    radiator: new THREE.MeshStandardMaterial({ map: radiatorMap, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: '#0d1420', roughness: 0.05, metalness: 0.4 }),
    dragon: new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.4, metalness: 0.1 }),
  }

  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, at: [number, number, number], rotation: [number, number, number] = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...at)
    mesh.rotation.set(...rotation)
    station.add(mesh)
    return mesh
  }
  // a module: a cylinder along z (or x), from one end to the other
  const module = (z0: number, z1: number, radius: number, material: THREE.Material, x = 0, y = 0) => {
    const length = Math.abs(z1 - z0)
    add(new THREE.CylinderGeometry(radius, radius, length, 40, 1), material, [x, y, (z0 + z1) / 2], [Math.PI / 2, 0, 0])
    // rings where the sections join
    add(new THREE.TorusGeometry(radius * 1.01, 0.08, 6, 40), m.metal, [x, y, z0])
    add(new THREE.TorusGeometry(radius * 1.01, 0.08, 6, 40), m.metal, [x, y, z1])
  }
  const sideModule = (x0: number, x1: number, radius: number, material: THREE.Material, z: number, y = 0) => {
    const length = Math.abs(x1 - x0)
    add(new THREE.CylinderGeometry(radius, radius, length, 40, 1), material, [(x0 + x1) / 2, y, z], [0, 0, Math.PI / 2])
    add(new THREE.TorusGeometry(radius * 1.01, 0.08, 6, 40), m.metal, [x1, y, z], [0, Math.PI / 2, 0])
  }

  // ---- the truss, above Destiny: an open lattice round a core
  const trussY = 4.6
  const trussBox = new THREE.BoxGeometry(109, 4.2, 4.2)
  add(trussBox, m.truss, [0, trussY, 0])
  add(new THREE.BoxGeometry(109, 1.1, 1.1), m.trussCore, [0, trussY, 0])
  // the mount down to Destiny
  add(new THREE.BoxGeometry(3.2, 2.6, 3.2), m.metal, [0, trussY - 2.6, 0])

  // ---- eight solar wings: four gimbals near the ends, a wing each way
  const blanketGeometry = new THREE.PlaneGeometry(4.6, 34)
  const wing = (x: number, side: 1 | -1) => {
    const z0 = side * 2.6
    const mid = z0 + side * 17
    // the mast down the middle, the blankets either side, fronts to the Sun (up)
    add(new THREE.CylinderGeometry(0.22, 0.22, 34, 8), m.metal, [x, trussY, mid], [Math.PI / 2, 0, 0])
    for (const dx of [-2.75, 2.75]) {
      add(blanketGeometry, m.arrays, [x + dx, trussY + 0.06, mid], [-Math.PI / 2, 0, 0])
      add(blanketGeometry, m.arrayBack, [x + dx, trussY - 0.06, mid], [Math.PI / 2, 0, 0])
    }
    // the box at the root of each wing
    add(new THREE.BoxGeometry(5.2, 0.9, 1.2), m.metal, [x, trussY, z0 - side * 0.3])
  }
  for (const x of [-48, -32, 32, 48]) {
    // the gimbal on the truss, a ring round it
    add(new THREE.CylinderGeometry(2.6, 2.6, 1.6, 24), m.metal, [x, trussY, 0], [0, 0, Math.PI / 2])
    wing(x, 1)
    wing(x, -1)
  }
  // the end segments' small radiators
  for (const x of [-40, 40]) add(new THREE.PlaneGeometry(3.4, 13), m.radiator, [x, trussY - 2.4, -7.2], [-Math.PI / 2 + 0.3, 0, 0])

  // ---- the big radiators either side of the middle, hanging aft
  for (const x of [-13, 13]) {
    add(new THREE.BoxGeometry(1, 1.2, 2.4), m.metal, [x, trussY, -2.6])
    for (let k = 0; k < 3; k += 1) {
      const panel = add(new THREE.PlaneGeometry(3.2, 22), m.radiator, [x + (k - 1) * 3.4, trussY - 1.6, -14.4], [-Math.PI / 2 + 0.18, 0, 0])
      panel.position.y -= k * 0.05
    }
  }

  // ---- the modules, front to back along z
  // Dragon, docked at the front port
  add(new THREE.CylinderGeometry(0.9, 1.3, 1.6, 24), m.metal, [0, 0, 12.5], [Math.PI / 2, 0, 0])
  // (the capsule narrowing to its hatch at the station, its trunk behind)
  add(new THREE.CylinderGeometry(1.9, 1.0, 4.4, 32), m.dragon, [0, 0, 15.5], [Math.PI / 2, 0, 0])
  add(new THREE.CylinderGeometry(1.9, 1.9, 2.8, 32), m.dark, [0, 0, 19.1], [Math.PI / 2, 0, 0])
  // Harmony, with Columbus (starboard) and Kibo (port)
  module(4.4, 11.6, 2.2, m.module)
  sideModule(2.2, 9.2, 2.25, m.module, 8)
  sideModule(-2.2, -13.4, 2.2, m.module, 8)
  add(new THREE.BoxGeometry(5.6, 1.2, 5), m.metal, [-16.4, -0.4, 8])
  add(new THREE.CylinderGeometry(2.1, 2.1, 4.2, 32), m.module, [-7, 3.9, 8]) // Kibo's logistics module, on top
  // Destiny, beneath the truss
  module(-4.2, 4.4, 2.15, m.module)
  // Unity, with Tranquility (port; the Cupola beneath it) and Quest (starboard)
  module(-9.8, -4.2, 2.3, m.module)
  sideModule(-2.3, -9, 2.25, m.module, -7)
  add(new THREE.CylinderGeometry(1.5, 1.5, 1.2, 7), m.metal, [-6, -2.8, -7])
  add(new THREE.SphereGeometry(1.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.glass, [-6, -3.4, -7], [Math.PI, 0, 0])
  sideModule(2.3, 7.8, 2.0, m.module, -7)
  // the adapter, then Zarya and Zvezda (the Russian segment)
  add(new THREE.CylinderGeometry(1.3, 2.1, 2, 24), m.metal, [0, 0, -10.8], [Math.PI / 2, 0, 0])
  module(-24.4, -11.8, 2.05, m.russian)
  add(new THREE.BoxGeometry(4.6, 0.25, 1.2), m.gold, [0, 2.1, -18])
  module(-37.4, -24.4, 2.07, m.russian)
  // Zvezda's own arrays, either side
  for (const side of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), m.metal, [side * 3.5, 0, -33], [0, 0, Math.PI / 2])
    add(new THREE.PlaneGeometry(10, 3.2), m.arrays, [side * 10, 0.05, -33], [-Math.PI / 2, 0, 0])
    add(new THREE.PlaneGeometry(10, 3.2), m.arrayBack, [side * 10, -0.05, -33], [Math.PI / 2, 0, 0])
  }
  // a Progress at the back, a Soyuz beneath
  add(new THREE.CylinderGeometry(1.35, 1.35, 6.5, 24), m.russian, [0, 0, -40.8], [Math.PI / 2, 0, 0])
  add(new THREE.CylinderGeometry(1.1, 1.1, 5, 20), m.russian, [0, -4.6, -20], [0, 0, 0])
  for (const side of [-1, 1]) add(new THREE.PlaneGeometry(4, 1.2), m.arrays, [side * 3.3, -5, -20], [-Math.PI / 2, 0, 0])

  // centred, one unit across at its widest (the truss)
  const box = new THREE.Box3().setFromObject(station)
  const centre = box.getCenter(new THREE.Vector3())
  station.position.sub(centre)
  const size = box.getSize(new THREE.Vector3())
  const holder = new THREE.Group()
  holder.add(station)
  holder.scale.setScalar(1 / Math.max(size.x, size.y, size.z))
  const wrapper = new THREE.Group()
  wrapper.add(holder)
  wrapper.userData.built = true
  return wrapper
}
