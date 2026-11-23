/* ============================================================
   THE MILKY WAY'S LAYOUT
   The few numbers the galaxy model (Galaxy.tsx), its neighbours and the
   dive to its centre (galaxyDive.ts) share. A disc 100,000 light-years
   across: one unit is about 2,270 light-years.
============================================================ */

/* the central bar's direction in the disc */
export const BAR_ANGLE = 0.45
export const BAR_COS = Math.cos(BAR_ANGLE)
export const BAR_SIN = Math.sin(BAR_ANGLE)
export const GALAXY_RADIUS = 22
/* the bar's half-length: about 16,000 light-years */
export const BAR_HALF = 7
/* the arms' pitch, about 12.5 degrees: how far they wind per step out */
export const ARM_WIND = 1 / Math.tan((12.5 * Math.PI) / 180)
/* the Sun: 26,000 ly out, about 0.92 rad round from the Perseus arm, which
   puts the Sagittarius arm just inside it */
export const SUN_RADIUS = GALAXY_RADIUS * 0.56
export const SUN_ANGLE = BAR_ANGLE + ARM_WIND * Math.log(SUN_RADIUS / BAR_HALF) + 0.92
/* light-years in one unit of the model */
export const LY_PER_UNIT = 50000 / GALAXY_RADIUS
