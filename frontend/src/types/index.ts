// Author: Kishore Kumar
export type ApplicationStatus =
  | 'applied'
  | 'shortlisted'
  | 'interview_scheduled'
  | 'interview_completed'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  | 'to_apply'

export type JobType = 'full_time' | 'part_time' | 'contract' | 'internship'

export type Platform = 'linkedin' | 'naukri' | 'indeed' | 'glassdoor' | 'foundit' | 'instahyre'
export type JobSource = Platform | 'manual' | 'other'

export interface User {
  id: number
  email: string
  name: string | null
  avatar: string | null
  role: string
  email_verified: boolean
  receive_announcements: boolean
  plan: string
  plan_expires_at: string | null
  pro_welcome_pending: boolean
  created_at: string | null
}

export interface AuthResponse {
  user: User
  expires_at: number
  refresh_expires_at: number | null
  server_time: number
}

export interface SignupResponse {
  message: string
  email: string
  totp_secret: string
  otpauth_url: string
  qr_code: string
}

export interface Profile {
  headline: string | null
  summary: string | null
  phone: string | null
  location: string | null
  experience_years: number | null
  skills: string[]
  resume_filename: string | null
  resume_size: number | null
  resume_uploaded_at: string | null
  completeness: number
}

export type ProfileUpdate = Partial<Omit<Profile, 'resume_filename' | 'resume_size' | 'resume_uploaded_at' | 'completeness'>>

export interface Preferences {
  job_titles: string[]
  locations: string[]
  job_types: JobType[]
  remote_ok: boolean
  min_salary_lpa: number | null
  auto_apply_enabled: boolean
  daily_limit: number
  min_match_score: number
}

export interface Connection {
  platform: Platform
  label: string
  description: string
  connected: boolean
  handle: string | null
  profile_url: string | null
  connected_at: string | null
}

export interface Job {
  id: number
  title: string
  company: string
  location: string | null
  description: string | null
  external_link: string | null
  source: JobSource
  job_type: JobType | null
  skills: string[]
  is_remote: boolean
  salary_min_lpa: number | null
  salary_max_lpa: number | null
  posted_date: string | null
  match_score: number | null
  matched_skills: string[]
  applied: boolean
  is_own: boolean
}

export interface JobCreate {
  title: string
  company: string
  location?: string
  description?: string
  external_link?: string
  source: JobSource
  job_type?: JobType
  skills?: string[]
  is_remote?: boolean
  salary_min_lpa?: number
  salary_max_lpa?: number
}

export interface Application {
  id: number
  job_id: number
  status: ApplicationStatus
  notes: string | null
  interview_date: string | null
  offer_salary_lpa: number | null
  match_score: number | null
  auto_applied: boolean
  applied_at: string
  updated_at: string
  job: Job
}

export interface DashboardStats {
  total_applications: number
  auto_applied: number
  by_status: Record<string, number>
  by_source: Record<string, number>
  by_day: Record<string, number>
  interviews: number
  offers: number
  response_rate: number
  connected_platforms: number
  profile_completeness: number
  recent: Application[]
}

export interface AutoApplyRun {
  id: number
  trigger: 'manual' | 'scheduled'
  started_at: string
  evaluated: number
  applied: number
  skipped: number
  message: string | null
  details_recorded: boolean
}

export interface AutoApplyRunDetail extends AutoApplyRun {
  jobs: {
    id: number
    title: string
    company: string
    location: string | null
    source: JobSource
    external_link: string
    match_score: number
    outcome: 'applied' | 'to_apply'
  }[]
}

export interface AutoApplyStatus {
  enabled: boolean
  ready: boolean
  blockers: string[]
  connected_platforms: Platform[]
  applied_today: number
  daily_limit: number
  lifetime_used: number
  lifetime_limit: number | null
  schedule_interval_minutes: number
  next_scheduled_at: string | null
  scheduled_sweep_running: boolean
  last_run: AutoApplyRun | null
}

export interface BillingMe {
  plan: 'free' | 'pro'
  plan_expires_at: string | null
  free: { total_auto_apply: number | null }
  pro: { daily_auto_apply: number | null }
  price_inr: number
  pro_days: number
  applied_today: number
  daily_limit: number
  lifetime_used: number
  lifetime_limit: number | null
  upi_configured: boolean
}

export type OrderStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED'

export interface Order {
  id: number
  order_ref: string
  plan_id: string
  base_amount: number
  unique_amount: number
  status: OrderStatus
  expires_at: string
  paid_at: string | null
  created_at: string
  invoice_no: string | null
}

export interface Checkout {
  order: Order
  amount: string
  payee_name: string
  upi_uri: string
  qr_code: string
  seconds_left: number
}

export interface AdminOrder extends Order {
  user_email: string
  user_name: string | null
  utr: string | null
  source: string | null
}

export interface WebhookLog {
  id: number
  raw: string
  amount_paise: number | null
  utr: string | null
  order_ref: string | null
  result: string
  order_id: number | null
  created_at: string
}
