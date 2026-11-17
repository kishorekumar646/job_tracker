// Author: Kishore Kumar
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Bot, CheckCircle2, ChevronDown, ExternalLink, Play } from 'lucide-react'
import { autoApplyApi, preferencesApi } from '../api'
import { errorMessage } from '../api/client'
import { EmptyState, JOB_TYPE_LABEL, MatchBadge, PageHeader, PageLoader, PlatformLogo, salary, Spinner, StatusBadge, Toggle, timeAgo } from '../components/ui'
import { toast } from '../store/toastStore'
import { useSettingsStore } from '../store/settingsStore'
import type { AutoApplyRun, AutoApplyRunDetail, AutoApplyRunJob, AutoApplyStatus, Preferences } from '../types'
import { useDataRefresh } from '../hooks/useDataRefresh'

function localDateTime(value: string) {
  const date = new Date(value)
  return `${date.toLocaleDateString(undefined, { dateStyle: 'medium' })}, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
}

function RunOutcome({ outcome }: { outcome: AutoApplyRunJob['outcome'] }) {
  return <span className={`badge max-w-full whitespace-normal ${outcome === 'to_apply' ? 'bg-amber-500/10 text-amber-300 ring-amber-500/30' : 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'}`}>{outcome === 'to_apply' ? 'Queued for submission' : 'Recorded as applied'}</span>
}

function RunApplicationRow({ job }: { job: AutoApplyRunJob }) {
  const [expanded, setExpanded] = useState(false)
  const panelId = `run-application-${job.id}`
  const info = job.job_details
  const application = job.application
  const experience = info?.experience_min != null && info.experience_max != null ? `${info.experience_min} - ${info.experience_max} years`
    : info?.experience_min != null ? `${info.experience_min}+ years` : info?.experience_max != null ? `Up to ${info.experience_max} years` : 'Not specified'
  const toggle = () => setExpanded((value) => !value)

  return (
    <Fragment>
      <tr className="border-t border-gray-800 align-top">
        <td data-label="Platform" className="break-words px-2 py-4"><PlatformLogo platform={job.source} size="h-7 w-7" /><span className="mt-2 block capitalize text-gray-400">{job.source}</span></td>
        <td data-label="Role & company" className="px-2 py-4">
          <button type="button" className="flex min-h-11 w-full items-start gap-2 rounded-lg text-left hover:text-brand-300" aria-expanded={expanded} aria-controls={panelId} onClick={toggle}>
            <ChevronDown aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            <span className="min-w-0"><span className="block break-words font-semibold text-gray-100">{job.title}</span><span className="mt-1 block break-words text-gray-400">{job.company}</span></span>
          </button>
        </td>
        <td data-label="Apply date" className="px-2 py-4 text-gray-400">{job.applied_at ? <time dateTime={job.applied_at}>{localDateTime(job.applied_at)}</time> : 'Not captured'}</td>
        <td data-label="Application ID" className="break-words px-2 py-4 font-mono text-gray-300">{job.application_id != null ? `#${job.application_id}` : <span className="font-sans text-gray-500">Not captured</span>}</td>
        <td data-label="Status" className="px-2 py-4">
          <div className="[&>span]:max-w-full [&>span]:whitespace-normal">{application ? <StatusBadge status={application.status} /> : <RunOutcome outcome={job.outcome} />}</div>
          {!application && job.application_id != null && <span className="mt-2 block text-gray-500">Tracker entry unavailable</span>}
        </td>
        <td data-label="Actions" className="px-2 py-4">
          <div className="flex flex-wrap gap-1">
            <button type="button" className="btn-secondary btn-sm min-h-11 min-w-11" aria-label={`${expanded ? 'Hide' : 'Show'} application details for ${job.title} at ${job.company}`} aria-expanded={expanded} aria-controls={panelId} title={expanded ? 'Hide details' : 'View details'} onClick={toggle}><ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>
            {job.external_link && <a href={job.external_link} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm min-h-11 min-w-11" title="Open original posting" aria-label={`Open posting for ${job.title} at ${job.company}`}><ExternalLink aria-hidden="true" className="h-4 w-4" /></a>}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-gray-800 bg-gray-900/30">
          <td colSpan={6} className="px-3 py-4 sm:px-4">
            <div id={panelId} role="region" aria-label={`Application details for ${job.title} at ${job.company}`} className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="min-w-0 max-w-full break-words font-semibold text-gray-100">{job.title} at {job.company}</h3><MatchBadge score={job.match_score} /></div>
              <dl className="grid gap-4 text-xs sm:grid-cols-2 xl:grid-cols-3">
                <div><dt className="text-gray-500">Advertised package</dt><dd className="mt-1 font-semibold text-brand-300">{info ? salary(info) ?? 'Not disclosed' : 'Not captured for this older run'}</dd></div>
                <div><dt className="text-gray-500">Location</dt><dd className="mt-1 break-words text-gray-300">{job.location || 'Not specified'}</dd></div>
                <div><dt className="text-gray-500">Job type</dt><dd className="mt-1 text-gray-300">{info?.job_type ? JOB_TYPE_LABEL[info.job_type] ?? info.job_type : 'Not specified'}</dd></div>
                <div><dt className="text-gray-500">Work arrangement</dt><dd className="mt-1 text-gray-300">{info?.is_remote == null ? 'Not captured' : info.is_remote ? 'Remote' : 'Not marked remote'}</dd></div>
                <div><dt className="text-gray-500">Experience</dt><dd className="mt-1 text-gray-300">{experience}</dd></div>
                <div><dt className="text-gray-500">Job posted</dt><dd className="mt-1 text-gray-300">{info?.posted_date ? localDateTime(info.posted_date) : 'Not specified'}</dd></div>
                <div><dt className="mb-1 text-gray-500">Outcome at run time</dt><dd><RunOutcome outcome={job.outcome} /></dd></div>
              </dl>
              {info ? (
                <>
                  <div><h4 className="mb-2 font-semibold text-gray-300">Skills</h4>{info.skills?.length ? <div className="flex flex-wrap gap-1.5">{info.skills.map((skill) => <span key={skill} className="badge max-w-full whitespace-normal bg-gray-800 text-gray-300 ring-gray-700"><span className="min-w-0 break-words">{skill}</span></span>)}</div> : <p className="text-gray-500">Not provided in the posting.</p>}</div>
                  <div><h4 className="mb-2 font-semibold text-gray-300">Job description</h4><div role="region" aria-label={`Job description for ${job.title}`} tabIndex={0} className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-gray-800 p-3 leading-relaxed text-gray-400">{info.description || 'No description was provided in the posting.'}</div></div>
                </>
              ) : <p className="text-gray-500">Salary, requirements and the description were not captured for this older run. The saved role and company are still preserved.</p>}
              <section className="space-y-3 border-t border-gray-800 pt-4" aria-label="Current application tracking">
                <h4 className="font-semibold text-gray-300">Current application tracking</h4>
                {application ? (
                  <>
                    <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      <div><dt className="mb-1 text-gray-500">Current status</dt><dd><StatusBadge status={application.status} /></dd></div>
                      <div><dt className="text-gray-500">Interview</dt><dd className="mt-1 text-gray-300">{application.interview_date ? localDateTime(application.interview_date) : 'Not scheduled'}</dd></div>
                      <div><dt className="text-gray-500">Offer package</dt><dd className="mt-1 text-gray-300">{application.offer_salary_lpa != null ? salary({ salary_min_lpa: application.offer_salary_lpa, salary_max_lpa: application.offer_salary_lpa }) : 'Not recorded'}</dd></div>
                      <div><dt className="text-gray-500">Last updated</dt><dd className="mt-1 text-gray-300">{localDateTime(application.updated_at)}</dd></div>
                    </dl>
                    <div><h5 className="mb-1 text-gray-500">Application notes</h5><p className="whitespace-pre-wrap break-words text-gray-400">{application.notes || 'No notes recorded.'}</p></div>
                  </>
                ) : <p className="text-gray-500">{job.application_id != null ? 'The linked tracker entry is no longer available. This run still preserves its original job details and outcome.' : 'An exact tracker link was not saved for this older run. Current status and notes cannot be matched reliably.'}</p>}
              </section>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}

function RunHistoryItem({ run, initiallyExpanded, revision }: { run: AutoApplyRun; initiallyExpanded: boolean; revision: number }) {
  const [expanded, setExpanded] = useState(initiallyExpanded && run.details_recorded)
  const [detail, setDetail] = useState<AutoApplyRunDetail | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const panelId = `run-${run.id}-jobs`
  const fetchedKey = useRef('')

  useEffect(() => {
    const key = `${run.id}:${revision}:${retry}`
    if (!expanded || !run.details_recorded || (detail && fetchedKey.current === key)) return
    let active = true
    setError('')
    autoApplyApi.runDetails(run.id).then((result) => {
      if (active) { fetchedKey.current = key; setDetail(result) }
    }).catch((e) => {
      if (active) setError(errorMessage(e, 'Could not load jobs for this run. Please try again.'))
    })
    return () => { active = false }
  }, [expanded, detail, run.id, run.details_recorded, retry, revision])

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
          <p className="text-xs text-gray-400">Started {localDateTime(run.started_at)}</p>
          {run.message && <p className="break-words text-sm text-gray-300">{run.message}</p>}
          {error && <div role="alert" className="space-y-2 text-sm text-rose-300"><p>{detail ? 'Could not refresh application details. Showing the last loaded information. ' : ''}{error}</p><button type="button" className="btn-secondary btn-sm" onClick={() => setRetry((value) => value + 1)}>Retry job details</button></div>}
          {!run.details_recorded ? (
            <p className="text-sm text-gray-400">Job-by-job details were not saved for this older run. Its original totals are preserved.</p>
          ) : !detail && !error ? (
            <PageLoader variant="table" />
          ) : detail && (
            <>
              {detail.jobs.length === 0 ? <p className="text-sm text-gray-400">No jobs were added to your tracker during this run.</p> : (
                <table className="mobile-order-table w-full table-fixed text-left text-xs">
                  <caption className="sr-only">Applications tracked by run #{run.id}. Apply dates are tracker creation times, not proof of external submission.</caption>
                  <colgroup><col className="w-[14%]" /><col className="w-[26%]" /><col className="w-[17%]" /><col className="w-[12%]" /><col className="w-[17%]" /><col className="w-[14%]" /></colgroup>
                  <thead className="text-gray-400"><tr>{['Platform', 'Role & company', 'Apply date', 'Application ID', 'Status', 'Actions'].map((heading) => <th key={heading} scope="col" className="break-words px-2 py-3 font-semibold">{heading}</th>)}</tr></thead>
                  <tbody>{detail.jobs.map((job) => <RunApplicationRow key={job.id} job={job} />)}</tbody>
                </table>
              )}
              {detail.jobs.length > 0 && <p className="text-xs leading-relaxed text-gray-500">Status reflects the current linked tracker entry when available; the expanded row preserves the outcome and job details saved at run time. Apply date is when JobPilot created the tracker entry. JobPilot does not submit applications on external sites; open the posting to complete submission.</p>}
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
  const intervalUnit = status.schedule_interval_minutes % 60 === 0 ? 'hour' : 'minute'
  const interval = intervalUnit === 'hour' ? status.schedule_interval_minutes / 60 : status.schedule_interval_minutes
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

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card card-pad min-w-0 space-y-4" aria-labelledby="schedule-heading">
          <div className="flex items-start justify-between gap-3">
            <h2 id="schedule-heading" className="min-w-0 font-bold">Automatic run schedule</h2>
            <fieldset disabled={savingSchedule || (!serverScheduled && !prefs.auto_apply_enabled)} aria-describedby="schedule-explanation" className="shrink-0 disabled:opacity-50">
              <Toggle checked={prefs.auto_apply_enabled} onChange={changeSchedule} label="Enable automatic runs" />
            </fieldset>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge ${!serverScheduled || (prefs.auto_apply_enabled && (!status.ready || (!nextCheck && !status.scheduled_sweep_running))) ? 'bg-amber-500/10 text-amber-300 ring-amber-500/30' : 'bg-brand-500/10 text-brand-300 ring-brand-500/30'}`}>{scheduleState}</span>
            {serverScheduled && <span className="text-sm font-semibold text-gray-200">Every {interval} {intervalUnit}{interval === 1 ? '' : 's'}</span>}
          </div>
          <div id="schedule-explanation" className="space-y-2 text-sm text-gray-400">
            {serverScheduled && <p><span className="block font-semibold text-gray-200">Next server check: </span>{status.scheduled_sweep_running ? 'A server check is in progress. The next time will appear when it finishes.' : nextCheck ? nextCheck.getTime() > Date.now() ? <time dateTime={nextCheck.toISOString()} className="block break-words">{localDateTime(nextCheck.toISOString())} ({Intl.DateTimeFormat().resolvedOptions().timeZone})</time> : 'Due; waiting for the server to confirm its next check.' : 'No active scheduler time is available.'}</p>}
            {!serverScheduled ? <p>Automatic scheduling is disabled on this server. Ask an administrator to enable it on an always-on server. <strong className="text-gray-200">Run now</strong> is still available.</p>
              : !prefs.auto_apply_enabled ? <p>Automatic runs are paused for your account. Enable the switch to join the next server check.</p>
              : !status.ready ? <p>Your preference is on. Finish the setup listed above before automatic runs can process your jobs.</p>
              : status.scheduled_sweep_running ? <p>A server check is in progress. Enabled accounts are processed in turn, subject to setup, match scores and limits.</p>
              : !nextCheck ? <p>Automatic runs are not currently confirmed; use <strong className="text-gray-200">Run now</strong> or contact an administrator.</p> : null}
            <details className="text-xs leading-relaxed text-gray-500"><summary className="cursor-pointer py-1 text-brand-300">How scheduling works</summary><p className="mt-2">This is a shared server interval, not a fixed daily time. The interval starts after server startup or the previous check finishes. Restarts reset the timer; sleeping servers pause scheduling. Runs respect your setup, daily and plan limits, and available matches.</p></details>
          </div>
        </section>

        <section className="card card-pad min-w-0 space-y-6">
          <h2 className="font-bold">Run preferences</h2>
          <div>
            <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><span className="font-semibold">Daily limit</span><span className="font-bold text-brand-400">{limit} / day</span></div>
            <input type="range" min={1} max={50} value={limit} onChange={(e) => setLimit(+e.target.value)} onMouseUp={() => limit !== prefs.daily_limit && save({ daily_limit: limit }, 'Daily limit saved.')} onTouchEnd={() => limit !== prefs.daily_limit && save({ daily_limit: limit }, 'Daily limit saved.')} onKeyUp={() => limit !== prefs.daily_limit && save({ daily_limit: limit }, 'Daily limit saved.')} className="w-full accent-brand-600" />
          </div>
          <div>
            <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><span className="font-semibold">Minimum match score</span><span className="font-bold text-brand-400">{minScore}%</span></div>
            <input type="range" min={0} max={100} step={5} value={minScore} onChange={(e) => setMinScore(+e.target.value)} onMouseUp={() => minScore !== prefs.min_match_score && save({ min_match_score: minScore }, 'Match threshold saved.')} onTouchEnd={() => minScore !== prefs.min_match_score && save({ min_match_score: minScore }, 'Match threshold saved.')} onKeyUp={() => minScore !== prefs.min_match_score && save({ min_match_score: minScore }, 'Match threshold saved.')} className="w-full accent-brand-600" />
          </div>
        </section>

        <section className="card card-pad min-w-0">
          <h2 className="mb-4 font-bold">{capped ? 'Free plan' : 'Today'}</h2>
          <p className="text-3xl font-extrabold">{used}<span className="text-base font-medium text-gray-500"> / {total}</span></p>
          {capped && <p className="mt-1 text-xs text-gray-400">free auto-applies. <Link to="/billing" className="text-brand-400 hover:underline">Upgrade to Pro</Link> for more.</p>}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-800"><div className="h-full rounded-full bg-gradient-to-r from-brand-300 to-brand-700 transition-all" style={{ width: `${pct}%` }} /></div>
          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-gray-400">Connected platforms</h3>
          {status.connected_platforms.length === 0 ? <p className="text-sm text-gray-400">None yet.</p> : <div className="flex flex-wrap gap-2">{status.connected_platforms.map((p) => <PlatformLogo key={p} platform={p} size="h-9 w-9" />)}</div>}
        </section>
      </div>

      <section className="card card-pad mt-6">
        <h2 className="mb-1 text-lg font-bold">Run history</h2>
        <p className="mb-4 text-sm text-gray-400">Applications are grouped by run. Select a role or View details to see its package, requirements and tracking information.</p>
        {runs.length === 0 ? <EmptyState icon={<Bot className="h-6 w-6" />} title="No runs yet" text="Click Run now to apply to your best matches." /> : (
          <ul className="divide-y divide-gray-800">
            {runs.map((run, index) => <RunHistoryItem key={run.id} run={run} initiallyExpanded={index === 0} revision={revision} />)}
          </ul>
        )}
      </section>
    </>
  )
}
