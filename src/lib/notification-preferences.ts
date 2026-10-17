/**
 * Notification preferences — per-user settings for activity notifications.
 *
 * These preferences control:
 *  - Which entity categories generate Activity feed entries
 *  - Which categories also generate phone push interruptions
 *  - Quiet hours (suppress push; feed entry still created)
 *  - Sensitive preview opt-in (shows actual content in push body)
 *
 * Defaults are conservative:
 *  - Feed enabled for all categories
 *  - Push enabled for immediate-importance categories only after permission
 *  - Sensitive previews OFF
 *  - Quiet hours optional, disabled by default
 *
 * User-scoped: Mateo's and Seval's preferences are stored under separate keys
 * via src/lib/user-cache.ts.  They never leak between users.
 */

import type { ActivityEntityType, ActivityImportance } from './activity-event'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CategoryPreference {
  feedEnabled: boolean
  pushEnabled: boolean
}

export type CategoryPreferences = Record<ActivityEntityType, CategoryPreference>

export interface QuietHours {
  enabled:   boolean
  startHour: number   // 0-23 (local time)
  endHour:   number   // 0-23 (local time)
}

export interface NotificationPreferences {
  /** Master switch — when off, no feed entries or push notifications are created. */
  globalEnabled:    boolean
  /** Show sensitive content (Partner Note body, Finance amounts) in push body. */
  sensitivePreview: boolean
  quietHours:       QuietHours
  categories:       CategoryPreferences
}

// ── Defaults ──────────────────────────────────────────────────────────────────

function buildDefaultCategories(): CategoryPreferences {
  const all: ActivityEntityType[] = [
    'event', 'todo', 'goal', 'wish', 'shopping', 'mood',
    'memory', 'loveNote', 'partnerNote', 'countdown', 'finance', 'focus',
  ]
  const prefs = {} as CategoryPreferences
  for (const cat of all) {
    prefs[cat] = {
      feedEnabled: true,
      // Push enabled for high-value categories by default; feed-only categories
      // require the user to opt in to phone interruptions.
      pushEnabled: true,
    }
  }
  return prefs
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  globalEnabled:    true,
  sensitivePreview: false,
  quietHours: {
    enabled:   false,
    startHour: 22,
    endHour:   7,
  },
  categories: buildDefaultCategories(),
}

// ── Pure helper functions ─────────────────────────────────────────────────────

/** Returns true if the given hour (0-23 local) falls within quiet hours. */
export function isQuietHour(hour: number, qh: QuietHours): boolean {
  if (!qh.enabled) return false
  const s = qh.startHour
  const e = qh.endHour
  if (s <= e) {
    // Contiguous window (e.g. 22:00–07:00 crosses midnight: s > e handles that)
    // BUT if start <= end, window is within one day (e.g. 13:00–17:00 afternoon DND)
    return hour >= s && hour < e
  }
  // Crosses midnight (e.g. 22:00–07:00)
  return hour >= s || hour < e
}

/** Whether the notification should appear in the Activity feed. */
export function shouldFeedEntry(
  prefs: NotificationPreferences,
  entityType: ActivityEntityType,
): boolean {
  if (!prefs.globalEnabled) return false
  return prefs.categories[entityType]?.feedEnabled ?? true
}

/** Whether a push notification should be delivered for this event. */
export function shouldSendPush(
  prefs:      NotificationPreferences,
  entityType: ActivityEntityType,
  importance: ActivityImportance,
  nowHour:    number = new Date().getHours(),
): boolean {
  if (!prefs.globalEnabled) return false
  if (importance === 'feed_only') return false
  if (!prefs.categories[entityType]?.pushEnabled) return false
  if (isQuietHour(nowHour, prefs.quietHours)) return false
  return true
}

/** Merge saved preferences safely — unknown keys are ignored. */
export function mergePreferences(
  base:    NotificationPreferences,
  updates: Partial<NotificationPreferences>,
): NotificationPreferences {
  return {
    ...base,
    ...updates,
    quietHours: updates.quietHours
      ? { ...base.quietHours, ...updates.quietHours }
      : base.quietHours,
    categories: updates.categories
      ? { ...base.categories, ...updates.categories }
      : base.categories,
  }
}
