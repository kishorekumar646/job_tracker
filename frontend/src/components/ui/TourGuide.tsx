// Author: Kishore Kumar
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowRight, ArrowLeft, BookOpen } from 'lucide-react'
import { TourStep } from '../../tour/tourSteps'

interface Props {
  steps: TourStep[]
  stepIndex: number
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  onDontShowAgain: () => void
}

const PAD = 10
const TOOLTIP_W = 330

export function TourGuide({ steps, stepIndex, onNext, onPrev, onClose, onDontShowAgain }: Props) {
  const step = steps[stepIndex]
  const isFirst = stepIndex === 0
  const isLast  = stepIndex === steps.length - 1

  const [rect, setRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Recompute spotlight rect whenever the step changes
  useEffect(() => {
    if (!step) return
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null
    if (!el) { setRect(null); return }
    el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'center' })
    // Read rect after scroll settles (instant scroll is synchronous but
    // we still defer one frame so the browser has painted the new scroll pos)
    const id = requestAnimationFrame(() => setRect(el.getBoundingClientRect()))
    return () => cancelAnimationFrame(id)
  }, [step])

  // Re-read on window resize
  useEffect(() => {
    if (!step) return
    function onResize() {
      const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null
      if (el) setRect(el.getBoundingClientRect())
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [step])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && !isLast) onNext()
      if (e.key === 'ArrowLeft'  && !isFirst) onPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNext, onPrev, isFirst, isLast])

  // Close on any press outside the card. The overlay is click-through, so the
  // same click still reaches the page (e.g. a tab) instead of being swallowed.
  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [onClose])

  if (!step) return null

  const vw = window.innerWidth
  const vh = window.innerHeight

  const spotT = rect ? rect.top    - PAD : vh / 2 - 60
  const spotL = rect ? rect.left   - PAD : vw / 2 - 100
  const spotR = rect ? rect.right  + PAD : vw / 2 + 100
  const spotB = rect ? rect.bottom + PAD : vh / 2 + 60
  const spotW = spotR - spotL
  const spotH = spotB - spotT

  function tooltipStyle(): React.CSSProperties {
    const placement = step.placement ?? 'bottom'
    const margin = 14
    const TOOLTIP_H = 230

    // Horizontally centered on the spotlight (clamped to viewport)
    const centeredLeft = Math.max(8, Math.min(
      (spotL + spotR) / 2 - TOOLTIP_W / 2,
      vw - TOOLTIP_W - 8,
    ))
    // Vertically centered on the spotlight (clamped to viewport)
    const centeredTop = Math.max(8, Math.min(
      (spotT + spotB) / 2 - TOOLTIP_H / 2,
      vh - TOOLTIP_H - 8,
    ))

    if (placement === 'bottom') {
      return { top: Math.min(spotB + margin, vh - TOOLTIP_H - 8), left: centeredLeft }
    }
    if (placement === 'top') {
      return { top: Math.max(8, spotT - TOOLTIP_H - margin), left: centeredLeft }
    }
    if (placement === 'right') {
      return { top: centeredTop, left: Math.min(spotR + margin, vw - TOOLTIP_W - 8) }
    }
    // left
    return { top: centeredTop, left: Math.max(8, spotL - TOOLTIP_W - margin) }
  }

  const overlayBox = 'fixed bg-black/65'

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[9998]">
      {/* Four overlay boxes creating the spotlight hole (visual only, clicks pass through) */}
      {/* Top */}
      <div className={overlayBox} style={{ top: 0, left: 0, right: 0, height: spotT }} />
      {/* Bottom */}
      <div className={overlayBox} style={{ top: spotB, left: 0, right: 0, bottom: 0 }} />
      {/* Left */}
      <div className={overlayBox} style={{ top: spotT, left: 0, width: spotL, height: spotH }} />
      {/* Right */}
      <div className={overlayBox} style={{ top: spotT, left: spotR, right: 0, height: spotH }} />

      {/* Spotlight ring */}
      <div
        className="fixed rounded-lg pointer-events-none"
        style={{
          top: spotT, left: spotL, width: spotW, height: spotH,
          boxShadow: '0 0 0 3px rgba(99,102,241,0.8), 0 0 20px 4px rgba(99,102,241,0.3)',
        }}
      />

      {/* Tooltip card */}
      <div
        ref={cardRef}
        className="pointer-events-auto fixed z-[9999] rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
        style={{ width: TOOLTIP_W, ...tooltipStyle() }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-600/25">
              <BookOpen className="h-3.5 w-3.5 text-primary-400" />
            </div>
            <span className="text-sm font-semibold text-gray-100">{step.title}</span>
          </div>
          <button onClick={onClose} title="Close guide (Esc)" className="text-gray-500 hover:text-gray-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <p className="px-4 py-3 text-sm leading-relaxed text-gray-400">{step.content}</p>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 px-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-200 ${
                i === stepIndex ? 'w-4 h-1.5 bg-primary-400' : 'w-1.5 h-1.5 bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600">{stepIndex + 1} / {steps.length}</span>
            <button
              onClick={onDontShowAgain}
              className="text-xs text-gray-600 underline-offset-2 hover:text-gray-400 hover:underline transition-colors"
            >
              Don't show again
            </button>
          </div>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={onPrev}
                title="Previous (←)"
                className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
              >
                <ArrowLeft className="h-3 w-3" /> Back
              </button>
            )}
            <button
              onClick={isLast ? onClose : onNext}
              title={isLast ? 'Finish' : 'Next (→)'}
              className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-500"
            >
              {isLast ? 'Finish' : <>Next <ArrowRight className="h-3 w-3" /></>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
