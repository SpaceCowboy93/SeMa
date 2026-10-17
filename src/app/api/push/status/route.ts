import { NextResponse } from 'next/server'
import { withCoupleAuth } from '@/lib/supabase-server'
import { AccessError } from '@/lib/couple-access'
import { getAdminClient, supabaseUnavailable } from '../_admin'
import { assertOwnUser, validateEndpoint } from '../_access'

export const GET = withCoupleAuth(async (req, access) => {
  assertOwnUser(req.nextUrl.searchParams.get('userName'), access)
  const client = getAdminClient()
  if (!client) return supabaseUnavailable()
  let query = client.from('push_subscriptions').select('id', { count: 'exact', head: true })
    .eq('couple_id', access.stateId).eq('user_name', access.userName)
  const endpoint = req.nextUrl.searchParams.get('endpoint')
  if (endpoint) query = query.eq('endpoint', validateEndpoint(endpoint))
  const { count, error } = await query
  if (error) throw new AccessError(503, 'Could not check subscription')
  return NextResponse.json({ ok: true, hasSubscription: (count ?? 0) > 0 })
})
