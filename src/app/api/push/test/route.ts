import { assertOwnUser, validateEndpoint } from '../_access'
import { withCoupleAuth } from '@/lib/supabase-server'
import { AccessError } from '@/lib/couple-access'
import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { getAdminClient, supabaseUnavailable } from '../_admin'

// PHASE 2 SECURITY TODO: Require the authenticated owner of the subscription
// before sending a test notification.

// Only configure when env vars are present — prevents build-time throw in CI
if (process.env.VAPID_SUBJECT && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
}

// POST — send a test push to the calling device
// Body: { endpoint, userName }
// Auth: device ownership — endpoint must exist in push_subscriptions for the claimed userName.
// Requires a verified session and the subscription owner in this couple.
export const POST = withCoupleAuth(async (req, access) => {
  try {
    const { endpoint, userName: rawUserName } = await req.json()
    assertOwnUser(rawUserName, access)
    validateEndpoint(endpoint)
    const userName = access.userName

    if (!endpoint || !userName) {
      return NextResponse.json({ error: 'Missing endpoint or userName' }, { status: 400 })
    }

    const supabase = getAdminClient()
    if (!supabase) return supabaseUnavailable()

    // Device ownership check: endpoint must belong to the claimed userName
    const { data: sub, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('endpoint', endpoint).eq('couple_id', access.stateId).eq('user_name', access.userName)
      .eq('user_name', userName)
      .single()

    if (subErr || !sub) {
      return NextResponse.json(
        { error: 'Subscription not found for this user — try reconnecting notifications' },
        { status: 403 },
      )
    }

    const payload = JSON.stringify({
      title: 'SeMa 💕',
      body:  'Push notifications are working!',
      url:   '/together',
      tag:   'sema-test',
    })

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        // Stale — clean up so the user gets prompted to reconnect
        await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('couple_id', access.stateId).eq('user_name', access.userName)
        return NextResponse.json(
          { error: 'Subscription is stale — please re-enable notifications' },
          { status: 410 },
        )
      }
      console.error('[push/test] webpush error:', (err as { message?: string }).message ?? String(err))
      return NextResponse.json({ error: 'Push delivery failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, sent: 1 })
  } catch (err) {
    if (err instanceof AccessError) throw err
    console.error('[push/test] Unexpected error:', err)
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  }
})
