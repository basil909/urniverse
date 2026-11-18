'use client'

import { useEffect, useMemo, useState } from 'react'

import { getPlanetHeliocentricAU, julianDate } from '../experience/orbit'

/* "Right now": live figures for the open panel. Where the world is today
   (its distance from Earth and from the Sun, and how long its light takes
   to reach us), and a counter of how far it has moved since the page was
   opened. Quiet numbers, updated once a second while the panel is open. */

const AU_KM = 149_597_870.7
const LIGHT_KM_S = 299_792.458
const EARTH = 2

/* Voyager 1, roughly: about 172 AU from the Sun in mid-November 2026,
   moving outwards at about 3.57 AU a year, towards ecliptic longitude
   ~256 degrees, latitude ~+35 degrees (in Ophiuchus) */
const VOYAGER_EPOCH = Date.UTC(2026, 10, 15)
const VOYAGER_AU = 172.3
const VOYAGER_AU_PER_YEAR = 3.57
const VOYAGER_LON = (256 * Math.PI) / 180
const VOYAGER_LAT = (35 * Math.PI) / 180

export function voyagerFromSunAU(date: Date) {
  return VOYAGER_AU + ((date.getTime() - VOYAGER_EPOCH) / (365.25 * 86400000)) * VOYAGER_AU_PER_YEAR
}

function voyagerPositionAU(date: Date): [number, number, number] {
  const r = voyagerFromSunAU(date)
  return [
    r * Math.cos(VOYAGER_LAT) * Math.cos(VOYAGER_LON),
    r * Math.cos(VOYAGER_LAT) * Math.sin(VOYAGER_LON),
    r * Math.sin(VOYAGER_LAT),
  ]
}

const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

export function formatKm(km: number) {
  if (km >= 1e9) return `${(km / 1e9).toFixed(km >= 1e10 ? 1 : 2)} billion km`
  if (km >= 1e6) return `${(km / 1e6).toFixed(km >= 1e8 ? 0 : 1)} million km`
  return `${Math.round(km).toLocaleString('en-US')} km`
}

function formatLight(km: number) {
  const seconds = km / LIGHT_KM_S
  if (seconds < 60) return `${seconds.toFixed(1)} seconds`
  const minutes = seconds / 60
  if (minutes < 60) {
    const whole = Math.floor(minutes)
    const rest = Math.round(seconds - whole * 60)
    return rest ? `${whole} min ${rest} s` : `${whole} min`
  }
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes - hours * 60)
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

type Row = { label: string; value: string; note?: string }

/* where = -1: the Sun; 0-7: a planet; 'voyager': the Pale Blue Dot chapter */
function rowsFor(where: number | 'voyager' | undefined, name: string): Row[] {
  if (where === undefined) return []
  const now = new Date()
  const jd = julianDate(now)
  const earth = getPlanetHeliocentricAU(EARTH, jd)
  const sun = [0, 0, 0]

  if (where === 'voyager') {
    const voyager = voyagerPositionAU(now)
    const fromEarth = distance(voyager, earth) * AU_KM
    return [
      { label: 'Voyager 1 from the Sun', value: `About ${formatKm(distance(voyager, sun) * AU_KM)}` },
      {
        label: 'A signal from Earth',
        value: `About ${Math.round(fromEarth / LIGHT_KM_S / 3600)} hours`,
        note: 'each way, at the speed of light',
      },
    ]
  }
  if (where === -1) {
    const km = distance(earth, sun) * AU_KM
    return [
      { label: 'From Earth today', value: formatKm(km) },
      { label: 'Its light takes', value: formatLight(km), note: 'to reach Earth' },
    ]
  }
  const here = getPlanetHeliocentricAU(where, jd)
  const fromSun = distance(here, sun) * AU_KM
  if (where === EARTH) {
    return [
      { label: 'From the Sun today', value: formatKm(fromSun) },
      { label: 'Sunlight takes', value: formatLight(fromSun), note: 'to reach Earth' },
    ]
  }
  const fromEarth = distance(here, earth) * AU_KM
  return [
    { label: 'From Earth today', value: formatKm(fromEarth) },
    { label: 'From the Sun today', value: formatKm(fromSun) },
    { label: 'Its light takes', value: formatLight(fromEarth), note: `from ${name} to Earth` },
  ]
}

export default function WorldLive({
  where,
  name,
  travel,
}: {
  where?: number | 'voyager'
  name: string
  travel?: { kmPerSecond: number; sentence: string }
}) {
  const rows = useMemo(() => rowsFor(where, name), [where, name])
  // seconds since the page was opened (the counter ticks once a second)
  const [seconds, setSeconds] = useState(() => (typeof performance === 'undefined' ? 0 : performance.now() / 1000))
  useEffect(() => {
    if (!travel) return
    const tick = () => setSeconds(performance.now() / 1000)
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [travel])

  if (!rows.length && !travel) return null
  const [before, after] = travel ? travel.sentence.split('{km}') : ['', '']
  const km = Math.round((travel?.kmPerSecond ?? 0) * seconds).toLocaleString('en-US')

  return (
    <section className="detail-live" aria-label="Right now">
      <h3 className="detail-live-heading">
        <span className="detail-live-dot" aria-hidden="true" />
        Right now
      </h3>
      {rows.length > 0 && (
        <dl className="detail-live-grid">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                {row.value}
                {row.note && <small>{row.note}</small>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {travel && (
        <p className="detail-live-travel">
          {before}
          <strong>{km} km</strong>
          {after}
        </p>
      )}
    </section>
  )
}
