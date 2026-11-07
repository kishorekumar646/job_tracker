// Author: Kishore Kumar
/**
 * Module-level analysis session manager.
 *
 * Lives outside any React component so the SSE stream and progress ticker
 * survive page navigation. The Zustand store is written to directly so every
 * mounted component that reads from it stays in sync.
 */
import { useAnalyzeStore } from '../store/analyzeStore'
import { useAuthStore } from '../store/authStore'
import { cancelJob } from '../api/rca'

// ── Progress tick ─────────────────────────────────────────────────────────────

let _interval: ReturnType<typeof setInterval> | null = null
let _val = 0
let _ceiling = 7
let _hadError = false

const MILESTONES = [
  { pattern: /starting analysis/i,                            value: 8,  ceiling: 14 },
  { pattern: /fetching run|fetching.*(?:summary|execution)/i, value: 15, ceiling: 27 },
  { pattern: /fetching.*report/i,                             value: 28, ceiling: 47 },
  { pattern: /extracted.*failure/i,                           value: 48, ceiling: 57 },
  { pattern: /running rule engine/i,                          value: 58, ceiling: 79 },
  { pattern: /rule engine done/i,                             value: 80, ceiling: 89 },
  { pattern: /publishing.*verdict/i,                          value: 90, ceiling: 96 },
  { pattern: /✓.*complete|✓\s*done/i,                         value: 97, ceiling: 99 },
]

/** A batch's per-run lines — "[3/10] RUN: …" or "RUN › …" (one run's own log). Skips in them are
 *  part of the batch report, not a failure of the batch. */
const BATCH_RUN_LINE = /\]\s*\[\d+\/\d+\]| › /

function _boostProgress(line: string) {
  for (const { pattern, value, ceiling } of MILESTONES) {
    if (pattern.test(line)) {
      _val = Math.max(_val, value)
      _ceiling = ceiling
      useAnalyzeStore.getState().setProgress(_val)
      break
    }
  }
}

function _startTick() {
  _stopTick()
  _val = 0
  _ceiling = 7
  _hadError = false
  useAnalyzeStore.getState().setProgress(0)
  _interval = setInterval(() => {
    const next = Math.min(_val + 0.4, _ceiling)
    if (next !== _val) {
      _val = next
      useAnalyzeStore.getState().setProgress(Math.round(next))
    }
  }, 500)
}

function _stopTick() {
  if (_interval) { clearInterval(_interval); _interval = null }
}

/** Call when the API call itself throws (e.g. 503, validation error). */
export function signalError() {
  _hadError = true
}

// ── SSE connection ────────────────────────────────────────────────────────────

let _controller: AbortController | null = null

async function _runSSE(sessionId: string, signal: AbortSignal): Promise<void> {
  try {
    const resp = await fetch(`/api/v1/rca/stream/${sessionId}`, {
      credentials: 'include',
      signal,
    })
    if (!resp.ok || !resp.body) return
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const events = buf.split('\n\n')
      buf = events.pop() ?? ''
      for (const event of events) {
        const dataLines = event
          .split('\n')
          .filter((l) => l.startsWith('data: '))
          .map((l) => l.slice(6))
        const msg = dataLines.join('\n')
        if (msg === '__DONE__') return
        if (msg) {
          const store = useAnalyzeStore.getState()
          store.addLog(msg)
          _boostProgress(msg)
          const m = msg.match(/fetching\s+(\d+)\s+report/i)
          if (m) store.setReportCount(parseInt(m[1], 10))
          // In a batch, one skipped run (aborted / still running) is a line in the report, not a failure.
          if (!BATCH_RUN_LINE.test(msg) && /was (?:Aborted|Cancelled)|no results available|still Running|not found in InspectorWeb|✗ Job failed|VPN NOT CONNECTED|InspectorWeb is unreachable/i.test(msg)) {
            _hadError = true
          }
        }
      }
    }
  } catch (e) {
    if ((e as { name?: string }).name !== 'AbortError') {
      // network error — silently ignore; verdicts still come from POST response
    }
  }
}

let _lastProgress = 0

/** Progress the session had reached when it ended (before a success jumps it to 100). */
export function lastProgress(): number {
  return _lastProgress
}

function _finish() {
  _lastProgress = _val
  _stopTick()
  const store = useAnalyzeStore.getState()
  if (_hadError) store.finishError()
  else store.finishSuccess()
}

/**
 * Start a brand-new analysis session.
 * Resets store state, starts progress tick and SSE stream.
 * Returns a Promise that resolves when the stream closes (success or error).
 */
export function launchAnalysisSession(sessionId: string, runUuid = ''): Promise<void> {
  if (_controller) { _controller.abort(); _controller = null }

  _controller = new AbortController()
  useAnalyzeStore.getState().startSession(sessionId, runUuid)
  // Generate a syncJobId for sync runs so the backend can write a RUNNING DB
  // record immediately and the frontend can cancel it before the job finishes.
  if (runUuid) {
    useAnalyzeStore.getState().setSyncJobId(crypto.randomUUID())
  }
  _startTick()

  return _runSSE(sessionId, _controller.signal).then(_finish)
}

/**
 * Immediately stop a running analysis and mark it as failed.
 * Aborts the SSE stream, stops the progress tick, sets the store to error state,
 * and tells the backend to cancel the async job (if one is running).
 * Returns a Promise that resolves once the backend cancel call completes (or
 * immediately if no async job was running) so callers can reload history after.
 */
export async function stopAnalysis(): Promise<void> {
  if (!useAnalyzeStore.getState().loading) return
  const { jobId, syncJobId } = useAnalyzeStore.getState()

  // Resolve display name before touching any state
  const authUser = useAuthStore.getState().user
  const displayName = authUser?.full_name?.trim() || authUser?.email?.split('@')[0] || 'User'
  const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // Add the cancellation line BEFORE aborting the SSE so it renders in the terminal
  useAnalyzeStore.getState().addLog(`[${ts}] ✗ Cancelled by ${displayName}`)

  _hadError = true
  if (_controller) { _controller.abort(); _controller = null }
  _stopTick()
  useAnalyzeStore.getState().finishError()
  if (jobId) {
    await cancelJob(jobId).catch(() => {})
  } else if (syncJobId) {
    await cancelJob(syncJobId).catch(() => {})
  }
}

/**
 * Call on AnalyzePage mount.
 * If an analysis is still in progress but the SSE connection was dropped
 * (navigation away and back), this reconnects the stream transparently.
 */
export function reconnectIfActive(): void {
  const { loading, sessionId } = useAnalyzeStore.getState()
  if (!loading || !sessionId) return
  // Only reconnect if the previous controller is gone or was aborted
  if (_controller && !_controller.signal.aborted) return
  _controller = new AbortController()
  _runSSE(sessionId, _controller.signal).then(() => {
    if (useAnalyzeStore.getState().loading) _finish()
  })
}
