// Author: Kishore Kumar
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Platform } from '../../types'

const PLATFORM_COLORS: Record<Platform, string> = {
  STB: '#3b82f6',
  PERSEUS_ANDROID: '#10b981',
  PERSEUS_IOS: '#8b5cf6',
  PERSEUS_WEB: '#06b6d4',
  BROWSERSTACK: '#f59e0b',
}

interface Props {
  data: Partial<Record<Platform, number>>
}

export function PlatformBarChart({ data }: Props) {
  const chartData = Object.entries(data)
    .filter(([, v]) => v && v > 0)
    .map(([name, value]) => ({
      name: name.replace(/_/g, ' '),
      value,
      color: PLATFORM_COLORS[name as Platform] ?? '#6b7280',
    }))

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500 text-sm">
        No data available
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          axisLine={{ stroke: '#374151' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip
          cursor={{ fill: '#ffffff08' }}
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
          formatter={(value: number) => [`${value} failures`, 'Count']}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
