// Author: Kishore Kumar
import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, Mail, KeyRound } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../../components/ui/Button'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { TotpTimer } from '../../components/auth/TotpTimer'
import { Shimmer } from '../../components/ui/Shimmer'

function ShimmerWrapper({ className }: { className?: string }) {
  return <Shimmer className={className} />
}

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [emailTouched, setEmailTouched] = useState(false)

  const emailInvalid = emailTouched && email.length > 0 && !email.endsWith('@infosys.com')

  useEffect(() => {
    const delay = Math.random() * 2000 + 3000
    const t = setTimeout(() => setPageLoading(false), delay)
    return () => clearTimeout(t)
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.endsWith('@infosys.com')) {
      setError('Only @infosys.com email addresses are allowed.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await login(email.trim(), otp.trim())
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Login failed. Check your email and OTP.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-gray-700/50 bg-gray-900/70 backdrop-blur-md p-8 shadow-2xl">
        {pageLoading ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-3">
              <ShimmerWrapper className="h-14 w-14 rounded-2xl" />
              <ShimmerWrapper className="h-6 w-40 rounded" />
              <ShimmerWrapper className="h-4 w-32 rounded" />
            </div>
            <div className="space-y-5">
              <div className="space-y-1.5">
                <ShimmerWrapper className="h-3 w-24 rounded" />
                <ShimmerWrapper className="h-10 w-full rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <ShimmerWrapper className="h-3 w-32 rounded" />
                <ShimmerWrapper className="h-10 w-full rounded-lg" />
                <ShimmerWrapper className="h-3 w-56 rounded" />
              </div>
              <ShimmerWrapper className="h-11 w-full rounded-lg" />
            </div>
            <ShimmerWrapper className="mx-auto h-4 w-48 rounded" />
          </div>
        ) : (
          <div style={{ animation: 'authCardEnter 0.45s ease-out both' }}>
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600">
                <ShieldCheck className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-50">Job Portal</h2>
              <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">
                  Infosys Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError('') }}
                    onBlur={() => setEmailTouched(true)}
                    placeholder="you@infosys.com"
                    className={`w-full rounded-lg border bg-gray-800 py-2.5 pl-10 pr-4
                      text-sm text-gray-100 placeholder-gray-600
                      focus:outline-none focus:ring-1
                      ${emailInvalid
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                        : 'border-gray-700 focus:border-primary-500 focus:ring-primary-500'
                      }`}
                  />
                </div>
                {emailInvalid && (
                  <p className="mt-1.5 text-xs text-red-400">Only @infosys.com email addresses are allowed.</p>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-400">Authenticator OTP</label>
                  {email.endsWith('@infosys.com') && <TotpTimer />}
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setError('') }}
                    placeholder="6-digit code"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2.5 pl-10 pr-4
                      text-sm text-gray-100 placeholder-gray-600 tracking-widest
                      focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-600">
                  Open Google Authenticator / Authy for your 6-digit code.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                loading={loading}
                disabled={!email.endsWith('@infosys.com') || otp.length !== 6}
              >
                Sign In
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-600">
              Don't have an account?{' '}
              <Link to="/signup" className="text-primary-400 hover:text-primary-300 font-medium">
                Sign up
              </Link>
            </p>
          </div>
        )}
      </div>
    </AuthLayout>
  )
}