import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { coupleStorage, getCacheStorageWarning, pendingKeys, persistPending, persistSyncBase,
  persistSyncCheckpoint, readSyncBase, readSyncArchives, setCacheScope } from '@/lib/couple-cache'
import { checkpointChecksum } from '@/lib/sync-checkpoint'
import type { SyncResolutionArchive } from '@/lib/sync-merge'

const access = { userId: 'local', userName: 'mateo' as const, coupleId: 'checkpoint-tests', stateId: 'sema' }
const root = 'semacalendar-v2:checkpoint-tests:sema'
beforeEach(() => { localStorage.clear(); setCacheScope(access) })
afterEach(() => { vi.restoreAllMocks(); setCacheScope(null) })
const state = () => JSON.parse(coupleStorage.getItem('unused') as string).state
const archive: SyncResolutionArchive = { id: 'choice', at: '2026-10-13', choice: 'remote',
  group: { id: 'income', title: 'Income', fields: ['monthlyIncome'], members: [{ key: 'monthlyIncome', base: 100, local: 200, remote: 300 }] } }

it('recovers state, baseline, pending work and both reviewed versions through a fresh module', async () => {
  expect(persistSyncCheckpoint(access, { monthlyIncome: 200 }, { monthlyIncome: 100 }, new Set(['monthlyIncome']), [archive])).toBe(true)
  // Simulate a stale legacy mirror; recovery must use its complete journal bundle.
  localStorage.setItem(root, JSON.stringify({ state: { monthlyIncome: 999 } }))
  localStorage.setItem(root + ':base', JSON.stringify({ monthlyIncome: 999 }))
  localStorage.setItem(root + ':pending', '[]')
  vi.resetModules()
  const fresh = await import('@/lib/couple-cache')
  fresh.setCacheScope(access)
  expect(JSON.parse(fresh.coupleStorage.getItem('unused') as string).state.monthlyIncome).toBe(200)
  expect(fresh.readSyncBase(access).monthlyIncome).toBe(100)
  expect([...fresh.pendingKeys(access)]).toEqual(['monthlyIncome'])
  expect(fresh.readSyncArchives(access)).toEqual([archive])
  fresh.setCacheScope(null)
})

it.each([1, 2, 3, 4, 5, 6])('recovers a complete conservative bundle after interruption at checkpoint write %s', async stop => {
  persistSyncCheckpoint(access, { monthlyIncome: 200 }, { monthlyIncome: 100 }, new Set(['monthlyIncome']))
  const original = Storage.prototype.setItem
  let count = 0
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (++count >= stop) throw new DOMException('Interrupted', 'QuotaExceededError')
    original.call(this, key, value)
  })
  expect(persistSyncCheckpoint(access, { monthlyIncome: 300 }, { monthlyIncome: 300 }, new Set())).toBe(false)
  spy.mockRestore()
  vi.resetModules()
  const fresh = await import('@/lib/couple-cache')
  fresh.setCacheScope(access)
  const recovered = JSON.parse(fresh.coupleStorage.getItem('unused') as string).state.monthlyIncome
  expect(recovered).toBe(stop === 1 ? 200 : 300)
  expect(fresh.readSyncBase(access).monthlyIncome).toBe(stop === 1 ? 100 : 300)
  expect(fresh.pendingKeys(access).has('monthlyIncome')).toBe(true)
  fresh.setCacheScope(null)
})

it('detects a dropped commit-pointer write and keeps the acknowledged field pending until retry succeeds', () => {
  persistSyncCheckpoint(access, { monthlyIncome: 200 }, { monthlyIncome: 100 }, new Set(['monthlyIncome']))
  const original = Storage.prototype.setItem
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key.endsWith(':checkpoint:head')) return
    original.call(this, key, value)
  })
  expect(persistSyncCheckpoint(access, { monthlyIncome: 200 }, { monthlyIncome: 200 }, new Set())).toBe(false)
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
  expect(getCacheStorageWarning()).toContain('Closing the tab may lose edits')
  spy.mockRestore()
  expect(persistSyncCheckpoint(access, { monthlyIncome: 200 }, { monthlyIncome: 200 }, new Set())).toBe(true)
  expect(pendingKeys(access).size).toBe(0)
  expect(getCacheStorageWarning()).toBeNull()
})

it('falls back to the previous complete slot on corruption and quarantines damaged bytes before repair', () => {
  persistSyncCheckpoint(access, { monthlyIncome: 200 }, { monthlyIncome: 100 }, new Set(['monthlyIncome']))
  persistSyncCheckpoint(access, { monthlyIncome: 300 }, { monthlyIncome: 100 }, new Set(['monthlyIncome']))
  const damaged = localStorage.getItem(root + ':checkpoint:1')!.replace('300', '999')
  localStorage.setItem(root + ':checkpoint:1', damaged)
  expect(state().monthlyIncome).toBe(200)
  expect(readSyncBase(access).monthlyIncome).toBe(100)
  expect(getCacheStorageWarning()).not.toBeNull()
  expect(persistSyncCheckpoint(access, { monthlyIncome: 200 }, { monthlyIncome: 100 }, new Set(['monthlyIncome']))).toBe(true)
  expect(localStorage.getItem(root + ':checkpoint:quarantine:' + checkpointChecksum(damaged))).toBe(damaged)
  expect(getCacheStorageWarning()).toBeNull()
})

it('preserves corrupt bytes when storage cannot quarantine them', () => {
  persistSyncCheckpoint(access, { monthlyIncome: 200 }, { monthlyIncome: 100 }, new Set(['monthlyIncome']))
  localStorage.setItem(root + ':checkpoint:1', 'truncated-data')
  const original = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key.includes(':quarantine:')) throw new DOMException('Full', 'QuotaExceededError')
    original.call(this, key, value)
  })
  expect(persistSyncCheckpoint(access, { monthlyIncome: 250 }, { monthlyIncome: 100 }, new Set(['monthlyIncome']))).toBe(false)
  expect(localStorage.getItem(root + ':checkpoint:1')).toBe('truncated-data')
  expect(state().monthlyIncome).toBe(200)
})

it('rejects unsupported checkpoint versions without replacing their bytes', () => {
  const future = JSON.stringify({ version: 99, payload: 'future work' })
  localStorage.setItem(root + ':checkpoint:0', future)
  expect(persistSyncCheckpoint(access, { monthlyIncome: 200 }, {}, new Set(['monthlyIncome']))).toBe(false)
  expect(localStorage.getItem(root + ':checkpoint:0')).toBe(future)
  expect(getCacheStorageWarning()).not.toBeNull()
})

it('rejects a correctly checksummed envelope belonging to another household', () => {
  persistSyncCheckpoint(access, { monthlyIncome: 200 }, { monthlyIncome: 100 }, new Set(['monthlyIncome']))
  const envelope = JSON.parse(localStorage.getItem(root + ':checkpoint:0')!)
  const { checksum: ignored, ...body } = envelope
  const payload = JSON.parse(body.payload)
  payload.scope = 'other-household'; body.payload = JSON.stringify(payload)
  localStorage.setItem(root + ':checkpoint:0', JSON.stringify({ ...body, checksum: checkpointChecksum(JSON.stringify(body)) }))
  // The trusted legacy mirror remains available; the foreign envelope is quarantined.
  expect(state().monthlyIncome).toBe(200)
  expect(getCacheStorageWarning()).not.toBeNull()
  expect(ignored).toBeDefined()
})

it('upgrades a legacy pending cache without deleting the legacy original or inventing a baseline', () => {
  const legacy = JSON.stringify({ state: { monthlyIncome: 777 }, version: 0 })
  localStorage.setItem('semacalendar-v1', legacy)
  expect(state().monthlyIncome).toBe(777)
  expect([...pendingKeys(access)]).toEqual(['monthlyIncome'])
  expect(readSyncBase(access)).toEqual({})
  expect(persistSyncCheckpoint(access, { monthlyIncome: 777 }, {}, pendingKeys(access))).toBe(true)
  expect(localStorage.getItem('semacalendar-v1')).toBe(legacy)
  expect(readSyncBase(access)).toEqual({})
  expect([...pendingKeys(access)]).toEqual(['monthlyIncome'])
})

it('retains staged resolution history when a later caller retries using older in-memory archives', () => {
  persistPending(access, new Set(['monthlyIncome'])); persistSyncBase(access, { monthlyIncome: 100 })
  const original = Storage.prototype.setItem
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key.endsWith(':checkpoint:head')) throw new DOMException('Interrupted', 'QuotaExceededError')
    original.call(this, key, value)
  })
  expect(persistSyncCheckpoint(access, { monthlyIncome: 300 }, { monthlyIncome: 300 }, new Set(), [archive])).toBe(false)
  spy.mockRestore()
  expect(persistSyncCheckpoint(access, { monthlyIncome: 200 }, { monthlyIncome: 100 }, new Set(['monthlyIncome']), [])).toBe(true)
  expect(readSyncArchives(access)).toEqual([archive])
})

it('repairs two corrupt slots after retaining both original byte strings', () => {
  localStorage.setItem(root + ':checkpoint:0', 'bad-zero')
  localStorage.setItem(root + ':checkpoint:1', 'bad-one')
  expect(persistSyncCheckpoint(access, { monthlyIncome: 200 }, {}, new Set(['monthlyIncome']))).toBe(true)
  expect(state().monthlyIncome).toBe(200)
  expect(localStorage.getItem(root + ':checkpoint:quarantine:' + checkpointChecksum('bad-zero'))).toBe('bad-zero')
  expect(localStorage.getItem(root + ':checkpoint:quarantine:' + checkpointChecksum('bad-one'))).toBe('bad-one')
  expect(getCacheStorageWarning()).toBeNull()
})

it('preserves an unreadable scoped legacy cache before rehydration can replace it', () => {
  const malformed = '{"state":{"goals":[{"id":"g","checklist":"invalid"}]},"version":0}'
  localStorage.setItem(root, malformed)
  expect(coupleStorage.getItem('unused')).toBeNull()
  expect(getCacheStorageWarning()).not.toBeNull()
  coupleStorage.setItem('unused', JSON.stringify({ state: { monthlyIncome: 200 }, version: 0 }))
  expect(localStorage.getItem(root + ':legacy-quarantine:' + checkpointChecksum(malformed))).toBe(malformed)
  expect(state().monthlyIncome).toBe(200)
})

it('preserves both duplicate-ID local records as exact quarantined bytes before a valid cache can replace them', () => {
  const original = JSON.stringify({ state: { todos: [
    { id: 'same', title: 'Potentially unique first copy' },
    { id: 'same', title: 'Potentially unique second copy' },
  ] }, version: 0 })
  localStorage.setItem(root, original)
  expect(coupleStorage.getItem('unused')).toBeNull()
  expect(getCacheStorageWarning()).not.toBeNull()
  coupleStorage.setItem('unused', JSON.stringify({ state: { todos: [] }, version: 0 }))
  expect(localStorage.getItem(root + ':legacy-quarantine:' + checkpointChecksum(original))).toBe(original)
  expect(state().todos).toEqual([])
})

it('refuses acknowledgement if another writer replaces the staged slot before commit', () => {
  persistSyncCheckpoint(access, { monthlyIncome: 200 }, { monthlyIncome: 100 }, new Set(['monthlyIncome']))
  const original = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    original.call(this, key, value)
    if (key.endsWith(':base')) original.call(this, root + ':checkpoint:1', 'another writer replaced the slot')
  })
  expect(persistSyncCheckpoint(access, { monthlyIncome: 200 }, { monthlyIncome: 200 }, new Set())).toBe(false)
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
  expect(getCacheStorageWarning()).not.toBeNull()
})

it('refuses a checkpoint that would omit a still-pending collection', () => {
  persistSyncCheckpoint(access, { monthlyIncome: 200 }, { monthlyIncome: 100 }, new Set(['monthlyIncome']))
  expect(persistSyncCheckpoint(access, {}, {}, new Set())).toBe(false)
  expect(state().monthlyIncome).toBe(200)
  expect(pendingKeys(access).has('monthlyIncome')).toBe(true)
})

it.each([1, 2, 3, 4, 5, 6])('retains unknown legacy record baselines through interrupted partial resolution at write %s', async stop => {
  const old = { todos: [{ id: 'one', title: 'Local one' }, { id: 'two', title: 'Local two' }] } as never
  expect(persistSyncCheckpoint(access, old, {}, new Set(['todos']), [], { todos: ['one', 'two'] })).toBe(true)
  const original = Storage.prototype.setItem
  let count = 0
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (++count >= stop) throw new DOMException('Interrupted', 'QuotaExceededError')
    original.call(this, key, value)
  })
  const next = { todos: [{ id: 'one', title: 'Remote one' }, { id: 'two', title: 'Local two' }] } as never
  expect(persistSyncCheckpoint(access, next, { todos: [] }, new Set(['todos']), [archive], { todos: ['two'] })).toBe(false)
  spy.mockRestore(); vi.resetModules()
  const fresh = await import('@/lib/couple-cache')
  expect(fresh.readSyncUnbased(access).todos).toContain('two')
  expect(fresh.pendingKeys(access).has('todos')).toBe(true)
  fresh.setCacheScope(access)
  expect(JSON.parse(fresh.coupleStorage.getItem('unused') as string).state.todos).toHaveLength(2)
  fresh.setCacheScope(null)
})
