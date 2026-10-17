import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserName } from '@/types'

export interface CoupleAccess {
  userId: string
  userName: UserName
  coupleId: string
  stateId: string
}

export class AccessError extends Error {
  constructor(public status: 400 | 401 | 403 | 503, message: string) { super(message) }
}

/** Use only after verifying the Auth user. Queries use the caller's JWT and RLS. */
export async function resolveCoupleAccess(client: SupabaseClient, userId: string): Promise<CoupleAccess> {
  const [profile, membership] = await Promise.all([
    client.from('profiles').select('app_user_name').eq('id', userId).maybeSingle(),
    client.from('couple_members').select('couple_id').eq('user_id', userId).maybeSingle(),
  ])
  if (profile.error || membership.error) throw new AccessError(503, 'Account access could not be verified. Please try again.')
  const name = profile.data?.app_user_name
  if ((name !== 'seval' && name !== 'mateo') || !membership.data?.couple_id) {
    throw new AccessError(403, 'This account is not linked to SeMa.')
  }
  const state = await client.from('couple_state').select('id').eq('couple_id', membership.data.couple_id).maybeSingle()
  if (state.error) throw new AccessError(503, 'Shared access is not configured yet.')
  // This phase supports only the existing shared household; never fall back to an unbound row.
  if (state.data?.id !== 'sema') throw new AccessError(403, 'This account cannot access this shared space.')
  return { userId, userName: name, coupleId: membership.data.couple_id, stateId: state.data.id }
}
