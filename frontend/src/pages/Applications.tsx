// Author: Kishore Kumar
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Briefcase, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { applicationsApi } from '../api'
import { errorMessage } from '../api/client'
import { ALL_TIME, DateRangeFilter, type DateRange, EmptyState, Field, FilterBar, FilterChips, FilterField, MatchBadge, Modal, PageHeader, PageLoader, PlatformLogo, Spinner, StatusBadge, STATUS_META, timeAgo } from '../components/ui'
import { toast } from '../store/toastStore'
import type { Application, ApplicationStatus } from '../types'
import { useDataRefresh } from '../hooks/useDataRefresh'

const toLocalInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '')

export default function Applications() {
  const [items, setItems] = useState<Application[] | null>(null)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [source, setSource] = useState('')
  const [range, setRange] = useState<DateRange>(ALL_TIME)
  const [editing, setEditing] = useState<Application | null>(null)
  const revision = useDataRefresh()

  useEffect(() => {
    let active = true
    const t = setTimeout(() => {
      applicationsApi.list({ status: status || undefined, source: source || undefined, search: search || undefined, start: range.start || undefined, end: range.end || undefined })
        .then((rows) => { if (active) setItems(rows) })
        .catch((e) => { if (active) toast.error(errorMessage(e)) })
    }, 250)
    return () => { active = false; clearTimeout(t) }
  }, [status, source, search, range, revision])

  const remove = async (a: Application) => {
    if (!window.confirm(`Delete your application to ${a.job.company}?`)) return
    try {
      await applicationsApi.remove(a.id)
      setItems((l) => l?.filter((x) => x.id !== a.id) ?? l)
      toast.info('Application deleted.')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader title="Applications" subtitle="Track every application and update its progress." action={<DateRangeFilter value={range} onChange={setRange} />} />
      <FilterBar active={!!(search || status || source || range.start || range.end)} onClear={() => { setSearch(''); setStatus(''); setSource(''); setRange({ ...ALL_TIME }) }} summary={items ? `${items.length} application${items.length === 1 ? '' : 's'} shown` : undefined}>
        <FilterField label="Search"><input type="search" className="input" placeholder="Search title or company" value={search} onChange={(e) => setSearch(e.target.value)} /></FilterField>
        <FilterChips label="Status" value={status} onChange={setStatus} wide options={[{ value: '', label: 'All statuses' }, ...Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))]} />
        <FilterChips label="Source" value={source} onChange={setSource} wide options={[{ value: '', label: 'All sources' }, ...['linkedin', 'naukri', 'indeed', 'glassdoor', 'foundit', 'instahyre', 'manual'].map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))]} />
      </FilterBar>

      {!items ? <PageLoader /> : items.length === 0 ? (
        <div className="card"><EmptyState icon={<Briefcase className="h-6 w-6" />} title="No applications found" text="Apply to jobs or let auto-apply do it for you." action={<Link to="/jobs" className="btn-primary">Find jobs</Link>} /></div>
      ) : (
        <div className="card divide-y divide-gray-800 overflow-hidden">
          {items.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-4 p-4 hover:bg-gray-800/40">
              <PlatformLogo platform={a.job.source} />
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate font-semibold">{a.job.title}</p>
                <p className="truncate text-sm text-gray-400">{a.job.company}{a.job.location ? ` · ${a.job.location}` : ''} · {timeAgo(a.applied_at)}</p>
                {a.notes && <p className="mt-1 truncate text-xs italic text-gray-500">“{a.notes}”</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {a.auto_applied && <span className="badge bg-violet-500/10 text-violet-300 ring-violet-500/30"><Bot className="h-3 w-3" />Auto</span>}
                <MatchBadge score={a.match_score} />
                <StatusBadge status={a.status} />
              </div>
              <div className="flex gap-1.5">
                {a.job.external_link && <a href={a.job.external_link} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm" aria-label="Open posting"><ExternalLink className="h-4 w-4" /></a>}
                <button className="btn-ghost btn-sm" onClick={() => setEditing(a)} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                <button className="btn-ghost btn-sm text-rose-400" onClick={() => remove(a)} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <EditModal app={editing} onClose={() => setEditing(null)} onSaved={(u) => { setItems((l) => l?.map((x) => (x.id === u.id ? u : x)) ?? l); setEditing(null) }} />}
    </>
  )
}

function EditModal({ app, onClose, onSaved }: { app: Application; onClose: () => void; onSaved: (a: Application) => void }) {
  const [status, setStatus] = useState<ApplicationStatus>(app.status)
  const [notes, setNotes] = useState(app.notes ?? '')
  const [interview, setInterview] = useState(toLocalInput(app.interview_date))
  const [offer, setOffer] = useState(app.offer_salary_lpa?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const offerErr = offer.trim() !== '' && (Number.isNaN(Number(offer)) || Number(offer) < 0) ? 'Enter a valid amount' : ''

  const save = async () => {
    if (offerErr) return
    const o = offer.trim() === '' ? null : Number(offer)
    setBusy(true)
    try {
      onSaved(await applicationsApi.update(app.id, { status, notes: notes.trim() || null, interview_date: interview ? new Date(interview).toISOString() : null, offer_salary_lpa: o }))
      toast.success('Application updated.')
    } catch (e) {
      toast.error(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Modal open title={`${app.job.title} · ${app.job.company}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Status">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Interview date"><input type="datetime-local" className="input" value={interview} onChange={(e) => setInterview(e.target.value)} /></Field>
          <Field label="Offer (LPA)" error={offerErr}><input className="input" inputMode="decimal" value={offer} onChange={(e) => setOffer(e.target.value)} /></Field>
        </div>
        <Field label="Notes"><textarea className="input min-h-[90px]" maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy || !!offerErr}>{busy && <Spinner />}Save</button></div>
      </div>
    </Modal>
  )
}
