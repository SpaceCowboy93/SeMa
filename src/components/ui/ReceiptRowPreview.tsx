'use client'

import { useState } from 'react'
import type { Position } from '@/lib/receipt-sections'

export function ReceiptRowPreview({ photos, position }: { photos: string[]; position: Position }) {
  const [width, setWidth] = useState(100)
  const span = Math.max(0.01, position.bottom - position.top)
  const context = Math.min(1, Math.max(0.10, span * 3))
  const start = Math.max(0, Math.min(1 - context, (position.top + position.bottom - context) / 2))
  const src = photos[position.photo]
  return <div className="overflow-hidden rounded-lg bg-white border border-gray-200">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img hidden alt="" src={src} onLoad={({ currentTarget: img }) => setWidth(100 * img.naturalWidth / img.naturalHeight)} />
    <svg viewBox={`0 ${start * 100} ${width} ${context * 100}`} className="w-full max-h-40" role="img" aria-label={`Highlighted row on receipt photo ${position.photo + 1}`}>
      <image href={src} width={width} height="100" preserveAspectRatio="none" />
      <rect x="0" y={position.top * 100} width={width} height={span * 100} fill="#8fa68d" fillOpacity=".25" stroke="#527052" strokeWidth=".35" />
    </svg>
  </div>
}
