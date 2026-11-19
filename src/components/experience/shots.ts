/* ============================================================
   THE SIX SHOTS
   At any planet, its chapter can be watched as a short film: six shots,
   each a camera of its own, joined by cuts (a moment of black, not a
   flight through the planet):
     1 Hero         half-lit, large, the planet off-centre
     2 Surface      close over the cloud tops or the ground
     3 Backlit      from the night side, the Sun behind the planet
     4 Exploration  a spacecraft in the foreground, for scale
     5 Horizon      just above the air, along the curve of the world
     6 Establishing far out: the planet and its moons in the dark
   Each shot drifts slowly while it holds. The page picks the shot; the
   camera reads it here.
============================================================ */

export const SHOTS = [
  { name: 'Hero shot', short: 'Hero' },
  { name: 'Surface close-up', short: 'Surface' },
  { name: 'Backlit silhouette', short: 'Backlit' },
  { name: 'Exploration shot', short: 'Exploration' },
  { name: 'Environmental shot', short: 'Horizon' },
  { name: 'Establishing shot', short: 'Establishing' },
] as const

/** seconds each shot holds when the film plays on its own */
export const SHOT_SECONDS = 8

export const shot = {
  /** 0: none (the chapter's own view); 1-6: the shot on screen */
  index: 0,
  /** the journey chapter it is for (2-9, the planets) */
  chapter: -1,
  /** seconds the current shot has held (for its slow drift) */
  clock: 0,
  /** set by the page at a cut: the camera jumps instead of gliding */
  cut: false,
  /** what the camera worked out, for the captions: km from the planet's
      centre to the camera, and its altitude above the planet in km */
  distanceKm: 0,
  altitudeKm: 0,
}
