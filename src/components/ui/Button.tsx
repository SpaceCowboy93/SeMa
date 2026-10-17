'use client'

import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import { type LucideIcon } from '@/design/iconSystem'
import { Loader2 } from '@/design/iconSystem'
import { cn } from '@/lib/utils'

// ── Variants ────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-soft'

const BASE =
  'inline-flex items-center justify-center gap-2 font-semibold select-none ' +
  'transition-transform active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:      'rounded-2xl py-3.5 px-6 text-sm text-white',
  secondary:    'rounded-2xl py-3 px-6 text-sm text-gray-600 bg-[#EDE9E3]',
  ghost:        'rounded-xl py-1.5 px-3 text-xs text-gray-500 bg-transparent',
  danger:       'rounded-2xl py-3.5 px-6 text-sm text-white bg-[#C27A63]',
  'danger-soft':'rounded-2xl py-2 px-4 text-sm bg-[rgba(194,122,99,0.12)] text-[#B05A44]',
}

// ── PrimaryButton ────────────────────────────────────────────────────────────

export interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Together palette primary color (e.g. '#14b8a6'). Required for variant=primary. */
  color?: string
  loading?: boolean
  fullWidth?: boolean
}

export const PrimaryButton = forwardRef<HTMLButtonElement, PrimaryButtonProps>(
  function PrimaryButton({ color, loading, fullWidth = true, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(BASE, VARIANTS.primary, fullWidth && 'w-full', className)}
        style={color ? { background: color } : undefined}
        {...rest}
      >
        {loading
          ? <><Loader2 size={16} className="animate-spin" /> Saving...</>
          : children
        }
      </button>
    )
  },
)

// ── SecondaryButton ──────────────────────────────────────────────────────────

export interface SecondaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  fullWidth?: boolean
}

export const SecondaryButton = forwardRef<HTMLButtonElement, SecondaryButtonProps>(
  function SecondaryButton({ fullWidth = true, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cn(BASE, VARIANTS.secondary, fullWidth && 'w-full', className)}
        {...rest}
      >
        {children}
      </button>
    )
  },
)

// ── GhostButton ──────────────────────────────────────────────────────────────

export interface GhostButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color?: string
}

export const GhostButton = forwardRef<HTMLButtonElement, GhostButtonProps>(
  function GhostButton({ color, className, children, style, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cn(BASE, VARIANTS.ghost, className)}
        style={color ? { color, ...style } : style}
        {...rest}
      >
        {children}
      </button>
    )
  },
)

// ── DangerButton ─────────────────────────────────────────────────────────────

export interface DangerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  soft?: boolean
  fullWidth?: boolean
}

export const DangerButton = forwardRef<HTMLButtonElement, DangerButtonProps>(
  function DangerButton({ soft = false, fullWidth = false, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          BASE,
          soft ? VARIANTS['danger-soft'] : VARIANTS.danger,
          fullWidth && 'w-full',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    )
  },
)

// ── IconButton ────────────────────────────────────────────────────────────────
// Round icon-only button — used for close (X), delete, etc.

export type IconButtonVariant = 'close' | 'soft-danger' | 'ghost' | 'primary'

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  iconSize?: number
  variant?: IconButtonVariant
  color?: string
}

const ICON_BTN_CLASSES: Record<IconButtonVariant, string> = {
  close:        'c2-sheet-x',
  'soft-danger':'c2-sheet-danger-soft',
  ghost:        'bg-transparent text-gray-400 hover:text-gray-600',
  primary:      'text-white',
}

export function IconButton({
  icon: Icon, iconSize = 16, variant = 'close', color, className, style, 'aria-label': ariaLabel, ...rest
}: IconButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        'w-8 h-8 flex items-center justify-center rounded-full shrink-0',
        'transition-opacity active:opacity-70',
        ICON_BTN_CLASSES[variant],
        className,
      )}
      style={variant === 'primary' && color ? { background: color, ...style } : style}
      {...rest}
    >
      <Icon size={iconSize} strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}

// ── MotionPrimaryButton ───────────────────────────────────────────────────────
// Framer Motion wrapper for animated press feedback on primary CTAs.

export function MotionPrimaryButton({
  color, loading, fullWidth = true, className, children, disabled, ...rest
}: PrimaryButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={disabled || loading}
      className={cn(BASE, VARIANTS.primary, fullWidth && 'w-full', className)}
      style={color ? { background: color } : undefined}
      {...(rest as any)}
    >
      {loading
        ? <><Loader2 size={16} className="animate-spin" /> Saving...</>
        : children
      }
    </motion.button>
  )
}
