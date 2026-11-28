import { FEATURES } from '../experience/features'

/* ============================================================
   WHERE YOU LANDED
   What a pair of coordinates means on each world you can stand on: the
   nearest named place and landing site, what it is like there (gravity,
   temperature, air, sky), how long its day is. Body ids as in orbit.ts.
   Places: planetocentric latitude, east longitude (IAU Gazetteer of
   Planetary Nomenclature; landing sites from the missions' own reports).
   Conditions: NASA fact sheets.
============================================================ */

export type Surface = {
  name: string
  radiusKm: number
  /** at the surface, m/s² */
  gravity: number
  temperature: string
  air: string
  sky: string
  /** sunrise to sunrise, hours */
  dayHours: number
  /** the world that hangs in this sky, and how wide it looks (degrees) */
  other?: { name: string; width: number }
  /** one thing worth knowing, standing here */
  note: string
  /** the dust a touchdown throws up, and the rocks lying about */
  dust: string
  rock: string
  /** boulders per 1,000 m², and how rounded (0 sharp, 1 river-worn) */
  rocks: number
  rounded: number
  /** air enough for dust to hang in, and a flag to fly */
  windy: boolean
}

const EARTH_FULL_MOON = 0.52 // degrees

export const SURFACES: Record<number, Surface> = {
  0: {
    name: 'Mercury', radiusKm: 2439.7, gravity: 3.7,
    temperature: '430 °C by day, −180 °C at night', air: 'None to speak of',
    sky: 'Black, even at noon; the Sun some 2½ times as wide as from Earth', dayHours: 4222.6,
    note: 'One day here, sunrise to sunrise, lasts two of Mercury’s years.',
    dust: '#8d877f', rock: '#6f6a64', rocks: 1.2, rounded: 0.15, windy: false,
  },
  2: {
    name: 'Earth', radiusKm: 6371, gravity: 9.81,
    temperature: '15 °C on average', air: '1 bar: the one we breathe',
    sky: 'Blue by day, red at sunset', dayHours: 24, other: { name: 'the Moon', width: 0.52 },
    note: 'The only world we know of with liquid water on its surface, and life.',
    dust: '#cfcbc4', rock: '#8a8178', rocks: 0, rounded: 0.6, windy: true,
  },
  3: {
    name: 'Mars', radiusKm: 3389.5, gravity: 3.71,
    temperature: 'About −60 °C on average; 20 °C to −125 °C', air: '0.6% of Earth’s, mostly carbon dioxide',
    sky: 'Butterscotch by day; the sunsets are blue', dayHours: 24.66, other: { name: 'Earth', width: 0 },
    note: 'Its dust is finer than flour, red with iron oxide: rust.',
    dust: '#b9774f', rock: '#7d4f38', rocks: 1.6, rounded: 0.25, windy: true,
  },
  12: {
    name: 'the Moon', radiusKm: 1737.4, gravity: 1.62,
    temperature: '120 °C by day, −130 °C at night', air: 'None',
    sky: 'Black; on the near side Earth hangs almost still', dayHours: 708.7, other: { name: 'Earth', width: 1.9 },
    note: 'No wind and no rain: a footprint here can last millions of years.',
    dust: '#9d9a94', rock: '#6f6e6b', rocks: 1.4, rounded: 0.2, windy: false,
  },
  13: {
    name: 'Io', radiusKm: 1821.6, gravity: 1.8,
    temperature: 'About −140 °C; its lava, up to 1,600 °C', air: 'A whisper of sulfur dioxide',
    sky: 'Black, with Jupiter in it', dayHours: 42.5, other: { name: 'Jupiter', width: 19.2 },
    note: 'The most volcanic place known: over 400 active volcanoes.',
    dust: '#d6c46e', rock: '#8c7a3e', rocks: 0.6, rounded: 0.3, windy: false,
  },
  14: {
    name: 'Europa', radiusKm: 1560.8, gravity: 1.31,
    temperature: 'About −160 °C', air: 'A trace of oxygen',
    sky: 'Black, with Jupiter in it', dayHours: 85.2, other: { name: 'Jupiter', width: 12.2 },
    note: 'Under this ice, 15 to 25 km down, is an ocean with more water than all of Earth’s.',
    dust: '#e4e8ee', rock: '#b9c3cc', rocks: 0.9, rounded: 0.1, windy: false,
  },
  15: {
    name: 'Ganymede', radiusKm: 2634.1, gravity: 1.43,
    temperature: 'About −160 °C', air: 'A trace of oxygen',
    sky: 'Black, with Jupiter in it', dayHours: 171.7, other: { name: 'Jupiter', width: 7.6 },
    note: 'The largest moon in the Solar System, wider than Mercury.',
    dust: '#a49c91', rock: '#6f675e', rocks: 1, rounded: 0.2, windy: false,
  },
  16: {
    name: 'Callisto', radiusKm: 2410.3, gravity: 1.24,
    temperature: 'About −140 °C', air: 'A trace of carbon dioxide',
    sky: 'Black, with Jupiter in it', dayHours: 400.5, other: { name: 'Jupiter', width: 4.4 },
    note: 'The most cratered surface known: barely changed in 4 billion years.',
    dust: '#71685e', rock: '#4f4841', rocks: 1.3, rounded: 0.15, windy: false,
  },
  17: {
    name: 'Titan', radiusKm: 2574.7, gravity: 1.35,
    temperature: '−179 °C', air: '1.5 times Earth’s, mostly nitrogen',
    sky: 'Orange haze; Saturn hidden behind it', dayHours: 382.7,
    note: 'It rains methane here, into rivers and seas. Huygens landed on rounded pebbles of ice.',
    dust: '#a07a4c', rock: '#8a7a64', rocks: 2.2, rounded: 0.95, windy: true,
  },
  18: {
    name: 'Phobos', radiusKm: 11.27, gravity: 0.0057,
    temperature: '−4 °C by day, −112 °C at night', air: 'None',
    sky: 'Black, and Mars fills a quarter of it', dayHours: 7.66, other: { name: 'Mars', width: 42 },
    note: 'Mars is pulling it in: in some 50 million years it will break up into a ring.',
    dust: '#71675f', rock: '#4f4741', rocks: 0.8, rounded: 0.2, windy: false,
  },
  19: {
    name: 'Deimos', radiusKm: 6.2, gravity: 0.003,
    temperature: 'About −40 °C', air: 'None',
    sky: 'Black, with Mars in it', dayHours: 30.35, other: { name: 'Mars', width: 16.6 },
    note: 'Smooth with dust metres deep; you could jump off it at 20 km/h.',
    dust: '#887d73', rock: '#5e554d', rocks: 0.4, rounded: 0.2, windy: false,
  },
}

/** the world in each sky, by body id (Mars and the Moon: Earth) */
export const OTHER_BODY: Record<number, number> = { 0: 2, 2: 12, 3: 2, 12: 2, 13: 4, 14: 4, 15: 4, 16: 4, 17: 5, 18: 3, 19: 3 }

type Place = { body: number; name: string; lat: number; lon: number }

/* the large regions, for "where": a plain, a sea, a highland */
const REGIONS: Place[] = [
  { body: 3, name: 'Amazonis Planitia', lat: 24.8, lon: -163.7 },
  { body: 3, name: 'Arcadia Planitia', lat: 47.2, lon: -175.6 },
  { body: 3, name: 'Chryse Planitia', lat: 28.4, lon: -40.3 },
  { body: 3, name: 'Acidalia Planitia', lat: 49.8, lon: -20.3 },
  { body: 3, name: 'Isidis Planitia', lat: 12.9, lon: 87.0 },
  { body: 3, name: 'Elysium Planitia', lat: 2.0, lon: 154.7 },
  { body: 3, name: 'Argyre Planitia', lat: -49.7, lon: -43.4 },
  { body: 3, name: 'Arabia Terra', lat: 22.8, lon: 5.0 },
  { body: 3, name: 'Terra Cimmeria', lat: -32.7, lon: 145.5 },
  { body: 3, name: 'Terra Sirenum', lat: -39.7, lon: -150.1 },
  { body: 3, name: 'Syrtis Major', lat: 8.4, lon: 69.5 },
  { body: 3, name: 'Tharsis', lat: 1.6, lon: -112.6 },
  { body: 3, name: 'Meridiani Planum', lat: 0.2, lon: -3.0 },
  { body: 3, name: 'Lunae Planum', lat: 10.0, lon: -68.0 },
  { body: 3, name: 'Tempe Terra', lat: 39.7, lon: -71.4 },
  { body: 3, name: 'Promethei Terra', lat: -64.4, lon: 97.0 },
  { body: 3, name: 'Planum Boreum, the north polar cap', lat: 88.0, lon: 15.0 },
  { body: 3, name: 'Planum Australe, the south polar cap', lat: -84.0, lon: 160.0 },
  { body: 12, name: 'Mare Tranquillitatis', lat: 8.5, lon: 31.4 },
  { body: 12, name: 'Mare Crisium', lat: 17.0, lon: 59.1 },
  { body: 12, name: 'Mare Nubium', lat: -21.3, lon: -16.6 },
  { body: 12, name: 'Mare Fecunditatis', lat: -7.8, lon: 51.3 },
  { body: 12, name: 'Mare Nectaris', lat: -15.2, lon: 35.5 },
  { body: 12, name: 'Mare Frigoris', lat: 56.0, lon: 1.4 },
  { body: 12, name: 'Mare Humorum', lat: -24.4, lon: -38.6 },
  { body: 12, name: 'Mare Orientale', lat: -19.4, lon: -92.8 },
  { body: 12, name: 'Mare Moscoviense', lat: 27.3, lon: 147.9 },
  { body: 12, name: 'the South Pole–Aitken basin', lat: -53.0, lon: -169.0 },
  { body: 0, name: 'Borealis Planitia', lat: 73.4, lon: -79.5 },
  { body: 0, name: 'Rembrandt basin', lat: -32.9, lon: 87.9 },
  { body: 0, name: 'Beethoven basin', lat: -20.8, lon: -123.6 },
  { body: 0, name: 'Tolstoj basin', lat: -16.3, lon: -164.7 },
  { body: 0, name: 'Hokusai', lat: 57.8, lon: 16.8 },
]

/* where people (and their machines) came down before */
const SITES: Place[] = [
  { body: 3, name: 'Viking 1', lat: 22.27, lon: -47.95 },
  { body: 3, name: 'Viking 2', lat: 47.64, lon: 134.29 },
  { body: 3, name: 'Pathfinder', lat: 19.13, lon: -33.22 },
  { body: 3, name: 'Spirit', lat: -14.57, lon: 175.47 },
  { body: 3, name: 'Opportunity', lat: -1.95, lon: -5.53 },
  { body: 3, name: 'Phoenix', lat: 68.22, lon: -125.75 },
  { body: 3, name: 'Curiosity', lat: -4.59, lon: 137.44 },
  { body: 3, name: 'InSight', lat: 4.5, lon: 135.62 },
  { body: 3, name: 'Perseverance', lat: 18.44, lon: 77.45 },
  { body: 3, name: 'Zhurong', lat: 25.07, lon: 109.93 },
  { body: 12, name: 'Apollo 11', lat: 0.674, lon: 23.473 },
  { body: 12, name: 'Apollo 12', lat: -3.01, lon: -23.42 },
  { body: 12, name: 'Apollo 14', lat: -3.65, lon: -17.47 },
  { body: 12, name: 'Apollo 15', lat: 26.13, lon: 3.63 },
  { body: 12, name: 'Apollo 16', lat: -8.97, lon: 15.5 },
  { body: 12, name: 'Apollo 17', lat: 20.19, lon: 30.77 },
  { body: 12, name: 'Luna 9', lat: 7.08, lon: -64.37 },
  { body: 12, name: 'Chang’e 4', lat: -45.44, lon: 177.6 },
  { body: 12, name: 'Chang’e 6', lat: -41.63, lon: -153.99 },
  { body: 12, name: 'Chandrayaan-3', lat: -69.37, lon: 32.32 },
  { body: 0, name: 'MESSENGER (its impact)', lat: 54.4, lon: -149.9 },
  { body: 2, name: 'Kennedy Space Center', lat: 28.61, lon: -80.69 },
  { body: 17, name: 'Huygens', lat: -10.3, lon: 167.7 },
]

const RAD = Math.PI / 180

/** great-circle distance (km) and the bearing (degrees from north) from a to b */
export function between(radiusKm: number, a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const p1 = a.lat * RAD
  const p2 = b.lat * RAD
  const dl = (b.lon - a.lon) * RAD
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  const km = 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)))
  const bearing = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD
  return { km, bearing: (bearing + 360) % 360 }
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
export const compass = (degrees: number) => COMPASS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8]

export function formatKm(km: number) {
  if (km < 1) return `${Math.max(10, Math.round(km * 100) * 10)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km).toLocaleString('en-GB')} km`
}

function nearestOf(list: readonly Place[], body: number, radiusKm: number, at: { lat: number; lon: number }) {
  let best: { name: string; km: number; bearing: number } | null = null
  for (const place of list) {
    if (place.body !== body) continue
    const { km, bearing } = between(radiusKm, at, place)
    if (!best || km < best.km) best = { name: place.name.replace(/ \(.*\)$/, ''), km, bearing }
  }
  return best
}

/** where you are: the region (or the named feature you are in), and the
    nearest landing site, with how far and which way */
export function whereAmI(body: number, at: { lat: number; lon: number }) {
  const surface = SURFACES[body]
  if (!surface) return null
  const radius = surface.radiusKm
  const feature = nearestOf(FEATURES, body, radius, at)
  const region = nearestOf(REGIONS, body, radius, at)
  const site = nearestOf(SITES, body, radius, at)
  // in a named feature when close (it is the more particular name); in a
  // region when well inside it (a quarter of the world's radius from its
  // middle); else how far, and which way, from the nearest
  const inside = Math.max(300, radius * 0.25)
  const away = (place: { name: string; km: number; bearing: number }) =>
    `${formatKm(place.km)} ${compass(place.bearing + 180)} of ${place.name}`
  const area =
    feature && feature.km < 150
      ? feature.name
      : region && region.km < inside
        ? region.name
        : region && region.km < radius * 0.8
          ? away(region)
          : feature
            ? away(feature)
            : null
  return { area, feature, site, radius }
}

/** local solar time as words: "2:40 pm, the Sun 31° up in the west" */
export function timeOfDay(hours: number, sunAlt: number) {
  const h = ((hours % 24) + 24) % 24
  const hh = Math.floor(h)
  const mm = Math.floor((h - hh) * 60)
  const clock = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`
  const part =
    sunAlt < -12 ? 'night' : sunAlt < 0 ? (h < 12 ? 'before dawn' : 'twilight') : sunAlt < 8 ? (h < 12 ? 'sunrise' : 'sunset') : h < 11 ? 'morning' : h < 13 ? 'midday' : 'afternoon'
  return { clock, part }
}

/* your landings, kept in this browser */
const LOG_KEY = 'urniverse-landings'
export type Landing = { world: string; place: string; at: number }

export function readLandings(): Landing[] {
  try {
    const list = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function logLanding(world: string, place: string) {
  const list = readLandings()
  list.push({ world, place, at: Date.now() })
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(-200)))
  } catch {}
  return list
}

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
export const ordinal = (n: number) => ORDINAL[n - 1] ?? `${n}th`

/* a jump: off the ground at 3.1 m/s (about half a metre on Earth), under
   the world's own gravity, weakening with height on the small moons:
   how high, and how long until you land */
export function jumpFor(body: number, speed = 3.1) {
  const surface = SURFACES[body]
  if (!surface) return { height: 0, seconds: 0 }
  const R = surface.radiusKm * 1000
  const gm = surface.gravity * R * R
  // up and down again, stepped (the small moons' gravity fades with height)
  let h = 0
  let v = speed
  let t = 0
  let top = 0
  const dt = surface.gravity > 0.5 ? 0.002 : 0.05
  while ((h > 0 || t === 0) && t < 1e6) {
    v -= (gm / (R + h) ** 2) * dt
    h += v * dt
    t += dt
    top = Math.max(top, h)
  }
  return { height: top, seconds: t }
}
