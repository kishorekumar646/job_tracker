// Author: Kishore Kumar
// "Under maintenance" popup for a page that is switched off (see utils/features.ts).
import { ReactNode } from 'react'
import { ArrowLeft, Wrench, X } from 'lucide-react'
import { useModalEscape } from '../../hooks/useModalEscape'

interface Props {
  title: string
  children: ReactNode
  /** Main button — usually back to the Dashboard. */
  onLeave: () => void
  leaveLabel?: string
  /** Extra action, e.g. "Open anyway" for admins. */
  extra?: ReactNode
}

export function MaintenanceModal({ title, children, onLeave, leaveLabel = 'Go to Dashboard', extra }: Props) {
  useModalEscape(onLeave)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="relative w-full max-w-md rounded-2xl border border-amber-500/30 bg-gray-900 p-8 shadow-2xl">
        <button onClick={onLeave} aria-label="Close" className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-gray-800 hover:text-gray-300">
          <X className="h-4 w-4" />
        </button>
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
          <Wrench className="h-7 w-7 text-amber-400" />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-gray-100">{title}</h2>
        <div className="mb-6 space-y-1.5 text-sm text-gray-400">{children}</div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onLeave} className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> {leaveLabel}
          </button>
          {extra}
        </div>
      </div>
    </div>
  )
}
