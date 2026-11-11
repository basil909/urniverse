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
}

export function resetPilotInput() {
  pilot.keys.clear()
  pilot.steer.x = 0
  pilot.steer.y = 0
  pilot.touchThrust = false
}
