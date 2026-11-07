// Author: Kishore Kumar
// A refresh button's loading state: true from the click until the reload finishes (kept for at
// least MIN_MS so a fast reload still shows its skeleton instead of a flash). Background polling
// doesn't go through this, so live updates never flicker into skeletons.
import { useCallback, useRef, useState } from 'react'

const MIN_MS = 500

export function useManualRefresh(reload: () => Promise<unknown> | unknown) {
  const [refreshing, setRefreshing] = useState(false)
  const busy = useRef(false)

  const refresh = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setRefreshing(true)
    const started = Date.now()
    try {
      await reload()
    } finally {
      const left = MIN_MS - (Date.now() - started)
      if (left > 0) await new Promise((r) => setTimeout(r, left))
      busy.current = false
      setRefreshing(false)
    }
  }, [reload])

  return { refreshing, refresh }
}
