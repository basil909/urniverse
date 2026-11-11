'use client'

import { useEffect, useState } from 'react'

import { pilot, resetPilotInput } from '../experience/pilotState'

/* While flying: the controls (mouse, keys, touch), and a minimal HUD:
   the nearest world, a speed bar, a hint that fades, and "Land". */
export default function FlightHud({ onLand }: { onLand: () => void }) {
  const [nearest, setNearest] = useState('')
  const [speed, setSpeed] = useState(0)
  const [hint, setHint] = useState(true)
  const [touch, setTouch] = useState(false)

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    setTouch(coarse)
    const hintTimer = window.setTimeout(() => setHint(false), 7000)
    const hud = window.setInterval(() => {
      setNearest(pilot.nearest)
      setSpeed(pilot.speed)
    }, 150)

    const key = (event: KeyboardEvent) => event.key.toLowerCase()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onLand()
        return
      }
      const k = key(event)
      if (['w', 'a', 's', 'd', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
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

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('blur', onBlur)
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
      resetPilotInput()
    }
  }, [onLand])

  return (
    <div className="flight-hud">
      <div className="flight-readout" aria-live="polite">
        <span className="flight-near">Near {nearest}</span>
        <span className="flight-speed" aria-hidden="true">
          <span style={{ transform: `scaleX(${Math.max(0.02, speed)})` }} />
        </span>
      </div>

      <p className={`flight-hint ${hint ? '' : 'is-hidden'}`}>
        {touch
          ? 'Drag to steer · hold Thrust to fly'
          : 'Steer with the mouse · hold W or click to fly · Shift to boost · Esc to land'}
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
