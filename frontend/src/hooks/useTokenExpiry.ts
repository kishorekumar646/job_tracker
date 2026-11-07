// Author: Kishore Kumar
import { useEffect, useRef, useState } from 'react'
import axios, { AxiosError } from 'axios'
import { useAuthStore } from '../store/authStore'

const WARN_BEFORE_MS = 5 * 60 * 1000 // 5 minutes

export function useTokenExpiry() {
  const { expiresAt, setSession, clearAuth } = useAuthStore()
  const [showWarning, setShowWarning] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    if (!expiresAt) {
      setShowWarning(false)
      return
    }

    const delay = expiresAt - Date.now() - WARN_BEFORE_MS

    if (delay <= 0) {
      setShowWarning(true)
      return
    }

    timerRef.current = setTimeout(() => setShowWarning(true), delay)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [expiresAt])

  async function handleRefresh() {
    try {
      const { data } = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true })
      const profile = await (await import('../api/auth')).getMe()
      setSession(
        {
          ...profile,
          is_admin: profile.role === 'admin',
          name: profile.full_name ?? undefined,
          full_name: profile.full_name ?? undefined,
        },
        data.expires_at,
      )
      setShowWarning(false)
    } catch (err) {
      // Only clear auth when the server explicitly rejects the refresh (real 401).
      // Network errors mean the server is down — the OfflineBanner handles that.
      const isNetworkError = !(err as AxiosError)?.response
      if (!isNetworkError) {
        clearAuth()
        window.location.href = '/login'
      }
    }
  }

  function handleDismiss() {
    setShowWarning(false)
  }

  return { showWarning, handleRefresh, handleDismiss, expiresAt }
}
