import { NextResponse } from 'next/server'
import { consumeReceiptScan, withCoupleAuth } from '@/lib/supabase-server'
import { cloudScanConfigured, readReceiptBody, ReceiptCloudError, transcribeReceiptPhotos } from '@/lib/receipt-gemini-server'

export const runtime = 'nodejs'
export const maxDuration = 120

export const POST = withCoupleAuth(async request => {
  if (!cloudScanConfigured()) return NextResponse.json({ error: 'Gemini free-tier scanning is not configured. Your photos are kept; choose On-device · Tesseract.' }, { status: 503 })
  try {
    const photos = await readReceiptBody(request)
    if (!await consumeReceiptScan(request)) return NextResponse.json({ error: 'Cloud scan limit reached. Keep these photos and use On-device · Tesseract, or retry later.' }, { status: 429, headers: { 'Retry-After': '60' } })
    return NextResponse.json(await transcribeReceiptPhotos(photos, request.signal))
  } catch (error) {
    if (error instanceof ReceiptCloudError) return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
})
