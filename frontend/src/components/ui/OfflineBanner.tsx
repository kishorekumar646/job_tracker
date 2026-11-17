// Author: Kishore Kumar
import { Loader2, RefreshCw, WifiOff } from 'lucide-react'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

export function OfflineBanner() {
  const { isOnline, status, countdown, checking, retry } = useOnlineStatus()
  if (isOnline) return null
  const offline = status === 'offline'
  const reconnecting = status === 'reconnecting'
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-6 z-[70] flex justify-center px-4">
        <div className="pointer-events-auto flex max-w-xl animate-offline-in flex-wrap items-center gap-3 rounded-2xl border border-brand-700 bg-brand-950 px-5 py-2.5 shadow-2xl" role={offline ? 'alert' : 'status'}>
          {offline ? <WifiOff className="h-4 w-4 shrink-0 text-red-400" /> : <Loader2 className={`h-4 w-4 shrink-0 text-brand-300 ${reconnecting ? 'animate-spin' : ''}`} />}
          <div className="min-w-0 flex-1 basis-48">
            <p className={`text-sm font-medium ${offline ? 'text-red-400' : 'text-brand-200'}`}>{offline ? 'No internet connection' : reconnecting ? 'Reconnecting to JobPilot' : 'Cannot reach JobPilot'}</p>
            <p className="mt-1 text-xs text-brand-300">{offline ? 'Reconnect to the internet. This page will retry automatically.' : 'The server may be waking up or temporarily unavailable. Keep this page open; no refresh is needed.'}</p>
          </div>
          {!reconnecting && <span className="text-xs text-brand-300">Retrying in <span className="font-bold text-white">{countdown}s</span></span>}
          {!reconnecting && <button onClick={retry} disabled={checking} className="flex items-center gap-1.5 rounded-lg border border-brand-700 bg-brand-800 px-3.5 py-1.5 text-xs font-semibold text-brand-200 transition active:scale-90 disabled:animate-pulse">
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {checking ? 'Checking…' : 'Retry Now'}
          </button>}
        </div>
      </div>
    </>
  )
}
