'use client'

import { useEffect, useRef, useState } from 'react'

/* A figure that counts up to its value when it appears ("6,779" runs up
   from 0, keeping its commas and decimals; "~465°C" keeps its "~" and
   "°C"). Values with more than one number in them ("8m 20s") are shown
   as they are, and so is everything when the OS asks for reduced motion. */

const NUMBER = /^([^\d]*?)(\d[\d,]*(?:\.\d+)?)(.*)$/

function format(value: number, decimals: number, grouped: boolean) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: grouped,
  })
}

export default function CountUp({
  value,
  delay = 0,
  duration = 1.1,
}: {
  value: string
  delay?: number
  duration?: number
}) {
  const match = value.match(NUMBER)
  const countable = !!match && !/\d/.test(match[3])
  const [shown, setShown] = useState(() => {
    if (!countable || !match) return value
    const decimals = (match[2].split('.')[1] ?? '').length
    return `${match[1]}${format(0, decimals, match[2].includes(','))}${match[3]}`
  })
  const frame = useRef(0)

  useEffect(() => {
    if (!countable || !match) {
      setShown(value)
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setShown(value)
      return
    }
    const [, before, digits, after] = match
    const target = parseFloat(digits.replace(/,/g, ''))
    const decimals = (digits.split('.')[1] ?? '').length
    const grouped = digits.includes(',')
    const start = performance.now() + delay * 1000
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / (duration * 1000)))
      const eased = 1 - Math.pow(2, -10 * t) // fast, then settling
      const current = t >= 1 ? target : target * eased
      setShown(`${before}${format(current, decimals, grouped)}${after}`)
      if (t < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay, duration])

  return <>{shown}</>
}
