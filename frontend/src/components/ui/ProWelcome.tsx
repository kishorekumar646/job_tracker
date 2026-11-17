// Author: Kishore Kumar
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Crown, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { authApi, profileApi } from '../../api'
import { useDataRefresh } from '../../hooks/useDataRefresh'
import { useAuthStore } from '../../store/authStore'
import { Modal } from '.'

export function ProWelcome() {
  const user = useAuthStore((state) => state.user)
  const revision = useDataRefresh()
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const content = useRef<HTMLDivElement>(null)
  const start = useRef<HTMLButtonElement>(null)
  const claim = useRef<Promise<{ show: boolean }> | null>(null)
  const userId = user?.id
  const valid = user?.plan === 'pro' && !!user.plan_expires_at && new Date(user.plan_expires_at).getTime() > Date.now()
  const pending = user?.pro_welcome_pending
  const close = useCallback(() => { setOpen(false); setReady(false) }, [])

  useEffect(() => {
    if (!userId || document.visibilityState !== 'visible' || !navigator.onLine) return
    let active = true
    const snapshot = useAuthStore.getState().user
    authApi.me().then((updated) => {
      const current = useAuthStore.getState().user
      // Do not overwrite a newer payment or admin action with an older refresh.
      if (!active || current?.id !== userId || updated.id !== userId ||
        current.plan !== snapshot?.plan || current.plan_expires_at !== snapshot.plan_expires_at ||
        current.pro_welcome_pending !== snapshot.pro_welcome_pending) return
      if (current.plan !== updated.plan || current.plan_expires_at !== updated.plan_expires_at ||
        current.pro_welcome_pending !== updated.pro_welcome_pending) {
        useAuthStore.getState().setUser({
          ...current, plan: updated.plan, plan_expires_at: updated.plan_expires_at,
          pro_welcome_pending: updated.pro_welcome_pending,
        })
      }
    }).catch((error: unknown) => {
      if (active) console.warn('Could not refresh account plan; the next account sync will retry.', error)
    })
    return () => { active = false }
  }, [revision, userId, user?.plan, user?.plan_expires_at])

  useEffect(() => {
    if (!pending) { claim.current = null; return }
    if (!valid || !userId) return
    let active = true
    let started = false
    const check = () => {
      if (started || document.visibilityState !== 'visible' || !navigator.onLine) return
      started = true
      claim.current ??= profileApi.claimProWelcome()
      claim.current.then((result) => {
        const current = useAuthStore.getState().user
        if (!active || current?.id !== userId) return
        if (result.show) setReady(true)
        useAuthStore.getState().setUser({ ...current, pro_welcome_pending: false })
      }).catch((error: unknown) => {
        claim.current = null
        if (active) console.warn('Could not claim the Pro welcome; the next account sync will retry.', error)
      })
    }
    check()
    const timer = setInterval(check, 750)
    return () => { active = false; clearInterval(timer) }
  }, [pending, valid, userId, revision])

  useEffect(() => {
    if (!valid) { close(); return }
    if (!ready || open) return
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !document.querySelector('[role="dialog"]')) setOpen(true)
    }, 750)
    return () => clearInterval(timer)
  }, [ready, open, valid, close])

  useEffect(() => {
    if (!open || !valid) return
    const previous = document.activeElement
    const dialog = content.current?.closest('[role="dialog"]')
    const shell = document.querySelector<HTMLElement>('.app-shell')
    const wasInert = shell?.inert ?? false
    if (shell) shell.inert = true
    start.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const controls = Array.from(dialog?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (shell) shell.inert = wasInert
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [open, valid])

  return (
    <Modal open={open && valid} title="Congratulations, you're Pro!" onClose={close}>
      <div ref={content} className="pro-welcome relative isolate overflow-hidden rounded-xl border border-amber-400/25 px-4 py-7 text-center sm:px-7">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          {Array.from({ length: 20 }, (_, index) => (
            <i key={index} className="pro-welcome-confetti absolute top-0 h-2 w-1 rounded-sm"
              style={{ left: `${5 + index * 4.7}%`, backgroundColor: ['#e6c997', '#fef3c7', '#d5b278'][index % 3], animationDelay: `${index * .06}s`, animationDuration: `${2.4 + (index % 4) * .3}s` }} />
          ))}
        </div>
        <div aria-hidden="true" className="pro-welcome-crown relative mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-amber-300/50 bg-amber-400/10 text-amber-200 shadow-[0_0_60px_-12px_#d5b27880]">
          <Crown className="h-11 w-11" strokeWidth={1.4} />
          <Sparkles className="absolute -right-2 top-1 h-6 w-6 text-amber-300" />
          <Check className="absolute -bottom-1 right-0 h-7 w-7 rounded-full border border-amber-300/40 bg-gray-900 p-1 text-amber-200" />
        </div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[.25em] text-amber-200">Welcome to JobPilot Pro</p>
        <h3 className="font-serif text-3xl leading-tight text-gray-50 sm:text-4xl">More possibilities.<br />Your next chapter.</h3>
        <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-gray-300">Your Pro access is active. Enjoy more daily auto-applies while keeping every opportunity organized.</p>
        {user?.plan_expires_at && <p className="mt-3 text-xs text-amber-200/80">Pro active until {new Date(user.plan_expires_at).toLocaleDateString()}</p>}
        <button ref={start} type="button" className="btn-primary mt-7 w-full" onClick={() => { close(); navigate('/auto-apply') }}>Explore Pro<ArrowRight className="h-4 w-4" /></button>
        <button type="button" className="mt-2 min-h-11 w-full rounded-lg text-xs text-gray-400 hover:text-gray-100" onClick={close}>Continue browsing</button>
      </div>
    </Modal>
  )
}
