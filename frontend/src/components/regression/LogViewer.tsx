// Author: Kishore Kumar
// Live log of one test case on one device. While the device is still running the
// test it re-fetches the tail every few seconds (InspectorWeb's own viewer follows
// the same file over a socket); once finished it shows the final tail.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Pause, Play, RefreshCw, Search, X as XIcon } from 'lucide-react'
import { Hint } from '../ui/Hint'
import { getTargetLog, regressionErrorMessage } from '../../api/regression'
import { useModalEscape } from '../../hooks/useModalEscape'
import { useOnlineStore } from '../../store/onlineStore'
import { UuidChip } from './shared'

const POLL_MS = 3_000
const LINE_OPTIONS = [200, 500, 1000, 2000]

// log4js levels, in severity order. Lines without a level (stack traces, wrapped output)
// belong to the level of the line above them.
const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'] as const
type Level = (typeof LEVELS)[number] | 'OTHER'
const LEVEL_RE = /^\[[^\]]*\]\s*\[(TRACE|DEBUG|INFO|WARN|ERROR|FATAL|MARK)\]/
const LEVEL_CHIP: Record<Level, string> = {
  TRACE: 'text-gray-400 ring-gray-600/50',
  DEBUG: 'text-gray-300 ring-gray-500/50',
  INFO: 'text-sky-300 ring-sky-500/40',
  WARN: 'text-amber-300 ring-amber-500/40',
  ERROR: 'text-red-300 ring-red-500/40',
  FATAL: 'text-red-200 ring-red-400/60',
  OTHER: 'text-gray-400 ring-gray-600/50',
}
const LEVELS_KEY = 'rca_log_levels'

function loadLevels(): Set<Level> {
  try {
    const raw = localStorage.getItem(LEVELS_KEY)
    return new Set(raw ? (JSON.parse(raw) as Level[]) : [])
  } catch {
    return new Set()
  }
}

function parseLines(text: string): { line: string; level: Level }[] {
  let current: Level = 'OTHER'
  return text.split('\n').map((line) => {
    const m = LEVEL_RE.exec(line)
    if (m) current = (m[1] === 'MARK' ? 'INFO' : m[1]) as Level
    return { line, level: current }
  })
}

function lineClass(line: string): string {
  if (/\[(ERROR|FATAL)\]/.test(line)) return 'text-red-400'
  if (/\[WARN\]/.test(line)) return 'text-amber-300'
  if (/\[DEBUG\]|\[TRACE\]/.test(line)) return 'text-gray-500'
  if (/STEP\d+|PASSED|passed/.test(line)) return 'text-emerald-300'
  return 'text-gray-300'
}

interface Props {
  runUuid: string
  targetUuid: string
  testCaseName: string
  deviceName: string
  /** True while the device is still executing this test case — enables live following. */
  live: boolean
  inspectorwebLogUrl?: string
  onClose: () => void
}

export function LogViewer({ runUuid, targetUuid, testCaseName, deviceName, live, inspectorwebLogUrl, onClose }: Props) {
  useModalEscape(onClose)
  const isOnline = useOnlineStore((s) => s.isOnline)
  const [kind, setKind] = useState<'log' | 'error'>('log')
  const [lines, setLines] = useState(500)
  const [follow, setFollow] = useState(true)
  const [paused, setPaused] = useState(false)
  const [filter, setFilter] = useState('')
  // Selected log levels; empty = all. Remembered between log windows.
  const [levels, setLevels] = useState<Set<Level>>(loadLevels)
  useEffect(() => {
    try { localStorage.setItem(LEVELS_KEY, JSON.stringify([...levels])) } catch { /* storage unavailable */ }
  }, [levels])
  const [text, setText] = useState('')
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const fetchLog = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getTargetLog(runUuid, targetUuid, kind, lines)
      setText(res.text)
      setMissing(res.missing)
      setError(null)
      setUpdatedAt(new Date())
    } catch (err) {
      setError(regressionErrorMessage(err, 'Could not load the log.'))
    } finally {
      setLoading(false)
    }
  }, [runUuid, targetUuid, kind, lines])

  // Initial load + whenever log kind / size changes.
  useEffect(() => { fetchLog() }, [fetchLog])

  // Follow while the test is running.
  useEffect(() => {
    if (!live || paused || !isOnline) return
    const id = setInterval(fetchLog, POLL_MS)
    return () => clearInterval(id)
  }, [live, paused, isOnline, fetchLog])

  // One last fetch when the test finishes, so the tail includes the end of the run.
  const wasLive = useRef(live)
  useEffect(() => {
    if (wasLive.current && !live) fetchLog()
    wasLive.current = live
  }, [live, fetchLog])

  const parsed = useMemo(() => parseLines(text), [text])
  const levelCounts = useMemo(() => {
    const c: Partial<Record<Level, number>> = {}
    parsed.forEach((p) => { if (p.line.trim()) c[p.level] = (c[p.level] ?? 0) + 1 })
    return c
  }, [parsed])
  const shown = useMemo(() => {
    const needle = filter.toLowerCase()
    return parsed
      .filter((p) => (levels.size === 0 || levels.has(p.level)) && (!needle || p.line.toLowerCase().includes(needle)))
      .map((p) => p.line)
  }, [parsed, levels, filter])
  const filtering = levels.size > 0 || filter.length > 0

  function toggleLevel(l: Level) {
    setLevels((cur) => {
      const next = new Set(cur)
      if (next.has(l)) next.delete(l)
      else next.add(l)
      return next
    })
  }

  useEffect(() => {
    if (follow && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [shown, follow])

  const following = live && !paused && isOnline

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Log for ${testCaseName}`}
        className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-gray-800 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-800 p-4">
          <div className="min-w-0 space-y-1">
            <h2 className="break-words text-sm font-semibold text-gray-100">{testCaseName}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
              <span>on <span className="text-gray-200">{deviceName}</span></span>
              <UuidChip label="Target ID" uuid={targetUuid} />
              {following ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300 ring-1 ring-emerald-500/30">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Live · every {POLL_MS / 1000}s
                </span>
              ) : live ? (
                <span className="rounded-full bg-gray-800 px-2 py-0.5 text-gray-400">{isOnline ? 'Paused' : 'Offline — paused'}</span>
              ) : (
                <span className="rounded-full bg-gray-800 px-2 py-0.5 text-gray-400">Finished</span>
              )}
              {updatedAt && <span className="text-gray-500">updated {updatedAt.toLocaleTimeString()}</span>}
            </div>
          </div>
          <Hint text="Close (Esc)">
            <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-300">
              <XIcon className="h-4 w-4" />
            </button>
          </Hint>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-800 px-4 py-2 text-xs">
          <div className="flex gap-1 rounded-lg bg-gray-800 p-1">
            {(['log', 'error'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-md px-3 py-1 font-medium ${kind === k ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                {k === 'log' ? 'Log' : 'Errors only'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-gray-400">
            Last
            <select
              value={lines}
              onChange={(e) => setLines(Number(e.target.value))}
              className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-gray-200"
            >
              {LINE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            lines
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-500" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter lines…"
              aria-label="Filter log lines"
              className="h-7 w-44 rounded border border-gray-700 bg-gray-800 pl-6 pr-2 text-gray-100 placeholder-gray-500 focus:border-primary-500 focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-1.5 text-gray-400">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="h-3.5 w-3.5" />
            Auto-scroll
          </label>
          <div className="ml-auto flex items-center gap-2">
            {live && (
              <button
                onClick={() => setPaused((p) => !p)}
                className="inline-flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-gray-300 hover:bg-gray-800"
              >
                {paused ? <><Play className="h-3 w-3" /> Resume</> : <><Pause className="h-3 w-3" /> Pause</>}
              </button>
            )}
            <Hint text="Refresh the log now">
              <button onClick={fetchLog} disabled={loading} aria-label="Refresh the log now" className="text-gray-500 hover:text-gray-300 disabled:pointer-events-none disabled:opacity-40">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </Hint>
            {inspectorwebLogUrl && (
              <a href={inspectorwebLogUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-200">
                <ExternalLink className="h-3 w-3" /> InspectorWeb
              </a>
            )}
          </div>
        </div>

        {/* Log levels — pick one or more; none selected = all */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-800 px-4 py-2 text-[11px]">
          <span className="mr-1 text-gray-500">Levels</span>
          <button
            onClick={() => setLevels(new Set())}
            aria-pressed={levels.size === 0}
            className={`rounded-full px-2.5 py-0.5 font-medium ring-1 ${levels.size === 0 ? 'bg-primary-500/20 text-primary-200 ring-primary-500/50' : 'text-gray-400 ring-gray-700 hover:text-gray-200'}`}
          >
            All
          </button>
          {[...LEVELS, 'OTHER' as const].filter((l) => l !== 'OTHER' || levelCounts.OTHER).map((l) => {
            const on = levels.has(l)
            const n = levelCounts[l] ?? 0
            return (
              <button
                key={l}
                onClick={() => toggleLevel(l)}
                aria-pressed={on}
                title={l === 'OTHER' ? 'Lines before the first leveled log line' : `Show ${l} lines`}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium ring-1 transition-colors ${
                  on ? `bg-gray-800 ${LEVEL_CHIP[l]}` : `${n ? 'text-gray-400' : 'text-gray-600'} ring-gray-800 hover:text-gray-200`
                }`}
              >
                {on && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                {l}
                <span className="tabular-nums opacity-70">{n}</span>
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div ref={scroller} className="min-h-[300px] flex-1 overflow-auto bg-gray-950 p-3 font-mono text-[11px] leading-relaxed">
          {error ? (
            <p className="text-amber-400">{error}</p>
          ) : missing || (!loading && !text.trim()) ? (
            <p className="text-gray-500">
              {live ? 'No log lines yet — the device has not written to this log. It will appear here automatically.' : 'No log was written for this device run.'}
            </p>
          ) : filtering && shown.every((l) => !l.trim()) ? (
            <p className="text-gray-500">No lines match the selected levels{filter ? ' and filter' : ''}.</p>
          ) : (
            shown.map((l, i) => (
              <div key={i} className={`whitespace-pre-wrap break-all ${lineClass(l)}`}>{l || ' '}</div>
            ))
          )}
        </div>
        {filtering && !error && (
          <div className="border-t border-gray-800 px-4 py-1.5 text-[11px] text-gray-500">
            Showing {shown.length} of {parsed.filter((p) => p.line.trim()).length} lines
            {levels.size > 0 && <> · levels: {[...levels].join(', ')}</>}
          </div>
        )}
      </div>
    </div>
  )
}
