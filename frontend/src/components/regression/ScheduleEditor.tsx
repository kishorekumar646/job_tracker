// Author: Kishore Kumar
// Create / edit a schedule run by this app's scheduler (same model as InspectorWeb's schedule editor):
// run configs + mode, type (cron / continuous / once), optional "when" and "until" conditions, labels.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronLeft, Plus, Save, Search, Trash2, X as XIcon } from 'lucide-react'
import cronstrue from 'cronstrue'
import { Button } from '../ui/Button'
import { nameError } from './RunConfigWizard'
import {
  Conditions,
  createSchedule,
  listRunConfigs,
  regressionErrorMessage,
  RunConfigSummary,
  Schedule,
  ScheduleBody,
  ScheduleType,
  TimeWindow,
  UntilItem,
  updateSchedule,
  WeekDay,
  WhenItem,
} from '../../api/regression'

const WEEKDAYS: WeekDay[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const CRON_RE = /^\S+(\s+\S+){4}$/
const CRON_PRESETS: { label: string; cron: string }[] = [
  { label: 'Every day 02:00', cron: '0 2 * * *' },
  { label: '3× a day (02:30, 10:30, 18:30)', cron: '30 2,10,18 * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Weekdays 08:00', cron: '0 8 * * 1-5' },
]
const TYPES: { key: ScheduleType; label: string; hint: string }[] = [
  { key: 'continuous', label: 'Continuous', hint: 'Starts the run configs again a minute after the previous runs finish.' },
  { key: 'cron', label: 'Cron', hint: 'Starts at the times a cron expression gives.' },
  { key: 'once', label: 'Once', hint: 'Runs a single time, as soon as it is saved enabled.' },
]
const WHEN_TYPES: { key: WhenItem['type']; label: string }[] = [
  { key: 'days', label: 'On days' },
  { key: 'between', label: 'Between times' },
  { key: 'betweenCertainDays', label: 'Between times on days' },
  { key: 'executionsPerDay', label: 'Max. executions a day' },
]
const UNTIL_TYPES: { key: UntilItem['type']; label: string }[] = [
  { key: 'timestamp', label: 'Date & time' },
  { key: 'executions', label: 'Number of executions' },
  { key: 'status', label: 'Run status' },
]

const inputCls = 'h-9 w-full rounded-lg border bg-gray-800 px-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none'
const okBorder = 'border-gray-700 focus:border-primary-500'
const errBorder = 'border-red-500 focus:border-red-400'

/** "HH:MM" ↔ the ISO timestamp InspectorWeb stores for a time window (today's date, local time). */
function timeToIso(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setHours(h || 0, m || 0, 0, 0)
  return d.toISOString()
}
function isoToTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '09:00' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const defaultWindow = (): TimeWindow => ({ after: timeToIso('09:00'), before: timeToIso('17:00') })

function newWhen(type: WhenItem['type']): WhenItem {
  if (type === 'days') return { type, value: ['Saturday', 'Sunday'] }
  if (type === 'between') return { type, value: defaultWindow() }
  if (type === 'betweenCertainDays') return { type, value: { between: defaultWindow(), days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] } }
  return { type, value: { executions: 1 } }
}
function newUntil(type: UntilItem['type']): UntilItem {
  if (type === 'timestamp') { const d = new Date(Date.now() + 7 * 86400000); d.setSeconds(0, 0); return { type, value: d.toISOString() } }
  if (type === 'executions') return { type, value: 1 }
  return { type, value: 'done' }
}

/** datetime-local value ↔ ISO */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function DayPicker({ value, onChange }: { value: WeekDay[]; onChange: (d: WeekDay[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {WEEKDAYS.map((d) => {
        const on = value.includes(d)
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== d) : WEEKDAYS.filter((x) => x === d || value.includes(x)))}
            className={`rounded-full px-2.5 py-0.5 text-[11px] ring-1 ${on ? 'bg-primary-500/20 text-primary-100 ring-primary-500/50' : 'text-gray-400 ring-gray-700 hover:text-gray-200'}`}
          >
            {d.slice(0, 3)}
          </button>
        )
      })}
    </div>
  )
}

function WindowPicker({ value, onChange }: { value: TimeWindow; onChange: (w: TimeWindow) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      after
      <input type="time" value={isoToTime(value.after)} onChange={(e) => onChange({ ...value, after: timeToIso(e.target.value) })} className="h-8 rounded-md border border-gray-700 bg-gray-800 px-2 text-gray-100" />
      and before
      <input type="time" value={isoToTime(value.before)} onChange={(e) => onChange({ ...value, before: timeToIso(e.target.value) })} className="h-8 rounded-md border border-gray-700 bg-gray-800 px-2 text-gray-100" />
    </div>
  )
}

function LogicToggle({ value, onChange }: { value: 'or' | 'and'; onChange: (v: 'or' | 'and') => void }) {
  return (
    <div className="flex gap-1 rounded-md bg-gray-800 p-0.5 text-[11px]">
      {(['or', 'and'] as const).map((l) => (
        <button key={l} type="button" onClick={() => onChange(l)} className={`rounded px-2 py-0.5 font-semibold uppercase ${value === l ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
          {l === 'or' ? 'any' : 'all'}
        </button>
      ))}
    </div>
  )
}

/** "Every 2 hours", "At 02:30, 10:30 and 18:30" … — undefined while the cron isn't valid. */
function describeCron(expr: string): string | undefined {
  const e = expr.trim()
  if (!CRON_RE.test(e)) return undefined
  try {
    let text = cronstrue.toString(e, { use24HourTimeFormat: true })
    text = text.replace(/^On the hour, every/, 'Every')
    const [, , dom, month, dow] = e.split(/\s+/)
    if (dom === '*' && month === '*' && dow === '*' && text.startsWith('At ')) text += ', every day'
    return text
  } catch {
    return undefined
  }
}

interface Props {
  /** Schedule to edit; omit to create. */
  initial?: Schedule
  inspectorUsername: string
  /** Zone the scheduler reads cron times and time windows in (e.g. Europe/Brussels). */
  timezone?: string
  onSaved: (name: string, created: boolean) => void
  onCancel: () => void
  onError?: (msg: string) => void
}

export function ScheduleEditor({ initial, inspectorUsername, timezone, onSaved, onCancel, onError }: Props) {
  const editing = !!initial
  const [name, setName] = useState(initial?.name ?? '')
  const [runConfigs, setRunConfigs] = useState<{ uuid: string; name: string | null }[]>(initial?.runConfigs ?? [])
  const [mode, setMode] = useState<'parallel' | 'sequential'>(initial?.mode ?? 'parallel')
  const [type, setType] = useState<ScheduleType>(initial?.type ?? 'cron')
  const [cron, setCron] = useState(initial?.type === 'cron' ? initial.data : '')
  const [when, setWhen] = useState<Conditions<WhenItem>>(initial?.when ?? { type: 'or', value: [] })
  const [until, setUntil] = useState<Conditions<UntilItem>>(initial?.until ?? { type: 'or', value: [] })
  const [labels, setLabels] = useState((initial?.labels ?? []).join(', '))
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)
  const [tried, setTried] = useState(false)
  const [nameTouched, setNameTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Run-config picker (the user's own configs).
  const [rcQuery, setRcQuery] = useState('')
  const [rcOptions, setRcOptions] = useState<RunConfigSummary[]>([])
  const [rcLoading, setRcLoading] = useState(true)
  const [rcOpen, setRcOpen] = useState(false)
  const rcBoxRef = useRef<HTMLDivElement>(null)
  // Close the run-config dropdown when clicking outside it.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rcBoxRef.current && !rcBoxRef.current.contains(e.target as Node)) setRcOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  useEffect(() => {
    let cancelled = false
    setRcLoading(true)
    const t = setTimeout(() => {
      listRunConfigs({ name: rcQuery }, 1, 15)
        .then((r) => { if (!cancelled) setRcOptions(r.data) })
        .catch(() => { if (!cancelled) setRcOptions([]) })
        .finally(() => { if (!cancelled) setRcLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [rcQuery])

  const errors = useMemo(() => {
    const e: Record<string, string> = {}
    const nameErr = nameError(name)
    if (nameErr) e.name = nameErr
    if (!runConfigs.length) e.runConfigs = 'Pick at least one run config.'
    if (type === 'cron' && !CRON_RE.test(cron.trim())) e.cron = 'Enter a cron expression with 5 fields, e.g. 30 2,10,18 * * *.'
    when.value.forEach((w, i) => {
      if ((w.type === 'days' && !w.value.length) || (w.type === 'betweenCertainDays' && !w.value.days.length)) e[`when-${i}`] = 'Pick at least one day.'
      if (w.type === 'executionsPerDay' && !(w.value.executions >= 1)) e[`when-${i}`] = 'Must be at least 1.'
    })
    until.value.forEach((u, i) => {
      if (u.type === 'executions' && !(Number(u.value) >= 1)) e[`until-${i}`] = 'Must be at least 1.'
      if (u.type === 'timestamp' && new Date(u.value).getTime() < Date.now()) e[`until-${i}`] = 'Pick a time in the future.'
    })
    return e
  }, [name, runConfigs, type, cron, when, until])
  const fe = (k: string) => (tried || (k === 'name' && nameTouched) ? errors[k] : undefined)

  async function save() {
    setTried(true)
    if (Object.keys(errors).length) return
    setSaving(true)
    setSaveError(null)
    const body: ScheduleBody = {
      name: name.trim(),
      runConfigUuids: runConfigs.map((r) => r.uuid),
      mode,
      type,
      cron: type === 'cron' ? cron.trim() : null,
      when: type !== 'once' && when.value.length ? when : null,
      until: type !== 'once' && until.value.length ? until : null,
      labels: labels.split(',').map((l) => l.trim()).filter(Boolean),
      enabled,
    }
    try {
      if (initial) await updateSchedule(initial.uuid, body)
      else await createSchedule(body)
      onSaved(body.name, !initial)
    } catch (err) {
      const msg = regressionErrorMessage(err, 'Could not save the schedule.')
      setSaveError(msg)
      onError?.(msg)
    } finally {
      setSaving(false)
    }
  }

  const setWhenItem = (i: number, item: WhenItem) => setWhen((w) => ({ ...w, value: w.value.map((x, j) => (j === i ? item : x)) }))
  const setUntilItem = (i: number, item: UntilItem) => setUntil((u) => ({ ...u, value: u.value.map((x, j) => (j === i ? item : x)) }))
  const usedUntil = new Set(until.value.map((u) => u.type))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-100">{editing ? 'Edit schedule' : 'New schedule'}</h2>
          <p className="text-[11px] text-gray-500">Run by this app · starts runs as <span className="font-mono text-gray-300">{inspectorUsername}</span></p>
        </div>
        <button onClick={onCancel} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to schedules
        </button>
      </div>

      {tried && Object.keys(errors).length > 0 && (
        <div className="shrink-0 space-y-0.5 bg-red-500/90 px-4 py-2 text-sm font-medium text-white">
          {[...new Set(Object.values(errors))].map((m) => <p key={m} className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{m}</p>)}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {/* Name + enabled */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400" htmlFor="sch-name">Name *</label>
          <input id="sch-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setNameTouched(true)} placeholder="e.g. FT_ADVERTISING_R5.15.01_ARRIS_LABE2ESI_BE_NIGHTLY" className={`${inputCls} ${fe('name') ? errBorder : okBorder}`} />
          {fe('name') && <p className="mt-1 text-xs text-red-400">{fe('name')}</p>}
          <div className="mt-1 space-y-0.5 text-[11px] text-gray-500">
            <p>Naming pattern: <span className="font-mono text-gray-400">TEAM_RELEASE_BOX_LAB_COUNTRY_WHEN</span></p>
            <p>e.g. <span className="font-mono text-gray-400">FT_ADVERTISING_R5.15.01_ARRIS_LABE2ESI_BE_NIGHTLY</span></p>
            <p>Must be one of: letters, digits, <span className="font-mono text-gray-400">- _ . [ ]</span> — no spaces.</p>
          </div>
        </div>

        {/* Run configs */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Run configs *</h3>
          <div className={`flex min-h-[38px] flex-wrap gap-1.5 rounded-lg border p-2 ${fe('runConfigs') ? 'border-red-500/60' : 'border-gray-800'}`}>
            {runConfigs.length === 0 && <span className="text-xs text-gray-500">None selected</span>}
            {runConfigs.map((r) => (
              <span key={r.uuid} className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-500/20 py-0.5 pl-2.5 pr-1 text-xs text-primary-100">
                <span className="truncate" title={r.uuid}>{r.name ?? r.uuid}</span>
                <button type="button" onClick={() => setRunConfigs((rs) => rs.filter((x) => x.uuid !== r.uuid))} aria-label={`Remove ${r.name ?? r.uuid}`} className="rounded-full p-0.5 hover:bg-primary-500/30">
                  <XIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          {fe('runConfigs') && <p className="text-xs text-red-400">{fe('runConfigs')}</p>}
          <div ref={rcBoxRef} className="relative">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
              <input
                value={rcQuery}
                onChange={(e) => { setRcQuery(e.target.value); setRcOpen(true) }}
                onFocus={() => setRcOpen(true)}
                onKeyDown={(e) => { if (e.key === 'Escape') setRcOpen(false) }}
                placeholder="Search your run configs"
                aria-label="Search run configs"
                role="combobox"
                aria-expanded={rcOpen}
                aria-controls="sch-rc-list"
                autoComplete="off"
                className={`${inputCls} ${okBorder} pl-9 pr-9 text-xs`}
              />
              <button type="button" onClick={() => setRcOpen((o) => !o)} aria-label="Show run configs" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200">
                <ChevronDown className={`h-4 w-4 transition-transform ${rcOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
            {rcOpen && (
              <ul id="sch-rc-list" role="listbox" className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl">
                {rcLoading && rcOptions.length === 0 && <li className="px-3 py-2 text-xs text-gray-500">Loading your run configs…</li>}
                {!rcLoading && rcOptions.length === 0 && <li className="px-3 py-2 text-xs text-gray-500">No run configs match.</li>}
                {rcOptions.map((rc) => {
                  const picked = runConfigs.some((r) => r.uuid === rc.uuid)
                  return (
                    <li key={rc.uuid} role="option" aria-selected={picked}>
                      <button
                        type="button"
                        onClick={() => setRunConfigs((rs) => picked ? rs.filter((r) => r.uuid !== rc.uuid) : [...rs, { uuid: rc.uuid, name: rc.name }])}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-gray-800"
                        title={picked ? 'Click to remove' : 'Click to add'}
                      >
                        {picked ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <Plus className="h-3.5 w-3.5 shrink-0 text-gray-500" />}
                        <span className={`truncate ${picked ? 'text-primary-200' : ''}`}>{rc.name}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            Run them
            <div className="flex gap-1 rounded-lg bg-gray-800 p-0.5">
              {(['parallel', 'sequential'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-md px-2.5 py-0.5 text-[11px] font-medium ${mode === m ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                  {m === 'parallel' ? 'In parallel' : 'One after another'}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Type */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">How often</h3>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setType(t.key)}
                className={`rounded-lg border p-2.5 text-left ${type === t.key ? 'border-primary-500 bg-primary-500/10' : 'border-gray-700 hover:bg-gray-800/40'}`}
              >
                <span className={`block text-sm font-semibold ${type === t.key ? 'text-gray-50' : 'text-gray-200'}`}>{t.label}</span>
                <span className="block text-[11px] leading-snug text-gray-500">{t.hint}</span>
              </button>
            ))}
          </div>
          {type === 'cron' && (
            <div className="space-y-2">
              <input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="minute hour day month weekday — e.g. 30 2,10,18 * * *" aria-label="Cron expression" className={`${inputCls} font-mono ${fe('cron') ? errBorder : okBorder}`} />
              {fe('cron') && <p className="text-xs text-red-400">{fe('cron')}</p>}
              {describeCron(cron) && (
                <p className="text-xs text-gray-300">
                  {describeCron(cron)}
                  {timezone && <span className="text-gray-500"> ({timezone.split('/').pop()?.replace('_', ' ')} time)</span>}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {CRON_PRESETS.map((p) => (
                  <button key={p.cron} type="button" onClick={() => setCron(p.cron)} className={`rounded-full px-2.5 py-0.5 text-[11px] ring-1 ${cron.trim() === p.cron ? 'bg-primary-500/20 text-primary-100 ring-primary-500/50' : 'text-gray-400 ring-gray-700 hover:text-gray-200'}`} title={p.cron}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {type !== 'once' && (
          <>
            {/* When */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Only when <span className="font-normal normal-case text-gray-600">(optional)</span></h3>
                {when.value.length > 1 && <LogicToggle value={when.type} onChange={(t) => setWhen((w) => ({ ...w, type: t }))} />}
              </div>
              {when.value.some((w) => w.type === 'between' || w.type === 'betweenCertainDays') && (
                <p className="text-[11px] text-gray-500">Time windows are in your local time.</p>
              )}
              {when.value.map((w, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-gray-800 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-300">{WHEN_TYPES.find((t) => t.key === w.type)?.label}</span>
                    <button type="button" onClick={() => setWhen((c) => ({ ...c, value: c.value.filter((_, j) => j !== i) }))} aria-label="Remove condition" className="text-gray-500 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  {w.type === 'days' && <DayPicker value={w.value} onChange={(d) => setWhenItem(i, { type: 'days', value: d })} />}
                  {w.type === 'between' && <WindowPicker value={w.value} onChange={(v) => setWhenItem(i, { type: 'between', value: v })} />}
                  {w.type === 'betweenCertainDays' && (
                    <>
                      <WindowPicker value={w.value.between} onChange={(v) => setWhenItem(i, { type: 'betweenCertainDays', value: { ...w.value, between: v } })} />
                      <DayPicker value={w.value.days} onChange={(d) => setWhenItem(i, { type: 'betweenCertainDays', value: { ...w.value, days: d } })} />
                    </>
                  )}
                  {w.type === 'executionsPerDay' && (
                    <input type="number" min={1} value={w.value.executions} onChange={(e) => setWhenItem(i, { type: 'executionsPerDay', value: { executions: Number(e.target.value) } })} aria-label="Max executions a day" className="h-8 w-28 rounded-md border border-gray-700 bg-gray-800 px-2 text-sm text-gray-100" />
                  )}
                  {fe(`when-${i}`) && <p className="text-xs text-red-400">{fe(`when-${i}`)}</p>}
                </div>
              ))}
              <div className="flex flex-wrap gap-1.5">
                {WHEN_TYPES.map((t) => (
                  <button key={t.key} type="button" onClick={() => setWhen((w) => ({ ...w, value: [...w.value, newWhen(t.key)] }))} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] text-primary-300 ring-1 ring-gray-700 hover:bg-gray-800">
                    <Plus className="h-3 w-3" />{t.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Until */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Stop when <span className="font-normal normal-case text-gray-600">(optional)</span></h3>
                {until.value.length > 1 && <LogicToggle value={until.type} onChange={(t) => setUntil((u) => ({ ...u, type: t }))} />}
              </div>
              {until.value.map((u, i) => (
                <div key={u.type} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-800 p-3">
                  <span className="w-40 text-xs font-medium text-gray-300">{UNTIL_TYPES.find((t) => t.key === u.type)?.label}</span>
                  {u.type === 'timestamp' && (
                    <input type="datetime-local" value={isoToLocalInput(u.value)} onChange={(e) => setUntilItem(i, { type: 'timestamp', value: new Date(e.target.value).toISOString() })} aria-label="Stop at" className="h-8 rounded-md border border-gray-700 bg-gray-800 px-2 text-sm text-gray-100" />
                  )}
                  {u.type === 'executions' && (
                    <input type="number" min={1} value={u.value} onChange={(e) => setUntilItem(i, { type: 'executions', value: Number(e.target.value) })} aria-label="Stop after executions" className="h-8 w-28 rounded-md border border-gray-700 bg-gray-800 px-2 text-sm text-gray-100" />
                  )}
                  {u.type === 'status' && (
                    <select value={u.value} onChange={(e) => setUntilItem(i, { type: 'status', value: e.target.value as 'done' | 'aborted' })} aria-label="Stop on status" className="h-8 rounded-md border border-gray-700 bg-gray-800 px-2 text-sm text-gray-100">
                      <option value="done">done</option>
                      <option value="aborted">aborted</option>
                    </select>
                  )}
                  <button type="button" onClick={() => setUntil((c) => ({ ...c, value: c.value.filter((_, j) => j !== i) }))} aria-label="Remove condition" className="ml-auto text-gray-500 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                  {fe(`until-${i}`) && <p className="w-full text-xs text-red-400">{fe(`until-${i}`)}</p>}
                </div>
              ))}
              <div className="flex flex-wrap gap-1.5">
                {UNTIL_TYPES.filter((t) => !usedUntil.has(t.key)).map((t) => (
                  <button key={t.key} type="button" onClick={() => setUntil((u) => ({ ...u, value: [...u.value, newUntil(t.key)] }))} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] text-primary-300 ring-1 ring-gray-700 hover:bg-gray-800">
                    <Plus className="h-3 w-3" />{t.label}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {/* Labels + enabled */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400" htmlFor="sch-labels">Labels (comma-separated)</label>
          <input id="sch-labels" value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="Nightly, CPE" className={`${inputCls} ${okBorder}`} />
        </div>
        <button type="button" role="switch" aria-checked={enabled} onClick={() => setEnabled(!enabled)} className="flex w-full items-center justify-between gap-4 rounded-md px-1 py-1 text-left hover:bg-gray-800/40">
          <span>
            <span className="block text-sm text-gray-200">Enabled</span>
            <span className="block text-xs text-gray-500">{enabled ? 'The schedule starts runs as configured.' : 'Saved but paused — it starts nothing until enabled.'}</span>
          </span>
          <span aria-hidden className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-primary-500' : 'bg-gray-700'}`}>
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
          </span>
        </button>
        {saveError && <p className="break-words rounded-lg bg-red-500/10 p-3 text-xs text-red-300">{saveError}</p>}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-800 px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" icon={<Save className="h-3.5 w-3.5" />} onClick={save} loading={saving}>{editing ? 'Save changes' : 'Create schedule'}</Button>
      </div>
    </div>
  )
}
