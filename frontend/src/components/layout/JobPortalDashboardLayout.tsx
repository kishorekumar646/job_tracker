// Author: Kishore Kumar
import { ReactNode } from 'react'
import { JobPortalSidebar } from './JobPortalSidebar'
import { JobPortalHeader } from './JobPortalHeader'

interface Props {
  title: string
  children: ReactNode
}

export function JobPortalDashboardLayout({ title, children }: Props) {
  return (
    <div className="relative flex h-screen overflow-hidden">
      <JobPortalSidebar />
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <JobPortalHeader title={title} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}