// Author: Kishore Kumar
// What a new account sees until an admin approves it (ProtectedRoute shows this instead of any page).
// Explains why, what happens next, and checks every few seconds (and when the tab regains focus) —
// the app opens by itself as soon as it's approved, without a page reload.
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock, LogOut, RefreshCw, ShieldCheck, UserCircle2, Users } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useAuth } from '../../hooks/useAuth'

const CHECK_EVERY_MS = 5_000

function when(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function AwaitingApproval() {
  const user = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const { logout } = useAuth()
  const [checking, setChecking] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date>(new Date())

  const check = useCallback(async () => {
    setChecking(true)
    try {
      await fetchMe()  // once approved, ProtectedRoute opens the page by itself
    } finally {
      setChecking(false)
      setLastChecked(new Date())
    }
  }, [fetchMe])

  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') check() }, CHECK_EVERY_MS)
    const onBack = () => { if (document.visibilityState === 'visible') check() }
    window.addEventListener('focus', onBack)
    document.addEventListener('visibilitychange', onBack)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onBack)
      document.removeEventListener('visibilitychange', onBack)
    }
  }, [check])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="approval-title" className="w-full max-w-xl rounded-2xl border border-amber-500/30 bg-gray-900 shadow-2xl">
        <div className="border-b border-gray-800 p-6">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
            <Clock className="h-7 w-7 text-amber-400" />
          </div>
          <h1 id="approval-title" className="text-lg font-semibold text-gray-100">Your account is waiting for approval</h1>
          <p className="mt-1.5 text-sm text-gray-400">
            Hi{user?.full_name ? ` ${user.full_name}` : ''}, thanks for signing up. Before you can use Inspector RCA, an admin needs to approve your account.
          </p>
        </div>

        <div className="space-y-5 p-6">
          {/* The account */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-gray-800 bg-gray-800/30 px-4 py-3 text-sm">
            <dt className="text-gray-500">Account</dt>
            <dd className="truncate text-gray-200">{user?.email}</dd>
            {user?.full_name && (<><dt className="text-gray-500">Name</dt><dd className="text-gray-200">{user.full_name}</dd></>)}
            <dt className="text-gray-500">Signed up</dt>
            <dd className="text-gray-200">{when(user?.created_at)}</dd>
            <dt className="text-gray-500">Status</dt>
            <dd>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/30">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" /> Pending admin approval
              </span>
            </dd>
          </dl>

          {/* Why */}
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-400" />
            <div className="text-sm">
              <p className="font-medium text-gray-200">Why approval is needed</p>
              <p className="text-gray-400">
                Every new account is checked by an admin — for example to make sure the same person doesn't end up with two
                accounts, and that you get the right access (tags such as Regression).
              </p>
            </div>
          </div>

          {/* What happens next */}
          <div className="flex gap-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div className="text-sm">
              <p className="font-medium text-gray-200">What happens next</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-gray-400">
                <li>An admin reviews new accounts in <span className="text-gray-300">Admin → Users</span>.</li>
                <li>As soon as yours is approved, this page opens the app by itself — no need to sign in again or refresh the page.</li>
                <li>If it's urgent, ask your team lead or an admin to approve <span className="text-gray-300">{user?.email}</span>.</li>
              </ol>
            </div>
          </div>

          {/* Duplicates */}
          <div className="flex gap-3">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
            <div className="text-sm">
              <p className="font-medium text-gray-200">Already have an account?</p>
              <p className="text-gray-400">
                If you signed up before with another email, sign out and use that account instead — duplicate accounts are rejected.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-800 px-6 py-4">
          <button
            onClick={check}
            disabled={checking}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} /> {checking ? 'Checking…' : 'Check again'}
          </button>
          <button
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500">
            <UserCircle2 className="h-3.5 w-3.5" /> Last checked {lastChecked.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  )
}
