import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { useSupabaseSync, useSyncStatus, triggerPull } from '@/hooks/useSupabaseSync'
import { loadCoupleCache, clearActiveCouple, useAppStore } from '@/store/useAppStore'
import { establishAuth, getAuthGeneration, invalidateAuth } from '@/lib/auth-session'
import { pendingKeys } from '@/lib/durable-cache'
import { getCacheStorageWarning } from '@/lib/couple-cache'
import * as backend from '@/lib/indexed-checkpoint'
import type { CalendarEvent } from '@/types'

// Unlike the legacy fault-injection suites, this mounts the production adapter.
vi.unmock('@/lib/durable-cache')
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), result: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: () => {
    let payload: { state: Record<string, unknown>; updated_at: string } | undefined
    const filters: Record<string, unknown> = {}
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query },
      abortSignal: () => query, update: (value: typeof payload) => { payload = value; mocks.write(value); return query },
      maybeSingle: () => payload ? mocks.result(filters, payload) : mocks.read() }
    return query
  }, channel: () => ({ on: () => ({ subscribe: vi.fn() }) }), removeChannel: vi.fn(),
} }))
const access = { userId: 'synthetic-idb-user', userName: 'mateo' as const, coupleId: 'idb-hook', stateId: 'sema' }
let root = ''
const stamp = '2026-10-01T00:00:00.000Z'
const event = (id: string): CalendarEvent => ({ id, title: 'Synthetic ' + id, date: '2027-06-01', color: 'blue',
  createdBy: 'mateo', createdAt: stamp, updatedAt: stamp })
let server: Record<string, unknown>, version: string
const network = vi.fn(() => { throw new Error('Live network prohibited') })
beforeEach(() => {
  access.coupleId = 'idb-hook-' + crypto.randomUUID(); root = `semacalendar-v2:${access.coupleId}:sema`
  invalidateAuth(); clearActiveCouple(); localStorage.clear(); vi.stubGlobal('indexedDB', new IDBFactory())
  for (const transport of ['fetch', 'WebSocket', 'XMLHttpRequest']) vi.stubGlobal(transport, network)
  network.mockClear(); server = { events: [], goals: [], todos: [], partnerNotes: [], monthlyIncome: 100 }; version = stamp
  mocks.read.mockReset().mockImplementation(async () => ({ data: { state: structuredClone(server), updated_at: version } }))
  mocks.write.mockReset(); mocks.result.mockReset().mockImplementation(async (filters, payload) => {
    if (filters.updated_at !== version) return { data: null }
    server = structuredClone(payload.state); version = payload.updated_at
    return { data: { updated_at: version } }
  })
})
afterEach(() => {
  expect(network).not.toHaveBeenCalled(); invalidateAuth(); clearActiveCouple(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})
async function start(offline = false) {
  await loadCoupleCache(access)
  const context = establishAuth(access, getAuthGeneration())!
  const hook = renderHook(() => { useSupabaseSync(context); return useSyncStatus() })
  if (!offline) await waitFor(() => expect(useAppStore.getState().monthlyIncome).toBe(100))
  await waitFor(() => expect(hook.result.current.status).toBe(offline ? 'error' : 'ok'))
  return hook
}
function create() {
  let id = ''
  act(() => { id = useAppStore.getState().addEvent({ title: 'Offline work', date: '2027-06-01', color: 'blue', createdBy: 'mateo',
    notes: 'Preserve my note', todos: [{ id: 'pack', title: 'Pack', isCompleted: true }] }) })
  return id
}
async function durable() { const record = (await backend.readIndexedCheckpoint(root))!; return backend.decodeIndexedCheckpoint(record, root) }

it('synchronizes with localStorage completely full and never writes or deletes legacy keys', async () => {
  const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
  const deletes = vi.spyOn(Storage.prototype, 'removeItem')
  const hook = await start(), id = create()
  await waitFor(() => expect((server.events as CalendarEvent[]).map(entry => entry.id)).toContain(id), { timeout: 4000 })
  await waitFor(() => expect(hook.result.current.status).toBe('ok'))
  expect(pendingKeys(access).size).toBe(0)
  expect(writes).not.toHaveBeenCalled(); expect(deletes).not.toHaveBeenCalled()
  hook.unmount()
})

it('restores offline event notes and completed checklist edits after interruption/restart', async () => {
  mocks.read.mockResolvedValue({ data: null, error: { message: 'Offline' } })
  const hook = await start(true), id = create()
  await waitFor(async () => expect((await durable()).state.events?.[0].id).toBe(id))
  hook.unmount(); invalidateAuth(); clearActiveCouple()
  await loadCoupleCache(access)
  expect(useAppStore.getState().events[0]).toMatchObject({ id, notes: 'Preserve my note', todos: [{ id: 'pack', isCompleted: true }] })
  expect(pendingKeys(access)).toEqual(new Set(['events']))
  expect(mocks.write).not.toHaveBeenCalled()
})

it('checkpoints offline edits even while the sync hook is absent', async () => {
  await loadCoupleCache(access)
  const id = create()
  await waitFor(async () => expect((await durable()).state.events?.[0].id).toBe(id))
  clearActiveCouple(); await loadCoupleCache(access)
  expect(useAppStore.getState().events[0].notes).toBe('Preserve my note')
  expect(pendingKeys(access).has('events')).toBe(true)
})

it('blocks PATCH and keeps the visible edit when IndexedDB quota is exhausted, then retries safely', async () => {
  const hook = await start()
  const failure = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
  const id = create()
  await waitFor(() => expect(hook.result.current.status).toBe('error'))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1000)) })
  expect(mocks.write).not.toHaveBeenCalled()
  expect(useAppStore.getState().events[0].id).toBe(id)
  expect(getCacheStorageWarning()).toContain('Closing the tab may lose edits')
  failure.mockRestore(); act(() => triggerPull())
  await waitFor(() => expect((server.events as CalendarEvent[]).map(entry => entry.id)).toContain(id), { timeout: 4000 })
  await waitFor(() => expect(pendingKeys(access).size).toBe(0))
  hook.unmount()
})

it('does not acknowledge a server save when the local acknowledgement transaction aborts; restart reconciles without a duplicate PATCH', async () => {
  const hook = await start()
  const real = IDBObjectStore.prototype.put
  let failure: { mockRestore(): void } | undefined
  mocks.result.mockImplementationOnce(async (_filters, payload) => {
    server = structuredClone(payload.state); version = payload.updated_at
    failure = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      const request = real.apply(this, args)
      request.addEventListener('success', () => this.transaction.abort())
      return request
    })
    return { data: { updated_at: version } }
  })
  const id = create()
  await waitFor(() => expect(hook.result.current.status).toBe('error'), { timeout: 4000 })
  expect(pendingKeys(access).has('events')).toBe(true)
  expect((await durable()).pending).toContain('events')
  expect((server.events as CalendarEvent[]).map(entry => entry.id)).toEqual([id])
  failure?.mockRestore(); hook.unmount(); invalidateAuth(); clearActiveCouple()
  const restarted = await start()
  expect(useAppStore.getState().events.map(entry => entry.id)).toEqual([id])
  expect(pendingKeys(access).size).toBe(0); expect(mocks.write).toHaveBeenCalledTimes(1)
  restarted.unmount()
})

it('preserves edits made while acknowledgement is committing and subsequently sends both events', async () => {
  const hook = await start()
  let release!: () => void, blocked = false
  const gate = new Promise<void>(resolve => { release = resolve })
  const original = backend.writeIndexedCheckpoint
  vi.spyOn(backend, 'writeIndexedCheckpoint').mockImplementation(async (...args) => {
    if (!blocked && args[2].pending.length === 0 && args[2].state.events?.length === 1) { blocked = true; await gate }
    return original(...args)
  })
  const first = create()
  await waitFor(() => expect(blocked).toBe(true), { timeout: 4000 })
  const second = create()
  release()
  await waitFor(() => expect((server.events as CalendarEvent[]).map(entry => entry.id)).toEqual([first, second]), { timeout: 4000 })
  await waitFor(() => expect(pendingKeys(access).size).toBe(0))
  expect(useAppStore.getState().events.map(entry => entry.id)).toEqual([first, second])
  hook.unmount()
})

it('merges a partner event created between read and conditional write with the local event', async () => {
  const hook = await start(), other = event('partner')
  mocks.result.mockImplementationOnce(async () => { server.events = [other]; version = '2026-10-02T00:00:00.000Z'; return { data: null } })
  const id = create()
  await waitFor(() => expect((server.events as CalendarEvent[]).map(entry => entry.id)).toEqual([other.id, id]), { timeout: 4000 })
  await waitFor(() => expect(pendingKeys(access).size).toBe(0))
  hook.unmount()
})

it('migrates a legacy cache without a baseline, retains notes/checklist completion for review and imports a partner event', async () => {
  const mine = { ...event('ambiguous'), notes: 'Preserve original note', todos: [{ id: 'c', title: 'Pack', isCompleted: true }] }
  const raw = JSON.stringify({ state: { events: [mine] }, version: 0 })
  localStorage.setItem('semacalendar-v1', raw)
  const theirs = event('partner-only'); server.events = [theirs]
  await loadCoupleCache(access)
  const context = establishAuth(access, getAuthGeneration())!
  const hook = renderHook(() => { useSupabaseSync(context); return useSyncStatus() })
  await waitFor(() => expect(useAppStore.getState().events).toEqual(expect.arrayContaining([mine, theirs])))
  expect(hook.result.current.status).toBe('error')
  expect((await durable()).archives.length).toBeGreaterThan(0)
  expect(mocks.write).not.toHaveBeenCalled()
  expect(localStorage.getItem('semacalendar-v1')).toBe(raw)
  hook.unmount(); invalidateAuth(); clearActiveCouple(); await loadCoupleCache(access)
  expect(useAppStore.getState().events).toEqual(expect.arrayContaining([mine, theirs]))
  expect(pendingKeys(access).has('events')).toBe(true)
})

it('merges an event checklist rename with partner completion using the atomic checkpoint', async () => {
  const original = { ...event('trip'), todos: [{ id: 'c', title: 'Pack', isCompleted: false }] }
  server.events = [original]
  const hook = await start()
  act(() => useAppStore.getState().updateEvent(original.id, { todos: [{ id: 'c', title: 'Pack early', isCompleted: false }] }))
  server.events = [{ ...original, todos: [{ id: 'c', title: 'Pack', isCompleted: true }] }]
  version = '2026-10-02T00:00:00.000Z'
  const expected = [{ id: 'c', title: 'Pack early', isCompleted: true }]
  await waitFor(() => expect((server.events as CalendarEvent[])[0].todos).toEqual(expected), { timeout: 4000 })
  await waitFor(() => expect(pendingKeys(access).size).toBe(0))
  expect((await durable()).state.events![0].todos).toEqual(expected)
  hook.unmount()
})

it('does not hydrate an obsolete account when authentication changes during IndexedDB initialization', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve }), original = backend.readIndexedCheckpoint
  vi.spyOn(backend, 'readIndexedCheckpoint').mockImplementationOnce(async (...args) => { await gate; return original(...args) })
  const first = loadCoupleCache(access)
  invalidateAuth(); clearActiveCouple()
  const other = { ...access, coupleId: 'different-household' }
  await loadCoupleCache(other)
  release(); await first
  expect(pendingKeys(other).size).toBe(0)
  expect(useAppStore.getState().events).toEqual([])
  expect(useAppStore.getState().currentUser).toBeNull()
})
