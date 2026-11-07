// Author: Kishore Kumar
// Expanded view of one regression run: every test case with its device, result,
// report links, and (from the report) tags + the failed step. Filters are built
// from whatever values the run actually contains.
import { useMemo, useState } from 'react'
import { AlertTriangle, Download, ExternalLink, FileText, Loader2, Radio, ScrollText, Search, Tag, TerminalSquare, Users } from 'lucide-react'
import type { Outcome, RunStatus, RunTarget, RunTestCase, TargetDetails } from '../../api/regression'
import { useTargetDetails, DetailState } from '../../hooks/useTargetDetails'
import { OUTCOME_META, OutcomeBadge, UuidChip } from './shared'
import { LogViewer } from './LogViewer'

const NEEDS_REPORT: Outcome[] = ['failed', 'no_result', 'aborted']
// Severity used to pick one result for a test case that ran on several devices.
const SEVERITY: Outcome[] = ['failed', 'aborted', 'no_result', 'running', 'not_started', 'skipped', 'passed']

/** Map the report's own status onto our outcome; falls back to the counts-based one. */
function reportOutcome(d: TargetDetails | undefined): Outcome | null {
  const s = d?.status?.toLowerCase()
  if (!s) return null
  if (s === 'failed' || s === 'error') return 'failed'
  if (s === 'passed') return 'passed'
  if (s === 'skipped' || s === 'pending') return 'skipped'
  return null
}

interface Row {
  tc: RunTestCase
  outcome: Outcome
  fromReport: boolean
  details: TargetDetails[]
  devices: string[]
  tags: string[]
  teams: string[]
}

function loadedDetails(target: RunTarget, details: Record<string, DetailState>): TargetDetails | undefined {
  const d = details[target.targetUuid]
  return d?.state === 'loaded' ? d.data : undefined
}

function buildRow(tc: RunTestCase, details: Record<string, DetailState>): Row {
  const perTarget = tc.targets.map((t) => {
    const d = loadedDetails(t, details)
    const fromReport = reportOutcome(d)
    return { outcome: fromReport ?? t.outcome, fromReport: fromReport !== null && fromReport !== t.outcome, d }
  })
  let outcome = tc.outcome
  let fromReport = false
  if (perTarget.length > 0 && tc.outcome !== 'not_started' && tc.outcome !== 'running') {
    const worst = [...perTarget].sort((a, b) => SEVERITY.indexOf(a.outcome) - SEVERITY.indexOf(b.outcome))[0]
    outcome = worst.outcome
    fromReport = worst.fromReport
  }
  const ds = perTarget.map((p) => p.d).filter((d): d is TargetDetails => !!d)
  return {
    tc,
    outcome,
    fromReport,
    details: ds,
    devices: [...new Set(tc.targets.map((t) => t.name).filter(Boolean))],
    tags: [...new Set(ds.flatMap((d) => d.tags ?? []))],
    teams: [...new Set(ds.map((d) => d.featureTeam).filter((x): x is string => !!x))],
  }
}

/** One choice per filter group: picking a chip selects only it; picking it again clears the group. */
function toggle<T>(set: Set<T>, value: T): Set<T> {
  return set.has(value) ? new Set() : new Set([value])
}

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 transition-colors ${
        active
          ? 'bg-primary-500/20 text-primary-200 ring-primary-500/50'
          : 'bg-gray-800/60 text-gray-400 ring-gray-700 hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-14 shrink-0 text-[11px] uppercase tracking-wider text-gray-500">{label}</span>
      {children}
    </div>
  )
}

function countBy<T extends string>(rows: Row[], pick: (r: Row) => T[]): [T, number][] {
  const m = new Map<T, number>()
  rows.forEach((r) => pick(r).forEach((v) => m.set(v, (m.get(v) ?? 0) + 1)))
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

export function RunTestCases({ runUuid, status }: { runUuid: string; status: RunStatus }) {
  const testCases = status.testCases ?? []
  const autoLoad = useMemo(
    () => testCases.flatMap((tc) => tc.targets)
      .filter((t) => t.reportUrl && NEEDS_REPORT.includes(t.outcome))
      .map((t) => t.targetUuid),
    [testCases],
  )
  const { details, load } = useTargetDetails(runUuid, autoLoad)
  const rows = useMemo(() => testCases.map((tc) => buildRow(tc, details)), [testCases, details])

  const [q, setQ] = useState('')
  const [results, setResults] = useState<Set<Outcome>>(new Set())
  const [devices, setDevices] = useState<Set<string>>(new Set())
  const [tags, setTags] = useState<Set<string>>(new Set())
  const [teams, setTeams] = useState<Set<string>>(new Set())

  const outcomeOpts = useMemo(
    () => countBy(rows, (r) => [r.outcome]).sort((a, b) => SEVERITY.indexOf(a[0]) - SEVERITY.indexOf(b[0])),
    [rows],
  )
  const deviceOpts = useMemo(() => countBy(rows, (r) => r.devices), [rows])
  const tagOpts = useMemo(() => countBy(rows, (r) => r.tags), [rows])
  const teamOpts = useMemo(() => countBy(rows, (r) => r.teams), [rows])

  const filtered = rows.filter((r) => {
    if (results.size && !results.has(r.outcome)) return false
    if (devices.size && !r.devices.some((d) => devices.has(d))) return false
    if (tags.size && !r.tags.some((t) => tags.has(t))) return false
    if (teams.size && !r.teams.some((t) => teams.has(t))) return false
    if (q) {
      const needle = q.toLowerCase()
      const hay = [r.tc.name, r.tc.testCaseUuid, ...r.tc.targets.map((t) => t.targetUuid), ...r.details.map((d) => d.ticketNumber ?? '')]
      if (!hay.some((h) => h?.toLowerCase().includes(needle))) return false
    }
    return true
  })
  const [logFor, setLogFor] = useState<{ targetUuid: string; testCaseName: string } | null>(null)
  // Re-read the target from the latest poll so the viewer knows when the test stops running.
  const logTarget = logFor ? testCases.flatMap((tc) => tc.targets).find((t) => t.targetUuid === logFor.targetUuid) : undefined

  const anyFilter = results.size + devices.size + tags.size + teams.size > 0 || q.length > 0
  const pendingReports = Object.values(details).filter((d) => d.state === 'loading').length

  if (testCases.length === 0) {
    return (
      <p className="text-xs text-gray-500">
        {status.source === 'snapshot'
          ? 'Test-case details are no longer available in InspectorWeb.'
          : status.isTerminal
            ? `No test cases ran${status.error ? ' — see the error above.' : '.'}`
            : 'Waiting for InspectorWeb to start the test cases…'}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filters — options come from this run's data */}
      <div className="space-y-2 rounded-lg bg-gray-800/30 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search test case, ticket or UUID…"
            aria-label="Search test cases"
            className="h-8 w-full rounded-md border border-gray-700 bg-gray-900 pl-8 pr-2 text-xs text-gray-100 placeholder-gray-500 focus:border-primary-500 focus:outline-none"
          />
        </div>
        <FilterGroup label="Result">
          {outcomeOpts.map(([o, n]) => (
            <Chip key={o} active={results.has(o)} onClick={() => setResults((s) => toggle(s, o))} title={OUTCOME_META[o].hint}>
              {OUTCOME_META[o].label} <span className="tabular-nums opacity-70">{n}</span>
            </Chip>
          ))}
        </FilterGroup>
        {deviceOpts.length > 1 && (
          <FilterGroup label="Device">
            {deviceOpts.map(([d, n]) => (
              <Chip key={d} active={devices.has(d)} onClick={() => setDevices((s) => toggle(s, d))}>
                {d} <span className="tabular-nums opacity-70">{n}</span>
              </Chip>
            ))}
          </FilterGroup>
        )}
        {tagOpts.length > 0 && (
          <FilterGroup label="Tag">
            {tagOpts.map(([t, n]) => (
              <Chip key={t} active={tags.has(t)} onClick={() => setTags((s) => toggle(s, t))}>
                <Tag className="h-2.5 w-2.5" />{t} <span className="tabular-nums opacity-70">{n}</span>
              </Chip>
            ))}
          </FilterGroup>
        )}
        {teamOpts.length > 0 && (
          <FilterGroup label="Team">
            {teamOpts.map(([t, n]) => (
              <Chip key={t} active={teams.has(t)} onClick={() => setTeams((s) => toggle(s, t))}>
                <Users className="h-2.5 w-2.5" />{t} <span className="tabular-nums opacity-70">{n}</span>
              </Chip>
            ))}
          </FilterGroup>
        )}
        <div className="flex items-center justify-between text-[11px] text-gray-500">
          <span>
            Showing <span className="tabular-nums text-gray-300">{filtered.length}</span> of {rows.length} test cases
            {pendingReports > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-primary-300">
                <Loader2 className="h-3 w-3 animate-spin" /> reading {pendingReports} report{pendingReports === 1 ? '' : 's'} for tags and failures…
              </span>
            )}
          </span>
          {anyFilter && (
            <button
              onClick={() => { setQ(''); setResults(new Set()); setDevices(new Set()); setTags(new Set()); setTeams(new Set()) }}
              className="text-primary-400 hover:text-primary-300"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Test cases */}
      <ul className="space-y-2">
        {filtered.map((r) => (
          <TestCaseRow
            key={r.tc.testCaseUuid ?? r.tc.targets[0]?.targetUuid ?? r.tc.name}
            row={r}
            details={details}
            onLoad={load}
            onLog={(t) => setLogFor({ targetUuid: t.targetUuid, testCaseName: r.tc.name })}
          />
        ))}
      </ul>

      {logFor && (
        <LogViewer
          runUuid={runUuid}
          targetUuid={logFor.targetUuid}
          testCaseName={logFor.testCaseName}
          deviceName={logTarget?.name ?? ''}
          live={!!logTarget && (logTarget.phase === 'running' || logTarget.phase === 'queued')}
          inspectorwebLogUrl={logTarget?.logUrl}
          onClose={() => setLogFor(null)}
        />
      )}
    </div>
  )
}

function LinkPill({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300 hover:bg-gray-800"
    >
      {icon}{children}
    </a>
  )
}

interface TestCaseRowProps {
  row: Row
  details: Record<string, DetailState>
  onLoad: (uuid: string, force?: boolean) => void
  onLog: (target: RunTarget) => void
}

function TestCaseRow({ row, details, onLoad, onLog }: TestCaseRowProps) {
  const { tc } = row
  const ticket = row.details.find((d) => d.ticketNumber)
  return (
    <li className="rounded-lg bg-gray-800/40 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-xs font-medium text-gray-100">{tc.name}</p>
          {ticket?.jiraLink && (
            <a href={ticket.jiraLink} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-400 hover:text-sky-300">
              {ticket.ticketNumber}
            </a>
          )}
        </div>
        <OutcomeBadge outcome={row.outcome} fromReport={row.fromReport} />
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {tc.testCaseUuid && <UuidChip label="Test case" uuid={tc.testCaseUuid} />}
      </div>

      {tc.targets.length === 0 && tc.outcome === 'not_started' && (
        <p className="mt-1.5 text-[11px] text-gray-500">Not assigned to a device yet.</p>
      )}

      {tc.targets.map((t) => {
        const d = details[t.targetUuid]
        const data = d?.state === 'loaded' ? d.data : undefined
        return (
          <div key={t.targetUuid} className="mt-2 border-t border-gray-700/50 pt-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400">
              <span>on <span className="text-gray-200">{t.name}</span></span>
              <span className="text-gray-600">·</span>
              <span>{t.status}</span>
              <UuidChip label="Target ID" uuid={t.targetUuid} />
              {t.phase === 'running' || t.phase === 'queued' ? (
                <button
                  onClick={() => onLog(t)}
                  className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25"
                >
                  <Radio className="h-3 w-3 animate-pulse" /> Live log
                </button>
              ) : (
                <button
                  onClick={() => onLog(t)}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300 hover:bg-gray-800"
                >
                  <TerminalSquare className="h-3 w-3" /> View log
                </button>
              )}
            </div>

            {t.reportUrl && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <LinkPill href={data?.reportUrl ?? t.reportUrl} icon={<FileText className="h-3 w-3" />}>Report</LinkPill>
                {t.logUrl && <LinkPill href={data?.logUrl ?? t.logUrl} icon={<ScrollText className="h-3 w-3" />}>Log</LinkPill>}
                {t.downloadUrl && <LinkPill href={data?.downloadUrl ?? t.downloadUrl} icon={<Download className="h-3 w-3" />}>Download</LinkPill>}
                {!d && (
                  <button onClick={() => onLoad(t.targetUuid)} className="text-[11px] text-primary-400 hover:text-primary-300">
                    Show tags & steps
                  </button>
                )}
              </div>
            )}

            {d?.state === 'loading' && (
              <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-gray-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Reading report…
              </p>
            )}
            {d?.state === 'missing' && <p className="mt-1.5 text-[11px] text-gray-500">No report was generated for this device run.</p>}
            {d?.state === 'error' && (
              <p className="mt-1.5 text-[11px] text-amber-400">
                {d.message}{' '}
                <button onClick={() => onLoad(t.targetUuid, true)} className="text-primary-400 hover:text-primary-300">Retry</button>
              </p>
            )}
            {data && <ReportSummary data={data} />}
            {t.error && <p className="mt-1.5 text-[11px] text-red-400 break-words">{t.error}</p>}
          </div>
        )
      })}
    </li>
  )
}

function ReportSummary({ data: raw }: { data: TargetDetails }) {
  // Tolerate partial replies so one odd report can't break the whole runs panel.
  const data = { ...raw, reasons: raw.reasons ?? [], failedSteps: raw.failedSteps ?? [], tags: raw.tags ?? [], stats: raw.stats ?? {} }
  const failures = data.reasons.length > 0
    ? data.reasons.map((r) => ({ step: r.step, message: r.reason, sub: r.subStatus }))
    : data.failedSteps.map((f) => ({ step: f.title, message: f.error, sub: null }))
  const failed = data.status === 'failed' || data.status === 'error'
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {data.tags.map((t) => (
          <span
            key={t}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${failed ? 'bg-red-500/15 text-red-300' : 'bg-gray-800 text-gray-400'}`}
          >
            <Tag className="h-2.5 w-2.5" />{t}
          </span>
        ))}
        {data.featureTeam && <span className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-400">{data.featureTeam}</span>}
        {data.priority && <span className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-400">{data.priority}</span>}
        {data.subStatus && failed && <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-300">{data.subStatus}</span>}
        {data.durationSecs != null && <span className="text-gray-500">{data.durationSecs}s</span>}
      </div>
      {failed && failures.map((f, i) => (
        <div key={i} className="flex items-start gap-1.5 rounded bg-red-500/5 px-2 py-1.5 text-[11px]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
          <div className="min-w-0">
            {f.step && <p className="text-gray-300">Failed at <span className="text-gray-100">{f.step}</span></p>}
            {f.message && <p className="break-words text-red-300">{f.message}</p>}
          </div>
        </div>
      ))}
      {data.stats.tests != null && (
        <p className="text-[11px] text-gray-500">
          Steps: {data.stats.passes ?? 0} passed · {data.stats.failures ?? 0} failed · {data.stats.pending ?? 0} not run
          {data.jiraLink && !data.ticketNumber && (
            <> · <a href={data.jiraLink} target="_blank" rel="noopener noreferrer" className="text-sky-400"><ExternalLink className="inline h-3 w-3" /> Jira</a></>
          )}
        </p>
      )}
    </div>
  )
}
