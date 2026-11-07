// Author: Kishore Kumar
// "My schedules" — schedules run by this app's scheduler, with state, next start times, an enable
// switch and Run now / Edit / Delete (opens ScheduleEditor).
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, ChevronLeft, Clock, Pencil, Play, Plus, RefreshCw, Search, Trash2, X as XIcon } from 'lucide-react'
import { Button } from '../ui/Button'
import { Hint } from '../ui/Hint'
import { useManualRefresh } from '../../hooks/useManualRefresh'
import { ScheduleRowSkeleton } from './skeletons'
import { useModalEscape } from '../../hooks/useModalEscape'
import { deleteSchedule, listSchedules, regressionErrorMessage, Schedule, scheduleAction, UntilItem, WhenItem } from '../../api/regression'
import { ScheduleEditor } from './ScheduleEditor'

const PAGE_SIZE = 15

/** "Sat 31 Oct, 02:30" in the viewer's time zone. */
function startText(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function typeText(s: Schedule): string {
  if (s.type === 'cron') return `Cron · ${s.data}`
  if (s.type === 'continuous') return 'Continuous'
  if (s.type === 'once') return 'Once'
  return s.type
}

function hhmm(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '?' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function whenText(w: WhenItem): string {
  if (w.type === 'days') return w.value.map((d) => d.slice(0, 3)).join(', ')
  if (w.type === 'between') return `${hhmm(w.value.after)}–${hhmm(w.value.before)}`
  if (w.type === 'betweenCertainDays') return `${hhmm(w.value.between.after)}–${hhmm(w.value.between.before)} on ${w.value.days.map((d) => d.slice(0, 3)).join(', ')}`
  return `max ${w.value.executions}/day`
}

function untilText(u: UntilItem): string {
  if (u.type === 'timestamp') return `until ${new Date(u.value).toLocaleString()}`
  if (u.type === 'executions') return `after ${u.value} execution${Number(u.value) === 1 ? '' : 's'}`
  return `when a run is ${u.value}`
}

function StatusChip({ s }: { s: Schedule }) {
  const status = (s.state.status ?? '').toLowerCase()
  const running = status === 'running' || !!s.state.currentRunUuid
  const label = running ? 'Running' : status === 'stopped' ? 'Stopped' : !s.enabled ? 'Disabled' : status ? status[0].toUpperCase() + status.slice(1) : 'Idle'
  const cls = running ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40' : status === 'stopped' ? 'bg-amber-500/15 text-amber-300 ring-amber-500/30' : !s.enabled ? 'bg-gray-700/40 text-gray-400 ring-gray-600/40' : 'bg-sky-500/15 text-sky-300 ring-sky-500/30'
  return (
    <span title={s.state.stopReason ?? undefined} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${cls}`}>
      {running && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {label}
    </span>
  )
}

function Switch({ on, disabled, onClick, label }: { on: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <Hint text={label} className={disabled ? 'cursor-not-allowed' : ''}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); onClick() }}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-50 ${on ? 'bg-primary-500' : 'bg-gray-700'}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </button>
    </Hint>
  )
}

function ConfirmDelete({ s, busy, onConfirm, onClose }: { s: Schedule; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  useModalEscape(onClose)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Delete schedule" className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-100">Delete schedule?</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-300"><XIcon className="h-4 w-4" /></button>
        </div>
        <div className="space-y-2 p-4 text-sm text-gray-300">
          <p><span className="font-semibold text-gray-100">{s.name}</span> will be deleted and won't start any more runs.</p>
          <p className="text-xs text-gray-500">Runs it already started keep going and stay in your runs list. Its run configs are not deleted.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-800 p-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={onConfirm} loading={busy}>Delete</Button>
        </div>
      </div>
    </div>
  )
}

interface Props {
  canRun: boolean
  inspectorUsername: string
  onBack: () => void
  onNotify: (message: string, kind?: 'success' | 'error') => void
  /** Called after "Run now" so the runs panel can refresh. */
  onExecuted?: () => void
}

export function SchedulesPanel({ canRun, inspectorUsername, onBack, onNotify, onExecuted }: Props) {
  const [editor, setEditor] = useState<{ initial?: Schedule } | null>(null)
  const [timezone, setTimezone] = useState<string | undefined>()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Schedule[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Schedule | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(q.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await listSchedules(debounced, page, PAGE_SIZE)
      setTimezone(r.timezone)
      setRows(r.data)
      setTotal(r.total)
      setTotalPages(Math.max(1, r.totalPage))
      setError(null)
    } catch (err) {
      setError(regressionErrorMessage(err, 'Could not load schedules.'))
    } finally {
      setLoading(false)
    }
  }, [debounced, page])

  useEffect(() => { load() }, [load])
  const manual = useManualRefresh(load)
  // Follow running schedules: refresh every 30 s while this list is open (with the same skeleton).
  useEffect(() => {
    if (editor) return
    const t = setInterval(() => manual.refresh(), 30_000)
    return () => clearInterval(t)
  }, [manual.refresh, editor])


  async function act(s: Schedule, action: 'enable' | 'disable' | 'execute') {
    setBusy(s.uuid)
    try {
      await scheduleAction(s.uuid, action)
      onNotify(action === 'execute' ? `Schedule “${s.name}” started` : `Schedule “${s.name}” ${action}d`)
      if (action === 'execute') onExecuted?.()
      load()
    } catch (err) {
      onNotify(`Couldn't ${action === 'execute' ? 'run' : action} “${s.name}”: ${regressionErrorMessage(err, 'failed')}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  async function doDelete() {
    if (!toDelete) return
    setBusy(toDelete.uuid)
    try {
      await deleteSchedule(toDelete.uuid)
      onNotify(`Schedule “${toDelete.name}” deleted`)
      setToDelete(null)
      load()
    } catch (err) {
      onNotify(`Couldn't delete “${toDelete.name}”: ${regressionErrorMessage(err, 'failed')}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  if (editor) {
    return (
      <ScheduleEditor
        initial={editor.initial}
        inspectorUsername={inspectorUsername}
        timezone={timezone}
        onCancel={() => setEditor(null)}
        onError={(m) => onNotify(m, 'error')}
        onSaved={(name, created) => {
          onNotify(created ? `Schedule “${name}” created` : `Schedule “${name}” saved`)
          setEditor(null)
          load()
        }}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-gray-800 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Hint text="Back to run configs">
              <button onClick={onBack} aria-label="Back to run configs" className="text-gray-400 hover:text-gray-100">
                <ChevronLeft className="h-4 w-4" />
              </button>
            </Hint>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-100">
              <CalendarClock className="h-4 w-4 text-primary-400" /> My schedules
              <span className="text-xs font-normal tabular-nums text-gray-500">{total}</span>
            </h2>
          </div>
          {canRun && <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditor({})}>New schedule</Button>}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search schedules by name…" aria-label="Search schedules" className="h-9 w-full rounded-lg border border-gray-700 bg-gray-800 pl-9 pr-3 text-sm text-gray-100 placeholder-gray-500 focus:border-primary-500 focus:outline-none" />
          </div>
          <Hint text="Refresh">
            <button onClick={() => manual.refresh()} aria-label="Refresh" className="text-gray-400 hover:text-gray-100">
              <RefreshCw className={`h-4 w-4 ${loading || manual.refreshing ? 'animate-spin' : ''}`} />
            </button>
          </Hint>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <p className="p-4 text-sm text-red-400">{error}</p>
        ) : (loading && rows.length === 0) || manual.refreshing ? (
          <div className="divide-y divide-gray-800">{Array.from({ length: 4 }).map((_, i) => <ScheduleRowSkeleton key={i} />)}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-gray-400">{debounced ? `No schedules match “${debounced}”.` : "You don't have any schedules yet."}</p>
            <p className="text-xs text-gray-500">A schedule starts your run configs automatically — continuously, on a cron timetable, or once.</p>
            {canRun && !debounced && <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditor({})}>New schedule</Button>}
          </div>
        ) : (
          <ul className="divide-y divide-gray-800">
            {rows.map((s) => (
              <li key={s.uuid} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <CalendarClock className="mt-1 h-4 w-4 shrink-0 text-gray-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm text-gray-100" title={s.name}>{s.name}</p>
                      <StatusChip s={s} />
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
                      <span className="font-mono">{typeText(s)}</span>
                      <span className="text-gray-600">·</span>
                      <span>{s.mode === 'sequential' ? 'one after another' : 'in parallel'}</span>
                      <span className="text-gray-600">·</span>
                      <span className="tabular-nums">{s.state.executions} execution{s.state.executions === 1 ? '' : 's'}</span>
                    </p>
                    {(s.when?.value?.length || s.until?.value?.length) ? (
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {s.when?.value?.length ? <>only {s.when.value.map(whenText).join(s.when.type === 'and' ? ' and ' : ' or ')}</> : null}
                        {s.when?.value?.length && s.until?.value?.length ? ' · ' : null}
                        {s.until?.value?.length ? s.until.value.map(untilText).join(s.until.type === 'and' ? ' and ' : ' or ') : null}
                      </p>
                    ) : null}
                    {s.state.stopReason && (s.enabled || s.state.status === 'stopped') && <p className="mt-0.5 text-[11px] text-amber-300">{s.state.stopReason}</p>}
                    {s.nextRuns && s.nextRuns.length > 0 && (
                      <Hint text={`Next starts:\n${s.nextRuns.map(startText).join('\n')}`}>
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
                          <Clock className="h-3 w-3 text-gray-500" /> Next: <span className="text-gray-200">{startText(s.nextRuns[0])}</span>
                        </span>
                      </Hint>
                    )}
                    {s.lastError && (
                      <p className="mt-0.5 flex items-start gap-1 text-[11px] text-red-300" title={s.lastError}>
                        <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> <span className="line-clamp-2">{s.lastError}</span>
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {s.runConfigs.map((r) => (
                        <span key={r.uuid} className="max-w-full truncate rounded bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-300" title={r.uuid}>{r.name ?? r.uuid}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 self-center">
                    <Switch on={s.enabled} disabled={!canRun || busy === s.uuid} onClick={() => act(s, s.enabled ? 'disable' : 'enable')} label={!canRun ? 'Needs Regression: run' : s.enabled ? 'On — click to disable this schedule' : 'Off — click to enable this schedule'} />
                    <Hint text={!canRun ? 'Needs Regression: run' : s.state.currentRunUuid ? 'Already running — wait for it to finish' : 'Run now'} className={!canRun || busy === s.uuid || s.state.currentRunUuid ? 'cursor-not-allowed' : ''}>
                      <button onClick={() => act(s, 'execute')} disabled={!canRun || busy === s.uuid || !!s.state.currentRunUuid} aria-label="Run now" className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 disabled:pointer-events-none disabled:opacity-30 hover:bg-gray-800 hover:text-gray-100"><Play className="h-4 w-4" /></button>
                    </Hint>
                    <Hint text={canRun ? 'Edit' : 'Needs Regression: run'} className={!canRun ? 'cursor-not-allowed' : ''}>
                      <button onClick={() => setEditor({ initial: s })} disabled={!canRun} aria-label="Edit" className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 disabled:pointer-events-none disabled:opacity-30 hover:bg-gray-800 hover:text-gray-100"><Pencil className="h-4 w-4" /></button>
                    </Hint>
                    <Hint text={canRun ? 'Delete' : 'Needs Regression: run'} className={!canRun || busy === s.uuid ? 'cursor-not-allowed' : ''}>
                      <button onClick={() => setToDelete(s)} disabled={!canRun || busy === s.uuid} aria-label="Delete" className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 disabled:pointer-events-none disabled:opacity-30 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                    </Hint>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between border-t border-gray-800 px-4 py-2 text-xs text-gray-500">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="hover:text-gray-300 disabled:opacity-40">← Prev</button>
          <span className="tabular-nums">Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="hover:text-gray-300 disabled:opacity-40">Next →</button>
        </div>
      )}

      {toDelete && <ConfirmDelete s={toDelete} busy={busy === toDelete.uuid} onConfirm={doDelete} onClose={() => setToDelete(null)} />}
    </div>
  )
}
