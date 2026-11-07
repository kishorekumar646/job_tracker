// Author: Kishore Kumar
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Search,
  Layers,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  Clock,
  ArrowRight,
  Database,
  GitBranch,
  Ticket,
  ServerCrash,
  CalendarDays,
  X,
  Globe,
  WifiOff,
  ExternalLink,
  FileText,
  Copy,
  Check,
} from 'lucide-react'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { useTour } from '../tour/TourContext'
import { StatCard } from '../components/ui/StatCard'
import { Shimmer } from '../components/ui/Shimmer'
import { Badge } from '../components/ui/Badge'
import { ErrorCodeChip } from '../components/ui/ErrorCodeChip'
import { CategoryDonutChart } from '../components/charts/CategoryDonutChart'
import { PlatformBarChart } from '../components/charts/PlatformBarChart'
import { VerdictTrendChart } from '../components/charts/VerdictTrendChart'
import { ConfidenceBar } from '../components/charts/ConfidenceBar'
import { getDashboardStats, getHistory } from '../api/rca'
import { DashboardStats, StoredAnalysis } from '../types'
import { useAuthStore } from '../store/authStore'
import { hasPermission, PERMISSIONS } from '../utils/permissions'
import { RegressionDashboardSection } from '../components/regression/RegressionDashboardSection'
import { useHealthStore } from '../store/healthStore'
import { toDateStr, nowHour } from '../utils/date'
import { useLivePoll } from '../hooks/useLivePoll'


function buildTrendData(history: StoredAnalysis[], startDate: string, endDate: string, extraByDay: Record<string, number> = {}) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const days: string[] = []
  const cur = new Date(start)
  while (cur <= end) {
    days.push(toDateStr(cur))
    cur.setDate(cur.getDate() + 1)
  }
  // Cap at 60 days to avoid an unreadable axis
  const window = days.length > 60 ? days.slice(-60) : days
  const counts = history.reduce<Record<string, number>>((acc, a) => {
    const day = a.timestamp.split('T')[0]
    acc[day] = (acc[day] ?? 0) + a.verdictCount
    return acc
  }, { ...extraByDay })
  return window.map((day) => ({
    date: day.slice(5).replace('-', '/'),
    verdicts: counts[day] ?? 0,
  }))
}

const SERVICE_META = {
  odh: { label: 'ODH / Elasticsearch', description: 'Failure record source', icon: Database },
  jira: { label: 'Jira Injector', description: 'Known-issue cross-reference', icon: Ticket },
  rabbitmq: { label: 'RabbitMQ', description: 'Verdict publishing pipeline', icon: GitBranch },
  inspectorweb: { label: 'InspectorWeb', description: 'Test execution data — requires VPN', icon: Globe },
} as const

type ServiceKey = keyof typeof SERVICE_META

const INPUT_CLS =
  'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 ' +
  '[color-scheme:dark] placeholder-gray-600 ' +
  'focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 ' +
  'transition-colors'

const PRESETS = [
  { label: 'Today',        days: 0  },
  { label: 'Past 2 days',  days: 1  },
  { label: 'Past 7 days',  days: 6  },
  { label: 'Past 30 days', days: 29 },
  { label: 'Past 3 months',days: 89 },
] as const

export function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { startTourIfNew } = useTour()
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null)
  const { health, loading: healthLoading, error: healthError, lastChecked: healthLastUpdated } = useHealthStore()
  const [pageLoading, setPageLoading] = useState(true)
  const [history, setHistory] = useState<StoredAnalysis[]>([])
  const [historyError, setHistoryError] = useState(false)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState(false)
  const [statsLastUpdated, setStatsLastUpdated] = useState<Date | null>(null)
  const [updateAge, setUpdateAge] = useState<string>('')
  const [refreshKey, setRefreshKey] = useState(0)

  const defaultEnd = toDateStr(new Date())
  const defaultStart = toDateStr(new Date(Date.now() - 6 * 86_400_000))

  // Input state — what the user has typed/picked but not yet applied
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)

  // Applied state — what actually drives all dashboard data
  const [appliedStart, setAppliedStart] = useState(defaultStart)
  const [appliedEnd, setAppliedEnd] = useState(defaultEnd)

  const isDirty = startDate !== appliedStart || endDate !== appliedEnd
  const isFiltered = appliedStart !== defaultStart || appliedEnd !== defaultEnd

  const today = toDateStr(new Date())
  const activePreset = (() => {
    if (appliedEnd !== today) return null
    const diff = Math.round((new Date(today).getTime() - new Date(appliedStart).getTime()) / 86_400_000)
    return PRESETS.find((p) => p.days === diff) ?? null
  })()

  const rangeLabel = (() => {
    if (activePreset) return `Showing ${activePreset.label.toLowerCase()}`
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    return `Showing ${fmt(appliedStart)} – ${fmt(appliedEnd)}`
  })()

  useEffect(() => {
    // 3–5 second page-load shimmer in dev; instant in production
    if (import.meta.env.DEV) {
      const delay = Math.random() * 2000 + 3000
      const t = setTimeout(() => {
        setPageLoading(false)
        startTourIfNew('dashboard')
      }, delay)
      return () => clearTimeout(t)
    } else {
      setPageLoading(false)
      startTourIfNew('dashboard')
    }
  }, [])


  useEffect(() => {
    getHistory().then((data) => { setHistory(data); setHistoryError(false) }).catch(() => setHistoryError(true))
  }, [])

  useEffect(() => {
    setStatsLoading(true)
    getDashboardStats(appliedStart, appliedEnd)
      .then((data) => { setStats(data); setStatsError(false); setStatsLastUpdated(new Date()) })
      .catch(() => setStatsError(true))
      .finally(() => setStatsLoading(false))
  }, [appliedStart, appliedEnd, refreshKey])

  // Quietly pick up new analyses every 60 s (no skeletons — the numbers just update)
  useLivePoll(async () => {
    try {
      const [h, s] = await Promise.all([getHistory(), getDashboardStats(appliedStart, appliedEnd)])
      setHistory(h); setHistoryError(false)
      setStats(s); setStatsError(false); setStatsLastUpdated(new Date())
    } catch { /* keep what's shown */ }
  }, 60_000, !statsLoading)

  // Keep "X min ago" label fresh without re-fetching
  useEffect(() => {
    if (!statsLastUpdated) return
    function tick() {
      if (!statsLastUpdated) return
      const s = Math.floor((Date.now() - statsLastUpdated.getTime()) / 1000)
      setUpdateAge(s < 60 ? 'just now' : `${Math.floor(s / 60)}m ago`)
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [statsLastUpdated])

  const filteredHistory = useMemo(
    () =>
      history.filter((a) => {
        const day = a.timestamp.split('T')[0]
        return day >= appliedStart && day <= appliedEnd
      }),
    [history, appliedStart, appliedEnd]
  )

  const categoryTotals = stats?.categoryBreakdown ?? {}
  const platformTotals = stats?.platformBreakdown ?? {}
  const totalVerdicts = stats?.totalVerdicts ?? 0
  const knownIssueCount = stats?.knownIssueCount ?? 0
  const platformCount = Object.keys(platformTotals).length
  const recentVerdicts = stats?.recentVerdicts ?? []
  const recentJobs = [...history]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 9)
  const autoRuns = stats?.autoAnalysedRuns ?? 0
  const trendData = useMemo(
    () => buildTrendData(filteredHistory, appliedStart, appliedEnd, stats?.autoVerdictsByDay),
    [filteredHistory, appliedStart, appliedEnd, stats]
  )

  const downServices: ServiceKey[] = health
    ? (Object.keys(SERVICE_META) as ServiceKey[]).filter((k) => !health[k])
    : []

  const hour = nowHour()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  function applyFilters() {
    setAppliedStart(startDate)
    setAppliedEnd(endDate)
  }

  function applyPreset(days: number) {
    const end = toDateStr(new Date())
    const start = toDateStr(new Date(Date.now() - days * 86_400_000))
    setStartDate(start)
    setEndDate(end)
    setAppliedStart(start)
    setAppliedEnd(end)
  }

  function clearFilters() {
    setStartDate(defaultStart)
    setEndDate(defaultEnd)
    setAppliedStart(defaultStart)
    setAppliedEnd(defaultEnd)
  }

  function copyJobId(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(id).then(() => {
      setCopiedJobId(id)
      setTimeout(() => setCopiedJobId(null), 1500)
    }).catch(() => {})
  }

  function fmtTimestamp(ts: string) {
    const d = new Date(ts)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) +
      ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <DashboardLayout title="Dashboard">
      {/* Greeting + Date filters */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        {/* Greeting */}
        <div>
          <h2 className="text-xl font-semibold text-gray-100">
            {greeting}, {user?.full_name?.trim() || user?.email?.split('@')[0]} 👋
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-gray-500">
            Here's your RCA system overview.{' '}
            <span className="text-primary-400">{rangeLabel}</span>
            {statsLastUpdated && !statsLoading && (
              <>
                <span className="text-gray-700">·</span>
                <span className="text-gray-600">Updated {updateAge}</span>
                <button
                  onClick={() => setRefreshKey((k) => k + 1)}
                  title="Refresh dashboard data"
                  className="text-gray-600 transition-colors hover:text-primary-400"
                >
                  ↻
                </button>
              </>
            )}
            {statsLoading && statsLastUpdated && (
              <>
                <span className="text-gray-700">·</span>
                <span className="text-gray-600">Refreshing…</span>
              </>
            )}
          </p>
        </div>

        {/* Date filters — top right */}
        <div className="flex flex-col items-end gap-2" data-tour="tour-date-filter">
          {/* Preset chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => {
              const isActive = activePreset?.label === p.label
              return (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p.days)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'border border-gray-700 text-gray-400 hover:border-primary-500 hover:text-primary-300'
                  }`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          {/* Custom range row */}
          <div className="flex items-end gap-3">
            {/* Start Date */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-400">
                <CalendarDays className="h-3.5 w-3.5 text-primary-400" />
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={INPUT_CLS}
              />
            </div>

            <div className="pb-2.5 text-xs text-gray-600">—</div>

            {/* End Date */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-400">
                <CalendarDays className="h-3.5 w-3.5 text-primary-400" />
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={toDateStr(new Date())}
                onChange={(e) => setEndDate(e.target.value)}
                className={INPUT_CLS}
              />
            </div>

            {/* Apply button — visible when input differs from applied */}
            {isDirty && (
              <button
                onClick={applyFilters}
                className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-500"
              >
                Apply
              </button>
            )}

            {/* Clear button — visible after a non-default range has been applied */}
            {isFiltered && !isDirty && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Data fetch errors */}
      {(historyError || statsError) && !pageLoading && !statsLoading && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Failed to load data. Please refresh.
        </div>
      )}

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="tour-stats">
        {pageLoading || statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              title="Total Analyses"
              value={filteredHistory.length + autoRuns}
              subtitle={autoRuns ? `In selected range · incl. ${autoRuns} auto-analysed run${autoRuns === 1 ? '' : 's'}` : 'In selected range'}
              icon={<BarChart3 className="h-5 w-5" />}
              color="indigo"
            />
            <StatCard
              title="Verdicts Issued"
              value={totalVerdicts}
              subtitle="Across filtered jobs"
              icon={<Search className="h-5 w-5" />}
              color="cyan"
            />
            <StatCard
              title="Platforms Seen"
              value={platformCount || '—'}
              subtitle="Unique platforms"
              icon={<Layers className="h-5 w-5" />}
              color="amber"
            />
            <StatCard
              title="Known Issues"
              value={knownIssueCount}
              subtitle="Jira-linked failures"
              icon={<AlertTriangle className="h-5 w-5" />}
              color="rose"
            />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3" data-tour="tour-charts">
        {pageLoading || statsLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <Shimmer className="mb-4 h-4 w-36 rounded" />
              <Shimmer className="h-48 w-full rounded-lg" />
            </div>
          ))
        ) : (
          <>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-300">Failure Categories</h3>
              {totalVerdicts > 0 ? (
                <CategoryDonutChart data={categoryTotals} />
              ) : (
                <EmptyChart label="No data in selected range" />
              )}
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-300">Platform Distribution</h3>
              {totalVerdicts > 0 ? (
                <PlatformBarChart data={platformTotals} />
              ) : (
                <EmptyChart label="No data in selected range" />
              )}
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h3 className="mb-1 text-sm font-semibold text-gray-300">Verdict Activity</h3>
              <p className="mb-3 text-xs text-gray-600">
                {appliedStart.slice(5).replace('-', '/')} – {appliedEnd.slice(5).replace('-', '/')}
              </p>
              <VerdictTrendChart data={trendData} />
            </div>
          </>
        )}
      </div>

      {/* Regression — runs, schedules and analysis coverage from the Regression tab */}
      {hasPermission(user, PERMISSIONS.regressionView) && (
        <RegressionDashboardSection fromDate={appliedStart} toDate={appliedEnd} refreshKey={refreshKey} pageLoading={pageLoading} />
      )}

      {/* Service Health */}
      <div className="mb-6" data-tour="tour-service-health">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-300">Service Health</h3>
            {healthLastUpdated && !healthLoading && (
              <span className="text-[10px] text-gray-600">
                · updated {healthLastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>
          {!pageLoading && !healthLoading && health && (
            <span
              className={`flex items-center gap-1.5 text-xs font-medium ${
                downServices.length === 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {downServices.length === 0 ? (
                <><CheckCircle2 className="h-3.5 w-3.5" /> All systems operational</>
              ) : (
                <><ServerCrash className="h-3.5 w-3.5" />{downServices.length} service{downServices.length > 1 ? 's' : ''} down</>
              )}
            </span>
          )}
        </div>

        {pageLoading || healthLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-center gap-4">
                  <Shimmer className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Shimmer className="h-3.5 w-32 rounded" />
                    <Shimmer className="h-3 w-24 rounded" />
                  </div>
                  <Shimmer className="h-4 w-10 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {healthError && (
              <div className="mb-3 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                <WifiOff className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-400">Backend unreachable</p>
                  <p className="text-xs text-red-400/80 mt-0.5">Please check your VPN status and try again.</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(SERVICE_META) as ServiceKey[]).map((key) => (
                <ServiceHealthCard key={key} serviceKey={key} ok={healthError ? false : (health?.[key] ?? false)} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 lg:col-span-2" data-tour="tour-recent">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300">Recent Verdicts</h3>
            {!pageLoading && (
              <button
                onClick={() => navigate('/analyze')}
                className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300"
              >
                New analysis <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
          {pageLoading || statsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg bg-gray-800/50 p-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <Shimmer className="h-5 w-20 rounded-full" />
                      <Shimmer className="h-5 w-16 rounded-full" />
                    </div>
                    <Shimmer className="h-3 w-3/4 rounded" />
                  </div>
                  <Shimmer className="h-4 w-24 rounded-full" />
                </div>
              ))}
            </div>
          ) : recentVerdicts.length > 0 ? (
            <div className="space-y-3">
              {recentVerdicts.map((v, i) => (
                <div key={i} className="rounded-lg bg-gray-800/50 p-3 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge type="category" value={v.category} />
                        <Badge type="platform" value={v.platform} />
                        <ErrorCodeChip {...v} />
                      </div>
                      <p className="text-xs text-gray-400 line-clamp-2">{v.explanation}</p>
                    </div>
                    <div className="w-24 shrink-0">
                      <ConfidenceBar value={v.confidence} />
                    </div>
                  </div>
                  {(v.jiraUrl || v.reportUrl) && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {v.jiraUrl && (
                        <a
                          href={v.jiraUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          {v.matchedJiraTicket ?? 'Jira'}
                        </a>
                      )}
                      {v.reportUrl && (
                        <a
                          href={v.reportUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-md border border-primary-500/30 bg-primary-500/10 px-2 py-0.5 text-[10px] font-medium text-primary-400 transition-colors hover:bg-primary-500/20"
                        >
                          <FileText className="h-2.5 w-2.5" />
                          View Report
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyChart label="No verdicts in selected range." />
          )}
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-300">Recent Jobs</h3>
          {pageLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2">
                  <Shimmer className="h-3.5 w-3.5 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <Shimmer className="h-3 w-full rounded" />
                    <Shimmer className="h-2.5 w-28 rounded" />
                  </div>
                  <Shimmer className="h-5 w-14 rounded-full" />
                </div>
              ))}
            </div>
          ) : recentJobs.length > 0 ? (
            <div className="space-y-2">
              {recentJobs.map((j) => {
                const displayId = j.jobId ?? j.runUuid ?? j.id
                const isCopied = copiedJobId === displayId
                return (
                  <div
                    key={j.id}
                    className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-gray-800 cursor-pointer"
                    onClick={() => j.jobId && navigate(`/jobs/${j.jobId}`)}
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs text-gray-400">{displayId}</p>
                        {j.status !== 'FAILED' && j.status !== 'STOPPED' && (
                          <button
                            onClick={(e) => copyJobId(displayId, e)}
                            title="Copy job ID"
                            className="shrink-0 rounded p-0.5 text-gray-600 opacity-0 transition-all group-hover:opacity-100 hover:bg-gray-700 hover:text-gray-300"
                          >
                            {isCopied
                              ? <Check className="h-3 w-3 text-emerald-400" />
                              : <Copy className="h-3 w-3" />}
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-600">
                        {fmtTimestamp(j.timestamp)} · {j.verdictCount} verdict{j.verdictCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <Badge type="status" value={j.status} />
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-600">No jobs in selected range.</p>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}

function ServiceHealthCard({ serviceKey, ok }: { serviceKey: ServiceKey; ok: boolean }) {
  const { label, description, icon: Icon } = SERVICE_META[serviceKey]

  if (ok) {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
          <Icon className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-200">{label}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-xs font-medium text-emerald-400">Online</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 ring-1 ring-red-500/20">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/20">
        <Icon className="h-5 w-5 text-red-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-red-300">{label}</p>
        <p className="text-xs text-red-400/70">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        <span className="text-xs font-semibold text-red-400">Offline</span>
      </div>
    </div>
  )
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-800">
      <MinusCircle className="h-8 w-8 text-gray-700" />
      <p className="max-w-[200px] text-center text-xs text-gray-600">{label}</p>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-4 flex items-center justify-between">
        <Shimmer className="h-4 w-28" />
        <Shimmer className="h-8 w-8 rounded-lg" />
      </div>
      <Shimmer className="mb-2 h-8 w-20" />
      <Shimmer className="h-3 w-24" />
    </div>
  )
}
