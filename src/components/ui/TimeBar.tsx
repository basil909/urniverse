'use client'

import { useEffect, useState } from 'react'

import { REAL_SPEEDS, resetToNow, setRealMotion, simClock } from '../experience/simClock'
import { julianDate } from '../experience/orbit'

/* The time bar, along the foot of the journey (a wide screen; on a phone
   the clock button in the top bar does the same). It says what time the
   scene is showing and how fast it runs:
   - Cinematic (the default): the planets drift gently, faster in the wide
     views, so the orbits can be seen moving
   - Live: everything on the real clock, as it is right now
   - faster: an hour, a day or a week a second
   "Now" brings the scene back to this moment. */

const LIVE = 0 // index of real time in REAL_SPEEDS

function formatDate(jd: number) {
  const date = new Date((jd - 2440587.5) * 86400000)
  return {
    day: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
    time: date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
  }
}

export default function TimeBar() {
  const [real, setReal] = useState(simClock.real)
  const [speed, setSpeed] = useState(() => REAL_SPEEDS.findIndex((option) => option.days === simClock.realRate))
  // (set on the client only: a date rendered on the server never matches)
  const [shown, setShown] = useState<{ day: string; time: string } | null>(null)
  const [offToday, setOffToday] = useState(false)

  useEffect(() => {
    const update = () => {
      setShown(formatDate(simClock.jd))
      setReal(simClock.real)
      setSpeed(REAL_SPEEDS.findIndex((option) => option.days === simClock.realRate))
      // more than a day away from now: offer the way back
      setOffToday(Math.abs(simClock.jd - julianDate(new Date())) > 1)
    }
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [])

  const choose = (index: number) => {
    simClock.realRate = REAL_SPEEDS[index].days
    if (!simClock.real) setRealMotion(true)
    setReal(true)
    setSpeed(index)
  }
  const cinematic = () => {
    setRealMotion(false)
    setReal(false)
  }

  const live = real && speed === LIVE

  return (
    <div className="time-bar" role="group" aria-label="Time in the scene">
      <div className={`time-bar-now ${live ? 'is-live' : ''}`}>
        <span className="time-bar-dot" aria-hidden="true" />
        <span className="time-bar-state">{live ? 'Live' : real ? 'Fast' : 'Cinematic'}</span>
        <span className="time-bar-date">
          {shown?.day ?? ' '}
          {shown && <small>{shown.time} UTC</small>}
        </span>
      </div>
      <div className="time-bar-speeds">
        <button type="button" aria-pressed={!real} onClick={cinematic} title="The planets drift gently so their motion shows">
          Cinematic
        </button>
        {REAL_SPEEDS.map((option, index) => (
          <button key={option.label} type="button" aria-pressed={real && speed === index} onClick={() => choose(index)}>
            {option.label}
          </button>
        ))}
      </div>
      {offToday && (
        <button type="button" className="time-bar-reset" onClick={resetToNow}>
          Back to now
        </button>
      )}
    </div>
  )
}
