import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AccessError, type CoupleAccess } from '@/lib/couple-access'
import type { UserName } from '@/types'

export function validateEndpoint(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096) throw new AccessError(400, 'Invalid push endpoint')
  let url: URL
  try { url = new URL(value) } catch { throw new AccessError(400, 'Invalid push endpoint') }
  const host = url.hostname
  const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' ||
    host.endsWith('.push.services.mozilla.com') || host === 'web.push.apple.com' ||
    host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com')
  if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) {
    throw new AccessError(400, 'Unsupported push endpoint')
  }
  return value
}
export function assertOwnUser(value: unknown, access: CoupleAccess) {
  if (value !== undefined && value !== null && value !== access.userName) throw new AccessError(403, 'Forbidden')
}
export async function requireRecipient(client: SupabaseClient, access: CoupleAccess, name: unknown): Promise<UserName> {
  if (name !== 'mateo' && name !== 'seval') throw new AccessError(400, 'Invalid recipient')
  const { data, error } = await client.from('couple_members')
    .select('profiles!inner(app_user_name)').eq('couple_id', access.coupleId)
    .eq('profiles.app_user_name', name).maybeSingle()
  if (error) throw new AccessError(503, 'Could not verify recipient')
  if (!data) throw new AccessError(403, 'Forbidden')
  return name
}
