// Author: Kishore Kumar
import { useState } from 'react'
import { Download } from 'lucide-react'
import { recordInstallation, useInstallStore } from '../../pwa'
import { toast } from '../../store/toastStore'
import { Modal, Spinner } from '.'
import { isIosDevice } from '../../utils/device'

export function AppInstall() {
  const { prompt, installed, ready, error } = useInstallStore()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ios = isIosDevice()

  const install = async () => {
    if (!prompt) { setOpen(true); return }
    setBusy(true)
    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') recordInstallation()
      else useInstallStore.setState({ prompt: null })
    } catch (err) {
      console.error('App installation failed', err)
      toast.error('Could not open the install prompt. Use your browser menu to install JobPilot.')
    } finally {
      setBusy(false)
    }
  }

  if (installed) return null

  return (
    <>
      <button onClick={install} disabled={busy} aria-label="Install app" title="Install this app on your device" className="flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-300">
        {busy ? <Spinner /> : <Download className="h-3.5 w-3.5" />}<span className="hidden sm:inline">Install App</span>
      </button>
      <Modal open={open} title="Install JobPilot" onClose={() => setOpen(false)}>
        <div className="space-y-4 text-sm text-gray-300">
          <p>Keep JobPilot on your home screen and open it like an app.</p>
          {!window.isSecureContext ? (
            <p className="text-amber-300">Installation requires HTTPS (or localhost). Open the deployed HTTPS address on your phone.</p>
          ) : error ? <p className="text-amber-300">{error}</p> : ios ? (
            <ol className="list-inside list-decimal space-y-2"><li>Open this page in Safari.</li><li>Tap Share, then Add to Home Screen.</li><li>Enable Open as Web App if offered, then tap Add.</li></ol>
          ) : (
            <ol className="list-inside list-decimal space-y-2"><li>Open JobPilot in Chrome or Edge.</li><li>Open the browser menu.</li><li>Choose Install app or Add to Home screen, then confirm.</li></ol>
          )}
          {window.isSecureContext && !ready && !error && <p className="text-xs text-gray-500">App setup is finishing. Reload if your browser does not offer installation.</p>}
          <p className="text-xs text-gray-500">If already installed, open JobPilot from your apps. Live jobs, payments and auto-apply controls need an internet connection.</p>
        </div>
      </Modal>
    </>
  )
}
