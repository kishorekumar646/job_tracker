// Author: Kishore Kumar
import { ReactNode, useCallback, useState } from 'react'
import { JobPortalSidebar } from './JobPortalSidebar'
import { JobPortalHeader } from './JobPortalHeader'
import { SettingsModal } from '../ui/SettingsModal'

interface Props {
  title: string
  children: ReactNode
}

export function JobPortalDashboardLayout({ title, children }: Props) {
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'profile' | 'preferences' | 'shortcuts'>('profile')

  const openSettings = useCallback(() => { setSettingsTab('profile'); setShowSettings(true) }, [])

  return (
    <>
      <div className="relative flex h-screen overflow-hidden">
        <div className="relative flex-shrink-0">
          <JobPortalSidebar />
        </div>
        <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative z-10 shrink-0">
            <JobPortalHeader title={title} onOpenSettings={openSettings} />
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