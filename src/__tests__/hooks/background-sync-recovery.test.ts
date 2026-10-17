import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useSupabaseSync, useSyncConflicts, resolveBackgroundConflict, triggerPull } from '@/hooks/useSupabaseSync'
import { clearActiveCouple, loadCoupleCache, useAppStore } from '@/store/useAppStore'
import { establishAuth, getAuthGeneration, invalidateAuth } from '@/lib/auth-session'
import { pendingKeys, readSyncArchives, readSyncUnbased, getCacheStorageWarning } from '@/lib/couple-cache'

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), result: vi.fn(), on: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: () => {
    let writing = false
    const filters: Record<string, unknown> = {}
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query }, abortSignal: () => query,
      update: (value: unknown) => { writing = true; mocks.write(value); return query },
      maybeSingle: () => writing ? mocks.result(filters) : mocks.read() }
    return query
  }, channel: () => ({ on: mocks.on }), removeChannel: vi.fn(),
} }))
const access = { userId: 'local', userName: 'mateo' as const, coupleId: 'background-recovery', stateId: 'sema' }
const row = (state: unknown, updated_at = '2026-10-01T00:00:00Z') => ({ data: { state, updated_at } })
const original = { id: 'a', title: 'Original', notes: 'Base notes' }
beforeEach(() => {
  vi.useFakeTimers(); invalidateAuth(); clearActiveCouple(); localStorage.clear()
  mocks.read.mockReset(); mocks.write.mockReset()
  mocks.result.mockReset().mockResolvedValue({ data: { updated_at: '2026-10-14T00:00:00Z' } })
  mocks.on.mockReset().mockReturnValue({ subscribe: vi.fn() })
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})
afterEach(() => { vi.restoreAllMocks(); invalidateAuth(); clearActiveCouple(); vi.useRealTimers() })
async function start() {
  await loadCoupleCache(access)
  const context = establishAuth(access, getAuthGeneration())!
  const hook = renderHook(() => { useSupabaseSync(context); return useSyncConflicts() })
  await act(async () => {})
  return hook
}
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(800) }) }
const realtime = () => { (mocks.on.mock.calls[0][2] as () => void)() }
async function conflict() {
  mocks.read.mockResolvedValue(row({ todos: [original], monthlyIncome: 100 }))
  const hook = await start()
  act(() => useAppStore.setState({ todos: [{ ...original, title: 'Local' }] as never }))
  mocks.read.mockResolvedValue(row({ todos: [{ ...original, title: 'Remote' }], monthlyIncome: 100 }, '2026-10-02T00:00:00Z'))
  await flush()
  return hook
}

it.each(['local', 'remote'] as const)('resolves a background conflict using %s and retains both versions across reload', async choice => {
  const hook = await conflict()
  expect(hook.result.current.groups[0]).toMatchObject({ title: 'Local', fields: ['title'] })
  expect(mocks.write).not.toHaveBeenCalled()
  await act(async () => { await resolveBackgroundConflict(hook.result.current.groups[0], choice) })
  expect(useAppStore.getState().todos[0].title).toBe(choice === 'local' ? 'Local' : 'Remote')
  expect(hook.result.current.groups).toEqual([])
  expect(pendingKeys(access).has('todos')).toBe(choice === 'local')
  const saved = readSyncArchives(access).find(archive => archive.choice === choice)!
  expect(saved.group.members[0]).toMatchObject({ local: { title: 'Local' }, remote: { title: 'Remote' } })
  hook.unmount(); invalidateAuth(); clearActiveCouple()
  await loadCoupleCache(access)
  expect(useAppStore.getState().todos[0].title).toBe(choice === 'local' ? 'Local' : 'Remote')
  expect(readSyncArchives(access)).toContainEqual(saved)
})

it('recovers unresolved versions after restart while offline, then safely sends the chosen local version', async () => {
  const first = await conflict()
  first.unmount(); invalidateAuth(); clearActiveCouple()
  mocks.read.mockResolvedValue({ data: null, error: { message: 'Offline' } })
  const next = await start()
  expect(useAppStore.getState().todos[0].title).toBe('Local')
  expect(next.result.current.groups[0].members[0].remote).toMatchObject({ title: 'Remote' })
  await act(async () => { await resolveBackgroundConflict(next.result.current.groups[0], 'local') })
  expect(next.result.current.message).toContain('Could not verify')
  expect(pendingKeys(access).has('todos')).toBe(true)
  mocks.read.mockResolvedValue(row({ todos: [{ ...original, title: 'Remote' }], monthlyIncome: 100 }, '2026-10-02T00:00:00Z'))
  await act(async () => { await resolveBackgroundConflict(next.result.current.groups[0], 'local') })
  await act(async () => { triggerPull() }); await flush()
  expect(mocks.write.mock.lastCall?.[0].state.todos[0].title).toBe('Local')
  expect(pendingKeys(access).has('todos')).toBe(false)
  next.unmount()
})

it.each(['local', 'remote'] as const)('rejects a stale choice if the %s version changes during verification', async side => {
  const hook = await conflict(), reviewed = hook.result.current.groups[0]
  let complete!: (value: unknown) => void
  mocks.read.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  act(() => { void resolveBackgroundConflict(reviewed, 'local') })
  if (side === 'local') act(() => useAppStore.setState({ todos: [{ ...original, title: 'New local' }] as never }))
  await act(async () => { complete(row({ todos: [{ ...original, title: side === 'remote' ? 'New remote' : 'Remote' }], monthlyIncome: 100 })) })
  expect(hook.result.current.message).toContain('Review the updated versions')
  expect(mocks.write).not.toHaveBeenCalled()
  expect(readSyncArchives(access).filter(archive => archive.choice === 'unresolved')).toHaveLength(2)
  hook.unmount()
})

it('does not apply or acknowledge a remote choice if storage cannot retain recovery history', async () => {
  const hook = await conflict()
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
  await act(async () => { await resolveBackgroundConflict(hook.result.current.groups[0], 'remote') })
  expect(useAppStore.getState().todos[0].title).toBe('Local')
  expect(hook.result.current.groups).toHaveLength(1)
  expect(pendingKeys(access).has('todos')).toBe(true)
  expect(getCacheStorageWarning()).toContain('Closing the tab may lose edits')
  expect(mocks.write).not.toHaveBeenCalled()
  storage.mockRestore()
  await act(async () => { await resolveBackgroundConflict(hook.result.current.groups[0], 'remote') })
  expect(useAppStore.getState().todos[0].title).toBe('Remote')
  hook.unmount()
})

it('does not reuse a resolution if another partner write wins before the conditional save', async () => {
  const hook = await conflict()
  await act(async () => { await resolveBackgroundConflict(hook.result.current.groups[0], 'local') })
  mocks.result.mockImplementationOnce(() => {
    mocks.read.mockResolvedValue(row({ todos: [{ ...original, title: 'Third version' }], monthlyIncome: 100 }, '2026-10-03T00:00:00Z'))
    return Promise.resolve({ data: null })
  })
  await flush()
  expect(mocks.write).toHaveBeenCalledTimes(1)
  expect(hook.result.current.groups[0].members[0]).toMatchObject({ local: { title: 'Local' }, remote: { title: 'Third version' } })
  expect(pendingKeys(access).has('todos')).toBe(true)
  hook.unmount()
})

it('resolves one record without discarding independent local edits or partner additions', async () => {
  const hook = await conflict()
  act(() => useAppStore.setState({ todos: [...useAppStore.getState().todos, { id: 'local-new', title: 'Local addition' }] as never }))
  mocks.read.mockResolvedValue(row({ todos: [{ ...original, title: 'Remote' }, { id: 'remote-new', title: 'Remote addition' }], monthlyIncome: 100 }))
  await act(async () => { await resolveBackgroundConflict(hook.result.current.groups[0], 'remote') })
  expect(useAppStore.getState().todos.map(todo => todo.title)).toEqual(['Remote', 'Remote addition', 'Local addition'])
  expect(pendingKeys(access).has('todos')).toBe(true)
  await flush()
  expect(mocks.write.mock.lastCall?.[0].state.todos).toHaveLength(3)
  hook.unmount()
})

it('advances the baseline for accepted partner additions before a subsequent partner edit', async () => {
  const hook = await conflict()
  mocks.read.mockResolvedValue(row({ todos: [{ ...original, title: 'Remote' }, { id: 'remote-new', title: 'Added' }], monthlyIncome: 100 }))
  await act(async () => { await resolveBackgroundConflict(hook.result.current.groups[0], 'local') })
  mocks.read.mockResolvedValue(row({ todos: [{ ...original, title: 'Remote' }, { id: 'remote-new', title: 'Added then edited' }], monthlyIncome: 100 }, '2026-10-03'))
  await flush()
  expect(hook.result.current.groups).toEqual([])
  expect(mocks.write.mock.lastCall?.[0].state.todos.map((todo: { title: string }) => todo.title)).toEqual(['Local', 'Added then edited'])
  hook.unmount()
})

it.each(['local', 'remote'] as const)('keeps a Calendar/To-Do deletion consistent when choosing %s', async choice => {
  const todo = { ...original, linkedEventId: 'e' }, event = { ...original, id: 'e', linkedTodoId: 'a' }
  mocks.read.mockResolvedValue(row({ todos: [todo], events: [event] }))
  const hook = await start()
  act(() => useAppStore.getState().deleteTodo('a'))
  mocks.read.mockResolvedValue(row({ todos: [todo], events: [{ ...event, notes: 'Partner' }] }, '2026-10-02'))
  await flush()
  expect(mocks.write).not.toHaveBeenCalled()
  expect([...pendingKeys(access)].sort()).toEqual(['events', 'todos'])
  await act(async () => { await resolveBackgroundConflict(hook.result.current.groups[0], choice) })
  expect(useAppStore.getState().todos).toHaveLength(choice === 'local' ? 0 : 1)
  expect(useAppStore.getState().events).toHaveLength(choice === 'local' ? 0 : 1)
  if (choice === 'local') {
    await flush()
    expect(mocks.write.mock.lastCall?.[0].state).toMatchObject({ todos: [], events: [] })
  } else expect(mocks.write).not.toHaveBeenCalled()
  hook.unmount()
})

it('queues and coalesces Realtime signals during a pull, then replays another signal during the replay', async () => {
  mocks.read.mockResolvedValue(row({ monthlyIncome: 100 }))
  const hook = await start()
  let first!: (value: unknown) => void, second!: (value: unknown) => void
  mocks.read.mockImplementationOnce(() => new Promise(resolve => { first = resolve }))
    .mockImplementationOnce(() => new Promise(resolve => { second = resolve }))
    .mockResolvedValue(row({ monthlyIncome: 300 }, '2026-10-03'))
  const count = mocks.read.mock.calls.length
  act(() => { triggerPull(); realtime(); realtime() })
  expect(mocks.read).toHaveBeenCalledTimes(count + 1)
  await act(async () => { first(row({ monthlyIncome: 200 }, '2026-10-02')); await vi.advanceTimersByTimeAsync(1) })
  expect(mocks.read).toHaveBeenCalledTimes(count + 2)
  act(realtime)
  await act(async () => { second(row({ monthlyIncome: 250 }, '2026-10-02T12:00:00Z')); await vi.advanceTimersByTimeAsync(1) })
  expect(mocks.read).toHaveBeenCalledTimes(count + 3)
  expect(useAppStore.getState().monthlyIncome).toBe(300)
  hook.unmount()
})

it('replays signals received during an active save and retains an edit made during that save', async () => {
  mocks.read.mockResolvedValue(row({ monthlyIncome: 100, todos: [] }))
  const hook = await start()
  let complete!: (value: unknown) => void
  mocks.result.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  act(() => useAppStore.setState({ monthlyIncome: 200 }))
  await flush()
  act(() => { useAppStore.setState({ monthlyIncome: 250 }); realtime(); realtime() })
  mocks.read.mockResolvedValue(row({ monthlyIncome: 200, todos: [{ id: 'partner', title: 'Partner addition' }] }, '2026-10-02'))
  await act(async () => { complete({ data: { updated_at: '2026-10-02' } }); await vi.advanceTimersByTimeAsync(1) })
  expect(useAppStore.getState().monthlyIncome).toBe(250)
  expect(useAppStore.getState().todos[0].id).toBe('partner')
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
  await flush()
  expect(mocks.write.mock.lastCall?.[0].state.monthlyIncome).toBe(250)
  hook.unmount()
})

it('keeps polling as a fallback when Realtime is silent, while hidden tabs stay quiet', async () => {
  mocks.read.mockResolvedValue(row({ monthlyIncome: 100 }))
  const hook = await start(), count = mocks.read.mock.calls.length
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000) })
  expect(mocks.read).toHaveBeenCalledTimes(count)
  mocks.read.mockResolvedValue(row({ monthlyIncome: 200 }, '2026-10-02'))
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000) })
  expect(useAppStore.getState().monthlyIncome).toBe(200)
  hook.unmount()
})

it('cancels queued refresh and resolution on logout without exposing another account to versions', async () => {
  const hook = await conflict()
  let complete!: (value: unknown) => void
  mocks.read.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  act(() => { void resolveBackgroundConflict(hook.result.current.groups[0], 'remote'); realtime() })
  act(() => { invalidateAuth(); clearActiveCouple() })
  await act(async () => { complete(row({ todos: [{ ...original, title: 'Remote' }] })); await vi.advanceTimersByTimeAsync(1) })
  expect(hook.result.current.groups).toEqual([])
  expect(hook.result.current.archives).toEqual([])
  expect(useAppStore.getState().todos).toEqual([])
  expect(pendingKeys(access).has('todos')).toBe(true)
  expect(mocks.write).not.toHaveBeenCalled()
  hook.unmount()
})

it('synchronizes independent records in a conflicted collection, retaining only unresolved work across restart', async () => {
  const hook = await conflict()
  const addition = { id: 'new-local', title: 'Independent addition' }
  act(() => useAppStore.setState({ todos: [...useAppStore.getState().todos, addition] as never }))
  const partner = { id: 'partner', title: 'Partner addition' }
  mocks.read.mockResolvedValue(row({ todos: [{ ...original, title: 'Remote' }, partner], monthlyIncome: 100 }, '2026-10-03'))
  await flush()
  expect(mocks.write).toHaveBeenCalledTimes(1)
  const sent = mocks.write.mock.lastCall![0].state
  expect(sent.todos).toEqual([{ ...original, title: 'Remote' }, partner, addition])
  expect(mocks.result.mock.lastCall![0]).toMatchObject({ id: 'sema', couple_id: access.coupleId, updated_at: '2026-10-03' })
  expect(useAppStore.getState().todos).toEqual([{ ...original, title: 'Local' }, partner, addition])
  expect(pendingKeys(access).has('todos')).toBe(true)
  hook.unmount(); invalidateAuth(); clearActiveCouple()
  const editedPartner = { ...partner, title: 'Partner edited later' }
  mocks.read.mockResolvedValue(row({ ...sent, todos: [{ ...original, title: 'Remote' }, editedPartner, addition] }, '2026-10-04'))
  const restored = await start()
  await flush()
  expect(mocks.write).toHaveBeenCalledTimes(1)
  expect(useAppStore.getState().todos).toEqual([{ ...original, title: 'Local' }, editedPartner, addition])
  expect(restored.result.current.groups).toHaveLength(1)
  expect(restored.result.current.groups[0].members[0].recordId).toBe('a')
  restored.unmount()
})

it('sends one explicitly resolved record while a second conflict in that collection stays pending', async () => {
  const b = { ...original, id: 'b' }
  mocks.read.mockResolvedValue(row({ todos: [original, b] }))
  const hook = await start()
  act(() => useAppStore.setState({ todos: [{ ...original, title: 'Local a' }, { ...b, title: 'Local b' }] as never }))
  mocks.read.mockResolvedValue(row({ todos: [{ ...original, title: 'Remote a' }, { ...b, title: 'Remote b' }] }, '2026-10-02'))
  await flush()
  const reviewed = hook.result.current.groups.find(group => group.members[0].recordId === 'a')!
  await act(async () => { await resolveBackgroundConflict(reviewed, 'local') })
  await flush()
  expect(mocks.write).toHaveBeenCalledTimes(1)
  expect(mocks.write.mock.lastCall![0].state.todos.map((todo: { title: string }) => todo.title)).toEqual(['Local a', 'Remote b'])
  expect(useAppStore.getState().todos.map(todo => todo.title)).toEqual(['Local a', 'Local b'])
  expect(hook.result.current.groups).toHaveLength(1)
  expect(hook.result.current.groups[0].members[0].recordId).toBe('b')
  expect(pendingKeys(access).has('todos')).toBe(true)
  hook.unmount()
})

it('reviews legacy records individually without uploading ambiguous local-only work or removing newer server records', async () => {
  const unique = { id: 'unique', title: 'Potentially unique laptop work' }
  const ambiguous = { id: 'ambiguous', title: 'Could have been deleted remotely' }
  const remoteOnly = { id: 'server-new', title: 'Newer shared work' }
  const legacy = JSON.stringify({ state: { todos: [{ ...original, title: 'Stale laptop' }, unique, ambiguous] }, version: 0 })
  localStorage.setItem('semacalendar-v1', legacy)
  const remote = { todos: [{ ...original, title: 'Newer server' }, remoteOnly] }
  mocks.read.mockResolvedValue(row(remote))
  const hook = await start(); await flush()
  expect(mocks.write).not.toHaveBeenCalled()
  expect(hook.result.current.groups).toHaveLength(3)
  expect(hook.result.current.groups.every(group => group.members.every(member => member.recordId !== undefined))).toBe(true)
  expect(useAppStore.getState().todos).toContainEqual(remoteOnly)
  const stale = hook.result.current.groups.find(group => group.members[0].recordId === 'a')!
  await act(async () => { await resolveBackgroundConflict(stale, 'remote') })
  expect(readSyncUnbased(access).todos?.sort()).toEqual(['ambiguous', 'unique'])
  hook.unmount(); invalidateAuth(); clearActiveCouple()
  const restored = await start(); await flush()
  expect(mocks.write).not.toHaveBeenCalled()
  expect(restored.result.current.groups).toHaveLength(2)
  expect(useAppStore.getState().todos).toEqual([...remote.todos, unique, ambiguous])
  const reviewed = restored.result.current.groups.find(group => group.members[0].recordId === 'unique')!
  await act(async () => { await resolveBackgroundConflict(reviewed, 'local') })
  await flush()
  expect(mocks.write).toHaveBeenCalledTimes(1)
  expect(mocks.write.mock.lastCall![0].state.todos).toEqual([...remote.todos, unique])
  expect(useAppStore.getState().todos).toContainEqual(ambiguous)
  expect(restored.result.current.groups).toHaveLength(1)
  expect(pendingKeys(access).has('todos')).toBe(true)
  expect(localStorage.getItem('semacalendar-v1')).toBe(legacy)
  expect(readSyncArchives(access).find(archive => archive.choice === 'remote')!.group.members[0].local).toMatchObject({ title: 'Stale laptop' })
  restored.unmount()
})

it('saves an independent linked pair while a different linked deletion remains unresolved', async () => {
  const g = { ...original, linkedEventId: 'e' }, e = { ...original, id: 'e', linkedGoalId: 'a' }
  const otherGoal = { ...original, id: 'g2', linkedEventId: 'e2' }, otherEvent = { ...e, id: 'e2', linkedGoalId: 'g2' }
  mocks.read.mockResolvedValue(row({ goals: [g, otherGoal], events: [e, otherEvent] }))
  const hook = await start()
  act(() => { useAppStore.getState().deleteGoal('a'); useAppStore.getState().updateGoal('g2', { title: 'Independent linked edit' }) })
  mocks.read.mockResolvedValue(row({ goals: [g, otherGoal], events: [{ ...e, notes: 'Partner edit' }, otherEvent] }, '2026-10-02'))
  await flush()
  expect(mocks.write).toHaveBeenCalledTimes(1)
  expect(mocks.write.mock.lastCall![0].state).toMatchObject({
    goals: [g, { ...otherGoal, title: 'Independent linked edit' }],
    events: [{ ...e, notes: 'Partner edit' }, { ...otherEvent, title: 'Independent linked edit' }],
  })
  expect(useAppStore.getState().goals.map(goal => goal.id)).toEqual(['g2'])
  expect(useAppStore.getState().events.map(event => event.id)).toEqual(['e2'])
  expect([...pendingKeys(access)].sort()).toEqual(['events', 'goals'])
  expect(hook.result.current.groups).toHaveLength(1)
  hook.unmount()
})

it('retains a same-collection edit made during a partial save without acknowledging the unresolved record', async () => {
  const hook = await conflict()
  const addition = { id: 'new', title: 'First local value' }
  act(() => useAppStore.setState({ todos: [...useAppStore.getState().todos, addition] as never }))
  let complete!: (value: unknown) => void
  mocks.result.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  await flush()
  act(() => useAppStore.setState({ todos: [{ ...original, title: 'Local' }, { ...addition, title: 'Changed in flight' }] as never }))
  const server = mocks.write.mock.lastCall![0].state
  mocks.read.mockResolvedValue(row(server, '2026-10-03'))
  await act(async () => { complete({ data: { updated_at: '2026-10-03' } }) })
  expect(useAppStore.getState().todos.map(todo => todo.title)).toEqual(['Local', 'Changed in flight'])
  await flush()
  expect(mocks.write.mock.lastCall![0].state.todos.map((todo: { title: string }) => todo.title)).toEqual(['Remote', 'Changed in flight'])
  expect(hook.result.current.groups).toHaveLength(1)
  expect(pendingKeys(access).has('todos')).toBe(true)
  hook.unmount()
})

it('holds work hidden behind an empty legacy marker without trusting its inconsistent separate baseline', async () => {
  const root = `semacalendar-v2:${access.coupleId}:${access.stateId}`
  const unique = { id: 'unique', title: 'Unsent laptop record' }
  localStorage.setItem(root, JSON.stringify({ state: { todos: [original, unique], monthlyIncome: 100 }, version: 0 }))
  localStorage.setItem(root + ':base', JSON.stringify({ todos: [original], monthlyIncome: 100 }))
  localStorage.setItem(root + ':pending', '[]')
  mocks.read.mockResolvedValue(row({ todos: [{ ...original, title: 'Newer partner title' }], monthlyIncome: 200 }))
  const hook = await start()
  expect(useAppStore.getState().monthlyIncome).toBe(200)
  expect(useAppStore.getState().todos).toEqual([original, unique])
  await flush()
  expect(mocks.write).not.toHaveBeenCalled()
  expect(pendingKeys(access).has('todos')).toBe(true)
  expect(hook.result.current.groups).toHaveLength(2)
  expect(hook.result.current.groups.find(group => group.members[0].recordId === 'a')!.members[0].remote)
    .toMatchObject({ title: 'Newer partner title' })
  hook.unmount()
})

it('holds falsely clean scoped records without a baseline while still importing newer server additions', async () => {
  const root = `semacalendar-v2:${access.coupleId}:${access.stateId}`
  const unique = { id: 'unique', title: 'Potentially unsent laptop record' }
  localStorage.setItem(root, JSON.stringify({ state: { todos: [unique] }, version: 0 }))
  localStorage.setItem(root + ':pending', '[]')
  const server = { id: 'server', title: 'Newer shared record' }
  mocks.read.mockResolvedValue(row({ todos: [server] }))
  const hook = await start(); await flush()
  expect(mocks.write).not.toHaveBeenCalled()
  expect(useAppStore.getState().todos).toEqual([server, unique])
  expect(hook.result.current.groups[0].members[0]).toMatchObject({ recordId: 'unique', local: unique })
  expect(pendingKeys(access).has('todos')).toBe(true)
  hook.unmount(); invalidateAuth(); clearActiveCouple()
  await loadCoupleCache(access)
  expect(useAppStore.getState().todos).toEqual([server, unique])
})

it('does not resurrect a server deletion from an inconsistent clean legacy cache when an unrelated edit synchronizes', async () => {
  const root = `semacalendar-v2:${access.coupleId}:${access.stateId}`
  const stale = { id: 'already-deleted', title: 'Old cache copy or unique local work' }
  localStorage.setItem(root, JSON.stringify({ state: { todos: [stale], monthlyIncome: 100 }, version: 0 }))
  localStorage.setItem(root + ':base', JSON.stringify({ todos: [], monthlyIncome: 100 }))
  localStorage.setItem(root + ':pending', '[]')
  mocks.read.mockResolvedValue(row({ todos: [], monthlyIncome: 200 }))
  const hook = await start()
  act(() => useAppStore.setState({ monthlyIncome: 300 }))
  await flush()
  expect(mocks.write).toHaveBeenCalledTimes(1)
  expect(mocks.write.mock.lastCall![0].state).toMatchObject({ todos: [], monthlyIncome: 300 })
  expect(useAppStore.getState().todos).toEqual([stale])
  expect(pendingKeys(access).has('todos')).toBe(true)
  expect(hook.result.current.groups[0].members[0]).toMatchObject({ recordId: stale.id, local: stale })
  hook.unmount()
})

it.each([1, 2, 3, 4, 5, 6].flatMap(stop => [{ stop, restart: false }, { stop, restart: true }]))(
  'does not trust the legacy baseline after interrupted startup write $stop (restart=$restart)', async ({ stop, restart }) => {
  const root = `semacalendar-v2:${access.coupleId}:${access.stateId}`
  const stale = { id: 'already-deleted', title: 'Ambiguous original laptop record' }
  localStorage.setItem(root, JSON.stringify({ state: { todos: [stale], monthlyIncome: 100 }, version: 0 }))
  localStorage.setItem(root + ':base', JSON.stringify({ todos: [], monthlyIncome: 100 }))
  localStorage.setItem(root + ':pending', '[]')
  const originalWrite = Storage.prototype.setItem
  let writes = 0
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (++writes === stop) throw new DOMException('Interrupted startup', 'QuotaExceededError')
    originalWrite.call(this, key, value)
  })
  try { await loadCoupleCache(access) } finally { storage.mockRestore() }
  if (restart) { invalidateAuth(); clearActiveCouple() }
  mocks.read.mockResolvedValue(row({ todos: [], monthlyIncome: 100 }))
  const context = restart ? null : establishAuth(access, getAuthGeneration())!
  const hook = restart ? await start() : renderHook(() => { useSupabaseSync(context); return useSyncConflicts() })
  await act(async () => {}); await flush()
  expect(mocks.write).not.toHaveBeenCalled()
  expect(useAppStore.getState().todos).toEqual([stale])
  expect(hook.result.current.groups[0].members[0]).toMatchObject({ recordId: stale.id, local: stale })
  expect(pendingKeys(access).has('todos')).toBe(true)
  hook.unmount()
})
