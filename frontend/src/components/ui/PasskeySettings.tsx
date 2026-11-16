// Author: Kishore Kumar
import { useEffect, useState } from 'react'
import { Fingerprint, Trash2 } from 'lucide-react'
import { Field, PageLoader, Spinner, Toggle } from '.'
import { toast } from '../../store/toastStore'
import { isMobileDevice } from '../../utils/device'
import { passkeyError, passkeyPreferred, passkeysApi, platformPasskeyAvailable, setPasskeyPreferred, type DevicePasskey } from '../../utils/passkeys'

export function PasskeySettings() {
  const [keys, setKeys] = useState<DevicePasskey[] | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [otp, setOtp] = useState('')
  const [name, setName] = useState(isMobileDevice() ? 'My phone' : 'My computer')
  const [busy, setBusy] = useState(false)
  const [preferred, setPreferred] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    passkeysApi.list().then((rows) => { if (active) setKeys(rows) }).catch((e) => { if (active) setError(passkeyError(e)) })
    platformPasskeyAvailable().then((value) => { if (active) setAvailable(value) }).catch((e) => { if (active) { setAvailable(false); setError(passkeyError(e)) } })
    try { setPreferred(passkeyPreferred()) } catch { setError('Browser storage is blocked; the default sign-in preference cannot be saved.') }
    return () => { active = false }
  }, [reload])

  const savePreference = (value: boolean) => {
    try {
      setPasskeyPreferred(value)
      setPreferred(value)
      return true
    } catch {
      toast.error('Browser storage is blocked; the default sign-in preference could not be saved.')
      return false
    }
  }
  const change = async (remove?: DevicePasskey) => {
    if (busy || otp.length !== 6) return
    setBusy(true)
    setError('')
    try {
      if (remove) {
        await passkeysApi.remove(remove.id, otp)
        const remaining = (keys ?? []).filter((key) => key.id !== remove.id)
        setKeys(remaining)
        if (!remaining.length) savePreference(false)
        toast.success('Device sign-in removed.')
      } else {
        const key = await passkeysApi.register(otp, name.trim() || 'My device')
        setKeys((current) => [...(current ?? []), key])
        const savedDefault = savePreference(true)
        toast.success(savedDefault ? 'Device sign-in enabled and set as the default in this browser.' : 'Device sign-in enabled.')
      }
    } catch (e) {
      setError(passkeyError(e))
    } finally {
      setOtp('')
      setBusy(false)
    }
  }

  return (
    <section data-guide="passkeys" className="card card-pad space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Fingerprint className="h-4 w-4 text-brand-400" />Biometric & device sign-in</h2>
      <p className="text-xs leading-relaxed text-gray-400">Enable a passkey to sign in with Face ID, fingerprint or your device PIN. Your device chooses the verification method; JobPilot never receives biometric data. Keep your authenticator as a fallback.</p>
      {error && <div role="alert" className="rounded-lg border border-rose-500/30 p-3 text-xs text-rose-300">{error}<button type="button" className="ml-2 underline" disabled={busy} onClick={() => { setError(''); setReload((n) => n + 1) }}>Reload devices</button></div>}
      {available === false && <p className="text-xs text-amber-300">This browser needs HTTPS and a supported screen lock or platform authenticator. You can still use TOTP.</p>}
      {!keys && !error ? <PageLoader variant="table" /> : (
        <>
          {!!keys?.length && (
            <div className="space-y-3">
              <Toggle checked={preferred} onChange={savePreference} label="Use device sign-in by default in this browser" />
              {keys.map((key) => (
                <div key={key.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 p-3">
                  <div className="min-w-0"><p className="truncate text-sm">{key.name}</p><p className="text-[11px] text-gray-500">Added {new Date(key.created_at).toLocaleDateString()}</p></div>
                  <button type="button" className="btn-danger btn-sm" aria-label={`Remove ${key.name}`} disabled={busy || otp.length !== 6} onClick={() => void change(key)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Device name"><input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="My phone" disabled={busy} /></Field>
            <Field label="Authenticator code to add or remove a device"><input className="input font-mono tracking-widest" aria-label="Device setup authenticator code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" disabled={busy} /></Field>
          </div>
          <button type="button" className="btn-primary" disabled={busy || !available || !keys || otp.length !== 6} onClick={() => void change()}>{busy ? <Spinner /> : <Fingerprint className="h-4 w-4" />}{keys?.length ? 'Add device passkey' : 'Enable device sign-in'}</button>
        </>
      )}
    </section>
  )
}
