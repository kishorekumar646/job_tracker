// Author: Kishore Kumar
// Tags for one user in Admin → Users (e.g. Regression). A tag is a bundle of permissions: the user
// has it when they hold all of them. Click a tag to add or remove it. Admins hold every tag.
import { Check, Plus } from 'lucide-react'
import type { TagInfo } from '../../api/admin'
import { Hint } from './Hint'

interface Props {
  tags: TagInfo[]
  role: string
  granted: string[]
  disabled?: boolean
  onChange: (next: string[]) => void
}

export function TagChips({ tags, role, granted, disabled, onChange }: Props) {
  if (tags.length === 0) return <span className="text-xs text-gray-600">—</span>
  const isAdmin = role === 'admin'

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => {
        const held = t.permissions.filter((p) => granted.includes(p))
        const on = isAdmin || held.length === t.permissions.length
        const partial = !on && held.length > 0
        function toggle() {
          if (disabled || isAdmin) return
          onChange(on || partial
            ? granted.filter((p) => !t.permissions.includes(p))
            : [...granted, ...t.permissions.filter((p) => !granted.includes(p))])
        }
        const hint = isAdmin
          ? `Admins have every tag — ${t.description}`
          : on ? `${t.description} Click to remove.`
          : partial ? `Only part of this tag (view only). Click to remove; click again to add it in full.`
          : `${t.description} Click to add.`
        return (
          <Hint key={t.key} text={hint} className={isAdmin || disabled ? 'cursor-not-allowed' : ''}>
            <button
              type="button"
              onClick={toggle}
              disabled={disabled || isAdmin}
              aria-pressed={on}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 transition-colors disabled:pointer-events-none ${
                on
                  ? 'bg-primary-500/15 text-primary-200 ring-primary-500/40 hover:bg-primary-500/25'
                  : partial
                    ? 'bg-amber-500/15 text-amber-300 ring-amber-500/30 hover:bg-amber-500/25'
                    : 'bg-transparent text-gray-500 ring-gray-700 hover:text-gray-300'
              } ${isAdmin ? 'opacity-80' : ''}`}
            >
              {on ? <Check className="h-3 w-3" /> : partial ? null : <Plus className="h-3 w-3" />}
              {t.label}{partial ? ' · view only' : ''}
            </button>
          </Hint>
        )
      })}
    </div>
  )
}
