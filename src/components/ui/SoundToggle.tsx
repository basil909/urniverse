'use client'

import { useEffect, useRef, useState } from 'react'

import Icon from './Icon'
import { Soundscape } from './soundscape'
import { SOUND_EVENT, soundSwitch } from './flightAudio'
import { FILM_SCORE_EVENT } from './filmScore'
import { journeyMotion } from '../experience/viewMode'

/* what the hand passes over: worlds (a whoosh) and points of interest (a
   tick); every press, a click */
const WORLDS = '.planet-pick'
const POINTS = '.hotspot-dot, .moon-tag button, .rail-item, .chapter-menu-item, .flight-marker, .film-dot'

/* The sound switch: off by default. On, a quiet generative score fades
   in and follows the journey's chapters. */
export default function SoundToggle({ section }: { section: number }) {
  const [on, setOn] = useState(false)
  const engine = useRef<Soundscape | null>(null)

  useEffect(() => {
    engine.current?.setSection(section)
  }, [section])

  useEffect(() => () => engine.current?.stop(), [])

  // while it plays: the drone follows the journey, the hand is heard
  useEffect(() => {
    if (!on) return
    const timer = window.setInterval(() => engine.current?.setMotion(journeyMotion.depth, journeyMotion.speed), 100)
    let over: Element | null = null
    const onOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const target = event.target as Element | null
      const world = target?.closest?.(WORLDS)
      const point = world ? null : target?.closest?.(POINTS)
      const hit = world ?? point ?? null
      if (hit === over) return
      over = hit
      if (!hit) return
      // (each one its own pitch, from its place among its kind)
      const kin = hit.parentElement ? [...hit.parentElement.children].indexOf(hit) : 0
      engine.current?.touch(world ? 'world' : 'point', (kin % 5) * 2)
    }
    const onDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest?.('button, a')) engine.current?.touch('press')
    }
    window.addEventListener('pointerover', onOver)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('pointerover', onOver)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [on])

  // the film's score plays: the ambient soundtrack steps back
  useEffect(() => {
    const onScore = (event: Event) => engine.current?.duck((event as CustomEvent<boolean>).detail)
    window.addEventListener(FILM_SCORE_EVENT, onScore)
    return () => window.removeEventListener(FILM_SCORE_EVENT, onScore)
  }, [])

  const toggle = async () => {
    if (on) {
      engine.current?.stop()
      engine.current = null
      setOn(false)
      soundSwitch.on = false
      window.dispatchEvent(new Event(SOUND_EVENT))
      return
    }
    try {
      const soundscape = new Soundscape()
      soundscape.setSection(section)
      await soundscape.start()
      engine.current = soundscape
      setOn(true)
      soundSwitch.on = true
      window.dispatchEvent(new Event(SOUND_EVENT))
    } catch {
      // no Web Audio: leave the switch off
    }
  }

  return (
    <button
      type="button"
      className="tool-button sound-toggle"
      aria-pressed={on}
      aria-label={on ? 'Turn the soundtrack off' : 'Turn the soundtrack on'}
      data-tip={on ? 'Sound: on' : 'Sound'}
      onClick={toggle}
    >
      {/* three bars: still when off, gently moving when on */}
      <Icon name={on ? 'sound' : 'muted'} />
    </button>
  )
}
