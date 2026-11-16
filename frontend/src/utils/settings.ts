// Author: Kishore Kumar
// Settings are keyed per user so two accounts on the same machine never share a theme.
let _email = 'guest'

export function setSettingsUser(email: string) {
  _email = email || 'guest'
}

export type AppTheme = 'gold' | 'indigo' | 'violet' | 'teal' | 'rose'

export interface AppSettings {
  theme: AppTheme
}

const DEFAULTS: AppSettings = { theme: 'gold' }
const key = () => `jobpilot_settings_${_email}`

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(key())
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  localStorage.setItem(key(), JSON.stringify(next))
  return next
}
