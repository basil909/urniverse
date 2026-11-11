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
   flies straight, and a line runs from it to the pointer. */
export default function FlightHud({ onLand }: { onLand: () => void }) {
  const [nearest, setNearest] = useState('')
  const [altitude, setAltitude] = useState(-1)
  const [speed, setSpeed] = useState(0)
  const [kms, setKms] = useState(0)
  const [hint, setHint] = useState(true)
  const [touch, setTouch] = useState(false)
  const guide = useRef<SVGSVGElement>(null)
  const guideLine = useRef<SVGLineElement>(null)

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    setTouch(coarse)
    const hintTimer = window.setTimeout(() => setHint(false), 7000)
    const hud = window.setInterval(() => {
      setNearest(pilot.nearest)
      setSpeed(pilot.speed)
      setAltitude(pilot.altitudeKm)
      setKms(pilot.kms)
    }, 150)

    const key = (event: KeyboardEvent) => event.key.toLowerCase()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onLand()
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
      window.clearInterval(hud)
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
    <div className="flight-hud">
      {!touch && (
        <svg ref={guide} className="flight-guide" aria-hidden="true">
          <circle cx="50%" cy="50%" r="18" />
          <line ref={guideLine} x1="50%" y1="50%" x2="50%" y2="50%" />
        </svg>
      )}
      <div className="flight-readout" aria-live="polite">
        <span className="flight-near">
          {[altitude >= 0 ? `${nearest} · ${formatAltitude(altitude)}` : `Near ${nearest}`, formatSpeed(kms)]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="flight-speed" aria-hidden="true">
          <span style={{ transform: `scaleX(${Math.max(0.02, speed)})` }} />
        </span>
      </div>

      <p className={`flight-hint ${hint ? '' : 'is-hidden'}`}>
        {touch
          ? 'Drag to steer · hold Thrust to fly'
          : 'Steer with the mouse or arrows · W or click to fly, S to slow · Shift warp · scroll or C to pull back · Esc lands'}
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
