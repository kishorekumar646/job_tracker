// Author: Kishore Kumar
import { useCallback, useEffect, useRef, useState } from 'react'
import { getRunStatus, regressionErrorMessage, RunStatus } from '../api/regression'
import { useOnlineStore } from '../store/onlineStore'

const POLL_MS = 10_000 // matches the backend's per-run status cache

/**
 * Polls GET /regression/runs/{runUuid} every 10 s until the run reaches a terminal
 * phase. Pauses while the API server is offline and resumes when it returns.
 * Pass `null` to stop polling.
 */
export function useRegressionRun(runUuid: string | null) {
  const [status, setStatus] = useState<RunStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const isOnline = useOnlineStore((s) => s.isOnline)
  const terminalRef = useRef(false)

  const fetchOnce = useCallback(async () => {
    if (!runUuid) return
    setLoading(true)
    try {
      const next = await getRunStatus(runUuid)
      terminalRef.current = next.isTerminal
      setStatus(next)
      setError(null)
    } catch (err) {
      setError(regressionErrorMessage(err, 'Could not load run status.'))
    } finally {
      setLoading(false)
    }
  }, [runUuid])

  useEffect(() => {
    terminalRef.current = false
    setStatus(null)
    setError(null)
  }, [runUuid])

  useEffect(() => {
    if (!runUuid || !isOnline) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      await fetchOnce()
      if (!cancelled && !terminalRef.current) timer = setTimeout(tick, POLL_MS)
    }
    if (!terminalRef.current) tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [runUuid, isOnline, fetchOnce])

  return { status, error, loading, refresh: fetchOnce }
}
