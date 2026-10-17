import { describe, it, expect } from 'vitest'
import {
  enqueueEvent,
  markDelivered,
  recordFailure,
  expireOutboxEntries,
  trimOutbox,
  nextRetryMs,
  loadOutbox,
  saveOutbox,
  clearOutbox,
  enqueueActivityEvent,
  getPendingEntries,
  type ActivityOutboxEntry,
} from '@/lib/activity-outbox'
import { createActivityEvent, type ActivityEvent } from '@/lib/activity-event'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Aligned to a 5-minute bucket boundary (5_666_667 × 300_000) so grouping
// tests adding ≤4 minutes stay in the same bucket.
const BASE_MS = 1_700_000_100_000

function makeActivityEvent(overrides: {
  entityId?: string
  entityType?: Parameters<typeof createActivityEvent>[0]['entityType']
  actionType?: Parameters<typeof createActivityEvent>[0]['actionType']
  nowMs?: number
} = {}): ActivityEvent {
  const event = createActivityEvent({
    actor:       'mateo',
    entityType:  overrides.entityType ?? 'todo',
    actionType:  overrides.actionType ?? 'completed',
    entityId:    overrides.entityId ?? 'todo-1',
    entityTitle: 'Test item',
    nowMs:       overrides.nowMs ?? BASE_MS,
  })
  if (!event) throw new Error('createActivityEvent returned null')
  return event
}

function makeEntry(overrides: Partial<ActivityOutboxEntry> = {}): ActivityOutboxEntry {
  const event = makeActivityEvent({ entityId: overrides.event?.entityId ?? 'todo-1' })
  return {
    event,
    enqueuedAt:  new Date(BASE_MS).toISOString(),
    attempts:    0,
    status:      'pending',
    groupCount:  1,
    ...overrides,
  }
}

// ── enqueueEvent ──────────────────────────────────────────────────────────────

describe('enqueueEvent', () => {
  it('adds a new event to an empty outbox', () => {
    const event = makeActivityEvent()
    const result = enqueueEvent([], event, BASE_MS)
    expect(result).toHaveLength(1)
    expect(result[0].event.id).toBe(event.id)
    expect(result[0].status).toBe('pending')
    expect(result[0].groupCount).toBe(1)
  })

  it('deduplicates by idempotency key', () => {
    const event = makeActivityEvent()
    const result1 = enqueueEvent([], event, BASE_MS)
    const result2 = enqueueEvent(result1, event, BASE_MS)
    expect(result2).toHaveLength(1)
  })

  it('groups events with the same groupingKey within 5 minutes', () => {
    const e1 = makeActivityEvent({ entityType: 'shopping', actionType: 'added', entityId: 'item-1', nowMs: BASE_MS })
    const e2 = makeActivityEvent({ entityType: 'shopping', actionType: 'added', entityId: 'item-2', nowMs: BASE_MS + 2 * 60_000 })

    const step1 = enqueueEvent([], e1, BASE_MS)
    const step2 = enqueueEvent(step1, e2, BASE_MS + 2 * 60_000)

    expect(step2).toHaveLength(1)
    expect(step2[0].groupCount).toBe(2)
  })

  it('does NOT group events from different 5-minute windows', () => {
    const e1 = makeActivityEvent({ entityType: 'shopping', actionType: 'added', entityId: 'item-1', nowMs: BASE_MS })
    const e2 = makeActivityEvent({ entityType: 'shopping', actionType: 'added', entityId: 'item-2', nowMs: BASE_MS + 6 * 60_000 })

    const step1 = enqueueEvent([], e1, BASE_MS)
    const step2 = enqueueEvent(step1, e2, BASE_MS + 6 * 60_000)

    expect(step2).toHaveLength(2)
  })

  it('does NOT group events with importance != grouped', () => {
    const e1 = makeActivityEvent({ entityType: 'todo', actionType: 'completed', entityId: 'todo-1', nowMs: BASE_MS })
    const e2 = makeActivityEvent({ entityType: 'todo', actionType: 'completed', entityId: 'todo-2', nowMs: BASE_MS + 60_000 })

    const step1 = enqueueEvent([], e1, BASE_MS)
    const step2 = enqueueEvent(step1, e2, BASE_MS + 60_000)

    expect(step2).toHaveLength(2)
  })

  it('sets enqueuedAt to current time', () => {
    const event = makeActivityEvent()
    const result = enqueueEvent([], event, BASE_MS)
    expect(result[0].enqueuedAt).toBe(new Date(BASE_MS).toISOString())
  })
})

// ── expireOutboxEntries ───────────────────────────────────────────────────────

describe('expireOutboxEntries', () => {
  it('removes entries older than 24 hours', () => {
    const old = makeEntry({ enqueuedAt: new Date(BASE_MS - 25 * 60 * 60 * 1000).toISOString() })
    const fresh = makeEntry({ event: makeActivityEvent({ entityId: 'fresh-1' }) })
    const result = expireOutboxEntries([old, fresh], BASE_MS)
    expect(result).toHaveLength(1)
    expect(result[0].event.entityId).toBe('fresh-1')
  })

  it('removes abandoned entries regardless of age', () => {
    const abandoned = makeEntry({ status: 'abandoned' })
    const result = expireOutboxEntries([abandoned], BASE_MS)
    expect(result).toHaveLength(0)
  })

  it('keeps entries less than 24 hours old', () => {
    const recent = makeEntry({ enqueuedAt: new Date(BASE_MS - 23 * 60 * 60 * 1000).toISOString() })
    const result = expireOutboxEntries([recent], BASE_MS)
    expect(result).toHaveLength(1)
  })
})

// ── trimOutbox ────────────────────────────────────────────────────────────────

describe('trimOutbox', () => {
  it('does not trim when under limit', () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ event: makeActivityEvent({ entityId: `todo-${i}` }) })
    )
    expect(trimOutbox(entries)).toHaveLength(5)
  })

  it('trims to 100 when over limit, keeping newest', () => {
    const entries = Array.from({ length: 110 }, (_, i) =>
      makeEntry({
        event: makeActivityEvent({ entityId: `todo-${i}` }),
        enqueuedAt: new Date(BASE_MS + i * 1000).toISOString(),
      })
    )
    const result = trimOutbox(entries)
    expect(result).toHaveLength(100)
    // Newest (indices 10-109) survive
    const ids = result.map(e => e.event.entityId)
    expect(ids).toContain('todo-109')
    expect(ids).not.toContain('todo-0')
  })
})

// ── markDelivered ─────────────────────────────────────────────────────────────

describe('markDelivered', () => {
  it('removes the delivered entry by event id', () => {
    const e1 = makeActivityEvent({ entityId: 'todo-1' })
    const e2 = makeActivityEvent({ entityId: 'todo-2' })
    const entries = [makeEntry({ event: e1 }), makeEntry({ event: e2 })]
    const result = markDelivered(entries, e1.id)
    expect(result).toHaveLength(1)
    expect(result[0].event.id).toBe(e2.id)
  })

  it('returns unchanged array if id not found', () => {
    const entries = [makeEntry()]
    const result = markDelivered(entries, 'nonexistent')
    expect(result).toHaveLength(1)
  })
})

// ── recordFailure ─────────────────────────────────────────────────────────────

describe('recordFailure', () => {
  it('increments attempts and sets failed status', () => {
    const entry = makeEntry()
    const result = recordFailure([entry], entry.event.id, 'Network error', BASE_MS)
    expect(result[0].attempts).toBe(1)
    expect(result[0].status).toBe('failed')
    expect(result[0].lastError).toBe('Network error')
    expect(result[0].lastAttemptAt).toBeTruthy()
  })

  it('marks as abandoned after MAX_RETRIES (5)', () => {
    let entries = [makeEntry()]
    for (let i = 0; i < 5; i++) {
      entries = recordFailure(entries, entries[0].event.id, 'error', BASE_MS)
    }
    expect(entries[0].status).toBe('abandoned')
    expect(entries[0].attempts).toBe(5)
  })

  it('is still failed at attempt 4 (below MAX_RETRIES)', () => {
    let entries = [makeEntry()]
    for (let i = 0; i < 4; i++) {
      entries = recordFailure(entries, entries[0].event.id, 'error', BASE_MS)
    }
    expect(entries[0].status).toBe('failed')
  })
})

// ── nextRetryMs ───────────────────────────────────────────────────────────────

describe('nextRetryMs', () => {
  it('returns a value greater than nowMs', () => {
    const next = nextRetryMs(0, BASE_MS)
    expect(next).toBeGreaterThan(BASE_MS)
  })

  it('uses exponential backoff', () => {
    const r0 = nextRetryMs(0, BASE_MS) - BASE_MS
    const r1 = nextRetryMs(1, BASE_MS) - BASE_MS
    expect(r1).toBe(r0 * 2)
  })

  it('caps backoff at 1 hour', () => {
    const r10 = nextRetryMs(10, BASE_MS) - BASE_MS
    expect(r10).toBeLessThanOrEqual(60 * 60 * 1000)
  })
})

// ── localStorage persistence ──────────────────────────────────────────────────

describe('localStorage persistence', () => {
  it('loadOutbox returns empty array when nothing saved', () => {
    expect(loadOutbox('mateo')).toEqual([])
  })

  it('round-trips entries through localStorage', () => {
    const event = makeActivityEvent()
    const entries = enqueueEvent([], event, BASE_MS)
    saveOutbox('mateo', entries)
    const loaded = loadOutbox('mateo')
    expect(loaded).toHaveLength(1)
    expect(loaded[0].event.id).toBe(event.id)
    clearOutbox('mateo')
  })

  it('clearOutbox removes all entries', () => {
    const event = makeActivityEvent()
    saveOutbox('mateo', enqueueEvent([], event, BASE_MS))
    clearOutbox('mateo')
    expect(loadOutbox('mateo')).toEqual([])
  })

  it('loadOutbox rejects malformed records silently', () => {
    localStorage.setItem('semacalendar-activity-outbox-v1:mateo', '[{"bad":true}]')
    const result = loadOutbox('mateo')
    expect(result).toEqual([])
    clearOutbox('mateo')
  })
})

// ── enqueueActivityEvent / getPendingEntries ──────────────────────────────────

describe('enqueueActivityEvent + getPendingEntries', () => {
  it('enqueues to localStorage and retrieves as pending', () => {
    clearOutbox('mateo')
    const event = makeActivityEvent({ entityId: 'high-level-test' })
    enqueueActivityEvent('mateo', event, BASE_MS)
    const pending = getPendingEntries('mateo')
    expect(pending).toHaveLength(1)
    expect(pending[0].event.id).toBe(event.id)
    clearOutbox('mateo')
  })

  it('does not include failed-then-abandoned entries in getPendingEntries', () => {
    clearOutbox('mateo')
    const event = makeActivityEvent()
    enqueueActivityEvent('mateo', event, BASE_MS)
    // Abandon it via repeated failures
    let entries = loadOutbox('mateo')
    for (let i = 0; i < 5; i++) {
      entries = recordFailure(entries, event.id, 'err', BASE_MS)
    }
    saveOutbox('mateo', entries)
    expect(getPendingEntries('mateo')).toHaveLength(0)
    clearOutbox('mateo')
  })
})
