// Author: Kishore Kumar
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __pwaInstallPrompt: BeforeInstallPromptEvent | null
  }
}

const LS_KEY = 'rca_pwa_installed'

export function usePwaInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => window.__pwaInstallPrompt ?? null
  )

  const [installed, setInstalled] = useState(() =>
    window.matchMedia('(display-mode: standalone)').matches ||
    localStorage.getItem(LS_KEY) === 'true'
  )

  useEffect(() => {
    function onPromptReady() {
      if (window.__pwaInstallPrompt) {
        localStorage.removeItem(LS_KEY)
        setInstalled(false)
        setPrompt(window.__pwaInstallPrompt)
      }
    }

    function onAppInstalled() {
      localStorage.setItem(LS_KEY, 'true')
      setInstalled(true)
      setPrompt(null)
      window.__pwaInstallPrompt = null
    }

    window.addEventListener('pwa-prompt-ready', onPromptReady)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('pwa-prompt-ready', onPromptReady)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  async function install() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      localStorage.setItem(LS_KEY, 'true')
      setInstalled(true)
      setPrompt(null)
      window.__pwaInstallPrompt = null
    }
  }

  return { canInstall: !!prompt && !installed, install, installed }
}
