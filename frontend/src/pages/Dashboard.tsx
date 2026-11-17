// Author: Kishore Kumar
import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bot, Briefcase, CalendarCheck, Link2, Sparkles, Trophy } from 'lucide-react'
import { applicationsApi } from '../api'
import { errorMessage } from '../api/client'
import { ALL_TIME, DateRangeFilter, type DateRange, EmptyState, PageHeader, PageLoader, PlatformLogo, ProgressRing, StatusBadge, STATUS_META, timeAgo } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { toast } from '../store/toastStore'
import { useSettingsStore } from '../store/settingsStore'
import type { ApplicationStatus, DashboardStats } from '../types'
import { useDataRefresh } from '../hooks/useDataRefresh'

const ApplicationTrend = lazy(() => import('../components/features/ApplicationTrend'))

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone: string }) {
  return (
    <div className="metric-card card p-5">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
      <p className="text-2xl font-extrabold">{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { openSettings } = useSettingsStore()
  const user = useAuthStore((s) => s.user)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [updated, setUpdated] = useState<Date | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [range, setRange] = useState<DateRange>(ALL_TIME)
  const revision = useDataRefresh()
  useEffect(() => {
    let active = true
    applicationsApi.stats({ start: range.start || undefined, end: range.end || undefined })
      .then((s) => { if (active) { setStats(s); setUpdated(new Date()) } })
      .catch((e) => { if (active) toast.error(errorMessage(e)) })
    return () => { active = false }
  }, [refreshKey, range, revision])
  if (!stats) return <PageLoader variant="dashboard" page />

  const todo = [
    { done: stats.profile_completeness >= 60, label: 'Complete your profile & upload a resume', to: '/connections', settings: 'profile' as const },
    { done: stats.connected_platforms > 0, label: 'Connect a job platform', to: '/connections' },
    { done: stats.auto_applied > 0, label: 'Run auto-apply', to: '/auto-apply' },
  ]
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
  const summary = stats.total_applications === 0
    ? 'You have no applications yet. Find jobs to get started.'
    : [
        `You have ${plural(stats.total_applications, 'application')} so far`,
        stats.interviews > 0 && plural(stats.interviews, 'interview'),
        stats.offers > 0 && plural(stats.offers, 'offer'),
      ].filter(Boolean).join(' · ') + '.'
  const sources = Object.entries(stats.by_source).sort((a, b) => b[1] - a[1])
  const pipeline = Object.entries(stats.by_status).filter(([, n]) => n > 0)

  return (
    <>
      <PageHeader title={<>{greeting()}, <span className="text-brand-400">{user?.name || 'there'}</span> 👋</>} subtitle={<>{summary}{updated && <><span className="mx-1.5 text-gray-700">·</span><span className="text-gray-600">Updated {updated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span><button onClick={() => setRefreshKey((k) => k + 1)} title="Refresh dashboard data" className="ml-1.5 text-gray-600 transition-colors hover:text-brand-400">↻</button></>}</>} action={<DateRangeFilter value={range} onChange={setRange} />} />

      {stats.connected_platforms === 0 && (
        <Link to="/connections" className="mb-6 flex items-center gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 hover:bg-amber-500/20">
          <Link2 className="h-6 w-6 text-amber-400" />
          <p className="flex-1 text-sm font-semibold text-amber-300">Connect LinkedIn, Naukri or another platform to enable auto-apply.</p>
          <ArrowRight className="h-4 w-4 text-amber-300" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat icon={<Briefcase className="h-5 w-5" />} tone="bg-brand-500/10 text-brand-400" label="Total applications" value={stats.total_applications} />
        <Stat icon={<Bot className="h-5 w-5" />} tone="bg-brand-500/10 text-brand-300" label="Auto-applied" value={stats.auto_applied} />
        <Stat icon={<CalendarCheck className="h-5 w-5" />} tone="bg-amber-500/10 text-amber-400" label="Interviews" value={stats.interviews} />
        <Stat icon={<Trophy className="h-5 w-5" />} tone="bg-emerald-500/10 text-emerald-400" label="Offers" value={stats.offers} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {stats.total_applications > 0 && (
          <Suspense fallback={<div className="card card-pad h-72 lg:col-span-3"><PageLoader variant="chart" /></div>}>
            <ApplicationTrend byDay={stats.by_day} range={range} />
          </Suspense>
        )}
        <section className="card card-pad lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Recent applications</h2>
            <Link to="/applications" className="text-sm font-semibold text-brand-400">View all</Link>
          </div>
          {stats.recent.length === 0 ? (
            <EmptyState icon={<Briefcase className="h-6 w-6" />} title="No applications yet" text="Apply to a job or run auto-apply to get started." action={<Link to="/jobs" className="btn-primary">Browse jobs</Link>} />
          ) : (
            <ul className="divide-y divide-gray-800">
              {stats.recent.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                  <PlatformLogo platform={a.job.source} />
                  <div className="min-w-0 flex-1 basis-28">
                    <p className="truncate text-sm font-semibold">{a.job.title}</p>
                    <p className="truncate text-xs text-gray-400">{a.job.company} · {timeAgo(a.applied_at)}{a.auto_applied ? ' · auto' : ''}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="min-w-0 space-y-6">
          <section className="card card-pad">
            <div className="flex items-center gap-4">
              <ProgressRing value={Math.round((todo.filter((t) => t.done).length / todo.length) * 100)} />
              <div><h2 className="font-bold">Setup progress</h2><p className="text-xs text-gray-400">Profile completeness {stats.profile_completeness}%</p></div>
            </div>
            <ul className="mt-4 space-y-2">
              {todo.map((t) => (
                <li key={t.label}>
                  <Link to={t.to} onClick={(e) => { if ('settings' in t && t.settings) { e.preventDefault(); openSettings(t.settings) } }} className="flex items-center gap-2.5 rounded-lg p-1.5 text-sm hover:bg-gray-800">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${t.done ? 'bg-emerald-500 text-white' : 'border-2 border-gray-700'}`}>{t.done && '✓'}</span>
                    <span className={t.done ? 'text-gray-500 line-through' : 'font-medium text-gray-200'}>{t.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="card card-pad">
            <h2 className="mb-3 flex flex-wrap items-center gap-2 font-bold"><Sparkles className="h-4 w-4 text-brand-500" />Pipeline <span className="ml-auto text-xs font-medium text-gray-500">{stats.response_rate}% response</span></h2>
            {pipeline.length === 0 ? <p className="text-sm text-gray-400">Nothing in your pipeline yet.</p> : (
              <ul className="space-y-2.5">
                {pipeline.map(([s, n]) => (
                  <li key={s} className="flex items-center gap-3 text-sm">
                    <span className="w-36 truncate text-gray-300">{STATUS_META[s as ApplicationStatus]?.label ?? s}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800"><div className="h-full rounded-full bg-gradient-to-r from-brand-300 to-brand-700" style={{ width: `${(n / stats.total_applications) * 100}%` }} /></div>
                    <span className="w-6 text-right font-semibold">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {sources.length > 0 && (
            <section className="card card-pad">
              <h2 className="mb-3 font-bold">By platform</h2>
              <ul className="space-y-2.5">
                {sources.map(([src, n]) => (
                  <li key={src} className="flex items-center gap-3 text-sm">
                    <span className="w-36 truncate capitalize text-gray-300">{src}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(n / stats.total_applications) * 100}%` }} /></div>
                    <span className="w-6 text-right font-semibold">{n}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
