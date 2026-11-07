// Author: Kishore Kumar
// What To Run → Xray JQL: one box per query (add / remove, up to 10). "Preview" asks InspectorWeb
// which Xray tickets each query returns; every query then shows its own test-case count, and
// can list its tickets with the matching test file on the branch.
import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Eye, FileCode2, Loader2, Plus, Trash2 } from 'lucide-react'
import { JqlPreview, previewJql, regressionErrorMessage } from '../../api/regression'

export const MAX_JQL_QUERIES = 10

/** Identifies one preview: branch + the exact queries it was run for. */
export function jqlPreviewKey(branch: string, queries: string[]): string {
  return `${branch}\u0000${queries.join('\u0000')}`
}

export interface JqlPreviewState { key: string; results: JqlPreview[] }

interface Props {
  queries: string[]
  onChange: (queries: string[]) => void
  branch: string
  error?: string
  /** Latest preview (owned by the wizard so the Overview can reuse the counts). */
  preview: JqlPreviewState | null
  onPreview: (p: JqlPreviewState) => void
}

export function JqlQueriesEditor({ queries, onChange, branch, error, preview, onPreview }: Props) {
  const [loading, setLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [openRows, setOpenRows] = useState<Set<number>>(new Set())

  const filled = queries.map((q) => q.trim()).filter(Boolean)
  const currentKey = jqlPreviewKey(branch, filled)
  const fresh = preview?.key === currentKey ? preview : null
  const resultFor = (q: string) => fresh?.results.find((r) => r.query === q.trim())

  async function runPreview() {
    if (!filled.length) return
    setLoading(true)
    setPreviewError(null)
    try {
      onPreview({ key: currentKey, results: await previewJql(branch, filled) })
    } catch (err) {
      setPreviewError(regressionErrorMessage(err, 'Could not preview the queries.'))
    } finally {
      setLoading(false)
    }
  }

  function setQuery(i: number, v: string) {
    onChange(queries.map((q, j) => (j === i ? v : q)))
  }

  function remove(i: number) {
    const next = queries.filter((_, j) => j !== i)
    onChange(next.length ? next : [''])
    setOpenRows(new Set())
  }

  const total = fresh?.results.reduce((n, r) => n + r.count, 0) ?? 0
  const noScript = fresh?.results.flatMap((r) => r.tickets).filter((t) => t.files.length === 0).length ?? 0

  return (
    <div className="space-y-3">
      {queries.map((q, i) => {
        const r = q.trim() ? resultFor(q) : undefined
        const open = openRows.has(i)
        return (
          <div key={i} className={`rounded-lg border ${error && !q.trim() ? 'border-red-500/60' : 'border-gray-800'}`}>
            <div className="flex items-center justify-between gap-2 border-b border-gray-800 bg-gray-800/40 px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Query {i + 1}</span>
              <div className="flex items-center gap-2">
                {r && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${r.count ? 'bg-primary-500/20 text-primary-200' : 'bg-red-500/15 text-red-300'}`}
                    title="Test cases this query returns"
                  >
                    {r.count} test case{r.count === 1 ? '' : 's'}
                  </span>
                )}
                {queries.length > 1 && (
                  <button onClick={() => remove(i)} aria-label={`Remove query ${i + 1}`} title="Remove query" className="text-gray-500 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={q}
              onChange={(e) => setQuery(i, e.target.value)}
              rows={2}
              placeholder="project in (XHZN4SI) AND type in (XTest) AND labels in (Daily_Regression)"
              aria-label={`Xray JQL query ${i + 1}`}
              className="block w-full resize-y bg-gray-900 px-3 py-2 font-mono text-xs text-gray-100 placeholder-gray-600 focus:outline-none"
            />
            {r && r.count === 0 && (
              <p className="flex items-center gap-1.5 border-t border-gray-800 px-3 py-1.5 text-xs text-red-300">
                <AlertTriangle className="h-3.5 w-3.5" /> No test cases — check the query (an invalid JQL also returns nothing).
              </p>
            )}
            {r && r.count > 0 && (
              <div className="border-t border-gray-800">
                <button
                  onClick={() => setOpenRows((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })}
                  className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-[11px] text-gray-400 hover:text-gray-200"
                >
                  {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {open ? 'Hide' : 'Show'} {r.count} ticket{r.count === 1 ? '' : 's'}
                  {r.tickets.some((t) => !t.files.length) && (
                    <span className="ml-1 text-amber-300">· {r.tickets.filter((t) => !t.files.length).length} without a test file</span>
                  )}
                </button>
                {open && (
                  <ul className="max-h-56 divide-y divide-gray-800/70 overflow-y-auto border-t border-gray-800">
                    {r.tickets.map((t) => (
                      <li key={t.key} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                        <a href={t.jiraUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-32 shrink-0 items-center gap-1 font-mono text-sky-400 hover:text-sky-300">
                          {t.key} <ExternalLink className="h-3 w-3" />
                        </a>
                        {t.files.length ? (
                          <span className="inline-flex min-w-0 items-center gap-1 text-gray-300" title={t.files.join('\n')}>
                            <FileCode2 className="h-3 w-3 shrink-0 text-gray-500" />
                            <span className="truncate">{(t.files[0].split('/').pop() ?? '').replace(/\.js$/, '')}</span>
                            {t.files.length > 1 && <span className="shrink-0 text-gray-500">+{t.files.length - 1}</span>}
                          </span>
                        ) : (
                          <span className="text-amber-300">No test file on {branch} — this ticket won't run</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )
      })}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => onChange([...queries, ''])}
          disabled={queries.length >= MAX_JQL_QUERIES}
          className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 disabled:cursor-not-allowed disabled:opacity-40"
          title={queries.length >= MAX_JQL_QUERIES ? `At most ${MAX_JQL_QUERIES} queries` : undefined}
        >
          <Plus className="h-3.5 w-3.5" /> Add JQL query
        </button>
        <button
          onClick={runPreview}
          disabled={!filled.length || loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          {fresh ? 'Refresh preview' : 'Preview test cases'}
        </button>
      </div>

      {previewError && <p className="text-xs text-red-400">{previewError}</p>}
      {fresh ? (
        <p className="text-xs text-gray-400">
          <span className="font-semibold tabular-nums text-gray-100">{total}</span> test case{total === 1 ? '' : 's'} across {fresh.results.length} quer{fresh.results.length === 1 ? 'y' : 'ies'}
          {noScript > 0 && <span className="text-amber-300"> · {noScript} without a test file on <span className="font-mono">{branch}</span></span>}
        </p>
      ) : preview && filled.length > 0 ? (
        <p className="text-xs text-amber-300">Queries or branch changed — preview again to update the counts.</p>
      ) : null}
    </div>
  )
}
