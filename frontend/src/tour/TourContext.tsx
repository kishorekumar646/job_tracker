// Author: Kishore Kumar
import { createContext, useCallback, useContext, useState, ReactNode } from 'react'
import { PageId, PAGE_TOURS, TourStep } from './tourSteps'

const ALL_PAGE_IDS: PageId[] = [
  'dashboard', 'analyze', 'regression', 'history', 'verdicts',
  'admin', 'admin-history', 'admin-feedback', 'admin-rules', 'admin-announce', 'health',
]
import { TourGuide } from '../components/ui/TourGuide'
import { useAuthStore } from '../store/authStore'

// Per-user, per-page count — auto-show up to MAX_AUTO_SHOWS times, then stop.
// "Don't show again" sets count to DISMISSED so it never shows again for that page.
const MAX_AUTO_SHOWS = 2
const DISMISSED = 99

function countKey(email: string | undefined, pageId: PageId) {
  return `rca_tour_count_${email ?? 'guest'}_${pageId}`
}

function getCount(email: string | undefined, pageId: PageId): number {
  try { return parseInt(localStorage.getItem(countKey(email, pageId)) ?? '0', 10) || 0 } catch { return 0 }
}

function setCount(email: string | undefined, pageId: PageId, n: number) {
  try { localStorage.setItem(countKey(email, pageId), String(n)) } catch {}
}

interface TourCtx {
  startTour: (pageId: PageId) => void
  startTourIfNew: (pageId: PageId) => void
  activePage: PageId | null
  setPageHint: (pageId: PageId) => void
}

const TourContext = createContext<TourCtx>({
  startTour: () => {},
  startTourIfNew: () => {},
  activePage: null,
  setPageHint: () => {},
})

export function TourProvider({ children }: { children: ReactNode }) {
  const email = useAuthStore((s) => s.user?.email)
  const [steps, setSteps] = useState<TourStep[]>([])
  const [stepIndex, setStepIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [activePage, setActivePage] = useState<PageId | null>(null)
  // Tracks which page the currently-open tour belongs to.
  // activePage can be updated by setPageHint mid-tour, so we keep this separate.
  const startTour = useCallback((pageId: PageId) => {
    // Skip steps whose element isn't on screen (e.g. no runs yet) instead of spotlighting nothing.
    const tourSteps = (PAGE_TOURS[pageId] ?? []).filter((s) => document.querySelector(`[data-tour="${s.target}"]`))
    if (!tourSteps.length) return
    setActivePage(pageId)
    setSteps(tourSteps)
    setStepIndex(0)
    setOpen(true)
  }, [])

  // Auto-starts only if this user has seen this page's tour fewer than MAX_AUTO_SHOWS times.
  // The Guide button always uses startTour directly and bypasses this limit.
  const startTourIfNew = useCallback(
    (pageId: PageId) => {
      const count = getCount(email, pageId)
      if (count < MAX_AUTO_SHOWS) {
        setCount(email, pageId, count + 1)
        startTour(pageId)
      }
    },
    [email, startTour],
  )

  function handleDontShowAgain() {
    ALL_PAGE_IDS.forEach((id) => setCount(email, id, DISMISSED))
    setOpen(false)
  }

  const setPageHint = useCallback((pageId: PageId) => {
    setActivePage(pageId)
  }, [])

  return (
    <TourContext.Provider value={{ startTour, startTourIfNew, activePage, setPageHint }}>
      {children}
      {open && (
        <TourGuide
          steps={steps}
          stepIndex={stepIndex}
          onNext={() => setStepIndex((i) => Math.min(i + 1, steps.length - 1))}
          onPrev={() => setStepIndex((i) => Math.max(0, i - 1))}
          onClose={() => setOpen(false)}
          onDontShowAgain={handleDontShowAgain}
        />
      )}
    </TourContext.Provider>
  )
}

export function useTour() {
  return useContext(TourContext)
}
