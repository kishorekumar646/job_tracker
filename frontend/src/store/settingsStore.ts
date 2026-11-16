// Author: Kishore Kumar
import { create } from 'zustand'

export type SettingsTab = 'profile' | 'security' | 'preferences' | 'shortcuts'

interface SettingsState {
  open: boolean
  tab: SettingsTab
  openSettings: (tab?: SettingsTab) => void
  close: () => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  open: false,
  tab: 'profile',
  openSettings: (tab = 'profile') => set({ open: true, tab }),
  close: () => set({ open: false }),
}))
