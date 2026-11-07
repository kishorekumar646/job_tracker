// Author: Kishore Kumar
// What To Run → OTT provisioning: which OTT app build to install, per lab.
// Uses InspectorWeb's App Center versions when it has any; otherwise branch/sprint/version are typed.
import { Plus, Trash2 } from 'lucide-react'
import type { AppVersion } from '../../api/regression'

export interface ProvRow { id: number; lab: string; branch: string; sprint: string; version: string; variant: string }

let nextId = 1
export const newProvRow = (lab = ''): ProvRow => ({ id: nextId++, lab, branch: '', sprint: '', version: 'latest', variant: '' })

/** Problems per row id + a general message. */
export function provisioningErrors(rows: ProvRow[], required: boolean): { rows: Record<number, string>; general?: string } {
  const out: Record<number, string> = {}
  const seen = new Set<string>()
  rows.forEach((r) => {
    if (!r.lab.trim()) out[r.id] = 'Lab is required.'
    else if (seen.has(r.lab.trim())) out[r.id] = `Lab "${r.lab.trim()}" is listed twice.`
    else if (!r.branch.trim() || !r.sprint.trim() || !r.version.trim()) out[r.id] = 'Branch, sprint and version are required.'
    seen.add(r.lab.trim())
  })
  return { rows: out, general: required && rows.length === 0 ? 'Provisioning is missing' : undefined }
}

export function provisioningPayload(rows: ProvRow[]) {
  return Object.fromEntries(rows.filter((r) => r.lab.trim()).map((r) => [
    r.lab.trim(),
    { branch: r.branch.trim(), sprint: r.sprint.trim(), version: r.version.trim() || 'latest', variant: r.variant.trim() || null },
  ]))
}

interface Props {
  rows: ProvRow[]
  onChange: (rows: ProvRow[]) => void
  versions: Record<string, AppVersion[]>
  detectedLabs: string[]
  required: boolean
  errors: Record<number, string>
  generalError?: string
  showErrors: boolean
}

const cell = 'h-8 w-full rounded-md border bg-gray-800 px-2 text-xs text-gray-100 placeholder-gray-600 focus:outline-none'

export function ProvisioningEditor({ rows, onChange, versions, detectedLabs, required, errors, generalError, showErrors }: Props) {
  function update(id: number, patch: Partial<ProvRow>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-800 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-100">OTT provisioning{required && ' *'}</h4>
          <p className="text-xs text-gray-500">
            The OTT app build to use for each lab.{' '}
            {detectedLabs.length ? <>Labs found in your STB boxes: <span className="font-mono text-gray-300">{detectedLabs.join(', ')}</span>.</> : required ? 'No labs found in your STB boxes yet — add one manually.' : ''}
          </p>
        </div>
        <button
          onClick={() => onChange([...rows, newProvRow()])}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800"
        >
          <Plus className="h-3 w-3" /> Add lab
        </button>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_24px] gap-2 text-[10px] font-medium uppercase tracking-wider text-gray-500">
          <span>Lab</span><span>Branch</span><span>Sprint</span><span>Version</span><span>Variant</span><span />
        </div>
      )}
      {rows.map((r) => {
        const err = showErrors ? errors[r.id] : undefined
        const options = versions[r.lab.trim()] ?? []
        const border = err ? 'border-red-500' : 'border-gray-700 focus:border-primary-500'
        return (
          <div key={r.id}>
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_24px] items-center gap-2">
              <input value={r.lab} onChange={(e) => update(r.id, { lab: e.target.value })} placeholder="labci" aria-label="Lab" className={`${cell} font-mono ${border}`} />
              {options.length > 0 ? (
                <select
                  aria-label="App version"
                  className={`${cell} col-span-4 ${border}`}
                  value={options.findIndex((o) => o.branch === r.branch && o.sprint === r.sprint && o.version === r.version && (o.variant ?? '') === r.variant)}
                  onChange={(e) => {
                    const o = options[Number(e.target.value)]
                    if (o) update(r.id, { branch: o.branch, sprint: o.sprint, version: o.version, variant: o.variant ?? '' })
                  }}
                >
                  <option value={-1}>Choose an app version…</option>
                  {options.map((o, i) => <option key={i} value={i}>{o.label ?? `${o.version} (${o.branch} - ${o.sprint} - ${o.variant ?? 'automation'})`}</option>)}
                </select>
              ) : (
                <>
                  <input list="prov-branches" value={r.branch} onChange={(e) => update(r.id, { branch: e.target.value })} placeholder="nightly" aria-label="Branch" className={`${cell} ${border}`} />
                  <input value={r.sprint} onChange={(e) => update(r.id, { sprint: e.target.value })} placeholder="5.32.157" aria-label="Sprint" className={`${cell} ${border}`} />
                  <input value={r.version} onChange={(e) => update(r.id, { version: e.target.value })} placeholder="latest" aria-label="Version" className={`${cell} ${border}`} />
                  <input value={r.variant} onChange={(e) => update(r.id, { variant: e.target.value })} placeholder="automation" aria-label="Variant" className={`${cell} border-gray-700 focus:border-primary-500`} />
                </>
              )}
              <button onClick={() => onChange(rows.filter((x) => x.id !== r.id))} aria-label={`Remove ${r.lab || 'lab'}`} className="text-gray-500 hover:text-red-400">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {err && <p className="mt-1 text-xs text-red-400">{err}</p>}
          </div>
        )
      })}
      <datalist id="prov-branches"><option value="nightly" /><option value="release" /></datalist>
      {rows.length === 0 && <p className="text-xs text-gray-500">{required ? 'Add the lab(s) your STB boxes are in.' : 'Optional for OTT-only runs.'}</p>}
      {showErrors && generalError && <p className="text-xs text-red-400">{generalError}</p>}
      {Object.keys(versions).length === 0 && rows.length > 0 && (
        <p className="text-[11px] text-gray-500">InspectorWeb's App Center has no version list right now, so enter branch, sprint and version by hand (e.g. release · 5.32.157 · latest).</p>
      )}
    </div>
  )
}
