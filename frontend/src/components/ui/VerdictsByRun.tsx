// Author: Kishore Kumar
// Batch results run by run: groups verdicts by the run they came from (``runUuid``, set on batch
// verdicts) into collapsible sections — "Run 1 of 2 · FT_AVAD · 3af1a2c6 · 12 verdicts" with the run's
// category counts. Single-run results (one run, or verdicts without a run) render unchanged.
// The page keeps its own filters and card design: ``children`` renders the cards for one group.
import { ReactNode, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, PlayCircle } from 'lucide-react'
import type { RcaVerdict } from '../../types'
import { CATEGORY_STYLES } from './Badge'

interface Group {
  key: string
  runUuid: string | null
  name: string
  verdicts: RcaVerdict[]
}

function groupByRun(verdicts: RcaVerdict[]): Group[] {
  const groups = new Map<string, Group>()
  for (const v of verdicts) {
    const key = v.runUuid ?? ''
    let g = groups.get(key)
    if (!g) {
      g = { key, runUuid: v.runUuid ?? null, name: v.runName || (v.runUuid ? 'Run' : 'Other results'), verdicts: [] }
      groups.set(key, g)
    }
    g.verdicts.push(v)
  }
  return [...groups.values()]
}

function RunSection({ group, index, total, children }: { group: Group; index: number; total: number; children: ReactNode }) {
  const [open, setOpen] = useState(index < 3)
  const counts = group.verdicts.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v.category]: (acc[v.category] ?? 0) + 1 }), {})
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return (
    <section className="overflow-hidden rounded-lg border border-gray-800 bg-gray-900/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 bg-gray-800/40 px-4 py-2.5 text-left hover:bg-gray-800/70"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />}
        <PlayCircle className="h-4 w-4 shrink-0 text-primary-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Run {index + 1} of {total}</span>
        <span className="min-w-0 truncate text-sm font-semibold text-gray-100" title={group.name}>{group.name}</span>
        {group.runUuid && <span className="font-mono text-[11px] text-gray-500" title={group.runUuid}>{group.runUuid.slice(0, 8)}</span>}
        <span className="text-xs tabular-nums text-gray-400">{group.verdicts.length} verdict{group.verdicts.length === 1 ? '' : 's'}</span>
        <span className="ml-auto flex flex-wrap gap-1">
          {top.slice(0, 4).map(([cat, n]) => (
            <span key={cat} className={`rounded-full border px-2 py-px text-[10px] font-medium ${CATEGORY_STYLES[cat as keyof typeof CATEGORY_STYLES] ?? 'border-gray-600 bg-gray-700/40 text-gray-300'}`}>
              {cat.replace(/_/g, ' ')} {n}
            </span>
          ))}
          {top.length > 4 && <span className="text-[10px] text-gray-500">+{top.length - 4} more</span>}
        </span>
      </button>
      {open && <div className="p-3">{children}</div>}
    </section>
  )
}

export function VerdictsByRun({ verdicts, children }: { verdicts: RcaVerdict[]; children: (verdicts: RcaVerdict[]) => ReactNode }) {
  const groups = useMemo(() => groupByRun(verdicts), [verdicts])
  if (groups.length <= 1) return <>{children(verdicts)}</>
  return (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <RunSection key={g.key} group={g} index={i} total={groups.length}>{children(g.verdicts)}</RunSection>
      ))}
    </div>
  )
}
