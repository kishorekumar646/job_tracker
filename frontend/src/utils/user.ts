// Author: Kishore Kumar
export function getInitials(fullName: string | undefined, email: string): string {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

/** Username shown instead of an email: "kishor.m@infosys.com" → "kishor.m" (non-emails pass through). */
export function usernameOf(emailOrName: string | null | undefined): string {
  if (!emailOrName) return ''
  return emailOrName.split('@')[0]
}
