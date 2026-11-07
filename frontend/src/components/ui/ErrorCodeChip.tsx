// Author: Kishore Kumar
import { Hash } from 'lucide-react'
import { RcaVerdict } from '../../types'

type Props = Pick<RcaVerdict, 'errorCode' | 'errorTitle' | 'errorSubsystem'>

/** Device error code behind a verdict's category, e.g. "CS2201 · Multiroom / Recordings · STB on different network or subnet". */
export function ErrorCodeChip({ errorCode, errorTitle, errorSubsystem }: Props) {
  if (!errorCode) return null
  const detail = [errorSubsystem, errorTitle].filter(Boolean).join(' · ')
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-700 bg-gray-800/60 px-2.5 py-0.5 text-xs text-gray-400"
      aria-label={`Error code ${errorCode}${detail ? `: ${detail}` : ''}`}
    >
      <Hash className="h-3 w-3 shrink-0 text-gray-500" />
      <code className="font-mono font-semibold text-gray-200">{errorCode}</code>
      {detail && <span className="truncate">{detail}</span>}
    </span>
  )
}
