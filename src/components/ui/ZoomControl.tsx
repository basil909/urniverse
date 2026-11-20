'use client'

import { useEffect, useState } from 'react'

import Icon from './Icon'
import { ZOOM_EVENT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, resetOrbit, viewMode, zoomBy } from '../experience/viewMode'

/* ============================================================
   ZOOM
   Two quiet buttons at the foot of the screen, in either camera mode:
   closer, and further out, from whatever the chapter is looking at; a
   reset once the view has been changed. (Ctrl + scroll, a pinch and the
   + and - keys do the same: viewMode.ts.)
============================================================ */

export default function ZoomControl() {
  const [zoom, setZoom] = useState(viewMode.zoom)
  const [turned, setTurned] = useState(false)

  useEffect(() => {
    const update = () => {
      setZoom(viewMode.zoom)
      setTurned(viewMode.yaw !== 0 || viewMode.pitch !== 0)
    }
    update()
    window.addEventListener(ZOOM_EVENT, update)
    return () => window.removeEventListener(ZOOM_EVENT, update)
  }, [])

  const changed = turned || Math.abs(zoom - 1) > 1e-3
  return (
    <div className="zoom-bar" role="group" aria-label="Zoom">
      <button
        type="button"
        className="zoom-button"
        aria-label="Zoom out"
        data-tip="Zoom out  −"
        disabled={zoom >= ZOOM_MAX - 1e-3}
        onClick={() => zoomBy(ZOOM_STEP)}
      >
        <Icon name="minus" />
      </button>
      {changed && (
        <button type="button" className="zoom-reset" aria-label="Reset the view" data-tip="Reset  0" onClick={resetOrbit}>
          {Math.round(100 / zoom)}%
        </button>
      )}
      <button
        type="button"
        className="zoom-button"
        aria-label="Zoom in"
        data-tip="Zoom in  +"
        disabled={zoom <= ZOOM_MIN + 1e-3}
        onClick={() => zoomBy(1 / ZOOM_STEP)}
      >
        <Icon name="plus" />
      </button>
    </div>
  )
}
