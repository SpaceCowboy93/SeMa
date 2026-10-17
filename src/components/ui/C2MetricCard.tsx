'use client'

/**
 * C2MetricCard — compact card for a single metric value.
 *
 * Used in Finance summaries, Savings progress, etc.
 *
 * @example
 * <C2MetricCard
 *   label="Remaining Budget"
 *   value="€1,240"
 *   trend="+12% vs last month"
 *   trendVariant="positive"
 * />
 */

import { type LucideIcon } from '@/design/iconSystem'
import { cn } from '@/lib/utils'

export type MetricTrendVariant = 'positive' | 'negative' | 'neutral'

const TREND_COLORS: Record<MetricTrendVariant, string> = {
  positive: '#5B9A85',
  negative: '#D88A8A',
  neutral:  '#9B9590',
}

export interface C2MetricCardProps {
  label: string
  value: string | number
  /** Small supplementary text below the value. */
  subValue?: string
  /** Trend badge text. */
  trend?: string
  trendVariant?: MetricTrendVariant
  /** Optional icon in the top-left corner. */
  icon?: LucideIcon
  /** Accent color for icon and optional highlight. */
  accentColor?: string
  className?: string
  onClick?: () => void
}

export function C2MetricCard({
  label,
  value,
  subValue,
  trend,
  trendVariant = 'neutral',
  icon: Icon,
  accentColor = '#8FA68D',
  className,
  onClick,
}: C2MetricCardProps) {
  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      onClick={onClick}
      className={cn(
        'c2-card p-4 text-left w-full',
        onClick && 'active:opacity-85 transition-opacity',
        className,
      )}
    >
      {/* Icon + label row */}
      <div className="flex items-center gap-2 mb-2">
        {Icon && (
          <div
            className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${accentColor}18`, color: accentColor }}
          >
            <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
          </div>
        )}
        <span className="c2-label truncate">{label}</span>
      </div>

      {/* Main value */}
      <p className="text-xl font-bold" style={{ color: '#2D2926' }}>
        {value}
      </p>

      {/* Sub value */}
      {subValue && (
        <p className="text-xs mt-0.5" style={{ color: '#9B9590' }}>
          {subValue}
        </p>
      )}

      {/* Trend badge */}
      {trend && (
        <span
          className="inline-flex items-center mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold"
          style={{
            background: `${TREND_COLORS[trendVariant]}18`,
            color: TREND_COLORS[trendVariant],
          }}
        >
          {trend}
        </span>
      )}
    </Tag>
  )
}

// ── C2ActionRow ────────────────────────────────────────────────────────────────

/**
 * C2ActionRow — flat row with an icon, title, subtitle and trailing action.
 *
 * Used for finance categories, shopping list rows, etc.
 */

export interface C2ActionRowProps {
  icon?: LucideIcon
  iconColor?: string
  title: string
  subtitle?: string
  trailing?: React.ReactNode
  onClick?: () => void
  className?: string
}

export function C2ActionRow({
  icon: Icon,
  iconColor = '#9EC9B3',
  title,
  subtitle,
  trailing,
  onClick,
  className,
}: C2ActionRowProps) {
  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-4 py-3 w-full text-left',
        onClick && 'active:bg-gray-50 transition-colors rounded-2xl',
        className,
      )}
    >
      {Icon && (
        <div
          className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: `${iconColor}18`, color: iconColor }}
        >
          <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{title}</p>
        {subtitle && (
          <p className="text-xs text-gray-400 truncate">{subtitle}</p>
        )}
      </div>

      {trailing && <div className="shrink-0">{trailing}</div>}
    </Tag>
  )
}
