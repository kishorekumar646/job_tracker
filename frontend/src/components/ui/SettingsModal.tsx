// Author: Kishore Kumar
import { useEffect, useRef, useState } from 'react'
import { useModalEscape } from '../../hooks/useModalEscape'
import { X, Bell, RefreshCw, Megaphone, Palette, Check, ShieldCheck, Monitor, Keyboard, Cake, Camera, Loader2 } from 'lucide-react'
import axios from 'axios'
import { AppSettings, AppTheme, getSettings, saveSettings } from '../../utils/settings'
import { applyTheme } from '../../hooks/useTheme'
import { updateAnnouncementPreference } from '../../api/notifications'
import { deleteAvatar, getMe, updateProfile, uploadAvatar } from '../../api/auth'
import { UserAvatar } from './UserAvatar'
import { useAuthStore } from '../../store/authStore'
import { getInitials } from '../../utils/user'

const THEMES: { id: AppTheme; label: string; swatch: string }[] = [
  { id: 'indigo', label: 'Indigo', swatch: '#6366f1' },
  { id: 'violet', label: 'Violet', swatch: '#8b5cf6' },
  { id: 'teal',   label: 'Teal',   swatch: '#14b8a6' },
  { id: 'rose',   label: 'Rose',   swatch: '#f43f5e' },
]

const PLATFORMS = [
  { value: '',                label: 'All Platforms' },
  { value: 'STB',             label: 'STB' },
  { value: 'PERSEUS_ANDROID', label: 'Perseus Android' },
  { value: 'PERSEUS_IOS',     label: 'Perseus iOS' },
  { value: 'PERSEUS_WEB',     label: 'Perseus Web' },
  { value: 'BROWSERSTACK',    label: 'BrowserStack' },
]

// ── Keyboard shortcuts data ───────────────────────────────────────────────────
const isMac = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac')
const MOD = isMac ? '⌘' : 'Ctrl'

interface ShortcutItem { keys: string[]; label: string; adminOnly?: boolean }
const SHORTCUT_GROUPS: { group: string; items: ShortcutItem[] }[] = [
  {
    group: 'Navigation',
    items: [
      { keys: [MOD, 'D'], label: 'Go to Dashboard' },
      { keys: [MOD, 'A'], label: 'Go to Analyze' },
      { keys: [MOD, 'J'], label: 'Go to Job History' },
      { keys: [MOD, 'H'], label: 'Go to Health Monitor' },
      { keys: [MOD, 'X'], label: 'Go to Admin', adminOnly: true },
    ],
  },
  {
    group: 'Actions',
    items: [
      { keys: [MOD, 'P'], label: 'Open Profile' },
      { keys: [MOD, 'S'], label: 'Focus global search' },
      { keys: ['S'], label: 'Open Settings' },
      { keys: ['?'], label: 'Open shortcuts (this tab)' },
      { keys: ['Esc'], label: 'Close modal / panel' },
    ],
  },
]

function Kbd({ k }: { k: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 rounded-md bg-gray-800 border border-gray-600 text-gray-300 text-xs font-mono font-semibold shadow-sm">
      {k}
    </kbd>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'profile' | 'preferences' | 'shortcuts'

interface Props {
  onClose: () => void
  onSave?: (s: AppSettings) => void
  initialTab?: Tab
}

function formatExpiry(expiresAt: number | null): { label: string; color: string } {
  if (!expiresAt) return { label: 'No active session', color: 'text-gray-500' }
  const ms = expiresAt - Date.now()
  if (ms <= 0) return { label: 'Session expired', color: 'text-red-400' }
  const totalSecs = Math.floor(ms / 1000)
  const hours = Math.floor(totalSecs / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60
  const label = hours > 0
    ? `Expires in ${hours}h ${mins}m ${secs}s`
    : mins > 0
    ? `Expires in ${mins}m ${secs}s`
    : `Expires in ${secs}s`
  const color = totalSecs > 1800 ? 'text-emerald-400' : totalSecs > 300 ? 'text-amber-400' : 'text-red-400'
  return { label, color }
}

export function SettingsModal({ onClose, onSave, initialTab = 'profile' }: Props) {
  useModalEscape(onClose)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [settings, setSettings] = useState<AppSettings>(getSettings)
  const { user, expiresAt, setSession, clearAuth, fetchMe } = useAuthStore()

  // Profile photo
  const photoInput = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState<'upload' | 'remove' | null>(null)
  const [photoMsg, setPhotoMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function onPhotoPicked(file: File | undefined) {
    if (!file) return
    setPhotoMsg(null)
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) { setPhotoMsg({ kind: 'error', text: 'Pick a PNG, JPEG, WebP or GIF image.' }); return }
    if (file.size > 5 * 1024 * 1024) { setPhotoMsg({ kind: 'error', text: 'That image is larger than 5 MB — pick a smaller one.' }); return }
    setPhotoBusy('upload')
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('read failed'))
        reader.readAsDataURL(file)
      })
      await uploadAvatar(dataUrl)
      await fetchMe()
      setPhotoMsg({ kind: 'ok', text: 'Photo updated.' })
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setPhotoMsg({ kind: 'error', text: typeof detail === 'string' ? detail : 'Could not upload the photo. Try again.' })
    } finally {
      setPhotoBusy(null)
      if (photoInput.current) photoInput.current.value = ''
    }
  }

  async function removePhoto() {
    setPhotoMsg(null)
    setPhotoBusy('remove')
    try {
      await deleteAvatar()
      await fetchMe()
      setPhotoMsg({ kind: 'ok', text: 'Photo removed — your initials are shown instead.' })
    } catch {
      setPhotoMsg({ kind: 'error', text: 'Could not remove the photo. Try again.' })
    } finally {
      setPhotoBusy(null)
    }
  }

  const [nameInput, setNameInput] = useState(user?.full_name ?? '')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState('')
  const [nameSaved, setNameSaved] = useState(false)
  const [dobInput, setDobInput] = useState(user?.date_of_birth ?? '')
  const [dobSaving, setDobSaving] = useState(false)
  const [dobSaved, setDobSaved] = useState(false)
  const [dobError, setDobError] = useState('')
  const dobUpdateCount = user?.dob_update_count ?? 0
  const DOB_LIMIT = 2
  const dobLocked = dobUpdateCount >= DOB_LIMIT
  const [renewing, setRenewing] = useState(false)
  const [expiry, setExpiry] = useState(() => formatExpiry(expiresAt))

  useEffect(() => {
    setExpiry(formatExpiry(expiresAt))
    const id = setInterval(() => setExpiry(formatExpiry(expiresAt)), 1_000)
    return () => clearInterval(id)
  }, [expiresAt])

  function toggle(key: keyof AppSettings) {
    setSettings((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      saveSettings({ [key]: next[key] })
      onSave?.(next)
      return next
    })
  }

  function selectTheme(t: AppTheme) {
    setSettings((prev) => ({ ...prev, theme: t }))
    applyTheme(t)
    onSave?.({ ...settings, theme: t })
  }

  function selectPlatform(value: string) {
    const next = saveSettings({ defaultPlatform: value })
    setSettings(next)
    onSave?.(next)
  }

  async function toggleNotifications() {
    if (settings.browserNotifications) { toggle('browserNotifications'); return }
    if (!('Notification' in window)) return
    if (Notification.permission === 'denied') {
      alert('Notification permission is blocked. Enable it in your browser site settings.')
      return
    }
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return
    }
    toggle('browserNotifications')
  }

  async function saveName() {
    const trimmed = nameInput.trim()
    if (!trimmed) { setNameError('Name cannot be empty'); return }
    if (trimmed.length > 15) { setNameError('Max 15 characters'); return }
    setNameSaving(true)
    setNameError('')
    try {
      await updateProfile(trimmed)
      await fetchMe()
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    } catch {
      setNameError('Failed to save. Please try again.')
    } finally {
      setNameSaving(false)
    }
  }

  async function saveDob() {
    setDobSaving(true)
    setDobError('')
    try {
      await updateProfile(nameInput.trim() || user?.full_name || '', dobInput || undefined)
      await fetchMe()
      setDobSaved(true)
      setTimeout(() => setDobSaved(false), 2000)
    } catch {
      setDobError('Failed to save. Please try again.')
    } finally {
      setDobSaving(false)
    }
  }

  function formatDob(dob: string): string {
    const [y, m, d] = dob.split('-')
    const date = new Date(Number(y), Number(m) - 1, Number(d))
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  async function renewSession() {
    setRenewing(true)
    try {
      await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true })
      const profile = await getMe()
      setSession(
        { id: profile.id, email: profile.email, name: profile.name, role: profile.role, is_admin: profile.is_admin },
        Date.now() + 30 * 60 * 1000,
      )
    } catch {
      clearAuth()
      window.location.href = '/login'
    } finally {
      setRenewing(false)
    }
  }

  const initials = getInitials(user?.full_name, user?.email ?? '')

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : null

  const isAdmin = user?.role === 'admin'

  const tabCls = (t: Tab) =>
    `py-2.5 px-4 text-xs font-medium border-b-2 transition-colors ${
      tab === t
        ? 'border-primary-500 text-primary-400'
        : 'border-transparent text-gray-500 hover:text-gray-300'
    }`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-100">Settings</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 px-6">
          <button onClick={() => setTab('profile')} className={tabCls('profile')}>
            Profile
          </button>
          <button onClick={() => setTab('preferences')} className={tabCls('preferences')}>
            Preferences
          </button>
          <button onClick={() => setTab('shortcuts')} className={tabCls('shortcuts')}>
            Shortcuts
          </button>
        </div>

        {/* ── Profile ── */}
        {tab === 'profile' && (
          <div className="px-6 py-5 space-y-5">
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <button type="button" onClick={() => photoInput.current?.click()} disabled={!!photoBusy}
                  aria-label={user?.avatar_url ? 'Change profile photo' : 'Add a profile photo'} title={user?.avatar_url ? 'Change photo' : 'Add a photo'}
                  className="group relative block rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60">
                  <UserAvatar url={user?.avatar_url} initials={initials} className="h-14 w-14 text-lg bg-primary-600" />
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    {photoBusy ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
                  </span>
                </button>
                <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 ring-2 ring-gray-900">
                  <Camera className="h-3 w-3 text-gray-300" />
                </span>
                <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                  onChange={(e) => onPhotoPicked(e.target.files?.[0])} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-100 truncate">{user?.full_name ?? '—'}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                <div className="mt-1 flex items-center gap-3 text-[11px]">
                  <button type="button" onClick={() => photoInput.current?.click()} disabled={!!photoBusy} className="font-medium text-primary-400 hover:text-primary-300 disabled:opacity-50">
                    {photoBusy === 'upload' ? 'Uploading…' : user?.avatar_url ? 'Change photo' : 'Add photo'}
                  </button>
                  {user?.avatar_url && (
                    <button type="button" onClick={removePhoto} disabled={!!photoBusy} className="text-gray-500 hover:text-red-400 disabled:opacity-50">
                      {photoBusy === 'remove' ? 'Removing…' : 'Remove photo'}
                    </button>
                  )}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  isAdmin
                    ? 'bg-amber-900/40 text-amber-400 ring-1 ring-amber-800'
                    : 'bg-primary-900/40 text-primary-400 ring-1 ring-primary-800'
                }`}
              >
                {isAdmin ? 'Admin' : 'User'}
              </span>
            </div>

            {photoMsg ? (
              <p className={`-mt-2 text-xs ${photoMsg.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{photoMsg.text}</p>
            ) : (
              <p className="-mt-2 text-[11px] text-gray-500">PNG, JPEG, WebP or GIF, up to 5 MB. It's cropped to a square and shown to other users of the app.</p>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Full name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => { setNameInput(e.target.value); setNameError(''); setNameSaved(false) }}
                  onKeyDown={(e) => e.key === 'Enter' && saveName()}
                  maxLength={15}
                  placeholder="Your name"
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-primary-500 focus:outline-none"
                />
                <button
                  onClick={saveName}
                  disabled={nameSaving || nameInput.trim() === (user?.full_name ?? '')}
                  className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-40 ${
                    nameSaved
                      ? 'bg-emerald-600 text-white'
                      : 'bg-primary-600 text-white hover:bg-primary-500 disabled:hover:bg-primary-600'
                  }`}
                >
                  {nameSaved ? <Check className="h-4 w-4" /> : nameSaving ? '…' : 'Save'}
                </button>
              </div>
              {nameError && <p className="mt-1 text-xs text-red-400">{nameError}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
              <input
                type="text"
                value={user?.email ?? ''}
                readOnly
                className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-400 cursor-not-allowed"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
                  <Cake className="h-3.5 w-3.5 text-pink-400" />
                  Date of Birth
                </label>
                {!dobLocked ? (
                  <span className="text-[10px] text-gray-500">
                    {DOB_LIMIT - dobUpdateCount} update{DOB_LIMIT - dobUpdateCount !== 1 ? 's' : ''} remaining
                  </span>
                ) : (
                  <span className="text-[10px] text-amber-500 font-medium">Locked — limit reached</span>
                )}
              </div>
              {dobLocked ? (
                <div className="flex items-center gap-3 rounded-lg border border-amber-800/40 bg-amber-900/10 px-3 py-2.5">
                  <Cake className="h-4 w-4 shrink-0 text-amber-500/60" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-300">
                      {dobInput ? formatDob(dobInput) : '—'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-amber-600">
                      Date of birth cannot be changed further
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={dobInput}
                      onChange={(e) => { setDobInput(e.target.value); setDobError(''); setDobSaved(false) }}
                      max={new Date().toISOString().split('T')[0]}
                      className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100
                        focus:border-primary-500 focus:outline-none [color-scheme:dark]"
                    />
                    <button
                      onClick={saveDob}
                      disabled={dobSaving || dobInput === (user?.date_of_birth ?? '')}
                      className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-40 ${
                        dobSaved
                          ? 'bg-emerald-600 text-white'
                          : 'bg-primary-600 text-white hover:bg-primary-500 disabled:hover:bg-primary-600'
                      }`}
                    >
                      {dobSaved ? <Check className="h-4 w-4" /> : dobSaving ? '…' : 'Save'}
                    </button>
                  </div>
                  {dobInput && (
                    <p className="mt-1 text-xs text-gray-500">{formatDob(dobInput)}</p>
                  )}
                  {dobError && <p className="mt-1 text-xs text-red-400">{dobError}</p>}
                </>
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-800/40 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-800">
                  <ShieldCheck className="h-4 w-4 text-primary-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-300">Session</p>
                  <p className={`text-xs font-semibold ${expiry.color}`}>{expiry.label}</p>
                </div>
              </div>
              <button
                onClick={renewSession}
                disabled={renewing}
                className="shrink-0 rounded-lg border border-primary-500/30 bg-primary-500/10 px-3 py-1.5 text-xs font-semibold text-primary-400 transition-colors hover:bg-primary-500/20 disabled:opacity-40"
              >
                {renewing ? '…' : 'Renew'}
              </button>
            </div>

            {memberSince && (
              <p className="text-xs text-gray-500">Member since {memberSince}</p>
            )}
          </div>
        )}

        {/* ── Preferences ── */}
        {tab === 'preferences' && (
          <>
            <div className="space-y-1 px-4 py-4">
              <div className="flex items-start justify-between gap-4 rounded-xl px-2 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-800">
                    <Palette className="h-4 w-4 text-primary-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-200">Accent color</p>
                    <p className="mt-0.5 text-xs text-gray-500">Change the primary color used across the app.</p>
                  </div>
                </div>
                <div className="mt-1 flex shrink-0 gap-2">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      title={t.label}
                      onClick={() => selectTheme(t.id)}
                      className={`h-6 w-6 rounded-full transition-transform focus:outline-none ${
                        settings.theme === t.id
                          ? 'scale-125 ring-2 ring-white/50 ring-offset-1 ring-offset-gray-900'
                          : 'hover:scale-110'
                      }`}
                      style={{ background: t.swatch }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-start justify-between gap-4 rounded-xl px-2 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-800">
                    <Monitor className="h-4 w-4 text-sky-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-200">Default platform</p>
                    <p className="mt-0.5 text-xs text-gray-500">Pre-select this platform on the Analyze page.</p>
                  </div>
                </div>
                <select
                  value={settings.defaultPlatform}
                  onChange={(e) => selectPlatform(e.target.value)}
                  className="mt-0.5 shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 focus:border-primary-500 focus:outline-none"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <SettingRow
                icon={<RefreshCw className="h-4 w-4 text-primary-400" />}
                title="Service health auto-refresh"
                description="Poll service health every 60 s and show alerts in the header bell."
                checked={settings.healthPollEnabled}
                onChange={() => toggle('healthPollEnabled')}
              />
              <SettingRow
                icon={<Bell className="h-4 w-4 text-amber-400" />}
                title="Browser notifications"
                description="Show a browser notification when a service goes offline."
                checked={settings.browserNotifications}
                onChange={toggleNotifications}
              />
              <SettingRow
                icon={<Megaphone className="h-4 w-4 text-emerald-400" />}
                title="Receive announcements"
                description="Show announcements from admins in your notification inbox."
                checked={settings.receiveAnnouncements}
                onChange={() => {
                  const next = !settings.receiveAnnouncements
                  toggle('receiveAnnouncements')
                  updateAnnouncementPreference(next).catch(() => {})
                }}
              />
            </div>

            <div className="border-t border-gray-800 px-6 py-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              <p className="text-xs text-gray-500">
                All changes save automatically. Announcement opt-out is also synced to the server.
              </p>
            </div>
          </>
        )}

        {/* ── Shortcuts ── */}
        {tab === 'shortcuts' && (
          <div className="px-6 py-5 space-y-5">
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Keyboard className="h-3.5 w-3.5 shrink-0" />
              <span>Shortcuts are disabled when typing in an input field.</span>
            </div>

            {SHORTCUT_GROUPS.map(group => (
              <div key={group.group}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  {group.group}
                </p>
                <div className="space-y-2.5">
                  {group.items
                    .filter(item => !item.adminOnly || isAdmin)
                    .map(item => (
                      <div key={item.label} className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">{item.label}</span>
                        <div className="flex items-center gap-1">
                          {item.keys.map((k, i) => (
                            <span key={i} className="flex items-center gap-1">
                              {i > 0 && <span className="text-gray-600 text-xs">+</span>}
                              <Kbd k={k} />
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SettingRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode
  title: string
  description: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl px-2 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-800">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-200">{title}</p>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <div className="mt-1 flex shrink-0 flex-col items-end gap-1">
        <button
          role="switch"
          aria-checked={checked}
          onClick={onChange}
          className={`relative inline-flex h-6 w-11 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
            checked ? 'bg-primary-600' : 'bg-gray-600'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
        <span className={`text-[10px] font-medium ${checked ? 'text-primary-400' : 'text-gray-500'}`}>
          {checked ? 'On' : 'Off'}
        </span>
      </div>
    </div>
  )
}
