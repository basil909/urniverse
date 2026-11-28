/* ============================================================
   CINEMATIC OR INTERACTIVE
   Cinematic (the default): the camera is directed. Arrivals at the Sun,
   Mercury, Earth, Saturn and the Pale Blue Dot play a short directed
   sequence, close-ups drift slowly, and the backlit shots swing round.
   Interactive: the camera is yours. Drag to orbit what you are looking
   at; pinch to zoom. In either mode the zoom buttons, Ctrl + scroll and
   the + and - keys bring the camera closer or take it further out (0
   resets). Scrolling still moves between chapters. The camera reads
   this; the page writes it.
============================================================ */

export type ViewMode = 'cinematic' | 'interactive'

/* how deep into the journey the camera is (the chapter, with its
   fraction; the galaxy dive goes deeper still) and how fast it is moving
   (0..1): written by the camera each frame, heard by the soundscape */
export const journeyMotion = { depth: 0, speed: 0 }

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
  /** a chapter picked from the menu, several away: its arrival is played
      at Skip's pace (the visitor asked to be there), or -1 */
  hurryTo: -1,
}
export const SEQUENCE_EVENT = 'urniverse-sequence'

export const MODE_KEY = 'urniverse-view-mode'

/** the camera's distance, as a fraction of the chapter's own: in to a third, out to three times */
export const ZOOM_MIN = 0.35
export const ZOOM_MAX = 3.2
const PITCH_MAX = 1.25
/** one press of a zoom button */
export const ZOOM_STEP = 1.25

/* the page's zoom buttons follow the zoom, however it changed */
export const ZOOM_EVENT = 'urniverse-zoom'
const told = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ZOOM_EVENT))
}

export function zoomBy(factor: number) {
  viewMode.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, viewMode.zoom * factor))
  told()
}

export function resetOrbit() {
  const changed = viewMode.yaw !== 0 || viewMode.pitch !== 0 || viewMode.zoom !== 1
  viewMode.yaw = 0
  viewMode.pitch = 0
  viewMode.zoom = 1
  if (changed) told()
}

/* zoom by hand, in either mode: Ctrl + scroll (a trackpad's pinch) and
   the + and - keys (0 resets); returns a cleanup */
export function attachZoomInput() {
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return
    // (first, and no further: the journey's own wheel steps chapters)
    event.preventDefault()
    event.stopImmediatePropagation()
    zoomBy(Math.exp(event.deltaY * 0.004))
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === '+' || event.key === '=') zoomBy(1 / 1.15)
    else if (event.key === '-' || event.key === '_') zoomBy(1.15)
    else if (event.key === '0') resetOrbit()
  }
  window.addEventListener('wheel', onWheel, { passive: false, capture: true })
  window.addEventListener('keydown', onKey)
  return () => {
    window.removeEventListener('wheel', onWheel, { capture: true })
    window.removeEventListener('keydown', onKey)
  }
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
    if (!pointers.has(event.pointerId)) return
    pointers.delete(event.pointerId)
    if (pointers.size < 2) pinch = 0
    if (pointers.size === 0) {
      document.documentElement.classList.remove('is-orbiting')
      // (the reset button shows once the view has been turned)
      told()
    }
  }

  window.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  return () => {
    window.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    document.documentElement.classList.remove('is-orbiting')
  }
}

/* ============================================================
   THE OPENING: a directed film of some fifty seconds, from the intro
   ("Watch the opening"): darkness, the Sun, home, out past the giants,
   the whole Solar System, then the visitor takes over. The camera plays
   it on its own clock; the page shows the words and the score.
============================================================ */
export const OPENING_BEATS = [
  { at: 0, title: 'The darkness', line: 'Before anything, the dark. Then, one by one, the stars.' },
  { at: 6, title: 'The first light', line: 'A star like millions of others: ours.' },
  { at: 14, title: 'Our home', line: 'Down through the air of the only world we know.' },
  { at: 24, title: 'Beyond Earth', line: 'Out past Mars, Jupiter and Saturn.' },
  { at: 38, title: 'The scale of space', line: 'Eight worlds, and mostly emptiness.' },
  { at: 47, title: 'You are here', line: '' },
] as const
export const OPENING_SECONDS = 52

export const opening = {
  active: false,
  /** seconds in (advanced by the camera) */
  clock: 0,
  /** set by the page: end at once */
  skip: false,
}
