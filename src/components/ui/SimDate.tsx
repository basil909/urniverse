'use client'

import { useEffect, useState } from 'react'

import { simClock } from '../experience/simClock'

/* The simulated date, quietly, in the corner: the planets, the Moon's
   phase and Earth's day side are all shown for this moment. */

function format(jd: number) {
  const date = new Date((jd - 2440587.5) * 86400000)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default function SimDate() {
  const [label, setLabel] = useState(() => format(simClock.jd))

  useEffect(() => {
    const timer = window.setInterval(() => setLabel(format(simClock.jd)), 500)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="sim-date" title="The planets, the Moon's phase and Earth's day side are shown for this date">
      <span className="sim-date-label">Simulated</span> {label}
    </div>
  )
}
