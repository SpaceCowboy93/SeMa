import { withCoupleAuth } from '@/lib/supabase-server'
import { AccessError } from '@/lib/couple-access'
import { getAdminClient } from '../push/_admin'
import { NextResponse } from 'next/server'

// Membership is verified before using the privileged Storage client.

const BUCKET = 'event-photos'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const VALID_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
])

// Server-side admin client — uses service role key, bypasses RLS entirely.
// NEVER expose the service role key to the browser.
export const POST = withCoupleAuth(async (req, access) => {
  try {
    const form   = await req.formData()
    const file   = form.get('file') as File | null
    const folder = (form.get('folder') ?? form.get('eventId')) as string | null

    // ── Validate inputs ──────────────────────────────────────────────────────
    if (!(file instanceof File) || typeof folder !== 'string' || !/^(events|todos|focus|goals|wishes|finance-categories|anniversaries)\/[A-Za-z0-9_-]{1,128}$/.test(folder)) {
      return NextResponse.json({ error: 'Missing file or folder' }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.` },
        { status: 400 },
      )
    }

    // Normalise MIME type — some Android browsers send 'image/jpg' instead of 'image/jpeg'
    const mimeType = file.type === 'image/jpg' ? 'image/jpeg' : (file.type || 'image/jpeg')
    if (!VALID_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported file type "${file.type}". Use JPG, PNG, WebP, or HEIC.` },
        { status: 400 },
      )
    }

    // ── Upload ───────────────────────────────────────────────────────────────
    const bytes    = await file.arrayBuffer()
    const buffer   = Buffer.from(bytes)
    const safeName = file.name.replace(/[^\w.\-]/g, '_').replace(/\s+/g, '_')
    const path     = `${access.coupleId}/${folder}/${crypto.randomUUID()}-${safeName}`

    const supabase = getAdminClient()
    if (!supabase) throw new AccessError(503, 'Storage is not configured.')
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: false,
        cacheControl: '31536000', // 1 year — immutable uploads
      })

    if (error || !data) {
      // Log the full Supabase error server-side (safe — never reaches client)
      console.error('[upload-photo] Supabase storage error:', {
        message: error?.message,
        bucket:  BUCKET,
        path,
        mimeType,
        sizeBytes: file.size,
      })
      // Return a client-safe message with enough context to diagnose
      const clientMsg = error?.message?.includes('Bucket not found')
        ? 'Storage bucket not configured. Contact the developer.'
        : error?.message?.includes('Invalid API key')
        ? 'Server configuration error. Contact the developer.'
        : (error?.message ?? 'Upload failed. Please try again.')
      return NextResponse.json({ error: clientMsg }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
    console.info('[upload-photo] Uploaded successfully:', data.path)
    return NextResponse.json({ url: urlData.publicUrl })

  } catch (err) {
    if (err instanceof AccessError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[upload-photo] Unexpected error:', msg)
    // Never expose raw error messages to the client
    const clientMsg = msg.includes('env vars not configured')
      ? 'Server configuration error. Contact the developer.'
      : 'Unexpected upload error. Please try again.'
    return NextResponse.json({ error: clientMsg }, { status: 500 })
  }
})
