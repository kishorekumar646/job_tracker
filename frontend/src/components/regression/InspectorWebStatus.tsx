// Author: Kishore Kumar
// The "InspectorWeb · Connected · Environment · Version" status chip at the top of the Regression tab.
import { Server, Tag } from 'lucide-react'
import { Hint } from '../ui/Hint'

interface Props {
  environment: string | null
  version: string | null
}

export function InspectorWebStatus({ environment, version }: Props) {
  const shownVersion = version ? (/^v/i.test(version) ? version : `v${version}`) : null
  return (
    <Hint text="Run configs, schedules and runs on this page use this InspectorWeb server">
      <div className="inline-flex items-stretch divide-x divide-gray-800 overflow-hidden rounded-lg border border-gray-800 bg-gray-900 text-xs shadow-sm">
        <span className="inline-flex items-center gap-2 px-3 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="font-semibold text-gray-200">InspectorWeb</span>
          <span className="rounded-md bg-emerald-500/10 px-1.5 py-px text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/25">Connected</span>
        </span>
        {environment && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5">
            <Server className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-gray-500">Environment</span>
            <span className="font-semibold uppercase tracking-wide text-gray-200">{environment}</span>
          </span>
        )}
        {shownVersion && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5">
            <Tag className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-gray-500">Version</span>
            <span className="font-mono font-medium text-gray-200">{shownVersion}</span>
          </span>
        )}
      </div>
    </Hint>
  )
}
