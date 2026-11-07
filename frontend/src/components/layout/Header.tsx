// Author: Kishore Kumar
import { useEffect, useRef, useState } from 'react'
import {
  LogOut, HelpCircle, ExternalLink, Bell, Search, X,
  CheckCircle2, ServerCrash, Inbox, Settings, Download,
} from 'lucide-react'
import { Spinner } from '../ui/spinner'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useAuthStore } from '../../store/authStore'
import { Button } from '../ui/Button'
import { useTour } from '../../tour/TourContext'
import { PageId } from '../../tour/tourSteps'
import { useServiceAlerts } from '../../hooks/useServiceAlerts'
import { useMyNotifications } from '../../hooks/useMyNotifications'
import { NotificationInbox } from '../ui/NotificationInbox'
import { getSettings } from '../../utils/settings'
import { UserAvatar } from '../ui/UserAvatar'
import { getInitials } from '../../utils/user'
import { getHistory } from '../../api/rca'
import { StoredAnalysis } from '../../types'
import { usePwaInstall } from '../../hooks/usePwaInstall'
import { InstallAppModal } from '../ui/InstallAppModal'

interface Props {
  title: string
  onOpenSettings: () => void
}

const AVATAR_COLORS = [
  'bg-violet-600', 'bg-indigo-600', 'bg-blue-600', 'bg-cyan-600',
  'bg-teal-600', 'bg-emerald-600', 'bg-amber-600', 'bg-orange-600',
  'bg-rose-600', 'bg-pink-600',
]

function hashEmail(email: string): number {
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0
  return h % AVATAR_COLORS.length
}

const PATH_TO_PAGE: Record<string, PageId> = {
  '/dashboard': 'dashboard',
  '/analyze':   'analyze',
  '/regression': 'regression',
  '/jobs':      'history',
  '/admin':     'admin',
  '/health':    'health',
}

function getDisplayName(fullName: string | undefined, email: string): string {
  return fullName?.trim() || email
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return 'just now'
  return `${Math.floor(s / 60)}m ago`
}

// Fetches every page until a short batch signals the last page, so the result
// covers all jobs regardless of total count — no backend count endpoint needed.
async function fetchAllJobs(): Promise<StoredAnalysis[]> {
  const PAGE_SIZE = 500
  const all: StoredAnalysis[] = []
  let page = 1
  while (true) {
    const batch = await getHistory(page, PAGE_SIZE)
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
    page++
  }
  return all
}

const STATUS_CLS: Record<string, string> = {
  DONE:    'bg-emerald-500/20 text-emerald-400',
  FAILED:  'bg-red-500/20 text-red-400',
  RUNNING: 'bg-blue-500/20 text-blue-400',
  PENDING: 'bg-gray-500/20 text-gray-400',
  STOPPED: 'bg-amber-500/20 text-amber-400',
}

export function Header({ title, onOpenSettings }: Props) {
  const { user, logout } = useAuth()
  const { expiresAt } = useAuthStore()
  const { install, canInstall } = usePwaInstall()
  const [installModalOpen, setInstallModalOpen] = useState(false)
  const { startTour, activePage } = useTour()
  const location = useLocation()
  const navigate = useNavigate()

  const initials    = getInitials(user?.full_name, user?.email ?? '')
  const displayName = getDisplayName(user?.full_name, user?.email ?? '')
  const avatarColor = AVATAR_COLORS[hashEmail(user?.email ?? '')]

  // ── Activity / presence ───────────────────────────────────────────────────
  const [lastActive, setLastActive] = useState(Date.now())
  const [, tick] = useState(0)

  useEffect(() => {
    function touch() { setLastActive(Date.now()) }
    window.addEventListener('mousemove', touch, { passive: true })
    window.addEventListener('keydown', touch, { passive: true })
    return () => {
      window.removeEventListener('mousemove', touch)
      window.removeEventListener('keydown', touch)
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])

  const idleSecs  = (Date.now() - lastActive) / 1000
  const idleMins  = Math.floor(idleSecs / 60)
  const presence  = idleSecs < 2 * 60 ? 'online' : idleSecs < 60 * 60 ? 'away' : 'offline'
  const dotColor  = presence === 'online' ? 'bg-emerald-400' : presence === 'away' ? 'bg-amber-400' : 'bg-gray-500'

  // ── Session expiry warning ─────────────────────────────────────────────────
  const sessionExpiring = expiresAt != null && (expiresAt * 1000 - Date.now()) < 5 * 60 * 1000

  // ── Profile tooltip ───────────────────────────────────────────────────────
  const [profileHover, setProfileHover] = useState(false)

  const pathPageId = Object.entries(PATH_TO_PAGE).find(([path]) =>
    location.pathname === path || location.pathname.startsWith(path + '/')
  )?.[1] ?? null

  const pageId = (location.pathname.startsWith('/admin') && activePage) ? activePage : pathPageId

  const settings = useRef(getSettings()).current
  const { downServices, lastChecked, reachable } = useServiceAlerts(settings.healthPollEnabled, settings.browserNotifications)
  const { notifications, unreadCount, newCount, loading: notifLoading, clearNewCount, markRead, markAllRead } = useMyNotifications()

  // ── Breadcrumb (only on /jobs/:id) ────────────────────────────────────────
  const jobMatch = location.pathname.match(/^\/jobs\/([^/]+)$/)
  const breadcrumb = jobMatch
    ? { parent: 'Job History', parentTo: '/jobs', sub: jobMatch[1].slice(0, 8) + '…' }
    : null

  // ── Bell dropdown ──────────────────────────────────────────────────────────
  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)
  const [inboxOpen, setInboxOpen] = useState(false)

  useEffect(() => {
    if (!bellOpen) return
    function onDown(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [bellOpen])

  // Toast when new unread notifications arrive while the tab is active
  const [inboxToast, setInboxToast] = useState('')
  const [inboxToastVisible, setInboxToastVisible] = useState(false)
  useEffect(() => {
    if (newCount <= 0 || unreadCount <= 0) return
    setInboxToast(`You have ${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`)
    setInboxToastVisible(true)
  }, [newCount, unreadCount])

  // ── Search (always visible, centered) ─────────────────────────────────────
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [allJobs, setAllJobs] = useState<StoredAnalysis[]>([])
  const [searchFetching, setSearchFetching] = useState(false)
  const [searchLoaded, setSearchLoaded] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const showResults = query.trim().length >= 2
  const showShimmer = isTyping || searchFetching

  // Debounce: spinner + shimmer while user is still typing
  useEffect(() => {
    if (query.trim().length < 2) {
      setDebouncedQuery('')
      setIsTyping(false)
      return
    }
    setIsTyping(true)
    const t = setTimeout(() => {
      setDebouncedQuery(query)
      setIsTyping(false)
    }, 650)
    return () => clearTimeout(t)
  }, [query])

  function handleSearchFocus() {
    if (!searchLoaded && !searchFetching) {
      setSearchFetching(true)
      fetchAllJobs()
        .then((d) => { setAllJobs(d); setSearchLoaded(true) })
        .catch(() => setSearchLoaded(true))
        .finally(() => setSearchFetching(false))
    }
  }

  function clearSearch() {
    setQuery('')
    setDebouncedQuery('')
    setIsTyping(false)
    inputRef.current?.focus()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setQuery('')
        setDebouncedQuery('')
        setIsTyping(false)
        inputRef.current?.blur()
      }
    }
    function onDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setQuery('')
        setDebouncedQuery('')
        setIsTyping(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [])

  const searchResults = debouncedQuery.trim().length >= 2
    ? allJobs
        .filter((j) => {
          const q = debouncedQuery.toLowerCase()
          return (
            j.id.toLowerCase().includes(q) ||
            (j.jobId?.toLowerCase().includes(q) ?? false) ||
            (j.runUuid?.toLowerCase().includes(q) ?? false) ||
            (j.executionName?.toLowerCase().includes(q) ?? false)
          )
        })
        .slice(0, 6)
    : []

  function goToJob(j: StoredAnalysis) {
    clearSearch()
    if (j.jobId) navigate(`/jobs/${j.jobId}`)
  }

  return (
    <header className="flex h-16 items-center gap-4 border-b border-gray-800 bg-gray-900/80 px-6 backdrop-blur-sm">

      {/* Left: title / breadcrumb */}
      <div className="min-w-0 flex-1">
        {breadcrumb ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => navigate(breadcrumb.parentTo)}
              className="text-xs text-primary-400 transition-colors hover:text-primary-300"
            >
              {breadcrumb.parent}
            </button>
            <span className="text-xs text-gray-600">/</span>
            <span className="text-xs text-gray-300">{breadcrumb.sub}</span>
          </div>
        ) : (
          <h1 className="text-lg font-semibold text-gray-100">{title}</h1>
        )}
      </div>

      {/* Center: search — always visible */}
      <div className="relative w-96 shrink-0" ref={searchRef}>
        {/* Left icon: spinner while debouncing/fetching, search icon otherwise */}
        {showShimmer
          ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              <Spinner className="size-3.5 text-primary-400" />
            </span>
          : <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
        }
        <input
          ref={inputRef}
          data-global-search
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleSearchFocus}
          placeholder="Search by job ID or execution name…"
          className="w-full rounded-lg border border-gray-700 bg-gray-800 py-1.5 pl-9 pr-8 text-xs text-gray-100 placeholder-gray-600 transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        {/* Right: X to clear — only shown when idle (not searching) */}
        {!showShimmer && query && (
          <button
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-600 transition-colors hover:text-gray-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Dropdown — appears as soon as 2+ chars typed */}
        {showResults && (
          <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
            {showShimmer ? (
              // Shimmer skeletons while debouncing / fetching
              <div className="p-2 space-y-0.5">
                {[{ w: 'w-3/4', w2: 'w-1/2', bw: 'w-14' },
                  { w: 'w-2/3', w2: 'w-2/5', bw: 'w-12' },
                  { w: 'w-4/5', w2: 'w-1/3', bw: 'w-16' }].map((s, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg px-4 py-2.5">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className={`h-3 ${s.w} animate-pulse rounded bg-gray-700`} />
                      <div className={`h-2 ${s.w2} animate-pulse rounded bg-gray-800`} />
                    </div>
                    <div className={`h-5 ${s.bw} shrink-0 animate-pulse rounded-full bg-gray-700`} />
                  </div>
                ))}
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.map((j) => {
                const label = j.executionName || j.jobId || j.id
                const sub   = j.executionName ? (j.jobId ?? j.id) : null
                return (
                  <button
                    key={j.id}
                    onClick={() => goToJob(j)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-800 first:rounded-t-xl last:rounded-b-xl"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-gray-200">{label}</p>
                      {sub && <p className="truncate text-[10px] text-gray-600">{sub}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLS[j.status] ?? STATUS_CLS.PENDING}`}>
                      {j.status}
                    </span>
                  </button>
                )
              })
            ) : (
              <div className="px-4 py-3">
                <p className="text-xs text-gray-500">No matching jobs found.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: actions — InspectorWeb | Guide | Bell | Avatar | Logout */}
      <div className="flex flex-1 items-center justify-end gap-2">

        {/* InspectorWeb */}
        {import.meta.env.VITE_INSPECTORWEB_URL && (
          <a
            href={import.meta.env.VITE_INSPECTORWEB_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Open InspectorWeb in a new tab"
            className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-300"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            InspectorWeb
          </a>
        )}

        {/* Install App — only shown when browser has an install prompt available */}
        {canInstall && (
          <button
            onClick={() => setInstallModalOpen(true)}
            title="Install this app on your device"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-300"
          >
            <Download className="h-3.5 w-3.5" />
            Install App
          </button>
        )}

        {installModalOpen && (
          <InstallAppModal onClose={() => setInstallModalOpen(false)} onInstall={install} />
        )}

        {/* Tour guide */}
        {pageId && (
          <button
            onClick={() => startTour(pageId)}
            title="Quick guide for this page"
            className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-primary-500/50 hover:bg-primary-500/10 hover:text-primary-300"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Guide
          </button>
        )}

        {/* Notification inbox — beside Guide */}
        <div className="relative">
          <button
            onClick={() => { setInboxToastVisible(false); setInboxOpen((o) => !o); clearNewCount() }}
            title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'Notifications'}
            className={`relative flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              unreadCount > 0
                ? 'border-primary-500/40 bg-primary-500/10 text-primary-400 hover:bg-primary-500/20'
                : 'border-gray-700 text-gray-400 hover:border-primary-500/50 hover:bg-primary-500/10 hover:text-primary-300'
            }`}
          >
            <Inbox className="h-3.5 w-3.5" />
            {unreadCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {inboxOpen && (
            <NotificationInbox
              notifications={notifications}
              unreadCount={unreadCount}
              loading={notifLoading}
              onMarkRead={(id) => { setInboxToastVisible(false); markRead(id) }}
              onMarkAllRead={() => { setInboxToastVisible(false); markAllRead() }}
              onClose={() => setInboxOpen(false)}
            />
          )}
        </div>

        {/* Alert bell — beside Guide */}
        <div className="relative" ref={bellRef} data-tour="tour-notifications">
          <button
            onClick={() => { setInboxToastVisible(false); setBellOpen((o) => !o) }}
            title={
              downServices.length > 0
                ? `${downServices.length} service${downServices.length > 1 ? 's' : ''} offline`
                : 'All services online'
            }
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              downServices.length > 0
                ? 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                : 'border-gray-700 text-gray-400 hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-300'
            }`}
          >
            <Bell className="h-3.5 w-3.5" />
            {downServices.length > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {downServices.length}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
              <div className="border-b border-gray-800 px-4 py-3">
                <p className="text-xs font-semibold text-gray-200">Service Status</p>
                {lastChecked && (
                  <p className="mt-0.5 text-[10px] text-gray-600">Checked {timeAgo(lastChecked)}</p>
                )}
              </div>
              <div className="p-2">
                {!reachable ? (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <ServerCrash className="h-4 w-4 shrink-0 text-red-400" />
                      <p className="text-xs font-medium text-red-300">Backend unreachable</p>
                    </div>
                    <p className="mt-1 pl-6 text-[10px] text-red-400/70">Check your VPN connection and try again.</p>
                  </div>
                ) : downServices.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <p className="text-xs text-emerald-400">All services operational</p>
                  </div>
                ) : (
                  downServices.map((s) => (
                    <div key={s.key} className="flex items-center gap-2 rounded-lg px-3 py-2.5">
                      <ServerCrash className="h-4 w-4 shrink-0 text-red-400" />
                      <p className="text-xs text-red-300">{s.label}</p>
                      <span className="ml-auto shrink-0 text-[10px] font-semibold text-red-400">Offline</span>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-gray-800 px-4 py-2.5">
                <button
                  onClick={() => { setBellOpen(false); navigate('/health') }}
                  className="text-[10px] text-primary-400 transition-colors hover:text-primary-300"
                >
                  View full health dashboard →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User profile card */}
        <div
          className="relative"
          onMouseEnter={() => setProfileHover(true)}
          onMouseLeave={() => setProfileHover(false)}
        >
          <button
            onClick={onOpenSettings}
            className="group flex items-center gap-2.5 rounded-xl border border-gray-800 bg-gray-800/50 px-3 py-1.5 transition-colors hover:bg-gray-800 hover:border-gray-700"
          >
            {/* Avatar with expiry ring + presence dot */}
            <div className="relative shrink-0">
              <UserAvatar url={user?.avatar_url} initials={initials}
                className={`h-7 w-7 text-xs ${avatarColor} ${sessionExpiring ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-gray-900' : ''}`} />
              <span className="absolute bottom-0 right-0 h-2 w-2">
                <span className={`absolute inset-0 rounded-full animate-ping opacity-75 ${dotColor}`} />
                <span className={`relative block h-2 w-2 rounded-full border-[1.5px] border-gray-900 ${dotColor}`} />
              </span>
            </div>

            <div className="text-left">
              <p className="max-w-[8rem] truncate text-xs font-medium text-gray-200 leading-tight" title={displayName}>
                {displayName}
              </p>
              <p className={`text-[10px] font-medium leading-tight ${user?.role === 'admin' ? 'text-amber-400' : 'text-gray-500'}`}>
                {user?.role === 'admin' ? 'Admin' : 'Member'}
              </p>
            </div>

            {/* Unread notification badge */}
            {unreadCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}

            <Settings className="h-3.5 w-3.5 shrink-0 text-gray-600 transition-colors group-hover:text-gray-400" />
          </button>

          {/* Hover tooltip */}
          {profileHover && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
                <UserAvatar url={user?.avatar_url} initials={initials} className={`h-9 w-9 text-sm ${avatarColor}`} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-gray-100">{displayName}</p>
                  <p className="truncate text-[10px] text-gray-500">{user?.email}</p>
                </div>
              </div>
              <div className="px-4 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">Role</span>
                  <span className={`text-[10px] font-semibold ${user?.role === 'admin' ? 'text-amber-400' : 'text-gray-300'}`}>
                    {user?.role === 'admin' ? 'Admin' : 'Member'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] text-gray-500 shrink-0">Status</span>
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-right leading-tight">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                    <span className={presence === 'online' ? 'text-emerald-400' : presence === 'away' ? 'text-amber-400' : 'text-gray-500'}>
                      {presence === 'online' ? 'Online'
                        : presence === 'away' ? `Away` : 'Offline'}
                    </span>
                    {presence !== 'online' && (
                      <span className="text-gray-600 font-normal">· Last seen {idleMins}m ago</span>
                    )}
                  </span>
                </div>
                {sessionExpiring && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500">Session</span>
                    <span className="text-[10px] font-semibold text-amber-400">Expiring soon</span>
                  </div>
                )}
              </div>
              <div className="border-t border-gray-800 px-4 py-2">
                <p className="text-[10px] text-gray-600">Click to open settings</p>
              </div>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          icon={<LogOut className="h-4 w-4" />}
          onClick={logout}
        >
          Logout
        </Button>
      </div>

      {/* Notification toast */}
      {inboxToast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-primary-500/30 bg-gray-900 px-4 py-3 shadow-2xl transition-transform duration-300 ${
            inboxToastVisible ? 'translate-x-0' : 'translate-x-[calc(100%+1.5rem)]'
          }`}
        >
          <Inbox className="h-4 w-4 shrink-0 text-primary-400" />
          <button
            className="text-xs font-medium text-gray-100 hover:text-primary-300 transition-colors text-left"
            onClick={() => { setInboxToastVisible(false); setBellOpen(true) }}
          >
            {inboxToast}
          </button>
          <button
            className="ml-1 text-gray-500 hover:text-gray-300 transition-colors"
            onClick={() => setInboxToastVisible(false)}
            aria-label="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </header>
  )
}
