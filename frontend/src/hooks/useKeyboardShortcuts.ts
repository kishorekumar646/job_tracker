// Author: Kishore Kumar
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

interface Options {
  onOpenShortcuts: () => void
  onOpenSettings: () => void
  onOpenProfile: () => void
}

const isMac = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac')

function isTyping(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    (el as HTMLElement).isContentEditable
  )
}

export function useKeyboardShortcuts({ onOpenShortcuts, onOpenSettings, onOpenProfile }: Options) {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)

  const cbRefs = useRef({ onOpenShortcuts, onOpenSettings, onOpenProfile })
  useEffect(() => { cbRefs.current = { onOpenShortcuts, onOpenSettings, onOpenProfile } })

  const userRef = useRef(user)
  useEffect(() => { userRef.current = user })

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (isTyping()) return

      const modPressed = isMac ? e.metaKey : e.ctrlKey

      // ⌘ / Ctrl shortcuts
      if (modPressed && !e.shiftKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'd': e.preventDefault(); navigate('/dashboard'); return
          case 'a': e.preventDefault(); navigate('/analyze'); return
          case 'j': e.preventDefault(); navigate('/jobs'); return
          case 'h': e.preventDefault(); navigate('/health'); return
          case 's': {
            e.preventDefault()
            const el = document.querySelector<HTMLInputElement>('[data-global-search]')
            el?.focus()
            el?.select()
            return
          }
          case 'p':
            e.preventDefault()
            cbRefs.current.onOpenProfile()
            return
          case 'x':
            if (userRef.current?.role === 'admin') {
              e.preventDefault()
              navigate('/admin')
            }
            return
        }
      }

      // '?' is Shift+/ on most keyboards — allow shiftKey for this one
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        cbRefs.current.onOpenShortcuts()
        return
      }

      // Other single-key shortcuts — no modifier held
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        switch (e.key) {
          case 's':
          case 'S':
            e.preventDefault()
            cbRefs.current.onOpenSettings()
            break
        }
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [navigate])
}
