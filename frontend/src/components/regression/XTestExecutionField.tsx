// Author: Kishore Kumar
// Where To Report → "X Test Execution": pick the Xray Test Execution an Xray JQL run reports into.
// Options read "[KEY] summary" like InspectorWeb's editor; search by key or name.
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ExternalLink, Loader2, X as XIcon } from 'lucide-react'
import { regressionErrorMessage, searchXTestExecutions, XTestExecution } from '../../api/regression'

export const X_TEST_EXECUTION_RE = /^[A-Z][A-Z0-9]+-\d+$/
const JIRA_BROWSE_URL = 'https://jira.lgi.io/browse/'

interface Props {
  value: string
  onChange: (v: string) => void
  error?: string
}

export function XTestExecutionField({ value, onChange, error }: Props) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<XTestExecution[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedSummary, setSelectedSummary] = useState<string | null>(null)
  const [selectedExists, setSelectedExists] = useState<boolean | null>(null)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  // Keep the text box in sync when the value is set from outside (e.g. editing a saved config).
  useEffect(() => { setQuery(value) }, [value])

  // Search suggestions as the user types.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      searchXTestExecutions(query.trim(), 30)
        .then((r) => { if (!cancelled) { setItems(r.items); setTotal(r.total); setActive(0); setLoadError(null) } })
        .catch((err) => { if (!cancelled) setLoadError(regressionErrorMessage(err, 'Could not load Xray test executions.')) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, open])

  // Name of the chosen execution (also for a value pre-filled from a saved config).
  const key = value.trim().toUpperCase()
  useEffect(() => {
    if (!X_TEST_EXECUTION_RE.test(key)) { setSelectedSummary(null); setSelectedExists(null); return }
    let cancelled = false
    searchXTestExecutions(key, 1)
      .then((r) => { if (!cancelled) { setSelectedSummary(r.summary); setSelectedExists(r.exists) } })
      .catch(() => { if (!cancelled) { setSelectedSummary(null); setSelectedExists(null) } })
    return () => { cancelled = true }
  }, [key])

  // Close when clicking outside.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(item: XTestExecution) {
    onChange(item.key)
    setQuery(item.key)
    setSelectedSummary(item.summary)
    setSelectedExists(true)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); pick(items[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <label className="mb-1 block text-xs font-medium text-gray-400" htmlFor="wz-xte">X Test Execution</label>
      <div className="relative">
        <input
          id="wz-xte"
          role="combobox"
          aria-expanded={open}
          aria-controls="wz-xte-list"
          autoComplete="off"
          value={query}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            // Typing a key directly is allowed; free text that isn't a key clears the value.
            const typed = e.target.value.trim().toUpperCase()
            onChange(X_TEST_EXECUTION_RE.test(typed) ? typed : e.target.value.trim() ? e.target.value : '')
          }}
          placeholder="Search by ID or name, e.g. XHZN4SI-76889 or Android"
          className={`h-9 w-full rounded-lg border bg-gray-800 px-3 pr-20 text-sm text-gray-100 placeholder-gray-500 focus:outline-none ${
            error ? 'border-red-500 focus:border-red-400' : 'border-gray-700 focus:border-primary-500'
          }`}
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />}
          {X_TEST_EXECUTION_RE.test(key) && (
            <a href={`${JIRA_BROWSE_URL}${key}`} target="_blank" rel="noopener noreferrer" title="Open in Jira" className="text-sky-400 hover:text-sky-300">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {query && (
            <button type="button" onClick={() => { onChange(''); setQuery('') }} aria-label="Clear X Test Execution" className="text-gray-500 hover:text-gray-200">
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Show X Test Executions" className="text-gray-500 hover:text-gray-200">
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && (
        <ul
          id="wz-xte-list"
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl"
        >
          {loading && items.length === 0 ? (
            <li className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading Xray test executions… the first load can take up to ~40 s.
            </li>
          ) : loadError ? (
            <li className="px-3 py-2 text-xs text-amber-300">{loadError} You can still type the key.</li>
          ) : items.length === 0 ? (
            <li className="px-3 py-2 text-xs text-gray-500">No test executions match “{query}”.</li>
          ) : (
            <>
              {items.map((it, i) => (
                <li
                  key={it.key}
                  role="option"
                  aria-selected={it.key === key}
                  onMouseDown={(e) => { e.preventDefault(); pick(it) }}
                  onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer px-3 py-1.5 text-xs ${i === active ? 'bg-gray-800' : ''} ${it.key === key ? 'text-primary-200' : 'text-gray-200'}`}
                >
                  <span className="font-mono text-sky-300">[{it.key}]</span>{' '}
                  <span>{it.summary || <span className="italic text-gray-500">no name</span>}</span>
                </li>
              ))}
              {total > items.length && (
                <li className="px-3 py-1.5 text-[11px] text-gray-500">Showing {items.length} of {total.toLocaleString()} — type to narrow.</li>
              )}
            </>
          )}
        </ul>
      )}

      {error ? (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      ) : X_TEST_EXECUTION_RE.test(key) && selectedExists && selectedSummary !== null ? (
        <p className="mt-1 text-xs text-gray-300">
          <span className="font-mono text-sky-300">[{key}]</span> {selectedSummary || <span className="italic text-gray-500">no name</span>}
        </p>
      ) : X_TEST_EXECUTION_RE.test(key) && selectedExists === false ? (
        <p className="mt-1 text-xs text-amber-300">{key} isn't in InspectorWeb's list of Xray test executions — check the key.</p>
      ) : (
        <p className="mt-1 text-[11px] text-gray-500">Optional. The Xray Test Execution this run reports into.</p>
      )}
    </div>
  )
}
