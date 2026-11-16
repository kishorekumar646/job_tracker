// Author: Kishore Kumar
import { create } from 'zustand'

interface OnlineState {
  isOnline: boolean
  setIsOnline: (online: boolean) => void
}

export const useOnlineStore = create<OnlineState>((set) => ({
  isOnline: true,
  setIsOnline: (isOnline) => set({ isOnline }),
}))
