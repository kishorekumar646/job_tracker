// Author: Kishore Kumar
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock,
  ArrowRight,
  Search,
  X,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  FileText,
  Copy,
  Check,
  Zap,
  Timer,
  BarChart3,
  CheckCircle2,
  XCircle,
  Hash,
  RefreshCw,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Loader2,
  Square,
  ArrowUp,
  ArrowDown,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { useTour } from '../tour/TourContext'
import { Badge } from '../components/ui/Badge'
import { ErrorCodeChip } from '../components/ui/ErrorCodeChip'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/spinner'
import { ConfidenceBar } from '../components/charts/ConfidenceBar'
import { StoredAnalysis, JobStatus, RcaVerdict } from '@/types'
import { formatDateTime, formatCreatedAt, toDateStr } from '../utils/date'
import { getHistory, deleteHistoryJob, cancelJob, submitVerdictFeedback, getHistoryVerdicts } from '../api/rca'
import { useAnalyzeStore } from '../store/analyzeStore'
import { stopAnalysis } from '../utils/analyzeSession'
import { CATEGORY_STYLES } from '../components/ui/Badge'
import { Shimmer } from '../components/ui/Shimmer'
import { VerdictsByRun } from '../components/ui/VerdictsByRun'
import { shareReport } from '../api/rca'
import { openInBrowser } from '../utils/openInBrowser'
import { useLivePoll } from '../hooks/useLivePoll'

const isVpnError = (reason: string | null | undefined) =>
  !!reason && /vpn|unreachable|network error/i.test(reason)

function fmtJobDuration(secs: number | null | undefined): string | null {
  if (secs == null || secs <= 0) return null
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function extractFromError(item: Record<string, string>): string {
  return (item.detailedErrorMessage || item.errorMessage || item.message || '').trim()
}
function extractFromReason(item: Record<string, string>): { text: string; stepName: string | null } {
  return {
    text: (item.detailedReason || item.reason || '').trim(),
    stepName: item.testStepName?.trim() || null,
  }
}

function cleanErrorText(raw: string): string {
  return raw.replace(/^[A-Za-z]+Error\s+thrown\s+during\s+(?:\w+\s+)*execution:\s*/i, '').trim()
}

function coreOf(line: string): string {
  return line
    .replace(/^[A-Za-z]*[Ee]rror\s+thrown\s+during\s+(?:\w+\s+)*execution:\s*/i, '')
    .replace(/^[A-Z][a-zA-Z]*Error:\s*/i, '')
    .replace(/\.\s*This indicates\b.*/i, '')
    .trim().toLowerCase().replace(/[.:!\s]+$/, '')
}

function dedupeExplanation(text: string): string {
  const lines = text.split(/\n/)
  const seenCores: string[] = []
  const kept: string[] = []
  for (const line of lines) {
    const norm = line.trim()
    if (!norm) { kept.push(line); continue }
    const core = coreOf(norm)
    if (!core) { kept.push(line); continue }
    const isDupe = seenCores.some(c => c === core || c.includes(core) || core.includes(c))
    if (!isDupe) { kept.push(norm); seenCores.push(core) }
  }
  return kept.join('\n').trim()
}

interface ParsedError { type: string | null; core: string; hint: string | null; stepName: string | null }

function parseError(text: string, stepName: string | null = null): ParsedError {
  const cleaned = cleanErrorText(text)
  const typeMatch = cleaned.match(/^([A-Z][a-zA-Z]*Error):\s*(.+)$/s)
  const type = typeMatch ? typeMatch[1] : null
  const core = typeMatch ? typeMatch[2].trim() : cleaned

  let hint: string | null = null
  const undefProp = core.match(/Cannot read propert(?:y|ies) of (?:undefined|null) \(reading '(.+?)'\)/)
  if (undefProp) {
    hint = `'${undefProp[1]}' is undefined — the parent object was not initialized or returned null. Ensure the data is fully loaded before this step runs.`
  } else if (/Cannot read propert(?:y|ies) of (?:undefined|null)/.test(core)) {
    hint = 'A property was accessed on an undefined or null object — verify the object is initialized before use.'
  } else {
    const notFunc = core.match(/^(.+?) is not a function/)
    if (notFunc) hint = `'${notFunc[1]}' is not a function — it may be undefined, not yet loaded, or the wrong type.`
  }
  if (!hint) {
    const notDef = core.match(/^(.+?) is not defined$/)
    if (notDef) hint = `'${notDef[1]}' is not defined — check imports and variable scope.`
  }
  if (!hint && (/expected\s+.+?\s+to\s+/i.test(core) || type === 'AssertionError')) {
    hint = 'Assertion failed — the actual value did not match the expected value.'
  }
  if (!hint && /timeout/i.test(core)) {
    hint = 'Operation timed out — the service may be slow, unreachable, or under load.'
  }
  return { type, core, hint, stepName }
}

function FailedReasonsList({ errors, reasons }: {
  errors?: Array<Record<string, string>>
  reasons?: Array<Record<string, string>>
}) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  function copyItem(text: string, idx: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    }).catch(() => {})
  }

  const candidates: Array<{ text: string; stepName: string | null }> = []
  for (const e of errors ?? []) { const text = extractFromError(e); if (text) candidates.push({ text, stepName: null }) }
  for (const r of reasons ?? []) { const { text, stepName } = extractFromReason(r); if (text) candidates.push({ text, stepName }) }

  const seen: string[] = []
  const items: ParsedError[] = []
  for (const { text, stepName } of candidates) {
    const norm = coreOf(cleanErrorText(text))
    if (!norm) continue
    const isDupe = seen.some(n => n === norm || n.includes(norm) || norm.includes(n))
    if (!isDupe) { seen.push(norm); items.push(parseError(text, stepName)) }
  }
  if (items.length === 0) return null

  return (
    <div className="mt-2 rounded-lg border border-amber-500/15 bg-amber-500/5 p-2.5">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400/70">
        Root Cause{items.length > 1 ? 's' : ''}
      </p>
      <ul className="space-y-2">
        {items.map(({ type, core, stepName }, i) => (
          <li key={i} className="group">
            <div className="flex items-start gap-1.5">
              <span className="mt-px shrink-0 text-amber-400 text-xs">•</span>
              <div className="min-w-0 flex-1">
                {stepName && (
                  <p className="mb-0.5 text-[10px] font-medium text-gray-500">Step: {stepName}</p>
                )}
                <div className="flex flex-wrap items-baseline gap-1.5">
                  {type && (
                    <span className="shrink-0 rounded px-1 py-px text-[10px] font-bold bg-red-500/15 text-red-400">{type}</span>
                  )}
                  <span className="break-words text-xs text-amber-200/80">{core}</span>
                </div>
              </div>
              <button
                onClick={() => copyItem(type ? `${type}: ${core}` : core, i)}
                title="Copy error"
                className="ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-amber-400/60 hover:text-amber-300"
              >
                {copiedIdx === i ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── constants ────────────────────────────────────────────────────────────────

type FixAccent = 'purple' | 'sky' | 'amber' | 'orange' | 'cyan' | 'emerald' | 'red' | 'gray' | 'indigo' | 'yellow' | 'violet' | 'pink' | 'rose' | 'blue' | 'teal'

interface FixDetail { summary: string; steps: string[]; accent: FixAccent }

// Full Tailwind class strings per accent — must be literal so JIT picks them up
const FIX_ACCENT: Record<FixAccent, { panel: string; label: string; num: string }> = {
  purple:  { panel: 'border-purple-500/20 bg-purple-500/5',   label: 'text-purple-400/70',  num: 'text-purple-400/50' },
  sky:     { panel: 'border-sky-500/20 bg-sky-500/5',         label: 'text-sky-400/70',      num: 'text-sky-400/50' },
  amber:   { panel: 'border-amber-500/20 bg-amber-500/5',     label: 'text-amber-400/70',    num: 'text-amber-400/50' },
  orange:  { panel: 'border-orange-500/20 bg-orange-500/5',   label: 'text-orange-400/70',   num: 'text-orange-400/50' },
  cyan:    { panel: 'border-cyan-500/20 bg-cyan-500/5',       label: 'text-cyan-400/70',     num: 'text-cyan-400/50' },
  emerald: { panel: 'border-emerald-500/20 bg-emerald-500/5', label: 'text-emerald-400/70',  num: 'text-emerald-400/50' },
  red:     { panel: 'border-red-500/20 bg-red-500/5',         label: 'text-red-400/70',      num: 'text-red-400/50' },
  gray:    { panel: 'border-gray-700/40 bg-gray-800/30',      label: 'text-gray-500/70',     num: 'text-gray-500/50' },
  indigo:  { panel: 'border-indigo-500/20 bg-indigo-500/5',   label: 'text-indigo-400/70',   num: 'text-indigo-400/50' },
  yellow:  { panel: 'border-yellow-500/20 bg-yellow-500/5',   label: 'text-yellow-400/70',   num: 'text-yellow-400/50' },
  violet:  { panel: 'border-violet-500/20 bg-violet-500/5',   label: 'text-violet-400/70',   num: 'text-violet-400/50' },
  pink:    { panel: 'border-pink-500/20 bg-pink-500/5',       label: 'text-pink-400/70',     num: 'text-pink-400/50' },
  rose:    { panel: 'border-rose-500/20 bg-rose-500/5',       label: 'text-rose-400/70',     num: 'text-rose-400/50' },
  blue:    { panel: 'border-blue-500/20 bg-blue-500/5',       label: 'text-blue-400/70',     num: 'text-blue-400/50' },
  teal:    { panel: 'border-teal-500/20 bg-teal-500/5',       label: 'text-teal-400/70',     num: 'text-teal-400/50' },
}

const CATEGORY_FIX_DETAIL: Record<string, FixDetail> = {
  // purple — license / cryptography domain
  DRM_ERROR: {
    accent: 'purple',
    summary: 'DRM license negotiation or device entitlement failed.',
    steps: [
      'Check the Widevine/PlayReady license server response — look for error codes 4001 (no license), 4002 (device not authorized), or 8002 (key not found) in the CDM logs.',
      'Verify the DRM token has not expired — tokens are typically valid for only 15–60 minutes from issue; request a fresh token and retry.',
      'Confirm device entitlement by calling the entitlement API directly with the device ID and content asset ID — expect a 200 with active entitlement.',
      'Check the device security level: L3 devices cannot play L1-protected content — verify the license policy permits this device\'s CDM level.',
      'If traffic routes through a proxy, ensure it is not performing HTTPS inspection on DRM handshake traffic — TLS interception silently breaks Widevine.',
    ],
  },
  // sky — media / streaming domain
  PLAYOUT_ERROR: {
    accent: 'sky',
    summary: 'Playback pipeline failed to start or sustain the stream.',
    steps: [
      'Fetch the manifest URL directly: `curl -I <manifest_url>` — confirm 200 with Content-Type application/vnd.apple.mpegurl or application/dash+xml.',
      'Check CDN edge health for this stream\'s origin region — a 403/404 on media segments typically means stale or missing content on the CDN edge cache.',
      'Look up the player\'s numeric error code in the logs (e.g. 224003 = HLS source load failure, 3016 = segment decode error) for the specific pipeline stage that failed.',
      'Confirm the requested stream profile (codec, resolution, HDR) is supported by this device — requesting HEVC on an H.264-only device causes an immediate decode failure.',
      'If the failure is intermittent, check whether CDN bandwidth throttling or origin pull-rate limits are being hit under load.',
    ],
  },
  // amber — configuration / environment domain
  ENVIRONMENT: {
    accent: 'amber',
    summary: 'Test environment is misconfigured or a required service dependency is unhealthy.',
    steps: [
      'Identify the failing dependency — hit each service\'s `/health` endpoint and look for the first non-200 in the test log timeline; the downstream failures follow from it.',
      'Compare the failing environment\'s config (env vars, service URLs, feature flags) against the last known-good configuration — diff the two and look for overrides.',
      'Check the deployment log or CI dashboard for any release in the past hour — a service version change or config push is the most common cause.',
      'Verify DNS from the runner host: `nslookup <service-hostname>` — stale DNS records after a migration can silently route requests to a decommissioned IP.',
      'Review CPU/memory utilization on the runner — sustained saturation causes socket timeouts that present as upstream service failures.',
    ],
  },
  // orange — external capacity / infrastructure
  BROWSERSTACK_CAPACITY: {
    accent: 'orange',
    summary: 'No BrowserStack sessions are available — the account\'s concurrency cap is reached.',
    steps: [
      'Open the BrowserStack Automate dashboard → Sessions tab: compare "Queued" and "Running" counts against the plan\'s parallel session limit.',
      'Terminate any idle or stuck sessions manually — orphaned sessions hold capacity for up to 90 seconds before auto-expiry.',
      'Lower the `--workers` / `maxInstances` setting in the test runner so the active session count stays below the plan cap.',
      'Stagger CI pipeline triggers (add a small random delay) if multiple pipelines start simultaneously and collide on the same session pool.',
      'If capacity exhaustion recurs frequently, raise a request to increase the BrowserStack plan or migrate long-running test suites to a lower-priority queue.',
    ],
  },
  // cyan — service mesh / job coordination
  ORCHESTRATION: {
    accent: 'cyan',
    summary: 'The job orchestrator failed to dispatch, route, or complete this analysis.',
    steps: [
      'Check InspectorWeb job manager logs around the submission timestamp — look for "failed to enqueue", "consumer timeout", or "callback unreachable" messages.',
      'Verify the message broker (RabbitMQ/Kafka) health — check queue depth and consumer lag for the analysis job topic; a saturated queue blocks job pickup.',
      'Confirm the callback/webhook URL registered for this job is reachable from the orchestrator\'s network — a firewall change can silently drop result events.',
      'Look for duplicate job submissions with the same run UUID — the orchestrator may have rejected this job as a duplicate while the first attempt was still running.',
      'Retry the job — transient orchestration failures (broker restarts, pod evictions) usually clear within seconds; if it fails again, escalate with the job ID.',
    ],
  },
  // emerald — documented / tracked issue
  KNOWN_ISSUE: {
    accent: 'emerald',
    summary: 'This failure matches a tracked Jira issue — a workaround may already be documented.',
    steps: [
      'Open the linked Jira ticket above and read the latest comments — workarounds are often added in comments rather than updated in the description.',
      'Check the "Fix Version" field: if a version is set, verify whether that release is deployed in the failing environment yet.',
      'Apply the documented workaround (test skip annotation, config toggle, or alternative flow) to unblock CI until the fix ships.',
      'Add a Jira "watch" on the ticket so you receive a notification when status changes to "Done" or a fix version is tagged.',
      'After the fix version is deployed, remove the workaround, re-run the test, and close the loop by commenting on the ticket.',
    ],
  },
  // pink — bug in the automation script itself
  AUTOMATION_SCRIPT: {
    accent: 'pink',
    summary: 'The automation script failed on its own code: a JS runtime error or a UI locator that no longer matches the app.',
    steps: [
      'For TypeError / ReferenceError, open the stack trace and go to the first frame inside the test repo; fix the missing function, undefined variable, or bad import there.',
      'For "not found via any strategy", compare the element ID in the error with the current app build; update the locator or the strategy list if the UI changed.',
      'Run `git log --oneline` on the failing test and helper files: a recent refactor is the usual cause.',
      'Run the test in isolation (`--grep` / single-test mode) to rule out shared state from earlier tests.',
      'This is not a product defect: fix it in the automation repo rather than filing an app bug.',
    ],
  },
  // teal — assertion mismatch (app regression or stale expectation)
  TEST_ASSERTION: {
    accent: 'teal',
    summary: 'A test assertion failed: the app did not reach the expected state, or the expected value / test data is out of date.',
    steps: [
      'Read the expected vs. actual values in the assertion message; confirm the expected value is still correct for current app behavior.',
      'Check the step screenshot and InspectorWeb report to see the real app state at that moment.',
      'If the app is wrong, file a product bug with the actual vs. expected diff, reproduction steps, and the job ID.',
      'If the expectation or test data is stale, update the test data / expected value in the automation repo.',
      'Re-run the test in isolation to rule out timing or shared state before deciding which it is.',
    ],
  },
  // gray — unknown / unclassified
  UNKNOWN: {
    accent: 'gray',
    summary: 'No matching rule found — manual investigation is required.',
    steps: [
      'Grep the raw logs for the first ERROR or FATAL line before the failure timestamp — the real root cause is often an earlier silent error that cascades.',
      'Examine the last screenshot if one is captured below — visible UI artifacts reveal whether the failure is a rendering issue, an unresolved loader, or an error page.',
      'Re-run the test immediately to check for flakiness — if it passes on retry, add a retry annotation and monitor the failure frequency over the next few runs.',
      'Diff the failure\'s raw JSON payload against the most recent passing run for the same test — unexpected field changes point to backend schema drift.',
      'Escalate to the test owner with this job ID and the first ERROR line; unclassified failures are reviewed weekly to add new rules to the detection engine.',
    ],
  },
  // indigo — network / connectivity
  NETWORK_ERROR: {
    accent: 'indigo',
    summary: 'Network connectivity, DNS resolution, or a firewall rule is blocking the test runner.',
    steps: [
      'Run `curl -sv <failing-url>` from the runner host — the verbose output shows exactly where the connection breaks: DNS, TCP connect, TLS handshake, or HTTP response.',
      'Confirm VPN is active and tunneled to the correct profile — some environments require the engineering VPN, others use a dedicated test-lab tunnel.',
      'Run `dig <service-hostname>` to verify DNS resolution returns an IP in the expected subnet, not a stale or deleted record from a previous migration.',
      'Check whether a recently changed firewall or security group rule revoked the runner\'s outbound access to the failing port (typically 443 or a custom service port).',
      'If only one service is unreachable, confirm it did not recently move to a new IP or load balancer — update host overrides or service discovery config accordingly.',
    ],
  },
  // yellow — physical device / hardware
  HARDWARE_ERROR: {
    accent: 'yellow',
    summary: 'The physical test device is unresponsive or in a bad hardware state.',
    steps: [
      'Run `adb devices` from the runner — if the device shows "unauthorized", revoke the ADB key on the device (Developer Options → Revoke USB debugging authorizations), reconnect, and re-accept the prompt.',
      'Power-cycle the device completely: hold the power button for 10 s, wait 30 s after shutdown, then reconnect USB and confirm the device reappears before retrying.',
      'Check available storage: `adb shell df /data` — less than 500 MB free prevents test artifact writes, app installs, and log captures, causing silent step failures.',
      'Review `adb logcat -b crash -d` for OS or app-layer crash logs — a crashing system service causes test steps to hang or fail without a clear error message.',
      'If the device remains unresponsive after a power-cycle, flag it in the device lab management tool and request a fresh session on a healthy device.',
    ],
  },
  // violet — OTA / firmware
  SOFTWARE_UPDATE_ERROR: {
    accent: 'violet',
    summary: 'The device failed to download, verify, or apply the software update.',
    steps: [
      'From the device\'s network, `curl -I <update-package-url>` — confirm 200 with the correct Content-Length; a redirect loop or auth challenge here explains the failure.',
      'Check free disk space before updating: `adb shell df /data` — firmware updates typically need 2–4× the package size as temporary working space during extraction.',
      'Verify the update package is signed for this exact device SKU and region — a mismatched signing key causes a silent install rejection with no user-visible error message.',
      'Pull update server access logs filtered by the device serial or MAC address to see the exact HTTP status code returned and whether the package was ever fully downloaded.',
      'If the update left the device in a partially applied state (boot loops, missing partitions), re-flash to a known-good baseline — partial updates can corrupt the boot partition.',
    ],
  },
  // pink — device management / registration
  PROVISIONING_ERROR: {
    accent: 'pink',
    summary: 'The device could not complete provisioning or its registration record is invalid.',
    steps: [
      'Query the device management portal by device serial — review provisioning status, last-seen timestamp, and any error flags on the record.',
      'Call the provisioning service health endpoint: a 5xx response means the backend itself is down, not a device-specific issue.',
      'Check device identity certificate expiry — provisioning certs typically have a 1–2 year TTL and fail silently once expired.',
      'Search for duplicate device records sharing the same serial number — duplicate entries cause registration conflicts that the provisioning backend rejects outright.',
      'Re-run the provisioning enroll flow: `inspector-provision --device <serial> --env <env>` and watch the output for specific error codes to guide next steps.',
    ],
  },
  // rose — backend API / service
  BACKEND_ERROR: {
    accent: 'rose',
    summary: 'A backend API or service returned an error or failed to respond.',
    steps: [
      'Extract the request ID or X-Correlation-ID from the error log, then search the backend service logs with it to find the server-side cause — never rely on the client-visible error alone.',
      'Check the service health endpoint and Grafana error rate dashboard for the past 30 minutes — a spike in 5xx rate points to a service-wide issue rather than a test-specific one.',
      'Decode the auth token used in the failing request at jwt.io — check `exp` (expiry), `scope`, and `aud` claims; expired or insufficient-scope tokens cause 401/403 responses.',
      'Look for DB query timeout or connection pool exhaustion messages in the service logs around the failure timestamp — these produce HTTP 500s that look random.',
      'If the response included a `Retry-After` header, the API is rate-limiting this client — implement exponential backoff retry logic and respect the header value.',
    ],
  },
  // blue — OTT platform
  OTT_ERROR: {
    accent: 'blue',
    summary: 'The OTT platform service is unavailable or returned an unexpected response.',
    steps: [
      'Check the OTT provider\'s public status page for active incidents — many OTT platform outages are announced there before they affect all API consumers.',
      'Validate API credentials by generating a fresh token and calling a lightweight endpoint (e.g. `/v1/ping` or `/v1/status`) — confirm auth is working before debugging deeper.',
      'Replay the failing API call using Postman or `curl` with the same request headers and body from the test log — confirm whether the error reproduces outside the test runner.',
      'Review the OTT platform\'s developer changelog for API version deprecations or endpoint removals — providers sometimes sunset old versions with short notice.',
      'If the platform is healthy and credentials are valid, open a support ticket with the OTT provider including the full request/response payload, timestamp, and error code.',
    ],
  },
  // teal — account / subscription / entitlement
  ACCOUNT_ERROR: {
    accent: 'teal',
    summary: 'The test account lacks access, has invalid credentials, or entitlements are missing.',
    steps: [
      'Attempt a direct login via the account API with the test credentials — distinguish between an auth failure (401 wrong password) and an entitlement failure (403 insufficient access).',
      'Call the entitlement API with the account ID and content asset ID — verify the account is entitled, the subscription tier covers the content, and the entitlement has not expired.',
      'Check the account management portal for lock flags — automated test runs can trigger brute-force protection after repeated rapid login attempts, locking the account.',
      'Verify the account has not hit its concurrent stream limit — most streaming entitlements cap at 2–3 simultaneous streams per account.',
      'If the account was modified or deleted by a nightly cleanup job, recreate it using the test account provisioning script and update the shared credentials store.',
    ],
  },
}

function getDetailedFix(
  explanation: string,
  category: string,
  errors?: Array<Record<string, string>>,
  reasons?: Array<Record<string, string>>,
): FixDetail {
  const errorTexts: string[] = []
  for (const e of errors ?? []) { const t = extractFromError(e); if (t) errorTexts.push(t) }
  for (const r of reasons ?? []) { const { text } = extractFromReason(r); if (text) errorTexts.push(text) }

  const sources = errorTexts.length > 0
    ? errorTexts
    : dedupeExplanation(explanation).split('\n').map(l => l.trim()).filter(Boolean)

  for (const line of sources) {
    const cleaned = cleanErrorText(line)
    const typeMatch = cleaned.match(/^([A-Z][a-zA-Z]*Error):\s*(.+)$/s)
    const core = typeMatch ? typeMatch[2].trim() : cleaned

    const undefProp = core.match(/Cannot read propert(?:y|ies) of (?:undefined|null) \(reading '(.+?)'\)/)
    if (undefProp) return {
      accent: 'red',
      summary: `'${undefProp[1]}' is undefined — the parent object was not initialized when this step ran.`,
      steps: [
        `Add a null guard before the access: check \`if (obj?.${undefProp[1]})\` or use optional chaining \`obj?.${undefProp[1]}\` to prevent the crash.`,
        'Ensure the preceding async call (API fetch, page load, element query) has fully resolved before this step executes — add an explicit await or wait condition.',
        'Look for a failed step earlier in the sequence that left the object uninitialized; the root cause is often an upstream failure, not this line.',
        `Add \`console.log(obj)\` immediately before the access to inspect the actual object state and confirm which field is null at runtime.`,
        'If this is a timing issue, add a Retry or WaitUntil wrapper around the step so it re-attempts until the object is populated.',
      ],
    }

    if (/Cannot read propert(?:y|ies) of (?:undefined|null)/.test(core)) return {
      accent: 'red',
      summary: 'A property was accessed on an undefined or null object.',
      steps: [
        'Read the full stack trace to identify exactly which variable is null — the frame immediately below the TypeError shows the object and property name.',
        'Add optional chaining (`?.`) or an explicit `if (obj !== null && obj !== undefined)` guard before the property access.',
        'Verify that all preceding async operations completed successfully — a rejected promise or a missing `await` can leave the variable unset.',
        'Check whether a preceding test step failure put the application in an unexpected state that caused this object to not be populated.',
        'Add a defensive assertion (e.g. `expect(obj).toBeDefined()`) immediately before the access to surface null state earlier and with a clearer error.',
      ],
    }

    const notFunc = core.match(/^(.+?) is not a function/)
    if (notFunc) return {
      accent: 'red',
      summary: `'${notFunc[1]}' is not callable — it is undefined, null, or the wrong type at this point.`,
      steps: [
        `Check the import statement: verify \`${notFunc[1]}\` is exported from its module and imported correctly in this file.`,
        'Look for a preceding import or module load error in the logs — if the module failed to load, all its exports are undefined.',
        `Add a type guard before calling: \`if (typeof ${notFunc[1]} === 'function') { ... }\` to confirm it is callable.`,
        'Confirm the call is on the correct object — the method may exist on a different instance or may need to be bound.',
        'If this is a page object method, verify the page object constructor ran without errors and the method was not accidentally overwritten.',
      ],
    }

    const notDef = core.match(/^(.+?) is not defined$/)
    if (notDef) return {
      accent: 'rose',
      summary: `'${notDef[1]}' is not defined — it is missing from scope at the point of use.`,
      steps: [
        `Add the missing import: \`import { ${notDef[1]} } from '...'\` or \`const ${notDef[1]} = require('...')\`.`,
        `Check variable scoping — \`${notDef[1]}\` may be defined inside a block (if/try/function) and not accessible in the current outer scope.`,
        'Verify spelling exactly — JavaScript identifiers are case-sensitive; a capital letter difference creates a new, undefined variable.',
        'If this is intended to be a global, ensure the setup file that declares it is listed as a setup/require file in the test runner config.',
        'Run ESLint with the `no-undef` rule or TypeScript in strict mode to catch undeclared references before runtime.',
      ],
    }

    if (/expected\s+.+?\s+to\s+/i.test(core) || /AssertionError/i.test(core)) return {
      accent: 'amber',
      summary: 'Assertion failed — the actual value did not match what the test expected.',
      steps: [
        'Read the assertion output for exact actual vs. expected values — confirm the expected value is still correct for the current application behavior before changing it.',
        'Check whether recent application code changed the value being asserted — if intentional, update the expected value and document why.',
        'Verify the test data (fixtures, DB seed, mock responses) is in the expected state before the test runs — stale seed data causes false assertion failures.',
        'If asserting UI text, check for localization substitutions, dynamic date/time values, or whitespace differences that cause exact-string comparisons to fail.',
        'Add more fine-grained assertions earlier in the flow to pinpoint exactly where the state diverges from expectations.',
      ],
    }

    if (/timeout/i.test(core)) return {
      accent: 'orange',
      summary: 'Operation timed out — the target service or element did not respond within the allowed time.',
      steps: [
        'Check the target service health and Grafana latency dashboards at the time of the failure — elevated p99 latency is the most common cause of timeout failures.',
        'Increase the timeout threshold in the test configuration if the operation is genuinely expected to take longer (e.g. a slow CDN fetch or a heavy DB query).',
        'Measure network round-trip time from the runner to the target service — a high-latency path eats into timeout budgets without the service being slow itself.',
        'Check if the service was under peak load or experiencing a partial incident at the time — correlate with Grafana or the on-call timeline.',
        'Add a retry wrapper with exponential backoff around the timed-out operation so transient slowness does not cause an outright failure.',
      ],
    }

    if (/Mismatch/i.test(core)) return {
      accent: 'amber',
      summary: 'A data mismatch was detected — actual and expected values diverged.',
      steps: [
        'Identify the specific field that mismatched by reading the full error message — narrow down whether it is a type mismatch, value mismatch, or format mismatch.',
        'Check whether a recent backend change altered the response schema or value format — compare the current API response shape against the test\'s expected shape.',
        'Verify the test fixture or mock data reflects the current production data format — fixtures drift over time and silently cause mismatches.',
        'If the mismatch is in a numeric or date field, check for timezone differences, rounding behavior, or unit changes (milliseconds vs. seconds) between producer and consumer.',
        'Update the expected value in the test if the application behavior intentionally changed, and confirm the change is correct by reviewing the corresponding PR or story.',
      ],
    }
  }

  return CATEGORY_FIX_DETAIL[category] ?? {
    accent: 'gray',
    summary: 'Review the test logs and error details for further investigation.',
    steps: [
      'Open the full test logs and find the first ERROR or FATAL line — later failures are usually cascades from this initial error.',
      'Check the test execution timeline for unexpected delays or gaps between steps that may indicate a hanging operation.',
      'Re-run the test to determine whether the failure is reproducible or intermittent — flaky failures need different treatment than consistent ones.',
      'Compare the raw failure payload against a recent passing run for the same test — field-level differences point to backend or data changes.',
      'Escalate to the test owner with this job ID and the first error line; unclassified failures are reviewed weekly to extend the detection rule engine.',
    ],
  }
}

function VerdictFix({
  explanation,
  category,
  errors,
  reasons,
  componentLogs,
  flatLogs,
}: {
  explanation: string
  category: string
  errors?: Array<Record<string, string>>
  reasons?: Array<Record<string, string>>
  componentLogs?: string | null
  flatLogs?: string | null
}) {
  const fix = getDetailedFix(explanation, category, errors, reasons)
  const ac = FIX_ACCENT[fix.accent]
  const hasLogs = !!(componentLogs || flatLogs)
  return (
    <div className={`mt-2 rounded-lg border p-2.5 ${ac.panel}`}>
      <p className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wider ${ac.label}`}>
        Fix Guidance
      </p>
      <p className="text-xs leading-relaxed text-gray-300/90">{fix.summary}</p>
      {fix.steps.length > 0 && (
        <ol className="mt-1.5 space-y-1.5">
          {fix.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className={`mt-px shrink-0 text-[10px] font-bold tabular-nums ${ac.num}`}>
                {i + 1}.
              </span>
              <span className="text-[11px] leading-relaxed text-gray-400">{step}</span>
            </li>
          ))}
        </ol>
      )}
      {hasLogs && (
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/5 pt-2">
          <span className="text-[10px] text-gray-600">Check logs:</span>
          {componentLogs && (
            <button
              onClick={() => openInBrowser(componentLogs)}
              title={componentLogs}
              className="flex items-center gap-1 rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-400 transition-colors hover:bg-violet-500/20 hover:text-violet-300"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Component Logs
            </button>
          )}
          {flatLogs && (
            <button
              onClick={() => openInBrowser(flatLogs)}
              title={flatLogs}
              className="flex items-center gap-1 rounded border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20 hover:text-cyan-300"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Flat Logs
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const PAGE_SIZE = 10
const STATUS_OPTIONS: Array<JobStatus | 'ALL'> = ['ALL', 'RUNNING', 'DONE', 'FAILED', 'STOPPED']
const MODE_OPTIONS = ['ALL', 'sync', 'async'] as const

const PRESETS = [
  { label: 'Today',         days: 0  },
  { label: 'Past 2 days',   days: 1  },
  { label: 'Past 7 days',   days: 6  },
  { label: 'Past 30 days',  days: 29 },
  { label: 'Past 3 months', days: 89 },
] as const

const INPUT_CLS =
  'rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-100 ' +
  'placeholder-gray-600 [color-scheme:dark] ' +
  'focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors'

// ─── helpers ──────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: JobStatus }) {
  if (status === 'DONE')    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
  if (status === 'FAILED')  return <XCircle      className="h-3.5 w-3.5 text-red-400" />
  if (status === 'STOPPED') return <Square       className="h-3.5 w-3.5 fill-current text-orange-400" />
  if (status === 'RUNNING') return <Loader2      className="h-3.5 w-3.5 text-blue-400 animate-spin" />
  return <Clock className="h-3.5 w-3.5 text-gray-500" />
}

// ─── component ────────────────────────────────────────────────────────────────

export function JobHistoryPage() {
  const navigate = useNavigate()
  const { startTourIfNew } = useTour()

  // Computed fresh on each mount so date comparisons don't go stale after midnight
  const today        = useMemo(() => toDateStr(new Date()), [])
  const sevenDaysAgo = useMemo(() => toDateStr(new Date(Date.now() - 6 * 86_400_000)), [])

  // Live analysis from the global store — shown as a pinned RUNNING row
  const { loading: analysisRunning, runUuid: activeRunUuid, jobId: activeJobId, syncJobId: activeSyncJobId, startedAt } = useAnalyzeStore()

  const [allHistory, setAllHistory] = useState<StoredAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [actionError, setActionError] = useState('')

  // per-row busy state (uid → 'rerun' | 'delete')
  const [busy, setBusy] = useState<Record<string, 'rerun' | 'delete'>>({})

  // per-row report-share busy state
  const [reportBusy, setReportBusy] = useState<Record<string, boolean>>({})

  // ── Bulk select ───────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [verdictCache, setVerdictCache] = useState<Record<string, RcaVerdict[] | 'loading' | 'error'>>({})

  useEffect(() => {
    if (!expandedId) return
    if (verdictCache[expandedId] !== undefined) return
    setVerdictCache((c) => ({ ...c, [expandedId]: 'loading' }))
    getHistoryVerdicts(expandedId)
      .then((v) => setVerdictCache((c) => ({ ...c, [expandedId]: v })))
      .catch(() => setVerdictCache((c) => ({ ...c, [expandedId]: 'error' })))
  }, [expandedId])

  // copy-to-clipboard feedback key: `${entry.id}-id` | `${entry.id}-name`
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  function handleCopy(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    }).catch(() => {})
  }

  // delete confirm
  const [confirmDelete, setConfirmDelete] = useState<StoredAnalysis | null>(null)
  // stop confirm (live RUNNING row)
  const [confirmStop, setConfirmStop] = useState(false)

  // toast
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)

  function showToast(msg: string) {
    setToastMsg(msg)
    setToastVisible(true)
    setTimeout(() => {
      setToastVisible(false)
      setTimeout(() => setToastMsg(''), 350)
    }, 4000)
  }

  // filters
  const [uuidInput, setUuidInput]   = useState('')   // raw typed value
  const [uuidSearch, setUuidSearch] = useState('')   // debounced — drives filtering
  const [startDate, setStartDate] = useState(sevenDaysAgo)
  const [endDate, setEndDate] = useState(today)
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'ALL'>('ALL')
  const [modeFilter, setModeFilter] = useState<'ALL' | 'sync' | 'async'>('ALL')

  // pagination
  const [page, setPage] = useState(1)

  // sort
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  function toggleSort() {
    setSortDir((prev) => prev === 'asc' ? 'desc' : 'asc')
    setPage(1)
  }

  // UUID search shimmer: true the instant user types — same render, no extra state
  const isSearching = uuidInput !== uuidSearch

  // Other filters shimmer
  const [isFiltering, setIsFiltering] = useState(false)
  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filterFirstRender = useRef(true)

  useEffect(() => {
    if (import.meta.env.DEV) {
      const delay = Math.random() * 2000 + 3000
      const t = setTimeout(() => {
        setPageLoading(false)
        startTourIfNew('history')
      }, delay)
      return () => clearTimeout(t)
    } else {
      setPageLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    setIsFiltering(true)
    try {
      const data = await getHistory(1, 100, startDate, endDate)
      setAllHistory(data)
    } catch {
      // silently ignore — history is best-effort
    } finally {
      setLoading(false)
      setIsFiltering(false)
    }
  }, [startDate, endDate])

  // Initial load + re-fetch whenever the date range changes
  useEffect(() => { loadHistory() }, [loadHistory])

  useEffect(() => { setPage(1) }, [uuidSearch, startDate, endDate, statusFilter, modeFilter, sortDir])

  // Auto-refresh every 15 s while any DB job is still RUNNING or PENDING
  const hasLive = allHistory.some((e) => e.status === 'RUNNING' || e.status === 'PENDING')
  useLivePoll(loadHistory, 15_000, hasLive)
  // Otherwise check quietly every 30 s, so jobs started elsewhere (another tab, a teammate,
  // a scheduled run's auto-analysis) appear without a reload
  useLivePoll(async () => {
    try { setAllHistory(await getHistory(1, 100, startDate, endDate)) } catch { /* keep what's shown */ }
  }, 30_000, !hasLive)

  // Debounce UUID search: commit to uuidSearch after 500 ms of no typing
  useEffect(() => {
    const t = setTimeout(() => setUuidSearch(uuidInput), 500)
    return () => clearTimeout(t)
  }, [uuidInput])

  // Shimmer for status / mode filter changes only (date changes handled by loadHistory)
  useEffect(() => {
    if (filterFirstRender.current) { filterFirstRender.current = false; return }
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current)
    setIsFiltering(true)
    filterTimerRef.current = setTimeout(() => setIsFiltering(false), 500)
    return () => { if (filterTimerRef.current) clearTimeout(filterTimerRef.current) }
  }, [statusFilter, modeFilter])

  // ── Rerun ────────────────────────────────────────────────────────────────────
  function handleRerun(entry: StoredAnalysis) {
    navigate('/analyze', {
      state: { runUuid: entry.runUuid ?? '' },
    })
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleDelete(entry: StoredAnalysis) {
    setConfirmDelete(null)
    setActionError('')
    setBusy((b) => ({ ...b, [entry.id]: 'delete' }))
    try {
      const matchesActive =
        (analysisRunning && entry.runUuid && entry.runUuid === activeRunUuid) ||
        (analysisRunning && entry.jobId  && entry.jobId  === activeJobId)

      // An async job that is still PENDING/RUNNING in the DB — even if this
      // browser session has no active SSE stream (e.g. after a page refresh).
      const isRunningAsyncJob =
        entry.mode === 'async' && (entry.status === 'PENDING' || entry.status === 'RUNNING')

      if (matchesActive) {
        // Live SSE session in this tab — cancel via the session manager so the
        // terminal log and store are updated, then reload history.
        await stopAnalysis()
        await loadHistory()
        showToast('Job stopped by user.')
      } else if (isRunningAsyncJob) {
        // Job is running in the backend but this tab has no live session
        // (navigation or page refresh). Cancel via API so the DB record is
        // marked FAILED with a reason, then reload to show it.
        try { await cancelJob(entry.jobId!) } catch { /* may have just finished */ }
        await loadHistory()
        showToast('Job stopped by user.')
      } else {
        await deleteHistoryJob(entry.id)
        setAllHistory((prev) => prev.filter((e) => e.id !== entry.id))
        showToast('Analysis record deleted successfully.')
      }
    } catch {
      setActionError('Operation failed. Please try again.')
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[entry.id]; return n })
    }
  }

  // ── Filtering ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return allHistory.filter((entry) => {
      // While a live session is active, its DB record is already shown by the
      // pinned RUNNING row — hide it from the list to avoid duplicates.
      if (analysisRunning && entry.jobId && (
        (activeSyncJobId && entry.jobId === activeSyncJobId) ||
        (activeJobId && entry.jobId === activeJobId)
      )) return false
      if (statusFilter !== 'ALL' && entry.status !== statusFilter) return false
      if (modeFilter !== 'ALL' && entry.mode !== modeFilter) return false
      if (uuidSearch.trim()) {
        const q = uuidSearch.trim().toLowerCase()
        const id = (entry.jobId ?? entry.runUuid ?? entry.id).toLowerCase()
        if (!id.includes(q)) return false
      }
      return true
    }).sort((a, b) => {
      const cmp = a.timestamp.localeCompare(b.timestamp)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [allHistory, uuidSearch, startDate, endDate, statusFilter, modeFilter, analysisRunning, activeSyncJobId, activeJobId, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Show the pinned RUNNING row only when the active filter includes it
  const showRunningRow = analysisRunning && (statusFilter === 'ALL' || statusFilter === 'RUNNING')

  function applyPreset(days: number) {
    const end = toDateStr(new Date())
    const start = toDateStr(new Date(Date.now() - days * 86_400_000))
    setStartDate(start)
    setEndDate(end)
  }

  const activePreset = (() => {
    if (endDate !== today) return null
    const diff = Math.round((new Date(today).getTime() - new Date(startDate).getTime()) / 86_400_000)
    return PRESETS.find((p) => p.days === diff) ?? null
  })()

  const hasFilters =
    uuidInput.trim() !== '' ||
    statusFilter !== 'ALL' ||
    modeFilter !== 'ALL' ||
    startDate !== sevenDaysAgo ||
    endDate !== today

  function clearFilters() {
    setUuidInput('')
    setUuidSearch('')
    setStartDate(sevenDaysAgo)
    setEndDate(today)
    setStatusFilter('ALL')
    setModeFilter('ALL')
  }

  // Selectable = not RUNNING/PENDING and not the live session row
  const selectableIds = useMemo(
    () => new Set(filtered.filter((e) =>
      e.status !== 'RUNNING' && e.status !== 'PENDING' &&
      !(analysisRunning && (e.runUuid === activeRunUuid || e.jobId === activeJobId))
    ).map((e) => e.id)),
    [filtered, analysisRunning, activeRunUuid, activeJobId]
  )

  const pagedSelectableIds = useMemo(
    () => paged.filter((e) => selectableIds.has(e.id)).map((e) => e.id),
    [paged, selectableIds]
  )

  const allPageSelected = pagedSelectableIds.length > 0 && pagedSelectableIds.every((id) => selectedIds.has(id))
  const somePageSelected = pagedSelectableIds.some((id) => selectedIds.has(id))

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        pagedSelectableIds.forEach((id) => next.delete(id))
      } else {
        pagedSelectableIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  // Clear selection when page/filters change to avoid stale cross-page selections
  useEffect(() => { setSelectedIds(new Set()) }, [page, uuidSearch, startDate, endDate, statusFilter, modeFilter])

  async function handleBulkDelete() {
    setConfirmBulkDelete(false)
    setBulkDeleting(true)
    const ids = [...selectedIds]
    setSelectedIds(new Set())
    const results = await Promise.allSettled(
      ids.map((id) => deleteHistoryJob(id))
    )
    const failed = results.filter((r) => r.status === 'rejected').length
    setAllHistory((prev) => prev.filter((e) => !ids.includes(e.id) || failed > 0))
    // Re-fetch to get accurate state (handles partial failures)
    await loadHistory()
    setBulkDeleting(false)
    if (failed > 0) {
      setActionError(`${failed} of ${ids.length} deletions failed. Please try again.`)
    } else {
      showToast(`${ids.length} record${ids.length > 1 ? 's' : ''} deleted successfully.`)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    setIsRefreshing(true)
    try {
      const [data] = await Promise.all([
        getHistory(1, 100, startDate, endDate),
        new Promise<void>((r) => setTimeout(r, 500)),
      ])
      setAllHistory(data)
    } catch {
      // silently ignore
    } finally {
      setRefreshing(false)
      setIsRefreshing(false)
    }
  }

  const totalDone   = allHistory.filter((e) => e.status === 'DONE').length
  const totalFailed = allHistory.filter((e) => e.status === 'FAILED').length

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout title="Job History">
      {pageLoading || loading ? (
        <SkeletonView />
      ) : (
        <div className="space-y-5">

          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-tour="tour-stats">
            {isRefreshing ? (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
                    <Shimmer className="h-9 w-9 shrink-0 rounded-lg" />
                    <div className="space-y-1.5">
                      <Shimmer className="h-5 w-10 rounded" />
                      <Shimmer className="h-3 w-20 rounded" />
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <>
                <StatTile label="Total Analyses" value={allHistory.length} icon={<BarChart3 className="h-4 w-4" />} color="indigo" />
                <StatTile label="Completed"      value={totalDone}         icon={<CheckCircle2 className="h-4 w-4" />} color="emerald" />
                <StatTile label="Failed"         value={totalFailed}       icon={<XCircle className="h-4 w-4" />}      color="red" />
                <StatTile label="Showing"        value={filtered.length}   icon={<Clock className="h-4 w-4" />}        color="amber" />
              </>
            )}
          </div>

          {/* Error banner */}
          {actionError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {actionError}
              <button onClick={() => setActionError('')} className="ml-auto text-red-400/60 hover:text-red-400">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Filter bar */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3" data-tour="tour-filters">

            {/* Preset chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p.days)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    activePreset?.label === p.label
                      ? 'bg-primary-600 text-white'
                      : 'border border-gray-700 text-gray-400 hover:border-primary-500 hover:text-primary-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-3">

              {/* UUID search */}
              <div className="flex-1 min-w-[200px] max-w-xs">
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-400">
                  <Hash className="h-3 w-3 text-primary-400" /> Run / Job ID
                </label>
                <div className="relative">
                  {isSearching
                    ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                        <Spinner className="size-3.5 text-primary-400" />
                      </span>
                    : <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                  }
                  <input
                    type="text"
                    value={uuidInput}
                    onChange={(e) => setUuidInput(e.target.value)}
                    placeholder="Search by UUID…"
                    className={`${INPUT_CLS} w-full py-2 pl-9 pr-3`}
                  />
                </div>
              </div>

              {/* Date range */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-400">
                  <CalendarDays className="h-3 w-3 text-primary-400" /> From
                </label>
                <input type="date" value={startDate} max={endDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={`${INPUT_CLS} px-3 py-2`} />
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-400">
                  <CalendarDays className="h-3 w-3 text-primary-400" /> To
                </label>
                <input type="date" value={endDate} min={startDate} max={today}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={`${INPUT_CLS} px-3 py-2`} />
              </div>

              {/* Status pills */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Status</label>
                <div className="flex gap-1 rounded-lg border border-gray-700 bg-gray-800/60 p-1">
                  {STATUS_OPTIONS.map((s) => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        statusFilter === s
                          ? s === 'DONE'    ? 'bg-emerald-500/20 text-emerald-400'
                          : s === 'FAILED'  ? 'bg-red-500/20 text-red-400'
                          : s === 'STOPPED' ? 'bg-orange-500/20 text-orange-400'
                          : s === 'RUNNING' ? 'bg-blue-500/20 text-blue-400'
                          : s === 'PENDING' ? 'bg-gray-600/60 text-gray-300'
                          : 'bg-gray-700 text-gray-200'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {s === 'ALL' ? 'All' : s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode pills */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Mode</label>
                <div className="flex gap-1 rounded-lg border border-gray-700 bg-gray-800/60 p-1">
                  {MODE_OPTIONS.map((m) => (
                    <button key={m} onClick={() => setModeFilter(m)}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        modeFilter === m
                          ? m === 'sync'  ? 'bg-primary-500/20 text-primary-400'
                          : m === 'async' ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-gray-700 text-gray-200'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {m === 'sync'  && <Zap   className="h-3 w-3" />}
                      {m === 'async' && <Timer  className="h-3 w-3" />}
                      {m === 'ALL' ? 'All' : m === 'sync' ? 'Sync' : 'Async'}
                    </button>
                  ))}
                </div>
              </div>

              {hasFilters && (
                <button onClick={clearFilters}
                  className="flex items-center gap-1.5 self-end rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}

              <div className="ml-auto self-end flex items-center gap-2">
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Refresh history"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
                <Button size="sm" onClick={() => navigate('/analyze')}>New Analysis</Button>
              </div>
            </div>
          </div>


          {/* Table */}
          {filtered.length === 0 && !showRunningRow && !isRefreshing ? (
            <EmptyState hasFilters={hasFilters} onClear={clearFilters} onNew={() => navigate('/analyze')} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900" data-tour="tour-table">

              {/* Bulk action bar */}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/5 px-5 py-2.5">
                  <span className="text-xs font-medium text-amber-300">
                    {selectedIds.size} record{selectedIds.size > 1 ? 's' : ''} selected
                  </span>
                  <button
                    onClick={() => setConfirmBulkDelete(true)}
                    disabled={bulkDeleting}
                    className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {bulkDeleting
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                    Delete selected
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="ml-auto text-xs text-gray-500 transition-colors hover:text-gray-300"
                  >
                    Clear selection
                  </button>
                </div>
              )}

              {/* Header */}
              <div className="grid grid-cols-[28px_130px_90px_1fr_175px_85px_130px] gap-4 border-b border-gray-800 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <span className="flex items-center">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={(el) => { if (el) el.indeterminate = somePageSelected && !allPageSelected }}
                    onChange={toggleSelectAll}
                    disabled={pagedSelectableIds.length === 0}
                    className="h-3.5 w-3.5 cursor-pointer accent-primary-500 disabled:cursor-not-allowed disabled:opacity-30"
                    title={allPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                  />
                </span>
                <span>Status</span>
                <span>Mode</span>
                <span>Run / Job ID</span>
                <button
                  onClick={toggleSort}
                  className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-colors text-primary-400 hover:text-primary-300`}
                >
                  <span>Created At</span>
                  {sortDir === 'asc'
                    ? <ArrowUp   className="h-3 w-3" />
                    : <ArrowDown className="h-3 w-3" />}
                  <span className="text-[10px] font-bold tracking-widest opacity-70">
                    {sortDir === 'asc' ? 'ASC' : 'DESC'}
                  </span>
                </button>
                <span>Verdicts</span>
                <span>Actions</span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-gray-800">
                {/* ── Live RUNNING row (pinned, not paginated) ── */}
                {showRunningRow && (
                  <div
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button, a')) return
                      navigate('/analyze')
                    }}
                    className="grid grid-cols-[28px_130px_90px_1fr_175px_85px_130px] cursor-pointer items-center gap-4 px-5 py-3.5 bg-blue-500/5 hover:bg-blue-500/10 border-l-2 border-blue-500/60 transition-colors"
                    title="Go to live analysis"
                  >
                    {/* Checkbox — disabled for live row */}
                    <div className="flex items-center">
                      <input type="checkbox" disabled className="h-3.5 w-3.5 opacity-20 cursor-not-allowed" />
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
                      <span className="inline-flex items-center rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-semibold text-blue-400">
                        RUNNING
                      </span>
                    </div>

                    {/* Mode */}
                    <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                      <Zap className="h-3.5 w-3.5 text-primary-400" /> Sync
                    </div>

                    {/* ID */}
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-gray-300" title={activeRunUuid || '—'}>
                        {activeRunUuid || <span className="text-gray-600 italic">session in progress</span>}
                      </p>
                    </div>

                    {/* Timestamp */}
                    <p className="text-xs text-gray-500">{startedAt ? formatDateTime(startedAt) : '—'}</p>

                    {/* Verdicts */}
                    <p className="text-xs text-gray-600 italic">In progress…</p>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      <ActionBtn
                        title="View live analysis"
                        icon={<ArrowRight className="h-3.5 w-3.5" />}
                        disabled={false}
                        onClick={() => navigate('/analyze')}
                        color="indigo"
                      />
                      <ActionBtn
                        title="Stop and mark as failed"
                        icon={<Square className="h-3.5 w-3.5 fill-current" />}
                        disabled={false}
                        onClick={() => setConfirmStop(true)}
                        color="red"
                      />
                    </div>
                  </div>
                )}

                {(isSearching || isFiltering || isRefreshing)
                  ? Array.from({ length: Math.min(PAGE_SIZE, 5) }).map((_, i) => (
                      <div key={i} className="grid grid-cols-[28px_130px_90px_1fr_175px_85px_130px] items-center gap-4 px-5 py-3.5">
                        <div />
                        <Shimmer className="h-5 w-20 rounded-full" />
                        <Shimmer className="h-4 w-14 rounded" />
                        <Shimmer className="h-3 w-full rounded" />
                        <Shimmer className="h-3 w-32 rounded" />
                        <Shimmer className="h-3 w-16 rounded" />
                        <div className="flex gap-1.5">
                          <Shimmer className="h-7 w-7 rounded-lg" />
                          <Shimmer className="h-7 w-7 rounded-lg" />
                          <Shimmer className="h-7 w-7 rounded-lg" />
                        </div>
                      </div>
                    ))
                  : paged.map((entry) => {
                  const displayId = entry.jobId ?? entry.runUuid ?? entry.id
                  const isBusy = busy[entry.id]
                  const isRerunning = isBusy === 'rerun'
                  const isDeleting  = isBusy === 'delete'
                  const isExpanded  = expandedId === entry.id

                  if (isDeleting) {
                    return (
                      <div key={entry.id} className="grid grid-cols-[28px_130px_90px_1fr_175px_85px_130px] items-center gap-4 px-5 py-3.5">
                        <div />
                        <Shimmer className="h-5 w-20 rounded-full" />
                        <Shimmer className="h-4 w-14 rounded" />
                        <Shimmer className="h-3 w-full rounded" />
                        <Shimmer className="h-3 w-32 rounded" />
                        <Shimmer className="h-3 w-16 rounded" />
                        <div className="flex gap-1.5">
                          <Shimmer className="h-7 w-7 rounded-lg" />
                          <Shimmer className="h-7 w-7 rounded-lg" />
                          <Shimmer className="h-7 w-7 rounded-lg" />
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={entry.id}>
                      {/* Clickable main row */}
                      <div
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('button, a, input[type="checkbox"]')) return
                          setExpandedId(isExpanded ? null : entry.id)
                        }}
                        className={`grid grid-cols-[28px_130px_90px_1fr_175px_85px_130px] cursor-pointer items-center gap-4 px-5 py-3.5 transition-colors ${
                          selectedIds.has(entry.id) ? 'bg-primary-500/5' :
                          isRerunning ? 'opacity-60' : isExpanded ? 'bg-gray-800/60' : 'hover:bg-gray-800/40'
                        }`}
                      >
                        {/* Checkbox / expand indicator */}
                        <div className="flex items-center">
                          {selectableIds.has(entry.id) ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(entry.id)}
                              onChange={() => toggleSelect(entry.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-3.5 w-3.5 cursor-pointer accent-primary-500"
                            />
                          ) : (
                            <span className="text-gray-700">
                              {isExpanded
                                ? <ChevronDown  className="h-3.5 w-3.5 text-primary-400" />
                                : <ChevronRight className="h-3.5 w-3.5" />}
                            </span>
                          )}
                        </div>

                        {/* Status */}
                        <div className="flex items-center gap-1.5">
                          <StatusIcon status={entry.status} />
                          <Badge type="status" value={entry.status} />
                        </div>

                        {/* Mode */}
                        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                          {entry.mode === 'sync'
                            ? <><Zap   className="h-3.5 w-3.5 text-primary-400" /> Sync</>
                            : <><Timer className="h-3.5 w-3.5 text-amber-400"  /> Async</>}
                        </div>

                        {/* ID + execution name */}
                        <div className="min-w-0 space-y-0.5">
                          <div className="group flex items-center gap-1.5">
                            <p className="truncate font-mono text-xs text-gray-300" title={displayId}>
                              {displayId}
                            </p>
                            {entry.status !== 'FAILED' && entry.status !== 'STOPPED' && (
                              <button
                                title="Copy ID"
                                onClick={() => handleCopy(`${entry.id}-id`, displayId)}
                                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-gray-300"
                              >
                                {copiedKey === `${entry.id}-id`
                                  ? <Check className="h-3 w-3 text-emerald-400" />
                                  : <Copy className="h-3 w-3" />}
                              </button>
                            )}
                          </div>
                          {entry.executionName && (
                            <div className="group flex items-center gap-1.5">
                              <p className="truncate text-xs text-gray-500" title={entry.executionName}>
                                {entry.executionName}
                              </p>
                              {entry.status !== 'FAILED' && entry.status !== 'STOPPED' && (
                                <button
                                  title="Copy name"
                                  onClick={() => handleCopy(`${entry.id}-name`, entry.executionName!)}
                                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-gray-300"
                                >
                                  {copiedKey === `${entry.id}-name`
                                    ? <Check className="h-3 w-3 text-emerald-400" />
                                    : <Copy className="h-3 w-3" />}
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Timestamp */}
                        <p className="text-xs text-gray-500">{formatCreatedAt(entry.timestamp)}</p>

                        {/* Verdicts */}
                        <p className="text-xs font-medium text-gray-300">
                          {entry.verdictCount}
                          {fmtJobDuration(entry.durationSecs) && (
                            <span className="ml-1.5 font-normal text-gray-500">
                              ({fmtJobDuration(entry.durationSecs)})
                            </span>
                          )}
                        </p>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5" {...(paged.indexOf(entry) === 0 ? { 'data-tour': 'tour-actions' } : {})}>
                          {entry.jobId && (
                            <ActionBtn
                              title="View results"
                              icon={<ArrowRight className="h-3.5 w-3.5" />}
                              disabled={!!isBusy}
                              onClick={() => navigate(`/jobs/${entry.jobId}`, {
                                state: {
                                  jobId: entry.jobId,
                                  status: entry.status,
                                  cancelReason: entry.cancelReason ?? null,
                                },
                              })}
                              color="indigo"
                            />
                          )}
                          <ActionBtn
                            title={entry.mode === 'async' ? 'Configure new batch' : 'Re-run this analysis'}
                            icon={isRerunning
                              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              : <RotateCcw className="h-3.5 w-3.5" />}
                            disabled={!!isBusy}
                            onClick={() => handleRerun(entry)}
                            color="emerald"
                          />
                          {entry.status === 'DONE' && entry.verdictCount > 0 && (
                            <ActionBtn
                              title="Open RCA report"
                              icon={reportBusy[entry.id]
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <FileText className="h-3.5 w-3.5" />}
                              disabled={!!isBusy || !!reportBusy[entry.id]}
                              onClick={async () => {
                                setReportBusy((p) => ({ ...p, [entry.id]: true }))
                                try {
                                  const { url } = await shareReport(entry.id)
                                  openInBrowser(url)
                                } catch {
                                  // silently ignore — user can retry
                                } finally {
                                  setReportBusy((p) => ({ ...p, [entry.id]: false }))
                                }
                              }}
                              color="purple"
                            />
                          )}
                          <ActionBtn
                            title="Delete record"
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            disabled={!!isBusy}
                            onClick={() => setConfirmDelete(entry)}
                            color="red"
                          />
                        </div>
                      </div>

                      {/* Expanded verdict details */}
                      {isExpanded && (() => {
                        const cached = verdictCache[entry.id]
                        if (cached === 'loading' || cached === undefined) {
                          return (
                            <div className="border-t border-gray-800/60 bg-gray-950/60 px-8 py-5 space-y-2.5">
                              {[1,2,3].map((i) => (
                                <div key={i} className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 space-y-2 animate-pulse">
                                  <div className="flex gap-2"><div className="h-5 w-24 rounded-full bg-gray-800" /><div className="h-5 w-20 rounded-full bg-gray-800" /></div>
                                  <div className="h-3 w-full rounded bg-gray-800" /><div className="h-3 w-3/4 rounded bg-gray-800" />
                                </div>
                              ))}
                            </div>
                          )
                        }
                        if (cached === 'error') {
                          return (
                            <div className="border-t border-gray-800/60 bg-gray-950/60 px-8 py-4">
                              <p className="text-xs text-red-400">Failed to load verdict details. Please try again.</p>
                            </div>
                          )
                        }
                        return <VerdictExpansion verdicts={cached} status={entry.status} cancelReason={entry.cancelReason} />
                      })()}
                    </div>
                  )
                })}
              </div>

              {/* Pagination — hidden while shimmer is active */}
              {!isSearching && !isFiltering && totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-800 px-5 py-3">
                  <span className="text-xs text-gray-600">
                    Page {page} of {totalPages} &middot; showing{' '}
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of{' '}
                    {filtered.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                      className="flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30">
                      <ChevronLeft className="h-3.5 w-3.5" /> Prev
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                      .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                        if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('…')
                        acc.push(p)
                        return acc
                      }, [])
                      .map((p, i) =>
                        p === '…' ? (
                          <span key={`e-${i}`} className="px-1 text-xs text-gray-600">…</span>
                        ) : (
                          <button key={p} onClick={() => setPage(p as number)}
                            className={`h-7 w-7 rounded-lg text-xs font-medium transition-colors ${
                              page === p ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                            }`}>
                            {p}
                          </button>
                        )
                      )}

                    <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30">
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <DeleteConfirmModal
          entry={confirmDelete}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Bulk delete confirm modal */}
      {confirmBulkDelete && (
        <BulkDeleteConfirmModal
          count={selectedIds.size}
          onConfirm={handleBulkDelete}
          onCancel={() => setConfirmBulkDelete(false)}
        />
      )}

      {/* Stop confirm modal */}
      {confirmStop && (
        <StopConfirmModal
          onConfirm={async () => {
            setConfirmStop(false)
            await stopAnalysis()
            await loadHistory()
            showToast('Job stopped by user.')
          }}
          onCancel={() => setConfirmStop(false)}
        />
      )}

      {toastMsg && <Toast message={toastMsg} visible={toastVisible} />}
    </DashboardLayout>
  )
}

// ─── sub-components ───────────────────────────────────────────────────────────

function ActionBtn({
  title, icon, disabled, onClick, color,
}: {
  title: string
  icon: React.ReactNode
  disabled: boolean
  onClick: () => void
  color: 'indigo' | 'emerald' | 'red' | 'purple'
}) {
  const colors = {
    indigo:  'hover:bg-primary-500/15 hover:text-primary-400',
    emerald: 'hover:bg-emerald-500/15 hover:text-emerald-400',
    red:     'hover:bg-red-500/15 hover:text-red-400',
    purple:  'hover:bg-purple-500/15 hover:text-purple-400',
  }
  return (
    <div className="relative inline-block group/tip">
      <button
        disabled={disabled}
        onClick={onClick}
        className={`rounded-lg p-1.5 text-gray-500 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${colors[color]}`}
      >
        {icon}
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-gray-700 bg-gray-900 px-2 py-1 text-[10px] text-gray-300 opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">
        {title}
      </span>
    </div>
  )
}

function DeleteConfirmModal({
  entry,
  onConfirm,
  onCancel,
}: {
  entry: StoredAnalysis
  onConfirm: () => void
  onCancel: () => void
}) {
  const displayId = entry.jobId ?? entry.runUuid ?? entry.id
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/15">
            <Trash2 className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-100">Delete Analysis Record</h3>
            <p className="mt-0.5 text-sm text-gray-400">
              This will permanently remove the record from your history.
            </p>
          </div>
        </div>

        <div className="mb-5 rounded-lg border border-gray-800 bg-gray-800/50 px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">Job / Run ID</p>
          <p className="font-mono text-xs text-gray-300 truncate">{displayId}</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-gray-600">
            <span>{entry.mode === 'sync' ? '⚡ Sync' : '⏳ Async'}</span>
            <span>&middot;</span>
            <span>
              {entry.verdictCount}
              {fmtJobDuration(entry.durationSecs) && (
                <span className="ml-1 text-gray-500">({fmtJobDuration(entry.durationSecs)})</span>
              )}
            </span>
            <span>&middot;</span>
            <Badge type="status" value={entry.status} />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onCancel}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function BulkDeleteConfirmModal({
  count,
  onConfirm,
  onCancel,
}: {
  count: number
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/15">
            <Trash2 className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-100">
              Delete {count} Record{count > 1 ? 's' : ''}?
            </h3>
            <p className="mt-0.5 text-sm text-gray-400">
              This will permanently remove {count} selected analysis record{count > 1 ? 's' : ''} from your history. This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete {count} Record{count > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

function StopConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/15">
            <Square className="h-4 w-4 fill-current text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-100">Stop Analysis?</h3>
            <p className="mt-0.5 text-sm text-gray-400">
              This will cancel the running analysis and mark the job as failed. This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
          >
            Keep Running
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
          >
            <Square className="h-3.5 w-3.5 fill-current" /> Stop Analysis
          </button>
        </div>
      </div>
    </div>
  )
}

function StatTile({ label, value, icon, color }: {
  label: string; value: number; icon: React.ReactNode
  color: 'indigo' | 'emerald' | 'red' | 'amber'
}) {
  const colors = {
    indigo:  'bg-primary-500/10 text-primary-400 border-primary-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    red:     'bg-red-500/10 text-red-400 border-red-500/20',
    amber:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${colors[color]}`}>
        {icon}
      </div>
      <div>
        <p className="text-lg font-bold text-gray-100">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  )
}

function EmptyState({ hasFilters, onClear, onNew }: {
  hasFilters: boolean; onClear: () => void; onNew: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 bg-gray-900/50 py-20 gap-3">
      <Clock className="h-10 w-10 text-gray-700" />
      <p className="text-sm font-medium text-gray-400">
        {hasFilters ? 'No analyses match the current filters.' : 'No analyses yet.'}
      </p>
      <p className="text-xs text-gray-600">
        {hasFilters ? 'Try adjusting the date range or clearing filters.' : 'Run your first analysis to see it here.'}
      </p>
      <div className="flex gap-2 mt-1">
        {hasFilters && (
          <button onClick={onClear}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200">
            Clear Filters
          </button>
        )}
        <Button size="sm" onClick={onNew}>New Analysis</Button>
      </div>
    </div>
  )
}

function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div
      className={`
        fixed bottom-5 right-5 z-50 flex items-center gap-3
        rounded-xl border border-emerald-500/30 bg-gray-900 px-4 py-3 shadow-2xl
        transition-transform duration-300 ease-in-out
        ${visible ? 'translate-x-0' : 'translate-x-[calc(100%+1.5rem)]'}
      `}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      </div>
      <p className="whitespace-nowrap text-sm font-medium text-gray-100">{message}</p>
    </div>
  )
}

function VpnErrorTerminal() {
  const W = 62
  const center = (s: string) => {
    const pad = Math.max(0, W - s.length)
    return ' '.repeat(Math.floor(pad / 2)) + s + ' '.repeat(Math.ceil(pad / 2))
  }
  const lines = [
    '╔' + '═'.repeat(W - 2) + '╗',
    center('VPN NOT CONNECTED — InspectorWeb is unreachable.'),
    center('Please connect to the VPN and try again.'),
    '╚' + '═'.repeat(W - 2) + '╝',
  ].join('\n')
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-xs leading-relaxed overflow-x-auto">
      <p className="text-red-400">✗ Could not reach the analysis service — check your VPN connection.</p>
      <pre className="text-red-400 mt-1">{lines}</pre>
    </div>
  )
}

// ─── VerdictFeedback ──────────────────────────────────────────────────────────

function VerdictFeedback({ matchedRule, runId: _runId }: { matchedRule: string | null; runId: string }) {
  const [state, setState] = useState<'correct' | 'wrong' | null>(null)
  const [busy, setBusy] = useState(false)
  if (!matchedRule) return null

  async function send(isCorrect: boolean) {
    if (busy || state !== null) return
    setBusy(true)
    try {
      await submitVerdictFeedback(matchedRule!, isCorrect)
      setState(isCorrect ? 'correct' : 'wrong')
    } catch { /* silent */ } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5 mt-2">
      <span className="text-[10px] text-gray-600 mr-0.5">Correct?</span>
      <button
        onClick={() => send(true)}
        disabled={busy || state !== null}
        title="Mark as correct"
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
          state === 'correct'
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'text-gray-600 hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40'
        }`}
      >
        <ThumbsUp className="h-3 w-3" />
        {state === 'correct' && 'Marked'}
      </button>
      <button
        onClick={() => send(false)}
        disabled={busy || state !== null}
        title="Mark as wrong"
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
          state === 'wrong'
            ? 'bg-red-500/20 text-red-400'
            : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40'
        }`}
      >
        <ThumbsDown className="h-3 w-3" />
        {state === 'wrong' && 'Marked'}
      </button>
    </div>
  )
}

function VerdictExplanation({ text }: { text: string }) {
  return (
    <p className="text-xs text-gray-400 break-words mb-1">{dedupeExplanation(text)}</p>
  )
}

// ─── VerdictExpansion ──────────────────────────────────────────────────────────
// Self-contained: mounts fresh on each row expand, so filter always starts at ALL.

function VerdictExpansion({ verdicts, status, cancelReason }: { verdicts: RcaVerdict[], status?: string, cancelReason?: string | null }) {
  const [filter, setFilter] = useState('ALL')
  const [isFiltering, setIsFiltering] = useState(false)
  const [cancelCopied, setCancelCopied] = useState(false)
  const filterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleFilterChange(cat: string) {
    if (cat === filter) return
    if (filterTimer.current) clearTimeout(filterTimer.current)
    setIsFiltering(true)
    setFilter(cat)
    filterTimer.current = setTimeout(() => setIsFiltering(false), 250)
  }

  function copyCancelReason(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCancelCopied(true)
      setTimeout(() => setCancelCopied(false), 2000)
    }).catch(() => {})
  }

  if (verdicts.length === 0) {
    const isFailed  = status === 'FAILED'
    const isStopped = status === 'STOPPED'
    const reason = cancelReason ?? (isFailed ? 'Analysis could not be completed — the execution may still be running or was not in a Done state. Check InspectorWeb and retry once the run has finished.' : null)

    return (
      <div className="border-t border-gray-800/60 bg-gray-950/60 px-8 py-4 space-y-1">
        {isStopped ? (
          <>
            <p className="text-xs font-medium text-orange-400">Analysis stopped</p>
            <div className="flex items-start gap-1.5 group">
              <p className="text-xs text-gray-400 min-w-0 flex-1 line-clamp-1 break-words">{cancelReason ?? 'Cancelled by user'}</p>
              <button onClick={() => copyCancelReason(cancelReason ?? 'Cancelled by user')} title="Copy full text" className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-gray-500 hover:text-gray-300">
                {cancelCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </>
        ) : isFailed && isVpnError(cancelReason) ? (
          <VpnErrorTerminal />
        ) : isFailed && reason ? (
          <>
            <p className="text-xs font-medium text-red-400">Job did not complete</p>
            <div className="flex items-start gap-1.5 group">
              <p className="text-xs text-gray-400 min-w-0 flex-1 line-clamp-1 break-words">{reason}</p>
              <button onClick={() => copyCancelReason(reason)} title="Copy full text" className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-gray-500 hover:text-gray-300">
                {cancelCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-600">No verdict details stored for this entry.</p>
        )}
      </div>
    )
  }

  const categories = ['ALL', ...Array.from(new Set(verdicts.map((v) => v.category)))]
  const visible = filter === 'ALL' ? verdicts : verdicts.filter((v) => v.category === filter)
  const countFor = (cat: string) =>
    cat === 'ALL' ? verdicts.length : verdicts.filter((v) => v.category === cat).length

  return (
    <div className="border-t border-gray-800/60 bg-gray-950/60 px-8 py-4 space-y-3">

      {/* Category filter pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {categories.map((cat) => {
          const isActive = filter === cat
          const activeStyle =
            cat === 'ALL'
              ? 'bg-primary-600 text-white border-primary-600'
              : (CATEGORY_STYLES[cat as keyof typeof CATEGORY_STYLES] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30') +
                ' ring-1 ring-current'
          return (
            <button
              key={cat}
              onClick={() => handleFilterChange(cat)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
                isActive
                  ? activeStyle
                  : 'border-gray-700 bg-gray-800/60 text-gray-500 hover:border-gray-600 hover:text-gray-300'
              }`}
            >
              {cat.replace(/_/g, ' ')}
              <span className={`rounded-full px-1 py-px text-[10px] font-semibold ${
                isActive ? 'bg-white/20' : 'bg-gray-700 text-gray-400'
              }`}>
                {countFor(cat)}
              </span>
            </button>
          )
        })}
      </div>

      {/* Verdict cards / shimmer */}
      {isFiltering ? (
        <div className="space-y-2.5">
          {Array.from({ length: Math.min(visible.length || 3, 4) }).map((_, i) => (
            <div key={i} className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 space-y-2">
              <div className="flex gap-2">
                <Shimmer className="h-5 w-24 rounded-full" />
                <Shimmer className="h-5 w-20 rounded-full" />
              </div>
              <Shimmer className="h-3 w-full rounded" />
              <Shimmer className="h-3 w-3/4 rounded" />
              <div className="flex items-center justify-between">
                <Shimmer className="h-3 w-32 rounded" />
                <Shimmer className="h-3 w-28 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-xs text-gray-600 py-2">No verdicts match this category.</p>
      ) : (
        <div className="space-y-2.5">
          <VerdictsByRun verdicts={visible}>{(runVerdicts) => <div className="space-y-2.5">{runVerdicts.map((v, i) => (
            <div key={i} className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge type="category" value={v.category} />
                <Badge type="platform" value={v.platform} />
                <ErrorCodeChip {...v} />
                {v.jiraUrl && (
                  <button
                    onClick={() => openInBrowser(v.jiraUrl!)}
                    className="flex items-center gap-1.5 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-0.5 text-xs font-medium text-cyan-400 transition-colors hover:bg-cyan-400/20"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {v.matchedJiraTicket ?? 'Jira Issue'}
                  </button>
                )}
                {v.reportUrl && (
                  <button
                    onClick={() => openInBrowser(v.reportUrl!)}
                    className="flex items-center gap-1.5 rounded-full border border-primary-400/25 bg-primary-400/10 px-2.5 py-0.5 text-xs font-medium text-primary-400 transition-colors hover:bg-primary-400/20"
                  >
                    <FileText className="h-3 w-3" />
                    Report
                  </button>
                )}
              </div>
              <VerdictExplanation text={v.explanation} />
              <VerdictFix explanation={v.explanation} category={v.category} errors={v.failureErrors} reasons={v.stepReasons} componentLogs={v.componentLogs} flatLogs={v.flatLogs} />
              <FailedReasonsList errors={v.failureErrors} reasons={v.stepReasons} />
              <div className="mt-2 flex items-center gap-4">
                {v.matchedRule ? (
                  <span className="text-xs text-gray-500 truncate">
                    Rule: <span className="font-mono text-gray-400">{v.matchedRule}</span>
                  </span>
                ) : (
                  <span className="font-mono text-xs text-gray-700 truncate">{v.testCaseRunId}</span>
                )}
                <div className="ml-auto w-28 shrink-0">
                  <ConfidenceBar value={v.confidence} />
                </div>
              </div>
              <VerdictFeedback matchedRule={v.matchedRule} runId={v.testCaseRunId} />
              {v.screenshot && (
                <div className="mt-3 overflow-hidden rounded-lg border border-gray-700/60">
                  <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-600 border-b border-gray-800">
                    Last Screenshot
                  </p>
                  <img
                    src={v.screenshot}
                    alt="Test failure screenshot"
                    className="w-full object-contain max-h-72 bg-gray-950"
                  />
                </div>
              )}
            </div>
          ))}</div>}</VerdictsByRun>
        </div>
      )}
    </div>
  )
}

function SkeletonView() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <Shimmer className="h-9 w-9 rounded-lg" />
            <div className="space-y-1.5">
              <Shimmer className="h-5 w-10 rounded" />
              <Shimmer className="h-3 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex flex-wrap gap-3">
          <Shimmer className="h-9 w-56 rounded-lg" />
          <Shimmer className="h-9 w-36 rounded-lg" />
          <Shimmer className="h-9 w-36 rounded-lg" />
          <Shimmer className="h-9 w-56 rounded-lg" />
          <Shimmer className="h-9 w-36 rounded-lg" />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-5 py-3">
          <Shimmer className="h-3 w-64 rounded" />
        </div>
        <div className="divide-y divide-gray-800">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[28px_130px_90px_1fr_175px_85px_130px] items-center gap-4 px-5 py-3.5">
              <div />
              <Shimmer className="h-5 w-20 rounded-full" />
              <Shimmer className="h-4 w-14 rounded" />
              <Shimmer className="h-3 w-full rounded" />
              <Shimmer className="h-3 w-32 rounded" />
              <Shimmer className="h-3 w-16 rounded" />
              <div className="flex gap-1.5">
                <Shimmer className="h-7 w-7 rounded-lg" />
                <Shimmer className="h-7 w-7 rounded-lg" />
                <Shimmer className="h-7 w-7 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
