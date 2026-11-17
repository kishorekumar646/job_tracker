// Author: Kishore Kumar
import { Loader2, RefreshCw, WifiOff } from 'lucide-react'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

export function OfflineBanner() {
  const { isOnline, countdown, checking, retry } = useOnlineStatus()
  if (isOnline) return null
  return (
    <>
      <div className="fixed inset-0 z-[69] bg-black/55 backdrop-blur-[1px]" />
      <div className="pointer-events-none fixed inset-x-0 top-6 z-[70] flex justify-center px-4">
        <div className="pointer-events-auto flex animate-offline-in flex-wrap items-center gap-3 rounded-2xl border border-brand-700 bg-brand-950 px-5 py-2.5 shadow-2xl" role="alert">
          <WifiOff className="h-4 w-4 shrink-0 text-red-400" />
          <span className="text-sm font-medium text-red-400">No internet connection</span>
          <span className="text-xs text-brand-300">Retrying in <span className="font-bold text-white">{countdown}s</span></span>
          <button onClick={retry} disabled={checking} className="flex items-center gap-1.5 rounded-lg border border-brand-700 bg-brand-800 px-3.5 py-1.5 text-xs font-semibold text-red-400 transition active:scale-90 disabled:animate-pulse">
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {checking ? 'Checking…' : 'Retry Now'}
          </button>
        </div>
      </div>
    </>
  )
}
