// Author: Kishore Kumar
// Shared online/offline state — written by useOnlineStatus, read by ProtectedRoute
// and any code that should behave differently when the API server is unreachable.
import { create } from 'zustand'

interface OnlineState {
  isOnline: boolean
  setIsOnline: (online: boolean) => void
}

export const useOnlineStore = create<OnlineState>((set) => ({
  isOnline: true,
  setIsOnline: (isOnline) => set({ isOnline }),
}))
