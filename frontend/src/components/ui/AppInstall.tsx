// Author: Kishore Kumar
import { useState } from 'react'
import { Download, ShieldCheck, Smartphone } from 'lucide-react'
import { recordInstallation, useInstallStore } from '../../pwa'
import { toast } from '../../store/toastStore'
import { Modal, Spinner } from '.'
import { isIosDevice } from '../../utils/device'

function InstallPrivacy() {
  return (
    <details className="install-privacy">
      <summary><ShieldCheck size={16} aria-hidden="true" />Before you install: privacy & device access</summary>
      <ul>
        <li><strong>Check the address.</strong> This page is on <code>{window.location.hostname}</code>. Install directly through your browser. Use JobPilot over HTTPS to keep data encrypted in transit.</li>
        <li><strong>Your choice.</strong> This is a browser-installed web app, not an APK or a download from an app store. You can keep using the website without installing.</li>
        <li><strong>Device access.</strong> Installation does not ask for contacts, camera or microphone access. Resume and photo uploads use files you choose. Optional passkeys use your device&apos;s verification; fingerprints and face scans are not sent to JobPilot.</li>
        <li><strong>Account data stays online.</strong> Your profile, resume and tracker records are stored on the server. JobPilot&apos;s service-worker cache stores icons and an offline notice, not account pages, resumes or payment data. Live features need internet.</li>
        <li><strong>You can remove the app.</strong> Use your device&apos;s app settings or browser app menu. Uninstalling does not delete your JobPilot account or server-held data. Use Contact developer on the homepage for account or data requests.</li>
      </ul>
    </details>
  )
}

export function AppInstall({ variant = 'compact' }: { variant?: 'compact' | 'banner' }) {
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

  const button = (
    <button type="button" onClick={install} disabled={busy} aria-label="Install app" title="Install this app on your device" className={variant === 'banner' ? 'landing-button landing-install-button' : 'flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-300'}>
      {busy ? <Spinner /> : <Download className="h-4 w-4" aria-hidden="true" />}<span className={variant === 'banner' ? '' : 'hidden sm:inline'}>{busy ? 'Opening...' : 'Install App'}</span>
    </button>
  )

  return (
    <>
      {variant === 'banner' ? (
        <section className="landing-install-banner landing-container" aria-label="Install JobPilot">
          <span className="landing-install-icon" aria-hidden="true"><Smartphone size={25} /></span>
          <div className="landing-install-copy">
            <p className="landing-install-eyebrow">YOUR WORKSPACE. ALWAYS CLOSE.</p>
            <h2>Your job search, one tap away.</h2>
            <p>Add JobPilot to your home screen. No app store needed.</p>
            <p className="landing-install-reassurance"><ShieldCheck size={13} aria-hidden="true" />No APK download<span aria-hidden="true">/</span>Install is optional</p>
          </div>
          {button}
          <InstallPrivacy />
        </section>
      ) : button}
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
          <InstallPrivacy />
        </div>
      </Modal>
    </>
  )
}
