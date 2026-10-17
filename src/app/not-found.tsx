/**
 * Not Found — rendered for any unmatched route.
 *
 * Uses the C2 design language without structural emoji.
 */

import Link from 'next/link'
import { MapPin } from '@/design/iconSystem'
import { cn } from '@/lib/utils'

export default function NotFound() {
  return (
    <div
      className={cn(
        'min-h-screen flex flex-col items-center justify-center',
        'px-6 text-center',
      )}
      style={{ background: '#FAF8F5' }}
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
        style={{ background: 'rgba(143,166,141,0.12)', color: '#527052' }}
      >
        <MapPin size={28} strokeWidth={1.5} aria-hidden="true" />
      </div>

      <h1
        className="text-lg font-bold mb-2"
        style={{ color: '#2D2926' }}
      >
        Page not found
      </h1>

      <p
        className="text-sm leading-relaxed max-w-[260px] mb-7"
        style={{ color: '#9B9590' }}
      >
        This page does not exist. It may have moved or the link is out of date.
      </p>

      <Link
        href="/"
        className="px-6 py-3 rounded-full text-sm font-semibold text-white"
        style={{ background: '#9EC9B3' }}
      >
        Go home
      </Link>
    </div>
  )
}
