// Author: Kishore Kumar
// Background refresh for lists that other people change (new sign-ups, new jobs, new feedback):
// calls `poll` every `ms` while the tab is visible, and once right away when the user comes back
// to the tab. Errors are the caller's to swallow — a missed poll just keeps the current data.
import { useEffect, useRef } from 'react'

export function useLivePoll(poll: () => unknown, ms: number, enabled = true) {
  const pollRef = useRef(poll)
  pollRef.current = poll

  useEffect(() => {
    if (!enabled) return
    const run = () => { if (document.visibilityState === 'visible') pollRef.current() }
    const id = setInterval(run, ms)
    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', run)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', run)
    }
  }, [ms, enabled])
}
