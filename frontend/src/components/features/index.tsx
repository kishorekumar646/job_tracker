// Author: Kishore Kumar
import { useEffect, useRef, useState } from 'react'
import { FileText, Link2, Unlink } from 'lucide-react'
import { connectionsApi, preferencesApi, profileApi } from '../../api'
import { errorMessage } from '../../api/client'
import { toast } from '../../store/toastStore'
import type { Connection, JobType, Platform, Preferences, Profile } from '../../types'
import { Field, JOB_TYPE_LABEL, Modal, PlatformLogo, Spinner, TagInput, Toggle, timeAgo } from '../ui'

const MAX_MB = 5

export function ResumeUploader({ profile, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!/\.(pdf|docx|txt)$/i.test(file.name)) return toast.error('Upload a PDF, DOCX or TXT file.')
    if (file.size > MAX_MB * 1024 * 1024) return toast.error(`File is larger than ${MAX_MB} MB.`)
    setBusy(true)
    try {
      const p = await profileApi.uploadResume(file)
      onChange(p)
      toast.success(`Resume uploaded — ${p.skills.length} skills detected.`)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not upload resume.'))
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }

  const remove = async () => {
    try {
      onChange(await profileApi.deleteResume())
      toast.success('Resume removed.')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const input = <input ref={ref} type="file" hidden accept=".pdf,.docx,.txt" onChange={(e) => upload(e.target.files?.[0])} />
  const link = 'text-xs font-medium text-brand-400 hover:text-brand-300 disabled:opacity-50'

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-800 bg-gray-800/30 px-3 py-2.5">
      <FileText className="h-5 w-5 shrink-0 text-gray-500" />
      {profile.resume_filename ? (
        <>
          <div className="min-w-0 flex-1 basis-36">
            <p className="truncate text-sm text-gray-100">{profile.resume_filename}</p>
            <p className="text-[11px] text-gray-500">{profile.resume_size ? `${(profile.resume_size / 1024).toFixed(0)} KB · ` : ''}Uploaded {timeAgo(profile.resume_uploaded_at)}</p>
          </div>
          <button className={link} onClick={() => profileApi.downloadResume(profile.resume_filename!).catch((e) => toast.error(errorMessage(e)))}>Download</button>
          <button className={link} onClick={() => ref.current?.click()} disabled={busy}>{busy ? 'Uploading…' : 'Replace'}</button>
          <button className="text-xs text-gray-500 hover:text-red-400" onClick={remove}>Remove</button>
        </>
      ) : (
        <>
          <p className="min-w-0 flex-1 text-xs text-gray-400">No resume yet · PDF, DOCX or TXT, up to {MAX_MB} MB</p>
          <button className={link} onClick={() => ref.current?.click()} disabled={busy}>{busy ? 'Uploading…' : 'Upload resume'}</button>
        </>
      )}
      {input}
    </div>
  )
}

const JOB_TYPES: JobType[] = ['full_time', 'part_time', 'contract', 'internship']

export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  useEffect(() => { preferencesApi.get().then(setPrefs).catch((e) => toast.error(errorMessage(e))) }, [])
  return [prefs, setPrefs] as const
}

export function PreferencesForm({ prefs, onSaved, submitLabel = 'Save preferences' }: { prefs: Preferences; onSaved: (p: Preferences) => void; submitLabel?: string }) {
  const [form, setForm] = useState(prefs)
  const [salary, setSalary] = useState(prefs.min_salary_lpa?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const salaryErr = salary.trim() !== '' && (Number.isNaN(Number(salary)) || Number(salary) < 0) ? 'Enter a valid amount' : ''
  const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (salaryErr) return
    const s = salary.trim() === '' ? null : Number(salary)
    setBusy(true)
    try {
      const saved = await preferencesApi.update({ job_titles: form.job_titles, locations: form.locations, job_types: form.job_types, remote_ok: form.remote_ok, min_salary_lpa: s })
      onSaved(saved)
      setForm(saved)
      toast.success('Preferences saved.')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Field label="Preferred job titles">
        <TagInput value={form.job_titles} onChange={(v) => set('job_titles', v)} placeholder="e.g. Frontend Developer — press Enter" suggestions={['Software Engineer', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'Data Analyst', 'DevOps Engineer']} />
      </Field>
      <Field label="Preferred locations">
        <TagInput value={form.locations} onChange={(v) => set('locations', v)} placeholder="e.g. Bengaluru — press Enter" suggestions={['Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Chennai', 'Delhi NCR']} />
      </Field>
      <Field label="Job types (leave empty for any)">
        <div className="flex flex-wrap gap-2">
          {JOB_TYPES.map((t) => {
            const on = form.job_types.includes(t)
            return (
              <button key={t} type="button" onClick={() => set('job_types', on ? form.job_types.filter((x) => x !== t) : [...form.job_types, t])} className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${on ? 'border-brand-500 bg-brand-500/10 text-brand-300' : 'border-gray-800 text-gray-300 hover:border-gray-600'}`}>
                {JOB_TYPE_LABEL[t]}
              </button>
            )
          })}
        </div>
      </Field>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Minimum salary (LPA)" error={salaryErr}>
          <input className="input" inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="e.g. 12" />
        </Field>
        <div className="flex items-center justify-between rounded-xl border border-gray-800 p-3.5">
          <div><p className="text-sm font-semibold">Open to remote</p><p className="text-xs text-gray-400">Include remote roles anywhere</p></div>
          <Toggle checked={form.remote_ok} onChange={(v) => set('remote_ok', v)} label="Open to remote" />
        </div>
      </div>
      <button className="btn-primary" onClick={save} disabled={busy || !!salaryErr}>{busy && <Spinner />}{submitLabel}</button>
    </div>
  )
}

export function ConnectionsGrid({ items, onChange }: { items: Connection[]; onChange: (c: Connection) => void }) {
  const [target, setTarget] = useState<Connection | null>(null)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const valueErr = (() => {
    const v = value.trim()
    if (!v || !target) return ''
    if (/^https?:\/\//i.test(v)) {
      let host = ''
      try { host = new URL(v).hostname.toLowerCase() } catch { return 'Enter a valid URL' }
      return host.split('.').includes(target.platform) ? '' : `URL must be on ${target.label}`
    }
    return /^[\w.@+-]{2,120}$/.test(v) ? '' : 'Username may only contain letters, numbers and . _ @ + -'
  })()
  const open = (c: Connection) => { setTarget(c); setValue(c.profile_url || c.handle || '') }

  const connect = async () => {
    if (!target) return
    const v = value.trim()
    if (!v || valueErr) return
    setBusy(true)
    try {
      const body = /^https?:\/\//i.test(v) ? { profile_url: v } : { handle: v }
      onChange(await connectionsApi.connect(target.platform, body))
      toast.success(`${target.label} connected.`)
      setTarget(null)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async (p: Platform) => {
    try {
      onChange(await connectionsApi.disconnect(p))
      toast.info('Account disconnected.')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((c) => (
          <div key={c.platform} className={`card flex flex-col gap-4 p-5 transition ${c.connected ? 'ring-1 ring-emerald-500/30' : 'hover:shadow-lift'}`}>
            <div className="flex flex-wrap items-center gap-3">
              <PlatformLogo platform={c.platform} />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{c.label}</p>
                <p className="truncate text-xs text-gray-400">{c.connected ? c.handle || c.profile_url : c.description}</p>
              </div>
              {c.connected && <span className="badge bg-emerald-500/10 text-emerald-300 ring-emerald-500/30">Connected</span>}
            </div>
            {c.connected ? (
              <div className="flex gap-2">
                <button className="btn-secondary btn-sm flex-1" onClick={() => open(c)}>Edit</button>
                <button className="btn-danger btn-sm flex-1" onClick={() => disconnect(c.platform)}><Unlink className="h-3.5 w-3.5" />Disconnect</button>
              </div>
            ) : (
              <button className="btn-primary btn-sm" onClick={() => open(c)}><Link2 className="h-3.5 w-3.5" />Connect</button>
            )}
          </div>
        ))}
      </div>
      <Modal open={!!target} title={`Connect ${target?.label ?? ''}`} onClose={() => setTarget(null)}>
        <p className="mb-4 text-sm text-gray-400">Enter your {target?.label} profile URL or username. JobPilot uses it to apply on your behalf for matching jobs on this platform.</p>
        <input className="input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && connect()} placeholder={`https://www.${target?.platform}.com/…  or  username`} />
        {valueErr && <p className="field-error">{valueErr}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setTarget(null)}>Cancel</button>
          <button className="btn-primary" onClick={connect} disabled={busy || !value.trim() || !!valueErr}>{busy && <Spinner />}Connect</button>
        </div>
      </Modal>
    </>
  )
}
