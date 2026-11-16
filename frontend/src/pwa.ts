// Author: Kishore Kumar
import { create } from 'zustand'

interface InstallPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface InstallState {
  prompt: InstallPrompt | null
  installed: boolean
  ready: boolean
  error: string | null
}

const standalone = () => window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && navigator.standalone === true)

const INSTALL_KEY = 'jobpilot_pwa_installed'

function wasInstalled(): boolean {
  try {
    return localStorage.getItem(INSTALL_KEY) === 'true'
  } catch (error) {
    console.warn('Could not read app installation preference', error)
    return false
  }
}

export function recordInstallation() {
  try {
    localStorage.setItem(INSTALL_KEY, 'true')
  } catch (error) {
    console.warn('Could not save app installation preference', error)
  }
  useInstallStore.setState({ prompt: null, installed: true })
}

export const useInstallStore = create<InstallState>(() => ({
  prompt: null, installed: standalone() || wasInstalled(), ready: false, error: null,
}))

if (standalone()) recordInstallation()

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  // A fresh native prompt confirms the app is eligible again (e.g. after uninstall).
  try {
    localStorage.removeItem(INSTALL_KEY)
  } catch (error) {
    console.warn('Could not reset app installation preference', error)
  }
  useInstallStore.setState({ prompt: event as InstallPrompt, installed: false })
})
window.addEventListener('appinstalled', recordInstallation)
window.addEventListener('storage', (event) => {
  if (event.key === INSTALL_KEY || event.key === null) {
    useInstallStore.setState({ installed: standalone() || wasInstalled() })
  }
})
window.matchMedia('(display-mode: standalone)').addEventListener('change', () => {
  if (standalone()) recordInstallation()
  else useInstallStore.setState({ installed: wasInstalled() })
})

export async function registerPwa() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return
  try {
    await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    await navigator.serviceWorker.ready
    useInstallStore.setState({ ready: true, error: null })
  } catch (error) {
    console.error('JobPilot service worker registration failed', error)
    useInstallStore.setState({ error: 'App installation is unavailable. Reload the page and try again.' })
  }
}
