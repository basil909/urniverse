'use client'

import { useEffect, useState } from 'react'

import { PLANETS } from '../experience/orbit'

/* Compare: this planet beside any other. Both drawn to scale, then the
   figures side by side (the larger of each pair picked out), and a line
   on how they differ. The values are the panel's own (NASA fact sheets):
   gravity at the surface (the giants: where the pressure is 1 bar), mean
   temperature (the giants: at the cloud tops), moons known as of 2025. */

type Figures = { gravity: number; temperature: number; moons: number; color: string }

const FIGURES: Figures[] = [
  { gravity: 3.7, temperature: 167, moons: 0, color: '#b8afa2' },
  { gravity: 8.9, temperature: 464, moons: 0, color: '#e2b86e' },
  { gravity: 9.8, temperature: 15, moons: 1, color: '#6fa8ff' },
  { gravity: 3.7, temperature: -65, moons: 2, color: '#e07650' },
  { gravity: 24.8, temperature: -110, moons: 95, color: '#d9b48a' },
  { gravity: 10.4, temperature: -140, moons: 274, color: '#e3c98e' },
  { gravity: 8.9, temperature: -195, moons: 29, color: '#86d4e0' },
  { gravity: 11.0, temperature: -200, moons: 16, color: '#6f8fe8' },
]

// diameters as the panel gives them (to 10 km above 100,000)
const km = (diameter: number) => `${fmt(diameter >= 100000 ? Math.round(diameter / 10) * 10 : Math.round(diameter))} km`
const fmt = (value: number, digits = 0) => value.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits })

function spin(hours: number) {
  const h = Math.abs(hours)
  const text = h >= 48 ? `${fmt(h / 24, 1)} days` : `${fmt(h, 1)} hours`
  return hours < 0 ? `${text}, backwards` : text
}
function year(days: number) {
  return days >= 730 ? `${fmt(days / 365.25, 1)} years` : `${fmt(days)} days`
}

type Row = { label: string; a: string; b: string; bigger: 0 | 1 | -1 }

function rows(a: number, b: number): Row[] {
  const pa = PLANETS[a]
  const pb = PLANETS[b]
  const fa = FIGURES[a]
  const fb = FIGURES[b]
  const more = (x: number, y: number): 0 | 1 | -1 => (x === y ? -1 : x > y ? 0 : 1)
  return [
    { label: 'Diameter', a: km(pa.radiusKm * 2), b: km(pb.radiusKm * 2), bigger: more(pa.radiusKm, pb.radiusKm) },
    { label: 'Gravity', a: `${fmt(fa.gravity, 1)} m/s²`, b: `${fmt(fb.gravity, 1)} m/s²`, bigger: more(fa.gravity, fb.gravity) },
    { label: 'Mean temperature', a: `${fmt(fa.temperature)} °C`, b: `${fmt(fb.temperature)} °C`, bigger: more(fa.temperature, fb.temperature) },
    {
      label: 'Spins once in',
      a: spin(pa.rotationPeriodHours),
      b: spin(pb.rotationPeriodHours),
      bigger: more(Math.abs(pa.rotationPeriodHours), Math.abs(pb.rotationPeriodHours)),
    },
    { label: 'Year', a: year(pa.orbitalPeriodDays), b: year(pb.orbitalPeriodDays), bigger: more(pa.orbitalPeriodDays, pb.orbitalPeriodDays) },
    { label: 'From the Sun', a: `${fmt(pa.distanceAU, 2)} AU`, b: `${fmt(pb.distanceAU, 2)} AU`, bigger: more(pa.distanceAU, pb.distanceAU) },
    { label: 'Moons', a: fmt(fa.moons), b: fmt(fb.moons), bigger: more(fa.moons, fb.moons) },
  ]
}

function summary(a: number, b: number) {
  const ra = PLANETS[a].radiusKm
  const rb = PLANETS[b].radiusKm
  const big = ra >= rb ? a : b
  const small = big === a ? b : a
  const ratio = Math.max(ra, rb) / Math.min(ra, rb)
  const volume = ratio ** 3
  const g = FIGURES[a].gravity / FIGURES[b].gravity
  const across =
    ratio < 1.05
      ? `${PLANETS[a].name} and ${PLANETS[b].name} are almost the same size`
      : `${PLANETS[big].name} is ${fmt(ratio, ratio < 10 ? 1 : 0)} times as wide as ${PLANETS[small].name}${
          volume >= 3
            ? `: about ${fmt(volume, volume < 10 ? 1 : 0)} ${
                // (Mars, Venus, Uranus: no plural that reads well)
                PLANETS[small].name.endsWith('s') ? `worlds the size of ${PLANETS[small].name}` : `${PLANETS[small].name}s`
              } would fit inside`
            : ''
        }`
  const weigh =
    Math.abs(g - 1) < 0.05
      ? `you would weigh about the same on both`
      : g > 1
        ? `you would weigh ${fmt(g, g < 10 ? 1 : 0)} times as much on ${PLANETS[a].name}`
        : `on ${PLANETS[a].name} you would weigh ${Math.round(g * 100)}% of what you weigh on ${PLANETS[b].name}`
  return `${across}, and ${weigh}.`
}

export default function Compare({ index }: { index: number }) {
  const [other, setOther] = useState(index === 2 ? 4 : 2)
  useEffect(() => setOther(index === 2 ? 4 : 2), [index])

  const a = PLANETS[index]
  const b = PLANETS[other]
  const big = Math.max(a.radiusKm, b.radiusKm)
  // the drawing: both discs to scale, the larger 64 units across
  const ra = Math.max((a.radiusKm / big) * 64, 1)
  const rb = Math.max((b.radiusKm / big) * 64, 1)
  const width = ra * 2 + rb * 2 + 70

  return (
    <div className="compare">
      <div className="compare-pick" role="group" aria-label={`Compare ${a.name} with`}>
        <span className="compare-pick-label">Compare with</span>
        <div className="compare-chips">
          {PLANETS.map((planet, i) =>
            i === index ? null : (
              <button
                key={planet.name}
                type="button"
                className="compare-chip"
                aria-pressed={other === i}
                onClick={() => setOther(i)}
              >
                <span className="compare-chip-dot" style={{ background: FIGURES[i].color }} />
                {planet.name}
              </button>
            ),
          )}
        </div>
      </div>

      <figure className="world-figure compare-figure">
        <svg viewBox={`0 0 ${width} 160`} role="img" aria-label={`${a.name} and ${b.name} to scale`}>
          <circle cx={20 + ra} cy={76} r={ra} className="compare-disc" style={{ ['--disc' as string]: FIGURES[index].color }} />
          <circle cx={50 + ra * 2 + rb} cy={76} r={rb} className="compare-disc" style={{ ['--disc' as string]: FIGURES[other].color }} />
          <text x={20 + ra} y={156} textAnchor="middle">{a.name}</text>
          <text x={50 + ra * 2 + rb} y={156} textAnchor="middle">{b.name}</text>
        </svg>
        <figcaption>{summary(index, other)}</figcaption>
      </figure>

      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">Figure</span></th>
            <th scope="col">{a.name}</th>
            <th scope="col">{b.name}</th>
          </tr>
        </thead>
        <tbody>
          {rows(index, other).map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td className={row.bigger === 0 ? 'is-more' : ''}>{row.a}</td>
              <td className={row.bigger === 1 ? 'is-more' : ''}>{row.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
