import type { StateStorage } from 'zustand/middleware'
import type { CoupleAccess } from './couple-access'
import { SHARED_KEYS, isValidRemoteSharedState, selectSharedState, type SharedState } from './shared-state'
import { checkpointChecksum, readRecoveryCheckpoint, writeRecoveryCheckpoint } from './sync-checkpoint'
import { sameValue, type SyncResolutionArchive, type UnbasedRecords } from './sync-merge'
import { sharedCacheRoot as keyFor, usesSupabaseV2Cache } from './shared-cache-scope'

let scope: CoupleAccess | null = null
const storageFailures = new Set<string>()
const storageReadFailures = new Set<string>()
const listeners = new Set<() => void>()
const storageWarning = 'Changes could not be saved on this device. Keep this tab open and retry. Closing the tab may lose edits. Recovery after refreshing or closing is not guaranteed.'
export function subscribeCacheStorage(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
function notifyStorage() { listeners.forEach(listener => listener()) }
export function setCacheScope(access: CoupleAccess | null) { scope = access; notifyStorage() }
export function hasCacheStorageError(access: CoupleAccess): boolean {
  const key = keyFor(access)
  return [...storageFailures, ...storageReadFailures].some(failed => failed === key || failed.startsWith(key + ':') ||
    (!usesSupabaseV2Cache() && access.stateId === 'sema' && (failed === 'semacalendar-v1' || failed === 'sema-legacy-cache-owner')))
}
export function getCacheStorageWarning() { return scope && hasCacheStorageError(scope) ? storageWarning : null }
function recordStorageResult(key: string, ok: boolean, reading = false) {
  const failures = reading ? storageReadFailures : storageFailures
  const wasFailed = failures.has(key)
  if (ok) failures.delete(key)
  else failures.add(key)
  if (wasFailed !== failures.has(key)) notifyStorage()
}
// The IndexedDB adapter shares the existing visible persistence warning.
export function reportDurableStorage(access: CoupleAccess, ok: boolean) {
  if (ok) {
    const root = keyFor(access)
    // A complete IndexedDB bundle supersedes interrupted legacy writes, whose
    // unchanged original bytes remain available for private recovery/export.
    for (const failures of [storageFailures, storageReadFailures]) {
      for (const key of failures) if (key === root || key.startsWith(root + ':')) failures.delete(key)
    }
    notifyStorage()
  }
  recordStorageResult(keyFor(access) + ':indexeddb', ok)
}
function readStorage(key: string): string | null {
  try {
    const value = localStorage.getItem(key)
    recordStorageResult(key, true, true)
    return value
  } catch {
    recordStorageResult(key, false, true)
    throw new Error('Device storage is unavailable')
  }
}
function writeStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    if (localStorage.getItem(key) !== value) throw new Error('Storage write was not retained')
    recordStorageResult(key, true)
    recordStorageResult(key, true, true)
    return true
  } catch {
    recordStorageResult(key, false)
    return false
  }
}
function validCache(value: string): boolean {
  try { return isValidRemoteSharedState(JSON.parse(value).state) } catch { return false }
}
function writeCache(access: CoupleAccess, value: string): boolean {
  const key = keyFor(access)
  try {
    const old = readStorage(key)
    if (old !== null && !validCache(old) && !writeStorage(key + ':legacy-quarantine:' + checkpointChecksum(old), old)) return false
    return writeStorage(key, value)
  } catch { recordStorageResult(key, false); return false }
}
export function pendingKeys(access: CoupleAccess): Set<keyof SharedState> {
  try {
    const recovered = recovery(access)
    if (recovered.data) {
      const keys = new Set(recovered.data.pending)
      for (const key of Object.keys(recovered.data.state) as (keyof SharedState)[]) {
        if (!sameValue(recovered.data.state[key], recovered.data.base[key])) keys.add(key)
      }
      return keys
    }
    const saved = readStorage(keyFor(access) + ':pending')
    // Caches created before tracking was added may contain unsynced work.
    if (saved === null) {
      let cache = readStorage(keyFor(access))
      if (cache === null && !usesSupabaseV2Cache() && access.stateId === 'sema') {
        const owner = readStorage('sema-legacy-cache-owner')
        if (!owner || owner === access.coupleId) cache = readStorage('semacalendar-v1')
      }
      // Older caches may predate shared fields. Only cached fields can contain
      // pending work; marking absent fields dirty would upload store defaults.
      try {
        return new Set(Object.keys(selectSharedState(cache ? JSON.parse(cache).state : null)) as (keyof SharedState)[])
      } catch { return new Set() }
    }
    const keys = new Set<keyof SharedState>(JSON.parse(saved).filter((key: keyof SharedState) => SHARED_KEYS.includes(key)))
    const cached = selectSharedState(JSON.parse(readStorage(keyFor(access)) ?? 'null')?.state)
    const base = selectSharedState(JSON.parse(readStorage(keyFor(access) + ':base') ?? 'null'))
    // An empty legacy marker is not proof of synchronization when its baseline
    // is missing or disagrees with the cached data. Preserve that work for review.
    for (const key of Object.keys(cached) as (keyof SharedState)[]) {
      if (!sameValue(cached[key], base[key])) keys.add(key)
    }
    return keys
  } catch { return new Set(SHARED_KEYS) }
}
export function persistPending(access: CoupleAccess, keys: Set<keyof SharedState>) {
  return writeStorage(keyFor(access) + ':pending', JSON.stringify(Array.from(keys)))
}
// The last values these local edits were based on, retained across logout/restart.
export function readSyncBase(access: CoupleAccess, cached?: Partial<SharedState>): Partial<SharedState> {
  try {
    const checkpoint = recovery(access).data
    if (checkpoint) return checkpoint.base
    const base = selectSharedState(JSON.parse(readStorage(keyFor(access) + ':base') ?? 'null'))
    // Also check callers that arrive after a failed first checkpoint, before a
    // restart. The hook must not reinterpret the same raw legacy base as trusted.
    const snapshot = cached ?? selectSharedState(JSON.parse(readStorage(keyFor(access)) ?? 'null')?.state)
    const saved = JSON.parse(readStorage(keyFor(access) + ':pending') ?? '[]')
    const recorded = new Set(saved.filter((key: keyof SharedState) => SHARED_KEYS.includes(key)))
    // Legacy state/base/markers were separate writes. A mismatch that was never
    // marked pending may be unsent work OR an older cache beside a newer base
    // that already acknowledged a deletion. Neither version is a trusted basis
    // for uploading that field; retain its local records for explicit review.
    for (const key of Object.keys(snapshot) as (keyof SharedState)[]) {
      if (!recorded.has(key) && !sameValue(snapshot[key], base[key])) delete base[key]
    }
    return base
  }
  catch { return {} }
}
export function persistSyncBase(access: CoupleAccess, base: Partial<SharedState>) {
  return writeStorage(keyFor(access) + ':base', JSON.stringify(base))
}

function recovery(access: CoupleAccess) {
  const result = readRecoveryCheckpoint(keyFor(access), { read: readStorage, write: writeStorage })
  if (result.damaged.length || result.unsupported || result.interrupted) recordStorageResult(keyFor(access) + ':checkpoint', false)
  return result
}
export function readSyncArchives(access: CoupleAccess): SyncResolutionArchive[] {
  try { return recovery(access).data?.archives ?? [] } catch { return [] }
}
export function readSyncUnbased(access: CoupleAccess): UnbasedRecords {
  try { return recovery(access).data?.unbased ?? {} } catch { return {} }
}

// Versioned recovery is authoritative; legacy mirrors remain available to old builds.
export function persistSyncCheckpoint(
  access: CoupleAccess, state: Partial<SharedState>, base: Partial<SharedState>, pending: Set<keyof SharedState>,
  archives = readSyncArchives(access),
  unbased = readSyncUnbased(access),
): boolean {
  const checkpointKey = keyFor(access) + ':checkpoint'
  const failed = () => { recordStorageResult(checkpointKey, false); return false }
  try {
    // A failed/interrupted attempt may already have staged both reviewed versions.
    // A later retry must retain that history, even if its caller is still in memory.
    const retainedArchives = new Map(readSyncArchives(access).map(archive => [archive.id, archive]))
    archives.forEach(archive => retainedArchives.set(archive.id, archive))
    archives = [...retainedArchives.values()]
    const retainedLegacy = pendingKeys(access)
    if (!writeRecoveryCheckpoint(keyFor(access), { state, base, pending: [...pending], archives, unbased },
      { read: readStorage, write: writeStorage }, retained => {
        retainedLegacy.forEach(key => retained.add(key))
        if (!persistPending(access, retained)) return false
        if (!writeCache(access, JSON.stringify({ state, version: 0 }))) return false
        if (!persistSyncBase(access, base)) return false
        if (persistPending(access, pending)) return true
        persistPending(access, retained)
        return false
      }, retainedLegacy)) return failed()
  } catch { return failed() }
  // The full bundle and compatibility mirrors were verified. Errors from
  // obsolete attempts in this scope no longer imply that current edits are lost.
  const root = keyFor(access)
  let cleared = false
  for (const key of storageFailures) if (key === root || key.startsWith(root + ':')) {
    storageFailures.delete(key); cleared = true
  }
  if (cleared) notifyStorage()
  recordStorageResult(checkpointKey, true)
  return true
}
export const coupleStorage: StateStorage = {
  getItem: () => {
    if (!scope) return null
    try {
      const recovered = recovery(scope)
      if (recovered.data) return JSON.stringify({ state: recovered.data.state, version: 0 })
      const saved = readStorage(keyFor(scope))
      if (saved !== null) {
        if (!validCache(saved)) { recordStorageResult(keyFor(scope), false); return null }
        return saved
      }
      // V2 starts with its own project-scoped cache, never an old backend's data.
      if (usesSupabaseV2Cache()) return null
      // Preserve the original cache. Import it only into the verified legacy household.
      const owner = readStorage('sema-legacy-cache-owner')
      if (scope.stateId !== 'sema' || (owner && owner !== scope.coupleId)) return null
      const legacy = readStorage('semacalendar-v1')
      if (legacy && !writeStorage('sema-legacy-cache-owner', scope.coupleId)) return null
      if (legacy && !validCache(legacy)) { recordStorageResult('semacalendar-v1', false); return null }
      return legacy
    } catch { return null }
  },
  setItem: (_name, value) => {
    if (scope) writeCache(scope, value)
  },
  // Logout does not delete potentially unsynchronized work.
  removeItem: () => {},
}
