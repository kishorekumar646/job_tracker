// Author: Kishore Kumar
import type { StoredAnalysis, RcaCategory, Platform, RcaVerdict } from '../types'

const CATEGORIES: RcaCategory[] = [
  'DRM_ERROR', 'PLAYOUT_ERROR', 'ENVIRONMENT', 'BROWSERSTACK_CAPACITY',
  'ORCHESTRATION', 'AUTOMATION_SCRIPT', 'TEST_ASSERTION', 'KNOWN_ISSUE', 'UNKNOWN',
]

const PLATFORMS: Platform[] = ['STB', 'PERSEUS_ANDROID', 'PERSEUS_IOS', 'BROWSERSTACK']

const EXPLANATIONS: Record<RcaCategory, string[]> = {
  DRM_ERROR: [
    'DRM license acquisition failed with error code 4004.',
    'Widevine CDM initialization failed — no valid license received.',
    'HDCP handshake timeout after 5000 ms on HDMI output.',
  ],
  PLAYOUT_ERROR: [
    'ABR playout stalled — manifest fetch returned HTTP 502.',
    'HLS segment download failed after 3 retries; server returned 503.',
    'Audio/video desync detected: delta exceeded 500 ms threshold.',
  ],
  ENVIRONMENT: [
    'Network interface unavailable on test agent host.',
    'Test environment TLS certificate expired — handshake rejected.',
    'DNS resolution failed for streaming endpoint after 3 attempts.',
  ],
  BROWSERSTACK_CAPACITY: [
    'No BrowserStack sessions available — plan limit reached.',
    'Appium session creation failed: device queue capacity exceeded.',
    'BrowserStack device queue timeout after 120 s.',
  ],
  ORCHESTRATION: [
    'Test case timed out waiting for inspector service response.',
    'Job coordinator lost connection to worker node mid-run.',
    'Max retries (5) exceeded for test case orchestration step.',
  ],
  AUTOMATION_SCRIPT: [
    'TypeError: this.player.getState is not a function.',
    'Button "DIC_DETAIL_EPISODE_PICKER_BTN" not found via any strategy.',
    'ReferenceError: channelList is not defined.',
  ],
  TEST_ASSERTION: [
    'Assertion failed: expected channel state PLAYING, got BUFFERING.',
    'Test produced unexpected state transition from IDLE to ERROR.',
    'AssertionError: expected 12 recordings, found 11.',
  ],
  KNOWN_ISSUE: [
    'Matched INSP-1234 — known intermittent DRM renewal failure on STB.',
    'Matched INSP-5678 — Widevine L3 fallback on BrowserStack Chrome.',
    'Matched INSP-9012 — playout stall during ad pod transition.',
  ],
  UNKNOWN: [
    'No matching rule found for this failure pattern.',
    'Failure signature does not match any known category.',
    'Unclassified failure — manual review required.',
  ],
  NETWORK_ERROR: [
    'Network request timed out after 30 s.',
    'Connection refused on port 443 — host unreachable.',
  ],
  HARDWARE_ERROR: [
    'Device reported hardware fault during test run.',
    'STB hardware watchdog triggered — device rebooted.',
  ],
  SOFTWARE_UPDATE_ERROR: [
    'Software update package failed integrity check.',
    'Firmware rollback detected during update sequence.',
  ],
  PROVISIONING_ERROR: [
    'Device provisioning token expired or invalid.',
    'Entitlement service returned 403 during provisioning.',
  ],
  BACKEND_ERROR: [
    'Backend API returned 500 — internal server error.',
    'Upstream service dependency unavailable.',
  ],
  OTT_ERROR: [
    'OTT session establishment failed with error code 1002.',
    'Streaming token rejected by OTT middleware.',
  ],
  ACCOUNT_ERROR: [
    'Account entitlement check failed — subscription inactive.',
    'Authentication token rejected by account service.',
  ],
}

const JIRA: Partial<Record<RcaCategory, string>> = {
  KNOWN_ISSUE: 'INSP-1234',
}

const RULES: Partial<Record<RcaCategory, string>> = {
  DRM_ERROR: 'drm_license_failure',
  PLAYOUT_ERROR: 'playout_stall_rule',
  ENVIRONMENT: 'env_network_failure',
  BROWSERSTACK_CAPACITY: 'bs_capacity_exceeded',
  ORCHESTRATION: 'orchestration_timeout',
  AUTOMATION_SCRIPT: 'js_runtime_error',
  TEST_ASSERTION: 'assertion_failure',
  KNOWN_ISSUE: 'known_issue_matcher',
  UNKNOWN: null as unknown as string,
}

function uuid() {
  return crypto.randomUUID()
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function isoAt(daysAgo: number, hourOffset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hourOffset, Math.floor(Math.random() * 60), 0, 0)
  return d.toISOString()
}

function makeVerdict(platform?: Platform): RcaVerdict {
  const category = pick(CATEGORIES)
  const p = platform ?? pick(PLATFORMS)
  const explanations = EXPLANATIONS[category]
  return {
    testCaseRunId: uuid(),
    platform: p,
    category,
    confidence: Math.round(rand(0.55, 0.99) * 100) / 100,
    explanation: pick(explanations),
    matchedRule: RULES[category] ?? null,
    matchedJiraTicket: JIRA[category] ?? null,
    jiraUrl: null,
    reportUrl: null,
  }
}

function makeJob(daysAgo: number, verdictCount: number, platform?: Platform): StoredAnalysis {
  const verdicts = Array.from({ length: verdictCount }, () => makeVerdict(platform))
  const jobId = uuid()
  return {
    id: uuid(),
    jobId,
    runUuid: uuid(),
    timestamp: isoAt(daysAgo, Math.floor(rand(8, 20))),
    mode: Math.random() > 0.3 ? 'async' : 'sync',
    status: Math.random() > 0.1 ? 'DONE' : 'FAILED',
    verdictCount: verdicts.length,
    verdicts,
  }
}

export function seedDashboard() {
  const jobs: StoredAnalysis[] = [
    // Spread across the last 14 days with varying volumes
    makeJob(0, 12, 'STB'),
    makeJob(0, 8, 'BROWSERSTACK'),
    makeJob(1, 15),
    makeJob(1, 6, 'PERSEUS_ANDROID'),
    makeJob(2, 10),
    makeJob(2, 7, 'PERSEUS_IOS'),
    makeJob(3, 18),
    makeJob(3, 5, 'STB'),
    makeJob(4, 9, 'BROWSERSTACK'),
    makeJob(5, 11),
    makeJob(5, 4, 'PERSEUS_ANDROID'),
    makeJob(6, 13),
    makeJob(7, 7, 'STB'),
    makeJob(8, 10, 'BROWSERSTACK'),
    makeJob(9, 8),
    makeJob(10, 14, 'PERSEUS_IOS'),
    makeJob(11, 6),
    makeJob(12, 9, 'PERSEUS_ANDROID'),
    makeJob(13, 11),
    makeJob(14, 5, 'STB'),
  ]

  localStorage.setItem('rca_history', JSON.stringify(jobs))
  console.log(`[seed] Wrote ${jobs.length} jobs (${jobs.reduce((s, j) => s + j.verdictCount, 0)} verdicts) to rca_history.`)
  return jobs
}

export function clearDashboardSeed() {
  localStorage.removeItem('rca_history')
  console.log('[seed] Cleared rca_history.')
}
