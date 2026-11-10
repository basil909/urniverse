'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef } from 'react'

import { DETAIL_SOURCE, type WorldDetail } from '../../data/worlds'

/* A quiet, scrollable deep-dive for the current world. It sits over the
   text column, scrolls on its own (data-lenis-prevent keeps the page
   from gliding while you read), and closes with Esc or the close button. */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export default function DetailPanel({
  open,
  name,
  detail,
  onClose,
}: {
  open: boolean
  name: string
  detail: WorldDetail | null
  onClose: () => void
}) {
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    // after the panel has mounted and started animating in
    const focusTimer = window.setTimeout(
      () => closeButton.current?.focus({ preventScroll: true }),
      60,
    )
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && detail && (
        <motion.aside
          key={name}
          className="detail-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="detail-title"
          data-lenis-prevent
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 30 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <div className="detail-head">
            <div>
              <div className="detail-eyebrow">About</div>
              <h2 id="detail-title" className="detail-title">
                {name}
              </h2>
            </div>
            <button
              ref={closeButton}
              type="button"
              className="detail-close"
              onClick={onClose}
              aria-label={`Close details about ${name}`}
            >
              ×
            </button>
          </div>

          <dl className="detail-glance">
            {detail.glance.map((item) => (
              <div key={item.label} className="detail-glance-row">
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>

          {detail.sections.map((section) => (
            <section key={section.heading} className="detail-section">
              <h3>{section.heading}</h3>
              <p>{section.body}</p>
            </section>
          ))}

          <section className="detail-section">
            <h3>Exploration</h3>
            <ol className="detail-missions">
              {detail.missions.map((mission) => (
                <li key={`${mission.year}-${mission.name}`}>
                  <span className="detail-year">{mission.year}</span>
                  <span>
                    <b>{mission.name}</b>
                    {mission.note}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <p className="detail-source">{DETAIL_SOURCE}</p>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
