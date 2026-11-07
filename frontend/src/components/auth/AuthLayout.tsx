// Author: Kishore Kumar
import type { ReactNode } from 'react'
import { ShieldCheck, Briefcase, BarChart3, Settings, CheckCircle } from 'lucide-react'

const ANIM_CSS = `
@keyframes authPanelEnter {
  from { opacity: 0; transform: translateX(-24px); }
  to   { opacity: 1; transform: translateX(0);     }
}
@keyframes authCardEnter {
  from { opacity: 0; transform: translateY(10px) scale(0.99); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    }
}
@keyframes authRightEnter {
  from { opacity: 0; transform: translateX(16px); }
  to   { opacity: 1; transform: translateX(0);    }
}
.auth-text-shadow { text-shadow: 0 1px 14px rgba(0,0,0,1), 0 0 28px rgba(0,0,0,0.9); }
`

const FEATURES = [
  { Icon: Briefcase, label: 'Job Applications',  desc: 'Track and manage all your applications in one place' },
  { Icon: BarChart3, label: 'Application Stats',   desc: 'Monitor your job search progress and trends' },
  { Icon: Settings,  label: 'Application Status', desc: 'Track interview stages and offer status' },
  { Icon: CheckCircle, label: 'TOTP Security', desc: 'Secure authentication with authenticator apps' },
]

const STATS = [
  { value: '∞', label: 'Applications' },
  { value: '20+', label: 'Companies' },
  { value: '✓', label: 'TOTP Auth' },
]

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <style>{ANIM_CSS}</style>

      {/* Left branding panel (lg+) */}
      <div className="hidden lg:flex lg:w-[54%]">
        <div
          className="flex flex-col justify-between p-14 w-full"
          style={{ animation: 'authPanelEnter 0.8s ease-out both' }}
        >
          {/* Brand mark */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 shadow-lg shadow-primary-900/50">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <span className="auth-text-shadow text-base font-bold text-gray-200 tracking-wide">Job Portal</span>
          </div>

          {/* Headline + feature list */}
          <div>
            <h1 className="auth-text-shadow text-4xl font-extrabold text-gray-50 leading-snug mb-3">
              Job<br />
              <span className="text-primary-400">Tracker</span><br />
              Portal
            </h1>
            <p className="auth-text-shadow text-sm text-gray-300 mb-10 max-w-xs leading-relaxed">
              Track your job applications, manage status updates,
              and organize your career journey with TOTP security.
            </p>

            <div className="space-y-3">
              {FEATURES.map(({ Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary-400" />
                  <div>
                    <p className="auth-text-shadow text-sm font-semibold text-gray-100">{label}</p>
                    <p className="auth-text-shadow text-xs text-gray-400">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex gap-10 pt-8">
            {STATS.map(({ value, label }) => (
              <div key={label}>
                <p className="auth-text-shadow text-2xl font-bold text-primary-400">{value}</p>
                <p className="auth-text-shadow text-xs text-gray-400">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div
          className="w-full max-w-md"
          style={{ animation: 'authRightEnter 0.6s ease-out 0.1s both' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}