// Author: Kishore Kumar
import { useEffect, useState } from 'react'
import { LogOut, Settings, ShieldAlert, Clock } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useAuth } from '../../hooks/useAuth'
import { getInitials } from '../../utils/user'
import { UserAvatar } from '../ui/UserAvatar'
import { useTokenExpiry } from '../../hooks/useTokenExpiry'

const AVATAR_COLORS = [
  'bg-violet-600', 'bg-indigo-600', 'bg-blue-600', 'bg-cyan-600',
  'bg-teal-600', 'bg-emerald-600', 'bg-amber-600', 'bg-orange-600',
  'bg-rose-600', 'bg-pink-600',
]

interface Props {
  title: string
  onOpenSettings: () => void
}

function hashEmail(email: string): number {
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0
  return h % AVATAR_COLORS.length
}

function formatCountdown(secsLeft: number): string {
  const s = Math.max(0, secsLeft)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function JobPortalHeader({ title, onOpenSettings }: Props) {
  const { user, logout } = useAuth()
  const { expiresAt } = useAuthStore()
  const { showWarning, handleRefresh, handleDismiss } = useTokenExpiry()
  const [profileHover, setProfileHover] = useState(false)

  const initials = getInitials(user?.name ?? undefined, user?.email ?? '')
  const displayName = user?.name ?? user?.email?.split('@')[0] ?? 'User'
  const avatarColor = AVATAR_COLORS[hashEmail(user?.email ?? '')]

  const sessionExpiring = expiresAt != null && (expiresAt - Date.now()) < 5 * 60 * 1000

  useEffect(() => {
    const id = setInterval(() => {}, 15_000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="flex h-16 items-center gap-4 border-b border-gray-800 bg-gray-900/80 px-6">
      <div className="flex-1">
        <h1 className="text-lg font-semibold text-gray-100">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {showWarning && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm text-amber-950">
            <ShieldAlert className="h-4 w-4" />
            Session expiring soon
            <button
              onClick={handleRefresh}
              className="ml-2 rounded-md bg-amber-900 px-2 py-0.5 text-xs font-semibold text-amber-50 transition-colors hover:bg-amber-900"
            >
              Refresh
            </button>
            <button
              onClick={handleDismiss}
              className="rounded-md px-2 py-0.5 text-xs font-semibold text-amber-950 transition-colors hover:bg-amber-400"
            >
              Dismiss
            </button>
          </div>
        )}

        <div
          className="relative"
          onMouseEnter={() => setProfileHover(true)}
          onMouseLeave={() => setProfileHover(false)}
        >
          <button
            onClick={onOpenSettings}
            className="group flex items-center gap-2.5 rounded-xl border border-gray-800 bg-gray-800/50 px-3 py-1.5 transition-colors hover:bg-gray-800 hover:border-gray-700"
          >
            <UserAvatar
              url={user?.avatar_url}
              initials={initials}
              className={`h-7 w-7 text-xs ${avatarColor}`}
            />

            <div className="text-left">
              <p className="max-w-[8rem] truncate text-xs font-medium text-gray-200 leading-tight" title={displayName}>
                {displayName}
              </p>
              <p className={`text-[10px] font-medium leading-tight ${user?.role === 'admin' ? 'text-amber-400' : 'text-gray-500'}`}>
                {user?.role === 'admin' ? 'Admin' : 'Member'}
              </p>
            </div>

            <Settings className="h-3.5 w-3.5 shrink-0 text-gray-600 transition-colors group-hover:text-gray-400" />
          </button>

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
                {sessionExpiring && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500">Session</span>
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-right leading-tight text-amber-400">
                      <Clock className="h-3 w-3" />
                      <span>{expiresAt ? formatCountdown(Math.round((expiresAt - Date.now()) / 1000)) : '…'}</span>
                    </span>
                  </div>
                )}
              </div>
              <div className="border-t border-gray-800 px-4 py-2">
                <p className="text-[10px] text-gray-600">Click to open settings</p>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={logout}
          className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </header>
  )
}