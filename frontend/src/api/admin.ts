// Author: Kishore Kumar
import { apiClient } from './client'

export interface AdminUser {
  id: number
  email: string
  full_name?: string | null
  role: 'user' | 'admin'
  is_active: boolean
  created_at: string
  last_seen?: string | null
  date_of_birth?: string | null
  dob_update_count?: number
  /** Granted keys (not expanded); admins implicitly hold every permission. */
  permissions?: string[]
  /** Self-registered accounts wait for an admin's approval before they can use the app. */
  is_approved?: boolean
  approved_at?: string | null
  approved_by?: string | null
  /** For pending accounts: other accounts with the same full name (likely the same person). */
  possible_duplicates?: string[]
}

export interface UserListResponse {
  users: AdminUser[]
  total: number
  /** Accounts waiting for approval. */
  pending?: number
}

export async function listUsers(): Promise<UserListResponse> {
  const { data } = await apiClient.get<UserListResponse>('/admin/users')
  return data
}

export async function updateRole(userId: number, role: 'user' | 'admin'): Promise<AdminUser> {
  const { data } = await apiClient.patch<AdminUser>(`/admin/users/${userId}/role`, { role })
  return data
}

export async function toggleStatus(userId: number): Promise<AdminUser> {
  const { data } = await apiClient.patch<AdminUser>(`/admin/users/${userId}/status`)
  return data
}

export async function resetTotp(userId: number): Promise<AdminUser> {
  const { data } = await apiClient.post<AdminUser>(`/admin/users/${userId}/reset-totp`)
  return data
}

export async function approveUser(userId: number): Promise<AdminUser> {
  const { data } = await apiClient.post<AdminUser>(`/admin/users/${userId}/approve`)
  return data
}

export async function deleteUser(userId: number): Promise<void> {
  await apiClient.delete(`/admin/users/${userId}`)
}

export interface CreateUserPayload {
  email: string
  role: 'user' | 'admin'
}

export interface CreateUserResult {
  user: AdminUser
  qr_url: string
  message: string
}

export async function createUser(payload: CreateUserPayload): Promise<CreateUserResult> {
  const { data } = await apiClient.post<CreateUserResult>('/admin/users', payload)
  return data
}

export async function updateFullName(userId: number, fullName: string | null): Promise<AdminUser> {
  const { data } = await apiClient.patch<AdminUser>(`/admin/users/${userId}/full-name`, { full_name: fullName })
  return data
}

export async function updateUserDob(userId: number, dateOfBirth: string | null): Promise<AdminUser> {
  const { data } = await apiClient.patch<AdminUser>(`/admin/users/${userId}/dob`, { date_of_birth: dateOfBirth })
  return data
}

/** A named bundle of permissions shown as a tag in Admin → Users (e.g. Regression). */
export interface TagInfo {
  key: string
  label: string
  description: string
  permissions: string[]
  /** New accounts start with this tag (none do today). */
  default: boolean
}

export async function listTags(): Promise<TagInfo[]> {
  const { data } = await apiClient.get<TagInfo[]>('/admin/tags')
  return data
}

export async function updateUserPermissions(userId: number, permissions: string[]): Promise<AdminUser> {
  const { data } = await apiClient.patch<AdminUser>(`/admin/users/${userId}/permissions`, { permissions })
  return data
}
