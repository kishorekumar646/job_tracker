// Author: Kishore Kumar
// Optional key/value metadata for a run config (Options → Metadata), e.g.
// currentVersion = SR202-ae. Rows can be edited, added and deleted.
import { Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'

export interface MetaRow { id: number; key: string; value: string }

let nextId = 1
export const newMetaRow = (key = '', value = ''): MetaRow => ({ id: nextId++, key, value })

/** Keys offered for a new config with empty values — users fill only what they need. */
export const DEFAULT_METADATA_KEYS = ['customCID1', 'currentVersion', 'previousRelease', 'previousVersion']
/** Extra keys InspectorWeb offers for OTT runs. */
export const OTT_METADATA_KEYS = ['addLogin', 'addLogout']

/** Problems per row id (empty key with a value, duplicate keys). */
export function metadataErrors(rows: MetaRow[]): Record<number, string> {
  const errs: Record<number, string> = {}
  const seen = new Map<string, number>()
  rows.forEach((r) => {
    const k = r.key.trim()
    if (!k && r.value.trim()) errs[r.id] = 'Add a key for this value, or delete the row.'
    else if (k.length > 100) errs[r.id] = 'Key must be at most 100 characters.'
    else if (r.value.length > 500) errs[r.id] = 'Value must be at most 500 characters.'
    else if (k && seen.has(k)) errs[r.id] = `"${k}" is used twice.`
    if (k) seen.set(k, r.id)
  })
  return errs
}

/**
 * Rows → payload; "true"/"false" become booleans like InspectorWeb's own metadata.
 * Rows without a key or without a value are dropped, so an empty value never overrides
 * InspectorWeb's defaults.
 */
export function metadataPayload(rows: MetaRow[]): Record<string, string | boolean> {
  return Object.fromEntries(
    rows.filter((r) => r.key.trim() && r.value.trim()).map((r) => {
      const v = r.value.trim()
      return [r.key.trim(), v === 'true' ? true : v === 'false' ? false : v]
    }),
  )
}

interface Props {
  rows: MetaRow[]
  onChange: (rows: MetaRow[]) => void
  errors: Record<number, string>
  showErrors: boolean
}

export function MetadataEditor({ rows, onChange, errors, showErrors }: Props) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const visible = needle ? rows.filter((r) => `${r.key} ${r.value}`.toLowerCase().includes(needle)) : rows

  function update(id: number, patch: Partial<MetaRow>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-100">Metadata</h3>
          <p className="mt-0.5 text-xs text-gray-400">Optional. Fill a value only to override InspectorWeb's default — rows left empty are not sent.</p>
        </div>
        <button
          onClick={() => { setQ(''); onChange([...rows, newMetaRow()]) }}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-700 px-2.5 py-1 text-xs font-medium text-gray-200 hover:bg-gray-800"
        >
          <Plus className="h-3.5 w-3.5" /> Add row
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-800">
        <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-800/40 px-3 py-2">
          <Search className="h-3.5 w-3.5 text-gray-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            aria-label="Search metadata"
            className="flex-1 bg-transparent text-xs text-gray-100 placeholder-gray-500 focus:outline-none"
          />
          <span className="text-[11px] text-gray-500 tabular-nums">{rows.filter((r) => r.key.trim() && r.value.trim()).length} of {rows.length} set</span>
        </div>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_32px] gap-px bg-gray-800 text-[11px] font-medium uppercase tracking-wider text-gray-500">
          <span className="bg-gray-900 px-3 py-1.5">Key</span>
          <span className="bg-gray-900 px-3 py-1.5">Value</span>
          <span className="bg-gray-900" />
        </div>
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-gray-500">{rows.length ? 'No rows match the search.' : 'No overrides — InspectorWeb defaults will be used. Click Add row to set one.'}</p>
        ) : (
          <ul className="divide-y divide-gray-800">
            {visible.map((r) => {
              const err = showErrors ? errors[r.id] : undefined
              return (
                <li key={r.id} className={err ? 'bg-red-500/5' : ''}>
                  <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_32px] items-center">
                    <input
                      value={r.key}
                      onChange={(e) => update(r.id, { key: e.target.value })}
                      placeholder="key"
                      aria-label="Metadata key"
                      className={`h-9 border-r border-gray-800 bg-transparent px-3 font-mono text-xs text-gray-100 placeholder-gray-600 focus:bg-gray-800/60 focus:outline-none ${err ? 'text-red-300' : ''}`}
                    />
                    <input
                      value={r.value}
                      onChange={(e) => update(r.id, { value: e.target.value })}
                      placeholder="default — leave empty"
                      aria-label={`Value for ${r.key || 'new key'}`}
                      className="h-9 bg-transparent px-3 text-xs text-gray-100 placeholder-gray-600 focus:bg-gray-800/60 focus:outline-none"
                    />
                    <button
                      onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
                      aria-label={`Delete ${r.key || 'row'}`}
                      title="Delete row"
                      className="flex h-9 items-center justify-center text-gray-500 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {err && <p className="px-3 pb-1.5 text-[11px] text-red-400">{err}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <p className="text-[11px] text-gray-500">Rows with an empty key or value are not sent. <code>true</code> / <code>false</code> are saved as yes/no flags.</p>
    </div>
  )
}
