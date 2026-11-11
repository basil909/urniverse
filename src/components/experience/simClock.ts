import { julianDate, setMoonClock, setOrbitClock } from './orbit'

/* ============================================================
   SIMULATION CLOCK
   One shared time (a Julian Date) for every planet and for the camera,
   so the camera always aims where the planet really is. It starts at
   the visitor's current date, so the planets are where they are today.
   `Clock` (in UniverseCanvas) advances it each frame.

   Two ways to watch:
   - cinematic (the default): the planets drift gently along their real
     orbits (faster in the wide views, almost frozen in close-ups), while
     spins and moons run on their own calm clock (`bodyJd`), starting from
     their real positions today. Nothing whirls.
   - real motion (the "Real motion" button): one clock for everything at
     a chosen speed, so orbits, Earth's day, the Moon's phases and the
     moons all keep true time with each other.
============================================================ */

const now = julianDate(new Date())

export const simClock = {
  /** current simulated Julian Date (planet orbits, the comet, the belts) */
  jd: now,
  /** time for spins and moons: Earth's day side, the Moon, moon orbits */
  bodyJd: now,
  /** date the simulation started at (today) */
  startJd: now,
  /** current speed of `jd`, in simulated days per real second */
  rate: 0,
  /** real motion: one clock for everything, at `realRate` */
  real: false,
  /** days per second in real-motion mode */
  realRate: 1,
}

/** days per second in the wide views (intro, Sun, return), cinematic mode */
export const WIDE_VIEW_RATE = 2
/** days per second while a planet or the galaxy is the subject */
export const CLOSE_UP_RATE = 0.02
/** days per second for spins and moons in cinematic mode (~7° of Earth's turn a second) */
export const BODY_RATE = 0.02

/** real-motion speeds offered by the button, in days per second */
export const REAL_SPEEDS = [
  { label: '1 hour / s', days: 1 / 24 },
  { label: '1 day / s', days: 1 },
  { label: '1 week / s', days: 7 },
]

/* switching modes: real motion restarts at this moment, so what you see
   is the sky now, running forward; leaving it carries on from there */
export function setRealMotion(on: boolean) {
  simClock.real = on
  if (on) {
    const current = julianDate(new Date())
    simClock.jd = current
    simClock.bodyJd = current
  } else {
    simClock.bodyJd = simClock.jd
  }
}

export function resetToNow() {
  const current = julianDate(new Date())
  simClock.jd = current
  simClock.bodyJd = current
}

// the Moon (as a body to fly to) follows the spins-and-moons clock
setMoonClock(() => simClock.bodyJd)
setOrbitClock(() => simClock.jd)
