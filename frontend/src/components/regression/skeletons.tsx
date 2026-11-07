// Author: Kishore Kumar
// Loading skeletons for the Regression tab, shaped like the real rows and panels: the page skeleton
// on first load (like Dashboard / Analyze) and the rows shown while a list loads.
import { Shimmer } from '../ui/Shimmer'

/** A run config row: icon, UUID + name + meta lines, action icons on the right. */
export function RunConfigRowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Shimmer className="mt-1 h-4 w-4 shrink-0 rounded" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Shimmer className="h-2.5 w-48" />
        <Shimmer className="h-3.5 w-3/4" />
        <div className="flex gap-4">
          <Shimmer className="h-2.5 w-16" />
          <Shimmer className="h-2.5 w-28" />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 self-center">
        {Array.from({ length: 7 }).map((_, i) => <Shimmer key={i} className="h-6 w-6 rounded-md" />)}
      </div>
    </div>
  )
}

/** A run card: name + meta, status badge, run UUID chip and result counts. */
export function RunCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Shimmer className="mt-0.5 h-4 w-4 shrink-0 rounded" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Shimmer className="h-4 w-2/3" />
            <Shimmer className="h-2.5 w-40" />
          </div>
        </div>
        <Shimmer className="h-5 w-20 shrink-0 rounded-full" />
      </div>
      <div className="mt-3 space-y-2 pl-6">
        <Shimmer className="h-5 w-72 rounded" />
        <div className="flex gap-3">
          <Shimmer className="h-3 w-16" />
          <Shimmer className="h-3 w-14" />
          <Shimmer className="h-3 w-20" />
        </div>
        <div className="flex gap-2 pt-1">
          <Shimmer className="h-7 w-36 rounded-lg" />
          <Shimmer className="h-7 w-32 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

/** A schedule row: icon, name + status, type line, run config chips, switch and action icons. */
export function ScheduleRowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Shimmer className="mt-1 h-4 w-4 shrink-0 rounded" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <Shimmer className="h-3.5 w-1/2" />
          <Shimmer className="h-4 w-14 rounded-full" />
        </div>
        <Shimmer className="h-2.5 w-56" />
        <Shimmer className="h-2.5 w-32" />
        <div className="flex gap-1 pt-0.5">
          <Shimmer className="h-4 w-24 rounded" />
          <Shimmer className="h-4 w-20 rounded" />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 self-center">
        <Shimmer className="h-5 w-9 rounded-full" />
        {Array.from({ length: 3 }).map((_, i) => <Shimmer key={i} className="h-6 w-6 rounded-md" />)}
      </div>
    </div>
  )
}

/** Both panels on first load: run configs (header, filters, pagination, rows) and runs (header, cards). */
export function RegressionPageSkeleton() {
  return (
    <>
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900" aria-busy="true" aria-label="Loading run configs">
        <div className="shrink-0 space-y-3 border-b border-gray-800 p-4">
          <div className="flex items-center justify-between gap-2">
            <Shimmer className="h-4 w-32" />
            <div className="flex gap-2">
              <Shimmer className="h-8 w-28 rounded-lg" />
              <Shimmer className="h-8 w-36 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Shimmer className="h-2.5 w-12" />
                <Shimmer className="h-8 w-full rounded-md" />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Shimmer className="h-5 w-24 rounded-full" />
            <Shimmer className="h-5 w-12 rounded" />
            <Shimmer className="h-5 w-16" />
          </div>
        </div>
        <div className="min-h-0 flex-1 divide-y divide-gray-800 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => <RunConfigRowSkeleton key={i} />)}
        </div>
      </section>

      <section className="flex min-h-0 min-w-0 flex-col" aria-busy="true" aria-label="Loading runs">
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <Shimmer className="h-4 w-20" />
          <Shimmer className="h-4 w-4 rounded" />
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => <RunCardSkeleton key={i} />)}
        </div>
      </section>
    </>
  )
}
