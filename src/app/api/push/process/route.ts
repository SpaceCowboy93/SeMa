import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { getAdminClient, supabaseUnavailable } from '../_admin'

// Only configure when env vars are present — prevents build-time throw in CI
if (process.env.VAPID_SUBJECT && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
}

// Authorization matrix — same rules as /api/push/send:
//   production + secret set     → check Bearer token
//   production + secret missing → reject 503 (misconfiguration; fail closed)
//   development + secret set    → check Bearer token
//   development + secret missing → allow with warning
type AuthResult =
  | { ok: true }
  | { ok: false; statusCode: 401 | 503; message: string }

function isAuthorized(req: NextRequest): AuthResult {
  const secret = process.env.CRON_SECRET

  if (!secret) return { ok: false, statusCode: 503, message: 'Service unavailable' }

  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${secret}`) {
    console.warn('[process] Unauthorized — wrong or missing Bearer token')
    return { ok: false, statusCode: 401, message: 'Unauthorized' }
  }

  return { ok: true }
}

const MAX_RETRIES = 5

// ── Per-subscription delivery tracking ────────────────────────────────────────
//
// Each push_reminders row carries a `delivered_endpoints` JSONB array (added by
// migration 0003).  On each cron run we:
//
//   1. Build deliveredSet from r.delivered_endpoints (already successfully sent)
//   2. Filter userSubs to pendingSubs (not yet delivered)
//   3. Attempt delivery only to pendingSubs
//   4. On success/stale: add endpoint to deliveredSet (stale = resolved, not retried)
//   5. If all pendingSubs resolved: mark sent_at on the reminder row
//   6. If any transient failure: update delivered_endpoints + retry_count (leave sent_at null)
//
// This guarantees:
//   - Device A does NOT receive the same reminder twice (already in deliveredSet)
//   - Device B remains retryable until resolved or permanently failed
//   - sent_at is set only once all active subscriptions are resolved

// GET — called by external cron (cron-job.org) every 5 minutes
export async function GET(req: NextRequest) {
  const runAt = new Date().toISOString()
  console.log('[process GET] Run at:', runAt)

  const auth = isAuthorized(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.statusCode })
  }

  console.log('[process GET] VAPID_SUBJECT present:',            !!process.env.VAPID_SUBJECT)
  console.log('[process GET] NEXT_PUBLIC_VAPID_PUBLIC_KEY:',     !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  console.log('[process GET] VAPID_PRIVATE_KEY present:',        !!process.env.VAPID_PRIVATE_KEY)
  console.log('[process GET] SUPABASE_SERVICE_ROLE_KEY present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

  const supabase = getAdminClient()
  if (!supabase) return supabaseUnavailable()
  const now      = new Date().toISOString()

  // 1. Fetch due, unsent reminders — exclude permanently failed rows
  const { data: reminders, error: remErr } = await supabase
    .from('push_reminders')
    .select('id, user_name, title, message, fire_at, item_type, retry_count, delivered_endpoints')
    .eq('couple_id', 'sema')
    .in('user_name', ['seval', 'mateo'])
    .lte('fire_at', now)
    .is('sent_at', null)
    .is('failed_permanently_at', null)
    .order('fire_at', { ascending: true })
    .limit(100)

  if (remErr) {
    console.error('[process GET] Supabase reminders query error:', remErr.message)
    return NextResponse.json({ error: 'Push service unavailable' }, { status: 500 })
  }

  console.log('[process GET] Due unsent reminders found:', reminders?.length ?? 0)
  reminders?.forEach(r => {
    console.log(
      `[process GET]   id=${r.id} user=${r.user_name} fire_at=${r.fire_at}` +
      ` retries=${r.retry_count} delivered=${JSON.stringify(r.delivered_endpoints ?? [])}` +
      ` msg="${r.message}"`,
    )
  })

  if (!reminders || reminders.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, checked_at: runAt })
  }

  // 2. Batch-fetch subscriptions for involved users
  const userNames = Array.from(new Set(reminders.map((r: { user_name: string }) => r.user_name)))
  console.log('[process GET] Fetching subscriptions for users:', userNames)

  const { data: subs, error: subErr } = await supabase
    .from('push_subscriptions')
    .select('user_name, endpoint, p256dh, auth')
    .eq('couple_id', 'sema')
    .in('user_name', userNames)

  if (subErr) {
    console.error('[process GET] Supabase subscriptions query error:', subErr.message)
    return NextResponse.json({ error: 'Push service unavailable' }, { status: 500 })
  }

  console.log('[process GET] Total subscriptions fetched:', subs?.length ?? 0)

  const subsByUser: Record<string, { endpoint: string; p256dh: string; auth: string }[]> = {}
  for (const s of (subs ?? [])) {
    const key = s.user_name.toLowerCase()
    if (!subsByUser[key]) subsByUser[key] = []
    subsByUser[key].push(s)
  }

  // 3. Per-reminder, per-subscription delivery
  const sentIds:        string[] = []
  const staleEndpoints: string[] = []
  const partialFails:   { id: string; retry_count: number; deliveredEndpoints: string[]; error: string }[] = []

  await Promise.all(
    reminders.map(async (r: {
      id:                  string
      user_name:           string
      title:               string
      message:             string
      fire_at:             string
      item_type?:          string
      retry_count:         number
      delivered_endpoints: string[] | null
    }) => {
      const normalizedUser = r.user_name.toLowerCase()
      const userSubs = subsByUser[normalizedUser] ?? []

      // Build the set of endpoints that already received this reminder successfully
      const deliveredSet = new Set<string>(r.delivered_endpoints ?? [])

      // Only attempt subscriptions not yet delivered
      const pendingSubs = userSubs.filter(s => !deliveredSet.has(s.endpoint))

      console.log(
        `[process GET] Reminder ${r.id} — user=${normalizedUser}` +
        ` total_subs=${userSubs.length} already_delivered=${deliveredSet.size} pending=${pendingSubs.length}`,
      )

      if (userSubs.length === 0) {
        // No subscriptions at all — leave unsent for when user re-subscribes
        console.log(`[process GET]   No subscriptions for ${normalizedUser} — leaving unsent`)
        return
      }

      if (pendingSubs.length === 0) {
        // Every active subscription has already received this reminder
        console.log(`[process GET]   All subscriptions already delivered for ${r.id} — marking sent`)
        sentIds.push(r.id)
        return
      }

      // Attempt delivery to pending subscriptions
      const newlyDelivered: string[] = []
      let anyTransientFail = false
      let lastErr = ''

      await Promise.all(
        pendingSubs.map(async sub => {
          const notifUrl = r.item_type === 'finance-month-end' ? '/plans' : '/together'
          const payload  = JSON.stringify({
            title: r.title,
            body:  r.message,
            url:   notifUrl,
            tag:   `sema-${r.id}`,
          })
          try {
            console.log(`[process GET]   → …${sub.endpoint.slice(-30)}`)
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
            )
            console.log(`[process GET]   ✓ …${sub.endpoint.slice(-30)}`)
            newlyDelivered.push(sub.endpoint)
          } catch (err: unknown) {
            const httpStatus = (err as { statusCode?: number }).statusCode
            const errBody    = (err as { body?: string }).body
            console.error(
              `[process GET]   ✗ …${sub.endpoint.slice(-30)} status=${httpStatus} body=${errBody}`,
            )
            if (httpStatus === 404 || httpStatus === 410) {
              // Stale subscription — remove it and treat as "resolved" (no retry for this endpoint)
              staleEndpoints.push(sub.endpoint)
              newlyDelivered.push(sub.endpoint)  // don't retry a removed subscription
            } else {
              // Transient failure — will be retried on next cron run
              anyTransientFail = true
              lastErr = `status=${httpStatus}`
            }
          }
        })
      )

      // Build the updated delivered set for this reminder
      const updatedDelivered = Array.from(deliveredSet).concat(newlyDelivered)

      if (!anyTransientFail) {
        // All pending subs resolved (delivered or confirmed stale) — mark the reminder fully sent
        sentIds.push(r.id)
        console.log(`[process GET]   Reminder ${r.id} fully resolved — marking sent`)
      } else {
        // At least one transient failure — update delivered_endpoints and increment retry
        partialFails.push({ id: r.id, retry_count: r.retry_count, deliveredEndpoints: updatedDelivered, error: lastErr })
        console.warn(`[process GET]   Reminder ${r.id} partial failure — retrying (count=${r.retry_count + 1})`)
      }
    })
  )

  // 4. Mark fully-resolved reminders as sent
  if (sentIds.length) {
    console.log('[process GET] Marking sent:', sentIds.length, 'reminders')
    const { error: updErr } = await supabase
      .from('push_reminders')
      .update({ sent_at: now })
      .eq('couple_id', 'sema').in('id', sentIds)
    if (updErr) console.error('[process GET] Mark-sent error:', updErr.message)
  }

  // 5. Remove stale subscriptions
  if (staleEndpoints.length) {
    console.log('[process GET] Removing stale subscriptions:', staleEndpoints.length)
    await supabase.from('push_subscriptions').delete().eq('couple_id', 'sema').in('endpoint', staleEndpoints)
  }

  // 6. Update partial failures — increment retry_count, persist delivered_endpoints
  for (const { id, retry_count, deliveredEndpoints, error: lastErr } of partialFails) {
    const newCount = retry_count + 1
    const updates: Record<string, unknown> = {
      retry_count:         newCount,
      last_error:          lastErr,
      delivered_endpoints: deliveredEndpoints,
    }
    if (newCount >= MAX_RETRIES) {
      updates.failed_permanently_at = now
      console.warn(`[process GET] Reminder ${id} permanently failed after ${newCount} attempts`)
    }
    const { error: retryErr } = await supabase
      .from('push_reminders')
      .update(updates)
      .eq('couple_id', 'sema').eq('id', id)
    if (retryErr) console.error(`[process GET] Retry-update error for ${id}:`, retryErr.message)
  }

  console.log(
    `[process GET] Done — sent: ${sentIds.length}` +
    ` stale: ${staleEndpoints.length}` +
    ` partial-fails: ${partialFails.length}`,
  )
  return NextResponse.json({
    ok:            true,
    processed:     sentIds.length,
    stale:         staleEndpoints.length,
    partial_fails: partialFails.length,
    checked_at:    runAt,
  })
}
