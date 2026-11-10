'use client'

import { useProgress } from '@react-three/drei'
import { useEffect, useState } from 'react'

/* Full-screen loader that tracks every texture three.js loads.
   It finishes when nothing is loading, with a safety timeout so a slow
   or failed file can never trap the visitor on this screen. */

const RING = 2 * Math.PI * 46 // circumference of the r=46 progress ring
const MAX_WAIT_MS = 12000
const EMPTY_GRACE_MS = 1500 // nothing queued after this long = nothing to load

export default function Loader() {
  const { active, loaded, total } = useProgress()
  const [done, setDone] = useState(false)
  const [gone, setGone] = useState(false)
  const [startedAt] = useState(() => Date.now())

  const percent = total > 0 ? Math.round((loaded / total) * 100) : 0

  useEffect(() => {
    if (done) return

    const finishedLoading = !active && total > 0 && loaded >= total
    const nothingToLoad =
      !active && total === 0 && Date.now() - startedAt > EMPTY_GRACE_MS

    // small hold so the first frames can render behind the loader
    const finish = finishedLoading || nothingToLoad
    const timer = window.setTimeout(
      () => setDone(true),
      finish ? 350 : Math.max(0, MAX_WAIT_MS - (Date.now() - startedAt)),
    )
    // re-check the "nothing queued" case after the grace period
    const recheck =
      total === 0 && !finish
        ? window.setTimeout(() => setDone((d) => d || !active), EMPTY_GRACE_MS)
        : 0

    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(recheck)
    }
  }, [active, loaded, total, done, startedAt])

  useEffect(() => {
    if (!done) return
    const timer = window.setTimeout(() => setGone(true), 900)
    return () => window.clearTimeout(timer)
  }, [done])

  if (gone) return null

  return (
    <div
      className={`loader ${done ? 'loader-done' : ''}`}
      role="progressbar"
      aria-label="Loading the Solar System"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={done ? 100 : percent}
    >
      <div className="loader-inner">
        <svg className="loader-ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="loader-track" cx="50" cy="50" r="46" />
          <circle
            className="loader-arc"
            cx="50"
            cy="50"
            r="46"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - (done ? 1 : percent / 100))}
          />
          <circle className="loader-sun" cx="50" cy="50" r="7" />
          <g className="loader-orbit">
            <circle cx="50" cy="22" r="2.6" />
          </g>
        </svg>
        <div className="loader-percent">{done ? 100 : percent}%</div>
        <div className="loader-label">Charting the Solar System</div>
      </div>
    </div>
  )
}
