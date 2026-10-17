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
