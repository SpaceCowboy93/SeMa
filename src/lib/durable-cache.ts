import type { StateStorage } from 'zustand/middleware'
import type { CoupleAccess } from './couple-access'
import { isValidRemoteSharedState, selectSharedState, type SharedState } from './shared-state'
import { checkpointChecksum, readRecoveryCheckpoint, type RecoveryCheckpoint } from './sync-checkpoint'
import { decodeIndexedCheckpoint, readIndexedCheckpoint, readLegacyOwner, writeIndexedCheckpoint, type IndexedCheckpoint } from './indexed-checkpoint'
import { sameValue, type SyncResolutionArchive, type UnbasedRecords } from './sync-merge'
import * as legacy from './couple-cache'
import { sharedCacheRoot as rootFor, usesSupabaseV2Cache } from './shared-cache-scope'

export { hasCacheStorageError } from './couple-cache'
interface Session {
  data: RecoveryCheckpoint
  record: IndexedCheckpoint | null
  fingerprint: string
  tail: Promise<unknown>
  blocked: boolean
  queued?: RecoveryCheckpoint
  visible?: Partial<SharedState>
  serializationFailed?: boolean
}
const sessions = new Map<string, Session>()
let scope: CoupleAccess | null = null
let automaticWrites = false
export function setCacheScope(access: CoupleAccess | null) { scope = access; automaticWrites = false; legacy.setCacheScope(access) }
export function enableCacheWrites(visible: Partial<SharedState>) {
  if (scope) sessionFor(scope).visible = structuredClone(visible)
  automaticWrites = true
}

// Fingerprint only data-cache keys, never sessions/credentials. Old builds must
// not be allowed to silently change the frozen migration source underneath us.
function fingerprint(root: string) {
  const keys = Object.keys(localStorage).filter(key => key === root || key.startsWith(root + ':') ||
    (!usesSupabaseV2Cache() && (key === 'semacalendar-v1' || key === 'sema-legacy-cache-owner'))).sort()
  return checkpointChecksum(JSON.stringify(keys.map(key => [key, localStorage.getItem(key)])))
}
function importLegacy(access: CoupleAccess, claimedOwner: string | null): { data: RecoveryCheckpoint; claim?: string } {
  const root = rootFor(access)
  const recovered = readRecoveryCheckpoint(root, { read: key => localStorage.getItem(key), write: () => false })
  if (recovered.unsupported || recovered.damaged.length) throw new Error('Legacy recovery needs inspection; originals preserved')
  if (recovered.data) return { data: { ...recovered.data,
    pending: [...legacy.pendingKeys(access)].filter(key => key in recovered.data!.state) } }
  let raw = localStorage.getItem(root)
  let claim: string | undefined
  if (raw === null && !usesSupabaseV2Cache() && access.stateId === 'sema') {
    const owner = localStorage.getItem('sema-legacy-cache-owner')
    if ((!owner || owner === access.coupleId) && (!claimedOwner || claimedOwner === access.coupleId)) {
      raw = localStorage.getItem('semacalendar-v1')
      if (raw !== null) claim = access.coupleId
    }
  }
  const parsed = raw === null ? {} : JSON.parse(raw).state
  if (!isValidRemoteSharedState(parsed)) throw new Error('Invalid legacy cache; originals preserved')
  const state = selectSharedState(parsed)
  const pending = legacy.pendingKeys(access)
  // Never invent defaults as pending fields when the legacy cache is partial.
  return { data: { state, base: legacy.readSyncBase(access, state), pending: [...pending].filter(key => key in state), archives: [] }, claim }
}

/** Import without changing a single legacy byte. An unknown/corrupt IDB record
 * fails closed rather than falling back to an older localStorage snapshot. */
export async function initializeDurableCache(access: CoupleAccess) {
  const root = rootFor(access)
  try {
    const previous = sessions.get(root)
    await previous?.tail
    if (previous?.serializationFailed || (previous?.queued && (!sameValue(previous.queued.state, previous.data.state) ||
      !sameValue(previous.queued.archives, previous.data.archives)))) {
      throw new Error('Unpersisted edits remain in this tab. Retry saving or preserve them before reopening the cache.')
    }
    const before = fingerprint(root)
    const record = await readIndexedCheckpoint(root)
    const imported = record ? { data: decodeIndexedCheckpoint(record, root), claim: undefined }
      : importLegacy(access, usesSupabaseV2Cache() ? null : await readLegacyOwner())
    const data = imported.data
    if (before !== fingerprint(root) || (record && record.legacyFingerprint !== before)) {
      throw new Error('Legacy data changed in another build; preserve both caches before recovery')
    }
    const session: Session = { data, record, fingerprint: before, tail: Promise.resolve(), blocked: false }
    // Finish migration before publishing a readable session to hydration.
    if (!record) session.record = await writeIndexedCheckpoint(root, null, data, before, imported.claim)
    if (fingerprint(root) !== before) throw new Error('Legacy source changed during migration; saving paused')
    sessions.set(root, session)
    legacy.reportDurableStorage(access, true)
  } catch (error) {
    legacy.reportDurableStorage(access, false)
    throw error
  }
}
function sessionFor(access: CoupleAccess) {
  const session = sessions.get(rootFor(access))
  if (!session) throw new Error('Device checkpoint has not been opened safely')
  return session
}
export function pendingKeys(access: CoupleAccess): Set<keyof SharedState> {
  // The atomic bundle's marker is authoritative. Inferring work from absent
  // baselines here would turn unedited hydration defaults into pending edits.
  // Legacy import performs conservative inference BEFORE the atomic migration.
  return new Set(sessionFor(access).data.pending)
}
export function readSyncBase(access: CoupleAccess, _cached?: Partial<SharedState>) { return structuredClone(sessionFor(access).data.base) }
export function readSyncArchives(access: CoupleAccess) { return structuredClone(sessionFor(access).data.archives) }
export function readSyncUnbased(access: CoupleAccess) { return structuredClone(sessionFor(access).data.unbased ?? {}) }

export async function persistSyncCheckpoint(access: CoupleAccess, state: Partial<SharedState>, base: Partial<SharedState>,
  pending: Set<keyof SharedState>, archives?: SyncResolutionArchive[], unbased?: UnbasedRecords): Promise<boolean> {
  const root = rootFor(access)
  const session = sessions.get(root)
  if (!session) { legacy.reportDurableStorage(access, false); return false }
  let candidate: RecoveryCheckpoint
  // Freeze at enqueue time: edits may continue while IndexedDB commits.
  try {
    candidate = structuredClone({ state, base, pending: [...pending],
      archives: archives ?? session.data.archives, unbased: unbased ?? session.data.unbased ?? {} })
    session.serializationFailed = false
  } catch {
    session.serializationFailed = true
    legacy.reportDurableStorage(access, false)
    return false
  }
  session.queued = candidate
  const operation = session.tail.then(async () => {
    try {
      if (session.blocked || fingerprint(root) !== session.fingerprint) {
        session.blocked = true
        throw new Error('Another build changed the migration source')
      }
      const retained = new Map(session.data.archives.map(archive => [archive.id, archive]))
      candidate.archives.forEach(archive => retained.set(archive.id, archive))
      candidate.archives = [...retained.values()]
      // A stale writer must stay blocked, including if later retried in this tab.
      const record = await writeIndexedCheckpoint(root, session.record, candidate, session.fingerprint)
      session.record = record
      if (fingerprint(root) !== session.fingerprint) {
        session.blocked = true
        throw new Error('Legacy source changed during persistence')
      }
      session.data = candidate
      if (session.queued === candidate && !session.serializationFailed) legacy.reportDurableStorage(access, true)
      return true
    } catch {
      legacy.reportDurableStorage(access, false)
      return false
    }
  })
  session.tail = operation
  return operation
}

export const coupleStorage: StateStorage = {
  getItem: () => scope ? JSON.stringify({ state: sessionFor(scope).data.state, version: 0 }) : null,
  setItem: (_name, value) => {
    if (!scope || !automaticWrites) return
    const access = scope, session = sessionFor(access)
    try {
      const state = selectSharedState(JSON.parse(value).state)
      const previous = session.queued ?? session.data
      const visible = session.visible ?? previous.state
      session.visible = structuredClone(state)
      if (sameValue(state, previous.state)) return
      const pending = new Set(previous.pending), base = structuredClone(previous.base)
      for (const key of Object.keys(state) as (keyof SharedState)[]) if (!sameValue(state[key], visible[key])) {
        if (!pending.has(key) && key in visible) Object.assign(base, { [key]: visible[key] })
        pending.add(key)
      }
      if (sameValue(state, visible)) return
      // Covers offline edits before/after the hook's lifetime. The hook's own
      // subscription enqueues first when mounted; identical writes are omitted.
      void persistSyncCheckpoint(access, state, base, pending, previous.archives, previous.unbased)
    } catch { legacy.reportDurableStorage(access, false) }
  },
  removeItem: () => {},
}
