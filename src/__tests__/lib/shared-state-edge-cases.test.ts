/**
 * Edge-case regression tests for selectSharedState and sameValue.
 *
 * These cover specific value types that could be silently lost if the
 * type guards in selectSharedState were written with loose falsiness checks
 * instead of strict typeof checks:
 *
 *   - monthlyIncome: 0   (falsy number — must NOT be dropped)
 *   - boomBoomCount: 0   (falsy number — must NOT be dropped)
 *   - focusCarryOver: false (falsy boolean — must NOT be dropped)
 *   - events: []          (empty array — must NOT be dropped)
 *
 * Also verifies that invalid types are rejected and that non-shared
 * keys (e.g., currentUser) are never imported from JSON.
 */

import { describe, it, expect } from 'vitest'
import { selectSharedState } from '@/lib/shared-state'
import { sameValue } from '@/lib/sync-merge'

// ── Zero-value numbers ────────────────────────────────────────────────────────

describe('selectSharedState — zero-value numbers', () => {
  it('preserves monthlyIncome: 0 (user cleared their income)', () => {
    const result = selectSharedState({ monthlyIncome: 0 })
    expect(result).toHaveProperty('monthlyIncome', 0)
  })

  it('preserves boomBoomCount: 0 (count reset to zero)', () => {
    const result = selectSharedState({ boomBoomCount: 0 })
    expect(result).toHaveProperty('boomBoomCount', 0)
  })

  it('rejects monthlyIncome: NaN', () => {
    const result = selectSharedState({ monthlyIncome: NaN })
    expect(result.monthlyIncome).toBeUndefined()
  })

  it('rejects monthlyIncome: Infinity', () => {
    const result = selectSharedState({ monthlyIncome: Infinity })
    expect(result.monthlyIncome).toBeUndefined()
  })

  it('rejects monthlyIncome as a string', () => {
    const result = selectSharedState({ monthlyIncome: '5000' })
    expect(result.monthlyIncome).toBeUndefined()
  })

  it('rejects boomBoomCount as a boolean', () => {
    const result = selectSharedState({ boomBoomCount: true })
    expect(result.boomBoomCount).toBeUndefined()
  })
})

// ── False boolean ─────────────────────────────────────────────────────────────

describe('selectSharedState — focusCarryOver boolean', () => {
  it('preserves focusCarryOver: false (user disabled carry-over)', () => {
    const result = selectSharedState({ focusCarryOver: false })
    expect(result).toHaveProperty('focusCarryOver', false)
  })

  it('preserves focusCarryOver: true', () => {
    const result = selectSharedState({ focusCarryOver: true })
    expect(result).toHaveProperty('focusCarryOver', true)
  })

  it('rejects focusCarryOver: 0 (number, not boolean)', () => {
    const result = selectSharedState({ focusCarryOver: 0 })
    expect(result.focusCarryOver).toBeUndefined()
  })

  it('rejects focusCarryOver: 1 (number, not boolean)', () => {
    const result = selectSharedState({ focusCarryOver: 1 })
    expect(result.focusCarryOver).toBeUndefined()
  })

  it('rejects focusCarryOver as a string', () => {
    const result = selectSharedState({ focusCarryOver: 'true' })
    expect(result.focusCarryOver).toBeUndefined()
  })
})

// ── Empty arrays ──────────────────────────────────────────────────────────────

describe('selectSharedState — empty arrays', () => {
  it('preserves events: [] (user deleted all events)', () => {
    const result = selectSharedState({ events: [] })
    expect(result).toHaveProperty('events')
    expect(result.events).toEqual([])
  })

  it('preserves todos: [] (user cleared all todos)', () => {
    const result = selectSharedState({ todos: [] })
    expect(result.todos).toEqual([])
  })

  it('preserves shoppingLists: [] (all lists deleted)', () => {
    const result = selectSharedState({ shoppingLists: [] })
    expect(result.shoppingLists).toEqual([])
  })

  it('preserves financeMonths: [] (no finance data)', () => {
    const result = selectSharedState({ financeMonths: [] })
    expect(result.financeMonths).toEqual([])
  })
})

// ── Non-shared key isolation ──────────────────────────────────────────────────

describe('selectSharedState — identity isolation', () => {
  it('strips currentUser from raw JSON', () => {
    const result = selectSharedState({ currentUser: 'mateo', events: [] })
    expect((result as Record<string, unknown>).currentUser).toBeUndefined()
  })

  it('strips unknown keys from raw JSON', () => {
    const result = selectSharedState({ events: [], _injectedKey: 'payload' })
    expect((result as Record<string, unknown>)._injectedKey).toBeUndefined()
  })

  it('returns empty object for empty input object', () => {
    expect(selectSharedState({})).toEqual({})
  })

  it('returns only the keys that are present in the source', () => {
    const result = selectSharedState({ events: [], monthlyIncome: 500 })
    const keys = Object.keys(result)
    expect(keys).toContain('events')
    expect(keys).toContain('monthlyIncome')
    expect(keys.length).toBe(2)
  })
})

// ── sameValue — zero/false/empty equality ─────────────────────────────────────

describe('sameValue — zero, false, empty array', () => {
  it('considers 0 equal to 0', () => {
    expect(sameValue(0, 0)).toBe(true)
  })

  it('does not consider 0 equal to null', () => {
    expect(sameValue(0, null)).toBe(false)
  })

  it('does not consider 0 equal to undefined', () => {
    expect(sameValue(0, undefined)).toBe(false)
  })

  it('considers false equal to false', () => {
    expect(sameValue(false, false)).toBe(true)
  })

  it('does not consider false equal to null', () => {
    expect(sameValue(false, null)).toBe(false)
  })

  it('considers two empty arrays equal', () => {
    expect(sameValue([], [])).toBe(true)
  })

  it('does not consider empty array equal to null', () => {
    expect(sameValue([], null)).toBe(false)
  })
})
