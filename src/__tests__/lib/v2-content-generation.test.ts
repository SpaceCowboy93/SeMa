import { afterEach, expect, it, vi } from 'vitest'
import { loadActivityFeed, loadNotifPrefs, saveActivityFeed } from '@/lib/user-cache'
import { loadOutbox, saveOutbox } from '@/lib/activity-outbox'
import { appContentCacheKey, sharedCacheRoot } from '@/lib/shared-cache-scope'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/notification-preferences'
afterEach(() => { vi.unstubAllEnvs(); localStorage.clear() })
it('ignores old feed, preferences and pending uploads while leaving authentication bytes untouched', () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://wwxdinkdjkjiqzynfbdk.supabase.co')
  localStorage.setItem('semacalendar-activity-feed-v1:mateo', JSON.stringify([{ id: 'old', createdAt: '2026-10-17' }]))
  localStorage.setItem('semacalendar-notif-prefs-v1:mateo', JSON.stringify({ enabled: false }))
  localStorage.setItem('semacalendar-activity-outbox-v1:mateo', JSON.stringify([{ event: { id: 'old' }, attempts: 0, enqueuedAt: '2026-10-17', groupCount: 1, status: 'pending' }]))
  localStorage.setItem('sb-wwxdinkdjkjiqzynfbdk-auth-token', 'synthetic-auth-session')
  const originals = { ...localStorage }
  expect(loadActivityFeed('mateo')).toEqual([]); expect(loadOutbox('mateo')).toEqual([])
  expect(loadNotifPrefs('mateo')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
  saveActivityFeed('mateo', []); saveOutbox('mateo', [])
  for (const [key, value] of Object.entries(originals)) expect(localStorage.getItem(key)).toBe(value)
  expect(appContentCacheKey('key')).toContain(':generation:2:')
  expect(sharedCacheRoot({ coupleId: 'c', stateId: 'sema', userId: 'u', userName: 'mateo' })).toBe('semacalendar-v2:project:wwxdinkdjkjiqzynfbdk:generation:2:c:sema')
})
