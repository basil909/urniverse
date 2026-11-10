'use client'



import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react'

import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import Lenis from 'lenis'



import UniverseCanvas from './experience/UniverseCanvas'

import Loader from './ui/Loader'
import DetailPanel from './ui/DetailPanel'
import CountUp from './ui/CountUp'
import SimDate from './ui/SimDate'
import { WORLD_DETAILS } from '../data/worlds'
import { INTERIORS, PLANET_INDEX } from '../data/interiors'
import { cutaway } from './experience/cutawayState'



type Chapter = {

  id: string

  label: string

  title: string

  eyebrow: string

  description: string

  facts: string[]

  stats: { value: string; label: string }[]

  accent: string

}



const JOURNEY: Chapter[] = [

  {

    id: 'sun',

    label: 'SUN',

    eyebrow: '01 · OUR STAR',

    title: 'The star that holds us.',

    description: 'Before we leave home, we meet the object that makes this journey possible. The Sun contains almost all of the Solar System’s mass. Its gravity keeps the planets in orbit, while nuclear fusion in its core supplies the energy that drives Earth’s climate and life.',

    facts: [

      'The Sun is a G-type main-sequence star, about 4.6 billion years old.',

      'Its diameter is about 109 times Earth’s diameter.',

      'Light from the Sun takes about 8 minutes 20 seconds to reach Earth.',

      'The Sun contains about 99.86% of the Solar System’s mass.',

    ],

    stats: [

      { value: '4.6B', label: 'YEARS OLD' },

      { value: '1.39M', label: 'KM DIAMETER' },

      { value: '8m 20s', label: 'LIGHT TO EARTH' },

    ],

    accent: '#ffb45a',

  },

  {

    id: 'mercury',

    label: 'MERCURY',

    eyebrow: '02 · MERCURY',

    title: 'A world of extremes.',

    description: 'Mercury is the smallest planet and the closest to the Sun. With almost no atmosphere to hold heat, its surface swings from about 430 °C by day to −180 °C at night. Its ancient surface is covered with impact craters, preserving a record of the early Solar System.',

    facts: [

      'Mercury is the smallest of the eight planets.',

      'A year on Mercury lasts only 87.97 Earth days.',

      'Its orbital eccentricity is the highest of the eight planets.',

      'Mercury has a large iron-rich core relative to its size.',

    ],

    stats: [

      { value: '4,879', label: 'KM DIAMETER' },

      { value: '88', label: 'EARTH DAYS / YEAR' },

      { value: '0.39 AU', label: 'AVG. SUN DISTANCE' },

    ],

    accent: '#b8afa2',

  },

  {

    id: 'venus',

    label: 'VENUS',

    eyebrow: '03 · VENUS',

    title: 'Earth’s hostile twin.',

    description: 'Venus is similar to Earth in size and composition, yet its surface is profoundly different. A dense carbon-dioxide atmosphere traps heat in a runaway greenhouse effect, making Venus the hottest planet in the Solar System.',

    facts: [

      'Venus has the hottest planetary surface in the Solar System.',

      'Its atmosphere is dominated by carbon dioxide and thick clouds of sulfuric acid.',

      'Venus rotates extremely slowly and in the opposite direction to most planets.',

      'A Venusian day, measured by rotation, lasts longer than its year.',

    ],

    stats: [

      { value: '12,104', label: 'KM DIAMETER' },

      { value: '225', label: 'EARTH DAYS / YEAR' },

      { value: '~465°C', label: 'SURFACE TEMP.' },

    ],

    accent: '#e4b86a',

  },

  {

    id: 'earth',

    label: 'EARTH',

    eyebrow: '04 · EARTH',

    title: 'The only world we know is alive.',

    description: 'Earth is the reference point for everything that follows. Liquid surface water, a protective atmosphere, active geology and a long-lived climate have created the only environment currently known to support life.',

    facts: [

      'Earth formed about 4.54 billion years ago.',

      'About 71% of its surface is covered by oceans.',

      'Earth has one large natural satellite: the Moon.',

      'Its magnetic field helps shield the surface from charged particles from the Sun.',

    ],

    stats: [

      { value: '12,742', label: 'KM DIAMETER' },

      { value: '4.54B', label: 'YEARS OLD' },

      { value: '1 AU', label: 'AVG. SUN DISTANCE' },

    ],

    accent: '#69b7ff',

  },

  {

    id: 'mars',

    label: 'MARS',

    eyebrow: '05 · MARS',

    title: 'A frozen world with a vanished past.',

    description: 'Mars is cold, dry and thinly blanketed by atmosphere today. But its landscape contains evidence that liquid water once flowed across its surface. That history makes Mars one of the most important places to investigate when asking whether life ever existed beyond Earth.',

    facts: [

      'Mars has polar ice caps containing water ice and frozen carbon dioxide.',

      'Its enormous canyon system, Valles Marineris, stretches thousands of kilometres.',

      'Mars has two small moons: Phobos and Deimos.',

      'Olympus Mons is the largest known volcano in the Solar System.',

    ],

    stats: [

      { value: '6,779', label: 'KM DIAMETER' },

      { value: '687', label: 'EARTH DAYS / YEAR' },

      { value: '1.52 AU', label: 'AVG. SUN DISTANCE' },

    ],

    accent: '#d76a4c',

  },

  {

    id: 'jupiter',

    label: 'JUPITER',

    eyebrow: '06 · JUPITER',

    title: 'The giant that shapes the rest.',

    description: 'Jupiter is the giant of the Solar System, with more than twice the mass of all the other planets combined. Its gravity has shaped the orbits of asteroids and comets since the Solar System formed. Deep inside, pressure turns hydrogen into a liquid metal, while its atmosphere is sculpted by enormous storms and fast jet streams.',

    facts: [

      'Jupiter is the largest planet, but it would need about 80 times its mass to shine as a star.',

      'Its Great Red Spot is a long-lived storm larger than Earth.',

      'Jupiter has a powerful magnetic field and an extensive radiation environment.',

      'Its four largest moons — Io, Europa, Ganymede and Callisto — form the famous Galilean satellites.',

    ],

    stats: [

      { value: '139,820', label: 'KM DIAMETER' },

      { value: '11.86', label: 'EARTH YEARS / YEAR' },

      { value: '5.20 AU', label: 'AVG. SUN DISTANCE' },

    ],

    accent: '#d9b88e',

  },

  {

    id: 'saturn',

    label: 'SATURN',

    eyebrow: '07 · SATURN',

    title: 'The world of rings.',

    description: 'Saturn is a gas giant surrounded by the most spectacular ring system in the Solar System. The rings are made primarily of water-ice particles ranging from tiny grains to much larger pieces. Beneath the clouds, Saturn is mostly hydrogen and helium.',

    facts: [

      'Saturn’s rings are divided into many bands and gaps by gravity and orbital resonances.',

      'Saturn is the least dense planet — its average density is lower than water.',

      'Titan, Saturn’s largest moon, has a dense nitrogen atmosphere and lakes of liquid hydrocarbons.',

      'Enceladus ejects plumes of water-rich material from an underground ocean system.',

    ],

    stats: [

      { value: '116,460', label: 'KM DIAMETER' },

      { value: '29.45', label: 'EARTH YEARS / YEAR' },

      { value: '9.54 AU', label: 'AVG. SUN DISTANCE' },

    ],

    accent: '#d7c08b',

  },

  {

    id: 'uranus',

    label: 'URANUS',

    eyebrow: '08 · URANUS',

    title: 'The planet that rolls sideways.',

    description: 'Uranus is an ice giant with an unusual orientation. Its rotation axis is tilted by about 98 degrees, so its seasonal cycle is unlike anything experienced on Earth. Methane in its upper atmosphere absorbs red light, giving the planet its blue-green appearance.',

    facts: [

      'Uranus rotates with an axial tilt of about 97.8 degrees.',

      'It has a faint ring system and dozens of known moons.',

      'Methane in the atmosphere contributes to its cyan colour.',

      'A Uranian year lasts about 84 Earth years.',

    ],

    stats: [

      { value: '50,724', label: 'KM DIAMETER' },

      { value: '84', label: 'EARTH YEARS / YEAR' },

      { value: '19.19 AU', label: 'AVG. SUN DISTANCE' },

    ],

    accent: '#83dce5',

  },

  {

    id: 'neptune',

    label: 'NEPTUNE',

    eyebrow: '09 · NEPTUNE',

    title: 'The dark, distant giant.',

    description: 'Neptune is the farthest of the eight planets from the Sun. Despite receiving very little sunlight, its atmosphere is extraordinarily active, with the fastest winds measured on any planet. In true colour it is a pale blue, only a little bluer than Uranus: the deep blue of famous Voyager images came from enhanced contrast.',

    facts: [

      'Neptune completes one orbit in about 165 Earth years.',

      'It has the fastest planetary winds measured in the Solar System.',

      'Triton, Neptune’s largest moon, probably originated in the Kuiper Belt.',

      'Neptune radiates more than twice as much energy as it receives from the Sun.',

    ],

    stats: [

      { value: '49,244', label: 'KM DIAMETER' },

      { value: '164.8', label: 'EARTH YEARS / YEAR' },

      { value: '30.07 AU', label: 'AVG. SUN DISTANCE' },

    ],

    accent: '#79aee0',

  },

  {

    id: 'beyond',
    label: 'PALE BLUE DOT',
    eyebrow: '10 · A PALE BLUE DOT',
    title: "That's here. That's home.",
    description: 'In 1990, from beyond Neptune, Voyager 1 turned its camera back towards home. Earth was a single speck caught in a beam of sunlight. Carl Sagan called it a pale blue dot: everyone you have ever known, and everyone who ever was, lived out their lives there.',
    facts: [
      'Voyager 1 took the photo on 14 February 1990, about 6 billion km from the Sun.',
      'In the image, Earth fills just 0.12 of a pixel.',
      'The bands of light across the photo are sunlight scattered inside the camera.',
      'In 2012 Voyager 1 became the first spacecraft to reach interstellar space.',
    ],
    stats: [
      { value: '6 bn km', label: 'FROM THE SUN' },
      { value: '0.12', label: 'OF A PIXEL' },
      { value: '1990', label: 'VOYAGER 1' },
    ],
    accent: '#9cc4ff',
  },
  {
    id: 'galaxy',
    label: 'MILKY WAY',
    eyebrow: '11 · THE MILKY WAY',
    title: 'Zoom out. Way out.',
    description: 'Everything you have just travelled through, the Sun and all eight planets, is a single point inside the Milky Way: a barred spiral galaxy of a few hundred billion stars. The Sun sits in a minor spiral arm, about 26,000 light-years from the galactic centre.',
    facts: [
      'The Milky Way is roughly 100,000 light-years across.',
      'It contains an estimated 100 to 400 billion stars.',
      'The Sun takes about 230 million years to orbit the galactic centre once.',
      'A supermassive black hole, Sagittarius A*, sits at the centre.',
    ],
    stats: [
      { value: '100,000', label: 'LIGHT-YEARS ACROSS' },
      { value: '26,000', label: 'LY TO THE CENTRE' },
      { value: '230M', label: 'YEARS PER ORBIT' },
    ],
    accent: '#c3b4ff',
  },
]



/* ============================================================

   ANIMATION VARIANTS (Extracted to prevent re-renders)

============================================================ */

/* Scale model: shrink the Sun to a 2 m door and everything else with it.
   Sun diameter 1,392,700 km; 1 AU = 149,597,871 km. */
const SUN_DIAMETER_KM = 1_392_700
const AU_KM = 149_597_871
const MODEL_SUN_M = 2

const SCALE_MODEL: Record<string, { km: number; au: number; like: string }> = {
  mercury: { km: 4_879, au: 0.387, like: 'a peppercorn' },
  venus: { km: 12_104, au: 0.723, like: 'a grape' },
  earth: { km: 12_742, au: 1.0, like: 'a marble' },
  mars: { km: 6_779, au: 1.524, like: 'a pea' },
  jupiter: { km: 139_820, au: 5.203, like: 'a football' },
  saturn: { km: 116_460, au: 9.537, like: 'a melon' },
  uranus: { km: 50_724, au: 19.19, like: 'a tennis ball' },
  neptune: { km: 49_244, au: 30.07, like: 'a tennis ball' },
}

const toModelMetres = (km: number) => (km / SUN_DIAMETER_KM) * MODEL_SUN_M

const formatSize = (metres: number) =>
  metres < 0.01
    ? `${(metres * 1000).toFixed(1).replace(/\.0$/, '')} mm`
    : `${(metres * 100).toFixed(1).replace(/\.0$/, '')} cm`

const formatDistance = (metres: number) =>
  metres < 1000
    ? `${Math.round(metres)} m`
    : `${(metres / 1000).toFixed(1).replace(/\.0$/, '')} km`

const titleCase = (label: string) =>
  label
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

function scaleSentence(id: string, name: string) {
  const model = SCALE_MODEL[id]
  if (!model) return null
  return {
    size: formatSize(toModelMetres(model.km)),
    distance: formatDistance(toModelMetres(model.au * AU_KM)),
    like: model.like,
    name,
  }
}

/* Colour grade per section: warm and golden near the Sun, neutral at
   Earth, cooling to deep blue in the outer system and beyond. Applied as a
   faint soft-light wash over the whole scene. */
const GRADE_BY_SECTION = [
  '#c9a77a', // intro
  '#ffb055', // Sun
  '#ffa860', // Mercury
  '#ffbf72', // Venus
  '#9fb7d6', // Earth
  '#e2a582', // Mars
  '#d8b48a', // Jupiter
  '#cdb894', // Saturn
  '#86c3e0', // Uranus
  '#6f8fe8', // Neptune
  '#6a7fd8', // beyond
  '#8b80ec', // Milky Way
  '#a7a7c8', // return
]

/* Scroll model: intro (0), 10 chapters (1-10), return (11).
   Text for a section is shown only inside its window, so it never appears
   while the camera is still flying between planets. */
const TOTAL_SECTIONS = JOURNEY.length + 2
const TAIL = 0.6 // extra scroll after the return section so it can settle
const MAX_PROGRESS = TOTAL_SECTIONS - 1 + TAIL
const TEXT_IN = 0.16 // camera has arrived
const TEXT_OUT = 0.93 // start leaving before the next flight

/* Scroll feel.
   Raw scroll (one screen per section) is remapped before it drives the
   story: the first FLIGHT_SPAN of each section carries the camera flight,
   which in story-progress terms is CAMERA_BLEND (must match BLEND in
   UniverseCanvas). That stretches each flight over 60% of a screen instead
   of 18%, and the rest of the section is where the chapter sits. */
const FLIGHT_SPAN = 0.6
const CAMERA_BLEND = 0.18

function toStoryProgress(scroll: number) {
  const section = Math.floor(scroll)
  const local = scroll - section
  const storyLocal =
    local < FLIGHT_SPAN
      ? (local / FLIGHT_SPAN) * CAMERA_BLEND
      : CAMERA_BLEND +
        ((local - FLIGHT_SPAN) / (1 - FLIGHT_SPAN)) * (1 - CAMERA_BLEND)
  return section + storyLocal
}

/* Where each section comes to rest (in raw scroll units): the middle of
   the settled part of a chapter, the top for the intro, the end for return */
const REST_LOCAL = 0.8

function restPoint(index: number) {
  if (index <= 0) return 0
  if (index >= TOTAL_SECTIONS - 1) return MAX_PROGRESS
  return index + REST_LOCAL
}

function nearestRest(scroll: number) {
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < TOTAL_SECTIONS; i += 1) {
    const distance = Math.abs(restPoint(i) - scroll)
    if (distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  }
  return best
}

// sine in-out: gets moving visibly on the first frames (feels instant)
// yet still lands softly
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2

const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1]



const introVariants = {

  initial: { opacity: 0, y: 30 },

  animate: { opacity: 1, y: 0 },

}



const chapterTextVariants = {

  initial: { opacity: 0, letterSpacing: '0.35em' },

  animate: { opacity: 1, letterSpacing: '0.18em' },

}



const factCardVariants = {

  initial: { opacity: 0, y: 24 },

  animate: { opacity: 1, y: 0 },

  exit: { opacity: 0, y: -18 },

}



/* ============================================================

   MAIN COMPONENT

============================================================ */



export default function Journey() {
  const [section, setSection] = useState(0)
  const [textOn, setTextOn] = useState(true)
  // filled in on the client so it is always the visitor's own date
  const [today, setToday] = useState('')
  // deep-dive panel for the current world
  const [detailOpen, setDetailOpen] = useState(false)
  const [inside, setInside] = useState(false)
  const detailOpenRef = useRef(false)
  detailOpenRef.current = detailOpen

  const rootRef = useRef<HTMLElement>(null)
  const lenisRef = useRef<Lenis | null>(null)
  const snapToRef = useRef<((index: number) => void) | null>(null)
  const progressRef = useRef(0)

  const frame = useRef<number | null>(null)
  const lastSection = useRef(0)
  const lastTextOn = useRef(true)

  /* Inertial smooth scrolling: scrollY (and so the camera) glides */
  useEffect(() => {
    // Respect "reduce motion": keep native scrolling, no inertia
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    const lenis = new Lenis({
      lerp: 0.075,
      wheelMultiplier: 0.9,
      smoothWheel: true,
      // touch goes through Lenis too, so swipes glide exactly like the
      // wheel and native momentum never fights the glide
      syncTouch: true,
    })
    lenisRef.current = lenis
    let raf = 0
    const tick = (time: number) => {
      lenis.raf(time)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    /* ---- Snap controller -------------------------------------------
       Every wheel, trackpad and touch gesture becomes one eased glide
       to the next resting point, starting on the very first input, so
       there is no free scroll followed by a correction (that stop-start
       is what reads as jank). Lenis's lock blocks the rest of the
       gesture during the glide, and trackpad momentum that arrives just
       after landing is swallowed so one swipe never moves two chapters.
       Tiny jitter below a threshold never starts a flight. */
    const unit = () =>
      Math.max(
        1,
        (document.documentElement.scrollHeight - window.innerHeight) /
          MAX_PROGRESS,
      )

    let snapping = false
    let lastRest = nearestRest(window.scrollY / unit())
    let accumulated = 0
    let accumulateTimer = 0
    let quietUntil = 0
    let quietHardLimit = 0
    let settleTimer = 0

    const snapTo = (index: number) => {
      const target = Math.max(0, Math.min(TOTAL_SECTIONS - 1, index))
      const from = lenis.scroll / unit()
      const to = restPoint(target)
      const distance = Math.abs(to - from)
      window.clearTimeout(settleTimer)
      accumulated = 0

      if (distance < 0.003) {
        lastRest = target
        return
      }

      snapping = true
      lenis.scrollTo(to * unit(), {
        // the pull-back from the Pale Blue Dot to the galaxy takes its time
        duration:
          (target === 11 && lastRest === 10) || (target === 10 && lastRest === 11)
            ? 3.4
            : Math.min(2.6, 0.95 + 0.55 * distance),
        easing: easeInOutSine,
        lock: true,
        force: true,
        onComplete: () => {
          snapping = false
          lastRest = target
          const now = performance.now()
          quietUntil = now + 220
          quietHardLimit = now + 1100
        },
      })
    }
    snapToRef.current = snapTo

    lenis.options.virtualScroll = ({ deltaX, deltaY, event }) => {
      if (snapping) return true // locked: Lenis cancels the event

      // scrolling inside the details panel: let it scroll natively
      const target = event.target as Element | null
      if (target?.closest?.('[data-lenis-prevent]')) return true

      const isTouch = event.type.includes('touch')
      const swallow = () => {
        if (event.cancelable) event.preventDefault()
        return false
      }

      // just landed: trackpad momentum is still arriving
      const now = performance.now()
      if (!isTouch && now < quietUntil && now < quietHardLimit) {
        quietUntil = Math.max(quietUntil, now + 140)
        return swallow()
      }

      if (event.type === 'touchstart' || event.type === 'touchend') {
        accumulated = 0
        return swallow()
      }

      // mostly-sideways gestures are planet spins, not scrolling
      if (Math.abs(deltaX) > Math.abs(deltaY)) return swallow()

      accumulated += deltaY
      window.clearTimeout(accumulateTimer)
      accumulateTimer = window.setTimeout(() => {
        accumulated = 0
      }, 260)

      const threshold = isTouch ? 18 : 6
      if (Math.abs(accumulated) < threshold) return swallow()

      snapTo(lastRest + Math.sign(accumulated))
      return true // now locked: Lenis cancels the event, no drift
    }

    // anything else that moves the page (dragging the scrollbar, browser
    // find, accessibility tools) settles on the nearest resting point
    const onScroll = () => {
      if (snapping) return
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        if (snapping) return
        const where = lenis.scroll / unit()
        const nearest = nearestRest(where)
        if (Math.abs(where - restPoint(nearest)) > 0.003) snapTo(nearest)
        else lastRest = nearest
      }, 220)
    }
    lenis.on('scroll', onScroll)

    return () => {
      lenis.off('scroll', onScroll)
      window.clearTimeout(accumulateTimer)
      window.clearTimeout(settleTimer)
      cancelAnimationFrame(raf)
      snapToRef.current = null
      lenisRef.current = null
      lenis.destroy()
    }
  }, [])

  useEffect(() => {
    const updateScroll = () => {
      frame.current = null

      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight
      const sectionHeight = Math.max(1, scrollable / MAX_PROGRESS)
      const scrollProgress = Math.min(
        MAX_PROGRESS,
        Math.max(0, window.scrollY / sectionHeight),
      )
      const progress = toStoryProgress(scrollProgress)
      progressRef.current = progress

      const timeline = scrollProgress / MAX_PROGRESS
      rootRef.current?.style.setProperty('--timeline', String(timeline))


      const sectionIndex = Math.min(
        TOTAL_SECTIONS - 1,
        Math.floor(progress),
      )
      const local = progress - sectionIndex

      if (sectionIndex !== lastSection.current) {
        lastSection.current = sectionIndex
        setSection(sectionIndex)
      }

      const isIntro = sectionIndex === 0
      const isReturn = sectionIndex === TOTAL_SECTIONS - 1

      const nextTextOn = isIntro
        ? local < 0.85
        : isReturn
          ? local >= TEXT_IN
          : local >= TEXT_IN && local < TEXT_OUT

      if (nextTextOn !== lastTextOn.current) {
        lastTextOn.current = nextTextOn
        setTextOn(nextTextOn)
      }
    }

    const handleScroll = () => {
      if (frame.current !== null) return
      frame.current = window.requestAnimationFrame(updateScroll)
    }

    window.addEventListener('scroll', handleScroll, {
      passive: true,
    })
    window.addEventListener('resize', handleScroll)

    updateScroll()

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)

      if (frame.current !== null) {
        window.cancelAnimationFrame(frame.current)
      }
    }
  }, [])

  const chapterNo = (n: number) => String(n).padStart(2, '0')

  const goToSection = (target: number) => {
    const clamped = Math.max(0, Math.min(TOTAL_SECTIONS - 1, target))
    if (snapToRef.current) {
      snapToRef.current(clamped)
      return
    }
    // reduced motion: no Lenis, plain jump to the resting point
    const scrollable =
      document.documentElement.scrollHeight - window.innerHeight
    const top = (scrollable / MAX_PROGRESS) * restPoint(clamped)
    window.scrollTo({ top, behavior: 'auto' })
  }

  const scrollToStart = () => goToSection(1)

  useEffect(() => {
    setToday(
      new Date().toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    )
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (detailOpenRef.current) return
      const forward = ['ArrowDown', 'ArrowRight', 'PageDown']
      const back = ['ArrowUp', 'ArrowLeft', 'PageUp']
      if (forward.includes(event.key)) {
        event.preventDefault()
        goToSection(Math.min(TOTAL_SECTIONS - 1, section + 1))
      } else if (back.includes(event.key)) {
        event.preventDefault()
        goToSection(Math.max(0, section - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  useEffect(() => {
    setDetailOpen(false)
  }, [section, textOn])

  // the cutaway belongs to the open panel: closing it closes the cutaway
  useEffect(() => {
    if (!detailOpen) setInside(false)
  }, [detailOpen])

  const active =
    section >= 1 && section <= JOURNEY.length
      ? section - 1
      : -1

  const activeChapter =
    active >= 0 ? JOURNEY[active] : null

  useEffect(() => {
    const planet = activeChapter ? PLANET_INDEX[activeChapter.id] : undefined
    cutaway.planet = inside && planet !== undefined ? planet : -1
  }, [inside, activeChapter])

  // planets only (not the Sun): these can be dragged to spin
  const canSpin = textOn && active >= 1 && active <= 8
  const planetName = activeChapter ? titleCase(activeChapter.label) : ''
  const scale = activeChapter ? scaleSentence(activeChapter.id, planetName) : null
  const stageKind =
    section === 0 ? 'intro' : section === TOTAL_SECTIONS - 1 ? 'return' : 'chapter'

  return (
    <MotionConfig reducedMotion="user">
    <main
      ref={rootRef}
      className={`universe-page ${canSpin ? 'can-spin' : ''} ${detailOpen ? 'detail-is-open' : ''}`}
      style={
        {
          '--planet-accent': activeChapter?.accent ?? '#9bb8ff',
        } as CSSProperties
      }
    >
      <div className="universe-canvas">
        <UniverseCanvas progressRef={progressRef} />
      </div>

      <Loader />

      <DetailPanel
        open={detailOpen}
        name={planetName}
        detail={activeChapter ? WORLD_DETAILS[activeChapter.id] ?? null : null}
        onClose={() => setDetailOpen(false)}
        inside={inside}
        worldIndex={
          activeChapter?.id === 'sun'
            ? -1
            : activeChapter
              ? PLANET_INDEX[activeChapter.id]
              : undefined
        }
        layers={
          activeChapter && PLANET_INDEX[activeChapter.id] !== undefined
            ? INTERIORS[PLANET_INDEX[activeChapter.id]]
            : undefined
        }
        onToggleInside={
          activeChapter && PLANET_INDEX[activeChapter.id] !== undefined
            ? () => setInside((value) => !value)
            : undefined
        }
      />

      <div className="universe-vignette" />
      <div className="universe-aura" />
      <div
        className="universe-grade"
        style={{ background: GRADE_BY_SECTION[section] ?? GRADE_BY_SECTION[0] }}
        aria-hidden="true"
      />

      {/* Shows briefly on each planet, then fades away on its own */}
      {canSpin && (
        <div className="spin-hint" key={`hint-${active}`} aria-hidden="true">
          Drag to rotate
        </div>
      )}

      {/* TOP HUD */}
      <header className="hud-top">
        <button
          className="brand"
          onClick={() => goToSection(0)}
          aria-label="Back to start"
        >
          <span className="brand-mark" />
          <span className="brand-name">You Are Here</span>
        </button>

        {/* the simulated moment: time runs on as you travel */}
        {section > 0 && <SimDate />}
      </header>

      {/* LEFT CHAPTER RAIL */}
      <nav className={`rail ${section === 0 ? 'rail-hidden' : ''}`} aria-label="Chapters">
        <div className="rail-track">
          <div
            className="rail-fill"
            style={{ transform: 'scaleY(var(--timeline, 0))' }}
          />
        </div>
        {JOURNEY.map((chapter, index) => (
          <button
            key={chapter.id}
            className={`rail-item ${active === index ? 'is-active' : ''} ${section > index + 1 ? 'is-passed' : ''}`}
            onClick={() => goToSection(index + 1)}
            aria-label={`Go to ${chapter.label}`}
            aria-current={active === index ? 'true' : undefined}
          >
            <span className="rail-dot" />
            <span className="rail-label">{titleCase(chapter.label)}</span>
          </button>
        ))}
      </nav>

      {/* BOTTOM HUD */}
      <footer className="hud-bottom" aria-hidden="true">
        <div className="hud-bar">
          <div
            className="hud-bar-fill"
            style={{ transform: 'scaleX(var(--timeline, 0))' }}
          />
        </div>
      </footer>

      {/* Scroll track: empty spacers that only give the page its length.
          All visible text lives in the pinned stage below. */}
      <div className="story" aria-hidden="true">
        {Array.from({ length: TOTAL_SECTIONS }).map((_, index) => (
          <div className="story-spacer" key={index} />
        ))}
        <div className="story-tail" />
      </div>

      {/* Full text of every chapter for screen readers and search engines.
          The pinned stage below only shows the current chapter visually. */}
      <div className="sr-only">
        <h1>The Solar System: an interactive journey</h1>
        <p>
          One star. Eight planets. A scroll-driven journey from the Sun to the
          edge of the Solar System.
        </p>
        {JOURNEY.map((chapter) => (
          <section key={chapter.id} aria-labelledby={`sr-${chapter.id}`}>
            <h2 id={`sr-${chapter.id}`}>
              {chapter.label}: {chapter.title}
            </h2>
            <p>{chapter.description}</p>
            {(() => {
              const model = scaleSentence(
                chapter.id,
                chapter.label.charAt(0) + chapter.label.slice(1).toLowerCase(),
              )
              return model ? (
                <p>
                  Scale model: if the Sun were a door 2 m tall, {model.name}{' '}
                  would be {model.size} across, about {model.like},{' '}
                  {model.distance} away.
                </p>
              ) : null
            })()}
            <dl>
              {chapter.stats.map((stat) => (
                <div key={stat.label}>
                  <dt>{stat.label}</dt>
                  <dd>{stat.value}</dd>
                </div>
              ))}
            </dl>
            <ul>
              {chapter.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </section>
        ))}
        <section aria-labelledby="sr-return">
          <h2 id="sr-return">Now look back.</h2>
          <p>
            Eight worlds. One tiny corner of a much larger universe. And this is
            only the beginning.
          </p>
        </section>
      </div>

      {/* PINNED STAGE: text stays put and swaps only once the camera has arrived */}
      <div className={`stage stage-${stageKind}`}>
        <AnimatePresence mode="wait">
          {textOn && section === 0 && (
            <motion.div
              key="intro"
              className="intro-content"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
            >
              <div className="eyebrow" aria-hidden="true">
                An interactive journey
              </div>
              <div className="hero-title" aria-hidden="true">
                <span>The Solar</span>
                <span className="hero-title-em">System</span>
              </div>
              <p className="hero-subtitle" aria-hidden="true">
                One star. Eight planets. Scroll to travel from the Sun to
                the edge of home, and see where you really are.
              </p>
              <button className="begin-button" onClick={scrollToStart}>
                <span className="begin-ring">
                  <span className="begin-arrow">↓</span>
                </span>
                <span className="begin-text">Begin the journey</span>
              </button>
              {today && (
                <p className="hero-note">
                  Planets start where they are today, {today}, then time runs forward
                </p>
              )}
            </motion.div>
          )}

          {textOn && activeChapter && (
            <motion.div
              key={activeChapter.id}
              className="story-content"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
            >
              <div className="story-inner">
                <div className="chapter" aria-hidden="true">
                  <span className="chapter-index">{chapterNo(active + 1)}</span>
                  {planetName}
                </div>

                <div className="story-title" aria-hidden="true">
                  {(() => {
                    // letters ease in one after another, lifting and
                    // sharpening from a slight blur; words never break
                    let letter = 0
                    return activeChapter.title.split(' ').map((word, wordIndex) => (
                      <Fragment key={`${word}-${wordIndex}`}>
                        <span className="word">
                          {Array.from(word).map((character, i) => {
                            const order = letter++
                            return (
                              <motion.span
                                key={i}
                                className="letter"
                                initial={{ opacity: 0, y: '0.35em', filter: 'blur(6px)' }}
                                animate={{ opacity: 1, y: '0em', filter: 'blur(0px)' }}
                                transition={{
                                  duration: 0.8,
                                  delay: 0.08 + order * 0.022,
                                  ease: EASE_OUT_EXPO,
                                }}
                              >
                                {character}
                              </motion.span>
                            )
                          })}
                        </span>{' '}
                      </Fragment>
                    ))
                  })()}
                </div>

                <p className="story-description" aria-hidden="true">
                  {activeChapter.description}
                </p>

                <div className="inline-stats" aria-hidden="true">
                  {activeChapter.stats.map((stat, statIndex) => (
                    <motion.div
                      className="inline-stat"
                      key={stat.label}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.55,
                        delay: 0.22 + statIndex * 0.08,
                        ease: EASE_OUT_EXPO,
                      }}
                    >
                      <strong>
                        <CountUp value={stat.value} delay={0.3 + statIndex * 0.08} />
                      </strong>
                      <span>{stat.label}</span>
                    </motion.div>
                  ))}
                </div>

                {scale && (
                  <motion.p
                    className="scale-line"
                    aria-hidden="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.45 }}
                  >
                    If the Sun were a door 2 m tall, {scale.name} would be{' '}
                    {scale.size} across ({scale.like}) and {scale.distance} away.
                  </motion.p>
                )}

                {WORLD_DETAILS[activeChapter.id] && (
                  <button
                    type="button"
                    className="detail-open"
                    onClick={() => setDetailOpen(true)}
                    aria-expanded={detailOpen}
                  >
                    More about {planetName}
                    <span aria-hidden="true">+</span>
                  </button>
                )}

                <button
                  className="journey-hint"
                  onClick={() => goToSection(section + 1)}
                >
                  {active < JOURNEY.length - 1
                    ? `Next: ${titleCase(JOURNEY[active + 1].label)}`
                    : 'Continue'}
                  <span>→</span>
                </button>
              </div>
            </motion.div>
          )}

          {textOn && section === TOTAL_SECTIONS - 1 && (
            <motion.div
              key="return"
              className="return-content"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
            >
              <div className="chapter" aria-hidden="true">
                <span className="chapter-index">{TOTAL_SECTIONS - 1}</span>
                Return
              </div>
              <div className="return-title" aria-hidden="true">
                Now look <em>back.</em>
              </div>
              <p className="return-text" aria-hidden="true">
                Eight worlds. One tiny corner of a much larger universe.
                <br />
                <strong>And this is only the beginning.</strong>
              </p>
              <button className="begin-button" onClick={() => goToSection(0)}>
                <span className="begin-ring">
                  <span className="begin-arrow">↑</span>
                </span>
                <span className="begin-text">Start again</span>
              </button>
              <p className="credits">
                Planet textures:{' '}
                <a
                  href="https://www.solarsystemscope.com/textures/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Solar System Scope
                </a>
                , licensed{' '}
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  CC BY 4.0
                </a>
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {section === 0 && textOn && (
          <div className="scroll-cue" aria-hidden="true">
            <span>SCROLL</span>
            <i />
          </div>
        )}
      </div>
    </main>
    </MotionConfig>
  )
}
