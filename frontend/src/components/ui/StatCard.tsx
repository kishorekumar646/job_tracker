// Author: Kishore Kumar
import { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Hint } from './Hint'

interface Props {
  title: string
  value: string | number
  subtitle?: string
  icon: ReactNode
  color?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'cyan'
  trend?: { value: number; label: string }
  /** What the number counts — shown when hovering the info icon next to the title. */
  hint?: string
}

const COLOR_MAP = {
  indigo: { icon: 'bg-primary-500/20 text-primary-400', border: 'border-primary-500/20' },
  emerald: { icon: 'bg-emerald-500/20 text-emerald-400', border: 'border-emerald-500/20' },
  amber: { icon: 'bg-amber-500/20 text-amber-400', border: 'border-amber-500/20' },
  rose: { icon: 'bg-rose-500/20 text-rose-400', border: 'border-rose-500/20' },
  cyan: { icon: 'bg-cyan-500/20 text-cyan-400', border: 'border-cyan-500/20' },
}

export function StatCard({ title, value, subtitle, icon, color = 'indigo', trend, hint }: Props) {
  const colors = COLOR_MAP[color]
  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-gray-800/50 p-5 backdrop-blur ${colors.border}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-gray-400">
            {title}
            {hint && (
              <Hint text={hint}>
                <Info className="h-3.5 w-3.5 text-gray-500 hover:text-gray-300" aria-label={`About ${title}`} />
              </Hint>
            )}
          </p>
          <p className="mt-1 text-3xl font-bold text-gray-50">{value}</p>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          {trend && (
            <p
              className={`mt-2 text-xs font-medium ${
                trend.value >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className={`rounded-xl p-3 ${colors.icon}`}>{icon}</div>
      </div>
      <div
        className={`absolute bottom-0 left-0 h-0.5 w-full ${colors.border.replace('border', 'bg')}`}
      />
    </div>
  )
}
