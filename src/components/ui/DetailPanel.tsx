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
import Compare from './Compare'

/* The deep-dive for the current world. It sits over the text column and
   scrolls on its own (data-lenis-prevent keeps the page from gliding
   while you read). Four tabs under the title keep it short: an overview
   (the figures and drawings), right now (where it is today, your sky
   tonight, you there), its story, and its exploration. The tab bar (with
   the link and close buttons) stays at the top as you scroll. At the
   foot, the neighbouring chapters: the journey flies on and the panel
   opens again on arrival. Esc closes it. */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export type PanelStep = { name: string; go: () => void }

type Tab = 'overview' | 'now' | 'story' | 'missions' | 'compare'

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
  startTab = 'overview',
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
  /* the tab it opens on (the command palette can open any) */
  startTab?: Tab
}) {
  const panel = useRef<HTMLElement>(null)
  const marker = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [stuck, setStuck] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [copied, setCopied] = useState(false)
  // where copying is not allowed: the link, shown selected to copy by hand
  const [manual, setManual] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  // each opening starts on its tab (the overview, unless asked)
  useEffect(() => {
    if (!open) return
    setTab(startTab)
    setManual(false)
    setStuck(false)
  }, [name, open, startTab])

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
    // after the panel has mounted and started animating in
    const focusTimer = window.setTimeout(() => closeButton.current?.focus({ preventScroll: true }), 60)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, name])

  // switching tabs: back to the top of the tab if the bar is pinned
  const choose = (next: Tab) => {
    setTab(next)
    const scroller = panel.current
    const top = marker.current?.offsetTop ?? 0
    if (scroller && scroller.scrollTop > top) scroller.scrollTop = top
  }

  if (!detail) return <AnimatePresence />

  const live = sky === 'distances' ? 'voyager' : sky === 'galaxy' ? undefined : worldIndex
  // (short names on a narrow screen)
  const tabs: { id: Tab; label: string; short: string }[] = [
    { id: 'overview', label: 'Overview', short: 'About' },
    { id: 'now', label: 'Right now', short: 'Now' },
    { id: 'story', label: 'Story', short: 'Story' },
    { id: 'missions', label: detail.missionsHeading ?? 'Exploration', short: 'Timeline' },
    // the planets: this one beside any other
    ...(worldIndex !== undefined && worldIndex >= 0 ? [{ id: 'compare' as const, label: 'Compare', short: 'Compare' }] : []),
  ]

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          ref={panel}
          key={name}
          className={`detail-panel ${stuck ? 'is-stuck' : ''}`}
          role="dialog"
          aria-modal="false"
          aria-labelledby="detail-title"
          data-lenis-prevent
          onScroll={(event) => setStuck(event.currentTarget.scrollTop >= (marker.current?.offsetTop ?? 0) - 1)}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 30 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <header className="dp-head">
            <div className="dp-eyebrow">{eyebrow}</div>
            <h2 id="detail-title" className="dp-title">
              {name}
            </h2>
            {onToggleInside && (
              <button type="button" className="btn btn--ghost btn--sm dp-inside" onClick={onToggleInside} aria-pressed={inside}>
                <span className="dp-inside-mark" aria-hidden="true" />
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
          </header>

          {/* where the bar starts: pinned once the panel scrolls past it */}
          <div ref={marker} className="dp-marker" aria-hidden="true" />
          <div className="dp-bar">
            <span className="dp-bar-name" aria-hidden={!stuck}>
              {name}
            </span>
            <div className={`dp-tabs ${tabs.length > 4 ? 'is-compact' : ''}`} role="tablist" aria-label={`About ${name}`}>
              {tabs.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-label={entry.label}
                  id={`dp-tab-${entry.id}`}
                  aria-selected={tab === entry.id}
                  aria-controls="dp-body"
                  tabIndex={tab === entry.id ? 0 : -1}
                  className="dp-tab"
                  onClick={() => choose(entry.id)}
                  onKeyDown={(event) => {
                    const at = tabs.findIndex((t) => t.id === tab)
                    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
                    if (!step) return
                    event.preventDefault()
                    const nextTab = tabs[(at + step + tabs.length) % tabs.length].id
                    choose(nextTab)
                    document.getElementById(`dp-tab-${nextTab}`)?.focus()
                  }}
                >
                  <span className="dp-tab-full">{entry.label}</span>
                  <span className="dp-tab-short" aria-hidden="true">
                    {entry.short}
                  </span>
                </button>
              ))}
            </div>
            <div className="dp-actions">
              {link && (
                <button
                  type="button"
                  className={`icon-btn ${copied ? 'is-done' : ''}`}
                  onClick={copyLink}
                  aria-label={copied ? 'Link copied' : `Copy a link to ${name}`}
                  title={copied ? 'Copied' : 'Copy link'}
                >
                  <Icon name={copied ? 'check' : 'link'} />
                </button>
              )}
              <button
                ref={closeButton}
                type="button"
                className="icon-btn"
                onClick={onClose}
                aria-label={`Close details about ${name}`}
                title="Close (Esc)"
              >
                <Icon name="close" />
              </button>
            </div>
          </div>
          {copied && (
            <p className="dp-toast" role="status">
              Link copied
            </p>
          )}
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

          <div id="dp-body" className="dp-body" role="tabpanel" aria-labelledby={`dp-tab-${tab}`}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                {tab === 'overview' && (
                  <>
                    {description && <p className="detail-lede">{description}</p>}
                    {sky === 'galaxy' && <GalaxyMap />}
                    {sky === 'distances' && <DistanceLadder />}
                    {worldIndex !== undefined && <WorldGraphics index={worldIndex} name={name} />}
                    {scaleNote && <p className="detail-scale">{scaleNote}</p>}
                    <h3 className="dp-label">At a glance</h3>
                    <dl className="detail-glance bento">
                      {detail.glance.map((item, i) => (
                        <div key={item.label} className={`detail-glance-row ${i === 0 ? 'is-hero' : ''}`}>
                          <dt>{item.label}</dt>
                          <dd>{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}

                {tab === 'now' && (
                  <div className="dp-stack">
                    <WorldLive where={live} name={name} travel={detail.travel} />
                    {sky === 'galaxy' ? (
                      <TonightSky what="galaxy" />
                    ) : sky === 'local-group' ? (
                      <TonightSky what="andromeda" />
                    ) : worldIndex === -1 ? (
                      <TonightSky what="sun" />
                    ) : worldIndex !== undefined && worldIndex !== 2 ? (
                      <TonightSky what={worldIndex} />
                    ) : null}
                    {worldIndex !== undefined && <YouThere index={worldIndex} name={name} />}
                    {sky === 'distances' && <SpacecraftMap />}
                  </div>
                )}

                {tab === 'story' && (
                  <>
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
                  </>
                )}

                {tab === 'compare' && worldIndex !== undefined && worldIndex >= 0 && <Compare index={worldIndex} />}

                {tab === 'missions' && (
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
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {(previous || next) && (
            <nav className="detail-steps" aria-label="Neighbouring chapters">
              {previous ? (
                <button type="button" onClick={previous.go}>
                  <Icon name="arrow" className="is-back" />
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
                  <Icon name="arrow" />
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
