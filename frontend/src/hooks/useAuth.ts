// Author: Kishore Kumar
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { login as apiLogin, logout as apiLogout } from '../api/auth'

export function useAuth() {
  const { user, isAuthenticated, setSession, clearAuth, fetchMe } = useAuthStore()
  const navigate = useNavigate()

  async function login(email: string, otp: string) {
    const session = await apiLogin(email, otp)
    const userSession = {
      ...session.user,
      is_admin: session.user.role === 'admin',
      name: session.user.name ?? undefined,
      full_name: session.user.name ?? undefined,
    }
    setSession(userSession, session.expires_at)
    await fetchMe()
    navigate('/dashboard')
  }

  async function logout() {
    try {
      await apiLogout()
    } catch {
      // ignore errors — clear locally anyway
    }
    clearAuth()
    navigate('/login')
  }

  return { user, isAuthenticated, login, logout }
}