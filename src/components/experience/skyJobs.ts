import type { SkyJob } from './skyWorker'

/* Runs Earth's weather maps in a worker (skyWorker.ts): one worker, made
   when first needed; each job a promise of its result. */

let worker: Worker | null = null
let nextId = 1
const waiting = new Map<number, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>()

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./skyWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const job = waiting.get(event.data.id)
      if (!job) return
      waiting.delete(event.data.id)
      if (event.data.error) job.reject(new Error(event.data.error))
      else job.resolve(event.data.result)
    }
  }
  return worker
}

export function runSkyJob<T>(job: SkyJob): Promise<T> {
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    waiting.set(id, { resolve: resolve as (value: unknown) => void, reject })
    getWorker().postMessage({ id, job })
  })
}
