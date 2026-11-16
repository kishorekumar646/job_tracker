// Author: Kishore Kumar
import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageSquareHeart, Star } from 'lucide-react'
import { feedbackApi, type AdminFeedback, type FeedbackRecord } from '../api'
import { errorMessage } from '../api/client'
import { EmptyState, FilterBar, FilterChips, PageLoader, timeAgo } from '../components/ui'
import { useDataRefresh } from '../hooks/useDataRefresh'
import { toast } from '../store/toastStore'

export function FeedbackTab() {
  const [status, setStatus] = useState<'' | FeedbackRecord['status']>('')
  const [skip, setSkip] = useState(0)
  const [data, setData] = useState<{ items: AdminFeedback[]; total: number } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [retry, setRetry] = useState(0)
  const loadId = useRef(0)
  const revision = useDataRefresh()
  const load = useCallback(async () => {
    const id = ++loadId.current
    try {
      const result = await feedbackApi.list(status, skip)
      if (id !== loadId.current) return
      if (skip > 0 && !result.items.length) { setSkip(Math.max(0, skip - 20)); return }
      setData(result)
      setError('')
    } catch (e) { if (id === loadId.current) setError(errorMessage(e)) }
  }, [status, skip])
  useEffect(() => { void load(); return () => { loadId.current++ } }, [load, revision, retry])
  const review = async (row: AdminFeedback) => {
    setBusy(row.id)
    try { await feedbackApi.review(row.id, row.status === 'new' ? 'reviewed' : 'new'); await load() }
    catch (e) { toast.error(errorMessage(e)) }
    finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      <FilterBar active={!!status} onClear={() => { setStatus(''); setSkip(0); setData(null) }} summary={data ? `${data.total} feedback submission${data.total === 1 ? '' : 's'}` : undefined}>
        <FilterChips label="Feedback status" value={status} onChange={(value) => { setStatus(value); setSkip(0); setData(null) }} options={[{ value: '', label: 'All' }, { value: 'new', label: 'New' }, { value: 'reviewed', label: 'Reviewed' }]} />
      </FilterBar>
      {error && <div role="alert" className="card p-4 text-sm text-rose-400">{error}<button className="ml-3 underline" onClick={() => setRetry((n) => n + 1)}>Retry</button></div>}
      {!data && !error ? <PageLoader variant="table" /> : data?.items.length ? (
        <div className="space-y-3">{data.items.map((row) => <article key={row.id} className="card card-pad space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-semibold">{row.user_name || row.user_email}</h3><p className="break-all text-xs text-gray-500">{row.user_email}</p></div><div className="flex gap-0.5" aria-label={`${row.rating} out of 5 stars`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} className={`h-4 w-4 ${star <= row.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-700'}`} />)}</div></div>
          <p className="whitespace-pre-wrap break-words text-sm text-gray-300">{row.comment || 'Rating only; no comment.'}</p>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="break-all text-xs text-gray-500">{row.page || 'No page provided'} · {timeAgo(row.created_at)} · {row.status === 'new' ? 'New' : 'Reviewed'}</p><button className="btn-secondary btn-sm" disabled={busy !== null} onClick={() => void review(row)}>{busy === row.id ? 'Saving...' : row.status === 'new' ? 'Mark reviewed' : 'Mark new'}</button></div>
        </article>)}</div>
      ) : data && <EmptyState icon={<MessageSquareHeart className="h-6 w-6" />} title="No feedback yet" text="Feedback matching this filter will appear here." />}
      {data && data.total > 20 && <div className="flex items-center justify-between gap-3"><button className="btn-secondary btn-sm" disabled={skip === 0} onClick={() => { setSkip((n) => Math.max(0, n - 20)); setData(null) }}>Previous</button><span className="text-xs text-gray-500">{skip + 1}-{Math.min(skip + 20, data.total)} of {data.total}</span><button className="btn-secondary btn-sm" disabled={skip + 20 >= data.total} onClick={() => { setSkip((n) => n + 20); setData(null) }}>Next</button></div>}
    </div>
  )
}
