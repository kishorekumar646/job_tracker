// Author: Kishore Kumar
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CheckCircle2, Fingerprint, Smartphone } from 'lucide-react'
import { authApi } from '../api'
import { errorMessage } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { AccountNavigation, BrandPanel } from '../components/layout'
import { Field, Spinner, TotpTimer } from '../components/ui'
import { JobConstellation } from '../components/ui/JobConstellation'
import type { SignupResponse } from '../types'
import { isMobileDevice } from '../utils/device'
import { passkeyError, passkeyPreferred, passkeysApi, platformPasskeyAvailable } from '../utils/passkeys'

const GMAIL_RE = /^[^\s@]+@gmail\.com$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const STEPS = ['Register', 'Set up', 'Done']

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [touched, setTouched] = useState(false)
  return (
    <div>
    <input
      className="input text-center font-mono text-2xl tracking-[0.5em]"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      onFocus={() => setTouched(true)}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder="••••••"
      aria-label="6-digit authenticator code"
    />
    {touched && <div className="mt-2 flex items-center justify-between text-xs text-gray-500"><span>Code refreshes every 30 seconds</span><TotpTimer /></div>}
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-bg relative flex min-h-screen flex-col overflow-hidden">
      <JobConstellation className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]" />
      <AccountNavigation />
      <div className="auth-layout relative z-10 flex flex-1">
      <div className="hidden lg:block lg:w-[54%]">
        <BrandPanel />
      </div>
      <div className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="w-full animate-fade-up">
          <div className="auth-card card p-5 sm:p-8">{children}</div>
        </div>
        </div>
      </div>
    </div>
  )
}

const ErrorBox = ({ msg }: { msg: string }) =>
  msg ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300">{msg}</div> : null

export function LoginPage() {
  const nav = useNavigate()
  const loc = useLocation()
  const setUser = useAuthStore((s) => s.setUser)
  const state = loc.state as { from?: string; justActivated?: boolean } | null
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deviceAvailable, setDeviceAvailable] = useState(false)
  const [deviceMode, setDeviceMode] = useState(false)
  useEffect(() => {
    let active = true
    platformPasskeyAvailable().then((available) => {
      if (active) {
        setDeviceAvailable(available)
        try { setDeviceMode(!state?.justActivated && available && passkeyPreferred()) } catch { setError('Browser storage is blocked. You can still sign in using your authenticator.') }
      }
    }).catch((e) => { if (active) setError(passkeyError(e)) })
    return () => { active = false }
  }, [state?.justActivated])
  const emailErr = email && !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address' : ''
  const valid = EMAIL_RE.test(email.trim()) && otp.length === 6

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    setError('')
    if (!valid) return
    setBusy(true)
    try {
      const res = await authApi.login({ email: email.trim(), otp })
      setUser(res.user)
      nav(state?.justActivated ? '/onboarding' : state?.from || '/dashboard', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setOtp('')
    } finally {
      setBusy(false)
    }
  }

  const signInWithDevice = async () => {
    setBusy(true)
    setError('')
    try {
      const session = await passkeysApi.login()
      setUser(session.user)
      nav(state?.from || '/dashboard', { replace: true })
    } catch (e) {
      setError(passkeyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <h1 className="text-3xl font-extrabold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-gray-400">{deviceMode ? 'Use the passkey you enabled in Profile settings.' : 'Sign in with the 6-digit code from your authenticator app.'}</p>
      {deviceMode ? (
        <div className="mt-8 space-y-5">
          <ErrorBox msg={error} />
          <button type="button" className="btn-primary w-full py-3" disabled={busy} onClick={() => void signInWithDevice()}>{busy ? <Spinner /> : <Fingerprint className="h-5 w-5" />}Sign in with device</button>
          <p className="text-xs text-gray-500">Face ID, fingerprint or device PIN. You must enable this first in Profile settings.</p>
        </div>
      ) : <form onSubmit={submit} noValidate className="mt-8 space-y-5">
        {state?.justActivated && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300">Account activated — sign in to get started.</div>}
        <ErrorBox msg={error} />
        <Field label="Email" error={emailErr}>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" />
        </Field>
        <Field label="Authenticator code"><OtpInput value={otp} onChange={setOtp} /></Field>
        <button className="btn-primary w-full py-3" disabled={busy || !valid}>{busy && <Spinner />}Sign in</button>
      </form>}
      {deviceAvailable && <button type="button" className="mt-4 w-full text-center text-xs font-medium text-brand-400 hover:text-brand-300 disabled:opacity-40" disabled={busy} onClick={() => { setDeviceMode((value) => !value); setError('') }}>{deviceMode ? 'Use authenticator code instead' : 'Use device sign-in instead'}</button>}
      <p className="mt-8 text-center text-sm text-gray-400">
        Don't have an account? <Link to="/signup" className="font-semibold text-brand-400 hover:text-brand-300">Sign up free</Link>
      </p>
    </Shell>
  )
}

export function SignupPage() {
  const nav = useNavigate()
  const mobile = isMobileDevice()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [setup, setSetup] = useState<SignupResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const today = new Date().toISOString().split('T')[0]
  const nameErr = name && name.trim().length < 2 ? 'Enter your full name' : ''
  const dobErr = dob && dob >= today ? 'Date of birth must be in the past' : ''
  const emailErr = email && !GMAIL_RE.test(email.trim()) ? 'Only @gmail.com addresses can sign up' : ''
  const formValid = name.trim().length >= 2 && !!dob && dob < today && GMAIL_RE.test(email.trim())

  const register = async (ev: FormEvent) => {
    ev.preventDefault()
    setError('')
    if (!formValid) return
    setBusy(true)
    try {
      setSetup(await authApi.signup({ full_name: name.trim(), date_of_birth: dob, email: email.trim() }))
      setStep(2)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const activate = async (ev: FormEvent) => {
    ev.preventDefault()
    setError('')
    if (otp.length !== 6) return
    setBusy(true)
    try {
      await authApi.activate({ email: email.trim(), otp })
      setStep(3)
    } catch (err) {
      setError(errorMessage(err))
      setOtp('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <h1 className="text-3xl font-extrabold tracking-tight">Create your account</h1>
      <ol className="mb-8 mt-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step > i + 1 ? 'bg-emerald-500 text-white' : step === i + 1 ? 'bg-brand-600 text-white shadow-glow' : 'bg-gray-700 text-gray-400'}`}>
              {step > i + 1 ? '✓' : i + 1}
            </span>
            <span className={`text-xs font-semibold ${step === i + 1 ? 'text-gray-50' : 'text-gray-500'}`}>{s}</span>
            {i < STEPS.length - 1 && <span className={`h-px flex-1 ${step > i + 1 ? 'bg-emerald-500' : 'bg-gray-700'}`} />}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <form onSubmit={register} noValidate className="space-y-5">
          <ErrorBox msg={error} />
          <Field label="Full name" error={nameErr}>
            <input className="input" autoComplete="name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Kishore Kumar" />
          </Field>
          <Field label="Date of birth" error={dobErr}>
            <input className="input" type="date" max={today} value={dob} onChange={(e) => setDob(e.target.value)} />
          </Field>
          <Field label="Gmail address" error={emailErr}>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" />
          </Field>
          <button className="btn-primary w-full py-3" disabled={busy || !formValid}>{busy && <Spinner />}Register</button>
        </form>
      )}

      {step === 2 && setup && (
        <form onSubmit={activate} noValidate className="space-y-5">
          <ErrorBox msg={error} />
          <div className="rounded-2xl border border-gray-800 bg-gray-800/50 p-4 text-center">
            <p className="mb-3 text-sm font-semibold text-gray-200">{mobile ? 'Add JobPilot to your authenticator' : 'Scan this QR with your phone\'s authenticator app'}</p>
            <img src={setup.qr_code} alt="Authenticator QR code" className="mx-auto h-48 w-48 rounded-lg bg-gray-900 p-2" />
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-400"><Smartphone className="h-3.5 w-3.5" />Google Authenticator, Microsoft Authenticator, Authy…</p>
            {mobile && (
              <>
                <a href={setup.otpauth_url} className="btn-primary mt-4 w-full"><Smartphone className="h-4 w-4 shrink-0" />Open in Authenticator</a>
                <p className="mt-2 text-xs text-gray-400">Open a compatible installed authenticator, then return here and enter its 6-digit code. Or scan the QR from another device.</p>
              </>
            )}
            <p className="mt-3 text-xs text-gray-400">{mobile ? 'If no app opens, add an account in your authenticator using this setup key:' : 'Can\'t scan? Enter this key manually in your authenticator:'}</p>
            <code className="mt-1 block select-all break-all rounded-lg bg-gray-900 px-3 py-2 font-mono text-xs font-semibold text-gray-100">{setup.totp_secret}</code>
          </div>
          <Field label="Enter 6-digit code"><OtpInput value={otp} onChange={setOtp} /></Field>
          <button className="btn-primary w-full py-3" disabled={busy || otp.length !== 6}>{busy && <Spinner />}Activate account</button>
          <button type="button" className="btn-ghost w-full" onClick={() => { setStep(1); setOtp(''); setError('') }}>Back</button>
        </form>
      )}

      {step === 3 && (
        <div className="space-y-5 py-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><CheckCircle2 className="h-9 w-9" /></div>
          <div>
            <p className="text-xl font-bold">Account activated!</p>
            <p className="mt-1 text-sm text-gray-400">Your account is ready. Sign in with a code from your authenticator app.</p>
          </div>
          <button className="btn-primary w-full py-3" onClick={() => nav('/login', { state: { justActivated: true } })}>Go to sign in</button>
        </div>
      )}

      {step < 3 && (
        <p className="mt-8 text-center text-sm text-gray-400">
          Already have an account? <Link to="/login" className="font-semibold text-brand-400 hover:text-brand-300">Sign in</Link>
        </p>
      )}
    </Shell>
  )
}
