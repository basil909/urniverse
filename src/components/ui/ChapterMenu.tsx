'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

/* The chapter menu in the top bar: the chapter you are in, and a list of
   every one to jump to. The rail does this on a wide screen; on a phone
   it is the only way round. Closes with Esc, a click outside, or a
   choice. */

type Entry = { id: string; name: string; accent: string }

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export default function ChapterMenu({
  chapters,
  section,
  onGo,
}: {
  chapters: Entry[]
  /* 0: the start; 1..n: the chapters; n + 1: the end */
  section: number
  onGo: (section: number) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const current = section >= 1 && section <= chapters.length ? chapters[section - 1] : null
  const label = current ? current.name : section === 0 ? 'Start' : 'The end'
  const number = current ? String(section).padStart(2, '0') : null

  useEffect(() => {
    if (!open) return
    const items = () => [...(root.current?.querySelectorAll<HTMLButtonElement>('.chapter-menu-item') ?? [])]
    // open on the chapter you are in
    const frame = window.requestAnimationFrame(() => {
      const list = items()
      ;(list.find((item) => item.classList.contains('is-here')) ?? list[0])?.focus({ preventScroll: true })
    })
    /* while it is open the arrow keys move through it (first, and no
       further: the page's own arrow keys travel between chapters) */
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation()
        setOpen(false)
        button.current?.focus()
        return
      }
      const list = items()
      if (!list.length) return
      const at = list.indexOf(document.activeElement as HTMLButtonElement)
      let next = -1
      if (event.key === 'ArrowDown') next = at < 0 ? 0 : Math.min(list.length - 1, at + 1)
      else if (event.key === 'ArrowUp') next = at < 0 ? list.length - 1 : Math.max(0, at - 1)
      else if (event.key === 'Home' || event.key === 'PageUp') next = 0
      else if (event.key === 'End' || event.key === 'PageDown') next = list.length - 1
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = at
      if (next < 0) return
      event.preventDefault()
      event.stopImmediatePropagation()
      list[next]?.focus()
    }
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const go = (target: number) => {
    setOpen(false)
    onGo(target)
  }

  return (
    <div ref={root} className={`chapter-menu ${section === 0 ? 'is-start' : ''}`}>
      <button
        ref={button}
        type="button"
        className="chapter-menu-button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Chapters: now ${label}`}
        onClick={() => setOpen((value) => !value)}
      >
        {number && <span className="chapter-menu-number">{number}</span>}
        <span className="chapter-menu-name">{label}</span>
        <svg className="chapter-menu-chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.6l3 3 3-3" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.nav
            className="chapter-menu-list"
            aria-label="Chapters"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.22, ease: EASE }}
            data-lenis-prevent
          >
            <button type="button" className={`chapter-menu-item ${section === 0 ? 'is-here' : ''}`} onClick={() => go(0)}>
              <span className="chapter-menu-dot" style={{ background: 'rgba(255,255,255,0.5)' }} />
              <span className="chapter-menu-item-number">00</span>
              Start
            </button>
            {chapters.map((chapter, i) => (
              <button
                key={chapter.id}
                type="button"
                className={`chapter-menu-item ${section === i + 1 ? 'is-here' : ''}`}
                aria-current={section === i + 1 ? 'true' : undefined}
                onClick={() => go(i + 1)}
              >
                <span className="chapter-menu-dot" style={{ background: chapter.accent }} />
                <span className="chapter-menu-item-number">{String(i + 1).padStart(2, '0')}</span>
                {chapter.name}
              </button>
            ))}
            <button
              type="button"
              className={`chapter-menu-item ${section === chapters.length + 1 ? 'is-here' : ''}`}
              onClick={() => go(chapters.length + 1)}
            >
              <span className="chapter-menu-dot" style={{ background: 'rgba(255,255,255,0.5)' }} />
              <span className="chapter-menu-item-number">{String(chapters.length + 1).padStart(2, '0')}</span>
              The end
            </button>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  )
}
