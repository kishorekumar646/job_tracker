// Author: Kishore Kumar
// Regression tab — pick a saved InspectorWeb run config, trigger it, follow the run live,
// and hand the finished run to the Analyze flow. See docs/regression-tab-plan.md.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTour } from '../tour/TourContext'
import { REGRESSION_MAINTENANCE } from '../utils/features'
import { MaintenanceModal } from '../components/ui/MaintenanceModal'
import { useManualRefresh } from '../hooks/useManualRefresh'
import { useMinBusy } from '../hooks/useMinBusy'
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Microscope,
  RefreshCw,
  Square,
  Trash2,
  X as XIcon,
} from 'lucide-react'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { InspectorWebStatus } from '../components/regression/InspectorWebStatus'
import { Button } from '../components/ui/Button'
import { Hint } from '../components/ui/Hint'
import { Shimmer } from '../components/ui/Shimmer'
import { RegressionPageSkeleton, RunCardSkeleton } from '../components/regression/skeletons'
import { useAuthStore } from '../store/authStore'
import { useModalEscape } from '../hooks/useModalEscape'
import { useRegressionRun } from '../hooks/useRegressionRun'
import { hasPermission, PERMISSIONS } from '../utils/permissions'
import { usernameOf } from '../utils/user'
import { Toast, useToast } from '../components/ui/Toast'
import { Counts, PhaseBadge, ProgressLine, UuidChip } from '../components/regression/shared'
import { RunTestCases } from '../components/regression/RunTestCases'
import { RunConfigWizard, WizardInitial } from '../components/regression/RunConfigWizard'
import { RunConfigList } from '../components/regression/RunConfigList'
import { SchedulesPanel } from '../components/regression/SchedulesPanel'
import {
  getRegressionMeta,
  listRegressionRuns,
  regressionErrorMessage,
  RegressionMeta,
  RegressionRun,
  RunConfigSummary,
  RunPhase,
  deleteRun,
  stopRun,
  triggerRun,
  TargetSelector,
} from '../api/regression'

const TERMINAL: RunPhase[] = ['done', 'aborted', 'failed']

function selectorText(group: TargetSelector[]): string {
  return group.map((s) => `${s.type}=${s.value}${s.regex ? ' (regex)' : ''}`).join(' · ')
}

function formatTimeout(ms: number | null): string {
  if (!ms) return '—'
  const min = Math.round(ms / 60000)
  return min >= 60 ? `${(min / 60).toFixed(min % 60 ? 1 : 0)} h` : `${min} min`
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

// ── Confirm modal ───────────────────────────────────────────────────────────

interface ConfirmProps {
  title: string
  body: React.ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}

function ConfirmModal({ title, body, confirmLabel, danger, busy, onConfirm, onClose }: ConfirmProps) {
  useModalEscape(onClose)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold text-gray-100">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-300">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 text-sm text-gray-300">{body}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Run card (right column) ─────────────────────────────────────────────────

interface RunCardProps {
  run: RegressionRun
  canStop: boolean
  onStop: (run: RegressionRun) => void
  /** Owner or admin, and the run is this app's record (not an InspectorWeb-only execution). */
  canDelete: boolean
  onDelete: (run: RegressionRun) => void
  onAnalyze: (runUuid: string) => void
  /** Ticked for "Batch Analyze" (finished runs of this app only). */
  selectable: boolean
  selected: boolean
  onSelect: () => void
  /** Only one run is expanded at a time — the page owns which one. */
  expanded: boolean
  onToggle: () => void
}

function RunCard({ run, canStop, onStop, canDelete, onDelete, onAnalyze, selectable, selected, onSelect, expanded, onToggle }: RunCardProps) {
  const storedTerminal = TERMINAL.includes(run.phase)
  // Poll while the run is live; for finished runs fetch once when expanded (targets).
  const { status, error, loading, refresh } = useRegressionRun(
    run.runUuid && (!storedTerminal || expanded) ? run.runUuid : null,
  )

  const manual = useManualRefresh(refresh)
  const phase = status?.phase ?? run.phase
  // Live runs update every 10 s in the background — shimmer the progress and counts then too.
  const autoBusy = useMinBusy(loading && !!status && !status.isTerminal)
  const refreshing = manual.refreshing || autoBusy
  const runInfo = status?.runInfo ?? run.runInfo
  const terminal = status ? status.isTerminal : storedTerminal
  const runError = status?.error ?? run.error
  const link = status?.inspectorwebUrl ?? run.inspectorwebUrl

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900">
      {/* Summary — sticks to the top of the runs panel while the expanded executions scroll under it. */}
      <div className={`rounded-t-xl bg-gray-900 p-4 ${expanded ? 'sticky top-0 z-10 border-b border-gray-800 shadow-[0_6px_12px_-6px_rgba(0,0,0,0.6)]' : 'rounded-b-xl'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
        {selectable && (
          <Hint text={selected ? 'Remove from the batch' : 'Tick to add to a Batch Analyze'} className="mt-0.5 shrink-0">
            <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${run.name} for batch analysis`} className="h-4 w-4" />
          </Hint>
        )}
        <button
          onClick={onToggle}
          className="flex min-w-0 items-start gap-2 text-left"
          aria-expanded={expanded}
        >
          {expanded
            ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
            : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-100" title={run.name}>{run.name}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {formatWhen(run.createdAt)} · {usernameOf(run.triggeredBy)}
              {run.scheduleUuid && (
                <Hint text="Started by one of your schedules" className="ml-1.5">
                  <span className="inline-flex items-center gap-1 rounded bg-primary-500/15 px-1.5 py-0.5 text-[10px] text-primary-200">
                    <CalendarClock className="h-3 w-3" /> Scheduled
                  </span>
                </Hint>
              )}
              {run.source === 'inspectorweb' && (
                <Hint text="Started in InspectorWeb, not from this app" className="ml-1.5">
                  <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">InspectorWeb</span>
                </Hint>
              )}
              {run.stoppedBy && <span className="text-amber-400"> · stop requested by {usernameOf(run.stoppedBy)}</span>}
            </p>
          </div>
        </button>
        </div>
        <PhaseBadge phase={phase} status={status?.status ?? run.status} />
      </div>

      <div className="mt-3 space-y-2 pl-6">
        {run.runUuid && <UuidChip label="Run UUID" uuid={run.runUuid} />}
        {refreshing ? (
          <div className="space-y-2" aria-busy="true" aria-label="Refreshing this run">
            {!terminal && <Shimmer className="h-1.5 w-full rounded-full" />}
            <div className="flex gap-3">
              <Shimmer className="h-3 w-16" />
              <Shimmer className="h-3 w-14" />
              <Shimmer className="h-3 w-24" />
            </div>
          </div>
        ) : (
          <>
            {status?.progress && <ProgressLine progress={status.progress} />}
            <Counts info={runInfo} live={!terminal} />
          </>
        )}
        {runError && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-red-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-words">{runError}</span>
          </p>
        )}
        {!run.runUuid && (
          <p className="mt-2 text-xs text-amber-400">
            InspectorWeb accepted the trigger but didn't return a run UUID. Find it in InspectorWeb.
          </p>
        )}
        {error && <p className="mt-2 text-xs text-amber-400">{error}</p>}
        {status?.source === 'snapshot' && (
          <p className="mt-2 text-xs text-gray-500">Showing the saved snapshot — InspectorWeb no longer has this run{status.warning ? ' or is unreachable' : ''}.</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-800"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open in InspectorWeb
            </a>
          )}
          {terminal && run.runUuid && (
            <Button size="sm" variant="secondary" icon={<Microscope className="h-3.5 w-3.5" />} onClick={() => onAnalyze(run.runUuid!)}>
              Analyze failures
            </Button>
          )}
          {!terminal && canStop && run.runUuid && (
            <Button size="sm" variant="danger" icon={<Square className="h-3.5 w-3.5" />} onClick={() => onStop(run)}>
              Stop
            </Button>
          )}
          <div className="ml-auto flex items-center gap-3">
            {run.runUuid && (
              <Hint text="Refresh this run now">
                <button
                  onClick={() => manual.refresh()}
                  disabled={loading || manual.refreshing}
                  aria-label="Refresh now"
                  className="text-gray-500 hover:text-gray-300 disabled:pointer-events-none disabled:opacity-40"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading || manual.refreshing ? 'animate-spin' : ''}`} />
                </button>
              </Hint>
            )}
            {canDelete && (
              <Hint
                text={!terminal && run.runUuid ? 'Still running — stop it first, then delete' : 'Delete this run'}
                className={!terminal && run.runUuid ? 'cursor-not-allowed' : ''}
              >
                <button
                  onClick={() => onDelete(run)}
                  disabled={!terminal && !!run.runUuid}
                  aria-label="Delete this run"
                  className="text-gray-500 hover:text-red-400 disabled:pointer-events-none disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </Hint>
            )}
          </div>
        </div>
      </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pl-10 pt-3">
          {manual.refreshing || (!status && loading) ? (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5 rounded-lg border border-gray-800 p-3">
                  <div className="flex items-center gap-2">
                    <Shimmer className="h-3.5 w-1/2" />
                    <Shimmer className="ml-auto h-5 w-16 rounded-full" />
                  </div>
                  <Shimmer className="h-2.5 w-1/3" />
                </div>
              ))}
            </div>
          ) : !status ? (
            <p className="text-xs text-gray-600">No details available.</p>
          ) : (
            <RunTestCases runUuid={status.runUuid} status={status} />
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

/** The Regression tab — or, while VITE_REGRESSION_MAINTENANCE is on, an "under maintenance" popup
 *  (admins can still open the page to check things). */
export function RegressionPage() {
  const navigate = useNavigate()
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')
  const [adminOverride, setAdminOverride] = useState(false)
  if (REGRESSION_MAINTENANCE && !adminOverride) {
    return (
      <DashboardLayout title="Regression">
        <MaintenanceModal
          title="Regression is under maintenance"
          onLeave={() => navigate('/dashboard')}
          extra={isAdmin && (
            <button onClick={() => setAdminOverride(true)} className="text-sm font-medium text-amber-300 hover:text-amber-200">
              Open anyway (admin)
            </button>
          )}
        >
          <p>The Regression tab is temporarily unavailable while we make improvements.</p>
          <p className="text-gray-500">Your run configs, schedules and results are kept. Meanwhile you can still analyse runs from the <span className="font-medium text-primary-400">Analyze</span> page.</p>
        </MaintenanceModal>
      </DashboardLayout>
    )
  }
  return <RegressionWorkspace />
}

function RegressionWorkspace() {
  const navigate = useNavigate()
  const { startTourIfNew } = useTour()
  // First load shows the page skeleton, the same way as Dashboard / Analyze (a short delay in dev).
  const [pageLoading, setPageLoading] = useState(import.meta.env.DEV)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const t = setTimeout(() => setPageLoading(false), Math.random() * 2000 + 3000)
    return () => clearTimeout(t)
  }, [])
  // First visits: show the page tour once the lists have had time to load (steps for
  // elements that aren't there, like an empty runs list, are skipped).
  useEffect(() => {
    if (pageLoading) return
    const t = setTimeout(() => startTourIfNew('regression'), 1500)
    return () => clearTimeout(t)
  }, [pageLoading, startTourIfNew])
  const user = useAuthStore((s) => s.user)
  const canRun = hasPermission(user, PERMISSIONS.regressionRun)
  const isAdmin = user?.role === 'admin'

  const [meta, setMeta] = useState<RegressionMeta | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)

  const inspectorUsername = user?.email.split('@')[0] ?? ''

  // Runs (right)
  // Run-config list reload key, and the wizard (new / edit / duplicate) when open.
  const [configsKey, setConfigsKey] = useState(0)
  const [editor, setEditor] = useState<{ key: number; initial?: WizardInitial } | null>(null)
  // Left panel: run configs or schedules (the run-config wizard opens over either).
  const [leftView, setLeftView] = useState<'configs' | 'schedules'>('configs')
  const [runs, setRuns] = useState<RegressionRun[]>([])
  const [runsLoading, setRunsLoading] = useState(true)
  // Finished runs ticked for "Batch Analyze".
  const [picked, setPicked] = useState<Set<string>>(new Set())
  // When set, the runs panel shows every execution of this run config instead of "My runs" / "Everyone".
  const [runsFor, setRunsFor] = useState<{ uuid: string; name: string } | null>(null)
  const { toast, visible: toastVisible, notify, dismiss: dismissToast } = useToast()
  // Accordion: expanding one run collapses the previously expanded one.
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null)
  const [runsError, setRunsError] = useState<string | null>(null)

  // Modals
  const [confirmRun, setConfirmRun] = useState<RunConfigSummary | null>(null)
  const [confirmStop, setConfirmStop] = useState<RegressionRun | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<RegressionRun | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [metaKey, setMetaKey] = useState(0)  // bump to retry the InspectorWeb connection
  useEffect(() => {
    setMetaError(null)
    getRegressionMeta()
      .then((m) => { setMeta(m); setMetaError(null) })
      .catch((err) => setMetaError(regressionErrorMessage(err, 'Could not reach InspectorWeb.')))
  }, [metaKey])

  // Your runs; admins can switch to everyone's (the server enforces the same rule).
  const [runsScope, setRunsScope] = useState<'me' | 'all'>('me')
  const loadRuns = useCallback(async () => {
    setRunsLoading(true)
    try {
      setRuns(await listRegressionRuns(runsFor?.uuid, isAdmin ? runsScope : 'me'))
      setRunsError(null)
    } catch (err) {
      setRunsError(regressionErrorMessage(err, 'Could not load runs.'))
    } finally {
      setRunsLoading(false)
    }
  }, [runsFor, runsScope, isAdmin])

  useEffect(() => { loadRuns() }, [loadRuns])
  const runsManual = useManualRefresh(loadRuns)

  async function doTrigger() {
    if (!confirmRun) return
    setActionBusy(true)
    setActionError(null)
    try {
      const run = await triggerRun(confirmRun.uuid)
      setConfirmRun(null)
      setRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)])
      notify(`Run started for “${confirmRun.name}”`)
    } catch (err) {
      const msg = regressionErrorMessage(err, 'Trigger failed.')
      setActionError(msg)
      notify(`Couldn't start “${confirmRun.name}”: ${msg}`, 'error')
    } finally {
      setActionBusy(false)
    }
  }

  async function doStop() {
    if (!confirmStop?.runUuid) return
    setActionBusy(true)
    setActionError(null)
    try {
      await stopRun(confirmStop.runUuid)
      notify(`Stop requested for “${confirmStop.name}”`)
      setConfirmStop(null)
      loadRuns()
    } catch (err) {
      setActionError(regressionErrorMessage(err, 'Stop failed.'))
    } finally {
      setActionBusy(false)
    }
  }

  async function doDelete() {
    if (!confirmDelete) return
    setActionBusy(true)
    setActionError(null)
    try {
      await deleteRun(confirmDelete.id)
      setRuns((prev) => prev.filter((r) => r.id !== confirmDelete.id))
      notify(`Run “${confirmDelete.name}” deleted`)
      setConfirmDelete(null)
    } catch (err) {
      setActionError(regressionErrorMessage(err, 'Delete failed.'))
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <DashboardLayout title="Regression">
      {/* Page fills the viewport; each panel keeps its header/footer fixed and scrolls its body. */}
      <div className="flex h-full min-h-0 flex-col">
      {/* InspectorWeb connection strip */}
      <div className="mb-5 flex shrink-0 flex-wrap items-center gap-2 text-xs">
        {meta ? (
          <InspectorWebStatus environment={meta.environment} version={meta.version} />
        ) : metaError ? (
          <span role="alert" className="inline-flex max-w-full items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-red-200">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
            <span><span className="font-semibold">InspectorWeb not reachable.</span> {metaError}</span>
            <button onClick={() => setMetaKey((k) => k + 1)} className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-md border border-red-500/40 px-2 py-0.5 font-medium text-red-200 hover:bg-red-500/20">
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </span>
        ) : (
          <Shimmer className="h-6 w-72 rounded-full" />
        )}
        {!canRun && (
          <span className="rounded-full bg-gray-800/60 px-3 py-1 text-gray-500">
            View only — ask an admin for “Regression: run” to trigger runs
          </span>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-5">
        {pageLoading ? <RegressionPageSkeleton /> : (<>
        {/* ── Left: saved suites ─────────────────────────────────────── */}
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
          {editor ? (
            <RunConfigWizard
              key={editor.key}
              meta={meta}
              inspectorUsername={inspectorUsername}
              initial={editor.initial}
              onCancel={() => setEditor(null)}
              onError={(msg) => notify(msg, 'error')}
              onSaved={(rc, run) => {
                const mode = editor.initial?.mode
                notify(run
                  ? `“${rc.name}” saved and run started`
                  : mode === 'edit' ? `Run config “${rc.name}” saved` : `Run config “${rc.name}” created`)
                setEditor(null)
                setConfigsKey((k) => k + 1)
                if (run) setRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)])
              }}
            />
          ) : leftView === 'schedules' ? (
            <SchedulesPanel
              canRun={canRun}
              inspectorUsername={inspectorUsername}
              onBack={() => setLeftView('configs')}
              onNotify={notify}
              onExecuted={() => setTimeout(loadRuns, 1500)}
            />
          ) : (
            <RunConfigList
              canRun={canRun}
              onSchedules={() => setLeftView('schedules')}
              username={inspectorUsername}
              refreshKey={configsKey}
              onNew={() => setEditor({ key: Date.now() })}
              onRun={(rc) => { setActionError(null); setConfirmRun(rc) }}
              onExecutions={(rc) => setRunsFor({ uuid: rc.uuid, name: rc.name })}
              onEdit={(raw) => setEditor({ key: Date.now(), initial: { mode: 'edit', raw } })}
              onDuplicate={(raw) => setEditor({ key: Date.now(), initial: { mode: 'duplicate', raw } })}
              onNotify={notify}
            />
          )}
        </section>

        {/* ── Right: runs ────────────────────────────────────────────── */}
        <section className="flex min-h-0 min-w-0 flex-col">
          <div className="mb-3 flex shrink-0 items-center justify-between" data-tour="tour-reg-runs">
            {runsFor ? (
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-xs text-gray-500">Executions of</span>
                <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-primary-500/15 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary-200 ring-1 ring-primary-500/40">
                  <span className="truncate" title={runsFor.name}>{runsFor.name}</span>
                  <Hint text="Back to your runs" className="shrink-0">
                    <button onClick={() => setRunsFor(null)} aria-label="Back to your runs" className="rounded-full p-0.5 hover:bg-primary-500/30">
                      <XIcon className="h-3 w-3" />
                    </button>
                  </Hint>
                </span>
              </div>
            ) : (
              isAdmin ? (
                <div role="radiogroup" aria-label="Whose runs" className="flex gap-1 rounded-lg bg-gray-800 p-0.5">
                  {([['me', 'My runs'], ['all', 'Everyone']] as const).map(([v, label]) => (
                    <button key={v} role="radio" aria-checked={runsScope === v} onClick={() => { setRunsScope(v); setPicked(new Set()) }}
                      className={`rounded-md px-3 py-1 text-xs font-medium ${runsScope === v ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <h2 className="text-sm font-semibold text-gray-100">My runs</h2>
              )
            )}
            <div className="flex items-center gap-3">
            {picked.size > 0 && (
              <>
                <button onClick={() => setPicked(new Set())} className="text-xs text-gray-400 hover:text-gray-200">Clear selection</button>
                <Hint text={`Open Batch Analysis with the ${picked.size} ticked run${picked.size === 1 ? '' : 's'} — runs analysed before reuse their stored verdicts`}>
                  <Button size="sm" variant="secondary" icon={<Microscope className="h-3.5 w-3.5" />} onClick={() => navigate('/analyze', { state: { batchRunUuids: [...picked] } })}>
                    Batch Analyze ({picked.size} run{picked.size === 1 ? '' : 's'})
                  </Button>
                </Hint>
              </>
            )}
            <Hint text="Refresh runs">
              <button onClick={() => runsManual.refresh()} aria-label="Refresh runs" className="text-gray-500 hover:text-gray-300">
                <RefreshCw className={`h-4 w-4 ${runsLoading || runsManual.refreshing ? 'animate-spin' : ''}`} />
              </button>
            </Hint>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {runsError ? (
            <p className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-red-400">{runsError}</p>
          ) : (runsLoading && runs.length === 0) || runsManual.refreshing ? (
            Array.from({ length: Math.min(Math.max(runs.length, 3), 5) }).map((_, i) => <RunCardSkeleton key={i} />)
          ) : runs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-800 p-8 text-center text-sm text-gray-500">
              {runsFor ? 'No executions of this run config yet.' : 'No regression runs triggered from here yet.'}
            </div>
          ) : (
            runs.map((r, i) => (
              <div key={r.id} data-tour={i === 0 ? 'tour-reg-run-card' : undefined}>
              <RunCard
                run={r}
                canStop={canRun && (isAdmin || r.triggeredBy === user?.email)}
                onStop={(run) => { setActionError(null); setConfirmStop(run) }}
                canDelete={r.source !== 'inspectorweb' && (isAdmin || r.triggeredBy === user?.email)}
                expanded={expandedRunId === r.id}
                onToggle={() => setExpandedRunId((cur) => (cur === r.id ? null : r.id))}
                onDelete={(run) => { setActionError(null); setConfirmDelete(run) }}
                onAnalyze={(runUuid) => navigate('/analyze', { state: { runUuid } })}
                selectable={!!r.runUuid && r.source !== 'inspectorweb' && TERMINAL.includes(r.phase)}
                selected={!!r.runUuid && picked.has(r.runUuid)}
                onSelect={() => r.runUuid && setPicked((p) => { const n = new Set(p); if (n.has(r.runUuid!)) n.delete(r.runUuid!); else n.add(r.runUuid!); return n })}
              />
              </div>
            ))
          )}
          </div>
        </section>
        </>)}
      </div>

      {confirmRun && (
        <ConfirmModal
          title="Start regression run?"
          confirmLabel="Run"
          busy={actionBusy}
          onClose={() => setConfirmRun(null)}
          onConfirm={doTrigger}
          body={
            <>
              <p>
                <span className="font-semibold text-gray-100">{confirmRun.name}</span> will be executed on InspectorWeb
                {meta?.environment && <> ({meta.environment})</>} as{' '}
                <span className="font-mono text-gray-100">{user?.email.split('@')[0]}</span>.
              </p>
              {confirmRun.targets.length > 0 && (
                <div>
                  <p className="mb-1 text-xs text-gray-500">It will lock lab devices matching:</p>
                  {confirmRun.targets.map((g, i) => (
                    <p key={i} className="break-words font-mono text-[11px] text-gray-300">{selectorText(g)}</p>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500">Timeout {formatTimeout(confirmRun.timeOut)}. Other teams can't use those devices while the run holds them.</p>
              {actionError && <p className="text-xs text-red-400 break-words">{actionError}</p>}
            </>
          }
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete this run?"
          confirmLabel="Delete"
          danger
          busy={actionBusy}
          onClose={() => setConfirmDelete(null)}
          onConfirm={doDelete}
          body={
            <>
              <p>
                <span className="font-semibold text-gray-100">{confirmDelete.name}</span> will be removed from your run lists here.
              </p>
              {confirmDelete.runUuid && <p className="font-mono text-[11px] text-gray-500">{confirmDelete.runUuid}</p>}
              <p className="text-xs text-gray-500">The execution, its reports and logs stay in InspectorWeb.</p>
              {actionError && <p className="text-xs text-red-400 break-words">{actionError}</p>}
            </>
          }
        />
      )}

      {confirmStop && (
        <ConfirmModal
          title="Stop this run?"
          confirmLabel="Stop run"
          danger
          busy={actionBusy}
          onClose={() => setConfirmStop(null)}
          onConfirm={doStop}
          body={
            <>
              <p>
                InspectorWeb will stop <span className="font-semibold text-gray-100">{confirmStop.name}</span> and every target in it.
              </p>
              <p className="font-mono text-[11px] text-gray-500">{confirmStop.runUuid}</p>
              {actionError && <p className="text-xs text-red-400 break-words">{actionError}</p>}
            </>
          }
        />
      )}
      </div>
      <Toast toast={toast} visible={toastVisible} onClose={dismissToast} />
    </DashboardLayout>
  )
}
