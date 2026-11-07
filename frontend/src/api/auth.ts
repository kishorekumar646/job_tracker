// Author: Kishore Kumar
import axios from 'axios'
import { apiClient } from './client'
import { SessionResponse, UserProfile } from '../types'

function toFormData(data: Record<string, string | undefined | null>) {
  const fd = new URLSearchParams()
  Object.entries(data).forEach(([k, v]) => {
    if (v !== undefined && v !== null) fd.append(k, String(v))
  })
  return fd
}

export async function signup(
  email: string,
  fullName?: string,
  dateOfBirth?: string
): Promise<{ message: string; user: { id: number; email: string; name: string | null; qr_code: string; totp_secret: string } }> {
  const params = new URLSearchParams()
  params.append('email', email.trim())
  if (fullName?.trim()) params.append('full_name', fullName.trim())
  if (dateOfBirth?.trim()) params.append('date_of_birth', dateOfBirth.trim())
  const { data } = await axios.post<{
    message: string
    user: { id: number; email: string; name: string | null; qr_code: string; totp_secret: string }
  }>('/api/v1/auth/signup', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return data
}

export function getTotpQrUrl(email: string): string {
  return `/api/v1/auth/totp/qr?email=${encodeURIComponent(email)}`
}

export async function activateAccount(email: string, otp: string): Promise<{
  message: string
  access_token: string
  token_type: string
  expires_at: number
  user: { id: number; email: string; name: string | null; role: string; is_admin: boolean }
}> {
  const { data } = await axios.post<{
    message: string
    access_token: string
    token_type: string
    expires_at: number
    user: { id: number; email: string; name: string | null; role: string; is_admin: boolean }
  }>('/api/v1/auth/activate', toFormData({ email, otp }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return data
}

export async function login(email: string, otp: string): Promise<SessionResponse> {
  const { data } = await axios.post<SessionResponse>('/api/v1/auth/login', toFormData({ email, otp }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    withCredentials: true,
  })
  return data
}

export async function getMe(): Promise<UserProfile> {
  const { data } = await apiClient.get<UserProfile>('/auth/me')
  return data
}

export async function updateProfile(fullName: string, dateOfBirth?: string): Promise<UserProfile> {
  const body: Record<string, string | null> = { full_name: fullName }
  if (dateOfBirth !== undefined) body.date_of_birth = dateOfBirth || null
  const { data } = await apiClient.patch<UserProfile>('/auth/me', body)
  return data
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout')
}

export async function uploadAvatar(dataUrl: string): Promise<UserProfile> {
  const { data } = await apiClient.put<UserProfile>('/auth/me/avatar', { image: dataUrl })
  return data
}

export async function deleteAvatar(): Promise<UserProfile> {
  const { data } = await apiClient.delete<UserProfile>('/auth/me/avatar')
  return data
}