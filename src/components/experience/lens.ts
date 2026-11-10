/* Shared camera "lens" state, written once per frame by the scene and read
   by layers that react to it (the star field softens in close-ups). */
export const lens = {
  /* 0 in wide views, easing to 1 once the camera has settled on a planet */
  closeUp: 0,
  /* 0..1 as the camera drifts round into a backlit hero shot */
  backlit: 0,
}
