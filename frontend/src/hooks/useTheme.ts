// Author: Kishore Kumar
import { useEffect } from 'react'
import { AppTheme, getSettings, saveSettings } from '../utils/settings'
import { useThemeStore, injectThemeVars } from '../store/themeStore'
import { useAuthStore } from '../store/authStore'

export function useTheme() {
  const setTheme = useThemeStore((s) => s.setTheme)
  // Re-run whenever the logged-in user changes so each account gets its own theme.
  // setSettingsUser is already called in authStore before this fires.
  const email = useAuthStore((s) => s.user?.email)
  useEffect(() => {
    const theme = getSettings().theme ?? 'indigo'
    injectThemeVars(theme)
    setTheme(theme)
  }, [email])
}

export function applyTheme(theme: AppTheme) {
  injectThemeVars(theme)
  saveSettings({ theme })
  useThemeStore.getState().setTheme(theme)
}
