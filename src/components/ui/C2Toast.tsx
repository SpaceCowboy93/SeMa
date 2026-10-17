'use client'

/**
 * C2Toast — global feedback toast system.
 *
 * Mount <C2ToastRegion /> once in the app layout.
 * Trigger toasts via:
 *   const { show } = useToastStore()
 *   show('Saved!', 'success')
 * Or via the toast helper:
 *   import { toast } from '@/store/useToastStore'
 *   toast.success('Saved!')
 */

import { AnimatePresence, motion } from 'framer-motion'
import { X, CheckCircle2, AlertTriangle, AlertCircle, type LucideIcon } from '@/design/iconSystem'
import { useToastStore, type ToastVariant } from '@/store/useToastStore'
import { cn } from '@/lib/utils'

// ── Palette ───────────────────────────────────────────────────────────────────

const TOAST_STYLES: Record<ToastVariant, { bg: string; color: string; Icon: LucideIcon }> = {
  success: { bg: 'rgba(158,201,179,0.16)', color: '#4E7853', Icon: CheckCircle2  },
  error:   { bg: 'rgba(216,138,138,0.14)', color: '#B05A44', Icon: AlertCircle   },
  warning: { bg: 'rgba(231,183,124,0.16)', color: '#A8732A', Icon: AlertTriangle },
  info:    { bg: 'rgba(143,166,141,0.14)', color: '#527052', Icon: AlertCircle   },
}

// ── Single Toast ──────────────────────────────────────────────────────────────

interface ToastItemProps {
  id: string
  message: string
  variant: ToastVariant
}

function ToastItem({ id, message, variant }: ToastItemProps) {
  const dismiss = useToastStore(s => s.dismiss)
  const { bg, color, Icon } = TOAST_STYLES[variant]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-md max-w-[340px] w-full"
      style={{ background: bg, border: `1px solid ${color}22` }}
    >
      <Icon size={18} strokeWidth={1.75} style={{ color }} className="shrink-0" aria-hidden="true" />
      <span className="flex-1 text-sm font-medium" style={{ color: '#2D2926' }}>
        {message}
      </span>
      <button
        type="button"
        onClick={() => dismiss(id)}
        aria-label="Dismiss notification"
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full opacity-40 hover:opacity-70 active:opacity-90 transition-opacity"
        style={{ color: '#6B6458' }}
      >
        <X size={13} strokeWidth={2} aria-hidden="true" />
      </button>
    </motion.div>
  )
}

// ── Toast Region ──────────────────────────────────────────────────────────────

interface ToastRegionProps {
  className?: string
}

/**
 * Mount once in your layout, above the bottom nav.
 *
 * @example
 * // src/app/(app)/layout.tsx
 * import { C2ToastRegion } from '@/components/ui/C2Toast'
 * ...
 * <C2ToastRegion />
 * <BottomNav />
 */
export function C2ToastRegion({ className }: ToastRegionProps) {
  const toasts = useToastStore(s => s.toasts)

  return (
    <div
      aria-label="Notifications"
      className={cn(
        'fixed bottom-24 left-0 right-0 z-[80] flex flex-col items-center gap-2 px-4 pointer-events-none',
        className,
      )}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto w-full max-w-[340px]">
            <ToastItem {...t} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// ── Inline error ──────────────────────────────────────────────────────────────

interface InlineErrorProps {
  message: string
  className?: string
}

/** Small inline error below form fields or inside sections. */
export function C2InlineError({ message, className }: InlineErrorProps) {
  return (
    <p
      role="alert"
      className={cn('text-xs mt-1 px-1', className)}
      style={{ color: '#D88A8A' }}
    >
      {message}
    </p>
  )
}

// ── Error State ───────────────────────────────────────────────────────────────

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  className?: string
}

/** Full page or section-level error state. */
export function C2ErrorState({
  title = 'Something went wrong',
  message = 'Please try again.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center text-center px-6 py-14', className)}
      role="alert"
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
        style={{ background: 'rgba(216,138,138,0.12)', color: '#D88A8A' }}
      >
        <AlertCircle size={26} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <p className="font-semibold text-gray-700 mb-1 text-sm">{title}</p>
      <p className="text-xs text-gray-400 leading-relaxed max-w-[220px]">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-5 py-2.5 rounded-full text-xs font-semibold text-white"
          style={{ background: '#9EC9B3' }}
        >
          Try again
        </button>
      )}
    </div>
  )
}
