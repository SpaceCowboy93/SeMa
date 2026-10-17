'use client'

/**
 * C2 Botanical Journal — shared static page background.
 *
 * Warm cream (#FDFAF5) base + soft daylight layers.
 * Felt more than seen. No blobs, no animation, no grain.
 */
export function C2PageBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[-1]"
      style={{ background: 'var(--bj-cream)' }}
    />
  )
}
