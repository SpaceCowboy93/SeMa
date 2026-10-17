'use client'

import { cn } from '@/lib/utils'

// ── Together palette badge colors ─────────────────────────────────────────────

export type BadgeVariant =
  | 'success'    // Sage Green   — paid, done, active, positive
  | 'warning'    // Warm Sand    — near limit, upcoming
  | 'danger'     // Dusty Rose   — over budget, error
  | 'neutral'    // Warm gray    — draft, default
  | 'info'       // Blue tint    — informational

export type BadgeSize = 'sm' | 'md'

export interface BadgeProps {
  variant?: BadgeVariant
  size?: BadgeSize
  className?: string
  children: React.ReactNode
  /** Override background + text with raw hex. Bypasses variant. */
  color?: string
  background?: string
}

const BADGE_STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  success: { bg: 'rgba(158,201,179,0.20)', color: '#5B9A85'  },
  warning: { bg: 'rgba(231,183,124,0.20)', color: '#A8732A'  },
  danger:  { bg: 'rgba(216,138,138,0.12)', color: '#D88A8A'  },
  neutral: { bg: 'rgba(155,149,144,0.12)', color: '#9B9590'  },
  info:    { bg: 'rgba(96,165,250,0.15)',  color: '#3B82F6'  },
}

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[9px] rounded-md font-bold tracking-wide',
  md: 'px-2.5 py-1   text-xs   rounded-xl  font-semibold',
}

/**
 * Badge — status indicator pill.
 *
 * Matches Together palette: Sage Green / Warm Sand / Dusty Rose.
 *
 * @example
 * <Badge variant="success">PAID</Badge>
 * <Badge variant="danger">OVER</Badge>
 * <Badge variant="warning">DUE SOON</Badge>
 */
export function Badge({
  variant = 'neutral',
  size = 'sm',
  className,
  children,
  color,
  background,
}: BadgeProps) {
  const { bg, color: defaultColor } = BADGE_STYLES[variant]

  return (
    <span
      className={cn('inline-flex items-center uppercase shrink-0', SIZE_CLASSES[size], className)}
      style={{
        background: background ?? bg,
        color:      color      ?? defaultColor,
      }}
    >
      {children}
    </span>
  )
}
