import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { useSupabaseSync, useSyncStatus, triggerPull } from '@/hooks/useSupabaseSync'
import { clearActiveCouple, loadCoupleCache, useAppStore } from '@/store/useAppStore'
import { establishAuth, getAuthGeneration, invalidateAuth } from '@/lib/auth-session'
import * as localCache from '@/lib/couple-cache'
import * as cache from '@/lib/durable-cache'
import * as idb from '@/lib/indexed-checkpoint'
import { checkpointChecksum, writeRecoveryCheckpoint, type RecoveryCheckpoint } from '@/lib/sync-checkpoint'
import type { CalendarEvent } from '@/types'

vi.unmock('@/lib/durable-cache')
const mocks = vi.hoisted(() => ({ read: vi.fn(), mutate: vi.fn(), apply: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: (table: string) => {
    let payload: { state: Record<string, unknown>; updated_at: string } | undefined
    const filters: Record<string, unknown> = {}
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query },
      abortSignal: () => query,
      update: (value: typeof payload) => { payload = value; mocks.mutate('update', table, value); return query },
      insert: () => { mocks.mutate('insert', table); return query },
      upsert: () => { mocks.mutate('upsert', table); return query },
      delete: () => { mocks.mutate('delete', table); return query },
      maybeSingle: () => payload ? mocks.apply(filters, payload) : mocks.read(),
    }
    return query
  },
  channel: () => ({ on: () => ({ subscribe: vi.fn() }) }), removeChannel: vi.fn(),
} }))

const project = 'wwxdinkdjkjiqzynfbdk'
const stamp = '2026-10-01T00:00:00.000Z'
const event = (id: string): CalendarEvent => ({ id, title: id, date: '2027-01-01', color: 'blue',
  createdBy: 'mateo', createdAt: stamp, updatedAt: stamp })
const access = { userId: 'synthetic-v2-user', userName: 'mateo' as const, coupleId: '', stateId: 'sema' }
let oldRoot: string, newRoot: string, server: Record<string, unknown>, version: string
const network = vi.fn(() => { throw new Error('Live network prohibited') })
const oldData = (): RecoveryCheckpoint => ({ state: { events: [event('old-project-event')], monthlyIncome: 9999 },
  base: { events: [], monthlyIncome: 0 }, pending: ['events', 'monthlyIncome'], archives: [] })

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `https://${project}.supabase.co`)
  access.coupleId = 'v2-migration-' + crypto.randomUUID()
  oldRoot = `semacalendar-v2:${access.coupleId}:sema`
  newRoot = `semacalendar-v2:project:${project}:${access.coupleId}:sema`
  invalidateAuth(); clearActiveCouple(); localStorage.clear()
  vi.stubGlobal('indexedDB', new IDBFactory())
  for (const transport of ['fetch', 'WebSocket', 'XMLHttpRequest']) vi.stubGlobal(transport, network)
  network.mockClear(); mocks.mutate.mockReset()
  server = { events: [], goals: [], todos: [], monthlyIncome: 0 }; version = stamp
  mocks.read.mockReset().mockImplementation(async () => ({ data: { state: structuredClone(server), updated_at: version } }))
  mocks.apply.mockReset().mockImplementation(async (filters, payload) => {
    expect(filters).toMatchObject({ id: access.stateId, couple_id: access.coupleId })
    if (filters.updated_at !== version) return { data: null }
    server = structuredClone(payload.state); version = payload.updated_at
    return { data: { updated_at: version } }
  })
})
afterEach(() => {
  invalidateAuth(); clearActiveCouple()
  expect(network).not.toHaveBeenCalled()
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs()
})

async function start() {
  await loadCoupleCache(access)
  const context = establishAuth(access, getAuthGeneration())!
  const hook = renderHook(() => { useSupabaseSync(context); return useSyncStatus() })
  await waitFor(() => expect(hook.result.current.status).toBe('ok'), { timeout: 4000 })
  return hook
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 1000)) })

it.each(['ownerless-v1', 'owned-v1', 'scoped-cache', 'scoped-journal', 'indexed-checkpoint'])(
  'never hydrates or uploads %s from the old project, even with matching household IDs', async source => {
    const data = oldData()
    if (source.endsWith('v1')) {
      localStorage.setItem('semacalendar-v1', JSON.stringify({ state: data.state, version: 0 }))
      if (source === 'owned-v1') localStorage.setItem('sema-legacy-cache-owner', access.coupleId)
    } else if (source === 'indexed-checkpoint') {
      await idb.writeIndexedCheckpoint(oldRoot, null, data, checkpointChecksum('[]'), access.coupleId)
    } else {
      localStorage.setItem(oldRoot, JSON.stringify({ state: data.state, version: 0 }))
      localStorage.setItem(oldRoot + ':base', JSON.stringify(data.base))
      localStorage.setItem(oldRoot + ':pending', JSON.stringify(data.pending))
      if (source === 'scoped-journal') writeRecoveryCheckpoint(oldRoot, data, {
        read: key => localStorage.getItem(key), write: (key, value) => { localStorage.setItem(key, value); return true },
      }, () => true)
    }
    const originalStorage = { ...localStorage }, originalRecord = await idb.readIndexedCheckpoint(oldRoot)
    // Exercise the compatibility adapter too; neither hydration nor dirty-field
    // inference may pull in a legacy cache on the V2 backend.
    localCache.setCacheScope(access)
    expect(localCache.coupleStorage.getItem('ignored')).toBeNull()
    expect(localCache.pendingKeys(access).size).toBe(0)
    await loadCoupleCache(access)
    expect(useAppStore.getState().events).toEqual([])
    expect(useAppStore.getState().monthlyIncome).toBe(0)
    expect(cache.pendingKeys(access).size).toBe(0)
    const before = structuredClone(server), hook = await start()
    await settle()
    expect(server).toEqual(before)
    expect(mocks.mutate).not.toHaveBeenCalled()
    expect({ ...localStorage }).toEqual(originalStorage)
    expect(await idb.readIndexedCheckpoint(oldRoot)).toEqual(originalRecord)
    expect(await idb.readIndexedCheckpoint(newRoot)).not.toBeNull()
    hook.unmount()
  })

it.each([{}, { events: [], todos: [], goals: [], monthlyIncome: 0 }])(
  'leaves an empty shared database unchanged without uploading store defaults (%j)', async empty => {
    server = structuredClone(empty)
    const hook = await start()
    await settle()
    expect(server).toEqual(empty)
    expect(useAppStore.getState().events).toEqual([])
    expect(cache.pendingKeys(access).size).toBe(0)
    expect(mocks.mutate).not.toHaveBeenCalled()
    hook.unmount()
  })

it('syncs new V2 edits, preserves existing remote records/unknown fields, and restores only V2 offline work', async () => {
  const production = event('existing-remote-event')
  server = { ...server, events: [production], productionMetadata: { keep: true } }
  const originalRecord = structuredClone(production)
  localStorage.setItem('semacalendar-v1', JSON.stringify({ state: oldData().state, version: 0 }))
  const originalStorage = { ...localStorage }
  const hook = await start()
  expect(useAppStore.getState().events).toEqual([production])
  expect(mocks.mutate).not.toHaveBeenCalled()
  let id = ''
  act(() => { id = useAppStore.getState().addEvent({ title: 'New V2 event', date: '2027-02-01', color: 'blue', createdBy: 'mateo' }) })
  await waitFor(() => expect((server.events as CalendarEvent[]).map(entry => entry.id)).toEqual([production.id, id]), { timeout: 4000 })
  await waitFor(() => expect(cache.pendingKeys(access).size).toBe(0))
  expect((server.events as CalendarEvent[])[0]).toEqual(originalRecord)
  expect(server.productionMetadata).toEqual({ keep: true })
  expect(mocks.mutate.mock.calls.every(([method]) => method === 'update')).toBe(true)
  hook.unmount(); invalidateAuth(); clearActiveCouple()
  await loadCoupleCache(access)
  expect(useAppStore.getState().events.map(entry => entry.id)).toEqual([production.id, id])
  expect({ ...localStorage }).toEqual(originalStorage)
})

it('retains new offline V2 edits across reload and uploads them after reconnecting', async () => {
  await loadCoupleCache(access)
  const id = useAppStore.getState().addEvent({ title: 'Offline V2 event', date: '2027-02-01', color: 'blue', createdBy: 'mateo' })
  await waitFor(async () => {
    const record = await idb.readIndexedCheckpoint(newRoot)
    expect(record && idb.decodeIndexedCheckpoint(record, newRoot).pending).toContain('events')
  })
  clearActiveCouple()
  const hook = await start()
  await waitFor(() => expect((server.events as CalendarEvent[]).map(entry => entry.id)).toEqual([id]), { timeout: 4000 })
  await waitFor(() => expect(cache.pendingKeys(access).size).toBe(0))
  hook.unmount()
})

it('ignores legacy cache changes made by an older open tab during V2 synchronization', async () => {
  const hook = await start()
  localStorage.setItem('semacalendar-v1', 'changed by older build')
  localStorage.setItem(oldRoot, 'changed old household cache')
  act(() => triggerPull())
  await waitFor(() => expect(hook.result.current.status).toBe('ok'))
  let id = ''
  act(() => { id = useAppStore.getState().addEvent({ title: 'Still syncs', date: '2027-02-01', color: 'blue', createdBy: 'mateo' }) })
  await waitFor(() => expect((server.events as CalendarEvent[]).map(entry => entry.id)).toEqual([id]), { timeout: 4000 })
  hook.unmount()
})
