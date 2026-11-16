// Author: Kishore Kumar
import { useSearchParams } from 'react-router-dom'
import { IndianRupee, Megaphone, MessageSquareHeart, Users } from 'lucide-react'
import { PageHeader } from '../components/ui'
import { UsersTab } from './AdminUsers'
import { AnnouncementsTab } from './AdminAnnouncements'
import { OrdersTab } from './AdminOrders'
import { FeedbackTab } from './AdminFeedback'

const TABS = [
  { id: 'users', label: 'Users', desc: 'Manage accounts, roles, status and authenticator access.', icon: Users },
  { id: 'announce', label: 'Announcements', desc: "Broadcast a message to every active user's notification inbox.", icon: Megaphone },
  { id: 'payments', label: 'Orders', desc: 'Orders, bank alert log and manual approval for payments that could not be matched.', icon: IndianRupee },
  { id: 'feedback', label: 'Feedback', desc: 'Read user ratings, review suggestions and track feedback that needs attention.', icon: MessageSquareHeart },
] as const

export default function Admin() {
  const [params, setParams] = useSearchParams()
  const current = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0]
  const tab = current.id

  return (
    <>
      <PageHeader title="Admin" subtitle={current.desc} />
      <div data-guide="admin-tabs" className="mb-5 flex gap-1 overflow-x-auto border-b border-gray-800">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setParams({ tab: id })}
            className={`relative flex shrink-0 items-center gap-1 px-2 py-2.5 text-xs font-medium transition-colors sm:gap-2 sm:px-4 sm:text-sm ${tab === id ? 'text-brand-400' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {tab === id && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-500" />}
          </button>
        ))}
      </div>
      <div key={tab} className="panel-transition" data-guide="admin-content">{tab === 'users' ? <UsersTab /> : tab === 'announce' ? <AnnouncementsTab /> : tab === 'payments' ? <OrdersTab /> : <FeedbackTab />}</div>
    </>
  )
}
