/// <reference lib="webworker" />
/* the worker behind skyJobs.ts: runs skyPixels.ts's jobs off the main thread */
import { patchMap, todayMaps } from './skyPixels'

export type SkyJob =
  | { type: 'today'; date: string }
  | { type: 'patch'; level: number; row0: number; col0: number; cols: number; date: string }

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = async (event: MessageEvent<{ id: number; job: SkyJob }>) => {
  const { id, job } = event.data
  try {
    if (job.type === 'today') {
      const maps = await todayMaps(job.date)
      const transfer = maps ? [maps.cloud.buffer, ...(maps.snow ? [maps.snow.buffer] : [])] : []
      scope.postMessage({ id, result: maps }, transfer as Transferable[])
    } else {
      const data = await patchMap(job.level, job.row0, job.col0, job.cols, job.date)
      scope.postMessage({ id, result: data }, [data.buffer])
    }
  } catch (error) {
    scope.postMessage({ id, error: String(error) })
  }
}
