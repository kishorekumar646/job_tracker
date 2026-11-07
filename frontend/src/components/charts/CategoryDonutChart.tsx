// Author: Kishore Kumar
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { RcaCategory } from '../../types'
import { useThemeStore, getPrimaryColor } from '../../store/themeStore'

const CATEGORY_COLORS_BASE: Omit<Record<RcaCategory, string>, 'PROVISIONING_ERROR'> & { PROVISIONING_ERROR: null } = {
  DRM_ERROR: '#f43f5e',
  PLAYOUT_ERROR: '#f97316',
  ENVIRONMENT: '#eab308',
  BROWSERSTACK_CAPACITY: '#a855f7',
  ORCHESTRATION: '#3b82f6',
  AUTOMATION_SCRIPT: '#ec4899',
  TEST_ASSERTION: '#14b8a6',
  KNOWN_ISSUE: '#06b6d4',
  UNKNOWN: '#6b7280',
  // STB CS error categories
  NETWORK_ERROR: '#0ea5e9',
  HARDWARE_ERROR: '#ef4444',
  SOFTWARE_UPDATE_ERROR: '#8b5cf6',
  PROVISIONING_ERROR: null,
  BACKEND_ERROR: '#f59e0b',
  OTT_ERROR: '#84cc16',
  ACCOUNT_ERROR: '#d946ef',
}

interface Props {
  data: Partial<Record<RcaCategory, number>>
}

export function CategoryDonutChart({ data }: Props) {
  useThemeStore((s) => s.theme) // subscribe so chart re-renders on theme change
  const CATEGORY_COLORS = { ...CATEGORY_COLORS_BASE, PROVISIONING_ERROR: getPrimaryColor('500') }
  const chartData = Object.entries(data)
    .filter(([, v]) => v && v > 0)
    .map(([name, value]) => ({
      name: name.replace(/_/g, ' '),
      value,
      color: CATEGORY_COLORS[name as RcaCategory] ?? '#6b7280',
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
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={70}
          outerRadius={110}
          paddingAngle={3}
          dataKey="value"
        >
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.color} stroke="transparent" />
          ))}
        </Pie>
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
          formatter={(value: number, name: string) => [`${value} verdicts`, name]}
        />
        <Legend
          formatter={(value) => (
            <span style={{ color: '#9ca3af', fontSize: '12px' }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
