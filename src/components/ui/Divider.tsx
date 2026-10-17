'use client'

import { cn } from '@/lib/utils'

export type DividerVariant = 'default' | 'botanical' | 'sheet'

export interface DividerProps {
  variant?: DividerVariant
  className?: string
  /** Horizontal inset (applied as mx-N). Default 0. */
  inset?: number
}

/**
 * Divider — section separator line.
 *
 * variant='default'   → rgba(45,41,38,0.06) solid hairline
 * variant='botanical' → gradient fade, warm sage tint (`.bj-divider`)
 * variant='sheet'     → rgba(180,165,140,0.15) — for sheet footers
 */
export function Divider({ variant = 'default', className, inset = 0 }: DividerProps) {
  if (variant === 'botanical') {
    return (
      <div
        className={cn('bj-divider', inset > 0 && `mx-${inset}`, className)}
      />
    )
  }

  const styles: Record<DividerVariant, string> = {
    default:    'rgba(45,41,38,0.06)',
    botanical:  'transparent',
    sheet:      'rgba(180,165,140,0.15)',
  }

  return (
    <div
      className={cn('h-px', inset > 0 && `mx-${inset}`, className)}
      style={{ background: styles[variant] }}
    />
  )
}
