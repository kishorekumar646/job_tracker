// Author: Kishore Kumar
// "Options" step of the run-config wizard: choose InspectorWeb mocha hooks per phase.
// Named exactly as in InspectorWeb, laid out inline: one row per phase (beforeEachRun, …) with its
// hooks as toggle chips; hovering a hook says what it does.
import { useMemo } from 'react'
import { Check, Plus } from 'lucide-react'
import { Hint } from '../ui/Hint'
import type { HookPhase } from '../../api/regression'

export const HOOK_PHASES: { key: HookPhase; when: string }[] = [
  { key: 'beforeEachRun', when: 'Runs once on each device, before its first test starts.' },
  { key: 'beforeEachTest', when: 'Runs before every test case.' },
  { key: 'beforeEachStep', when: 'Runs before every step inside a test.' },
  { key: 'afterEachStep', when: 'Runs after every step inside a test.' },
  { key: 'afterEachTest', when: 'Runs after every test case, whether it passed or failed.' },
  { key: 'afterEachRun', when: 'Runs once on each device, after its last test.' },
]

// Plain-language help for the hooks InspectorWeb ships (inferred from their names).
const HOOK_HELP: Record<string, string> = {
  forcePowerOn: 'Wakes the box from standby so the run starts on a powered-on device.',
  onlyStartWhenMicroservicesAreUp: 'Waits until the back-end services are healthy before starting.',
  setBuildAndConfigCorrect: 'Makes sure the box runs the expected software build and configuration.',
  enableUIParserSampleGathering: 'Collects UI-parser samples to help debug screen recognition.',
  resetApp: 'Restarts the app under test so every test starts from a clean state.',
  screenshot: 'Adds a screenshot to the report.',
  screenshotPerseus: 'Adds a screenshot on Perseus (mobile / web) devices.',
  crashReport: 'Collects crash reports from the box.',
  intermediateJira: 'Pushes results to Jira / Xray after each test instead of only at the end.',
  perseusLogging: 'Collects Perseus device logs.',
  resetRunGlobal: 'Clears data shared between tests of the same run.',
  returnMicroservicesUsedDB: 'Records which back-end services the test used.',
  z100_updateTargetTraitsInDB: "Updates the device's traits in the Inspector database.",
  z101_updateTestCaseTraitsInDB: "Updates the test case's traits in the Inspector database.",
}

/** Recommended hook set (as agreed for regression runs) — also the default for new configs. */
export const RECOMMENDED_HOOKS: Partial<Record<HookPhase, string[]>> = {
  beforeEachRun: ['forcePowerOn'],
  // setBuildAndConfigCorrect left out: currently fails in InspectorWeb
  // ("CONFIG: beforeEachTest:setBuildAndConfigCorrect: TypeError … 'checkCID1'", 2026-11-01).
  afterEachRun: ['crashReport'],
  afterEachStep: ['screenshot'],
  afterEachTest: ['intermediateJira', 'screenshot', 'z100_updateTargetTraitsInDB', 'z101_updateTestCaseTraitsInDB'],
}

interface Props {
  branch: string
  catalog: Partial<Record<HookPhase, string[]>>
  value: Partial<Record<HookPhase, string[]>>
  onChange: (next: Partial<Record<HookPhase, string[]>>) => void
}

export function HookPicker({ branch, catalog, value, onChange }: Props) {
  const phases = HOOK_PHASES.filter((p) => (catalog[p.key] ?? []).length > 0)
  const total = Object.values(value).reduce((n, v) => n + (v?.length ?? 0), 0)

  const isCommon = useMemo(() => {
    const keys = new Set([...Object.keys(value), ...Object.keys(RECOMMENDED_HOOKS)]) as Set<HookPhase>
    return [...keys].every((k) => {
      const want = (RECOMMENDED_HOOKS[k] ?? []).filter((h) => (catalog[k] ?? []).includes(h)).sort().join()
      return (value[k] ?? []).slice().sort().join() === want
    })
  }, [value, catalog])

  function toggle(phaseKey: HookPhase, hook: string) {
    const cur = value[phaseKey] ?? []
    onChange({ ...value, [phaseKey]: cur.includes(hook) ? cur.filter((h) => h !== hook) : [...cur, hook] })
  }

  function applyCommon() {
    onChange(Object.fromEntries(
      Object.entries(RECOMMENDED_HOOKS).map(([k, v]) => [k, (v ?? []).filter((h) => (catalog[k as HookPhase] ?? []).includes(h))]),
    ))
  }

  if (phases.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-700 px-4 py-10 text-center">
        <p className="text-sm text-gray-300">No hooks available</p>
        <p className="mt-1 text-xs text-gray-500">The <span className="font-mono">{branch || '—'}</span> branch doesn't define any hooks.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-100">Mocha hooks</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-400">
            Extra actions InspectorWeb performs around your tests. Loaded from branch{' '}
            <span className="rounded bg-gray-800 px-1 py-0.5 font-mono text-[11px] text-gray-300">{branch || '—'}</span>
            {' · '}<span className="text-gray-300">{total === 0 ? 'none selected' : `${total} selected`}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center rounded-lg border border-gray-700 p-0.5 text-xs">
          <button
            onClick={applyCommon}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${isCommon && total > 0 ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
            title="Power on before the run, crash report after the run, screenshots, intermediate Jira and DB trait updates after each test"
          >
            Recommended
          </button>
          <button
            onClick={() => onChange({})}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${total === 0 ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
          >
            None
          </button>
        </div>
      </div>

      {/* One row per phase, its hooks inline — click a hook to switch it on or off */}
      <div className="divide-y divide-gray-800 rounded-lg border border-gray-800">
        {phases.map((p) => {
          const n = (value[p.key] ?? []).length
          return (
            <div key={p.key} role="group" aria-label={p.key} className="flex items-start gap-4 px-4 py-3">
              <Hint text={p.when} className="w-36 shrink-0 pt-1">
                <span className="flex items-center gap-2">
                  <span className={`font-mono text-xs ${n ? 'font-semibold text-gray-100' : 'text-gray-400'}`}>{p.key}</span>
                  {n > 0 && <span className="rounded-full bg-primary-500/20 px-1.5 text-[10px] font-semibold tabular-nums text-primary-200">{n}</span>}
                </span>
              </Hint>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {(catalog[p.key] ?? []).map((h) => {
                  const on = (value[p.key] ?? []).includes(h)
                  return (
                    <Hint key={h} text={HOOK_HELP[h] ?? h}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={`${p.key}: ${h}`}
                        onClick={() => toggle(p.key, h)}
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs transition-colors ${
                          on
                            ? 'bg-primary-500/15 text-primary-100 ring-1 ring-inset ring-primary-500/50 hover:bg-primary-500/25'
                            : 'bg-gray-800/60 text-gray-400 ring-1 ring-inset ring-gray-700 hover:bg-gray-800 hover:text-gray-200'
                        }`}
                      >
                        {on ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 text-gray-500" />}
                        {h}
                      </button>
                    </Hint>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
