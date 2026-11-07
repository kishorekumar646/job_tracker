// Author: Kishore Kumar
// Bottom-right toast (same look as the Job History toast) with success / error variants.
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, X as XIcon } from 'lucide-react'

export type ToastKind = 'success' | 'error'
interface ToastState { message: string; kind: ToastKind; id: number }

/** `notify(message, kind)` shows a toast for 4 s (errors 6 s); a newer toast replaces the current one. */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const [visible, setVisible] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  useEffect(() => clear, [])

  const dismiss = useCallback(() => {
    clear()
    setVisible(false)
    timers.current.push(setTimeout(() => setToast(null), 350))
  }, [])

  const notify = useCallback((message: string, kind: ToastKind = 'success') => {
    clear()
    setToast({ message, kind, id: Date.now() })
    setVisible(true)
    timers.current.push(setTimeout(dismiss, kind === 'error' ? 6000 : 4000))
  }, [dismiss])

  return { toast, visible, notify, dismiss }
}

export function Toast({ toast, visible, onClose }: { toast: ToastState | null; visible: boolean; onClose: () => void }) {
  if (!toast) return null
  const error = toast.kind === 'error'
  return (
    <div
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
      className={`fixed bottom-5 right-5 z-[60] flex max-w-md items-center gap-3 rounded-xl border bg-gray-900 px-4 py-3 shadow-2xl transition-transform duration-300 ease-in-out ${
        error ? 'border-red-500/30' : 'border-emerald-500/30'
      } ${visible ? 'translate-x-0' : 'translate-x-[calc(100%+1.5rem)]'}`}
    >
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${error ? 'bg-red-500/15' : 'bg-emerald-500/15'}`}>
        {error ? <AlertTriangle className="h-4 w-4 text-red-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
      </div>
      <p className="min-w-0 break-words text-sm font-medium text-gray-100">{toast.message}</p>
      <button onClick={onClose} aria-label="Dismiss" className="shrink-0 text-gray-500 hover:text-gray-300">
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
