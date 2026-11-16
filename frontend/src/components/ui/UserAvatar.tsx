// Author: Kishore Kumar
import type { User } from '../../types'

const COLORS = ['bg-violet-600', 'bg-indigo-600', 'bg-blue-600', 'bg-cyan-600', 'bg-teal-600', 'bg-emerald-600', 'bg-amber-600', 'bg-orange-600', 'bg-rose-600', 'bg-pink-600']

export function UserAvatar({ user, className = '' }: { user: Pick<User, 'name' | 'email' | 'avatar'> | null; className?: string }) {
  const email = user?.email ?? ''
  const initials = (user?.name || email || '?').split(/[\s@]/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('')
  let hash = 0
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) >>> 0
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white ${COLORS[hash % COLORS.length]} ${className}`}>
      {user?.avatar ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : initials}
    </div>
  )
}
