/* Asking the scene to compile its shaders again (UniverseCanvas's WarmUp):
   for what arrives after the loading screen and rebuilds a material (the
   moons' maps), so its new shader is compiled in the background then,
   not on the first frame that draws it, mid-glide (some 120 ms a moon) */
export const WARM_EVENT = 'urniverse-warm'

export function requestWarm() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(WARM_EVENT))
}
