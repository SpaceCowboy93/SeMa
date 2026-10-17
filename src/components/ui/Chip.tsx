'use client'

import { motion } from 'framer-motion'
import { type LucideIcon } from '@/design/iconSystem'
import { cn } from '@/lib/utils'

// ── Chip ──────────────────────────────────────────────────────────────────────

export interface ChipProps {
  icon?: LucideIcon
  label: string
  selected?: boolean
  /** Hex color applied when selected (e.g. '#34d399'). */
  activeColor?: string
  onClick?: () => void
  disabled?: boolean
  className?: string
}

/**
 * Chip — small rounded pill for type/category selection.
 *
 * Used in QuickAddSheet, FullCreateSheet and CategoryHub chips.
 * When selected: colored background + white text.
 * When idle: warm gray background + muted text.
 */
export function Chip({
  icon: Icon,
  label,
  selected = false,
  activeColor,
  onClick,
  disabled = false,
  className,
}: ChipProps) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.93 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold shrink-0 transition-all',
        'disabled:opacity-40 disabled:pointer-events-none',
        className,
      )}
      style={
        selected
          ? { background: activeColor ?? '#9EC9B3', color: 'white' }
          : { background: '#EDE9E3',                color: '#8B7D70' }
      }
    >
      {Icon && <Icon size={13} strokeWidth={1.75} />}
      {label}
    </motion.button>
  )
}

// ── ChipGroup ─────────────────────────────────────────────────────────────────

export interface ChipGroupProps {
  className?: string
  children: React.ReactNode
}

/** Horizontal scrollable chip row. */
export function ChipGroup({ className, children }: ChipGroupProps) {
  return (
    <div className={cn('flex gap-2 overflow-x-auto pb-1 -mx-1 px-1', className)}>
      {children}
    </div>
  )
}
