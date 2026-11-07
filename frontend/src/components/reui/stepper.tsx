// Author: Kishore Kumar
import { createContext, useContext, ReactNode } from 'react'

// ── Contexts ─────────────────────────────────────────────────────────────────

interface StepperCtx {
  value: number
  onValueChange?: (v: number) => void
  indicators: { completed?: ReactNode; loading?: ReactNode }
}

const StepperContext = createContext<StepperCtx>({
  value: 1,
  indicators: {},
})

interface StepItemCtx {
  step: number
  state: 'active' | 'completed' | 'inactive'
}

const StepItemContext = createContext<StepItemCtx>({ step: 1, state: 'inactive' })

// ── Stepper ───────────────────────────────────────────────────────────────────

interface StepperProps {
  value: number
  onValueChange?: (v: number) => void
  indicators?: { completed?: ReactNode; loading?: ReactNode }
  className?: string
  children: ReactNode
}

export function Stepper({
  value,
  onValueChange,
  indicators = {},
  className,
  children,
}: StepperProps) {
  return (
    <StepperContext.Provider value={{ value, onValueChange, indicators }}>
      <div className={className}>{children}</div>
    </StepperContext.Provider>
  )
}

// ── StepperNav ────────────────────────────────────────────────────────────────

interface NavProps { className?: string; children: ReactNode }

export function StepperNav({ className, children }: NavProps) {
  return (
    <ol
      data-orientation="horizontal"
      className={`group/stepper-nav flex items-start ${className ?? ''}`}
    >
      {children}
    </ol>
  )
}

// ── StepperItem ───────────────────────────────────────────────────────────────

interface ItemProps { step: number; className?: string; children: ReactNode }

export function StepperItem({ step, className, children }: ItemProps) {
  const { value } = useContext(StepperContext)
  const state: StepItemCtx['state'] =
    step === value ? 'active' : step < value ? 'completed' : 'inactive'

  return (
    <StepItemContext.Provider value={{ step, state }}>
      <li data-state={state} className={`group/step ${className ?? ''}`}>
        {children}
      </li>
    </StepItemContext.Provider>
  )
}

// ── StepperTrigger ────────────────────────────────────────────────────────────

interface TriggerProps { className?: string; children: ReactNode }

export function StepperTrigger({ className, children }: TriggerProps) {
  const { onValueChange } = useContext(StepperContext)
  const { step } = useContext(StepItemContext)

  return (
    <button
      type="button"
      onClick={() => onValueChange?.(step)}
      className={className}
    >
      {children}
    </button>
  )
}

// ── StepperIndicator ──────────────────────────────────────────────────────────

interface IndicatorProps { className?: string; children: ReactNode }

export function StepperIndicator({ className, children }: IndicatorProps) {
  const { indicators } = useContext(StepperContext)
  const { state } = useContext(StepItemContext)

  const content =
    state === 'completed' && indicators.completed
      ? indicators.completed
      : state === 'active' && indicators.loading
      ? indicators.loading
      : children

  return (
    <div
      data-state={state}
      className={`flex items-center justify-center rounded-full transition-colors duration-300 ${className ?? ''}`}
    >
      {content}
    </div>
  )
}

// ── StepperTitle ──────────────────────────────────────────────────────────────

interface TitleProps { className?: string; children: ReactNode }

export function StepperTitle({ className, children }: TitleProps) {
  return <span className={className}>{children}</span>
}

// ── StepperSeparator ──────────────────────────────────────────────────────────

interface SeparatorProps { className?: string }

export function StepperSeparator({ className }: SeparatorProps) {
  return (
    <div
      aria-hidden
      className={`h-0.5 bg-gray-700 transition-colors duration-500 ${className ?? ''}`}
    />
  )
}

// ── StepperPanel ──────────────────────────────────────────────────────────────

interface PanelProps { className?: string; children: ReactNode }

export function StepperPanel({ className, children }: PanelProps) {
  return <div className={className}>{children}</div>
}

// ── StepperContent ────────────────────────────────────────────────────────────

interface ContentProps { value: number; className?: string; children: ReactNode }

export function StepperContent({ value, className, children }: ContentProps) {
  const { value: current } = useContext(StepperContext)
  if (value !== current) return null
  return <div className={className}>{children}</div>
}
