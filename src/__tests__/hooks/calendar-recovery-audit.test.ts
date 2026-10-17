import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useSupabaseSync, useSyncConflicts, triggerPull } from '@/hooks/useSupabaseSync'
import { clearActiveCouple, loadCoupleCache, useAppStore } from '@/store/useAppStore'
import { establishAuth, getAuthGeneration, invalidateAuth } from '@/lib/auth-session'
import { getCacheStorageWarning, pendingKeys } from '@/lib/couple-cache'
import type { CalendarEvent, EventTodo, UserName } from '@/types'

// Entire gateway and transport are mocked; synthetic jsdom storage only.
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), result: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: () => {
    let payload: { state: Record<string, unknown>; updated_at: string } | undefined
    const filters: Record<string, unknown> = {}
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query },
      abortSignal: () => query,
      update: (value: typeof payload) => { payload = value; mocks.write(value); return query },
      maybeSingle: () => payload ? mocks.result(filters, payload) : mocks.read() }
    return query
  }, channel: () => ({ on: () => ({ subscribe: vi.fn() }) }), removeChannel: vi.fn(),
} }))

const household = 'calendar-audit-synthetic'
const root = `semacalendar-v2:${household}:sema`
const access = (userName: UserName = 'mateo') => ({ userId: `synthetic-${userName}`, userName, coupleId: household, stateId: 'sema' })
const stamp = '2026-10-01T00:00:00.000Z'
const event = (id: string, createdBy: UserName = 'mateo'): CalendarEvent => ({
  id, title: `Synthetic ${id}`, date: '2027-06-01', color: 'blue', createdBy, createdAt: stamp, updatedAt: stamp,
})
let server: Record<string, unknown>, version: string
const network = vi.fn(() => { throw new Error('Network is prohibited in this offline audit') })
beforeEach(() => {
  vi.useFakeTimers(); invalidateAuth(); clearActiveCouple(); localStorage.clear()
  vi.stubGlobal('fetch', network); vi.stubGlobal('WebSocket', network); vi.stubGlobal('XMLHttpRequest', network); network.mockClear()
  server = { events: [], goals: [], todos: [], partnerNotes: [], loveNotes: [], shoppingLists: [],
    monthlyIncome: 100, unknownServerField: { keep: 'synthetic sentinel' } }
  version = stamp
  mocks.read.mockReset().mockImplementation(async () => ({ data: { state: structuredClone(server), updated_at: version } }))
  mocks.write.mockReset()
  mocks.result.mockReset().mockImplementation(async (filters, payload) => {
    expect(filters).toMatchObject({ id: 'sema', couple_id: household })
    if (filters.updated_at !== version) return { data: null, error: null }
    server = structuredClone(payload.state); version = payload.updated_at
    return { data: { updated_at: version }, error: null }
  })
})
afterEach(() => {
  expect(network).not.toHaveBeenCalled()
  vi.restoreAllMocks(); invalidateAuth(); clearActiveCouple(); vi.unstubAllGlobals(); vi.useRealTimers()
})
async function start(userName: UserName = 'mateo') {
  const identity = access(userName)
  await loadCoupleCache(identity)
  const context = establishAuth(identity, getAuthGeneration())!
  const hook = renderHook(() => { useSupabaseSync(context); return useSyncConflicts() })
  await act(async () => {})
  return hook
}
async function flush() { await act(async () => { await vi.advanceTimersByTimeAsync(800) }) }
function create(userName: UserName = 'mateo') {
  let id = ''
  act(() => { id = useAppStore.getState().addEvent({ title: 'Synthetic offline event', date: '2027-06-01', color: 'blue', createdBy: userName }) })
  return id
}
function partnerChange(patch: Record<string, unknown>) {
  server = { ...server, ...structuredClone(patch) }
  version = new Date(Date.parse(version) + 1_000).toISOString()
}

it.each(['mateo', 'seval'] as const)('retries a simultaneous partner event creation for %s without losing either event', async userName => {
  const hook = await start(userName)
  const localId = create(userName), other = event('partner-addition', userName === 'mateo' ? 'seval' : 'mateo')
  mocks.result.mockImplementationOnce(async filters => {
    expect(filters.updated_at).toBe(stamp)
    partnerChange({ events: [other] })
    return { data: null, error: null }
  })
  await flush()
  expect(mocks.write).toHaveBeenCalledTimes(2)
  expect((server.events as CalendarEvent[]).map(entry => entry.id)).toEqual([other.id, localId])
  expect(useAppStore.getState().events).toEqual(server.events)
  expect(server.unknownServerField).toEqual({ keep: 'synthetic sentinel' })
  expect(pendingKeys(access(userName)).size).toBe(0)
  expect(mocks.result.mock.calls[0][0].updated_at).not.toBe(mocks.result.mock.calls[1][0].updated_at)
  hook.unmount()
})

it.each(['mateo', 'seval'] as const)('merges a Calendar checklist rename with partner completion for %s and persists both linked copies', async userName => {
  const items: EventTodo[] = [{ id: 'pack', title: 'Pack', isCompleted: false }]
  const sharedEvent = { ...event('trip'), linkedGoalId: 'dream', todos: items }
  const goal = { id: 'dream', title: sharedEvent.title, categoryId: 'life', progressCurrent: 0, progressTarget: 0,
    isCompleted: false, targetDate: sharedEvent.date, linkedEventId: sharedEvent.id, createdBy: 'mateo', createdAt: stamp,
    checklistItems: items, checklist: ['Pack'] }
  server = { ...server, events: [sharedEvent], goals: [goal] }
  const hook = await start(userName)
  act(() => useAppStore.getState().updateEvent(sharedEvent.id, { todos: [{ ...items[0], title: 'Pack early' }] }))
  const partner = [{ ...items[0], isCompleted: true }]
  partnerChange({ events: [{ ...sharedEvent, todos: partner }], goals: [{ ...goal, checklistItems: partner }] })
  await flush()
  const expected = [{ ...items[0], title: 'Pack early', isCompleted: true }]
  expect((server.events as CalendarEvent[])[0].todos).toEqual(expected)
  expect((server.goals as { checklistItems: EventTodo[]; checklist: string[] }[])[0]).toMatchObject({ checklistItems: expected, checklist: ['Pack early'] })
  expect(useAppStore.getState().events[0].todos).toEqual(expected)
  expect(pendingKeys(access(userName)).size).toBe(0)
  hook.unmount()
})

it('holds one conflicted Calendar record while sending an independent event and receiving a partner addition across restart', async () => {
  const original = event('conflicting-event')
  server = { ...server, events: [original] }
  const hook = await start()
  act(() => useAppStore.getState().updateEvent(original.id, { title: 'My retained version' }))
  const independentId = create(), partner = event('partner-only', 'seval')
  partnerChange({ events: [{ ...original, title: 'Partner retained version' }, partner] })
  await flush()
  expect((server.events as CalendarEvent[]).map(entry => entry.id)).toEqual([original.id, partner.id, independentId])
  expect((server.events as CalendarEvent[])[0].title).toBe('Partner retained version')
  expect(useAppStore.getState().events[0].title).toBe('My retained version')
  expect(hook.result.current.groups).toHaveLength(1)
  expect(pendingKeys(access()).has('events')).toBe(true)
  expect(mocks.write).toHaveBeenCalledTimes(1)
  hook.unmount(); invalidateAuth(); clearActiveCouple()
  const restarted = await start()
  await flush()
  expect(useAppStore.getState().events.map(entry => entry.id)).toEqual([original.id, partner.id, independentId])
  expect(useAppStore.getState().events[0].title).toBe('My retained version')
  expect(restarted.result.current.groups[0].members[0]).toMatchObject({
    recordId: original.id, local: { title: 'My retained version' }, remote: { title: 'Partner retained version' },
  })
  expect(mocks.write).toHaveBeenCalledTimes(1)
  restarted.unmount()
})

it.each(['legacy-v1', 'scoped-no-base', 'scoped-unmarked-mismatch'] as const)(
  'preserves unsent Calendar checklists and notes for review when startup has %s', async source => {
    const checklist: EventTodo[] = [{ id: 'unique-check', title: 'Private synthetic checklist', isCompleted: true }]
    const localEvent = { ...event('ambiguous-local-only'), todos: checklist }
    const note = { id: 'unique-note', text: 'Synthetic offline note' }
    const raw = JSON.stringify({ state: { events: [localEvent], partnerNotes: [note] }, version: 0 })
    localStorage.setItem(source === 'legacy-v1' ? 'semacalendar-v1' : root, raw)
    if (source !== 'legacy-v1') localStorage.setItem(root + ':pending', '[]')
    if (source === 'scoped-unmarked-mismatch') localStorage.setItem(root + ':base', JSON.stringify({ events: [], partnerNotes: [] }))
    const theirs = event('partner-new', 'seval')
    server = { ...server, events: [theirs] }
    const hook = await start()
    await flush()
    expect(mocks.write).not.toHaveBeenCalled()
    expect(useAppStore.getState().events).toEqual(expect.arrayContaining([localEvent, theirs]))
    expect(useAppStore.getState().partnerNotes).toEqual([note])
    expect(hook.result.current.groups.flatMap(group => group.members.map(member => member.recordId)))
      .toEqual(expect.arrayContaining([localEvent.id, note.id]))
    expect(pendingKeys(access())).toEqual(new Set(['events', 'partnerNotes']))
    expect(server.events).toEqual([theirs])
    if (source === 'legacy-v1') expect(localStorage.getItem('semacalendar-v1')).toBe(raw)
    hook.unmount()
    const restarted = await start()
    await flush()
    expect(mocks.write).not.toHaveBeenCalled()
    expect(useAppStore.getState().events.find(entry => entry.id === localEvent.id)?.todos).toEqual(checklist)
    expect(useAppStore.getState().partnerNotes).toEqual([note])
    restarted.unmount()
  })

it.each([1, 2, 3, 4, 5, 6])('recovers the Calendar event after acknowledgement checkpoint interruption at write %s', async stop => {
  const hook = await start()
  const id = create()
  const realSet = Storage.prototype.setItem
  let failure: { mockRestore(): void } | undefined
  mocks.result.mockImplementationOnce(async (filters, payload) => {
    expect(filters.updated_at).toBe(version)
    server = structuredClone(payload.state); version = payload.updated_at
    let writes = 0
    failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (++writes >= stop) throw new DOMException('Synthetic checkpoint interruption', 'QuotaExceededError')
      realSet.call(this, key, value)
    })
    return { data: { updated_at: version }, error: null }
  })
  try {
    await flush()
    expect(mocks.write).toHaveBeenCalledTimes(1)
    expect(pendingKeys(access()).has('events')).toBe(true)
    expect(getCacheStorageWarning()).not.toBeNull()
    expect((server.events as CalendarEvent[]).filter(entry => entry.id === id)).toHaveLength(1)
  } finally { failure?.mockRestore() }
  hook.unmount(); invalidateAuth(); clearActiveCouple()
  const restarted = await start()
  await flush()
  expect(useAppStore.getState().events.filter(entry => entry.id === id)).toHaveLength(1)
  expect((server.events as CalendarEvent[]).filter(entry => entry.id === id)).toHaveLength(1)
  expect(pendingKeys(access()).size).toBe(0)
  expect(mocks.write).toHaveBeenCalledTimes(1)
  restarted.unmount()
})

it('reconciles an already-committed event after a lost response without a duplicate write on restart', async () => {
  const hook = await start(), id = create()
  mocks.result.mockImplementationOnce(async (_filters, payload) => {
    server = structuredClone(payload.state); version = payload.updated_at
    return { data: null, error: { message: 'Synthetic lost acknowledgement' } }
  })
  await flush()
  expect(pendingKeys(access()).has('events')).toBe(true)
  hook.unmount(); invalidateAuth(); clearActiveCouple()
  const restarted = await start()
  await flush()
  expect(useAppStore.getState().events.map(entry => entry.id)).toEqual([id])
  expect(pendingKeys(access()).size).toBe(0)
  expect(mocks.write).toHaveBeenCalledTimes(1)
  restarted.unmount()
})

it('warns that a completely failed first persistence leaves an event in memory, blocks sending, then recovers in the same tab', async () => {
  const hook = await start()
  const failed = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Synthetic full storage', 'QuotaExceededError')
  })
  const id = create()
  await flush()
  expect(useAppStore.getState().events.map(entry => entry.id)).toEqual([id])
  expect(mocks.write).not.toHaveBeenCalled()
  expect(getCacheStorageWarning()).toContain('Closing the tab may lose edits')
  expect(localStorage.getItem(root)).not.toContain(id)
  failed.mockRestore()
  await act(async () => { triggerPull() }); await flush()
  expect((server.events as CalendarEvent[]).map(entry => entry.id)).toEqual([id])
  expect(pendingKeys(access()).size).toBe(0)
  expect(getCacheStorageWarning()).toBeNull()
  hook.unmount()
})
