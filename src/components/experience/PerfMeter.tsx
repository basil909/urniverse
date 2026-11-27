'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

import { pilot } from './pilotState'
import { LowResPass } from './lowRes'

/* ============================================================
   THE FRAME METER (F, except on foot; or ?perf in the address)
   A quiet readout, top left: frames a second, the time a frame takes
   (average and worst over half a second), the time the graphics card
   spends on it where the browser can tell (EXT_disjoint_timer_query),
   how many draw calls and triangles, and the quality step in use. So
   what is slow is measured, not guessed.
============================================================ */

type TimerExt = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

/* the half-resolution pass, so the meter can say (and switch) its size */
let lowResPass: LowResPass | null = null

export function PerfMeter() {
  const gl = useThree((state) => state.gl)
  const box = useRef<HTMLDivElement | null>(null)
  const on = useRef(false)
  const stats = useRef({ frames: 0, since: performance.now(), last: performance.now(), sum: 0, worst: 0, gpu: 0, gpuCount: 0, calls: 0, triangles: 0 })
  const timer = useMemo(() => {
    const context = gl.getContext() as WebGL2RenderingContext
    const ext = context.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null
    return { context, ext, active: null as WebGLQuery | null, pending: [] as WebGLQuery[] }
  }, [gl])

  useEffect(() => {
    const element = document.createElement('div')
    element.className = 'perf-meter'
    element.hidden = true
    document.body.appendChild(element)
    box.current = element
    const toggle = (value: boolean) => {
      on.current = value
      element.hidden = !value
      gl.info.autoReset = !value
      stats.current.since = performance.now()
    }
    if (new URLSearchParams(window.location.search).has('perf')) toggle(true)
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'f' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      // (on foot, F picks up a sample)
      if (pilot.walking && !event.shiftKey) return
      // shift+F: the marched effects at full or half size, to compare
      if (event.shiftKey) lowResPass?.setScale(lowResPass.scale === 1 ? 0.5 : 1)
      else toggle(!on.current)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      gl.info.autoReset = true
      element.remove()
    }
  }, [gl])

  // before the frame is drawn: last frame's counts, and the GPU timer starts
  useFrame(() => {
    if (!on.current) return
    const s = stats.current
    const now = performance.now()
    const ms = now - s.last
    s.last = now
    s.frames += 1
    s.sum += ms
    s.worst = Math.max(s.worst, ms)
    s.calls = gl.info.render.calls
    s.triangles = gl.info.render.triangles
    gl.info.reset()
    const { context, ext } = timer
    if (ext) {
      // results arrive a frame or two later
      while (timer.pending.length) {
        const query = timer.pending[0]
        if (!context.getQueryParameter(query, context.QUERY_RESULT_AVAILABLE)) break
        timer.pending.shift()
        if (!context.getParameter(ext.GPU_DISJOINT_EXT)) {
          s.gpu += (context.getQueryParameter(query, context.QUERY_RESULT) as number) / 1e6
          s.gpuCount += 1
        }
        context.deleteQuery(query)
      }
      if (!timer.active && timer.pending.length < 4) {
        timer.active = context.createQuery()
        if (timer.active) context.beginQuery(ext.TIME_ELAPSED_EXT, timer.active)
      }
    }
    if (now - s.since > 500 && box.current) {
      const seconds = (now - s.since) / 1000
      const fps = s.frames / seconds
      const lines = [
        `${fps.toFixed(fps < 10 ? 1 : 0)} fps · ${(s.sum / Math.max(s.frames, 1)).toFixed(1)} ms (worst ${s.worst.toFixed(0)})`,
        ext ? `GPU ${s.gpuCount ? (s.gpu / s.gpuCount).toFixed(1) : '…'} ms` : 'GPU time: not reported here',
        `${s.calls} draws · ${(s.triangles / 1e6).toFixed(2)} M triangles`,
        `quality ${pilot.effects}/2 · pixel ratio ${gl.getPixelRatio().toFixed(2)} · air and clouds at ${lowResPass?.scale === 0.5 ? '½' : (lowResPass?.scale ?? 1)} (shift+F switches)`,
      ]
      box.current.textContent = lines.join('\n')
      s.frames = 0
      s.sum = 0
      s.worst = 0
      s.gpu = 0
      s.gpuCount = 0
      s.since = now
    }
  }, 0.5)

  // after the frame (and its post-processing) is drawn: the timer stops
  useFrame(() => {
    const { context, ext } = timer
    if (!ext || !timer.active) return
    context.endQuery(ext.TIME_ELAPSED_EXT)
    timer.pending.push(timer.active)
    timer.active = null
  }, 2)

  return null
}

/* the marched effects' half-resolution pass, in the post-processing chain */
export function LowResLayer() {
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const pass = useMemo(() => new LowResPass(scene, camera), [scene, camera])
  useEffect(() => {
    lowResPass = pass
    return () => {
      if (lowResPass === pass) lowResPass = null
      pass.dispose()
    }
  }, [pass])
  return <primitive object={pass} />
}
