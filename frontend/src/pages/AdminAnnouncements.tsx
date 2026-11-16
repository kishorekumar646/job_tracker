// Author: Kishore Kumar
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, CheckCircle2, ChevronDown, ChevronUp, Clock, Hash, Loader2, Megaphone, Send, Trash2, Users, XCircle, Zap } from 'lucide-react'
import { notificationsApi, type AnnouncementRecipient, type AnnouncementRecord } from '../api'
import { errorMessage } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { toast } from '../store/toastStore'
import { useDataRefresh } from '../hooks/useDataRefresh'
import { PageLoader } from '../components/ui'

const PANEL = 'card'
const PANEL_HEAD = 'border-b border-gray-800 px-5 py-4'
const PANEL_TITLE = 'text-xs font-semibold uppercase tracking-wider text-gray-400'

export function AnnouncementsTab() {
  const user = useAuthStore((s) => s.user)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<AnnouncementRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [openId, setOpenId] = useState<number | null>(null)
  const [recipients, setRecipients] = useState<Record<number, AnnouncementRecipient[] | 'loading'>>({})
  const [deleting, setDeleting] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AnnouncementRecord | null>(null)
  const revision = useDataRefresh()
  const loadId = useRef(0)

  const load = useCallback(async () => {
    const id = ++loadId.current
    try {
      const rows = await notificationsApi.history()
      if (id === loadId.current) setHistory(rows)
    } catch (e) {
      if (id === loadId.current) toast.error(errorMessage(e))
    } finally { if (id === loadId.current) setHistoryLoading(false) }
  }, [])
  useEffect(() => {
    load()
    return () => { loadId.current++ }
  }, [load, revision])

  useEffect(() => {
    if (openId == null) return
    const id = openId
    let active = true
    setRecipients((m) => m[id] ? m : { ...m, [id]: 'loading' })
    notificationsApi.recipients(id).then((rows) => {
      if (active) setRecipients((m) => ({ ...m, [id]: rows }))
    }).catch((e) => { if (active) { toast.error(errorMessage(e)); setOpenId(null) } })
    return () => { active = false }
  }, [openId, revision])
  const toggle = (a: AnnouncementRecord) => {
    if (openId === a.id) return setOpenId(null)
    setOpenId(a.id)
  }

  const send = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const r = await notificationsApi.announce(title.trim(), message.trim())
      toast.success(`Sent to ${r.sent_to} user${r.sent_to === 1 ? '' : 's'}`)
      setTitle(''); setMessage(''); setOpenId(null); setRecipients({})
      await load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const remove = async (a: AnnouncementRecord) => {
    setConfirmDelete(null)
    setDeleting(a.id)
    try {
      await notificationsApi.remove(a.id)
      if (openId === a.id) setOpenId(null)
      await load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDeleting(null)
    }
  }

  const previewText = title.trim() && message.trim() ? `${title.trim()}: ${message.trim()}` : title.trim() || message.trim() || null
  const ring = 'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50'

  return (
    <div className="space-y-6">
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" onMouseDown={() => setConfirmDelete(null)}>
          <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10"><Trash2 className="h-5 w-5 text-red-400" /></div>
              <h3 className="text-base font-semibold text-gray-100">Delete Announcement</h3>
            </div>
            <p className="mb-1 text-sm text-gray-300">Are you sure you want to delete this announcement?</p>
            <p className="mb-6 text-xs text-gray-500">This will remove it from all recipients' inboxes and cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200">Cancel</button>
              <button onClick={() => remove(confirmDelete)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500">Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 ring-1 ring-brand-500/20"><Megaphone className="h-6 w-6 text-brand-300" /></div>
        <div>
          <h2 className="text-base font-semibold text-gray-100">Broadcast Announcement</h2>
          <p className="mt-0.5 text-xs text-gray-500">Send a message to all active users — delivered instantly to their notification inbox.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className={PANEL}>
          <div className={PANEL_HEAD}><p className={PANEL_TITLE}>Compose</p></div>
          <form onSubmit={send} className="space-y-5 p-5">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="ann-title" className="text-xs font-medium text-gray-400">Title</label>
                <span className={`text-[10px] tabular-nums ${title.trim().length > 80 ? 'text-amber-400' : 'text-gray-600'}`}>{title.trim().length}/100</span>
              </div>
              <input id="ann-title" type="text" required maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scheduled maintenance on Sept 10" className={`w-full rounded-lg border border-gray-700 bg-gray-800/80 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 transition-colors ${ring}`} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="ann-msg" className="text-xs font-medium text-gray-400">Message</label>
                <span className={`text-[10px] tabular-nums ${message.trim().length > 800 ? 'text-amber-400' : 'text-gray-600'}`}>{message.trim().length}/1000</span>
              </div>
              <textarea id="ann-msg" required maxLength={1000} rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write the full announcement details here..." className={`w-full resize-none rounded-lg border border-gray-700 bg-gray-800/80 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 transition-colors ${ring}`} />
            </div>
            <button type="submit" disabled={loading || !title.trim() || !message.trim()} className="btn-primary w-full">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Send className="h-4 w-4" /> Send to All Users</>}
            </button>
          </form>
        </div>

        <div className="contents">
          <div className={PANEL}>
            <div className={PANEL_HEAD}><p className={PANEL_TITLE}>Inbox Preview</p></div>
            <div className="p-5">
              <div className={`rounded-lg border bg-gray-800/60 px-4 py-3 transition-opacity ${previewText ? 'border-gray-700 opacity-100' : 'border-gray-800 opacity-40'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20"><Megaphone className="h-3.5 w-3.5 text-emerald-400" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-gray-200">{previewText ?? 'Your announcement will appear here…'}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-[10px] text-gray-600">just now</p>
                      <span className="text-[10px] text-gray-700">·</span>
                      <p className="text-[10px] text-gray-600">from {user?.name ?? user?.email ?? 'Admin'}</p>
                    </div>
                  </div>
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                </div>
              </div>
              <p className="mt-3 text-[10px] text-gray-600">This is how users will see your announcement in their notification inbox.</p>
            </div>
          </div>

          <div className="space-y-4">
          <div className={PANEL}>
            <div className={PANEL_HEAD}><p className={PANEL_TITLE}>Audience</p></div>
            <div className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10"><Users className="h-5 w-5 text-brand-400" /></div>
              <div>
                <p className="text-sm font-medium text-gray-200">All Active Users</p>
                <p className="mt-0.5 text-xs text-gray-500">Everyone with an active account — except you (the sender).</p>
              </div>
            </div>
          </div>

          <div className={PANEL}>
            <div className={PANEL_HEAD}><p className={PANEL_TITLE}>Tips</p></div>
            <ul className="space-y-3 p-5">
              {[
                { icon: <Zap className="h-3.5 w-3.5 text-amber-400" />, text: 'Keep the title short and action-oriented.' },
                { icon: <Hash className="h-3.5 w-3.5 text-brand-400" />, text: 'Include dates or deadlines in the message for time-sensitive items.' },
                { icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />, text: 'Users can opt out of announcements in Settings → Preferences.' },
              ].map(({ icon, text }) => (
                <li key={text} className="flex items-start gap-2.5"><span className="mt-0.5 shrink-0">{icon}</span><p className="text-xs text-gray-500">{text}</p></li>
              ))}
            </ul>
          </div>
          </div>
        </div>
      </div>

      <div className={PANEL}>
        <div className={`flex items-center justify-between ${PANEL_HEAD}`}>
          <p className={PANEL_TITLE}>Sent History</p>
          <p className="text-[10px] text-gray-600">Recent broadcasts</p>
        </div>
        {historyLoading ? (
          <div className="p-4"><PageLoader variant="table" /></div>
        ) : history.length === 0 ? (
          <div className="px-5 py-8 text-center"><Megaphone className="mx-auto mb-2 h-5 w-5 text-gray-700" /><p className="text-xs text-gray-600">No announcements sent yet</p></div>
        ) : (
          <div className="divide-y divide-gray-800">
            {history.map((rec) => {
              const dateStr = new Date(rec.created_at).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              const isOpen = openId === rec.id
              const rows = recipients[rec.id]
              const unread = rec.recipient_count - rec.read_count
              const pct = rec.recipient_count > 0 ? Math.round((rec.read_count / rec.recipient_count) * 100) : 0
              const notSeen = Array.isArray(rows) ? rows.filter((r) => !r.is_read && !r.opted_out) : []
              const seen = Array.isArray(rows) ? rows.filter((r) => r.is_read) : []
              const optedOut = Array.isArray(rows) ? rows.filter((r) => r.opted_out) : []
              return (
                <div key={rec.id}>
                  <div className="flex items-start transition-colors hover:bg-gray-800/40">
                    <button onClick={() => toggle(rec)} className="flex min-w-0 flex-1 items-start gap-3 px-3 py-4 text-left sm:gap-4 sm:px-5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500/10"><Megaphone className="h-4 w-4 text-rose-400" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-200">{rec.title}</p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{rec.message}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-[10px] text-gray-600">{dateStr}</span>
                          <span className="text-[10px] text-gray-700">·</span>
                          <span className="text-[10px] text-gray-600">by {rec.sender_name ?? 'Admin'}</span>
                          <span className="text-[10px] text-gray-700">·</span>
                          <span className="text-[10px] text-emerald-500">{rec.read_count}/{rec.recipient_count} read ({pct}%)</span>
                          {unread > 0 && (<><span className="text-[10px] text-gray-700">·</span><span className="text-[10px] text-amber-400">{unread} not seen</span></>)}
                        </div>
                      </div>
                      <div className="shrink-0 text-gray-600">{isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div>
                    </button>
                    <button onClick={() => setConfirmDelete(rec)} disabled={deleting === rec.id} title="Delete announcement" className="flex shrink-0 items-center self-stretch px-4 text-gray-600 transition-colors hover:text-red-400 disabled:opacity-40">
                      {deleting === rec.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="border-t border-gray-800/60 bg-gray-950/40 px-5 pb-4 pt-3">
                      {rows === 'loading' || !rows ? (
                        <PageLoader variant="table" />
                      ) : rows.length === 0 ? (
                        <p className="py-2 text-xs text-gray-600">No recipient data found.</p>
                      ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <div>
                            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400"><Clock className="h-3 w-3" />Not Seen ({notSeen.length})</p>
                            <div className="space-y-1.5">
                              {notSeen.length === 0 ? <p className="text-[11px] text-gray-600">Everyone has seen it</p> : notSeen.map((r) => (
                                <div key={r.email} className="flex items-center gap-2"><div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10"><Clock className="h-2.5 w-2.5 text-amber-400" /></div><p className="truncate text-xs text-gray-400">{r.name || r.email}</p></div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400"><Check className="h-3 w-3" />Read ({seen.length})</p>
                            <div className="space-y-1.5">
                              {seen.length === 0 ? <p className="text-[11px] text-gray-600">Nobody has read it yet</p> : seen.map((r) => (
                                <div key={r.email} className="flex items-center gap-2"><div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10"><Check className="h-2.5 w-2.5 text-emerald-400" /></div><p className="truncate text-xs text-gray-400">{r.name || r.email}</p>{r.read_at && <span className="ml-auto shrink-0 text-[10px] text-gray-600">{new Date(r.read_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}</div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500"><XCircle className="h-3 w-3" />Opted Out ({optedOut.length})</p>
                            <div className="space-y-1.5">
                              {optedOut.length === 0 ? <p className="text-[11px] text-gray-600">No one has opted out</p> : optedOut.map((r) => (
                                <div key={r.email} className="flex items-center gap-2"><div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-700/50"><XCircle className="h-2.5 w-2.5 text-gray-500" /></div><p className="truncate text-xs text-gray-600">{r.name || r.email}</p></div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
