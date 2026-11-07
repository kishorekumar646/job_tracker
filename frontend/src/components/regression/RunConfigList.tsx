// Author: Kishore Kumar
// Run-config overview for the Regression tab, modelled on InspectorWeb's "Run Config
// Overview": Name / Uuid / Labels filters (always your own configs), numbered pagination, and per-config
// actions (download, executions, execute, raw, duplicate, edit, delete).
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleUser,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  GitBranch,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Tag,
  Trash2,
  X as XIcon,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Hint } from '../ui/Hint'
import { RunConfigRowSkeleton } from './skeletons'
import { useModalEscape } from '../../hooks/useModalEscape'
import {
  deleteRunConfig,
  getRunConfigFilterOptions,
  getRunConfigRaw,
  listRunConfigs,
  RawRunConfig,
  regressionErrorMessage,
  RunConfigFilters,
  RunConfigSummary,
  TargetSelector,
} from '../../api/regression'

const PAGE_SIZES = [15, 25, 50]
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** "11:24:02 02/02/2026" — InspectorWeb's format. */
function formatSaved(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

function formatTimeout(ms: number | null): string {
  if (!ms) return '—'
  const min = Math.round(ms / 60000)
  return min >= 60 ? `${+(min / 60).toFixed(1)} h` : `${min} min`
}

function selectorText(group: TargetSelector[]): string {
  return group.map((s) => `${s.type}=${s.value}${s.regex ? ' (regex)' : ''}`).join(' · ')
}

/** 1 2 3 4 5 … 415 style page list. */
function pageItems(current: number, last: number): (number | '…')[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '…', last]
  if (current >= last - 3) return [1, '…', last - 4, last - 3, last - 2, last - 1, last]
  return [1, '…', current - 1, current, current + 1, '…', last]
}

/** Same JSON InspectorWeb's download button saves: the runconfig plus name and uuid. */
function rawJson(raw: RawRunConfig): string {
  return JSON.stringify({ ...raw.runconfig, name: raw.name, uuid: raw.uuid }, null, 4)
}

function downloadJson(raw: RawRunConfig) {
  const url = URL.createObjectURL(new Blob([rawJson(raw)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${raw.name}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Small pieces ────────────────────────────────────────────────────────────

function FilterInput({
  label, value, onChange, column, disabled, error, placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  column?: 'name' | 'label' | 'username'
  disabled?: boolean
  error?: string
  placeholder?: string
}) {
  const [options, setOptions] = useState<string[]>([])
  const listId = column ? `rc-filter-${column}` : undefined
  useEffect(() => {
    if (!column || disabled) return
    const t = setTimeout(() => {
      getRunConfigFilterOptions(column, value).then(setOptions).catch(() => setOptions([]))
    }, 300)
    return () => clearTimeout(t)
  }, [column, value, disabled])

  return (
    <div className="min-w-0">
      <label className="block text-[11px] font-medium text-gray-500">{label}</label>
      <div className="relative">
        <input
          list={listId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={`Filter by ${label}`}
          className={`h-8 w-full border-b bg-transparent pr-5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none disabled:text-gray-500 ${
            error ? 'border-red-500' : 'border-gray-700 focus:border-primary-500'
          }`}
        />
        {value && !disabled && (
          <button onClick={() => onChange('')} aria-label={`Clear ${label}`} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200">
            <XIcon className="h-3 w-3" />
          </button>
        )}
      </div>
      {listId && <datalist id={listId}>{options.map((o) => <option key={o} value={o} />)}</datalist>}
      {error && <p className="mt-0.5 text-[10px] text-red-400">{error}</p>}
    </div>
  )
}

function IconAction({
  title, onClick, href, disabled, danger, children,
}: {
  title: string
  onClick?: () => void
  href?: string
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  const cls = `flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-30 ${
    danger ? 'text-gray-400 hover:bg-red-500/10 hover:text-red-400' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
  }`
  if (href && !disabled) {
    return (
      <Hint text={title}>
        <a href={href} target="_blank" rel="noopener noreferrer" aria-label={title} className={cls} onClick={(e) => e.stopPropagation()}>
          {children}
        </a>
      </Hint>
    )
  }
  return (
    <Hint text={title} className={disabled ? 'cursor-not-allowed' : ''}>
      <button
        aria-label={title}
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); onClick?.() }}
        className={cls}
      >
        {children}
      </button>
    </Hint>
  )
}

function Dialog({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useModalEscape(onClose)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[85vh] w-full flex-col rounded-xl border border-gray-800 bg-gray-900 shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-800 p-4">
          <h2 className="min-w-0 break-words text-sm font-semibold text-gray-100">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-300"><XIcon className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm text-gray-300">{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-gray-800 p-3">{footer}</div>}
      </div>
    </div>
  )
}

// ── List ────────────────────────────────────────────────────────────────────

interface Props {
  canRun: boolean
  /** InspectorWeb username of the signed-in user (email local part). */
  username: string
  /** Bump to reload (e.g. after a save). */
  refreshKey: number
  onNew: () => void
  /** Open the user's schedules in this panel. */
  onSchedules: () => void
  onRun: (rc: RunConfigSummary) => void
  /** Show this config's executions in the runs panel. */
  onExecutions: (rc: RunConfigSummary) => void
  onEdit: (raw: RawRunConfig) => void
  onDuplicate: (raw: RawRunConfig) => void
  /** Show a toast for the outcome of an action (delete, download, …). */
  onNotify?: (message: string, kind?: 'success' | 'error') => void
}

export function RunConfigList({ canRun, username, refreshKey, onNew, onSchedules, onRun, onExecutions, onEdit, onDuplicate, onNotify }: Props) {
  const [filters, setFilters] = useState<Required<Omit<RunConfigFilters, 'all'>>>({ name: '', uuid: '', label: '', username: '' })
  const [debounced, setDebounced] = useState(filters)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [rows, setRows] = useState<RunConfigSummary[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  // Refresh button: show the row skeletons until the reload ends (at least 500 ms, so it doesn't flash).
  const [manualAt, setManualAt] = useState<number | null>(null)
  useEffect(() => {
    if (manualAt === null || loading) return
    const t = setTimeout(() => setManualAt(null), Math.max(0, 500 - (Date.now() - manualAt)))
    return () => clearTimeout(t)
  }, [manualAt, loading])
  const [expanded, setExpanded] = useState<string | null>(null)

  const [busy, setBusy] = useState<string | null>(null) // uuid of the row an action is loading for
  const [actionError, setActionError] = useState<string | null>(null)
  const [rawView, setRawView] = useState<RawRunConfig | null>(null)
  const [toDelete, setToDelete] = useState<RunConfigSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  const uuidError = filters.uuid && !UUID_RE.test(filters.uuid.trim()) ? 'Enter the full UUID' : undefined

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(filters); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [filters])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const uuid = UUID_RE.test(debounced.uuid.trim()) ? debounced.uuid.trim() : ''
      const res = await listRunConfigs({ ...debounced, uuid }, page, pageSize)
      setRows(res.data)
      setTotal(res.total)
      setTotalPages(Math.max(1, res.totalPage))
      setError(null)
    } catch (err) {
      setError(regressionErrorMessage(err, 'Could not load run configs.'))
    } finally {
      setLoading(false)
    }
  }, [debounced, page, pageSize])

  useEffect(() => { load() }, [load, refreshKey, reload])

  async function withRaw(rc: RunConfigSummary, fn: (raw: RawRunConfig) => void) {
    setBusy(rc.uuid)
    setActionError(null)
    try {
      fn(await getRunConfigRaw(rc.uuid))
    } catch (err) {
      const msg = regressionErrorMessage(err, 'Could not load the run config.')
      setActionError(msg)
      onNotify?.(msg, 'error')
    } finally {
      setBusy(null)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      await deleteRunConfig(toDelete.uuid)
      onNotify?.(`Run config “${toDelete.name}” deleted`)
      setToDelete(null)
      setReload((r) => r + 1)
    } catch (err) {
      const msg = regressionErrorMessage(err, 'Delete failed.')
      setActionError(msg)
      onNotify?.(`Couldn't delete “${toDelete.name}”: ${msg}`, 'error')
      setToDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const pages = useMemo(() => pageItems(page, totalPages), [page, totalPages])
  const set = (k: keyof typeof filters) => (v: string) => setFilters((f) => ({ ...f, [k]: v }))

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Title + filters */}
      <div className="shrink-0 space-y-3 border-b border-gray-800 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-100">My run configs</h2>
          <div className="flex items-center gap-2">
            <span data-tour="tour-reg-schedules"><Button size="sm" variant="secondary" icon={<CalendarClock className="h-3.5 w-3.5" />} onClick={onSchedules}>Schedules</Button></span>
            {canRun && (
              <span data-tour="tour-reg-new"><Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={onNew}>New run config</Button></span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3" data-tour="tour-reg-filters">
          <FilterInput label="Name" value={filters.name} onChange={set('name')} column="name" />
          <FilterInput label="Uuid" value={filters.uuid} onChange={set('uuid')} error={uuidError} placeholder="full UUID" />
          <FilterInput label="Labels" value={filters.label} onChange={set('label')} column="label" />
        </div>
        {/* Pagination bar */}
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-gray-400">
          <div className="flex items-center gap-0.5">
            <button onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Previous page" className="rounded p-1 hover:bg-gray-800 disabled:opacity-30">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            {pages.map((p, i) => p === '…' ? (
              <span key={`e${i}`} className="px-1 text-gray-600">…</span>
            ) : (
              <button
                key={p}
                onClick={() => setPage(p)}
                aria-current={p === page ? 'page' : undefined}
                className={`h-6 min-w-[24px] rounded-full px-1.5 tabular-nums ${p === page ? 'bg-primary-600 font-semibold text-white' : 'hover:bg-gray-800'}`}
              >
                {p}
              </button>
            ))}
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} aria-label="Next page" className="rounded p-1 hover:bg-gray-800 disabled:opacity-30">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
            aria-label="Rows per page"
            className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-gray-200"
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="border-l border-gray-700 pl-3 tabular-nums">Total: {total.toLocaleString()}</span>
          <Hint text="Refresh">
            <button onClick={() => { setManualAt(Date.now()); setReload((r) => r + 1) }} aria-label="Refresh" className="text-gray-400 hover:text-gray-100">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </Hint>
        </div>
        {actionError && <p className="text-xs text-red-400">{actionError}</p>}
      </div>

      {/* Rows */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <p className="p-4 text-sm text-red-400">{error}</p>
        ) : (loading && rows.length === 0) || manualAt !== null ? (
          <div className="divide-y divide-gray-800">{Array.from({ length: 6 }).map((_, i) => <RunConfigRowSkeleton key={i} />)}</div>
        ) : rows.length === 0 ? (
          Object.values(debounced).some(Boolean) ? (
            <p className="p-6 text-center text-sm text-gray-500">No run configs match these filters.</p>
          ) : (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-gray-400">You haven't created any run configs yet.</p>
              {canRun && <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={onNew}>New run config</Button>}
            </div>
          )
        ) : (
          <ul className="divide-y divide-gray-800">
            {rows.map((rc, rowIndex) => {
              const mine = (rc.owner ?? '').toLowerCase() === username.toLowerCase()
              const open = expanded === rc.uuid
              return (
                <li key={rc.uuid} className={open ? 'bg-gray-800/30' : ''}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpanded(open ? null : rc.uuid)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setExpanded(open ? null : rc.uuid) }}
                    aria-expanded={open}
                    className="cursor-pointer px-4 py-3 hover:bg-gray-800/40"
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="mt-1 h-4 w-4 shrink-0 text-gray-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[10px] text-gray-500">{rc.uuid}</p>
                        <p className="truncate text-sm text-gray-100" title={rc.name}>{rc.name}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-gray-400">
                          <Hint text="Username"><span className="inline-flex items-center gap-1"><CircleUser className="h-3 w-3" />{rc.owner ?? '—'}</span></Hint>
                          <Hint text="Last updated"><span className="inline-flex items-center gap-1"><Save className="h-3 w-3" />{formatSaved(rc.updated)}</span></Hint>
                        </p>
                      </div>
                    {/* Actions — one straight row on the right */}
                    <div className="flex shrink-0 items-center gap-0.5 self-center" data-tour={rowIndex === 0 ? 'tour-reg-row-actions' : undefined}>
                      <IconAction title="Download JSON" onClick={() => withRaw(rc, downloadJson)} disabled={busy === rc.uuid}>
                        <Download className="h-4 w-4" />
                      </IconAction>
                      <IconAction title="Show executions in the runs panel" onClick={() => onExecutions(rc)}>
                        <Eye className="h-4 w-4" />
                      </IconAction>
                      <IconAction title={canRun ? 'Execute once' : 'Needs Regression: run'} onClick={() => onRun(rc)} disabled={!canRun}>
                        <Play className="h-4 w-4" />
                      </IconAction>
                      <IconAction title="Raw details" onClick={() => withRaw(rc, setRawView)} disabled={busy === rc.uuid}>
                        <Code2 className="h-4 w-4" />
                      </IconAction>
                      <IconAction title={canRun ? 'Duplicate' : 'Needs Regression: run'} onClick={() => withRaw(rc, onDuplicate)} disabled={!canRun || busy === rc.uuid}>
                        <Copy className="h-4 w-4" />
                      </IconAction>
                      <IconAction
                        title={!canRun ? 'Needs Regression: run' : mine ? 'Edit' : 'Only the owner can edit — duplicate it instead'}
                        onClick={() => withRaw(rc, onEdit)}
                        disabled={!canRun || !mine || busy === rc.uuid}
                      >
                        <Pencil className="h-4 w-4" />
                      </IconAction>
                      <IconAction
                        title={!canRun ? 'Needs Regression: run' : mine ? 'Delete' : 'Only the owner can delete'}
                        onClick={() => setToDelete(rc)}
                        disabled={!canRun || !mine}
                        danger
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconAction>
                    </div>
                    </div>
                  </div>

                  {open && (
                    <div className="px-4 pb-4 pl-11">
                      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 rounded-lg bg-gray-900/60 p-3 text-xs">
                        <dt className="text-gray-500">Platform</dt><dd className="text-gray-300">{(rc.platforms ?? ['STB']).join(' + ')}</dd>
                        <dt className="text-gray-500">Branch</dt><dd className="inline-flex items-center gap-1 text-gray-300"><GitBranch className="h-3 w-3" />{rc.branch ?? '—'}</dd>
                        <dt className="text-gray-500">Timeout</dt><dd className="text-gray-300">{formatTimeout(rc.timeOut)}</dd>
                        <dt className="text-gray-500">Devices</dt>
                        <dd className="space-y-1 text-gray-300">
                          {rc.targets.length === 0 ? '—' : rc.targets.map((g, i) => <p key={i} className="break-words font-mono text-[11px]">{selectorText(g)}</p>)}
                        </dd>
                        <dt className="text-gray-500">Tests</dt>
                        <dd className="text-gray-300">
                          {rc.jql.length > 0 ? `${rc.jql.length} Xray quer${rc.jql.length === 1 ? 'y' : 'ies'}` : `${rc.testCases.length} test file${rc.testCases.length === 1 ? '' : 's'}`}
                        </dd>
                        {rc.labels.length > 0 && (
                          <>
                            <dt className="text-gray-500">Labels</dt>
                            <dd className="flex flex-wrap gap-1">
                              {rc.labels.map((l) => (
                                <span key={l} className="inline-flex items-center gap-1 rounded bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-400"><Tag className="h-2.5 w-2.5" />{l}</span>
                              ))}
                            </dd>
                          </>
                        )}
                      </dl>
                      <a href={rc.inspectorwebUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300">
                        <ExternalLink className="h-3 w-3" /> Open in InspectorWeb
                      </a>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {rawView && (
        <Dialog
          wide
          title={`Raw details — ${rawView.name}`}
          onClose={() => setRawView(null)}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(rawJson(rawView)).catch(() => {})}>Copy</Button>
              <Button size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => downloadJson(rawView)}>Download</Button>
            </>
          }
        >
          <pre className="whitespace-pre-wrap break-all rounded-lg bg-gray-950 p-3 font-mono text-[11px] leading-relaxed text-gray-300">{rawJson(rawView)}</pre>
        </Dialog>
      )}

      {toDelete && (
        <Dialog
          title="Delete run config?"
          onClose={() => !deleting && setToDelete(null)}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setToDelete(null)} disabled={deleting}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={confirmDelete} loading={deleting}>Delete</Button>
            </>
          }
        >
          <Fragment>
            <p><span className="font-semibold text-gray-100">{toDelete.name}</span> will be removed from InspectorWeb (soft delete — it expires and disappears from the lists).</p>
            <p className="mt-2 font-mono text-[11px] text-gray-500">{toDelete.uuid}</p>
            <p className="mt-2 text-xs text-amber-300">Schedules in InspectorWeb that use this config will stop finding it.</p>
          </Fragment>
        </Dialog>
      )}
    </div>
  )
}
