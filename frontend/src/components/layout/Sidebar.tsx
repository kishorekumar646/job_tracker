// Author: Kishore Kumar
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Microscope,
  ClipboardList,
  Activity,
  ShieldCheck,
  Crown,
  LogOut,
  CircleUser,
  MessageSquarePlus,
  PlayCircle,
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { logout } from '../../api/auth'
import { FeedbackModal } from '../ui/FeedbackModal'
import { hasPermission, PERMISSIONS } from '../../utils/permissions'
import { REGRESSION_MAINTENANCE } from '../../utils/features'

// Developer credit in the footer — hidden until deployment; set to true to show it again.
const SHOW_DEVELOPER_CREDIT = false
const DEVELOPER_NAME = 'Kishore Kumar'
const DEVELOPER_EMAIL = 'kishor.m@infosys.com'
// Microsoft Teams deep link: opens a 1:1 chat with the developer, opening message pre-filled
const DEVELOPER_CHAT_URL =
  `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(DEVELOPER_EMAIL)}` +
  `&message=${encodeURIComponent('Hi Kishore, I have a query about Inspector RCA: ')}`

// `permission` hides the item from users who can't open the route (admins see everything).
const NAV: { to: string; icon: typeof LayoutDashboard; label: string; permission?: string }[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/analyze', icon: Microscope, label: 'Analyze' },
  { to: '/regression', icon: PlayCircle, label: 'Regression', permission: PERMISSIONS.regressionView },
  { to: '/jobs', icon: ClipboardList, label: 'Job History' },
  { to: '/health', icon: Activity, label: 'Health' },
]

export function Sidebar() {
  const { user, clearAuth } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const [showFeedback, setShowFeedback] = useState(false)

  async function handleLogout() {
    try { await logout() } catch { /* ignore */ }
    clearAuth()
    window.location.href = '/login'
  }

  return (
    <>
    <aside className="flex h-screen w-60 flex-col border-r border-gray-800 bg-gray-900">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-gray-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-50 leading-tight">Inspector</p>
          <p className="text-xs text-primary-400 font-medium">RCA System</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.filter((item) => !item.permission || hasPermission(user, item.permission)).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-600/20 text-primary-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`
            }
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
            {to === '/regression' && REGRESSION_MAINTENANCE && (
              <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/30">Maintenance</span>
            )}
          </NavLink>
        ))}

        {/* Admin — only visible to admins */}
        {isAdmin && (
          <>
            <div className="my-2 border-t border-gray-800" />
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'text-amber-500/70 hover:bg-amber-500/10 hover:text-amber-400'
                }`
              }
            >
              <Crown className="h-4 w-4 flex-shrink-0" />
              Admin
            </NavLink>
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-800 space-y-3">
        <button
          onClick={() => setShowFeedback(true)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-primary-500/10 hover:text-primary-400"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Give Feedback
        </button>

        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-400">Inspector QA Platform</p>
          {SHOW_DEVELOPER_CREDIT && (
          <a
            href={DEVELOPER_CHAT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-primary-400"
            title={`Chat with ${DEVELOPER_NAME} on Microsoft Teams`}
            aria-label={`Chat with developer ${DEVELOPER_NAME} on Microsoft Teams`}
          >
            <CircleUser className="h-3.5 w-3.5 shrink-0" />
            {DEVELOPER_NAME}
          </a>
          )}
          <p className="text-xs text-gray-500">v0.1.0</p>
        </div>

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </aside>

    {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </>
  )
}
