// Author: Kishore Kumar
import { useEffect, useState } from 'react'
import { subscribeToDataChanges } from '../utils/dataSync'

export function useDataRefresh(intervalMs = 30_000): number {
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) setRevision((value) => value + 1)
    }
    const unsubscribe = subscribeToDataChanges(refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = setInterval(refresh, intervalMs)
    return () => {
      unsubscribe()
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      clearInterval(timer)
    }
  }, [intervalMs])
  return revision
}
