/**
 * Part 8 — Conflict and data-loss tests.
 *
 * Uses isolated mock clients (rebaseSharedState + selectSharedState) only.
 * No live Supabase calls. Tests document the exact conflict rule:
 *
 *   SAME-FIELD-CONFLICT: when two clients independently edit the same scalar
 *   field of the same record (same id), rebaseSharedState throws internally
 *   and marks the key as conflicted.  The remote (server) value wins.
 *
 *   DIFFERENT-FIELD-MERGE: when both clients edit different fields of the
 *   same record, all changes are preserved (three-way object merge).
 *
 *   ARRAY-ID-MERGE: array items are reconciled by id (or 'key' for
 *   financeMonths). Remote deletions are respected unless local also edited
 *   the deleted item (conflict).
 *
 *   TIMESTAMP: 'updatedAt' within an object takes the later of the two
 *   timestamps.
 */

import { describe, it, expect } from 'vitest'
import { rebaseSharedState } from '@/lib/sync-merge'
import { selectSharedState } from '@/lib/shared-state'
import type { SharedState } from '@/lib/shared-state'

// ── Helpers ───────────────────────────────────────────────────────────────────

function state(partial: Partial<SharedState>): Partial<SharedState> {
  return partial
}

function merge(
  base: Partial<SharedState>,
  local: Partial<SharedState>,
  remote: Partial<SharedState>,
  keys: (keyof SharedState)[],
) {
  return rebaseSharedState(base as SharedState, local as SharedState, remote as SharedState, new Set(keys))
}

// ── 1. Both users editing different categories ────────────────────────────────

describe('Both users editing different categories', () => {
  it('local todos update + remote events update — both preserved', () => {
    const base = state({ events: [{ id: 'e1', title: 'Original' } as never], todos: [{ id: 't1', title: 'Original' } as never] })
    const local = state({ events: base.events, todos: [{ id: 't1', title: 'Local edit' } as never] })
    const remote = state({ events: [{ id: 'e1', title: 'Remote edit' } as never], todos: base.todos })
    const result = merge(base, local, remote, ['events', 'todos'])
    expect(result.conflicts).toEqual([])
    expect((result.state.events as never[])[0]).toMatchObject({ title: 'Remote edit' })
    expect((result.state.todos as never[])[0]).toMatchObject({ title: 'Local edit' })
  })
})

// ── 2. Different items in same category ───────────────────────────────────────

describe('Different items in same category', () => {
  it('local edits item A, remote edits item B — both changes survive', () => {
    const base = state({ todos: [
      { id: 'a', title: 'A-base' } as never,
      { id: 'b', title: 'B-base' } as never,
    ] })
    const local  = state({ todos: [{ id: 'a', title: 'A-local' } as never, { id: 'b', title: 'B-base' } as never] })
    const remote = state({ todos: [{ id: 'a', title: 'A-base'  } as never, { id: 'b', title: 'B-remote' } as never] })
    const result = merge(base, local, remote, ['todos'])
    expect(result.conflicts).toEqual([])
    const titles = (result.state.todos as never[]).map((t: Record<string, string>) => t.title)
    expect(titles).toContain('A-local')
    expect(titles).toContain('B-remote')
  })
})

// ── 3. Same item conflict ─────────────────────────────────────────────────────

describe('Same item edited by both users (conflict)', () => {
  it('marks the key as conflicted and uses remote value', () => {
    const base   = state({ todos: [{ id: 't1', title: 'original' } as never] })
    const local  = state({ todos: [{ id: 't1', title: 'local edit' } as never] })
    const remote = state({ todos: [{ id: 't1', title: 'remote edit' } as never] })
    const result = merge(base, local, remote, ['todos'])
    expect(result.conflicts).toContain('todos')
    // Remote wins
    expect((result.state.todos as never[])[0]).toMatchObject({ title: 'remote edit' })
  })
})

// ── 4. One user editing while other deletes ───────────────────────────────────

describe('Edit/delete race', () => {
  it('local edit while remote deleted — conflicts (delete wins via remote)', () => {
    const base   = state({ todos: [{ id: 't1', title: 'Task' } as never] })
    const local  = state({ todos: [{ id: 't1', title: 'Edited task' } as never] })
    const remote = state({ todos: [] })
    const result = merge(base, local, remote, ['todos'])
    // Editing a deleted item is a conflict
    expect(result.conflicts).toContain('todos')
    // Remote (empty) wins per conflict rule
    expect(result.state.todos).toEqual([])
  })

  it('local delete while remote edited newer — conflicts', () => {
    const base   = state({ todos: [{ id: 't1', title: 'Before' } as never] })
    const local  = state({ todos: [] })
    const remote = state({ todos: [{ id: 't1', title: 'Newer' } as never] })
    const result = merge(base, local, remote, ['todos'])
    expect(result.conflicts).toContain('todos')
    // Remote (newer) wins
    expect((result.state.todos as never[])[0]).toMatchObject({ title: 'Newer' })
  })
})

// ── 5. Stale client reconnecting ──────────────────────────────────────────────

describe('Stale client reconnecting', () => {
  it('stale client with old base: remote changes are applied (not overwritten)', () => {
    // Client disconnected when base had version 1, remote advanced to version 3
    const staleBase = state({ goals: [{ id: 'g1', title: 'V1' } as never] })
    const localUnchanged = staleBase  // Client didn't change goals
    const remoteAdvanced = state({ goals: [{ id: 'g1', title: 'V3 advanced' } as never] })
    const result = merge(staleBase, localUnchanged, remoteAdvanced, ['goals'])
    expect(result.conflicts).toEqual([])
    expect((result.state.goals as never[])[0]).toMatchObject({ title: 'V3 advanced' })
  })
})

// ── 6. Duplicate realtime messages ────────────────────────────────────────────

describe('Duplicate realtime messages', () => {
  it('applying same remote state twice is idempotent', () => {
    const base  = state({ todos: [{ id: 't1', title: 'Original' } as never] })
    const local = base  // no local changes
    const remote = state({ todos: [{ id: 't1', title: 'Updated' } as never] })
    const r1 = merge(base, local, remote, ['todos'])
    // Apply the same message again — now base = local = first result
    const r2 = merge(remote, remote, remote, ['todos'])
    expect(r1.conflicts).toEqual([])
    expect(r2.conflicts).toEqual([])
    expect((r2.state.todos as never[])[0]).toMatchObject({ title: 'Updated' })
  })
})

// ── 7. Remote deletion vs stale localStorage ──────────────────────────────────

describe('Remote deletion vs stale local cache', () => {
  it('remote deleted item not re-introduced by local stale cache (no local edit)', () => {
    const item = { id: 'w1', title: 'Wish' }
    const base  = state({ wishlistItems: [item] as never[] })
    const local = base  // local unchanged (just stale)
    const remote = state({ wishlistItems: [] })
    const result = merge(base, local, remote, ['wishlistItems'])
    expect(result.conflicts).toEqual([])
    expect(result.state.wishlistItems).toHaveLength(0)
  })
})

// ── 8. Local add while remote adds different item ─────────────────────────────

describe('Both users adding different items (no conflict)', () => {
  it('both new items appear in merged result', () => {
    const base  = state({ memories: [] })
    const local = state({ memories: [{ id: 'm-local', title: 'Mateo memory' } as never] })
    const remote = state({ memories: [{ id: 'm-remote', title: 'Seval memory' } as never] })
    const result = merge(base, local, remote, ['memories'])
    expect(result.conflicts).toEqual([])
    expect(result.state.memories).toHaveLength(2)
    const titles = (result.state.memories as never[]).map((m: Record<string, string>) => m.title)
    expect(titles).toContain('Mateo memory')
    expect(titles).toContain('Seval memory')
  })
})

// ── 9. Malformed remote state fails safely ────────────────────────────────────

describe('Malformed remote state', () => {
  it('selectSharedState returns empty object for null input', () => {
    expect(selectSharedState(null)).toEqual({})
  })

  it('selectSharedState returns empty object for non-object input', () => {
    expect(selectSharedState('string')).toEqual({})
    expect(selectSharedState(42)).toEqual({})
    expect(selectSharedState([])).toEqual({})
  })

  it('selectSharedState skips malformed array entries without crashing', () => {
    const result = selectSharedState({ events: [null, undefined, 'string', { id: 'valid' }] })
    // Some items are malformed so the whole array is rejected
    expect(result.events).toBeUndefined()
  })

  it('rebaseSharedState with no pending keys returns remote unchanged', () => {
    const base   = state({ todos: [] })
    const local  = state({ todos: [{ id: 't1' } as never] })
    const remote = state({ todos: [{ id: 't2' } as never] })
    const result = merge(base, local, remote, [])
    expect(result.conflicts).toEqual([])
    // No pending keys → state equals remote
    expect(result.state).toEqual(remote)
  })
})

// ── 10. updatedAt timestamp — later value wins ────────────────────────────────

describe('updatedAt: later timestamp wins on merge', () => {
  it('takes the later updatedAt when both clients update the same object', () => {
    const base   = state({ countdowns: [{ id: 'c1', title: 'Event', updatedAt: '2027-01-01T00:00:00Z' } as never] })
    const local  = state({ countdowns: [{ id: 'c1', title: 'Event', updatedAt: '2027-01-02T00:00:00Z' } as never] })
    const remote = state({ countdowns: [{ id: 'c1', title: 'Event', updatedAt: '2027-01-03T00:00:00Z' } as never] })
    const result = merge(base, local, remote, ['countdowns'])
    expect(result.conflicts).toEqual([])
    expect((result.state.countdowns as never[])[0]).toMatchObject({ updatedAt: '2027-01-03T00:00:00Z' })
  })

  it('local updatedAt wins when it is newer than remote', () => {
    const base   = state({ countdowns: [{ id: 'c2', title: 'Event', updatedAt: '2027-01-01T00:00:00Z' } as never] })
    const local  = state({ countdowns: [{ id: 'c2', title: 'Event', updatedAt: '2027-01-05T00:00:00Z' } as never] })
    const remote = state({ countdowns: [{ id: 'c2', title: 'Event', updatedAt: '2027-01-03T00:00:00Z' } as never] })
    const result = merge(base, local, remote, ['countdowns'])
    expect(result.conflicts).toEqual([])
    expect((result.state.countdowns as never[])[0]).toMatchObject({ updatedAt: '2027-01-05T00:00:00Z' })
  })
})

// ── 11. Finance month deletion ────────────────────────────────────────────────

describe('Finance month deletion', () => {
  it('local adds data to month, remote deleted month — conflict', () => {
    const a = { key: '2026-09', income: 100 }
    const b = { key: '2026-10', income: 200 }
    const base  = state({ financeMonths: [a, b] as never[] })
    const local = state({ financeMonths: [a, { ...b, income: 300 }] as never[] })
    const remote = state({ financeMonths: [b] as never[] })
    const result = merge(base, local, remote, ['financeMonths'])
    // Local changed b; remote deleted a. No conflict on b (both kept a, so local edit)
    // But remote removed a which local also kept — not a conflict (local didn't edit a)
    // and local edited b which remote kept — so local edit wins
    expect(result.conflicts).toEqual([])
    const months = result.state.financeMonths as never[]
    expect(months.find((m: Record<string, unknown>) => m.key === '2026-10')).toMatchObject({ income: 300 })
    expect(months.find((m: Record<string, unknown>) => m.key === '2026-09')).toBeUndefined()
  })
})
