import { authenticatedFetch } from './authenticated-fetch'
import { enhance, photoCanvas, straighten } from './receipt-image'
import { readGeminiRows, reconcileGeminiRows } from './receipt-gemini'
import type { Position } from './receipt-sections'

export async function scanReceiptWithGemini(photos: string[], signal: AbortSignal, progress: (message: string) => void) {
  const bands: Position[][] = []
  progress('Checking visible rows on your device…')
  for (const [photo, src] of photos.entries()) {
    signal.throwIfAborted()
    const canvas = await photoCanvas(src)
    try {
      const originalPosition = straighten(canvas)
      bands.push(enhance(canvas).map(b => ({ photo, ...originalPosition(b) })))
    } finally { canvas.width = canvas.height = 1 }
  }
  signal.throwIfAborted()
  const body = JSON.stringify({ engine: 'gemini', consent: true, photos })
  // Below Vercel's 4.5 MB request ceiling, measured in UTF-8 bytes.
  if (new Blob([body]).size > 4_000_000) throw new Error('These photos are too large for cloud scanning. Keep them and use On-device · Tesseract, or choose smaller photos.')
  progress('Sending selected photos to Google Gemini…')
  const response = await authenticatedFetch('/api/receipts/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal })
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Gemini is unavailable. Use on-device scanning with these photos.')
  return reconcileGeminiRows(readGeminiRows(data, photos.length), bands)
}
