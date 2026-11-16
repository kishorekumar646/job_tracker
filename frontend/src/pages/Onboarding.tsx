// Author: Kishore Kumar
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { connectionsApi, profileApi } from '../api'
import { errorMessage } from '../api/client'
import { ConnectionsGrid, PreferencesForm, ResumeUploader, usePreferences } from '../components/features'
import { Logo } from '../components/layout'
import { PageLoader } from '../components/ui'
import { AppGuide } from '../components/ui/AppGuide'
import { toast } from '../store/toastStore'
import type { Connection, Profile } from '../types'

const STEPS = ['Resume', 'Preferences', 'Connect accounts']

export default function Onboarding() {
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [prefs, setPrefs] = usePreferences()
  const [conns, setConns] = useState<Connection[] | null>(null)

  useEffect(() => {
    profileApi.get().then(setProfile).catch((e) => toast.error(errorMessage(e)))
    connectionsApi.list().then(setConns).catch((e) => toast.error(errorMessage(e)))
  }, [])

  const finish = () => nav('/dashboard', { replace: true })
  const next = () => (step === STEPS.length - 1 ? finish() : setStep(step + 1))

  return (
    <div className="onboarding-page min-h-screen px-4 py-6 sm:py-10">
      <div className="w-full">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" aria-label="JobPilot home"><Logo /></Link>
          <div className="flex items-center gap-3"><AppGuide automatic={false} /><button className="text-sm font-semibold text-gray-400 hover:text-gray-100" onClick={finish}>Skip for now</button></div>
        </div>
        <p className="page-kicker mb-5">A LITTLE SETUP. A CLEARER DIRECTION.</p>
        <ol className="mb-8 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-600 text-white shadow-glow' : 'bg-gray-700 text-gray-400'}`}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`hidden text-sm font-semibold sm:block ${i === step ? 'text-gray-50' : 'text-gray-500'}`}>{s}</span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-gray-600" />}
            </li>
          ))}
        </ol>

        <div data-guide="onboarding-content" className="card card-pad animate-fade-up" key={step}>
          {step === 0 && (
            <>
              <h1 className="text-2xl font-extrabold">Upload your resume</h1>
              <p className="mb-6 mt-1 text-sm text-gray-400">We read your skills so we can match you with the right jobs.</p>
              {profile ? <ResumeUploader profile={profile} onChange={setProfile} /> : <PageLoader variant="form" />}
              {profile && profile.skills.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {profile.skills.slice(0, 20).map((s) => <span key={s} className="badge bg-brand-500/10 text-brand-300 ring-brand-500/30">{s}</span>)}
                </div>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <h1 className="text-2xl font-extrabold">What are you looking for?</h1>
              <p className="mb-6 mt-1 text-sm text-gray-400">Pick the job titles and locations you want us to apply for.</p>
              {prefs ? <PreferencesForm prefs={prefs} onSaved={(p) => { setPrefs(p); setStep(2) }} submitLabel="Save & continue" /> : <PageLoader variant="form" />}
            </>
          )}
          {step === 2 && (
            <>
              <h1 className="text-2xl font-extrabold">Connect your job accounts</h1>
              <p className="mb-6 mt-1 text-sm text-gray-400">Connect at least one platform so auto-apply knows where to apply.</p>
              {conns ? <ConnectionsGrid items={conns} onChange={(c) => setConns((l) => l?.map((x) => (x.platform === c.platform ? c : x)) ?? l)} /> : <PageLoader variant="cards" />}
            </>
          )}
        </div>

        <div className="mt-6 flex justify-between">
          <button className="btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {step !== 1 && (
            <button className="btn-primary" onClick={next}>
              {step === STEPS.length - 1 ? 'Go to dashboard' : 'Continue'} <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
