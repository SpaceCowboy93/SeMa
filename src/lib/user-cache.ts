/**
 * User-scoped localStorage cache for activity feed and notification preferences.
 *
 * These are intentionally separate from the couple-scoped 'semacalendar-v2:*'
 * keys used by the main Zustand store.  Each user's data is stored under a
 * distinct key so Mateo's Activity Centre and preferences never bleed into
 * Seval's, and vice versa.
 *
 * Keys:
 *   semacalendar-activity-feed-v2:{userId}   — ActivityEntry[]
 *   semacalendar-notif-prefs-v2:{userId}      — NotificationPreferences
 */

import type { ActivityEntry } from './activity-event'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  mergePreferences,
  type NotificationPreferences,
} from './notification-preferences'
import type { UserName } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum number of Activity feed entries retained per user. */
const MAX_FEED_ENTRIES = 50

// ── Key helpers ───────────────────────────────────────────────────────────────

function feedKey(userId: UserName)  { return `semacalendar-activity-feed-v2:${userId}` }
function prefsKey(userId: UserName) { return `semacalendar-notif-prefs-v2:${userId}` }

// ── Activity feed ─────────────────────────────────────────────────────────────

export function loadActivityFeed(userId: UserName): ActivityEntry[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(feedKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Basic structural validation — discard malformed entries silently
    return parsed.filter(
      (e: unknown) =>
        e !== null &&
        typeof e === 'object' &&
        typeof (e as Record<string, unknown>).id === 'string' &&
        typeof (e as Record<string, unknown>).createdAt === 'string',
    ) as ActivityEntry[]
  } catch {
    return []
  }
}

export function saveActivityFeed(userId: UserName, entries: ActivityEntry[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    const trimmed = entries.slice(-MAX_FEED_ENTRIES)
    localStorage.setItem(feedKey(userId), JSON.stringify(trimmed))
  } catch {
    // quota or private mode
  }
}

export function clearActivityFeed(userId: UserName): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(feedKey(userId))
}

// ── Notification preferences ──────────────────────────────────────────────────

export function loadNotifPrefs(userId: UserName): NotificationPreferences {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_NOTIFICATION_PREFERENCES }
  try {
    const raw = localStorage.getItem(prefsKey(userId))
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFERENCES }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_NOTIFICATION_PREFERENCES }
    return mergePreferences(DEFAULT_NOTIFICATION_PREFERENCES, parsed as Partial<NotificationPreferences>)
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES }
  }
}

export function saveNotifPrefs(userId: UserName, prefs: NotificationPreferences): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(prefsKey(userId), JSON.stringify(prefs))
  } catch {
    // quota or private mode
  }
}
