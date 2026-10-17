import { requireRecipient, validateEndpoint } from '../_access'
import { withCoupleAuth } from '@/lib/supabase-server'
import { AccessError } from '@/lib/couple-access'
import { NextResponse } from 'next/server'
import { getAdminClient, supabaseUnavailable } from '../_admin'

// A verified member may sync reminders only for recipients in their couple.

// Maps the stable offset label to a human-readable message prefix.
// Labels match the ReminderEntry.label values produced by usePushNotifications.ts.
const LABEL_PREFIX: Record<string, string> = {
  prev_day_8pm:  'Tomorrow',
  '1h_before':   '1 hour',
  '5min_before': '5 min',
  at_time:       '',          // no prefix — fire exactly at event time
  '5min':        'In 5 min',
  '10min':       'In 10 min',
  '30min':       'In 30 min',
  '1h':          'In 1 hour',
}

function labelToMessage(label: string, title: string): string {
  const prefix = LABEL_PREFIX[label]
  if (prefix === undefined) return title               // unknown label — use title as-is
  if (prefix === '')        return title               // at_time — no prefix
  return `${prefix}: ${title}`
}

// POST — upsert push_reminders for a user based on their current dated items
//
// Body:
//   userName:  string
//   items:     { id, type, title, reminders: { fireAt: string, label: string }[] }[]
//   endpoint?: string   (optional — current device's push endpoint for ownership check)
//
// Rate limit: 3 seconds per user (tracked in push_sync_log)
export const POST = withCoupleAuth(async (req, access) => {
  try {
    const { userName: rawUserName, items, endpoint } = await req.json()
    const userName = typeof rawUserName === 'string' ? rawUserName.toLowerCase() : rawUserName

    if (!userName || !Array.isArray(items) || items.length > 1000) {
      return NextResponse.json({ error: 'Missing userName or items' }, { status: 400 })
    }

    const supabase = getAdminClient()
    if (!supabase) return supabaseUnavailable()
    await requireRecipient(supabase, access, userName)
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(item.id) ||
          !['event', 'todo', 'goal', 'wishlist', 'countdown', 'focus'].includes(item.type) ||
          typeof item.title !== 'string' || item.title.length > 500 || !Array.isArray(item.reminders) || item.reminders.length > 10 ||
          !item.reminders.every((r: { fireAt?: unknown; label?: unknown } | null) => r && typeof r.fireAt === 'string' && Number.isFinite(Date.parse(r.fireAt)) &&
            typeof r.label === 'string' && Object.prototype.hasOwnProperty.call(LABEL_PREFIX, r.label))) {
        throw new AccessError(400, 'Invalid reminders')
      }
    }
    if (endpoint) {
      validateEndpoint(endpoint)
      const { data: device, error } = await supabase.from('push_subscriptions').select('id')
        .eq('endpoint', endpoint).eq('couple_id', access.stateId).eq('user_name', access.userName).maybeSingle()
      if (error) throw new AccessError(503, 'Could not verify device')
      if (!device) throw new AccessError(403, 'Device does not belong to this account')
    }
    const rateKey = access.coupleId + ':' + userName
    const now       = new Date()
    const nowIso    = now.toISOString()
    const MIN_SYNC_INTERVAL_MS = 3000

    // ── Rate limiting ──────────────────────────────────────────────────────────
    const { data: syncLog } = await supabase
      .from('push_sync_log')
      .select('last_sync_at')
      .eq('user_name', rateKey)
      .single()

    if (syncLog?.last_sync_at) {
      const elapsed = now.getTime() - new Date(syncLog.last_sync_at).getTime()
      if (elapsed < MIN_SYNC_INTERVAL_MS) {
        const retryAfter = Math.ceil((MIN_SYNC_INTERVAL_MS - elapsed) / 1000)
        console.log(`[sync-reminders] Rate limit hit for ${userName} — retry in ${retryAfter}s`)
        return NextResponse.json({ error: 'Too many requests', retryAfter }, { status: 429 })
      }
    }

    await supabase
      .from('push_sync_log')
      .upsert({ user_name: rateKey, last_sync_at: nowIso }, { onConflict: 'user_name' })

    // ── Build rows ─────────────────────────────────────────────────────────────
    const rows: Record<string, unknown>[] = []

    for (const item of items) {
      const { id, type, title, reminders } = item as {
        id:        string
        type:      string
        title:     string
        reminders: { fireAt: string; label: string }[]
      }

      if (!id || !type || !title || !Array.isArray(reminders)) {
        console.warn('[sync-reminders] Skipping malformed item:', item)
        continue
      }

      for (const reminder of reminders) {
        const { fireAt, label } = reminder
        if (!fireAt || !label || fireAt <= nowIso) continue   // skip past or incomplete

        const reminderKey = `${userName}:${type}:${id}:${label}`

        rows.push({
          couple_id:            access.stateId,
          user_name:            userName,
          item_id:              id,
          item_type:            type,
          reminder_key:         reminderKey,
          fire_at:              fireAt,
          title:                'SeMa 💕',
          message:              labelToMessage(label, title),
          // Reset delivery tracking so a resynced item gets fresh attempts.
          // delivered_endpoints is reset to [] on every sync because fire_at may have changed
          // (different event time = new effective reminder = previous deliveries no longer apply).
          retry_count:          0,
          last_error:           null,
          failed_permanently_at: null,
          delivered_endpoints:  [],
          // sent_at intentionally omitted — never overwrite an already-sent row
        })
      }
    }

    console.log(`[sync-reminders] ${userName} — items: ${items.length}, future rows: ${rows.length}`)

    // ── Upsert on reminder_key ─────────────────────────────────────────────────
    // ON CONFLICT (reminder_key) DO UPDATE SET ... (all columns in the row except sent_at)
    if (rows.length > 0) {
      const { error: upsertErr } = await supabase
        .from('push_reminders')
        .upsert(rows, { onConflict: 'reminder_key' })

      if (upsertErr) {
        console.error('[sync-reminders] Upsert error:', upsertErr.message, upsertErr.details)
        return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
      }
    }

    // ── Orphan cleanup ─────────────────────────────────────────────────────────
    // For each item in the batch, delete any unsent rows whose reminder_key was NOT
    // just upserted. This covers:
    //   - Offset labels removed (e.g., item type changed)
    //   - All reminders now in the past (rows left over from a prior sync)
    for (const item of items) {
      const { id, type } = item as { id: string; type: string }
      const itemKeys = rows
        .filter(r => r.item_id === id && r.item_type === type)
        .map(r => r.reminder_key as string)

      let q = supabase
        .from('push_reminders')
        .delete()
        .eq('couple_id', access.stateId)
        .eq('user_name', userName)
        .eq('item_id', id)
        .eq('item_type', type)
        .is('sent_at', null)
        .is('failed_permanently_at', null)

      if (itemKeys.length > 0) {
        // Keep rows that are in the current key set; delete the rest
        q = q.not('reminder_key', 'in', `(${itemKeys.join(',')})`)
      }
      // If itemKeys is empty, delete ALL unsent rows for this item (all reminders past)

      const { error: delErr } = await q
      if (delErr) {
        console.warn(`[sync-reminders] Orphan cleanup error (${id}):`, delErr.message)
      }
    }

    return NextResponse.json({ ok: true, upserted: rows.length })
  } catch (err) {
    if (err instanceof AccessError) throw err
    console.error('[sync-reminders] Unexpected error:', err)
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  }
})
