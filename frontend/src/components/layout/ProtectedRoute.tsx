// Author: Kishore Kumar
import { Navigate } from 'react-router-dom'
import { ReactNode } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useOnlineStore } from '../../store/onlineStore'
import { hasPermission } from '../../utils/permissions'
import { AwaitingApproval } from './AwaitingApproval'

interface Props {
  children: ReactNode
  requiredRole?: string
  /** Permission key from GET /auth/me, e.g. 'regression.view'. Admins always pass. */
  requiredPermission?: string
  /** Admin only route - redirects non-admins to dashboard */
  adminOnly?: boolean
}

export function ProtectedRoute({ children, requiredRole, requiredPermission, adminOnly }: Props) {
  const { isAuthenticated, isLoading, user } = useAuthStore()
  const isOnline = useOnlineStore((s) => s.isOnline)

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <svg className="animate-spin h-8 w-8 text-primary-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  // When the API server is unreachable, don't redirect to login —
  // the OfflineBanner overlay blocks the UI and auto-reloads when the server returns.
  if (!isAuthenticated && !isOnline) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  // A new account can sign in, but sees only the waiting screen until an admin approves it.
  if (user?.is_approved === false && user.role !== 'admin') return <AwaitingApproval />
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/dashboard" replace />
  if (requiredRole && user?.role !== requiredRole) return <Navigate to="/dashboard" replace />
  if (requiredPermission && !hasPermission(user, requiredPermission)) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}
