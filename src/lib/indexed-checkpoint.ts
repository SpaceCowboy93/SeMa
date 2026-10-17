import { checkpointChecksum, dataValid, type RecoveryCheckpoint } from './sync-checkpoint'

export const CHECKPOINT_DATABASE = 'sema-recovery'
export const CHECKPOINT_STORE = 'checkpoints'
export const LEGACY_OWNER_KEY = 'legacy-v1-owner'
export interface IndexedCheckpoint {
  version: 1
  scope: string
  generation: number
  token: string
  legacyFingerprint: string
  payload: string
  checksum: string
  legacyOwner?: string
}

export function decodeIndexedCheckpoint(value: IndexedCheckpoint, scope: string): RecoveryCheckpoint {
  if (!value || value.version !== 1 || value.scope !== scope || !Number.isSafeInteger(value.generation) ||
    value.generation < 1 || typeof value.token !== 'string' || typeof value.legacyFingerprint !== 'string' ||
    typeof value.payload !== 'string' || checkpointChecksum(value.payload) !== value.checksum) {
    throw new Error('Unsupported or damaged device checkpoint; saving paused')
  }
  const data = JSON.parse(value.payload)
  if (!dataValid(data)) throw new Error('Invalid device checkpoint; saving paused')
  return data
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CHECKPOINT_DATABASE, 1)
    let settled = false
    request.onupgradeneeded = () => request.result.createObjectStore(CHECKPOINT_STORE)
    request.onerror = () => { settled = true; reject(request.error) }
    request.onblocked = () => { settled = true; reject(new Error('Device database upgrade blocked by another tab')) }
    request.onsuccess = () => {
      if (settled) { request.result.close(); return }
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
  })
}

async function readValue(key: string): Promise<unknown> {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(CHECKPOINT_STORE, 'readonly')
      const request = tx.objectStore(CHECKPOINT_STORE).get(key)
      tx.onabort = () => reject(tx.error ?? new Error('Device checkpoint read aborted'))
      tx.oncomplete = () => resolve(request.result ?? null)
    })
  } finally { db.close() }
}
export async function readIndexedCheckpoint(scope: string): Promise<IndexedCheckpoint | null> {
  const value = await readValue(scope) as IndexedCheckpoint | null
  if (value) decodeIndexedCheckpoint(value, scope)
  return value
}
export async function readLegacyOwner(): Promise<string | null> {
  const value = await readValue(LEGACY_OWNER_KEY)
  if (value !== null && typeof value !== 'string') throw new Error('Invalid legacy ownership record')
  return value
}

/** A single atomic replacement: request success is NOT transaction completion.
 * Read/compare/put share one readwrite transaction, so two tabs cannot both win.
 * No deletion, fallback to localStorage, or retry with another tab's token. */
export async function writeIndexedCheckpoint(scope: string, expected: IndexedCheckpoint | null,
  data: RecoveryCheckpoint, legacyFingerprint: string, legacyOwner = expected?.legacyOwner): Promise<IndexedCheckpoint> {
  if (!dataValid(data)) throw new Error('Invalid device checkpoint')
  const payload = JSON.stringify(data)
  const next: IndexedCheckpoint = { version: 1, scope, generation: (expected?.generation ?? 0) + 1,
    token: crypto.randomUUID(), legacyFingerprint, payload, checksum: checkpointChecksum(payload),
    ...(legacyOwner ? { legacyOwner } : {}) }
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      // Strict durability requests a disk flush before completion. If this option
      // is unavailable, refuse saving; do not claim an equivalent guarantee.
      const tx = db.transaction(CHECKPOINT_STORE, 'readwrite', { durability: 'strict' })
      let failure: unknown
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Device checkpoint write aborted'))
      tx.oncomplete = () => resolve(next)
      if (tx.durability !== 'strict') {
        failure = new Error('This browser cannot confirm strict checkpoint durability')
        tx.abort()
        return
      }
      const store = tx.objectStore(CHECKPOINT_STORE)
      const request = store.get(scope)
      const owner = store.get(LEGACY_OWNER_KEY)
      let reads = 0
      const received = () => {
        if (++reads !== 2) return
        try {
          const current = request.result as IndexedCheckpoint | undefined
          if (current) decodeIndexedCheckpoint(current, scope)
          if ((current?.token ?? null) !== (expected?.token ?? null)) {
            throw new Error('Another tab changed the checkpoint; preserve this tab and review before restarting')
          }
          if (legacyOwner) {
            if (owner.result !== undefined && owner.result !== legacyOwner) throw new Error('Legacy cache belongs to another household')
            store.put(legacyOwner, LEGACY_OWNER_KEY)
          }
          store.put(next, scope)
        } catch (error) { failure = error; tx.abort() }
      }
      request.onsuccess = received
      owner.onsuccess = received
    })
  } finally { db.close() }
}
