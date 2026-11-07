// Author: Kishore Kumar
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { RcaVerdict } from '@/types'
import { useAuthStore } from './authStore'

interface AnalyzeState {
  /** Email of the user this session belongs to — another user must never see it. */
  owner: string
  sessionId: string
  runUuid: string     // set for sync runs; shown in Job History while running
  jobId: string       // set for async runs; used to cancel via API
  syncJobId: string   // set for sync runs; used to cancel via API and track DB record
  startedAt: string   // ISO timestamp when this session started
  logs: string[]
  syncVerdicts: RcaVerdict[] | null
  loading: boolean
  progress: number
  showProgress: boolean
  reportCount: number | null
  progressStatus: 'idle' | 'running' | 'success' | 'error'
  error: string
  vpnError: boolean
  stepDurations: Record<number, number>
}

interface AnalyzeActions {
  startSession: (sessionId: string, runUuid?: string) => void
  addLog: (line: string) => void
  setProgress: (v: number) => void
  setReportCount: (v: number) => void
  setVerdicts: (v: RcaVerdict[]) => void
  setJobId: (id: string) => void
  setSyncJobId: (id: string) => void
  setError: (msg: string, vpn?: boolean) => void
  finishSuccess: () => void
  finishError: () => void
  recordStepDurations: (updates: Record<number, number>) => void
  /** Forget the last session (log, results, step bar) — used when the Analyze page opens. */
  reset: () => void
}

const BLANK: AnalyzeState = {
  owner: '',
  sessionId: '',
  runUuid: '',
  jobId: '',
  syncJobId: '',
  startedAt: '',
  logs: [],
  syncVerdicts: null,
  loading: false,
  progress: 0,
  showProgress: false,
  reportCount: null,
  progressStatus: 'idle',
  error: '',
  vpnError: false,
  stepDurations: {},
}

export const useAnalyzeStore = create<AnalyzeState & AnalyzeActions>()(
  persist(
    (set) => ({
      ...BLANK,
      startSession: (sessionId, runUuid = '') =>
        set({
          ...BLANK,
          owner: useAuthStore.getState().user?.email ?? '',
          sessionId, runUuid, startedAt: new Date().toISOString(), loading: true, showProgress: true,
        }),
      addLog: (line) => set((s) => ({ logs: [...s.logs, line] })),
      setProgress: (progress) => set({ progress }),
      setReportCount: (reportCount) => set({ reportCount }),
      setVerdicts: (syncVerdicts) => set({ syncVerdicts }),
      setJobId: (jobId) => set({ jobId }),
      setSyncJobId: (syncJobId) => set({ syncJobId }),
      setError: (error, vpnError = false) => set({ error, vpnError }),
      finishSuccess: () => set({ loading: false, progress: 100, progressStatus: 'success' }),
      finishError: () => set({ loading: false, progressStatus: 'error' }),
      recordStepDurations: (updates) =>
        set((s) => ({ stepDurations: { ...s.stepDurations, ...updates } })),
      reset: () => set({ ...BLANK }),
    }),
    {
      name: 'rca-analyze-session',
      // Exclude actions — only state fields are serialisable
      partialize: (state) => ({
        owner:          state.owner,
        sessionId:      state.sessionId,
        runUuid:        state.runUuid,
        jobId:          state.jobId,
        syncJobId:      state.syncJobId,
        startedAt:      state.startedAt,
        logs:           state.logs,
        syncVerdicts:   state.syncVerdicts,
        loading:        state.loading,
        progress:       state.progress,
        showProgress:   state.showProgress,
        reportCount:    state.reportCount,
        progressStatus: state.progressStatus,
        error:          state.error,
        vpnError:       state.vpnError,
        stepDurations:  state.stepDurations,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const wasRunning = state.loading
          state.loading = false
          if (wasRunning) {
            // Process was killed mid-flight — reset step bar to avoid stale in-progress state.
            state.showProgress = false
            state.progressStatus = 'idle'
          }
          // If analysis completed (success/error), keep showProgress and progressStatus
          // so the step bar with durations remains visible after browser refresh.

          // A connection error describes that moment, not the current state — don't show
          // a stale "unreachable" banner after a reload when the connection is fine now.
          if (state.vpnError) {
            state.vpnError = false
            state.error = ''
          }
        }
      },
    }
  )
)

/** True when the saved session holds anything worth hiding from another user. */
function hasSession(s: AnalyzeState): boolean {
  return !!(s.sessionId || s.runUuid || s.jobId || s.logs.length || s.syncVerdicts || s.error)
}

/**
 * Keep the Analyze session private to the user who started it: when the signed-in
 * user changes (sign-out, a different user signing in, session expiry) and the saved
 * session belongs to someone else — or to nobody known, from before sessions were
 * tagged — wipe it, in memory and in storage.
 */
function guardOwner(email: string | undefined) {
  const s = useAnalyzeStore.getState()
  if (!hasSession(s) || (email && s.owner === email)) return
  useAnalyzeStore.setState({ ...BLANK })
}

useAuthStore.subscribe((state, prev) => {
  if (state.user?.email !== prev.user?.email) guardOwner(state.user?.email)
})
// Also on load: the persisted session may predate the current sign-in.
useAnalyzeStore.persist.onFinishHydration(() => {
  const { user, isLoading } = useAuthStore.getState()
  if (!isLoading) guardOwner(user?.email)
})
