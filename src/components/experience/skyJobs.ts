import { MAP_HEIGHT, MAP_WIDTH, PATCH_SIZE, skyWorkerMain, type SkyJob } from './skyPixels'

/* Runs Earth's weather maps in a worker: one worker, made when first
   needed from skyWorkerMain's own source; each job a promise of its
   result. Where no worker can run, the jobs fail and Earth keeps its
   usual cloud map: done on the main thread they would hold the page
   for the better part of a second. */

let worker: Worker | null | undefined
let nextId = 1
const waiting = new Map<number, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>()

function failAll(reason: string) {
  waiting.forEach((job) => job.reject(new Error(reason)))
  waiting.clear()
}

function getWorker() {
  if (worker !== undefined) return worker
  worker = null
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return worker
  try {
    const setup = { width: MAP_WIDTH, height: MAP_HEIGHT, patch: PATCH_SIZE, base: window.location.href }
    const code = `(${skyWorkerMain.toString()})(${JSON.stringify(setup)})`
    const made = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })))
    made.onmessage = (event: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const job = waiting.get(event.data.id)
      if (!job) return
      waiting.delete(event.data.id)
      if (event.data.error) job.reject(new Error(event.data.error))
      else job.resolve(event.data.result)
    }
    made.onerror = () => {
      // the worker cannot run here: no weather maps, the usual ones stay
      made.terminate()
      worker = null
      failAll('worker')
    }
    worker = made
  } catch {
    worker = null
  }
  return worker
}

export function runSkyJob<T>(job: SkyJob): Promise<T> {
  const target = getWorker()
  if (!target) return Promise.reject(new Error('no worker'))
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    waiting.set(id, { resolve: resolve as (value: unknown) => void, reject })
    target.postMessage({ id, job })
  })
}
