/**
 * /api/activity — Activity notifications API stub.
 *
 * STATUS: DISABLED — returns 503 until the Supabase egress quota is resolved
 *         and migration 20261008120000_activity_notifications.sql is applied.
 *
 * This file exists so:
 *  1. The route is claimed and won't accidentally be created with conflicting
 *     semantics by another developer.
 *  2. The client outbox flush hook (useActivityOutboxFlush — not yet built)
 *     can target this endpoint and handle the 503 gracefully via its retry
 *     backoff, rather than failing on a 404.
 *
 * Intended interface (once enabled):
 *   POST /api/activity
 *     Body: ActivityEvent (from src/lib/activity-event.ts)
 *     Auth: Bearer <supabase JWT>
 *     → 201 Created  on success
 *     → 409 Conflict if idempotency key already exists
 *     → 422 Unprocessable Entity if validation fails
 *
 *   GET  /api/activity?since=<ISO-8601>
 *     Auth: Bearer <supabase JWT>
 *     → 200 OK  { entries: ActivityEntry[] }
 */

import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json(
    { error: 'Activity API is not yet enabled. Supabase migration pending.' },
    { status: 503 },
  )
}

export function POST() {
  return NextResponse.json(
    { error: 'Activity API is not yet enabled. Supabase migration pending.' },
    { status: 503 },
  )
}
