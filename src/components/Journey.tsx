'use client'



import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import Lenis from 'lenis'



import UniverseCanvas from './experience/UniverseCanvas'

import Loader from './ui/Loader'
import DetailPanel from './ui/DetailPanel'
import CountUp from './ui/CountUp'
import MotionControl from './ui/MotionControl'
import SoundToggle from './ui/SoundToggle'
import FlightHud from './ui/FlightHud'
import ChapterMenu from './ui/ChapterMenu'
import TimeBar from './ui/TimeBar'
import ZoomControl from './ui/ZoomControl'
import { DIVE_PLACES, dive } from './experience/galaxyDive'
import CommandPalette, { type Command } from './ui/CommandPalette'
import LiveCounter from './ui/LiveCounter'
import { PICK_EVENT } from './experience/PlanetPicker'
import PickLayer from './ui/PickLayer'
import { Glyph, PARENT_NAMES, WORLDS } from './ui/FlightHud'
import { REAL_SPEEDS, setRealMotion, simClock } from './experience/simClock'
import Icon from './ui/Icon'
import { pilot } from './experience/pilotState'
import { WORLD_DETAILS } from '../data/worlds'
import { INTERIORS, PLANET_INDEX } from '../data/interiors'
import { cutaway } from './experience/cutawayState'
import { lens } from './experience/lens'
import { PLANETS, getPlanetHeliocentricAU, julianDate } from './experience/orbit'
import { REVEAL_END, REVEAL_HOLD, REVEAL_PULL, reveal, revealFigures } from './experience/scaleReveal'
import { SHOTS, SHOT_SECONDS, shot } from './experience/shots'
import { FILM_SCORE_EVENT, FilmScore } from './ui/filmScore'
import { MODE_KEY, OPENING_BEATS, OPENING_SECONDS, SEQUENCE_EVENT, attachOrbitInput, attachZoomInput, opening, sequence, viewMode, type ViewMode } from './experience/viewMode'
import { formatKm } from './ui/WorldLive'



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

      { value: '88', label: 'DAYS PER ORBIT' },

      { value: '0.39 AU', label: 'FROM THE SUN' },

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

      { value: '225', label: 'DAYS PER ORBIT' },

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

      { value: '1 AU', label: 'FROM THE SUN' },

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

      { value: '687', label: 'DAYS PER ORBIT' },

      { value: '1.52 AU', label: 'FROM THE SUN' },

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

      { value: '11.86', label: 'YEARS PER ORBIT' },

      { value: '5.20 AU', label: 'FROM THE SUN' },

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

      { value: '29.45', label: 'YEARS PER ORBIT' },

      { value: '9.54 AU', label: 'FROM THE SUN' },

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

      { value: '84', label: 'YEARS PER ORBIT' },

      { value: '19.19 AU', label: 'FROM THE SUN' },

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

      { value: '164.8', label: 'YEARS PER ORBIT' },

      { value: '30.07 AU', label: 'FROM THE SUN' },

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
  {
    id: 'local-group',
    label: 'LOCAL GROUP',
    eyebrow: '12 · THE LOCAL GROUP',
    title: 'One galaxy among many.',
    description: 'The Milky Way has company. With the Andromeda Galaxy, 2.5 million light-years away, and the smaller Triangulum Galaxy, it leads a family of more than 80 galaxies, most of them faint dwarfs, spread across some 10 million light-years: the Local Group. Andromeda and the Milky Way are drawing closer.',
    facts: [
      'The Andromeda Galaxy is the most distant thing most people can see with the naked eye.',
      'The light you see from Andromeda left it 2.5 million years ago.',
      'The Large and Small Magellanic Clouds orbit the Milky Way and are visible from the southern hemisphere.',
      'The Local Group is one small part of the Laniakea Supercluster of about 100,000 galaxies.',
    ],
    stats: [
      { value: '2.5M', label: 'LY TO ANDROMEDA' },
      { value: '80+', label: 'GALAXIES' },
      { value: '10M', label: 'LY ACROSS' },
    ],
    accent: '#b4a6ff',
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

/* the stage shows the opening of a description (a sentence or two); the
   whole text is in the "More about" panel and the screen-reader transcript */
function brief(text: string) {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text]
  let out = ''
  for (const sentence of sentences) {
    if (out && (out + sentence).length > 150) break
    out += sentence
  }
  return out.trim()
}

/* each chapter's address (…/#saturn), so a chapter can be linked to */
const CHAPTER_SLUG: Record<string, string> = {
  beyond: 'pale-blue-dot',
  galaxy: 'milky-way',
  'local-group': 'local-group',
}
const slugOf = (chapter: Chapter) => CHAPTER_SLUG[chapter.id] ?? chapter.id
/* the section a link points to (1 = the first chapter), or null */
function sectionFromHash(hash: string) {
  const slug = decodeURIComponent(hash.replace(/^#/, '')).toLowerCase()
  if (!slug) return null
  const index = JOURNEY.findIndex((chapter) => slugOf(chapter) === slug)
  return index >= 0 ? index + 1 : null
}

/* Each hop between neighbouring worlds, as it really is today: how far
   apart they are and how long light takes to cross. Shown while the
   camera flies it (in a second; light needs minutes or hours). */
const WORLD_OF: Record<string, number> = {
  sun: -1,
  mercury: 0,
  venus: 1,
  earth: 2,
  mars: 3,
  jupiter: 4,
  saturn: 5,
  uranus: 6,
  neptune: 7,
}
function legInto(chapterIndex: number) {
  const to = JOURNEY[chapterIndex]
  const from = JOURNEY[chapterIndex - 1]
  if (!to || !from || WORLD_OF[to.id] === undefined || WORLD_OF[from.id] === undefined) return null
  const jd = julianDate(new Date())
  const at = (world: number) => (world < 0 ? [0, 0, 0] : getPlanetHeliocentricAU(world, jd))
  const a = at(WORLD_OF[from.id])
  const b = at(WORLD_OF[to.id])
  const km = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 149_597_870.7
  const seconds = km / 299_792.458
  const minutes = Math.floor(seconds / 60)
  const light =
    minutes >= 60
      ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
      : `${minutes} min ${Math.round(seconds - minutes * 60)} s`
  return { from: titleCase(from.label), to: titleCase(to.label), distance: formatKm(km), light }
}

/* how the chapters beyond the planets are named in the panel and on its button */
const PANEL_TITLE: Record<string, string> = {
  beyond: 'The Pale Blue Dot',
  galaxy: 'The Milky Way',
  'local-group': 'The Local Group',
}
const panelTitle = (chapter: Chapter) => PANEL_TITLE[chapter.id] ?? titleCase(chapter.label)
const moreAbout = (chapter: Chapter) =>
  PANEL_TITLE[chapter.id] ? PANEL_TITLE[chapter.id].replace(/^The /, 'the ') : titleCase(chapter.label)

/* the key fact of each chapter's sentence, picked out as you read it */
const KEY_WORDS: Record<string, string> = {
  sun: 'almost all of the Solar System’s mass',
  mercury: 'the smallest planet and the closest to the Sun',
  venus: 'profoundly different',
  earth: 'the reference point',
  mars: 'liquid water once flowed',
  jupiter: 'more than twice the mass of all the other planets combined',
  saturn: 'the most spectacular ring system',
  uranus: 'an unusual orientation',
  neptune: 'the farthest of the eight planets',
  beyond: 'a single speck',
  galaxy: 'a single point',
  'local-group': 'has company',
}
function withKeyWords(text: string, id: string) {
  const key = KEY_WORDS[id]
  const at = key ? text.indexOf(key) : -1
  if (!key || at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <mark>{key}</mark>
      {text.slice(at + key.length)}
    </>
  )
}

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
  '#7f76e0', // Local Group
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
  // the tab the panel opens on, and the command palette
  const [panelTab, setPanelTab] = useState<'overview' | 'now' | 'story' | 'missions' | 'compare'>('overview')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const paletteOpenRef = useRef(false)
  paletteOpenRef.current = paletteOpen
  // flight mode: the journey pauses while you fly the jet
  const [flying, setFlying] = useState(false)
  const flyingRef = useRef(false)
  flyingRef.current = flying
  const savedScroll = useRef(0)
  const [inside, setInside] = useState(false)
  const detailOpenRef = useRef(false)
  detailOpenRef.current = detailOpen

  const rootRef = useRef<HTMLElement>(null)
  const lenisRef = useRef<Lenis | null>(null)
  const snapToRef = useRef<((index: number) => void) | null>(null)
  const progressRef = useRef(0)
  // a glide past several chapters: their text stays down until it lands
  const glideTargetRef = useRef<number | null>(null)
  const updateRef = useRef<(() => void) | null>(null)
  // stepping chapters from the panel: open it again on arrival
  const reopenAfter = useRef(false)
  // straight to a chapter, no glide (a link opened)
  const jumpToRef = useRef<((index: number) => void) | null>(null)
  // a link's chapter has been reached (or there was none): from then on
  // the address follows the journey
  const linkedRef = useRef(false)
  // the hop just flown: shown for a few seconds
  const [leg, setLeg] = useState<ReturnType<typeof legInto>>(null)
  const lastLegSection = useRef(0)

  const frame = useRef<number | null>(null)
  const lastSection = useRef(0)
  const lastTextOn = useRef(true)

  /* Watching: after a few still seconds the controls fade away (and the
     pointer with them), as a film player's do; any move brings them back */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    // on <html>: React rewrites the page's own class list as chapters change
    const html = document.documentElement
    let timer = 0
    const wake = () => {
      html.classList.remove('is-idle')
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        // not while flying, reading the panel, or in a menu
        if (root.classList.contains('is-flying') || root.classList.contains('detail-is-open')) return
        if (document.querySelector('.hud-top :focus-within, .hud-top [aria-expanded="true"], [role="dialog"]')) return
        html.classList.add('is-idle')
      }, 4200)
    }
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach((name) => window.addEventListener(name, wake, { passive: true }))
    wake()
    return () => {
      window.clearTimeout(timer)
      html.classList.remove('is-idle')
      events.forEach((name) => window.removeEventListener(name, wake))
    }
  }, [])

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
      glideTargetRef.current = Math.abs(target - lastRest) > 1 ? target : null
      lenis.scrollTo(to * unit(), {
        // the pull-backs (the Pale Blue Dot to the galaxy, the galaxy to the
        // Local Group, and home again) take their time
        duration:
          (Math.min(target, lastRest) >= 10 && Math.abs(target - lastRest) === 1) || (lastRest === 12 && target === 13)
            ? 3.4
            : Math.min(2.6, 0.95 + 0.55 * distance),
        easing: easeInOutSine,
        lock: true,
        force: true,
        onComplete: () => {
          snapping = false
          lastRest = target
          glideTargetRef.current = null
          updateRef.current?.()
          const now = performance.now()
          quietUntil = now + 220
          quietHardLimit = now + 1100
        },
      })
    }
    snapToRef.current = snapTo
    jumpToRef.current = (index: number) => {
      const target = Math.max(0, Math.min(TOTAL_SECTIONS - 1, index))
      lenis.scrollTo(restPoint(target) * unit(), { immediate: true, force: true })
      lastRest = target
    }

    lenis.options.virtualScroll = ({ deltaX, deltaY, event }) => {
      // scrolling paused (a film, the reveal, the galaxy dive): no glide to
      // the next chapter (it was forced through the pause before)
      if (lenis.isStopped) {
        if (event.cancelable) event.preventDefault()
        return false
      }
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
      jumpToRef.current = null
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

      const gliding = glideTargetRef.current !== null && glideTargetRef.current !== sectionIndex
      const nextTextOn = gliding
        ? false
        : isIntro
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

    updateRef.current = updateScroll
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

  /* take off from the journey: remember where we were, pause scrolling,
     and put the scene in its wide view so every planet is full size */
  const takeOff = () => {
    // no 3D here (see UniverseCanvas): nothing to fly
    if (document.documentElement.classList.contains('no-webgl')) return
    const lenis = lenisRef.current
    savedScroll.current = window.scrollY
    setDetailOpen(false)
    lenis?.scrollTo(0, { immediate: true, force: true })
    lenis?.stop()
    pilot.active = true
    setFlying(true)
  }

  const land = useCallback(() => {
    pilot.active = false
    const lenis = lenisRef.current
    lenis?.start()
    lenis?.scrollTo(savedScroll.current, { immediate: true, force: true })
    setFlying(false)
  }, [])

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

  /* A link to a chapter (…/#saturn): once the loading screen has lifted,
     go straight there. After that the address follows the journey, and
     the browser's back and forward move between chapters. */
  useEffect(() => {
    const target = sectionFromHash(window.location.hash)
    if (target === null) {
      linkedRef.current = true
      return
    }
    let timer = 0
    const arrive = () => {
      if (!lens.revealed) {
        timer = window.setTimeout(arrive, 120)
        return
      }
      if (jumpToRef.current) jumpToRef.current(target)
      else goToSection(target)
      linkedRef.current = true
    }
    arrive()
    const onHash = () => {
      const next = sectionFromHash(window.location.hash)
      if (next !== null) goToSection(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('hashchange', onHash)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // a hop between neighbours (not a long glide past several): its caption
  useEffect(() => {
    const previous = lastLegSection.current
    lastLegSection.current = section
    if (glideTargetRef.current !== null || Math.abs(section - previous) !== 1) {
      setLeg(null)
      return
    }
    // (going back, the hop is the one between the same two worlds)
    const next = legInto(Math.max(section, previous) - 1)
    if (!next) {
      setLeg(null)
      return
    }
    setLeg(section > previous ? next : { ...next, from: next.to, to: next.from })
    const timer = window.setTimeout(() => setLeg(null), 4200)
    return () => window.clearTimeout(timer)
  }, [section])

  useEffect(() => {
    if (!linkedRef.current) return
    const chapter = section >= 1 && section <= JOURNEY.length ? JOURNEY[section - 1] : null
    const hash = chapter ? `#${slugOf(chapter)}` : ''
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash || window.location.pathname + window.location.search)
    }
  }, [section])

  useEffect(() => {
    setToday(
      new Date().toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    )
  }, [])

  // a world picked in the wide view: go to its chapter
  useEffect(() => {
    const onPick = (event: Event) => goToSection((event as CustomEvent<number>).detail)
    window.addEventListener(PICK_EVENT, onPick)
    return () => window.removeEventListener(PICK_EVENT, onPick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (flyingRef.current) return
      const typing = (event.target as HTMLElement | null)?.closest?.('input, textarea')
      if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') || (event.key === '/' && !typing)) {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (paletteOpenRef.current || detailOpenRef.current || flyingRef.current) return
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
    // arrived where the panel's Previous / Next was taking us: open it again
    const chapter = section >= 1 && section <= JOURNEY.length ? JOURNEY[section - 1] : null
    if (reopenAfter.current && textOn && chapter && WORLD_DETAILS[chapter.id]) {
      reopenAfter.current = false
      setDetailOpen(true)
      return
    }
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

  /* Cinematic or interactive (viewMode.ts): remembered; interactive
     mode listens for the visitor's orbit and zoom */
  const [mode, setMode] = useState<ViewMode>('cinematic')
  const [modeNote, setModeNote] = useState('')
  useEffect(() => {
    try {
      if (localStorage.getItem(MODE_KEY) === 'interactive') setMode('interactive')
    } catch {}
  }, [])
  useEffect(() => {
    viewMode.mode = mode
    document.documentElement.classList.toggle('is-interactive', mode === 'interactive')
    if (mode !== 'interactive') return
    return attachOrbitInput()
  }, [mode])
  // zoom by hand in either mode (not in flight: its keys are its own)
  useEffect(() => {
    if (flying) return
    return attachZoomInput()
  }, [flying])
  const switchMode = () => {
    const next: ViewMode = mode === 'cinematic' ? 'interactive' : 'cinematic'
    setMode(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {}
    setModeNote(
      next === 'interactive'
        ? 'Interactive: drag to orbit, pinch or Ctrl + scroll to zoom, 0 to reset'
        : 'Cinematic: the camera is directed again',
    )
  }
  useEffect(() => {
    if (!modeNote) return
    const timer = window.setTimeout(() => setModeNote(''), 3800)
    return () => window.clearTimeout(timer)
  }, [modeNote])

  /* a directed arrival (cinematic mode): the words wait until it lands */
  const [holdChapter, setHoldChapter] = useState(-1)
  useEffect(() => {
    const onSequence = (event: Event) => {
      const { chapter, on } = (event as CustomEvent<{ chapter: number; on: boolean }>).detail
      setHoldChapter((current) => (on ? chapter : current === chapter ? -1 : current))
    }
    window.addEventListener(SEQUENCE_EVENT, onSequence)
    return () => window.removeEventListener(SEQUENCE_EVENT, onSequence)
  }, [])
  const holding = holdChapter === section
  const textShown = textOn && !holding
  useEffect(() => {
    if (!holding) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') sequence.skip = true
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [holding])

  /* True size (scaleReveal.ts): the reveal at the Sun or a planet other
     than Earth. 0 off; 1 running, nothing said yet; 2 "This is Earth.";
     3 "And this is ..."; 4 the figures */
  const sizeIndex = activeChapter ? PLANET_INDEX[activeChapter.id] : undefined
  const sizeKm =
    activeChapter?.id === 'sun' ? 695700 : sizeIndex !== undefined && activeChapter?.id !== 'earth' ? PLANETS[sizeIndex]?.radiusKm : undefined
  const sizeName = activeChapter?.id === 'sun' ? 'the Sun' : planetName
  const [revealStep, setRevealStep] = useState(0)
  const endReveal = useCallback(() => {
    reveal.active = false
    setRevealStep(0)
    lenisRef.current?.start()
  }, [])
  const startReveal = () => {
    reveal.active = true
    reveal.chapter = section
    reveal.clock = 0
    lenisRef.current?.stop()
    setRevealStep(1)
  }
  // the captions follow the camera's clock
  useEffect(() => {
    if (revealStep === 0) return
    let frame = 0
    const tick = () => {
      const t = reveal.clock
      const step = t >= REVEAL_END - 0.4 ? 4 : t >= REVEAL_HOLD + REVEAL_PULL * 0.42 ? 3 : t >= 0.9 ? 2 : 1
      setRevealStep((current) => (current === 0 ? 0 : step))
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [revealStep === 0]) // eslint-disable-line react-hooks/exhaustive-deps
  // out of it: Esc, a scroll, or leaving the chapter
  useEffect(() => {
    if (revealStep === 0) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') endReveal()
    }
    const onWheel = () => {
      if (reveal.clock > 1.2) endReveal()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
    }
  }, [revealStep === 0, endReveal]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (reveal.active && reveal.chapter !== section) endReveal()
  }, [section, endReveal])

  /* The six shots (shots.ts): the chapter as a short film. A cut is a
     moment of black: the camera jumps while the screen is dark. */
  const [film, setFilm] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [cutting, setCutting] = useState(false)
  const cutTimers = useRef<number[]>([])
  /* the film's score (ui/filmScore.ts): on unless switched off */
  const score = useRef<FilmScore | null>(null)
  const [music, setMusic] = useState(true)
  useEffect(() => {
    try {
      if (localStorage.getItem('urniverse-film-music') === 'off') setMusic(false)
    } catch {}
  }, [])
  const stopScore = useCallback(() => {
    score.current?.stop()
    score.current = null
    window.dispatchEvent(new CustomEvent(FILM_SCORE_EVENT, { detail: false }))
  }, [])
  const startScore = (at: number) => {
    try {
      score.current?.stop()
      score.current = new FilmScore()
      void score.current.start(at)
      window.dispatchEvent(new CustomEvent(FILM_SCORE_EVENT, { detail: true }))
    } catch {
      score.current = null // no Web Audio: a silent film
    }
  }
  const toggleMusic = () => {
    const next = !music
    setMusic(next)
    try {
      localStorage.setItem('urniverse-film-music', next ? 'on' : 'off')
    } catch {}
    if (next) startScore(Math.max(1, shot.index))
    else stopScore()
  }
  const cutTo = useCallback((next: number) => {
    cutTimers.current.forEach((t) => window.clearTimeout(t))
    setCutting(true)
    cutTimers.current = [
      window.setTimeout(() => {
        shot.index = next
        shot.clock = 0
        shot.cut = true
        if (next > 0) score.current?.setShot(next)
      }, 300),
      // the words once the camera has its new figures
      window.setTimeout(() => setFilm(next), 420),
      window.setTimeout(() => setCutting(false), 460),
    ]
  }, [])
  /* the dive to the galaxy's centre (galaxyDive.ts): scroll moves the
     camera along the way, forward or back; Esc or the button leaves */
  const [diving, setDiving] = useState(false)
  const [divePlace, setDivePlace] = useState(0)
  const diveDistance = useRef<HTMLSpanElement>(null)
  const diveBar = useRef<HTMLSpanElement>(null)
  const startDive = () => {
    dive.active = true
    dive.target = 0
    dive.s = 0
    setDivePlace(0)
    lenisRef.current?.stop()
    setDiving(true)
  }
  const endDive = useCallback(() => {
    dive.active = false
    lenisRef.current?.start()
    setDiving(false)
  }, [])
  useEffect(() => {
    if (diving && section !== 11) endDive()
  }, [section, diving, endDive])
  useEffect(() => {
    if (!diving) return
    const step = (amount: number) => {
      dive.target = Math.min(1, Math.max(0, dive.target + amount))
    }
    // (a trackpad's own inertia carries on through its wheel events)
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return
      event.preventDefault()
      event.stopImmediatePropagation()
      step((event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY) / 9000)
    }
    let touchY: number | null = null
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? null
    }
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY
      if (touchY === null || y === undefined) return
      if ((event.target as HTMLElement | null)?.closest?.('button')) return
      event.preventDefault()
      step((touchY - y) / 2400)
      touchY = y
    }
    const onKey = (event: KeyboardEvent) => {
      const forward = ['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(event.key)
      const back = ['ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key)
      if (!forward && !back && !['Home', 'End', 'Escape'].includes(event.key)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (forward) step(0.06)
      else if (back) step(-0.06)
      else if (event.key === 'Home') dive.target = 0
      else if (event.key === 'End') dive.target = 1
      else endDive()
    }
    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('keydown', onKey, true)
    // the words follow the camera
    let frame = 0
    let place = -1
    const tick = () => {
      frame = window.requestAnimationFrame(tick)
      if (diveDistance.current) {
        const ly = Math.round(dive.distanceLy / 100) * 100
        diveDistance.current.textContent = `${ly.toLocaleString('en-GB')} light-years from the centre`
      }
      if (diveBar.current) diveBar.current.style.transform = `scaleX(${dive.s.toFixed(4)})`
      if (dive.place !== place) {
        place = dive.place
        setDivePlace(place)
      }
    }
    tick()
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('wheel', onWheel, { capture: true })
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [diving, endDive])

  const startFilm = (first = 1) => {
    shot.chapter = section
    lenisRef.current?.stop()
    // (in the click itself: browsers allow sound only after one)
    if (music) startScore(first)
    setPlaying(first === 1)
    setFilm(-1) // on, before the first shot's words
    cutTo(first)
  }
  const endFilm = useCallback(() => {
    if (shot.index === 0) return
    setPlaying(false)
    cutTo(0)
    stopScore()
    lenisRef.current?.start()
  }, [cutTo, stopScore])
  // playing: the next shot when this one has held
  useEffect(() => {
    if (!playing || film < 1) return
    const timer = window.setTimeout(() => {
      if (film < SHOTS.length) cutTo(film + 1)
      else {
        setPlaying(false)
        score.current?.finish()
      }
    }, SHOT_SECONDS * 1000)
    return () => window.clearTimeout(timer)
  }, [playing, film, cutTo])
  // keys while it runs: arrows step, space plays, Esc leaves (before the
  // journey's own arrow keys, which would change chapter)
  useEffect(() => {
    if (film === 0) return
    const onKey = (event: KeyboardEvent) => {
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
      if (step) {
        event.preventDefault()
        event.stopImmediatePropagation()
        setPlaying(false)
        cutTo(Math.min(SHOTS.length, Math.max(1, shot.index + step)))
      } else if (event.key === ' ') {
        event.preventDefault()
        event.stopImmediatePropagation()
        setPlaying((p) => !p)
      } else if (event.key === 'Escape') {
        event.stopImmediatePropagation()
        endFilm()
      }
    }
    const onWheel = () => endFilm()
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('wheel', onWheel)
    }
  }, [film === 0, cutTo, endFilm]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (shot.index > 0 && shot.chapter !== section) {
      shot.index = 0
      setFilm(0)
      setPlaying(false)
      stopScore()
      lenisRef.current?.start()
    }
  }, [section, stopScore])
  useEffect(
    () => () => {
      cutTimers.current.forEach((t) => window.clearTimeout(t))
      score.current?.stop()
    },
    [],
  )

  /* THE OPENING (viewMode.ts): some fifty seconds of directed film from
     the intro, out of darkness to the whole Solar System; the camera
     plays it, the page gives the words, the black and the score */
  const [openingBeat, setOpeningBeat] = useState(-1)
  const [openingDark, setOpeningDark] = useState(0)
  const openingOn = openingBeat >= 0
  const endOpening = useCallback(() => {
    opening.active = false
    opening.skip = false
    setOpeningBeat(-1)
    setOpeningDark(0)
    document.documentElement.classList.remove('is-opening')
    lenisRef.current?.start()
  }, [])
  const startOpening = () => {
    opening.active = true
    opening.clock = 0
    opening.skip = false
    lenisRef.current?.stop()
    document.documentElement.classList.add('is-opening')
    setOpeningBeat(0)
    setOpeningDark(1)
    // (in the click itself: browsers allow sound only after one)
    if (music) startScore(1)
  }
  const skipOpening = useCallback(() => {
    setCutting(true)
    window.setTimeout(() => {
      opening.skip = true
    }, 280)
    window.setTimeout(() => {
      stopScore()
      endOpening()
      setCutting(false)
    }, 520)
  }, [endOpening, stopScore])
  useEffect(() => {
    if (!openingOn) return
    let frame = 0
    let last = -1
    const tick = () => {
      const t = opening.clock
      let beat = 0
      OPENING_BEATS.forEach((b, i) => {
        if (t >= b.at) beat = i
      })
      if (beat !== last) {
        last = beat
        setOpeningBeat(beat)
        score.current?.setShot(beat + 1)
      }
      // out of the dark, slowly, over the first six seconds
      setOpeningDark(1 - Math.min(1, Math.max(0, (t - 0.6) / 5)))
      if (t >= OPENING_SECONDS) {
        score.current?.finish()
        endOpening()
        return
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') skipOpening()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
    }
  }, [openingOn, endOpening, skipOpening])

  const kmWords = (km: number) =>
    km >= 1e6
      ? `${(km / 1e6).toFixed(km >= 1e7 ? 0 : 1)} million km`
      : `${Number(km.toPrecision(km >= 1000 ? 2 : 3)).toLocaleString('en-GB')} km`
  const filmIndex = sizeIndex
  const chapterId = activeChapter?.id ?? ''
  const OTHER_LINES: Record<string, string[]> = {
    sun: [
      'The Sun: 1.39 million km across, 99.8% of the Solar System’s mass.',
      'Over the photosphere: cells of rising gas, each the size of a country.',
      'Venus crossing the face of the Sun. The next transit is in December 2117.',
      'The Shuttle, 37 m long, before a star 1.39 million km across.',
      'Sunrise over Earth’s horizon, from orbit: sixteen of them every day.',
      'The Sun and its inner worlds: Mercury, Venus, Earth and Mars.',
    ],
    beyond: [
      'Earth, half-lit by the Sun.',
      'Over the clouds of home.',
      'The Sun behind Earth: what the Moon sees in a lunar eclipse.',
      'The Shuttle, 37 m long. Earth is 12,742 km across.',
      'Earth’s horizon: the whole of its air, a thin blue line.',
      'Voyager 1’s view in 1990, from 6 billion km: Earth, less than a pixel wide.',
    ],
    galaxy: [
      'The Milky Way: some 100,000 light-years across, 100 to 400 billion stars.',
      'Over the spiral arms: star clouds, and the dark dust between them.',
      'Edge-on: a disc a thousand light-years thin, round a glowing bulge.',
      'The Shuttle, 37 m long, before a galaxy 100,000 light-years wide.',
      'From the Sun’s place, 26,000 light-years out: the band we see across our night sky.',
      'From far above: one of perhaps two trillion galaxies.',
    ],
    'local-group': [
      'Andromeda: 2.5 million light-years away, and coming closer.',
      'Andromeda’s core: a trillion stars around a black hole 100 million Suns heavy.',
      'Our galaxy edge-on, with Andromeda somewhere beyond.',
      'The Shuttle, 37 m long, before a galaxy wider than our own.',
      'Andromeda over the Milky Way. In some 4.5 billion years they will merge.',
      'The Local Group: two great spirals and some 80 smaller galaxies.',
    ],
  }
  const shotLine = (n: number) => {
    if (OTHER_LINES[chapterId]) return OTHER_LINES[chapterId][n - 1] ?? ''
    const name = planetName
    const rocky = filmIndex !== undefined && (filmIndex <= 3)
    switch (n) {
      case 1:
        return `${name}, half-lit by the Sun.`
      case 2:
        return activeChapter?.id === 'earth'
          ? 'The Himalayas in the morning, from 9 km up: Everest ahead, 8,849 m, the highest ground on Earth. Real heights, real imagery.'
          : `${rocky ? 'Low over the ground' : 'Over the cloud tops'}, ${kmWords(shot.altitudeKm)} up.`
      case 3:
        return `The Sun behind ${name}: its light through the edge of the ${filmIndex === 0 ? 'world' : 'air'}.`
      case 4:
        return activeChapter?.id === 'earth'
          ? 'The International Space Station: 109 m across, 418 km up, once round the Earth every 92 minutes.'
          : `The Shuttle, 37 m long, about 100 m from the lens. ${name}'s centre is ${kmWords(shot.distanceKm)} away.`
      case 5:
        return `${name}'s horizon, from ${kmWords(shot.altitudeKm)} up.`
      case 6:
        return filmIndex !== undefined && filmIndex <= 1
          ? `${name}, from ${kmWords(shot.distanceKm)} away.`
          : `${name} and its moons, from ${kmWords(shot.distanceKm)} away.`
      default:
        return ''
    }
  }
  const stepTo = (chapterIndex: number) => {
    reopenAfter.current = true
    goToSection(chapterIndex + 1)
  }
  const panelStep = (chapterIndex: number) => {
    const chapter = JOURNEY[chapterIndex]
    return chapter && WORLD_DETAILS[chapter.id]
      ? { name: panelTitle(chapter), go: () => stepTo(chapterIndex) }
      : undefined
  }
  /* everything the command palette can do */
  const openPanel = (chapterIndex: number, tab: typeof panelTab) => {
    setPanelTab(tab)
    if (active === chapterIndex && textOn) setDetailOpen(true)
    else stepTo(chapterIndex)
  }
  const commands: Command[] = [
    ...JOURNEY.map((chapter, i) => ({
      id: `chapter-${chapter.id}`,
      group: 'Chapters',
      title: panelTitle(chapter),
      hint: `${chapterNo(i + 1)} · ${chapter.title}`,
      keywords: `${chapter.id} go chapter`,
      icon: <span className="palette-dot" style={{ background: chapter.accent }} />,
      run: () => goToSection(i + 1),
    })),
    ...JOURNEY.flatMap((chapter, i) =>
      WORLD_DETAILS[chapter.id]
        ? (
            [
              ['overview', 'About', 'overview figures facts size'],
              ['now', 'Right now', 'today distance tonight sky weight age live'],
              ['story', 'Story', 'story moons history'],
              ['missions', WORLD_DETAILS[chapter.id].missionsHeading ?? 'Exploration', 'missions exploration timeline spacecraft milestones'],
              ...(PLANET_INDEX[chapter.id] !== undefined ? ([['compare', 'Compare', 'compare versus vs size gravity']] as const) : []),
            ] as const
          ).map(([tab, label, words]) => ({
            id: `panel-${chapter.id}-${tab}`,
            group: 'Panels',
            title: `${panelTitle(chapter)}: ${label}`,
            keywords: words,
            icon: <Icon name="plus" />,
            run: () => openPanel(i, tab),
          }))
        : [],
    ),
    ...WORLDS.map((world) => ({
      id: `fly-${world.index}`,
      group: 'Fly to',
      title: world.name,
      hint: `${world.what}${world.parent !== undefined ? ` · ${PARENT_NAMES[world.parent]}` : ''}`,
      keywords: 'fly warp shuttle go',
      icon: <Glyph kind={world.kind} />,
      run: () => {
        pilot.warpRequest = world.index
        takeOff()
      },
    })),
    {
      id: 'action-camera-mode',
      group: 'Actions',
      title: mode === 'cinematic' ? 'Camera: interactive' : 'Camera: cinematic',
      hint: mode === 'cinematic' ? 'orbit and zoom yourself' : 'the directed camera',
      keywords: 'camera mode cinematic interactive orbit zoom free directed',
      icon: <Icon name={mode === 'cinematic' ? 'orbit' : 'camera'} />,
      run: switchMode,
    },
    {
      id: 'action-fly',
      group: 'Actions',
      title: 'Fly the Shuttle',
      hint: 'free flight from here',
      keywords: 'shuttle fly flight start',
      icon: <Icon name="shuttle" />,
      run: takeOff,
    },
    {
      id: 'action-live',
      group: 'Actions',
      title: 'Time: Live',
      hint: 'everything on the real clock, now',
      keywords: 'time live real clock now',
      icon: <Icon name="clock" />,
      run: () => {
        simClock.realRate = REAL_SPEEDS[0].days
        setRealMotion(true)
      },
    },
    {
      id: 'action-cinematic',
      group: 'Actions',
      title: 'Time: Cinematic',
      hint: 'the planets drift gently',
      keywords: 'time cinematic drift',
      icon: <Icon name="clock" />,
      run: () => setRealMotion(false),
    },
    {
      id: 'action-sound',
      group: 'Actions',
      title: 'Sound on or off',
      hint: 'the soundtrack',
      keywords: 'sound music audio mute',
      icon: <Icon name="sound" />,
      run: () => document.querySelector<HTMLButtonElement>('.sound-toggle')?.click(),
    },
    ...(activeChapter
      ? [
          {
            id: 'action-link',
            group: 'Actions',
            title: `Copy a link to ${panelTitle(activeChapter)}`,
            keywords: 'link share copy url',
            icon: <Icon name="link" />,
            run: () => {
              navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}#${slugOf(activeChapter)}`)
            },
          },
        ]
      : []),
    {
      id: 'action-start',
      group: 'Actions',
      title: 'Back to the start',
      keywords: 'start beginning top home intro',
      icon: <Icon name="arrow" className="is-up-straight" />,
      run: () => goToSection(0),
    },
  ]

  // this chapter's world, if it is a planet you can fly to
  const flyTarget = activeChapter ? PLANET_INDEX[activeChapter.id] : undefined
  const scale = activeChapter ? scaleSentence(activeChapter.id, planetName) : null
  const stageKind =
    section === 0 ? 'intro' : section === TOTAL_SECTIONS - 1 ? 'return' : 'chapter'

  return (
    <MotionConfig reducedMotion="user">
    <main
      ref={rootRef}
      className={`universe-page ${openingOn ? 'is-filming' : ''} ${revealStep > 0 ? 'is-revealing' : ''} ${film !== 0 || diving ? 'is-filming' : ''} ${diving ? 'is-diving' : ''} ${canSpin && !flying ? 'can-spin' : ''} ${detailOpen ? 'detail-is-open' : ''} ${flying ? 'is-flying' : ''} ${!textShown && section > 0 && !flying && !detailOpen ? 'is-travelling' : ''}`}
      style={
        {
          '--planet-accent': activeChapter?.accent ?? '#9bb8ff',
        } as CSSProperties
      }
    >
      <div className="universe-canvas">
        <UniverseCanvas progressRef={progressRef} />
      </div>

      {/* between chapters the frame narrows to a wide screen, as in a film */}
      <div className="letterbox letterbox-top" aria-hidden="true" />
      <div className="letterbox letterbox-bottom" aria-hidden="true">
        {/* travelling: where you are, like a film's location title */}
        {activeChapter && (
          <span key={activeChapter.id} className="travel-title" style={{ ['--travel-accent' as string]: activeChapter.accent }}>
            <span className="travel-title-number">{String(active + 1).padStart(2, '0')}</span>
            {titleCase(activeChapter.label)}
          </span>
        )}
      </div>

      <Loader />

      {flying && <FlightHud onLand={land} />}

      {/* the opening: the dark it starts in, its words, its title */}
      {openingOn && (
        <>
          <div className="opening-dark" style={{ opacity: openingDark }} aria-hidden="true" />
          <div className="opening" role="status" aria-live="polite">
            <AnimatePresence mode="wait">
              {openingBeat < OPENING_BEATS.length - 1 ? (
                <motion.div
                  key={openingBeat}
                  className="film-caption"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 1.2, delay: openingBeat === 0 ? 1.5 : 0.3, ease: EASE_OUT_EXPO }}
                >
                  <p className="film-name">
                    <span className="film-num">{String(openingBeat + 1).padStart(2, '0')}</span>
                    {OPENING_BEATS[openingBeat].title}
                  </p>
                  <p className="film-line">{OPENING_BEATS[openingBeat].line}</p>
                </motion.div>
              ) : (
                <motion.div
                  key="title"
                  className="opening-title"
                  initial={{ opacity: 0, letterSpacing: '0.3em' }}
                  animate={{ opacity: 1, letterSpacing: '0.02em' }}
                  transition={{ duration: 2.2, ease: EASE_OUT_EXPO }}
                >
                  <span className="brand-mark" aria-hidden="true" />
                  You Are Here
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button type="button" className="reveal-skip opening-skip" onClick={skipOpening}>
            Skip <kbd>Esc</kbd>
          </button>
        </>
      )}

      {/* the mode just chosen, said once */}
      {modeNote && (
        <div className="mode-note" role="status">
          {modeNote}
        </div>
      )}

      {/* a directed arrival is playing: it can be skipped */}
      {holding && textOn && (
        <button type="button" className="reveal-skip sequence-skip" onClick={() => (sequence.skip = true)}>
          Skip <kbd>Esc</kbd>
        </button>
      )}

      {/* a cut: a moment of black between shots */}
      <div className={`cut ${cutting ? 'is-on' : ''}`} aria-hidden="true" />

      {/* the dive: where you are, how far from the centre, the way out */}
      {diving && (
        <div className="film dive" role="group" aria-label="The dive to the centre of the Milky Way">
          <motion.div key={divePlace} className="film-caption" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}>
            <p className="film-name">
              <span className="film-num">{String(divePlace + 1).padStart(2, '0')}</span>
              {DIVE_PLACES[divePlace].name}
            </p>
            <p className="film-line">{DIVE_PLACES[divePlace].note}</p>
          </motion.div>
          <div className="film-controls">
            <span className="dive-readout">
              <span ref={diveDistance} />
              <span className="dive-hint">Scroll to go deeper, back to rise</span>
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={endDive}>
              Back to the story
            </button>
          </div>
        </div>
      )}
      {diving && <span ref={diveBar} className="dive-progress" aria-hidden="true" />}

      {/* the six shots: a lower third naming the shot, and the controls */}
      {film !== 0 && (
        <div className="film" role="group" aria-label="Six shots">
          {film > 0 && (
            <motion.div key={film} className="film-caption" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}>
              <p className="film-name">
                <span className="film-num">{String(film).padStart(2, '0')}</span>
                {SHOTS[film - 1].name}
              </p>
              <p className="film-line">{shotLine(film)}</p>
            </motion.div>
          )}
          <div className="film-controls">
            <button type="button" className="film-button" aria-label="Previous shot" disabled={film <= 1} onClick={() => { setPlaying(false); cutTo(Math.max(1, film - 1)) }}>
              <Icon name="arrow" className="is-back" />
            </button>
            <button type="button" className="film-button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)}>
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
            <button type="button" className="film-button" aria-label="Next shot" disabled={film >= SHOTS.length} onClick={() => { setPlaying(false); cutTo(Math.min(SHOTS.length, film + 1)) }}>
              <Icon name="arrow" />
            </button>
            <button type="button" className="film-button" aria-pressed={music} aria-label={music ? 'Music off' : 'Music on'} title={music ? 'Music: on' : 'Music: off'} onClick={toggleMusic}>
              <Icon name={music ? 'sound' : 'muted'} />
            </button>
            <span className="film-dots">
              {SHOTS.map((s, i) => (
                <button
                  key={s.short}
                  type="button"
                  className={`film-dot ${film === i + 1 ? 'is-on' : ''}`}
                  aria-label={`${String(i + 1).padStart(2, '0')} ${s.name}`}
                  title={s.short}
                  onClick={() => { setPlaying(false); cutTo(i + 1) }}
                />
              ))}
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={endFilm}>
              Back to the story
            </button>
          </div>
          {playing && film > 0 && <span key={`p${film}`} className="film-progress" style={{ animationDuration: `${SHOT_SECONDS}s` }} />}
        </div>
      )}

      {/* true size: words over the reveal, like a documentary's */}
      {revealStep > 0 && sizeKm !== undefined && (
        <div className="reveal" role="status" aria-live="polite">
          <AnimatePresence mode="wait">
            {revealStep === 2 && (
              <motion.div key="earth" className="reveal-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 1.1, ease: EASE_OUT_EXPO }}>
                <p className="reveal-line">This is Earth.</p>
                <p className="reveal-sub">12,742 km across. Everyone who has ever lived, lived here.</p>
              </motion.div>
            )}
            {revealStep === 3 && (
              <motion.div key="it" className="reveal-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 1.2, ease: EASE_OUT_EXPO }}>
                <p className="reveal-line">And this is {sizeName}.</p>
              </motion.div>
            )}
            {revealStep === 4 && (
              <motion.div key="figures" className="reveal-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, ease: EASE_OUT_EXPO }}>
                <p className="reveal-line">{revealFigures(sizeKm, activeChapter?.id === 'sun').line}</p>
                <p className="reveal-sub">{revealFigures(sizeKm, activeChapter?.id === 'sun').sub}</p>
                <div className="reveal-actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => (reveal.clock = 0)}>
                    Watch again
                  </button>
                  <button type="button" className="btn btn--primary btn--sm" onClick={endReveal}>
                    Back to the story
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {revealStep < 4 && (
            <button type="button" className="reveal-skip" onClick={endReveal}>
              Skip <kbd>Esc</kbd>
            </button>
          )}
        </div>
      )}

      {!flying && <PickLayer />}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />

      <DetailPanel
        open={detailOpen}
        name={activeChapter ? panelTitle(activeChapter) : ''}
        eyebrow={activeChapter ? `${chapterNo(active + 1)} · About` : 'About'}
        sky={
          activeChapter?.id === 'galaxy'
            ? 'galaxy'
            : activeChapter?.id === 'beyond'
              ? 'distances'
              : activeChapter?.id === 'local-group'
                ? 'local-group'
                : undefined
        }
        link={
          activeChapter && typeof window !== 'undefined'
            ? `${window.location.origin}${window.location.pathname}#${slugOf(activeChapter)}`
            : undefined
        }
        previous={active > 0 ? panelStep(active - 1) : undefined}
        next={active >= 0 ? panelStep(active + 1) : undefined}
        detail={activeChapter ? WORLD_DETAILS[activeChapter.id] ?? null : null}
        onClose={() => setDetailOpen(false)}
        startTab={panelTab}
        description={activeChapter?.description}
        scaleNote={
          scale
            ? `If the Sun were a door 2 m tall, ${scale.name} would be ${scale.size} across (${scale.like}) and ${scale.distance} away.`
            : undefined
        }
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
        <div className="spin-hint" key={`hint-${active}-${mode}`} aria-hidden="true">
          {mode === 'interactive' ? 'Drag to orbit · pinch to zoom' : 'Drag to rotate'}
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

        {/* every chapter, one tap away (the rail is hidden on a phone) */}
        {!flying && (
          <ChapterMenu
            chapters={JOURNEY.map((chapter) => ({ id: chapter.id, name: titleCase(chapter.label), accent: chapter.accent }))}
            section={section}
            onGo={(index) => goToSection(index)}
          />
        )}

        {/* three small tools: fly, real motion, sound; and search */}
        <div className="hud-tools">
          {!flying && (
            <button
              type="button"
              className="tool-button palette-button"
              aria-label="Search everything (Ctrl K)"
              data-tip="Search · Ctrl K"
              onClick={() => setPaletteOpen(true)}
            >
              <Icon name="search" />
            </button>
          )}
          <button
            type="button"
            className="tool-button"
            aria-pressed={flying}
            aria-label={flying ? 'Leave flight' : 'Fly the Shuttle anywhere'}
            data-tip={flying ? 'Leave flight' : 'Fly the Shuttle'}
            onClick={() => (flying ? land() : takeOff())}
          >
            <Icon name="shuttle" />
          </button>
          {!flying && (
            <button
              type="button"
              className="tool-button"
              aria-pressed={mode === 'interactive'}
              aria-label={mode === 'cinematic' ? 'Camera: cinematic. Switch to interactive' : 'Camera: interactive. Switch to cinematic'}
              data-tip={mode === 'cinematic' ? 'Camera: cinematic' : 'Camera: interactive'}
              onClick={switchMode}
            >
              <Icon name={mode === 'cinematic' ? 'camera' : 'orbit'} />
            </button>
          )}
          <MotionControl />
          <SoundToggle section={section} />
        </div>
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

      {/* the hop just flown, as it really is today */}
      <AnimatePresence>
        {leg && !flying && (
          <motion.div
            key={`${leg.from}-${leg.to}`}
            className="leg"
            role="status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
          >
            <span className="leg-route">
              {leg.from} <i aria-hidden="true">→</i> {leg.to}
            </span>
            <span className="leg-figures">
              {leg.distance} apart today · light takes <b>{leg.light}</b>
            </span>
            <span className="leg-beam" aria-hidden="true" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* the scene's time, and its speed (a wide screen) */}
      {!flying && <TimeBar />}
      {!flying && section > 0 && <ZoomControl />}

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
          {textShown && section === 0 && !openingOn && (
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
              <div className="hero-actions">
                <button type="button" className="btn btn--primary btn--lg" onClick={scrollToStart}>
                  Begin the journey
                  <Icon name="arrow" className="is-down" />
                </button>
                <button type="button" className="btn btn--ghost btn--lg" onClick={takeOff}>
                  <Icon name="shuttle" />
                  Fly the Shuttle
                </button>
              </div>
              <button type="button" className="true-size opening-start" onClick={startOpening}>
                <Icon name="play" />
                Watch the opening
                <span className="true-size-hint">50 seconds, with sound</span>
              </button>
              {today && (
                <p className="hero-note">
                  Planets start where they are today, {today}
                </p>
              )}
              <LiveCounter />
            </motion.div>
          )}

          {textShown && activeChapter && (
            <motion.div
              key={activeChapter.id}
              className="story-content"
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 1.1, ease: EASE_OUT_EXPO } }}
              exit={{ opacity: 0, y: -12, filter: 'blur(4px)', transition: { duration: 0.45, ease: 'easeIn' } }}
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

                <motion.p
                  className="story-description"
                  aria-hidden="true"
                  initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: 0.9, delay: 0.28, ease: EASE_OUT_EXPO }}
                >
                  {withKeyWords(brief(activeChapter.description), activeChapter.id)}
                </motion.p>

                <div className="inline-stats" aria-hidden="true">
                  {activeChapter.stats.map((stat, statIndex) => (
                    <motion.div
                      className="inline-stat"
                      key={stat.label}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.8,
                        delay: 0.42 + statIndex * 0.09,
                        ease: EASE_OUT_EXPO,
                      }}
                    >
                      <strong>
                        <CountUp value={stat.value} delay={0.5 + statIndex * 0.09} />
                      </strong>
                      <span>{stat.label}</span>
                    </motion.div>
                  ))}
                </div>

                {sizeKm !== undefined && (
                  <motion.button
                    type="button"
                    className="true-size"
                    onClick={startReveal}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.62, ease: EASE_OUT_EXPO }}
                  >
                    <Icon name="scale" />
                    See its true size
                    <span className="true-size-hint">beside Earth</span>
                  </motion.button>
                )}
                {(flyTarget !== undefined || ['sun', 'beyond', 'galaxy', 'local-group'].includes(activeChapter.id)) && (
                  <motion.button
                    type="button"
                    className="true-size film-start"
                    onClick={() => startFilm()}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.66, ease: EASE_OUT_EXPO }}
                  >
                    <Icon name="play" />
                    Watch it as a film
                    <span className="true-size-hint">six shots</span>
                  </motion.button>
                )}
                {activeChapter.id === 'earth' && (
                  <motion.button
                    type="button"
                    className="true-size film-start station-start"
                    onClick={() => startFilm(4)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.7, ease: EASE_OUT_EXPO }}
                  >
                    <Icon name="orbit" />
                    See the Space Station
                    <span className="true-size-hint">418 km up</span>
                  </motion.button>
                )}
                {activeChapter.id === 'earth' && (
                  <motion.button
                    type="button"
                    className="true-size film-start station-start himalaya-start"
                    onClick={() => startFilm(2)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.8, ease: EASE_OUT_EXPO }}
                  >
                    <Icon name="land" />
                    See the Himalayas
                    <span className="true-size-hint">8,849 m</span>
                  </motion.button>
                )}
                {activeChapter.id === 'galaxy' && (
                  <motion.button
                    type="button"
                    className="true-size film-start station-start dive-start"
                    onClick={startDive}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.7, ease: EASE_OUT_EXPO }}
                  >
                    <Icon name="arrow" />
                    Dive to the centre
                    <span className="true-size-hint">26,000 light-years, by scroll</span>
                  </motion.button>
                )}

                <motion.div
                  className="story-actions"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.7, ease: EASE_OUT_EXPO }}
                >
                {WORLD_DETAILS[activeChapter.id] && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      setPanelTab('overview')
                      setDetailOpen(true)
                    }}
                    aria-expanded={detailOpen}
                  >
                    More about {moreAbout(activeChapter)}
                    <Icon name="plus" />
                  </button>
                )}

                {flyTarget !== undefined && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      // take the ship and warp straight there
                      pilot.warpRequest = flyTarget
                      takeOff()
                    }}
                  >
                    Fly there
                    <Icon name="arrow" className="is-up" />
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn--text"
                  onClick={() => goToSection(section + 1)}
                >
                  {active < JOURNEY.length - 1
                    ? `Next: ${titleCase(JOURNEY[active + 1].label)}`
                    : 'Continue'}
                  <Icon name="arrow" />
                </button>
                </motion.div>
              </div>
            </motion.div>
          )}

          {textShown && section === TOTAL_SECTIONS - 1 && (
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
                Eight worlds, one star, one galaxy among many: a tiny corner of
                a much larger universe. <strong>And this is only the beginning.</strong>
              </p>
              <div className="hero-actions return-actions">
                <button type="button" className="btn btn--primary btn--lg" onClick={() => goToSection(0)}>
                  <Icon name="arrow" className="is-up-straight" />
                  Start again
                </button>
                <button type="button" className="btn btn--ghost btn--lg" onClick={takeOff}>
                  <Icon name="shuttle" />
                  Fly the Shuttle
                </button>
              </div>
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
