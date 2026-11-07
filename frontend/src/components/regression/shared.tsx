// Author: Kishore Kumar
// Small display pieces shared by the Regression tab: status/outcome badges,
// readable result counts, and copyable UUID chips.
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Hint } from '../ui/Hint'
import type { Outcome, RunInfo, RunPhase, RunProgress } from '../../api/regression'

const PHASE_STYLES: Record<RunPhase, string> = {
  queued:  'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  running: 'bg-primary-500/15 text-primary-300 ring-primary-500/30',
  done:    'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  aborted: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  failed:  'bg-red-500/15 text-red-300 ring-red-500/30',
  unknown: 'bg-gray-700/40 text-gray-400 ring-gray-600/30',
}

export function PhaseBadge({ phase, status }: { phase: RunPhase; status?: string | null }) {
  return (
    <span
      title={status ?? undefined}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${PHASE_STYLES[phase]}`}
    >
      {(phase === 'running' || phase === 'queued') && (
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      )}
      {status || phase}
    </span>
  )
}

export const OUTCOME_META: Record<Outcome, { label: string; cls: string; hint: string }> = {
  not_started: { label: 'Waiting to start', cls: 'bg-gray-700/40 text-gray-300 ring-gray-600/30', hint: 'Queued — no device has picked this test up yet.' },
  running:     { label: 'Running',          cls: 'bg-primary-500/15 text-primary-300 ring-primary-500/30', hint: 'Executing on a device now.' },
  passed:      { label: 'Passed',           cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30', hint: 'All steps passed.' },
  failed:      { label: 'Failed',           cls: 'bg-red-500/15 text-red-300 ring-red-500/30', hint: 'At least one step failed.' },
  skipped:     { label: 'Skipped',          cls: 'bg-amber-500/15 text-amber-300 ring-amber-500/30', hint: 'The test skipped itself (e.g. wrong box type or customer).' },
  aborted:     { label: 'Aborted',          cls: 'bg-amber-500/15 text-amber-300 ring-amber-500/30', hint: 'Stopped before it finished.' },
  no_result:   { label: 'No result recorded', cls: 'bg-orange-500/15 text-orange-300 ring-orange-500/30', hint: 'Finished, but InspectorWeb stored no pass/fail. The report shows the real status.' },
}

export function OutcomeBadge({ outcome, fromReport }: { outcome: Outcome; fromReport?: boolean }) {
  const meta = OUTCOME_META[outcome]
  return (
    <Hint text={fromReport ? `${meta.hint} (status taken from the report)` : meta.hint} className="shrink-0">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${meta.cls}`}>
        {outcome === 'running' && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
        {meta.label}
        {fromReport && <span className="font-normal opacity-70">· report</span>}
      </span>
    </Hint>
  )
}

/**
 * Pass/fail counts with readable wording. InspectorWeb's UNKNOWN means "no result
 * stored": while the run is live that's a test still in progress.
 */
export function Counts({ info, live }: { info: RunInfo | null; live: boolean }) {
  if (!info) return <span className="text-xs text-gray-500">{live ? 'Waiting for the first result…' : 'No results recorded'}</span>
  const items = [
    { label: 'passed', value: info.PASSED, cls: 'text-emerald-400' },
    { label: 'failed', value: info.FAILED, cls: 'text-red-400' },
    { label: 'skipped', value: info.SKIPPED, cls: 'text-amber-400' },
    {
      label: live ? 'in progress' : 'no result recorded',
      value: info.UNKNOWN,
      cls: live ? 'text-primary-300' : 'text-orange-300',
      title: live
        ? 'Started but not finished yet — no pass/fail stored.'
        : 'Finished without a pass/fail in InspectorWeb. Expand the run: the report shows the real status.',
    },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {items.filter((i) => i.value > 0 || i.label === 'passed' || i.label === 'failed').map((i) => (
        <span key={i.label} className={i.cls} title={'title' in i ? i.title : undefined}>
          <span className="font-semibold tabular-nums">{i.value}</span> {i.label}
        </span>
      ))}
      <span className="text-gray-500">· <span className="tabular-nums">{info.total}</span> result{info.total === 1 ? '' : 's'}</span>
    </div>
  )
}

export function ProgressLine({ progress }: { progress: RunProgress }) {
  if (!progress.total) return null
  const pct = Math.round((progress.done / progress.total) * 100)
  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
        <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-400">
        <span className="tabular-nums text-gray-200">{progress.done}</span> of{' '}
        <span className="tabular-nums">{progress.total}</span> test cases finished
        {progress.running > 0 && <> · <span className="text-primary-300">{progress.running} running</span></>}
        {progress.waiting > 0 && <> · {progress.waiting} waiting to start</>}
        {progress.aborted > 0 && <> · <span className="text-amber-300">{progress.aborted} aborted</span></>}
      </p>
    </div>
  )
}

/** Monospace UUID with an always-visible copy button (InspectorWeb shows these too). */
export function UuidChip({ label, uuid }: { label: string; uuid: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(uuid).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded bg-gray-800/70 px-1.5 py-0.5 text-[11px]">
      <span className="text-gray-500">{label}</span>
      <span className="truncate font-mono text-gray-300" title={uuid}>{uuid}</span>
      <Hint text={copied ? 'Copied!' : `Copy ${label}`} className="shrink-0">
        <button onClick={copy} aria-label={`Copy ${label}`} className="text-gray-500 hover:text-gray-200">
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
        </button>
      </Hint>
    </span>
  )
}

/** "Matches 12 devices · 9 idle" preview under a selector editor. */
export function MatchSummary({
  match, loading, error, noun, warnAbove,
}: {
  match: { count: number; idle: number; browserstack: number } | null
  loading: boolean
  error: string | null
  noun: string
  /** Show a warning when more devices than this match (e.g. broad BrowserStack selections). */
  warnAbove?: number
}) {
  if (error) return <p className="text-[11px] text-amber-400">{error}</p>
  if (loading) return <p className="text-[11px] text-gray-500">Checking matching {noun}s…</p>
  if (!match) return null
  if (match.count === 0) return <p className="text-[11px] text-red-400">No {noun}s match these selectors.</p>
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-gray-400">
        Matches <span className="font-semibold tabular-nums text-gray-100">{match.count.toLocaleString()}</span> {noun}{match.count === 1 ? '' : 's'}
        {' · '}<span className="text-emerald-400 tabular-nums">{match.idle}</span> idle
        {match.browserstack > 0 && <> · <span className="tabular-nums">{match.browserstack}</span> on BrowserStack</>}
      </p>
      {warnAbove !== undefined && match.count > warnAbove && (
        <p className="text-[11px] text-amber-300">
          Broad selection — a parallel run can lock many of these. BrowserStack has a shared session limit; narrow it with platform, deviceType or a name pattern.
        </p>
      )}
    </div>
  )
}
