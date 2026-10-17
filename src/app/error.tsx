'use client'

/**
 * Root error boundary for the Next.js App Router.
 *
 * Catches runtime errors in the root layout children.
 * Uses the C2 design language and palette.
 */

import { useEffect } from 'react'
import { AlertCircle } from '@/design/iconSystem'
import { cn } from '@/lib/utils'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function RootError({ error, reset }: Props) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[SeMa Error]', error)
    }
  }, [error])

  return (
    <div
      className={cn(
        'min-h-screen flex flex-col items-center justify-center',
        'px-6 text-center',
      )}
      style={{ background: '#FAF8F5' }}
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
        style={{ background: 'rgba(216,138,138,0.12)', color: '#D88A8A' }}
      >
        <AlertCircle size={26} strokeWidth={1.5} aria-hidden="true" />
      </div>

      <h1
        className="text-lg font-bold mb-2"
        style={{ color: '#2D2926' }}
      >
        Something went wrong
      </h1>

      <p
        className="text-sm leading-relaxed max-w-[260px] mb-7"
        style={{ color: '#9B9590' }}
      >
        The app hit an unexpected problem. You can try again or head back home.
      </p>

      <div className="flex gap-3 flex-wrap justify-center">
        <button
          onClick={reset}
          autoFocus
          className="px-6 py-3 rounded-full text-sm font-semibold text-white"
          style={{ background: '#9EC9B3' }}
        >
          Try again
        </button>

        <a
          href="/"
          className="px-6 py-3 rounded-full text-sm font-semibold"
          style={{ background: 'rgba(155,149,144,0.12)', color: '#6B6458' }}
        >
          Go home
        </a>
      </div>
    </div>
  )
}
