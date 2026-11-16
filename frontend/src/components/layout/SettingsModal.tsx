// Author: Kishore Kumar
import { useEffect } from 'react'
import { BookOpen, Keyboard, ShieldCheck, SlidersHorizontal, UserCircle, X } from 'lucide-react'
import { ProfilePanel, SecurityPanel } from '../../pages/Profile'
import { PreferencesPanel } from '../../pages/Preferences'
import { useSettingsStore, type SettingsTab } from '../../store/settingsStore'

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

const SHORTCUTS: { group: string; items: { keys: string[]; label: string }[] }[] = [
  {
    group: 'Navigation',
    items: [
      { keys: [MOD, 'D'], label: 'Go to Dashboard' },
      { keys: [MOD, 'J'], label: 'Go to Find jobs' },
      { keys: [MOD, 'B'], label: 'Go to Applications' },
      { keys: [MOD, 'U'], label: 'Go to Auto-apply' },
      { keys: [MOD, 'K'], label: 'Go to Connections' },
    ],
  },
  {
    group: 'Actions',
    items: [
      { keys: ['S'], label: 'Open Settings' },
      { keys: ['P'], label: 'Open Preferences' },
      { keys: ['?'], label: 'Open shortcuts (this tab)' },
      { keys: ['Esc'], label: 'Close settings' },
    ],
  },
]

function Kbd({ k }: { k: string }) {
  return <kbd className="inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded-md border border-gray-600 bg-gray-800 px-1.5 font-mono text-xs font-semibold text-gray-300 shadow-sm">{k}</kbd>
}

const TABS: { id: SettingsTab; label: string; icon: typeof UserCircle }[] = [
  { id: 'profile', label: 'Profile', icon: UserCircle },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
]

export function SettingsModal() {
  const { open, tab, openSettings, close } = useSettingsStore()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-4" onMouseDown={close}>
      <div role="dialog" aria-modal="true" aria-label="Settings" className="card flex max-h-[94dvh] w-full min-w-0 max-w-6xl animate-fade-up flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="dialog-heading text-2xl">Settings</h2>
          <div className="flex items-center gap-3"><button aria-label="Open settings guide" className="flex items-center gap-1.5 text-xs text-brand-400" onClick={() => window.dispatchEvent(new Event('jobpilot:guide'))}><BookOpen className="h-4 w-4" />Guide</button><button className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-200" onClick={close} aria-label="Close"><X className="h-5 w-5" /></button></div>
        </div>
        <div className="grid shrink-0 grid-cols-2 border-b border-gray-800 px-2 sm:flex sm:px-6">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-pressed={tab === id}
              onClick={() => openSettings(id)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${tab === id ? 'border-brand-500 text-brand-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
        <div key={tab} data-guide="settings-content" className="panel-transition min-h-0 flex-1 overflow-y-auto p-3 sm:p-6">
          {tab === 'profile' && <ProfilePanel />}
          {tab === 'security' && <SecurityPanel />}
          {tab === 'preferences' && <PreferencesPanel />}
          {tab === 'shortcuts' && (
            <div className="space-y-6">
              {SHORTCUTS.map((g) => (
                <section key={g.group}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{g.group}</p>
                  <ul className="divide-y divide-gray-800 rounded-xl border border-gray-800">
                    {g.items.map((it) => (
                      <li key={it.label} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
                        <span className="text-sm text-gray-300">{it.label}</span>
                        <span className="flex items-center gap-1">{it.keys.map((k, i) => <Kbd key={i} k={k} />)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
