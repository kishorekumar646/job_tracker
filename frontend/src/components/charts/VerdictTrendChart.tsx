// Author: Kishore Kumar
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useThemeStore, getPrimaryColor } from '../../store/themeStore'

interface TrendPoint {
  date: string
  verdicts: number
}

interface Props {
  data: TrendPoint[]
}

export function VerdictTrendChart({ data }: Props) {
  useThemeStore((s) => s.theme) // subscribe so chart re-renders on theme change
  const c500 = getPrimaryColor('500')
  const c400 = getPrimaryColor('400')
  const hasData = data.some((d) => d.verdicts > 0)

  if (!hasData) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500 text-sm">
        No activity in the last 7 days
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="verdictGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={c500} stopOpacity={0.35} />
            <stop offset="95%" stopColor={c500} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: '#9ca3af', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: '#9ca3af', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '8px',
            boxShadow: '0 4px 16px 0 rgba(0,0,0,0.5)',
            fontSize: '12px',
            padding: '8px 12px',
          }}
          itemStyle={{ color: '#f9fafb', fontWeight: 500 }}
          labelStyle={{ color: '#9ca3af', marginBottom: 4 }}
          wrapperStyle={{ zIndex: 50 }}
          formatter={(value: number) => [`${value} verdict${value !== 1 ? 's' : ''}`, 'Verdicts']}
        />
        <Area
          type="monotone"
          dataKey="verdicts"
          stroke={c500}
          strokeWidth={2}
          fill="url(#verdictGrad)"
          dot={{ fill: c500, r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: c400, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
