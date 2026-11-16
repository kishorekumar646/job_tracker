// Author: Kishore Kumar
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera, Check, ShieldCheck } from 'lucide-react'
import { authApi, profileApi } from '../api'
import { errorMessage } from '../api/client'
import { ResumeUploader } from '../components/features'
import { Field, PageLoader, ProgressRing, Spinner, TagInput, ThemePicker } from '../components/ui'
import { toast } from '../store/toastStore'
import { useAuthStore } from '../store/authStore'
import type { Profile as ProfileT } from '../types'
import { SessionDetails } from '../components/ui/SessionDetails'
import { UserAvatar } from '../components/ui/UserAvatar'
import { PasskeySettings } from '../components/ui/PasskeySettings'

function EmailVerification() {
  const { user, setUser } = useAuthStore()
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  if (!user) return null

  const box = 'flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5'

  if (user.email_verified) {
    return (
      <div className={`${box} border-emerald-500/30 bg-emerald-500/5`}>
        <Check className="h-4 w-4 shrink-0 text-emerald-400" />
        <p className="text-sm text-gray-100">Email verified</p>
      </div>
    )
  }

  const send = async () => {
    setBusy(true)
    try {
      const r = await authApi.sendEmailCode()
      setSent(true)
      toast.success(r.message)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const verify = async (e: FormEvent) => {
    e.preventDefault()
    if (code.length !== 6) return
    setBusy(true)
    try {
      setUser(await authApi.verifyEmail(code))
      toast.success('Email verified.')
    } catch (err) {
      toast.error(errorMessage(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${box} border-amber-500/30 bg-amber-500/5`}>
      <p className="min-w-0 flex-1 text-sm text-gray-100">Email not verified<span className="block truncate text-[11px] text-gray-500">Needed to connect accounts and auto-apply</span></p>
      {!sent ? (
        <button className="text-xs font-medium text-brand-400 hover:text-brand-300 disabled:opacity-50" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
      ) : (
        <form onSubmit={verify} className="flex flex-wrap items-center gap-2">
          <input className="w-28 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-center font-mono text-sm tracking-[0.3em] text-gray-100 focus:border-brand-500 focus:outline-none" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" aria-label="6-digit email code" />
          <button className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-40" disabled={busy || code.length !== 6}>Verify</button>
          <button type="button" className="text-xs text-gray-500 hover:text-gray-300" onClick={send} disabled={busy}>Resend</button>
        </form>
      )}
    </div>
  )
}

function AccountCard() {
  const { user, setUser } = useAuthStore()
  const [name, setName] = useState(user?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const photoInput = useRef<HTMLInputElement>(null)
  if (!user) return null
  const isAdmin = user.role === 'admin'
  const since = user.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : null

  const save = async () => {
    if (!name.trim() || busy || photoBusy) return
    setBusy(true)
    try {
      setUser(await authApi.updateName(name.trim()))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const savePhoto = async (file: File | null) => {
    if (busy || photoBusy) return
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Choose a JPG, PNG or WebP photo.')
      return
    }
    if (file && file.size > 2 * 1024 * 1024) {
      toast.error('Photo must be 2 MB or smaller.')
      return
    }
    setPhotoBusy(true)
    try {
      const updated = file ? await profileApi.uploadAvatar(file) : await profileApi.deleteAvatar()
      const current = useAuthStore.getState().user
      if (current?.id === updated.id) {
        setUser({ ...current, avatar: updated.avatar })
        toast.success(file ? 'Profile photo updated.' : 'Profile photo removed.')
      }
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setPhotoBusy(false)
    }
  }

  return (
    <section className="card space-y-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-4">
        <UserAvatar user={user} className="h-14 w-14 text-lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-100">{user.name ?? '—'}</p>
          <p className="truncate text-xs text-gray-500">{user.email}</p>
          {since && <p className="mt-1 text-[11px] text-gray-500">Member since {since}</p>}
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-4 border-t border-gray-800 pt-4"><div><p className="label mb-3">Accent colour</p><ThemePicker dark /></div><span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${isAdmin ? 'bg-amber-900/40 text-amber-400 ring-amber-800' : 'bg-brand-900/40 text-brand-400 ring-brand-800'}`}>{isAdmin ? 'Admin' : 'User'}</span></div>
      </div>
      <div className="space-y-2">
        <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Profile photo" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void savePhoto(file) }} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-sm" disabled={busy || photoBusy} onClick={() => photoInput.current?.click()}>{photoBusy ? <Spinner /> : <Camera className="h-3.5 w-3.5" />}{user.avatar ? 'Change photo' : 'Upload photo'}</button>
          {user.avatar && <button type="button" className="btn-secondary btn-sm" disabled={busy || photoBusy} onClick={() => void savePhoto(null)}>Remove photo</button>}
        </div>
        <p className="text-[11px] text-gray-500">JPG, PNG or WebP, up to 2 MB. Photos are resized and metadata is removed.</p>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-400">Full name</label>
        <div className="flex gap-2">
          <input value={name} maxLength={100} placeholder="Your name" onChange={(e) => { setName(e.target.value); setSaved(false) }} onKeyDown={(e) => e.key === 'Enter' && save()}
            className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-brand-500 focus:outline-none" />
          <button onClick={save} disabled={busy || photoBusy || !name.trim() || name.trim() === (user.name ?? '')}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-40 ${saved ? 'bg-emerald-600' : 'bg-brand-600 hover:bg-brand-500'}`}>
            {saved ? <Check className="h-4 w-4" /> : busy ? '…' : 'Save'}
          </button>
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-400">Email</label>
        <input readOnly value={user.email} className="w-full cursor-not-allowed rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-400" />
      </div>
    </section>
  )
}

export function SecurityPanel() {
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <div className="min-w-0 space-y-5">
        <section className="card space-y-4 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-brand-400" />Account protection</h2>
          <p className="text-sm text-gray-300">Authenticator app (TOTP) sign-in</p>
          <p className="text-xs leading-relaxed text-gray-400">Use a fresh 6-digit authenticator code to sign in or manage device passkeys. Keep access to your authenticator; contact an administrator if you need account recovery.</p>
          <EmailVerification />
        </section>
        <SessionDetails />
      </div>
      <PasskeySettings />
    </div>
  )
}

export function ProfilePanel() {
  const [profile, setProfile] = useState<ProfileT | null>(null)
  const [form, setForm] = useState({ headline: '', summary: '', phone: '', location: '', experience: '' })
  const [skills, setSkills] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const expErr = form.experience.trim() !== '' && (Number.isNaN(Number(form.experience)) || Number(form.experience) < 0 || Number(form.experience) > 60) ? 'Enter 0–60 years' : ''

  const apply = (p: ProfileT) => {
    setProfile(p)
    setSkills(p.skills)
    setForm({ headline: p.headline ?? '', summary: p.summary ?? '', phone: p.phone ?? '', location: p.location ?? '', experience: p.experience_years?.toString() ?? '' })
  }
  useEffect(() => { profileApi.get().then(apply).catch((e) => toast.error(errorMessage(e))) }, [])

  if (!profile) return <PageLoader variant="form" />

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (expErr) return
    const exp = form.experience.trim() === '' ? null : Number(form.experience)
    setBusy(true)
    try {
      apply(await profileApi.update({ headline: form.headline.trim() || null, summary: form.summary.trim() || null, phone: form.phone.trim() || null, location: form.location.trim() || null, experience_years: exp, skills }))
      toast.success('Profile saved.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <AccountCard />
      <div className="min-w-0 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-gray-500">Your resume skills drive job matching and auto-apply.</p>
          <ProgressRing value={profile.completeness} />
        </div>
        <section className="card p-4 sm:p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-100">Resume</h2>
          <ResumeUploader profile={profile} onChange={apply} />
        </section>

        <form onSubmit={save} className="card space-y-5 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-gray-100">About you</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Headline"><input className="input" value={form.headline} maxLength={160} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Senior React Developer" /></Field>
            <Field label="Current location"><input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Bengaluru" /></Field>
            <Field label="Phone"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 …" /></Field>
            <Field label="Years of experience" error={expErr}><input className="input" inputMode="decimal" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} placeholder="3.5" /></Field>
          </div>
          <Field label="Summary"><textarea className="input min-h-[96px]" maxLength={2000} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="A short pitch about your experience" /></Field>
          <Field label="Skills"><TagInput value={skills} onChange={setSkills} max={60} placeholder="Add a skill and press Enter" /></Field>
          <button className="btn-primary" disabled={busy || !!expErr}>{busy && <Spinner />}Save profile</button>
        </form>

      </div>
    </div>
  )
}
