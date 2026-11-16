// Author: Kishore Kumar
import { apiClient } from './client'
import type {
  AdminOrder,
  WebhookLog,
  Order,
  BillingMe,
  Checkout,
  Application,
  ApplicationStatus,
  AuthResponse,
  AutoApplyRun,
  AutoApplyStatus,
  Connection,
  DashboardStats,
  Job,
  JobCreate,
  Platform,
  Preferences,
  Profile,
  ProfileUpdate,
  SignupResponse,
  User,
} from '../types'

export const authApi = {
  signup: (body: { full_name: string; date_of_birth: string; email: string }) =>
    apiClient.post<SignupResponse>('/auth/signup', body).then((r) => r.data),
  activate: (body: { email: string; otp: string }) =>
    apiClient.post<{ message: string; user: User }>('/auth/activate', body).then((r) => r.data),
  login: (body: { email: string; otp: string }) =>
    apiClient.post<AuthResponse>('/auth/login', body).then((r) => r.data),
  logout: () => apiClient.post('/auth/logout').then((r) => r.data),
  me: () => apiClient.get<User>('/auth/me').then((r) => r.data),
  session: () => apiClient.get<AuthResponse>('/auth/session').then((r) => r.data),
  updateName: (name: string) => apiClient.patch<User>('/auth/me', { name }).then((r) => r.data),
  sendEmailCode: () => apiClient.post<{ message: string; delivered: boolean }>('/auth/email/send').then((r) => r.data),
  verifyEmail: (code: string) => apiClient.post<User>('/auth/email/verify', { code }).then((r) => r.data),
}

export const profileApi = {
  get: () => apiClient.get<Profile>('/profile').then((r) => r.data),
  update: (body: ProfileUpdate) => apiClient.put<Profile>('/profile', body).then((r) => r.data),
  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<User>('/profile/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
  },
  deleteAvatar: () => apiClient.delete<User>('/profile/avatar').then((r) => r.data),
  uploadResume: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient
      .post<Profile>('/profile/resume', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 })
      .then((r) => r.data)
  },
  deleteResume: () => apiClient.delete<Profile>('/profile/resume').then((r) => r.data),
  downloadResume: async (filename: string) => {
    const res = await apiClient.get<Blob>('/profile/resume', { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
}

export const preferencesApi = {
  get: () => apiClient.get<Preferences>('/preferences').then((r) => r.data),
  update: (body: Partial<Preferences>) => apiClient.put<Preferences>('/preferences', body).then((r) => r.data),
}

export const connectionsApi = {
  list: () => apiClient.get<Connection[]>('/connections').then((r) => r.data),
  connect: (platform: Platform, body: { handle?: string; profile_url?: string }) =>
    apiClient.put<Connection>(`/connections/${platform}`, body).then((r) => r.data),
  disconnect: (platform: Platform) => apiClient.delete<Connection>(`/connections/${platform}`).then((r) => r.data),
}

export interface JobFilters {
  search?: string
  location?: string
  source?: string
  job_type?: string
  min_match?: number
  hide_applied?: boolean
  sort?: 'match' | 'recent'
  skip?: number
  limit?: number
}

export const jobsApi = {
  list: (params: JobFilters) => apiClient.get<Job[]>('/jobs', { params }).then((r) => r.data),
  create: (body: JobCreate) => apiClient.post<Job>('/jobs', body).then((r) => r.data),
  remove: (id: number) => apiClient.delete(`/jobs/${id}`).then((r) => r.data),
  refresh: () => apiClient.post<{ added: number }>('/jobs/refresh').then((r) => r.data),
}

export const applicationsApi = {
  list: (params: { status?: string; source?: string; search?: string; start?: string; end?: string } = {}) =>
    apiClient.get<Application[]>('/applications', { params }).then((r) => r.data),
  create: (body: { job_id: number; notes?: string; status?: ApplicationStatus }) =>
    apiClient.post<Application>('/applications', body).then((r) => r.data),
  update: (
    id: number,
    body: { status?: ApplicationStatus; notes?: string | null; interview_date?: string | null; offer_salary_lpa?: number | null }
  ) => apiClient.patch<Application>(`/applications/${id}`, body).then((r) => r.data),
  remove: (id: number) => apiClient.delete(`/applications/${id}`).then((r) => r.data),
  stats: (params: { start?: string; end?: string } = {}) => apiClient.get<DashboardStats>('/applications/stats', { params }).then((r) => r.data),
}

export const autoApplyApi = {
  status: () => apiClient.get<AutoApplyStatus>('/auto-apply/status').then((r) => r.data),
  run: () => apiClient.post<AutoApplyRun>('/auto-apply/run').then((r) => r.data),
  runs: () => apiClient.get<AutoApplyRun[]>('/auto-apply/runs').then((r) => r.data),
}

export interface AdminUser {
  id: number
  email: string
  name: string | null
  role: 'user' | 'admin'
  plan: 'free' | 'pro'
  plan_expires_at: string | null
  is_active: boolean
  is_approved: boolean
  email_verified: boolean
  date_of_birth: string | null
  last_seen: string | null
  created_at: string | null
  applications: number
  connections: number
}

export interface AdminUserDetail {
  user: AdminUser
  headline: string | null
  location: string | null
  experience_years: number | null
  skills: string[]
  resume_filename: string | null
  job_titles: string[]
  locations: string[]
  auto_apply_enabled: boolean
  platforms: string[]
  status_counts: Record<string, number>
}

export interface AppNotification {
  id: number
  notif_type: 'announcement' | 'role_change' | string
  title: string
  message: string
  is_read: boolean
  created_at: string
}

export interface AnnouncementRecord {
  id: number
  title: string
  message: string
  sender_name: string | null
  sender_email: string
  created_at: string
  recipient_count: number
  read_count: number
  opted_out_count: number
}

export interface AnnouncementRecipient {
  name: string | null
  email: string
  is_read: boolean
  read_at: string | null
  opted_out: boolean
}

export interface AdminTotpResult {
  user: AdminUser
  totp_secret: string
  qr_code: string
  message: string
}

export const adminApi = {
  list: () => apiClient.get<{ users: AdminUser[]; total: number; pending: number; pro_days: number }>('/admin/users').then((r) => r.data),
  grantPro: (id: number) => apiClient.post<AdminUser>(`/admin/users/${id}/pro`).then((r) => r.data),
  create: (body: { email: string; name?: string; role: 'user' | 'admin' }) =>
    apiClient.post<AdminTotpResult>('/admin/users', body).then((r) => r.data),
  setRole: (id: number, role: 'user' | 'admin') => apiClient.patch<AdminUser>(`/admin/users/${id}/role`, { role }).then((r) => r.data),
  toggleStatus: (id: number) => apiClient.patch<AdminUser>(`/admin/users/${id}/status`).then((r) => r.data),
  resetTotp: (id: number) => apiClient.post<AdminTotpResult>(`/admin/users/${id}/reset-totp`).then((r) => r.data),
  remove: (id: number) => apiClient.delete(`/admin/users/${id}`).then((r) => r.data),
  setName: (id: number, name: string | null) => apiClient.patch<AdminUser>(`/admin/users/${id}/name`, { name }).then((r) => r.data),
  details: (id: number) => apiClient.get<AdminUserDetail>(`/admin/users/${id}/details`).then((r) => r.data),
}

export const notificationsApi = {
  mine: () => apiClient.get<AppNotification[]>('/notifications/mine').then((r) => r.data),
  markRead: (id: number) => apiClient.patch(`/notifications/${id}/read`).then((r) => r.data),
  setAnnouncements: (receive: boolean) =>
    apiClient.patch<User>('/notifications/preferences', { receive_announcements: receive }).then((r) => r.data),
  markAllRead: () => apiClient.post('/notifications/mark-all-read').then((r) => r.data),
  announce: (title: string, message: string) =>
    apiClient.post<{ ok: boolean; sent_to: number }>('/notifications/announce', { title, message }).then((r) => r.data),
  history: () => apiClient.get<AnnouncementRecord[]>('/notifications/announcements').then((r) => r.data),
  recipients: (id: number) => apiClient.get<AnnouncementRecipient[]>(`/notifications/announcements/${id}/recipients`).then((r) => r.data),
  remove: (id: number) => apiClient.delete(`/notifications/announcements/${id}`).then((r) => r.data),
}

export const billingApi = {
  me: () => apiClient.get<BillingMe>('/billing/me').then((r) => r.data),
  createOrder: () => apiClient.post<Checkout>('/billing/orders').then((r) => r.data),
  orders: () => apiClient.get<Order[]>('/billing/orders').then((r) => r.data),
  order: (id: number) => apiClient.get<Order>(`/billing/orders/${id}`).then((r) => r.data),
  submitUtr: (id: number, utr: string) => apiClient.post<Order>(`/billing/orders/${id}/utr`, { utr }).then((r) => r.data),
  downloadInvoice: async (o: Order) => {
    const res = await apiClient.get(`/billing/orders/${o.id}/invoice`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `${o.invoice_no ?? o.order_ref}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  },
}

export const adminBillingApi = {
  orders: (status?: string) => apiClient.get<AdminOrder[]>('/admin/orders', { params: { status_filter: status } }).then((r) => r.data),
  approve: (id: number) => apiClient.post<AdminOrder>(`/admin/orders/${id}/approve`).then((r) => r.data),
  fail: (id: number) => apiClient.post<AdminOrder>(`/admin/orders/${id}/fail`).then((r) => r.data),
  logs: (result?: string) => apiClient.get<WebhookLog[]>('/admin/webhook-logs', { params: { result } }).then((r) => r.data),
  uploadStatement: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<{ added: number; settled: number }>('/admin/bank-statement', form).then((r) => r.data)
  },
}

export interface FeedbackRecord {
  id: number
  rating: number
  comment: string
  page: string
  status: 'new' | 'reviewed'
  created_at: string
}

export interface AdminFeedback extends FeedbackRecord {
  user_email: string
  user_name: string | null
}

export const feedbackApi = {
  submit: (body: { rating: number; comment: string; page: string }) =>
    apiClient.post<FeedbackRecord>('/feedback', body).then((r) => r.data),
  list: (status: '' | FeedbackRecord['status'], skip: number) =>
    apiClient.get<{ items: AdminFeedback[]; total: number }>('/admin/feedback', {
      params: { status_filter: status || undefined, skip, limit: 20 },
    }).then((r) => r.data),
  review: (id: number, status: FeedbackRecord['status']) =>
    apiClient.patch<FeedbackRecord>(`/admin/feedback/${id}`, { status }).then((r) => r.data),
}
