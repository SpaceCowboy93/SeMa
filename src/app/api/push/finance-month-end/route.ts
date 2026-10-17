import { requireRecipient } from '../_access'
import { withCoupleAuth } from '@/lib/supabase-server'
import { AccessError } from '@/lib/couple-access'
import { NextResponse } from 'next/server'
import { getAdminClient, supabaseUnavailable } from '../_admin'

// The wrapper verifies the caller; both recipients must belong to their couple.

// POST — schedule a month-end finance push notification for both users
// Body: { monthKey: 'YYYY-MM', fireAt: ISO string }
// Uses reminder_key upsert so repeated calls are idempotent.
export const POST = withCoupleAuth(async (req, access) => {
  try {
    const { monthKey, fireAt } = await req.json()

    if (typeof monthKey !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey) || typeof fireAt !== 'string' || !Number.isFinite(Date.parse(fireAt))) {
      return NextResponse.json({ error: 'Missing monthKey or fireAt' }, { status: 400 })
    }

    const now = new Date().toISOString()
    if (fireAt <= now) {
      return NextResponse.json({ ok: true, upserted: 0, reason: 'fire_at is in the past' })
    }

    const [year, month] = monthKey.split('-').map(Number)
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    const supabase = getAdminClient()
    if (!supabase) return supabaseUnavailable()

    await Promise.all(['seval', 'mateo'].map(name => requireRecipient(supabase, access, name)))
    const rows = ['seval', 'mateo'].map(user => ({
      couple_id:            access.stateId,
      user_name:            user,
      item_id:              monthKey,
      item_type:            'finance-month-end',
      // reminder_key format: {user}:finance-month-end:{monthKey}:fire
      reminder_key:         `${user}:finance-month-end:${monthKey}:fire`,
      fire_at:              fireAt,
      title:                'SeMa 💕',
      message:              `Your ${monthName} finance report is ready! Time to review. 📊`,
      retry_count:          0,
      last_error:           null,
      failed_permanently_at: null,
    }))

    const { error } = await supabase
      .from('push_reminders')
      .upsert(rows, { onConflict: 'reminder_key' })

    if (error) {
      console.error('[finance-month-end] Upsert error:', error.message)
      return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, upserted: rows.length, monthKey, fireAt })
  } catch (err) {
    if (err instanceof AccessError) throw err
    console.error('[finance-month-end] Unexpected error:', err)
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  }
})
