'use client'

import { useMemo } from 'react'

import {
  getPlanetEclipticAU,
  getPlanetOrbitPathAU,
  julianDate,
  PLANETS,
} from '../experience/orbit'

/* Two small line drawings for the detail panel:
   - size: the world's silhouette beside Earth's (Earth beside the Moon),
     to scale
   - orbit: the Solar System from above, out to this world, with where it
     and Earth are today. Distances use a square-root scale so the inner
     planets stay visible beside the outer ones. */

const SUN_RADIUS_KM = 695700
const MOON_RADIUS_KM = 1737.4
const EARTH_INDEX = 2

function SizeDrawing({ index, name }: { index: number; name: string }) {
  const self = index < 0 ? SUN_RADIUS_KM : PLANETS[index].radiusKm
  const other = index === EARTH_INDEX ? MOON_RADIUS_KM : PLANETS[EARTH_INDEX].radiusKm
  const otherName = index === EARTH_INDEX ? 'Moon' : 'Earth'
  const big = Math.max(self, other)
  const scale = 46 / big
  const r1 = Math.max(self * scale, 0.9)
  const r2 = Math.max(other * scale, 0.9)
  const ratio = self / other
  const caption =
    ratio >= 1
      ? `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)} × wider than ${otherName === 'Moon' ? 'the Moon' : 'Earth'}`
      : `${(ratio * 100).toFixed(0)}% of Earth's width`
  const cx1 = 20 + r1
  const cx2 = cx1 + r1 + 22 + r2

  return (
    <figure className="world-figure">
      <svg viewBox={`0 0 ${Math.max(cx2 + r2 + 20, 200)} 112`} role="img" aria-label={`${name} and ${otherName} to scale: ${caption}`}>
        <circle cx={cx1} cy={56} r={r1} className="world-figure-self" />
        <circle cx={cx2} cy={56} r={r2} className="world-figure-other" />
        <text x={cx1} y={108} textAnchor="middle">{name}</text>
        <text x={cx2} y={108} textAnchor="middle">{otherName}</text>
      </svg>
      <figcaption>To scale: {caption}</figcaption>
    </figure>
  )
}

function OrbitDrawing({ index, name }: { index: number; name: string }) {
  const drawing = useMemo(() => {
    const jd = julianDate(new Date())
    const outer = Math.max(index, EARTH_INDEX)
    const maxAU = PLANETS[outer].distanceAU * 1.08
    const R = 92
    const map = ([x, y]: [number, number]) => {
      const r = Math.hypot(x, y)
      const k = r > 0 ? (R * Math.sqrt(r / maxAU)) / r : 0
      // north up: ecliptic y drawn upwards
      return [100 + x * k, 100 - y * k] as const
    }
    const orbits = Array.from({ length: outer + 1 }, (_, i) => {
      const d = getPlanetOrbitPathAU(i, jd)
        .map((p, n) => `${n === 0 ? 'M' : 'L'}${map(p)[0].toFixed(1)},${map(p)[1].toFixed(1)}`)
        .join('')
      return { i, d }
    })
    const here = map(getPlanetEclipticAU(index, jd))
    const earth = map(getPlanetEclipticAU(EARTH_INDEX, jd))
    return { orbits, here, earth }
  }, [index])

  const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <figure className="world-figure">
      <svg viewBox="0 0 200 200" role="img" aria-label={`Where ${name} is on its orbit today, seen from above the Solar System`}>
        {drawing.orbits.map(({ i, d }) => (
          <path key={i} d={d} className={i === index ? 'world-orbit is-self' : 'world-orbit'} />
        ))}
        <circle cx={100} cy={100} r={3.2} className="world-sun" />
        {index !== EARTH_INDEX && (
          <>
            <circle cx={drawing.earth[0]} cy={drawing.earth[1]} r={2.2} className="world-earth" />
            <text x={drawing.earth[0] + 5} y={drawing.earth[1] + 3}>Earth</text>
          </>
        )}
        <circle cx={drawing.here[0]} cy={drawing.here[1]} r={3.4} className="world-here" />
        <text x={drawing.here[0] + 6} y={drawing.here[1] + 3} className="world-here-label">{name}</text>
      </svg>
      <figcaption>Seen from above the Solar System, {today}</figcaption>
    </figure>
  )
}

export default function WorldGraphics({ index, name }: { index: number; name: string }) {
  return (
    <div className="world-graphics">
      <SizeDrawing index={index} name={name} />
      {index >= 0 && <OrbitDrawing index={index} name={name} />}
    </div>
  )
}
