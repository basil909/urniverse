'use client'

import { useEffect, useRef } from 'react'

import { PICKABLE, PICK_EVENT, pickScreen } from '../experience/PlanetPicker'

/* The buttons over each world in the wide views: invisible until pointed
   at (a ring and the name), at least finger-sized, a click or Enter goes
   to the world's chapter. Positions come from the scene each frame. */

const MIN_RADIUS_PX = 18

export default function PickLayer() {
  const layer = useRef<HTMLDivElement>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    let frame = 0
    const place = () => {
      frame = requestAnimationFrame(place)
      if (layer.current) layer.current.style.visibility = pickScreen.on ? 'visible' : 'hidden'
      if (!pickScreen.on) return
      // each world's reach: finger-sized at least; where two would overlap
      // (the Sun and the inner planets, seen from afar), the gap between
      // them is shared out, so a tap always goes to the world nearest it
      const reach = PICKABLE.map((world) => {
        const at = pickScreen.worlds.get(world.index)
        return at && at.shown ? { x: at.x, y: at.y, r: at.r, want: Math.max(MIN_RADIUS_PX, at.r * 1.15) } : null
      })
      PICKABLE.forEach((world, i) => {
        const button = buttons.current[i]
        const at = reach[i]
        if (!button) return
        if (!at) {
          if (button.style.display !== 'none') button.style.display = 'none'
          return
        }
        let r = at.want
        reach.forEach((other, j) => {
          if (!other || j === i) return
          const apart = Math.hypot(other.x - at.x, other.y - at.y)
          if (apart < at.want + other.want) r = Math.min(r, Math.max(at.r, (apart * at.want) / (at.want + other.want)))
        })
        button.style.display = 'block'
        // (and a phone's larger touch area, CSS, kept off a crowded one)
        button.classList.toggle('is-crowded', r < at.want - 0.5)
        button.style.transform = `translate(${(at.x - r).toFixed(1)}px, ${(at.y - r).toFixed(1)}px)`
        button.style.width = button.style.height = `${(r * 2).toFixed(1)}px`
      })
    }
    frame = requestAnimationFrame(place)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div ref={layer} className="planet-picker" style={{ visibility: 'hidden' }}>
      {PICKABLE.map((world, i) => (
        <button
          key={world.name}
          ref={(element) => {
            buttons.current[i] = element
          }}
          type="button"
          className="planet-pick"
          style={{ display: 'none' }}
          aria-label={`Go to ${world.name}`}
          onClick={() => window.dispatchEvent(new CustomEvent(PICK_EVENT, { detail: world.index + 2 }))}
        >
          <span className="planet-pick-name">{world.name}</span>
        </button>
      ))}
    </div>
  )
}
