// Author: Kishore Kumar
import { BookOpen, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { useSettingsStore } from '../store/settingsStore'
import { PAGE_GUIDES } from '../utils/guides'

export default function Guide() {
  const admin = useAuthStore((s) => s.user?.role === 'admin')
  const openSettings = useSettingsStore((s) => s.openSettings)
  return (
    <>
      <PageHeader title="JobPilot guide" subtitle="One guide per page. Open a page, then use its Guide button for focused help." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(PAGE_GUIDES).filter(([key, guide]) => key !== '/guide' && (!guide.admin || admin)).map(([key, guide]) => (
          <section key={key} className="card card-pad flex flex-col items-start">
            <BookOpen className="mb-4 h-5 w-5 text-brand-400" /><h2 className="text-sm font-semibold">{guide.title}</h2><p className="mb-5 mt-2 flex-1 text-sm leading-relaxed text-gray-400">{guide.summary}</p>
            {guide.settings ? <button className="btn-secondary btn-sm" onClick={() => openSettings(guide.settings)}>Open {guide.title}<ArrowUpRight className="h-3.5 w-3.5" /></button> : <Link className="btn-secondary btn-sm" to={guide.href}>Open {guide.title}<ArrowUpRight className="h-3.5 w-3.5" /></Link>}
          </section>
        ))}
      </div>
    </>
  )
}
