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
      PICKABLE.forEach((world, i) => {
        const button = buttons.current[i]
        const at = pickScreen.worlds.get(world.index)
        if (!button) return
        if (!at || !at.shown) {
          if (button.style.display !== 'none') button.style.display = 'none'
          return
        }
        const r = Math.max(MIN_RADIUS_PX, at.r * 1.15)
        button.style.display = 'block'
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
