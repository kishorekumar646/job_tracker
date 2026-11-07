// Author: Kishore Kumar
// Batch Analysis scope: which of this app's runs to analyse — runs picked in the Regression tab, or a
// time window plus filters — shown as a table you can tick runs in (read from this app's database, no
// InspectorWeb calls). Runs analysed before reuse their stored verdicts. Reports name + run UUIDs to the parent.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Loader2, RefreshCw, Search, X as XIcon } from 'lucide-react'
import { BatchPreview, BatchRun, listSchedules, previewBatch, regressionErrorMessage, Schedule } from '../../api/regression'
import { usernameOf } from '../../utils/user'
import { useAuthStore } from '../../store/authStore'
import { Hint } from '../ui/Hint'
import { Shimmer } from '../ui/Shimmer'

export interface BatchSelection {
  runUuids: string[]
  label: string
}

interface Props {
  /** Runs picked in the Regression tab; when set, filters are hidden. */
  presetRunUuids?: string[]
  onClearPreset: () => void
  onChange: (selection: BatchSelection) => void
  error?: string
}

const SCOPE_KEY = 'rca_batch_scope'

interface SavedScope { since?: string; unit?: 'hours' | 'days'; startedBy?: 'me' | 'all'; nameContains?: string; scheduleUuid?: string; onlyProblems?: boolean }

function readSavedScope(): SavedScope {
  try {
    return JSON.parse(sessionStorage.getItem(SCOPE_KEY) ?? '{}') as SavedScope
  } catch {
    return {}
  }
}

const labelCls = 'mb-1.5 block text-xs font-medium text-gray-400'
const inputCls = 'h-10 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 text-sm text-gray-100 placeholder-gray-600 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
const optional = <span className="font-normal text-gray-600">(optional)</span>

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-10 gap-1 rounded-lg border border-gray-700 bg-gray-800 p-1">
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`flex-1 rounded-md px-3 text-xs font-medium transition-colors ${value === v ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
          {text}
        </button>
      ))}
    </div>
  )
}

/** What the batch does with the run's analysis: new / already done (left out) / reused (ticked). */
function AnalysisCell({ run, included }: { run: BatchRun; included: boolean }) {
  const n = run.verdictCount ?? 0
  const verdicts = `${n} verdict${n === 1 ? '' : 's'}`
  if (!run.analysed) {
    return (
      <Hint text={included ? 'Not analysed yet — this batch fetches it from InspectorWeb and analyses it' : 'Not analysed yet — tick it to include it in this batch'}>
        <span className="inline-flex shrink-0 items-center whitespace-nowrap gap-1.5 text-[11px] text-gray-400"><span className="h-1.5 w-1.5 rounded-full bg-gray-500" /> Not analysed</span>
      </Hint>
    )
  }
  // Analysed runs link to their results (same tab; the results page has a Back link).
  const navigate = useNavigate()
  const href = `/runs/${run.runUuid}/analysis`
  const open = (e: React.MouseEvent) => {
    e.stopPropagation()  // don't tick / untick the row
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return  // let ⌘/Ctrl-click open a new tab
    e.preventDefault()
    navigate(href, { state: { from: 'batch' } })
  }
  return included ? (
    <Hint text={`Already analysed — this batch reuses its ${verdicts}. Click to open its results.`}>
      <a href={href} onClick={open}
        className="inline-flex shrink-0 items-center whitespace-nowrap gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300 ring-1 ring-sky-500/30 hover:bg-sky-500/25">
        <RefreshCw className="h-3 w-3" /> Reuse · {verdicts} <ArrowRight className="h-2.5 w-2.5 opacity-70" />
      </a>
    </Hint>
  ) : (
    <Hint text={`Already analysed (${verdicts}) — left out of this batch. Click to open its results; tick the row to include it.`}>
      <a href={href} onClick={open}
        className="inline-flex shrink-0 items-center whitespace-nowrap gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25">
        <CheckCircle2 className="h-3 w-3" /> Done · {verdicts} <ArrowRight className="h-2.5 w-2.5 opacity-70" />
      </a>
    </Hint>
  )
}

/** Loading placeholder in the table's shape: header bar and a few rows. */
function SkeletonTable() {
  return (
    <div aria-busy="true" aria-label="Loading runs">
      <div className="flex items-center gap-4 bg-gray-800 px-3 py-2.5">
        <Shimmer className="h-4 w-4 rounded" />
        <Shimmer className="h-3 w-24" />
        <Shimmer className="ml-auto h-3 w-40" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-gray-800/70 px-3 py-3">
          <Shimmer className="h-4 w-4 shrink-0 rounded" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Shimmer className="h-3.5 w-3/4" />
            <Shimmer className="h-2.5 w-1/2" />
          </div>
          <Shimmer className="h-5 w-14 rounded-full" />
          <Shimmer className="h-3 w-6" />
          <Shimmer className="h-3 w-16" />
          <Shimmer className="h-3 w-20" />
          <Shimmer className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function StatusCell({ run }: { run: BatchRun }) {
  return run.state === 'aborted'
    ? <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300 ring-1 ring-amber-500/30">Aborted</span>
    : run.state === 'passed'
      ? <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30">Passed</span>
      : <span className="inline-flex rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-300 ring-1 ring-red-500/30">Failed</span>
}

export function BatchScopeForm({ presetRunUuids, onClearPreset, onChange, error }: Props) {
  const presetKey = presetRunUuids?.join(',') ?? ''
  const preset = useMemo(() => (presetKey ? presetKey.split(',') : null), [presetKey])

  // Your runs; admins can include everyone's (the server enforces the same rule).
  const isAdmin = useAuthStore((st) => st.user?.role === 'admin')
  // Filters are remembered for this browser session, so coming back from a run's results keeps them.
  const saved = useMemo(() => readSavedScope(), [])
  const [since, setSince] = useState(saved.since ?? '24')
  const [unit, setUnit] = useState<'hours' | 'days'>(saved.unit ?? 'hours')
  const [startedBy, setStartedBy] = useState<'me' | 'all'>(isAdmin && saved.startedBy === 'all' ? 'all' : 'me')
  const [nameContains, setNameContains] = useState(saved.nameContains ?? '')
  const [scheduleUuid, setScheduleUuid] = useState(saved.scheduleUuid ?? '')
  const [onlyProblems, setOnlyProblems] = useState(saved.onlyProblems ?? true)
  useEffect(() => {
    try {
      sessionStorage.setItem(SCOPE_KEY, JSON.stringify({ since, unit, startedBy, nameContains, scheduleUuid, onlyProblems }))
    } catch { /* storage unavailable — filters just reset */ }
  }, [since, unit, startedBy, nameContains, scheduleUuid, onlyProblems])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  // Batch name: follows the scope until the user types their own.
  const [batchName, setBatchName] = useState('')
  const nameEdited = useRef(false)

  const [preview, setPreview] = useState<BatchPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  useEffect(() => {
    listSchedules('', 1, 100).then((p) => setSchedules(p.data)).catch(() => setSchedules([]))
  }, [])

  const hours = Math.max(1, Number(since) || 0) * (unit === 'days' ? 24 : 1)
  const validWindow = Number(since) >= 1

  useEffect(() => {
    if (!preset && !validWindow) { setPreview(null); return }
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const p = await previewBatch(preset
          ? { runUuids: preset, onlyProblems: false }
          : { sinceHours: hours, startedBy, nameContains: nameContains.trim() || undefined, scheduleUuid: scheduleUuid || undefined, onlyProblems })
        // Runs analysed before start unticked — tick one to include its stored verdicts.
        if (!cancelled) { setPreview(p); setExcluded(new Set(p.runs.filter((r) => r.analysed).map((r) => r.runUuid))); setLoadError(null) }
      } catch (err) {
        if (!cancelled) { setPreview(null); setLoadError(regressionErrorMessage(err, 'Could not load the runs.')) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [preset, validWindow, hours, startedBy, nameContains, scheduleUuid, onlyProblems])

  const runs = useMemo(() => preview?.runs ?? [], [preview])
  const selected = useMemo(() => runs.filter((r) => !excluded.has(r.runUuid)), [runs, excluded])
  const scheduleName = schedules.find((s) => s.uuid === scheduleUuid)?.name

  const suggestedName = preset
    ? `Batch · ${preset.length} picked run${preset.length === 1 ? '' : 's'}`
    : [
        `Batch · last ${since || '?'} ${unit === 'days' ? (since === '1' ? 'day' : 'days') : 'h'}`,
        startedBy === 'me' ? 'my runs' : 'all runs',
        nameContains.trim() && `“${nameContains.trim()}”`,
        scheduleName,
      ].filter(Boolean).join(' · ')

  useEffect(() => {
    if (!nameEdited.current) setBatchName(suggestedName)
  }, [suggestedName])

  useEffect(() => {
    onChange({ runUuids: selected.map((r) => r.runUuid), label: batchName.trim() || suggestedName })
  }, [selected, batchName, suggestedName, onChange])

  const toggle = (u: string) => setExcluded((s) => { const n = new Set(s); if (n.has(u)) n.delete(u); else n.add(u); return n })
  const allOn = runs.length > 0 && excluded.size === 0
  const someOn = excluded.size > 0 && excluded.size < runs.length
  const t = preview?.totals
  const reused = selected.filter((r) => r.analysed).length
  const failedTests = selected.reduce((n, r) => n + (r.runInfo?.FAILED ?? 0), 0)
  const aborted = selected.filter((r) => r.state === 'aborted').length

  return (
    <div className="space-y-5">
      {/* Name */}
      <div>
        <label className={labelCls} htmlFor="batch-name">Batch name *</label>
        <input
          id="batch-name"
          value={batchName}
          maxLength={200}
          onChange={(e) => { nameEdited.current = true; setBatchName(e.target.value) }}
          onBlur={() => { if (!batchName.trim()) { nameEdited.current = false; setBatchName(suggestedName) } }}
          className={inputCls}
        />
        <p className="mt-1 text-[11px] text-gray-500">Shown in Job History. Filled in from the scope until you change it.</p>
      </div>

      {/* Scope */}
      {preset ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary-500/30 bg-primary-500/10 px-4 py-3 text-sm text-primary-100">
          <span>{preset.length} run{preset.length === 1 ? '' : 's'} picked in the Regression tab.</span>
          <button type="button" onClick={onClearPreset} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-300 hover:text-primary-100">
            <XIcon className="h-3.5 w-3.5" /> Use filters instead
          </button>
        </div>
      ) : (
        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Which runs</legend>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="batch-since">Started in the last *</label>
              <div className="flex gap-2">
                <input id="batch-since" type="number" min={1} value={since} onChange={(e) => setSince(e.target.value)}
                  className={`${inputCls.replace('w-full', 'w-24')} shrink-0 ${validWindow ? '' : 'border-red-500'}`} />
                <div className="flex-1"><Segmented label="Time unit" value={unit} onChange={setUnit} options={[['hours', 'Hours'], ['days', 'Days']]} /></div>
              </div>
              {!validWindow && <p className="mt-1 text-xs text-red-400">Enter 1 or more.</p>}
            </div>
            <div>
              <span className={labelCls}>Started by</span>
              {isAdmin ? (
                <Segmented label="Started by" value={startedBy} onChange={setStartedBy} options={[['me', 'Me'], ['all', 'Everyone']]} />
              ) : (
                <Hint text="You can batch-analyse your own runs. Only admins can include everyone's." className="w-full">
                  <div className={`${inputCls} flex items-center text-gray-400`}>Me — your runs</div>
                </Hint>
              )}
            </div>
            <div>
              <label className={labelCls} htmlFor="batch-name-filter">Run name contains {optional}</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input id="batch-name-filter" value={nameContains} onChange={(e) => setNameContains(e.target.value)} placeholder="e.g. ADVERTISING" className={`${inputCls} pl-9`} />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="batch-schedule">Schedule {optional}</label>
              <select id="batch-schedule" value={scheduleUuid} onChange={(e) => setScheduleUuid(e.target.value)} className={inputCls}>
                <option value="">Any — scheduled or not</option>
                {schedules.map((s) => <option key={s.uuid} value={s.uuid}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} className="h-4 w-4" />
            Only runs with failed tests or aborted
          </label>
        </fieldset>
      )}

      {/* Runs table */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Runs to analyse {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          </span>
          {t && (t.running > 0 || t.passedHidden > 0 || preview?.truncated) && (
            <span className="text-[11px] text-gray-500">
              {[
                t.running > 0 && `${t.running} still running — not included`,
                t.passedHidden > 0 && `${t.passedHidden} passed hidden`,
                preview?.truncated && 'newest 200 shown',
              ].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
        <div className={`overflow-hidden rounded-lg border ${error ? 'border-red-500/60' : 'border-gray-800'}`}>
          {loadError ? (
            <p className="flex items-center gap-1.5 px-4 py-4 text-xs text-red-300"><AlertTriangle className="h-3.5 w-3.5" /> {loadError}</p>
          ) : !preview ? (
            validWindow || preset ? <SkeletonTable /> : <p className="px-4 py-4 text-xs text-gray-500">Enter a time window to see the runs.</p>
          ) : runs.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-gray-500">No runs match. Runs started from the Regression tab (or its schedules) appear here.</p>
          ) : (
            <div className="max-h-80 overflow-auto">
              <table className="w-full min-w-[740px] table-fixed text-left text-xs">
                <colgroup>
                  <col className="w-10" /><col /><col className="w-20" /><col className="w-16" /><col className="w-24" /><col className="w-28" /><col className="w-40" />
                </colgroup>
                <thead className="sticky top-0 z-10 whitespace-nowrap bg-gray-800 text-[11px] uppercase tracking-wider text-gray-400">
                  <tr>
                    <th className="px-3 py-2">
                      <input type="checkbox" aria-label="Select all runs" checked={allOn}
                        ref={(el) => { if (el) el.indeterminate = someOn }}
                        onChange={() => setExcluded(allOn || someOn ? new Set(runs.map((r) => r.runUuid)) : new Set())} className="h-4 w-4" />
                    </th>
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 text-right font-semibold">Failed</th>
                    <th className="px-3 py-2 font-semibold">Started by</th>
                    <th className="px-3 py-2 font-semibold">Started</th>
                    <th className="px-3 py-2 font-semibold">Analysis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/70">
                  {runs.map((r) => {
                    const on = !excluded.has(r.runUuid)
                    return (
                      <tr key={r.runUuid} onClick={() => toggle(r.runUuid)} className={`cursor-pointer transition-colors ${on ? 'hover:bg-gray-800/50' : 'opacity-50 hover:bg-gray-800/30'}`}>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={on} onChange={() => toggle(r.runUuid)} aria-label={`Include ${r.name}`} className="h-4 w-4" />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="line-clamp-2 break-all text-[13px] leading-snug text-gray-100" title={r.name}>{r.name}</span>
                            {r.scheduleUuid && <Hint text="Started by a schedule" className="shrink-0"><CalendarClock className="h-3.5 w-3.5 text-primary-300" /></Hint>}
                          </span>
                          <span className="block truncate font-mono text-[10px] text-gray-500">{r.runUuid}</span>
                        </td>
                        <td className="px-3 py-2.5"><StatusCell run={r} /></td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-200">{r.runInfo ? r.runInfo.FAILED : '—'}</td>
                        <td className="truncate px-3 py-2.5 text-gray-300">{usernameOf(r.triggeredBy)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-gray-400">{when(r.createdAt)}</td>
                        <td className="px-3 py-2.5">
                          <AnalysisCell run={r} included={on} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {preview && runs.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-800 bg-gray-800/30 px-4 py-2.5 text-xs text-gray-400">
              <span><span className="font-semibold tabular-nums text-gray-100">{selected.length}</span> of {runs.length} selected</span>
              <span><span className="tabular-nums text-gray-200">{failedTests}</span> failed test{failedTests === 1 ? '' : 's'}</span>
              {aborted > 0 && <span><span className="tabular-nums text-amber-300">{aborted}</span> aborted</span>}
              {reused > 0 && <span><span className="tabular-nums text-emerald-300">{reused}</span> reused</span>}
              <span className="ml-auto text-gray-500">≈ {selected.length - reused} to fetch from InspectorWeb</span>
            </div>
          )}
        </div>
        {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
      </div>
    </div>
  )
}
