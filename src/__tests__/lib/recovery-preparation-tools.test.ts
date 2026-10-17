import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { createHash, webcrypto } from 'node:crypto'
import { TextEncoder } from 'node:util'
import { expect, it, vi } from 'vitest'

const inspector = readFileSync(resolve('scripts/inspect-original-device.js'), 'utf8')
const verifier = readFileSync(resolve('scripts/verify-server-snapshot.cjs'), 'utf8')
const root = 'semacalendar-v2:3de918c1-fccc-454d-8618-8dce607ea4d8:sema'
const md5 = (value: string) => createHash('md5').update(value).digest('hex')

async function inspect(entries: Record<string, string>, options: { online?: boolean; origin?: string; changing?: boolean; denied?: boolean } = {}) {
  const storage = { ...entries }
  const reads = vi.fn((key: string) => {
    if (options.denied) throw new Error('PRIVATE ERROR CONTENT')
    if (options.changing && reads.mock.calls.length > Object.keys(entries).filter(key => !key.startsWith('sb-')).length) return 'Changed'
    return entries[key] ?? null
  })
  const forbidden = vi.fn(() => { throw new Error('Mutation or network forbidden') })
  Object.defineProperty(storage, 'getItem', { value: reads })
  for (const method of ['setItem', 'removeItem', 'clear']) Object.defineProperty(storage, method, { value: forbidden })
  const log = vi.fn(), error = vi.fn()
  const result = await runInNewContext(inspector, {
    localStorage: storage, crypto: webcrypto, TextEncoder, URL,
    location: { origin: options.origin ?? 'https://sema-calendar.vercel.app', pathname: '/calendar' },
    navigator: { onLine: options.online ?? false, serviceWorker: { controller: { scriptURL: 'https://sema-calendar.vercel.app/sw.js', state: 'activated' },
      getRegistrations: async () => [], register: forbidden } },
    document: { visibilityState: 'visible', querySelectorAll: (selector: string) => {
      if (selector !== 'script[src]') throw new Error('No input or app-state reads allowed')
      return [{ src: 'https://sema-calendar.vercel.app/_next/static/chunks/app/(app)/layout-known.js?private-query=excluded' }]
    }, createElement: forbidden },
    performance: { getEntriesByType: () => [{ name: 'https://unrelated.invalid/private.js' }] },
    console: { log, error }, fetch: forbidden, XMLHttpRequest: forbidden, WebSocket: forbidden,
    indexedDB: { open: forbidden, deleteDatabase: forbidden },
  })
  return { result, reads, forbidden, log, error }
}

it('inspects only app caches and prints metadata without auth, record contents, writes, network or downloads', async () => {
  const local = { events: [{ id: 'private-id', title: 'PRIVATE TITLE', todos: [{ id: 'item', title: 'PRIVATE CHECKLIST', isCompleted: true }] }],
    partnerNotes: [{ id: 'note', text: 'PRIVATE NOTE' }] }
  const observed = await inspect({ [root]: JSON.stringify({ state: local }), [root + ':base']: JSON.stringify({ events: [] }),
    [root + ':pending']: '["events"]', 'sb-auth-token': 'PRIVATE TOKEN', 'unrelated-secret': 'PRIVATE SECRET' })
  expect(observed.result.consistentRead).toBe(true)
  expect(observed.result.caches[0].expectedHousehold).toBe(true)
  expect(observed.result.caches[0].mirror.pending.keys).toEqual(['events'])
  expect(observed.result.caches[0].mirror.collections.events).toMatchObject({ count: 1, structuredChecklistItems: 1, completedChecklistItems: 1 })
  expect(observed.result.caches[0].mirror.differingWithoutPendingMarker).toEqual(['partnerNotes'])
  expect(observed.result.scriptPaths).toEqual(['/_next/static/chunks/app/(app)/layout-known.js'])
  expect(observed.reads.mock.calls.every(([key]) => key.startsWith('semacalendar-'))).toBe(true)
  expect(observed.forbidden).not.toHaveBeenCalled()
  expect(observed.error).not.toHaveBeenCalled()
  expect(JSON.stringify(observed.log.mock.calls)).not.toMatch(/PRIVATE|private-id|private-query/)
})

it.each([{ online: true }, { origin: 'https://preview.invalid' }])('refuses unsafe original-device context %j before reading storage', async options => {
  const observed = await inspect({ [root]: '{}' }, options)
  expect(observed.result).toBeNull()
  expect(observed.reads).not.toHaveBeenCalled()
  expect(observed.log).not.toHaveBeenCalled()
  expect(observed.error).toHaveBeenCalledOnce()
  expect(observed.forbidden).not.toHaveBeenCalled()
})

it('refuses an inconsistent cache read without printing the partial report', async () => {
  const observed = await inspect({ [root]: '{"state":{"events":[]}}' }, { changing: true })
  expect(observed.result).toBeNull()
  expect(observed.log).not.toHaveBeenCalled()
  expect(observed.error).toHaveBeenCalledOnce()
  expect(observed.forbidden).not.toHaveBeenCalled()
})

it('reports malformed bytes and unsafe pending markers without treating them as a clean cache or printing raw values', async () => {
  const observed = await inspect({ [root]: '{PRIVATE TRUNCATED', [root + ':pending']: '["PRIVATE MARKER"]',
    [root + ':checkpoint:0']: '{PRIVATE SLOT', [root + ':legacy-quarantine:hash']: 'PRIVATE RAW' })
  expect(observed.result.caches[0].mirrorParseSucceeded).toBe(false)
  expect(observed.result.noAppCacheFound).toBe(true)
  expect(observed.result.caches[0].mirror.pending.valid).toBe(false)
  expect(observed.result.caches[0].checkpoints[0].checksumMatches).toBe(false)
  expect(observed.result.caches[0].quarantineEntries).toBe(1)
  expect(JSON.stringify(observed.log.mock.calls)).not.toContain('PRIVATE')
  expect(observed.forbidden).not.toHaveBeenCalled()
})

it('keeps checkpoint slots separate from legacy mirrors without hydrating or choosing a recovery version', async () => {
  const checksum = (text: string) => {
    let hash = 2166136261
    for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
    return (hash >>> 0).toString(16).padStart(8, '0')
  }
  const body = { version: 1, generation: 1, token: 'PRIVATE TOKEN', payload: JSON.stringify({ scope: root,
    data: { state: { todos: [{ id: 'PRIVATE ID', title: 'PRIVATE TODO' }] }, base: { todos: [] }, pending: ['todos'], archives: [] } }) }
  const observed = await inspect({ [root]: '{"state":{"todos":[]}}',
    [root + ':checkpoint:0']: JSON.stringify({ ...body, checksum: checksum(JSON.stringify(body)) }) })
  const cache = observed.result.caches[0]
  expect(cache.mirror.collections.todos.count).toBe(0)
  expect(cache.checkpoints[0]).toMatchObject({ checksumMatches: true, scopeMatches: true, supportedVersion: true })
  expect(cache.checkpoints[0].summary.collections.todos.count).toBe(1)
  expect(JSON.stringify(observed.log.mock.calls)).not.toContain('PRIVATE')
  expect(observed.forbidden).not.toHaveBeenCalled()
})

it('reports denied storage safely and identifies a genuinely empty app cache', async () => {
  const denied = await inspect({ [root]: '{}' }, { denied: true })
  expect(denied.result).toBeNull()
  expect(JSON.stringify(denied.error.mock.calls)).not.toContain('PRIVATE')
  const empty = await inspect({ 'sb-auth-token': 'PRIVATE TOKEN' })
  expect(empty.result.noAppCacheFound).toBe(true)
  expect(empty.reads).not.toHaveBeenCalled()
})

function snapshot() {
  const state = JSON.stringify({ events: [], todos: [], partnerNotes: [], loveNotes: [], goals: [], shoppingLists: [],
    unknown: 'PRIVATE UNKNOWN FIELD' })
  return { format: 'sema-server-state-export', version: 1, project_ref: 'neyhoodxeumpbxekskej',
    id: 'sema', couple_id: '3de918c1-fccc-454d-8618-8dce607ea4d8', captured_at: '2026-10-15T14:00:00Z',
    updated_at: '2026-10-15T13:00:00Z', state_jsonb_text: state, state_md5: md5(state) }
}
function verify(content: string) {
  const process = { argv: ['node', 'verifier', 'private-snapshot.json'], exitCode: 0 }
  const log = vi.fn(), error = vi.fn()
  runInNewContext(verifier, { process, console: { log, error }, require: (name: string) => {
    if (name === 'node:fs') return { readFileSync: () => content }
    if (name === 'node:crypto') return { createHash }
    throw new Error('No writes or network dependencies permitted')
  } })
  return { process, log, error }
}

it.each(['object', 'rows', 'string-cell'] as const)('verifies a private server snapshot in %s format without printing contents', format => {
  const data = snapshot()
  const input = format === 'object' ? data : [{ snapshot: format === 'rows' ? data : JSON.stringify(data) }]
  const observed = verify(JSON.stringify(input))
  expect(observed.process.exitCode).toBe(0)
  expect(JSON.parse(observed.log.mock.calls[0][0])).toMatchObject({ valid: true, counts: { events: 0 }, contentsPrinted: false })
  expect(JSON.stringify(observed.log.mock.calls)).not.toContain('PRIVATE')
  expect(observed.error).not.toHaveBeenCalled()
})

it.each(['digest', 'binding', 'multiple-rows', 'missing-collection', 'malformed'] as const)('rejects unsafe server backup: %s', kind => {
  const data = snapshot()
  if (kind === 'digest') data.state_jsonb_text += ' '
  if (kind === 'binding') data.couple_id = 'wrong-household'
  if (kind === 'missing-collection') { data.state_jsonb_text = '{}'; data.state_md5 = md5('{}') }
  const input = kind === 'malformed' ? '{PRIVATE CORRUPT' : JSON.stringify(kind === 'multiple-rows' ? [{ snapshot: data }, { snapshot: data }] : data)
  const observed = verify(input)
  expect(observed.process.exitCode).toBe(1)
  expect(observed.log).not.toHaveBeenCalled()
  expect(observed.error).toHaveBeenCalledOnce()
  expect(JSON.stringify(observed.error.mock.calls)).not.toContain('PRIVATE')
})
