'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

import { DETAIL_SOURCE, type WorldDetail } from '../../data/worlds'
import type { Layer } from '../../data/interiors'
import WorldGraphics from './WorldGraphics'
import WorldLive from './WorldLive'
import { DistanceLadder, GalaxyMap, SpacecraftMap } from './SkyGraphics'
import Icon from './Icon'
import YouThere from './YouThere'
import TonightSky from './TonightSky'

/* A quiet, scrollable deep-dive for the current world. It sits over the
   text column, scrolls on its own (data-lenis-prevent keeps the page
   from gliding while you read), and closes with Esc or the close button,
   which stays at hand as you scroll. At the foot, the neighbouring
   chapters: the journey flies on and the panel opens again on arrival. */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export type PanelStep = { name: string; go: () => void }

export default function DetailPanel({
  open,
  name,
  eyebrow = 'About',
  detail,
  onClose,
  inside,
  onToggleInside,
  layers,
  worldIndex,
  sky,
  description,
  scaleNote,
  previous,
  next,
  link,
}: {
  open: boolean
  name: string
  eyebrow?: string
  detail: WorldDetail | null
  onClose: () => void
  /* the planet shown cut open (only planets have this) */
  inside?: boolean
  onToggleInside?: () => void
  layers?: Layer[]
  /* the chapter's full description, and the scale-model sentence */
  description?: string
  scaleNote?: string
  /* orbit index for the drawings (-1: the Sun); none for other chapters */
  worldIndex?: number
  /* the chapters beyond the planets: their own drawing and live figures */
  sky?: 'distances' | 'galaxy' | 'local-group'
  previous?: PanelStep
  next?: PanelStep
  /* this chapter's address, to copy and share */
  link?: string
}) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [copied, setCopied] = useState(false)
  // where copying is not allowed: the link, shown selected to copy by hand
  const [manual, setManual] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])
  useEffect(() => setManual(false), [name])
  const copyLink = () => {
    if (!link) return
    const fallback = () => {
      // the old way: a hidden field, selected and copied
      const field = document.createElement('textarea')
      field.value = link
      field.setAttribute('readonly', '')
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      let ok = false
      try {
        ok = document.execCommand('copy')
      } catch {
        ok = false
      }
      field.remove()
      if (ok) setCopied(true)
      else setManual(true)
    }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(() => setCopied(true), fallback)
    else fallback()
  }

  useEffect(() => {
    if (!open) return
    setScrolled(false)
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
  }, [open, onClose, name])

  const live = sky === 'distances' ? 'voyager' : sky === 'galaxy' ? undefined : worldIndex

  return (
    <AnimatePresence>
      {open && detail && (
        <motion.aside
          key={name}
          className={`detail-panel ${scrolled ? 'is-scrolled' : ''}`}
          role="dialog"
          aria-modal="false"
          aria-labelledby="detail-title"
          data-lenis-prevent
          onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 110)}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 30 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          {/* a slim bar with the name and close, once the title has
              scrolled away */}
          <div className="detail-bar" aria-hidden={!scrolled}>
            <div className="detail-bar-inner">
              <span className="detail-bar-name">{name}</span>
              <button
                type="button"
                className="detail-close"
                onClick={onClose}
                tabIndex={scrolled ? 0 : -1}
                aria-label={`Close details about ${name}`}
              >
                ×
              </button>
            </div>
          </div>

          <div className="detail-head">
            <div>
              <div className="detail-eyebrow">{eyebrow}</div>
              <h2 id="detail-title" className="detail-title">
                {name}
              </h2>
            </div>
            {link && (
              <button
                type="button"
                className={`detail-link ${copied ? 'is-copied' : ''}`}
                onClick={copyLink}
                aria-label={copied ? 'Link copied' : `Copy a link to ${name}`}
                title={copied ? 'Copied' : 'Copy link'}
              >
                <Icon name={copied ? 'check' : 'link'} />
                <span aria-live="polite">{copied ? 'Copied' : 'Link'}</span>
              </button>
            )}
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

          {manual && link && (
            <input
              className="detail-link-field"
              readOnly
              value={link}
              aria-label="Link to this chapter"
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
            />
          )}

          {onToggleInside && (
            <button
              type="button"
              className="detail-inside"
              onClick={onToggleInside}
              aria-pressed={inside}
            >
              {inside ? 'Close the cutaway' : `See inside ${name}`}
            </button>
          )}

          {inside && layers && (
            <ol className="detail-layers" aria-label={`Layers of ${name}, from the centre out`}>
              {layers.map((layer, i) => (
                <li key={layer.name}>
                  <span className="detail-layer-swatch" style={{ background: layer.color }}>
                    {i + 1}
                  </span>
                  {layer.name}
                </li>
              ))}
            </ol>
          )}

          {description && <p className="detail-lede">{description}</p>}

          <WorldLive where={live} name={name} travel={detail.travel} />
          {worldIndex !== undefined && <YouThere index={worldIndex} name={name} />}
          {sky === 'galaxy' ? (
            <TonightSky what="galaxy" />
          ) : sky === 'local-group' ? (
            <TonightSky what="andromeda" />
          ) : worldIndex === -1 ? (
            <TonightSky what="sun" />
          ) : worldIndex !== undefined && worldIndex !== 2 ? (
            <TonightSky what={worldIndex} />
          ) : null}

          {sky === 'galaxy' && <GalaxyMap />}
          {sky === 'distances' && <DistanceLadder />}
          {sky === 'distances' && <SpacecraftMap />}
          {worldIndex !== undefined && <WorldGraphics index={worldIndex} name={name} />}
          {scaleNote && <p className="detail-scale">{scaleNote}</p>}

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

          {detail.moons && (
            <section className="detail-section">
              <h3>{detail.moons.length === 1 ? 'Its moon' : 'Moons to know'}</h3>
              <ul className="detail-moons">
                {detail.moons.map((moon) => (
                  <li key={moon.name}>
                    <b>{moon.name}</b>
                    {moon.note}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="detail-section">
            <h3>{detail.missionsHeading ?? 'Exploration'}</h3>
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

          {(previous || next) && (
            <nav className="detail-steps" aria-label="Neighbouring chapters">
              {previous ? (
                <button type="button" onClick={previous.go}>
                  <span aria-hidden="true">←</span>
                  <span>
                    <small>Previous</small>
                    {previous.name}
                  </span>
                </button>
              ) : (
                <span />
              )}
              {next && (
                <button type="button" className="is-next" onClick={next.go}>
                  <span>
                    <small>Next</small>
                    {next.name}
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </nav>
          )}

          <p className="detail-source">{detail.source ?? DETAIL_SOURCE}</p>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
