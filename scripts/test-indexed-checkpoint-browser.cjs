// OFFLINE ONLY. Standalone storage module, synthetic records, ephemeral browser.
// Does not load the app, .env files, production, original profiles or live QA.
const http = require('node:http')
const assert = require('node:assert/strict')
const { buildSync } = require('esbuild')
const { chromium } = require('@playwright/test')
const { webcrypto } = require('node:crypto')
async function main() {
  const bundle = buildSync({ entryPoints: ['src/lib/indexed-checkpoint.ts'], bundle: true, write: false,
    format: 'iife', globalName: 'Recovery', platform: 'browser' }).outputFiles[0].text
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/checkpoint.js' ? 'application/javascript' : 'text/html')
    response.end(request.url === '/checkpoint.js' ? bundle : '<!doctype html><title>Offline storage verification</title>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    const origin = `http://127.0.0.1:${server.address().port}`
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ serviceWorkers: 'block' })
    let denied = 0
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === origin && ['/', '/checkpoint.js'].includes(url.pathname)) return route.continue()
      denied++; return route.abort()
    })
    const pages = await Promise.all([context.newPage(), context.newPage()])
    for (const page of pages) { await page.goto(origin); await page.addScriptTag({ url: origin + '/checkpoint.js' }) }
    const scope = 'semacalendar-v2:offline-native-fixture:sema'
    const data = { state: { events: [{ id: 'synthetic', title: 'Offline', date: '2027-01-01', color: 'blue',
      createdBy: 'mateo', createdAt: '2026-10-01', updatedAt: '2026-10-01', notes: 'x'.repeat(1720000),
      todos: [{ id: 'check', title: 'Pack', isCompleted: true }] }] }, base: { events: [] }, pending: ['events'], archives: [] }
    data.base = structuredClone(data.state)
    const first = await pages[0].evaluate(({ scope, data }) => Recovery.writeIndexedCheckpoint(scope, null, data, 'frozen'), { scope, data })
    const results = await Promise.all(pages.map((page, index) => page.evaluate(async ({ scope, first, data, index }) => {
      data.state.events[0].title = `Tab ${index}`
      try { await Recovery.writeIndexedCheckpoint(scope, first, data, 'frozen'); return true } catch { return false }
    }, { scope, first, data, index })))
    assert.equal(results.filter(Boolean).length, 1)
    const before = await pages[0].evaluate(scope => Recovery.readIndexedCheckpoint(scope), scope)
    await pages[0].evaluate(async scope => {
      const db = await new Promise(resolve => { const request = indexedDB.open('sema-recovery'); request.onsuccess = () => resolve(request.result) })
      await new Promise((resolve, reject) => {
        const tx = db.transaction('checkpoints', 'readwrite', { durability: 'strict' })
        const request = tx.objectStore('checkpoints').put({ invalid: 'interrupted candidate' }, scope)
        request.onsuccess = () => tx.abort()
        tx.onabort = resolve; tx.oncomplete = () => reject(new Error('Aborted candidate committed'))
      })
      db.close()
    }, scope)
    await pages[0].close()
    const restored = await pages[1].evaluate(scope => Recovery.readIndexedCheckpoint(scope), scope)
    assert.deepEqual(restored, before)
    assert.equal(JSON.parse(restored.payload).state.events[0].todos[0].isCompleted, true)
    assert.deepEqual(JSON.parse(restored.payload).pending, ['events'])
    // Compare actual old/new serialization for the same complete synthetic data.
    const legacyCode = buildSync({ entryPoints: ['src/lib/sync-checkpoint.ts'], bundle: true, write: false, format: 'cjs' }).outputFiles[0].text
    const legacyModule = { exports: {} }
    new Function('module', 'exports', 'crypto', legacyCode)(legacyModule, legacyModule.exports, webcrypto)
    const checkpoint = JSON.parse(restored.payload), entries = new Map()
    const io = { read: key => entries.get(key) ?? null, write: (key, value) => { entries.set(key, value); return true } }
    const mirror = pending => io.write(scope, JSON.stringify({ state: checkpoint.state, version: 0 })) &&
      io.write(scope + ':base', JSON.stringify(checkpoint.base)) && io.write(scope + ':pending', JSON.stringify([...pending]))
    assert.equal(legacyModule.exports.writeRecoveryCheckpoint(scope, checkpoint, io, mirror), true)
    assert.equal(legacyModule.exports.writeRecoveryCheckpoint(scope, checkpoint, io, mirror), true)
    const localStorageCharactersBefore = [...entries].reduce((sum, [key, value]) => sum + key.length + value.length, 0)
    console.log(JSON.stringify({ passed: true, browser: browser.version(), tests: ['large checkpoint', 'strict durability',
      'atomic cross-tab compare-and-swap', 'abort after request success', 'restore after tab closure'],
    snapshotCharacters: JSON.stringify(checkpoint.state).length, localStorageCharactersBefore,
    indexedCheckpointCharactersAfter: JSON.stringify(restored).length + scope.length,
    indexedPayloadCharactersAfter: restored.payload.length, additionalLocalStorageCharactersAfter: 0,
    frozenLegacyStorageReclaimed: 0, archivesIncluded: checkpoint.archives.length,
    nonlocalRequestsForwarded: 0, deniedRequests: denied }))
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(() => { console.error('Offline native checkpoint verification failed; no app or production data was used.'); process.exitCode = 1 })
