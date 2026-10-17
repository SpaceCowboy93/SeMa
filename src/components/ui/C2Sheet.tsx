'use client'

/**
 * C2Sheet — shared bottom-sheet system for the SeMa C2 design.
 *
 * Usage:
 *   <C2Sheet open={open} onClose={close}>
 *     <C2SheetHeader title="Edit Plan" onClose={close} />
 *     <C2SheetBody>…form fields…</C2SheetBody>
 *     <C2SheetFooter>
 *       <PrimaryButton color={primary} onClick={handleSave}>Save</PrimaryButton>
 *     </C2SheetFooter>
 *   </C2Sheet>
 */

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from '@/design/iconSystem'
import { cn } from '@/lib/utils'

// ── Motion config ─────────────────────────────────────────────────────────────

const SHEET_SPRING = { type: 'spring', damping: 30, stiffness: 380 } as const
const BACKDROP_TRANSITION = { duration: 0.22, ease: 'easeOut' } as const

// ── C2SheetBackdrop ───────────────────────────────────────────────────────────

interface BackdropProps {
  onClick?: () => void
}

export function C2SheetBackdrop({ onClick }: BackdropProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={BACKDROP_TRANSITION}
      onClick={onClick}
      aria-hidden="true"
      className="fixed inset-0 z-50"
      style={{
        background: 'rgba(45,41,38,0.35)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
      }}
    />
  )
}

// ── C2DragHandle ──────────────────────────────────────────────────────────────

export function C2DragHandle({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('c2-handle', className)}
    />
  )
}

// ── C2CloseButton ─────────────────────────────────────────────────────────────

interface CloseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onClose: () => void
  label?: string
}

export function C2CloseButton({ onClose, label = 'Close', className, ...rest }: CloseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className={cn(
        'w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x shrink-0',
        'transition-opacity active:opacity-70',
        className,
      )}
      {...rest}
    >
      <X size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}

// ── C2SheetHeader ─────────────────────────────────────────────────────────────

interface SheetHeaderProps {
  /** Main title shown in the header. Not rendered when children is provided. */
  title?: string
  /** Secondary descriptor below title. */
  subtitle?: string
  onClose?: () => void
  /** Replaces default title+subtitle with custom content. */
  children?: React.ReactNode
  className?: string
  hideDragHandle?: boolean
}

export function C2SheetHeader({
  title,
  subtitle,
  onClose,
  children,
  className,
  hideDragHandle = false,
}: SheetHeaderProps) {
  return (
    <div className={cn('px-5 pt-4 shrink-0', className)}>
      {!hideDragHandle && <C2DragHandle />}

      {children ?? (
        <div className="flex items-start justify-between mb-1">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-gray-800 leading-snug">{title ?? ''}</h2>
            {subtitle && (
              <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          {onClose && <C2CloseButton onClose={onClose} className="ml-3 mt-0.5" />}
        </div>
      )}
    </div>
  )
}

// ── C2SheetBody ───────────────────────────────────────────────────────────────

interface SheetBodyProps {
  children: React.ReactNode
  className?: string
}

export function C2SheetBody({ children, className }: SheetBodyProps) {
  return (
    <div
      className={cn(
        'flex-1 min-h-0 overflow-y-auto overscroll-contain px-5',
        className,
      )}
    >
      {children}
    </div>
  )
}

// ── C2SheetFooter ─────────────────────────────────────────────────────────────

interface SheetFooterProps {
  children: React.ReactNode
  className?: string
  /** Apply border-top divider. Default true. */
  withDivider?: boolean
}

export function C2SheetFooter({ children, className, withDivider = true }: SheetFooterProps) {
  return (
    <div
      className={cn(
        'shrink-0 px-5 pt-3 pb-sheet-footer',
        withDivider && 'border-t border-[rgba(180,165,140,0.15)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

// ── C2SheetSection ────────────────────────────────────────────────────────────

interface SheetSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

/** Inner grouped block — warm translucent surface for form fields. */
export function C2SheetSection({ children, className, ...rest }: SheetSectionProps) {
  return (
    <div className={cn('c2-sheet-section', className)} {...rest}>
      {children}
    </div>
  )
}

// ── C2FormField ───────────────────────────────────────────────────────────────

interface FormFieldProps {
  label: string
  htmlFor?: string
  error?: string
  children: React.ReactNode
  className?: string
}

/**
 * Wraps any input with a visible label and optional error message.
 * Use `htmlFor` matching the input's `id` for correct label association.
 */
export function C2FormField({ label, htmlFor, error, children, className }: FormFieldProps) {
  return (
    <div className={cn('w-full', className)}>
      <label
        htmlFor={htmlFor}
        className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5"
      >
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-[#D88A8A] mt-1 px-1">
          {error}
        </p>
      )}
    </div>
  )
}

// ── C2Sheet ───────────────────────────────────────────────────────────────────

interface SheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** z-index layer. Default 50. Use 60 for nested sheets. */
  zIndex?: number
  /** Accessible label for the dialog. Required for screen readers. */
  'aria-label'?: string
  /** Close sheet when backdrop is tapped. Default true. */
  closeOnBackdrop?: boolean
}

/**
 * C2Sheet — the root bottom-sheet container.
 *
 * Composes C2SheetBackdrop + animated panel.
 * All sheets must use this wrapper.
 *
 * @example
 * <C2Sheet open={open} onClose={close} aria-label="Edit Plan">
 *   <C2SheetHeader title="Edit Plan" onClose={close} />
 *   <C2SheetBody>…</C2SheetBody>
 *   <C2SheetFooter>…</C2SheetFooter>
 * </C2Sheet>
 */
export function C2Sheet({
  open,
  onClose,
  children,
  zIndex = 50,
  'aria-label': ariaLabel,
  closeOnBackdrop = true,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Lock body scroll while sheet is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Keep a stable ref to onClose so the focus-trap effect never re-fires
  // just because the parent re-renders and passes a new function reference.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // Trap focus inside sheet when open
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return

    const focusableSelectors = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ')

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return

      const focusable = Array.from(panel!.querySelectorAll<HTMLElement>(focusableSelectors))
      if (focusable.length === 0) return

      const first = focusable[0]
      const last  = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    // Auto-focus first interactive element (only on open, not on every re-render)
    const first = panel.querySelector<HTMLElement>(focusableSelectors)
    if (first) first.focus()

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <>
          <C2SheetBackdrop onClick={closeOnBackdrop ? onClose : undefined} />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SHEET_SPRING}
            className="fixed bottom-0 left-0 right-0 c2-sheet-bg rounded-t-[2rem] shadow-modal
                       max-w-lg mx-auto flex flex-col c2-sheet-panel"
            style={{ zIndex: zIndex + 1 }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
