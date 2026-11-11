'use client'

import { useEffect, useRef, useState } from 'react'

import { Soundscape } from './soundscape'

/* The sound switch: off by default. On, a quiet generative score fades
   in and follows the journey's chapters. */
export default function SoundToggle({ section }: { section: number }) {
  const [on, setOn] = useState(false)
  const engine = useRef<Soundscape | null>(null)

  useEffect(() => {
    engine.current?.setSection(section)
  }, [section])

  useEffect(() => () => engine.current?.stop(), [])

  const toggle = async () => {
    if (on) {
      engine.current?.stop()
      engine.current = null
      setOn(false)
      return
    }
    try {
      const soundscape = new Soundscape()
      soundscape.setSection(section)
      await soundscape.start()
      engine.current = soundscape
      setOn(true)
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
      title={on ? 'Sound on' : 'Sound off'}
      onClick={toggle}
    >
      {/* three bars: still when off, gently moving when on */}
      <span className="sound-bars" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </button>
  )
}
