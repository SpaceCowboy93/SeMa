import type { CoupleAccess } from './couple-access'

const SUPABASE_V2_PROJECT = 'wwxdinkdjkjiqzynfbdk'
// Clean-start reset on 17 October 2026. Never migrate earlier generations.
export const SUPABASE_V2_CACHE_GENERATION = 2

/** The old cache format has no backend provenance. Matching household/state
 * IDs (including the v1 ownership marker) cannot authorize importing it to V2.
 * Keep the original deployment's cache untouched and usable by older builds. */
export function usesSupabaseV2Cache(): boolean {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname === `${SUPABASE_V2_PROJECT}.supabase.co`
  } catch { return false }
}

export function sharedCacheRoot(access: CoupleAccess): string {
  const namespace = usesSupabaseV2Cache()
    ? `semacalendar-v2:project:${SUPABASE_V2_PROJECT}:generation:${SUPABASE_V2_CACHE_GENERATION}`
    : 'semacalendar-v2'
  return `${namespace}:${access.coupleId}:${access.stateId}`
}

/** Activity feeds, preferences and pending notification uploads share the reset. */
export function appContentCacheKey(key: string): string {
  return usesSupabaseV2Cache()
    ? `semacalendar-v2:project:${SUPABASE_V2_PROJECT}:generation:${SUPABASE_V2_CACHE_GENERATION}:${key}`
    : key
}
