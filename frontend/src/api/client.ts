// Author: Kishore Kumar
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { useSessionStore } from '../store/sessionStore'
import type { AuthResponse } from '../types'
import { notifyDataChanged } from '../utils/dataSync'

export const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})

let refreshRequest: Promise<AuthResponse> | null = null

export function refreshSession(): Promise<AuthResponse> {
  if (!refreshRequest) {
    refreshRequest = apiClient.post<AuthResponse>('/auth/refresh')
      .then((r) => r.data)
      .catch((error: unknown) => {
        if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) {
          window.dispatchEvent(new Event('auth:expired'))
        }
        throw error
      })
      .finally(() => { refreshRequest = null })
  }
  return refreshRequest
}

// Auth endpoints return 401 for a bad code — those must not trigger a refresh.
const NO_REFRESH = ['/auth/login', '/auth/signup', '/auth/activate', '/auth/refresh', '/auth/logout', '/auth/passkeys/login']

apiClient.interceptors.response.use(
  (res) => {
    if (['/auth/login', '/auth/refresh', '/auth/session', '/auth/passkeys/login/verify'].includes(res.config.url ?? '')) {
      useSessionStore.getState().update(res.data as AuthResponse)
    }
    if (['post', 'put', 'patch', 'delete'].includes(res.config.method ?? '') && !res.config.url?.startsWith('/auth/')) {
      notifyDataChanged()
    }
    return res
  },
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    const url = original?.url ?? ''
    if (error.response?.status !== 401 || !original || original._retry || NO_REFRESH.some((p) => url.startsWith(p))) {
      return Promise.reject(error)
    }
    original._retry = true

    try {
      await refreshSession()
      return apiClient(original)
    } catch (refreshError) {
      return Promise.reject(refreshError)
    }
  }
)

/** Turn any thrown value into a message that is safe to show the user. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'Cannot reach the server. Check your connection and try again.'
    const detail = (err.response.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length) {
      const first = detail[0] as { msg?: string; loc?: (string | number)[] }
      const field = first.loc?.filter((p) => p !== 'body').join('.') ?? ''
      const msg = (first.msg ?? '').replace(/^Value error, /, '')
      return field ? `${field.replace(/_/g, ' ')}: ${msg}` : msg || fallback
    }
  }
  return fallback
}
