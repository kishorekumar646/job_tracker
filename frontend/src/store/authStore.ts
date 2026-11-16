// Author: Kishore Kumar
import { create } from 'zustand'
import { authApi } from '../api'
import type { User } from '../types'
import { useSessionStore } from './sessionStore'

interface AuthState {
  user: User | null
  initialized: boolean
  init: () => Promise<void>
  setUser: (u: User | null) => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  initialized: false,
  init: async () => {
    try {
      const session = await authApi.session()
      set({ user: session.user, initialized: true })
    } catch {
      set({ user: null, initialized: true })
    }
  },
  setUser: (user) => {
    if (!user) useSessionStore.getState().clear()
    set({ user })
  },
  logout: async () => {
    try {
      await authApi.logout()
    } finally {
      useSessionStore.getState().clear()
      set({ user: null })
    }
  },
}))
