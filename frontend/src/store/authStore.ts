// Author: Kishore Kumar
import axios from 'axios'
import { create } from 'zustand'
import { UserProfile } from '../types'
import { getMe } from '../api/auth'
import { setSettingsUser } from '../utils/settings'

interface AuthState {
  user: UserProfile | null
  expiresAt: number | null
  isAuthenticated: boolean
  isLoading: boolean
  setSession: (user: UserProfile, expiresAt: number) => void
  clearAuth: () => void
  fetchMe: () => Promise<void>
  initAuth: () => Promise<void>
}

const useAuthStore = create<AuthState>((set) => ({
  user: null,
  expiresAt: null,
  isAuthenticated: false,
  isLoading: true,

  setSession(incoming: UserProfile, expiresAt: number) {
    setSettingsUser(incoming.email)
    localStorage.setItem('expires_at', String(expiresAt))
    sessionStorage.setItem('job_user', JSON.stringify(incoming))
    set({ user: incoming, expiresAt, isAuthenticated: true })
  },

  clearAuth() {
    setSettingsUser('guest')
    localStorage.removeItem('expires_at')
    sessionStorage.removeItem('job_user')
    set({ user: null, expiresAt: null, isAuthenticated: false, isLoading: false })
  },

  async fetchMe() {
    try {
      const profile = await getMe()
      const user: UserProfile = {
        ...profile,
        is_admin: profile.role === 'admin',
        name: profile.full_name ?? undefined,
        full_name: profile.full_name ?? undefined,
      }
      set({ user })
    } catch {
      // silently ignore — in-memory user data still valid
    }
  },

  async initAuth() {
    try {
      const profile = await getMe()
      setSettingsUser(profile.email)
      const user: UserProfile = {
        ...profile,
        is_admin: profile.role === 'admin',
        name: profile.full_name ?? undefined,
        full_name: profile.full_name ?? undefined,
      }
      sessionStorage.setItem('job_user', JSON.stringify(user))

      let expiresAt: number | null = null
      const storedExpiry = localStorage.getItem('expires_at')
      if (storedExpiry) {
        expiresAt = Number(storedExpiry)
      } else {
        // No stored expiry (e.g. first open after PWA close) — silently try refresh.
        try {
          const { data } = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true })
          expiresAt = data.expires_at
          localStorage.setItem('expires_at', String(data.expires_at))
        } catch { /* refresh failed — stay logged in, just no expiry display */ }
      }

      set({ user, expiresAt, isAuthenticated: true, isLoading: false })
    } catch (err) {
      // Network error = server temporarily down. Fall back to cached user so the
      // offline banner can handle recovery without redirecting to login.
      const isNetworkError = !(err as { response?: unknown })?.response
      const cachedUserStr = sessionStorage.getItem('job_user')
      if (isNetworkError && cachedUserStr) {
        try {
          const cachedUser = JSON.parse(cachedUserStr) as UserProfile
          const storedExpiry = localStorage.getItem('expires_at')
          set({ user: cachedUser, expiresAt: storedExpiry ? Number(storedExpiry) : null, isAuthenticated: true, isLoading: false })
          return
        } catch { /* fall through to clearAuth below */ }
      }
      setSettingsUser('guest')
      localStorage.removeItem('expires_at')
      sessionStorage.removeItem('job_user')
      set({ user: null, expiresAt: null, isAuthenticated: false, isLoading: false })
    }
  },
}))

export { useAuthStore }