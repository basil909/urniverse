'use client'

import { useEffect, useRef, useState } from 'react'

import { pilot, resetPilotInput, setView, TIME_STEPS, VIEW_STEPS } from '../experience/pilotState'
import { FlightAudio, SOUND_EVENT, soundSwitch } from './flightAudio'

/* the first flight's guide: three steps, shown once (remembered) */
const GUIDE_KEY = 'urniverse-flight-guide'
const GUIDE = [
  'Move the mouse to steer · hold W (or click) to fly',
  'Press 3, or click a world’s marker, to warp there',
  'Below 8 km, press L to land · W lifts off again',
]

/* round to two significant figures: 3,200, 48,000, 450 */
const round2 = (value: number) => Number(value.toPrecision(2)).toLocaleString('en-GB')

/* altitude above the nearest planet, readable at any distance */
function formatAltitude(km: number) {
  if (km >= 3e12) return `${(km / 9.4607e12).toFixed(2)} light-years away`
  if (km >= 7.5e9) return `${Math.round(km / 1.496e8).toLocaleString('en-GB')} AU away`
  if (km >= 1e9) return `${(km / 1e9).toFixed(1)} billion km up`
  if (km >= 1e6) return `${(km / 1e6).toFixed(1)} million km up`
  return `${round2(km)} km up`
}

/* a marker's distance, short: 8,400 km, 380,000 km, 225M km, 4.3B km */
function formatShort(km: number) {
  if (km >= 3e12) return `${(km / 9.4607e12).toFixed(km >= 9.4607e13 ? 0 : 1)} ly`
  if (km >= 7.5e9) return `${Math.round(km / 1.496e8).toLocaleString('en-GB')} AU`
  if (km >= 1e9) return `${(km / 1e9).toFixed(1)}B km`
  if (km >= 1e6) return `${Math.round(km / 1e6).toLocaleString('en-GB')}M km`
  return `${round2(km)} km`
}

/* the worlds, as the markers list them (index -1: the Sun) */
const nearAny = (...ids: number[]) => () => ids.includes(pilot.nearestIndex)
const STAR_NAMES = [
  'Proxima Centauri', 'Alpha Centauri A', "Barnard's Star", 'Sirius', 'Procyon', 'Altair', 'Vega', 'Fomalhaut', 'Arcturus',
  'Capella', 'Aldebaran', 'Pollux', 'Regulus', 'Betelgeuse', 'Rigel', 'Polaris', 'Antares', 'Deneb', 'Spica', 'Canopus',
]
const WORLDS: { index: number; name: string; key: string; parent?: number; show?: () => boolean }[] = [
  { index: -1, name: 'Sun', key: '0' },
  { index: 0, name: 'Mercury', key: '1' },
  { index: 1, name: 'Venus', key: '2' },
  { index: 2, name: 'Earth', key: '3' },
  { index: 3, name: 'Mars', key: '4' },
  { index: 4, name: 'Jupiter', key: '5' },
  { index: 5, name: 'Saturn', key: '6' },
  { index: 6, name: 'Uranus', key: '7' },
  { index: 7, name: 'Neptune', key: '8' },
  // the largest asteroids
  { index: 8, name: 'Ceres', key: '9' },
  { index: 9, name: 'Vesta', key: '' },
  { index: 10, name: 'Pallas', key: '' },
  { index: 11, name: 'Hygiea', key: '' },
  { index: 12, name: 'Moon', key: '' },
  // the large moons: shown near their planet
  { index: 13, name: 'Io', key: '', parent: 4 },
  { index: 14, name: 'Europa', key: '', parent: 4 },
  { index: 15, name: 'Ganymede', key: '', parent: 4 },
  { index: 16, name: 'Callisto', key: '', parent: 4 },
  { index: 17, name: 'Titan', key: '', parent: 5 },
  { index: 18, name: 'Phobos', key: '', parent: 3 },
  { index: 19, name: 'Deimos', key: '', parent: 3 },
  // spacecraft: near Earth (or the Moon), out past the planets, on Mars
  { index: 20, name: 'Space Station', key: '', show: nearAny(2, 12, 20, 21, 22) },
  { index: 21, name: 'Hubble', key: '', show: nearAny(2, 12, 20, 21, 22) },
  { index: 22, name: 'Webb', key: '', show: nearAny(2, 12, 20, 21, 22) },
  { index: 23, name: 'Voyager 1', key: '', show: () => pilot.sunAU > 30 || pilot.nearestIndex === 23 },
  { index: 24, name: 'Voyager 2', key: '', show: () => pilot.sunAU > 30 || pilot.nearestIndex === 24 },
  { index: 25, name: 'Perseverance', key: '', show: nearAny(3, 25) },
  // the stars: once you are out beyond the planets
  ...STAR_NAMES.map((name, i) => ({
    index: 26 + i,
    name,
    key: '',
    show: () => pilot.sunAU > 60 || pilot.nearestIndex >= 26 || pilot.warping !== '',
  })),
]

const FEATURE_SLOTS = 12

/* how long one orbit takes */
function formatPeriod(minutes: number) {
  if (minutes < 120) return `${Math.round(minutes)} min`
  if (minutes < 48 * 60) return `${(minutes / 60).toFixed(1)} h`
  return `${(minutes / 1440).toFixed(1)} days`
}

const timeLabel = (scale: number) =>
  scale === 0 ? 'Time held still' : scale === 1 ? 'Real time' : `Time ×${scale.toLocaleString('en-GB')}`

/* true speed, and past light speed, as a multiple of it */
const LIGHT_KMS = 299792.458
function formatSpeed(kms: number) {
  if (kms < 0.05) return ''
  if (kms >= LIGHT_KMS * 0.995) {
    const times = kms / LIGHT_KMS
    return times < 1.05 ? 'light speed' : `${times < 10 ? times.toFixed(1) : Math.round(times)}× light speed`
  }
  if (kms < 1) return `${round2(kms * 1000)} m/s`
  return `${round2(kms)} km/s`
}

/* While flying: the controls (mouse, keys, touch), and a minimal HUD:
   the nearest world, a speed bar, a hint that fades, "Land", and for the
   mouse a faint steering guide: a ring marks the centre, where the ship
   flies straight, and a line runs from it to the pointer.
   Every world has a marker: a small ring where it is on screen (gone once
   the world itself is big enough to see), or an arrow at the edge of the
   screen pointing the way to it, with its name and distance. Clicking a
   marker (or pressing 1-8, 0 for the Sun) warps there. */
/* 'the Moon' -> 'The Moon' at the start of a line */
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export default function FlightHud({ onLand }: { onLand: () => void }) {
  const [nearest, setNearest] = useState('')
  const [altitude, setAltitude] = useState(-1)
  const [speed, setSpeed] = useState(0)
  const [kms, setKms] = useState(0)
  const [hint, setHint] = useState(true)
  const [touch, setTouch] = useState(false)
  const guide = useRef<SVGSVGElement>(null)
  const guideLine = useRef<SVGLineElement>(null)
  const markerRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [warping, setWarping] = useState('')
  const [landState, setLandState] = useState('flying')
  const [canLand, setCanLand] = useState(false)
  const [site, setSite] = useState('')
  const [photo, setPhoto] = useState(false)
  const [toast, setToast] = useState('')
  const [immersion, setImmersion] = useState(0)
  const [pressure, setPressure] = useState(0)
  const [guideStep, setGuideStep] = useState(-1)
  const haze = useRef<HTMLDivElement>(null)
  const featureRefs = useRef<(HTMLSpanElement | null)[]>([])
  const [orbiting, setOrbiting] = useState(false)
  const [orbitMinutes, setOrbitMinutes] = useState(0)
  const [timeScale, setTimeScale] = useState(0)
  const mist = useRef<HTMLDivElement>(null)
  const heatGlare = useRef<HTMLDivElement>(null)
  const [hullK, setHullK] = useState(0)

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    setTouch(coarse)
    const hintTimer = window.setTimeout(() => setHint(false), 7000)
    let toastTimer = 0
    let lastSunAU = pilot.sunAU
    const showToast = (text: string) => {
      setToast(text)
      window.clearTimeout(toastTimer)
      toastTimer = window.setTimeout(() => setToast(''), 3200)
    }
    const hud = window.setInterval(() => {
      setNearest(pilot.nearest)
      setSpeed(pilot.speed)
      setAltitude(pilot.altitudeKm)
      setKms(pilot.kms)
      setWarping(pilot.warping)
      setLandState(pilot.landState)
      setCanLand(pilot.canLand)
      const { lat, lon } = pilot.site
      setSite(`${Math.abs(lat).toFixed(1)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(1)}° ${lon < 0 ? 'W' : 'E'}`)
      setImmersion(pilot.immersion)
      setHullK(pilot.hullK)
      // crossing the heliopause, where the Sun's wind meets the galaxy's
      if (lastSunAU < 120 && pilot.sunAU >= 120) showToast('Leaving the heliosphere: interstellar space begins')
      else if (lastSunAU >= 120 && pilot.sunAU < 120 && pilot.active) showToast('Back inside the heliosphere')
      lastSunAU = pilot.sunAU
      setOrbiting(pilot.orbiting)
      setOrbitMinutes(pilot.orbitMinutes)
      setTimeScale(pilot.timeScale)
      setPressure(pilot.pressureBar)
      // the guide moves on as each step is done
      setGuideStep((step) => {
        if (step < 0) return step
        if (step === 0 && pilot.kms > 0.5 && (Math.abs(pilot.steer.x) > 0.15 || Math.abs(pilot.steer.y) > 0.15)) return 1
        if (step === 1 && pilot.warping) return 2
        if (step === 2 && pilot.landState === 'landed') {
          try {
            localStorage.setItem(GUIDE_KEY, 'done')
          } catch {}
          return -1
        }
        return step
      })
    }, 150)
    try {
      if (!localStorage.getItem(GUIDE_KEY)) setGuideStep(0)
    } catch {}

    // sound, when the switch is on (it can be flipped mid-flight)
    let audio: FlightAudio | null = null
    let lastLand = pilot.landState
    const syncSound = () => {
      if (soundSwitch.on && !audio) {
        try {
          audio = new FlightAudio()
          audio.start()
        } catch {
          audio = null
        }
      } else if (!soundSwitch.on && audio) {
        audio.stop()
        audio = null
      }
    }
    syncSound()
    window.addEventListener(SOUND_EVENT, syncSound)

    // markers follow the worlds every frame, without re-rendering
    let frame = 0
    const place = () => {
      frame = requestAnimationFrame(place)
      audio?.update({ thrust: pilot.thrust, air: pilot.air, kms: pilot.kms, heat: pilot.heat, warp: pilot.warpGlow })
      if (pilot.landState === 'landed' && lastLand !== 'landed') audio?.touchdown()
      lastLand = pilot.landState
      // inside a giant's clouds: its haze, darkening with depth
      if (haze.current) {
        const deep = pilot.immersion
        haze.current.style.opacity = deep > 0 ? String(0.35 + 0.6 * deep) : '0'
        haze.current.style.background = `radial-gradient(circle at 50% 40%, ${pilot.hazeColor} 0%, color-mix(in srgb, ${pilot.hazeColor} ${Math.round(100 - deep * 85)}%, #000) 100%)`
      }
      // the Sun close by: its glare floods in
      if (heatGlare.current) heatGlare.current.style.opacity = String(pilot.sunHeat * 0.7)
      // Earth's cloud deck: white mist by day, grey by night
      if (mist.current) {
        const light = Math.round(30 + pilot.mistLight * 205)
        mist.current.style.opacity = String(Math.min(0.92, pilot.mist * 0.95))
        mist.current.style.background = `rgb(${light}, ${light + 4}, ${light + 10})`
      }
      const width = window.innerWidth
      const height = window.innerHeight
      // keep clear of the readout below and the toolbar above
      const insetX = 46
      const insetTop = 64
      const insetBottom = 104
      const placed: { x: number; y: number; km: number; label: HTMLElement }[] = []
      pilot.markers.forEach((marker) => {
        const slot = WORLDS.findIndex((world) => world.index === marker.index)
        const element = markerRefs.current[slot]
        if (!element) return
        const onScreen = marker.ahead && Math.abs(marker.x) < 0.94 && Math.abs(marker.y) < 0.9
        let x: number
        let y: number
        if (onScreen) {
          x = ((marker.x + 1) / 2) * width
          y = ((1 - marker.y) / 2) * height
        } else {
          // off screen (or behind): an arrow at the edge, pointing the way
          let dx = marker.x * (width / 2)
          let dy = -marker.y * (height / 2)
          if (!marker.ahead) {
            dx = -dx
            dy = -dy
          }
          if (Math.hypot(dx, dy) < 1e-3) dy = height
          const reach = Math.min(
            (width / 2 - insetX) / Math.abs(dx || 1e-6),
            (height / 2 - (dy < 0 ? insetTop : insetBottom)) / Math.abs(dy || 1e-6),
          )
          x = width / 2 + dx * reach
          y = height / 2 + dy * reach
          element.style.setProperty('--angle', `${Math.atan2(dy, dx)}rad`)
        }
        element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
        element.dataset.edge = onScreen ? 'false' : 'true'
        element.dataset.side = x > width * 0.62 ? 'left' : 'right'
        // once the world itself is plainly visible, its marker steps aside;
        // a planet's moons only show near it
        const parent = WORLDS[slot].parent
        const show = WORLDS[slot].show
        const away =
          (parent !== undefined && pilot.nearestIndex !== parent && pilot.nearestIndex !== marker.index) ||
          (show !== undefined && !show())
        element.classList.toggle('is-hidden', marker.radiusPx > 40 || away)
        element.classList.toggle('is-target', pilot.warping !== '' && pilot.warping.endsWith(WORLDS[slot].name))
        const label = element.querySelector<HTMLElement>('.flight-marker-label')
        if (label) {
          const text = `${WORLDS[slot].name} · ${formatShort(marker.km)}`
          if (label.textContent !== text) label.textContent = text
          placed.push({ x, y, km: marker.km, label })
        }
      })
      // named features on the ground below
      featureRefs.current.forEach((element, i) => {
        if (!element) return
        const feature = pilot.features[i]
        element.style.opacity = feature ? '1' : '0'
        if (!feature) return
        element.style.transform = `translate(${(((feature.x + 1) / 2) * width).toFixed(1)}px, ${(((1 - feature.y) / 2) * height).toFixed(1)}px)`
        if (element.textContent !== feature.name) element.textContent = feature.name
      })
      // where markers crowd (the inner planets from far away), only the
      // nearest keeps its name
      placed.sort((a, b) => a.km - b.km)
      placed.forEach((item, i) => {
        const crowded = placed.slice(0, i).some((other) => Math.abs(other.x - item.x) < 90 && Math.abs(other.y - item.y) < 16)
        item.label.classList.toggle('is-quiet', crowded)
      })
    }
    frame = requestAnimationFrame(place)

    const key = (event: KeyboardEvent) => event.key.toLowerCase()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onLand()
        return
      }
      const world = WORLDS.find((entry) => entry.key !== '' && entry.key === event.key)
      if (world && !event.repeat) {
        pilot.warpRequest = world.index
        return
      }
      if (event.key.toLowerCase() === 'k' && !event.repeat) {
        // save the view as a picture, read straight after the next frame
        const canvas = document.querySelector<HTMLCanvasElement>('canvas')
        if (canvas) {
          requestAnimationFrame(() => {
            canvas.toBlob((blob) => {
              if (!blob) return
              const link = document.createElement('a')
              const where = (pilot.nearest || 'space').replace(/^the /, '').toLowerCase()
              link.download = `you-are-here-${where}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`
              link.href = URL.createObjectURL(blob)
              link.click()
              window.setTimeout(() => URL.revokeObjectURL(link.href), 4000)
            }, 'image/png')
          })
          setToast('Photo saved')
          window.clearTimeout(toastTimer)
          toastTimer = window.setTimeout(() => setToast(''), 1600)
        }
        return
      }
      if (event.key.toLowerCase() === 'o' && !event.repeat) {
        pilot.orbiting = !pilot.orbiting
        setToast(pilot.orbiting ? 'Orbit' : 'Leaving orbit')
        window.clearTimeout(toastTimer)
        toastTimer = window.setTimeout(() => setToast(''), 1600)
        return
      }
      if (event.key.toLowerCase() === 't' && !event.repeat) {
        const at = TIME_STEPS.indexOf(pilot.timeScale)
        pilot.timeScale = TIME_STEPS[(at + 1) % TIME_STEPS.length]
        setToast(timeLabel(pilot.timeScale))
        window.clearTimeout(toastTimer)
        toastTimer = window.setTimeout(() => setToast(''), 1600)
        return
      }
      if (event.key.toLowerCase() === 'v' && !event.repeat) {
        const order = ['chase', 'flyby', 'orbit'] as const
        pilot.cameraMode = order[(order.indexOf(pilot.cameraMode) + 1) % order.length]
        setToast(pilot.cameraMode === 'chase' ? 'Chase camera' : pilot.cameraMode === 'flyby' ? 'Fly-by camera' : 'Orbit camera')
        window.clearTimeout(toastTimer)
        toastTimer = window.setTimeout(() => setToast(''), 1600)
        return
      }
      if (event.key.toLowerCase() === 'p' && !event.repeat) {
        pilot.photo = !pilot.photo
        setPhoto(pilot.photo)
        document.documentElement.classList.toggle('is-photo', pilot.photo)
        return
      }
      if (event.key.toLowerCase() === 'l' && !event.repeat) {
        pilot.landRequest = true
        return
      }
      if (event.key.toLowerCase() === 'c' && !event.repeat) {
        // step the camera back: chase, far, very far, and in again
        const next = VIEW_STEPS.find((step) => step > pilot.viewTarget * 1.05)
        setView(next ?? VIEW_STEPS[0])
        return
      }
      const k = key(event)
      if (['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
        event.preventDefault()
        pilot.keys.add(k === ' ' ? 'w' : k)
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      const k = key(event)
      pilot.keys.delete(k === ' ' ? 'w' : k)
    }

    // mouse: steer by the pointer's offset from the centre of the screen
    let dragFrom: { x: number; y: number } | null = null
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') {
        pilot.steer.x = (event.clientX / window.innerWidth) * 2 - 1
        pilot.steer.y = (event.clientY / window.innerHeight) * 2 - 1
        guide.current?.classList.add('is-on')
        guideLine.current?.setAttribute('x2', String(event.clientX))
        guideLine.current?.setAttribute('y2', String(event.clientY))
      } else if (dragFrom) {
        // touch: steer by dragging from where the finger landed
        pilot.steer.x = Math.max(-1, Math.min(1, (event.clientX - dragFrom.x) / 110))
        pilot.steer.y = Math.max(-1, Math.min(1, (event.clientY - dragFrom.y) / 110))
      }
    }
    const onDown = (event: PointerEvent) => {
      if ((event.target as Element).closest('button')) return
      if (event.pointerType === 'mouse') pilot.keys.add('w') // hold to fly
      else dragFrom = { x: event.clientX, y: event.clientY }
    }
    const onUp = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') pilot.keys.delete('w')
      else {
        dragFrom = null
        pilot.steer.x = 0
        pilot.steer.y = 0
      }
    }
    const onBlur = () => resetPilotInput()
    // the scroll wheel pulls the camera back (or in), smoothly
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      setView(pilot.viewTarget * Math.exp(event.deltaY * 0.004))
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.clearTimeout(hintTimer)
      window.clearTimeout(toastTimer)
      window.removeEventListener(SOUND_EVENT, syncSound)
      audio?.stop()
      pilot.photo = false
      pilot.cameraMode = 'chase'
      document.documentElement.classList.remove('is-photo')
      window.clearInterval(hud)
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('wheel', onWheel)
      resetPilotInput()
    }
  }, [onLand])

  return (
    <div className={`flight-hud ${landState === 'landed' ? 'is-landed' : ''} ${photo ? 'is-photo' : ''}`}>
      {toast && <p className="flight-toast">{toast}</p>}
      <div ref={haze} className="flight-haze" aria-hidden="true" />
      <div ref={mist} className="flight-mist" aria-hidden="true" />
      <div ref={heatGlare} className="flight-heat" aria-hidden="true" />
      {guideStep >= 0 && (
        <div className="flight-guide-card" role="status">
          <span className="flight-guide-step">{guideStep + 1} / 3</span>
          <span>{GUIDE[guideStep]}</span>
          <button
            type="button"
            onClick={() => {
              setGuideStep(-1)
              try {
                localStorage.setItem(GUIDE_KEY, 'done')
              } catch {}
            }}
          >
            Skip
          </button>
        </div>
      )}
      {!touch && (
        <svg ref={guide} className="flight-guide" aria-hidden="true">
          <circle cx="50%" cy="50%" r="18" />
          <line ref={guideLine} x1="50%" y1="50%" x2="50%" y2="50%" />
        </svg>
      )}
      <div className="flight-features" aria-hidden="true">
        {Array.from({ length: FEATURE_SLOTS }, (_, i) => (
          <span
            key={i}
            className="flight-feature"
            ref={(element) => {
              featureRefs.current[i] = element
            }}
          />
        ))}
      </div>

      <div className="flight-markers">
        {WORLDS.map((world, i) => (
          <button
            key={world.name}
            type="button"
            className="flight-marker"
            data-edge="false"
            aria-label={world.key ? `Warp to ${world.name} (${world.key})` : `Warp to ${world.name}`}
            ref={(element) => {
              markerRefs.current[i] = element
            }}
            onClick={() => (pilot.warpRequest = world.index)}
          >
            <span className="flight-marker-mark" aria-hidden="true" />
            <span className="flight-marker-label" />
          </button>
        ))}
      </div>

      <div className="flight-readout" aria-live="polite">
        <span className="flight-near">
          {warping
            ? [`Warping to ${warping}`, formatSpeed(kms), 'S to stop'].filter(Boolean).join(' · ')
            : nearest === 'the Sun' && hullK > 600
              ? `The Sun · hull ${Math.round(hullK - 273).toLocaleString('en-GB')} °C${hullK > 1500 ? ' · the heat holds you back' : ''}`
            : orbiting
              ? `Orbiting ${nearest} · ${formatSpeed(kms)} · once round every ${formatPeriod(orbitMinutes)}`
            : immersion > 0
              ? `Inside ${nearest}’s clouds · ${pressure < 10 ? pressure.toFixed(1) : Math.round(pressure)} bar${immersion > 0.9 ? ' · the pressure turns you back' : ''}`
            : landState === 'landed'
              ? `Landed on ${nearest} · ${site} · W to take off`
              : landState === 'landing'
                ? `Landing on ${nearest} · ${formatAltitude(altitude)}`
                : [altitude >= 0 ? `${capital(nearest)} · ${formatAltitude(altitude)}` : `Near ${nearest}`, formatSpeed(kms)]
                .concat(canLand ? ['L to land'] : [])
                .filter(Boolean)
                .join(' · ')}
        </span>
        {timeScale !== 0 && <span className="flight-time">{timeLabel(timeScale)}</span>}
        <span className="flight-speed" aria-hidden="true">
          <span style={{ transform: `scaleX(${Math.max(0.02, speed)})` }} />
        </span>
      </div>

      {/* credit for the streamed ground data, shown while it is on screen */}
      {nearest === 'Earth' && altitude >= 0 && altitude < 300 && (
        <p className="flight-credit">
          Imagery: Sentinel-2 cloudless 2016 by EOX (s2maps.eu), contains modified Copernicus Sentinel data ·
          Elevation: Terrain Tiles, AWS Open Data
        </p>
      )}

      <p className={`flight-hint ${hint ? '' : 'is-hidden'}`}>
        {touch
          ? 'Drag to steer · hold Thrust to fly · tap a world to warp there'
          : 'Steer with the mouse or arrows · W or click to fly · click a world or 1–8 to warp · L land · O orbit · T time · V camera · P photo · Esc exits'}
      </p>

      {touch && (
        <button
          type="button"
          className="flight-thrust"
          onPointerDown={() => (pilot.touchThrust = true)}
          onPointerUp={() => (pilot.touchThrust = false)}
          onPointerCancel={() => (pilot.touchThrust = false)}
          onPointerLeave={() => (pilot.touchThrust = false)}
        >
          Thrust
        </button>
      )}

      <button type="button" className="flight-land" onClick={onLand}>
        Land
      </button>
    </div>
  )
}
