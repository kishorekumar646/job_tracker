// Author: Kishore Kumar
import { useCallback, useEffect, useRef, useState } from 'react'
import { useOnlineStore } from '../store/onlineStore'

const RETRY_SECONDS = 15
// Background poll interval when the browser thinks we are online.
// Safari often skips the `offline` event and keeps navigator.onLine=true
// even with no internet, so we actively verify connectivity on a schedule.
const ONLINE_POLL_MS = 5_000

export function useOnlineStatus() {
  const setOnlineStore = useOnlineStore((s) => s.setIsOnline)
  const [isOnline, setIsOnlineLocal] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  function setIsOnline(v: boolean) {
    setIsOnlineLocal(v)
    setOnlineStore(v)
  }
  const [countdown, setCountdown] = useState(RETRY_SECONDS)
  const [checking, setChecking] = useState(false)
  const pingInFlight = useRef(false)

  const ping = useCallback(async (showChecking = true) => {
    if (pingInFlight.current) return
    pingInFlight.current = true

    // Skip navigator.onLine guard — Safari returns true even without internet,
    // so always attempt the real fetch to verify actual server reachability.
    if (showChecking) setChecking(true)
    const ac = new AbortController()
    const timeoutId = setTimeout(() => ac.abort(), 5000)
    try {
      await fetch('/api/v1/ping', {
        method: 'HEAD',
        cache: 'no-store',
        signal: ac.signal,
      })
      setIsOnline(true)
    } catch {
      setIsOnline(false)
    } finally {
      clearTimeout(timeoutId)
      pingInFlight.current = false
      if (showChecking) setChecking(false)
    }
  }, [])

  // Browser online/offline events (fast path for Chrome/Firefox)
  useEffect(() => {
    const onOnline  = () => ping(false)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [ping])

  // Background poll while online — catches Safari's broken offline detection.
  // Even if the offline event never fires, this will detect a failed fetch
  // within ONLINE_POLL_MS and flip isOnline to false.
  useEffect(() => {
    if (!isOnline) return
    const id = setInterval(() => ping(false), ONLINE_POLL_MS)
    return () => clearInterval(id)
  }, [isOnline, ping])

  // Countdown timer — only ticks when offline
  useEffect(() => {
    if (isOnline) {
      setCountdown(RETRY_SECONDS)
      return
    }
    if (countdown <= 0) {
      ping()
      setCountdown(RETRY_SECONDS)
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [isOnline, countdown, ping])

  const retry = useCallback(() => {
    setCountdown(RETRY_SECONDS)
    ping()
  }, [ping])

  return { isOnline, countdown, checking, retry }
}
