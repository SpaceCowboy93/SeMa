import { expect, it } from 'vitest'
import { rebaseSharedState } from '@/lib/sync-merge'
import type { SharedState } from '@/lib/shared-state'

it('merges different fields and nested shopping items without losing partner work', () => {
  const list = { id: 'list', name: 'Groceries', updatedAt: '2026-09-20', items: [{ id: 'a', name: 'A', isChecked: false }] }
  const base = { shoppingLists: [list] } as unknown as SharedState
  const local = { shoppingLists: [{ ...list, updatedAt: '2026-09-21', items: [{ ...list.items[0], isChecked: true }] }] } as unknown as SharedState
  const remote = { shoppingLists: [{ ...list, name: 'New name', updatedAt: '2026-09-22', items: [...list.items, { id: 'b', name: 'B', isChecked: false }] }] } as unknown as SharedState
  const merged = rebaseSharedState(base, local, remote, new Set(['shoppingLists']))
  expect(merged.conflicts).toEqual([])
  expect(merged.state.shoppingLists?.[0]).toMatchObject({ name: 'New name', updatedAt: '2026-09-22', items: [
    { id: 'a', isChecked: true }, { id: 'b', isChecked: false },
  ] })
})

it('holds incompatible edits instead of silently picking a writer', () => {
  const state = (title: string) => ({ todos: [{ id: 'todo', title }] }) as unknown as SharedState
  const merged = rebaseSharedState(state('original'), state('local'), state('partner'), new Set(['todos']))
  expect(merged.conflicts).toEqual(['todos'])
})

it('merges nested deletions and unchecking instead of resurrecting checked items', () => {
  const a = { id: 'a', isChecked: true }, b = { id: 'b', isChecked: true }
  const state = (items: unknown[]) => ({ shoppingLists: [{ id: 'list', items }] }) as unknown as SharedState
  const merged = rebaseSharedState(state([a, b]), state([a, { ...b, isChecked: false }]), state([b]), new Set(['shoppingLists']))
  expect(merged.conflicts).toEqual([])
  expect(merged.state.shoppingLists?.[0].items).toEqual([{ ...b, isChecked: false }])
})

it('preserves a newer edit when a stale client attempts to delete the same item', () => {
  const state = (todos: unknown[]) => ({ todos }) as unknown as SharedState
  const merged = rebaseSharedState(state([{ id: 'a', title: 'Before' }]), state([]), state([{ id: 'a', title: 'Newer' }]), new Set(['todos']))
  expect(merged.conflicts).toEqual(['todos'])
  expect(merged.state.todos).toEqual([{ id: 'a', title: 'Newer' }])
})

it('identifies finance-month records by key and propagates their deletion', () => {
  const a = { key: '2026-09', income: 100 }, b = { key: '2026-10', income: 100 }
  const state = (financeMonths: unknown[]) => ({ financeMonths }) as unknown as SharedState
  const merged = rebaseSharedState(state([a, b]), state([a, { ...b, income: 200 }]), state([b]), new Set(['financeMonths']))
  expect(merged.conflicts).toEqual([])
  expect(merged.state.financeMonths).toEqual([{ ...b, income: 200 }])
})
