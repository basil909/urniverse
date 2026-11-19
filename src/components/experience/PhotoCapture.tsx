'use client'

import { useFrame, useThree } from '@react-three/fiber'

import { pilot } from './pilotState'

/* ============================================================
   A POSTCARD
   Asked for by the landed card: the frame just drawn (read straight
   after the drawing, while the canvas still holds it), with a caption
   along its foot (the place, the world, where and when), saved as a
   picture. Runs after the frame is rendered (priority 2).
============================================================ */

function caption(c: CanvasRenderingContext2D, width: number, height: number, lines: string[]) {
  const style = getComputedStyle(document.body)
  const serif = style.getPropertyValue('--serif').trim() || 'Georgia, serif'
  const sans = style.getPropertyValue('--sans').trim() || 'system-ui, sans-serif'
  const unit = Math.min(width, height * 1.6) / 100
  const shade = c.createLinearGradient(0, height * 0.66, 0, height)
  shade.addColorStop(0, 'rgba(4, 6, 12, 0)')
  shade.addColorStop(1, 'rgba(4, 6, 12, 0.66)')
  c.fillStyle = shade
  c.fillRect(0, height * 0.66, width, height * 0.34)
  const left = unit * 4.2
  const bottom = height - unit * 4
  c.textBaseline = 'alphabetic'
  c.fillStyle = 'rgba(255, 255, 255, 0.96)'
  c.font = `400 ${(unit * 4.4).toFixed(1)}px ${serif}`
  c.fillText(lines[0] ?? '', left, bottom - unit * 3.4)
  c.font = `500 ${(unit * 1.45).toFixed(1)}px ${sans}`
  c.fillStyle = 'rgba(255, 255, 255, 0.72)'
  const spaced = (text: string) => text.toUpperCase().split('').join(String.fromCharCode(8202))
  c.fillText(spaced(lines[1] ?? ''), left, bottom)
  c.textAlign = 'right'
  c.fillStyle = 'rgba(255, 255, 255, 0.5)'
  c.fillText(spaced('urniverse'), width - left, bottom)
}

export default function PhotoCapture() {
  const gl = useThree((state) => state.gl)
  useFrame(() => {
    const request = pilot.photoRequest
    if (!request) return
    pilot.photoRequest = null
    const source = gl.domElement
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const c = canvas.getContext('2d')
    if (!c) return
    c.drawImage(source, 0, 0)
    caption(c, canvas.width, canvas.height, request.caption)
    canvas.toBlob((blob) => {
      if (!blob) return
      const link = document.createElement('a')
      const slug = request.caption[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      link.download = `postcard-${(pilot.nearest || 'space').replace(/^the /, '').toLowerCase()}-${slug}.png`
      link.href = URL.createObjectURL(blob)
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(link.href), 4000)
    }, 'image/png')
  }, 2)
  return null
}
