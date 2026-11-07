// Author: Kishore Kumar
import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Microscope, Hash, WifiOff, ExternalLink,
  FileText, ClipboardPaste, Check, Zap, Cpu, Send, CheckCircle2,
  LoaderCircle, X, AlertCircle, Square, Copy,
  ArrowUpDown,
} from 'lucide-react'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { useTour } from '../tour/TourContext'
import { Button } from '../components/ui/Button'
import { Shimmer } from '../components/ui/Shimmer'
import { VerdictsByRun } from '../components/ui/VerdictsByRun'
import { Badge, CATEGORY_STYLES } from '../components/ui/Badge'
import { ErrorCodeChip } from '../components/ui/ErrorCodeChip'
import { ConfidenceBar } from '../components/charts/ConfidenceBar'
import { analyze, getJobStatus } from '../api/rca'
import { RcaVerdict } from '@/types'
import {
  Stepper, StepperNav, StepperItem, StepperTrigger, StepperIndicator,
  StepperTitle, StepperSeparator, StepperPanel, StepperContent,
} from '../components/reui/stepper'
import { Badge as StepBadge } from '../components/reui/badge'
import { useAnalyzeStore } from '../store/analyzeStore'
import { lastProgress, launchAnalysisSession, reconnectIfActive, signalError, stopAnalysis } from '../utils/analyzeSession'
import { hasPermission, PERMISSIONS } from '../utils/permissions'
import { BatchScopeForm, BatchSelection } from '../components/regression/BatchScopeForm'
import { useAuthStore } from '../store/authStore'
import { REGRESSION_MAINTENANCE } from '../utils/features'
import { MaintenanceModal } from '../components/ui/MaintenanceModal'


function logColor(line: string): string {
  if (/✓|Done|complete/i.test(line)) return 'text-emerald-400'
  // Progress/summary lines (↳ prefix or specific patterns) — checked before the red rule
  // because they may contain words like "failures" or "failed" in a non-error context.
  if (/Extracted \d+ failure|↳/.test(line)) return 'text-sky-300'
  if (/⚠|Warning|Skipping/i.test(line)) return 'text-yellow-400'
  if (/✗/.test(line)) return 'text-red-400'
  return 'text-gray-300'
}

/** A batch's final state. The live stream can end first (a fast batch finishes before the page
 *  connects), so keep asking for up to ~20 s while the job is still pending or running. */
async function waitForJob(jobId: string) {
  let job = await getJobStatus(jobId)
  for (let i = 0; i < 20 && (job.status === 'PENDING' || job.status === 'RUNNING'); i++) {
    await new Promise((r) => setTimeout(r, 1000))
    job = await getJobStatus(jobId)
  }
  return job
}

function recentKey(email: string) {
  return `rca_recent_uuids_${email}`
}

export function AnalyzePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { startTourIfNew } = useTour()
  const email = useAuthStore((s) => s.user?.email ?? '')
  const navState = location.state as { runUuid?: string; batchRunUuids?: string[] } | null
  const prefill = navState?.runUuid ?? ''
  const user = useAuthStore((s) => s.user)
  const canBatch = hasPermission(user, PERMISSIONS.regressionView)

  // While Regression is under maintenance, Batch Analysis (which works on Regression runs) is too:
  // its tab shows a popup and Single Run stays available. Admins can open it anyway; arriving with
  // runs from the Regression tab, or with a batch already running, counts as opened.
  const [batchOverride, setBatchOverride] = useState(
    () => {
      if (navState?.batchRunUuids?.length) return true
      try { return useAnalyzeStore.getState().loading && sessionStorage.getItem('rca_analyze_mode') === 'async' } catch { return false }
    },
  )
  const batchLocked = REGRESSION_MAINTENANCE && !batchOverride
  const [batchNotice, setBatchNotice] = useState(false)

  // Batch when sent here with runs; otherwise the mode last used in this browser session
  // (so coming back from a run's results lands on Batch Analysis again).
  const [mode, setMode] = useState<'sync' | 'async'>(() => {
    if (navState?.batchRunUuids?.length) return 'async'
    if (navState?.runUuid) return 'sync'
    if (batchLocked) return 'sync'
    try { return sessionStorage.getItem('rca_analyze_mode') === 'async' ? 'async' : 'sync' } catch { return 'sync' }
  })
  useEffect(() => {
    try { sessionStorage.setItem('rca_analyze_mode', mode) } catch { /* storage unavailable */ }
  }, [mode])
  // Runs picked in the Regression tab ("Batch Analyze"); cleared to use the filters instead.
  const [presetRuns, setPresetRuns] = useState<string[] | undefined>(navState?.batchRunUuids)
  const [batch, setBatch] = useState<BatchSelection>({ runUuids: [], label: '' })

  const [runUuid, setRunUuid] = useState(prefill)
  const [recentUuids, setRecentUuids] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(recentKey(email)) ?? '[]') } catch { return [] }
  })

  const [pageLoading, setPageLoading] = useState(true)
  const [fieldErrors, setFieldErrors] = useState<{ runUuid?: string; batch?: string }>({})
  const [pasted, setPasted] = useState(false)

  // All analysis state lives in the global store — survives page navigation.
  const {
    logs, syncVerdicts, loading, progress, showProgress, jobId,
    reportCount, progressStatus, error, vpnError,
    setError, setVerdicts, setJobId, addLog,
  } = useAnalyzeStore()


  const [confirmStop, setConfirmStop] = useState(false)
  const [thinkingPhase, setThinkingPhase] = useState(0) // 0=hidden, 1=Thinking…, 2=Still thinking…, 3=Thinking more…

  const logRef = useRef<HTMLDivElement>(null)
  const lastLogCountRef = useRef(0)

  // Always start clean: a finished analysis isn't shown again when the page opens (it's in
  // Job History). Runs before paint so the old log never flashes. A running analysis is kept.
  useLayoutEffect(() => {
    const store = useAnalyzeStore.getState()
    if (!store.loading) store.reset()
  }, [])

  // Re-attach SSE if analysis was running when the user navigated away.
  useEffect(() => { reconnectIfActive() }, [])

  // Auto-scroll terminal to bottom on new logs
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
    // Reset thinking phase whenever new logs arrive
    if (logs.length !== lastLogCountRef.current) {
      lastLogCountRef.current = logs.length
      setThinkingPhase(0)
    }
  }, [logs])

  // Advance thinking phase when loading but no new logs arrive
  useEffect(() => {
    if (!loading) { setThinkingPhase(0); return }
    const t1 = setTimeout(() => setThinkingPhase(1), 3000)
    const t2 = setTimeout(() => setThinkingPhase(2), 8000)
    const t3 = setTimeout(() => setThinkingPhase(3), 13000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [loading, logs])

  useEffect(() => {
    if (import.meta.env.DEV) {
      const delay = Math.random() * 2000 + 3000
      const t = setTimeout(() => {
        setPageLoading(false)
        startTourIfNew('analyze')
      }, delay)
      return () => clearTimeout(t)
    } else {
      setPageLoading(false)
    }
  }, [])

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) {
        setRunUuid(text.trim())
        setFieldErrors((p) => ({ ...p, runUuid: undefined }))
        setPasted(true)
        setTimeout(() => setPasted(false), 2000)
      }
    } catch {
      // clipboard access denied — ignore silently
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const errs: { runUuid?: string; batch?: string } = {}
    if (mode === 'sync' && !runUuid.trim()) {
      errs.runUuid = 'Run UUID is required to identify the test run.'
    } else if (mode === 'sync' && !UUID_RE.test(runUuid.trim())) {
      errs.runUuid = 'Invalid Run UUID — please copy it directly from InspectorWeb.'
    }
    if (mode === 'async' && !canBatch) return
    if (mode === 'async' && batch.runUuids.length === 0) {
      errs.batch = 'Pick at least one run to analyse.'
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})

    if (mode === 'sync') {
      const uuid = runUuid.trim()
      setRecentUuids((prev) => {
        const next = [uuid, ...prev.filter((u) => u !== uuid)].slice(0, 5)
        localStorage.setItem(recentKey(email), JSON.stringify(next))
        return next
      })
    }

    const newSessionId = crypto.randomUUID()
    // launchAnalysisSession resets store state, starts SSE + progress tick,
    // and returns a Promise that resolves when the stream closes.
    const ssePromise = launchAnalysisSession(newSessionId, mode === 'sync' ? runUuid : '')

    const req =
      mode === 'sync'
        ? { runUuid, sessionId: newSessionId, syncJobId: useAnalyzeStore.getState().syncJobId }
        : { runUuids: batch.runUuids, batchLabel: batch.label, sessionId: newSessionId }

    try {
      const result = await analyze(req)
      // Only discard if the user explicitly stopped (progressStatus === 'error').
      // A natural completion sets progressStatus === 'success' (loading already false)
      // because the backend closes the SSE stream before returning the HTTP response.
      if (useAnalyzeStore.getState().progressStatus === 'error') return
      if (result.verdicts) setVerdicts(result.verdicts)
      if (result.jobId) setJobId(result.jobId)
      await ssePromise
      if (result.jobId) {
        // Batch: stay here like Single Run — load the job's verdicts and show them below the form,
        // or fail the same way Single Run does (red step bar where it stopped, error banner).
        const store = useAnalyzeStore.getState()
        const cancelled = store.logs.some((l) => /✗ Cancelled by/.test(l))
        const vpnDown = store.logs.some((l) => !l.includes(' › ') && /VPN NOT CONNECTED|InspectorWeb is unreachable/i.test(l))
        const job = store.progressStatus === 'error' ? null : await waitForJob(result.jobId)
        if (job?.status === 'DONE') {
          setVerdicts(job.verdicts)
        } else if (!cancelled) {
          if (store.progressStatus !== 'error') {
            store.setProgress(lastProgress())  // undo the jump to 100 so the failed step shows red
            store.finishError()
          }
          if (vpnDown) setError('InspectorWeb is unreachable. Please connect to your VPN and try again.', true)
          else setError(job && job.status !== 'FAILED' ? `The batch ended as ${job.status}.` : 'The batch failed — see the log for the reason.')
        }
      }
    } catch (err: unknown) {
      // If the user stopped the analysis, ignore whatever the pending request resolves to.
      if (useAnalyzeStore.getState().progressStatus === 'error') return
      signalError()
      const status = (err as { response?: { status?: number } })?.response?.status
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      if (status === 503) {
        // 503 = a dependency was unreachable (InspectorWeb, or ODH for batch jobs). Keep the backend's
        // own message so the banner names the right service.
        const reason = typeof detail === 'string' ? detail : ''
        setError(reason, true)
        addLog(`✗ ${reason || 'Could not reach the analysis service — check your VPN connection.'}`)
        return
      }
      const msg = Array.isArray(detail)
        ? (detail as { msg?: string }[])
            .map((d) => d.msg?.replace(/^Value error, /, '') ?? '')
            .filter(Boolean)
            .join(' ')
        : typeof detail === 'string'
        ? detail
        : 'Analysis failed. Check your inputs and try again.'
      setError(msg)
      addLog(`✗ ${msg}`)
    }
  }

  const showTerminal = loading || logs.length > 0 || (showProgress && progressStatus === 'error')

  return (
    <DashboardLayout title="Analyze">
      <div className={showTerminal ? 'grid grid-cols-2 gap-5 items-start' : 'max-w-3xl'}>

        {/* ── Left column: form + results ─────────────────────────────── */}
        <div className="min-w-0">
        {pageLoading ? (
          <>
            <Shimmer className="mb-6 h-10 w-52 rounded-lg" />
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
              <div className="flex items-center gap-2 mb-5">
                <Shimmer className="h-5 w-5 rounded" />
                <Shimmer className="h-4 w-40 rounded" />
              </div>
              <div className="space-y-5">
                <div>
                  <Shimmer className="mb-1.5 h-3 w-20 rounded" />
                  <Shimmer className="h-10 w-full rounded-lg" />
                  <Shimmer className="mt-1 h-3 w-56 rounded" />
                </div>
                <Shimmer className="h-10 w-32 rounded-lg" />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Mode toggle */}
            <div className="mb-6 flex gap-2 p-1 rounded-lg bg-gray-800 w-fit" data-tour="tour-mode">
              {(['sync', 'async'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    if (m === 'async' && batchLocked) { setBatchNotice(true); return }
                    setMode(m); setFieldErrors({})
                  }}
                  className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${
                    mode === m
                      ? 'bg-primary-600 text-white shadow'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {m === 'sync' ? '⚡ Single Run' : '⏳ Batch Analysis'}
                  {m === 'async' && batchLocked && (
                    <span className="ml-2 rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/30">Maintenance</span>
                  )}
                </button>
              ))}
            </div>

            {batchNotice && (
              <MaintenanceModal
                title="Batch Analysis is under maintenance"
                onLeave={() => setBatchNotice(false)}
                leaveLabel="Use Single Run"
                extra={user?.role === 'admin' && (
                  <button
                    onClick={() => { setBatchOverride(true); setBatchNotice(false); setMode('async'); setFieldErrors({}) }}
                    className="text-sm font-medium text-amber-300 hover:text-amber-200"
                  >
                    Open anyway (admin)
                  </button>
                )}
              >
                <p>Batch Analysis works on runs from the Regression tab, which is being prepared and isn't available to everyone yet.</p>
                <p className="text-gray-500">Meanwhile, use <span className="font-medium text-primary-400">Single Run</span> — paste a run UUID to analyse one execution at a time.</p>
              </MaintenanceModal>
            )}

            {/* Form card */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-6" data-tour="tour-form">
              <div className="flex items-center gap-2 mb-5">
                <Microscope className="h-5 w-5 text-primary-400" />
                <h2 className="text-base font-semibold text-gray-200">
                  {mode === 'sync' ? 'Analyze Single Run' : 'Batch Analysis'}
                </h2>
              </div>

              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                {mode === 'sync' ? (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">
                      Run UUID
                    </label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      <input
                        value={runUuid}
                        onChange={(e) => { setRunUuid(e.target.value.trim()); setFieldErrors((p) => ({ ...p, runUuid: undefined })) }}
                        placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                        className={`w-full rounded-lg border bg-gray-800 py-2.5 pl-10 pr-10
                          text-sm text-gray-100 placeholder-gray-600 font-mono
                          focus:outline-none focus:ring-1 ${
                          fieldErrors.runUuid
                            ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                            : 'border-gray-700 focus:border-primary-500 focus:ring-primary-500'
                        }`}
                      />
                      {runUuid ? (
                        <button
                          type="button"
                          onClick={() => { setRunUuid(''); setFieldErrors((p) => ({ ...p, runUuid: undefined })) }}
                          title="Clear"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handlePaste}
                          title="Paste from clipboard"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-primary-400 transition-colors"
                        >
                          {pasted
                            ? <Check className="h-4 w-4 text-emerald-400" />
                            : <ClipboardPaste className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                    {fieldErrors.runUuid ? (
                      <p className="mt-1.5 text-xs text-red-400">{fieldErrors.runUuid}</p>
                    ) : (
                      <p className="mt-1 text-xs text-gray-600">Returns verdicts immediately (synchronous).</p>
                    )}
                    {recentUuids.length > 0 && (
                      <div className="mt-2.5">
                        <p className="mb-1.5 text-xs text-gray-600">Recent</p>
                        <div className="flex flex-wrap gap-1.5">
                          {recentUuids.map((uuid) => (
                            <button
                              key={uuid}
                              type="button"
                              onClick={() => { setRunUuid(uuid); setFieldErrors((p) => ({ ...p, runUuid: undefined })) }}
                              className="rounded-md border border-gray-700 bg-gray-800/60 px-2 py-0.5 font-mono text-[10px] text-gray-500 transition-colors hover:border-primary-500/50 hover:text-primary-400 truncate max-w-[160px]"
                              title={uuid}
                            >
                              {uuid.slice(0, 8)}…
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  canBatch ? (
                    <BatchScopeForm
                      presetRunUuids={presetRuns}
                      onClearPreset={() => setPresetRuns(undefined)}
                      onChange={setBatch}
                      error={fieldErrors.batch}
                    />
                  ) : (
                    <p className="rounded-lg border border-gray-800 bg-gray-800/40 px-4 py-3 text-sm text-gray-400">
                      Batch Analysis works on runs started from the Regression tab. Ask an admin for <span className="font-medium text-gray-200">Regression: view</span> access to use it.
                    </p>
                  )
                )}

                {vpnError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-start gap-3">
                    <WifiOff className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-400">
                        {/odh|elasticsearch/i.test(error) ? 'ODH (Elasticsearch) unreachable' : 'InspectorWeb unreachable'}
                      </p>
                      <p className="text-xs text-red-400/80 mt-0.5">{error || 'Please connect to your VPN and try again.'}</p>
                    </div>
                  </div>
                )}

                {error && !vpnError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {error}
                  </div>
                )}

                <div className="flex items-center gap-4 flex-wrap" data-tour="tour-submit">
                  <Button type="submit" loading={loading} size="lg" className="shrink-0">
                    {mode === 'sync' ? 'Run Analysis' : `Start Batch Job${batch.runUuids.length ? ` (${batch.runUuids.length} run${batch.runUuids.length === 1 ? '' : 's'})` : ''}`}
                  </Button>
                </div>

                {showProgress && (
                  <StepProgress progress={progress} reportCount={reportCount} status={progressStatus} />
                )}
              </form>
            </div>

            {/* Sync results */}
            {syncVerdicts && (
              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-gray-300">
                    Results — {syncVerdicts.length} verdict{syncVerdicts.length !== 1 ? 's' : ''}
                  </h3>
                  {mode === 'async' && jobId && (
                    <button type="button" onClick={() => navigate(`/jobs/${jobId}`)} className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300">
                      <ExternalLink className="h-3.5 w-3.5" /> Open in Job History
                    </button>
                  )}
                </div>
                <VerdictList verdicts={syncVerdicts} />
              </div>
            )}

          </>
        )}
        </div>

        {/* ── Right column: live log terminal ─────────────────────────── */}
        {showTerminal && (
          <div
            className="sticky top-0 flex flex-col rounded-xl border border-gray-700 bg-black overflow-hidden shadow-2xl"
            style={{ height: 'calc(100vh - 5.5rem)' }}
          >
            {/* Title bar — tour anchor: small precise target, not the full-height wrapper */}
            <div data-tour="tour-terminal" className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-900/80 shrink-0">
              <span className="h-3 w-3 rounded-full bg-red-500/70" />
              <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
              <span className="h-3 w-3 rounded-full bg-green-500/70" />
              <span className="ml-2 text-sm font-medium text-gray-400 font-mono">Analysis Log</span>
              {loading && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    Running
                  </span>
                  <button
                    title="Stop analysis"
                    onClick={() => setConfirmStop(true)}
                    className="flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 hover:border-red-500/60"
                  >
                    <Square className="h-3 w-3 fill-current" />
                    Stop Analysis
                  </button>
                </div>
              )}
            </div>

            {/* Log lines — fills remaining height */}
            <div
              ref={logRef}
              className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs leading-5"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}
            >
              {logs.length === 0 ? (
                <span className="text-gray-600 animate-pulse">Connecting to stream...</span>
              ) : (
                logs.map((line, i) => (
                  <div key={i} className={`${logColor(line)} whitespace-pre`}>
                    {line}
                  </div>
                ))
              )}
              {thinkingPhase > 0 && (
                <div className="flex items-center gap-2 text-gray-600 animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-600 animate-pulse" />
                  {thinkingPhase === 1 && 'Thinking...'}
                  {thinkingPhase === 2 && 'Still thinking...'}
                  {thinkingPhase === 3 && 'Almost done thinking...'}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
      {confirmStop && (
        <StopConfirmModal
          onConfirm={async () => { setConfirmStop(false); await stopAnalysis() }}
          onCancel={() => setConfirmStop(false)}
        />
      )}
    </DashboardLayout>
  )
}

// ── Analysis steps definition ──────────────────────────────────────────────

const ANALYSIS_STEPS = [
  {
    title: 'Initializing',
    icon: <Zap className="size-4" />,
    content: (_count: number | null) => 'Connecting to InspectorWeb…',
  },
  {
    title: 'Fetching Run Info',
    icon: <Hash className="size-4" />,
    content: (_count: number | null) => 'Fetching execution summary…',
  },
  {
    title: 'Fetching Reports',
    icon: <FileText className="size-4" />,
    content: (count: number | null) =>
      count != null
        ? `Downloading ${count} report${count === 1 ? '' : 's'}…`
        : 'Fetching test reports…',
  },
  {
    title: 'Running Rules',
    icon: <Cpu className="size-4" />,
    content: (_count: number | null) => 'Evaluating failure patterns…',
  },
  {
    title: 'Publishing',
    icon: <Send className="size-4" />,
    content: (_count: number | null) => 'Saving RCA verdicts…',
  },
  {
    title: 'Complete',
    icon: <CheckCircle2 className="size-4" />,
    content: (_count: number | null) => 'Analysis complete ✓',
  },
]

function progressToStep(p: number): number {
  if (p >= 100) return ANALYSIS_STEPS.length + 1  // all completed (step 7)
  if (p >= 97)  return 6  // Complete
  if (p >= 90)  return 5  // Publishing
  if (p >= 58)  return 4  // Running Rules
  if (p >= 28)  return 3  // Fetching Reports (includes extraction)
  if (p >= 15)  return 2  // Fetching Run Info
  return 1                 // Initializing
}

function fmtDuration(secs: number): string {
  if (secs < 60) return `${secs.toFixed(1)}s`
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}m ${s}s`
}

function StepProgress({
  progress,
  reportCount,
  status,
}: {
  progress: number
  reportCount: number | null
  status: 'idle' | 'running' | 'success' | 'error'
}) {
  const currentStep = progressToStep(progress)
  const isError = status === 'error'

  const stepStartRef = useRef<Record<number, number>>({})
  const prevStepRef  = useRef<number>(currentStep)
  const stepDurations    = useAnalyzeStore((s) => s.stepDurations ?? {})
  const recordStepDurations = useAnalyzeStore((s) => s.recordStepDurations)

  useEffect(() => {
    const prev = prevStepRef.current
    const now = Date.now()

    // New run detected: step jumped back to 1
    if (currentStep === 1 && prev > 1) {
      stepStartRef.current = {}
    }

    // Ensure every step from prev onward has a recorded start time.
    // If React batched multiple progress updates, intermediate steps may have
    // been skipped — seed their start time so durations are at least ~0.
    for (let s = prev; s <= currentStep; s++) {
      if (!stepStartRef.current[s]) {
        stepStartRef.current[s] = now
      }
    }

    // Record durations for ALL steps that just completed (handles batched jumps).
    if (prev < currentStep) {
      const updates: Record<number, number> = {}
      const current = useAnalyzeStore.getState().stepDurations
      for (let s = prev; s < currentStep; s++) {
        if (s >= 1 && current[s] === undefined) {
          updates[s] = (now - stepStartRef.current[s]) / 1000
        }
      }
      if (Object.keys(updates).length > 0) recordStepDurations(updates)
    }

    // When all steps finish, close out the last real step
    if (currentStep > ANALYSIS_STEPS.length) {
      const last = ANALYSIS_STEPS.length
      const current = useAnalyzeStore.getState().stepDurations
      if (stepStartRef.current[last] && current[last] === undefined) {
        recordStepDurations({ [last]: (now - stepStartRef.current[last]) / 1000 })
      }
    }

    prevStepRef.current = currentStep
  }, [currentStep, recordStepDurations])

  const activeIndicatorClass = isError
    ? 'border-red-500 bg-red-500/20 text-red-400'
    : 'border-primary-500 bg-primary-500/20 text-primary-400'

  return (
    <Stepper
      value={currentStep}
      indicators={{
        completed: <Check className="size-3.5" />,
        loading: isError
          ? <X className="size-3.5" />
          : <LoaderCircle className="size-3.5 animate-spin" />,
      }}
      className="mt-4 w-full space-y-5"
    >
      <StepperNav className="gap-3">
        {ANALYSIS_STEPS.map((step, index) => (
          <StepperItem
            key={index}
            step={index + 1}
            className="relative flex-1 items-start"
          >
            <StepperTrigger className="flex grow flex-col items-start gap-2.5 pointer-events-none cursor-default">
              {/* Circle indicator — time floats above it via absolute so it doesn't shift the circle */}
              <div className="relative">
                {stepDurations[index + 1] !== undefined && (
                  <p className="absolute -top-4 left-0 text-[10px] text-emerald-400/70 font-medium whitespace-nowrap">
                    {fmtDuration(stepDurations[index + 1])}
                  </p>
                )}
              <StepperIndicator
                className={[
                  'size-8 border-2',
                  activeIndicatorClass,
                  'data-[state=inactive]:border-gray-700 data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-600',
                  'data-[state=completed]:border-emerald-500 data-[state=completed]:bg-emerald-500 data-[state=completed]:text-white',
                ].join(' ')}
              >
                {step.icon}
              </StepperIndicator>
              </div>

              <div className="flex flex-col items-start gap-1">
                <div className="text-[10px] font-semibold uppercase text-gray-500">
                  Step {index + 1}
                </div>
                <StepperTitle
                  className={[
                    'text-start text-sm font-semibold transition-colors duration-300',
                    'group-data-[state=inactive]/step:text-gray-500',
                    isError
                      ? 'group-data-[state=active]/step:text-red-400'
                      : 'group-data-[state=active]/step:text-primary-300',
                    'group-data-[state=completed]/step:text-gray-300',
                  ].join(' ')}
                >
                  {step.title}
                </StepperTitle>

                <div>
                  {/* Active step badge — switches between In Progress / Failed */}
                  {isError ? (
                    <StepBadge
                      variant="error-light"
                      size="sm"
                      className="hidden group-data-[state=active]/step:inline-flex"
                    >
                      Failed
                    </StepBadge>
                  ) : (
                    <StepBadge
                      variant="primary-light"
                      size="sm"
                      className="hidden group-data-[state=active]/step:inline-flex"
                    >
                      In Progress
                    </StepBadge>
                  )}
                  <StepBadge
                    variant="success-light"
                    size="sm"
                    className="hidden group-data-[state=completed]/step:inline-flex"
                  >
                    Completed
                  </StepBadge>
                  <StepBadge
                    variant="secondary"
                    size="sm"
                    className="hidden group-data-[state=inactive]/step:inline-flex"
                  >
                    Pending
                  </StepBadge>
                </div>
              </div>
            </StepperTrigger>

            {/* Connector line */}
            {ANALYSIS_STEPS.length > index + 1 && (
              <StepperSeparator
                className={[
                  'absolute inset-x-0 start-9 top-4 m-0',
                  'group-data-[orientation=horizontal]/stepper-nav:w-[calc(100%-1rem)]',
                  'group-data-[orientation=horizontal]/stepper-nav:flex-none',
                  'group-data-[state=completed]/step:bg-emerald-500',
                ].join(' ')}
              />
            )}
          </StepperItem>
        ))}
      </StepperNav>

      {/* Status panel below the steps */}
      <StepperPanel
        className={[
          'rounded-lg border px-4 py-2.5 text-xs',
          isError
            ? 'border-red-500/30 bg-red-500/10 text-red-400'
            : 'border-gray-800 bg-gray-800/40 text-gray-400',
        ].join(' ')}
      >
        {/* Running: show active step description */}
        {status === 'running' && ANALYSIS_STEPS.map((step, index) => (
          <StepperContent
            key={index}
            value={index + 1}
            className="flex items-center gap-2"
          >
            <LoaderCircle className="size-3 shrink-0 animate-spin text-primary-400" />
            <span>{step.content(reportCount)}</span>
          </StepperContent>
        ))}

        {/* Success: all steps done */}
        {status === 'success' && (
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="size-3 shrink-0" />
            <span>Analysis complete — verdicts ready.</span>
          </div>
        )}

        {/* Error / abort */}
        {status === 'error' && (
          <div className="flex items-center gap-2">
            <AlertCircle className="size-3 shrink-0" />
            <span>Analysis stopped — see the log for details.</span>
          </div>
        )}
      </StepperPanel>
    </Stepper>
  )
}

function StopConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/15">
            <Square className="h-4 w-4 fill-current text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-100">Stop Analysis?</h3>
            <p className="mt-0.5 text-sm text-gray-400">
              This will cancel the running analysis and mark the job as failed. This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
          >
            Keep Running
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
          >
            <Square className="h-3.5 w-3.5 fill-current" /> Stop Analysis
          </button>
        </div>
      </div>
    </div>
  )
}

// Collapse repeated sentences/lines inside an explanation string.
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

function ExplanationRow({ text }: { text: string }) {
  const cleaned = dedupeExplanation(text)
  return (
    <p className="text-sm text-gray-300 break-words mb-3">{cleaned}</p>
  )
}

function VerdictList({ verdicts }: { verdicts: RcaVerdict[] }) {
  const [filter, setFilter] = useState<string>('ALL')
  const [sortDesc, setSortDesc] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isFiltering, setIsFiltering] = useState(false)
  const filterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleFilterChange(cat: string) {
    if (cat === filter) return
    if (filterTimer.current) clearTimeout(filterTimer.current)
    setIsFiltering(true)
    setFilter(cat)
    filterTimer.current = setTimeout(() => setIsFiltering(false), 250)
  }

  // Dedup verdicts: same testCaseRunId or same category+platform+explanation
  const unique = verdicts.filter((v, idx, arr) => {
    const key = v.testCaseRunId ||
      `${v.category}|${v.platform}|${v.explanation.slice(0, 120)}`
    return arr.findIndex(u =>
      (u.testCaseRunId && u.testCaseRunId === v.testCaseRunId) ||
      (!v.testCaseRunId && `${u.category}|${u.platform}|${u.explanation.slice(0, 120)}` === key)
    ) === idx
  })

  async function handleCopyAll() {
    const text = unique
      .map((v, i) => `[${i + 1}] ${v.category} | ${v.platform} | ${(v.confidence * 100).toFixed(0)}% confidence\n${dedupeExplanation(v.explanation)}${v.matchedRule ? `\nRule: ${v.matchedRule}` : ''}`)
      .join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard denied */ }
  }

  const categories = ['ALL', ...Array.from(new Set(unique.map((v) => v.category)))]
  const base = filter === 'ALL' ? unique : unique.filter((v) => v.category === filter)
  const filtered = sortDesc ? [...base].sort((a, b) => b.confidence - a.confidence) : base
  const countFor = (cat: string) =>
    cat === 'ALL' ? unique.length : unique.filter((v) => v.category === cat).length

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="flex flex-wrap items-center gap-1.5 p-4 border-b border-gray-800">
        {categories.map((c) => {
          const isActive = filter === c
          const activeStyle =
            c === 'ALL'
              ? 'bg-primary-600 text-white border-primary-600'
              : (CATEGORY_STYLES[c as keyof typeof CATEGORY_STYLES] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30') +
                ' ring-1 ring-current'
          return (
            <button
              key={c}
              onClick={() => handleFilterChange(c)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
                isActive
                  ? activeStyle
                  : 'border-gray-700 bg-gray-800/60 text-gray-500 hover:border-gray-600 hover:text-gray-300'
              }`}
            >
              {c.replace(/_/g, ' ')}
              <span className={`rounded-full px-1 py-px text-[10px] font-semibold ${
                isActive ? 'bg-white/20' : 'bg-gray-700 text-gray-400'
              }`}>
                {countFor(c)}
              </span>
            </button>
          )
        })}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setSortDesc((p) => !p)}
            title={sortDesc ? 'Sorted by confidence (high → low)' : 'Sort by confidence'}
            className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${
              sortDesc
                ? 'border-primary-500/50 bg-primary-500/10 text-primary-400'
                : 'border-gray-700 bg-gray-800/60 text-gray-500 hover:border-gray-600 hover:text-gray-300'
            }`}
          >
            <ArrowUpDown className="h-3 w-3" />
            {sortDesc ? 'Confidence ↓' : 'Sort'}
          </button>
          <button
            onClick={handleCopyAll}
            title="Copy all verdicts to clipboard"
            className="flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800/60 px-2 py-0.5 text-xs font-medium text-gray-500 transition-colors hover:border-gray-600 hover:text-gray-300"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied!' : 'Copy all'}
          </button>
        </div>
      </div>

      {isFiltering ? (
        <div className="divide-y divide-gray-800">
          {Array.from({ length: Math.min(filtered.length || 3, 5) }).map((_, i) => (
            <div key={i} className="p-4 space-y-3">
              <div className="flex gap-2">
                <Shimmer className="h-5 w-24 rounded-full" />
                <Shimmer className="h-5 w-20 rounded-full" />
              </div>
              <Shimmer className="h-4 w-full rounded" />
              <Shimmer className="h-4 w-5/6 rounded" />
              <div className="flex items-center justify-between">
                <Shimmer className="h-3 w-28 rounded" />
                <Shimmer className="h-3 w-40 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="divide-y divide-gray-800">
        <VerdictsByRun verdicts={filtered}>{(runVerdicts) => <div className="divide-y divide-gray-800">{runVerdicts.map((v, i) => (
          <div key={i} className="p-4 hover:bg-gray-800/50 transition-colors">
            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge type="category" value={v.category} />
              <Badge type="platform" value={v.platform} />
              <ErrorCodeChip {...v} />
            </div>

            {/* Explanation */}
            <ExplanationRow text={v.explanation} />

            {/* Links row */}
            {(v.jiraUrl || v.reportUrl) && (
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {v.jiraUrl && (
                  <a
                    href={v.jiraUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {v.matchedJiraTicket ?? 'Jira Ticket'}
                  </a>
                )}
                {v.reportUrl && (
                  <a
                    href={v.reportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-primary-500/30 bg-primary-500/10 px-2.5 py-1 text-xs font-medium text-primary-400 transition-colors hover:bg-primary-500/20"
                  >
                    <FileText className="h-3 w-3" />
                    View Report
                  </a>
                )}
              </div>
            )}

            {/* Footer row */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {v.matchedRule && (
                <span className="text-xs text-gray-600 font-mono">Rule: {v.matchedRule}</span>
              )}
              <div className="w-40 ml-auto">
                <ConfidenceBar value={v.confidence} />
              </div>
            </div>
          </div>
        ))}</div>}</VerdictsByRun>
      </div>
      )}
    </div>
  )
}
