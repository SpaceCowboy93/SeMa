import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Callers must first verify couple membership or the server-only cron secret.

/**
 * Returns a Supabase admin client, or null when the required env vars are
 * absent (e.g. in Preview/staging deployments that don't have Supabase
 * credentials configured).
 *
 * Callers must check for null and return a 503 before proceeding:
 *
 *   const supabase = getAdminClient()
 *   if (!supabase) return supabaseUnavailable()
 */
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Standard 503 response when Supabase is not configured in this environment. */
export function supabaseUnavailable() {
  return NextResponse.json(
    { error: 'Push notifications are not configured in this environment.' },
    { status: 503 },
  )
}
