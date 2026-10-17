'use client'

/**
 * C2Dialog — shared centred dialog / confirmation panel.
 *
 * Usage:
 *   <C2Dialog
 *     open={open}
 *     title="Delete this item?"
 *     description="This cannot be undone."
 *     onCancel={close}
 *     onConfirm={handleDelete}
 *   />
 *
 * Or with custom content:
 *   <C2Dialog open={open} title="Info" onCancel={close}>
 *     <p>Custom body content here.</p>
 *   </C2Dialog>
 */

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { type LucideIcon, Trash2 } from '@/design/iconSystem'
import { cn } from '@/lib/utils'

// ── Motion config ─────────────────────────────────────────────────────────────

const DIALOG_TRANSITION = { duration: 0.22, ease: [0.32, 0.72, 0, 1] }

// ── C2Dialog ──────────────────────────────────────────────────────────────────

export interface C2DialogProps {
  open: boolean
  title: string
  description?: string
  /** Optional icon shown above the title. */
  icon?: LucideIcon
  /** Icon variant: 'danger' (terracotta) | 'neutral' (sage). Default 'neutral'. */
  iconVariant?: 'danger' | 'neutral'
  /** Label for the cancel button. Default 'Cancel'. */
  cancelLabel?: string
  /** Label for the confirm button. */
  confirmLabel?: string
  /** Whether the confirm action is destructive. Default false. */
  destructive?: boolean
  onCancel: () => void
  onConfirm?: () => void
  /** Replaces the default cancel/confirm buttons with custom content. */
  children?: React.ReactNode
  className?: string
}

export function C2Dialog({
  open,
  title,
  description,
  icon: Icon = Trash2,
  iconVariant = 'neutral',
  cancelLabel = 'Cancel',
  confirmLabel,
  destructive = false,
  onCancel,
  onConfirm,
  children,
  className,
}: C2DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus trap + Escape key
  useEffect(() => {
    if (!open) return

    const panel = panelRef.current
    if (!panel) return

    const selectors = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); return }
      if (e.key !== 'Tab') return

      const focusable = Array.from(panel!.querySelectorAll<HTMLElement>(selectors))
      if (!focusable.length) return

      const first = focusable[0]
      const last  = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }

    document.addEventListener('keydown', handleKey)
    const firstBtn = panel.querySelector<HTMLElement>(selectors)
    if (firstBtn) firstBtn.focus()

    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onCancel])

  const iconBg = iconVariant === 'danger'
    ? 'rgba(194,122,99,0.12)'
    : 'rgba(143,166,141,0.14)'
  const iconColor = iconVariant === 'danger' ? '#B05A44' : '#527052'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[90] flex items-center justify-center p-6"
          aria-modal="true"
          role="dialog"
          aria-labelledby="c2-dialog-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(45,41,38,0.40)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
            onClick={onCancel}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ scale: 0.94, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 8 }}
            transition={DIALOG_TRANSITION}
            className={cn(
              'relative c2-sheet-bg rounded-3xl p-6 w-full max-w-xs text-center shadow-modal',
              className,
            )}
          >
            {/* Icon */}
            {Icon && (
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                style={{ background: iconBg, color: iconColor }}
              >
                <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              </div>
            )}

            {/* Title */}
            <h3
              id="c2-dialog-title"
              className="font-bold mb-1"
              style={{ color: '#2D2926' }}
            >
              {title}
            </h3>

            {/* Description */}
            {description && (
              <p className="text-sm mb-5" style={{ color: '#9B9590' }}>
                {description}
              </p>
            )}

            {/* Custom content */}
            {children && !confirmLabel && (
              <div className="mt-4">{children}</div>
            )}

            {/* Default action buttons */}
            {(cancelLabel || confirmLabel) && !children && (
              <div className="flex gap-3 mt-5">
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 py-3 rounded-2xl c2-sheet-cancel font-medium text-sm"
                >
                  {cancelLabel}
                </button>
                {confirmLabel && onConfirm && (
                  <button
                    type="button"
                    onClick={onConfirm}
                    className={cn(
                      'flex-1 py-3 rounded-2xl font-medium text-sm',
                      destructive ? 'c2-sheet-danger' : 'c2-sheet-cancel',
                    )}
                    style={!destructive ? { background: '#527052', color: 'white' } : undefined}
                  >
                    {confirmLabel}
                  </button>
                )}
              </div>
            )}

            {/* Children with cancel */}
            {children && confirmLabel && (
              <>
                <div className="mt-4">{children}</div>
                <div className="flex gap-3 mt-4">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 py-3 rounded-2xl c2-sheet-cancel font-medium text-sm"
                  >
                    {cancelLabel}
                  </button>
                  {onConfirm && (
                    <button
                      type="button"
                      onClick={onConfirm}
                      className={cn(
                        'flex-1 py-3 rounded-2xl font-medium text-sm',
                        destructive ? 'c2-sheet-danger' : '',
                      )}
                      style={!destructive ? { background: '#527052', color: 'white' } : undefined}
                    >
                      {confirmLabel}
                    </button>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
