// Author: Kishore Kumar
const TZ: string =
  import.meta.env.VITE_LOCAL_TIMEZONE ||
  Intl.DateTimeFormat().resolvedOptions().timeZone

/** YYYY-MM-DD in the configured timezone */
export function toDateStr(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date)
}

/** Current hour (0-23) in the configured timezone */
export function nowHour(): number {
  return parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()),
    10,
  )
}

/** Date only — e.g. "27/08/2026" */
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-GB', { timeZone: TZ })
}

/** Date + time — e.g. "27/08/2026, 2:32:05 AM" */
export function formatDateTime(date: Date | string): string {
  const d = new Date(date)
  const datePart = d.toLocaleDateString('en-GB', { timeZone: TZ })
  const timePart = d.toLocaleTimeString('en-US', { timeZone: TZ, hour12: true })
  return `${datePart}, ${timePart}`
}

/** Created-at timestamp — e.g. "2026-08-28 07:02:04 AM" */
export function formatCreatedAt(date: Date | string): string {
  const d = new Date(date)
  const datePart = d.toLocaleDateString('en-CA', { timeZone: TZ })
  const timePart = d.toLocaleTimeString('en-US', {
    timeZone: TZ,
    hour12: true,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  return `${datePart} ${timePart}`
}

/** Time only — e.g. "2:32:05 AM" */
export function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString('en-US', { timeZone: TZ, hour12: true })
}
