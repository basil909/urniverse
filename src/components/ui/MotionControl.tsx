'use client'

import { useEffect, useState } from 'react'

import {
  REAL_SPEEDS,
  resetToNow,
  setRealMotion,
  simClock,
} from '../experience/simClock'

/* The clock button: "Real motion". Off (the default), the scene moves
   calmly. On, one clock drives everything at the chosen speed, from this
   very moment (orbits, Earth's day and night, the Moon's phase, the
   moons); its speeds and the live date open beneath it. */

function formatDate(jd: number) {
  const date = new Date((jd - 2440587.5) * 86400000)
  const day = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
  return `${day}, ${time} UTC`
}

export default function MotionControl() {
  const [real, setReal] = useState(simClock.real)
  const [speed, setSpeed] = useState(() =>
    Math.max(0, REAL_SPEEDS.findIndex((option) => option.days === simClock.realRate)),
  )
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (!real) return
    const update = () => setLabel(formatDate(simClock.jd))
    update()
    const timer = window.setInterval(update, 200)
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
        className="tool-button"
        aria-pressed={real}
        aria-label={real ? 'Real motion on: turn off' : 'Real motion: run everything on one true clock'}
        title="Real motion: orbits, Earth's day and night, the Moon's phases and the moons on one true clock"
        onClick={toggle}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.5V8l2.4 1.6" />
        </svg>
      </button>

      {real && (
        <div className="motion-panel">
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
          <div className="sim-date">{label}</div>
        </div>
      )}
    </div>
  )
}
