// Author: Kishore Kumar
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, X } from 'lucide-react'
import { apiClient, errorMessage } from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { useSettingsStore } from '../../store/settingsStore'
import { toast } from '../../store/toastStore'
import { PAGE_GUIDES } from '../../utils/guides'

export function AppGuide({ automatic = true }: { automatic?: boolean }) {
  const location = useLocation()
  const settingsOpen = useSettingsStore((s) => s.open)
  const settingsTab = useSettingsStore((s) => s.tab)
  const adminTab = new URLSearchParams(location.search).get('tab') || 'users'
  const context = settingsOpen ? `settings:${settingsTab}` : location.pathname === '/admin' ? `admin:${adminTab}` : location.pathname
  const guide = PAGE_GUIDES[context] ?? PAGE_GUIDES['admin:users']
  const steps = guide.steps
  const userId = useAuthStore((s) => s.user?.id)
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const card = useRef<HTMLDivElement>(null)
  const claim = useRef<{ id: number; request: Promise<{ show: boolean; shown: number }> } | null>(null)
  const step = steps[index] ?? steps[0]

  const start = () => {
    setIndex(0)
    setOpen(true)
  }

  useEffect(() => { setOpen(false); setIndex(0) }, [context])

  useEffect(() => {
    if (!userId || !automatic) return
    if (claim.current?.id !== userId) {
      claim.current = { id: userId, request: apiClient.post<{ show: boolean; shown: number }>('/profile/guide').then((r) => r.data) }
    }
    let active = true
    claim.current.request.then((result) => {
      if (active && result.show) { setIndex(0); setOpen(true) }
    }).catch((e) => { if (active) toast.error(errorMessage(e, 'Could not load automatic guide preferences. You can still open Guide manually.')) })
    return () => { active = false }
  }, [userId, automatic])

  useEffect(() => {
    const show = () => { setIndex(0); setOpen(true) }
    window.addEventListener('jobpilot:guide', show)
    return () => window.removeEventListener('jobpilot:guide', show)
  }, [])

  useEffect(() => {
    if (!open) return
    const targetElement = () => Array.from(document.querySelectorAll(`[data-guide="${step.target}"]`)).find((el) => el.getClientRects().length)
    const measure = () => {
      const target = targetElement()
      setRect(target?.getBoundingClientRect() ?? null)
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false) }
      if (e.key === 'ArrowRight') setIndex((n) => Math.min(n + 1, steps.length - 1))
      if (e.key === 'ArrowLeft') setIndex((n) => Math.max(0, n - 1))
    }
    const outside = (e: PointerEvent) => { if (e.target instanceof Node && !card.current?.contains(e.target)) setOpen(false) }
    targetElement()?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    measure()
    card.current?.focus()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('keydown', keyboard, true)
    document.addEventListener('pointerdown', outside, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('keydown', keyboard, true)
      document.removeEventListener('pointerdown', outside, true)
    }
  }, [open, step, steps.length])

  const left = Math.max(0, Math.min(viewport.width, (rect?.left ?? viewport.width / 2) - 8))
  const top = Math.max(0, Math.min(viewport.height, (rect?.top ?? viewport.height / 2) - 8))
  const right = Math.max(left, Math.min(viewport.width, (rect?.right ?? viewport.width / 2) + 8))
  const bottom = Math.max(top, Math.min(viewport.height, (rect?.bottom ?? viewport.height / 2) + 8))
  const width = Math.min(360, viewport.width - 24)
  const cardLeft = Math.max(12, Math.min((left + right) / 2 - width / 2, viewport.width - width - 12))
  const cardTop = bottom + 300 < viewport.height ? bottom + 14 : Math.max(12, viewport.height - 310)

  return (
    <>
      <button type="button" data-guide="guide" aria-label="Open guide" onClick={start} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-gray-800 bg-gray-800/50 px-2.5 text-xs font-medium text-gray-400 hover:bg-gray-800 hover:text-gray-100"><BookOpen className="h-4 w-4" /><span className="hidden sm:inline">Guide</span></button>
      {open && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[70]">
          <div className="fixed inset-x-0 top-0 bg-black/65" style={{ height: top }} />
          <div className="fixed inset-x-0 bottom-0 bg-black/65" style={{ top: bottom }} />
          <div className="fixed left-0 bg-black/65" style={{ top, width: left, height: Math.max(0, bottom - top) }} />
          <div className="fixed right-0 bg-black/65" style={{ top, left: right, height: Math.max(0, bottom - top) }} />
          <div className="fixed rounded-lg border-2 border-brand-400 shadow-glow" style={{ top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }} />
          <div ref={card} tabIndex={-1} role="dialog" aria-label="App guide" className="pointer-events-auto fixed overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 shadow-2xl" style={{ width, top: cardTop, left: cardLeft, maxHeight: viewport.height - cardTop - 12 }}>
            <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-4 py-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 shrink-0 text-brand-400" />{step.title}</h2><button aria-label="Close guide" onClick={() => setOpen(false)} className="shrink-0 p-1 text-gray-500 hover:text-gray-100"><X className="h-4 w-4" /></button></div>
            <p className="px-4 py-3 text-sm leading-relaxed text-gray-400">{step.text}</p>
            <div className="flex justify-center gap-1.5" aria-hidden="true">{steps.map((_, n) => <span key={n} className={`h-1.5 rounded-full ${index === n ? 'w-4 bg-brand-400' : 'w-1.5 bg-gray-700'}`} />)}</div>
            <div className="flex items-center justify-between gap-3 px-4 py-3"><span className="text-xs text-gray-500">{index + 1} / {steps.length}</span><div className="flex gap-2"><button className="btn-secondary btn-sm" aria-label="Previous guide step" disabled={index === 0} onClick={() => setIndex((n) => n - 1)}><ArrowLeft className="h-3.5 w-3.5" /></button><button className="btn-primary btn-sm" onClick={() => index === steps.length - 1 ? setOpen(false) : setIndex((n) => n + 1)}>{index === steps.length - 1 ? 'Done' : 'Next'}<ArrowRight className="h-3.5 w-3.5" /></button></div></div>
            {location.pathname !== '/guide' && <Link to="/guide" className="block border-t border-gray-800 px-4 py-3 text-xs font-medium text-brand-400 hover:text-brand-300" onClick={() => { setOpen(false); useSettingsStore.getState().close() }}>Browse other page guides</Link>}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
