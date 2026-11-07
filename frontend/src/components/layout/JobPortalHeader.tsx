// Author: Kishore Kumar
import { LogOut, User } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useAuth } from '../../hooks/useAuth'

export function JobPortalHeader({ title }: { title: string }) {
  const { user, isAuthenticated } = useAuthStore()
  const { logout } = useAuth()

  return (
    <header className="flex h-16 items-center gap-4 border-b border-gray-800 bg-gray-900/80 px-6">
      <div className="flex-1">
        <h1 className="text-lg font-semibold text-gray-100">{title}</h1>
      </div>

      {isAuthenticated && user && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5">
            <User className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-200">
              {user.name ?? user.email.split('@')[0]}
            </span>
            <span className="text-xs text-gray-500">({user.role})</span>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      )}
    </header>
  )
}