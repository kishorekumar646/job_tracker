// Author: Kishore Kumar
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Briefcase, LogOut } from 'lucide-react'
import { logout } from '../../api/auth'

export function JobPortalSidebar() {
  async function handleLogout() {
    try { await logout() } catch { /* ignore */ }
    window.location.href = '/login'
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-gray-800 bg-gray-900">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-gray-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600">
          <Briefcase className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-50">Job Tracker</p>
          <p className="text-xs text-primary-400 font-medium">Career Portal</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary-600/20 text-primary-400'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`
          }
        >
          <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
          Dashboard
        </NavLink>
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-800">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </aside>
  )
}