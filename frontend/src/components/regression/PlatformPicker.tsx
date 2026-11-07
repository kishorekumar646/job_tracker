// Author: Kishore Kumar
// Where To Run → Platform: STB, OTT, or both (InspectorWeb's "No platform selected!" rule).
import { Check, MonitorSmartphone, Tv } from 'lucide-react'
import type { Platform } from '../../api/regression'

const OPTIONS: { key: Platform; title: string; desc: string; icon: typeof Tv }[] = [
  { key: 'STB', title: 'STB', desc: 'Set-top boxes in the labs (e.g. HArchive_021).', icon: Tv },
  { key: 'OTT', title: 'OTT', desc: 'Browsers, phones, tablets and TVs on BrowserStack or the Herentals grid.', icon: MonitorSmartphone },
]

export function PlatformPicker({ value, onToggle, error }: { value: Platform[]; onToggle: (p: Platform) => void; error?: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-gray-400">Platform *</p>
      <div role="group" aria-label="Platform" className="grid grid-cols-2 gap-2">
        {OPTIONS.map((o) => {
          const on = value.includes(o.key)
          const Icon = o.icon
          return (
            <button
              key={o.key}
              role="checkbox"
              aria-checked={on}
              onClick={() => onToggle(o.key)}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                on ? 'border-primary-500 bg-primary-500/10' : error ? 'border-red-500/60 hover:bg-gray-800/40' : 'border-gray-700 hover:bg-gray-800/40'
              }`}
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${on ? 'text-primary-300' : 'text-gray-500'}`} />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${on ? 'text-gray-50' : 'text-gray-200'}`}>{o.title}</span>
                <span className="block text-xs text-gray-500">{o.desc}</span>
              </span>
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-primary-500 bg-primary-500 text-white' : 'border-gray-600'}`}>
                {on && <Check className="h-3 w-3" />}
              </span>
            </button>
          )
        })}
      </div>
      {error ? (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      ) : (
        <p className="mt-1 text-[11px] text-gray-500">
          {value.length === 2 ? 'Both: OTT apps are tested against a lab box’s customer account — provisioning is needed in What To Run.' : 'Pick one or both.'}
        </p>
      )}
    </div>
  )
}
