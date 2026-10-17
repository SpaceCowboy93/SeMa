'use client'

import { motion } from 'framer-motion'
import { type LucideIcon } from '@/design/iconSystem'
import { Plus } from '@/design/iconSystem'
import { cn } from '@/lib/utils'

export interface SectionTitleAction {
  label?: string
  icon?: LucideIcon
  onClick: () => void
  color?: string
}

export interface SectionTitleProps {
  /** Main section heading. */
  title: string
  /** Optional eyebrow/subtitle rendered below title. */
  subtitle?: string
  /** Optional icon rendered left of the title. */
  icon?: LucideIcon
  /** Optional action rendered right of the title. */
  action?: SectionTitleAction
  className?: string
  as?: 'div' | 'header'
}

/**
 * SectionTitle — reusable section header.
 *
 * Extends C2SectionLabel with optional icon, subtitle, and action button.
 *
 * @example
 * <SectionTitle
 *   title="Milestones"
 *   action={{ icon: Plus, onClick: () => setOpen(true), color: primary }}
 * />
 */
export function SectionTitle({
  title,
  subtitle,
  icon: Icon,
  action,
  className,
  as: Tag = 'div',
}: SectionTitleProps) {
  const ActionIcon = action?.icon ?? Plus

  return (
    <Tag className={cn('flex items-center justify-between', className)}>
      <div className="flex items-center gap-2 min-w-0">
        {Icon && (
          <Icon size={14} strokeWidth={1.75} className="text-gray-400 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="c2-label">{title}</p>
          {subtitle && (
            <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{subtitle}</p>
          )}
        </div>
      </div>

      {action && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.93 }}
          onClick={action.onClick}
          className="flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1.5 text-white shrink-0"
          style={{ background: action.color ?? '#9EC9B3' }}
        >
          <ActionIcon size={12} strokeWidth={2.5} />
          {action.label}
        </motion.button>
      )}
    </Tag>
  )
}
