/**
 * Part 9 — Authentication, cache and recovery tests.
 *
 * Verifies safe handling of:
 *   • Malformed remote state
 *   • selectSharedState strips non-shared fields (identity isolation)
 *   • pendingKeys / persistPending round-trip
 *   • rebaseSharedState with no pending keys
 *   • Legacy cache import restricted to verified household
 *   • Cache key scoping: different coupleId / stateId → different keys
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { selectSharedState, SHARED_KEYS } from '@/lib/shared-state'
import { rebaseSharedState } from '@/lib/sync-merge'
import type { SharedState } from '@/lib/shared-state'
import type { CoupleAccess } from '@/lib/couple-access'

// ── localStorage stub ─────────────────────────────────────────────────────────
// jsdom provides localStorage; we just need to clear it between tests.
beforeEach(() => localStorage.clear())
afterEach(()  => localStorage.clear())

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACCESS_MATEO: CoupleAccess = {
  userId: 'mateo-uid', coupleId: 'couple-abc', stateId: 'sema', userName: 'mateo',
}
const ACCESS_SEVAL: CoupleAccess = {
  userId: 'seval-uid', coupleId: 'couple-abc', stateId: 'sema', userName: 'seval',
}
const ACCESS_OTHER: CoupleAccess = {
  userId: 'other-uid', coupleId: 'couple-xyz', stateId: 'other', userName: 'mateo',
}

// ── 1. Cache key scoping ──────────────────────────────────────────────────────

describe('Cache key scoping', () => {
  it('different coupleId produces a different localStorage key', async () => {
    const { pendingKeys, persistPending } = await import('@/lib/couple-cache')
    persistPending(ACCESS_MATEO, new Set(['events']))
    const keysForOther = pendingKeys(ACCESS_OTHER)
    // Other couple has empty pending set (no key exists for them)
    expect(keysForOther.size).toBe(0)
  })

  it('pendingKeys / persistPending round-trip preserves keys', async () => {
    const { pendingKeys, persistPending } = await import('@/lib/couple-cache')
    const pending = new Set<keyof SharedState>(['events', 'todos', 'goals'])
    persistPending(ACCESS_MATEO, pending)
    const restored = pendingKeys(ACCESS_MATEO)
    expect([...restored].sort()).toEqual(['events', 'goals', 'todos'])
  })

  it('persistPending only stores valid SHARED_KEYS', async () => {
    const { pendingKeys, persistPending } = await import('@/lib/couple-cache')
    // Inject garbage key via raw localStorage to simulate a corrupted entry
    const key = `semacalendar-v2:couple-abc:sema:pending`
    localStorage.setItem(key, JSON.stringify(['events', 'currentUser', 'fakeKey']))
    const restored = pendingKeys(ACCESS_MATEO)
    // currentUser and fakeKey are not in SHARED_KEYS
    expect([...restored]).not.toContain('currentUser')
    expect([...restored]).not.toContain('fakeKey')
    expect([...restored]).toContain('events')
  })
})

// ── 2. Identity isolation via selectSharedState ───────────────────────────────

describe('selectSharedState: identity isolation', () => {
  it('never imports currentUser from shared state', () => {
    const result = selectSharedState({
      currentUser: 'mateo',
      events: [],
      todos: [],
    })
    expect((result as Record<string, unknown>).currentUser).toBeUndefined()
  })

  it('never imports setCurrentUser function from shared state', () => {
    const result = selectSharedState({
      setCurrentUser: () => {},
      events: [],
    })
    expect((result as Record<string, unknown>).setCurrentUser).toBeUndefined()
  })

  it('never imports overlayCount from shared state', () => {
    const result = selectSharedState({ overlayCount: 5, events: [] })
    expect((result as Record<string, unknown>).overlayCount).toBeUndefined()
  })

  it('never imports store methods from shared state', () => {
    const result = selectSharedState({
      addEvent: () => {},
      deleteGoal: () => {},
      events: [{ id: 'e1', title: 'Test', date: '2027-01-01', color: 'blue', createdBy: 'mateo', createdAt: 'x', updatedAt: 'x' }],
    })
    expect((result as Record<string, unknown>).addEvent).toBeUndefined()
    expect((result as Record<string, unknown>).deleteGoal).toBeUndefined()
    expect((result.events as never[]).length).toBe(1)
  })

  it('all 18 SHARED_KEYS are present in the canonical list', () => {
    // Ensure nobody accidentally removed a key
    expect(SHARED_KEYS.length).toBe(18)
    expect(SHARED_KEYS).toContain('events')
    expect(SHARED_KEYS).toContain('todos')
    expect(SHARED_KEYS).toContain('goals')
    expect(SHARED_KEYS).toContain('moods')
    expect(SHARED_KEYS).toContain('loveNotes')
    expect(SHARED_KEYS).toContain('wishlistItems')
    expect(SHARED_KEYS).toContain('countdowns')
    expect(SHARED_KEYS).toContain('memories')
    expect(SHARED_KEYS).toContain('partnerNotes')
    expect(SHARED_KEYS).toContain('shoppingLists')
    expect(SHARED_KEYS).toContain('monthlyIncome')
    expect(SHARED_KEYS).toContain('budgetItems')
    expect(SHARED_KEYS).toContain('savingsGoals')
    expect(SHARED_KEYS).toContain('financeMonths')
    expect(SHARED_KEYS).toContain('savingsTransactions')
    expect(SHARED_KEYS).toContain('focusActivities')
    expect(SHARED_KEYS).toContain('focusCarryOver')
    expect(SHARED_KEYS).toContain('boomBoomCount')
  })
})

// ── 3. Malformed remote state ─────────────────────────────────────────────────

describe('Malformed remote state fails safely', () => {
  it('null remote → no crash, empty result', () => {
    expect(() => selectSharedState(null)).not.toThrow()
    expect(selectSharedState(null)).toEqual({})
  })

  it('empty object → no crash, empty result', () => {
    const result = selectSharedState({})
    expect(result).toEqual({})
  })

  it('string value → no crash', () => {
    expect(() => selectSharedState('garbage')).not.toThrow()
  })

  it('array of non-id items → rejects that array', () => {
    const result = selectSharedState({
      events: [{ title: 'no id' }, { notId: 'x' }],
    })
    expect(result.events).toBeUndefined()
  })

  it('events with non-string id → rejects', () => {
    const result = selectSharedState({ events: [{ id: 123 }] })
    expect(result.events).toBeUndefined()
  })

  it('non-finite monthlyIncome → rejected', () => {
    expect(selectSharedState({ monthlyIncome: NaN }).monthlyIncome).toBeUndefined()
    expect(selectSharedState({ monthlyIncome: Infinity }).monthlyIncome).toBeUndefined()
    expect(selectSharedState({ monthlyIncome: -Infinity }).monthlyIncome).toBeUndefined()
  })

  it('non-boolean focusCarryOver → rejected', () => {
    expect(selectSharedState({ focusCarryOver: 'yes' }).focusCarryOver).toBeUndefined()
    expect(selectSharedState({ focusCarryOver: 1 }).focusCarryOver).toBeUndefined()
  })
})

// ── 4. rebaseSharedState: safe handling ──────────────────────────────────────

describe('rebaseSharedState: safe handling', () => {
  function s(partial: Partial<SharedState>) { return partial as SharedState }

  it('no pending keys → returns remote unchanged, no conflicts', () => {
    const base   = s({ events: [] })
    const local  = s({ events: [{ id: 'e1' } as never] })
    const remote = s({ events: [{ id: 'e2' } as never] })
    const result = rebaseSharedState(base, local, remote, new Set())
    expect(result.conflicts).toEqual([])
    expect(result.state).toEqual(remote)
  })

  it('local unchanged → remote applied with no conflict', () => {
    const base  = s({ todos: [{ id: 't1', title: 'Base' } as never] })
    const local = base
    const remote = s({ todos: [{ id: 't1', title: 'Remote edit' } as never] })
    const result = rebaseSharedState(base, local, remote, new Set(['todos']))
    expect(result.conflicts).toEqual([])
    expect((result.state.todos as never[])[0]).toMatchObject({ title: 'Remote edit' })
  })

  it('local adds item, remote unchanged → local preserved', () => {
    const base  = s({ todos: [] })
    const local = s({ todos: [{ id: 't-new', title: 'New local' } as never] })
    const remote = base
    const result = rebaseSharedState(base, local, remote, new Set(['todos']))
    expect(result.conflicts).toEqual([])
    expect((result.state.todos as never[])[0]).toMatchObject({ title: 'New local' })
  })

  it('shared state cannot be empty-array confused with missing (both → empty)', () => {
    // An empty array is a valid value; it should not be treated the same as undefined
    const base  = s({ events: [{ id: 'e1' } as never] })
    const local = s({ events: [] })
    const remote = s({ events: [] })
    const result = rebaseSharedState(base, local, remote, new Set(['events']))
    expect(result.conflicts).toEqual([])
    expect(result.state.events).toEqual([])
  })
})

// ── 5. Legacy cache import restriction ────────────────────────────────────────

describe('Legacy cache import', () => {
  it('legacy semacalendar-v1 cache ignored when scope has different stateId', async () => {
    const { coupleStorage, setCacheScope } = await import('@/lib/couple-cache')

    // Write a legacy v1 cache
    localStorage.setItem('semacalendar-v1', JSON.stringify({ state: { events: [{ id: 'legacy-ev' }] } }))

    // Set scope to a non-sema stateId
    const differentScope: CoupleAccess = { userId: 'x', coupleId: 'c1', stateId: 'other-state', userName: 'mateo' }
    setCacheScope(differentScope)
    const item = coupleStorage.getItem('unused')
    // Should NOT return the legacy cache
    expect(item).toBeNull()

    // Reset scope
    setCacheScope(null)
  })

  it('removeItem is a no-op (does not delete unsynced work)', async () => {
    const { coupleStorage, setCacheScope } = await import('@/lib/couple-cache')
    const access: CoupleAccess = { userId: 'u', coupleId: 'c', stateId: 's', userName: 'seval' }
    setCacheScope(access)
    coupleStorage.setItem('ignored', JSON.stringify({ state: { events: [] } }))
    coupleStorage.removeItem('ignored')
    // Key should still exist (removeItem is intentionally a no-op)
    const key = `semacalendar-v2:c:s`
    expect(localStorage.getItem(key)).not.toBeNull()
    setCacheScope(null)
  })
})
