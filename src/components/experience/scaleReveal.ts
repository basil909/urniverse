import * as THREE from 'three'

/* ============================================================
   TRUE SIZE
   A reveal, at the Sun or any planet but Earth: the camera comes in
   close on Earth, drawn exactly to scale beside the world, and holds
   ("This is Earth."); then it pulls slowly back, and the world behind it
   keeps on growing into view ("And this is Jupiter."), until both sit in
   one frame with the figure that says how big it is. The journey's
   planets are already drawn at their true sizes; the Sun is drawn
   smaller, so the Earth here is always worked out from the real radii.
============================================================ */

export const EARTH_KM = 6371

/** seconds: in close on Earth, then the pull back */
export const REVEAL_HOLD = 3.2
export const REVEAL_PULL = 9
export const REVEAL_END = REVEAL_HOLD + REVEAL_PULL

export const reveal = {
  /** the reveal is running (set by the page, read by the scene) */
  active: false,
  /** the journey chapter it is for (1 the Sun, 2-9 the planets) */
  chapter: -1,
  /** seconds since it began (advanced by the camera, so it waits on a hidden tab) */
  clock: 0,
  /** 0..1: how much of the reveal the scene is showing (eases out after) */
  show: 0,
  /** where the Earth is drawn, and its radius, in scene units */
  earth: new THREE.Vector3(),
  earthRadius: 0,
}

const roundTo = (value: number) =>
  value >= 10 || Math.abs(value - Math.round(value)) < 0.06 ? String(Math.round(value)) : value.toFixed(1)

const bigNumber = (value: number) =>
  value >= 1e6
    ? `${(value / 1e6).toFixed(1).replace(/\.0$/, '')} million`
    : Math.round(value).toLocaleString('en-GB')

/** the closing words of the reveal, for a world of this radius */
export function revealFigures(radiusKm: number, isSun: boolean) {
  const ratio = radiusKm / EARTH_KM
  const it = isSun ? 'it' : 'it'
  if (ratio >= 1.5) {
    return {
      line: `${roundTo(ratio)} Earths across.`,
      sub: `${bigNumber(ratio ** 3)} Earths would fit inside ${it}.`,
    }
  }
  if (ratio > 0.9) {
    return {
      line: 'Almost exactly Earth’s size.',
      sub: `${Math.round(ratio * 100)}% as wide as Earth: its near twin.`,
    }
  }
  return {
    line: `${Math.round(ratio * 100)}% as wide as Earth.`,
    sub: `Earth could hold ${Math.round(1 / ratio ** 3)} of them.`,
  }
}
