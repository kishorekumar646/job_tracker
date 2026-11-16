// Author: Kishore Kumar
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Bot, CheckCircle2, Play } from 'lucide-react'
import { autoApplyApi, preferencesApi } from '../api'
import { errorMessage } from '../api/client'
import { EmptyState, PageHeader, PageLoader, PlatformLogo, Spinner, Toggle, timeAgo } from '../components/ui'
import { toast } from '../store/toastStore'
import { useSettingsStore } from '../store/settingsStore'
import type { AutoApplyRun, AutoApplyStatus, Preferences } from '../types'
import { useDataRefresh } from '../hooks/useDataRefresh'

export default function AutoApply() {
  const { openSettings } = useSettingsStore()
  const [status, setStatus] = useState<AutoApplyStatus | null>(null)
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [runs, setRuns] = useState<AutoApplyRun[]>([])
  const [running, setRunning] = useState(false)
  const [limit, setLimit] = useState(10)
  const [minScore, setMinScore] = useState(60)
  const revision = useDataRefresh()
  const prefsRef = useRef<Preferences | null>(null)
  const applyPrefs = useCallback((p: Preferences) => {
    const previous = prefsRef.current
    prefsRef.current = p
    setPrefs(p)
    setLimit((current) => !previous || current === previous.daily_limit ? p.daily_limit : current)
    setMinScore((current) => !previous || current === previous.min_match_score ? p.min_match_score : current)
  }, [])

  useEffect(() => {
    let active = true
    preferencesApi.get().then((p) => { if (active) applyPrefs(p) }).catch((e) => { if (active) toast.error(errorMessage(e)) })
    return () => { active = false }
  }, [revision, applyPrefs])
  useEffect(() => {
    let active = true
    Promise.all([autoApplyApi.status(), autoApplyApi.runs()]).then(([s, r]) => {
      if (active) { setStatus(s); setRuns(r) }
    }).catch((e) => { if (active) toast.error(errorMessage(e)) })
    return () => { active = false }
  }, [revision])

  if (!status || !prefs) return <PageLoader variant="form" />

  const save = async (patch: Partial<Preferences>, msg: string) => {
    try {
      applyPrefs(await preferencesApi.update(patch))
      toast.success(msg)
    } catch (e) {
      toast.error(errorMessage(e))
      setLimit(prefs.daily_limit)
      setMinScore(prefs.min_match_score)
    }
  }

  const run = async () => {
    setRunning(true)
    try {
      const r = await autoApplyApi.run()
      toast[r.applied > 0 ? 'success' : 'info'](r.message || `Applied to ${r.applied} jobs.`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setRunning(false)
    }
  }

  const capped = status.lifetime_limit != null
  const used = capped ? status.lifetime_used : status.applied_today
  const total = capped ? status.lifetime_limit! : status.daily_limit
  const pct = Math.min(100, (used / Math.max(1, total)) * 100)

  return (
    <>
      <PageHeader title="Auto-apply" subtitle="Let JobPilot apply to matching jobs on your connected platforms." action={<button className="btn-primary" onClick={run} disabled={running}>{running ? <Spinner /> : <Play className="h-4 w-4" />}Run now</button>} />

      {status.blockers.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
          <p className="mb-2 flex items-center gap-2 font-bold text-amber-300"><AlertTriangle className="h-5 w-5" />Finish setup to enable auto-apply</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-amber-300">{status.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold"><button onClick={() => openSettings('profile')} className="text-brand-300 underline">Profile</button><button onClick={() => openSettings('security')} className="text-brand-300 underline">Security</button><button onClick={() => openSettings('preferences')} className="text-brand-300 underline">Preferences</button><Link to="/connections" className="text-brand-300 underline">Connections</Link></div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card card-pad space-y-6 lg:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300"><Bot className="h-6 w-6" /></div><div className="min-w-0"><p className="font-bold">Daily automatic applications</p><p className="text-sm text-gray-400">{prefs.auto_apply_enabled ? 'Enabled — runs automatically in the background.' : 'Disabled — use Run now for a manual pass.'}</p></div></div>
            <Toggle checked={prefs.auto_apply_enabled} onChange={(v) => save({ auto_apply_enabled: v }, v ? 'Auto-apply enabled.' : 'Auto-apply paused.')} label="Enable auto-apply" />
          </div>

          <div>
            <div className="mb-2 flex justify-between text-sm"><span className="font-semibold">Daily limit</span><span className="font-bold text-brand-400">{limit} / day</span></div>
            <input type="range" min={1} max={50} value={limit} onChange={(e) => setLimit(+e.target.value)} onMouseUp={() => limit !== prefs.daily_limit && save({ daily_limit: limit }, 'Daily limit saved.')} onTouchEnd={() => limit !== prefs.daily_limit && save({ daily_limit: limit }, 'Daily limit saved.')} onKeyUp={() => limit !== prefs.daily_limit && save({ daily_limit: limit }, 'Daily limit saved.')} className="w-full accent-brand-600" />
          </div>
          <div>
            <div className="mb-2 flex justify-between text-sm"><span className="font-semibold">Minimum match score</span><span className="font-bold text-brand-400">{minScore}%</span></div>
            <input type="range" min={0} max={100} step={5} value={minScore} onChange={(e) => setMinScore(+e.target.value)} onMouseUp={() => minScore !== prefs.min_match_score && save({ min_match_score: minScore }, 'Match threshold saved.')} onTouchEnd={() => minScore !== prefs.min_match_score && save({ min_match_score: minScore }, 'Match threshold saved.')} onKeyUp={() => minScore !== prefs.min_match_score && save({ min_match_score: minScore }, 'Match threshold saved.')} className="w-full accent-brand-600" />
          </div>
        </section>

        <section className="card card-pad">
          <h2 className="mb-4 font-bold">{capped ? 'Free plan' : 'Today'}</h2>
          <p className="text-3xl font-extrabold">{used}<span className="text-base font-medium text-gray-500"> / {total}</span></p>
          {capped && <p className="mt-1 text-xs text-gray-400">free auto-applies. <Link to="/billing" className="text-brand-400 hover:underline">Upgrade to Pro</Link> for more.</p>}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-800"><div className="h-full rounded-full bg-gradient-to-r from-brand-300 to-brand-700 transition-all" style={{ width: `${pct}%` }} /></div>
          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-gray-400">Connected platforms</h3>
          {status.connected_platforms.length === 0 ? <p className="text-sm text-gray-400">None yet.</p> : <div className="flex flex-wrap gap-2">{status.connected_platforms.map((p) => <PlatformLogo key={p} platform={p} size="h-9 w-9" />)}</div>}
        </section>
      </div>

      <section className="card card-pad mt-6">
        <h2 className="mb-4 text-lg font-bold">Run history</h2>
        {runs.length === 0 ? <EmptyState icon={<Bot className="h-6 w-6" />} title="No runs yet" text="Click Run now to apply to your best matches." /> : (
          <ul className="divide-y divide-gray-800">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <CheckCircle2 className={`h-5 w-5 ${r.applied > 0 ? 'text-emerald-500' : 'text-gray-300'}`} />
                <span className="font-semibold">{r.applied} applied</span>
                <span className="text-gray-400">{r.evaluated} evaluated · {r.skipped} skipped</span>
                <span className="badge bg-gray-800 text-gray-300 ring-gray-700">{r.trigger}</span>
                {r.message && <span className="hidden text-gray-500 md:inline">{r.message}</span>}
                <span className="ml-auto text-gray-500">{timeAgo(r.started_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
