import { supabase } from '@/lib/supabase'
import { AccessError, resolveCoupleAccess } from './couple-access'

export async function getVerifiedAccess() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new AccessError(401, 'Please sign in to SeMa.')
  return resolveCoupleAccess(supabase, data.user.id)
}
