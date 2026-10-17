import { isValidRemoteSharedState, SHARED_KEYS, type SharedState } from './shared-state'
import type { SyncResolutionArchive, UnbasedRecords } from './sync-merge'

export interface RecoveryCheckpoint {
  state: Partial<SharedState>
  base: Partial<SharedState>
  pending: (keyof SharedState)[]
  archives: SyncResolutionArchive[]
  unbased?: UnbasedRecords
}
interface Slot { version: 1; generation: number; token: string; payload: string; checksum: string }
interface Head { version: 1; slot: number; token: string; pending: (keyof SharedState)[]; checksum: string }
export interface CheckpointIO { read: (key: string) => string | null; write: (key: string, value: string) => boolean }

// Detect accidental truncation/corruption, not malicious modification or disk durability.
export function checkpointChecksum(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0')
}
const keysValid = (value: unknown): value is (keyof SharedState)[] => Array.isArray(value) &&
  value.every(key => SHARED_KEYS.includes(key)) && new Set(value).size === value.length
export function dataValid(value: RecoveryCheckpoint): boolean {
  return !!value && isValidRemoteSharedState(value.state) && isValidRemoteSharedState(value.base) && keysValid(value.pending) &&
    (value.unbased === undefined || (!!value.unbased && typeof value.unbased === 'object' && !Array.isArray(value.unbased) &&
      Object.entries(value.unbased).every(([key, ids]) => SHARED_KEYS.includes(key as keyof SharedState) &&
        Array.isArray(ids) && ids.every(id => typeof id === 'string') && new Set(ids).size === ids.length))) &&
    value.pending.every(key => Object.prototype.hasOwnProperty.call(value.state, key)) &&
    Array.isArray(value.archives) && value.archives.every(archive => archive && typeof archive.id === 'string' &&
      typeof archive.at === 'string' && ['local', 'remote', 'unresolved'].includes(archive.choice) && archive.group &&
      typeof archive.group.id === 'string' && typeof archive.group.title === 'string' &&
      Array.isArray(archive.group.fields) && archive.group.fields.every(field => typeof field === 'string') &&
      Array.isArray(archive.group.members) && archive.group.members.every(member => member && SHARED_KEYS.includes(member.key) &&
        (member.recordId === undefined || typeof member.recordId === 'string')))
}
const slotKey = (root: string, slot: number) => `${root}:checkpoint:${slot}`

/** Read one complete envelope. Never combine state/base/pending from different writes. */
export function readRecoveryCheckpoint(root: string, io: CheckpointIO) {
  const valid: { slot: number; envelope: Slot; data: RecoveryCheckpoint }[] = []
  const damaged: { key: string; raw: string }[] = []
  let unsupported = false, head: Head | undefined
  for (let index = 0; index < 2; index++) {
    const key = slotKey(root, index), raw = io.read(key)
    if (raw === null) continue
    try {
      const envelope = JSON.parse(raw) as Slot
      if (envelope.version !== 1) { unsupported = true; continue }
      const { checksum, ...body } = envelope
      if (checksum !== checkpointChecksum(JSON.stringify(body)) || !Number.isSafeInteger(envelope.generation) ||
        envelope.generation < 1 || typeof envelope.token !== 'string' || typeof envelope.payload !== 'string') throw new Error('Invalid envelope')
      const payload = JSON.parse(envelope.payload)
      if (payload.scope !== root || !dataValid(payload.data)) throw new Error('Invalid checkpoint')
      valid.push({ slot: index, envelope, data: payload.data })
    } catch { damaged.push({ key, raw }) }
  }
  const rawHead = io.read(root + ':checkpoint:head')
  if (rawHead !== null) {
    try {
      const parsed = JSON.parse(rawHead) as Head
      if (parsed.version !== 1) { unsupported = true }
      else {
        const { checksum, ...body } = parsed
        if (checksum !== checkpointChecksum(JSON.stringify(body)) || ![0, 1].includes(parsed.slot) || !keysValid(parsed.pending)) throw new Error('Invalid head')
        head = parsed
      }
    } catch { damaged.push({ key: root + ':checkpoint:head', raw: rawHead }) }
  }
  const latest = valid.sort((a, b) => b.envelope.generation - a.envelope.generation)[0]
  if (head && !valid.some(entry => entry.slot === head!.slot && entry.envelope.token === head!.token) && rawHead) {
    damaged.push({ key: root + ':checkpoint:head', raw: rawHead })
  }
  const committed = latest && head?.slot === latest.slot && head.token === latest.envelope.token &&
    head.pending.every(key => latest.data.pending.includes(key))
  const data = latest ? { ...latest.data, pending: committed ? head!.pending : latest.data.pending } : undefined
  return { data, latest, damaged, unsupported, rawHead, interrupted: !!latest && !committed,
    present: valid.length > 0 || rawHead !== null || damaged.length > 0 || unsupported }
}

/** Stage first, mirror legacy keys, then commit a verified pointer. A staged envelope
 * recovers conservatively with all old pending keys. Previous complete data survives
 * interruptions. Browser/OS eviction and power-loss durability are not guaranteed. */
export function writeRecoveryCheckpoint(root: string, data: RecoveryCheckpoint, io: CheckpointIO,
  mirror: (retained: Set<keyof SharedState>) => boolean, previousPending: Set<keyof SharedState> = new Set()): boolean {
  const recovered = readRecoveryCheckpoint(root, io)
  if (recovered.unsupported || !dataValid(data)) return false
  // Preserve corrupt bytes before reusing a slot; failed quarantine leaves it intact.
  for (const damaged of recovered.damaged) {
    if (!io.write(root + ':checkpoint:quarantine:' + checkpointChecksum(damaged.raw), damaged.raw)) return false
  }
  const retained = new Set([...(recovered.data?.pending ?? []), ...previousPending, ...data.pending])
  const staged = { ...data, pending: [...retained] }
  if (!dataValid(staged)) return false
  const body = { version: 1 as const, generation: (recovered.latest?.envelope.generation ?? 0) + 1,
    token: crypto.randomUUID(), payload: JSON.stringify({ scope: root, data: staged }) }
  const target = recovered.latest ? 1 - recovered.latest.slot : 0
  const encoded = JSON.stringify({ ...body, checksum: checkpointChecksum(JSON.stringify(body)) })
  if (!io.write(slotKey(root, target), encoded)) return false
  // Both slots can be corrupt. Their originals have already been quarantined.
  for (const damaged of recovered.damaged) if (damaged.key === slotKey(root, 1 - target) &&
    !io.write(damaged.key, encoded)) return false
  if (!mirror(retained)) return false
  // Best-effort detection of another tab's writer; localStorage is not a cross-tab
  // compare-and-swap primitive. Refuse acknowledgement if this bundle was replaced.
  if (io.read(root + ':checkpoint:head') !== recovered.rawHead || io.read(slotKey(root, target)) !== encoded) return false
  const head = { version: 1 as const, slot: target, token: body.token, pending: data.pending }
  return io.write(root + ':checkpoint:head', JSON.stringify({ ...head, checksum: checkpointChecksum(JSON.stringify(head)) })) &&
    io.read(slotKey(root, target)) === encoded
}
