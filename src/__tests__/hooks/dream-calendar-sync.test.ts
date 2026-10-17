import { act, renderHook } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { useSupabaseSync } from '@/hooks/useSupabaseSync'
import { clearActiveCouple, loadCoupleCache, useAppStore } from '@/store/useAppStore'
import { establishAuth, getAuthGeneration, invalidateAuth } from '@/lib/auth-session'
import { pendingKeys } from '@/lib/couple-cache'
import type { EventTodo } from '@/types'

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: () => {
    let writing = false
    const query = { select: () => query, eq: () => query, abortSignal: () => query,
      update: (value: unknown) => { writing = true; mocks.write(value); return query },
      maybeSingle: () => writing ? Promise.resolve({ data: { updated_at: '2026-10-13T12:00:00Z' } }) : mocks.read() }
    return query
  }, channel: () => ({ on: () => ({ subscribe: vi.fn() }) }), removeChannel: vi.fn(),
} }))
const access = { userId: 'local', userName: 'mateo' as const, coupleId: 'phase-two-sync', stateId: 'sema' }
const originalItems: EventTodo[] = [{ id: 'pack', title: 'Pack', isCompleted: true }]
const goal = {
  id: 'g', title: 'Trip', categoryId: 'life' as const, progressCurrent: 0, progressTarget: 0, isCompleted: false,
  targetDate: '2027-06-01', linkedEventId: 'e', createdBy: 'mateo' as const, createdAt: '2026-10-01',
  checklistItems: originalItems, checklist: ['Pack'],
}
const event = { id: 'e', title: 'Trip', date: '2027-06-01', color: 'blue' as const, linkedGoalId: 'g',
  createdBy: 'mateo' as const, createdAt: '2026-10-01', updatedAt: '2026-10-01', todos: originalItems }
const snapshot = (items: EventTodo[]) => ({ goals: [{ ...goal, checklistItems: items, checklist: items.map(item => item.title) }],
  events: [{ ...event, todos: items }], monthlyIncome: 100, todos: [] })
beforeEach(() => {
  vi.useFakeTimers(); invalidateAuth(); clearActiveCouple(); localStorage.clear()
  mocks.read.mockReset(); mocks.write.mockReset()
})
afterEach(() => { vi.useRealTimers() })
async function start(legacy = false, empty = false) {
  const state = snapshot(empty ? [] : originalItems)
  mocks.read.mockResolvedValue({ data: { state: legacy ? { ...state,
    goals: [{ ...state.goals[0], checklistItems: undefined, checklist: empty ? undefined : state.goals[0].checklist }],
    events: [{ ...state.events[0], todos: empty ? undefined : state.events[0].todos }],
  } : state, updated_at: '2026-10-01' } })
  await loadCoupleCache(access)
  const context = establishAuth(access, getAuthGeneration())!
  const hook = renderHook(() => useSupabaseSync(context))
  await act(async () => {})
  return hook
}
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(800) }) }

it('never publishes only half a linked deletion when Calendar conflicts, while saving unrelated income', async () => {
  const hook = await start()
  act(() => { useAppStore.getState().deleteGoal('g'); useAppStore.getState().setMonthlyIncome(200) })
  const remote = { ...snapshot(originalItems), events: [{ ...event, notes: 'Partner edit' }] }
  mocks.read.mockResolvedValue({ data: { state: remote, updated_at: '2026-10-02' } })
  await flush()
  expect(mocks.write.mock.lastCall?.[0].state).toMatchObject({ goals: remote.goals, events: remote.events, monthlyIncome: 200 })
  expect([...pendingKeys(access)].sort()).toEqual(['events', 'goals'])
  hook.unmount()
})

it.each([false, true])('combines a Calendar rename and partner completion toggle coherently (legacy=%s)', async legacy => {
  const hook = await start(legacy)
  act(() => useAppStore.getState().updateEvent('e', { todos: [{ ...originalItems[0], title: 'Pack early' }] }))
  mocks.read.mockResolvedValue({ data: { state: snapshot([{ ...originalItems[0], isCompleted: false }]), updated_at: '2026-10-02' } })
  await flush()
  const expected = [{ ...originalItems[0], title: 'Pack early', isCompleted: false }]
  const state = mocks.write.mock.lastCall?.[0].state
  expect(state.goals[0].checklistItems).toEqual(expected)
  expect(state.events[0].todos).toEqual(expected)
  expect(state.goals[0].checklist).toEqual(['Pack early'])
  expect(pendingKeys(access).size).toBe(0)
  hook.unmount()
})

it('combines independent additions without a conflict in the legacy text projection or duplicate IDs', async () => {
  const hook = await start()
  const mine = { id: 'mine', title: 'Hotel', isCompleted: false }, partner = { id: 'partner', title: 'Tickets', isCompleted: true }
  act(() => useAppStore.getState().updateGoal('g', { checklistItems: [...originalItems, mine] }))
  mocks.read.mockResolvedValue({ data: { state: snapshot([...originalItems, partner]), updated_at: '2026-10-02' } })
  await flush()
  const state = mocks.write.mock.lastCall?.[0].state
  expect(state.events[0].todos).toEqual([...originalItems, partner, mine])
  expect(state.goals[0].checklistItems).toEqual(state.events[0].todos)
  expect(state.goals[0].checklist).toEqual(['Pack', 'Tickets', 'Hotel'])
  expect(pendingKeys(access).size).toBe(0)
  hook.unmount()
})

it('keeps both local linked versions pending on a real conflict and still applies clean partner todos', async () => {
  const hook = await start()
  act(() => useAppStore.getState().updateGoal('g', { checklistItems: [{ ...originalItems[0], title: 'My rename' }] }))
  const remote = { ...snapshot([{ ...originalItems[0], title: 'Partner rename' }]), todos: [{ id: 'new', title: 'Partner todo' }] }
  mocks.read.mockResolvedValue({ data: { state: remote, updated_at: '2026-10-02' } })
  await flush()
  expect(mocks.write).not.toHaveBeenCalled()
  expect(useAppStore.getState().goals[0].checklist).toEqual(['My rename'])
  expect(useAppStore.getState().events[0].todos?.[0].title).toBe('My rename')
  expect(useAppStore.getState().todos).toEqual(remote.todos)
  expect([...pendingKeys(access)].sort()).toEqual(['events', 'goals'])
  expect(remote.goals[0].checklist).toEqual(['Partner rename'])
  hook.unmount()
})

it('combines concurrent first additions on a legacy linked pair with omitted checklist fields', async () => {
  const hook = await start(true, true)
  const mine = { id: 'mine', title: 'Mine', isCompleted: true }, partner = { id: 'partner', title: 'Partner', isCompleted: false }
  act(() => useAppStore.getState().updateGoal('g', { checklistItems: [mine] }))
  mocks.read.mockResolvedValue({ data: { state: snapshot([partner]), updated_at: '2026-10-02' } })
  await flush()
  const state = mocks.write.mock.lastCall?.[0].state
  expect(state.events[0].todos).toEqual([partner, mine])
  expect(state.goals[0].checklistItems).toEqual([partner, mine])
  expect(state.goals[0].checklist).toEqual(['Partner', 'Mine'])
  expect(pendingKeys(access).size).toBe(0)
  hook.unmount()
})
