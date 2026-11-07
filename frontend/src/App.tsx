// Author: Kishore Kumar
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { LoginPage } from './pages/auth/LoginPage'
import { SignupPage } from './pages/auth/SignupPage'
import { ActivatePage } from './pages/auth/ActivatePage'
import { JobDashboardPage } from './pages/JobDashboardPage'
import { AdminPage } from './pages/AdminPage'
import { AnalyzePage } from './pages/AnalyzePage'
import { JobHistoryPage } from './pages/JobHistoryPage'
import { AddApplicationPage } from './pages/AddApplicationPage'
import { HealthPage } from './pages/HealthPage'
import { RegressionPage } from './pages/RegressionPage'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { TokenExpiryBanner } from './components/ui/TokenExpiryBanner'
import { OfflineBanner } from './components/ui/OfflineBanner'
import { useTokenExpiry } from './hooks/useTokenExpiry'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { useAuthStore } from './store/authStore'
import { useTheme } from './hooks/useTheme'

function AppShell() {
  const { showWarning, handleRefresh, handleDismiss, expiresAt } = useTokenExpiry()
  const { isOnline, countdown, checking, retry } = useOnlineStatus()
  const { isAuthenticated, isLoading } = useAuthStore()
  const initAuth = useAuthStore((s) => s.initAuth)
  useTheme()

  useEffect(() => {
    initAuth()
  }, [])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <svg className="animate-spin h-8 w-8 text-primary-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  return (
    <>
      <OfflineBanner isOnline={isOnline} countdown={countdown} checking={checking} onRetry={retry} />
      {showWarning && (
        <TokenExpiryBanner onRefresh={handleRefresh} onDismiss={handleDismiss} expiresAt={expiresAt} />
      )}
      <Routes>
        {/* Root redirect - unauthenticated to login, authenticated to dashboard */}
        <Route path="/" element={
          <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />
        } />

        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/activate" element={<ActivatePage />} />

        {/* Protected - Job Portal Dashboard */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <JobDashboardPage />
          </ProtectedRoute>
        } />

        {/* Protected - Remaining pages */}
        <Route path="/admin" element={
          <ProtectedRoute adminOnly>
            <AdminPage />
          </ProtectedRoute>
        } />

        <Route path="/analyze" element={
          <ProtectedRoute>
            <AnalyzePage />
          </ProtectedRoute>
        } />

        <Route path="/jobs" element={
          <ProtectedRoute>
            <JobHistoryPage />
          </ProtectedRoute>
        } />

        <Route path="/jobs/:id" element={
          <ProtectedRoute>
            <JobDashboardPage />
          </ProtectedRoute>
        } />

        <Route path="/applications" element={
          <ProtectedRoute>
            <JobHistoryPage />
          </ProtectedRoute>
        } />

        <Route path="/applications/new" element={
          <ProtectedRoute>
            <AddApplicationPage />
          </ProtectedRoute>
        } />

        <Route path="/applications/edit/:id" element={
          <ProtectedRoute>
            <AddApplicationPage />
          </ProtectedRoute>
        } />

        <Route path="/health" element={
          <ProtectedRoute>
            <HealthPage />
          </ProtectedRoute>
        } />

        <Route path="/regression" element={
          <ProtectedRoute>
            <RegressionPage />
          </ProtectedRoute>
        } />

        {/* Catch-all - redirect to appropriate page */}
        <Route path="*" element={
          <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />
        } />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}