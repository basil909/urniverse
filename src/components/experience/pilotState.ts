import * as THREE from 'three'

/* where each world is on screen, for the HUD (written by the scene each
   frame): x, y in -1..1 (y up), whether it is ahead of the camera, its
   distance in km and its radius on screen in pixels */
export type FlightMarker = {
  name: string
  index: number // -1: the Sun
  x: number
  y: number
  ahead: boolean
  km: number
  radiusPx: number
}

/* Shared state for the flight mode (the little jet): written by the page
   (buttons, keys, pointer, touch) and read by the 3D scene each frame. */
export const pilot = {
  /** flying: the journey's camera hands over to the jet */
  active: false,
  /** held keys */
  keys: new Set<string>(),
  /** steering, -1..1 each way (mouse offset from the centre, or a drag) */
  steer: { x: 0, y: 0 },
  /** on-screen thrust button (touch) */
  touchThrust: false,
  /** for the HUD: current speed (0..1 of the local limit) and nearest body */
  speed: 0,
  nearest: '',
  /** nearest planet's orbit index (-1: the Sun, -2: not flying) */
  nearestIndex: -2,
  /** distance to the nearest surface, scene units */
  clearance: Infinity,
  /** altitude above the nearest planet in km (-1 near the Sun) */
  altitudeKm: -1,
  /** true speed, km/s */
  kms: 0,
  /** how far behind the ship the camera rides, in ship lengths: from
      the chase view (3.2) out to where the ship is a speck (300,000) */
  viewTarget: 3.2,
  /** the worlds on screen, for the HUD */
  markers: [] as FlightMarker[],
  /** asked to warp to a world (-1: the Sun), picked up by the scene */
  warpRequest: null as number | null,
  /** the world being warped to ('' when not warping) */
  warping: '',
  /** warp's glow, 0..1: the star streaks and the wider lens */
  warpGlow: 0,
  /** where the warp streaks are, as if flown through at a steady pace */
  warpOrigin: new THREE.Vector3(),
  /** the ship's position (scene units), for the ground under it */
  shipWorld: new THREE.Vector3(),
  /** asked to land (L) */
  landRequest: false,
  /** 'flying', 'landing', 'landed' or 'lifting' */
  landState: 'flying',
  /** low enough over solid ground to land */
  canLand: false,
  /** where the ship stands, degrees */
  site: { lat: 0, lon: 0 },
  /** 'chase', 'flyby' or 'orbit' (V cycles) */
  cameraMode: 'chase' as 'chase' | 'flyby' | 'orbit',
  /** photo mode: no HUD (P) */
  photo: false,
  /** for sound and the HUD: thrust, re-entry heat, air density (0..1) */
  thrust: 0,
  heat: 0,
  air: 0,
  /** inside a giant's (or Venus's) clouds: how deep, 0..1, the pressure
      (bar) and the haze colour */
  immersion: 0,
  pressureBar: 0,
  hazeColor: '#000000',
  /** flying through Earth's cloud deck: how thick the mist is, and how
      sunlit */
  mist: 0,
  mistLight: 1,
  /** time in flight: 0 (held still), 1 (real time) or faster (T cycles) */
  timeScale: 0,
  /** orbiting the nearest world (O), and that orbit's period, minutes */
  orbiting: false,
  orbitMinutes: 0,
  /** named features on screen (x, y in -1..1), for the HUD */
  features: [] as { name: string; x: number; y: number; shown: boolean }[],
}

export const TIME_STEPS = [0, 1, 60, 600, 3600]

export const VIEW_NEAR = 3.2
export const VIEW_FAR = 300000
/* the C key steps through these */
export const VIEW_STEPS = [3.2, 400, 30000]

export function resetPilotInput() {
  pilot.keys.clear()
  pilot.steer.x = 0
  pilot.steer.y = 0
  pilot.touchThrust = false
}

export function setView(target: number) {
  pilot.viewTarget = Math.min(VIEW_FAR, Math.max(VIEW_NEAR, target))
}
