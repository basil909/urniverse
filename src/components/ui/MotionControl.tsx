'use client'

import { useEffect, useState } from 'react'

import {
  REAL_SPEEDS,
  resetToNow,
  setRealMotion,
  simClock,
} from '../experience/simClock'

/* Top right: the "Real motion" switch, and the simulated date.
   Off (the default), the scene moves calmly. On, one clock drives
   everything at the chosen speed, from this very moment: the planets'
   orbits, Earth's turning day side, the Moon's phase, the moons. */

function formatDate(jd: number, withTime: boolean) {
  const date = new Date((jd - 2440587.5) * 86400000)
  const day = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  if (!withTime) return day
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
  return `${day}, ${time} UTC`
}

export default function MotionControl({ showDate }: { showDate: boolean }) {
  const [real, setReal] = useState(simClock.real)
  const [speed, setSpeed] = useState(() =>
    Math.max(0, REAL_SPEEDS.findIndex((option) => option.days === simClock.realRate)),
  )
  const [label, setLabel] = useState(() => formatDate(simClock.jd, simClock.real))

  useEffect(() => {
    const update = () => setLabel(formatDate(simClock.jd, simClock.real))
    update()
    const timer = window.setInterval(update, real ? 200 : 500)
    return () => window.clearInterval(timer)
  }, [real])

  const toggle = () => {
    const next = !real
    setRealMotion(next)
    setReal(next)
  }

  const choose = (index: number) => {
    setSpeed(index)
    simClock.realRate = REAL_SPEEDS[index].days
  }

  return (
    <div className="motion-control">
      <button
        type="button"
        className="motion-toggle"
        aria-pressed={real}
        onClick={toggle}
        title="Run everything on one clock: orbits, Earth's day and night, the Moon's phases and the moons"
      >
        <span className="motion-light" aria-hidden="true" />
        Real motion
      </button>

      {real && (
        <div className="motion-speeds" role="group" aria-label="Speed of time">
          {REAL_SPEEDS.map((option, index) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={speed === index}
              onClick={() => choose(index)}
            >
              {option.label}
            </button>
          ))}
          <button type="button" className="motion-now" onClick={resetToNow}>
            Now
          </button>
        </div>
      )}

      {(real || showDate) && (
        <div className="sim-date" aria-live="off">
          <span className="sim-date-label">{real ? 'Live clock' : 'Simulated'}</span> {label}
        </div>
      )}
    </div>
  )
}
