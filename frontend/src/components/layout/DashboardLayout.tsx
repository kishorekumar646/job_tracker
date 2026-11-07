// Author: Kishore Kumar
import { ReactNode, useCallback, useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { SettingsModal } from '../ui/SettingsModal'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'

interface Props {
  title: string
  children: ReactNode
}

export function DashboardLayout({ title, children }: Props) {
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'profile' | 'preferences' | 'shortcuts'>('profile')

  const openSettings  = useCallback(() => { setSettingsTab('profile');   setShowSettings(true) }, [])
  const openShortcuts = useCallback(() => { setSettingsTab('shortcuts'); setShowSettings(true) }, [])
  const openProfile   = useCallback(() => { setSettingsTab('profile');   setShowSettings(true) }, [])

  useKeyboardShortcuts({ onOpenSettings: openSettings, onOpenShortcuts: openShortcuts, onOpenProfile: openProfile })

  useEffect(() => {
    const handler = () => {}
    window.addEventListener('rca-settings-changed', handler)
    return () => window.removeEventListener('rca-settings-changed', handler)
  }, [])

  return (
    <>
      <div className="relative flex h-screen overflow-hidden">
        <div className="relative flex-shrink-0">
          <Sidebar />
        </div>
        <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative z-10 shrink-0">
            <Header title={title} onOpenSettings={openSettings} />
          </div>
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          initialTab={settingsTab}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  )
}
