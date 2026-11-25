'use client'

import { useEffect, useRef, useState } from 'react'

import { pilot } from '../experience/pilotState'
import { compass, formatKm, logLanding, ordinal, SURFACES, timeOfDay, whereAmI } from './landingSite'
import Icon from './Icon'

/* ============================================================
   LANDED
   Standing on a world, a card says where you are (the region, the
   nearest landing site, the coordinates) and what it is like there: the
   local time and the Sun, what hangs in the sky, your weight, the cold
   or heat, the air. And what you can do: step outside and walk (and
   jump), plant a flag, watch a whole day go by, keep a postcard, take
   off again. On foot it folds away to the walking keys.
============================================================ */

function formatDay(hours: number) {
  if (hours < 48) {
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    return m ? `${h} h ${m} min` : `${h} hours`
  }
  return `${(hours / 24).toFixed(hours < 240 ? 1 : 0)} Earth days`
}

const coordinates = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(1)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(1)}° ${lon < 0 ? 'W' : 'E'}`

/* a whole day in about forty seconds */
const DAY_SECONDS = 40

export default function LandedCard({ touch }: { touch: boolean }) {
  const [, setTick] = useState(0)
  const [open, setOpen] = useState(true)
  const [landing, setLanding] = useState<{ count: number; here: number } | null>(null)
  const watching = useRef(false)
  const logged = useRef(false)
  const body = pilot.nearestIndex
  const surface = SURFACES[body]

  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 250)
    // (on a phone the card starts folded: the view first)
    if (window.matchMedia('(max-width: 640px)').matches) setOpen(false)
    return () => {
      window.clearInterval(timer)
      // leaving: the clock back to held, if it was running for a day
      if (watching.current) pilot.timeScale = 0
      pilot.walking = false
    }
  }, [])

  // this landing, in the log
  useEffect(() => {
    if (logged.current || !surface) return
    logged.current = true
    const where = whereAmI(body, pilot.site)
    const list = logLanding(surface.name, where?.area ?? coordinates(pilot.site.lat, pilot.site.lon))
    setLanding({ count: list.length, here: list.filter((entry) => entry.world === surface.name).length })
  }, [body, surface])

  if (!surface) return null
  const where = whereAmI(body, pilot.site)
  const sky = pilot.sky
  const otherName = surface.other?.name
  const otherUp = sky.otherIndex >= 0 && otherName
  const title =
    where?.area ??
    (otherUp && sky.otherIndex !== 2 && body !== 2
      ? sky.otherAlt > 0
        ? `The side facing ${otherName}`
        : `The far side from ${otherName}`
      : 'Unnamed ground')
  const site = where?.site
  const siteLine = site
    ? site.km < 2
      ? `Right by ${site.name}’s landing site`
      : `${site.name} landed ${formatKm(site.km)} to the ${compass(site.bearing)}`
    : null
  const { clock, part } = timeOfDay(sky.hours, sky.sunAlt)
  const sunLine =
    sky.sunAlt >= 0
      ? `the Sun ${Math.round(sky.sunAlt)}° up in the ${compass(sky.sunAz)}`
      : `the Sun ${Math.round(-sky.sunAlt)}° below the horizon`
  // (a wide world half over the horizon is on it, not below it)
  const halfWidth = (surface.other?.width ?? 0) / 2
  const onHorizon = otherUp && sky.otherAlt > -halfWidth - 0.3 && sky.otherAlt < halfWidth + 1
  const otherLine = onHorizon
    ? `${otherName!.charAt(0).toUpperCase() + otherName!.slice(1)}, on the horizon in the ${compass(sky.otherAz)}`
    : otherUp
    ? sky.otherAlt > 0
      ? `${otherName!.charAt(0).toUpperCase() + otherName!.slice(1)}, ${Math.round(sky.otherAlt)}° up in the ${compass(sky.otherAz)}${
          surface.other!.width > 1 ? ` · ${Math.round(surface.other!.width / 0.52)} times as wide as our full Moon` : ''
        }`
      : `${otherName!.charAt(0).toUpperCase() + otherName!.slice(1)} is below the horizon`
    : null
  const weight = Math.round((surface.gravity / 9.81) * 100)
  const weightLine = body === 2 ? 'Your usual weight' : weight < 1 ? `${((surface.gravity / 9.81) * 100).toFixed(2)}% of your weight on Earth` : `${weight}% of your weight on Earth`
  const walking = pilot.walking
  const timeRunning = pilot.timeScale > 1

  const watchDay = () => {
    if (timeRunning) {
      pilot.timeScale = 0
      watching.current = false
    } else {
      pilot.timeScale = Math.round((surface.dayHours * 3600) / DAY_SECONDS)
      watching.current = true
    }
    setTick((t) => t + 1)
  }
  const postcard = () => {
    pilot.photoRequest = {
      caption: [
        title,
        `${surface.name.replace(/^the /, 'The ')} · ${coordinates(pilot.site.lat, pilot.site.lon)} · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      ],
    }
  }
  const takeOff = () => {
    pilot.walking = false
    pilot.touchThrust = true
    window.setTimeout(() => (pilot.touchThrust = false), 400)
  }

  if (walking) {
    // on foot: the keys, and the way back in
    return (
      <aside className="landed-card is-walking" aria-label={`On foot on ${surface.name}`}>
        <p className="landed-eyebrow">On foot · {surface.name}</p>
        <p className="landed-walk-keys">
          {touch ? (
            <>The stick walks · drag to look · Jump · board by the hatch</>
          ) : (
            <>
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> move · click to look round · <kbd>Space</kbd> jump · <kbd>Shift</kbd> run · <kbd>V</kbd> see yourself ·{' '}
              <kbd>E</kbd> board, by the hatch
            </>
          )}
        </p>
        <div className="landed-actions">
          {!pilot.flagPlanted && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => (pilot.flagRequest = true)}>
              Plant a flag
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => (pilot.walking = false)}>
            <Icon name="arrow" className="is-back" />
            Back aboard {!touch && <kbd>Esc</kbd>}
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className={`landed-card ${open ? 'is-open' : ''}`} aria-label={`Landed on ${surface.name}`}>
      <button type="button" className="landed-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="landed-eyebrow">Landed · {surface.name}</span>
        <span className="landed-title">{title}</span>
        <Icon name="arrow" className={open ? 'is-up-straight' : 'is-down'} />
      </button>
      {open && (
        <div className="landed-body">
          <p className="landed-where">
            {coordinates(pilot.site.lat, pilot.site.lon)}
            {siteLine && <span>{siteLine}</span>}
          </p>
          <dl className="landed-facts">
            <div>
              <dt>Local time</dt>
              <dd>
                {clock}, {part}
                <small>{sunLine}</small>
              </dd>
            </div>
            {otherLine && (
              <div>
                <dt>In the sky</dt>
                <dd>{otherLine}</dd>
              </div>
            )}
            <div>
              <dt>You weigh</dt>
              <dd>{weightLine}</dd>
            </div>
            <div>
              <dt>Temperature</dt>
              <dd>{surface.temperature}</dd>
            </div>
            <div>
              <dt>Air</dt>
              <dd>{surface.air}</dd>
            </div>
            <div>
              <dt>A day</dt>
              <dd>
                {formatDay(surface.dayHours)}
                <small>{surface.sky}</small>
              </dd>
            </div>
          </dl>
          <p className="landed-note">{surface.note}</p>
          <div className="landed-actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => (pilot.walkRequest = true)}>
              Step outside
            </button>
            {!pilot.flagPlanted && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => (pilot.flagRequest = true)}>
                Plant a flag
              </button>
            )}
            <button type="button" className="btn btn--ghost btn--sm" aria-pressed={timeRunning} onClick={watchDay}>
              {timeRunning ? 'Stop the clock' : 'Watch a day go by'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={postcard}>
              Postcard
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={takeOff}>
              Take off
            </button>
          </div>
          {landing && (
            <p className="landed-log">
              Landing {landing.count}
              {landing.here === 1 ? ` · your first on ${surface.name}` : ` · your ${ordinal(landing.here)} on ${surface.name}`}
            </p>
          )}
        </div>
      )}
    </aside>
  )
}
