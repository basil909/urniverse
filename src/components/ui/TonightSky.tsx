'use client'

import { useMemo, useState } from 'react'

import { ANDROMEDA, describeBrightness, direction, GALACTIC_CENTRE, roughPlace, tonight, type Place } from './skyNow'

/* "In your sky tonight": when this world is up while it is dark where you
   are. A rough place from the time zone to begin with; "Use my location"
   asks the browser for a precise one, which never leaves the page. */

// the place, shared by every panel while the page is open
let remembered: Place | null = null

const time = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export default function TonightSky({ what }: { what: number | 'sun' | 'galaxy' | 'andromeda' }) {
  const [place, setPlace] = useState<Place>(() => remembered ?? roughPlace())
  const [asking, setAsking] = useState(false)
  const [refused, setRefused] = useState(false)

  const sky = useMemo(
    () => tonight(what === 'galaxy' ? GALACTIC_CENTRE : what === 'andromeda' ? ANDROMEDA : what, place),
    [what, place],
  )

  const locate = () => {
    if (!navigator.geolocation) {
      setRefused(true)
      return
    }
    setAsking(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lon: position.coords.longitude, rough: false, label: 'your location' }
        remembered = next
        setPlace(next)
        setAsking(false)
      },
      () => {
        setAsking(false)
        setRefused(true)
      },
      { maximumAge: 3_600_000, timeout: 15_000 },
    )
  }

  let headline: string
  let detail: string | null = null
  if (what === 'sun') {
    headline =
      sky.set && sky.rise
        ? sky.set < sky.rise
          ? `Sets at ${time(sky.set)}, rises again at ${time(sky.rise)}`
          : `Rises at ${time(sky.rise)}, sets at ${time(sky.set)}`
        : sky.rise
          ? `Rises at ${time(sky.rise)}`
          : sky.set
            ? `Sets at ${time(sky.set)}`
            : 'Up or down all day where you are'
    detail = `It is passing through ${sky.constellation}. Never look at it directly.`
  } else if (sky.verdict === 'no-night') {
    headline = 'The sky will not get dark enough tonight where you are'
  } else if (sky.verdict === 'near-sun') {
    headline = `Too close to the Sun to see right now`
    detail = `Only ${Math.round(sky.elongation ?? 0)}° from the Sun, lost in its glare.`
  } else if (sky.verdict === 'daytime' || !sky.window) {
    headline =
      what === 'galaxy'
        ? 'The centre of the galaxy is not up while it is dark tonight'
        : what === 'andromeda'
          ? 'Andromeda is not up while it is dark tonight'
          : `Not up while it is dark tonight`
    detail = typeof what === 'number' ? 'It crosses the sky by day.' : null
  } else {
    const w = sky.window
    // (already up and dark: the window starts now)
    headline =
      w.from.getTime() - Date.now() < 15 * 60000
        ? `Up now: look ${direction(w.az)}, until ${time(w.to)}`
        : `Look ${direction(w.az)}, ${time(w.from)} to ${time(w.to)}`
    detail = `Highest at ${time(w.peak)}, ${Math.round(w.alt)}° above the horizon.`
  }

  const rows: { label: string; value: string }[] = []
  if (typeof what === 'number') {
    if (sky.constellation) rows.push({ label: 'In', value: sky.constellation })
    if (sky.magnitude !== undefined) {
      rows.push({ label: 'Brightness', value: `${sky.magnitude.toFixed(1)}: ${describeBrightness(sky.magnitude)}` })
    }
    if (sky.rise) rows.push({ label: 'Rises', value: time(sky.rise) })
    if (sky.set) rows.push({ label: 'Sets', value: time(sky.set) })
  } else if (what === 'galaxy') {
    rows.push({ label: 'Where', value: 'In Sagittarius, near the Teapot' })
    if (sky.rise) rows.push({ label: 'Rises', value: time(sky.rise) })
    if (sky.set) rows.push({ label: 'Sets', value: time(sky.set) })
  } else if (what === 'andromeda') {
    rows.push({ label: 'Where', value: 'In Andromeda, near the Great Square of Pegasus' })
    rows.push({ label: 'Brightness', value: '3.4: a faint smudge, best in a dark sky' })
    if (sky.rise) rows.push({ label: 'Rises', value: time(sky.rise) })
    if (sky.set) rows.push({ label: 'Sets', value: time(sky.set) })
  }

  return (
    <section className="tonight" aria-labelledby="tonight-heading">
      <h3 id="tonight-heading">
        {what === 'galaxy'
          ? 'Its centre in your sky'
          : what === 'andromeda'
            ? 'Andromeda in your sky'
            : what === 'sun'
              ? 'In your sky today'
              : 'In your sky tonight'}
      </h3>
      <p className="tonight-headline">{headline}</p>
      {detail && <p className="tonight-detail">{detail}</p>}
      {rows.length > 0 && (
        <dl className="tonight-rows">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="tonight-place">
        {place.rough ? `Worked out for ${place.label} (a guess from your time zone).` : 'Worked out for your location.'}{' '}
        {place.rough && !refused && (
          <button type="button" onClick={locate} disabled={asking}>
            {asking ? 'Finding you…' : 'Use my location'}
          </button>
        )}
        {refused && <span>Location not available; using the guess.</span>}
      </p>
    </section>
  )
}
