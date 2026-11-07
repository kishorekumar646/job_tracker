// Author: Kishore Kumar
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  Loader,
  Square,
  AlertTriangle,
  RefreshCw,
  BarChart2,
  ExternalLink,
  FileText,
  Sparkles,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { Badge } from '../components/ui/Badge'
import { ErrorCodeChip } from '../components/ui/ErrorCodeChip'
import { Shimmer } from '../components/ui/Shimmer'
import { VerdictsByRun } from '../components/ui/VerdictsByRun'
import { ConfidenceBar } from '../components/charts/ConfidenceBar'
import { CategoryDonutChart } from '../components/charts/CategoryDonutChart'
import { PlatformBarChart } from '../components/charts/PlatformBarChart'
import { useJobPolling } from '../hooks/useJobPolling'
import { RcaCategory, Platform, RcaVerdict, JobStatusResponse, JobStatus } from '@/types'
import { submitVerdictFeedback } from '../api/rca'
import { getRunAnalysis, regressionErrorMessage, RunStoredAnalysis } from '../api/regression'
import { useTour } from '../tour/TourContext'
import { CopyText } from '../components/ui/CopyText'

const isVpnError = (reason: string | null | undefined) =>
  !!reason && /vpn|unreachable|network error/i.test(reason)

// Pick only ONE field per item — most detailed wins to avoid duplicates
function extractFromError(item: Record<string, string>): string {
  return (item.detailedErrorMessage || item.errorMessage || item.message || '').trim()
}
function extractFromReason(item: Record<string, string>): { text: string; stepName: string | null } {
  return {
    text: (item.detailedReason || item.reason || '').trim(),
    stepName: item.testStepName?.trim() || null,
  }
}

// Strip verbose wrappers like "TypeError thrown during test execution: TypeError: ..."
function cleanErrorText(raw: string): string {
  return raw.replace(/^[A-Za-z]+Error\s+thrown\s+during\s+(?:\w+\s+)*execution:\s*/i, '').trim()
}

function normalizeForDedup(text: string): string {
  return text.toLowerCase().trim().replace(/[.:!\s]+$/, '')
}

// Collapse repeated sentences/lines inside an explanation string
// Extract the core error phrase, stripping verbose wrappers and appended generic descriptions
function coreOf(line: string): string {
  return line
    .replace(/^[A-Za-z]*[Ee]rror\s+thrown\s+during\s+(?:\w+\s+)*execution:\s*/i, '')
    .replace(/^[A-Z][a-zA-Z]*Error:\s*/i, '')
    .replace(/\.\s*This indicates\b.*/i, '')
    .trim().toLowerCase().replace(/[.:!\s]+$/, '')
}

function dedupeExplanation(text: string): string {
  const lines = text.split(/\n/)
  const seenCores: string[] = []
  const kept: string[] = []
  for (const line of lines) {
    const norm = line.trim()
    if (!norm) { kept.push(line); continue }
    const core = coreOf(norm)
    if (!core) { kept.push(line); continue }
    const isDupe = seenCores.some(c => c === core || c.includes(core) || core.includes(c))
    if (!isDupe) { kept.push(norm); seenCores.push(core) }
  }
  return kept.join('\n').trim()
}

interface ParsedError { type: string | null; core: string; hint: string | null; stepName: string | null }

function parseError(text: string, stepName: string | null = null): ParsedError {
  const cleaned = cleanErrorText(text)
  const typeMatch = cleaned.match(/^([A-Z][a-zA-Z]*Error):\s*(.+)$/s)
  const type = typeMatch ? typeMatch[1] : null
  const core = typeMatch ? typeMatch[2].trim() : cleaned

  let hint: string | null = null
  const undefProp = core.match(/Cannot read propert(?:y|ies) of (?:undefined|null) \(reading '(.+?)'\)/)
  if (undefProp) {
    hint = `'${undefProp[1]}' is undefined — the parent object was not initialized or returned null. Ensure the data is fully loaded before this step runs.`
  } else if (/Cannot read propert(?:y|ies) of (?:undefined|null)/.test(core)) {
    hint = 'A property was accessed on an undefined or null object — verify the object is initialized before use.'
  } else {
    const notFunc = core.match(/^(.+?) is not a function/)
    if (notFunc) hint = `'${notFunc[1]}' is not a function — it may be undefined, not yet loaded, or the wrong type.`
  }
  if (!hint) {
    const notDef = core.match(/^(.+?) is not defined$/)
    if (notDef) hint = `'${notDef[1]}' is not defined — check imports and variable scope.`
  }
  if (!hint && (/expected\s+.+?\s+to\s+/i.test(core) || type === 'AssertionError')) {
    hint = 'Assertion failed — the actual value did not match the expected value.'
  }
  if (!hint && /timeout/i.test(core)) {
    hint = 'Operation timed out — the service may be slow, unreachable, or under load.'
  }
  return { type, core, hint, stepName }
}

function FailedReasonsList({ errors, reasons }: {
  errors?: Array<Record<string, string>>
  reasons?: Array<Record<string, string>>
}) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  function copyItem(text: string, idx: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    }).catch(() => {})
  }

  // Collect one text per item, then dedup across both arrays by normalized form
  const candidates: Array<{ text: string; stepName: string | null }> = []
  for (const e of errors ?? []) {
    const text = extractFromError(e)
    if (text) candidates.push({ text, stepName: null })
  }
  for (const r of reasons ?? []) {
    const { text, stepName } = extractFromReason(r)
    if (text) candidates.push({ text, stepName })
  }

  const seen: string[] = []
  const items: ParsedError[] = []
  for (const { text, stepName } of candidates) {
    const norm = normalizeForDedup(cleanErrorText(text))
    if (!norm) continue
    const isDupe = seen.some(n => n === norm || n.includes(norm) || norm.includes(n))
    if (!isDupe) {
      seen.push(norm)
      items.push(parseError(text, stepName))
    }
  }

  if (items.length === 0) return null

  return (
    <div className="mt-3 rounded-lg border border-amber-500/15 bg-amber-500/5 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-amber-400/70">
        Root Cause{items.length > 1 ? 's' : ''}
      </p>
      <ul className="space-y-2.5">
        {items.map(({ type, core, hint, stepName }, i) => (
          <li key={i} className="group">
            <div className="flex items-start gap-2">
              <span className="mt-px shrink-0 text-amber-400 text-xs">•</span>
              <div className="min-w-0 flex-1">
                {stepName && (
                  <p className="mb-0.5 text-[10px] font-medium text-gray-500">
                    Step: {stepName}
                  </p>
                )}
                <div className="flex flex-wrap items-baseline gap-1.5">
                  {type && (
                    <span className="shrink-0 rounded px-1 py-px text-[10px] font-bold bg-red-500/15 text-red-400">
                      {type}
                    </span>
                  )}
                  <span className="break-words text-xs text-amber-200/80">{core}</span>
                </div>
                {hint && (
                  <p className="mt-1 text-[11px] leading-relaxed text-sky-300/80">
                    Fix: {hint}
                  </p>
                )}
              </div>
              <button
                onClick={() => copyItem(type ? `${type}: ${core}` : core, i)}
                title="Copy error"
                className="ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-amber-400/60 hover:text-amber-300"
              >
                {copiedIdx === i
                  ? <Check className="h-3 w-3 text-emerald-400" />
                  : <Copy className="h-3 w-3" />
                }
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

const STATUS_ICON: Record<string, React.ReactElement> = {
  PENDING: <Clock className="h-4 w-4 text-gray-400 animate-pulse" />,
  RUNNING: <Loader className="h-4 w-4 text-blue-400 animate-spin" />,
  DONE: <CheckCircle className="h-4 w-4 text-emerald-400" />,
  FAILED: <XCircle className="h-4 w-4 text-red-400" />,
  STOPPED: <Square className="h-4 w-4 fill-current text-orange-400" />,
}

export function VerdictsPage() {
  // Either a job (/jobs/:jobId) or a Regression run's stored analysis (/runs/:runUuid/analysis).
  const { jobId, runUuid } = useParams<{ jobId?: string; runUuid?: string }>()
  const [runAnalysis, setRunAnalysis] = useState<RunStoredAnalysis | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  useEffect(() => {
    if (!runUuid) return
    getRunAnalysis(runUuid)
      .then((r) => { setRunAnalysis(r); setRunError(null) })
      .catch((err) => setRunError(regressionErrorMessage(err, 'Could not load this run’s analysis.')))
  }, [runUuid])
  const location = useLocation()
  const navigate = useNavigate()
  const navState = location.state as {
    jobId?: string
    status?: string
    verdicts?: RcaVerdict[]
    summary?: Record<string, number | Record<string, number>>
    cancelReason?: string | null
  } | null

  // Seed from navigation state for already-completed jobs (avoids extra API round-trip)
  const hasNavVerdicts = navState?.verdicts !== undefined
  const initialData: JobStatusResponse | null = navState?.status
    ? { jobId: navState.jobId ?? jobId ?? '', status: navState.status as JobStatus, verdicts: navState.verdicts ?? [], summary: navState.summary ?? {} }
    : null
  const cancelReason: string | null = runAnalysis?.reason ?? navState?.cancelReason ?? null

  // Skip polling only when verdicts were already provided in nav state (e.g. navigated from AnalyzePage).
  // When coming from Job History, the verdict list is absent — poll once so DB verdicts are fetched.
  const skipPolling = initialData !== null && hasNavVerdicts &&
    (initialData.status === 'DONE' || initialData.status === 'FAILED' || initialData.status === 'STOPPED')
  const { data: polledData, error: jobError } = useJobPolling(skipPolling || runUuid ? null : (jobId ?? null))
  const data: JobStatusResponse | null = runUuid
    ? (runAnalysis ? { jobId: runAnalysis.runUuid, status: runAnalysis.status as JobStatus, verdicts: runAnalysis.verdicts, summary: runAnalysis.summary } : null)
    : (polledData ?? initialData)
  const error = runUuid ? runError : jobError

  const { startTourIfNew } = useTour()
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
  const [platformFilter, setPlatformFilter] = useState<string>('ALL')
  const [isFiltering, setIsFiltering] = useState(false)
  const filterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pageLoading, setPageLoading] = useState(true)

  function triggerFilterShimmer(apply: () => void) {
    if (filterTimer.current) clearTimeout(filterTimer.current)
    setIsFiltering(true)
    apply()
    filterTimer.current = setTimeout(() => setIsFiltering(false), 250)
  }

  useEffect(() => {
    // Skip the skeleton delay when we already have data from navigation state
    if (initialData !== null) {
      setPageLoading(false)
      setTimeout(() => startTourIfNew('verdicts'), 800)
      return
    }
    if (import.meta.env.DEV) {
      const delay = Math.random() * 2000 + 3000
      const t = setTimeout(() => {
        setPageLoading(false)
        startTourIfNew('verdicts')
      }, delay)
      return () => clearTimeout(t)
    } else {
      setPageLoading(false)
      setTimeout(() => startTourIfNew('verdicts'), 800)
    }
  }, [])


  const verdicts: RcaVerdict[] = data?.verdicts ?? []

  const categoryTotals = verdicts.reduce<Partial<Record<RcaCategory, number>>>(
    (acc, v) => ({ ...acc, [v.category]: (acc[v.category] ?? 0) + 1 }),
    {}
  )
  const platformTotals = verdicts.reduce<Partial<Record<Platform, number>>>(
    (acc, v) => ({ ...acc, [v.platform]: (acc[v.platform] ?? 0) + 1 }),
    {}
  )

  const categories = ['ALL', ...Object.keys(categoryTotals)]
  const platforms = ['ALL', ...Object.keys(platformTotals)]

  const filtered = useMemo(
    () =>
      verdicts.filter(
        (v) =>
          (categoryFilter === 'ALL' || v.category === categoryFilter) &&
          (platformFilter === 'ALL' || v.platform === platformFilter)
      ),
    [verdicts, categoryFilter, platformFilter]
  )

  const avgConfidence =
    verdicts.length > 0
      ? (verdicts.reduce((s, v) => s + v.confidence, 0) / verdicts.length).toFixed(2)
      : null

  const status = data?.status ?? null

  return (
    <DashboardLayout title={runUuid ? 'Run Analysis' : 'Job Verdicts'}>
      {pageLoading ? (
        <div className="space-y-6">
          {/* Job header skeleton */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <Shimmer className="h-3 w-16 rounded" />
                <Shimmer className="h-4 w-80 rounded" />
              </div>
              <Shimmer className="h-6 w-20 rounded-full" />
            </div>
          </div>
          {/* Summary cards skeleton */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
                <Shimmer className="mb-1 mx-auto h-8 w-16 rounded" />
                <Shimmer className="mx-auto h-3 w-24 rounded" />
              </div>
            ))}
          </div>
          {/* Charts skeleton */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <Shimmer className="mb-3 h-4 w-40 rounded" />
                <Shimmer className="h-48 w-full rounded-lg" />
              </div>
            ))}
          </div>
          {/* Verdict rows skeleton */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="p-4 border-b border-gray-800 space-y-3">
              <Shimmer className="h-4 w-32 rounded" />
              <div className="flex gap-2">
                {[0,1,2].map((i) => <Shimmer key={i} className="h-6 w-20 rounded-full" />)}
              </div>
            </div>
            <div className="divide-y divide-gray-800">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 space-y-2">
                  <div className="flex gap-2">
                    <Shimmer className="h-5 w-24 rounded-full" />
                    <Shimmer className="h-5 w-20 rounded-full" />
                  </div>
                  <Shimmer className="h-4 w-full rounded" />
                  <Shimmer className="h-4 w-3/4 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
      {/* Job header */}
      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900 p-5" data-tour="tour-job-header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {runUuid ? (
              <>
                {(location.state as { from?: string } | null)?.from === 'batch' && (
                  <button onClick={() => navigate(-1)} className="mb-2 inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to Batch Analysis
                  </button>
                )}
                <p className="text-xs text-gray-500 mb-1">Regression run</p>
                <p className="text-sm font-semibold text-gray-100">{runAnalysis?.runName ?? 'Run'}</p>
                <p className="font-mono text-xs text-gray-400">{runUuid}</p>
                {runAnalysis && (
                  <p className="mt-1 text-xs text-gray-500">
                    Analysed {runAnalysis.analysedAt ? new Date(runAnalysis.analysedAt).toLocaleString() : ''}
                    {' · '}{runAnalysis.source === 'auto' ? 'automatically when the run finished' : runAnalysis.source === 'batch' ? 'in a batch analysis' : 'with Single Run'}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-1">Job ID</p>
                <p className="font-mono text-sm text-gray-300">{jobId}</p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {status ? STATUS_ICON[status] : <Loader className="h-4 w-4 text-gray-500 animate-spin" />}
            {status
              ? <Badge type="status" value={status} />
              : <span className="text-xs text-gray-500">Loading…</span>}
            {(status === 'PENDING' || status === 'RUNNING') && (
              <span className="text-xs text-gray-500">Auto-refreshing every 3s</span>
            )}
          </div>
        </div>

        {(status === 'PENDING' || status === 'RUNNING') && (
          <div className="mt-4">
            <div className="h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
              <div className="h-full bg-primary-600 rounded-full animate-pulse w-2/3" />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {status === 'PENDING' ? 'Job queued — waiting to start' : 'Analysis in progress...'}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-3 text-sm text-red-400">{error}</div>
        )}
      </div>

      {/* Summary stats */}
      {verdicts.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6" data-tour="tour-verdict-stats">
            <SummaryCard label="Total Verdicts" value={verdicts.length} />
            <SummaryCard label="Avg Confidence" value={avgConfidence ? `${Math.round(Number(avgConfidence) * 100)}%` : '—'} />
            <SummaryCard label="Categories" value={Object.keys(categoryTotals).length} />
            <SummaryCard label="Platforms" value={Object.keys(platformTotals).length} />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mb-6" data-tour="tour-verdict-charts">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-300">Category Breakdown</h3>
              </div>
              <CategoryDonutChart data={categoryTotals} />
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-300">Platform Breakdown</h3>
              </div>
              <PlatformBarChart data={platformTotals} />
            </div>
          </div>

          {/* Verdict list with filters */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden" data-tour="tour-verdict-list">
            <div className="p-4 border-b border-gray-800 space-y-3">
              <h3 className="text-sm font-semibold text-gray-300">Verdicts</h3>
              {/* Category filter */}
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => {
                  const count = c === 'ALL' ? verdicts.length : (categoryTotals[c as RcaCategory] ?? 0)
                  const isActive = categoryFilter === c
                  return (
                    <button
                      key={c}
                      onClick={() => triggerFilterShimmer(() => setCategoryFilter(c))}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      }`}
                    >
                      {c.replace(/_/g, ' ')}
                      <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${
                        isActive ? 'bg-white/20 text-white' : 'bg-gray-700 text-gray-400'
                      }`}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
              {/* Platform filter */}
              <div className="flex flex-wrap gap-2">
                {platforms.map((p) => {
                  const count = p === 'ALL' ? verdicts.length : (platformTotals[p as Platform] ?? 0)
                  const isActive = platformFilter === p
                  return (
                    <button
                      key={p}
                      onClick={() => triggerFilterShimmer(() => setPlatformFilter(p))}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-gray-600 text-white'
                          : 'bg-gray-800/50 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
                      }`}
                    >
                      {p.replace(/_/g, ' ')}
                      <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${
                        isActive ? 'bg-white/20 text-white' : 'bg-gray-700 text-gray-500'
                      }`}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="divide-y divide-gray-800 max-h-[600px] overflow-y-auto">
              {isFiltering ? (
                Array.from({ length: Math.min(filtered.length || 3, 5) }).map((_, i) => (
                  <div key={i} className="p-4 space-y-3">
                    <div className="flex gap-2">
                      <Shimmer className="h-5 w-24 rounded-full" />
                      <Shimmer className="h-5 w-20 rounded-full" />
                    </div>
                    <Shimmer className="h-4 w-full rounded" />
                    <Shimmer className="h-4 w-5/6 rounded" />
                    <div className="flex items-center justify-between">
                      <Shimmer className="h-3 w-28 rounded" />
                      <Shimmer className="h-3 w-36 rounded" />
                    </div>
                  </div>
                ))
              ) : filtered.length > 0 ? (
                <VerdictsByRun verdicts={filtered}>{(runVerdicts) => <div className="divide-y divide-gray-800">{runVerdicts.map((v, i) => (
                  <div key={i} className="p-4 hover:bg-gray-800/50 transition-colors">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge type="category" value={v.category} />
                      <Badge type="platform" value={v.platform} />
                      <ErrorCodeChip {...v} />
                      {v.aiSuggested && (
                        <span
                          title="Classified by AI — no deterministic rule matched"
                          className="flex items-center gap-1 rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-0.5 text-xs font-medium text-violet-400"
                        >
                          <Sparkles className="h-3 w-3" />
                          AI
                        </span>
                      )}
                      {v.jiraUrl && (
                        <a
                          href={v.jiraUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-0.5 text-xs font-medium text-cyan-400 transition-colors hover:bg-cyan-400/20"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {v.matchedJiraTicket ?? 'Jira Issue'}
                        </a>
                      )}
                      {v.reportUrl && (
                        <a
                          href={v.reportUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-full border border-primary-400/25 bg-primary-400/10 px-2.5 py-0.5 text-xs font-medium text-primary-400 transition-colors hover:bg-primary-400/20"
                        >
                          <FileText className="h-3 w-3" />
                          Report
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 break-words mb-1">{dedupeExplanation(v.explanation)}</p>
                    <FailedReasonsList errors={v.failureErrors} reasons={v.stepReasons} />
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      {v.matchedRule && (
                        <span className="text-xs text-gray-600 font-mono">
                          Rule: {v.matchedRule}
                        </span>
                      )}
                      <span className="text-xs text-gray-600 font-mono truncate">
                        {v.testCaseRunId}
                      </span>
                      <div className="ml-auto w-36">
                        <ConfidenceBar value={v.confidence} />
                      </div>
                    </div>
                    <VerdictFeedback matchedRule={v.matchedRule} runId={v.testCaseRunId} />
                  </div>
                ))}</div>}</VerdictsByRun>
              ) : (
                <div className="flex items-center justify-center gap-2 py-10 text-gray-600">
                  <RefreshCw className="h-4 w-4" />
                  <p className="text-sm">No verdicts match the selected filters</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {status === 'FAILED' && (
        isVpnError(cancelReason) ? (
          <VpnErrorTerminal />
        ) : (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-red-400 mb-1">Job failed to complete</p>
                <CopyText
                  text={cancelReason ?? 'The analysis could not be completed. The execution may still be running or was not in a Done state in InspectorWeb. Check the run status and retry once it has finished.'}
                  className="text-sm text-gray-400"
                />
                {verdicts.length > 0 && (
                  <p className="mt-3 text-xs text-gray-500">
                    {verdicts.length} partial verdict{verdicts.length !== 1 ? 's' : ''} were captured before the failure — see above.
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      )}

      {status === 'STOPPED' && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/15">
              <Square className="h-5 w-5 fill-current text-orange-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-orange-400 mb-1">Analysis was stopped</p>
              <CopyText
                text={cancelReason ?? 'This analysis was cancelled by the user before it could complete.'}
                className="text-sm text-gray-400"
              />
              {verdicts.length > 0 && (
                <p className="mt-3 text-xs text-gray-500">
                  {verdicts.length} partial verdict{verdicts.length !== 1 ? 's' : ''} were captured before stopping — see above.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {status === 'DONE' && verdicts.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-800 bg-gray-900/50 p-10 text-center">
          <p className="text-gray-500 text-sm">No verdicts were produced for this job.</p>
        </div>
      )}
        </>
      )}
    </DashboardLayout>
  )
}

function VerdictFeedback({ matchedRule, runId: _runId }: { matchedRule: string | null; runId: string }) {
  const [state, setState] = useState<'correct' | 'wrong' | null>(null)
  const [busy, setBusy] = useState(false)

  async function send(isCorrect: boolean) {
    if (busy || state !== null) return
    setBusy(true)
    try {
      await submitVerdictFeedback(matchedRule!, isCorrect)
      setState(isCorrect ? 'correct' : 'wrong')
    } catch { /* silent */ } finally {
      setBusy(false)
    }
  }

  if (!matchedRule) return null

  return (
    <div className="flex items-center gap-1.5 mt-2">
      <span className="text-[10px] text-gray-600 mr-0.5">Correct?</span>
      <button
        onClick={() => send(true)}
        disabled={busy || state !== null}
        title="Mark as correct"
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
          state === 'correct'
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'text-gray-600 hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40'
        }`}
      >
        <ThumbsUp className="h-3 w-3" />
        {state === 'correct' && 'Marked'}
      </button>
      <button
        onClick={() => send(false)}
        disabled={busy || state !== null}
        title="Mark as wrong"
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
          state === 'wrong'
            ? 'bg-red-500/20 text-red-400'
            : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40'
        }`}
      >
        <ThumbsDown className="h-3 w-3" />
        {state === 'wrong' && 'Marked'}
      </button>
    </div>
  )
}

function VpnErrorTerminal() {
  const W = 62
  const center = (s: string) => {
    const pad = Math.max(0, W - s.length)
    return ' '.repeat(Math.floor(pad / 2)) + s + ' '.repeat(Math.ceil(pad / 2))
  }
  const lines = [
    '╔' + '═'.repeat(W - 2) + '╗',
    center('VPN NOT CONNECTED — InspectorWeb is unreachable.'),
    center('Please connect to the VPN and try again.'),
    '╚' + '═'.repeat(W - 2) + '╝',
  ].join('\n')
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-950 p-4 font-mono text-xs leading-relaxed overflow-x-auto">
      <p className="text-red-400">✗ Could not reach the analysis service — check your VPN connection.</p>
      <pre className="text-red-400 mt-1">{lines}</pre>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
      <p className="text-2xl font-bold text-gray-100">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
