import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { withCoupleAuth } from '@/lib/supabase-server'
import { getAdminClient, supabaseUnavailable } from '@/app/api/push/_admin'
import { createActivityEvent, eventToEntry, resolveDeepLink, type ActivityEntityType, type ActivityActionType } from '@/lib/activity-event'
import { DEFAULT_NOTIFICATION_PREFERENCES, mergePreferences, shouldSendPush, type NotificationPreferences } from '@/lib/notification-preferences'
import { AccessError, type CoupleAccess } from '@/lib/couple-access'
import { OTHER_USER } from '@/types'

export const dynamic = 'force-dynamic'
const ENTITY_TYPES = new Set(['event','todo','goal','wish','shopping','mood','memory','loveNote','partnerNote','countdown','finance','focus'])
const ACTION_TYPES = new Set(['created','completed','achieved','deleted','shared','sent','added','updated'])

function safeHour(zone: unknown): number {
  try {
    if (typeof zone !== 'string' || !/^[A-Za-z_+/-]{1,64}$/.test(zone)) return new Date().getUTCHours()
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  } catch { return new Date().getUTCHours() }
}

function configurePush(): boolean {
  const { VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env
  if (!VAPID_SUBJECT || !NEXT_PUBLIC_VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false
  webpush.setVapidDetails(VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  return true
}

async function delivery(client: NonNullable<ReturnType<typeof getAdminClient>>,
  access: CoupleAccess, recipient: string, event: NonNullable<ReturnType<typeof createActivityEvent>>, id: string,
  groupCount: number): Promise<number> {
  const { data: preference, error: prefsError } = await client.from('activity_notification_prefs')
    .select('prefs').eq('couple_id', access.coupleId).eq('user_id', recipient).maybeSingle()
  if (prefsError) return 0
  const source = preference?.prefs
  const prefs = mergePreferences(DEFAULT_NOTIFICATION_PREFERENCES,
    source && typeof source === 'object' ? source as Partial<NotificationPreferences> : {})
  const zone = source && typeof source === 'object' ? (source as Record<string, unknown>).timeZone : undefined
  if (!shouldSendPush(prefs, event.entityType, event.importance, safeHour(zone))) return 0
  if (!configurePush()) return 0

  const { data: subs, error } = await client.from('push_subscriptions')
    .select('endpoint,p256dh,auth').eq('couple_id',access.stateId).eq('user_name',event.recipient)
  if (error || !subs?.length) return 0
  const message = event.importance === 'grouped' && groupCount > 1
    ? `${event.actor === 'mateo' ? 'Mateo' : 'Seval'} added ${groupCount} ${event.entityType} items`
    : event.safeBody
  const payload = JSON.stringify({title:'SeMa 💕',body:message,url:resolveDeepLink(event.deepLink),tag:`sema-activity-${id}`})
  let count = 0
  const stale: string[] = []
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({endpoint:s.endpoint, keys:{p256dh:s.p256dh,auth:s.auth}},payload)
      count++
    } catch (err: unknown) {
      const status = (err as {statusCode?:number}).statusCode
      if (status === 404 || status === 410) stale.push(s.endpoint)
    }
  }))
  if (stale.length) await client.from('push_subscriptions').delete().eq('couple_id',access.stateId).in('endpoint',stale)
  return count
}

export const GET = withCoupleAuth(async (_req, access) => {
  const client = getAdminClient()
  if (!client) return supabaseUnavailable()
  const {data,error} = await client.from('activity_events')
    .select('id,entity_type,action_type,actor_id,safe_body,deep_link,importance,created_at,is_read,group_count')
    .eq('couple_id',access.coupleId).eq('recipient_id',access.userId)
    .order('created_at',{ascending:false}).limit(50)
  if (error) return NextResponse.json({error:'Activity feed unavailable'}, {status:503})
  const {data:member,error:memberError} = await client.from('couple_members')
    .select('user_id').eq('couple_id',access.coupleId).neq('user_id',access.userId).maybeSingle()
  if (memberError) return NextResponse.json({error:'Couple membership unavailable'}, {status:503})
  const actor = OTHER_USER[access.userName]
  const entries = (data ?? []).filter(r => r.actor_id === member?.user_id).map(r => ({
    id:r.id, entityType:r.entity_type, actionType:r.action_type, actorName:actor,
    actorEmoji: actor === 'mateo' ? '🌊' : '🌸',
    safeBody:r.safe_body, deepLink:resolveDeepLink(r.deep_link),
    importance:r.importance, createdAt:r.created_at, isRead:r.is_read, groupCount:r.group_count
  }))
  return NextResponse.json({entries})
})

export const POST = withCoupleAuth(async (req:NextRequest, access) => {
  const raw = await req.json()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AccessError(400,'Invalid activity')
  const body = raw as Record<string, unknown>
  if (body.actor !== access.userName || body.recipient !== OTHER_USER[access.userName] ||
      typeof body.entityType !== 'string' || !ENTITY_TYPES.has(body.entityType) ||
      typeof body.actionType !== 'string' || !ACTION_TYPES.has(body.actionType) ||
      typeof body.entityId !== 'string' || body.entityId.length < 1 || body.entityId.length > 120 ||
      typeof body.entityTitle !== 'string' || body.entityTitle.length > 160 ||
      typeof body.createdAt !== 'string' || !Number.isFinite(Date.parse(body.createdAt)) ||
      typeof body.id !== 'string' || body.id.length > 256) throw new AccessError(400,'Invalid activity')
  const when = Date.parse(body.createdAt)
  if (when < Date.now() - 24*60*60*1000 || when > Date.now() + 60*1000)
    throw new AccessError(400,'Expired activity')
  const event = createActivityEvent({actor:access.userName,
    entityType:body.entityType as ActivityEntityType,
    actionType:body.actionType as ActivityActionType,
    entityId:body.entityId,entityTitle:body.entityTitle,nowMs:when})
  if (!event || event.id !== body.id) throw new AccessError(400,'Invalid activity identifier')
  const count = typeof body.groupCount === 'number' && Number.isSafeInteger(body.groupCount) &&
    body.groupCount >= 1 && body.groupCount <= 100 ? body.groupCount : 1
  const client = getAdminClient()
  if (!client) return supabaseUnavailable()
  const {data:member,error:memberError} = await client.from('couple_members').select('user_id')
    .eq('couple_id',access.coupleId).neq('user_id',access.userId).maybeSingle()
  if (memberError || !member) return NextResponse.json({error:'Partner is not configured'}, {status:503})
  const row = {id:event.id,couple_id:access.coupleId,actor_id:access.userId,
    recipient_id:member.user_id,entity_type:event.entityType,action_type:event.actionType,
    entity_id:event.entityId,safe_body:event.safeBody,importance:event.importance,
    deep_link:event.deepLink,grouping_key:event.groupingKey,group_count:count,created_at:event.createdAt}
  const inserted = await client.from('activity_events').insert(row).select('id,pushed_at').single()
  if (inserted.error && inserted.error.code !== '23505')
    return NextResponse.json({error:'Could not save activity'}, {status:503})
  // Retries are idempotent; reattempt undelivered pushes only for the exact same actor event.
  if (inserted.error?.code === '23505') {
    const existing = await client.from('activity_events').select('id,pushed_at').eq('id',event.id)
      .eq('actor_id',access.userId).eq('couple_id',access.coupleId).maybeSingle()
    if (existing.error || !existing.data) return NextResponse.json({error:'Activity ID is in use'}, {status:409})
    if (existing.data.pushed_at) return NextResponse.json({ok:true,duplicate:true})
  }
  const sent = await delivery(client,access,member.user_id,event,event.id,count)
  if (sent) await client.from('activity_events').update({pushed_at:new Date().toISOString()})
    .eq('id',event.id).eq('actor_id',access.userId).is('pushed_at',null)
  return NextResponse.json({ok:true,sent}, {status:inserted.error ? 200 : 201})
})

export const PATCH = withCoupleAuth(async (req,access) => {
  const {id,all} = await req.json()
  if (all !== true && (typeof id !== 'string' || id.length > 256)) throw new AccessError(400,'Invalid activity')
  const client = getAdminClient()
  if (!client) return supabaseUnavailable()
  let q=client.from('activity_events').update({is_read:true})
    .eq('couple_id',access.coupleId).eq('recipient_id',access.userId)
  if (all !== true) q=q.eq('id',id)
  const {error}=await q
  return error ? NextResponse.json({error:'Could not mark activity read'},{status:503}) : NextResponse.json({ok:true})
})

export const DELETE = withCoupleAuth(async (_req,access) => {
  const client=getAdminClient()
  if (!client) return supabaseUnavailable()
  const {error}=await client.from('activity_events').delete().eq('couple_id',access.coupleId)
    .eq('recipient_id',access.userId).eq('is_read',true)
  return error ? NextResponse.json({error:'Could not clear read activity'},{status:503}) : NextResponse.json({ok:true})
})
