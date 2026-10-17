'use client'

import { motion } from 'framer-motion'
import { ChevronRight, type LucideIcon } from '@/design/iconSystem'
import { cn } from '@/lib/utils'

export interface ListItemProps {
  /** Icon or ReactNode rendered in the left slot. */
  icon?: LucideIcon | React.ReactNode
  /** Icon tint color (used when icon is a LucideIcon). */
  iconColor?: string
  title: string
  subtitle?: string
  /** Whether to render a right-facing chevron. */
  showChevron?: boolean
  /** Renders a strikethrough + muted style. */
  done?: boolean
  onClick?: () => void
  trailing?: React.ReactNode
  className?: string
}

function isLucideIcon(icon: unknown): icon is LucideIcon {
  return typeof icon === 'function'
}

/**
 * ListItem — standard list row used in shopping lists, milestone rows, etc.
 *
 * @example
 * <ListItem
 *   icon={Heart}
 *   iconColor={primary}
 *   title="First kiss"
 *   subtitle="2 years ago"
 *   showChevron
 *   onClick={() => setSelected(item)}
 * />
 */
export function ListItem({
  icon,
  iconColor = '#9EC9B3',
  title,
  subtitle,
  showChevron = false,
  done = false,
  onClick,
  trailing,
  className,
}: ListItemProps) {
  const Tag = onClick ? motion.button : 'div'
  const motionProps = onClick ? { whileTap: { scale: 0.97 } } : {}

  const TagEl = Tag as any
  return (
    <TagEl
      {...motionProps}
      onClick={onClick}
      className={cn(
        'bg-gray-50 rounded-2xl p-3.5 flex items-center gap-3',
        onClick && 'w-full text-left active:opacity-90',
        done  && 'opacity-50',
        className,
      )}
    >
      {/* Left icon */}
      {icon && (
        isLucideIcon(icon) ? (
          <div
            className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: `${iconColor}18`, color: iconColor }}
          >
            {(() => { const I = icon; return <I size={17} strokeWidth={1.75} /> })()}
          </div>
        ) : (
          <div className="shrink-0">{icon as React.ReactNode}</div>
        )
      )}

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-semibold text-gray-800 truncate', done && 'line-through text-gray-400')}>
          {title}
        </p>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>
        )}
      </div>

      {/* Trailing slot */}
      {trailing}

      {/* Chevron */}
      {showChevron && !trailing && (
        <ChevronRight size={15} className="text-gray-300 shrink-0" />
      )}
    </TagEl>
  )
}
