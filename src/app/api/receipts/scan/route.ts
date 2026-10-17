import { withCoupleAuth } from '@/lib/supabase-server'
import { AccessError } from '@/lib/couple-access'
import { NextRequest, NextResponse } from 'next/server'
import { type ReceiptResult, type ReceiptItem } from '@/types'
import { generateId } from '@/lib/utils'

// Mock OCR — returns plausible structured data with confidence scores.
// Replace this with a real OCR/LLM call (e.g. Claude vision) when ready.
function mockScan(_photos: string[]): ReceiptResult {
  const today = new Date().toISOString().slice(0, 10)
  const items: ReceiptItem[] = [
    { id: generateId(), name: 'Milk 1L',        quantity: 2, unitPrice: 1.29, lineTotal: 2.58, confidence: 0.95 },
    { id: generateId(), name: 'Bread',          quantity: 1, unitPrice: 2.49, lineTotal: 2.49, confidence: 0.91 },
    { id: generateId(), name: 'Eggs (12)',      quantity: 1, unitPrice: 3.99, lineTotal: 3.99, confidence: 0.88 },
    { id: generateId(), name: 'Olive Oil 500ml',quantity: 1, unitPrice: 5.79, lineTotal: 5.79, confidence: 0.55 },
    { id: generateId(), name: 'Tomatoes 500g', quantity: 1, unitPrice: 1.69, lineTotal: 1.69, confidence: 0.82 },
  ]
  const subtotal   = parseFloat(items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2))
  const tax        = parseFloat((subtotal * 0.08).toFixed(2))
  const grandTotal = parseFloat((subtotal + tax).toFixed(2))

  return {
    store:     'Carrefour',
    date:      today,
    currency:  'EUR',
    items,
    subtotal,
    tax,
    grandTotal,
  }
}

export const POST = withCoupleAuth(async (req) => {
  try {
    const body   = await req.json()
    const photos: unknown = body.photos
    if (!Array.isArray(photos) || photos.length > 10 || !photos.every(photo => typeof photo === 'string' && photo.length <= 7_000_000)) throw new AccessError(400, 'Invalid receipt photos')

    // Simulate a small processing delay
    await new Promise(r => setTimeout(r, 800))

    const result = mockScan(photos)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AccessError) throw error
    return NextResponse.json({ error: 'Failed to process receipt' }, { status: 500 })
  }
})
