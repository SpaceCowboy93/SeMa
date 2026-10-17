'use client'

/**
 * C2Skeleton — soft-shimmer loading placeholders.
 *
 * Shapes match real content to prevent layout shift.
 * Respects prefers-reduced-motion.
 */

import { cn } from '@/lib/utils'

// ── Base shimmer ──────────────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string
  'aria-label'?: string
}

/**
 * Single skeleton line/block. Compose these into larger skeletons.
 *
 * @example
 * <C2Skeleton className="h-4 w-3/4 rounded-xl" />
 */
export function C2Skeleton({ className, 'aria-label': ariaLabel }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel ?? 'Loading…'}
      aria-busy="true"
      className={cn(
        'bg-gray-100 rounded-xl',
        'motion-safe:animate-[shimmer_1.6s_ease-in-out_infinite]',
        className,
      )}
    />
  )
}

// ── Card skeleton ─────────────────────────────────────────────────────────────

interface CardSkeletonProps {
  lines?: number
  className?: string
}

/** Skeleton that mimics a standard card with title + body lines. */
export function C2CardSkeleton({ lines = 2, className }: CardSkeletonProps) {
  return (
    <div
      className={cn('c2-card p-4 space-y-3', className)}
      aria-busy="true"
      aria-label="Loading…"
      role="status"
    >
      <C2Skeleton className="h-4 w-2/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <C2Skeleton
          key={i}
          className={cn('h-3', i === lines - 1 ? 'w-1/2' : 'w-full')}
        />
      ))}
    </div>
  )
}

// ── List skeleton ─────────────────────────────────────────────────────────────

interface ListSkeletonProps {
  rows?: number
  className?: string
}

/** Skeleton that mimics a list of rows (icon + two lines). */
export function C2ListSkeleton({ rows = 3, className }: ListSkeletonProps) {
  return (
    <div className={cn('space-y-2', className)} aria-busy="true" role="status" aria-label="Loading…">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50">
          <C2Skeleton className="w-9 h-9 rounded-2xl shrink-0" />
          <div className="flex-1 space-y-2">
            <C2Skeleton className="h-3 w-3/4" />
            <C2Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Inline skeleton text ──────────────────────────────────────────────────────

/** Single inline text line placeholder. */
export function C2SkeletonText({ className }: { className?: string }) {
  return <C2Skeleton className={cn('h-3 rounded-full', className)} />
}
