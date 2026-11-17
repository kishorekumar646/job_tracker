// Author: Kishore Kumar
import { create } from 'zustand'
import axios from 'axios'
import { authApi } from '../api'
import { errorMessage } from '../api/client'
import type { User } from '../types'
import { useSessionStore } from './sessionStore'

interface AuthState {
  user: User | null
  initialized: boolean
  initBusy: boolean
  initError: string | null
  init: () => Promise<void>
  setUser: (u: User | null) => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  initialized: false,
  initBusy: false,
  initError: null,
  init: async () => {
    if (get().initBusy) return
    set({ initBusy: true })
    try {
      const session = await authApi.session()
      set({ user: session.user, initialized: true, initError: null })
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) {
        useSessionStore.getState().clear()
        set({ user: null, initialized: true, initError: null })
      } else {
        set({ initError: errorMessage(error, 'The sign-in server is temporarily unavailable. We will retry automatically.') })
      }
    } finally {
      set({ initBusy: false })
    }
  },
  setUser: (user) => {
    if (!user) useSessionStore.getState().clear()
    set({ user, initialized: true, initError: null })
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
