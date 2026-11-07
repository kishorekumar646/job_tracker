// Author: Kishore Kumar
import { useEffect, useRef, useState } from 'react'
import { getJobStatus } from '../api/rca'
import { JobStatusResponse } from '../types'

export function useJobPolling(jobId: string | null, intervalMs = 3000) {
  const [data, setData] = useState<JobStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!jobId) return

    function clearTimer() {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }

    async function poll() {
      try {
        const result = await getJobStatus(jobId!)
        setData(result)
        if (result.status === 'DONE' || result.status === 'FAILED' || result.status === 'STOPPED') {
          clearTimer()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Polling failed')
        clearTimer()
      }
    }

    clearTimer()
    poll()
    timerRef.current = setInterval(poll, intervalMs)
    return clearTimer
  }, [jobId, intervalMs])

  return { data, error }
}
