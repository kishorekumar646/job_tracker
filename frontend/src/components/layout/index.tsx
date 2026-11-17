// Author: Kishore Kumar
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, Briefcase, Bot, Github, Globe, Linkedin, LayoutDashboard, Link2, LogOut, Crown, Menu, MessageSquareHeart, Rocket, Settings, ShieldCheck, Search, X } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import Admin from '../../pages/Admin'
import { PageLoader } from '../ui'
import { useSettingsStore } from '../../store/settingsStore'
import { SettingsModal } from './SettingsModal'
import { NotificationBell } from './NotificationBell'
import { AppInstall } from '../ui/AppInstall'
import { SessionWarning } from '../ui/SessionDetails'
import { UserAvatar } from '../ui/UserAvatar'
import { AppGuide } from '../ui/AppGuide'
import { FeedbackModal } from '../ui/FeedbackModal'

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className="h-9 w-9" />
      <span className={`text-xl font-extrabold tracking-tight ${light ? 'text-white' : 'text-gray-50'}`}>JobPilot</span>
    </div>
  )
}

export function AccountNavigation() {
  return (
    <header className="account-header">
      <nav className="account-nav" aria-label="Account navigation">
        <Link to="/" aria-label="JobPilot home"><Logo light /></Link>
        <div className="account-nav-links">
          <Link to="/">Home</Link>
          <NavLink to="/login">Log in</NavLink>
          <NavLink to="/signup">Sign up</NavLink>
        </div>
      </nav>
    </header>
  )
}

export const DEVELOPER_LINKS = [
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/kishore-kumar131646', icon: Linkedin },
  { label: 'GitHub', href: 'https://github.com/KishoreKumar646', icon: Github },
  { label: 'Medium', href: 'https://medium.com/@kishorekumar131646', icon: BookOpen },
  { label: 'Profile', href: 'https://kishore-kumar-e41xadp.gamma.site/', icon: Globe },
]

const NAV = [
  { to: '/dashboard', label: 'Dashboard', mobileLabel: 'Home', icon: LayoutDashboard },
  { to: '/jobs', label: 'Find jobs', mobileLabel: 'Jobs', icon: Search },
  { to: '/applications', label: 'Applications', mobileLabel: 'Tracker', icon: Briefcase },
  { to: '/auto-apply', label: 'Auto-apply', mobileLabel: 'Auto-apply', icon: Bot },
  { to: '/connections', label: 'Connections', icon: Link2 },
  { to: '/billing', label: 'Plans', icon: Crown },
]

const MOBILE_NAV = NAV.slice(0, 4)

export function ProtectedRoute() {
  const { user, initialized } = useAuthStore()
  const loc = useLocation()
  if (!initialized) return <PageLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <Outlet />
}

export function AdminRoute() {
  const { user } = useAuthStore()
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />
  return <Admin />
}

export function PublicOnlyRoute() {
  const { user, initialized } = useAuthStore()
  if (!initialized) return <PageLoader />
  if (user) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

const SHORTCUT_ROUTES: Record<string, string> = { KeyD: '/dashboard', KeyJ: '/jobs', KeyB: '/applications', KeyU: '/auto-apply', KeyK: '/connections' }

function useShortcuts() {
  const nav = useNavigate()
  const { openSettings } = useSettingsStore()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const mod = IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
      if (mod && !e.altKey && !e.shiftKey && SHORTCUT_ROUTES[e.code]) { e.preventDefault(); nav(SHORTCUT_ROUTES[e.code]); return }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 's' || e.key === 'S') openSettings('profile')
      else if (e.key === 'p' || e.key === 'P') openSettings('preferences')
      else if (e.key === '?') openSettings('shortcuts')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, openSettings])
}

export function AppLayout() {
  const { user, logout } = useAuthStore()
  const displayName = user?.name || user?.email.split('@')[0] || 'User'
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const drawer = useRef<HTMLDivElement>(null)
  const mainContent = useRef<HTMLElement>(null)
  const { openSettings } = useSettingsStore()
  useShortcuts()
  const loc = useLocation()
  const nav = useNavigate()
  const title = loc.pathname.startsWith('/admin') ? 'Admin' : loc.pathname === '/guide' ? 'Guide' : NAV.find((n) => loc.pathname.startsWith(n.to))?.label ?? 'JobPilot'
  const doLogout = async () => { await logout(); nav('/login') }

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    const wide = window.matchMedia('(min-width: 1024px)')
    const onResize = () => { if (wide.matches) setOpen(false) }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
      if (event.key !== 'Tab') return
      const controls = Array.from(drawer.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)') ?? [])
        .filter((element) => element.getClientRects().length > 0)
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    drawer.current?.querySelector<HTMLButtonElement>('button')?.focus()
    document.addEventListener('keydown', onKey)
    wide.addEventListener('change', onResize)
    return () => {
      document.removeEventListener('keydown', onKey)
      wide.removeEventListener('change', onResize)
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [open])

  const sidebar = (
    <aside className="workspace-sidebar flex h-full flex-col overflow-y-auto border-r border-gray-800">
      <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-5 py-6"><Link to="/" aria-label="JobPilot home"><Logo light /></Link><button type="button" className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 lg:hidden" aria-label="Close navigation" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button></div>
      <nav aria-label="Workspace navigation" data-guide="navigation" className="flex-1 space-y-1 px-3 py-4">
        <p className="workspace-nav-label">YOUR NEXT CHAPTER</p>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `workspace-nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'text-brand-300' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`
            }
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
        {user?.role === 'admin' && (
          <>
            <div className="my-2 border-t border-gray-800" />
            <NavLink
              to="/admin"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `workspace-nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'text-brand-300' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`
              }
            >
              <Crown className="h-4 w-4 flex-shrink-0" />
              Admin
            </NavLink>
          </>
        )}
      </nav>
      <div className="space-y-3 border-t border-gray-800 px-4 py-4">
        <button onClick={() => { setOpen(false); setFeedbackOpen(true) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-brand-500/10 hover:text-brand-400"><MessageSquareHeart className="h-4 w-4" />Share feedback</button>
        <button onClick={doLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-400">
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>
    </aside>
  )

  return (
    <>
      <div className="app-shell relative flex overflow-hidden">
        <div className="hidden w-60 flex-shrink-0 lg:block">{sidebar}</div>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <div ref={drawer} id="workspace-mobile-nav" role="dialog" aria-modal="true" aria-label="Workspace navigation" className="absolute inset-y-0 left-0 w-60 animate-slide-in">{sidebar}</div>
          </div>
        )}
        <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="workspace-topbar relative z-20 flex min-h-16 shrink-0 items-center gap-2 border-b border-gray-800 bg-gray-900/80 px-3 py-2 sm:gap-4 sm:px-6">
            <button data-guide="navigation" aria-expanded={open} aria-controls="workspace-mobile-nav" onClick={() => setOpen((o) => !o)} className="rounded-lg p-2 text-gray-300 hover:bg-gray-800 lg:hidden" aria-label="Menu">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="min-w-0 flex-1"><p className="workspace-header-kicker">YOUR CAREER WORKSPACE</p><p className="truncate text-base font-medium text-gray-100">{title}</p></div>
            <div data-guide="notifications"><NotificationBell /></div>
            <AppGuide />
            <AppInstall />
            <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
              <button data-guide="profile" aria-label="Open profile settings" onClick={() => { setHover(false); openSettings('profile') }} className="group flex min-h-11 items-center gap-2.5 rounded-xl border border-gray-800 bg-gray-800/50 px-2 py-1.5 transition-colors hover:border-gray-700 hover:bg-gray-800 sm:px-3">
                <UserAvatar user={user} className="h-7 w-7 text-xs" />
                <div className="hidden text-left sm:block">
                  <p className="max-w-[8rem] truncate text-xs font-medium leading-tight text-gray-200">{displayName}</p>
                  <p className={`text-[10px] font-medium leading-tight ${user?.role === 'admin' ? 'text-amber-400' : 'text-gray-500'}`}>{user?.role === 'admin' ? 'Admin' : 'Member'}</p>
                </div>
                <Settings className="hidden h-3.5 w-3.5 shrink-0 text-gray-600 group-hover:text-gray-400 sm:block" />
              </button>
              {hover && (
                <div className="absolute right-0 top-full z-50 w-56 pt-2">
                  <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
                    <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-3">
                      <UserAvatar user={user} className="h-9 w-9 text-sm" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-gray-100">{displayName}</p>
                        <p className="truncate text-[10px] text-gray-500">{user?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-[10px] text-gray-500">Role</span>
                      <span className={`text-[10px] font-semibold ${user?.role === 'admin' ? 'text-amber-400' : 'text-gray-300'}`}>{user?.role === 'admin' ? 'Admin' : 'Member'}</span>
                    </div>
                    <div className="border-t border-gray-800 px-4 py-2"><p className="text-[10px] text-gray-600">Click to open settings</p></div>
                  </div>
                </div>
              )}
            </div>
            <button aria-label="Log out" onClick={doLogout} className="hidden min-h-11 items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-400 sm:flex">
              <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Log out</span>
            </button>
          </header>
          <SessionWarning />
          {user && !user.email_verified && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 sm:px-6 sm:text-sm">
              <span>Verify your email to connect job accounts and enable auto-apply.</span>
              <button onClick={() => openSettings('security')} className="shrink-0 rounded-md bg-amber-500/20 px-3 py-1 text-xs font-semibold hover:bg-amber-500/30">Verify now</button>
            </div>
          )}
          <main ref={mainContent} data-guide="workspace" className="workspace-main min-h-0 flex-1 overflow-y-auto">
            <div className="workspace-page min-w-0"><div key={loc.pathname} className="workspace-content"><Outlet /></div></div>
          </main>
          <nav className="workspace-mobile-tabs" aria-label="Mobile workspace navigation">
            {MOBILE_NAV.map(({ to, label, mobileLabel, icon: Icon }) => (
              <NavLink key={to} to={to} aria-label={label} onClick={() => { setOpen(false); mainContent.current?.scrollTo({ top: 0, behavior: 'instant' }) }} className="workspace-mobile-tab">
                <span className="workspace-mobile-tab-icon"><Icon size={20} aria-hidden="true" /></span>
                <span>{mobileLabel}</span>
              </NavLink>
            ))}
            <button type="button" className="workspace-mobile-tab" aria-label="More navigation" aria-expanded={open} aria-controls="workspace-mobile-nav" data-active={open || !MOBILE_NAV.some(({ to }) => loc.pathname.startsWith(to))} onClick={() => setOpen((value) => !value)}>
              <span className="workspace-mobile-tab-icon"><Menu size={20} aria-hidden="true" /></span>
              <span>More</span>
            </button>
          </nav>
        </div>
      </div>
      <SettingsModal />
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </>
  )
}

export function BrandPanel() {
  const points = [
    { icon: Rocket, t: 'A clearer application pipeline', d: 'Create tracker entries for matching roles, then apply on the original websites.' },
    { icon: Link2, t: 'Keep your platform links together', d: 'Save your job-platform profiles without sharing their passwords.' },
    { icon: Bot, t: 'Smart resume matching', d: 'Skills are read from your resume to score every job.' },
    { icon: ShieldCheck, t: 'TOTP security', d: 'Passwordless sign-in with your authenticator app.' },
  ]
  return (
    <div className="auth-brand-panel relative z-10 flex h-full flex-col justify-between p-10 text-white xl:p-14">
      <p className="page-kicker">A MORE CONSIDERED WAY TO SEARCH</p>
      <div className="w-full">
        <h2 className="auth-text-shadow leading-snug tracking-tight">Your next move.<br /><span>A clearer plan.</span></h2>
        <p className="auth-text-shadow mt-4 max-w-xl text-sm leading-relaxed text-gray-300">Find relevant roles, organize your applications and keep every interview and offer in view.</p>
        <ul className="mt-10 space-y-4">
          {points.map(({ icon: Icon, t, d }) => (
            <li key={t} className="flex items-start gap-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
              <div><p className="auth-text-shadow text-sm font-semibold text-gray-100">{t}</p><p className="auth-text-shadow text-xs text-gray-400">{d}</p></div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="flex gap-10">
          {[{ v: 'Find', l: 'Relevant roles' }, { v: 'Track', l: 'Your progress' }, { v: 'Plan', l: 'Next steps' }].map(({ v, l }) => (
            <div key={l}>
              <p className="auth-text-shadow text-2xl font-bold text-brand-400">{v}</p>
              <p className="auth-text-shadow text-xs text-gray-400">{l}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
