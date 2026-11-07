// Author: Kishore Kumar
// Single source of truth for service health — one poll, all consumers in sync.
import { create } from 'zustand'
import { getHealth } from '../api/rca'
import { HealthResponse } from '../types'

interface HealthState {
  health: HealthResponse | null
  loading: boolean
  error: boolean
  lastChecked: Date | null
  refresh: () => Promise<void>
}

export const useHealthStore = create<HealthState>((set) => ({
  health: null,
  loading: true,
  error: false,
  lastChecked: null,

  async refresh() {
    set({ loading: true })
    try {
      const data = await getHealth()
      set({ health: data, error: false, lastChecked: new Date(), loading: false })
    } catch {
      set({ health: null, error: true, lastChecked: new Date(), loading: false })
    }
  },
}))
