// Author: Kishore Kumar
import { useEffect, useState } from 'react'
import {
  CheckCircle2, XCircle, RefreshCw, WifiOff,
  Database, Ticket, Layers, Globe, ServerCrash, Clock,
  ShieldCheck, AlertTriangle,
} from 'lucide-react'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { Shimmer } from '../components/ui/Shimmer'
import { useTour } from '../tour/TourContext'
import { useHealthStore } from '../store/healthStore'
import { formatDateTime } from '../utils/date'
import { getSettings, AppSettings } from '../utils/settings'

const REFRESH_SEC = 30

type ServiceKey = 'odh' | 'jira' | 'rabbitmq' | 'inspectorweb'

const SERVICES: Array<{
  key: ServiceKey
  name: string
  description: string
  role: string
  tags: string[]
  Icon: React.ElementType
  vpnRequired: boolean
  iconAnim: string
}> = [
  {
    key: 'odh',
    name: 'ODH / Elasticsearch',
    description: 'Primary data source for test failure logs and execution records ingested via Logstash.',
    role: 'Data Source',
    tags: ['Elasticsearch', 'Log Ingestion'],
    Icon: Database,
    vpnRequired: true,
    iconAnim: 'iconFloat 3s ease-in-out infinite',
  },
  {
    key: 'jira',
    name: 'Jira Injector',
    description: 'Proxies the Jira REST API to cross-reference failure signatures against known issues.',
    role: 'Issue Tracker',
    tags: ['Known Issues', 'Jira Cloud'],
    Icon: Ticket,
    vpnRequired: true,
    iconAnim: 'iconWiggle 3s ease-in-out infinite',
  },
  {
    key: 'rabbitmq',
    name: 'RabbitMQ',
    description: 'Message broker powering async analysis jobs and publishing verdicts to Logstash.',
    role: 'Message Broker',
    tags: ['Async Jobs', 'Verdict Publishing'],
    Icon: Layers,
    vpnRequired: true,
    iconAnim: 'iconBreathe 2.5s ease-in-out infinite',
  },
  {
    key: 'inspectorweb',
    name: 'InspectorWeb',
    description: 'Provides detailed test execution run reports. Requires an active VPN connection.',
    role: 'Test Platform',
    tags: ['Run Reports'],
    Icon: Globe,
    vpnRequired: true,
    iconAnim: 'iconOrbit 10s linear infinite',
  },
]

// ── SVG ring that fills based on fraction of services online ─────────────────
function StatusRing({ fraction, ok, loading }: { fraction: number; ok: boolean; loading: boolean }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const dash = fraction * circ

  return (
    <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100" aria-hidden>
        {/* Track */}
        <circle cx="50" cy="50" r={r} fill="none" stroke="#1f2937" strokeWidth="5" />
        {/* Progress */}
        {!loading && (
          <circle
            cx="50" cy="50" r={r} fill="none"
            stroke={ok ? '#10b981' : '#ef4444'}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }}
          />
        )}
        {/* Spinner track when loading */}
        {loading && (
          <circle
            cx="50" cy="50" r={r} fill="none"
            stroke="var(--color-primary-hex-600)" strokeWidth="5" strokeLinecap="round"
            strokeDasharray="60 180"
            style={{ animation: 'spin 1s linear infinite', transformOrigin: '50px 50px' }}
          />
        )}
      </svg>
      {/* Centre icon */}
      <div className="relative z-10">
        {loading ? (
          <RefreshCw className="h-8 w-8 animate-spin text-primary-400" />
        ) : ok ? (
          <ShieldCheck className="h-8 w-8 text-emerald-400" />
        ) : (
          <ServerCrash className="h-8 w-8 text-red-400" />
        )}
      </div>
      {/* Outer glow ring when all ok */}
      {!loading && ok && (
        <div className="absolute inset-0 rounded-full border border-emerald-500/30 animate-ping" />
      )}
    </div>
  )
}

// ── Animated status dot ───────────────────────────────────────────────────────
function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
        ok ? 'bg-emerald-400 animate-ping' : 'bg-red-400 animate-pulse'
      }`} />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
    </span>
  )
}

// ── Service card ──────────────────────────────────────────────────────────────
function ServiceCard({
  svc,
  ok,
  detail,
  index,
  animate,
}: {
  svc: typeof SERVICES[number]
  ok: boolean
  detail?: string
  index: number
  animate: boolean
}) {
  const { Icon, name, description, role, tags, vpnRequired, iconAnim } = svc

  const cardStyle: React.CSSProperties = animate
    ? { animation: `fadeSlideUp 0.45s cubic-bezier(0.4,0,0.2,1) ${index * 0.08}s both` }
    : { opacity: 0 }

  return (
    <div
      style={cardStyle}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
        ok
          ? 'border-emerald-500/20 bg-gray-900 hover:border-emerald-500/40 hover:shadow-emerald-500/5'
          : 'border-red-500/20 bg-gray-900 hover:border-red-500/40 hover:shadow-red-500/5'
      }`}
    >
      {/* Subtle background gradient */}
      <div className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${
        ok ? 'bg-gradient-to-br from-emerald-500/5 to-transparent' : 'bg-gradient-to-br from-red-500/5 to-transparent'
      }`} />

      {/* Top row: icon + status */}
      <div className="relative mb-4 flex items-start justify-between">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl border transition-colors ${
          ok
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
            : 'border-red-500/20 bg-red-500/10 text-red-400'
        }`}>
          <Icon className="h-5 w-5" style={{ animation: iconAnim }} />
        </div>

        <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
          ok
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
            : 'border-red-500/20 bg-red-500/10 text-red-400'
        }`}>
          <StatusDot ok={ok} />
          {ok ? 'Online' : 'Offline'}
        </div>
      </div>

      {/* Role chip */}
      <span className="relative mb-1.5 self-start rounded-md bg-gray-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {role}
      </span>

      {/* Name + description */}
      <h3 className="relative mb-1 text-sm font-semibold text-gray-100">{name}</h3>
      <p className="relative flex-1 text-xs leading-relaxed text-gray-500">
        {detail && !ok ? detail : description}
      </p>

      {/* Tags */}
      <div className="relative mt-3 flex flex-wrap gap-1.5">
        {vpnRequired && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
            VPN Required
          </span>
        )}
        {tags.map((tag) => (
          <span key={tag} className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-gray-500">
            {tag}
          </span>
        ))}
      </div>

      {/* Bottom status bar */}
      <div className={`absolute bottom-0 left-0 right-0 h-0.5 transition-all duration-500 ${
        ok ? 'bg-gradient-to-r from-emerald-500/0 via-emerald-500/60 to-emerald-500/0'
           : 'bg-gradient-to-r from-red-500/0 via-red-500/60 to-red-500/0'
      }`} />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function HealthPage() {
  const { health, loading, error: hasError, lastChecked, refresh } = useHealthStore()
  const [pageLoading, setPageLoading] = useState(true)
  const [countdown, setCountdown] = useState(REFRESH_SEC)
  const [animate, setAnimate] = useState(false)
  const [pollEnabled, setPollEnabled] = useState(() => getSettings().healthPollEnabled)
  const { startTourIfNew } = useTour()

  const error = hasError ? 'Health check failed — backend may be unreachable.' : ''

  function handleRefresh() {
    setCountdown(REFRESH_SEC)
    setAnimate(false)
    refresh().then(() => setTimeout(() => setAnimate(true), 30))
  }

  // Trigger animate when store updates
  useEffect(() => {
    if (!loading) setTimeout(() => setAnimate(true), 30)
  }, [loading])

  // Page shimmer (DEV only)
  useEffect(() => {
    if (import.meta.env.DEV) {
      const delay = Math.random() * 2000 + 3000
      const t = setTimeout(() => { setPageLoading(false); startTourIfNew('health') }, delay)
      return () => clearTimeout(t)
    } else {
      setPageLoading(false)
    }
  }, [])

  // Sync pollEnabled when settings change
  useEffect(() => {
    function onSettingsChanged(e: Event) {
      setPollEnabled((e as CustomEvent<AppSettings>).detail.healthPollEnabled)
    }
    window.addEventListener('rca-settings-changed', onSettingsChanged)
    return () => window.removeEventListener('rca-settings-changed', onSettingsChanged)
  }, [])

  // Countdown display — only runs when auto-refresh is enabled
  useEffect(() => {
    if (!pollEnabled) {
      setCountdown(REFRESH_SEC)
      return
    }
    let count = REFRESH_SEC
    const id = setInterval(() => {
      count -= 1
      setCountdown(count)
      if (count <= 0) {
        count = REFRESH_SEC
        setCountdown(REFRESH_SEC)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [pollEnabled])

  const onlineServices = SERVICES.filter((s) => health?.[s.key])
  const onlineCount   = error ? 0 : onlineServices.length
  const totalCount    = SERVICES.length
  const fraction      = totalCount > 0 ? onlineCount / totalCount : 0
  const allOk         = !error && health !== null && onlineCount === totalCount

  return (
    <DashboardLayout title="Service Health">
      {pageLoading ? (
        <SkeletonView />
      ) : (
        <div className="space-y-6">

          {/* ── Hero status card ─────────────────────────────────────────── */}
          <div
            style={{ animation: 'fadeSlideUp 0.5s cubic-bezier(0.4,0,0.2,1) both' }}
            className={`relative overflow-hidden rounded-2xl border p-6 transition-colors duration-700 ${
              loading
                ? 'border-gray-700 bg-gray-900'
                : allOk
                ? 'border-emerald-500/30 bg-gray-900'
                : 'border-red-500/30 bg-gray-900'
            }`}
            data-tour="tour-status-bar"
          >
            {/* Ambient glow */}
            <div className={`pointer-events-none absolute inset-0 opacity-[0.03] transition-colors duration-700 ${
              allOk ? 'bg-emerald-400' : 'bg-red-400'
            }`} />

            <div className="relative flex flex-wrap items-center gap-6">
              <StatusRing fraction={fraction} ok={allOk} loading={loading} />

              <div className="flex-1 min-w-0">
                <h2 className={`text-xl font-bold transition-colors duration-500 ${
                  loading ? 'text-gray-400' : allOk ? 'text-emerald-300' : 'text-red-300'
                }`}>
                  {loading
                    ? 'Checking services…'
                    : allOk
                    ? 'All Systems Operational'
                    : error
                    ? 'Backend Unreachable'
                    : `${totalCount - onlineCount} Service${totalCount - onlineCount !== 1 ? 's' : ''} Degraded`}
                </h2>

                <p className="mt-1 text-sm text-gray-400">
                  {loading
                    ? 'Running health checks…'
                    : `${onlineCount} of ${totalCount} services online`}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-600">
                  {lastChecked && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      Last checked {formatDateTime(lastChecked)}
                    </span>
                  )}
                  {!loading && pollEnabled && (
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="h-3 w-3" />
                      Auto-refresh in <span className={`font-semibold tabular-nums ${
                        countdown <= 5 ? 'text-amber-400' : 'text-gray-500'
                      }`}>{countdown}s</span>
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={handleRefresh}
                disabled={loading}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-300 transition-all hover:border-primary-500/50 hover:bg-gray-700 hover:text-primary-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Checking…' : 'Refresh Now'}
              </button>
            </div>

            {/* Progress bar at bottom */}
            <div className="relative mt-5 h-1 overflow-hidden rounded-full bg-gray-800">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  allOk ? 'bg-emerald-500' : 'bg-red-500'
                }`}
                style={{ width: loading ? '100%' : `${fraction * 100}%` }}
              />
              {loading && (
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_ease_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              )}
            </div>
          </div>

          {/* ── VPN / connectivity error ─────────────────────────────────── */}
          {error && (
            <div
              style={{ animation: 'fadeSlideUp 0.4s ease both' }}
              className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/15">
                <WifiOff className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-red-300">Backend Unreachable</p>
                <p className="mt-0.5 text-xs text-red-400/80">
                  Could not connect to the RCA backend. Please verify your VPN connection and try again.
                </p>
              </div>
            </div>
          )}

          {/* ── Service cards grid ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="tour-services">
            {SERVICES.map((svc, i) => {
              const ok     = error ? false : (health?.[svc.key] ?? false)
              const detail = health?.detail?.[svc.key]
              const desc   = svc.key === 'odh' && health?.odh_note ? health.odh_note : detail
              return (
                <ServiceCard
                  key={svc.key}
                  svc={svc}
                  ok={ok}
                  detail={desc}
                  index={i}
                  animate={animate && !loading}
                />
              )
            })}
          </div>

          {/* ── About this project + page ────────────────────────────────── */}
          <div
            style={{ animation: 'fadeSlideUp 0.5s cubic-bezier(0.4,0,0.2,1) 0.32s both' }}
            className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900"
            data-tour="tour-about"
          >
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/10">
                  <ShieldCheck className="h-4 w-4 text-primary-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-100">
                    Inspector AI — Root Cause Analysis System
                  </h3>
                  <p className="text-xs text-gray-500">Automated failure triage for QA automation teams</p>
                </div>
              </div>
              <span className="rounded-full border border-primary-500/30 bg-primary-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary-400">
                v1.0.0
              </span>
            </div>

            {/* Body — two columns */}
            <div className="grid grid-cols-1 divide-y divide-gray-800 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              {/* Key capabilities */}
              <div className="px-6 py-5">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Key Capabilities
                </p>
                <ul className="space-y-2.5">
                  {[
                    'Automated RCA — rule engine classifies failures by category',
                    'Multi-Platform — STB, Android, iOS, Web & BrowserStack targets',
                    'Jira Integration — posts verdicts as comments on linked tickets',
                    'Elasticsearch Sink — publishes enriched failure records to ODH',
                    'Secure Auth — TOTP 2FA with JWT access + refresh token rotation',
                  ].map((cap) => (
                    <li key={cap} className="flex items-start gap-2 text-xs text-gray-400">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-400" />
                      {cap}
                    </li>
                  ))}
                </ul>
              </div>

              {/* About this page */}
              <div className="px-6 py-5">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  About This Page
                </p>
                <p className="mb-4 text-xs leading-relaxed text-gray-400">
                  This page probes all downstream services the RCA system depends on and reports live
                  connectivity status. Checks run every {REFRESH_SEC} seconds automatically and can be
                  triggered at any time via <span className="font-medium text-gray-300">Refresh Now</span>.
                  A VPN connection is required for ODH, Jira, RabbitMQ, and InspectorWeb.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {['FastAPI', 'React', 'Elasticsearch', 'RabbitMQ', 'Jira Cloud', 'TOTP Auth'].map((tech) => (
                    <span
                      key={tech}
                      className="rounded-full bg-gray-800 px-2.5 py-0.5 text-[10px] font-medium text-gray-400"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── System info / API message ────────────────────────────────── */}
          {health && (
            <div
              style={{ animation: 'fadeSlideUp 0.5s cubic-bezier(0.4,0,0.2,1) 0.36s both' }}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
              data-tour="tour-api-message"
            >
              {/* API status */}
              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-500/10">
                    <ShieldCheck className="h-4 w-4 text-primary-400" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    API Status
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-200">{health.status}</p>
              </div>

              {/* Degraded / unavailable services */}
              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                    health.unavailable.length === 0 ? 'bg-emerald-500/10' : 'bg-amber-500/10'
                  }`}>
                    {health.unavailable.length === 0
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      : <AlertTriangle className="h-4 w-4 text-amber-400" />}
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Service Status
                  </span>
                </div>
                {health.unavailable.length === 0 ? (
                  <p className="text-sm font-medium text-emerald-400">No degraded services</p>
                ) : (
                  <div className="space-y-1.5">
                    {health.unavailable.map((s) => (
                      <div key={s} className="flex items-center gap-2">
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                        <span className="text-sm text-red-300">{s}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  )
}

// ── Page skeleton ─────────────────────────────────────────────────────────────
function SkeletonView() {
  return (
    <div className="space-y-6">
      {/* Hero skeleton */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <div className="flex items-center gap-6">
          <Shimmer className="h-24 w-24 shrink-0 rounded-full" />
          <div className="flex-1 space-y-3">
            <Shimmer className="h-6 w-56 rounded" />
            <Shimmer className="h-4 w-40 rounded" />
            <div className="flex gap-4">
              <Shimmer className="h-3 w-36 rounded" />
              <Shimmer className="h-3 w-28 rounded" />
            </div>
          </div>
          <Shimmer className="h-10 w-28 rounded-xl" />
        </div>
        <Shimmer className="mt-5 h-1 w-full rounded-full" />
      </div>
      {/* Service cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
            <div className="flex items-start justify-between">
              <Shimmer className="h-12 w-12 rounded-xl" />
              <Shimmer className="h-6 w-20 rounded-full" />
            </div>
            <div className="space-y-2">
              <Shimmer className="h-3 w-16 rounded" />
              <Shimmer className="h-4 w-40 rounded" />
              <Shimmer className="h-3 w-full rounded" />
              <Shimmer className="h-3 w-3/4 rounded" />
            </div>
            <div className="flex gap-1.5">
              <Shimmer className="h-5 w-20 rounded-full" />
              <Shimmer className="h-5 w-24 rounded-full" />
            </div>
          </div>
        ))}
      </div>
      {/* About skeleton */}
      <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <Shimmer className="h-8 w-8 rounded-lg" />
            <div className="space-y-1.5">
              <Shimmer className="h-4 w-64 rounded" />
              <Shimmer className="h-3 w-44 rounded" />
            </div>
          </div>
          <Shimmer className="h-5 w-14 rounded-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-3 px-6 py-5">
              <Shimmer className="h-3 w-28 rounded" />
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((j) => <Shimmer key={j} className="h-3 w-full rounded" />)}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Info cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Shimmer className="h-7 w-7 rounded-lg" />
              <Shimmer className="h-3 w-24 rounded" />
            </div>
            <Shimmer className="h-4 w-40 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
