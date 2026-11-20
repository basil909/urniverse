/* ============================================================
   ICONS
   One small set, drawn on the same 24-unit grid with the same 1.6 stroke
   and round ends, so every control reads as one family at any size (they
   are vectors: sharp on any screen). Sized by the font (1em) unless the
   button says otherwise; coloured by the text.
============================================================ */

export type IconName = 'camera' | 'orbit' | 'play' | 'pause' | 'scale' | 'shuttle' | 'clock' | 'sound' | 'muted' | 'exit' | 'compass' | 'keys' | 'land' | 'thrust' | 'link' | 'check' | 'close' | 'arrow' | 'plus' | 'search'

const PATHS: Record<IconName, React.ReactNode> = {
  play: <path d="M8.2 5.6v12.8L18.4 12z" />,
  // a cine camera: the directed view
  camera: (
    <>
      <rect x="3.2" y="7.2" width="12.4" height="9.6" rx="2" />
      <path d="M15.6 10.6l5.2-2.9v8.6l-5.2-2.9z" />
    </>
  ),
  // a world and its orbit: the free view
  orbit: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <ellipse cx="12" cy="12" rx="9.2" ry="4" transform="rotate(-24 12 12)" />
    </>
  ),
  pause: (
    <>
      <path d="M9 6v12" />
      <path d="M15 6v12" />
    </>
  ),
  // a small world beside a great one: true size
  scale: (
    <>
      <circle cx="14.2" cy="11.4" r="7" />
      <circle cx="5.2" cy="17.2" r="2" />
    </>
  ),
  // the orbiter from above, nose up: the fly button
  shuttle: (
    <>
      <path d="M12 2.8c1.5 1.4 2.3 3.7 2.3 6.6v3.1l5 4.6v2.1l-5-1.5-.7 2.5H10.4l-.7-2.5-5 1.5v-2.1l5-4.6V9.4c0-2.9.8-5.2 2.3-6.6z" />
      <path d="M12 7.5v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.4V12l3.1 2" />
    </>
  ),
  sound: (
    <>
      <path d="M4.4 9.6h3.2l4.6-3.9v12.6l-4.6-3.9H4.4z" />
      <path className="icon-wave" d="M15.6 9.2a4 4 0 0 1 0 5.6" />
      <path className="icon-wave icon-wave-far" d="M18.2 6.6a7.6 7.6 0 0 1 0 10.8" />
    </>
  ),
  muted: (
    <>
      <path d="M4.4 9.6h3.2l4.6-3.9v12.6l-4.6-3.9H4.4z" />
      <path d="M16 9.6l4.8 4.8M20.8 9.6L16 14.4" />
    </>
  ),
  // leave: out through a door
  exit: (
    <>
      <path d="M10 4.6H6.6a2 2 0 0 0-2 2v10.8a2 2 0 0 0 2 2H10" />
      <path d="M14.2 8l4 4-4 4" />
      <path d="M18 12H9.4" />
    </>
  ),
  // go to: a compass
  compass: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M15.4 8.6l-1.9 4.9-4.9 1.9 1.9-4.9z" />
    </>
  ),
  // controls: a keyboard
  keys: (
    <>
      <rect x="3.2" y="6.6" width="17.6" height="10.8" rx="2.2" />
      <path d="M6.9 10.3h.9M10.4 10.3h.9M13.9 10.3h.9M16.9 10.3h.2M8.6 13.8h6.8" />
    </>
  ),
  land: (
    <>
      <path d="M12 4.4v10.4" />
      <path d="M7.6 10.4l4.4 4.4 4.4-4.4" />
      <path d="M5 19.4h14" />
    </>
  ),
  thrust: (
    <>
      <path d="M7 12.6l5-5 5 5" />
      <path d="M7 17.8l5-5 5 5" />
    </>
  ),
  // two links of a chain: copy a link
  link: (
    <>
      <path d="M10.2 13.8a3.6 3.6 0 0 0 5.1 0l3-3a3.6 3.6 0 0 0-5.1-5.1l-1.1 1.1" />
      <path d="M13.8 10.2a3.6 3.6 0 0 0-5.1 0l-3 3a3.6 3.6 0 0 0 5.1 5.1l1.1-1.1" />
    </>
  ),
  check: (
    <>
      <path d="M5.4 12.6l4.2 4.2 9-9.6" />
    </>
  ),
  close: (
    <>
      <path d="M6.6 6.6l10.8 10.8" />
      <path d="M17.4 6.6L6.6 17.4" />
    </>
  ),
  // pointing right; turned in CSS for the other ways
  arrow: (
    <>
      <path d="M4.8 12h14" />
      <path d="M13.4 6.6l5.4 5.4-5.4 5.4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5.4v13.2" />
      <path d="M5.4 12h13.2" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="5.8" />
      <path d="M15.2 15.2l4.2 4.2" />
    </>
  ),
}

export default function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg className={`icon ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  )
}
