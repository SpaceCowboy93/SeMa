/**
 * Activity notification outbox — user-scoped local queue.
 *
 * Responsibilities:
 *  - Accept new ActivityEvents from store mutations (original user actions only).
 *  - Deduplicate by idempotency key so rapid re-renders or retries are safe.
 *  - Group related events within a 5-minute window (e.g. multiple shopping items).
 *  - Expire entries older than MAX_AGE_MS or when queue exceeds MAX_SIZE.
 *  - Persist to a user-scoped localStorage key that is separate from couple_state.
 *  - Clear on logout to prevent sending the previous user's events.
 *
 * Delivery to the server is intentionally NOT implemented here:
 *  - The outbox accumulates entries locally.
 *  - A future useActivityOutboxFlush hook will flush pending entries to
 *    /api/activity once the migration is applied.
 *
 * Security:
 *  - The localStorage key is scoped to userId (not couple ID) so switching
 *    users does not expose one user's events to the other.
 *  - Malformed records are rejected by validateOutboxEntry().
 *  - The outbox never stores auth tokens, emails or passwords.
 */

import type { ActivityEvent } from './activity-event'
import type { UserName } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum time an entry survives in the outbox (24 hours). */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Maximum number of entries in the outbox at any time. */
const MAX_SIZE = 100

/** Maximum delivery attempts before an entry is abandoned. */
const MAX_RETRIES = 5

/** Grouping window — events with the same groupingKey within this period merge. */
const GROUP_WINDOW_MS = 5 * 60 * 1000

/** Retry backoff base in ms. Attempt n waits BASE * 2^n. */
const RETRY_BASE_MS = 10_000

// ── Types ─────────────────────────────────────────────────────────────────────

export type OutboxEntryStatus = 'pending' | 'sending' | 'failed' | 'abandoned'

export interface ActivityOutboxEntry {
  event:          ActivityEvent
  enqueuedAt:     string  // ISO-8601
  attempts:       number
  lastAttemptAt?: string
  lastError?:     string
  status:         OutboxEntryStatus
  /** Accumulated group count when multiple related events are merged. */
  groupCount:     number
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateOutboxEntry(entry: unknown): entry is ActivityOutboxEntry {
  if (!entry || typeof entry !== 'object') return false
  const e = entry as Record<string, unknown>
  return (
    typeof e.enqueuedAt === 'string' &&
    typeof e.attempts === 'number' &&
    typeof e.groupCount === 'number' &&
    typeof e.status === 'string' &&
    e.event !== null && typeof e.event === 'object'
  )
}

// ── Persistence ───────────────────────────────────────────────────────────────

function outboxKey(userId: UserName): string {
  return `semacalendar-activity-outbox-v1:${userId}`
}

export function loadOutbox(userId: UserName): ActivityOutboxEntry[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(outboxKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(validateOutboxEntry)
  } catch {
    return []
  }
}

export function saveOutbox(userId: UserName, entries: ActivityOutboxEntry[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(outboxKey(userId), JSON.stringify(entries))
  } catch {
    // quota or private mode — silently ignore
  }
}

/** Remove all outbox entries for userId. Called on logout. */
export function clearOutbox(userId: UserName): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(outboxKey(userId))
}

// ── Pure functions ────────────────────────────────────────────────────────────

/** Remove entries that are too old or permanently failed. */
export function expireOutboxEntries(
  entries: ActivityOutboxEntry[],
  nowMs = Date.now(),
): ActivityOutboxEntry[] {
  return entries.filter(e => {
    if (e.status === 'abandoned') return false
    const age = nowMs - new Date(e.enqueuedAt).getTime()
    return age < MAX_AGE_MS
  })
}

/** Trim the outbox to MAX_SIZE, keeping the most-recently-enqueued entries. */
export function trimOutbox(entries: ActivityOutboxEntry[]): ActivityOutboxEntry[] {
  if (entries.length <= MAX_SIZE) return entries
  // Sort newest first, keep first MAX_SIZE
  return [...entries]
    .sort((a, b) => b.enqueuedAt.localeCompare(a.enqueuedAt))
    .slice(0, MAX_SIZE)
}

/**
 * Add a new event to the outbox, or merge it with an existing group entry.
 * Returns the updated entries array (immutable).
 */
export function enqueueEvent(
  entries: ActivityOutboxEntry[],
  event:   ActivityEvent,
  nowMs =  Date.now(),
): ActivityOutboxEntry[] {
  const now = new Date(nowMs).toISOString()

  // Deduplication: if identical idempotency key already exists (any status), skip.
  const duplicate = entries.find(e => e.event.id === event.id)
  if (duplicate) return entries

  // Grouping: merge with an existing pending entry that has the same grouping key
  // and was enqueued within the group window.
  const groupIdx = entries.findIndex(e => {
    if (e.status !== 'pending' && e.status !== 'failed') return false
    if (e.event.importance !== 'grouped' || event.importance !== 'grouped') return false
    if (e.event.groupingKey !== event.groupingKey) return false
    const age = nowMs - new Date(e.enqueuedAt).getTime()
    return age < GROUP_WINDOW_MS
  })

  if (groupIdx !== -1) {
    const updated = [...entries]
    updated[groupIdx] = {
      ...updated[groupIdx],
      groupCount: updated[groupIdx].groupCount + 1,
      // Update the group leader's body to reflect the new count
      event: {
        ...updated[groupIdx].event,
        entityTitle: updated[groupIdx].event.entityTitle,  // keep leader's title
      },
    }
    return updated
  }

  // New entry
  const entry: ActivityOutboxEntry = {
    event,
    enqueuedAt:  now,
    attempts:    0,
    status:      'pending',
    groupCount:  1,
  }

  const updated = expireOutboxEntries([...entries, entry], nowMs)
  return trimOutbox(updated)
}

/**
 * Mark an entry as successfully sent.
 * Returns entries without the delivered entry.
 */
export function markDelivered(
  entries: ActivityOutboxEntry[],
  eventId: string,
): ActivityOutboxEntry[] {
  return entries.filter(e => e.event.id !== eventId)
}

/** Compute the next retry time for an entry given its attempt count. */
export function nextRetryMs(attempts: number, nowMs = Date.now()): number {
  const backoff = RETRY_BASE_MS * Math.pow(2, attempts)
  return nowMs + Math.min(backoff, 60 * 60 * 1000) // cap at 1 hour
}

/**
 * Record a failed delivery attempt. Abandons the entry after MAX_RETRIES.
 */
export function recordFailure(
  entries:  ActivityOutboxEntry[],
  eventId:  string,
  error:    string,
  nowMs = Date.now(),
): ActivityOutboxEntry[] {
  return entries.map(e => {
    if (e.event.id !== eventId) return e
    const attempts = e.attempts + 1
    return {
      ...e,
      attempts,
      lastAttemptAt: new Date(nowMs).toISOString(),
      lastError:     error,
      status: attempts >= MAX_RETRIES ? 'abandoned' : 'failed',
    }
  })
}

/**
 * High-level API: enqueue a new event for the given user.
 * Loads, updates and saves the outbox atomically (within a single call).
 */
export function enqueueActivityEvent(
  userId: UserName,
  event:  ActivityEvent,
  nowMs = Date.now(),
): void {
  const entries = loadOutbox(userId)
  const updated = enqueueEvent(entries, event, nowMs)
  saveOutbox(userId, updated)
}

/** Get all pending (unsent) entries for a user. */
export function getPendingEntries(userId: UserName): ActivityOutboxEntry[] {
  return loadOutbox(userId).filter(e => e.status === 'pending' || e.status === 'failed')
}
