// Author: Kishore Kumar
// This page is no longer used in the TOTP-based flow.
// The activation is handled within SignupPage's 3-step flow (register -> scan QR -> done).
// Keeping this file for backward compatibility - redirects to login.

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'

export function ActivatePage() {
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/login', { replace: true })
    }, 3000)
    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-md text-center">
        <div className="rounded-2xl border border-gray-700/50 bg-gray-900/70 p-8 shadow-2xl">
          <div className="mb-6 flex flex-col items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600">
              <ShieldCheck className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-50">Redirecting...</h2>
            <p className="text-sm text-gray-500">
              Activating your account through TOTP is done during signup.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}