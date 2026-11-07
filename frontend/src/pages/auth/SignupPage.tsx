// Author: Kishore Kumar
import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShieldCheck, Mail, KeyRound, QrCode, CheckCircle, UserRound, Cake } from 'lucide-react'
import { signup, getTotpQrUrl, activateAccount } from '../../api/auth'
import { Button } from '../../components/ui/Button'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { TotpTimer } from '../../components/auth/TotpTimer'
import { Shimmer } from '../../components/ui/Shimmer'

type Step = 1 | 2 | 3

export function SignupPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [emailTouched, setEmailTouched] = useState(false)
  const [fullNameTouched, setFullNameTouched] = useState(false)
  const [qrSrc, setQrSrc] = useState<string | null>(null)
  const [qrError, setQrError] = useState(false)
  const [qrRetry, setQrRetry] = useState(0)

  const emailInvalid = emailTouched && email.length > 0 && !email.endsWith('@gmail.com')
  const fullNameEmpty = fullNameTouched && fullName.trim().length === 0
  const fullNameTooLong = fullNameTouched && fullName.trim().length > 15
  const fullNameInvalid = fullNameEmpty || fullNameTooLong

  useEffect(() => {
    const delay = Math.random() * 2000 + 3000
    const t = setTimeout(() => setPageLoading(false), delay)
    return () => clearTimeout(t)
  }, [])

  // Fetch the QR code as a blob for reliable display
  useEffect(() => {
    if (step !== 2) return
    setQrSrc(null)
    setQrError(false)
    let objectUrl: string | null = null
    const controller = new AbortController()
    fetch(getTotpQrUrl(email.trim().toLowerCase()), { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.blob()
      })
      .then(blob => {
        objectUrl = URL.createObjectURL(blob)
        setQrSrc(objectUrl)
      })
      .catch(err => {
        if (err.name !== 'AbortError') setQrError(true)
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [step, email, qrRetry])

  async function handleSignup(e: FormEvent) {
    e.preventDefault()
    if (!email.endsWith('@gmail.com')) {
      setError('Only @gmail.com email addresses are allowed.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await signup(email.trim(), fullName.trim() || undefined, dateOfBirth || undefined)
      setStep(2)
    } catch (err: unknown) {
      const raw = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      const msg = Array.isArray(raw)
        ? (raw[0] as { msg?: string })?.msg ?? 'Registration failed.'
        : (raw as string | undefined) ?? 'Registration failed. Try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleActivate(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await activateAccount(email.trim(), otp.trim())
      setStep(3)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Activation failed. Check your OTP and try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const STEPS = [
    { id: 1, label: 'Register' },
    { id: 2, label: 'Scan QR' },
    { id: 3, label: 'Done' },
  ]

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-gray-700/50 bg-gray-900/70 backdrop-blur-md p-8 shadow-2xl">
        {pageLoading ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-3">
              <Shimmer className="h-14 w-14 rounded-2xl" />
              <Shimmer className="h-6 w-46 rounded" />
              <Shimmer className="h-4 w-36 rounded" />
            </div>
            <div className="flex items-center justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Shimmer className="h-7 w-7 rounded-full" />
                  <Shimmer className="h-3 w-12 rounded" />
                  {i < 2 && <Shimmer className="h-px w-8 rounded" />}
                </div>
              ))}
            </div>
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Shimmer className="h-3 w-24 rounded" />
                <Shimmer className="h-10 w-full rounded-lg" />
              </div>
              <Shimmer className="h-11 w-full rounded-lg" />
            </div>
            <Shimmer className="mx-auto h-4 w-48 rounded" />
          </div>
        ) : (
          <div style={{ animation: 'authCardEnter 0.45s ease-out both' }}>
            {/* Logo */}
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600">
                <ShieldCheck className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-50">Create Account</h2>
              <p className="mt-1 text-sm text-gray-500">Job Portal</p>
            </div>

            {/* Step indicators */}
            <div className="mb-8 flex items-center justify-center gap-2">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      step > s.id
                        ? 'bg-emerald-500 text-white'
                        : step === s.id
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-800 text-gray-600'
                    }`}
                  >
                    {step > s.id ? '✓' : s.id}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      step === s.id ? 'text-primary-400' : 'text-gray-600'
                    }`}
                  >
                    {s.label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`h-px w-8 ${step > s.id ? 'bg-emerald-500' : 'bg-gray-800'}`}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Step 1: Register */}
            {step === 1 && (
              <form onSubmit={handleSignup} className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">
                    Full Name
                  </label>
                  <div className="relative">
                    <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => { setFullName(e.target.value); setError('') }}
                      onBlur={() => setFullNameTouched(true)}
                      placeholder="Kishore Kumar"
                      className={`w-full rounded-lg border bg-gray-800 py-2.5 pl-10 pr-4
                        text-sm text-gray-100 placeholder-gray-600
                        focus:outline-none focus:ring-1
                        ${fullNameInvalid
                          ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                          : 'border-gray-700 focus:border-primary-500 focus:ring-primary-500'
                        }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">
                    Gmail Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError('') }}
                      onBlur={() => setEmailTouched(true)}
                      placeholder="you@gmail.com"
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
                    <p className="mt-1.5 text-xs text-red-400">Only @gmail.com email addresses are allowed.</p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">
                    Date of Birth <span className="text-gray-600">(optional)</span>
                  </label>
                  <div className="relative">
                    <Cake className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                    <input
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2.5 pl-10 pr-4
                        text-sm text-gray-100 placeholder-gray-600
                        focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500
                        [color-scheme:dark]"
                    />
                  </div>
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
                  disabled={!email.endsWith('@gmail.com') || !fullName.trim() || fullName.trim().length > 15}
                >
                  Register
                </Button>
              </form>
            )}

            {/* Step 2: Scan QR + Activate */}
            {step === 2 && (
              <form onSubmit={handleActivate} className="space-y-5">
                <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-4 text-center">
                  <QrCode className="mx-auto mb-3 h-6 w-6 text-primary-400" />
                  <p className="mb-3 text-sm font-medium text-gray-300">
                    Scan this QR with your Authenticator app
                  </p>
                  <div className="mx-auto flex items-center justify-center rounded-lg bg-white" style={{ width: 180, height: 180 }}>
                    {qrSrc && (
                      <img src={qrSrc} alt="TOTP QR Code" className="rounded-lg" style={{ width: 180, height: 180 }} />
                    )}
                    {!qrSrc && !qrError && (
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-primary-500 animate-spin" />
                        <span className="text-xs text-gray-500">Loading QR…</span>
                      </div>
                    )}
                    {qrError && (
                      <div className="flex flex-col items-center gap-2 p-4">
                        <span className="text-xs text-red-400 text-center">QR failed to load</span>
                        <button
                          type="button"
                          onClick={() => setQrRetry(r => r + 1)}
                          className="text-xs text-primary-400 hover:text-primary-300 underline"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    Works with Google Authenticator, Authy, or any TOTP app
                  </p>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-400">Enter 6-digit code</label>
                    {otp.length > 0 && <TotpTimer />}
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
                  disabled={otp.length !== 6}
                >
                  Activate Account
                </Button>
              </form>
            )}

            {/* Step 3: Success */}
            {step === 3 && (
              <div className="space-y-5 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
                  <CheckCircle className="h-8 w-8 text-emerald-400" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-100">Account Activated!</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Your account is ready. You can now sign in.
                  </p>
                </div>
                <Button className="w-full" size="lg" onClick={() => navigate('/login')}>
                  Go to Sign In
                </Button>
              </div>
            )}

            {step < 3 && (
              <p className="mt-6 text-center text-sm text-gray-600">
                Already have an account?{' '}
                <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium">
                  Sign in
                </Link>
              </p>
            )}
          </div>
        )}
      </div>
    </AuthLayout>
  )
}