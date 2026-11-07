// Author: Kishore Kumar
import { RcaCategory, JobStatus, Platform } from '../../types'

export const CATEGORY_STYLES: Record<RcaCategory, string> = {
  DRM_ERROR: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  PLAYOUT_ERROR: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  ENVIRONMENT: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  BROWSERSTACK_CAPACITY: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  ORCHESTRATION: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  AUTOMATION_SCRIPT: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  TEST_ASSERTION: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  KNOWN_ISSUE: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  UNKNOWN: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  // STB CS error categories
  NETWORK_ERROR: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  HARDWARE_ERROR: 'bg-red-500/20 text-red-400 border-red-500/30',
  SOFTWARE_UPDATE_ERROR: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  PROVISIONING_ERROR: 'bg-primary-500/20 text-primary-400 border-primary-500/30',
  BACKEND_ERROR: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  OTT_ERROR: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
  ACCOUNT_ERROR: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30',
}

const PLATFORM_STYLES: Record<Platform, string> = {
  STB: 'bg-blue-600/20 text-blue-300 border-blue-600/30',
  PERSEUS_ANDROID: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  PERSEUS_IOS: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  PERSEUS_WEB: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  BROWSERSTACK: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
}

const STATUS_STYLES: Record<JobStatus, string> = {
  PENDING: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  RUNNING: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  DONE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  FAILED: 'bg-red-500/20 text-red-400 border-red-500/30',
  STOPPED: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
}

interface Props {
  type: 'category' | 'platform' | 'status'
  value: string
  className?: string
}

export function Badge({ type, value, className = '' }: Props) {
  // Don't render a platform badge for unrecognised / UNKNOWN platform values
  if (type === 'platform' && !PLATFORM_STYLES[value as Platform]) return null

  const style =
    type === 'category'
      ? CATEGORY_STYLES[value as RcaCategory] ?? CATEGORY_STYLES.UNKNOWN
      : type === 'platform'
      ? PLATFORM_STYLES[value as Platform]!
      : STATUS_STYLES[value as JobStatus] ?? STATUS_STYLES.PENDING

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style} ${className}`}
    >
      {value.replace(/_/g, ' ')}
    </span>
  )
}
