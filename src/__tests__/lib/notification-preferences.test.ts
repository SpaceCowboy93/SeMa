import { describe, it, expect } from 'vitest'
import {
  isQuietHour,
  shouldFeedEntry,
  shouldSendPush,
  mergePreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  type QuietHours,
} from '@/lib/notification-preferences'

// ── isQuietHour ───────────────────────────────────────────────────────────────

describe('isQuietHour', () => {
  const nightQH: QuietHours = { enabled: true, startHour: 22, endHour: 7 }   // crosses midnight
  const dayQH:   QuietHours = { enabled: true, startHour: 13, endHour: 16 }  // afternoon block
  const offQH:   QuietHours = { enabled: false, startHour: 22, endHour: 7 }

  it('returns false when quiet hours are disabled', () => {
    expect(isQuietHour(23, offQH)).toBe(false)
    expect(isQuietHour(2, offQH)).toBe(false)
  })

  it('returns true for hours within a midnight-crossing window', () => {
    expect(isQuietHour(22, nightQH)).toBe(true) // start hour
    expect(isQuietHour(0,  nightQH)).toBe(true) // midnight
    expect(isQuietHour(3,  nightQH)).toBe(true) // 3 AM
    expect(isQuietHour(6,  nightQH)).toBe(true) // 6 AM
  })

  it('returns false for hours outside a midnight-crossing window', () => {
    expect(isQuietHour(7,  nightQH)).toBe(false) // end (exclusive)
    expect(isQuietHour(12, nightQH)).toBe(false)
    expect(isQuietHour(21, nightQH)).toBe(false)
  })

  it('returns true for hours within a same-day window', () => {
    expect(isQuietHour(13, dayQH)).toBe(true)
    expect(isQuietHour(15, dayQH)).toBe(true)
  })

  it('returns false for hours outside a same-day window', () => {
    expect(isQuietHour(12, dayQH)).toBe(false)
    expect(isQuietHour(16, dayQH)).toBe(false) // end (exclusive)
    expect(isQuietHour(17, dayQH)).toBe(false)
  })
})

// ── shouldFeedEntry ───────────────────────────────────────────────────────────

describe('shouldFeedEntry', () => {
  it('returns true for a category that has feedEnabled by default', () => {
    expect(shouldFeedEntry(DEFAULT_NOTIFICATION_PREFERENCES, 'todo')).toBe(true)
    expect(shouldFeedEntry(DEFAULT_NOTIFICATION_PREFERENCES, 'loveNote')).toBe(true)
    expect(shouldFeedEntry(DEFAULT_NOTIFICATION_PREFERENCES, 'finance')).toBe(true)
  })

  it('returns false when globalEnabled is off', () => {
    const prefs: NotificationPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES, globalEnabled: false }
    expect(shouldFeedEntry(prefs, 'todo')).toBe(false)
  })

  it('returns false when the category feedEnabled is off', () => {
    const prefs: NotificationPreferences = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      categories: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.categories,
        todo: { feedEnabled: false, pushEnabled: false },
      },
    }
    expect(shouldFeedEntry(prefs, 'todo')).toBe(false)
  })
})

// ── shouldSendPush ────────────────────────────────────────────────────────────

describe('shouldSendPush', () => {
  it('returns true for immediate importance outside quiet hours when push is enabled', () => {
    expect(shouldSendPush(DEFAULT_NOTIFICATION_PREFERENCES, 'loveNote', 'immediate', 14)).toBe(true)
  })

  it('returns false for feed_only importance', () => {
    expect(shouldSendPush(DEFAULT_NOTIFICATION_PREFERENCES, 'event', 'feed_only', 14)).toBe(false)
  })

  it('returns false when globalEnabled is off', () => {
    const prefs: NotificationPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES, globalEnabled: false }
    expect(shouldSendPush(prefs, 'loveNote', 'immediate', 14)).toBe(false)
  })

  it('returns false when category pushEnabled is off', () => {
    const prefs: NotificationPreferences = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      categories: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.categories,
        loveNote: { feedEnabled: true, pushEnabled: false },
      },
    }
    expect(shouldSendPush(prefs, 'loveNote', 'immediate', 14)).toBe(false)
  })

  it('returns false during quiet hours', () => {
    const prefs: NotificationPreferences = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      quietHours: { enabled: true, startHour: 22, endHour: 7 },
    }
    expect(shouldSendPush(prefs, 'loveNote', 'immediate', 23)).toBe(false)
  })

  it('returns true outside quiet hours', () => {
    const prefs: NotificationPreferences = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      quietHours: { enabled: true, startHour: 22, endHour: 7 },
    }
    expect(shouldSendPush(prefs, 'loveNote', 'immediate', 10)).toBe(true)
  })

  it('enables push for all shared-change categories by default', () => {
    // The receiving partner can switch either category off in preferences.
    expect(DEFAULT_NOTIFICATION_PREFERENCES.categories.finance.pushEnabled).toBe(true)
    expect(DEFAULT_NOTIFICATION_PREFERENCES.categories.todo.pushEnabled).toBe(true)
  })

  it('defaults to push enabled for high-value categories (loveNote, wish)', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.categories.loveNote.pushEnabled).toBe(true)
    expect(DEFAULT_NOTIFICATION_PREFERENCES.categories.wish.pushEnabled).toBe(true)
  })
})

// ── mergePreferences ──────────────────────────────────────────────────────────

describe('mergePreferences', () => {
  it('merges top-level scalar fields', () => {
    const result = mergePreferences(DEFAULT_NOTIFICATION_PREFERENCES, { globalEnabled: false })
    expect(result.globalEnabled).toBe(false)
    expect(result.sensitivePreview).toBe(DEFAULT_NOTIFICATION_PREFERENCES.sensitivePreview)
  })

  it('deep-merges quietHours', () => {
    const result = mergePreferences(DEFAULT_NOTIFICATION_PREFERENCES, {
      quietHours: { enabled: true, startHour: 21, endHour: 7 },
    })
    expect(result.quietHours.enabled).toBe(true)
    expect(result.quietHours.startHour).toBe(21)
    expect(result.quietHours.endHour).toBe(7)
  })

  it('deep-merges category preferences', () => {
    const result = mergePreferences(DEFAULT_NOTIFICATION_PREFERENCES, {
      categories: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.categories,
        todo: { feedEnabled: false, pushEnabled: false },
      },
    })
    expect(result.categories.todo.feedEnabled).toBe(false)
    // Other categories untouched
    expect(result.categories.loveNote.feedEnabled).toBe(true)
  })

  it('preserves base when no updates supplied for nested objects', () => {
    const result = mergePreferences(DEFAULT_NOTIFICATION_PREFERENCES, { sensitivePreview: true })
    expect(result.quietHours).toEqual(DEFAULT_NOTIFICATION_PREFERENCES.quietHours)
    expect(result.categories).toEqual(DEFAULT_NOTIFICATION_PREFERENCES.categories)
  })

  it('does not mutate the base object', () => {
    const base = { ...DEFAULT_NOTIFICATION_PREFERENCES }
    mergePreferences(base, { globalEnabled: false })
    expect(base.globalEnabled).toBe(true) // unchanged
  })
})

// ── DEFAULT_NOTIFICATION_PREFERENCES ─────────────────────────────────────────

describe('DEFAULT_NOTIFICATION_PREFERENCES', () => {
  it('has globalEnabled: true by default', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.globalEnabled).toBe(true)
  })

  it('has sensitivePreview: false by default', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.sensitivePreview).toBe(false)
  })

  it('has quietHours disabled by default', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.quietHours.enabled).toBe(false)
  })

  it('has feed enabled for all 12 categories', () => {
    const categories = Object.values(DEFAULT_NOTIFICATION_PREFERENCES.categories)
    expect(categories.every(c => c.feedEnabled)).toBe(true)
  })

  it('has push enabled for all categories unless switched off', () => {
    const feedOnlyCats = ['todo', 'goal', 'focus', 'finance', 'countdown'] as const
    for (const cat of feedOnlyCats) {
      expect(DEFAULT_NOTIFICATION_PREFERENCES.categories[cat].pushEnabled).toBe(true)
    }
  })
})
