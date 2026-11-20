/* ============================================================
   CINEMATIC OR INTERACTIVE
   Cinematic (the default): the camera is directed. Arrivals at the Sun,
   Mercury, Earth, Saturn and the Pale Blue Dot play a short directed
   sequence, close-ups drift slowly, and the backlit shots swing round.
   Interactive: the camera is yours. Drag to orbit what you are looking
   at; pinch, Ctrl + scroll or the + and - keys to zoom. Scrolling still
   moves between chapters. The camera reads this; the page writes it.
============================================================ */

export type ViewMode = 'cinematic' | 'interactive'

export const viewMode = {
  mode: 'cinematic' as ViewMode,
  /** the visitor's orbit about the chapter's subject (radians) and zoom */
  yaw: 0,
  pitch: 0,
  zoom: 1,
}

/* a directed arrival: the camera says when one is coming and when it has
   finished, so the page can hold the words until the shot lands */
export const sequence = {
  /** the chapter it is for, or -1 */
  chapter: -1,
  /** set by the page to end it at once (Skip, Esc) */
  skip: false,
}
export const SEQUENCE_EVENT = 'urniverse-sequence'

export const MODE_KEY = 'urniverse-view-mode'

const ZOOM_MIN = 0.35
const ZOOM_MAX = 3.2
const PITCH_MAX = 1.25

export function zoomBy(factor: number) {
  viewMode.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, viewMode.zoom * factor))
}

export function resetOrbit() {
  viewMode.yaw = 0
  viewMode.pitch = 0
  viewMode.zoom = 1
}

/* the visitor's hands: listens while interactive mode is on; returns a cleanup */
export function attachOrbitInput() {
  const blocked = (target: EventTarget | null) =>
    target instanceof Element &&
    !!target.closest('button, a, input, .story-content, .return-content, .intro-content, .rail, .hud-top, .hotspot, .detail-panel, .time-bar, .film, .reveal, [role="dialog"]')

  const pointers = new Map<number, { x: number; y: number }>()
  let pinch = 0

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0 || blocked(event.target)) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size === 1) document.documentElement.classList.add('is-orbiting')
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      pinch = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }
  const onMove = (event: PointerEvent) => {
    const last = pointers.get(event.pointerId)
    if (!last) return
    const dx = event.clientX - last.x
    const dy = event.clientY - last.y
    last.x = event.clientX
    last.y = event.clientY
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()]
      const now = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch > 0 && now > 0) zoomBy(pinch / now)
      pinch = now
      return
    }
    viewMode.yaw -= dx * 0.006
    // (on a touch screen a vertical drag scrolls the page instead)
    if (event.pointerType !== 'touch') viewMode.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, viewMode.pitch + dy * 0.005))
  }
  const onUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId)
    if (pointers.size < 2) pinch = 0
    if (pointers.size === 0) document.documentElement.classList.remove('is-orbiting')
  }
  // a trackpad's pinch arrives as Ctrl + wheel (Lenis leaves those alone)
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return
    // (first, and no further: the journey's own wheel steps chapters)
    event.preventDefault()
    event.stopImmediatePropagation()
    zoomBy(Math.exp(event.deltaY * 0.004))
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
    if (event.key === '+' || event.key === '=') zoomBy(1 / 1.15)
    else if (event.key === '-' || event.key === '_') zoomBy(1.15)
    else if (event.key === '0') resetOrbit()
  }

  window.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  window.addEventListener('wheel', onWheel, { passive: false, capture: true })
  window.addEventListener('keydown', onKey)
  return () => {
    window.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    window.removeEventListener('wheel', onWheel, { capture: true })
    window.removeEventListener('keydown', onKey)
    document.documentElement.classList.remove('is-orbiting')
  }
}
