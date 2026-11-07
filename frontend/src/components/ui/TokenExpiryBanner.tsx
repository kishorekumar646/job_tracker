// Author: Kishore Kumar
import { useEffect, useState } from 'react'
import { ShieldAlert, Clock } from 'lucide-react'

interface Props {
  onRefresh: () => void
  onDismiss: () => void
  expiresAt?: number | null
}

function formatCountdown(secsLeft: number): string {
  const s = Math.max(0, secsLeft)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function TokenExpiryBanner({ onRefresh, onDismiss, expiresAt }: Props) {
  const [secsLeft, setSecsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!expiresAt) { setSecsLeft(null); return }

    function tick() {
      setSecsLeft(Math.max(0, Math.floor(expiresAt! * 1000 - Date.now()) / 1000))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const urgent = secsLeft !== null && secsLeft <= 10

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-4 bg-amber-500 px-6 py-3 shadow-lg">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-950">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        Your session expires in:
        <span className={`flex items-center gap-1 ml-1 font-mono font-bold ${urgent ? 'text-red-800' : 'text-amber-900'}`}>
          <Clock className="h-3.5 w-3.5" />
          {secsLeft !== null ? formatCountdown(Math.round(secsLeft)) : '…'}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onRefresh}
          className="rounded-md bg-amber-950 px-4 py-1.5 text-xs font-semibold text-amber-50 transition-colors hover:bg-amber-900"
        >
          Refresh Session
        </button>
        <button
          onClick={onDismiss}
          className="rounded-md border border-amber-950/30 px-4 py-1.5 text-xs font-semibold text-amber-950 transition-colors hover:bg-amber-400"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
