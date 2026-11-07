// Author: Kishore Kumar
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { getMe } from './auth'

const BASE_URL = '/api/v1'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// Client for multipart/form-data requests (auth endpoints)
export const formClient = apiClient.create({
  baseURL: BASE_URL,
  withCredentials: true,
})

let isRefreshing = false
let failedQueue: Array<{
  resolve: (value: unknown) => void
  reject: (err: unknown) => void
}> = []

function processQueue(error: unknown) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(undefined)
  })
  failedQueue = []
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      })
        .then(() => apiClient(original))
        .catch((err) => Promise.reject(err))
    }

    original._retry = true
    isRefreshing = true

    try {
      // Try to refresh the token
      await axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      // Get the updated user info
      const profile = await getMe()
      // Update the store so the expiry warning stays accurate after a silent refresh
      import('../store/authStore').then(({ useAuthStore }) => {
        useAuthStore.getState().setSession(profile, Date.now() + 30 * 60 * 1000)
      })
      processQueue(null)
      return apiClient(original)
    } catch (err) {
      processQueue(err)
      // Network error means the server is down — the offline banner handles it.
      // Only clear auth and redirect when the server explicitly rejects the
      // refresh token with a 401 (genuine session expiry, not an outage).
      const isNetworkError = !(err as AxiosError)?.response
      if (!isNetworkError) {
        import('../store/authStore').then(({ useAuthStore }) => {
          const store = useAuthStore.getState()
          const wasAuthenticated = store.isAuthenticated
          store.clearAuth()
          if (wasAuthenticated) {
            window.location.href = '/login'
          }
        })
      }
      return Promise.reject(err)
    } finally {
      isRefreshing = false
    }
  }
)
