// Author: Kishore Kumar
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  ShieldCheck,
  ShieldOff,
  UserCheck,
  BadgeCheck,
  UserX,
  RefreshCw,
  Trash2,
  Users,
  Crown,
  AlertTriangle,
  UserPlus,
  QrCode,
  Copy,
  Check,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  X as XIcon,
  History,
  Clock,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Zap,
  Timer,
  Loader2,
  Square,
  CheckCircle2,
  XCircle,
  BarChart3,
  CalendarDays,
  Hash,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  MessageSquare,
  Star,
  ThumbsUp,
  ThumbsDown,
  Megaphone,
  Send,
  Wifi,
  Cake,
} from 'lucide-react'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import {
  AdminUser,
  CreateUserResult,
  createUser,
  deleteUser,
  approveUser,
  listUsers,
  resetTotp,
  toggleStatus,
  updateRole,
  updateFullName,
  updateUserDob,
  listTags,
  updateUserPermissions,
  TagInfo,
} from '../api/admin'
import { TagChips } from '../components/ui/TagChips'
import { useAuthStore } from '../store/authStore'
import { formatCreatedAt, toDateStr } from '../utils/date'
import { Spinner } from '../components/ui/spinner'
import { Shimmer } from '../components/ui/Shimmer'
import { VerdictsByRun } from '../components/ui/VerdictsByRun'
import { StoredAnalysis, RcaVerdict, JobStatus, RuleStats } from '../types'
import { Badge, CATEGORY_STYLES } from '../components/ui/Badge'
import { ErrorCodeChip } from '../components/ui/ErrorCodeChip'
import { ConfidenceBar } from '../components/charts/ConfidenceBar'
import { getAdminHistory, submitVerdictFeedback, getRuleStats, overrideRuleConfidence, getAdminHistoryVerdicts } from '../api/rca'
import { listFeedback, getFeedbackStats, FeedbackEntry, FeedbackStats } from '../api/feedback'
import { sendAnnouncement, getAnnouncementHistory, getAnnouncementRecipients, deleteAnnouncement, AnnouncementRecord, RecipientStatus } from '../api/notifications'
import { useTour } from '../tour/TourContext'
import { useModalEscape } from '../hooks/useModalEscape'
import { useLivePoll } from '../hooks/useLivePoll'
import { CopyText } from '../components/ui/CopyText'
import { Hint } from '../components/ui/Hint'

type ActionKey = 'role' | 'status' | 'totp' | 'delete' | 'approve'
type RoleFilter = 'all' | 'user' | 'admin'
type StatusFilter = 'all' | 'pending' | 'active' | 'inactive' | 'online' | 'offline'
type SortDir = 'asc' | 'desc'
type UserSortField = 'email' | 'full_name' | 'created_at'

function SortHeader({
  label,
  field,
  active,
  dir,
  onToggle,
  className = '',
}: {
  label: string
  field: string
  active: string | null
  dir: SortDir
  onToggle: (field: string) => void
  className?: string
}) {
  const isActive = active === field
  return (
    <button
      onClick={() => onToggle(field)}
      className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
        isActive ? 'text-primary-400' : 'text-gray-500 hover:text-gray-300'
      } ${className}`}
    >
      <span>{label}</span>
      {isActive ? (
        <>
          {dir === 'asc'
            ? <ArrowUp   className="h-3 w-3" />
            : <ArrowDown className="h-3 w-3" />}
          <span className="text-[10px] font-bold tracking-widest opacity-70">
            {dir === 'asc' ? 'ASC' : 'DESC'}
          </span>
        </>
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  )
}

interface Confirm {
  userId: number
  email: string
  action: ActionKey
}

const PAGE_SIZE = 10

function presenceStatus(lastSeen: string | null | undefined): 'online' | 'away' | 'offline' {
  if (!lastSeen) return 'offline'
  const diffMs = Date.now() - new Date(lastSeen).getTime()
  if (!isFinite(diffMs) || diffMs < 0) return 'offline'
  if (diffMs < 2 * 60 * 1000)  return 'online'
  if (diffMs < 60 * 60 * 1000) return 'away'
  return 'offline'
}

function presenceText(lastSeen: string | null | undefined): string {
  const s = presenceStatus(lastSeen)
  if (s === 'online')  return 'Online'
  if (s === 'offline') return 'Offline'
  const diffMs = Date.now() - new Date(lastSeen!).getTime()
  if (!isFinite(diffMs) || diffMs < 0) return 'Away'
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `Last seen ${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return `Last seen ${hrs}h ago`
}

const isVpnError = (reason: string | null | undefined) =>
  !!reason && /vpn|unreachable|network error/i.test(reason)

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
  if (undefProp) hint = `'${undefProp[1]}' is undefined — the parent object was not initialized or returned null. Ensure the data is fully loaded before this step runs.`
  else if (/Cannot read propert(?:y|ies) of (?:undefined|null)/.test(core)) hint = 'A property was accessed on an undefined or null object — verify the object is initialized before use.'
  else { const notFunc = core.match(/^(.+?) is not a function/); if (notFunc) hint = `'${notFunc[1]}' is not a function — it may be undefined, not yet loaded, or the wrong type.` }
  if (!hint) { const notDef = core.match(/^(.+?) is not defined$/); if (notDef) hint = `'${notDef[1]}' is not defined — check imports and variable scope.` }
  if (!hint && (/expected\s+.+?\s+to\s+/i.test(core) || type === 'AssertionError')) hint = 'Assertion failed — the actual value did not match the expected value.'
  if (!hint && /timeout/i.test(core)) hint = 'Operation timed out — the service may be slow, unreachable, or under load.'
  return { type, core, hint, stepName }
}

const CATEGORY_FIX: Record<string, string> = {
  DRM_ERROR:             'Verify DRM license server availability, token validity, and device entitlement.',
  PLAYOUT_ERROR:         'Check stream URL, CDN availability, and manifest validity.',
  ENVIRONMENT:           'Check environment configuration, service dependencies, and network connectivity.',
  BROWSERSTACK_CAPACITY: 'BrowserStack capacity may be exhausted — retry later or reduce parallel sessions.',
  ORCHESTRATION:         'Check orchestration service health and connectivity.',
  KNOWN_ISSUE:           'Refer to the linked Jira ticket for the documented fix or workaround.',
  AUTOMATION_SCRIPT:     'Fix the automation script: missing function, undefined variable, or a UI locator that no longer matches the app.',
  TEST_ASSERTION:        'Compare app state with the expected value: either the app regressed or the test data / expectation is out of date.',
  UNKNOWN:               'Review the full logs and stack trace for more context.',
  NETWORK_ERROR:         'Check network connectivity, firewall rules, and DNS resolution.',
  HARDWARE_ERROR:        'Verify device hardware health and physical connectivity.',
  SOFTWARE_UPDATE_ERROR: 'Check update server availability, device storage, and firmware compatibility.',
  PROVISIONING_ERROR:    'Verify device provisioning status and backend configuration.',
  BACKEND_ERROR:         'Check backend service health, API responses, and authentication tokens.',
  OTT_ERROR:             'Check OTT platform connectivity and service availability.',
  ACCOUNT_ERROR:         'Verify account credentials, entitlements, and subscription status.',
}

function getFixHint(
  explanation: string,
  category: string,
  errors?: Array<Record<string, string>>,
  reasons?: Array<Record<string, string>>,
): string {
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
    if (undefProp) return `'${undefProp[1]}' is undefined — ensure the parent object is initialized before this step runs.`
    if (/Cannot read propert(?:y|ies) of (?:undefined|null)/.test(core)) return 'A property was accessed on an undefined or null object — verify initialization before use.'
    const notFunc = core.match(/^(.+?) is not a function/)
    if (notFunc) return `'${notFunc[1]}' is not a function — it may be undefined, not yet loaded, or the wrong type.`
    const notDef = core.match(/^(.+?) is not defined$/)
    if (notDef) return `'${notDef[1]}' is not defined — check imports and variable scope.`
    if (/expected\s+.+?\s+to\s+/i.test(core) || /AssertionError/i.test(core)) return 'Assertion failed — the actual value did not match the expected value.'
    if (/timeout/i.test(core)) return 'Operation timed out — the service may be slow, unreachable, or under load.'
    if (/Mismatch/i.test(core)) return 'A data mismatch was detected — verify the source data and expected values are in sync.'
  }
  return CATEGORY_FIX[category] ?? 'Review the test logs and error details for further investigation.'
}

function VerdictExplanation({ text }: { text: string }) {
  return <p className="text-xs text-gray-400 break-words mb-1">{dedupeExplanation(text)}</p>
}

function VerdictFix({
  explanation,
  category,
  errors,
  reasons,
}: {
  explanation: string
  category: string
  errors?: Array<Record<string, string>>
  reasons?: Array<Record<string, string>>
}) {
  return (
    <p className="mt-1.5 text-[11px] leading-relaxed text-sky-300/80">
      Fix: {getFixHint(explanation, category, errors, reasons)}
    </p>
  )
}

function FailedReasonsList({ errors, reasons }: {
  errors?: Array<Record<string, string>>
  reasons?: Array<Record<string, string>>
}) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  function copyItem(text: string, idx: number) {
    navigator.clipboard.writeText(text).then(() => { setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 2000) }).catch(() => {})
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
                {stepName && <p className="mb-0.5 text-[10px] font-medium text-gray-500">Step: {stepName}</p>}
                <div className="flex flex-wrap items-baseline gap-1.5">
                  {type && <span className="shrink-0 rounded px-1 py-px text-[10px] font-bold bg-red-500/15 text-red-400">{type}</span>}
                  <span className="break-words text-xs text-amber-200/80">{core}</span>
                </div>
              </div>
              <button onClick={() => copyItem(type ? `${type}: ${core}` : core, i)} title="Copy error"
                className="ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-amber-400/60 hover:text-amber-300">
                {copiedIdx === i ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AdminPage() {
  const currentUser = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const { startTourIfNew, setPageHint } = useTour()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pageLoading, setPageLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [editingName, setEditingName] = useState<number | null>(null)
  const [nameValue, setNameValue] = useState('')
  const [editingDob, setEditingDob] = useState<number | null>(null)
  const [dobValue, setDobValue] = useState('')
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [createdUser, setCreatedUser] = useState<CreateUserResult | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // Sort
  const [userSortField, setUserSortField] = useState<UserSortField | null>(null)
  const [userSortDir, setUserSortDir]     = useState<SortDir>('asc')
  const [copiedEmail, setCopiedEmail] = useState<number | null>(null)

  function copyEmail(userId: number, email: string) {
    navigator.clipboard.writeText(email).then(() => {
      setCopiedEmail(userId)
      setTimeout(() => setCopiedEmail(null), 2000)
    })
  }

  function toggleUserSort(field: string) {
    const f = field as UserSortField
    if (userSortField === f) {
      setUserSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setUserSortField(f)
      setUserSortDir('asc')
    }
    setPage(1)
  }

  // Pagination
  const [page, setPage] = useState(1)

  // Tag registry — drives the Tags column (e.g. Regression = regression.view + regression.run)
  const [tagRegistry, setTagRegistry] = useState<TagInfo[]>([])
  useEffect(() => {
    listTags().then(setTagRegistry).catch(() => setTagRegistry([]))
  }, [])

  // Tab
  const [tab, setTab] = useState<'users' | 'history' | 'feedback' | 'rules' | 'announce'>('users')
  const [tabSwitching, setTabSwitching] = useState(false)
  const tabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Pending auto-tour; cleared on every switch so a tour never opens for a tab you already left
  const tourTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function switchTab(next: 'users' | 'history' | 'feedback' | 'rules' | 'announce') {
    if (next === tab) return
    setTabSwitching(true)
    if (tabTimerRef.current) clearTimeout(tabTimerRef.current)
    tabTimerRef.current = setTimeout(() => setTabSwitching(false), 500)
    setTab(next)
    const pageId = next === 'history' ? 'admin-history' : next === 'feedback' ? 'admin-feedback' : next === 'rules' ? 'admin-rules' : next === 'announce' ? 'admin-announce' : 'admin'
    setPageHint(pageId)
    if (tourTimerRef.current) clearTimeout(tourTimerRef.current)
    tourTimerRef.current = setTimeout(() => startTourIfNew(pageId), 2500)
  }

  // Refresh key — increment to trigger reload in the active tab
  const [refreshKey, setRefreshKey] = useState(0)

  // Presence tick — increments every 30 s to force presenceStatus recomputation
  const [presenceTick, setPresenceTick] = useState(0)

  function handleRefresh() {
    setTabSwitching(true)
    if (tabTimerRef.current) clearTimeout(tabTimerRef.current)
    tabTimerRef.current = setTimeout(() => setTabSwitching(false), 500)
    if (tab === 'users') { load(); return }
    setRefreshKey((k) => k + 1)
  }

  // Keep the users list live: new sign-ups, approvals, tag changes by other admins and
  // last-seen presence all show up without a reload (inline edits keep their own state).
  useLivePoll(async () => {
    try {
      const res = await listUsers()
      setUsers(res.users)
      setTotal(res.total)
    } catch { /* keep what's shown */ }
  }, 10_000, !loading && !error)

  async function load() {
    setLoading(true)
    setPageLoading(true)
    setError('')
    if (import.meta.env.DEV) {
      const delay = Math.random() * 2000 + 3000
      setTimeout(() => setPageLoading(false), delay)
    } else {
      setPageLoading(false)
    }
    try {
      const res = await listUsers()
      setUsers(res.users)
      setTotal(res.total)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 403) {
        setError('Access denied — your account does not have the admin role. Run tools/make_admin.py <your-email> on the server, then log out and back in.')
      } else if (status === 401) {
        setError('Session expired. Please log out and log in again.')
      } else if (status === 404) {
        setError('Admin API not found — the backend needs to be restarted to pick up the new admin routes. Stop and re-run ./run.sh.')
      } else if (!status) {
        setError('Could not reach the backend. Make sure the service is running on port 8000.')
      } else {
        setError(`Server error (HTTP ${status}). Check the backend logs for details.`)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Delay so shimmer finishes before guide starts
    setPageHint('admin')
    tourTimerRef.current = setTimeout(() => startTourIfNew('admin'), 5000)

    // Local tick every 30s so presenceStatus text transitions (online→away→offline)
    // and "Last seen Xm ago" counter increments without waiting for server poll
    const tickInterval = setInterval(() => setPresenceTick(n => n + 1), 30_000)

    return () => {
      if (tourTimerRef.current) clearTimeout(tourTimerRef.current)
      clearInterval(tickInterval)
    }
  }, [])

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1) }, [search, roleFilter, statusFilter, userSortField, userSortDir])

  const pendingCount = useMemo(() => users.filter((u) => u.is_approved === false).length, [users])
  const filteredUsers = useMemo(() => {
    const list = users.filter((u) => {
      if (search) {
        const q = search.toLowerCase()
        const matchEmail = u.email.toLowerCase().includes(q)
        const matchName = u.full_name?.toLowerCase().includes(q) ?? false
        if (!matchEmail && !matchName) return false
      }
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (statusFilter === 'pending' && u.is_approved !== false) return false
      if (statusFilter === 'active' && !u.is_active) return false
      if (statusFilter === 'inactive' && u.is_active) return false
      if (statusFilter === 'online' && presenceStatus(u.last_seen) !== 'online') return false
      if (statusFilter === 'offline' && presenceStatus(u.last_seen) !== 'offline') return false
      return true
    })
    if (!userSortField) return list
    return [...list].sort((a, b) => {
      let av = '', bv = ''
      if (userSortField === 'email')      { av = a.email;           bv = b.email }
      if (userSortField === 'full_name')  { av = a.full_name ?? ''; bv = b.full_name ?? '' }
      if (userSortField === 'created_at') { av = a.created_at;      bv = b.created_at }
      const cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' })
      return userSortDir === 'asc' ? cmp : -cmp
    })
  }, [users, search, roleFilter, statusFilter, userSortField, userSortDir, presenceTick])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const pagedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  async function execAction(userId: number, action: ActionKey, role?: 'user' | 'admin') {
    setBusy(userId)
    setConfirm(null)
    try {
      if (action === 'role' && role) {
        const updated = await updateRole(userId, role)
        setUsers((u) => u.map((x) => (x.id === userId ? updated : x)))
      } else if (action === 'status') {
        const updated = await toggleStatus(userId)
        setUsers((u) => u.map((x) => (x.id === userId ? updated : x)))
      } else if (action === 'totp') {
        const updated = await resetTotp(userId)
        setUsers((u) => u.map((x) => (x.id === userId ? updated : x)))
      } else if (action === 'approve') {
        const updated = await approveUser(userId)
        setUsers((u) => u.map((x) => (x.id === userId ? updated : x)))
      } else if (action === 'delete') {
        await deleteUser(userId)
        setUsers((u) => u.filter((x) => x.id !== userId))
        setTotal((t) => t - 1)
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Action failed. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  async function savePermissions(userId: number, permissions: string[]) {
    setBusy(userId)
    try {
      const updated = await updateUserPermissions(userId, permissions)
      setUsers((u) => u.map((x) => (x.id === userId ? updated : x)))
      if (updated.email === currentUser?.email) await fetchMe()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Failed to update permissions.')
    } finally {
      setBusy(null)
    }
  }

  async function saveName(userId: number) {
    const trimmed = nameValue.trim() || null
    setEditingName(null)
    try {
      const updated = await updateFullName(userId, trimmed)
      setUsers((u) => u.map((x) => (x.id === userId ? updated : x)))
      if (updated.email === currentUser?.email) await fetchMe()
    } catch (err: unknown) {
      const raw = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      const msg = Array.isArray(raw)
        ? (raw[0] as { msg?: string })?.msg ?? 'Failed to update full name.'
        : (raw as string | undefined) ?? 'Failed to update full name.'
      setError(msg)
    }
  }

  async function saveDob(userId: number) {
    const val = dobValue.trim() || null
    setEditingDob(null)
    try {
      const updated = await updateUserDob(userId, val)
      setUsers((u) => u.map((x) => (x.id === userId ? updated : x)))
    } catch (err: unknown) {
      const raw = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      const msg = Array.isArray(raw)
        ? (raw[0] as { msg?: string })?.msg ?? 'Failed to update date of birth.'
        : (raw as string | undefined) ?? 'Failed to update date of birth.'
      setError(msg)
    }
  }

  function formatDobDisplay(dob: string | null | undefined): string {
    if (!dob) return 'Not set'
    const [y, m, d] = dob.split('-')
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`
  }

  return (
    <DashboardLayout title="Admin">
      {/* Hero header */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-primary-500/20 bg-gradient-to-br from-gray-900 via-gray-900 to-primary-950/40 p-5">
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary-600/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-6 bottom-0 h-24 w-24 rounded-full bg-primary-800/10 blur-2xl" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-600/20 ring-1 ring-primary-500/30"
              style={{ animation: 'shieldFlash 4s ease-in-out infinite' }}
            >
              <ShieldCheck className="h-6 w-6 text-primary-400" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold text-gray-100">Administration</h2>
                <span className="rounded-full bg-primary-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary-400 ring-1 ring-primary-500/30">
                  Admin Only
                </span>
              </div>
              <p className="mt-0.5 text-sm text-gray-500">
                {total > 0
                  ? <>{total} registered user{total !== 1 ? 's' : ''} · logged in as{' '}<span className="text-primary-400">{currentUser?.email}</span></>
                  : <>Manage users, review history &amp; feedback · logged in as{' '}<span className="text-primary-400">{currentUser?.email}</span></>
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              data-tour="tour-add-user"
              onClick={() => setShowAddUser(true)}
              className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-primary-500/20 transition-all hover:bg-primary-500 hover:shadow-primary-500/30"
            >
              <UserPlus className="h-4 w-4" /> Add User
            </button>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/60 px-4 py-2 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:bg-gray-800 hover:text-gray-200"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* About this page */}
      <div
        className="mb-6 overflow-hidden rounded-2xl border border-gray-800 bg-gray-900"
        data-tour="tour-admin-about"
        style={{ animation: 'fadeSlideUp 0.45s cubic-bezier(0.4,0,0.2,1) 0.05s both' }}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-500/10">
              <Crown className="h-3.5 w-3.5 text-primary-400" />
            </div>
            <span className="text-sm font-semibold text-gray-100">Inspector AI — Administration</span>
          </div>
          <span className="text-[10px] font-medium text-gray-600">Access restricted to admin role</span>
        </div>

        {/* Tab descriptions */}
        <div className="grid grid-cols-1 divide-y divide-gray-800 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
          {[
            {
              icon: <Users className="h-4 w-4 text-primary-400" />,
              label: 'Users',
              color: 'bg-primary-500/10',
              desc: 'Create, search, and manage all registered accounts. Promote users to admin, activate or deactivate accounts, reset TOTP 2FA, and delete users.',
            },
            {
              icon: <History className="h-4 w-4 text-amber-400" />,
              label: 'Job History',
              color: 'bg-amber-500/10',
              desc: 'Inspect the full analysis history for any user. Filter by date range, job UUID, status (Done / Failed / Running), and mode (Sync / Async).',
            },
            {
              icon: <MessageSquare className="h-4 w-4 text-emerald-400" />,
              label: 'Feedback',
              color: 'bg-emerald-500/10',
              desc: 'View all star ratings and comments submitted by users. Filter by rating, search by user, and sort by recency or score to spot issues early.',
            },
            {
              icon: <FileText className="h-4 w-4 text-sky-400" />,
              label: 'Rules',
              color: 'bg-sky-500/10',
              desc: 'Monitor the RCA rule engine — see hit counts, confirmed vs. disputed verdicts, and override the static confidence score for any rule.',
            },
            {
              icon: <Megaphone className="h-4 w-4 text-rose-400" />,
              label: 'Announce',
              color: 'bg-rose-500/10',
              desc: 'Broadcast an announcement to all active users. Each user receives it instantly in their notification inbox.',
            },
          ].map(({ icon, label, color, desc }) => (
            <div key={label} className="flex flex-col gap-2.5 px-5 py-4">
              <div className="flex items-center gap-2">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${color}`}>
                  {icon}
                </div>
                <span className="text-xs font-semibold text-gray-300">{label}</span>
              </div>
              <p className="text-xs leading-relaxed text-gray-500">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex border-b border-gray-800" data-tour="tour-tabs">
        {([
          { key: 'users',    label: 'Users',      icon: <Users         className="h-4 w-4" /> },
          { key: 'history',  label: 'Job History', icon: <History       className="h-4 w-4" /> },
          { key: 'feedback', label: 'Feedback',    icon: <MessageSquare className="h-4 w-4" /> },
          { key: 'rules',    label: 'Rules',       icon: <FileText      className="h-4 w-4" /> },
          { key: 'announce', label: 'Announce',    icon: <Megaphone     className="h-4 w-4" /> },
        ] as const).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={`relative flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
              tab === key ? 'text-primary-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {icon}
            {label}
            {tab === key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary-500" />
            )}
          </button>
        ))}
      </div>

      {tabSwitching ? (
        <TabShimmer tab={tab} />
      ) : (
        <>
          {tab === 'history' && <UserHistoryTab users={users} refreshKey={refreshKey} />}
          {tab === 'feedback' && <FeedbackTab refreshKey={refreshKey} />}
          {tab === 'rules' && <RulesTab />}
          {tab === 'announce' && <AnnounceTab />}
        </>
      )}

      {!tabSwitching && tab === 'users' && error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {!tabSwitching && tab === 'users' && !loading && users.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" style={{ animation: 'fadeSlideUp 0.4s ease both' }}>
          {([
            { label: 'Total Users', value: total,                                                                    color: 'indigo',  icon: <Users      className="h-4 w-4" /> },
            { label: 'Pending Approval', value: pendingCount,                                                        color: 'amber',   icon: <Clock      className="h-4 w-4" /> },
            { label: 'Active',      value: users.filter((u) => u.is_active).length,                                  color: 'emerald', icon: <UserCheck  className="h-4 w-4" /> },
            { label: 'Inactive',    value: users.filter((u) => !u.is_active).length,                                 color: 'gray',    icon: <UserX      className="h-4 w-4" /> },
            { label: 'Admins',      value: users.filter((u) => u.role === 'admin').length,                           color: 'amber',   icon: <Crown      className="h-4 w-4" /> },
            { label: 'Online',      value: users.filter((u) => presenceStatus(u.last_seen) === 'online').length,     color: 'sky',     icon: <Wifi       className="h-4 w-4" /> },
          ] as const).map(({ label, value, color, icon }) => {
            const iconCls = {
              indigo:  'bg-primary-500/10  text-primary-400  border-primary-500/20',
              emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
              gray:    'bg-gray-500/10    text-gray-400    border-gray-500/20',
              amber:   'bg-amber-500/10   text-amber-400   border-amber-500/20',
              sky:     'bg-sky-500/10     text-sky-400     border-sky-500/20',
            }[color]
            return (
              <div key={label} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 transition-colors hover:border-gray-700">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${iconCls}`}>
                  {icon}
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-100">{value}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!tabSwitching && tab === 'users' && (
      <div className="mb-4 flex flex-wrap items-center gap-3" data-tour="tour-user-filters">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or name…"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-3 text-sm text-gray-100 placeholder-gray-600 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
          />
        </div>

        {/* Role filter */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800/60 p-1">
          {(['all', 'user', 'admin'] as RoleFilter[]).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                roleFilter === r
                  ? r === 'admin'
                    ? 'bg-amber-500/20 text-amber-400'
                    : r === 'user'
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'bg-gray-700 text-gray-200'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {r === 'all' ? 'All Roles' : r === 'admin' ? 'Admin' : 'User'}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800/60 p-1">
          {(['all', 'pending', 'active', 'inactive', 'online', 'offline'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? s === 'pending'  ? 'bg-amber-500/20 text-amber-300'
                  : s === 'active'   ? 'bg-emerald-500/20 text-emerald-400'
                  : s === 'inactive' ? 'bg-gray-600/60 text-gray-300'
                  : s === 'online'   ? 'bg-sky-500/20 text-sky-400'
                  : s === 'offline'  ? 'bg-gray-700/80 text-gray-400'
                  :                    'bg-gray-700 text-gray-200'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {s === 'all' ? 'All Status' : s === 'pending' ? `Pending approval${pendingCount ? ` (${pendingCount})` : ''}` : s === 'active' ? 'Active' : s === 'inactive' ? 'Inactive' : s === 'online' ? 'Online' : 'Offline'}
            </button>
          ))}
        </div>

        {/* Clear filters + result count */}
        <div className="ml-auto flex items-center gap-3">
          {(search || roleFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => { setSearch(''); setRoleFilter('all'); setStatusFilter('all') }}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
            >
              Clear filters
            </button>
          )}
          <span className="text-xs text-gray-600">
            {filteredUsers.length} of {total} user{total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      )}

      {!tabSwitching && tab === 'users' && (
      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900" data-tour="tour-user-table">
        {/* Table header */}
        <div className="grid grid-cols-[minmax(170px,1fr)_140px_90px_100px_140px_110px_90px_164px] gap-3 border-b border-gray-800 bg-gray-800/40 px-5 py-3">
          <SortHeader label="User"       field="email"      active={userSortField} dir={userSortDir} onToggle={toggleUserSort} className="flex items-center gap-2" />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Date of Birth</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Role</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Tags</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Status</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Last Seen</span>
          <SortHeader label="Created At" field="created_at" active={userSortField} dir={userSortDir} onToggle={toggleUserSort} />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</span>
        </div>

        {(pageLoading || loading) ? (
          <div className="space-y-px">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[minmax(170px,1fr)_140px_90px_100px_140px_110px_90px_164px] items-center gap-3 px-5 py-4">
                <div className="space-y-2">
                  <Shimmer className="h-4 w-48 rounded" />
                  <Shimmer className="h-3 w-28 rounded" />
                </div>
                <Shimmer className="h-4 w-24 rounded" />
                <Shimmer className="h-6 w-16 rounded-full" />
                <Shimmer className="h-4 w-24 rounded" />
                <Shimmer className="h-4 w-12 rounded" />
                <Shimmer className="h-4 w-24 rounded" />
                <Shimmer className="h-3 w-32 rounded" />
                <div className="flex gap-1.5">
                  {[0,1,2,3].map((j) => <Shimmer key={j} className="h-7 w-7 rounded-lg" />)}
                </div>
              </div>
            ))}
          </div>
        ) : pagedUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-600">
            <Users className="h-10 w-10" />
            <p className="text-sm">
              {filteredUsers.length === 0 && users.length > 0
                ? 'No users match the current filters.'
                : 'No users found.'}
            </p>
            {filteredUsers.length === 0 && users.length > 0 && (
              <p className="text-xs text-gray-700">Use the Clear filters button above to reset.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {pagedUsers.map((u, idx) => {
              const isSelf = u.email === currentUser?.email
              const isBusy = busy === u.id

              return (
                <div
                  key={u.id}
                  className="grid grid-cols-[minmax(170px,1fr)_140px_90px_100px_140px_110px_90px_164px] items-center gap-3 px-5 py-4 transition-colors hover:bg-primary-500/5"
                  style={{ animation: 'fadeSlideUp 0.3s ease both', animationDelay: `${idx * 35}ms` }}
                >
                  {/* User — name (inline editable) with the email underneath */}
                  <div className="min-w-0">
                    {editingName === u.id ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={nameValue}
                            onChange={(e) => setNameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveName(u.id)
                              if (e.key === 'Escape') setEditingName(null)
                            }}
                            placeholder="Full name"
                            maxLength={20}
                            className={`h-7 flex-1 min-w-0 rounded border bg-gray-800 px-2 text-xs text-gray-100 focus:outline-none ${
                              nameValue.trim().length > 15 ? 'border-red-500' : 'border-primary-500'
                            }`}
                          />
                          <button
                            onClick={() => saveName(u.id)}
                            disabled={nameValue.trim().length > 15}
                            title="Save"
                            className="shrink-0 text-emerald-400 hover:text-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setEditingName(null)} title="Cancel" className="shrink-0 text-gray-500 hover:text-gray-300">
                            <XIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {nameValue.trim().length > 15 && (
                          <p className="text-[10px] text-red-400">Max 15 characters ({nameValue.trim().length}/15)</p>
                        )}
                      </div>
                    ) : (
                      <div className="group/name flex items-center gap-1.5">
                        {isSelf && (
                          <Hint text={`You — signed in as ${u.role === 'admin' ? 'admin' : 'this user'}`} className="shrink-0">
                            <Crown aria-label="You" className="h-3.5 w-3.5 text-amber-400" />
                          </Hint>
                        )}
                        <span className={`truncate text-sm font-medium ${u.full_name ? 'text-gray-200' : 'italic text-gray-600'}`}>
                          {u.full_name || 'Not set'}
                        </span>
                        <button
                          onClick={() => { setEditingName(u.id); setNameValue(u.full_name ?? '') }}
                          title="Edit full name"
                          className="shrink-0 text-gray-600 opacity-0 transition-opacity group-hover/name:opacity-100 hover:text-primary-400"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <div className="group mt-0.5 flex items-center gap-1.5">
                      <p className="truncate text-xs text-gray-400" title={u.email}>{u.email}</p>
                      <button
                        title="Copy email"
                        onClick={() => copyEmail(u.id, u.email)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-gray-300"
                      >
                        {copiedEmail === u.id
                          ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                          : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                    {u.is_approved === false && (u.possible_duplicates?.length ?? 0) > 0 && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-amber-300" title={`Same name as: ${u.possible_duplicates!.join(', ')}`}>
                        <AlertTriangle className="h-3 w-3 shrink-0" /> Possible duplicate of {u.possible_duplicates![0]}{u.possible_duplicates!.length > 1 ? ` +${u.possible_duplicates!.length - 1}` : ''}
                      </p>
                    )}
                  </div>

                  {/* Date of Birth — inline editable by admin */}
                  <div className="min-w-0">
                    {editingDob === u.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          type="date"
                          value={dobValue}
                          onChange={(e) => setDobValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveDob(u.id)
                            if (e.key === 'Escape') setEditingDob(null)
                          }}
                          className="h-7 flex-1 min-w-0 rounded border border-primary-500 bg-gray-800 px-2 text-xs text-gray-100 focus:outline-none"
                        />
                        <button onClick={() => saveDob(u.id)} title="Save" className="shrink-0 text-emerald-400 hover:text-emerald-300">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setEditingDob(null)} title="Cancel" className="shrink-0 text-gray-500 hover:text-gray-300">
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="group/dob flex items-center gap-1.5">
                        {u.date_of_birth && (
                          <Cake className="h-3 w-3 shrink-0 text-pink-400" />
                        )}
                        <span className={`truncate text-xs ${u.date_of_birth ? 'text-gray-300' : 'italic text-gray-600'}`}>
                          {formatDobDisplay(u.date_of_birth)}
                        </span>
                        {u.date_of_birth && (
                          <span className="shrink-0 text-[10px] text-gray-600">
                            ({u.dob_update_count ?? 0}/2)
                          </span>
                        )}
                        <button
                          onClick={() => { setEditingDob(u.id); setDobValue(u.date_of_birth ?? '') }}
                          title="Edit date of birth"
                          className="shrink-0 text-gray-600 opacity-0 transition-opacity group-hover/dob:opacity-100 hover:text-pink-400"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Role badge */}
                  <div>
                    {u.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-400 ring-1 ring-amber-500/40">
                        <Crown className="h-3 w-3" style={{ animation: 'iconBreathe 3s ease-in-out infinite' }} /> Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-700/40 px-2.5 py-1 text-xs font-medium text-gray-400 ring-1 ring-gray-600/30">
                        <Users className="h-3 w-3" /> User
                      </span>
                    )}
                  </div>

                  {/* Tags — from GET /admin/tags; toggling one sets its permissions */}
                  <TagChips
                    tags={tagRegistry}
                    role={u.role}
                    granted={u.permissions ?? []}
                    disabled={isBusy}
                    onChange={(next) => savePermissions(u.id, next)}
                  />

                  {/* Approval / active status */}
                  <div>
                    {u.is_approved === false ? (
                      <span className="inline-flex flex-col">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 animate-pulse" />
                          Pending approval
                        </span>
                        <span className="text-[10px] text-gray-500" title={formatCreatedAt(u.created_at)}>since {formatCreatedAt(u.created_at).split(' ')[0]}</span>
                      </span>
                    ) : u.is_active ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-gray-600 animate-pulse" />
                        Inactive
                      </span>
                    )}
                  </div>

                  {/* Last Seen */}
                  <div className="flex items-center gap-2">
                    {presenceStatus(u.last_seen) === 'online' ? (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                      </span>
                    ) : presenceStatus(u.last_seen) === 'away' ? (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                    ) : (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-gray-600" />
                    )}
                    <span className={`text-xs font-medium ${
                      presenceStatus(u.last_seen) === 'online' ? 'text-emerald-400' :
                      presenceStatus(u.last_seen) === 'away'   ? 'text-amber-400'   :
                                                                  'text-gray-500'
                    }`}>
                      {presenceText(u.last_seen)}
                    </span>
                  </div>

                  {/* Created At */}
                  <p className="text-xs leading-snug text-gray-500" title={formatCreatedAt(u.created_at)}>
                    {formatCreatedAt(u.created_at).split(' ')[0]}
                    <span className="block text-[11px] text-gray-600">{formatCreatedAt(u.created_at).split(' ').slice(1).join(' ')}</span>
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5" {...(pagedUsers.indexOf(u) === 0 ? { 'data-tour': 'tour-user-actions' } : {})}>
                    {u.is_approved === false && (
                      <ActionBtn
                        title="Approve — let this account use the app"
                        icon={<BadgeCheck className="h-3.5 w-3.5" />}
                        disabled={isBusy}
                        onClick={() => setConfirm({ userId: u.id, email: u.email, action: 'approve' })}
                        color="emerald"
                      />
                    )}
                    <ActionBtn
                      title={u.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                      icon={u.role === 'admin' ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      disabled={isBusy || isSelf}
                      disabledReason={isSelf ? "You can't change your own role" : undefined}
                      onClick={() => setConfirm({ userId: u.id, email: u.email, action: 'role' })}
                      color={u.role === 'admin' ? 'amber' : 'indigo'}
                    />
                    <ActionBtn
                      title={u.is_active ? 'Deactivate' : 'Activate'}
                      icon={u.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                      disabled={isBusy || isSelf}
                      disabledReason={isSelf ? "You can't deactivate your own account" : undefined}
                      onClick={() => setConfirm({ userId: u.id, email: u.email, action: 'status' })}
                      color="gray"
                    />
                    <ActionBtn
                      title="Reset TOTP"
                      icon={<RefreshCw className="h-3.5 w-3.5" />}
                      disabled={isBusy}
                      onClick={() => setConfirm({ userId: u.id, email: u.email, action: 'totp' })}
                      color="gray"
                    />
                    <ActionBtn
                      title={u.is_approved === false ? 'Reject — delete this account (e.g. a duplicate)' : 'Delete user'}
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      disabled={isBusy || isSelf}
                      disabledReason={isSelf ? "You can't delete your own account" : undefined}
                      onClick={() => setConfirm({ userId: u.id, email: u.email, action: 'delete' })}
                      color="red"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination footer */}
        {!loading && filteredUsers.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-gray-800 px-5 py-3">
            <span className="text-xs text-gray-600">
              Page {page} of {totalPages} · showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>

              {/* Page number pills */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('…')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) =>
                  p === '…' ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-600">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`h-7 w-7 rounded-lg text-xs font-medium transition-colors ${
                        page === p
                          ? 'bg-primary-600 text-white'
                          : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Add User modal */}
      {showAddUser && (
        <AddUserModal
          onClose={() => setShowAddUser(false)}
          onCreated={(result) => {
            setShowAddUser(false)
            setCreatedUser(result)
            load()
          }}
        />
      )}

      {/* QR / success modal */}
      {createdUser && (
        <CreatedUserModal result={createdUser} onClose={() => setCreatedUser(null)} />
      )}

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          confirm={confirm}
          users={users}
          onConfirm={(role) => execAction(confirm.userId, confirm.action, role)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </DashboardLayout>
  )
}

function TabShimmer({ tab }: { tab: 'users' | 'history' | 'feedback' | 'rules' | 'announce' }) {
  if (tab === 'feedback') {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
              <Shimmer className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="space-y-1.5"><Shimmer className="h-5 w-10 rounded" /><Shimmer className="h-3 w-20 rounded" /></div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4 space-y-2">
          <Shimmer className="h-3 w-36 rounded" />
          <div className="space-y-2 pt-1">
            {[5,4,3,2,1].map((r) => (
              <div key={r} className="flex items-center gap-2">
                <Shimmer className="h-3 w-3 rounded" /><Shimmer className="h-3 w-3 rounded" />
                <Shimmer className="h-2 flex-1 rounded-full" /><Shimmer className="h-3 w-4 rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Shimmer className="h-9 w-64 rounded-lg" />
          <div className="flex items-center gap-2">
            <Shimmer className="h-4 w-10 rounded" />
            {[...Array(6)].map((_, i) => <Shimmer key={i} className="h-6 w-10 rounded-full" />)}
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
          <div className="grid grid-cols-[1fr_160px_100px_175px] gap-4 border-b border-gray-800 px-5 py-3">
            {['w-10','w-16','w-12','w-20'].map((w, i) => <Shimmer key={i} className={`h-3 ${w} rounded`} />)}
          </div>
          <div className="divide-y divide-gray-800">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[1fr_160px_100px_175px] items-center gap-4 px-5 py-4">
                <div className="space-y-1.5"><Shimmer className="h-3.5 w-40 rounded" /><Shimmer className="h-3 w-24 rounded" /></div>
                <Shimmer className="h-3 w-full rounded" /><Shimmer className="h-4 w-20 rounded" /><Shimmer className="h-3 w-32 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (tab === 'history') {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
              <Shimmer className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="space-y-1.5"><Shimmer className="h-5 w-10 rounded" /><Shimmer className="h-3 w-20 rounded" /></div>
            </div>
          ))}
        </div>
        <Shimmer className="h-10 w-full max-w-sm rounded-lg" />
        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_100px] gap-4 border-b border-gray-800 px-5 py-3">
            {['w-12','w-16','w-10','w-10','w-14'].map((w, i) => <Shimmer key={i} className={`h-3 ${w} rounded`} />)}
          </div>
          <div className="divide-y divide-gray-800">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_100px] items-center gap-4 px-5 py-3.5">
                <Shimmer className="h-3.5 w-48 rounded" /><Shimmer className="h-5 w-16 rounded-full" />
                <Shimmer className="h-3 w-12 rounded" /><Shimmer className="h-3 w-20 rounded" /><Shimmer className="h-7 w-20 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // users tab shimmer
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Shimmer className="h-9 w-64 rounded-lg" />
        <Shimmer className="h-9 w-40 rounded-lg" />
        <Shimmer className="h-9 w-36 rounded-lg" />
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_160px] gap-4 border-b border-gray-800 px-5 py-3">
          {['w-12','w-10','w-12','w-16','w-14'].map((w, i) => <Shimmer key={i} className={`h-3 ${w} rounded`} />)}
        </div>
        <div className="divide-y divide-gray-800">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_160px] items-center gap-4 px-5 py-4">
              <div className="space-y-1.5"><Shimmer className="h-3.5 w-48 rounded" /><Shimmer className="h-3 w-28 rounded" /></div>
              <Shimmer className="h-5 w-16 rounded-full" /><Shimmer className="h-5 w-14 rounded-full" />
              <Shimmer className="h-3 w-24 rounded" />
              <div className="flex gap-1.5">{Array.from({length:4}).map((_,j)=><Shimmer key={j} className="h-7 w-7 rounded-lg" />)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Admin: User Job History tab ──────────────────────────────────────────────

function HistoryStatusIcon({ status }: { status: JobStatus }) {
  if (status === 'DONE')    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
  if (status === 'FAILED')  return <XCircle      className="h-3.5 w-3.5 text-red-400" />
  if (status === 'STOPPED') return <Square       className="h-3.5 w-3.5 fill-current text-orange-400" />
  if (status === 'RUNNING') return <Loader2      className="h-3.5 w-3.5 text-blue-400 animate-spin" />
  return <Clock className="h-3.5 w-3.5 text-gray-500" />
}

function HistoryStatTile({ label, value, icon, color }: {
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
    <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 transition-colors hover:border-gray-700">
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

function UserHistoryTab({ users, refreshKey }: { users: AdminUser[]; refreshKey: number }) {
  const PAGE_SIZE = 10
  const STATUS_OPTIONS: Array<JobStatus | 'ALL'> = ['ALL', 'RUNNING', 'DONE', 'FAILED', 'STOPPED']
  const MODE_OPTIONS = ['ALL', 'sync', 'async'] as const

  const today        = toDateStr(new Date())
  const sevenDaysAgo = toDateStr(new Date(Date.now() - 7 * 86_400_000))

  const HIST_PRESETS = [
    { label: 'Today',         days: 0  },
    { label: 'Past 2 days',   days: 2  },
    { label: 'Past 3 days',   days: 3  },
    { label: 'Past 7 days',   days: 7  },
    { label: 'Past 30 days',  days: 30 },
    { label: 'Past 3 months', days: 90 },
  ] as const

  const INPUT_CLS =
    'rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-100 ' +
    'placeholder-gray-600 [color-scheme:dark] ' +
    'focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors'

  const [selectedEmail, setSelectedEmail] = useState('')
  const [allHistory, setAllHistory]       = useState<StoredAnalysis[]>([])
  const [histLoading, setHistLoading]     = useState(false)
  const [isRefreshing, setIsRefreshing]   = useState(false)
  const [histError, setHistError]         = useState('')
  const [expandedId, setExpandedId]       = useState<string | null>(null)
  const [verdictCache, setVerdictCache]   = useState<Record<string, RcaVerdict[] | 'loading' | 'error'>>({})
  const [page, setPage]                   = useState(1)
  const [copiedKey, setCopiedKey]         = useState<string | null>(null)
  useEffect(() => {
    if (!expandedId) return
    if (verdictCache[expandedId] !== undefined) return
    setVerdictCache((c) => ({ ...c, [expandedId]: 'loading' }))
    getAdminHistoryVerdicts(expandedId)
      .then((v) => setVerdictCache((c) => ({ ...c, [expandedId]: v })))
      .catch(() => setVerdictCache((c) => ({ ...c, [expandedId]: 'error' })))
  }, [expandedId])

  // Combobox state for user selector
  const [userSearch, setUserSearch]       = useState('')
  const [dropdownOpen, setDropdownOpen]   = useState(false)
  const [displayLabel, setDisplayLabel]   = useState('')
  const comboboxRef = useRef<HTMLDivElement>(null)

  const userOptions = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) =>
      u.email.toLowerCase().includes(q) ||
      (u.full_name?.toLowerCase().includes(q) ?? false)
    )
  }, [users, userSearch])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
        setUserSearch(selectedEmail ? displayLabel : '')
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [selectedEmail, displayLabel])

  function selectUser(u: AdminUser) {
    const label = u.full_name ? `${u.full_name} (${u.email})` : u.email
    setSelectedEmail(u.email)
    setUserSearch(label)
    setDisplayLabel(label)
    setDropdownOpen(false)
    loadHistory(u.email)
  }

  function clearUserSelection() {
    setSelectedEmail('')
    setUserSearch('')
    setDisplayLabel('')
    setAllHistory([])
    setDropdownOpen(false)
  }

  function handleCopy(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    })
  }

  // filters
  const [uuidInput, setUuidInput]     = useState('')
  const [uuidSearch, setUuidSearch]   = useState('')
  const [startDate, setStartDate]     = useState(sevenDaysAgo)
  const [endDate, setEndDate]         = useState(today)
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'ALL'>('ALL')
  const [modeFilter, setModeFilter]   = useState<'ALL' | 'sync' | 'async'>('ALL')
  const isSearching = uuidInput !== uuidSearch

  // sort — default desc matches backend order; toggle flips between asc and desc
  const [histSortDir, setHistSortDir] = useState<SortDir>('desc')
  function toggleHistSort() {
    setHistSortDir((prev) => prev === 'asc' ? 'desc' : 'asc')
    setPage(1)
  }
  const [isFiltering, setIsFiltering] = useState(false)
  const filterTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filterFirstRender = useRef(true)

  // debounce UUID search
  useEffect(() => {
    const t = setTimeout(() => setUuidSearch(uuidInput), 500)
    return () => clearTimeout(t)
  }, [uuidInput])

  // shimmer for date / status / mode changes (skip first mount)
  useEffect(() => {
    if (filterFirstRender.current) { filterFirstRender.current = false; return }
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current)
    setIsFiltering(true)
    filterTimerRef.current = setTimeout(() => setIsFiltering(false), 500)
    return () => { if (filterTimerRef.current) clearTimeout(filterTimerRef.current) }
  }, [startDate, endDate, statusFilter, modeFilter])

  // reset page on any filter change
  useEffect(() => { setPage(1) }, [uuidSearch, startDate, endDate, statusFilter, modeFilter, histSortDir])

  async function fetchHistory(email: string, start: string, end: string) {
    if (!email) return
    setHistLoading(true)
    setHistError('')
    try {
      const data = await getAdminHistory(email, start, end)
      setAllHistory(data)
    } catch {
      setHistError('Failed to load history.')
    } finally {
      setHistLoading(false)
    }
  }

  async function refreshHistory() {
    if (!selectedEmail) return
    setIsRefreshing(true)
    setHistError('')
    try {
      const [data] = await Promise.all([
        getAdminHistory(selectedEmail, startDate, endDate),
        new Promise<void>((r) => setTimeout(r, 500)),
      ])
      setAllHistory(data)
    } catch {
      setHistError('Failed to load history.')
    } finally {
      setIsRefreshing(false)
    }
  }

  async function loadHistory(email: string) {
    if (!email) return
    setAllHistory([])
    setHistLoading(true)
    setHistError('')
    setExpandedId(null)
    setVerdictCache({})
    setPage(1)
    setUuidInput(''); setUuidSearch('')
    setStartDate(sevenDaysAgo); setEndDate(today)
    setStatusFilter('ALL'); setModeFilter('ALL')
    try {
      const [data] = await Promise.all([
        getAdminHistory(email, sevenDaysAgo, today),
        new Promise<void>((r) => setTimeout(r, 500)),
      ])
      setAllHistory(data)
    } catch {
      setHistError('Failed to load history.')
    } finally {
      setHistLoading(false)
    }
  }

  // Re-fetch from DB when date range changes (user already selected)
  const dateRangeFirstRender = useRef(true)
  useEffect(() => {
    if (dateRangeFirstRender.current) { dateRangeFirstRender.current = false; return }
    if (!selectedEmail) return
    setExpandedId(null)
    setVerdictCache({})
    setPage(1)
    fetchHistory(selectedEmail, startDate, endDate)
  }, [startDate, endDate])

  useEffect(() => {
    if (refreshKey > 0 && selectedEmail) fetchHistory(selectedEmail, startDate, endDate)
  }, [refreshKey])

  const filtered = useMemo(() => {
    const list = allHistory.filter((entry) => {
      const day = entry.timestamp.split('T')[0]
      if (day < startDate || day > endDate) return false
      if (statusFilter !== 'ALL' && entry.status !== statusFilter) return false
      if (modeFilter !== 'ALL' && entry.mode !== modeFilter) return false
      if (uuidSearch.trim()) {
        const q = uuidSearch.trim().toLowerCase()
        const id = (entry.jobId ?? entry.runUuid ?? entry.id).toLowerCase()
        if (!id.includes(q)) return false
      }
      return true
    })
    return [...list].sort((a, b) => {
      const cmp = a.timestamp.localeCompare(b.timestamp)
      return histSortDir === 'asc' ? cmp : -cmp
    })
  }, [allHistory, uuidSearch, startDate, endDate, statusFilter, modeFilter, histSortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalDone   = allHistory.filter((e) => e.status === 'DONE').length
  const totalFailed = allHistory.filter((e) => e.status === 'FAILED').length

  const hasFilters =
    uuidInput.trim() !== '' || statusFilter !== 'ALL' || modeFilter !== 'ALL' ||
    startDate !== sevenDaysAgo || endDate !== today

  function clearFilters() {
    setUuidInput(''); setUuidSearch('')
    setStartDate(sevenDaysAgo); setEndDate(today)
    setStatusFilter('ALL'); setModeFilter('ALL')
  }

  return (
    <div className="space-y-5">

      {/* User selector */}
      <div className="relative rounded-xl border border-primary-500/15 bg-gradient-to-r from-gray-900 to-primary-950/20 p-4" data-tour="tour-admin-hist-user-select">
        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary-600/10 blur-2xl" />
        <label className="mb-2 block text-xs font-medium text-gray-400">Select User to Inspect</label>
        {users.length === 0 ? (
          <Shimmer className="h-10 w-full max-w-sm rounded-lg" />
        ) : (
          <div ref={comboboxRef} className="relative w-full max-w-sm">
            {/* Input */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => { setUserSearch(e.target.value); setDropdownOpen(true) }}
                onFocus={() => {
                  if (userSearch === displayLabel) setUserSearch('')
                  setDropdownOpen(true)
                }}
                placeholder="Type name or email to search…"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2.5 pl-9 pr-8 text-sm text-gray-100 placeholder-gray-600 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
              />
              {(userSearch || selectedEmail) && (
                <button
                  onClick={clearUserSelection}
                  title="Clear selection"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown */}
            {dropdownOpen && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-2xl">
                {userOptions.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-gray-500">
                    No users match &ldquo;{userSearch}&rdquo;
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto divide-y divide-gray-700/50">
                    {userOptions.map((u) => {
                      const isSelected = u.email === selectedEmail
                      return (
                        <button
                          key={u.email}
                          onClick={() => selectUser(u)}
                          className={`w-full px-4 py-2.5 text-left transition-colors hover:bg-gray-700/60 ${
                            isSelected ? 'bg-primary-600/20' : ''
                          }`}
                        >
                          {u.full_name && (
                            <p className={`text-sm font-medium ${isSelected ? 'text-primary-300' : 'text-gray-200'}`}>
                              {u.full_name}
                            </p>
                          )}
                          <p className={`font-mono text-xs ${
                            u.full_name ? 'text-gray-500' : isSelected ? 'text-primary-300 text-sm font-medium' : 'text-gray-200 text-sm'
                          }`}>
                            {u.email}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedEmail && (
        (histLoading && allHistory.length === 0) ? (
          <UserHistorySkeletonView />
        ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-tour="tour-admin-hist-stats" style={{ animation: 'fadeSlideUp 0.35s ease both' }}>
            {isRefreshing ? (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex items-center gap-3">
                    <Shimmer className="h-9 w-9 shrink-0 rounded-lg" />
                    <div className="space-y-1.5 flex-1">
                      <Shimmer className="h-5 w-10 rounded" />
                      <Shimmer className="h-3 w-20 rounded" />
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <>
                <HistoryStatTile label="Total Analyses" value={allHistory.length} icon={<BarChart3 className="h-4 w-4" />}    color="indigo"  />
                <HistoryStatTile label="Completed"      value={totalDone}         icon={<CheckCircle2 className="h-4 w-4" />} color="emerald" />
                <HistoryStatTile label="Failed"         value={totalFailed}       icon={<XCircle className="h-4 w-4" />}      color="red"     />
                <HistoryStatTile label="Showing"        value={filtered.length}   icon={<Clock className="h-4 w-4" />}        color="amber"   />
              </>
            )}
          </div>

          {/* Filter bar */}
          {!histLoading && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4" data-tour="tour-admin-hist-filters">

              {/* Date presets */}
              <div className="mb-3 flex flex-wrap gap-1.5">
                {HIST_PRESETS.map(({ label, days }) => {
                  const ps = toDateStr(new Date(Date.now() - days * 86_400_000))
                  const active = startDate === ps && endDate === today
                  return (
                    <button
                      key={label}
                      onClick={() => { setStartDate(ps); setEndDate(today) }}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? 'border-primary-500/50 bg-primary-500/15 text-primary-400'
                          : 'border-gray-700 bg-gray-800/60 text-gray-500 hover:border-gray-600 hover:text-gray-300'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
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
                    <XIcon className="h-3 w-3" /> Clear
                  </button>
                )}

                <button
                  onClick={refreshHistory}
                  disabled={isRefreshing}
                  className="ml-auto flex items-center gap-1.5 self-end rounded-lg border border-primary-500/30 bg-primary-500/10 px-3 py-2 text-xs font-medium text-primary-400 transition-colors hover:border-primary-500/50 hover:bg-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          {histLoading || isRefreshing ? (
            <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
              <div className="divide-y divide-gray-800">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-[20px_130px_90px_1fr_175px_80px_120px] items-center gap-4 px-5 py-3.5">
                    <div /><Shimmer className="h-5 w-20 rounded-full" /><Shimmer className="h-4 w-14 rounded" />
                    <Shimmer className="h-3 w-full rounded" /><Shimmer className="h-3 w-32 rounded" /><Shimmer className="h-3 w-10 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ) : histError ? (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {histError}
            </div>
          ) : filtered.length === 0 && !isSearching && !isFiltering ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 bg-gray-900/50 py-16 gap-3">
              <Clock className="h-10 w-10 text-gray-700" />
              <p className="text-sm font-medium text-gray-400">
                {hasFilters ? 'No analyses match the current filters.' : 'No analysis history for this user.'}
              </p>
              {hasFilters && (
                <button onClick={clearFilters}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200">
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900" data-tour="tour-admin-hist-table">
              <div className="grid grid-cols-[20px_130px_90px_1fr_175px_80px_120px] gap-4 border-b border-gray-800 bg-gray-800/40 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <span />
                <span>Status</span>
                <span>Mode</span>
                <span>Run / Job ID</span>
                <SortHeader
                  label="Created At"
                  field="created_at"
                  active="created_at"
                  dir={histSortDir}
                  onToggle={toggleHistSort}
                />
                <span>Verdicts</span>
                <span>Reports</span>
              </div>

              <div className="divide-y divide-gray-800">
                {(isSearching || isFiltering)
                  ? Array.from({ length: Math.min(PAGE_SIZE, 5) }).map((_, i) => (
                      <div key={i} className="grid grid-cols-[20px_130px_90px_1fr_175px_80px_120px] items-center gap-4 px-5 py-3.5">
                        <div /><Shimmer className="h-5 w-20 rounded-full" /><Shimmer className="h-4 w-14 rounded" />
                        <Shimmer className="h-3 w-full rounded" /><Shimmer className="h-3 w-32 rounded" /><Shimmer className="h-3 w-10 rounded" /><Shimmer className="h-7 w-20 rounded-lg" />
                      </div>
                    ))
                  : paged.map((entry, hIdx) => {
                      const displayId = entry.jobId ?? entry.runUuid ?? entry.id
                      const isExpanded = expandedId === entry.id
                      const hasReport  = !!entry.reportUrl
                      return (
                        <div key={entry.id} style={{ animation: 'fadeSlideUp 0.25s ease both', animationDelay: `${hIdx * 30}ms` }}>
                          <div
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest('button, a')) return
                              setExpandedId(isExpanded ? null : entry.id)
                            }}
                            className={`grid grid-cols-[20px_130px_90px_1fr_175px_80px_120px] cursor-pointer items-center gap-4 px-5 py-3.5 transition-colors ${
                              isExpanded
                                ? hasReport ? 'bg-purple-900/20' : 'bg-gray-800/60'
                                : hasReport ? 'hover:bg-purple-500/10 border-l-2 border-purple-500/50' : 'hover:bg-primary-500/5'
                            }`}
                          >
                            <div className="text-gray-600">
                              {isExpanded
                                ? <ChevronDown  className={`h-3.5 w-3.5 ${hasReport ? 'text-purple-400' : 'text-primary-400'}`} />
                                : <ChevronRight className="h-3.5 w-3.5" />}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <HistoryStatusIcon status={entry.status} />
                              <Badge type="status" value={entry.status} />
                            </div>

                            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                              {entry.mode === 'sync'
                                ? <><Zap   className="h-3.5 w-3.5 text-primary-400" /> Sync</>
                                : <><Timer className="h-3.5 w-3.5 text-amber-400"  /> Async</>}
                            </div>

                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <div className="group flex items-center gap-1.5 min-w-0">
                                  <p className="truncate font-mono text-xs text-gray-300" title={displayId}>{displayId}</p>
                                  <button
                                    title="Copy ID"
                                    onClick={() => handleCopy(`${entry.id}-id`, displayId)}
                                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-gray-300"
                                  >
                                    {copiedKey === `${entry.id}-id`
                                      ? <Check className="h-3 w-3 text-emerald-400" />
                                      : <Copy className="h-3 w-3" />}
                                  </button>
                                </div>
                                {hasReport && (
                                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold text-purple-400 ring-1 ring-purple-500/30">
                                    <FileText className="h-2.5 w-2.5" /> Report Shared
                                  </span>
                                )}
                              </div>
                              {entry.executionName && (
                                <div className="group flex items-center gap-1.5">
                                  <p className="truncate text-xs text-gray-500" title={entry.executionName}>{entry.executionName}</p>
                                  <button
                                    title="Copy name"
                                    onClick={() => handleCopy(`${entry.id}-name`, entry.executionName!)}
                                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-gray-300"
                                  >
                                    {copiedKey === `${entry.id}-name`
                                      ? <Check className="h-3 w-3 text-emerald-400" />
                                      : <Copy className="h-3 w-3" />}
                                  </button>
                                </div>
                              )}
                              {hasReport && entry.reportCreatedBy && (
                                <p className="text-[10px] text-purple-400/60 truncate">
                                  Shared by {entry.reportCreatedBy}
                                  {entry.reportCreatedAt && (
                                    <> · {entry.reportCreatedAt}</>
                                  )}
                                </p>
                              )}
                            </div>

                            <p className="text-xs text-gray-500">{formatCreatedAt(entry.timestamp)}</p>

                            {/* Verdicts count */}
                            <p className="text-xs font-medium text-gray-300">
                              {entry.verdictCount}
                              {fmtJobDuration(entry.durationSecs) && (
                                <span className="ml-1.5 font-normal text-gray-500">
                                  ({fmtJobDuration(entry.durationSecs)})
                                </span>
                              )}
                            </p>

                            {/* Reports column */}
                            <div className="flex items-center gap-1.5">
                              {entry.status === 'DONE' && entry.verdictCount > 0 ? (
                                <button
                                  title="Open admin report"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    window.open(`/api/v1/rca/admin/reports/view/${entry.id}.html`, '_blank', 'noopener,noreferrer')
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20 hover:border-amber-500/50"
                                >
                                  <FileText className="h-3 w-3" /> View
                                </button>
                              ) : (
                                <span className="text-xs text-gray-700">—</span>
                              )}
                            </div>
                          </div>

                          {isExpanded && (() => {
                            const cached = verdictCache[entry.id]
                            if (cached === 'loading' || cached === undefined) {
                              return (
                                <div className="border-t border-gray-800/60 bg-gray-950/60 px-8 py-5 space-y-2.5">
                                  {[1, 2, 3].map((i) => (
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
                            return (
                              <ReadOnlyVerdictExpansion
                                verdicts={cached}
                                status={entry.status}
                                cancelReason={entry.cancelReason}
                              />
                            )
                          })()}
                        </div>
                      )
                    })}
              </div>

              {!isSearching && !isFiltering && totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-800 px-5 py-3">
                  <span className="text-xs text-gray-600">
                    Page {page} of {totalPages} · showing{' '}
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
                        acc.push(p); return acc
                      }, [])
                      .map((p, i) =>
                        p === '…'
                          ? <span key={`e-${i}`} className="px-1 text-xs text-gray-600">…</span>
                          : <button key={p} onClick={() => setPage(p as number)}
                              className={`h-7 w-7 rounded-lg text-xs font-medium transition-colors ${
                                page === p ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                              }`}>{p}</button>
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
        </>
        )
      )}
    </div>
  )
}

function UserHistorySkeletonView() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <Shimmer className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="space-y-1.5">
              <Shimmer className="h-5 w-10 rounded" />
              <Shimmer className="h-3 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => <Shimmer key={i} className="h-7 w-20 rounded-full" />)}
        </div>
        <div className="flex flex-wrap gap-3">
          <Shimmer className="h-9 w-52 rounded-lg" />
          <Shimmer className="h-9 w-36 rounded-lg" />
          <Shimmer className="h-9 w-36 rounded-lg" />
          <Shimmer className="h-9 w-48 rounded-lg" />
          <Shimmer className="h-9 w-32 rounded-lg" />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <div className="grid grid-cols-[20px_130px_90px_1fr_175px_80px_120px] gap-4 border-b border-gray-800 px-5 py-3">
          {['w-0', 'w-12', 'w-10', 'w-16', 'w-20', 'w-10', 'w-14'].map((w, i) => (
            <Shimmer key={i} className={`h-3 ${w} rounded`} />
          ))}
        </div>
        <div className="divide-y divide-gray-800">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[20px_130px_90px_1fr_175px_80px_120px] items-center gap-4 px-5 py-3.5">
              <div />
              <Shimmer className="h-5 w-20 rounded-full" />
              <Shimmer className="h-4 w-14 rounded" />
              <Shimmer className="h-3 w-full rounded" />
              <Shimmer className="h-3 w-32 rounded" />
              <Shimmer className="h-3 w-10 rounded" />
              <Shimmer className="h-7 w-16 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ReadOnlyVerdictExpansion({
  verdicts,
  status,
  cancelReason,
}: {
  verdicts: RcaVerdict[]
  status?: string
  cancelReason?: string | null
}) {
  const [filter, setFilter] = useState('ALL')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isFiltering, setIsFiltering] = useState(false)

  function handleFilter(cat: string) {
    if (cat === filter) return
    if (timerRef.current) clearTimeout(timerRef.current)
    setIsFiltering(true)
    setFilter(cat)
    timerRef.current = setTimeout(() => setIsFiltering(false), 250)
  }

  if (verdicts.length === 0) {
    const isStopped = status === 'STOPPED'
    const isFailed  = status === 'FAILED'
    return (
      <div className="border-t border-gray-800/60 bg-gray-950/60 px-8 py-4 space-y-1">
        {isStopped ? (
          <>
            <p className="text-xs font-medium text-orange-400">Analysis stopped</p>
            <CopyText text={cancelReason ?? 'Cancelled by user'} className="text-xs text-gray-400" />
          </>
        ) : isFailed && isVpnError(cancelReason) ? (
          <VpnErrorTerminal />
        ) : isFailed ? (
          <>
            <p className="text-xs font-medium text-red-400">Job did not complete</p>
            <CopyText text={cancelReason ?? 'Analysis could not be completed — the execution may still be running or was not in a Done state. Check InspectorWeb and retry once the run has finished.'} className="text-xs text-gray-400" />
          </>
        ) : (
          <p className="text-xs text-gray-600">No verdict details stored for this entry.</p>
        )}
      </div>
    )
  }

  const categories = ['ALL', ...Array.from(new Set(verdicts.map((v) => v.category)))]
  const visible = filter === 'ALL' ? verdicts : verdicts.filter((v) => v.category === filter)

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
              onClick={() => handleFilter(cat)}
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
                {cat === 'ALL' ? verdicts.length : verdicts.filter((v) => v.category === cat).length}
              </span>
            </button>
          )
        })}
      </div>

      {/* Verdict cards */}
      {isFiltering ? (
        <div className="space-y-2.5">
          {Array.from({ length: Math.min(visible.length || 3, 4) }).map((_, i) => (
            <div key={i} className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 space-y-2">
              <div className="flex gap-2"><Shimmer className="h-5 w-24 rounded-full" /><Shimmer className="h-5 w-20 rounded-full" /></div>
              <Shimmer className="h-3 w-full rounded" /><Shimmer className="h-3 w-3/4 rounded" />
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
                  <a href={v.jiraUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-0.5 text-xs font-medium text-cyan-400 transition-colors hover:bg-cyan-400/20">
                    <ExternalLink className="h-3 w-3" />{v.matchedJiraTicket ?? 'Jira Issue'}
                  </a>
                )}
                {v.reportUrl && (
                  <a href={v.reportUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-full border border-primary-400/25 bg-primary-400/10 px-2.5 py-0.5 text-xs font-medium text-primary-400 transition-colors hover:bg-primary-400/20">
                    <FileText className="h-3 w-3" />Report
                  </a>
                )}
              </div>
              <VerdictExplanation text={v.explanation} />
              <VerdictFix explanation={v.explanation} category={v.category} errors={v.failureErrors} reasons={v.stepReasons} />
              <FailedReasonsList errors={v.failureErrors} reasons={v.stepReasons} />
              <div className="mt-2 flex items-center gap-4">
                {v.matchedRule ? (
                  <span className="text-xs text-gray-500 truncate">Rule: <span className="font-mono text-gray-400">{v.matchedRule}</span></span>
                ) : (
                  <span className="font-mono text-xs text-gray-700 truncate">{v.testCaseRunId}</span>
                )}
                <div className="ml-auto w-28 shrink-0">
                  <ConfidenceBar value={v.confidence} />
                </div>
              </div>
              <VerdictFeedback matchedRule={v.matchedRule} runId={v.testCaseRunId} />
            </div>
          ))}</div>}</VerdictsByRun>
        </div>
      )}
    </div>
  )
}

// ─── VerdictFeedback (verdict card thumbs-up/down) ───────────────────────────

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

// ─── Rules Tab ────────────────────────────────────────────────────────────────

function RulesTab() {
  const [stats, setStats] = useState<RuleStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // input values stored as percentage strings ("0"–"100")
  const [overrideInput, setOverrideInput] = useState<Record<string, string>>({})
  const [inputError, setInputError] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)

  function showToast(msg: string) {
    setToastMsg(msg)
    setToastVisible(true)
    setTimeout(() => {
      setToastVisible(false)
      setTimeout(() => setToastMsg(''), 350)
    }, 3500)
  }

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const data = await getRuleStats()
      setStats(data)
      const pre: Record<string, string> = {}
      for (const row of data) {
        if (row.overrideConfidence !== null) {
          pre[row.ruleName] = String(Math.round(row.overrideConfidence * 100))
        }
      }
      setOverrideInput(pre)
    } catch {
      setError('Failed to load rule stats.')
    } finally {
      if (isRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function applyOverride(ruleName: string, clear: boolean) {
    if (clear) {
      const currentRow = stats.find((s) => s.ruleName === ruleName)
      const fromPct = currentRow?.overrideConfidence !== null
        ? Math.round((currentRow?.overrideConfidence ?? 0) * 100)
        : null
      const toPct = Math.round((currentRow?.staticConfidence ?? 0) * 100)
      setSaving((s) => ({ ...s, [ruleName]: true }))
      try {
        await overrideRuleConfidence(ruleName, null)
        setOverrideInput((o) => { const n = { ...o }; delete n[ruleName]; return n })
        setInputError((e) => { const n = { ...e }; delete n[ruleName]; return n })
        showToast(
          fromPct !== null
            ? `Override reset — ${ruleName}: ${fromPct}% → ${toPct}% (static confidence restored)`
            : `Override reset — ${ruleName} → ${toPct}% (static confidence restored)`
        )
        await load(true)
      } catch { /* silent */ } finally {
        setSaving((s) => ({ ...s, [ruleName]: false }))
      }
      return
    }

    const raw = (overrideInput[ruleName] ?? '').trim()
    const pct = parseFloat(raw)
    if (raw === '' || isNaN(pct) || pct < 0 || pct > 100) {
      setInputError((e) => ({ ...e, [ruleName]: 'Enter a value between 0 and 100' }))
      return
    }
    setInputError((e) => { const n = { ...e }; delete n[ruleName]; return n })

    const override = parseFloat((pct / 100).toFixed(4))
    setSaving((s) => ({ ...s, [ruleName]: true }))
    try {
      await overrideRuleConfidence(ruleName, override)
      setSaved((s) => ({ ...s, [ruleName]: true }))
      setTimeout(() => setSaved((s) => ({ ...s, [ruleName]: false })), 2000)
      showToast(`Confidence rule set successfully — ${ruleName} → ${pct}%`)
      await load(true)
    } catch {
      setInputError((e) => ({ ...e, [ruleName]: 'Save failed — try again' }))
    } finally {
      setSaving((s) => ({ ...s, [ruleName]: false }))
    }
  }

  if (loading) return (
    <div className="space-y-2 mt-4">
      {[...Array(6)].map((_, i) => <Shimmer key={i} className="h-12 w-full rounded-lg" />)}
    </div>
  )

  if (error) return <p className="mt-4 text-sm text-red-400">{error}</p>

  if (stats.length === 0) return (
    <div className="mt-10 text-center text-sm text-gray-600">
      No rule data yet — run an analysis first so rules appear here.
    </div>
  )

  return (
    <div className="mt-4 space-y-2">
      {/* Toast */}
      <div
        className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-gray-900 px-4 py-3 shadow-2xl transition-transform duration-300 ease-in-out ${
          toastVisible ? 'translate-x-0' : 'translate-x-[calc(100%+1.5rem)]'
        }`}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        </div>
        <p className="whitespace-nowrap text-sm font-medium text-gray-100">{toastMsg}</p>
      </div>

      <p className="text-xs text-gray-500 mb-3" data-tour="tour-rules-description">
        Confidence auto-adjusts from thumbs-up/down feedback once ≥ 10 marks are collected.
        Override forces an exact value regardless of feedback. Enter as a percentage (0–100).
      </p>
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden" style={{ animation: 'fadeSlideUp 0.35s ease both' }} data-tour="tour-rules-table">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-800/40 text-gray-500">
              <th className="px-4 py-2.5 text-left font-medium">Rule</th>
              <th className="px-3 py-2.5 text-center font-medium">Hits</th>
              <th className="px-3 py-2.5 text-center font-medium">
                <ThumbsUp className="h-3 w-3 inline mr-0.5 text-emerald-500" />
              </th>
              <th className="px-3 py-2.5 text-center font-medium">
                <ThumbsDown className="h-3 w-3 inline mr-0.5 text-red-500" />
              </th>
              <th className="px-3 py-2.5 text-center font-medium">Static</th>
              <th className="px-3 py-2.5 text-center font-medium">Effective</th>
              <th className="px-4 py-2.5 text-left font-medium">Override (%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {refreshing ? (
              Array.from({ length: stats.length || 4 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><Shimmer className="h-3 w-40 rounded" /></td>
                  <td className="px-3 py-3 text-center"><Shimmer className="h-3 w-6 rounded mx-auto" /></td>
                  <td className="px-3 py-3 text-center"><Shimmer className="h-3 w-6 rounded mx-auto" /></td>
                  <td className="px-3 py-3 text-center"><Shimmer className="h-3 w-6 rounded mx-auto" /></td>
                  <td className="px-3 py-3 text-center"><Shimmer className="h-3 w-10 rounded mx-auto" /></td>
                  <td className="px-3 py-3 text-center"><Shimmer className="h-3 w-12 rounded mx-auto" /></td>
                  <td className="px-4 py-3"><Shimmer className="h-6 w-36 rounded" /></td>
                </tr>
              ))
            ) : stats.map((row, rIdx) => {
              const total = row.confirmed + row.disputed
              const accuracy = total > 0 ? Math.round((row.confirmed / total) * 100) : null
              const hasOverride = row.overrideConfidence !== null
              const inp = overrideInput[row.ruleName] ?? ''
              const err = inputError[row.ruleName]
              return (
                <tr key={row.ruleName} className="hover:bg-primary-500/5 transition-colors align-top"
                    style={{ animation: 'fadeSlideUp 0.25s ease both', animationDelay: `${rIdx * 25}ms` }}>
                  <td className="px-4 py-3 font-mono text-gray-300 max-w-[220px] truncate" title={row.ruleName}>
                    {row.ruleName}
                  </td>
                  <td className="px-3 py-3 text-center text-gray-400">{row.hits}</td>
                  <td className="px-3 py-3 text-center text-emerald-400">{row.confirmed}</td>
                  <td className="px-3 py-3 text-center text-red-400">{row.disputed}</td>
                  <td className="px-3 py-3 text-center text-gray-500">
                    {Math.round(row.staticConfidence * 100)}%
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`font-semibold ${hasOverride ? 'text-amber-400' : accuracy !== null ? 'text-sky-400' : 'text-gray-300'}`}>
                      {Math.round(row.effectiveConfidence * 100)}%
                    </span>
                    {accuracy !== null && !hasOverride && (
                      <span className="ml-1 text-gray-600">({accuracy}% acc)</span>
                    )}
                    {hasOverride && <span className="ml-1 text-amber-500/60 text-[10px]">override</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            placeholder="e.g. 90"
                            value={inp}
                            onChange={(e) => {
                              setOverrideInput((o) => ({ ...o, [row.ruleName]: e.target.value }))
                              setInputError((er) => { const n = { ...er }; delete n[row.ruleName]; return n })
                            }}
                            className={`w-24 rounded border px-2 py-1 pr-6 text-xs text-gray-200 bg-gray-800 focus:outline-none focus:ring-1 transition-colors ${
                              err ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-700 focus:border-primary-500 focus:ring-primary-500'
                            }`}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 pointer-events-none">%</span>
                        </div>
                        <button
                          onClick={() => applyOverride(row.ruleName, false)}
                          disabled={saving[row.ruleName]}
                          className="rounded bg-primary-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-primary-500 disabled:opacity-50 min-w-[32px] flex items-center justify-center"
                        >
                          {saving[row.ruleName] ? (
                            <span className="h-3 w-3 border border-white/40 border-t-white rounded-full animate-spin inline-block" />
                          ) : saved[row.ruleName] ? (
                            <Check className="h-3 w-3" />
                          ) : 'Set'}
                        </button>
                        {hasOverride && (
                          <button
                            onClick={() => applyOverride(row.ruleName, true)}
                            disabled={saving[row.ruleName]}
                            title="Clear override — revert to feedback-computed or static"
                            className="rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-500 hover:border-gray-500 hover:text-gray-300 disabled:opacity-50"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      {err && <p className="text-[10px] text-red-400">{err}</p>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Feedback Tab (admin-only) ────────────────────────────────────────────────

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-3.5 w-3.5 ${s <= rating ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-gray-700'}`}
        />
      ))}
    </div>
  )
}

function FeedbackTab({ refreshKey }: { refreshKey: number }) {
  const [entries, setEntries]     = useState<FeedbackEntry[]>([])
  const [stats, setStats]         = useState<FeedbackStats | null>(null)
  const [loading, setLoading]     = useState(true)
  const [isFiltering, setIsFiltering] = useState(false)
  const [error, setError]         = useState('')
  const [ratingFilter, setRatingFilter] = useState<number | 'ALL'>('ALL')
  const [userSearch, setUserSearch]     = useState('')
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc')
  const [page, setPage]           = useState(1)
  const PAGE_SIZE = 10
  const filterTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filterFirstRender = useRef(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [data, s] = await Promise.all([listFeedback(), getFeedbackStats()])
        setEntries(data)
        setStats(s)
      } catch {
        setError('Failed to load feedback.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [refreshKey])

  // New feedback shows up without a reload
  useLivePoll(async () => {
    try {
      const [data, s] = await Promise.all([listFeedback(), getFeedbackStats()])
      setEntries(data)
      setStats(s)
    } catch { /* keep what's shown */ }
  }, 30_000)

  // Shimmer briefly whenever filters or sort change (skip initial mount)
  useEffect(() => {
    if (filterFirstRender.current) { filterFirstRender.current = false; return }
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current)
    setIsFiltering(true)
    setPage(1)
    filterTimerRef.current = setTimeout(() => setIsFiltering(false), 400)
    return () => { if (filterTimerRef.current) clearTimeout(filterTimerRef.current) }
  }, [ratingFilter, userSearch, sortDir])

  const filtered = useMemo(() => {
    const result = entries.filter((e) => {
      if (ratingFilter !== 'ALL' && e.rating !== ratingFilter) return false
      if (userSearch.trim()) {
        const q = userSearch.trim().toLowerCase()
        if (!e.user_email.toLowerCase().includes(q) && !(e.full_name ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
    result.sort((a, b) => {
      const cmp = a.created_at.localeCompare(b.created_at)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [entries, ratingFilter, userSearch, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const RATING_COLORS: Record<number, string> = {
    1: 'bg-red-500/15 text-red-400 border-red-500/30',
    2: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    3: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    4: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    5: 'bg-primary-500/15 text-primary-400 border-primary-500/30',
  }

  return (
    <div className="space-y-5">

      {/* Stats cards */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
              <Shimmer className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="space-y-1.5">
                <Shimmer className="h-5 w-10 rounded" />
                <Shimmer className="h-3 w-20 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-tour="tour-admin-fb-stats" style={{ animation: 'fadeSlideUp 0.35s ease both' }}>
          <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-amber-500/10 text-amber-400 border-amber-500/20">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-100">{stats.total}</p>
              <p className="text-xs text-gray-500">Total responses</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-primary-500/10 text-primary-400 border-primary-500/20">
              <Star className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-100">{stats.average_rating.toFixed(1)}</p>
              <p className="text-xs text-gray-500">Average rating</p>
            </div>
          </div>
          {[5, 1].map((r) => (
            <div key={r} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${RATING_COLORS[r]}`}>
                <span className="text-sm font-bold">{r}★</span>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-100">{stats.by_rating[r] ?? 0}</p>
                <p className="text-xs text-gray-500">{r === 5 ? 'Excellent' : 'Poor'}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Rating distribution bar */}
      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4 space-y-2">
          <Shimmer className="h-3 w-36 rounded" />
          <div className="space-y-2 pt-1">
            {[5, 4, 3, 2, 1].map((r) => (
              <div key={r} className="flex items-center gap-2">
                <Shimmer className="h-3 w-3 rounded" />
                <Shimmer className="h-3 w-3 rounded" />
                <Shimmer className="h-2 flex-1 rounded-full" />
                <Shimmer className="h-3 w-4 rounded" />
              </div>
            ))}
          </div>
        </div>
      ) : stats && stats.total > 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4 space-y-2" data-tour="tour-admin-fb-distribution">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Rating Distribution</p>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((r) => {
              const count = stats.by_rating[r] ?? 0
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0
              return (
                <div key={r} className="flex items-center gap-2">
                  <span className="w-3 shrink-0 text-right text-xs text-gray-500">{r}</span>
                  <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                  <div className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-xs text-gray-600">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Filters row */}
      {loading ? (
        <div className="flex flex-wrap items-center gap-3">
          <Shimmer className="h-9 w-64 rounded-lg" />
          <div className="flex items-center gap-2">
            <Shimmer className="h-4 w-10 rounded" />
            {[...Array(6)].map((_, i) => <Shimmer key={i} className="h-6 w-10 rounded-full" />)}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3" data-tour="tour-admin-fb-filters">

          {/* User search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search by email or name…"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-8 text-sm text-gray-100 placeholder-gray-600 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
            />
            {userSearch && (
              <button
                onClick={() => setUserSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Rating pills */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Rating:</span>
            {(['ALL', 5, 4, 3, 2, 1] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRatingFilter(r)}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  ratingFilter === r
                    ? r === 'ALL'
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : `${RATING_COLORS[r as number]} ring-1 ring-current`
                    : 'border-gray-700 bg-gray-800/60 text-gray-500 hover:border-gray-600 hover:text-gray-300'
                }`}
              >
                {r === 'ALL' ? 'All' : <>{r}<Star className="h-2.5 w-2.5 fill-current" /></>}
              </button>
            ))}
            {ratingFilter !== 'ALL' && (
              <button
                onClick={() => setRatingFilter('ALL')}
                className="text-xs text-gray-600 hover:text-gray-400 underline-offset-2 hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          <span className="ml-auto text-xs text-gray-600">{filtered.length} response{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900" data-tour="tour-admin-fb-table">
        {/* Header */}
        <div className="grid grid-cols-[1fr_160px_100px_175px] gap-4 border-b border-gray-800 bg-gray-800/40 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          <span>User</span>
          <span>Comment</span>
          <span>Rating</span>
          <button
            onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
            className="flex items-center gap-1.5 text-primary-400 hover:text-primary-300 transition-colors"
          >
            Submitted At
            {sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            <span className="text-[10px] font-bold tracking-widest opacity-70">
              {sortDir === 'asc' ? 'ASC' : 'DESC'}
            </span>
          </button>
        </div>

        {loading || isFiltering ? (
          <div className="divide-y divide-gray-800">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[1fr_160px_100px_175px] items-center gap-4 px-5 py-4">
                <div className="space-y-1.5">
                  <Shimmer className="h-3.5 w-40 rounded" />
                  <Shimmer className="h-3 w-24 rounded" />
                </div>
                <Shimmer className="h-3 w-full rounded" />
                <Shimmer className="h-4 w-20 rounded" />
                <Shimmer className="h-3 w-32 rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-600">
            <MessageSquare className="h-10 w-10" />
            <p className="text-sm">{entries.length === 0 ? 'No feedback submitted yet.' : 'No responses match this filter.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {paged.map((entry, fIdx) => (
              <div key={entry.id}
                   className="grid grid-cols-[1fr_160px_100px_175px] items-start gap-4 px-5 py-4 hover:bg-primary-500/5 transition-colors"
                   style={{ animation: 'fadeSlideUp 0.25s ease both', animationDelay: `${fIdx * 30}ms` }}>
                {/* User */}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-200">{entry.user_email}</p>
                  {entry.full_name && (
                    <p className="truncate text-xs text-gray-500">{entry.full_name}</p>
                  )}
                </div>
                {/* Comment */}
                <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed">
                  {entry.comment || <span className="italic text-gray-600">No comment</span>}
                </p>
                {/* Rating */}
                <div className="flex flex-col gap-1">
                  <StarRow rating={entry.rating} />
                  <span className={`inline-block self-start rounded-full border px-2 py-0.5 text-[10px] font-semibold ${RATING_COLORS[entry.rating]}`}>
                    {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][entry.rating]}
                  </span>
                </div>
                {/* Date */}
                <p className="text-xs text-gray-500">{formatCreatedAt(entry.created_at)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-800 px-5 py-3">
            <span className="text-xs text-gray-600">
              Page {page} of {totalPages} · {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:border-gray-600 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('…')
                  acc.push(p); return acc
                }, [])
                .map((p, i) => p === '…'
                  ? <span key={`e-${i}`} className="px-1 text-xs text-gray-600">…</span>
                  : <button key={p} onClick={() => setPage(p as number)}
                      className={`h-7 w-7 rounded-lg text-xs font-medium transition-colors ${page === p ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}>
                      {p}
                    </button>
                )}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:border-gray-600 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ActionBtn({
  title,
  icon,
  disabled,
  disabledReason,
  onClick,
  color,
}: {
  title: string
  icon: React.ReactNode
  disabled: boolean
  disabledReason?: string
  onClick: () => void
  color: 'indigo' | 'amber' | 'red' | 'gray' | 'emerald'
}) {
  const colors = {
    emerald: 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15 hover:text-emerald-200',
    indigo: 'hover:bg-primary-500/15 hover:text-primary-400 hover:border-primary-500/30',
    amber:  'hover:bg-amber-500/15  hover:text-amber-400  hover:border-amber-500/30',
    red:    'hover:bg-red-500/15    hover:text-red-400    hover:border-red-500/30',
    gray:   'hover:bg-gray-700      hover:text-gray-200   hover:border-gray-600',
  }
  const tip = disabled && disabledReason ? disabledReason : title
  // Custom tooltip: native title is slow and never fires on disabled buttons.
  // The disabled button ignores pointer events so the wrapper still gets :hover.
  return (
    <div className={`relative inline-block group/tip ${disabled ? 'cursor-not-allowed' : ''}`}>
      <button
        aria-label={tip}
        disabled={disabled}
        onClick={onClick}
        className={`rounded-lg border border-transparent p-1.5 text-gray-500 transition-all disabled:pointer-events-none disabled:opacity-30 ${colors[color]}`}
      >
        {icon}
      </button>
      {/* Right-aligned: Actions is the last column and the table clips overflow */}
      <span role="tooltip" className="pointer-events-none absolute bottom-full right-0 z-50 mb-1.5 whitespace-nowrap rounded border border-gray-700 bg-gray-900 px-2 py-1 text-[10px] text-gray-300 opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">
        {tip}
      </span>
    </div>
  )
}

function ConfirmDialog({
  confirm,
  users,
  onConfirm,
  onCancel,
}: {
  confirm: Confirm
  users: AdminUser[]
  onConfirm: (role?: 'user' | 'admin') => void
  onCancel: () => void
}) {
  const user = users.find((u) => u.id === confirm.userId)
  const newRole = user?.role === 'admin' ? 'user' : 'admin'

  const meta: Record<ActionKey, { title: string; body: string; btnLabel: string; btnColor: string }> = {
    role: {
      title: user?.role === 'admin' ? 'Demote to User' : 'Promote to Admin',
      body: user?.role === 'admin'
        ? `Remove admin privileges from ${confirm.email}?`
        : `Grant admin privileges to ${confirm.email}? They will have full access to user management.`,
      btnLabel: user?.role === 'admin' ? 'Demote' : 'Promote',
      btnColor: 'bg-amber-500 hover:bg-amber-400',
    },
    status: {
      title: user?.is_active ? 'Deactivate Account' : 'Activate Account',
      body: user?.is_active
        ? `Deactivate ${confirm.email}? They won't be able to log in.`
        : `Activate ${confirm.email}? They will be able to log in.`,
      btnLabel: user?.is_active ? 'Deactivate' : 'Activate',
      btnColor: user?.is_active ? 'bg-gray-600 hover:bg-gray-500' : 'bg-emerald-600 hover:bg-emerald-500',
    },
    totp: {
      title: 'Reset TOTP',
      body: `Reset TOTP for ${confirm.email}? Their account will be deactivated and all sessions ended. They must re-scan the QR code to log in again.`,
      btnLabel: 'Reset TOTP',
      btnColor: 'bg-primary-600 hover:bg-primary-500',
    },
    delete: user?.is_approved === false ? {
      title: 'Reject Account',
      body: `Reject ${confirm.email}? The account is deleted and can't sign in. Use this for duplicate or unexpected accounts — they can sign up again if it was a mistake.`,
      btnLabel: 'Reject & delete',
      btnColor: 'bg-red-600 hover:bg-red-500',
    } : {
      title: 'Delete User',
      body: `Permanently delete ${confirm.email}? This cannot be undone.`,
      btnLabel: 'Delete',
      btnColor: 'bg-red-600 hover:bg-red-500',
    },
    approve: {
      title: 'Approve Account',
      body: `Approve ${confirm.email}? They get access to the app straight away, with their tags (e.g. Regression). Check it isn't a duplicate of an existing account first.`,
      btnLabel: 'Approve',
      btnColor: 'bg-emerald-600 hover:bg-emerald-500',
    },
  }

  const { title, body, btnLabel, btnColor } = meta[confirm.action]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <h3 className="mb-2 text-base font-semibold text-gray-100">{title}</h3>
        <p className="mb-6 text-sm text-gray-400">{body}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(confirm.action === 'role' ? newRole : undefined)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${btnColor}`}
          >
            {btnLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const INPUT_CLS =
  'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 ' +
  'placeholder-gray-600 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors'

function AddUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (result: CreateUserResult) => void
}) {
  useModalEscape(onClose)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')

  const isEmailValid = email.trim().length > 0 && email.trim().endsWith('@infosys.com')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setEmailError('')

    if (!email.trim()) {
      setEmailError('Email address is required.')
      return
    }
    if (!email.trim().endsWith('@infosys.com')) {
      setEmailError('Only @infosys.com email addresses are permitted.')
      return
    }

    setLoading(true)
    try {
      const result = await createUser({ email: email.trim().toLowerCase(), role })
      onCreated(result)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      if (status === 405) {
        setError('Endpoint not found — restart the backend to pick up the new route.')
      } else if (status === 409) {
        setError(detail ?? 'This email is already registered.')
      } else {
        setError(detail ?? 'Failed to create user.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600/20">
            <UserPlus className="h-4 w-4 text-primary-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-100">Add New User</h3>
            <p className="text-xs text-gray-500">Only @infosys.com addresses are allowed.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Email</label>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(''); setError('') }}
              placeholder="name@infosys.com"
              className={`${INPUT_CLS} ${emailError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
            />
            {emailError && (
              <p className="mt-1.5 text-xs text-red-400">{emailError}</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Role</label>
            <div className="flex gap-2">
              {(['user', 'admin'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                    role === r
                      ? r === 'admin'
                        ? 'border-amber-500/50 bg-amber-500/15 text-amber-400'
                        : 'border-primary-500/50 bg-primary-500/15 text-primary-400'
                      : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300'
                  }`}
                >
                  {r === 'admin' ? <Crown className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                  {r === 'admin' ? 'Admin' : 'User'}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !isEmailValid}
              className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-500 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {loading ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreatedUserModal({ result, onClose }: { result: CreateUserResult; onClose: () => void }) {
  useModalEscape(onClose)
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(result.qr_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20">
            <Check className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-100">User Created</h3>
            <p className="text-xs text-gray-500">{result.user.email}</p>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-gray-800 bg-gray-800/50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <QrCode className="h-3.5 w-3.5" /> Next steps for the new user
          </div>
          <ol className="space-y-2 text-sm text-gray-300">
            <li className="flex gap-2"><span className="font-semibold text-primary-400">1.</span> Open the QR URL below and scan it with Google Authenticator or Authy.</li>
            <li className="flex gap-2"><span className="font-semibold text-primary-400">2.</span> Call <code className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-primary-300">POST /auth/activate</code> with their email and the 6-digit code.</li>
            <li className="flex gap-2"><span className="font-semibold text-primary-400">3.</span> Log in via the login page.</li>
          </ol>
        </div>

        <div className="mb-5">
          <label className="mb-1.5 block text-xs font-medium text-gray-400">QR Code URL — share with the new user</label>
          <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5">
            <p className="flex-1 truncate font-mono text-xs text-primary-300">{result.qr_url}</p>
            <button
              onClick={copy}
              title="Copy URL"
              className="shrink-0 text-gray-500 transition-colors hover:text-gray-200"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-500"
        >
          Done
        </button>
      </div>
    </div>
  )
}

function parseAnnouncementMsg(msg: string | null): { title: string; body: string } {
  if (!msg) return { title: '', body: '' }
  const idx = msg.indexOf(': ')
  if (idx === -1) return { title: msg, body: '' }
  return { title: msg.slice(0, idx), body: msg.slice(idx + 2) }
}

function AnnounceTab() {
  const { user } = useAuthStore()
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [history, setHistory] = useState<AnnouncementRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [recipientMap, setRecipientMap] = useState<Record<number, RecipientStatus[] | 'loading'>>({})
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ idx: number; rec: AnnouncementRecord } | null>(null)
  const expandedIdxRef = useRef<number | null>(null)

  useEffect(() => { expandedIdxRef.current = expandedIdx }, [expandedIdx])

  useEffect(() => {
    getAnnouncementHistory()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))

    const id = setInterval(async () => {
      try {
        const updated = await getAnnouncementHistory()
        setHistory(updated)
        const ei = expandedIdxRef.current
        if (ei !== null && updated[ei]) {
          const rec = updated[ei]
          try {
            const rows = await getAnnouncementRecipients(rec.message ?? '', rec.sender_email)
            setRecipientMap((m) => ({ ...m, [ei]: rows }))
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  async function toggleExpand(idx: number, rec: AnnouncementRecord) {
    if (expandedIdx === idx) {
      setExpandedIdx(null)
      return
    }
    setExpandedIdx(idx)
    if (recipientMap[idx]) return
    setRecipientMap((m) => ({ ...m, [idx]: 'loading' }))
    try {
      const rows = await getAnnouncementRecipients(rec.message ?? '', rec.sender_email)
      setRecipientMap((m) => ({ ...m, [idx]: rows }))
    } catch {
      setRecipientMap((m) => ({ ...m, [idx]: [] }))
    }
  }

  const previewText = title.trim() && message.trim()
    ? `${title.trim()}: ${message.trim()}`
    : title.trim() || message.trim() || null

  function showToast(msg: string) {
    setToastMsg(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 4000)
    setTimeout(() => setToastMsg(''), 4350)
  }

  async function handleDelete(idx: number, rec: AnnouncementRecord) {
    setConfirmDelete(null)
    setDeletingIdx(idx)
    try {
      await deleteAnnouncement(rec.message ?? '', rec.sender_email)
      if (expandedIdx === idx) setExpandedIdx(null)
      setRecipientMap((m) => { const n = { ...m }; delete n[idx]; return n })
      const updated = await getAnnouncementHistory()
      setHistory(updated)
    } catch {
      // silently ignore — row stays visible
    } finally {
      setDeletingIdx(null)
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await sendAnnouncement(title.trim(), message.trim())
      showToast(`Sent to ${res.sent_to} user${res.sent_to !== 1 ? 's' : ''}`)
      setTitle('')
      setMessage('')
      setExpandedIdx(null)
      setRecipientMap({})
      try {
        const updated = await getAnnouncementHistory()
        setHistory(updated)
      } catch {
        // history refresh failing shouldn't block the send success
      }
    } catch {
      setError('Failed to send announcement. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10">
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-100">Delete Announcement</h3>
            </div>
            <p className="mb-1 text-sm text-gray-300">
              Are you sure you want to delete this announcement?
            </p>
            <p className="mb-6 text-xs text-gray-500">
              This will remove it from all recipients' inboxes and cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete.idx, confirmDelete.rec)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-gray-900 px-4 py-3 shadow-2xl transition-transform duration-300 ${
            toastVisible ? 'translate-x-0' : 'translate-x-[calc(100%+1.5rem)]'
          }`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <p className="text-xs font-medium text-gray-100">{toastMsg}</p>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 ring-1 ring-rose-500/20">
          <Megaphone className="h-6 w-6 text-rose-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-100">Broadcast Announcement</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Send a message to all active users — delivered instantly to their notification inbox.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Left: Compose form ── */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60" data-tour="tour-announce-compose">
          <div className="border-b border-gray-800 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Compose</p>
          </div>

          <form onSubmit={handleSend} className="space-y-5 p-5">
            {/* Title */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-gray-400">Title</label>
                <span className={`text-[10px] tabular-nums ${title.trim().length > 80 ? 'text-amber-400' : 'text-gray-600'}`}>
                  {title.trim().length}/100
                </span>
              </div>
              <input
                type="text"
                required
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Scheduled maintenance on Sept 10"
                className="w-full rounded-lg border border-gray-700 bg-gray-800/80 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 transition-colors focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500/50"
              />
            </div>

            {/* Message */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-gray-400">Message</label>
                <span className={`text-[10px] tabular-nums ${message.trim().length > 800 ? 'text-amber-400' : 'text-gray-600'}`}>
                  {message.trim().length}/1000
                </span>
              </div>
              <textarea
                required
                maxLength={1000}
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write the full announcement details here..."
                className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800/80 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 transition-colors focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500/50"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
                <XCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !title.trim() || !message.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                : <><Send className="h-4 w-4" /> Send to All Users</>
              }
            </button>
          </form>
        </div>

        {/* ── Right: Preview + Info ── */}
        <div className="space-y-4">
          {/* Live preview */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/60">
            <div className="border-b border-gray-800 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Inbox Preview</p>
            </div>
            <div className="p-5">
              <div className={`rounded-lg border bg-gray-800/60 px-4 py-3 transition-opacity ${previewText ? 'opacity-100 border-gray-700' : 'opacity-40 border-gray-800'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                    <Megaphone className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-gray-200">
                      {previewText ?? 'Your announcement will appear here…'}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-[10px] text-gray-600">just now</p>
                      <span className="text-[10px] text-gray-700">·</span>
                      <p className="text-[10px] text-gray-600">
                        from {user?.full_name ?? user?.email ?? 'Admin'}
                      </p>
                    </div>
                  </div>
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" />
                </div>
              </div>
              <p className="mt-3 text-[10px] text-gray-600">
                This is how users will see your announcement in their notification inbox.
              </p>
            </div>
          </div>

          {/* Audience */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/60">
            <div className="border-b border-gray-800 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Audience</p>
            </div>
            <div className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-500/10">
                <Users className="h-5 w-5 text-primary-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-200">All Active Users</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Everyone with an active account — except you (the sender).
                </p>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/60">
            <div className="border-b border-gray-800 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Tips</p>
            </div>
            <ul className="space-y-3 p-5">
              {[
                { icon: <Zap className="h-3.5 w-3.5 text-amber-400" />, text: 'Keep the title short and action-oriented.' },
                { icon: <Hash className="h-3.5 w-3.5 text-primary-400" />, text: 'Include dates or deadlines in the message for time-sensitive items.' },
                { icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />, text: 'Users can opt out of announcements via their Preferences.' },
              ].map(({ icon, text }) => (
                <li key={text} className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0">{icon}</span>
                  <p className="text-xs text-gray-500">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── Sent History ── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60" data-tour="tour-announce-history">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Sent History</p>
          <p className="text-[10px] text-gray-600">Last 20 broadcasts</p>
        </div>
        {historyLoading ? (
          <div className="px-5 py-6 text-center">
            <Loader2 className="mx-auto h-4 w-4 animate-spin text-gray-600" />
          </div>
        ) : history.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Megaphone className="mx-auto mb-2 h-5 w-5 text-gray-700" />
            <p className="text-xs text-gray-600">No announcements sent yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {history.map((rec, i) => {
              const { title: recTitle, body: recBody } = parseAnnouncementMsg(rec.message)
              const sentDate = new Date(rec.sent_at)
              const dateStr = sentDate.toLocaleString([], {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })
              const isOpen = expandedIdx === i
              const recipients = recipientMap[i]
              const unreadCount = rec.recipient_count - rec.read_count
              const readPct = rec.recipient_count > 0 ? Math.round((rec.read_count / rec.recipient_count) * 100) : 0

              return (
                <div key={i}>
                  {/* Row header */}
                  <div className="flex items-start transition-colors hover:bg-gray-800/40">
                    <button
                      onClick={() => toggleExpand(i, rec)}
                      className="flex flex-1 items-start gap-4 px-5 py-4 text-left"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500/10">
                        <Megaphone className="h-4 w-4 text-rose-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-200">{recTitle || '(no title)'}</p>
                        {recBody && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{recBody}</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-[10px] text-gray-600">{dateStr}</span>
                          <span className="text-[10px] text-gray-700">·</span>
                          <span className="text-[10px] text-gray-600">by {rec.sender_name ?? 'Admin'}</span>
                          <span className="text-[10px] text-gray-700">·</span>
                          <span className="text-[10px] text-emerald-500">{rec.read_count}/{rec.recipient_count} read ({readPct}%)</span>
                          {unreadCount > 0 && (
                            <>
                              <span className="text-[10px] text-gray-700">·</span>
                              <span className="text-[10px] text-amber-400">{unreadCount} not seen</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-gray-600">
                        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={() => setConfirmDelete({ idx: i, rec })}
                      disabled={deletingIdx === i}
                      title="Delete announcement"
                      className="flex shrink-0 items-center self-stretch px-4 text-gray-600 transition-colors hover:text-red-400 disabled:opacity-40"
                    >
                      {deletingIdx === i
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Expanded recipient list */}
                  {isOpen && (
                    <div className="border-t border-gray-800/60 bg-gray-950/40 px-5 pb-4 pt-3">
                      {recipients === 'loading' ? (
                        <div className="flex items-center gap-2 py-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-600" />
                          <span className="text-xs text-gray-600">Loading…</span>
                        </div>
                      ) : !recipients || recipients.length === 0 ? (
                        <p className="py-2 text-xs text-gray-600">No recipient data found.</p>
                      ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          {/* Not Seen */}
                          <div>
                            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                              <Clock className="h-3 w-3" />
                              Not Seen ({recipients.filter((r) => !r.is_read && !r.opted_out).length})
                            </p>
                            <div className="space-y-1.5">
                              {recipients.filter((r) => !r.is_read && !r.opted_out).length === 0 ? (
                                <p className="text-[11px] text-gray-600">Everyone has seen it</p>
                              ) : (
                                recipients.filter((r) => !r.is_read && !r.opted_out).map((r) => (
                                  <div key={r.email} className="flex items-center gap-2">
                                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
                                      <Clock className="h-2.5 w-2.5 text-amber-400" />
                                    </div>
                                    <p className="truncate text-xs text-gray-400">{r.full_name || r.email}</p>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                          {/* Read */}
                          <div>
                            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                              <Check className="h-3 w-3" />
                              Read ({recipients.filter((r) => r.is_read).length})
                            </p>
                            <div className="space-y-1.5">
                              {recipients.filter((r) => r.is_read).length === 0 ? (
                                <p className="text-[11px] text-gray-600">Nobody has read it yet</p>
                              ) : (
                                recipients.filter((r) => r.is_read).map((r) => (
                                  <div key={r.email} className="flex items-center gap-2">
                                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                                      <Check className="h-2.5 w-2.5 text-emerald-400" />
                                    </div>
                                    <p className="truncate text-xs text-gray-400">{r.full_name || r.email}</p>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                          {/* Opted Out */}
                          <div>
                            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                              <XCircle className="h-3 w-3" />
                              Opted Out ({recipients.filter((r) => r.opted_out).length})
                            </p>
                            <div className="space-y-1.5">
                              {recipients.filter((r) => r.opted_out).length === 0 ? (
                                <p className="text-[11px] text-gray-600">No one has opted out</p>
                              ) : (
                                recipients.filter((r) => r.opted_out).map((r) => (
                                  <div key={r.email} className="flex items-center gap-2">
                                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-700/50">
                                      <XCircle className="h-2.5 w-2.5 text-gray-500" />
                                    </div>
                                    <p className="truncate text-xs text-gray-600">{r.full_name || r.email}</p>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
