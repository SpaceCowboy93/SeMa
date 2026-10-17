import { NextResponse } from 'next/server'
import { withCoupleAuth } from '@/lib/supabase-server'
import { AccessError } from '@/lib/couple-access'
import { getAdminClient, supabaseUnavailable } from '../_admin'
import { assertOwnUser, validateEndpoint } from '../_access'

export const POST = withCoupleAuth(async (req, access) => {
  const { subscription, userName } = await req.json()
  assertOwnUser(userName, access)
  const endpoint = validateEndpoint(subscription?.endpoint)
  const { p256dh, auth } = subscription?.keys ?? {}
  if (typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{80,100}={0,2}$/.test(p256dh) ||
      typeof auth !== 'string' || !/^[A-Za-z0-9_-]{20,30}={0,2}$/.test(auth)) throw new AccessError(400, 'Invalid subscription keys')
  const client = getAdminClient()
  if (!client) return supabaseUnavailable()
  const existing = await client.from('push_subscriptions').select('id,couple_id,user_name').eq('endpoint', endpoint).maybeSingle()
  if (existing.error) throw new AccessError(503, 'Could not verify subscription')
  if (existing.data && (existing.data.couple_id !== access.stateId || existing.data.user_name !== access.userName)) {
    throw new AccessError(403, 'This subscription belongs to another account. Reconnect after signing out.')
  }
  const row = { couple_id: access.stateId, user_name: access.userName, endpoint, p256dh, auth, updated_at: new Date().toISOString() }
  const result = existing.data
    ? await client.from('push_subscriptions').update(row).eq('id', existing.data.id).eq('couple_id', access.stateId).eq('user_name', access.userName)
    : await client.from('push_subscriptions').insert(row)
  if (result.error) throw new AccessError(503, 'Could not save subscription. Please reconnect.')
  return NextResponse.json({ ok: true })
})

export const DELETE = withCoupleAuth(async (req, access) => {
  const { endpoint: value, userName } = await req.json()
  assertOwnUser(userName, access)
  const endpoint = validateEndpoint(value)
  const client = getAdminClient()
  if (!client) return supabaseUnavailable()
  const { error } = await client.from('push_subscriptions').delete()
    .eq('endpoint', endpoint).eq('couple_id', access.stateId).eq('user_name', access.userName)
  if (error) throw new AccessError(503, 'Could not remove subscription')
  return NextResponse.json({ ok: true })
})
