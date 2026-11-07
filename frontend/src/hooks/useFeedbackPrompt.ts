// Author: Kishore Kumar
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const AUTH_PATHS = new Set(['/login', '/signup'])

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function feedbackKey(email: string) {
  return `rca_feedback_shown_date_${email}`
}

// Accounts still waiting for admin approval only see the approval screen — no prompt yet.
function awaitingApproval(u: { is_approved?: boolean; role?: string }) {
  return u.is_approved === false && u.role !== 'admin'
}

function inFeedbackWindow() {
  const h = new Date().getHours()  // user's local timezone
  return h >= 16 && h < 18         // 4 PM – 6 PM local time
}

export function useFeedbackPrompt() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  // Prevents scheduling a second timer when the user navigates between pages
  const scheduledRef = useRef(false)

  useEffect(() => {
    if (!user) return
    if (awaitingApproval(user)) return
    if (AUTH_PATHS.has(location.pathname)) return
    if (!inFeedbackWindow()) return
    if (localStorage.getItem(feedbackKey(user.email)) === todayStr()) return
    if (scheduledRef.current) return   // already queued this session

    scheduledRef.current = true

    // Intentionally no cleanup — timer must fire even if the user navigates
    // before 2.5 s. AppShell never unmounts so there's no leak risk.
    setTimeout(() => {
      // Guard: don't open after logout
      const { isAuthenticated, user: u } = useAuthStore.getState()
      if (!isAuthenticated || !u) return
      if (awaitingApproval(u)) { scheduledRef.current = false; return }
      // Mark only when the modal actually opens, not before.
      // This way a cancelled/missed timer never blocks tomorrow's prompt.
      localStorage.setItem(feedbackKey(u.email), todayStr())
      setOpen(true)
    }, 2500)
  }, [location.pathname, user])

  function close() { setOpen(false) }

  return { open, close }
}
