// Author: Kishore Kumar
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CalendarDays, CheckCircle2, Info, ListFilter, Loader2, Plus, X } from 'lucide-react'
import { useToastStore } from '../../store/toastStore'
import { THEMES, useThemeStore } from '../../store/themeStore'
import type { ApplicationStatus, JobSource } from '../../types'

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />
}

function Shimmer({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />
}

function ChartShimmer() {
  return (
    <div className="space-y-4">
      <Shimmer className="h-4 w-40 max-w-full" />
      <div className="flex h-44 items-end gap-3 border-b border-l border-gray-800 px-3">
        {['h-12', 'h-24', 'h-16', 'h-32', 'h-20', 'h-40', 'h-28'].map((height, i) => <Shimmer key={i} className={`min-w-0 flex-1 ${height}`} />)}
      </div>
    </div>
  )
}

export function PageLoader({ variant = 'list' }: { variant?: 'list' | 'dashboard' | 'cards' | 'form' | 'table' | 'chart' }) {
  return (
    <div role="status" aria-label="Loading content" className="w-full min-w-0">
      <span className="sr-only">Loading content...</span>
      <div aria-hidden="true" className="space-y-4">
        {variant === 'dashboard' && (
          <>
            <Shimmer className="h-7 w-64 max-w-full" />
            <Shimmer className="h-4 w-80 max-w-full" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="card space-y-3 p-5"><Shimmer className="h-10 w-10" /><Shimmer className="h-7 w-16" /><Shimmer className="h-4 w-24 max-w-full" /></div>
              ))}
            </div>
            <div className="card card-pad"><ChartShimmer /></div>
          </>
        )}
        {variant === 'chart' && <ChartShimmer />}
        {variant === 'list' && Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="card flex gap-4 p-4 sm:p-5">
            <Shimmer className="h-12 w-12 shrink-0" />
            <div className="min-w-0 flex-1 space-y-3">
              <Shimmer className="h-4 w-3/5" /><Shimmer className="h-3 w-4/5" /><Shimmer className="h-3 w-2/5" />
            </div>
            <Shimmer className="hidden h-9 w-20 shrink-0 sm:block" />
          </div>
        ))}
        {variant === 'cards' && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="card space-y-4 p-5">
                <Shimmer className="h-12 w-12" /><Shimmer className="h-5 w-3/5" /><Shimmer className="h-3 w-full" /><Shimmer className="h-3 w-4/5" /><Shimmer className="h-10 w-full" />
              </div>
            ))}
          </div>
        )}
        {variant === 'form' && (
          <div className="card card-pad space-y-5">
            <Shimmer className="h-6 w-40 max-w-full" />
            <div className="grid gap-5 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="space-y-2"><Shimmer className="h-3 w-24 max-w-full" /><Shimmer className="h-10 w-full" /></div>
              ))}
            </div>
            <Shimmer className="h-24 w-full" /><Shimmer className="h-10 w-32 max-w-full" />
          </div>
        )}
        {variant === 'table' && (
          <div className="card divide-y divide-gray-800">
            {Array.from({ length: 6 }, (_, row) => (
              <div key={row} className="grid grid-cols-3 gap-4 p-4">
                {Array.from({ length: 3 }, (_, col) => <Shimmer key={col} className={`${row === 0 ? 'h-3' : 'h-5'} ${col === 2 ? 'w-2/3' : 'w-full'}`} />)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div data-guide="page-header" className="page-header mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="page-kicker">YOUR NEXT CHAPTER</p>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty-state flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-400">{icon}</div>
      <h3 className="text-base font-semibold text-gray-50">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-gray-400">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card max-h-[90dvh] w-full min-w-0 max-w-lg animate-fade-up overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="dialog-heading min-w-0 break-words text-xl">{title}</h2>
          <button className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-800 hover:text-gray-200" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>,
    document.body
  )
}

export function Toaster() {
  const { toasts, dismiss } = useToastStore()
  const icon = { success: <CheckCircle2 className="h-5 w-5 text-emerald-500" />, error: <AlertCircle className="h-5 w-5 text-rose-500" />, info: <Info className="h-5 w-5 text-brand-500" /> }
  return (
    <div className="pointer-events-none fixed right-3 top-4 z-[60] flex w-[calc(100%-1.5rem)] max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="card pointer-events-auto flex animate-slide-in items-start gap-3 p-4">
          {icon[t.kind]}
          <p className="min-w-0 flex-1 break-words text-sm font-medium text-gray-200">{t.message}</p>
          <button onClick={() => dismiss(t.id)} className="text-gray-500 hover:text-gray-200" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

export function TagInput({
  value,
  onChange,
  placeholder,
  max = 30,
  suggestions = [],
}: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  max?: number
  suggestions?: string[]
}) {
  const [text, setText] = useState('')
  const add = (raw: string) => {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
    const next = [...value]
    for (const p of parts) if (next.length < max && !next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p)
    onChange(next)
    setText('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (text.trim()) add(text)
    } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
  }
  const rest = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 6)
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-800 bg-gray-900 p-2 focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-500/10">
        {value.map((t) => (
          <span key={t} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-300">
            <span className="min-w-0 break-words">{t}</span>
            <button type="button" onClick={() => onChange(value.filter((v) => v !== t))} aria-label={`Remove ${t}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          className="min-w-[8rem] flex-1 bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-gray-500"
          value={text}
          placeholder={value.length ? '' : placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => text.trim() && add(text)}
        />
      </div>
      {rest.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {rest.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-700 px-2.5 py-0.5 text-xs text-gray-400 hover:border-brand-400 hover:text-brand-300">
              <Plus className="h-3 w-3" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ProgressRing({ value, size = 72, label }: { value: number; size?: number; label?: string }) {
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="url(#ring)" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, value) / 100)} className="transition-all duration-700" />
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="rgb(var(--brand-500))" />
            <stop offset="1" stopColor="rgb(var(--brand-700))" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-sm font-bold text-gray-100">{label ?? `${value}%`}</span>
    </div>
  )
}

const PLATFORM_STYLE: Record<string, { bg: string; text: string; mark: string }> = {
  linkedin: { bg: 'bg-sky-600', text: 'text-white', mark: 'in' },
  naukri: { bg: 'bg-blue-500', text: 'text-white', mark: 'N' },
  indeed: { bg: 'bg-indigo-700', text: 'text-white', mark: 'i' },
  glassdoor: { bg: 'bg-emerald-600', text: 'text-white', mark: 'G' },
  foundit: { bg: 'bg-fuchsia-600', text: 'text-white', mark: 'f' },
  instahyre: { bg: 'bg-orange-500', text: 'text-white', mark: 'Ih' },
  manual: { bg: 'bg-slate-500', text: 'text-white', mark: '+' },
  other: { bg: 'bg-slate-500', text: 'text-white', mark: '•' },
}

export function PlatformLogo({ platform, size = 'h-10 w-10' }: { platform: JobSource; size?: string }) {
  const s = PLATFORM_STYLE[platform] ?? PLATFORM_STYLE.other
  return <span className={`inline-flex ${size} shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ${s.bg} ${s.text}`}>{s.mark}</span>
}

export const STATUS_META: Record<ApplicationStatus, { label: string; cls: string }> = {
  applied: { label: 'Applied', cls: 'bg-sky-500/10 text-sky-300 ring-sky-500/30' },
  shortlisted: { label: 'Shortlisted', cls: 'bg-violet-500/10 text-violet-300 ring-violet-500/30' },
  interview_scheduled: { label: 'Interview scheduled', cls: 'bg-amber-500/10 text-amber-300 ring-amber-500/30' },
  interview_completed: { label: 'Interview done', cls: 'bg-orange-500/10 text-orange-300 ring-orange-500/30' },
  offer: { label: 'Offer', cls: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30' },
  rejected: { label: 'Rejected', cls: 'bg-rose-500/10 text-rose-300 ring-rose-500/30' },
  to_apply: { label: 'To apply', cls: 'bg-sky-500/10 text-sky-300 ring-sky-500/30' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-gray-800 text-gray-300 ring-gray-700' },
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.applied
  return <span className={`badge ${m.cls}`}>{m.label}</span>
}

export function MatchBadge({ score }: { score: number | null }) {
  if (score == null) return null
  const cls = score >= 75 ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30' : score >= 50 ? 'bg-amber-500/10 text-amber-300 ring-amber-500/30' : 'bg-gray-800 text-gray-300 ring-gray-700'
  return <span className={`badge ${cls}`}>{score}% match</span>
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="label">{label}</label>
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-brand-600' : 'bg-gray-600'}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-gray-900 shadow transition-all ${checked ? 'left-[1.4rem]' : 'left-0.5'}`} />
    </button>
  )
}

export const JOB_TYPE_LABEL: Record<string, string> = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', internship: 'Internship' }

export function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString()
}

export function ThemePicker({ dark = false }: { dark?: boolean }) {
  const { theme, setTheme } = useThemeStore()
  return (
    <div role="radiogroup" aria-label="Accent colour" className="flex max-w-full flex-wrap items-center gap-2.5">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          aria-label={t.label}
          title={t.label}
          onClick={() => setTheme(t.id)}
          style={{ backgroundColor: t.swatch }}
          className={`flex h-7 w-7 items-center justify-center rounded-full transition hover:scale-110 ${t.id === 'gold' ? 'text-gray-950' : 'text-white'} ${theme === t.id ? `ring-2 ring-offset-2 ${dark ? 'ring-white ring-offset-ink-900' : 'ring-white ring-offset-white'}` : ''}`}
        >
          {theme === t.id && <span className="text-xs font-bold">✓</span>}
        </button>
      ))}
    </div>
  )
}

const TOTP_PERIOD = 30
const TOTP_R = 10
const TOTP_CIRC = 2 * Math.PI * TOTP_R

function totpState() {
  const t = Date.now() / 1000
  return { secsLeft: TOTP_PERIOD - (Math.floor(t) % TOTP_PERIOD), elapsed: (t % TOTP_PERIOD) / TOTP_PERIOD }
}

// Ring + countdown for the current 30s authenticator window, like the app itself shows.
export function TotpTimer() {
  const [{ secsLeft, elapsed }, setState] = useState(totpState)
  useEffect(() => {
    const id = setInterval(() => setState(totpState()), 50)
    return () => clearInterval(id)
  }, [])
  const color = secsLeft > 10 ? 'rgb(var(--brand-400))' : secsLeft > 5 ? '#fbbf24' : '#f87171'
  return (
    <span className="inline-flex items-center gap-1.5" title="Time left for the current authenticator code">
      <svg width="24" height="24" viewBox="0 0 24 24" className="-rotate-90">
        <circle cx="12" cy="12" r={TOTP_R} fill="none" stroke="#374151" strokeWidth="2.5" />
        <circle cx="12" cy="12" r={TOTP_R} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={TOTP_CIRC} strokeDashoffset={TOTP_CIRC * elapsed} />
      </svg>
      <span className="w-6 text-center font-mono text-xs font-semibold tabular-nums" style={{ color }}>{secsLeft}s</span>
    </span>
  )
}

export interface DateRange { start: string; end: string }
export const ALL_TIME: DateRange = { start: '', end: '' }

export function FilterBar({ children, active, onClear, summary, actions }: { children: ReactNode; active: boolean; onClear: () => void; summary?: string; actions?: ReactNode }) {
  return (
    <section aria-label="Filters" className="filter-bar mb-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold text-gray-300"><ListFilter className="h-4 w-4 text-brand-400" />Filters</h2>
        <div className="flex flex-wrap items-center gap-3">
          {summary && <p aria-live="polite" className="text-xs text-gray-400">{summary}</p>}
          {active && <button type="button" className="filter-clear" onClick={onClear}><X className="h-3.5 w-3.5" />Clear filters</button>}
          {actions}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4">{children}</div>
    </section>
  )
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="filter-field"><span className="label">{label}</span>{children}</label>
}

export function FilterChips<T extends string>({ label, value, options, onChange, wide = false }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; wide?: boolean }) {
  return (
    <fieldset className={`filter-field ${wide ? 'filter-wide' : ''}`}>
      <legend className="label">{label}</legend>
      <select className="input sm:hidden" aria-label={label} value={value} onChange={(event) => onChange(options[event.currentTarget.selectedIndex].value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <div className="filter-segments hidden sm:flex">
        {options.map((option) => <button key={option.value} type="button" className="filter-chip" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
      </div>
    </fieldset>
  )
}

const isoDay = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const DATE_PRESETS = [{ label: 'Today', days: 0 }, { label: '7 days', days: 7 }, { label: '30 days', days: 30 }, { label: '90 days', days: 90 }]

export function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  const today = isoDay(new Date())
  const preset = (days: number): DateRange => ({ start: isoDay(new Date(Date.now() - days * 86_400_000)), end: today })
  const dirty = draft.start !== value.start || draft.end !== value.end
  const error = draft.start && draft.end && draft.start > draft.end ? 'Start date must be on or before end date.' : draft.start > today || draft.end > today ? 'Dates cannot be in the future.' : ''
  return (
    <section aria-label="Date filters" className="filter-bar date-filter">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {DATE_PRESETS.map((p) => {
          const r = preset(p.days)
          return <button key={p.label} type="button" className="filter-chip filter-preset" aria-pressed={value.start === r.start && value.end === r.end} onClick={() => onChange(r)}>{p.label}</button>
        })}
        <button type="button" className="filter-chip filter-preset" aria-pressed={!value.start && !value.end} onClick={() => { setDraft(ALL_TIME); onChange(ALL_TIME) }}>All time</button>
      </div>
      <div className="flex min-w-0 flex-wrap items-end gap-3">
        <label className="filter-date-field"><span className="label flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-brand-400" />Start date</span><input type="date" aria-label="Start date" aria-invalid={!!error} className="input" value={draft.start} max={draft.end && draft.end < today ? draft.end : today} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></label>
        <label className="filter-date-field"><span className="label flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-brand-400" />End date</span><input type="date" aria-label="End date" aria-invalid={!!error} className="input" value={draft.end} min={draft.start} max={today} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></label>
        {dirty && <button type="button" className="btn-primary" disabled={!!error} onClick={() => onChange(draft)}>Apply</button>}
        {(value.start || value.end || dirty) && <button type="button" className="filter-clear" onClick={() => { setDraft(ALL_TIME); onChange(ALL_TIME) }}><X className="h-3.5 w-3.5" />Clear dates</button>}
      </div>
      {error && <p role="alert" className="field-error">{error}</p>}
    </section>
  )
}
