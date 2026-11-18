'use client'

import { useMemo } from 'react'

import { craftFromSunAU, FAR_CRAFT, voyagerFromSunAU } from './WorldLive'
import { getPlanetEclipticAU, julianDate, PLANETS } from '../experience/orbit'

/* Line drawings for the two chapters beyond the planets, in the same quiet
   style as the planets' size and orbit drawings:
   - GalaxyMap: the Milky Way from above (a sketch: four main arms, the bar,
     and the Sun about 26,000 light-years out, in the Orion Spur)
   - DistanceLadder: how far is far, from Earth to the nearest star, on a
     scale where each step is ten times farther than the last */

const TAU = Math.PI * 2

/* a logarithmic spiral arm, from the bar's end out to the disc's edge,
   as an SVG path (a pitch of about 16 degrees: under a turn each, as the
   arms are usually drawn) */
function armPath(cx: number, cy: number, start: number, r0: number, rMax: number) {
  const pitch = Math.tan((16 * Math.PI) / 180)
  const points: string[] = []
  for (let t = 0; t <= TAU * 1.6; t += 0.05) {
    const r = r0 * Math.exp(pitch * t)
    if (r > rMax) break
    const a = start + t
    points.push(`${points.length ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`)
  }
  return points.join('')
}

export function GalaxyMap() {
  const C = 120
  const EDGE = 100 // 50,000 light-years
  const LY = EDGE / 50_000
  const sunR = 26_000 * LY
  // the Sun below the centre, a little to the left
  const sunA = Math.PI * 0.62
  const sun = [C + sunR * Math.cos(sunA), C + sunR * Math.sin(sunA)]
  // two major arms from the ends of the bar (Perseus, Scutum-Centaurus),
  // two fainter ones between them (Sagittarius, Norma)
  const BAR = (-28 * Math.PI) / 180
  const arms = useMemo(
    () =>
      [0, 1, 2, 3].map((i) => ({
        d: armPath(C, C, BAR + (i * TAU) / 4, i % 2 ? 30 : 23, EDGE * 0.96),
        major: i % 2 === 0,
      })),
    [BAR],
  )
  // the Orion Spur: a short arc through the Sun's place
  const spur = useMemo(() => {
    const points: string[] = []
    for (let a = sunA - 0.32; a <= sunA + 0.3; a += 0.04) {
      const r = sunR * (1 + (a - sunA) * 0.2)
      points.push(`${points.length ? 'L' : 'M'}${(C + r * Math.cos(a)).toFixed(1)},${(C + r * Math.sin(a)).toFixed(1)}`)
    }
    return points.join('')
  }, [sunA, sunR])
  const scale = 10_000 * LY

  return (
    <figure className="world-figure sky-figure">
      <svg
        className="galaxy-map"
        viewBox="0 0 240 240"
        role="img"
        aria-label="A sketch of the Milky Way seen from above: a central bar, four main spiral arms, and the Sun about 26,000 light-years from the centre in a minor arm, the Orion Spur."
      >
        <defs>
          <radialGradient id="galaxy-glow">
            <stop offset="0" stopColor="#fff3dc" stopOpacity="0.9" />
            <stop offset="0.25" stopColor="#f2dcb4" stopOpacity="0.35" />
            <stop offset="1" stopColor="#c3b4ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={EDGE} className="sky-disc" />
        {arms.map(({ d, major }, i) => (
          <g key={i} className={major ? 'is-major' : 'is-minor'}>
            <path d={d} className="sky-arm-glow" />
            <path d={d} className="sky-arm" />
          </g>
        ))}
        <path d={spur} className="sky-spur" />
        <circle cx={C} cy={C} r={30} fill="url(#galaxy-glow)" />
        <ellipse cx={C} cy={C} rx={24} ry={7} transform={`rotate(-28 ${C} ${C})`} className="sky-bar" />
        <circle cx={C} cy={C} r={1.6} className="sky-centre" />
        <text x={C + 6} y={C - 9} className="sky-label">Sagittarius A*</text>

        <line x1={C} y1={C} x2={sun[0]} y2={sun[1]} className="sky-measure" />
        <circle cx={sun[0]} cy={sun[1]} r={3} className="world-here" />
        <text x={sun[0] + 6} y={sun[1] + 4} className="sky-label is-here">You are here</text>
        <text x={sun[0] + 6} y={sun[1] + 14} className="sky-label">Orion Spur</text>

        <line x1={C - EDGE} y1={C + EDGE + 12} x2={C - EDGE + scale} y2={C + EDGE + 12} className="sky-scale" />
        <text x={C - EDGE + scale + 5} y={C + EDGE + 15} className="sky-label">10,000 light-years</text>
      </svg>
      <figcaption>Seen from above (a sketch). The Sun is about 26,000 light-years from the centre.</figcaption>
    </figure>
  )
}

export function DistanceLadder() {
  const voyager = useMemo(() => voyagerFromSunAU(new Date()), [])
  const LEFT = 18
  const RIGHT = 342
  const MIN = Math.log10(0.5)
  const MAX = Math.log10(500_000)
  const x = (au: number) => LEFT + ((Math.log10(au) - MIN) / (MAX - MIN)) * (RIGHT - LEFT)
  const AXIS = 58
  // label rows: above the line (near, far) and below it
  const ROW = { up: AXIS - 12, upFar: AXIS - 28, down: AXIS + 20, downFar: AXIS + 34 }
  const marks: { au: number; label: string; row: keyof typeof ROW; strong?: boolean; anchor?: 'start' | 'middle' | 'end' }[] = [
    { au: 1, label: 'Earth', row: 'up', anchor: 'middle' },
    { au: 30, label: 'Neptune', row: 'down', anchor: 'end' },
    { au: 40, label: 'The Pale Blue Dot', row: 'upFar', strong: true, anchor: 'end' },
    { au: 120, label: 'Heliopause', row: 'downFar', anchor: 'middle' },
    { au: voyager, label: 'Voyager 1 today', row: 'up', strong: true, anchor: 'start' },
    { au: 268_000, label: 'Nearest star', row: 'up', anchor: 'end' },
  ]
  const decades = [1, 10, 100, 1_000, 10_000, 100_000]
  const oort = [x(2_000), x(100_000)]

  return (
    <figure className="world-figure sky-figure">
      <svg
        className="distance-ladder"
        viewBox="0 0 360 120"
        role="img"
        aria-label={`Distances from the Sun, each step ten times the last: Earth 1 AU, Neptune 30 AU, where the Pale Blue Dot was taken 40 AU, the heliopause about 120 AU, Voyager 1 today about ${Math.round(voyager)} AU, the Oort Cloud from about 2,000 AU, and the nearest star 268,000 AU.`}
      >
        <rect x={oort[0]} y={AXIS - 4} width={oort[1] - oort[0]} height={8} rx={4} className="sky-oort" />
        <text x={(oort[0] + oort[1]) / 2} y={AXIS + 20} textAnchor="middle" className="sky-label">Oort Cloud</text>
        <line x1={LEFT} y1={AXIS} x2={RIGHT} y2={AXIS} className="sky-axis" />
        {decades.map((au) => (
          <g key={au}>
            <line x1={x(au)} y1={AXIS - 2.5} x2={x(au)} y2={AXIS + 2.5} className="sky-axis" />
            <text x={x(au)} y={AXIS + 50} textAnchor="middle" className="sky-tick">
              {au.toLocaleString('en-US')}
            </text>
          </g>
        ))}
        <text x={LEFT} y={AXIS + 61} className="sky-tick">AU from the Sun (1 AU: the Sun to Earth)</text>
        {marks.map((mark) => {
          const mx = x(mark.au)
          const y = ROW[mark.row]
          const above = mark.row === 'up' || mark.row === 'upFar'
          return (
            <g key={mark.label}>
              <line x1={mx} y1={AXIS} x2={mx} y2={above ? y + 3 : y - 9} className="sky-leader" />
              <circle cx={mx} cy={AXIS} r={mark.strong ? 2.6 : 1.8} className={mark.strong ? 'world-here' : 'sky-mark'} />
              <text x={mx} y={y} textAnchor={mark.anchor ?? 'middle'} className={mark.strong ? 'sky-label is-here' : 'sky-label'}>
                {mark.label}
              </text>
            </g>
          )
        })}
      </svg>
      <figcaption>How far is far: each step along the line is ten times farther than the last.</figcaption>
    </figure>
  )
}

/* Where our farthest spacecraft are today, seen from above the planets'
   plane. Distance from the Sun on a squeezed (logarithmic) scale, so the
   inner planets and the Voyagers fit in one drawing; directions true. */
export function SpacecraftMap() {
  const drawing = useMemo(() => {
    const now = new Date()
    const jd = julianDate(now)
    const C = 120
    const R = 104
    const MAX = Math.log10(1 + 200 / 0.6)
    const radius = (au: number) => (R * Math.log10(1 + au / 0.6)) / MAX
    const at = (au: number, lonDeg: number) => {
      const a = (lonDeg * Math.PI) / 180
      const r = radius(au)
      // ecliptic longitude counter-clockwise, 0 to the right
      return [C + r * Math.cos(a), C - r * Math.sin(a)] as const
    }
    const planets = [2, 4, 5, 7].map((index) => {
      const [x, y] = getPlanetEclipticAU(index, jd)
      const au = Math.hypot(x, y)
      const lon = (Math.atan2(y, x) * 180) / Math.PI
      return { name: PLANETS[index].name, ring: radius(PLANETS[index].distanceAU), at: at(au, lon) }
    })
    const craft = FAR_CRAFT.map((entry) => {
      const au = craftFromSunAU(entry, now)
      return { name: entry.name, au, at: at(au, entry.lon) }
    })
    return { C, planets, craft, heliopause: radius(120), kuiper: [radius(30), radius(50)] as const }
  }, [])
  const { C } = drawing

  return (
    <figure className="world-figure sky-figure">
      <svg
        className="craft-map"
        viewBox="0 0 240 240"
        role="img"
        aria-label={`Seen from above, where the farthest spacecraft are today: ${drawing.craft
          .map((c) => `${c.name} about ${Math.round(c.au)} AU from the Sun`)
          .join(', ')}.`}
      >
        <circle cx={C} cy={C} r={(drawing.kuiper[0] + drawing.kuiper[1]) / 2} className="craft-kuiper" strokeWidth={drawing.kuiper[1] - drawing.kuiper[0]} />
        <circle cx={C} cy={C} r={drawing.heliopause} className="craft-heliopause" />
        <text x={C} y={C - drawing.heliopause - 4} textAnchor="middle" className="sky-tick">Heliopause</text>
        {drawing.planets.map((planet) => (
          <g key={planet.name}>
            <circle cx={C} cy={C} r={planet.ring} className="world-orbit" />
            <circle cx={planet.at[0]} cy={planet.at[1]} r={1.6} className="sky-mark" />
          </g>
        ))}
        <circle cx={C} cy={C} r={2.6} className="world-sun" />
        {drawing.craft.map((craft) => {
          // Voyager 2 and New Horizons head the same way: their names go
          // on opposite sides
          const left = craft.name === 'New Horizons' ? true : craft.name === 'Voyager 2' ? false : craft.at[0] < C
          const x = craft.at[0] + (left ? -6 : 6)
          return (
            <g key={craft.name}>
              <line x1={C} y1={C} x2={craft.at[0]} y2={craft.at[1]} className="sky-measure" />
              <circle cx={craft.at[0]} cy={craft.at[1]} r={2.6} className="world-here" />
              <text x={x} y={craft.at[1] - 1} textAnchor={left ? 'end' : 'start'} className="sky-label is-here">
                {craft.name}
              </text>
              <text x={x} y={craft.at[1] + 7} textAnchor={left ? 'end' : 'start'} className="sky-tick">
                {Math.round(craft.au)} AU
              </text>
            </g>
          )
        })}
        <text x={C + drawing.planets[3].ring + 3} y={C + 3} className="sky-tick">Neptune</text>
      </svg>
      <figcaption>
        Where our farthest spacecraft are today, seen from above. Distances are squeezed so all fit; directions are true. Neptune is 30 AU out.
      </figcaption>
    </figure>
  )
}
