'use client'

/**
 * App-group error boundary — catches errors in the (app) route group.
 *
 * This is scoped to authenticated routes (/together, /planner, /plans, /us …).
 * It renders within the existing layout so the shell (nav, fonts) remains intact.
 */

import { useEffect } from 'react'
import { AlertCircle } from '@/design/iconSystem'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AppError({ error, reset }: Props) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[SeMa AppError]', error)
    }
  }, [error])

  return (
    <div
      className="flex flex-col items-center justify-center text-center px-6 py-20 min-h-[60vh]"
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
        style={{ background: 'rgba(216,138,138,0.12)', color: '#D88A8A' }}
      >
        <AlertCircle size={24} strokeWidth={1.5} aria-hidden="true" />
      </div>

      <h2
        className="text-base font-bold mb-1"
        style={{ color: '#2D2926' }}
      >
        Something went wrong
      </h2>

      <p
        className="text-sm leading-relaxed max-w-[240px] mb-6"
        style={{ color: '#9B9590' }}
      >
        This section encountered an unexpected problem.
      </p>

      <div className="flex gap-3 flex-wrap justify-center">
        <button
          onClick={reset}
          autoFocus
          className="px-5 py-2.5 rounded-full text-sm font-semibold text-white"
          style={{ background: '#9EC9B3' }}
        >
          Try again
        </button>

        <a
          href="/together"
          className="px-5 py-2.5 rounded-full text-sm font-semibold"
          style={{ background: 'rgba(155,149,144,0.12)', color: '#6B6458' }}
        >
          Back to home
        </a>
      </div>
    </div>
  )
}
