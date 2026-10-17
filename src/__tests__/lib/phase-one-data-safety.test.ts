import { afterEach, expect, it, vi } from 'vitest'
import { isValidRemoteSharedState, selectSharedState, type SharedState } from '@/lib/shared-state'
import { rebaseSharedState } from '@/lib/sync-merge'
import {
  coupleStorage, getCacheStorageWarning, hasCacheStorageError, pendingKeys,
  persistPending, persistSyncBase, persistSyncCheckpoint, readSyncBase, setCacheScope,
} from '@/lib/couple-cache'

const mood = { userId: 'mateo' as const, date: '2026-10-13', mood: 'happy' as const, note: 'Good day' }
const access = (name: string) => ({ userId: 'local', userName: 'mateo' as const, coupleId: 'phase-one-' + name, stateId: 'sema' })
afterEach(() => { vi.restoreAllMocks(); setCacheScope(null); localStorage.clear() })

it('accepts legitimate mood records without an id and preserves unknown remote keys', () => {
  const state = { moods: [mood], legacySetting: { preserved: true } }
  expect(selectSharedState(state).moods).toEqual([mood])
  expect(isValidRemoteSharedState(state)).toBe(true)
})

it.each([
  { ...mood, userId: 'unknown' }, { ...mood, date: '2026-02-31' },
  { ...mood, date: 'invalid' }, { ...mood, mood: 'invalid' }, { ...mood, note: 5 },
  { date: mood.date, mood: 'happy' }, null,
])('rejects malformed mood records: %j', entry => {
  expect(selectSharedState({ moods: [entry] }).moods).toBeUndefined()
  expect(isValidRemoteSharedState({ moods: [entry] })).toBe(false)
})

it.each([
  { events: [{ id: 'valid' }, null] }, { todos: [{ title: 'Missing id' }] },
  { financeMonths: [{ id: 'wrong-key' }] }, { monthlyIncome: '100' },
  null, [], 'invalid',
  { todos: [{ id: 'duplicate', title: 'One' }, { id: 'duplicate', title: 'Two' }] },
  { moods: [mood, { ...mood, note: 'Duplicate user/date' }] },
  { financeMonths: [{ key: '2026-10', income: 100 }, { key: '2026-10', income: 200 }] },
])('rejects a malformed remote snapshot instead of treating it as empty: %j', value => {
  expect(isValidRemoteSharedState(value)).toBe(false)
})

it('accepts absent legacy fields and intentional empty collections', () => {
  expect(isValidRemoteSharedState({})).toBe(true)
  expect(isValidRemoteSharedState({ moods: [], events: [], monthlyIncome: 0 })).toBe(true)
})

it('merges independent mood additions by user and date without adding schema fields', () => {
  const other = { ...mood, userId: 'seval' as const, mood: 'relaxed' as const }
  const result = rebaseSharedState({ moods: [] }, { moods: [mood] }, { moods: [other] }, new Set(['moods']))
  expect(result.conflicts).toEqual([])
  expect(result.state.moods).toEqual([other, mood])
  expect(result.state.moods?.every(entry => !('id' in entry))).toBe(true)
})

it('merges different mood dates and quarantines conflicting edits to the same user/date', () => {
  const nextDay = { ...mood, date: '2026-10-14' }
  const additions = rebaseSharedState({ moods: [mood] }, { moods: [mood, nextDay] },
    { moods: [{ ...mood, note: 'Partner note' }] }, new Set(['moods']))
  expect(additions.conflicts).toEqual([])
  expect(additions.state.moods).toEqual([{ ...mood, note: 'Partner note' }, nextDay])
  const conflict = rebaseSharedState({ moods: [mood] }, { moods: [{ ...mood, mood: 'tired' }] },
    { moods: [{ ...mood, mood: 'sad' }] }, new Set(['moods']))
  expect(conflict.conflicts).toEqual(['moods'])
})

it('guards direct cache, pending, and baseline writes and keeps warnings after successful reads', () => {
  const household = access('quota')
  setCacheScope(household)
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Quota exceeded', 'QuotaExceededError')
  })
  expect(() => coupleStorage.setItem('unused', '{"state":{}}')).not.toThrow()
  expect(persistPending(household, new Set(['moods']))).toBe(false)
  expect(persistSyncBase(household, { moods: [] })).toBe(false)
  pendingKeys(household); readSyncBase(household)
  expect(getCacheStorageWarning()).toContain('Recovery after refreshing or closing is not guaranteed')
  storage.mockRestore()
  expect(persistSyncCheckpoint(household, { moods: [mood] }, { moods: [] }, new Set(['moods']))).toBe(true)
  expect(getCacheStorageWarning()).toBeNull()
})

it('guards inaccessible storage reads and fails checkpoints without throwing', () => {
  const household = access('inaccessible')
  setCacheScope(household)
  const storage = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('Storage blocked', 'SecurityError')
  })
  expect(() => pendingKeys(household)).not.toThrow()
  expect(coupleStorage.getItem('unused')).toBeNull()
  expect(persistSyncCheckpoint(household, { moods: [] }, {}, new Set(['moods']))).toBe(false)
  expect(hasCacheStorageError(household)).toBe(true)
  storage.mockRestore()
  expect(persistSyncCheckpoint(household, { moods: [] }, {}, new Set(['moods']))).toBe(true)
  expect(getCacheStorageWarning()).toBeNull()
})

it('does not clear a pending marker when the cache or baseline cannot be persisted', () => {
  const household = access('checkpoint')
  setCacheScope(household)
  persistPending(household, new Set(['monthlyIncome']))
  const originalSet = Storage.prototype.setItem
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key.endsWith(':base')) throw new DOMException('Quota exceeded', 'QuotaExceededError')
    originalSet.call(this, key, value)
  })
  expect(persistSyncCheckpoint(household, { monthlyIncome: 200 }, { monthlyIncome: 200 }, new Set())).toBe(false)
  expect(pendingKeys(household).has('monthlyIncome')).toBe(true)
  expect(getCacheStorageWarning()).not.toBeNull()
  storage.mockRestore()
  expect(persistSyncCheckpoint(household, { monthlyIncome: 200 }, { monthlyIncome: 200 }, new Set())).toBe(true)
  expect(pendingKeys(household).size).toBe(0)
})

it('rejects dropped writes and restores the conservative marker if acknowledgement persistence fails', () => {
  const household = access('dropped')
  setCacheScope(household)
  persistPending(household, new Set(['moods']))
  const originalSet = Storage.prototype.setItem
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key.endsWith(':pending') && value === '[]') return
    originalSet.call(this, key, value)
  })
  expect(persistSyncCheckpoint(household, { moods: [mood] }, { moods: [mood] }, new Set())).toBe(false)
  expect(pendingKeys(household).has('moods')).toBe(true)
  expect(getCacheStorageWarning()).not.toBeNull()
  storage.mockRestore()
  expect(persistSyncCheckpoint(household, { moods: [mood] }, { moods: [mood] }, new Set())).toBe(true)
  expect(getCacheStorageWarning()).toBeNull()
})

it('verifies the recovered checkpoint through a fresh module and the stored values', async () => {
  const household = access('roundtrip')
  setCacheScope(household)
  const state: Partial<SharedState> = { moods: [mood], monthlyIncome: 200 }
  expect(persistSyncCheckpoint(household, state, state, new Set())).toBe(true)
  vi.resetModules()
  const fresh = await import('@/lib/couple-cache')
  fresh.setCacheScope(household)
  expect(JSON.parse(fresh.coupleStorage.getItem('unused') as string).state).toEqual(state)
  expect(fresh.readSyncBase(household)).toEqual(state)
  expect(fresh.pendingKeys(household).size).toBe(0)
  fresh.setCacheScope(null)
})
