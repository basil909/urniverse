'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import Icon from './Icon'

/* The command palette (Ctrl+K, or / , or the search button): one place to
   reach everything. Type to filter (every word must match), arrows to
   choose, Enter to go, Esc to close. With nothing typed it offers the
   chapters and the actions. */

export type Command = {
  id: string
  group: string
  title: string
  /* quiet text after the title */
  hint?: string
  /* extra words it answers to */
  keywords?: string
  /* a small mark before the title */
  icon?: ReactNode
  run: () => void
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const GROUP_ORDER = ['Chapters', 'Panels', 'Fly to', 'Actions']

export default function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean
  onClose: () => void
  commands: Command[]
}) {
  const [query, setQuery] = useState('')
  const [pick, setPick] = useState(0)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setPick(0)
    }
  }, [open])

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const matched = words.length
      ? commands.filter((command) => {
          const text = `${command.title} ${command.hint ?? ''} ${command.keywords ?? ''} ${command.group}`.toLowerCase()
          return words.every((word) => text.includes(word))
        })
      : commands.filter((command) => command.group === 'Chapters' || command.group === 'Actions')
    // names that start with what was typed come first, then by group
    const first = words[0] ?? ''
    return matched
      .map((command, order) => ({ command, order }))
      .sort((a, b) => {
        const sa = first && a.command.title.toLowerCase().startsWith(first) ? 0 : 1
        const sb = first && b.command.title.toLowerCase().startsWith(first) ? 0 : 1
        if (sa !== sb) return sa - sb
        const ga = GROUP_ORDER.indexOf(a.command.group)
        const gb = GROUP_ORDER.indexOf(b.command.group)
        return ga !== gb ? ga - gb : a.order - b.order
      })
      .map(({ command }) => command)
      .slice(0, 40)
  }, [commands, query])

  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [pick])

  const run = (command: Command | undefined) => {
    if (!command) return
    onClose()
    command.run()
  }

  // grouped for display, keeping the ranked order
  let at = -1
  const groups: { name: string; items: { command: Command; index: number }[] }[] = []
  for (const command of results) {
    at += 1
    const last = groups[groups.length - 1]
    if (last && last.name === command.group) last.items.push({ command, index: at })
    else groups.push({ name: command.group, items: [{ command, index: at }] })
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="palette-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) onClose()
          }}
        >
          <motion.div
            className="palette"
            role="dialog"
            aria-modal="true"
            aria-label="Search everything"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            <div className="palette-search">
              <Icon name="search" />
              <input
                autoFocus
                type="search"
                // (a phone: the long hint ran out of room, cut mid-word)
                placeholder={window.innerWidth < 520 ? 'Search everything…' : 'Search chapters, worlds, panels, actions…'}
                aria-label="Search everything"
                aria-controls="palette-list"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPick(0)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onClose()
                  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault()
                    if (!results.length) return
                    setPick((p) => (p + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length)
                  } else if (event.key === 'Enter') {
                    event.preventDefault()
                    run(results[pick])
                  }
                  // nothing typed here moves the journey
                  event.stopPropagation()
                }}
              />
              <kbd>Esc</kbd>
            </div>
            <div ref={list} id="palette-list" className="palette-list" role="listbox" data-lenis-prevent>
              {results.length === 0 && <p className="palette-none">Nothing matches “{query}”</p>}
              {groups.map((group) => (
                <div key={group.name} className="palette-group">
                  <div className="palette-group-name">{group.name}</div>
                  {group.items.map(({ command, index }) => (
                    <button
                      key={command.id}
                      type="button"
                      role="option"
                      aria-selected={index === pick}
                      className="palette-item"
                      onMouseMove={() => index !== pick && setPick(index)}
                      onClick={() => run(command)}
                    >
                      <span className="palette-icon" aria-hidden="true">
                        {command.icon}
                      </span>
                      <span className="palette-title">{command.title}</span>
                      {command.hint && <span className="palette-hint">{command.hint}</span>}
                      {index === pick && <kbd className="palette-enter">↵</kbd>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="palette-foot" aria-hidden="true">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> choose
              </span>
              <span>
                <kbd>↵</kbd> go
              </span>
              <span>
                <kbd>Ctrl</kbd>
                <kbd>K</kbd> anywhere
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
