// Author: Kishore Kumar
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Megaphone, ShieldCheck, CheckCheck } from 'lucide-react'
import { notificationsApi, type AppNotification } from '../../api'
import { timeAgo } from '../ui'
import { errorMessage } from '../../api/client'
import { toast } from '../../store/toastStore'
import { useDataRefresh } from '../../hooks/useDataRefresh'

const ICONS: Record<string, typeof Bell> = { announcement: Megaphone, role_change: ShieldCheck }

export function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const revision = useDataRefresh(15_000)
  const loadId = useRef(0)

  const load = useCallback(async () => {
    const id = ++loadId.current
    try {
      const rows = await notificationsApi.mine()
      if (id === loadId.current) setItems(rows)
    } catch (e) { if (id === loadId.current) toast.error(errorMessage(e)) }
  }, [])

  useEffect(() => {
    load()
    return () => { loadId.current++ }
  }, [load, revision])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const unread = items.filter((n) => !n.is_read).length

  const read = async (n: AppNotification) => {
    if (n.is_read) return
    setItems((p) => p.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
    notificationsApi.markRead(n.id).catch((e) => { toast.error(errorMessage(e)); void load() })
  }
  const readAll = async () => {
    setItems((p) => p.map((x) => ({ ...x, is_read: true })))
    notificationsApi.markAllRead().catch((e) => { toast.error(errorMessage(e)); void load() })
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-label="Notifications" className="relative rounded-xl border border-gray-800 bg-gray-800/50 p-2.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="fixed left-3 right-3 top-[calc(4rem+env(safe-area-inset-top))] z-50 mt-2 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:w-80">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
            <p className="text-sm font-semibold text-gray-100">Notifications</p>
            <button onClick={readAll} disabled={unread === 0} className="flex items-center gap-1 text-[11px] font-medium text-brand-400 hover:text-brand-300 disabled:opacity-40">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
          <div className="max-h-[60dvh] divide-y divide-gray-800 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-10 text-center text-xs text-gray-500">You're all caught up.</p>}
            {items.map((n) => {
              const Icon = ICONS[n.notif_type] ?? Bell
              return (
                <button key={n.id} onClick={() => read(n)} className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-800/60 ${n.is_read ? '' : 'bg-brand-500/5'}`}>
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-xs font-semibold text-gray-100">{n.title}</span>
                      {!n.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />}
                    </span>
                    <span className="mt-0.5 line-clamp-3 block text-xs text-gray-400">{n.message}</span>
                    <span className="mt-1 block text-[10px] text-gray-600">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
