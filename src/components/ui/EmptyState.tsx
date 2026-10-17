'use client'

import { motion } from 'framer-motion'
import { type LucideIcon } from '@/design/iconSystem'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  /** Optional CTA rendered below the description. */
  action?: {
    label: string
    onClick: () => void
  }
  /** Accent color for the icon container. Defaults to sage green. */
  iconColor?: string
  /** Custom class for the root wrapper. */
  className?: string
  /** Slot for a custom illustration above the icon. */
  illustration?: React.ReactNode
  /** Control whether the root animates in. Default true. */
  animate?: boolean
}

/**
 * EmptyState — shared empty/zero-data screen pattern.
 *
 * Replaces 6+ duplicated patterns of:
 *   <div> icon container + title + description + optional button </div>
 *
 * @example
 * <EmptyState
 *   icon={Mail}
 *   title="No notes yet"
 *   description="Tap the heart to write your first note"
 *   action={{ label: 'Write one', onClick: () => {} }}
 * />
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  iconColor = '#7BBBA5',
  className,
  illustration,
  animate = true,
}: EmptyStateProps) {
  const Wrapper = animate ? motion.div : 'div'
  const wrapperProps = animate
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-14',
        className,
      )}
    >
      {illustration}

      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{
          background: `${iconColor}1A`,  // ~10% opacity of icon color
          color: iconColor,
        }}
      >
        <Icon size={30} strokeWidth={1.5} />
      </div>

      <p className="font-semibold text-gray-700 mb-1 text-sm">{title}</p>

      {description && (
        <p className="text-xs text-gray-400 leading-relaxed max-w-[220px]">
          {description}
        </p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-5 py-2.5 rounded-full text-xs font-semibold text-white"
          style={{ background: iconColor }}
        >
          {action.label}
        </button>
      )}
    </Wrapper>
  )
}

// ── DashedEmptyState ──────────────────────────────────────────────────────────
// Variant with a dashed border, used for add-first-item prompts.

export interface DashedEmptyStateProps extends EmptyStateProps {
  onClick?: () => void
}

export function DashedEmptyState({ onClick, className, ...props }: DashedEmptyStateProps) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'w-full rounded-2xl',
        onClick && 'active:opacity-80',
        className,
      )}
      style={{
        border: '1.5px dashed rgba(45,41,38,0.10)',
        background: 'rgba(255,255,255,0.50)',
      }}
    >
      <EmptyState {...props} animate={false} />
    </Tag>
  )
}
