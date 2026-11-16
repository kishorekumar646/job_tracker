// Author: Kishore Kumar
import { useCallback, useEffect, useRef, useState } from 'react'
import { useOnlineStore } from '../store/onlineStore'

const RETRY_SECONDS = 15
// Safari often keeps navigator.onLine=true with no internet, so connectivity is also polled.
const ONLINE_POLL_MS = 5_000

export function useOnlineStatus() {
  const setStore = useOnlineStore((s) => s.setIsOnline)
  const [isOnline, setLocal] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  const [countdown, setCountdown] = useState(RETRY_SECONDS)
  const [checking, setChecking] = useState(false)
  const inFlight = useRef(false)

  const setIsOnline = useCallback((v: boolean) => { setLocal(v); setStore(v) }, [setStore])

  const ping = useCallback(async (showChecking = true) => {
    if (inFlight.current) return
    inFlight.current = true
    if (showChecking) setChecking(true)
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 5000)
    try {
      await fetch('/api/v1/ping', { method: 'HEAD', cache: 'no-store', signal: ac.signal })
      setIsOnline(true)
    } catch {
      setIsOnline(false)
    } finally {
      clearTimeout(timer)
      inFlight.current = false
      if (showChecking) setChecking(false)
    }
  }, [setIsOnline])

  useEffect(() => {
    const on = () => void ping(false)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [ping, setIsOnline])

  useEffect(() => {
    if (!isOnline) return
    const id = setInterval(() => void ping(false), ONLINE_POLL_MS)
    return () => clearInterval(id)
  }, [isOnline, ping])

  useEffect(() => {
    if (isOnline) { setCountdown(RETRY_SECONDS); return }
    if (countdown <= 0) { void ping(); setCountdown(RETRY_SECONDS); return }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [isOnline, countdown, ping])

  const retry = useCallback(() => { setCountdown(RETRY_SECONDS); void ping() }, [ping])

  return { isOnline, countdown, checking, retry }
}
