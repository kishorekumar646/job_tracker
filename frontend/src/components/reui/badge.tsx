// Author: Kishore Kumar
import { ReactNode } from 'react'

interface BadgeProps {
  variant?: 'primary-light' | 'success-light' | 'error-light' | 'secondary'
  size?: 'sm' | 'md'
  className?: string
  children: ReactNode
}

const VARIANT: Record<NonNullable<BadgeProps['variant']>, string> = {
  'primary-light': 'bg-primary-500/15 text-primary-400 border border-primary-500/25',
  'success-light': 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  'error-light':   'bg-red-500/15 text-red-400 border border-red-500/25',
  'secondary':     'bg-gray-700/60 text-gray-500 border border-gray-600/40',
}

const SIZE: Record<NonNullable<BadgeProps['size']>, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2.5 py-0.5 text-xs',
}

export function Badge({
  variant = 'secondary',
  size = 'md',
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${VARIANT[variant]} ${SIZE[size]} ${className ?? ''}`}
    >
      {children}
    </span>
  )
}
