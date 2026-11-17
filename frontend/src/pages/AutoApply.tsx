// Author: Kishore Kumar
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Bot, CalendarClock, CheckCircle2, ChevronDown, ExternalLink, Play } from 'lucide-react'
import { autoApplyApi, preferencesApi } from '../api'
import { errorMessage } from '../api/client'
import { EmptyState, MatchBadge, PageHeader, PageLoader, PlatformLogo, Spinner, Toggle, timeAgo } from '../components/ui'
import { toast } from '../store/toastStore'
import { useSettingsStore } from '../store/settingsStore'
import type { AutoApplyRun, AutoApplyRunDetail, AutoApplyStatus, Preferences } from '../types'
import { useDataRefresh } from '../hooks/useDataRefresh'

function RunHistoryItem({ run }: { run: AutoApplyRun }) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<AutoApplyRunDetail | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const panelId = `run-${run.id}-jobs`

  useEffect(() => {
    if (!expanded || detail || !run.details_recorded) return
    let active = true
    setError('')
    autoApplyApi.runDetails(run.id).then((result) => {
      if (active) setDetail(result)
    }).catch((e) => {
      if (active) setError(errorMessage(e, 'Could not load jobs for this run. Please try again.'))
    })
    return () => { active = false }
  }, [expanded, detail, run.id, run.details_recorded, retry])

  return (
    <li className="py-3">
      <button type="button" className="flex min-h-11 w-full flex-wrap items-center gap-3 rounded-lg px-1 py-2 text-left text-sm hover:bg-gray-800/40"
        aria-label={`${expanded ? 'Hide' : 'Show'} jobs for run #${run.id}`} aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded((value) => !value)}>
        <CheckCircle2 aria-hidden="true" className={`h-5 w-5 shrink-0 ${run.applied > 0 ? 'text-emerald-500' : 'text-gray-500'}`} />
        <span className="min-w-0 flex-1 basis-40">
          <span className="block font-semibold text-gray-100">Run #{run.id} <span className="font-normal text-gray-300">· {run.applied} tracked</span></span>
          <span className="mt-1 block text-xs text-gray-400">{run.evaluated} evaluated · {run.skipped} skipped</span>
        </span>
        <span className="badge bg-gray-800 text-gray-300 ring-gray-700">{run.trigger === 'scheduled' ? 'Scheduled' : 'Manual'}</span>
        <time dateTime={run.started_at} className="text-xs text-gray-500" title={new Date(run.started_at).toLocaleString()}>{timeAgo(run.started_at)}</time>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-brand-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div id={panelId} role="region" aria-label={`Jobs from run #${run.id}`} className="mt-3 space-y-3 rounded-xl border border-gray-800 bg-gray-950/30 p-3 sm:p-4">
          <p className="text-xs text-gray-400">Started {new Date(run.started_at).toLocaleString()}</p>
          {run.message && <p className="break-words text-sm text-gray-300">{run.message}</p>}
          {!run.details_recorded ? (
            <p className="text-sm text-gray-400">Job-by-job details were not saved for this older run. Its original totals are preserved.</p>
          ) : !detail && !error ? (
            <p role="status" className="flex items-center gap-2 text-sm text-gray-400"><Spinner />Loading jobs...</p>
          ) : error ? (
            <div role="alert" className="space-y-2 text-sm text-rose-300"><p>{error}</p><button type="button" className="btn-secondary btn-sm" onClick={() => setRetry((value) => value + 1)}>Retry job details</button></div>
          ) : detail && (
            <>
              {detail.jobs.length === 0 ? <p className="text-sm text-gray-400">No jobs were added to your tracker during this run.</p> : (
                <ul className="divide-y divide-gray-800">
                  {detail.jobs.map((job) => (
                    <li key={job.id} className="flex flex-wrap items-start gap-3 py-4">
                      <PlatformLogo platform={job.source} size="h-9 w-9" />
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="break-words text-sm font-semibold text-gray-100">{job.title}</p>
                        <p className="mt-1 break-words text-xs text-gray-400">{job.company}{job.location ? ` · ${job.location}` : ''}</p>
                        <p className="mt-1 text-xs capitalize text-gray-500">{job.source}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <MatchBadge score={job.match_score} />
                        <span className={`badge ${job.outcome === 'to_apply' ? 'bg-amber-500/10 text-amber-300 ring-amber-500/30' : 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'}`}>{job.outcome === 'to_apply' ? 'Queued for submission' : 'Recorded as applied'}</span>
                      </div>
                      {job.external_link && <a href={job.external_link} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm min-h-11" aria-label={`Open posting for ${job.title} at ${job.company}`}>Open posting<ExternalLink className="h-3.5 w-3.5" /></a>}
                    </li>
                  ))}
                </ul>
              )}
              {detail.jobs.length > 0 && <p className="text-xs leading-relaxed text-gray-500">These are the outcomes recorded when this run finished, not current tracker statuses. JobPilot does not submit applications on external sites; open the posting to complete submission.</p>}
            </>
          )}
        </div>
      )}
    </li>
  )
}

export default function AutoApply() {
  const { openSettings } = useSettingsStore()
  const [status, setStatus] = useState<AutoApplyStatus | null>(null)
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [runs, setRuns] = useState<AutoApplyRun[]>([])
  const [running, setRunning] = useState(false)
  const [savingSchedule, setSavingSchedule] = useState(false)
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

  if (!status || !prefs) return <PageLoader variant="auto-apply" page />

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

  const changeSchedule = async (enabled: boolean) => {
    setSavingSchedule(true)
    try {
      await save({ auto_apply_enabled: enabled }, enabled ? 'Automatic runs enabled.' : 'Automatic runs paused.')
    } finally {
      setSavingSchedule(false)
    }
  }

  const serverScheduled = status.schedule_interval_minutes > 0
  const nextCheck = status.next_scheduled_at ? new Date(status.next_scheduled_at) : null
  const scheduleState = !serverScheduled ? 'Server scheduling off' : !prefs.auto_apply_enabled ? 'Paused'
    : !status.ready ? 'Setup required' : status.scheduled_sweep_running ? 'Checking accounts' : nextCheck ? 'Enabled' : 'Scheduler unavailable'
  const capped = status.lifetime_limit != null
  const used = capped ? status.lifetime_used : status.applied_today
  const total = capped ? status.lifetime_limit! : status.daily_limit
  const pct = Math.min(100, (used / Math.max(1, total)) * 100)

  return (
    <>
      <PageHeader title="Auto-apply" subtitle="Find matching jobs and add them to your tracker. Complete external submissions on the posting site." action={<button className="btn-primary" onClick={run} disabled={running}>{running ? <Spinner /> : <Play className="h-4 w-4" />}Run now</button>} />

      {status.blockers.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
          <p className="mb-2 flex items-center gap-2 font-bold text-amber-300"><AlertTriangle className="h-5 w-5" />Finish setup to enable auto-apply</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-amber-300">{status.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold"><button onClick={() => openSettings('profile')} className="text-brand-300 underline">Profile</button><button onClick={() => openSettings('security')} className="text-brand-300 underline">Security</button><button onClick={() => openSettings('preferences')} className="text-brand-300 underline">Preferences</button><Link to="/connections" className="text-brand-300 underline">Connections</Link></div>
        </div>
      )}

      <section className="card card-pad mb-6 space-y-4" aria-labelledby="schedule-heading">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300"><CalendarClock aria-hidden="true" className="h-6 w-6" /></div>
            <div className="min-w-0"><h2 id="schedule-heading" className="font-bold">Automatic run schedule</h2><p className="mt-1 text-sm text-gray-400">Enable automatic runs for your account.</p></div>
          </div>
          <fieldset disabled={savingSchedule || (!serverScheduled && !prefs.auto_apply_enabled)} aria-describedby="schedule-explanation" className="shrink-0 disabled:opacity-50">
            <Toggle checked={prefs.auto_apply_enabled} onChange={changeSchedule} label="Enable automatic runs" />
          </fieldset>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${!serverScheduled || (prefs.auto_apply_enabled && (!status.ready || (!nextCheck && !status.scheduled_sweep_running))) ? 'bg-amber-500/10 text-amber-300 ring-amber-500/30' : 'bg-brand-500/10 text-brand-300 ring-brand-500/30'}`}>{scheduleState}</span>
          {serverScheduled && <span className="text-sm font-semibold text-gray-200">Every {status.schedule_interval_minutes} {status.schedule_interval_minutes === 1 ? 'minute' : 'minutes'}</span>}
        </div>
        <div id="schedule-explanation" className="space-y-2 text-sm text-gray-400">
          {!serverScheduled ? <p>Automatic scheduling is disabled on this server. Ask an administrator to enable it on an always-on server. <strong className="text-gray-200">Run now</strong> is still available.</p>
            : !prefs.auto_apply_enabled ? <p>Automatic runs are paused for your account. Enable the switch to join the next server check.</p>
            : !status.ready ? <p>Your preference is on. Finish the setup listed above before automatic runs can process your jobs.</p>
            : status.scheduled_sweep_running ? <p>A server check is in progress. Enabled accounts are processed in turn, subject to setup, match scores and limits.</p>
            : nextCheck ? <p><span className="font-semibold text-gray-200">Next server check: </span>{nextCheck.getTime() > Date.now() ? <time dateTime={nextCheck.toISOString()} className="break-words">{nextCheck.toLocaleDateString(undefined, { dateStyle: 'medium' })}, {nextCheck.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} ({Intl.DateTimeFormat().resolvedOptions().timeZone})</time> : 'Due; waiting for the server to confirm its next check.'}</p>
            : <p>No active scheduler time is available. Automatic runs are not currently confirmed; use <strong className="text-gray-200">Run now</strong> or contact an administrator.</p>}
          <p className="text-xs leading-relaxed text-gray-500">This is a shared server interval, not a fixed daily time. The interval starts after server startup or the previous check finishes. Restarts reset the timer; sleeping servers pause scheduling. Runs respect your setup, daily and plan limits, and available matches.</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card card-pad space-y-6 lg:col-span-2">
          <h2 className="font-bold">Run preferences</h2>
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
            {runs.map((run) => <RunHistoryItem key={run.id} run={run} />)}
          </ul>
        )}
      </section>
    </>
  )
}
