import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { createHash, webcrypto } from 'node:crypto'
import { TextEncoder } from 'node:util'
import { expect, it, vi } from 'vitest'

const exporter = readFileSync(resolve('scripts/export-sync-recovery.js'), 'utf8')
const verifier = readFileSync(resolve('scripts/verify-sync-export.cjs'), 'utf8')

async function exportCache(entries: Record<string, string>, changeDuringRead = false) {
  const storage = { ...entries }
  let readCount = 0
  const reads = vi.fn((key: string) => changeDuringRead && ++readCount > Object.keys(entries).length
    ? 'Changed in another tab' : entries[key] ?? null)
  Object.defineProperty(storage, 'getItem', { value: reads })
  const writes = vi.fn(() => { throw new Error('Storage must stay read-only') })
  for (const method of ['setItem', 'removeItem', 'clear']) Object.defineProperty(storage, method, { value: writes })
  const clicked = vi.fn(), downloaded: string[] = [], failures = vi.fn()
  const network = vi.fn(() => { throw new Error('Network must not be used') })
  let finish!: () => void
  const finished = new Promise<void>(resolveDone => { finish = resolveDone })
  runInNewContext(exporter, {
    localStorage: storage, crypto: webcrypto, TextEncoder, location: { origin: 'https://offline.invalid' },
    Blob: class { constructor(public parts: string[]) {} },
    URL: { createObjectURL: (blob: { parts: string[] }) => { downloaded.push(blob.parts.join('')); return 'blob:offline' }, revokeObjectURL: vi.fn() },
    document: { createElement: () => ({ click: clicked }) },
    console: { info: finish, error: () => { failures(); finish() } },
    setTimeout: (callback: () => void) => callback(), fetch: network,
  })
  await finished
  return { reads, writes, clicked, downloaded, failures, network }
}

function verify(content: string) {
  const process = { argv: ['node', 'verify-sync-export.cjs', 'offline-export.json'], exitCode: 0 }
  const log = vi.fn(), error = vi.fn()
  runInNewContext(verifier, { process, console: { log, error }, require: (module: string) => {
    if (module === 'node:fs') return { readFileSync: () => content }
    if (module === 'node:crypto') return { createHash }
    throw new Error('Unexpected dependency')
  } })
  return { exitCode: process.exitCode, log, error }
}

it('exports exact raw cache/checkpoint/quarantine bytes without accessing auth or changing storage', async () => {
  const entries = {
    'semacalendar-v1': '{"state":{"todos":[{"id":"unique","title":"Local draft 🌿"}]}}',
    'sema-legacy-cache-owner': 'household',
    'semacalendar-v2:household:sema:checkpoint:0': 'raw interrupted envelope',
    'semacalendar-v2:household:sema:checkpoint:quarantine:hash': '{truncated',
    'sb-auth-token': 'PRIVATE AUTH MUST NEVER BE READ',
  }
  const exported = await exportCache(entries)
  expect(exported.failures).not.toHaveBeenCalled()
  expect(exported.writes).not.toHaveBeenCalled()
  expect(exported.network).not.toHaveBeenCalled()
  expect(exported.reads.mock.calls.every(([key]) => key !== 'sb-auth-token')).toBe(true)
  expect(exported.clicked).toHaveBeenCalledTimes(1)
  const backup = JSON.parse(exported.downloaded[0])
  const payload = JSON.parse(backup.payload)
  expect(Object.fromEntries(payload.entries.map((entry: { key: string; value: string }) => [entry.key, entry.value])))
    .toEqual(Object.fromEntries(Object.entries(entries).filter(([key]) => key !== 'sb-auth-token')))
  expect(verify(exported.downloaded[0]).exitCode).toBe(0)
})

it('refuses empty or changing device caches without downloading a misleading backup', async () => {
  for (const [entries, changing] of [[{}, false], [{ 'semacalendar-v1': 'original' }, true]] as const) {
    const exported = await exportCache(entries, changing)
    expect(exported.failures).toHaveBeenCalledOnce()
    expect(exported.clicked).not.toHaveBeenCalled()
    expect(exported.writes).not.toHaveBeenCalled()
  }
})

it('detects a tampered export without printing any record contents', async () => {
  const exported = await exportCache({ 'semacalendar-v1': 'PRIVATE RECORD CONTENT' })
  const tampered = exported.downloaded[0].replace('PRIVATE RECORD CONTENT', 'REPLACED RECORD CONTENT')
  const result = verify(tampered)
  expect(result.exitCode).toBe(1)
  expect(result.log).not.toHaveBeenCalled()
  expect(result.error).toHaveBeenCalledOnce()
  expect(JSON.stringify(result.error.mock.calls)).not.toContain('RECORD CONTENT')
})
