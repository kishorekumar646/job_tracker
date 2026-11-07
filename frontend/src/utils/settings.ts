// Author: Kishore Kumar
// Settings are keyed per user so two accounts on the same machine never share
// theme, default platform, or any other preference.
let _email = 'guest'

export function setSettingsUser(email: string) {
  _email = email || 'guest'
}

function storageKey() {
  return `rca_settings_${_email}`
}

export type AppTheme = 'indigo' | 'violet' | 'teal' | 'rose'

export interface AppSettings {
  healthPollEnabled: boolean
  browserNotifications: boolean
  receiveAnnouncements: boolean
  theme: AppTheme
  defaultPlatform: string  // '' = All Platforms
}

const DEFAULTS: AppSettings = {
  healthPollEnabled: true,
  browserNotifications: false,
  receiveAnnouncements: true,
  theme: 'indigo',
  defaultPlatform: '',
}

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(storageKey())
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  localStorage.setItem(storageKey(), JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('rca-settings-changed', { detail: next }))
  return next
}
