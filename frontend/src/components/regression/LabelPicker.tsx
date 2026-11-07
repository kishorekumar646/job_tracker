// Author: Kishore Kumar
// Options → Labels: pick from InspectorWeb's configured labels or add your own.
import { Check, Plus, Search, X as XIcon } from 'lucide-react'
import { useState } from 'react'

interface Props {
  options: string[]
  value: string[]
  onChange: (labels: string[]) => void
  error?: string
}

export function LabelPicker({ options, value, onChange, error }: Props) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const all = [...new Set([...options, ...value])]
  const visible = needle ? all.filter((l) => l.toLowerCase().includes(needle)) : all
  const canAdd = !!q.trim() && !all.some((l) => l.toLowerCase() === needle)

  function toggle(label: string) {
    onChange(value.includes(label) ? value.filter((l) => l !== label) : [...value, label])
  }

  function addCustom() {
    const label = q.trim()
    if (!label || value.includes(label)) return
    onChange([...value, label])
    setQ('')
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-100">Labels</h3>
        <p className="mt-0.5 text-xs text-gray-400">Tag the run config so it's easy to find and filter. Optional.</p>
      </div>

      <div className="flex min-h-[40px] flex-wrap items-center gap-1.5 rounded-lg border border-gray-800 bg-gray-800/30 px-3 py-2">
        {value.length === 0 ? (
          <span className="text-xs text-gray-500">No labels selected</span>
        ) : value.map((l) => (
          <span key={l} className="inline-flex items-center gap-1 rounded-full bg-primary-500/20 py-0.5 pl-2.5 pr-1 text-xs text-primary-100">
            {l}
            <button onClick={() => toggle(l)} aria-label={`Remove ${l}`} className="rounded-full p-0.5 hover:bg-primary-500/30">
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-800">
        <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-800/40 px-3 py-2">
          <Search className="h-3.5 w-3.5 text-gray-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canAdd) addCustom() }}
            placeholder="Search or type a new label"
            aria-label="Search labels"
            className="flex-1 bg-transparent text-xs text-gray-100 placeholder-gray-500 focus:outline-none"
          />
          {canAdd && (
            <button onClick={addCustom} className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300">
              <Plus className="h-3 w-3" /> Add “{q.trim()}”
            </button>
          )}
        </div>
        <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto p-3">
          {visible.length === 0 && !canAdd && <span className="text-xs text-gray-500">No labels match.</span>}
          {visible.map((l) => {
            const on = value.includes(l)
            return (
              <button
                key={l}
                onClick={() => toggle(l)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 transition-colors ${
                  on ? 'bg-primary-500/20 text-primary-100 ring-primary-500/50' : 'text-gray-300 ring-gray-700 hover:bg-gray-800'
                }`}
              >
                {on && <Check className="h-3 w-3" />}{l}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
