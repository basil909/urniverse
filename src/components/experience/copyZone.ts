/* Where the chapter's words sit on screen: beside the planet on a wide
   screen, under it on a phone. The labels drawn in the scene (a planet's
   moons, "You are here" on the galaxy) step aside where they would land
   on the words. Read a few times a second, not every frame: a layout read
   each frame would cost more than it saves. */

const NONE = { left: Number.POSITIVE_INFINITY, top: Number.POSITIVE_INFINITY, right: 0, bottom: 0 }
export const copyZone = { ...NONE }

let readAt = 0

export function copyBox(now = performance.now()) {
  if (now - readAt < 300) return copyZone
  readAt = now
  Object.assign(copyZone, NONE)
  if (typeof document === 'undefined') return copyZone
  const copy = document.querySelector<HTMLElement>('.story-content')
  if (!copy) return copyZone
  const box = copy.getBoundingClientRect()
  if (box.height < 1 || box.bottom < 0 || box.top > window.innerHeight) return copyZone
  if (Number(getComputedStyle(copy).opacity) < 0.2) return copyZone
  copyZone.left = box.left
  copyZone.top = box.top
  copyZone.right = box.right
  copyZone.bottom = box.bottom
  return copyZone
}

/** would a label this wide (px), centred at x, y, land on the words? */
export function overCopy(x: number, y: number, halfWidth: number, halfHeight = 10, margin = 16) {
  const zone = copyBox()
  return (
    x + halfWidth > zone.left - margin &&
    x - halfWidth < zone.right + margin &&
    y + halfHeight > zone.top - margin &&
    y - halfHeight < zone.bottom + margin
  )
}
