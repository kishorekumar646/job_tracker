// Author: Kishore Kumar
import { MouseEvent, useEffect, useRef, useState } from 'react'
import { Inbox, LayoutDashboard, FileText, CheckCheck, Megaphone, Clock, User, ArrowLeft, Copy, Check } from 'lucide-react'
import { AppNotification } from '../../types'

interface Props {
  notifications: AppNotification[]
  unreadCount: number
  loading?: boolean
  onMarkRead: (id: number) => void
  onMarkAllRead: () => void
  onClose: () => void
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function parseAnnouncement(message: string | null): { title: string; body: string } {
  if (!message) return { title: 'Announcement', body: '' }
  const idx = message.indexOf(': ')
  if (idx === -1) return { title: message, body: '' }
  return { title: message.slice(0, idx), body: message.slice(idx + 2) }
}

function notifListText(n: AppNotification): { primary: string; secondary?: string } {
  const who = n.sender_name || 'An admin'
  if (n.notif_type === 'dashboard_view') return { primary: `${who} viewed your job history` }
  if (n.notif_type === 'report_view')    return { primary: `${who} viewed your analysis report` }
  if (n.notif_type === 'announcement') {
    const { title, body } = parseAnnouncement(n.message)
    return { primary: title, secondary: body || undefined }
  }
  return { primary: `${who} accessed your data` }
}

function typeIcon(notifType: AppNotification['notif_type'], cls = 'h-3.5 w-3.5') {
  if (notifType === 'dashboard_view') return <LayoutDashboard className={`${cls} text-primary-400`} />
  if (notifType === 'report_view')    return <FileText        className={`${cls} text-amber-400`} />
  return                                     <Megaphone       className={`${cls} text-emerald-400`} />
}

function typeBg(notifType: AppNotification['notif_type']) {
  if (notifType === 'dashboard_view') return 'bg-primary-500/20'
  if (notifType === 'report_view')    return 'bg-amber-500/20'
  return 'bg-emerald-500/20'
}

function typeLabel(notifType: AppNotification['notif_type']) {
  if (notifType === 'dashboard_view') return 'Job History View'
  if (notifType === 'report_view')    return 'Report View'
  return 'Announcement'
}

export function NotificationInbox({ notifications, unreadCount, loading = false, onMarkRead, onMarkAllRead, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const inboxRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<AppNotification | null>(null)
  const [detailOffset, setDetailOffset] = useState(0)
  const [copied, setCopied] = useState(false)

  function copyJobId(uid: string) {
    navigator.clipboard.writeText(uid).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Close when clicking outside the entire panel group
  useEffect(() => {
    function onDown(e: globalThis.MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  // Escape closes detail first, then inbox
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (selected) setSelected(null)
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected, onClose])

  function handleClick(n: AppNotification, e: MouseEvent<HTMLButtonElement>) {
    if (inboxRef.current) {
      const inboxRect = inboxRef.current.getBoundingClientRect()
      const btnRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setDetailOffset(Math.max(0, btnRect.top - inboxRect.top))
    }
    if (!n.is_read) onMarkRead(n.id)
    setCopied(false)
    setSelected(n)
  }

  const who = selected ? (selected.sender_name || 'An admin') : ''
  const { title: annTitle, body: annBody } = selected?.notif_type === 'announcement'
    ? parseAnnouncement(selected.message)
    : { title: '', body: '' }

  return (
    // Outer wrapper — flex row, anchored to top-right of bell button
    <div ref={ref} className="absolute right-0 top-full z-50 mt-1 flex items-start gap-2">

      {/* ── Detail panel (left) — aligned to the clicked notification row ── */}
      {selected && (
        <div
          className="w-80 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
          style={{ animation: 'fadeSlideUp 0.18s ease both', marginTop: detailOffset }}
        >
          {/* Detail header */}
          <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-3">
            <button
              onClick={() => setSelected(null)}
              title="Back to list"
              className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <div className={`flex h-7 w-7 items-center justify-center rounded-full ${typeBg(selected.notif_type)}`}>
              {typeIcon(selected.notif_type)}
            </div>
            <span className="flex-1 text-xs font-semibold text-gray-300">{typeLabel(selected.notif_type)}</span>
          </div>

          {/* Detail body */}
          <div className="space-y-4 px-4 py-4">
            {selected.notif_type === 'announcement' ? (
              <div>
                <p className="text-sm font-semibold text-gray-100">{annTitle}</p>
                {annBody && (
                  <p className="mt-2 text-xs leading-relaxed text-gray-400 whitespace-pre-wrap">{annBody}</p>
                )}
              </div>
            ) : selected.notif_type === 'dashboard_view' ? (
              <p className="text-xs leading-relaxed text-gray-300">
                <span className="font-medium text-gray-100">{who}</span> viewed your complete job history dashboard.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-gray-300">
                  <span className="font-medium text-gray-100">{who}</span> viewed your analysis report.
                </p>
                {selected.job_uid && (
                  <div className="rounded-lg border border-gray-800 bg-gray-800/50 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Job ID</p>
                      <button
                        onClick={() => copyJobId(selected.job_uid!)}
                        title={copied ? 'Copied!' : 'Copy Job ID'}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:bg-gray-700"
                      >
                        {copied
                          ? <><Check className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Copied</span></>
                          : <><Copy className="h-3 w-3 text-gray-500" /><span className="text-gray-500">Copy</span></>
                        }
                      </button>
                    </div>
                    <p className="mt-1 break-all font-mono text-[11px] text-gray-300">{selected.job_uid}</p>
                  </div>
                )}
              </div>
            )}

            {/* Meta */}
            <div className="flex flex-col gap-1.5 border-t border-gray-800 pt-3">
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <User className="h-3.5 w-3.5 shrink-0" />
                {who}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {formatDate(selected.created_at)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Inbox list (right) ── */}
      <div ref={inboxRef} className="w-80 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-gray-200">Notifications</p>
            <p className="mt-0.5 text-[10px] text-gray-600">
              {loading
                ? <span className="animate-pulse">Loading…</span>
                : notifications.length > 0
                  ? unreadCount > 0
                    ? <><span className="text-primary-400">{unreadCount} unread</span> · {notifications.length} total</>
                    : `${notifications.length} total · all read`
                  : 'No notifications'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              title="Mark all as read"
              className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-gray-500 transition-colors hover:text-primary-400"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              All read
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5 h-7 w-7 shrink-0 animate-pulse rounded-full bg-gray-800" />
                <div className="flex-1 space-y-2 py-0.5">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-gray-800" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded bg-gray-800" />
                </div>
              </div>
            ))
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Inbox className="mx-auto mb-2 h-6 w-6 text-gray-700" />
              <p className="text-xs text-gray-600">No notifications yet</p>
            </div>
          ) : (
            notifications.map((n) => {
              const { primary, secondary } = notifListText(n)
              const isActive = selected?.id === n.id
              return (
                <button
                  key={n.id}
                  onClick={(e) => handleClick(n, e)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                    isActive
                      ? 'bg-gray-800'
                      : 'hover:bg-gray-800/60'
                  } ${n.is_read && !isActive ? 'opacity-50' : ''}`}
                >
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${typeBg(n.notif_type)}`}>
                    {typeIcon(n.notif_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`line-clamp-1 text-xs font-medium ${isActive ? 'text-white' : 'text-gray-200'}`}>{primary}</p>
                    {secondary && (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">{secondary}</p>
                    )}
                    <p className="mt-1 text-[10px] text-gray-600">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.is_read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" />
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Footer hint */}
        {notifications.length > 0 && (
          <div className="border-t border-gray-800 px-4 py-2">
            <p className="text-[10px] text-gray-700">Click a notification to see details</p>
          </div>
        )}
      </div>
    </div>
  )
}
