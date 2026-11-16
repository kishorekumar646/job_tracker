// Author: Kishore Kumar
import { create } from 'zustand'
import type { AuthResponse } from '../types'

interface SessionState {
  expiresAt: number | null
  refreshExpiresAt: number | null
  clockOffset: number
  update: (session: AuthResponse) => void
  clear: () => void
}

// Only expiry metadata lives in JS memory. Tokens stay in HttpOnly cookies.
export const useSessionStore = create<SessionState>((set) => ({
  expiresAt: null,
  refreshExpiresAt: null,
  clockOffset: 0,
  update: (session) => set({
    expiresAt: session.expires_at,
    refreshExpiresAt: session.refresh_expires_at,
    clockOffset: session.server_time - Date.now(),
  }),
  clear: () => set({ expiresAt: null, refreshExpiresAt: null, clockOffset: 0 }),
}))
