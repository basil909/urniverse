'use client'

import { useEffect, useRef, useState } from 'react'

import { pilot, resetPilotInput, setView, VIEW_STEPS } from '../experience/pilotState'

/* round to two significant figures: 3,200, 48,000, 450 */
const round2 = (value: number) => Number(value.toPrecision(2)).toLocaleString('en-GB')

/* altitude above the nearest planet, readable at any distance */
function formatAltitude(km: number) {
  if (km >= 1e9) return `${(km / 1e9).toFixed(1)} billion km up`
  if (km >= 1e6) return `${(km / 1e6).toFixed(1)} million km up`
  return `${round2(km)} km up`
}

/* a marker's distance, short: 8,400 km, 380,000 km, 225M km, 4.3B km */
function formatShort(km: number) {
  if (km >= 1e9) return `${(km / 1e9).toFixed(1)}B km`
  if (km >= 1e6) return `${Math.round(km / 1e6).toLocaleString('en-GB')}M km`
  return `${round2(km)} km`
}

/* the worlds, as the markers list them (index -1: the Sun) */
const WORLDS = [
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
]

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

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    setTouch(coarse)
    const hintTimer = window.setTimeout(() => setHint(false), 7000)
    let toastTimer = 0
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
    }, 150)

    // markers follow the worlds every frame, without re-rendering
    let frame = 0
    const place = () => {
      frame = requestAnimationFrame(place)
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
        // once the world itself is plainly visible, its marker steps aside
        element.classList.toggle('is-hidden', marker.radiusPx > 40)
        element.classList.toggle('is-target', pilot.warping !== '' && pilot.warping.endsWith(WORLDS[slot].name))
        const label = element.querySelector<HTMLElement>('.flight-marker-label')
        if (label) {
          const text = `${WORLDS[slot].name} · ${formatShort(marker.km)}`
          if (label.textContent !== text) label.textContent = text
          placed.push({ x, y, km: marker.km, label })
        }
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
      {!touch && (
        <svg ref={guide} className="flight-guide" aria-hidden="true">
          <circle cx="50%" cy="50%" r="18" />
          <line ref={guideLine} x1="50%" y1="50%" x2="50%" y2="50%" />
        </svg>
      )}
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
            ? `Warping to ${warping} · ${formatSpeed(kms)} · S to stop`
            : landState === 'landed'
              ? `Landed on ${nearest} · ${site} · W to take off`
              : landState === 'landing'
                ? `Landing on ${nearest} · ${formatAltitude(altitude)}`
                : [altitude >= 0 ? `${nearest} · ${formatAltitude(altitude)}` : `Near ${nearest}`, formatSpeed(kms)]
                .concat(canLand ? ['L to land'] : [])
                .filter(Boolean)
                .join(' · ')}
        </span>
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
          : 'Steer with the mouse or arrows · W or click to fly, S to slow · click a world or 1–8 to warp · L to land · V camera · P photo · Esc exits'}
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
