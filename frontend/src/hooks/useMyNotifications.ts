// Author: Kishore Kumar
import { useCallback, useEffect, useRef, useState } from 'react'
import { getMyNotifications, markAllNotificationsRead, markNotificationRead } from '../api/notifications'
import { AppNotification } from '../types'
import { getSettings } from '../utils/settings'

export function useMyNotifications(intervalMs = 10_000) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [newCount, setNewCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const prevIds = useRef<Set<number>>(new Set())

  const fetch = useCallback(async () => {
    try {
      const raw = await getMyNotifications()
      const { receiveAnnouncements } = getSettings()
      const data = receiveAnnouncements ? raw : raw.filter((n) => n.notif_type !== 'announcement')
      setNotifications(data)
      // Only count unread notifications that weren't seen in the previous fetch as "new"
      const fresh = data.filter((n) => !prevIds.current.has(n.id) && !n.is_read)
      if (fresh.length > 0) setNewCount((c) => c + fresh.length)
      prevIds.current = new Set(data.map((n) => n.id))
    } catch {
      // Network error — keep existing state, retry next interval
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
    const id = setInterval(fetch, intervalMs)
    function onVisible() {
      if (document.visibilityState === 'visible') fetch()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetch, intervalMs])

  const unreadCount = notifications.filter((n) => !n.is_read).length

  async function markRead(id: number) {
    await markNotificationRead(id)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
  }

  async function markAllRead() {
    await markAllNotificationsRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  function clearNewCount() {
    setNewCount(0)
  }

  return { notifications, unreadCount, newCount, loading, clearNewCount, markRead, markAllRead, refetch: fetch }
}
