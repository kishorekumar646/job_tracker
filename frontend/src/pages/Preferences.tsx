// Author: Kishore Kumar
import { useState } from 'react'
import { Megaphone } from 'lucide-react'
import { notificationsApi } from '../api'
import { errorMessage } from '../api/client'
import { PreferencesForm, usePreferences } from '../components/features'
import { PageLoader, Toggle } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { toast } from '../store/toastStore'

function NotificationSettings() {
  const { user, setUser } = useAuthStore()
  const [busy, setBusy] = useState(false)
  if (!user) return null
  const on = user.receive_announcements !== false

  const change = async (v: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      setUser(await notificationsApi.setAnnouncements(v))
      toast.success(v ? 'Announcements turned on.' : 'Announcements turned off.')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card card-pad mb-6 flex items-center gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400"><Megaphone className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-gray-100">Notifications</h2>
        <p className="text-xs text-gray-400">Receive announcements from admins in your notification inbox. On by default.</p>
      </div>
      <Toggle checked={on} onChange={change} label="Receive announcements" />
    </section>
  )
}

export function PreferencesPanel() {
  const [prefs, setPrefs] = usePreferences()
  return (
    <>
      <NotificationSettings />
      <p className="mb-5 text-sm text-gray-400">Auto-apply only targets jobs that match these titles, locations and types.</p>
      {prefs ? <PreferencesForm prefs={prefs} onSaved={setPrefs} /> : <PageLoader variant="form" />}
    </>
  )
}
