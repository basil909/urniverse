/* Shared camera "lens" state, written once per frame by the scene and read
   by layers that react to it (the star field softens in close-ups). */
export const lens = {
  /* 0 in wide views, easing to 1 once the camera has settled on a planet */
  closeUp: 0,
  /* 0..1 as the camera drifts round into a backlit hero shot */
  backlit: 0,
  /* the journey's chapter (0 the opening, 1 the Sun, 2-9 the planets...) */
  chapter: 0,
  /* 0..1: the start's "poster" of the whole Solar System (the camera far
     out, the Sun drawn larger and every planet sized to be seen), easing
     away on the way in to the Sun */
  poster: 0,
  /* true once the loading screen starts to lift: the opening sweep waits for it */
  revealed: false,
  /* true once the loading's shaders have all compiled (UniverseCanvas's
     WarmUp): the loading screen waits for it, a few seconds at most, so
     their compiling never stalls the first moments on screen */
  shadersReady: false,
}
export const SHADERS_READY_EVENT = 'urniverse-shaders-ready'

/* Run a load once the opening is on screen and the first frames are
   drawn (maps only needed close up: the loading screen need not wait
   for them). Returns a cancel. */
export function whenOpened(run: () => void, settleMs = 2500) {
  let timer = 0
  let idle = 0
  let stopped = false
  const go = () => {
    if (stopped) return
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    if (w.requestIdleCallback) idle = w.requestIdleCallback(() => !stopped && run(), { timeout: 2000 })
    else run()
  }
  const wait = () => {
    if (stopped) return
    if (lens.revealed) timer = window.setTimeout(go, settleMs)
    else timer = window.setTimeout(wait, 200)
  }
  wait()
  return () => {
    stopped = true
    window.clearTimeout(timer)
    const w = window as Window & { cancelIdleCallback?: (id: number) => void }
    if (idle && w.cancelIdleCallback) w.cancelIdleCallback(idle)
  }
}
