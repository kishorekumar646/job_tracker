// Author: Kishore Kumar
import { useCallback, useEffect, useRef, useState } from 'react'
import { getTargetDetails, regressionErrorMessage, TargetDetails } from '../api/regression'

export type DetailState =
  | { state: 'loading' }
  | { state: 'loaded'; data: TargetDetails }
  | { state: 'missing' }
  | { state: 'error'; message: string }

// Reports are 1–3 MB on a ~100 KB/s lab link: keep only a couple in flight.
const CONCURRENCY = 2

/**
 * Loads report summaries (real status, tags, failed steps) per device run.
 * Every UUID in `autoLoad` is queued once; `load(uuid)` queues one on demand.
 * The backend caches parsed reports for 30 min, so re-opening a run is cheap.
 */
export function useTargetDetails(runUuid: string | null, autoLoad: string[]) {
  const [details, setDetails] = useState<Record<string, DetailState>>({})
  const requested = useRef(new Set<string>())
  const queue = useRef<string[]>([])
  const active = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    requested.current = new Set()
    queue.current = []
    setDetails({})
  }, [runUuid])

  const pump = useCallback(() => {
    if (!runUuid) return
    while (active.current < CONCURRENCY && queue.current.length > 0) {
      const targetUuid = queue.current.shift()!
      active.current += 1
      getTargetDetails(runUuid, targetUuid)
        .then((data) => {
          if (mounted.current) setDetails((d) => ({ ...d, [targetUuid]: { state: 'loaded', data } }))
        })
        .catch((err) => {
          if (!mounted.current) return
          const status = (err as { response?: { status?: number } })?.response?.status
          setDetails((d) => ({
            ...d,
            [targetUuid]: status === 404
              ? { state: 'missing' }
              : { state: 'error', message: regressionErrorMessage(err, 'Could not read the report.') },
          }))
        })
        .finally(() => {
          active.current -= 1
          pump()
        })
    }
  }, [runUuid])

  const load = useCallback((targetUuid: string, force = false) => {
    if (!force && requested.current.has(targetUuid)) return
    requested.current.add(targetUuid)
    queue.current.push(targetUuid)
    setDetails((d) => ({ ...d, [targetUuid]: { state: 'loading' } }))
    pump()
  }, [pump])

  const autoKey = autoLoad.join(',')
  useEffect(() => {
    autoLoad.forEach((uuid) => load(uuid))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey, load])

  return { details, load }
}
