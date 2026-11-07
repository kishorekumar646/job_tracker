// Author: Kishore Kumar
// Instant hover / focus tooltip for icon buttons. Rendered in a portal with fixed positioning, so
// scrolling lists can't clip it; flips below when there's no room above and stays inside the window.
// Wraps the child in a span, so it also shows for disabled buttons (which get no mouse events).
import { ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const GAP = 6
const EDGE = 8

export function Hint({ text, children, className = '' }: { text: string; children: ReactNode; className?: string }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchor.current || !tip.current) { setPos(null); return }
    const a = anchor.current.getBoundingClientRect()
    const t = tip.current.getBoundingClientRect()
    const above = a.top - t.height - GAP
    const top = above >= EDGE ? above : a.bottom + GAP
    const left = Math.min(Math.max(a.left + a.width / 2 - t.width / 2, EDGE), window.innerWidth - t.width - EDGE)
    setPos({ left, top })
  }, [open, text])

  return (
    <span
      ref={anchor}
      className={`inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && createPortal(
        <div
          ref={tip}
          role="tooltip"
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
          className="pointer-events-none fixed z-[70] max-w-xs whitespace-pre-line rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-[11px] font-medium leading-snug text-gray-100 shadow-lg"
        >
          {text}
        </div>,
        document.body,
      )}
    </span>
  )
}
