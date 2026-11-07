// Author: Kishore Kumar
// Regression tab API — proxies InspectorWeb via /api/v1/regression (see docs/regression-tab-plan.md).
import { apiClient } from './client'

export type RunPhase = 'queued' | 'running' | 'done' | 'aborted' | 'failed' | 'unknown'

export interface RunInfo {
  total: number
  PASSED: number
  FAILED: number
  SKIPPED: number
  UNKNOWN: number
}

export interface Page<T> {
  data: T[]
  page: number
  pageSize: number
  totalPage: number
  total: number
}

export interface RegressionMeta {
  version: string | null
  environment: string | null
  branches: string[]
  timeoutOptions: number[]
  /** Label suggestions configured in InspectorWeb (Regression, Smoke, …). */
  labelOptions?: string[]
}

export interface TargetSelector {
  type: string
  value: string
  regex?: boolean
}

export interface RunConfigSummary {
  uuid: string
  name: string
  owner: string | null
  branch: string | null
  labels: string[]
  group: string[] | string | null
  targets: TargetSelector[][]
  testCases: string[]
  jql: string[]
  xray: boolean
  timeOut: number | null
  runParallel: boolean | null
  updated: string | null
  platforms?: ('STB' | 'OTT')[]
  inspectorwebUrl: string
  /** InspectorWeb executions page filtered to this config's name. */
  executionsUrl?: string
  /** Kibana MOAM dashboard filtered to this config. */
  moamUrl?: string
}

/** Full InspectorWeb run config, as used for download / raw view / edit / duplicate. */
export interface RawRunConfig {
  uuid: string
  name: string
  username: string
  updated: string | null
  runconfig: Record<string, unknown>
}

export interface RegressionRun {
  id: number
  runUuid: string | null
  runConfigUuid: string
  name: string
  triggeredBy: string
  inspectorUsername: string
  status: string | null
  phase: RunPhase
  runInfo: RunInfo | null
  error: string | null
  stoppedBy: string | null
  /** Set when the app's scheduler started this run. */
  scheduleUuid?: string | null
  createdAt: string
  finishedAt: string | null
  inspectorwebUrl: string | null
  /** 'inspectorweb' = started outside this app (only shown when filtering by run config). */
  source?: 'app' | 'inspectorweb'
}

/** Readable result of a test case / device (InspectorWeb's UNKNOWN → no_result). */
export type Outcome = 'not_started' | 'running' | 'passed' | 'failed' | 'skipped' | 'aborted' | 'no_result'

export interface RunTarget {
  targetUuid: string
  testCaseUuid: string | null
  testCaseName: string | null
  /** Device name, e.g. HArchive_021 */
  name: string
  status: string
  phase: RunPhase
  outcome: Outcome
  runInfo: RunInfo | null
  error: string | null
  updatedAt?: string
  /** Present once the device has finished this test case. */
  reportUrl?: string
  logUrl?: string
  downloadUrl?: string
}

export interface RunTestCase {
  /** null when InspectorWeb recorded the device run without a test-case row (named from the config's test file). */
  testCaseUuid: string | null
  name: string
  status: string
  phase: RunPhase
  outcome: Outcome
  runInfo: RunInfo | null
  error: string | null
  updatedAt?: string
  targets: RunTarget[]
}

export interface RunProgress {
  total: number
  done: number
  running: number
  waiting: number
  aborted: number
}

/** Summary of one device's mochawesome report — the reliable status when counts say UNKNOWN. */
export interface TargetDetails {
  targetUuid: string
  testCaseName: string | null
  ticketNumber: string | null
  jiraLink: string | null
  status: string | null
  subStatus: string | null
  priority: string | null
  featureTeam: string | null
  tags: string[]
  components: string[]
  durationSecs: number | null
  reasons: { step: string | null; reason: string | null; subStatus: string | null }[]
  failedSteps: { title: string; error: string | null }[]
  stats: { tests?: number; passes?: number; failures?: number; pending?: number; skipped?: number }
  reportUrl: string
  logUrl: string
  downloadUrl: string
}

export interface RunStatus {
  runUuid: string
  name: string
  status: string | null
  phase: RunPhase
  isTerminal: boolean
  runInfo: RunInfo | null
  error: string | null
  startedAt?: string
  updatedAt?: string
  progress?: RunProgress
  testCases?: RunTestCase[]
  targets: RunTarget[]
  inspectorwebUrl?: string | null
  source: 'live' | 'snapshot'
  warning?: string
}

export async function getRegressionMeta(): Promise<RegressionMeta> {
  const { data } = await apiClient.get<RegressionMeta>('/regression/meta')
  return data
}

export interface RunConfigFilters {
  name?: string
  /** Full UUID only (InspectorWeb rejects partial UUIDs). */
  uuid?: string
  label?: string
  /** Admins with `all` only. */
  username?: string
  all?: boolean
}

/** Own run configs; `all` (admins only) lists everyone's. `owner` echoes the filter applied. */
export async function listRunConfigs(
  filters: RunConfigFilters, page = 1, pageSize = 15,
): Promise<Page<RunConfigSummary> & { owner: string | null }> {
  const { data } = await apiClient.get<Page<RunConfigSummary> & { owner: string | null }>('/regression/run-configs', {
    params: {
      q: filters.name || undefined,
      uuid: filters.uuid || undefined,
      label: filters.label || undefined,
      username: filters.all ? filters.username || undefined : undefined,
      all: filters.all || undefined,
      page,
      pageSize,
    },
  })
  return data
}

export async function getRunConfigFilterOptions(column: 'name' | 'label' | 'username', q: string, all = false): Promise<string[]> {
  const { data } = await apiClient.get<string[]>('/regression/run-configs/filter-options', {
    params: { column, q: q || undefined, all: all || undefined },
  })
  return data
}

export async function getRunConfigRaw(uuid: string): Promise<RawRunConfig> {
  const { data } = await apiClient.get<RawRunConfig>(`/regression/run-configs/${uuid}/raw`)
  return data
}

/** Soft-delete (expire) one of your run configs. */
export async function deleteRunConfig(uuid: string): Promise<void> {
  await apiClient.delete(`/regression/run-configs/${uuid}`)
}

export interface TestCaseFile {
  basePath: string
  name: string
}

export async function searchTestCases(branch: string, q: string, limit = 100): Promise<{ total: number; data: TestCaseFile[] }> {
  const { data } = await apiClient.get<{ total: number; data: TestCaseFile[] }>('/regression/test-cases', {
    params: { branch, q: q || undefined, limit },
  })
  return data
}

export type HookPhase = 'beforeEachRun' | 'beforeEachTest' | 'beforeEachStep' | 'afterEachStep' | 'afterEachTest' | 'afterEachRun'

export interface JqlPreview {
  query: string
  count: number
  /** Xray tickets the query returns; `files` = matching test files on the branch (empty = no automated script). */
  tickets: { key: string; jiraUrl: string; files: string[] }[]
}

/** Xray tickets each JQL query returns — read-only, same lookup as InspectorWeb's editor preview. */
export async function previewJql(branch: string, jql: string[]): Promise<JqlPreview[]> {
  const { data } = await apiClient.post<JqlPreview[]>('/regression/test-cases/preview', { branch, jql })
  return data
}

export interface XTestExecution { key: string; summary: string }

/**
 * Search Xray Test Executions by key or name (newest first). `exists` / `summary` describe `q`
 * when it is an exact known key.
 */
export async function searchXTestExecutions(
  q: string, limit = 20,
): Promise<{ total: number; items: XTestExecution[]; exists: boolean | null; summary: string | null }> {
  // The first call after a backend restart builds the list upstream (~40 s).
  const { data } = await apiClient.get('/regression/x-test-executions', { params: { q: q || undefined, limit }, timeout: 90_000 })
  return data
}

export async function getMochaHooks(branch: string): Promise<Partial<Record<HookPhase, string[]>>> {
  const { data } = await apiClient.get<Partial<Record<HookPhase, string[]>>>('/regression/mocha-hooks', { params: { branch } })
  return data
}

export interface Device {
  name: string
  /** STB CPE ID, e.g. 3C36E4-EOSSTB-778900080045. */
  cpeId?: string | null
  type: string
  lab: string | null
  platform: string | null
  lockedForGroup: string | null
  owner: string | null
  status: string | null
  busyWithRun: string | null
  location: string | null
  deviceType: string | null
}

export type Platform = 'STB' | 'OTT'

/** Devices matching ``q`` in their name, or in their CPE ID (``by: 'cpe_id'``) — any part of it. */
export async function searchDevices(q: string, page = 1, pageSize = 20, type: 'stb' | 'ott' = 'stb', by: 'name' | 'cpe_id' = 'name'): Promise<Page<Device>> {
  const { data } = await apiClient.get<Page<Device>>('/regression/targets', {
    params: { type, q: q || undefined, by, page, pageSize },
  })
  return data
}

/** STB box selector types. */
export type SelectorType = 'name' | 'lockedForGroup' | 'lab' | 'platform' | 'cpe_id' | 'owner' | 'labels' | 'target' | 'xapEnabled'
/** OTT device selector types. */
export type DeviceSelectorType = 'name' | 'lockedForGroup' | 'location' | 'platform' | 'deviceType' | 'swVersion' | 'udid' | 'target'

/** Known values per OTT selector column, e.g. location → [BROWSERSTACK, GRID_HERENTALS]. */
export type OttOptions = Partial<Record<'location' | 'deviceType' | 'platform' | 'lockedForGroup' | 'swVersion', string[]>>

export async function getOttOptions(): Promise<OttOptions> {
  const { data } = await apiClient.get<OttOptions>('/regression/ott-options')
  return data
}

export interface AppVersion { version: string; branch: string; sprint: string; variant: string | null; platform?: string; project?: string; label?: string }

/** OTT app versions per provisioning lab (InspectorWeb's App Center list — can be empty). */
export async function getAppVersions(platforms: string[]): Promise<Record<string, AppVersion[]>> {
  const { data } = await apiClient.get<Record<string, AppVersion[]>>('/regression/app-versions', {
    params: { platforms },
    paramsSerializer: { indexes: null },
  })
  return data
}

export interface TargetMatch {
  count: number
  idle: number
  browserstack: number
  labs: string[]
  provisioningLabs: string[]
  devices: { name: string; status: string | null; lab: string | null; location: string | null; lockedForGroup: string | null }[]
}

/** Devices a selector set resolves to (read-only preview, same lookup InspectorWeb's editor uses). */
export async function matchTargets(
  type: 'stb' | 'ott', groups: { type: string; value: string; regex?: boolean }[][],
): Promise<TargetMatch> {
  const { data } = await apiClient.post<TargetMatch>('/regression/targets/match', { type, groups })
  return data
}

export interface Provisioning { branch: string; sprint: string; version: string; variant: string | null }

export interface CreateRunConfigPayload {
  platforms: Platform[]
  name: string
  branch: string
  testCases: string[]
  jql: string[]
  /** STB boxes — only with STB. */
  targets: { type: SelectorType; value: string; regex?: boolean }[][]
  /** OTT devices — only with OTT. */
  devices: { type: DeviceSelectorType; value: string; regex?: boolean }[][]
  /** Per lab key (labci, labe2esi…) — required for STB + OTT. */
  provisioning: Record<string, Provisioning>
  /** Customer lab for OTT-only configs. */
  lab: string | null
  timeOut: number
  labels: string[]
  /** lockedForGroup — required with STB. */
  group: string | null
  mochaHooks: Partial<Record<HookPhase, string[]>>
  runParallel: boolean
  /** Send results to Elastic/ODH — the RCA pipeline reads them there. */
  elastic: boolean
  /** Merge results into existing Xray test executions. */
  jiraResultsMerge: boolean
  /** Xray Test Execution key to report into (Xray JQL runs only). */
  xTestExecution: string | null
  /** Optional run metadata, e.g. currentVersion / previousVersion. */
  metadata: Record<string, string | boolean | number>
}

export type SavedRunConfig = RunConfigSummary & { run: RegressionRun | null }

/** Create a run config; `execute` also starts it (Save & Execute). */
export async function createRunConfig(payload: CreateRunConfigPayload, execute = false): Promise<SavedRunConfig> {
  const { data } = await apiClient.post<SavedRunConfig>('/regression/run-configs', payload, { params: { execute: execute || undefined } })
  return data
}

/** Update one of your run configs; `execute` also starts it. */
export async function updateRunConfig(uuid: string, payload: CreateRunConfigPayload, execute = false): Promise<SavedRunConfig> {
  const { data } = await apiClient.put<SavedRunConfig>(`/regression/run-configs/${uuid}`, payload, { params: { execute: execute || undefined } })
  return data
}

/** Runs started from this app — or, with `runConfigUuid`, every execution of that config (incl. ones started in InspectorWeb). */
/** Your runs (scope 'me'), or everyone's — admins only; or every execution of one run config. */
export async function listRegressionRuns(runConfigUuid?: string, scope: 'me' | 'all' = 'me'): Promise<RegressionRun[]> {
  const { data } = await apiClient.get<RegressionRun[]>('/regression/runs', { params: { runConfigUuid, scope } })
  return data
}

export async function triggerRun(runConfigUuid: string): Promise<RegressionRun> {
  const { data } = await apiClient.post<RegressionRun>('/regression/runs', { runConfigUuid })
  return data
}

export async function getRunStatus(runUuid: string): Promise<RunStatus> {
  const { data } = await apiClient.get<RunStatus>(`/regression/runs/${runUuid}`)
  return data
}

export async function getTargetDetails(runUuid: string, targetUuid: string): Promise<TargetDetails> {
  // Reports are 1–3 MB on a slow lab link — allow up to 2 minutes.
  const { data } = await apiClient.get<TargetDetails>(
    `/regression/runs/${runUuid}/targets/${targetUuid}/details`, { timeout: 120_000 },
  )
  return data
}

/** Last `lines` lines of a device-run log (`kind`: main log or error log). `missing` when no file exists yet. */
export async function getTargetLog(
  runUuid: string, targetUuid: string, kind: 'log' | 'error', lines: number,
): Promise<{ text: string; missing: boolean }> {
  const res = await apiClient.get<string>(`/regression/runs/${runUuid}/targets/${targetUuid}/logs`, {
    params: { kind, lines },
    responseType: 'text',
    transformResponse: (d) => d,
  })
  return { text: res.data ?? '', missing: res.headers['x-log-missing'] === '1' }
}

/** Remove a finished run from this app's lists (the execution stays in InspectorWeb). */
export async function deleteRun(id: number): Promise<void> {
  await apiClient.delete(`/regression/runs/${id}`)
}

export async function stopRun(runUuid: string): Promise<void> {
  await apiClient.post(`/regression/runs/${runUuid}/stop`)
}

/** Pull a readable message out of an API error (upstream InspectorWeb 422 details included). */
export function regressionErrorMessage(err: unknown, fallback: string): string {
  const res = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response
  if (!res) return "Can't reach this app's server — check your network, or that the backend is running."
  const detail = res.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{loc, msg}, …]
    return detail.map((e) => String((e as { msg?: string })?.msg ?? '').replace(/^Value error, /, '')).filter(Boolean).join('; ') || fallback
  }
  if (detail && typeof detail === 'object') {
    const d = detail as { message?: string; upstream?: unknown }
    const upstream = typeof d.upstream === 'string' ? d.upstream : JSON.stringify(d.upstream)
    return [d.message, upstream].filter(Boolean).join(' — ')
  }
  if (res.status === 403) return "You don't have permission for this action."
  return fallback
}

// ── Schedules (run by this app's scheduler) ──────────────────────────────────

export type ScheduleType = 'cron' | 'continuous' | 'once'
export type WeekDay = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
export interface TimeWindow { after: string; before: string }
export type WhenItem =
  | { type: 'days'; value: WeekDay[] }
  | { type: 'between'; value: TimeWindow }
  | { type: 'betweenCertainDays'; value: { between: TimeWindow; days: WeekDay[] } }
  | { type: 'executionsPerDay'; value: { executions: number } }
export type UntilItem =
  | { type: 'timestamp'; value: string }
  | { type: 'executions'; value: number | string }
  | { type: 'status'; value: 'done' | 'aborted' }
export interface Conditions<T> { type: 'or' | 'and'; value: T[] }

export interface Schedule {
  uuid: string
  name: string
  owner: string
  enabled: boolean
  mode: 'parallel' | 'sequential'
  labels: string[]
  runConfigUuids: string[]
  runConfigs: { uuid: string; name: string | null }[]
  type: ScheduleType
  data: string
  when: Conditions<WhenItem> | null
  until: Conditions<UntilItem> | null
  created: string | null
  updated: string | null
  state: { status: string | null; stopReason: string | null; executions: number; currentRunUuid: string | null; currentRunStatus: string | null; queue: number }
  /** Next start times (UTC ISO), last start, last start error. */
  nextRuns: string[]
  lastRunAt: string | null
  lastError: string | null
}

export type SchedulePage = Page<Schedule> & { timezone?: string }

export interface ScheduleBody {
  name: string
  runConfigUuids: string[]
  mode: 'parallel' | 'sequential'
  type: ScheduleType
  cron: string | null
  when: Conditions<WhenItem> | null
  until: Conditions<UntilItem> | null
  labels: string[]
  enabled: boolean
}

export async function listSchedules(q: string, page = 1, pageSize = 15): Promise<SchedulePage> {
  const { data } = await apiClient.get<SchedulePage>('/regression/schedules', { params: { q: q || undefined, page, pageSize } })
  return data
}

export async function createSchedule(body: ScheduleBody): Promise<Schedule> {
  const { data } = await apiClient.post('/regression/schedules', body)
  return data
}

export async function updateSchedule(uuid: string, body: ScheduleBody): Promise<Schedule> {
  const { data } = await apiClient.put(`/regression/schedules/${uuid}`, body)
  return data
}

export async function scheduleAction(uuid: string, action: 'enable' | 'disable' | 'execute'): Promise<void> {
  await apiClient.post(`/regression/schedules/${uuid}/${action}`)
}

export async function deleteSchedule(uuid: string): Promise<void> {
  await apiClient.delete(`/regression/schedules/${uuid}`)
}

// ── Batch analysis (from this app's runs) ────────────────────────────────────

export interface BatchScope {
  runUuids?: string[]
  sinceHours?: number
  startedBy?: 'me' | 'all'
  nameContains?: string
  scheduleUuid?: string
  onlyProblems?: boolean
}

export interface BatchRun {
  runUuid: string
  name: string
  triggeredBy: string
  createdAt: string
  finishedAt: string | null
  phase: RunPhase
  runInfo: RunInfo | null
  scheduleUuid: string | null
  state: 'failed' | 'aborted' | 'passed'
  /** Analysed before (its stored verdicts are reused). */
  analysed: boolean
  verdictCount: number | null
}

export interface BatchPreview {
  runs: BatchRun[]
  truncated: boolean
  totals: { runs: number; failedTests: number; aborted: number; analysed: number; running: number; passedHidden: number }
}

/** This app's runs a batch would cover — read from this app's database only. */
export async function previewBatch(scope: BatchScope): Promise<BatchPreview> {
  const { data } = await apiClient.post<BatchPreview>('/regression/batch/preview', scope)
  return data
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface RegressionDashboard {
  scope: 'me' | 'all'
  summary: {
    runs: number; passed: number; failed: number; aborted: number; running: number
    testsPassed: number; testsFailed: number
    /** Failed tests inside failed runs / inside aborted runs (partial results). */
    failedRunTests: number; abortedRunTests: number
    passRate: number | null
  }
  byDay: { date: string; passed: number; failed: number; aborted: number; running: number }[]
  coverage: { finished: number; analysed: number; waiting: number; topCategories: { category: string; count: number }[] }
  running: { runUuid: string; name: string; triggeredBy: string; createdAt: string; phase: RunPhase; scheduleUuid: string | null }[]
  schedules: {
    total: number
    enabled: number
    running: number
    upcoming: { uuid: string; name: string; at: string }[]
    attention: { uuid: string; name: string; reason: string | null }[]
  }
  timezone: string
}

/** Regression summary for the Dashboard — read from this app's database only. */
export async function getRegressionDashboard(fromDate: string, toDate: string, scope: 'me' | 'all'): Promise<RegressionDashboard> {
  const { data } = await apiClient.get<RegressionDashboard>('/regression/dashboard', { params: { from_date: fromDate, to_date: toDate, scope } })
  return data
}

// ── A run's stored analysis ──────────────────────────────────────────────────

export interface RunStoredAnalysis {
  jobId: string
  status: 'DONE' | 'FAILED'
  verdicts: import('../types').RcaVerdict[]
  summary: Record<string, number>
  runUuid: string
  runName: string | null
  /** auto (analysed when the run finished) | batch | manual (Single Run) */
  source: string
  analysedAt: string | null
  /** Why there are no verdicts (e.g. the run was aborted). */
  reason: string | null
}

/** The run's RCA results as stored in this app — shown on the report page at /runs/:uuid/analysis. */
export async function getRunAnalysis(runUuid: string): Promise<RunStoredAnalysis> {
  const { data } = await apiClient.get<RunStoredAnalysis>(`/regression/runs/${runUuid}/analysis`)
  return data
}
