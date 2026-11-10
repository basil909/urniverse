import { julianDate } from './orbit'

/* ============================================================
   SIMULATION CLOCK
   One shared time (a Julian Date) for every planet and for the camera,
   so the camera always aims where the planet really is. It starts at
   the visitor's current date, so the planets are where they are today.
   `Clock` (in UniverseCanvas) advances it each frame: briskly in the
   wide views, so you can watch the orbits, almost frozen in close-ups.
============================================================ */

const now = julianDate(new Date())

export const simClock = {
  /** current simulated Julian Date */
  jd: now,
  /** date the simulation started at (today) */
  startJd: now,
  /** current speed, in simulated days per real second */
  rate: 0,
}

/** days per second in the wide views (intro, Sun, beyond, return) */
export const WIDE_VIEW_RATE = 5
/** days per second while a planet or the galaxy is the subject */
export const CLOSE_UP_RATE = 0.02
