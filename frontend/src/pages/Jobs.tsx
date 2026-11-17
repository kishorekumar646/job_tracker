// Author: Kishore Kumar
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Building2, CheckCircle2, ExternalLink, MapPin, Plus, RefreshCw, Search, Trash2, Wallet } from 'lucide-react'
import { applicationsApi, jobsApi, type JobFilters } from '../api'
import { errorMessage } from '../api/client'
import { EmptyState, Field, FilterBar, FilterChips, FilterField, JOB_TYPE_LABEL, MatchBadge, Modal, PageHeader, PageLoader, PlatformLogo, salary, Spinner, TagInput, timeAgo } from '../components/ui'
import { toast } from '../store/toastStore'
import type { Job, JobSource, JobType } from '../types'
import { useDataRefresh } from '../hooks/useDataRefresh'

const PAGE = 20
const SOURCES: JobSource[] = ['linkedin', 'naukri', 'indeed', 'glassdoor', 'foundit', 'instahyre', 'manual']

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [location, setLocation] = useState('')
  const [source, setSource] = useState('')
  const [sort, setSort] = useState<'match' | 'recent'>('match')
  const [hideApplied, setHideApplied] = useState(false)
  const [adding, setAdding] = useState(false)
  const [applying, setApplying] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [reload, setReload] = useState(0)
  const revision = useDataRefresh()
  const loadedPages = useRef(1)
  const generation = useRef(0)

  const filters = useCallback((skip = 0): JobFilters => ({ search: search || undefined, location: location || undefined, source: source || undefined, sort, hide_applied: hideApplied || undefined, skip, limit: PAGE }), [search, location, source, sort, hideApplied])
  const previousFilters = useRef(filters)

  useEffect(() => {
    if (previousFilters.current !== filters) {
      previousFilters.current = filters
      loadedPages.current = 1
    }
    const id = ++generation.current
    setRefreshing(true)
    let active = true
    const t = setTimeout(() => {
      Promise.all(Array.from({ length: loadedPages.current }, (_, page) => jobsApi.list(filters(page * PAGE))))
        .then((pages) => {
          if (active && generation.current === id) {
            setJobs(pages.flat())
            setMore(pages[pages.length - 1].length === PAGE)
          }
        })
        .catch((e) => { if (active) toast.error(errorMessage(e)) })
        .finally(() => { if (active && generation.current === id) setRefreshing(false) })
    }, 250)
    return () => { active = false; clearTimeout(t); generation.current++ }
  }, [filters, reload, revision])

  const refreshFeed = async () => {
    setSyncing(true)
    try {
      const { added } = await jobsApi.refresh()
      toast.success(added ? `${added} new live job${added === 1 ? '' : 's'} found.` : 'No new live jobs for your preferences right now.')
      setReload((n) => n + 1)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSyncing(false)
    }
  }

  const loadMore = async () => {
    const id = generation.current
    setLoadingMore(true)
    try {
      const r = await jobsApi.list(filters(jobs?.length ?? 0))
      if (id !== generation.current) return
      loadedPages.current++
      setJobs((l) => [...(l ?? []), ...r])
      setMore(r.length === PAGE)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLoadingMore(false)
    }
  }

  const apply = async (j: Job) => {
    setApplying(j.id)
    try {
      await applicationsApi.create({ job_id: j.id })
      setJobs((l) => l?.map((x) => (x.id === j.id ? { ...x, applied: true } : x)) ?? l)
      toast.success(`Applied to ${j.title} at ${j.company}.`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setApplying(null)
    }
  }

  const remove = async (j: Job) => {
    try {
      await jobsApi.remove(j.id)
      setJobs((l) => l?.filter((x) => x.id !== j.id) ?? l)
      toast.info('Job removed.')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader title="Find jobs" subtitle="Ranked by how well each job matches your resume and preferences." action={<div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={refreshFeed} disabled={syncing}><RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />Fetch live jobs</button><button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add job</button></div>} />

      <FilterBar active={!!(search || location || source || sort !== 'match' || hideApplied)} onClear={() => { setSearch(''); setLocation(''); setSource(''); setSort('match'); setHideApplied(false) }} summary={refreshing ? 'Updating jobs...' : jobs ? `${jobs.length}${more ? '+' : ''} job${jobs.length === 1 ? '' : 's'} shown` : undefined}>
        <FilterField label="Search"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" /><input type="search" className="input pl-9" placeholder="Title, company or skill" value={search} onChange={(e) => setSearch(e.target.value)} /></div></FilterField>
        <FilterField label="Location"><div className="relative"><MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" /><input className="input pl-9" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} /></div></FilterField>
        <FilterChips label="Sort" value={sort} onChange={setSort} options={[{ value: 'match', label: 'Best match' }, { value: 'recent', label: 'Most recent' }]} />
        <FilterChips label="Platform" value={source} onChange={setSource} wide options={[{ value: '', label: 'All platforms' }, ...SOURCES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))]} />
        <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={hideApplied} onChange={(e) => setHideApplied(e.target.checked)} className="h-4 w-4 rounded border-gray-700 text-brand-400" />Hide jobs I've applied to</label>
      </FilterBar>

      {!jobs ? <PageLoader variant="jobs" /> : jobs.length === 0 ? (
        <div className="card"><EmptyState icon={<Search className="h-6 w-6" />} title="No jobs found" text="Try different filters, or add a job you found elsewhere." /></div>
      ) : (
        <div className="space-y-4">
          {jobs.map((j) => (
            <article key={j.id} className="card flex flex-col gap-4 p-5 transition hover:shadow-lift sm:flex-row sm:items-start">
              <PlatformLogo platform={j.source} size="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold">{j.title}</h3>
                  <MatchBadge score={j.match_score} />
                  {j.is_remote && <span className="badge bg-teal-500/10 text-teal-300 ring-teal-500/30">Remote</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
                  <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{j.company}</span>
                  {j.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{j.location}</span>}
                  {salary(j) && <span className="inline-flex items-center gap-1"><Wallet className="h-3.5 w-3.5" />{salary(j)}</span>}
                  {j.job_type && <span>{JOB_TYPE_LABEL[j.job_type] ?? j.job_type}</span>}
                  <span>{timeAgo(j.posted_date)}</span>
                </div>
                {j.skills.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {j.skills.slice(0, 8).map((s) => <span key={s} className={`badge ${j.matched_skills.includes(s) ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30' : 'bg-gray-800/50 text-gray-300 ring-gray-700'}`}>{s}</span>)}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch">
                {j.applied ? (
                  <span className="btn-secondary cursor-default text-emerald-300"><CheckCircle2 className="h-4 w-4" />Applied</span>
                ) : (
                  <button className="btn-primary" onClick={() => apply(j)} disabled={applying === j.id}>{applying === j.id && <Spinner />}Apply</button>
                )}
                <div className="flex gap-2">
                  {j.external_link && <a href={j.external_link} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm flex-1" aria-label="Open original posting"><ExternalLink className="h-3.5 w-3.5" /></a>}
                  {j.is_own && <button className="btn-danger btn-sm flex-1" onClick={() => remove(j)} aria-label="Delete job"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </div>
            </article>
          ))}
          {more && <div className="text-center"><button className="btn-secondary" onClick={loadMore} disabled={loadingMore || refreshing}>{loadingMore && <Spinner />}Load more</button></div>}
        </div>
      )}

      <AddJobModal open={adding} onClose={() => setAdding(false)} onAdded={(j) => { setJobs((l) => [j, ...(l ?? [])]); setAdding(false) }} />
    </>
  )
}

function AddJobModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (j: Job) => void }) {
  const empty = { title: '', company: '', location: '', link: '', description: '', type: '' as JobType | '', remote: false }
  const [f, setF] = useState(empty)
  const [skills, setSkills] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const linkErr = f.link.trim() && !/^https?:\/\//i.test(f.link.trim()) ? 'Link must start with http:// or https://' : ''
  const valid = f.title.trim().length >= 2 && f.company.trim().length > 0 && !linkErr

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    try {
      const j = await jobsApi.create({ title: f.title.trim(), company: f.company.trim(), location: f.location.trim() || undefined, external_link: f.link.trim() || undefined, description: f.description.trim() || undefined, job_type: f.type || undefined, is_remote: f.remote, skills, source: 'manual' })
      onAdded(j)
      setF(empty)
      setSkills([])
      toast.success('Job added.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title="Add a job" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Job title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Company"><input className="input" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location"><input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
          <Field label="Type">
            <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as JobType | '' })}>
              <option value="">Any</option>
              {Object.entries(JOB_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Posting link" error={linkErr}><input className="input" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://" /></Field>
        <Field label="Skills"><TagInput value={skills} onChange={setSkills} placeholder="Add skills" /></Field>
        <Field label="Description"><textarea className="input min-h-[80px]" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.remote} onChange={(e) => setF({ ...f, remote: e.target.checked })} className="h-4 w-4 rounded border-gray-700 text-brand-400" />Remote role</label>
        <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !valid}>{busy && <Spinner />}Add job</button></div>
      </form>
    </Modal>
  )
}
