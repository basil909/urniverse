import { getPlanetHeliocentricAU, julianDate } from '../experience/orbit'

/* ============================================================
   THE SKY TONIGHT, WORKED OUT IN THE BROWSER
   Where a planet (or the Sun, or the galaxy's centre) is in the sky over
   the next 24 hours from a place on Earth: when it is up while the sky is
   dark, when it rises and sets, which constellation it is in and how
   bright it looks. From the same orbital elements as the scene (good to
   a minute or two); nothing is fetched.
============================================================ */

const DEG = Math.PI / 180
const OBLIQUITY = 23.4393 * DEG
const EARTH = 2

export type Place = { lat: number; lon: number; rough: boolean; label: string }

/* ---- where the visitor is, roughly, from their time zone ---- */
const ZONES: Record<string, [number, number, string]> = {
  'Asia/Kolkata': [20.6, 79.0, 'India'],
  'Asia/Calcutta': [20.6, 79.0, 'India'],
  'Asia/Dubai': [25.2, 55.3, 'Dubai'],
  'Asia/Karachi': [24.9, 67.0, 'Karachi'],
  'Asia/Dhaka': [23.8, 90.4, 'Dhaka'],
  'Asia/Kathmandu': [27.7, 85.3, 'Kathmandu'],
  'Asia/Colombo': [6.9, 79.9, 'Colombo'],
  'Asia/Singapore': [1.35, 103.8, 'Singapore'],
  'Asia/Kuala_Lumpur': [3.1, 101.7, 'Kuala Lumpur'],
  'Asia/Jakarta': [-6.2, 106.8, 'Jakarta'],
  'Asia/Bangkok': [13.8, 100.5, 'Bangkok'],
  'Asia/Manila': [14.6, 121.0, 'Manila'],
  'Asia/Shanghai': [31.2, 121.5, 'China'],
  'Asia/Hong_Kong': [22.3, 114.2, 'Hong Kong'],
  'Asia/Tokyo': [35.7, 139.7, 'Tokyo'],
  'Asia/Seoul': [37.6, 127.0, 'Seoul'],
  'Asia/Riyadh': [24.7, 46.7, 'Riyadh'],
  'Asia/Tehran': [35.7, 51.4, 'Tehran'],
  'Europe/London': [51.5, -0.1, 'London'],
  'Europe/Dublin': [53.3, -6.3, 'Dublin'],
  'Europe/Paris': [48.9, 2.35, 'Paris'],
  'Europe/Berlin': [52.5, 13.4, 'Berlin'],
  'Europe/Madrid': [40.4, -3.7, 'Madrid'],
  'Europe/Rome': [41.9, 12.5, 'Rome'],
  'Europe/Amsterdam': [52.4, 4.9, 'Amsterdam'],
  'Europe/Stockholm': [59.3, 18.1, 'Stockholm'],
  'Europe/Moscow': [55.8, 37.6, 'Moscow'],
  'Europe/Istanbul': [41.0, 29.0, 'Istanbul'],
  'Africa/Cairo': [30.0, 31.2, 'Cairo'],
  'Africa/Lagos': [6.5, 3.4, 'Lagos'],
  'Africa/Nairobi': [-1.3, 36.8, 'Nairobi'],
  'Africa/Johannesburg': [-26.2, 28.0, 'Johannesburg'],
  'America/New_York': [40.7, -74.0, 'New York'],
  'America/Toronto': [43.7, -79.4, 'Toronto'],
  'America/Chicago': [41.9, -87.6, 'Chicago'],
  'America/Denver': [39.7, -105.0, 'Denver'],
  'America/Phoenix': [33.4, -112.1, 'Phoenix'],
  'America/Los_Angeles': [34.1, -118.2, 'Los Angeles'],
  'America/Vancouver': [49.3, -123.1, 'Vancouver'],
  'America/Mexico_City': [19.4, -99.1, 'Mexico City'],
  'America/Bogota': [4.7, -74.1, 'Bogotá'],
  'America/Lima': [-12.0, -77.0, 'Lima'],
  'America/Santiago': [-33.4, -70.7, 'Santiago'],
  'America/Sao_Paulo': [-23.6, -46.6, 'São Paulo'],
  'America/Argentina/Buenos_Aires': [-34.6, -58.4, 'Buenos Aires'],
  'Australia/Sydney': [-33.9, 151.2, 'Sydney'],
  'Australia/Melbourne': [-37.8, 145.0, 'Melbourne'],
  'Australia/Brisbane': [-27.5, 153.0, 'Brisbane'],
  'Australia/Perth': [-31.95, 115.9, 'Perth'],
  'Pacific/Auckland': [-36.8, 174.8, 'Auckland'],
  'Pacific/Honolulu': [21.3, -157.9, 'Honolulu'],
}
const REGION_LAT: Record<string, number> = {
  Europe: 50,
  America: 35,
  Asia: 30,
  Africa: 5,
  Australia: -30,
  Pacific: -15,
  Atlantic: 40,
  Indian: -10,
}

export function roughPlace(): Place {
  let zone = ''
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    zone = ''
  }
  const known = ZONES[zone]
  if (known) return { lat: known[0], lon: known[1], rough: true, label: known[2] }
  // the longitude from the clock's offset, the latitude from the region
  const lon = Math.max(-180, Math.min(180, (-new Date().getTimezoneOffset() / 60) * 15))
  const lat = REGION_LAT[zone.split('/')[0]] ?? 35
  return { lat, lon, rough: true, label: 'your time zone' }
}

/* ---- positions ---- */
type Body = number | 'sun' | { ra: number; dec: number }

/* right ascension and declination (radians), and distances (AU) */
function equatorial(body: Body, jd: number) {
  if (typeof body === 'object') return { ra: body.ra, dec: body.dec, lambda: 0, r: 0, delta: 0, R: 0 }
  const earth = getPlanetHeliocentricAU(EARTH, jd)
  const here = body === 'sun' ? [0, 0, 0] : getPlanetHeliocentricAU(body, jd)
  const gx = here[0] - earth[0]
  const gy = here[1] - earth[1]
  const gz = here[2] - earth[2]
  const x = gx
  const y = gy * Math.cos(OBLIQUITY) - gz * Math.sin(OBLIQUITY)
  const z = gy * Math.sin(OBLIQUITY) + gz * Math.cos(OBLIQUITY)
  const delta = Math.hypot(x, y, z)
  return {
    ra: Math.atan2(y, x),
    dec: Math.asin(z / delta),
    lambda: Math.atan2(gy, gx),
    r: Math.hypot(here[0], here[1], here[2]),
    delta,
    R: Math.hypot(earth[0], earth[1], earth[2]),
  }
}

function horizontal(ra: number, dec: number, jd: number, place: Place) {
  const gmst = (280.46061837 + 360.98564736629 * (jd - 2451545)) % 360
  const hourAngle = (gmst + place.lon) * DEG - ra
  const lat = place.lat * DEG
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle)
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)))
  const az = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) + Math.PI
  return { alt: alt / DEG, az: ((az / DEG) % 360 + 360) % 360 }
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
export const direction = (az: number) => COMPASS[Math.round(az / 45) % 8]

/* ---- the constellation along the ecliptic (IAU boundaries, J2000) ---- */
const ZODIAC: [number, string][] = [
  [28.69, 'Pisces'],
  [53.42, 'Aries'],
  [90.14, 'Taurus'],
  [117.99, 'Gemini'],
  [138.18, 'Cancer'],
  [173.85, 'Leo'],
  [217.81, 'Virgo'],
  [241.14, 'Libra'],
  [247.68, 'Scorpius'],
  [266.28, 'Ophiuchus'],
  [299.68, 'Sagittarius'],
  [327.9, 'Capricornus'],
  [351.57, 'Aquarius'],
  [360, 'Pisces'],
]
function constellation(lambda: number) {
  const deg = ((lambda / DEG) % 360 + 360) % 360
  return ZODIAC.find(([end]) => deg < end)?.[1] ?? 'Pisces'
}

/* ---- brightness (Mallama & Hilton 2018, simplified; Saturn without its rings) ---- */
function magnitude(index: number, r: number, delta: number, R: number) {
  const i = Math.acos(Math.max(-1, Math.min(1, (r * r + delta * delta - R * R) / (2 * r * delta)))) / DEG
  const d = 5 * Math.log10(r * delta)
  switch (index) {
    case 0:
      return -0.613 + d + 6.328e-2 * i - 1.6336e-3 * i ** 2 + 3.3644e-5 * i ** 3 - 3.4265e-7 * i ** 4 + 1.6893e-9 * i ** 5 - 3.0334e-12 * i ** 6
    case 1:
      return -4.384 + d - 1.044e-3 * i + 3.687e-4 * i ** 2 - 2.814e-6 * i ** 3 + 8.938e-9 * i ** 4
    case 3:
      return -1.601 + d + 2.267e-2 * i - 1.302e-4 * i ** 2
    case 4:
      return -9.395 + d + 3.7e-4 * i + 6.16e-4 * i ** 2
    case 5:
      return -8.914 + d
    case 6:
      return -7.11 + d
    default:
      return -7.0 + d
  }
}

export function describeBrightness(mag: number) {
  if (mag < -3) return 'brighter than any star'
  if (mag < -0.5) return 'as bright as the brightest stars'
  if (mag < 2) return 'easy to see by eye'
  if (mag < 6) return 'faint: look for it in a dark sky'
  return 'too faint for the eye: binoculars or a telescope'
}

/* ---- tonight ---- */
const STEP_MIN = 10
const DARK = -6 // the Sun this far below the horizon: the sky is dark enough
const UP = 8 // a planet this high is clear of haze and trees

export type Tonight = {
  constellation?: string
  magnitude?: number
  rise?: Date
  set?: Date
  /* up while the sky is dark: from, to, and its highest point then */
  window?: { from: Date; to: Date; peak: Date; alt: number; az: number }
  verdict: 'visible' | 'daytime' | 'near-sun' | 'no-night'
  elongation?: number
}

export function tonight(body: Body, place: Place, from = new Date()): Tonight {
  const start = from.getTime()
  const samples: { t: number; sun: number; alt: number; az: number }[] = []
  for (let m = 0; m <= 24 * 60; m += STEP_MIN) {
    const t = start + m * 60000
    const jd = julianDate(new Date(t))
    const sunEq = equatorial('sun', jd)
    const sun = horizontal(sunEq.ra, sunEq.dec, jd, place)
    const eq = body === 'sun' ? sunEq : equatorial(body, jd)
    const at = body === 'sun' ? sun : horizontal(eq.ra, eq.dec, jd, place)
    samples.push({ t, sun: sun.alt, alt: at.alt, az: at.az })
  }

  // rising and setting (the centre 0.57 degrees below, for refraction)
  const HORIZON = body === 'sun' ? -0.83 : -0.57
  let rise: Date | undefined
  let set: Date | undefined
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1]
    const b = samples[i]
    const cross = (h: number) => new Date(a.t + ((h - a.alt) / (b.alt - a.alt)) * (b.t - a.t))
    if (!rise && a.alt < HORIZON && b.alt >= HORIZON) rise = cross(HORIZON)
    if (!set && a.alt >= HORIZON && b.alt < HORIZON) set = cross(HORIZON)
  }

  const jd = julianDate(from)
  const eq = typeof body === 'number' ? equatorial(body, jd) : null
  const result: Tonight = { rise, set, verdict: 'visible' }
  if (typeof body === 'number' && eq) {
    result.constellation = constellation(eq.lambda)
    result.magnitude = magnitude(body, eq.r, eq.delta, eq.R)
    const sunEq = equatorial('sun', jd)
    const cos =
      Math.sin(eq.dec) * Math.sin(sunEq.dec) + Math.cos(eq.dec) * Math.cos(sunEq.dec) * Math.cos(eq.ra - sunEq.ra)
    result.elongation = Math.acos(Math.max(-1, Math.min(1, cos))) / DEG
  } else if (body === 'sun') {
    result.constellation = constellation(equatorial('sun', jd).lambda)
  }
  if (body === 'sun') return result

  if (!samples.some((s) => s.sun < DARK)) {
    result.verdict = 'no-night'
    return result
  }
  if (result.elongation !== undefined && result.elongation < (body === 0 ? 10 : 12)) {
    result.verdict = 'near-sun'
    return result
  }
  // the first stretch of darkness with it well up
  let from_: number | null = null
  let to = 0
  let peak = { t: 0, alt: -90, az: 0 }
  for (const s of samples) {
    const ok = s.sun < DARK && s.alt > UP
    if (ok) {
      if (from_ === null) from_ = s.t
      to = s.t
      if (s.alt > peak.alt) peak = { t: s.t, alt: s.alt, az: s.az }
    } else if (from_ !== null) break
  }
  if (from_ === null) {
    result.verdict = 'daytime'
    return result
  }
  result.window = { from: new Date(from_), to: new Date(to), peak: new Date(peak.t), alt: peak.alt, az: peak.az }
  return result
}

/* the galaxy's centre, Sagittarius A*; the Andromeda Galaxy */
export const GALACTIC_CENTRE = { ra: 266.417 * DEG, dec: -29.008 * DEG }
export const ANDROMEDA = { ra: 10.6847 * DEG, dec: 41.269 * DEG }
