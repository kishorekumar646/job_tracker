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
  const activeCheck = useRef<AbortController | null>(null)

  const setIsOnline = useCallback((v: boolean) => { setLocal(v); setStore(v) }, [setStore])

  const ping = useCallback(async (showChecking = true) => {
    if (activeCheck.current || document.visibilityState !== 'visible') return
    if (showChecking) setChecking(true)
    const ac = new AbortController()
    activeCheck.current = ac
    const timer = setTimeout(() => ac.abort(), 5000)
    try {
      const response = await fetch('/api/v1/ping', { method: 'HEAD', cache: 'no-store', signal: ac.signal })
      if (activeCheck.current === ac && document.visibilityState === 'visible') setIsOnline(response.ok)
    } catch {
      if (activeCheck.current === ac && document.visibilityState === 'visible') setIsOnline(false)
    } finally {
      clearTimeout(timer)
      if (activeCheck.current === ac) {
        activeCheck.current = null
        if (showChecking) setChecking(false)
      }
    }
  }, [setIsOnline])

  useEffect(() => {
    const on = () => void ping(false)
    const off = () => {
      if (document.visibilityState === 'visible') setIsOnline(false)
    }
    const cancel = () => {
      const check = activeCheck.current
      activeCheck.current = null
      check?.abort()
    }
    const visibility = () => {
      if (document.visibilityState === 'visible') void ping(false)
      else {
        cancel()
        setChecking(false)
      }
    }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    window.addEventListener('focus', on)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      cancel()
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      window.removeEventListener('focus', on)
      document.removeEventListener('visibilitychange', visibility)
    }
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
