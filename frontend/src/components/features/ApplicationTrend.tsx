// Author: Kishore Kumar
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DateRange } from '../ui'

export default function ApplicationTrend({ byDay, range }: { byDay: Record<string, number>; range: DateRange }) {
  const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  const end = range.end ? new Date(`${range.end}T00:00`) : new Date()
  const first = Object.keys(byDay).sort()[0]
  const start = range.start ? new Date(`${range.start}T00:00`) : new Date(Math.max(end.getTime() - 29 * 86_400_000, first ? new Date(`${first}T00:00`).getTime() : 0))
  const days: { d: string; n: number }[] = []
  for (let t = start.getTime(); t <= end.getTime() && days.length < 120; t += 86_400_000) {
    const d = iso(new Date(t))
    days.push({ d, n: byDay[d] ?? 0 })
  }
  const shortDate = (day: string) => new Date(`${day}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return (
    <section className="card card-pad overflow-hidden lg:col-span-3">
      <h2 className="mb-4 font-bold">Applications over time</h2>
      <div className="h-56 w-full min-w-0 sm:h-64" role="img" aria-label={`Daily applications from ${days[0]?.d ?? 'start'} to ${days[days.length - 1]?.d ?? 'end'}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={days} margin={{ top: 12, right: 12, bottom: 0, left: -20 }} accessibilityLayer>
            <defs>
              <linearGradient id="application-trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(var(--brand-500))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="rgb(var(--brand-500))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#27322e" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="d" tickFormatter={shortDate} minTickGap={32} tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} domain={[0, (max: number) => Math.max(1, max)]} tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip labelFormatter={(day) => shortDate(String(day))} contentStyle={{ backgroundColor: '#10171b', borderColor: '#42504a', borderRadius: 10, fontSize: 12 }} labelStyle={{ color: '#dddeda' }} itemStyle={{ color: 'rgb(var(--brand-300))' }} />
            <Area type="linear" dataKey="n" name="Applications" stroke="rgb(var(--brand-400))" strokeWidth={2.5} fill="url(#application-trend-fill)" dot={days.length === 1 ? { r: 4 } : false} activeDot={{ r: 5 }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
