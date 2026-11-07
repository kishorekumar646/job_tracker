// Author: Kishore Kumar
import { createPortal } from 'react-dom'
import { X, Download, Wifi, Zap, Monitor, Bell, RefreshCw, Shield } from 'lucide-react'
import { useModalEscape } from '../../hooks/useModalEscape'

interface Props {
  onClose: () => void
  onInstall: () => void
}

const FEATURES = [
  { icon: Zap,       label: 'Instant launch',      desc: 'Opens directly from your desktop or taskbar — no browser needed.' },
  { icon: Wifi,      label: 'Offline access',       desc: 'Core pages load even without a network connection.' },
  { icon: Bell,      label: 'Native notifications', desc: 'Get job and alert notifications through your OS.' },
  { icon: Monitor,   label: 'Dedicated window',     desc: 'Runs in its own window, separate from your browser tabs.' },
  { icon: RefreshCw, label: 'Auto updates',         desc: 'Always up to date — no manual reinstall required.' },
  { icon: Shield,    label: 'Secure & sandboxed',   desc: 'Runs in a sandboxed context, same security as the browser.' },
]

export function InstallAppModal({ onClose, onInstall }: Props) {
  useModalEscape(onClose)

  function handleInstall() {
    onClose()
    onInstall()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/15 text-primary-400">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-100">Install Inspector RCA</p>
              <p className="text-xs text-gray-500">Add to your device as an app</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-400 leading-relaxed">
            Install <span className="font-medium text-gray-200">Inspector RCA</span> as a Progressive Web App (PWA) for a faster, more integrated experience — right alongside your other desktop applications.
          </p>

          <div className="grid grid-cols-2 gap-2">
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="rounded-xl border border-gray-800 bg-gray-800/40 px-3 py-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-primary-400" />
                  <p className="text-xs font-medium text-gray-200">{label}</p>
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-gray-600 leading-relaxed">
            You can uninstall the app at any time from your browser settings or OS application manager. No additional software is downloaded.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-800 px-6 py-4">
          <button
            onClick={onClose}
            className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            Not now
          </button>
          <button
            onClick={handleInstall}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-500"
          >
            <Download className="h-3.5 w-3.5" />
            Install App
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
