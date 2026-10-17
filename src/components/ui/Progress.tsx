'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// ── Together palette progress colors ─────────────────────────────────────────

export type ProgressVariant = 'positive' | 'warning' | 'danger' | 'neutral' | 'primary'

const PROGRESS_COLORS: Record<ProgressVariant, string> = {
  positive: '#9EC9B3',  // Sage Green
  warning:  '#E7B77C',  // Warm Sand
  danger:   '#D88A8A',  // Dusty Rose
  neutral:  'rgba(45,41,38,0.15)',
  primary:  'currentColor',
}

export interface ProgressProps {
  /** 0–100 */
  value: number
  variant?: ProgressVariant
  /** Explicit hex color — overrides variant. */
  color?: string
  /** Track height in px. Default 6. */
  height?: number
  /** Animate width on mount. Default true. */
  animated?: boolean
  className?: string
  /** Custom track background. Default gray-100. */
  trackColor?: string
}

/**
 * Progress — reusable animated progress bar.
 *
 * Matches Together palette: Sage Green / Warm Sand / Dusty Rose.
 *
 * @example
 * <Progress value={75} variant="positive" />
 * <Progress value={90} variant="warning" />
 * <Progress value={110} variant="danger" />
 * <Progress value={50} color={primary} />
 */
export function Progress({
  value,
  variant = 'positive',
  color,
  height = 6,
  animated = true,
  className,
  trackColor = '#f3f4f6',
}: ProgressProps) {
  const fillColor = color ?? PROGRESS_COLORS[variant]
  const clamped   = Math.min(Math.max(value, 0), 100)

  return (
    <div
      className={cn('w-full overflow-hidden rounded-full', className)}
      style={{ height, background: trackColor }}
    >
      {animated ? (
        <motion.div
          className="h-full rounded-full"
          style={{ background: fillColor }}
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      ) : (
        <div
          className="h-full rounded-full"
          style={{ width: `${clamped}%`, background: fillColor }}
        />
      )}
    </div>
  )
}

// ── ProgressWithLabel ─────────────────────────────────────────────────────────

export interface ProgressWithLabelProps extends ProgressProps {
  label?: string
  valueLabel?: string
}

export function ProgressWithLabel({
  label,
  valueLabel,
  className,
  ...props
}: ProgressWithLabelProps) {
  return (
    <div className={cn('w-full space-y-1.5', className)}>
      {(label || valueLabel) && (
        <div className="flex items-center justify-between">
          {label    && <span className="text-xs text-gray-500">{label}</span>}
          {valueLabel && <span className="text-xs font-semibold text-gray-600">{valueLabel}</span>}
        </div>
      )}
      <Progress {...props} className={undefined} />
    </div>
  )
}
