// Author: Kishore Kumar
// Dashboard "Regression" section: runs started from this app in the Dashboard's date range (summary
// cards, runs per day, analysis coverage), runs in progress with live progress, and the user's
// schedules. Data comes from this app's database (GET /regression/dashboard); only the live progress
// of running runs asks InspectorWeb, the same way the Regression tab does.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock, FlaskConical, Microscope, PlayCircle, XCircle } from 'lucide-react'
import { getRegressionDashboard, regressionErrorMessage, RegressionDashboard } from '../../api/regression'
import { useRegressionRun } from '../../hooks/useRegressionRun'
import { useMinBusy } from '../../hooks/useMinBusy'
import { useAuthStore } from '../../store/authStore'
import { usernameOf } from '../../utils/user'
import { StatCard } from '../ui/StatCard'
import { Shimmer } from '../ui/Shimmer'
import { Badge } from '../ui/Badge'
import { Hint } from '../ui/Hint'
import { PhaseBadge, ProgressLine } from './shared'
import type { RcaCategory } from '../../types'

const BAR_COLORS = { passed: '#10b981', failed: '#f43f5e', aborted: '#f59e0b', running: '#6366f1' }

const card = 'rounded-xl border border-gray-800 bg-gray-900 p-5'

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Same skeleton as the Dashboard's own stat cards. */
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

/** A list placeholder: a few title + subtitle rows. */
function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Shimmer className="h-3.5 w-3/4" />
          <Shimmer className="h-2.5 w-1/3" />
        </div>
      ))}
    </div>
  )
}

function RunsChart({ data }: { data: RegressionDashboard['byDay'] }) {
  const window = data.length > 60 ? data.slice(-60) : data
  if (!window.some((d) => d.passed + d.failed + d.aborted + d.running > 0)) {
    return <div className="flex h-56 items-center justify-center text-sm text-gray-500">No runs in the selected range</div>
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={window.map((d) => ({ ...d, label: d.date.slice(5).replace('-', '/') }))} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: '#e5e7eb' }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} iconType="circle" iconSize={8} />
        {(['passed', 'failed', 'aborted', 'running'] as const).map((k) => (
          <Bar key={k} dataKey={k} name={k[0].toUpperCase() + k.slice(1)} stackId="runs" fill={BAR_COLORS[k]} maxBarSize={28} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** One running run with live progress (polled like the Regression tab's run cards). */
function RunningRow({ run }: { run: RegressionDashboard['running'][number] }) {
  const { status, loading } = useRegressionRun(run.runUuid)
  const updating = useMinBusy(loading && !!status && !status.isTerminal)  // every-10 s update
  return (
    <li className="space-y-1.5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm text-gray-100" title={run.name}>{run.name}</span>
          {run.scheduleUuid && <Hint text="Started by a schedule" className="shrink-0"><CalendarClock className="h-3.5 w-3.5 text-primary-300" /></Hint>}
        </span>
        <PhaseBadge phase={status?.phase ?? run.phase} status={status?.status} />
      </div>
      {updating ? <Shimmer className="h-1.5 w-full rounded-full" /> : status?.progress && <ProgressLine progress={status.progress} />}
      <p className="text-[11px] text-gray-500">{usernameOf(run.triggeredBy)} · started {when(run.createdAt)}</p>
    </li>
  )
}

interface Props {
  fromDate: string
  toDate: string
  /** Bump to reload with the rest of the Dashboard. */
  refreshKey: number
  /** The Dashboard's own first-load shimmer — show this section's skeleton meanwhile. */
  pageLoading?: boolean
}

export function RegressionDashboardSection({ fromDate, toDate, refreshKey, pageLoading = false }: Props) {
  const navigate = useNavigate()
  // Everyone sees their own runs; only admins can switch to everyone's (the server enforces it too).
  const isAdmin = useAuthStore((st) => st.user?.role === 'admin')
  const [scope, setScope] = useState<'me' | 'all'>('me')
  const [data, setData] = useState<RegressionDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getRegressionDashboard(fromDate, toDate, scope)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((err) => { if (!cancelled) setError(regressionErrorMessage(err, 'Could not load the regression summary.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fromDate, toDate, scope, refreshKey])

  const skeleton = pageLoading || (loading && !data)
  const s = data?.summary
  const cov = data?.coverage
  const covPct = cov && cov.finished ? Math.round((cov.analysed / cov.finished) * 100) : 0

  return (
    <section className="mb-6" data-tour="tour-regression">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary-400" />
          <h3 className="text-sm font-semibold text-gray-300">Regression</h3>
          <span className="text-xs text-gray-600">{scope === 'all' ? "everyone's runs from this app" : 'your runs from this app'}</span>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <div role="radiogroup" aria-label="Whose runs" className="flex gap-1 rounded-lg border border-gray-800 bg-gray-900 p-0.5">
              {([['me', 'My runs'], ['all', 'Everyone']] as const).map(([v, label]) => (
                <button key={v} role="radio" aria-checked={scope === v} onClick={() => setScope(v)}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${scope === v ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => navigate('/regression')} className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300">
            Open Regression <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {error && !skeleton ? (
        <p className={`${card} text-sm text-red-400`}>{error}</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {skeleton ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />) : s && (
              <>
                <StatCard title="Runs" value={s.runs}
                  subtitle={s.running ? `${s.running} still running` : 'In selected range'}
                  hint={scope === 'all'
                    ? "Runs started from the Regression tab or its schedules in the selected dates, by everyone."
                    : 'Runs you started from the Regression tab or your schedules in the selected dates.'}
                  icon={<PlayCircle className="h-5 w-5" />} color="indigo" />
                <StatCard title="Failed Runs" value={s.failed}
                  subtitle={`${s.failedRunTests} failed test${s.failedRunTests === 1 ? '' : 's'} in these runs`}
                  hint="Runs that finished but had at least one failed test (or a test with no result). The line below adds up the failed tests in those runs."
                  icon={<XCircle className="h-5 w-5" />} color="rose" />
                <StatCard title="Aborted Runs" value={s.aborted}
                  subtitle={s.abortedRunTests ? `${s.abortedRunTests} failed test${s.abortedRunTests === 1 ? '' : 's'} before stopping` : 'Stopped before finishing'}
                  hint="Runs that didn't finish: InspectorWeb stopped them (e.g. the run config's time limit, or no free device) or someone pressed Stop. Some keep partial results."
                  icon={<AlertTriangle className="h-5 w-5" />} color="amber" />
                <StatCard title="Test Pass Rate" value={s.passRate == null ? '—' : `${s.passRate}%`}
                  subtitle={`${s.testsPassed} passed of ${s.testsPassed + s.testsFailed}`}
                  hint="Passed tests ÷ (passed + failed tests) across all runs in the range. Skipped tests and tests with no result aren't counted."
                  icon={<CheckCircle2 className="h-5 w-5" />} color="emerald" />
              </>
            )}
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Runs over time */}
            <div className={`${card} lg:col-span-2`}>
              <h4 className="mb-1 text-sm font-semibold text-gray-300">Runs Over Time</h4>
              <p className="mb-3 text-xs text-gray-600">Per day, by result</p>
              {skeleton ? <Shimmer className="h-56 w-full rounded-lg" /> : data && <RunsChart data={data.byDay} />}
            </div>

            {/* Running now */}
            <div className={card}>
              <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-300">
                Running Now
                {data && data.running.length > 0 && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />}
              </h4>
              <p className="mb-2 text-xs text-gray-600">Live progress</p>
              {skeleton ? <SkeletonRows rows={3} /> : data && data.running.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-500">Nothing running right now.</p>
              ) : data && (
                <ul className="divide-y divide-gray-800">{data.running.map((r) => <RunningRow key={r.runUuid} run={r} />)}</ul>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Schedules */}
            <div className={card}>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-300">My Schedules</h4>
                {data && (
                  <span className="text-xs text-gray-500">
                    {data.schedules.enabled} of {data.schedules.total} enabled{data.schedules.running ? ` · ${data.schedules.running} running` : ''}
                  </span>
                )}
              </div>
              {skeleton ? <SkeletonRows rows={3} /> : data && (
                data.schedules.total === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-500">No schedules yet — create one from the Regression tab.</p>
                ) : (
                  <div className="space-y-3">
                    {data.schedules.attention.length > 0 && (
                      <ul className="space-y-1">
                        {data.schedules.attention.map((a) => (
                          <li key={a.uuid} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                            <span><span className="font-semibold">{a.name}</span>{a.reason ? ` — ${a.reason}` : ''}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div>
                      <p className="mb-1 text-xs font-medium text-gray-500">Next starts</p>
                      {data.schedules.upcoming.length === 0 ? (
                        <p className="text-xs text-gray-500">No upcoming cron starts.</p>
                      ) : (
                        <ul className="divide-y divide-gray-800">
                          {data.schedules.upcoming.map((u) => (
                            <li key={`${u.uuid}-${u.at}`} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                              <span className="truncate text-gray-200" title={u.name}>{u.name}</span>
                              <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-gray-400"><Clock className="h-3 w-3" /> {when(u.at)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Analysis coverage */}
            <div className={card}>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-300">Analysis Coverage</h4>
                {cov && cov.waiting > 0 && (
                  <button onClick={() => navigate('/analyze')} className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300">
                    <Microscope className="h-3.5 w-3.5" /> Batch analysis
                  </button>
                )}
              </div>
              {skeleton ? (
                <div className="space-y-4">
                  <Shimmer className="h-5 w-1/2" />
                  <Shimmer className="h-2 w-full rounded-full" />
                  <SkeletonRows rows={2} />
                </div>
              ) : cov && (
                cov.finished === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-500">No finished runs in the selected range.</p>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between text-xs">
                        <span className="text-gray-400"><span className="text-lg font-bold tabular-nums text-gray-100">{cov.analysed}</span> of {cov.finished} finished runs analysed</span>
                        <span className="tabular-nums text-gray-500">{covPct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-800">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${covPct}%` }} />
                      </div>
                      {cov.waiting > 0 && <p className="mt-1 text-[11px] text-gray-500">{cov.waiting} waiting — finished runs are analysed automatically within a few minutes.</p>}
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-gray-500">Top failure categories</p>
                      {cov.topCategories.length === 0 ? (
                        <p className="text-xs text-gray-500">No failures found in the analysed runs.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {cov.topCategories.map((c) => (
                            <li key={c.category} className="flex items-center justify-between gap-3">
                              <Badge type="category" value={c.category as RcaCategory} />
                              <span className="text-xs tabular-nums text-gray-300">{c.count}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
