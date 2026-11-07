// Author: Kishore Kumar
// Where To Run → OTT devices: selector groups for browsers / phones / TVs, with value
// suggestions from InspectorWeb's device filters and a device-name search.
import { Search, Trash2, X as XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Device, DeviceSelectorType, OttOptions, searchDevices, TargetMatch } from '../../api/regression'
import { MatchSummary } from './shared'

export interface OttSelector { type: DeviceSelectorType; value: string; regex: boolean }

const TYPES: { value: DeviceSelectorType; label: string; placeholder: string }[] = [
  { value: 'location', label: 'Location', placeholder: 'BROWSERSTACK' },
  { value: 'deviceType', label: 'Device type', placeholder: 'BROWSER' },
  { value: 'platform', label: 'Platform', placeholder: 'OS X VENTURA' },
  { value: 'name', label: 'Device name', placeholder: 'EDGE-14.*' },
  { value: 'swVersion', label: 'SW version', placeholder: '146.0' },
  { value: 'lockedForGroup', label: 'Locked for group', placeholder: 'No lockedForGroup' },
  { value: 'udid', label: 'UDID', placeholder: 'device udid' },
  { value: 'target', label: 'Target', placeholder: 'target' },
]

export const newOttGroup = (): OttSelector[] => [
  { type: 'location', value: '', regex: false },
  { type: 'deviceType', value: '', regex: false },
]

interface Props {
  groups: OttSelector[][]
  onChange: (groups: OttSelector[][]) => void
  options: OttOptions
  errors: Record<string, string | undefined>
  match: { match: TargetMatch | null; loading: boolean; error: string | null }
  /** OTT-only configs carry a customer lab; with STB the lab comes from the boxes. */
  showLab: boolean
  lab: string
  onLab: (lab: string) => void
  labError?: string
}

const inputBase = 'h-8 rounded-lg border bg-gray-800 px-2 text-xs text-gray-100 placeholder-gray-600 focus:outline-none'

export function OttDevicesEditor({ groups, onChange, options, errors, match, showLab, lab, onLab, labError }: Props) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Device[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!q.trim()) { setHits([]); return }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      searchDevices(q.trim(), 1, 10, 'ott')
        .then((r) => { if (!cancelled) setHits(r.data) })
        .catch(() => { if (!cancelled) setHits([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q])

  function set(gi: number, si: number, patch: Partial<OttSelector>) {
    onChange(groups.map((g, i) => i !== gi ? g : g.map((s, j) => j !== si ? s : { ...s, ...patch })))
  }

  function addDevice(d: Device) {
    const sel: OttSelector[] = [{ type: 'name', value: d.name, regex: false }]
    const empty = groups.findIndex((g) => g.every((s) => !s.value.trim()))
    onChange(empty >= 0 ? groups.map((g, i) => (i === empty ? sel : g)) : [...groups, sel])
    setQ('')
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find an OTT device by name (e.g. BS_CHROME)…"
          aria-label="Search OTT devices"
          className="h-9 w-full rounded-lg border border-gray-700 bg-gray-800 pl-9 pr-3 text-sm text-gray-100 placeholder-gray-500 focus:border-primary-500 focus:outline-none"
        />
        {q && (hits.length > 0 || loading) && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
            {loading && <li className="p-2 text-xs text-gray-500">Searching…</li>}
            {hits.map((d) => (
              <li key={d.name}>
                <button onClick={() => addDevice(d)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-gray-800">
                  <span className="truncate text-gray-100">{d.name}</span>
                  <span className="flex shrink-0 gap-2 text-gray-500">
                    {d.deviceType && <span>{d.deviceType}</span>}
                    {d.location && <span>{d.location}</span>}
                    <span className={d.status === 'IDLE' ? 'text-emerald-400' : 'text-amber-400'}>{d.status ?? '—'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {groups.map((g, gi) => (
        <div key={gi} className="rounded-lg border border-gray-800 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
            <span>{gi === 0 ? 'OTT device group 1' : `OR OTT device group ${gi + 1}`}</span>
            {groups.length > 1 && (
              <button onClick={() => onChange(groups.filter((_, i) => i !== gi))} className="hover:text-red-400" aria-label="Remove group">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="space-y-2">
            {g.map((sel, si) => {
              const err = errors[`ott-${gi}-${si}`]
              const meta = TYPES.find((t) => t.value === sel.type)!
              const listId = `ott-opts-${gi}-${si}`
              const suggestions = (options as Record<string, string[] | undefined>)[sel.type] ?? []
              return (
                <div key={si}>
                  <div className="grid grid-cols-[130px_1fr_auto_auto] items-center gap-2">
                    <select
                      value={sel.type}
                      onChange={(e) => set(gi, si, { type: e.target.value as DeviceSelectorType, value: '' })}
                      aria-label="OTT selector type"
                      className="h-8 rounded-lg border border-gray-700 bg-gray-800 px-2 text-xs text-gray-100"
                    >
                      {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <input
                      list={suggestions.length ? listId : undefined}
                      value={sel.value}
                      onChange={(e) => set(gi, si, { value: e.target.value })}
                      placeholder={meta.placeholder}
                      aria-label="OTT selector value"
                      className={`${inputBase} ${err ? 'border-red-500 focus:border-red-400' : 'border-gray-700 focus:border-primary-500'}`}
                    />
                    {suggestions.length > 0 && <datalist id={listId}>{suggestions.map((v) => <option key={v} value={v} />)}</datalist>}
                    <label className="flex items-center gap-1 text-[11px] text-gray-400" title="Treat the value as a regular expression">
                      <input type="checkbox" checked={sel.regex} onChange={(e) => set(gi, si, { regex: e.target.checked })} className="h-3.5 w-3.5" />
                      regex
                    </label>
                    <button
                      onClick={() => {
                        const next = groups.map((x, i) => i !== gi ? x : x.filter((_, j) => j !== si)).filter((x) => x.length > 0)
                        onChange(next.length ? next : [newOttGroup()]) // last one cleared → start again empty
                      }}
                      aria-label="Remove selector"
                      title="Remove selector"
                      className="text-gray-500 hover:text-red-400"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {err && <p className="mt-1 text-xs text-red-400">{err}</p>}
                </div>
              )
            })}
          </div>
          <button
            onClick={() => onChange(groups.map((x, i) => i !== gi ? x : [...x, { type: 'platform', value: '', regex: false }]))}
            className="mt-2 text-xs text-primary-400 hover:text-primary-300"
          >
            + AND selector
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...groups, newOttGroup()])} className="text-xs text-primary-400 hover:text-primary-300">
        + OR OTT device group
      </button>
      <MatchSummary match={match.match} loading={match.loading} error={match.error} noun="OTT device" warnAbove={25} />

      {showLab && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400" htmlFor="wz-ott-lab">Customer lab (optional)</label>
          <input
            id="wz-ott-lab"
            value={lab}
            onChange={(e) => onLab(e.target.value)}
            placeholder="e.g. obolab_cloud_labci"
            className={`h-9 w-full rounded-lg border bg-gray-800 px-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none ${labError ? 'border-red-500' : 'border-gray-700 focus:border-primary-500'}`}
          />
          {labError ? <p className="mt-1 text-xs text-red-400">{labError}</p> : (
            <p className="mt-1 text-[11px] text-gray-500">The lab whose customer account the OTT app logs in with. Needed for provisioning.</p>
          )}
        </div>
      )}
    </div>
  )
}
