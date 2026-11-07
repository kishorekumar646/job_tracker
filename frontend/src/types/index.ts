// Author: Kishore Kumar
export interface SessionResponse {
  access_token: string
  token_type: string
  expires_at: number
  user: { email: string; name?: string | null; full_name?: string | null; role: string; id: number; is_admin: boolean; is_approved?: boolean }
}

export interface MessageResponse {
  message: string
}

export interface UserProfile {
  id?: number
  email: string
  name?: string | null
  full_name?: string
  role: string
  is_admin: boolean
  created_at?: string
  date_of_birth?: string
  dob_update_count?: number
  avatar_url?: string | null
  receive_announcements?: boolean
  permissions?: string[]
  is_approved?: boolean
}

export type RcaCategory =
  | 'DRM_ERROR'
  | 'PLAYOUT_ERROR'
  | 'ENVIRONMENT'
  | 'BROWSERSTACK_CAPACITY'
  | 'ORCHESTRATION'
  | 'AUTOMATION_SCRIPT'
  | 'TEST_ASSERTION'
  | 'KNOWN_ISSUE'
  | 'UNKNOWN'
  // STB CS error categories
  | 'NETWORK_ERROR'
  | 'HARDWARE_ERROR'
  | 'SOFTWARE_UPDATE_ERROR'
  | 'PROVISIONING_ERROR'
  | 'BACKEND_ERROR'
  | 'OTT_ERROR'
  | 'ACCOUNT_ERROR'

export type Platform =
  | 'STB'
  | 'PERSEUS_ANDROID'
  | 'PERSEUS_IOS'
  | 'PERSEUS_WEB'
  | 'BROWSERSTACK'

export type JobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'STOPPED'

export interface RcaVerdict {
  testCaseRunId: string
  platform: Platform
  category: RcaCategory
  confidence: number
  explanation: string
  matchedRule: string | null
  matchedJiraTicket: string | null
  jiraUrl: string | null
  reportUrl: string | null
  screenshot?: string | null
  failureErrors?: Array<Record<string, string>>
  stepReasons?: Array<Record<string, string>>
  aiSuggested?: boolean
  componentLogs?: string | null
  flatLogs?: string | null
  /** The InspectorWeb run this verdict came from — set for batch results, to show them run by run. */
  runUuid?: string | null
  runName?: string | null
  /** Device error code behind the category (e.g. STB CS2201) and its mapping details */
  errorCode?: string | null
  errorTitle?: string | null
  errorSubsystem?: string | null
}

export interface AnalyzeRequest {
  runUuid?: string
  /** Batch over these runs (stored verdicts are reused). */
  runUuids?: string[]
  /** Name of the batch job in Job History. */
  batchLabel?: string
  testCaseName?: string
  sinceMinutes?: number
  sinceDays?: number
  platform?: Platform
  sessionId?: string
  syncJobId?: string
}

export interface AnalyzeResponse {
  jobId: string | null
  syncJobId: string | null
  verdicts: RcaVerdict[] | null
}

export interface JobStatusResponse {
  jobId: string
  status: JobStatus
  verdicts: RcaVerdict[]
  summary: Record<string, number | Record<string, number>>
}

export interface HealthResponse {
  status: string
  unavailable: string[]
  odh: boolean
  jira: boolean
  rabbitmq: boolean
  inspectorweb: boolean
  odh_note?: string
  detail?: Record<string, string>
}

export interface AuthUser {
  email: string
  role: string
  full_name?: string
  created_at?: string
  date_of_birth?: string
  dob_update_count?: number
  /** Effective permission keys from GET /auth/me (admins get all). */
  permissions?: string[]
  /** False while a self-registered account waits for an admin's approval (GET /auth/me). */
  is_approved?: boolean
  /** Profile photo URL (GET /auth/me), or empty for initials. */
  avatar_url?: string | null
}

export interface RuleStats {
  ruleName: string
  staticConfidence: number
  hits: number
  confirmed: number
  disputed: number
  overrideConfidence: number | null
  effectiveConfidence: number
  updatedAt: string | null
}

export interface StoredAnalysis {
  id: string
  timestamp: string
  mode: 'sync' | 'async'
  runUuid?: string
  jobId?: string
  status: JobStatus
  verdictCount: number
  verdicts?: RcaVerdict[]
  summary?: Record<string, number | Record<string, number>>
  executionName?: string
  cancelReason?: string | null
  durationSecs?: number | null
  reportId?: string
  reportCreatedBy?: string
  reportCreatedAt?: string
  reportUrl?: string
}

export interface DashboardStats {
  categoryBreakdown: Partial<Record<RcaCategory, number>>
  platformBreakdown: Partial<Record<Platform, number>>
  recentVerdicts: RcaVerdict[]
  totalVerdicts: number
  knownIssueCount: number
  /** Regression-tab runs the app analysed by itself (not in Job History), and their new verdicts per day. */
  autoAnalysedRuns?: number
  autoVerdictsByDay?: Record<string, number>
}

export interface AppNotification {
  id: number
  sender_name: string | null
  notif_type: 'dashboard_view' | 'report_view' | 'announcement'
  job_uid: string | null
  message: string | null
  is_read: boolean
  created_at: string
}

// ── Job Application Tracker Types ────────────────────────────────────────────────

export type ApplicationStatus = 'Applied' | 'Interview Scheduled' | 'Offer Received' | 'Rejected' | 'Withdrawn'

export interface JobApplication {
  id: string
  company: string
  job_title: string
  location: string
  status: ApplicationStatus
  applied_date: string
  job_link?: string
  resume_version?: string
  notes?: string
}

export interface AutoApplySettings {
  connected_accounts: Record<string, { connected: boolean; username?: string }>
  resume_name?: string | null
  preferred_cities: string[]
  desired_roles: string[]
  min_salary: number
  experience_level: string
  is_auto_apply_active: boolean
}
