'use client'

import { useEffect, useState } from 'react'

/* One live figure on the opening screen: how far Earth has carried you
   round the Sun since the page opened (29.78 km/s, its mean orbital
   speed). Ticks ten times a second. */

const EARTH_KM_S = 29.78

export default function LiveCounter() {
  const [km, setKm] = useState(0)
  useEffect(() => {
    const start = performance.now()
    const timer = window.setInterval(() => setKm(((performance.now() - start) / 1000) * EARTH_KM_S), 100)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <p className="live-counter">
      <span className="live-counter-dot" aria-hidden="true" />
      <span>
        Since you arrived, Earth has carried you{' '}
        <strong>{Math.round(km).toLocaleString('en-GB')} km</strong> around the Sun.
      </span>
    </p>
  )
}
