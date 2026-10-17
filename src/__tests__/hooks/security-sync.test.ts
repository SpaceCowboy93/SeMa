import { act, renderHook } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { useSupabaseSync, triggerPull, useSyncStatus } from '@/hooks/useSupabaseSync'
import { clearActiveCouple, loadCoupleCache, useAppStore } from '@/store/useAppStore'
import { establishAuth, getAuthGeneration, invalidateAuth } from '@/lib/auth-session'
import { pendingKeys, getCacheStorageWarning } from '@/lib/couple-cache'

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), saveResult: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: () => {
    let writing = false
    const filters: Record<string, unknown> = {}
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query }, abortSignal: () => query,
      update: (value: unknown) => { writing = true; mocks.write(value); return query },
      maybeSingle: () => writing ? mocks.saveResult(filters) : mocks.read() }
    return query
  }, channel: () => ({ on: () => ({ subscribe: vi.fn() }) }), removeChannel: vi.fn(),
} }))
const access = { userId: 'a', userName: 'mateo' as const, coupleId: 'couple-a', stateId: 'sema' }
const remote = { data: { state: { monthlyIncome: 100, todos: [] }, updated_at: '2026-09-21' } }
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); invalidateAuth(); clearActiveCouple(); mocks.read.mockReset(); mocks.write.mockReset(); mocks.saveResult.mockReset().mockResolvedValue({ data: { updated_at: '2026-09-22' } }) })
afterEach(() => { vi.useRealTimers() })
async function start() {
  await loadCoupleCache(access)
  const context = establishAuth(access, getAuthGeneration())!
  const hook = renderHook(() => useSupabaseSync(context))
  await act(async () => {})
  return hook
}
it('loads remote data on a fresh browser without uploading default state', async () => {
  mocks.read.mockResolvedValue(remote)
  const hook = await start()
  expect(useAppStore.getState().monthlyIncome).toBe(100)
  expect(pendingKeys(access).size).toBe(0)
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write).not.toHaveBeenCalled()
  hook.unmount()
})
it('preserves a partial legacy cache but does not upload conflicting edits without a baseline', async () => {
  localStorage.setItem('semacalendar-v1', JSON.stringify({ state: { monthlyIncome: 777, currentUser: 'seval' }, version: 0 }))
  const todo = { id: 'remote-todo', title: 'Preserve shared work' }
  mocks.read.mockResolvedValue({ data: { ...remote.data, state: { monthlyIncome: 100, todos: [todo] } } })
  const hook = await start()
  expect(useAppStore.getState().currentUser).toBeNull()
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write).not.toHaveBeenCalled()
  expect(useAppStore.getState().monthlyIncome).toBe(777)
  expect(useAppStore.getState().todos).toEqual([todo])
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
  expect(localStorage.getItem('semacalendar-v1')).not.toBeNull()
  hook.unmount()
})
it('preserves pending scalar edits and deletions through logout and a fresh pull', async () => {
  mocks.read.mockResolvedValue(remote)
  const first = await start()
  act(() => useAppStore.setState({ monthlyIncome: 777, todos: [] }))
  act(() => { invalidateAuth(); clearActiveCouple() })
  first.unmount()
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
  const next = await start()
  expect(useAppStore.getState().monthlyIncome).toBe(777)
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ state: expect.objectContaining({ monthlyIncome: 777, todos: [] }) }))
  expect(pendingKeys(access).size).toBe(0)
  next.unmount()
})
it('ignores a read completed after logout and account switch', async () => {
  let resolve!: (value: typeof remote) => void
  mocks.read.mockImplementation(() => new Promise(r => { resolve = r }))
  const hook = await start()
  act(() => { invalidateAuth(); clearActiveCouple() })
  await loadCoupleCache({ ...access, coupleId: 'couple-b', userId: 'b' })
  await act(async () => { resolve(remote) })
  expect(useAppStore.getState().monthlyIncome).not.toBe(100)
  expect(mocks.write).not.toHaveBeenCalled()
  hook.unmount()
})
it('does not overwrite an edit made while the initial read is pending', async () => {
  let resolve!: (value: typeof remote) => void
  mocks.read.mockImplementation(() => new Promise(r => { resolve = r }))
  const hook = await start()
  act(() => useAppStore.setState({ monthlyIncome: 888 }))
  const todo = { id: 'remote-todo', title: 'Keep existing shared work' }
  await act(async () => {
    resolve({ data: { ...remote.data, state: { ...remote.data.state, todos: [todo] } } } as typeof remote)
    await vi.advanceTimersByTimeAsync(800)
  })
  expect(useAppStore.getState().monthlyIncome).toBe(888)
  // The user never saw the server's scalar value: retain their edit for
  // reconciliation instead of assuming it supersedes existing remote work.
  expect(mocks.write).not.toHaveBeenCalled()
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
  expect(useAppStore.getState().todos).toEqual([todo])
  hook.unmount()
})

it('keeps pending work when logout happens during a save', async () => {
  mocks.read.mockResolvedValue(remote)
  let resolve!: (value: unknown) => void
  mocks.saveResult.mockImplementation(() => new Promise(r => { resolve = r }))
  const hook = await start()
  act(() => useAppStore.setState({ monthlyIncome: 999 }))
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  act(() => { invalidateAuth(); clearActiveCouple() })
  await act(async () => { resolve({ data: { updated_at: '2026-09-22' } }) })
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
  expect(useAppStore.getState().monthlyIncome).not.toBe(999)
  hook.unmount()
  await loadCoupleCache(access)
  expect(useAppStore.getState().monthlyIncome).toBe(999)
})
it('retains failed saves for retry rather than clearing pending work', async () => {
  mocks.read.mockResolvedValue(remote)
  mocks.saveResult.mockResolvedValue({ error: { message: 'offline' }, data: null })
  const hook = await start()
  act(() => useAppStore.setState({ monthlyIncome: 999 }))
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
  expect(useAppStore.getState().monthlyIncome).toBe(999)
  hook.unmount()
})

it('preserves a newer partner addition when a stale device saves an unrelated field', async () => {
  mocks.read.mockResolvedValue(remote)
  const hook = await start()
  const newerTodo = { id: 'newer-partner-item', title: 'New partner work' }
  mocks.read.mockResolvedValue({ data: {
    state: { monthlyIncome: 100, todos: [newerTodo], legacySetting: 'keep' }, updated_at: '2026-09-23',
  } })
  act(() => useAppStore.setState({ monthlyIncome: 555 }))
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write.mock.lastCall?.[0].state).toMatchObject({ monthlyIncome: 555, todos: [newerTodo], legacySetting: 'keep' })
  expect(mocks.saveResult).toHaveBeenCalledWith(expect.objectContaining({ updated_at: '2026-09-23', id: 'sema', couple_id: 'couple-a' }))
  hook.unmount()
})

it('retries a lost compare-and-swap against the new version and combines separate additions', async () => {
  mocks.read.mockResolvedValue(remote)
  const hook = await start()
  const mine = { id: 'mine', title: 'Mine' }, theirs = { id: 'theirs', title: 'Theirs' }
  act(() => useAppStore.setState({ todos: [mine] as never }))
  mocks.read.mockResolvedValueOnce(remote).mockResolvedValue({ data: {
    state: { monthlyIncome: 100, todos: [theirs] }, updated_at: '2026-09-24',
  } })
  mocks.saveResult.mockResolvedValueOnce({ data: null, error: null })
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write).toHaveBeenCalledTimes(2)
  expect(mocks.write.mock.lastCall?.[0].state.todos).toEqual([theirs, mine])
  expect(mocks.saveResult.mock.calls.map(([filters]) => filters.updated_at)).toEqual(['2026-09-21', '2026-09-24'])
  expect(pendingKeys(access).size).toBe(0)
  hook.unmount()
})

it('does not overwrite a newer conflicting scalar, including after logout and cache restoration', async () => {
  mocks.read.mockResolvedValue(remote)
  const first = await start()
  act(() => useAppStore.setState({ monthlyIncome: 555 }))
  act(() => { invalidateAuth(); clearActiveCouple() })
  first.unmount()
  mocks.read.mockResolvedValue({ data: { state: { monthlyIncome: 999, todos: [] }, updated_at: '2026-09-24' } })
  const second = await start()
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write).not.toHaveBeenCalled()
  expect(useAppStore.getState().monthlyIncome).toBe(555)
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
  second.unmount()
})

it('pulls newer partner data despite an unresolved pending-field conflict', async () => {
  mocks.read.mockResolvedValue(remote)
  const hook = await start()
  act(() => useAppStore.setState({ monthlyIncome: 555 }))
  const partnerTodo = { id: 'partner-todo', title: 'Partner addition' }
  mocks.read.mockResolvedValue({ data: {
    state: { monthlyIncome: 999, todos: [partnerTodo] }, updated_at: '2026-09-24',
  } })

  await act(async () => { triggerPull() })

  expect(useAppStore.getState().todos).toEqual([partnerTodo])
  expect(useAppStore.getState().monthlyIncome).toBe(555)
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
  expect(mocks.write).not.toHaveBeenCalled()
  hook.unmount()
})

it('saves an independent pending addition without overwriting or discarding a conflicting field', async () => {
  mocks.read.mockResolvedValue(remote)
  const hook = await start()
  const localTodo = { id: 'local-todo', title: 'Local addition' }
  act(() => useAppStore.setState({ monthlyIncome: 555, todos: [localTodo] as never }))
  mocks.read.mockResolvedValue({ data: {
    state: { monthlyIncome: 999, todos: [], legacySetting: 'preserve' }, updated_at: '2026-09-24',
  } })

  await act(async () => { await vi.advanceTimersByTimeAsync(800) })

  expect(mocks.write).toHaveBeenCalledTimes(1)
  expect(mocks.write.mock.lastCall?.[0].state).toMatchObject({
    monthlyIncome: 999, todos: [localTodo], legacySetting: 'preserve',
  })
  expect(useAppStore.getState().monthlyIncome).toBe(555)
  expect(useAppStore.getState().todos).toEqual([localTodo])
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
  expect(pendingKeys(access).has('todos')).toBe(false)
  hook.unmount()
})

it('retains edits made during a save and includes them in the next conditional write', async () => {
  mocks.read.mockResolvedValue(remote)
  let resolve!: (value: unknown) => void
  mocks.saveResult.mockImplementationOnce(() => new Promise(r => { resolve = r }))
  const hook = await start()
  act(() => useAppStore.setState({ monthlyIncome: 555 }))
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  act(() => useAppStore.setState({ monthlyIncome: 666 }))
  mocks.read.mockResolvedValue({ data: { state: { monthlyIncome: 555, todos: [] }, updated_at: '2026-09-24' } })
  await act(async () => { resolve({ data: { updated_at: '2026-09-24' } }) })
  expect(useAppStore.getState().monthlyIncome).toBe(666)
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write.mock.lastCall?.[0].state.monthlyIncome).toBe(666)
  expect(pendingKeys(access).size).toBe(0)
  hook.unmount()
})

it('bounds contention retries and retains the pending cache', async () => {
  mocks.read.mockResolvedValue(remote)
  mocks.saveResult.mockResolvedValue({ data: null, error: null })
  const hook = await start()
  act(() => useAppStore.setState({ monthlyIncome: 555 }))
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write).toHaveBeenCalledTimes(3)
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
  hook.unmount()
})

it('always advances the database timestamp even if the browser clock is behind', async () => {
  vi.setSystemTime(new Date('2026-09-20'))
  mocks.read.mockResolvedValue(remote)
  const hook = await start()
  act(() => useAppStore.setState({ monthlyIncome: 555 }))
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(Date.parse(mocks.write.mock.lastCall?.[0].updated_at)).toBeGreaterThan(Date.parse(remote.data.updated_at))
  hook.unmount()
})

it('accepts a remote deletion on a clean device and does not resurrect it on the next save', async () => {
  const deletedTodo = { id: 'removed-by-partner', title: 'Old item' }
  mocks.read.mockResolvedValue({ data: {
    state: { monthlyIncome: 100, todos: [deletedTodo] }, updated_at: '2026-09-21',
  } })
  const hook = await start()
  mocks.read.mockResolvedValue({ data: {
    state: { monthlyIncome: 100, todos: [] }, updated_at: '2026-09-23',
  } })
  await act(async () => { triggerPull() })
  expect(useAppStore.getState().todos).toEqual([])
  act(() => useAppStore.setState({ monthlyIncome: 555 }))
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write.mock.lastCall?.[0].state.todos).toEqual([])
  hook.unmount()
})

it('retains an ambiguously clean cache with no baseline for explicit review without uploading it', async () => {
  localStorage.setItem('semacalendar-v2:couple-a:sema', JSON.stringify({ state: { todos: [{ id: 'deleted', title: 'Old' }] }, version: 0 }))
  localStorage.setItem('semacalendar-v2:couple-a:sema:pending', '[]')
  mocks.read.mockResolvedValue(remote)
  const hook = await start()
  expect(useAppStore.getState().todos).toEqual([{ id: 'deleted', title: 'Old' }])
  expect(pendingKeys(access).has('todos')).toBe(true)
  expect(mocks.write).not.toHaveBeenCalled()
  hook.unmount()
})

it('propagates a remote deletion while preserving an unrelated pending item edit across restart', async () => {
  const firstTodo = { id: 'first', title: 'First' }, secondTodo = { id: 'second', title: 'Second' }
  mocks.read.mockResolvedValue({ data: {
    state: { monthlyIncome: 100, todos: [firstTodo, secondTodo] }, updated_at: '2026-09-21',
  } })
  const first = await start()
  act(() => useAppStore.setState({ todos: [firstTodo, { ...secondTodo, title: 'Edited' }] as never }))
  act(() => { invalidateAuth(); clearActiveCouple() })
  first.unmount()
  mocks.read.mockResolvedValue({ data: {
    state: { monthlyIncome: 100, todos: [secondTodo] }, updated_at: '2026-09-23',
  } })
  const second = await start()
  expect(useAppStore.getState().todos).toEqual([{ ...secondTodo, title: 'Edited' }])
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write.mock.lastCall?.[0].state.todos).toEqual([{ ...secondTodo, title: 'Edited' }])
  second.unmount()
})

it('does not apply a stale poll response over a save started while that poll is pending', async () => {
  mocks.read.mockResolvedValue(remote)
  const hook = await start()
  let resolve!: (value: typeof remote) => void
  mocks.read.mockImplementationOnce(() => new Promise(r => { resolve = r }))
  act(() => triggerPull())
  act(() => useAppStore.setState({ monthlyIncome: 555 }))
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write).not.toHaveBeenCalled()
  await act(async () => { resolve(remote) })
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write.mock.lastCall?.[0].state.monthlyIncome).toBe(555)
  expect(useAppStore.getState().monthlyIncome).toBe(555)
  hook.unmount()
})

it('loads valid date-keyed moods and preserves them through an unrelated conditional save', async () => {
  const moods = [{ userId: 'mateo', date: '2026-10-13', mood: 'happy', note: 'A good day' }]
  mocks.read.mockResolvedValue({ data: { ...remote.data, state: { ...remote.data.state, moods } } })
  const hook = await start()
  expect(useAppStore.getState().moods).toEqual(moods)
  act(() => useAppStore.setState({ monthlyIncome: 555 }))
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write.mock.lastCall?.[0].state.moods).toEqual(moods)
  expect(JSON.parse(localStorage.getItem('semacalendar-v2:couple-a:sema')!).state.moods).toEqual(moods)
  hook.unmount()
})

it('tracks and saves a normal mood created by the store', async () => {
  mocks.read.mockResolvedValue({ data: { ...remote.data, state: { ...remote.data.state, moods: [] } } })
  const hook = await start()
  act(() => {
    useAppStore.getState().setCurrentUser('mateo')
    useAppStore.getState().setMood('relaxed', 'Local mood')
  })
  expect(pendingKeys(access).has('moods')).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write.mock.lastCall?.[0].state.moods).toMatchObject([{ userId: 'mateo', mood: 'relaxed', note: 'Local mood' }])
  expect(pendingKeys(access).has('moods')).toBe(false)
  hook.unmount()
})

it.each([
  { events: [{ id: 'valid', title: 'Keep' }, { title: 'Missing ID' }] },
  { todos: [{ id: 'duplicate', title: 'First server copy' }, { id: 'duplicate', title: 'Second server copy' }] },
  { financeMonths: [{ key: '2026-10', income: 100 }, { key: '2026-10', income: 200 }] },
  { moods: [{ userId: 'mateo', date: '2026-10-13', mood: 'unknown' }] },
  { shoppingLists: 'not an array' },
  null, 'invalid snapshot', [],
])('quarantines malformed remote state during an unrelated save: %j', async state => {
  mocks.read.mockResolvedValue(remote)
  const hook = await start()
  const status = renderHook(useSyncStatus)
  act(() => useAppStore.setState({ monthlyIncome: 555 }))
  mocks.read.mockResolvedValue({ data: { state, updated_at: '2026-10-13' } })
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write).not.toHaveBeenCalled()
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
  expect(useAppStore.getState().monthlyIncome).toBe(555)
  expect(status.result.current.warning).toContain('Saving is paused')
  status.unmount(); hook.unmount()
})

it('keeps the last valid collection on a malformed pull and resumes after a valid snapshot', async () => {
  const todo = { id: 'keep', title: 'Existing' }
  mocks.read.mockResolvedValue({ data: { ...remote.data, state: { ...remote.data.state, todos: [todo] } } })
  const hook = await start()
  const status = renderHook(useSyncStatus)
  mocks.read.mockResolvedValue({ data: { state: { todos: [todo, null] }, updated_at: '2026-10-13' } })
  await act(async () => { triggerPull() })
  expect(useAppStore.getState().todos).toEqual([todo])
  expect(JSON.parse(localStorage.getItem('semacalendar-v2:couple-a:sema')!).state.todos).toEqual([todo])
  expect(status.result.current.warning).toContain('Saving is paused')
  mocks.read.mockResolvedValue({ data: { state: { ...remote.data.state, todos: [] }, updated_at: '2026-10-14' } })
  await act(async () => { triggerPull() })
  expect(useAppStore.getState().todos).toEqual([])
  expect(status.result.current.warning).toBeNull()
  expect(mocks.write).not.toHaveBeenCalled()
  status.unmount(); hook.unmount()
})

it('does not overwrite malformed initial data with a fresh browser default', async () => {
  mocks.read.mockResolvedValue({ data: { state: { events: [null] }, updated_at: remote.data.updated_at } })
  const hook = await start()
  act(() => useAppStore.setState({ monthlyIncome: 555 }))
  await act(async () => { await vi.advanceTimersByTimeAsync(800); triggerPull() })
  expect(mocks.write).not.toHaveBeenCalled()
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
  hook.unmount()
})

it('keeps an edit in memory without throwing on quota failure and retries after storage recovers', async () => {
  mocks.read.mockResolvedValue(remote)
  const hook = await start()
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Synthetic quota failure', 'QuotaExceededError')
  })
  try {
    expect(() => act(() => useAppStore.setState({ monthlyIncome: 555 }))).not.toThrow()
    expect(useAppStore.getState().monthlyIncome).toBe(555)
    expect(getCacheStorageWarning()).toContain('Keep this tab open')
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(mocks.write).not.toHaveBeenCalled()
  } finally { storage.mockRestore() }
  await act(async () => { triggerPull(); await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write.mock.lastCall?.[0].state.monthlyIncome).toBe(555)
  expect(pendingKeys(access).has('monthlyIncome')).toBe(false)
  expect(getCacheStorageWarning()).toBeNull()
  hook.unmount()
  await loadCoupleCache(access)
  expect(useAppStore.getState().monthlyIncome).toBe(555)
})

it.each(['', ':base', ':pending'])('retains pending work if persistence fails after a server acknowledgement (%s)', async suffix => {
  mocks.read.mockResolvedValue(remote)
  const hook = await start()
  const status = renderHook(useSyncStatus)
  let storage: { mockRestore(): void } | undefined
  const originalSet = Storage.prototype.setItem
  mocks.saveResult.mockImplementationOnce(() => {
    storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'semacalendar-v2:couple-a:sema' + suffix) throw new DOMException('Synthetic failure', 'QuotaExceededError')
      originalSet.call(this, key, value)
    })
    return { data: { updated_at: '2026-10-13' } }
  })
  try {
    act(() => useAppStore.setState({ monthlyIncome: 555 }))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(mocks.write).toHaveBeenCalledTimes(1)
    expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
    expect(status.result.current.status).toBe('error')
    expect(getCacheStorageWarning()).not.toBeNull()
  } finally { storage?.mockRestore() }
  mocks.read.mockResolvedValue({ data: { state: { ...remote.data.state, monthlyIncome: 555 }, updated_at: '2026-10-13' } })
  await act(async () => { triggerPull() })
  expect(pendingKeys(access).has('monthlyIncome')).toBe(false)
  expect(getCacheStorageWarning()).toBeNull()
  expect(mocks.write).toHaveBeenCalledTimes(1)
  status.unmount(); hook.unmount()
})

it('can retry local persistence while offline without acknowledging the unsent change', async () => {
  mocks.read.mockResolvedValue(remote)
  const hook = await start()
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Synthetic quota failure', 'QuotaExceededError')
  })
  try {
    act(() => useAppStore.setState({ monthlyIncome: 555 }))
    expect(getCacheStorageWarning()).not.toBeNull()
  } finally { storage.mockRestore() }
  mocks.read.mockResolvedValue({ data: null, error: { message: 'Offline' } })
  await act(async () => { triggerPull() })
  expect(getCacheStorageWarning()).toBeNull()
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
  expect(JSON.parse(localStorage.getItem('semacalendar-v2:couple-a:sema')!).state.monthlyIncome).toBe(555)
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(mocks.write).not.toHaveBeenCalled()
  hook.unmount()
  await loadCoupleCache(access)
  expect(useAppStore.getState().monthlyIncome).toBe(555)
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
})
