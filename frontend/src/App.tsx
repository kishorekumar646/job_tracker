// Author: Kishore Kumar
import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useThemeStore } from './store/themeStore'
import { setSettingsUser } from './utils/settings'
import { Toaster } from './components/ui'
import { OfflineBanner } from './components/ui/OfflineBanner'
import { AdminRoute, AppLayout, ProtectedRoute, PublicOnlyRoute } from './components/layout'
import { LoginPage, SignupPage } from './pages/AuthPage'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Jobs from './pages/Jobs'
import Applications from './pages/Applications'
import AutoApply from './pages/AutoApply'
import Connections from './pages/Connections'
import Billing from './pages/Billing'
import Guide from './pages/Guide'
import Landing from './pages/Landing'

function ThemeLoader() {
  const email = useAuthStore((s) => s.user?.email)
  const load = useThemeStore((s) => s.load)
  useEffect(() => {
    setSettingsUser(email ?? 'guest')
    load()
  }, [email, load])
  return null
}

function SessionWatcher() {
  const nav = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      if (['/', '/login', '/signup'].includes(window.location.pathname)) return
      nav('/login', { replace: true })
    }
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [nav, setUser])
  return null
}

export default function App() {
  const init = useAuthStore((s) => s.init)
  const initialized = useAuthStore((s) => s.initialized)
  useEffect(() => { void init() }, [init])
  useEffect(() => {
    if (initialized) return
    const retry = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void init()
    }
    const timer = setInterval(retry, 15_000)
    window.addEventListener('online', retry)
    window.addEventListener('focus', retry)
    document.addEventListener('visibilitychange', retry)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', retry)
      window.removeEventListener('focus', retry)
      document.removeEventListener('visibilitychange', retry)
    }
  }, [initialized, init])

  return (
    <BrowserRouter>
      <ThemeLoader />
      <SessionWatcher />
      <Toaster />
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/applications" element={<Applications />} />
            <Route path="/auto-apply" element={<AutoApply />} />
            <Route path="/admin" element={<AdminRoute />} />
            <Route path="/connections" element={<Connections />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/guide" element={<Guide />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
