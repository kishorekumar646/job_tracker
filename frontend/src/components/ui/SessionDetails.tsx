// Author: Kishore Kumar
import { useEffect, useRef, useState } from 'react'
import { Clock, X } from 'lucide-react'
import { authApi } from '../../api'
import { errorMessage, refreshSession } from '../../api/client'
import { useSessionStore } from '../../store/sessionStore'
import { toast } from '../../store/toastStore'
import { Spinner } from '.'

function countdown(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

function useSessionClock() {
  const { expiresAt, refreshExpiresAt, clockOffset } = useSessionStore()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const id = setInterval(tick, 1000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return {
    expiresAt, refreshExpiresAt,
    secondsLeft: expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - now - clockOffset) / 1000)),
  }
}

function useSessionRefresh() {
  const [busy, setBusy] = useState(false)
  const refresh = async () => {
    setBusy(true)
    try {
      await refreshSession()
      toast.success('Session refreshed.')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return { busy, refresh }
}

export function SessionWarning() {
  const { expiresAt, secondsLeft } = useSessionClock()
  const { busy, refresh } = useSessionRefresh()
  const [dismissed, setDismissed] = useState<number | null>(null)
  const attempted = useRef<number | null>(null)

  useEffect(() => {
    if (expiresAt === null || secondsLeft !== 0 || attempted.current === expiresAt) return
    attempted.current = expiresAt
    refreshSession().catch((error) => toast.error(errorMessage(error)))
  }, [expiresAt, secondsLeft])

  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === 'visible') {
        authApi.session().catch((error) => toast.error(errorMessage(error)))
      }
    }
    window.addEventListener('focus', sync)
    return () => window.removeEventListener('focus', sync)
  }, [])

  if (secondsLeft === null || secondsLeft > 300 || (dismissed === expiresAt && secondsLeft > 0)) return null
  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/15 px-3 py-2 text-sm text-amber-200 sm:px-6">
      <Clock className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1">
        {secondsLeft === 0 ? 'Access token expired. Reconnect or refresh to continue.' : <>Your access token expires in <strong className="font-mono">{countdown(secondsLeft)}</strong>.</>}
      </p>
      <button onClick={refresh} disabled={busy} className="btn-secondary btn-sm">{busy && <Spinner />}Refresh session</button>
      {secondsLeft > 0 && <button onClick={() => setDismissed(expiresAt)} className="rounded-lg p-2 hover:bg-amber-500/15" aria-label="Dismiss expiry warning"><X className="h-4 w-4" /></button>}
    </div>
  )
}

export function SessionDetails() {
  const { refreshExpiresAt, secondsLeft } = useSessionClock()
  const { busy, refresh } = useSessionRefresh()
  return (
    <section className="space-y-3 rounded-xl border border-gray-800 bg-gray-900/60 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-brand-400" />Session & security</h2>
      <dl className="grid gap-3 text-xs sm:grid-cols-2">
        <div><dt className="text-gray-500">Access token expires in</dt><dd className={`mt-1 font-mono text-lg font-semibold ${secondsLeft !== null && secondsLeft <= 300 ? 'text-amber-300' : 'text-gray-100'}`}>{secondsLeft === null ? 'Unavailable' : countdown(secondsLeft)}</dd></div>
        <div><dt className="text-gray-500">Session expiry</dt><dd className="mt-1 text-gray-200">{refreshExpiresAt ? new Date(refreshExpiresAt).toLocaleString() : 'Sign in again when access expires'}</dd></div>
      </dl>
      <p className="text-xs text-gray-500">Session expiry follows your refresh token lifetime. A warning appears five minutes before access expires; access renews automatically while your session is valid.</p>
      <button className="btn-secondary btn-sm" onClick={refresh} disabled={busy}>{busy && <Spinner />}Refresh session</button>
    </section>
  )
}
