// Author: Kishore Kumar
// ``busy`` held true for at least ``minMs`` once it turns on — so an automatic background refresh
// shows its shimmer long enough to be seen instead of a one-frame flash.
import { useEffect, useRef, useState } from 'react'

export function useMinBusy(busy: boolean, minMs = 500): boolean {
  const [shown, setShown] = useState(busy)
  const since = useRef<number>(0)

  useEffect(() => {
    if (busy) {
      since.current = Date.now()
      setShown(true)
      return
    }
    const left = minMs - (Date.now() - since.current)
    if (left <= 0) { setShown(false); return }
    const t = setTimeout(() => setShown(false), left)
    return () => clearTimeout(t)
  }, [busy, minMs])

  return shown
}
