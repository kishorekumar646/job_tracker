// Author: Kishore Kumar
import { useCallback, useEffect, useRef, useState } from 'react'
import { useOnlineStore } from '../store/onlineStore'

const RETRY_SECONDS = 15
// Safari often keeps navigator.onLine=true with no internet, so connectivity is also polled.
const ONLINE_POLL_MS = 5_000
const SLOW_SERVER_MS = 5_000
const SERVER_TIMEOUT_MS = 90_000
type ConnectionStatus = 'online' | 'reconnecting' | 'offline' | 'unavailable'

export function useOnlineStatus() {
  const setStore = useOnlineStore((s) => s.setIsOnline)
  const [status, setLocal] = useState<ConnectionStatus>(() => navigator.onLine ? 'online' : 'offline')
  const isOnline = status === 'online'
  const [countdown, setCountdown] = useState(RETRY_SECONDS)
  const [checking, setChecking] = useState(false)
  const activeCheck = useRef<AbortController | null>(null)

  const setStatus = useCallback((value: ConnectionStatus) => { setLocal(value); setStore(value === 'online') }, [setStore])

  const cancel = useCallback(() => {
    const check = activeCheck.current
    activeCheck.current = null
    check?.abort()
    setChecking(false)
  }, [])

  const ping = useCallback(async (showChecking = true) => {
    if (activeCheck.current || document.visibilityState !== 'visible') return
    if (!navigator.onLine) { setStatus('offline'); return }
    if (showChecking) setChecking(true)
    const ac = new AbortController()
    activeCheck.current = ac
    const slowTimer = setTimeout(() => {
      if (activeCheck.current === ac && document.visibilityState === 'visible') setStatus('reconnecting')
    }, SLOW_SERVER_MS)
    const timer = setTimeout(() => ac.abort(), SERVER_TIMEOUT_MS)
    try {
      const response = await fetch('/api/v1/ping', { cache: 'no-store', signal: ac.signal })
      // A hosting startup page may return HTTP 200 without the API being ready.
      const body: unknown = response.ok && response.headers.get('content-type')?.includes('application/json')
        ? await response.json() : null
      const ready = typeof body === 'object' && body !== null && 'status' in body && body.status === 'ok'
      if (activeCheck.current === ac && document.visibilityState === 'visible') setStatus(ready ? 'online' : navigator.onLine ? 'unavailable' : 'offline')
    } catch {
      if (activeCheck.current === ac && document.visibilityState === 'visible') setStatus(navigator.onLine ? 'unavailable' : 'offline')
    } finally {
      clearTimeout(slowTimer)
      clearTimeout(timer)
      if (activeCheck.current === ac) {
        activeCheck.current = null
        if (showChecking) setChecking(false)
      }
    }
  }, [setStatus])

  useEffect(() => {
    const on = () => void ping(false)
    const off = () => {
      if (document.visibilityState === 'visible') {
        cancel()
        setStatus('offline')
      }
    }
    const visibility = () => {
      if (document.visibilityState === 'visible') void ping(false)
      else cancel()
    }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    window.addEventListener('focus', on)
    document.addEventListener('visibilitychange', visibility)
    void ping(false)
    return () => {
      cancel()
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      window.removeEventListener('focus', on)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [cancel, ping, setStatus])

  useEffect(() => {
    if (!isOnline) return
    const id = setInterval(() => void ping(false), ONLINE_POLL_MS)
    return () => clearInterval(id)
  }, [isOnline, ping])

  useEffect(() => {
    if (status === 'online' || status === 'reconnecting') { setCountdown(RETRY_SECONDS); return }
    if (countdown <= 0) { void ping(); setCountdown(RETRY_SECONDS); return }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [status, countdown, ping])

  const retry = useCallback(() => { setCountdown(RETRY_SECONDS); void ping() }, [ping])

  return { isOnline, status, countdown, checking, retry }
}
