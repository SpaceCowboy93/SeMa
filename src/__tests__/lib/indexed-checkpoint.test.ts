import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore, IDBDatabase } from 'fake-indexeddb'
import * as idb from '@/lib/indexed-checkpoint'
import { checkpointChecksum, writeRecoveryCheckpoint, type RecoveryCheckpoint } from '@/lib/sync-checkpoint'
import * as cache from '@/lib/durable-cache'
import { getCacheStorageWarning } from '@/lib/couple-cache'

vi.unmock('@/lib/durable-cache')
const access = { userId: 'synthetic', userName: 'mateo' as const, coupleId: 'idb-test', stateId: 'sema' }
let root = ''
const event = { id: 'local', title: 'Synthetic', date: '2027-01-01', color: 'blue' as const,
  createdBy: 'mateo' as const, createdAt: '2026-10-01', updatedAt: '2026-10-01',
  notes: 'Retain offline notes', todos: [{ id: 'check', title: 'Retain completion', isCompleted: true }] }
const checkpoint = (): RecoveryCheckpoint => ({ state: { events: [event] }, base: { events: [] }, pending: ['events'], archives: [] })
const read = async () => { const record = (await idb.readIndexedCheckpoint(root))!; return idb.decodeIndexedCheckpoint(record, root) }
beforeEach(() => {
  access.coupleId = 'idb-test-' + crypto.randomUUID(); root = `semacalendar-v2:${access.coupleId}:sema`
  vi.stubGlobal('indexedDB', new IDBFactory()); localStorage.clear(); cache.setCacheScope(access)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); cache.setCacheScope(null) })

it('commits the complete bundle and restores pending notes/checklists after reopening', async () => {
  const data = checkpoint()
  const first = await idb.writeIndexedCheckpoint(root, null, data, 'legacy')
  expect(await read()).toEqual(data)
  const next = { ...data, state: { events: [{ ...event, title: 'Later edit' }] } }
  await idb.writeIndexedCheckpoint(root, first, next, 'legacy')
  expect(await read()).toEqual(next)
})

it.each(['quota', 'abort-after-put-success'])('keeps the previous complete checkpoint on %s, including pending markers', async failure => {
  const data = checkpoint(), first = await idb.writeIndexedCheckpoint(root, null, data, 'legacy')
  const real = IDBObjectStore.prototype.put
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
    if (failure === 'quota') throw new DOMException('Synthetic quota', 'QuotaExceededError')
    const request = real.apply(this, args)
    request.addEventListener('success', () => this.transaction.abort())
    return request
  })
  await expect(idb.writeIndexedCheckpoint(root, first, { ...data, pending: [] }, 'legacy')).rejects.toBeDefined()
  expect(await read()).toEqual(data)
})

it('allows exactly one competing tab transaction to win and never overwrites the winner with stale work', async () => {
  const first = await idb.writeIndexedCheckpoint(root, null, checkpoint(), 'legacy')
  const changes = ['Mateo', 'Seval'].map(title => ({ ...checkpoint(), state: { events: [{ ...event, title }] } }))
  const results = await Promise.allSettled(changes.map(data => idb.writeIndexedCheckpoint(root, first, data, 'legacy')))
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const winner = results.findIndex(result => result.status === 'fulfilled')
  expect(await read()).toEqual(changes[winner])
  await expect(idb.writeIndexedCheckpoint(root, first, changes[1 - winner], 'legacy')).rejects.toThrow('Another tab')
  expect(await read()).toEqual(changes[winner])
})

it.each(['v1', 'mirrors', 'committed-journal', 'interrupted-journal'])('migrates %s without any localStorage write or deletion', async source => {
  const data = checkpoint()
  if (source === 'v1') localStorage.setItem('semacalendar-v1', JSON.stringify({ state: data.state, version: 0 }))
  else {
    localStorage.setItem(root, JSON.stringify({ state: data.state, version: 0 }))
    localStorage.setItem(root + ':base', JSON.stringify(data.base))
    localStorage.setItem(root + ':pending', JSON.stringify(data.pending))
  }
  if (source.includes('journal')) writeRecoveryCheckpoint(root, data, {
    read: key => localStorage.getItem(key), write: (key, value) => { localStorage.setItem(key, value); return true },
  }, () => source !== 'interrupted-journal')
  const original = { ...localStorage }
  const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
  const remove = vi.spyOn(Storage.prototype, 'removeItem')
  await cache.initializeDurableCache(access)
  expect((await read()).state).toEqual(data.state)
  expect(cache.pendingKeys(access)).toEqual(new Set(['events']))
  expect({ ...localStorage }).toEqual(original)
  expect(writes).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled()
})

it('rejects a failed first migration, preserves legacy bytes, and retries safely', async () => {
  localStorage.setItem(root, JSON.stringify({ state: checkpoint().state, version: 0 }))
  const original = { ...localStorage }
  const failure = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
  await expect(cache.initializeDurableCache(access)).rejects.toBeDefined()
  expect(await idb.readIndexedCheckpoint(root)).toBeNull()
  expect({ ...localStorage }).toEqual(original)
  expect(getCacheStorageWarning()).not.toBeNull()
  failure.mockRestore()
  await cache.initializeDurableCache(access)
  expect((await read()).state.events).toEqual([event])
})

it.each(['unsupported', 'corrupt'])('fails closed on an %s IndexedDB record instead of importing stale legacy state', async kind => {
  const record = await idb.writeIndexedCheckpoint(root, null, checkpoint(), 'legacy')
  const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open(idb.CHECKPOINT_DATABASE); request.onsuccess = () => resolve(request.result) })
  await new Promise<void>(resolve => { const tx = db.transaction(idb.CHECKPOINT_STORE, 'readwrite'); tx.objectStore(idb.CHECKPOINT_STORE).put(
    kind === 'unsupported' ? { ...record, version: 99 } : { ...record, payload: '{}' }, root); tx.oncomplete = () => resolve() })
  db.close()
  localStorage.setItem(root, JSON.stringify({ state: { events: [] }, version: 0 }))
  await expect(cache.initializeDurableCache(access)).rejects.toBeDefined()
  expect(localStorage.getItem(root)).toContain('events')
})

it('retains dirty data on failed persistence and succeeds on a same-tab retry', async () => {
  await cache.initializeDurableCache(access)
  const failure = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
  const data = checkpoint()
  expect(await cache.persistSyncCheckpoint(access, data.state, data.base, new Set(data.pending))).toBe(false)
  expect(getCacheStorageWarning()).not.toBeNull()
  await expect(cache.initializeDurableCache(access)).rejects.toThrow('Unpersisted edits')
  failure.mockRestore()
  expect(await cache.persistSyncCheckpoint(access, data.state, data.base, new Set(data.pending))).toBe(true)
  expect(await read()).toMatchObject(data)
  expect(getCacheStorageWarning()).toBeNull()
})

it('refuses synchronization if an older build changes the frozen migration source', async () => {
  await cache.initializeDurableCache(access)
  localStorage.setItem(root, JSON.stringify({ state: { events: [event] }, version: 0 }))
  const data = checkpoint()
  expect(await cache.persistSyncCheckpoint(access, data.state, data.base, new Set(data.pending))).toBe(false)
  await expect(cache.initializeDurableCache(access)).rejects.toThrow('Unpersisted edits')
  expect((await read()).state).toEqual({})
  expect(localStorage.getItem(root)).toContain(event.notes)
})

it('serializes queued offline edits with immutable enqueue-time snapshots', async () => {
  await cache.initializeDurableCache(access)
  const data = checkpoint()
  const first = cache.persistSyncCheckpoint(access, data.state, data.base, new Set(data.pending))
  const next = { events: [{ ...event, notes: 'Second edit' }] }
  const second = cache.persistSyncCheckpoint(access, next, data.base, new Set(data.pending))
  next.events[0].notes = 'Mutation after enqueue'
  expect(await first).toBe(true); expect(await second).toBe(true)
  expect((await read()).state.events![0].notes).toBe('Second edit')
  await cache.initializeDurableCache(access)
  expect(JSON.parse(cache.coupleStorage.getItem('ignored') as string).state.events[0].notes).toBe('Second edit')
})

it('reports an unserializable candidate as failure without changing the committed checkpoint', async () => {
  await cache.initializeDurableCache(access)
  const data = checkpoint()
  const olderWrite = cache.persistSyncCheckpoint(access, data.state, data.base, new Set(data.pending))
  const invalid = { events: [{ ...event, invalid: () => {} }] }
  expect(await cache.persistSyncCheckpoint(access, invalid, {}, new Set(['events']))).toBe(false)
  // Completion of an older candidate must not clear this newer failure warning.
  expect(await olderWrite).toBe(true)
  expect((await read()).state).toEqual(data.state)
  expect(getCacheStorageWarning()).not.toBeNull()
  await expect(cache.initializeDurableCache(access)).rejects.toThrow('Unpersisted edits')
})

it('claims an ownerless v1 cache atomically in IndexedDB without changing the old ownership marker', async () => {
  localStorage.setItem('semacalendar-v1', JSON.stringify({ state: checkpoint().state, version: 0 }))
  await cache.initializeDurableCache(access)
  const other = { ...access, coupleId: 'unrelated-household' }
  await cache.initializeDurableCache(other)
  cache.setCacheScope(other)
  expect(JSON.parse(cache.coupleStorage.getItem('ignored') as string).state).toEqual({})
  expect(await idb.readLegacyOwner()).toBe(access.coupleId)
  expect(localStorage.getItem('sema-legacy-cache-owner')).toBeNull()
})

it('refuses writes when strict transaction durability cannot be confirmed', async () => {
  const real = IDBDatabase.prototype.transaction
  vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args) {
    const tx = real.apply(this, args)
    if (args[1] === 'readwrite') Object.defineProperty(tx, 'durability', { value: 'relaxed' })
    return tx
  })
  await expect(idb.writeIndexedCheckpoint(root, null, checkpoint(), 'legacy')).rejects.toThrow('strict')
  expect(await idb.readIndexedCheckpoint(root)).toBeNull()
})

it('stores one atomic state/base bundle at realistic size, with zero localStorage growth', async () => {
  const data = checkpoint(), large = { ...event, notes: 'x'.repeat(1_720_000) }
  data.state = { events: [large] }; data.base = data.state; data.pending = []
  localStorage.setItem(root, JSON.stringify({ state: data.state, version: 0 }))
  localStorage.setItem(root + ':base', JSON.stringify(data.base)); localStorage.setItem(root + ':pending', '[]')
  const original = { ...localStorage }
  await cache.initializeDurableCache(access)
  expect(await cache.persistSyncCheckpoint(access, data.state, data.base, new Set())).toBe(true)
  const stored = (await idb.readIndexedCheckpoint(root))!
  expect(stored.payload.length).toBeLessThan(3_442_000)
  expect(stored.checksum).toBe(checkpointChecksum(stored.payload))
  expect({ ...localStorage }).toEqual(original)
  expect((await read()).state).toEqual(data.state)
})
