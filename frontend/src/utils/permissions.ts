// Author: Kishore Kumar
import type { AuthUser } from '../types'

/** Permission keys — must match the registry in rca_service/app/auth/permissions.py. */
export const PERMISSIONS = {
  regressionView: 'regression.view',
  regressionRun: 'regression.run',
} as const

/** True when the user holds `key`. Admins hold every permission. */
export function hasPermission(user: Pick<AuthUser, 'role' | 'permissions'> | null | undefined, key: string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  return user.permissions?.includes(key) ?? false
}
