import { NextResponse } from 'next/server'
import { withCoupleAuth } from '@/lib/supabase-server'
import { getAdminClient, supabaseUnavailable } from '@/app/api/push/_admin'

export const GET = withCoupleAuth(async (_request, access) => {
  const client = getAdminClient()
  if (!client) return supabaseUnavailable()
  const { data, error } = await client.from('activity_notification_prefs').select('prefs')
    .eq('couple_id', access.coupleId).eq('user_id', access.userId).maybeSingle()
  if (error) return NextResponse.json({ error: 'Settings unavailable' }, { status: 503 })
  return NextResponse.json({ prefs: data?.prefs ?? null })
})

export const PUT = withCoupleAuth(async (request, access) => {
  const input = await request.json()
  const prefs = input?.prefs
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs) ||
    JSON.stringify(input).length > 8000 ||
    typeof prefs.globalEnabled !== 'boolean' ||
    typeof prefs.sensitivePreview !== 'boolean' ||
    !prefs.quietHours || typeof prefs.quietHours.enabled !== 'boolean' ||
    !Number.isInteger(prefs.quietHours.startHour) || prefs.quietHours.startHour < 0 || prefs.quietHours.startHour > 23 ||
    !Number.isInteger(prefs.quietHours.endHour) || prefs.quietHours.endHour < 0 || prefs.quietHours.endHour > 23 ||
    !prefs.categories || typeof prefs.categories !== 'object' ||
    Object.values(prefs.categories).some((entry) => {
      const cat = entry as { feedEnabled?: unknown; pushEnabled?: unknown } | null
      return !cat || typeof cat.feedEnabled !== 'boolean' || typeof cat.pushEnabled !== 'boolean'
    }))
    return NextResponse.json({ error: 'Invalid preferences' }, { status: 400 })
  const zone = typeof input.timeZone === 'string' && /^[A-Za-z_+/-]{1,64}$/.test(input.timeZone) ? input.timeZone : 'UTC'
  const client = getAdminClient()
  if (!client) return supabaseUnavailable()
  const { error } = await client.from('activity_notification_prefs').upsert({
    couple_id: access.coupleId,
    user_id: access.userId,
    prefs: { ...prefs, timeZone: zone },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'couple_id,user_id' })
  return error ? NextResponse.json({ error: 'Cannot save preferences' }, { status: 503 }) : NextResponse.json({ ok: true })
})
