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
}

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
