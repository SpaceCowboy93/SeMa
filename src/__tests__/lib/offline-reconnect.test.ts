/**
 * Part 6 — Offline / reconnect hardening tests.
 *
 * Covers scenarios not addressed in shared-state-conflicts.test.ts:
 *   1. Stale client with LOCAL changes reconnecting — local adds preserved,
 *      remote edits applied, no conflicts when fields don't overlap.
 *   2. Multi-key pending flush — all pending categories survive a
 *      localStorage round-trip together.
 *   3. Offline add → reconnect with remote concurrent edit — both survive
 *      because they touch different items.
 *   4. Rapid successive updates on the same record — latest updatedAt wins
 *      (last-write-wins semantics).
 *   5. Local edit on item A + remote add item B — local edit preserved,
 *      remote item appears (no conflict).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rebaseSharedState } from '@/lib/sync-merge'
import type { SharedState } from '@/lib/shared-state'
import type { CoupleAccess } from '@/lib/couple-access'

// ── Helpers ───────────────────────────────────────────────────────────────────

function s(partial: Partial<SharedState>): SharedState {
  return partial as SharedState
}

function merge(
  base: Partial<SharedState>,
  local: Partial<SharedState>,
  remote: Partial<SharedState>,
  keys: (keyof SharedState)[],
) {
  return rebaseSharedState(
    base as SharedState,
    local as SharedState,
    remote as SharedState,
    new Set(keys),
  )
}

// ── 1. Stale client reconnects with local adds + unrelated remote edits ───────

describe('Stale client with local adds + remote advances', () => {
  it('local new item preserved, remote edit on existing item applied', () => {
    const base = s({ todos: [{ id: 't1', title: 'Task A' } as never] })
    // Local: added a new item while offline
    const local = s({ todos: [
      { id: 't1', title: 'Task A' } as never,
      { id: 't2', title: 'New offline task' } as never,
    ] })
    // Remote: edited Task A (different item from what we added)
    const remote = s({ todos: [{ id: 't1', title: 'Task A (edited remotely)' } as never] })

    const result = merge(base, local, remote, ['todos'])
    // t2 is a local add, t1 was not locally edited → no conflict
    expect(result.conflicts).toEqual([])
    const titles = (result.state.todos as never[]).map((t: Record<string, string>) => t.title)
    expect(titles).toContain('New offline task')
    expect(titles).toContain('Task A (edited remotely)')
  })

  it('local edit on one item + remote edit on same item → conflict, remote wins', () => {
    const base = s({ goals: [{ id: 'g1', title: 'Base goal' } as never] })
    const local  = s({ goals: [{ id: 'g1', title: 'Local edit' } as never] })
    const remote = s({ goals: [{ id: 'g1', title: 'Remote edit' } as never] })

    const result = merge(base, local, remote, ['goals'])
    expect(result.conflicts).toContain('goals')
    // Remote wins on conflict
    expect((result.state.goals as never[])[0]).toMatchObject({ title: 'Remote edit' })
  })
})

// ── 2. Multi-key pending flush round-trip ─────────────────────────────────────

describe('Multi-key pending flush', () => {
  beforeEach(() => localStorage.clear())
  afterEach(()  => localStorage.clear())

  it('all pending categories are persisted and restored together', async () => {
    const { pendingKeys, persistPending } = await import('@/lib/couple-cache')
    const access: CoupleAccess = { userId: 'u1', coupleId: 'c1', stateId: 's1', userName: 'mateo' }
    const pending = new Set<keyof SharedState>(['events', 'todos', 'goals', 'wishlistItems'])
    persistPending(access, pending)
    const restored = pendingKeys(access)
    expect([...restored].sort()).toEqual(['events', 'goals', 'todos', 'wishlistItems'])
  })

  it('clearing pending after successful sync leaves empty set', async () => {
    const { pendingKeys, persistPending } = await import('@/lib/couple-cache')
    const access: CoupleAccess = { userId: 'u1', coupleId: 'c1', stateId: 's1', userName: 'mateo' }
    persistPending(access, new Set<keyof SharedState>(['events', 'todos']))
    persistPending(access, new Set<keyof SharedState>()) // clear after sync
    const restored = pendingKeys(access)
    expect(restored.size).toBe(0)
  })
})

// ── 3. Offline add → reconnect with concurrent remote add (no conflict) ───────

describe('Offline adds from both sides', () => {
  it('mateo adds event offline, seval adds different event — both appear on merge', () => {
    const base = s({ events: [] })
    const local  = s({ events: [{ id: 'e-mateo', title: 'Mateo offline event' } as never] })
    const remote = s({ events: [{ id: 'e-seval', title: 'Seval concurrent event' } as never] })

    const result = merge(base, local, remote, ['events'])
    expect(result.conflicts).toEqual([])
    expect(result.state.events).toHaveLength(2)
    const ids = (result.state.events as never[]).map((e: Record<string, string>) => e.id)
    expect(ids).toContain('e-mateo')
    expect(ids).toContain('e-seval')
  })

  it('both add items to multiple categories offline — all items preserved', () => {
    const base = s({ events: [], todos: [] })
    const local  = s({ events: [{ id: 'ev1', title: 'Local event' } as never], todos: [{ id: 'td1', title: 'Local todo' } as never] })
    const remote = s({ events: [{ id: 'ev2', title: 'Remote event' } as never], todos: [{ id: 'td2', title: 'Remote todo' } as never] })

    const result = merge(base, local, remote, ['events', 'todos'])
    expect(result.conflicts).toEqual([])
    expect(result.state.events).toHaveLength(2)
    expect(result.state.todos).toHaveLength(2)
  })
})

// ── 4. Rapid successive writes — latest updatedAt wins ────────────────────────

describe('Rapid successive writes (last-write-wins)', () => {
  it('three sequential remote versions — only the latest survives', () => {
    const base = s({ countdowns: [{ id: 'c1', title: 'V1', updatedAt: '2027-01-01T10:00:00Z' } as never] })
    // Local didn't change the countdown
    const local = base
    // Remote has two updates — simulate that we receive the later one
    const remote = s({ countdowns: [{ id: 'c1', title: 'V3', updatedAt: '2027-01-01T10:02:00Z' } as never] })

    const result = merge(base, local, remote, ['countdowns'])
    expect(result.conflicts).toEqual([])
    expect((result.state.countdowns as never[])[0]).toMatchObject({ title: 'V3', updatedAt: '2027-01-01T10:02:00Z' })
  })

  it('both users update only updatedAt (same title) — no conflict, later timestamp wins', () => {
    // Both users touched the record but didn't change the title — just bumped updatedAt.
    // This should NOT be a conflict: the later timestamp takes precedence.
    const base   = s({ todos: [{ id: 't1', title: 'Same title', updatedAt: '2027-01-01T10:00:00Z' } as never] })
    const local  = s({ todos: [{ id: 't1', title: 'Same title', updatedAt: '2027-01-01T10:05:00Z' } as never] })
    const remote = s({ todos: [{ id: 't1', title: 'Same title', updatedAt: '2027-01-01T10:03:00Z' } as never] })

    const result = merge(base, local, remote, ['todos'])
    expect(result.conflicts).toEqual([])
    // Later updatedAt (local, 10:05) wins
    expect((result.state.todos as never[])[0]).toMatchObject({ updatedAt: '2027-01-01T10:05:00Z' })
  })
})

// ── 5. Local edit item A + remote adds item B ──────────────────────────────────

describe('Local edit + remote add (no overlap)', () => {
  it('local edit on item A preserved, remote new item B appears', () => {
    const base = s({ memories: [{ id: 'm1', title: 'Memory base' } as never] })
    const local  = s({ memories: [{ id: 'm1', title: 'Memory edited' } as never] })
    const remote = s({ memories: [
      { id: 'm1', title: 'Memory base' } as never,
      { id: 'm2', title: 'Remote new memory' } as never,
    ] })

    const result = merge(base, local, remote, ['memories'])
    expect(result.conflicts).toEqual([])
    const titles = (result.state.memories as never[]).map((m: Record<string, string>) => m.title)
    expect(titles).toContain('Memory edited')
    expect(titles).toContain('Remote new memory')
  })
})
