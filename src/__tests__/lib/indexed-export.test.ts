import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { createHash, webcrypto } from 'node:crypto'
import { TextEncoder } from 'node:util'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { decodeIndexedCheckpoint, readIndexedCheckpoint, writeIndexedCheckpoint } from '@/lib/indexed-checkpoint'
import type { RecoveryCheckpoint } from '@/lib/sync-checkpoint'

const exporter = readFileSync('scripts/export-indexed-recovery.js', 'utf8')
const verifier = require(resolve('scripts/verify-indexed-export.cjs')) as { verify: (backup: unknown) => { valid: boolean; records: number } }
const root = 'semacalendar-v2:synthetic-export:sema'
const data: RecoveryCheckpoint = { state: { events: [{ id: 'e', title: 'Private fixture', date: '2027-01-01', color: 'blue',
  createdBy: 'mateo', createdAt: '2026-10-01', updatedAt: '2026-10-01', notes: 'Offline note',
  todos: [{ id: 'check', title: 'Keep me', isCompleted: true }] }] }, base: { events: [] }, pending: ['events'], archives: [] }
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()) })
afterEach(() => { vi.unstubAllGlobals() })
async function exportDatabase() {
  let finish!: () => void, downloaded = ''
  const finished = new Promise<void>(resolve => { finish = resolve })
  const prohibited = vi.fn(() => { throw new Error('No writes or network') }), failed = vi.fn()
  runInNewContext(exporter, { indexedDB, crypto: webcrypto, TextEncoder, location: { origin: 'http://offline.invalid' },
    Blob: class { constructor(public parts: string[]) {} },
    URL: { createObjectURL: (blob: { parts: string[] }) => { downloaded = blob.parts.join(''); return 'blob:offline' }, revokeObjectURL: () => {} },
    document: { createElement: () => ({ click: () => {} }) },
    console: { info: finish, error: () => { failed(); finish() } }, setTimeout: (fn: () => void) => fn(),
    localStorage: { getItem: prohibited, setItem: prohibited }, fetch: prohibited, WebSocket: prohibited, XMLHttpRequest: prohibited,
  })
  await finished
  expect(prohibited).not.toHaveBeenCalled()
  return { downloaded, failed }
}
it('exports a consistent read-only checkpoint and verifies/restores notes, checklist and pending state in a new database', async () => {
  const original = await writeIndexedCheckpoint(root, null, data, 'frozen-source', 'synthetic-export')
  const { downloaded, failed } = await exportDatabase()
  expect(failed).not.toHaveBeenCalled()
  const backup = JSON.parse(downloaded)
  expect(verifier.verify(backup)).toMatchObject({ valid: true, records: 1, applicationSchemaAndRestoreVerified: false })
  const entry = JSON.parse(backup.payload).entries.find((item: { key: string }) => item.key === root)
  expect(entry.value).toEqual(original)
  expect(await readIndexedCheckpoint(root)).toEqual(original)
  // Restoration is test-only, into a newly allocated synthetic IDBFactory.
  vi.stubGlobal('indexedDB', new IDBFactory())
  await writeIndexedCheckpoint(root, null, decodeIndexedCheckpoint(entry.value, root), 'frozen-source')
  expect(decodeIndexedCheckpoint((await readIndexedCheckpoint(root))!, root)).toEqual(data)
})
it('rejects a damaged export without printing or importing its contents', async () => {
  await writeIndexedCheckpoint(root, null, data, 'source')
  const { downloaded } = await exportDatabase()
  const backup = JSON.parse(downloaded)
  expect(() => verifier.verify({ ...backup, payload: backup.payload + ' ' })).toThrow()
  const payload = JSON.parse(backup.payload)
  payload.entries[0].value.payload = '{}'
  backup.payload = JSON.stringify(payload); backup.sha256 = createHash('sha256').update(backup.payload).digest('hex')
  expect(() => verifier.verify(backup)).toThrow()
})
it('refuses an absent database without creating one or reading legacy/auth storage', async () => {
  const result = await exportDatabase()
  expect(result.failed).toHaveBeenCalledOnce()
  expect(result.downloaded).toBe('')
  expect(await indexedDB.databases()).toEqual([])
})
