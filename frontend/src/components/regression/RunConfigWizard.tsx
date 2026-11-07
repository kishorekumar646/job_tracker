// Author: Kishore Kumar
// Step-by-step "New run config" editor shown in the Regression page's left panel.
// Mirrors the InspectorWeb editor's stages (About → Where To Run → What To Run →
// How to Run → Options → Where To Report → Overview). Each step is validated before
// moving on; the stepper marks steps with errors, warnings or done.
import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, ClipboardCheck, Info, ListChecks, MapPin, Pencil, Play, Plus, Save, Search,
  Send, SlidersHorizontal, Timer, Trash2, X as XIcon,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { HOOK_PHASES, HookPicker, RECOMMENDED_HOOKS } from './HookPicker'
import { DEFAULT_METADATA_KEYS, MetadataEditor, metadataErrors, metadataPayload, MetaRow, newMetaRow, OTT_METADATA_KEYS } from './MetadataEditor'
import { LabelPicker } from './LabelPicker'
import { jqlPreviewKey, JqlPreviewState, JqlQueriesEditor, MAX_JQL_QUERIES } from './JqlQueriesEditor'
import { X_TEST_EXECUTION_RE, XTestExecutionField } from './XTestExecutionField'
import { PlatformPicker } from './PlatformPicker'
import { newOttGroup, OttDevicesEditor, OttSelector } from './OttDevicesEditor'
import { newProvRow, ProvisioningEditor, provisioningErrors, provisioningPayload, ProvRow } from './ProvisioningEditor'
import { MatchSummary } from './shared'
import { useTargetMatch } from '../../hooks/useTargetMatch'
import {
  AppVersion,
  createRunConfig,
  RawRunConfig,
  RegressionRun,
  SavedRunConfig,
  updateRunConfig,
  Device,
  getAppVersions,
  getMochaHooks,
  getOttOptions,
  previewJql,
  OttOptions,
  Platform,
  HookPhase,
  regressionErrorMessage,
  RegressionMeta,
  searchDevices,
  searchTestCases,
  SelectorType,
  TestCaseFile,
} from '../../api/regression'

/** Run-config (and schedule) names: InspectorWeb's allowed characters. */
export const NAME_RE = /^[a-zA-Z0-9\-_.[\]]+$/

/** Same name checks as the run-config wizard; undefined when the name is fine. */
export function nameError(name: string): string | undefined {
  if (!name.trim()) return 'No name provided!'
  if (name.length < 3) return 'Name must be at least 3 characters.'
  if (name.length > 120) return 'Name must be at most 120 characters.'
  if (!NAME_RE.test(name)) return 'Use only letters, digits, - _ . [ ] (no spaces).'
  return undefined
}
const SELECTOR_TYPES: { value: SelectorType; label: string }[] = [
  { value: 'name', label: 'Device name' },
  { value: 'lockedForGroup', label: 'Locked for group' },
  { value: 'lab', label: 'Lab' },
  { value: 'platform', label: 'Platform' },
  { value: 'cpe_id', label: 'CPE ID' },
  { value: 'owner', label: 'Owner' },
  { value: 'labels', label: 'Labels' },
  { value: 'target', label: 'Target' },
  { value: 'xapEnabled', label: 'XAP enabled' },
]
type StepKey = 'about' | 'where' | 'what' | 'how' | 'options' | 'report' | 'overview'
const STEPS: { key: StepKey; label: string; icon: typeof Info }[] = [
  { key: 'about', label: 'About', icon: Info },
  { key: 'where', label: 'Where To Run', icon: MapPin },
  { key: 'what', label: 'What To Run', icon: ListChecks },
  { key: 'how', label: 'How to Run', icon: Timer },
  { key: 'options', label: 'Options', icon: SlidersHorizontal },
  { key: 'report', label: 'Where To Report', icon: Send },
  { key: 'overview', label: 'Overview', icon: ClipboardCheck },
]

interface Selector { type: SelectorType; value: string; regex: boolean }
const emptyStbGroups = (): Selector[][] => [[{ type: 'name', value: '', regex: false }]]
type FieldErrors = Record<string, string>

const inputCls = 'h-9 w-full rounded-lg border bg-gray-800 px-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none'
const okBorder = 'border-gray-700 focus:border-primary-500'
const errBorder = 'border-red-500 focus:border-red-400'
const labelCls = 'mb-1 block text-xs font-medium text-gray-400'

function formatTimeout(ms: number): string {
  const min = Math.round(ms / 60000)
  return min >= 60 ? `${+(min / 60).toFixed(1)} h` : `${min} min`
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs text-red-400">{msg}</p> : null
}

// ── Stepper ─────────────────────────────────────────────────────────────────

type StepState = 'current' | 'error' | 'warning' | 'done' | 'todo'

const STEP_STYLE: Record<StepState, string> = {
  todo: 'bg-gray-800 text-gray-400 ring-1 ring-gray-700',
  current: 'bg-primary-500 text-white ring-4 ring-primary-500/25',
  done: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/50',
  warning: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/60',
  error: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/60',
}

/** Step icon in a circle; the state shows as colour plus a small corner badge. */
function StepIcon({ state, index }: { state: StepState; index: number }) {
  const Icon = STEPS[index].icon
  return (
    <span className={`relative flex h-7 w-7 items-center justify-center rounded-full transition-colors ${STEP_STYLE[state]}`}>
      <Icon className="h-3.5 w-3.5" />
      {state === 'done' && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-gray-900">
          <Check className="h-2 w-2" strokeWidth={4} />
        </span>
      )}
      {state === 'warning' && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-[8px] font-black text-gray-950 ring-2 ring-gray-900">!</span>
      )}
      {state === 'error' && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-white ring-2 ring-gray-900">
          <AlertTriangle className="h-2 w-2" strokeWidth={3} />
        </span>
      )}
    </span>
  )
}

function Stepper({ states, current, onGo }: { states: StepState[]; current: number; onGo: (i: number) => void }) {
  return (
    <ol className="flex items-start">
      {STEPS.map((s, i) => (
        <Fragment key={s.key}>
          <li className="flex min-w-0 flex-1 flex-col items-center">
            <button onClick={() => onGo(i)} className="flex flex-col items-center gap-1.5" aria-current={i === current ? 'step' : undefined}>
              <StepIcon state={i === current && states[i] !== 'error' ? (states[i] === 'warning' ? 'warning' : 'current') : states[i]} index={i} />
              <span className={`text-center text-[10px] leading-tight ${
                states[i] === 'error' ? 'text-red-400' : i === current ? 'font-semibold text-gray-100' : 'text-gray-400'
              }`}>
                {s.label}
              </span>
            </button>
          </li>
          {i < STEPS.length - 1 && <li aria-hidden className="mt-3.5 h-px flex-1 bg-gray-700" />}
        </Fragment>
      ))}
    </ol>
  )
}

// ── Wizard ──────────────────────────────────────────────────────────────────

/** Open the wizard on an existing config: edit it in place, or start a copy. */
export interface WizardInitial { mode: 'edit' | 'duplicate'; raw: RawRunConfig }

/** Wizard state seeded from an InspectorWeb run config (edit / duplicate). */
function seedFrom(initial: WizardInitial | undefined) {
  if (!initial) return null
  const rc = initial.raw.runconfig as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const sel = <T,>(groups: unknown): T[][] => (Array.isArray(groups) ? groups : [])
    .map((g: unknown) => (Array.isArray(g) ? g : [])
      .filter((x: any) => x && typeof x === 'object' && x.type) // eslint-disable-line @typescript-eslint/no-explicit-any
      .map((x: any) => ({ type: x.type, value: String(x.value ?? ''), regex: !!x.regex }) as T)) // eslint-disable-line @typescript-eslint/no-explicit-any
    .filter((g) => g.length > 0)
  const targets = sel<Selector>(rc.targets)
  const devices = sel<OttSelector>(rc.devices)
  const jqlList: string[] = Array.isArray(rc.jiraData?.jql) ? rc.jiraData.jql : []
  const meta: Record<string, unknown> = rc.metadata && typeof rc.metadata === 'object' ? rc.metadata : {}
  const hooks: Partial<Record<HookPhase, string[]>> = {}
  HOOK_PHASES.forEach((p) => { if (Array.isArray(rc.mochaHooks?.[p.key])) hooks[p.key] = rc.mochaHooks[p.key] })
  return {
    name: initial.mode === 'edit' ? initial.raw.name : `${initial.raw.name}_copy`,
    labels: Array.isArray(rc.labels) ? rc.labels.map(String) : [],
    platforms: [...(targets.length ? ['STB'] : []), ...(devices.length ? ['OTT'] : [])] as Platform[],
    targets,
    devices,
    lockGroup: Array.isArray(rc.group) ? String(rc.group[0] ?? '') : String(rc.group ?? ''),
    lab: String(rc.lab ?? ''),
    provisioning: Object.entries((rc.provisioning ?? {}) as Record<string, any>).map(([lab, p]) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      ...newProvRow(lab), branch: String(p?.branch ?? ''), sprint: String(p?.sprint ?? ''),
      version: String(p?.version ?? 'latest'), variant: p?.variant ? String(p.variant) : '',
    })),
    branch: String(rc.branch ?? 'master'),
    mode: (jqlList.length ? 'jql' : 'files') as 'files' | 'jql',
    files: Array.isArray(rc.testCases) ? rc.testCases.map(String) : [],
    jql: jqlList.length ? jqlList.map(String) : [''],
    timeOut: typeof rc.timeOut === 'number' ? rc.timeOut : undefined,
    runParallel: !!rc.runParallel,
    hooks,
    metaRows: [
      ...DEFAULT_METADATA_KEYS.filter((k) => !(k in meta)).map((k) => newMetaRow(k)),
      ...Object.entries(meta).map(([k, v]) => newMetaRow(k, v === null || v === undefined ? '' : String(v))),
    ],
    elastic: rc.elastic !== false,
    // Keep a saved choice; when the config never set it, use the default (on).
    jiraMerge: typeof rc.jiraResults?.merge === 'boolean' ? rc.jiraResults.merge : true,
    xTestExecution: typeof rc.jiraResults?.xTestExecution === 'string' ? rc.jiraResults.xTestExecution : '',
  }
}

interface Props {
  meta: RegressionMeta | null
  inspectorUsername: string
  /** Edit or duplicate an existing config; omit for a new one. */
  initial?: WizardInitial
  /** Called after a successful save; `run` is set when Save & Execute started a run. */
  onSaved: (rc: SavedRunConfig, run: RegressionRun | null) => void
  /** Called with a message when saving fails (the error is also shown on the Overview step). */
  onError?: (message: string) => void
  onCancel: () => void
  /** Step index to open on (default About). */
  initialStep?: number
}

export function RunConfigWizard({ meta, inspectorUsername, initial, onSaved, onError, onCancel, initialStep = 0 }: Props) {
  const seed = useMemo(() => seedFrom(initial), [initial])
  const editing = initial?.mode === 'edit'
  const [step, setStep] = useState(initialStep)
  // Steps whose errors are shown: visited and left, or attempted with Next.
  const [checked, setChecked] = useState<Set<StepKey>>(new Set())

  // About
  const [name, setName] = useState(seed?.name ?? '')
  // Where
  const [platforms, setPlatforms] = useState<Platform[]>(seed?.platforms ?? [])
  const stb = platforms.includes('STB')
  const platformLabel = (['STB', 'OTT'] as Platform[]).filter((p) => platforms.includes(p)).join(' + ')
  const ott = platforms.includes('OTT')
  const [groups, setGroups] = useState<Selector[][]>(() => (seed?.targets.length ? seed.targets : emptyStbGroups()))
  const [ottGroups, setOttGroups] = useState<OttSelector[][]>(() => (seed?.devices.length ? seed.devices : [newOttGroup()]))
  const [ottLab, setOttLab] = useState(seed?.lab ?? '')
  const [ottOptions, setOttOptions] = useState<OttOptions>({})
  const stbMatch = useTargetMatch('stb', groups, stb)
  const ottMatch = useTargetMatch('ott', ottGroups, ott)
  // OTT provisioning (What To Run)
  const [provRows, setProvRows] = useState<ProvRow[]>(seed?.provisioning ?? [])
  const [appVersions, setAppVersions] = useState<Record<string, AppVersion[]>>({})
  const [lockGroup, setLockGroup] = useState(seed?.lockGroup ?? '')
  const [seenGroups, setSeenGroups] = useState<string[]>([])
  // What
  const [branch, setBranch] = useState(seed?.branch ?? 'master')
  const [mode, setMode] = useState<'files' | 'jql'>(seed?.mode ?? 'files')
  const [files, setFiles] = useState<string[]>(seed?.files ?? [])
  // One entry per Xray JQL query.
  const [jql, setJql] = useState<string[]>(seed?.jql ?? [''])
  const [jqlPreview, setJqlPreview] = useState<JqlPreviewState | null>(null)
  // How
  const baseTimeouts = meta?.timeoutOptions?.length ? meta.timeoutOptions : [900000, 1800000, 2700000, 3600000, 7200000]
  // Keep an edited config's own timeout selectable even if it isn't one of InspectorWeb's presets.
  const timeoutOptions = seed?.timeOut && !baseTimeouts.includes(seed.timeOut) ? [...baseTimeouts, seed.timeOut].sort((a, b) => a - b) : baseTimeouts
  const [timeOut, setTimeOut] = useState(seed?.timeOut ?? (timeoutOptions.includes(3600000) ? 3600000 : timeoutOptions[0]))
  const [runParallel, setRunParallel] = useState(seed?.runParallel ?? false)
  // Options
  const [optionsTab, setOptionsTab] = useState<'hooks' | 'metadata'>('hooks')
  const [hooks, setHooks] = useState<Partial<Record<HookPhase, string[]>>>(seed?.hooks ?? RECOMMENDED_HOOKS)
  const [hookCatalog, setHookCatalog] = useState<Partial<Record<HookPhase, string[]>>>({})
  // Common keys with empty values — only filled values are sent; empty ones keep InspectorWeb's defaults.
  const [metaRows, setMetaRows] = useState<MetaRow[]>(() => seed?.metaRows ?? DEFAULT_METADATA_KEYS.map((k) => newMetaRow(k)))
  const [labels, setLabels] = useState<string[]>(seed?.labels ?? [])
  // Report
  const [elastic, setElastic] = useState(seed?.elastic ?? true)
  // Merge into existing Xray test executions: on by default for new configs.
  const [jiraMerge, setJiraMerge] = useState<boolean>(seed?.jiraMerge ?? true)
  const [xTestExecution, setXTestExecution] = useState(seed?.xTestExecution ?? '')

  const [saving, setSaving] = useState<'save' | 'execute' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Test-file search
  const [fileQuery, setFileQuery] = useState('')
  const debouncedFileQuery = useDebounced(fileQuery)
  const debouncedBranch = useDebounced(branch, 500)
  const [fileHits, setFileHits] = useState<TestCaseFile[]>([])
  const [fileTotal, setFileTotal] = useState(0)
  const [fileLoading, setFileLoading] = useState(false)
  // Device search
  const [deviceQuery, setDeviceQuery] = useState('')
  const debouncedDeviceQuery = useDebounced(deviceQuery)
  // Find devices by name or by CPE ID (any part, e.g. "778900080045").
  const [deviceBy, setDeviceBy] = useState<'name' | 'cpe_id'>('name')
  const [deviceHits, setDeviceHits] = useState<Device[]>([])
  const [deviceLoading, setDeviceLoading] = useState(false)

  useEffect(() => {
    if (STEPS[step].key !== 'what' || mode !== 'files' || !debouncedBranch.trim()) return
    let cancelled = false
    setFileLoading(true)
    searchTestCases(debouncedBranch.trim(), debouncedFileQuery, 50)
      .then((r) => { if (!cancelled) { setFileHits(r.data); setFileTotal(r.total) } })
      .catch(() => { if (!cancelled) { setFileHits([]); setFileTotal(0) } })
      .finally(() => { if (!cancelled) setFileLoading(false) })
    return () => { cancelled = true }
  }, [debouncedBranch, debouncedFileQuery, mode, step])

  useEffect(() => {
    if (!debouncedDeviceQuery) { setDeviceHits([]); return }
    let cancelled = false
    setDeviceLoading(true)
    searchDevices(debouncedDeviceQuery, 1, 10, 'stb', deviceBy)
      .then((r) => {
        if (cancelled) return
        setDeviceHits(r.data)
        const found = r.data.map((d) => d.lockedForGroup).filter((g): g is string => !!g)
        if (found.length) setSeenGroups((s) => [...new Set([...s, ...found])].sort())
      })
      .catch(() => { if (!cancelled) setDeviceHits([]) })
      .finally(() => { if (!cancelled) setDeviceLoading(false) })
    return () => { cancelled = true }
  }, [debouncedDeviceQuery, deviceBy])

  useEffect(() => {
    if (!debouncedBranch.trim()) return
    getMochaHooks(debouncedBranch.trim())
      .then((catalog) => {
        setHookCatalog(catalog)
        // Drop selected hooks this branch doesn't have, so we never save unknown hook names.
        if (Object.keys(catalog).length) {
          setHooks((h) => Object.fromEntries(
            Object.entries(h).map(([k, v]) => [k, (v ?? []).filter((x) => (catalog[k as HookPhase] ?? []).includes(x))]),
          ))
        }
      })
      .catch(() => setHookCatalog({}))
  }, [debouncedBranch])

  // OTT selector suggestions, loaded once OTT is picked.
  useEffect(() => {
    if (!ott || Object.keys(ottOptions).length) return
    getOttOptions().then(setOttOptions).catch(() => setOttOptions({}))
  }, [ott, ottOptions])

  // App Center versions for provisioning, filtered by the OTT platforms selected (as InspectorWeb does).
  const ottPlatformKey = ottGroups.flat().filter((s) => s.type === 'platform' && s.value.trim()).map((s) => s.value.trim().toLowerCase()).join(',')
  useEffect(() => {
    if (!ott) return
    getAppVersions(ottPlatformKey ? ottPlatformKey.split(',') : []).then(setAppVersions).catch(() => setAppVersions({}))
  }, [ott, ottPlatformKey])

  // Labs to provision: from the STB boxes' labs (both), or the customer lab (OTT only).
  const detectedLabs = useMemo(() => {
    if (!ott) return []
    if (stb) return stbMatch.match?.provisioningLabs ?? []
    return ottLab.trim() ? [ottLab.trim().split('_').pop()!] : []
  }, [ott, stb, stbMatch.match, ottLab])
  useEffect(() => {
    if (!detectedLabs.length) return
    setProvRows((rows) => {
      const have = new Set(rows.map((r) => r.lab.trim()))
      const missing = detectedLabs.filter((l) => !have.has(l))
      return missing.length ? [...rows, ...missing.map((l) => newProvRow(l))] : rows
    })
  }, [detectedLabs])

  // OTT keys (addLogin / addLogout) appear with empty values when OTT is picked; untouched ones go away again.
  useEffect(() => {
    setMetaRows((rows) => {
      const keys = new Set(rows.map((r) => r.key.trim()))
      if (ott) {
        const add = OTT_METADATA_KEYS.filter((k) => !keys.has(k))
        return add.length ? [...rows, ...add.map((k) => newMetaRow(k))] : rows
      }
      return rows.filter((r) => !(OTT_METADATA_KEYS.includes(r.key.trim()) && !r.value.trim()))
    })
  }, [ott])

  const provErrs = useMemo(() => provisioningErrors(provRows, stb && ott), [provRows, stb, ott])

  const jqlLines = jql.map((l) => l.trim()).filter(Boolean)

  // Overview: test-case count per JQL query — reuse the step's preview when it matches, else look it up.
  const jqlKeyNow = jqlPreviewKey(branch.trim() || 'master', jqlLines)
  const [overviewJqlLoading, setOverviewJqlLoading] = useState(false)
  const [overviewJqlError, setOverviewJqlError] = useState(false)
  const overviewJql = jqlPreview?.key === jqlKeyNow ? jqlPreview.results : null
  useEffect(() => {
    if (STEPS[step].key !== 'overview' || mode !== 'jql' || !jqlLines.length || jqlPreview?.key === jqlKeyNow) return
    let cancelled = false
    setOverviewJqlLoading(true)
    setOverviewJqlError(false)
    previewJql(branch.trim() || 'master', jqlLines)
      .then((results) => { if (!cancelled) setJqlPreview({ key: jqlKeyNow, results }) })
      .catch(() => { if (!cancelled) setOverviewJqlError(true) })
      .finally(() => { if (!cancelled) setOverviewJqlLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mode, jqlKeyNow])
  const metaErrs = useMemo(() => metadataErrors(metaRows), [metaRows])

  // ── Validation per step ──
  const errors = useMemo<Record<StepKey, FieldErrors>>(() => {
    const about: FieldErrors = {}
    const nameErr = nameError(name)
    if (nameErr) about.name = nameErr
    if (labels.some((l) => l.length > 60)) about.labels = 'Each label must be at most 60 characters.'
    else if (labels.length > 30) about.labels = 'At most 30 labels.'

    const where: FieldErrors = {}
    const checkSelectors = (gs: { value: string; regex: boolean }[][], prefix: string) => gs.forEach((g, gi) => g.forEach((sel, si) => {
      if (!sel.value.trim()) where[`${prefix}-${gi}-${si}`] = 'Enter a value or remove this selector.'
      else if (sel.regex) {
        try { new RegExp(sel.value) } catch { where[`${prefix}-${gi}-${si}`] = 'Not a valid regular expression.' }
      }
    }))
    if (platforms.length === 0) where.platforms = 'No platform selected!'
    if (stb) {
      checkSelectors(groups, 'sel')
      if (groups.length === 0) where.groups = 'No STB box selected!'
      if (!lockGroup.trim()) where.lockGroup = 'No locked-for group provided!'
      else if (lockGroup.length > 100) where.lockGroup = 'At most 100 characters.'
    }
    if (ott) {
      checkSelectors(ottGroups, 'ott')
      if (ottGroups.length === 0) where.ottGroups = 'No OTT device selected!'
      if (!stb && ottLab.length > 100) where.ottLab = 'At most 100 characters.'
    }

    const what: FieldErrors = {}
    if (!branch.trim()) what.branch = 'No branch provided!'
    else if (meta?.branches?.length && !meta.branches.includes(branch.trim())) what.branch = `Branch "${branch.trim()}" doesn't exist in InspectorWeb.`
    if (mode === 'files' && files.length === 0) what.tests = 'No test cases selected!'
    if (mode === 'jql' && jqlLines.length === 0) what.tests = 'No Xray JQL query provided!'
    if (mode === 'jql' && jqlLines.length > MAX_JQL_QUERIES) what.tests = `At most ${MAX_JQL_QUERIES} queries.`
    if (ott) {
      if (provErrs.general) what.provisioning = provErrs.general
      else if (Object.keys(provErrs.rows).length) what.provisioning = 'Fix the highlighted provisioning rows.'
    }

    const report: FieldErrors = {}
    if (mode === 'jql' && xTestExecution.trim() && !X_TEST_EXECUTION_RE.test(xTestExecution.trim().toUpperCase())) {
      report.xTestExecution = 'X Test Execution must look like XHZN4SI-76889.'
    }

    const how: FieldErrors = {}
    if (!timeOut) how.timeOut = 'No timeout configured!'

    const options: FieldErrors = {}
    if (Object.keys(metaErrs).length) options.metadata = 'Fix the highlighted metadata rows.'

    return { about, where, what, how, options, report, overview: {} }
  }, [name, labels, metaErrs, platforms, stb, ott, groups, ottGroups, ottLab, lockGroup, provErrs, branch, meta, mode, files.length, jqlLines.length, timeOut, xTestExecution])

  const warnings = useMemo<Partial<Record<StepKey, string[]>>>(() => ({
    report: elastic ? [] : ['Results won\'t reach Elastic/ODH, so RCA "Analyze failures" will find nothing for this run.'],
    options: (hooks.beforeEachRun ?? []).includes('forcePowerOn') ? [] : ['forcePowerOn is off — the run may fail if the device is in standby.'],
  }), [elastic, hooks])

  const allErrors = STEPS.flatMap((s, i) => Object.values(errors[s.key]).map((msg) => ({ step: i, msg })))

  const states: StepState[] = STEPS.map((s, i) => {
    const hasErr = Object.keys(errors[s.key]).length > 0
    if (s.key === 'overview') return allErrors.length && checked.has('overview') ? 'error' : 'todo'
    if (hasErr && checked.has(s.key)) return 'error'
    if ((warnings[s.key] ?? []).length && (checked.has(s.key) || i === step)) return 'warning'
    if (!hasErr && checked.has(s.key)) return 'done'
    return 'todo'
  })

  const current = STEPS[step].key
  const show = checked.has(current) || current === 'overview'
  const fe = (key: string) => (show ? errors[current][key] : undefined)

  function markChecked(key: StepKey) {
    setChecked((c) => new Set(c).add(key))
  }

  function go(i: number) {
    markChecked(current)
    if (STEPS[i].key === 'overview') setChecked(new Set(STEPS.map((s) => s.key)))
    setStep(i)
  }

  function next() {
    markChecked(current)
    if (Object.keys(errors[current]).length > 0) return // stay; errors are now visible
    go(step + 1)
  }

  function setSelector(gi: number, si: number, patch: Partial<Selector>) {
    setGroups((gs) => gs.map((g, i) => i !== gi ? g : g.map((s, j) => j !== si ? s : { ...s, ...patch })))
  }

  function addDevice(d: Device) {
    setGroups((gs) => {
      // Found by CPE ID → target that exact box by its CPE ID; otherwise by name.
      const sel: Selector = deviceBy === 'cpe_id' && d.cpeId
        ? { type: 'cpe_id', value: d.cpeId, regex: false }
        : { type: 'name', value: d.name, regex: false }
      const empty = gs.findIndex((g) => g.length === 1 && !g[0].value)
      if (empty >= 0) return gs.map((g, i) => (i === empty ? [sel] : g))
      return [...gs, [sel]]
    })
    setDeviceQuery('')
    if (!lockGroup.trim() && d.lockedForGroup) setLockGroup(d.lockedForGroup)
  }

  async function submit(execute: boolean) {
    setChecked(new Set(STEPS.map((s) => s.key)))
    if (allErrors.length) return
    setSaving(execute ? 'execute' : 'save')
    setSaveError(null)
    try {
      const payload = {
        name,
        branch: branch.trim(),
        testCases: mode === 'files' ? files : [],
        jql: mode === 'jql' ? jqlLines : [],
        platforms,
        targets: stb ? groups.map((g) => g.map((s) => ({ type: s.type, value: s.value.trim(), regex: s.regex }))) : [],
        devices: ott ? ottGroups.map((g) => g.map((s) => ({ type: s.type, value: s.value.trim(), regex: s.regex }))) : [],
        provisioning: ott ? provisioningPayload(provRows) : {},
        lab: ott && !stb && ottLab.trim() ? ottLab.trim() : null,
        timeOut,
        labels,
        metadata: metadataPayload(metaRows),
        group: stb ? lockGroup.trim() : null,
        mochaHooks: hooks,
        runParallel,
        elastic,
        jiraResultsMerge: mode === 'jql' ? jiraMerge : false,
        xTestExecution: mode === 'jql' && xTestExecution.trim() ? xTestExecution.trim().toUpperCase() : null,
      }
      const rc = editing && initial
        ? await updateRunConfig(initial.raw.uuid, payload, execute)
        : await createRunConfig(payload, execute)
      onSaved(rc, rc.run ?? null)
    } catch (err) {
      const msg = regressionErrorMessage(err, editing ? 'Could not save the run config.' : 'Could not create the run config.')
      setSaveError(msg)
      onError?.(msg)
    } finally {
      setSaving(null)
    }
  }

  const bannerErrors = current === 'overview'
    ? allErrors.map((e) => e.msg)
    : show ? Object.values(errors[current]).filter((m, i, a) => a.indexOf(m) === i) : []
  const bannerWarnings = warnings[current] ?? []

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">
            {editing ? 'Edit run config' : initial?.mode === 'duplicate' ? 'Duplicate run config' : 'New run config'}
            {editing && initial && <span className="ml-2 font-mono text-[10px] font-normal text-gray-500">{initial.raw.uuid}</span>}
          </h2>
          <p className="text-[11px] text-gray-500">
            Saved in InspectorWeb as <span className="font-mono text-gray-300">{inspectorUsername}</span> · {platformLabel || 'choose STB / OTT'} · only you will see it here
          </p>
        </div>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-200">Cancel</button>
      </div>

      {/* Stepper */}
      <div className="flex shrink-0 items-center gap-1 border-b border-gray-800 px-2 py-3">
        <button
          onClick={() => step > 0 && go(step - 1)}
          disabled={step === 0}
          aria-label="Previous step"
          className="shrink-0 text-gray-400 hover:text-gray-200 disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1"><Stepper states={states} current={step} onGo={go} /></div>
        <button
          onClick={() => step < STEPS.length - 1 && next()}
          disabled={step === STEPS.length - 1}
          aria-label="Next step"
          className="shrink-0 text-gray-400 hover:text-gray-200 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Banners */}
      {bannerErrors.length > 0 && (
        <div className="shrink-0 space-y-0.5 bg-red-500/90 px-4 py-2 text-sm font-medium text-white">
          {bannerErrors.map((m) => (
            <p key={m} className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{m}</p>
          ))}
        </div>
      )}
      {bannerWarnings.length > 0 && (
        <div className="shrink-0 space-y-0.5 bg-amber-500/15 px-4 py-2 text-xs text-amber-200">
          {bannerWarnings.map((m) => <p key={m}>⚠ {m}</p>)}
        </div>
      )}

      {/* Step body */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {current === 'about' && (
          <>
            <div>
              <label className={labelCls} htmlFor="wz-name">Name *</label>
              <input
                id="wz-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. FT_ADVERTISING_R5.15.01_ARRIS_P1_CPE-SR202-ac_LABE2ESI_BE_TV360"
                className={`${inputCls} ${fe('name') ? errBorder : okBorder}`}
              />
              <FieldError msg={fe('name')} />
              <p className="mt-1 text-[11px] text-gray-500">
                Naming pattern: <span className="font-mono text-gray-400">TEAM_RELEASE_BOX_PRIORITY_CPE-BUILD_LAB_COUNTRY_PRODUCT</span>, e.g.{' '}
                <span className="font-mono text-gray-400">FT_ADVERTISING_R5.15.01_ARRIS_P1_CPE-SR202-ac_LABE2ESI_BE_TV360</span>.
                Letters, digits, - _ . [ ] — no spaces.
              </p>
            </div>
            <LabelPicker options={meta?.labelOptions ?? []} value={labels} onChange={setLabels} error={fe('labels')} />
          </>
        )}

        {current === 'where' && (
          <>
            <PlatformPicker
              value={platforms}
              onToggle={(p) => setPlatforms((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]))}
              error={fe('platforms')}
            />

            {stb && (
              <section className="space-y-3 rounded-xl border border-gray-800 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-100">STB boxes</h3>
                  <div className="flex items-center gap-3">
                    {(groups.some((g) => g.some((x) => x.value.trim())) || lockGroup) && (
                      <button
                        onClick={() => { setGroups(emptyStbGroups()); setLockGroup(''); setDeviceQuery('') }}
                        className="text-xs text-gray-400 hover:text-red-400"
                      >
                        Clear all
                      </button>
                    )}
                    <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">targets</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500">Each group matches devices where <b>all</b> its selectors match; the run can use a device from <b>any</b> group.</p>
                <div className="relative">
                  <div className="flex gap-2">
                    <div role="radiogroup" aria-label="Find devices by" className="flex shrink-0 gap-1 rounded-lg border border-gray-700 bg-gray-800 p-1">
                      {([['name', 'Name'], ['cpe_id', 'CPE ID']] as const).map(([v, label]) => (
                        <button key={v} type="button" role="radio" aria-checked={deviceBy === v} onClick={() => setDeviceBy(v)}
                          className={`rounded-md px-2.5 text-xs font-medium ${deviceBy === v ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      <input
                        value={deviceQuery}
                        onChange={(e) => setDeviceQuery(e.target.value)}
                        placeholder={deviceBy === 'cpe_id' ? 'Find a device by CPE ID e.g. E0B7B1-APPSTB-301000049009' : 'Find a device by name to add it…'}
                        aria-label={deviceBy === 'cpe_id' ? 'Search devices by CPE ID' : 'Search devices by name'}
                        className={`${inputCls} ${okBorder} pl-9 ${deviceBy === 'cpe_id' ? 'font-mono' : ''}`}
                      />
                    </div>
                  </div>
                  {deviceQuery && (deviceHits.length > 0 || deviceLoading || debouncedDeviceQuery === deviceQuery) && (
                    <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
                      {deviceLoading && <li className="p-2 text-xs text-gray-500">Searching…</li>}
                      {!deviceLoading && deviceHits.length === 0 && (
                        <li className="p-2 text-xs text-gray-500">No STB device {deviceBy === 'cpe_id' ? 'CPE ID' : 'name'} contains “{deviceQuery}”.</li>
                      )}
                      {deviceHits.map((d) => (
                        <li key={d.name}>
                          <button onClick={() => addDevice(d)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-gray-800"
                            title={deviceBy === 'cpe_id' && d.cpeId ? `Adds a "CPE ID = ${d.cpeId}" selector` : `Adds a "Device name = ${d.name}" selector`}>
                            <span className="min-w-0">
                              <span className="block truncate text-gray-100">{d.name}</span>
                              {d.cpeId && <span className={`block truncate font-mono text-[10px] ${deviceBy === 'cpe_id' ? 'text-primary-300' : 'text-gray-500'}`}>{d.cpeId}</span>}
                            </span>
                            <span className="flex gap-2 text-gray-500">
                              {d.platform && <span>{d.platform}</span>}
                              {d.lab && <span className="hidden xl:inline">{d.lab}</span>}
                              {d.lockedForGroup && <span>🔒 {d.lockedForGroup}</span>}
                              <span className={d.status === 'IDLE' ? 'text-emerald-400' : 'text-amber-400'}>{d.status ?? '—'}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="space-y-2">
                  {groups.map((g, gi) => (
                    <div key={gi} className="rounded-lg border border-gray-800 p-3">
                      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                        <span>{gi === 0 ? 'Device group 1' : `OR device group ${gi + 1}`}</span>
                        {groups.length > 1 && (
                          <button onClick={() => setGroups((gs) => gs.filter((_, i) => i !== gi))} className="hover:text-red-400" aria-label="Remove group">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {g.map((sel, si) => {
                          const err = fe(`sel-${gi}-${si}`)
                          return (
                            <div key={si}>
                              <div className="grid grid-cols-[130px_1fr_auto_auto] items-center gap-2">
                                <select
                                  value={sel.type}
                                  onChange={(e) => setSelector(gi, si, { type: e.target.value as SelectorType })}
                                  aria-label="Selector type"
                                  className="h-8 rounded-lg border border-gray-700 bg-gray-800 px-2 text-xs text-gray-100"
                                >
                                  {SELECTOR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                                <input
                                  value={sel.value}
                                  onChange={(e) => setSelector(gi, si, { value: e.target.value })}
                                  placeholder={sel.type === 'name' ? 'HArchive_021' : sel.type === 'lockedForGroup' ? 'CONTINUOUS' : 'value'}
                                  aria-label="Selector value"
                                  className={`h-8 rounded-lg border bg-gray-800 px-2 text-xs text-gray-100 placeholder-gray-600 focus:outline-none ${err ? errBorder : okBorder}`}
                                />
                                <label className="flex items-center gap-1 text-[11px] text-gray-400" title="Treat the value as a regular expression">
                                  <input type="checkbox" checked={sel.regex} onChange={(e) => setSelector(gi, si, { regex: e.target.checked })} className="h-3.5 w-3.5" />
                                  regex
                                </label>
                                <button
                                  onClick={() => setGroups((gs) => {
                                    const next = gs.map((x, i) => i !== gi ? x : x.filter((_, j) => j !== si)).filter((x) => x.length > 0)
                                    return next.length ? next : emptyStbGroups() // last one cleared → start again empty
                                  })}
                                  aria-label="Remove selector"
                                  title="Remove selector"
                                  className="text-gray-500 hover:text-red-400"
                                >
                                  <XIcon className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <FieldError msg={err} />
                            </div>
                          )
                        })}
                      </div>
                      <button
                        onClick={() => setGroups((gs) => gs.map((x, i) => i !== gi ? x : [...x, { type: 'lockedForGroup', value: '', regex: false }]))}
                        className="mt-2 text-xs text-primary-400 hover:text-primary-300"
                      >
                        + AND selector
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setGroups((gs) => [...gs, [{ type: 'name', value: '', regex: false }]])}
                    className="text-xs text-primary-400 hover:text-primary-300"
                  >
                    + OR device group
                  </button>
                </div>
                <div>
                  <label className={labelCls} htmlFor="wz-lock">Locked-for group *</label>
                  <div className="relative">
                    <input
                      id="wz-lock"
                      list="wz-lock-groups"
                      value={lockGroup}
                      onChange={(e) => setLockGroup(e.target.value)}
                      placeholder="e.g. CONTINUOUS"
                      className={`${inputCls} pr-8 ${fe('lockGroup') ? errBorder : okBorder}`}
                    />
                    {lockGroup && (
                      <button
                        onClick={() => setLockGroup('')}
                        aria-label="Clear locked-for group"
                        title="Clear"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <datalist id="wz-lock-groups">{seenGroups.map((g) => <option key={g} value={g} />)}</datalist>
                  <FieldError msg={fe('lockGroup')} />
                  <p className="mt-1 text-[11px] text-gray-500">
                    The device group this run reserves devices under. Adding a device above fills it in from that device's 🔒 group.
                  </p>
                </div>
                <MatchSummary match={stbMatch.match} loading={stbMatch.loading} error={stbMatch.error} noun="box" />
              </section>
            )}

            {ott && (
              <section className="space-y-3 rounded-xl border border-gray-800 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-100">OTT devices</h3>
                  <div className="flex items-center gap-3">
                    {(ottGroups.some((g) => g.some((x) => x.value.trim())) || ottLab) && (
                      <button
                        onClick={() => { setOttGroups([newOttGroup()]); setOttLab('') }}
                        className="text-xs text-gray-400 hover:text-red-400"
                      >
                        Clear all
                      </button>
                    )}
                    <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">devices</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500">Each group matches devices where <b>all</b> its selectors match. Start with location and device type, then narrow with platform or a name pattern.</p>
                <OttDevicesEditor
                  groups={ottGroups}
                  onChange={setOttGroups}
                  options={ottOptions}
                  errors={show ? errors.where : {}}
                  match={ottMatch}
                  showLab={!stb}
                  lab={ottLab}
                  onLab={setOttLab}
                  labError={fe('ottLab')}
                />
              </section>
            )}
          </>
        )}

        {current === 'what' && (
          <>
            <div>
              <label className={labelCls} htmlFor="wz-branch">Test branch *</label>
              <input id="wz-branch" list="wz-branches" value={branch} onChange={(e) => setBranch(e.target.value)} className={`${inputCls} ${fe('branch') ? errBorder : okBorder}`} />
              <datalist id="wz-branches">{(meta?.branches ?? []).map((b) => <option key={b} value={b} />)}</datalist>
              <FieldError msg={fe('branch')} />
            </div>
            <div className="flex w-fit gap-1 rounded-lg bg-gray-800 p-1">
              {(['files', 'jql'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${mode === m ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  {m === 'files' ? 'Test files' : 'Xray JQL'}
                </button>
              ))}
            </div>
            {mode === 'files' ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input
                    value={fileQuery}
                    onChange={(e) => setFileQuery(e.target.value)}
                    placeholder="Search e.g. XHZN4SI-36841 or disney opening"
                    aria-label="Search test files"
                    className={`${inputCls} ${okBorder} pl-9`}
                  />
                </div>
                <ul className="h-40 overflow-y-auto rounded-lg border border-gray-800">
                  {fileLoading ? (
                    <li className="p-3 text-xs text-gray-500">Searching…</li>
                  ) : fileHits.length === 0 ? (
                    <li className="p-3 text-xs text-gray-500">No test files match.</li>
                  ) : fileHits.map((f) => {
                    const picked = files.includes(f.basePath)
                    return (
                      <li key={f.basePath}>
                        <button
                          disabled={picked}
                          onClick={() => setFiles((fs) => [...fs, f.basePath])}
                          title={f.basePath}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-gray-800 disabled:text-gray-600"
                        >
                          {picked ? <Check className="h-3 w-3 shrink-0 text-emerald-500" /> : <Plus className="h-3 w-3 shrink-0" />}
                          <span className="truncate">{f.basePath.replace(/^\/testCases\//, '')}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {fileTotal > fileHits.length && <p className="text-[11px] text-gray-500">Showing {fileHits.length} of {fileTotal.toLocaleString()} — refine the search.</p>}
                <div>
                  <p className="mb-1 text-xs text-gray-400">Selected ({files.length})</p>
                  <ul className={`max-h-36 space-y-1 overflow-y-auto rounded-lg border p-1 ${fe('tests') ? 'border-red-500' : 'border-gray-800'}`}>
                    {files.length === 0 && <li className="p-2 text-xs text-gray-500">Click files above to add them.</li>}
                    {files.map((f) => (
                      <li key={f} className="flex items-center gap-2 rounded bg-gray-800/60 px-2 py-1 text-xs text-gray-200">
                        <span className="min-w-0 flex-1 truncate" title={f}>{f.split('/').pop()}</span>
                        <button onClick={() => setFiles((fs) => fs.filter((x) => x !== f))} aria-label="Remove" className="text-gray-500 hover:text-red-400">
                          <XIcon className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <FieldError msg={fe('tests')} />
                </div>
              </div>
            ) : (
              <JqlQueriesEditor
                queries={jql}
                onChange={setJql}
                branch={branch.trim() || 'master'}
                error={fe('tests')}
                preview={jqlPreview}
                onPreview={setJqlPreview}
              />
            )}
            {ott && (
              <ProvisioningEditor
                rows={provRows}
                onChange={setProvRows}
                versions={appVersions}
                detectedLabs={detectedLabs}
                required={stb && ott}
                errors={provErrs.rows}
                generalError={provErrs.general}
                showErrors={show}
              />
            )}
          </>
        )}

        {current === 'how' && (
          <>
            <div>
              <label className={labelCls} htmlFor="wz-timeout">Timeout *</label>
              <select id="wz-timeout" value={timeOut} onChange={(e) => setTimeOut(Number(e.target.value))} className={`${inputCls} ${fe('timeOut') ? errBorder : okBorder}`}>
                {timeoutOptions.map((t) => <option key={t} value={t}>{formatTimeout(t)}</option>)}
              </select>
              <FieldError msg={fe('timeOut')} />
              <p className="mt-1 text-[11px] text-gray-500">The whole run is stopped after this. Lab servers have no other run timeout.</p>
            </div>
            <label className="flex items-start gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={runParallel} onChange={(e) => setRunParallel(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                Run test cases in parallel
                <span className="block text-xs text-gray-500">Spread test cases over every matching device, each in its own process. Off = one device, one test at a time.</span>
              </span>
            </label>
          </>
        )}

        {current === 'options' && (
          <div className="space-y-4">
            <div role="tablist" aria-label="Options" className="flex gap-6 border-b border-gray-800">
              {([
                ['hooks', 'Mocha hooks', Object.values(hooks).reduce((n, v) => n + (v?.length ?? 0), 0), false],
                ['metadata', 'Metadata', metaRows.filter((r) => r.key.trim() && r.value.trim()).length, !!fe('metadata')],
              ] as const).map(([key, label, count, bad]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={optionsTab === key}
                  onClick={() => setOptionsTab(key)}
                  className={`-mb-px inline-flex items-center gap-1.5 border-b-2 pb-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    optionsTab === key ? 'border-primary-500 text-primary-300' : 'border-transparent text-gray-500 hover:text-gray-300'
                  } ${bad ? 'text-red-400' : ''}`}
                >
                  {label}
                  <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${optionsTab === key ? 'bg-primary-500/20' : 'bg-gray-800'}`}>{count}</span>
                </button>
              ))}
            </div>
            {optionsTab === 'hooks' && <HookPicker branch={branch} catalog={hookCatalog} value={hooks} onChange={setHooks} />}
            {optionsTab === 'metadata' && (
              <MetadataEditor rows={metaRows} onChange={setMetaRows} errors={metaErrs} showErrors={show} />
            )}
          </div>
        )}

        {current === 'report' && (
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={elastic} onChange={(e) => setElastic(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                Send results to Elastic (ODH)
                <span className="block text-xs text-gray-500">Needed for the RCA analysis of this run's failures.</span>
              </span>
            </label>
            {mode === 'jql' ? (
              <div className="space-y-3 rounded-lg border border-gray-800 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Xray</p>
                <XTestExecutionField value={xTestExecution} onChange={setXTestExecution} error={fe('xTestExecution')} />
                <button
                  type="button"
                  role="switch"
                  aria-checked={jiraMerge}
                  onClick={() => setJiraMerge(!jiraMerge)}
                  className="flex w-full items-center justify-between gap-4 rounded-md px-1 py-1 text-left hover:bg-gray-800/40"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-200">Merge results into existing Xray test executions</span>
                    <span className="block text-xs text-gray-500">{jiraMerge ? 'On' : 'Off'} — on by default.</span>
                  </span>
                  <span
                    aria-hidden
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${jiraMerge ? 'bg-primary-500' : 'bg-gray-700'}`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${jiraMerge ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                  </span>
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-500">Xray reporting (X Test Execution, merge) is available when "What To Run" uses Xray JQL.</p>
            )}
          </div>
        )}

        {current === 'overview' && (
          <div className="space-y-3 text-xs">
            {[
              { i: 0, title: 'About', rows: [['Name', name || '—'], ['Labels', labels.join(', ') || '—']] },
              { i: 1, title: 'Where To Run', rows: [
                ['Platform', platformLabel || '—'],
                ...(stb ? [
                  ...groups.map((g, gi) => [`STB group ${gi + 1}`, g.map((x) => `${x.type}=${x.value || '?'}${x.regex ? ' (regex)' : ''}`).join(' · ')]),
                  ['Locked-for group', lockGroup || '—'],
                  ['STB match', stbMatch.match ? `${stbMatch.match.count} box(es)` : '—'],
                ] : []),
                ...(ott ? [
                  ...ottGroups.map((g, gi) => [`OTT group ${gi + 1}`, g.map((x) => `${x.type}=${x.value || '?'}${x.regex ? ' (regex)' : ''}`).join(' · ')]),
                  ['OTT match', ottMatch.match ? `${ottMatch.match.count} device(s)` : '—'],
                  ...(!stb && ottLab ? [['Customer lab', ottLab]] : []),
                ] : []),
              ] },
              { i: 2, title: 'What To Run', rows: [
                ['Branch', branch || '—'],
                // Test files: one line per test case (file name without folder/extension). Xray JQL: count only.
                mode === 'files'
                  ? [`Test files (${files.length})`, files.map((f) => (f.split('/').pop() ?? f).replace(/\.js$/, '')).join('\n') || '—']
                  : ['Xray JQL', `${jqlLines.length} quer${jqlLines.length === 1 ? 'y' : 'ies'}`],
                // Test-case count per query (looked up when the Overview opens).
                ...(mode === 'jql' ? jqlLines.map((q, qi) => {
                  const r = overviewJql?.find((x) => x.query === q)
                  const count = overviewJqlLoading ? 'counting…' : r ? `${r.count} test case${r.count === 1 ? '' : 's'}` : overviewJqlError ? 'count unavailable' : '—'
                  return [`Query ${qi + 1}`, `${count} · ${q}`]
                }) : []),
                ...(ott ? [['Provisioning', Object.entries(provisioningPayload(provRows)).map(([lab, p]) => `${lab}: ${p.version} (${p.branch} - ${p.sprint})`).join(' · ') || '—']] : []),
              ] },
              { i: 3, title: 'How to Run', rows: [['Timeout', formatTimeout(timeOut)], ['Parallel', runParallel ? 'Yes' : 'No']] },
              { i: 4, title: 'Options', rows: [
                ...HOOK_PHASES.filter((p) => (hooks[p.key] ?? []).length).map((p) => [p.key, (hooks[p.key] ?? []).join(', ')]),
                ['Metadata', Object.entries(metadataPayload(metaRows)).map(([k, v]) => `${k}=${v}`).join(' · ') || 'InspectorWeb defaults'],
              ] },
              { i: 5, title: 'Where To Report', rows: [
                ['Elastic (ODH)', elastic ? 'Yes' : 'No'],
                ...(mode === 'jql' ? [
                  ['X Test Execution', xTestExecution.trim() || '—'],
                  ['Merge into Xray', jiraMerge ? 'Yes' : 'No'],
                ] : []),
              ] },
            ].map((sec) => {
              const secErrors = Object.values(errors[STEPS[sec.i].key])
              return (
                <div key={sec.title} className={`rounded-lg border p-3 ${secErrors.length ? 'border-red-500/60' : 'border-gray-800'}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className={`font-semibold ${secErrors.length ? 'text-red-400' : 'text-gray-200'}`}>
                      {secErrors.length ? '⚠ ' : ''}{sec.title}
                    </h4>
                    <button onClick={() => go(sec.i)} className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300">
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  </div>
                  <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1">
                    {sec.rows.length === 0 && <dd className="col-span-2 text-gray-500">None</dd>}
                    {sec.rows.map(([k, v]) => (
                      <Fragment key={k}>
                        <dt className="text-gray-500">{k}</dt>
                        <dd className="whitespace-pre-line break-words text-gray-300">{v}</dd>
                      </Fragment>
                    ))}
                  </dl>
                </div>
              )
            })}
            {saveError && <p className="break-words rounded-lg bg-red-500/10 p-3 text-red-300">{saveError}</p>}
            <p className="text-gray-500"><b className="text-gray-300">Save</b> stores it in your run configs. <b className="text-gray-300">Save &amp; Execute</b> stores it and starts a run on InspectorWeb straight away — it will lock the devices above.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-gray-800 px-4 py-3">
        <Button variant="ghost" size="sm" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => go(step - 1)} disabled={step === 0}>
          Back
        </Button>
        <span className="text-[11px] text-gray-500">Step {step + 1} of {STEPS.length}</span>
        {current === 'overview' ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Save className="h-3.5 w-3.5" />}
              onClick={() => submit(false)}
              loading={saving === 'save'}
              disabled={allErrors.length > 0 || saving !== null}
              title={editing ? 'Save changes to this run config' : 'Save it to your run configs'}
            >
              Save
            </Button>
            <Button
              size="sm"
              icon={<Play className="h-3.5 w-3.5" />}
              onClick={() => submit(true)}
              loading={saving === 'execute'}
              disabled={allErrors.length > 0 || saving !== null}
              title="Save, then start a run on InspectorWeb right away"
            >
              Save &amp; Execute
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={next}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
